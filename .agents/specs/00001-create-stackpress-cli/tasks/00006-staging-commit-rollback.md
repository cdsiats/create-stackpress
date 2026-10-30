# 00006: Staging, Commit, Overwrite, and Rollback

- **Task ID:** T-006
- **Task control:** 00006
- **Status:** verified
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

- `src/template/write.ts` exports `writeProject(project, options, context?)`, plus the test seams `WriteContext`, `WriteHooks`, and `WriteInterruptRegistrar`. The two-argument contract from `WriteOptions` is unchanged; the optional third argument defaults to production behavior.
- Target inspection uses `lstat`: symlinks and non-directories raise `CliError.preflight`; a directory is empty only when its entries are all `.DS_Store`. Non-empty targets raise preflight unless `overwrite` is set.
- Staging is created with `mkdtemp` beside the target as `.create-stackpress-<random>`. `package.json` is rendered from `project.packageJson` as two-space JSON with a trailing newline; `project.files` must not contain `package.json`. Staged paths are validated against absolute paths, drive prefixes, null bytes, and `..` segments before writing; string and `Uint8Array` contents are supported. `options.validate` runs against the staging path before any target write.
- Missing or empty targets are committed with a same-filesystem rename. An existing empty target is first moved to a sibling `.create-stackpress-empty-<random>` so a rename failure restores it (including `.DS_Store`); the backup is deleted after commit.
- Non-empty and `.` targets use copy mode. Conflicting paths are moved by rename into a sibling `.create-stackpress-backup-<random>`; non-directory ancestors are treated as conflicts so staging never writes through a target symlink. Unrelated files stay in place. Created files and directories are tracked, and a synchronous rollback removes them and restores backups on any failure.
- A `.` target is resolved through the injected `cwd`, validated in a sibling staging directory, and copied into the current directory. The current directory is never renamed or removed.
- SIGINT/SIGTERM cleanup is registered through an injectable registrar; the default handler runs synchronous staging/backup cleanup and exits with code 130. The registrar is unregistered on success and failure.
- `WriteResult.targetDir` is the resolved absolute target path; `warnings` contains `project.warnings` plus any post-commit temporary-file cleanup warnings.
- The writer writes only `project.files` plus `package.json`; optional `.env` generation for `--db-url` remains the caller's concern.

## Verification Notes

- `npx tsc -p tsconfig.json --noEmit` passed with no errors.
- `node --import tsx --test tests/integration/writer.test.ts` passed 18/18 tests (0 failures, 0 skipped) covering missing, empty, `.DS_Store`-only, file, symlink, non-empty/overwrite, package.json rejection, `.` copy, validation, staging-write failure, copy failure rollback, rename failures, interrupt cleanup, and traversal rejection.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
