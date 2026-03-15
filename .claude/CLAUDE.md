# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Baton is a CLI tool (`baton push` / `baton pull`) that syncs Claude Code sessions across machines via a private GitHub repo. It virtualizes absolute paths so sessions work across macOS, Linux, and Windows.

## Commands

```bash
pnpm test              # run all tests
pnpm test:coverage     # run tests with coverage report
pnpm vitest run tests/paths.test.ts  # run a single test file
pnpm lint              # check lint errors
pnpm lint:fix          # auto-fix lint errors
pnpm typecheck         # type check without emitting
pnpm build             # build to dist/ via tsup
pnpm dev -- push       # run CLI in dev mode (e.g., baton push)
```

## Architecture

### Layers

```
cli.ts → commands/ → core/ + adapters/
```

- **`cli.ts`**: Commander entry point. Catches all errors (BatonError → user message, others → "Unexpected error"). Excluded from coverage.
- **`commands/`**: Orchestrate core + adapter. Each command is a linear top-to-bottom flow. `push.ts`, `pull.ts`, `status.ts` are excluded from coverage (integration-heavy). `checkpoint.ts` and `setup.ts` are tested.
- **`core/`**: Agent-agnostic logic. Knows nothing about Claude Code.
- **`adapters/claude-code/`**: All Claude Code-specific file layout knowledge. To support another agent, add a new adapter.

### Key modules

- **`core/project.ts`**: Detects project from `git remote`, normalizes URL (SSH/HTTPS/git://), hashes to 16-char hex ID.
- **`core/paths.ts`**: Path virtualization. Global string replacement with regex boundary matching (longest path first). Placeholders: `${PROJECT_ROOT}`, `${HOME}`, `${TMP}`.
- **`core/git.ts`**: Shells out to `git`/`gh` CLI. All calls use `execFile` (not `exec`) with timeouts.
- **`core/config.ts`**: Manages `~/.baton/config.json` (repo URL).
- **`adapters/claude-code/paths.ts`**: Encodes project paths to Claude Code directory names (replaces `/`, `.`, `:` with `-`).
- **`adapters/claude-code/reader.ts`**: Collects session JSONLs, tool-results, memory from `~/.claude/projects/`.
- **`adapters/claude-code/writer.ts`**: Restores session data and updates `~/.claude/project-config.json`.
- **`commands/checkpoint.ts`**: Reads/writes the baton repo checkpoint format (`projects/<hash>/sessions/`, `memory/`, `meta.json`).
- **`commands/setup.ts`**: First-time repo setup. Push prompts for repo name (default: `baton-sessions`). Pull auto-detects `<user>/baton-sessions`.

### Error handling

Custom errors in `src/errors.ts` extend `BatonError`. Throw at the failure point with a descriptive message. Catch in `cli.ts` only. No Result types.

### Data flow

- **Push**: detect project → collect all sessions (reader) → virtualize paths → write checkpoint → git commit+push
- **Pull**: detect project → git pull → read checkpoint → expand paths → restore sessions (writer)

## Development workflow

- Never commit directly to main. Create a feature branch and PR for each change.
- Use multi-agent PR review (`/review-pr`) before merging.
- Test coverage must be close to 100% for testable modules.
- Version bump in `package.json` on main auto-triggers npm publish + GitHub release.

## Testing

- Tests use real git repos in temp directories for integration tests.
- Adapter tests mock `homedir()` or module functions to redirect file I/O to temp dirs.
- Command orchestration files (`push.ts`, `pull.ts`, `status.ts`) are excluded from coverage — they require GitHub to test.
