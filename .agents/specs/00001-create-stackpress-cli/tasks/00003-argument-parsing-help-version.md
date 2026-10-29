# 00003: Argument Parsing, Help, and Version

- **Task ID:** T-003
- **Task control:** 00003
- **Status:** verified
- **Depends on:** T-002

## Task Summary

Implement the v1 command-line surface: positional directory, all flags and aliases, conflict validation, help output, and version output.

## Implementation Steps

1. Wrap `node:util.parseArgs` with strict option definitions.
2. Support `--type`, `--db`, `--pm`, `--install`/`--no-install`, `--git`/`--no-git`, `--template`, `--db-url`, `--overwrite`, `--dry-run`, `--yes`, `--no-input`, `--no-color`, `--no-agents-md`, `--help`, and `--version`.
3. Normalize aliases for project types and databases.
4. Reject unknown flags, invalid values, conflicting booleans, and missing flag values with exit code 2.
5. Render help and version output, including CLI, template, and pinned Stackpress versions.
6. Add unit tests and help/version snapshots.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/unit/args.test.ts`
- `node dist/cli.js --help`
- `node dist/cli.js --version`

## Acceptance Criteria

The user reviews terminal output from `node dist/cli.js --help` and `node dist/cli.js --version`, confirming the flag surface and version information match the Frozen CLI contract.

## Implementation Notes

- Added `src/args.ts` with strict `node:util.parseArgs` parsing, aliases, conflict checks, help text, and version text.
- Wired help/version/error handling into `src/cli.ts`.
- Added unit tests for flags, aliases, conflicts, unknown flags, and help/version text.

## Verification Notes

- `npm run typecheck` passed.
- `npm test` passed: 13 tests, 0 failures.
- `npm run build` passed.
- `node dist/cli.js --version` printed CLI, template, and Stackpress versions.
- `node dist/cli.js --help` printed the expected flag surface.
- Invalid `--wat` exited 2 with an actionable hint.

## Acceptance Notes

- Terminal help/version output presented for user review. Task remains `verified` until accepted.
