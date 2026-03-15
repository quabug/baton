![Baton Banner](./.assets/banner.png)

[![npm version](https://img.shields.io/npm/v/baton-cli.svg)](https://www.npmjs.com/package/baton-cli)
[![CI](https://github.com/quabug/baton/actions/workflows/ci.yml/badge.svg)](https://github.com/quabug/baton/actions/workflows/ci.yml)

**Git-backed session handoff for Claude Code.**

Continue the same coding session on another machine without losing context.

```bash
baton push   # on machine A
baton pull   # on machine B
```

---

## Why

CLI coding agent sessions are trapped on one machine:

- Session context doesn't travel between devices
- The same repo lives at different absolute paths on different machines
- macOS, Linux, and Windows use different paths and home directories
- Existing tools sync config, not coding sessions

Baton fixes this. Push your session, pull it elsewhere, keep working.

---

## Install

```bash
npm install -g baton-cli
```

**Requirements:** Node.js 18+, Git, [GitHub CLI](https://cli.github.com/) (authenticated)

---

## Quick start

```bash
# On machine A — push your sessions
cd ~/work/my-project
baton push

# On machine B — pull and continue
cd ~/projects/my-project
baton pull
```

On first run, `baton push` creates a private GitHub repo (`baton-sessions` by default) to store your session data. On another machine, `baton pull` auto-detects this repo from your GitHub account.

---

## How it works

1. **Auto-detect** the project from `git remote` in the current directory
2. **Collect** all Claude Code sessions, tool results, and project memory
3. **Virtualize** absolute paths into portable placeholders (`${PROJECT_ROOT}`, `${HOME}`, `${TMP}`)
4. **Push** the checkpoint to your private GitHub repo
5. On another machine, **pull** and expand placeholders to local paths
6. Claude Code picks up the restored sessions automatically

---

## What gets synced

| Component | Synced | Why |
|-----------|--------|-----|
| Session conversation logs | Yes | All sessions for the project |
| Tool results | Yes | Small, needed for reference integrity |
| Project memory | Yes | Tiny, valuable for continuity |
| Subagent logs | No | Too large, results already in main conversation |

---

## CLI reference

```bash
baton push              # push all sessions for this project
baton push --force      # overwrite remote even if ahead
baton pull              # restore sessions locally
baton status            # show current project and sync state
```

---

## Cross-platform path handling

Same repo, different machines:

| Machine | Path |
|---------|------|
| macOS | `/Users/you/work/my-project` |
| Linux | `/home/you/projects/my-project` |
| Windows | `C:\Users\you\my-project` |

Baton replaces absolute paths with portable placeholders on push and expands them to local paths on pull. Longest paths are replaced first to prevent partial matches.

---

## Conflict guard

`baton push` checks if the remote has changes you haven't pulled. If so, it refuses to push to prevent accidental overwrites.

```bash
baton push          # refused — remote is ahead
baton pull          # pull first
baton push          # now it works

baton push --force  # or override the check
```

---

## Design principles

- **Project-aware**: identity comes from git remote, not local paths
- **Checkpoint-first**: restore from snapshots, not fragile live mirroring
- **Portable before native**: prioritize continuity over perfect restoration
- **Git-backed**: GitHub for durable history and recovery
- **Simple**: two commands, no daemon, no config ceremony

---

## What Baton is not

- A real-time sync engine
- A multi-user collaboration platform
- A semantic memory system
- A config sync tool

---

## License

MIT
