# 00009: Create Workflow and Next Steps

- **Task ID:** T-009
- **Task control:** 00009
- **Status:** open
- **Depends on:** T-003 through T-008

## Task Summary

Wire the complete create workflow: preflight, plan, prompts, resolution, staging, validation, commit, install/git hooks, output, dry-run, exit codes, and next steps.

## Implementation Steps

1. Compose the preflight sequence: Node version, package name, target state, template compatibility, prerequisite checks.
2. Connect argument parsing, interaction detection, prompt flow, and plan review.
3. Resolve fragments, stage, validate, and commit through the writer.
4. Add `--dry-run` plan and file list without writes.
5. Add human output, success summary, pinned versions, and next-step commands.
6. Map all errors to the Frozen exit codes and recovery messages.
7. Add integration tests for interactive, non-interactive, dry-run, overwrite, cancellation, and invalid input.
8. Add a full-stack/PGlite creation smoke test.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/integration/create.test.ts`
- Generate one full-stack/PGlite project and one API-only/Postgres project.

## Acceptance Criteria

The user reviews the generated project tree and terminal next-step output for one full-stack/PGlite run and one API-only/Postgres run, confirming the selected presets, files, and commands match the Frozen contract.

## Implementation Notes

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Pending user review.
