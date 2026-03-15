# AgentSync Architecture

## 1. Overview

AgentSync is a **checkpoint-based session handoff system** for local CLI coding agents.

Its architecture is intentionally built around:

- project identity
- machine-specific path mapping
- session checkpoints
- explicit handoff semantics
- low-frequency durable persistence

It is **not** designed around always-on, bidirectional real-time state mirroring.

---

## 2. Architecture goals

The architecture must support:

1. identifying the same project across machines
2. restoring a session on another machine with different local paths
3. preventing default cross-device session pollution
4. allowing explicit resume / takeover / fork flows
5. persisting enough session state for recovery
6. remaining usable even when offline

---

## 3. Core entities

### 3.1 Project
A logical project shared across machines.

Suggested fields:

```json
{
  "project_id": "proj_foo",
  "display_name": "foo",
  "git_remote": "git@github.com:me/foo.git",
  "default_branch": "main"
}
```

### 3.2 Machine

A specific device running AgentSync.

Suggested fields:

```json
{
  "machine_id": "macbook-quan",
  "hostname": "Quan-MacBook",
  "os": "macos",
  "username": "quan"
}
```

### 3.3 Path Mapping

Machine-local mapping from logical project to physical path.

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

### 3.4 Session

A specific coding workflow under a project.

```json
{
  "session_id": "sess_123",
  "project_id": "proj_foo",
  "tool": "claude-code",
  "status": "active",
  "active_writer_machine_id": "macbook-quan",
  "updated_at": "2026-03-15T12:00:00Z",
  "base_checkpoint_revision": 7
}
```

### 3.5 Checkpoint

A restorable snapshot of a session.

```json
{
  "session_id": "sess_123",
  "project_id": "proj_foo",
  "tool": "claude-code",
  "revision": 7,
  "messages": [
    { "role": "user", "content": "Fix the login bug" },
    { "role": "assistant", "content": "I found the issue." }
  ],
  "metadata": {
    "cwd": "${PROJECT_ROOT}",
    "source_machine_id": "macbook-quan"
  }
}
```

### 3.6 Handoff Event

An explicit ownership transition between machines.

```json
{
  "event_type": "handoff",
  "session_id": "sess_123",
  "from_machine_id": "macbook-quan",
  "to_machine_id": "vps-tokyo-01",
  "ts": "2026-03-15T12:10:00Z"
}
```

---

## 4. System components

AgentSync has three main components.

### 4.1 Local Client / Daemon

Runs on the user's machine.

Responsibilities:

* observe local agent state
* derive checkpoints from local state
* rewrite paths into portable placeholders
* restore portable state locally
* manage machine config and path mappings
* persist local queue / cache
* optionally maintain presence / lease connection

### 4.2 Optional Coordination Layer

A lightweight online service, typically WebSocket-based.

Responsibilities:

* machine online/offline presence
* active-writer lease
* notify when new checkpoints are available
* notify when a session is taken over

Not responsible for:

* long-term storage
* authoritative session content
* high-frequency live message streaming by default

### 4.3 Persistence Layer

Durable storage for recovery and history.

Recommended initial backend:

* GitHub repository

Responsibilities:

* store project metadata
* store machine mappings
* store session metadata
* store checkpoints
* store handoff events

---

## 5. Data model principles

### 5.1 Project identity is not a path

Absolute paths are machine-specific and unstable.

Use a stable logical identifier instead.

Recommended order:

1. normalized Git remote URL → hash
2. user-defined alias
3. manual non-git project link

### 5.2 Portable path placeholders

Cross-machine state should not persist raw machine-local paths.

Supported placeholders:

* `${PROJECT_ROOT}`
* `${HOME}`
* `${TMP}`

Example:

```json
{
  "cwd": "${PROJECT_ROOT}",
  "artifact_path": "${PROJECT_ROOT}/.agentsync/artifacts/001.txt"
}
```

### 5.3 Checkpoint-first restoration

The primary recovery unit is a checkpoint, not a raw mirrored state file.

This keeps the system more robust across agent versions and machine differences.

---

## 6. Session model

### 6.1 Project and session are separate

A single project can have many sessions.

This means:

* same project does not imply shared live context
* sessions remain isolated unless explicitly connected

### 6.2 Default mode: single-writer

