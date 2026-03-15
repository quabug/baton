# Baton Architecture

## 1. Overview

Baton is a **checkpoint-based session handoff tool** for Claude Code.

Two commands: `baton push` and `baton pull`. No daemon.

Its architecture is built around:

- project identity from git remote
- path virtualization via global string replacement
- all-sessions-per-project checkpointing
- Git-backed durable persistence
- conflict guard via git fetch/compare

---

## 2. Architecture goals

1. Identify the same project across machines automatically (from git remote)
2. Restore sessions on another machine with different local paths
3. Prevent accidental overwrites (conflict guard)
4. Keep it simple (no daemon, no coordination layer, no config ceremony)
5. Work across macOS, Linux, and Windows

---

## 3. Core entities

### 3.1 Project

A logical project identified by its git remote URL.

```json
{
  "project_id": "<hash-of-normalized-git-remote>",
  "git_remote": "git@github.com:me/foo.git"
}
```

The project is auto-detected from the cwd's git remote. No manual linking required.

All of these resolve to the same `project_id`:
- `git@github.com:me/foo.git`
- `https://github.com/me/foo.git`

### 3.2 Session

A Claude Code conversation log (JSONL file) under a project.

A project can have many sessions. All sessions are synced together.

### 3.3 Checkpoint

The full set of data pushed for a project:

- all session JSONL files (with path placeholders applied)
- tool-results files for each session
- project memory files

---

## 4. System components

Baton has two components. No coordination layer in v0.1.

### 4.1 CLI

The `baton` command-line tool. Runs on the user's machine.

Responsibilities:

* auto-detect project from git remote in cwd
* collect session data from Claude Code's local storage
* apply path virtualization (replace / expand placeholders)
* push checkpoints to GitHub
* pull checkpoints from GitHub and restore locally
* conflict detection before push

### 4.2 Persistence (GitHub repo)

A single private GitHub repo stores all project data.

Managed via git clone/commit/push. Cached locally at `~/.baton/repo/`.

Responsibilities:

* store session JSONL files
* store tool-results
* store project memory
* store project metadata
* provide conflict detection via git history

---

## 5. Data model

### 5.1 Project identity is not a path

The project is identified by normalizing the git remote URL and hashing it.

This is fully automatic. No manual project linking or ID assignment needed.

### 5.2 Path virtualization

Cross-machine session data must not contain raw machine-local paths.

Supported placeholders:

* `${PROJECT_ROOT}` - the project directory (cwd where `baton push` is run)
* `${HOME}` - user home directory
* `${TMP}` - system temp directory

Strategy: **global string replacement** on the entire JSONL content.

On push, replace longest paths first:
1. `{project_root}` → `${PROJECT_ROOT}`
2. `{home}` → `${HOME}`
3. `{tmp}` → `${TMP}`

On pull, reverse the replacement with machine-local values.

Path separators are normalized to `/` in stored checkpoints and expanded to OS-native separator on pull.

### 5.3 What gets synced

| Component | Synced? | Why |
|-----------|---------|-----|
| Session JSONLs (all) | Yes | The conversations |
| `tool-results/` | Yes | Small, needed for `<persisted-output>` references |
| `memory/` | Yes | Project-level knowledge, tiny, valuable |
| `subagents/` | No | 92% of data, results already in main JSONL |
| `file-history/` | No | File backups for undo, files live in git |
| `plans/` | No | Ephemeral |
| `tasks/` | No | Ephemeral |

---

## 6. Claude Code adapter

### 6.1 Local data layout

Claude Code stores session data under `~/.claude/projects/`:

```text
~/.claude/
  sessions/{pid}.json                           # active session metadata
  project-config.json                           # project directory name → original path
  projects/
    -{encoded-path}/                            # e.g. -home-dr_who-baton
      {sessionId}.jsonl                         # main conversation log
      memory/
        MEMORY.md                               # project memory
      {sessionId}/
        tool-results/{id}.txt                   # large tool outputs
        subagents/agent-{id}.jsonl              # (not synced)
```

### 6.2 Project directory name mapping

Claude Code encodes project paths as directory names by replacing `/` with `-`:

| Machine | Project path | Directory name |
|---------|-------------|----------------|
| Linux | `/home/dr_who/baton` | `-home-dr_who-baton` |
| macOS | `/Users/dr_who/work/baton` | `-Users-dr_who-work-baton` |
| Windows | `C:\Users\dr_who\baton` | `-C-Users-dr_who-baton` |

