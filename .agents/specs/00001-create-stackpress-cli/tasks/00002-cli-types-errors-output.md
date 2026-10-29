# 00002: CLI Types, Errors, and Output Primitives

- **Task ID:** T-002
- **Task control:** 00002
- **Status:** verified
- **Depends on:** T-001

## Task Summary

Define the shared domain contracts, error model, exit codes, version metadata, and human-output primitives used by every later task.

## Implementation Steps

1. Define project type, database, package manager, plan, result, and command option types.
2. Define `CliError` with a stable code, message, hint, and exit code.
3. Map error categories to exit codes 0, 1, 2, and 130.
4. Add color support with TTY, `NO_COLOR`, and `--no-color` handling.
5. Add output helpers for headings, steps, warnings, errors, and success.
6. Add unit tests for exit-code mapping, color suppression, and type guards.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/unit/errors.test.ts tests/unit/output.test.ts`

## Acceptance Criteria

None. Shared contracts and output primitives are validated by code review and unit tests.

## Implementation Notes

- Added `src/types.ts` with project type, database, package manager, options, plan, result, and type guards.
- Added `src/errors.ts` with `CliError`, category exit codes, and unknown-error mapping.
- Added `src/output.ts` with TTY/NO_COLOR detection, ANSI painting, and stdout/stderr helpers.
- Added unit tests for errors, color suppression, and output routing.

## Verification Notes

- `npm run typecheck` passed.
- `npm test` passed: 7 tests, 0 failures.

## Acceptance Notes

- Acceptance criteria: none; task finished at `verified`.
