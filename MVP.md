# AgentSync MVP

## 1. MVP definition

AgentSync v0.1 is **not** a generic sync engine for every local agent.

Its scope is much narrower:

> **Make a Claude Code session restorable across macOS and Linux for the same logical project, with explicit handoff semantics.**

The MVP exists to validate that **session handoff** is the right product, not real-time cross-device co-editing.

---

## 2. MVP goals

The MVP should validate the following assumptions:

### G1. A Claude Code session can be represented as a restorable checkpoint
At least part of the local working context can be captured, persisted, and restored on another machine.

### G2. Project identity can be separated from absolute paths
The same repo on macOS and Linux can be recognized as the same logical project even when local paths differ.

### G3. Explicit handoff is the right default model
Users benefit more from `resume / takeover / fork` than from always-on real-time syncing.

### G4. GitHub is sufficient as durable session storage
Checkpoints and metadata can be persisted to GitHub at low frequency for recovery.

### G5. Single-writer semantics reduce accidental context corruption
A session should not default to live multi-device writes.

---

## 3. Target user

The MVP is for developers who:

- use **Claude Code**
- work across **macOS** and **Linux**
- often move between local machine and VPS
- want to continue a session without re-explaining context
- keep the same repo at different local paths on different machines

---

## 4. In scope

### Supported tool
- Claude Code

### Supported platforms
- macOS
- Linux

### Supported capabilities
- logical `project_id`
- machine-specific path mapping
- portable checkpoint generation
- checkpoint persistence to GitHub
- session listing
- `resume`
- `takeover`
- `fork`
- local cache / queue
- optional presence / lease notifications

---

## 5. Out of scope

The MVP will **not** include:

- Gemini CLI support
- Codex support
- true real-time bidirectional message syncing
- multi-user collaboration
- full native state restoration guarantee
- semantic search / vector memory
- LLM summarization and compression
- Windows support
- merge UI
- team/shared organization features

---

## 6. Problem statement

The MVP solves this concrete workflow:

1. a user starts work in Claude Code on machine A
2. later, the user wants to continue on machine B
3. the repo exists on both machines, but at different local paths
4. the session should be restorable without path confusion
5. ownership of that session should be explicit

---

## 7. Key product decisions

### 7.1 Session handoff, not live sync
The MVP is checkpoint-oriented.

It does **not** assume that every new local agent change must be broadcast live to every machine.

### 7.2 Project and session are separate
A project may have multiple sessions.

Different sessions under the same project must not affect each other by default.

### 7.3 Single-writer by default
The same session should have one active writer at a time.

### 7.4 Portable restore is enough for v0.1
The goal is "continue the work," not "perfectly reconstruct internal native agent state."

---

## 8. Core concepts

## 8.1 Project
Logical identity for the same repo / workspace across machines.

Suggested structure:

```json
{
  "project_id": "proj_foo",
  "display_name": "foo",
  "git_remote": "git@github.com:me/foo.git"
}
```

## 8.2 Machine Mapping

Machine-local mapping from logical project to local path.

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

## 8.3 Session

A concrete Claude Code workflow.

```json
{
  "session_id": "sess_123",
  "project_id": "proj_foo",
  "tool": "claude-code",
  "status": "active",
  "active_writer_machine_id": "macbook-quan"
}
```

## 8.4 Checkpoint

Portable snapshot used for restore.

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

---

## 9. Path virtualization

The MVP must support machine-independent logical paths.

### Stored placeholders

* `${PROJECT_ROOT}`
* `${HOME}`
* `${TMP}`

### Example

Stored checkpoint:

```json
{
  "metadata": {
    "cwd": "${PROJECT_ROOT}"
  }
}
```

Resolved on macOS:

```text
/Users/quan/work/foo
```

Resolved on Linux:

```text
/root/projects/foo
```

### Failure mode

If the target machine has no mapping for the project:

* mark as unresolved
* do not force restore
* require explicit `project link`

---

## 10. Session behavior

## 10.1 Different sessions under same project

If macOS and Linux both open the same project independently, they should normally get **different session IDs**.

Result:

* same project
* different sessions
* no mutual interference

## 10.2 Same session on two machines

If machine B explicitly resumes the same session, the system should enforce handoff semantics.

Result:

* same project
* same session
* one active writer at a time by default

## 10.3 Forking

If the user wants to branch the work without affecting the original session:

```bash
agentsync session fork <session_id>
```

---

## 11. Persistence model

GitHub is the durable backend for v0.1.

### Stored items

* project metadata
* machine mappings
* session metadata
* checkpoints
* handoff events

### Suggested layout

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

### Persistence cadence

* low-frequency
* debounced
* checkpoint-oriented
* no aggressive per-message live persistence

---

## 12. Optional online coordination

If online coordination is included in the MVP, it should only support:

* online/offline presence
* active writer lease
* checkpoint available notification
* takeover notification

It should **not** be the primary content transport layer.

---

## 13. CLI surface

### Initialize

```bash
agentsync init
```

### Start daemon

```bash
agentsync start
```

### Link a project path

```bash
agentsync project link --project-id proj_foo --path /Users/quan/work/foo
```

### List sessions

```bash
agentsync session list
```

### Resume a session

```bash
agentsync session resume <session_id>
```

### Take over a session

```bash
agentsync session takeover <session_id>
```

### Fork a session

```bash
agentsync session fork <session_id>
```

---

## 14. Success criteria

The MVP is successful if all of the following are true:

### S1. Project identity works

The same repo on macOS and Linux can be recognized as one logical project despite different local paths.

### S2. Checkpoints are restorable

A checkpoint created on macOS can be restored on Linux into a usable portable session state.

### S3. Handoff semantics are clear

A session does not silently become multi-writer; explicit takeover works.

### S4. Path rehydration works

Machine-specific local paths are restored correctly from placeholders.

### S5. Daemon stability is acceptable

The daemon can run for long periods without pathological loops or runaway CPU usage.

### S6. Persistence is rate-safe

Checkpoint persistence to GitHub remains infrequent enough to avoid constant rate-limit pressure.

---

## 15. Main risks

### R1. Claude Code local state may change

Mitigation:

* isolate tool-specific logic in an adapter
* keep the core independent of raw internal state layout

### R2. Portable restore may not feel "native enough"

Mitigation:

* define v0.1 as continuity, not perfect native restoration

### R3. Path rewriting may overmatch normal text

Mitigation:

* prioritize known path fields
* keep text rewriting conservative

### R4. Two machines may try to use the same session

Mitigation:

* single-writer default
* explicit `resume / takeover / fork`

### R5. GitHub persistence conflicts

Mitigation:

* checkpoint-oriented storage
* low write frequency
* simple append-friendly layout

---

## 16. Development phases

### Phase 1: local foundations

* config
* machine identity
* project link
* local path mapping
* local storage

### Phase 2: Claude adapter

* local observation
* recent message extraction
* checkpoint generation

### Phase 3: persistence

* upload checkpoint
* fetch latest checkpoint
* store session metadata

### Phase 4: handoff commands

* session list
* resume
* takeover
* fork

### Phase 5: optional coordination

* presence
* lease
* checkpoint availability notifications

---

## 17. Final MVP boundary

AgentSync v0.1 is best described as:

**a checkpoint-based session handoff tool for Claude Code across macOS and Linux**

It is deliberately not trying to be:

* a collaborative live sync system
* a universal multi-agent platform
* a full native-state clone engine