On push, baton reads from the source machine's directory.
On pull, baton writes to the target machine's directory (computed from local path).

### 6.3 Session JSONL format

Each line is a JSON object with a `type` field. Common types:

- `user` - user messages and tool results
- `progress` - assistant responses, tool calls, hook events
- `file-history-snapshot` - file change snapshots

Most entries include a `cwd` field set to the project root. In rare cases it changes to a subdirectory mid-session. Global string replacement handles both cases.

---

## 7. Runtime flows

### 7.1 First-time setup

1. User runs `baton push` or `baton pull`
2. Baton checks `~/.baton/config.json` for existing repo
3. If none, prompts user for a repo name
4. Creates private repo via `gh repo create <name> --private`
5. Clones to `~/.baton/repo/`
6. Saves repo URL to `~/.baton/config.json`

### 7.2 Push flow

1. Auto-detect project from `git remote` in cwd
2. Find the Claude Code project directory under `~/.claude/projects/`
3. Collect all session JSONLs, tool-results, and memory files
4. Apply path virtualization (global string replacement, longest path first)
5. `git fetch` on `~/.baton/repo/`
6. Compare local vs remote HEAD - refuse if remote is ahead (unless `--force`)
7. Write checkpoint files to `projects/<project_hash>/`
8. `git add` + `git commit` + `git push`

### 7.3 Pull flow

1. Auto-detect project from `git remote` in cwd
2. `git pull` on `~/.baton/repo/`
3. Read checkpoint files from `projects/<project_hash>/`
4. Expand path placeholders to machine-local values
5. Compute local project directory name (e.g. `-root-projects-foo`)
6. Write session JSONLs to `~/.claude/projects/{local-project-dir}/`
7. Write tool-results to `~/.claude/projects/{local-project-dir}/{sessionId}/tool-results/`
8. Write memory files to `~/.claude/projects/{local-project-dir}/memory/`
9. Ensure `~/.claude/project-config.json` has a mapping for the local project directory

---

## 8. Storage layout

### 8.1 GitHub repo layout

```text
projects/
  <project_hash>/
    meta.json
    memory/
      MEMORY.md
      *.md
    sessions/
      <session_id>.jsonl
      <session_id>/
        tool-results/
          {id}.txt
```

### 8.2 Local baton config

```text
~/.baton/
  config.json       # repo URL
  repo/             # local clone of the GitHub repo
```

---

## 9. Conflict detection

Before pushing, `baton push` runs `git fetch` and compares local vs remote HEAD. If the remote has commits not present locally, it means another machine pushed without this machine pulling first.

Behavior:
- Default: refuse with a warning, suggest `baton pull` first
- `--force`: skip the check, use `git push --force`

No custom revision tracking needed. Git's own history handles this.

---

## 10. Failure handling

### 10.1 Not a git repo

If cwd is not a git repo or has no remote, `baton push` / `baton pull` errors with a clear message.

### 10.2 No Claude Code sessions found

If no session JSONL files exist for the detected project, `baton push` warns and exits.

### 10.3 `gh` CLI not available

If `gh` is not installed or not authenticated, error with setup instructions.

---

## 11. Security and privacy notes

- Session data is stored in a **private** GitHub repository
- Conversation logs may contain sensitive code context
- Users should use private repos only
- No encryption in v0.1, may be added in future iterations

---

## 12. Implementation

### Stack

| Concern | Tool | Why |
|---------|------|-----|
| Language | **TypeScript** | Claude Code users already have Node installed |
| Package manager | **pnpm** | Strict, fast, standard for new projects |
| Build | **tsup** | Wraps esbuild, outputs CJS+ESM+types in one step |
| Dev runner | **tsx** | Run TS directly without compiling during development |
| CLI framework | **commander** | Lightweight, mature, good TypeScript support |
| Testing | **vitest** | Fast, native TypeScript/ESM support |
| Lint / format | **biome** | Single tool replaces ESLint+Prettier, fast |
| Type checking | **tsc --noEmit** | Separate from build, run in CI |
| External CLIs | **git**, **gh** | For repo operations and GitHub auth |

### Distribution

npm package (e.g. `npm install -g baton-cli` or `npx baton-cli push`)

### Project structure

