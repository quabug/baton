# Baton MVP

## 1. MVP definition

Baton v0.1 solves exactly one problem:

> **Push the current Claude Code session from this machine, pull it on another, and keep working.**

Two commands. No daemon. No config ceremony.

```bash
baton push   # on machine A
baton pull   # on machine B
```

---

## 2. MVP goals

### G1. Claude Code sessions can be checkpointed and restored
All sessions for a project can be captured, persisted, and restored on another machine.

### G2. Project identity is auto-detected from git remote
No manual `project link` required. The same repo on different machines is recognized automatically.

### G3. Path virtualization works across OS
Absolute paths in conversation logs are replaced with portable placeholders and rehydrated correctly on the target machine.

### G4. Push/pull is safe by default
`baton push` refuses if the remote has a checkpoint this machine hasn't pulled, preventing accidental overwrites. Use `--force` to override.

### G5. GitHub is sufficient as durable storage
A single private GitHub repo stores all checkpoints.

---

## 3. Target user

Developers who:

- use **Claude Code**
- work across **macOS**, **Linux**, and **Windows**
- move between local machine and VPS
- want to continue a session without re-explaining context
- have the same repo cloned at different local paths on different machines

---

## 4. In scope

- Claude Code only
- macOS, Linux, Windows
- auto-detect project from git remote
- capture all session conversation JSONLs for the current project
- path virtualization (`${PROJECT_ROOT}`, `${HOME}`, `${TMP}`)
- push checkpoint to GitHub
- pull checkpoint from GitHub
- conflict guard (refuse push if remote is ahead)
- `--force` override

---

## 5. Out of scope

- other CLI agents (Gemini CLI, Codex, etc.)
- daemon / background process
- session list / resume / takeover / fork
- presence / lease / notifications
- multi-user collaboration
- real-time sync
- full native state restoration guarantee
- semantic search / vector memory
- LLM summarization
- merge UI

---

## 6. Problem statement

1. User starts work in Claude Code on machine A
2. Later, user wants to continue on machine B
3. The repo exists on both machines at different local paths
4. The session should be restorable without path confusion

---

## 7. How it works

### `baton push`

1. Detect the current project from `git remote` in cwd
2. Find **all** Claude Code sessions for this project
3. Read each session's conversation JSONL and tool-results
4. Replace absolute paths with portable placeholders
5. Check remote: if remote has a checkpoint this machine hasn't pulled, **refuse** (unless `--force`)
6. Push the checkpoint to the GitHub persistence repo

### `baton pull`

1. Detect the current project from `git remote` in cwd
2. Fetch the latest checkpoint for this project from GitHub
3. Expand placeholders into machine-local paths
4. Write **all** session JSONLs and tool-results to the correct local Claude Code location
5. Claude Code can now access any of the synced sessions

---

## 8. Project identity

Auto-detected. No manual linking required.

The project is identified by normalizing the git remote URL:

```bash
# all of these resolve to the same project identity
git@github.com:me/foo.git
https://github.com/me/foo.git
```

The normalized remote is hashed to produce a stable `project_id`.

If the cwd is not a git repo, `baton push` / `baton pull` should error with a clear message.

---

## 9. Path virtualization

Conversation logs contain absolute paths that differ across machines.

### Placeholders

| Placeholder | macOS | Linux | Windows |
|-------------|-------|-------|---------|
| `${PROJECT_ROOT}` | `/Users/dr_who/work/foo` | `/root/projects/foo` | `C:\Users\dr_who\work\foo` |
| `${HOME}` | `/Users/dr_who` | `/root` | `C:\Users\dr_who` |
| `${TMP}` | `/var/folders/...` | `/tmp` | `C:\Users\dr_who\AppData\Local\Temp` |

### Strategy: global string replacement

Simple full-text replacement on the entire JSONL content. No structured field parsing needed.

**On push** (longest path first):
1. `{project_root}` → `${PROJECT_ROOT}`
2. `{home}` → `${HOME}`
3. `{tmp}` → `${TMP}`