A session should have only one active writer by default.

This avoids:

* mixed context
* accidental session corruption
* confusing parallel writes from multiple machines

### 6.3 Supported handoff actions

* `resume`: continue an existing session
* `takeover`: switch active ownership to current machine
* `fork`: create a new session from an existing checkpoint

### 6.4 Not in v0.1

* multi-writer collaborative mode
* full real-time session co-editing

---

## 7. Runtime flows

## 7.1 Initialization flow

1. user runs `agentsync init`
2. machine metadata is created
3. GitHub repo configuration is stored
4. local config directory is initialized

## 7.2 Project linking flow

1. user runs `agentsync project link --project-id ... --path ...`
2. machine-local mapping is persisted
3. future restores can resolve `${PROJECT_ROOT}` correctly

## 7.3 Checkpoint creation flow

1. local daemon observes agent state
2. adapter extracts restorable portable state
3. local absolute paths are rewritten into placeholders
4. checkpoint is written locally
5. checkpoint is eventually persisted to GitHub

## 7.4 Resume flow

1. user runs `agentsync session resume <session_id>`
2. latest session metadata is fetched
3. latest checkpoint is loaded
4. local `project_id -> path` mapping is resolved
5. placeholders are expanded into machine-local paths
6. local portable state is restored

## 7.5 Takeover flow

1. user runs `agentsync session takeover <session_id>`
2. system checks current active writer
3. ownership is reassigned to current machine
4. handoff event is recorded
5. future writes belong to the new active machine

## 7.6 Fork flow

1. user runs `agentsync session fork <session_id>`
2. a new session is created from the current checkpoint
3. the original session remains unchanged
4. the new session becomes the current working branch

---

## 8. Storage layout

Recommended GitHub repo structure:

```text
projects/
  <project_id>.json

machines/
  <machine_id>.json

sessions/
  <project_id>/
    <session_id>/
      session.json
      checkpoints/
        000001.json
        000002.json
      events/
        000001-handoff.json
```

### Notes

* store session metadata separately from checkpoints
* keep checkpoint files append-friendly and debuggable
* prefer low-frequency writes over aggressive live persistence

---

## 9. Online coordination model

If a coordination service is used, it should be minimal.

### Recommended use

* presence
* lease / active writer ownership
* checkpoint available notifications
* takeover notifications

### Not recommended as default

* full live content streaming
* multi-writer session merging
* broadcasting every message in real time

Why:

CLI coding agent workflows are usually **handoff-oriented**, not collaborative-editing-oriented.

---

## 10. Failure handling

### 10.1 Unresolved project mapping

If a machine cannot resolve a `project_id` to a local path:

* mark the session as unresolved locally
* do not attempt forced restore
* require explicit `project link`

### 10.2 Offline operation

The local daemon should keep:

* local cache
* local pending queue
* last known checkpoints

The system must still allow later recovery after reconnect.

### 10.3 Repeated local observation loops

If local restore causes local state changes that are observed again:

* attach restore origin metadata
* suppress reprocessing recently restored state
* deduplicate by checkpoint or event identity

### 10.4 Persistence rate limits

Persistence should be debounced and batched.

GitHub is durable storage, not the live coordination channel.

---

## 11. Security and privacy notes

Initial scope assumes single-user personal use.

Recommended practices:

* private GitHub repository
* minimal stored metadata
* optional encryption in future iterations
* no unnecessary cloud retention outside persistence backend

---

## 12. Implementation sketch

Suggested initial stack:

* Rust
* `tokio`
* `serde`
* `serde_json`
* `notify`
* `reqwest`
* local sqlite or lightweight file-backed storage
* optional lightweight WebSocket coordination server

### Suggested CLI surface

```bash
agentsync init
agentsync start
agentsync status
agentsync project link --project-id proj_foo --path /Users/quan/work/foo
agentsync session list
agentsync session resume <session_id>
agentsync session takeover <session_id>
agentsync session fork <session_id>
```

---

## 13. Architectural summary

AgentSync is best understood as:

* **project-aware**
* **checkpoint-based**
* **single-writer by default**
* **Git-backed**
* **handoff-first**

It is intentionally optimized for:

> "Pause here, continue there."

not for:

> "Two machines co-edit one live agent brain."