```text
src/
  cli.ts                    # entry point, commander setup, top-level error handling
  errors.ts                 # all custom error classes
  commands/
    push.ts                 # baton push - orchestrates core + adapter
    pull.ts                 # baton pull
    status.ts               # baton status
  core/
    project.ts              # git remote → project hash
    paths.ts                # path virtualization (replace / expand)
    git.ts                  # shell out to git / gh
    config.ts               # ~/.baton/config.json management
  adapters/
    claude-code/
      reader.ts             # collect sessions, tool-results, memory from local state
      writer.ts             # restore sessions to correct local paths
      paths.ts              # project directory name encoding/decoding
```

### Dependency flow

```text
cli.ts
  → commands/push.ts
      → core/project.ts          (detect project)
      → adapters/claude-code/reader.ts  (collect local data)
      → core/paths.ts            (virtualize paths)
      → core/git.ts              (push to GitHub)
  → commands/pull.ts
      → core/project.ts          (detect project)
      → core/git.ts              (pull from GitHub)
      → core/paths.ts            (expand paths)
      → adapters/claude-code/writer.ts  (restore locally)
```

Commands call core and adapter directly. No service layer. Each command function reads top-to-bottom as a linear flow.

### Adapter pattern

All Claude Code-specific logic lives under `adapters/claude-code/`. The core knows nothing about Claude Code's file layout, directory naming, or JSONL format.

The adapter interface is implicit (not a formal TypeScript interface in v0.1). It exposes two operations:

- **read**: given a project path, return all session data (JSONLs, tool-results, memory)
- **write**: given session data + local project path, write it to Claude Code's expected locations

To add support for another agent (Gemini CLI, Codex, etc.) in the future, add a new adapter under `adapters/` without touching core or commands.

### Error handling

Custom error classes with descriptive messages. Throw where it fails, catch at the top level in `cli.ts`.

```typescript
// errors.ts
class BatonError extends Error {}
class ProjectNotFoundError extends BatonError {}
class NoSessionsError extends BatonError {}
class ConflictError extends BatonError {}
class GitNotFoundError extends BatonError {}
class GhNotFoundError extends BatonError {}
```

- **Throw at the point of failure** with a clear message describing what went wrong
- **Catch in `cli.ts`** to print user-friendly output and set exit code
- **No Result types or error wrapping** - keep it flat and traceable
- AI agents can find the throw site, read the message, and fix the issue directly

---

## 13. Design references

Baton's approach to cross-platform path handling draws from established patterns in existing sync/config tools.

### A. Logical ID binding (Syncthing)

Syncthing syncs folder contents across devices where **local paths can be completely different**. Devices are tied together by a logical **folder ID**, not by matching absolute paths. Each device independently configures its own local path for a given folder ID.

Baton equivalent: `project_id` derived from git remote. Each machine resolves it to its own local path.

### B. Template/placeholder rendering (chezmoi, yadm)

chezmoi stores configuration as **templates** with variables like hostname, OS, and home directory. Files are rendered into machine-specific content at apply time. yadm takes a similar approach with templates and alternate files selected by OS or hostname.

Baton equivalent: `${PROJECT_ROOT}`, `${HOME}`, `${TMP}` placeholders in stored checkpoints, expanded to machine-local values on pull.

### C. Machine-specific overrides (yadm)

yadm accepts that some files cannot be universal. It supports **alternate versions** per platform/host and a bootstrap mechanism for platform-specific initialization after clone.

Baton equivalent: some session data is portable (conversation content), some is inherently machine-specific (project directory names, PID files). Baton syncs the portable parts and regenerates machine-specific parts on restore.

### D. Central storage with local restore (Mackup)

Mackup backs up application settings to a central location, then **links or copies them back** to where each application expects them on each machine. The storage format doesn't need to match the application's native layout.

Baton equivalent: checkpoints in GitHub use Baton's own layout (`projects/<hash>/sessions/`). On pull, data is restored to Claude Code's expected local layout (`~/.claude/projects/`).

### Common principle

These tools don't try to make paths identical across machines. Instead they:

> **Elevate shared objects from physical paths to logical identities / templates / variants, and let each machine restore to its own local paths.**

---

## 14. Architectural summary

Baton is best understood as:

* **project-aware** (auto-detect from git remote)
* **checkpoint-based** (all sessions per project)
* **Git-backed** (private GitHub repo)
* **simple** (two commands, no daemon)

It is intentionally optimized for:

> "Push here, pull there, keep working."

not for:

> "Two machines co-edit one live agent brain."