**On pull** (reverse):
1. `${PROJECT_ROOT}` → `{local_project_root}`
2. `${HOME}` → `{local_home}`
3. `${TMP}` → `{local_tmp}`

Longest-first ordering prevents `/home/dr_who/baton` from becoming `${HOME}/baton` instead of `${PROJECT_ROOT}`.

The project root is the cwd where `baton push` is run.

### Path separator
Normalize to `/` in stored checkpoints. Expand to OS-native separator on pull.

### Note on `cwd` field

Every JSONL entry has a `cwd` field. In most sessions this is a single constant value (the project root). In rare cases `cwd` changes mid-session to a subdirectory (e.g. `{project_root}/subdir`). Both cases are handled by global string replacement on the project root path. No special `cwd` handling needed.

---

## 10. Conflict guard

`baton push` must be safe by default.

### Scenario
1. Machine A: `baton push` → checkpoint v1
2. Machine B (never pulled): `baton push` → would overwrite v1

### Behavior
- `baton push` checks if remote has a checkpoint that this machine hasn't seen
- If yes: **refuse** with a warning
- User can run `baton pull` first, or `baton push --force` to overwrite

This prevents accidental loss without requiring complex merge logic.

---

## 11. Claude Code adapter

### What gets synced

| Component | Synced? | Why |
|-----------|---------|-----|
| Session JSONLs (all) | Yes | All sessions for the project, not just the active one |
| `tool-results/` | Yes | Small (~764 KB typical), needed for `<persisted-output>` references |
| `memory/` | Yes | Project-level knowledge, tiny (~8-12 KB), valuable for continuity |
| `subagents/` JSONL + meta | No | 92% of data, work is finished, results already in main JSONL |
| `file-history/` | No | File backups for undo - files live in git already |
| `plans/` | No | Ephemeral, plan is executed or abandoned |
| `tasks/` | No | Ephemeral, tasks are done or stale |

Typical checkpoint size: **under 15 MB**.

### Claude Code local data layout

```text
~/.claude/
  sessions/{pid}.json                           # active session metadata
  project-config.json                           # project directory name → original path
  projects/
    -{encoded-path}/                            # e.g. -home-dr_who-baton
      {sessionId}.jsonl                         # main conversation log
      {sessionId}/
        tool-results/{id}.txt                   # large tool outputs
        subagents/agent-{id}.jsonl              # (not synced)
        subagents/agent-{id}.meta.json          # (not synced)
```

### Data collection (for `baton push`)

1. Detect the project directory under `~/.claude/projects/` matching the current cwd
2. Collect **all** `{sessionId}.jsonl` files in that project directory
3. Collect `tool-results/` for each session: `{sessionId}/tool-results/*`
4. Collect `memory/` files from the project directory
5. Apply path virtualization to all JSONL files

### Data restoration (for `baton pull`)

1. Compute the local project directory name from the local project path (e.g. `/root/projects/foo` → `-root-projects-foo`)
2. Write all session JSONLs to `~/.claude/projects/{local-project-dir}/`
3. Write tool-results to `~/.claude/projects/{local-project-dir}/{sessionId}/tool-results/`
4. Write memory files to `~/.claude/projects/{local-project-dir}/memory/`
5. Ensure `~/.claude/project-config.json` has a mapping for the local project directory
6. Claude Code can access any of the synced sessions when the user starts working in that project

### Project directory name mapping

Claude Code encodes project paths as directory names by replacing `/` with `-`:

| Machine | Project path | Directory name |
|---------|-------------|----------------|
| Linux | `/home/dr_who/baton` | `-home-dr_who-baton` |
| macOS | `/Users/dr_who/work/baton` | `-Users-dr_who-work-baton` |
| Windows | `C:\Users\dr_who\baton` | `-C-Users-dr_who-baton` |

On push, the directory name is stored in the checkpoint metadata.
On pull, a new directory name is computed from the local path.

---

## 12. Persistence model

A single private GitHub repo stores all project data. Managed via git clone/commit/push.

