# 00004: Interaction Detection and Prompts

- **Task ID:** T-004
- **Task control:** 00004
- **Status:** verified
- **Depends on:** T-002, T-003

## Task Summary

Implement TTY, CI, and agent detection; the interactive prompt flow; defaults; `--yes`/`--no-input`; plan review; decline; and cancellation.

## Implementation Steps

1. Implement `isInteractive` using TTY, `CI`, `--yes`, `--no-input`, and known agent environment checks.
2. Add a small prompt adapter around `@clack/prompts`.
3. Implement the seven-step flow: directory, type, database, package manager, install, git, and plan review.
4. Apply interactive defaults and non-interactive defaults exactly as specified.
5. Implement decline (exit 0) and Ctrl+C (exit 130) without writes.
6. Add unit tests with fake streams and a fake prompt adapter; add non-TTY integration tests.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/unit/interaction.test.ts tests/integration/prompts.test.ts`
- Manual non-TTY run with `--yes` and with no TTY.

## Acceptance Criteria

The user reviews a terminal recording or screenshot of one interactive flow and one non-interactive flow, confirming prompts, defaults, and cancellation behavior match the Frozen contract.

## Implementation Notes

- Added `src/package-manager/detect.ts` for user-agent, `packageManager`, and lockfile detection.
- Added `src/create/prompts.ts` as the prompt adapter around `@clack/prompts`.
- Added `src/create/interaction.ts` with TTY/CI/agent detection, defaults, prompts, plan review, decline, and cancellation.
- Wired the resolved plan preview into `src/cli.ts`.
- Added unit and non-TTY integration tests.

## Verification Notes

- `npm run typecheck` passed.
- `npm test` passed: 29 tests, 0 failures.
- `npm run build` passed.
- Non-TTY run with a directory selected scaffold-only defaults; `--yes` selected install/git yes; missing directory exited 2.
- Interactive PTY walkthrough completed: type, database, package manager, install, git, plan review, confirmation, and plan preview.

## Acceptance Notes

- Interactive and non-interactive terminal behavior observed. Task remains `verified` until user acceptance.
