# AgentSync

**AgentSync** is a cross-device session handoff tool for local CLI coding agents.

It is **not** trying to become a universal memory platform or a real-time collaborative sync engine.

Instead, it solves a more practical problem:

> Can I continue the same coding session on another machine without losing context?

AgentSync is designed for developers who work across:

- macOS laptops
- Linux VPS / remote servers
- local CLI agents such as Claude Code

Its core idea is simple:

- identify the same project across machines
- capture a restorable session checkpoint
- let another machine **resume**, **take over**, or **fork** that session safely

---

## Why it exists

CLI coding agents are great for day-to-day development, but cross-device workflows are still painful:

- session context stays trapped on one machine
- macOS and Linux use different paths, usernames, and home directories
- the same repo often lives at different absolute paths on different machines
- opening the same project on two machines can easily pollute context
- existing tools are mostly about config sync, not session handoff

AgentSync does not try to replace the agent itself.

It focuses on one job:

**safe session handoff across machines**

---

## One-line positioning

**Git-backed session handoff for local coding agents.**

---

## Core concepts

### Project
A logical code project, independent of local absolute paths.

### Session
A specific coding workflow / conversation.

### Checkpoint
A restorable snapshot of a session.

### Handoff
The act of continuing a session from machine A on machine B.

---

## Default behavior

AgentSync is built around **handoff**, not always-on real-time sync.

- multiple sessions can exist under the same `project_id`
- different sessions do **not** affect each other by default
- the same session uses **single-writer** mode by default
- another machine must explicitly `resume` or `takeover`
- experimental parallel work should use `fork`

This avoids turning "same repo on two machines" into "shared unstable agent brain."

---

## What AgentSync is not

AgentSync is **not**:

- a vector database
- a semantic memory system
- a multi-user collaboration platform
- a full replacement for native agent state
- a generic config sync tool

---

## What v0.1 focuses on

The first version is intentionally narrow.

### In scope
- Claude Code only
- macOS + Linux
- project identity and path mapping
- checkpoint-based session restore
- `resume / takeover / fork`
- GitHub-backed persistence
- optional presence / lease notifications

### Out of scope
- Gemini CLI
- Codex
- real-time collaborative editing
- team sharing
- Windows support
- full native state restoration guarantees

---

## How it works

1. AgentSync identifies a project using a stable `project_id`
2. Each machine maps that `project_id` to its own local path
3. AgentSync observes the local agent state and produces a checkpoint
4. The checkpoint is persisted to GitHub
5. Another machine can pull the checkpoint and continue the session
6. Path placeholders are rehydrated into machine-specific local paths

---

## Example

Same repo, different machines:

- macOS: `/Users/quan/work/foo`
- Linux: `/root/projects/foo`

AgentSync treats them as the same logical project:

```json
{
  "project_id": "proj_foo",
  "git_remote": "git@github.com:me/foo.git"
}
```

Each machine stores its own mapping:

```json
{
  "machine_id": "macbook-quan",
  "projects": {
    "proj_foo": {
      "local_path": "/Users/quan/work/foo"
    }
  }
}
```

```json
{
  "machine_id": "vps-tokyo-01",
  "projects": {
    "proj_foo": {
      "local_path": "/root/projects/foo"
    }
  }
}
```

---

## CLI sketch

```bash
agentsync init
agentsync start
agentsync project link --project-id proj_foo --path /Users/quan/work/foo
agentsync session list
agentsync session resume <session_id>
agentsync session takeover <session_id>
agentsync session fork <session_id>
```

---

## Design principles

* **Project-aware**: project identity is not a local path
* **Checkpoint-first**: restore from snapshots, not fragile live mirroring
* **Single-writer by default**: prevent accidental session corruption
* **Portable before native**: prioritize continuity over perfect internal restoration
* **Git-backed**: use GitHub for durable history and recovery

---

## Relationship to existing sync tools

AgentSync is **not** primarily a config sync tool.

A config sync tool answers:

> How do I keep the same CLI tool setup on multiple machines?

AgentSync answers:

> How do I continue the same coding session on another machine safely?

That distinction matters.

---

## Status

Early design / MVP planning.

v0.1 target:

> Make a Claude Code session restorable across macOS and Linux for the same logical project, with explicit handoff semantics.

---

## License

TBD