### First-time setup

On the first `baton push` (or `baton pull`):

1. Check `~/.baton/config.json` for an existing repo
2. If none, prompt the user to enter a repo name
3. Create the private repo via `gh repo create <name> --private`
4. Clone to `~/.baton/repo/`
5. Save the repo URL to `~/.baton/config.json`

### Local cache

The GitHub repo is cloned locally at `~/.baton/repo/` and reused across push/pull operations. No re-cloning needed after first setup.

### Auth

Uses `gh` CLI for repo creation. Git operations use whatever credential helper the user has configured (typically set up by `gh auth setup-git`).

### Push flow

1. `git fetch` on `~/.baton/repo/`
2. Check if remote has new commits not present locally. If yes, **refuse** unless `--force`
3. Write checkpoint files to `projects/<project_hash>/`
4. `git add` + `git commit` + `git push`
5. With `--force`: skip step 2, use `git push --force` in step 4

### Pull flow

1. `git pull` on `~/.baton/repo/`
2. Read checkpoint files from `projects/<project_hash>/`
3. Restore locally

### Conflict detection

Before pushing, `baton push` runs `git fetch` and compares local vs remote HEAD. If remote is ahead, it refuses with a warning. This catches the case where another machine pushed without this machine pulling first. With `--force`, this check is skipped and `git push --force` is used. No custom revision tracking needed.

### Repo layout

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

### `meta.json`
```json
{
  "project_id": "<hash>",
  "git_remote": "git@github.com:me/foo.git",
  "pushed_at": "2026-03-15T12:00:00Z"
}
```

### `sessions/`
All session JSONLs for the project, with path placeholders applied. Each session's tool-results stored alongside.

### `memory/`
Project memory files, stored as-is (no path rewriting needed).

### `~/.baton/config.json`
```json
{
  "repo": "git@github.com:me/my-baton-repo.git"
}
```

---

## 13. CLI surface

```bash
baton push              # checkpoint all sessions for this project to GitHub
baton push --force      # overwrite remote even if ahead
baton pull              # restore latest checkpoint locally
baton status            # show current project, last push/pull, remote state
```

That's it for v0.1.

---

## 14. Success criteria

### S1. Push/pull round-trip works
A session pushed from macOS can be pulled and continued on Linux (and vice versa, including Windows).

### S2. Project auto-detection works
`baton push` in a git repo correctly identifies the project without manual config.

### S3. Path rehydration works
Machine-specific local paths are restored correctly from placeholders across OS.

### S4. Conflict guard works
`baton push` refuses when remote has unsynced changes, `--force` overrides.

### S5. Restored session is usable
Claude Code can continue a pulled session with enough context to be productive.

---

## 15. Main risks

### R1. Claude Code local state format may change
Mitigation: isolate JSONL reading/writing in an adapter layer.

### R2. Path rewriting may corrupt conversation content
Mitigation: global string replacement is simple and predictable. False positives (non-path text matching a path string) are extremely unlikely in practice.

### R3. Large conversation logs
Mitigation: v0.1 accepts variable size. Future versions can truncate or compress.

### R4. Many sessions may bloat checkpoint size
Mitigation: v0.1 accepts this (~1 MB per session average). Future versions can prune old sessions.

---

## 16. Development phases

### Phase 1: project identity
- git remote detection and normalization
- project hash generation

### Phase 2: session collection
- find all sessions for the project
- read conversation JSONLs and tool-results
- collect project memory files

### Phase 3: path virtualization
- placeholder replacement on push
- placeholder expansion on pull
- cross-OS path separator handling

### Phase 4: GitHub persistence
- first-time setup (repo creation via `gh`, local clone)
- push checkpoint to repo
- pull checkpoint from repo
- conflict detection (`git fetch` + HEAD comparison)

### Phase 5: CLI
- `baton push`
- `baton pull`
- `baton status`
- `--force` flag

---

## 17. Final MVP boundary

Baton v0.1 is:

**`push` / `pull` for Claude Code sessions across machines.**

Nothing more.
