# 00006: Staging, Commit, Overwrite, and Rollback

- **Task ID:** T-006
- **Task control:** 00006
- **Status:** open
- **Depends on:** T-005

## Task Summary

Implement the safe filesystem commit layer: target-state validation, staging, empty-target replacement, `.` target copying, overwrite backup, rollback, and signal cleanup.

## Implementation Steps

1. Validate target state: missing, directory, `.DS_Store`-only empty, file, symlink, or non-empty.
2. Create a sibling staging directory and write resolved files there.
3. Validate the staged project before commit.
4. Replace empty targets atomically; for `.` targets, copy staged files into the current directory with backup/restore.
5. Back up conflicting files for `--overwrite`; preserve unrelated files; restore on failure.
6. Register interrupt cleanup for staging and backups.
7. Add temp-directory integration tests, failure injection, and interrupted-run tests.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/integration/writer.test.ts`

## Acceptance Criteria

None. Filesystem behavior is validated by integration tests and failure injection.

## Implementation Notes

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
