# 00004: Interaction Detection and Prompts

- **Task ID:** T-004
- **Task control:** 00004
- **Status:** open
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

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Pending user review.
