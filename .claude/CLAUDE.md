# Baton Project Rules

## Development Workflow

- **Never commit directly to main.** Create a feature branch and PR for each development phase.
- **Use multi-agent PR review** (`/review-pr`) before merging any PR.
- **Test coverage must be close to 100%.** Write tests for all core logic, adapters, and commands.

## Tech Stack

- TypeScript / Node.js
- pnpm (package manager)
- tsup (build)
- tsx (dev runner)
- commander (CLI framework)
- vitest (testing)
- biome (lint + format)
- git + gh CLI (persistence and auth)

## Architecture

- Adapter pattern: Claude Code-specific logic lives under `src/adapters/claude-code/`
- Core logic under `src/core/` knows nothing about Claude Code internals
- Commands under `src/commands/` orchestrate core + adapter directly (no service layer)
- Custom error classes in `src/errors.ts`, throw at failure point, catch in `cli.ts`
