# 00012: Test Matrix and CI

- **Task ID:** T-012
- **Task control:** 00012
- **Status:** open
- **Depends on:** T-001 through T-011

## Task Summary

Complete the unit, snapshot, integration, and smoke suites and add a cross-platform CI matrix for Windows, macOS, and Linux on Node.js 22 and 24.

## Implementation Steps

1. Consolidate unit, snapshot, integration, and smoke suites under `tests/`.
2. Add the 20-combination snapshot matrix and generated-tree assertions.
3. Add smoke coverage for full-stack/PGlite, API-only/Postgres content, dry-run, overwrite, and cancellation.
4. Add GitHub Actions for Windows, macOS, and Linux with Node.js 22 and 24.
5. Add a package-pack smoke test that installs the packed tarball.
6. Document how to run the matrix locally.

## Verification Process

- `npm test`
- CI matrix green.
- `npm pack --dry-run` and packed-tarball smoke.

## Acceptance Criteria

None. Test and CI results are validation; no human-reviewable visual artifact is produced by this task.

## Implementation Notes

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
