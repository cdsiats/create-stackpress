# 00013: Refactor and Hardening Pass

- **Task ID:** T-013
- **Task control:** 00013
- **Status:** verified
- **Depends on:** T-012

## Task Summary

Remove placeholder seams, review module boundaries, verify the dependency budget, and harden security-sensitive and cross-platform paths.

## Implementation Steps

1. Remove temporary fixtures and placeholder branches that are no longer needed.
2. Review module boundaries between args, prompts, templates, writer, database, package manager, git, and output.
3. Confirm runtime dependencies remain limited to the approved prompt and archive libraries.
4. Audit path traversal, symlinks, overwrite backup, shell metacharacters, and secret logging.
5. Measure CLI startup time and remove avoidable work.
6. Run the full test suite and focused code review.

## Verification Process

- `npm run typecheck`
- `npm test`
- `npm audit`
- Startup benchmark
- Security-focused integration tests

## Acceptance Criteria

None. Refactoring and hardening are validated by code review, tests, and audit output.

## Implementation Notes

- Removed stale T-010 "not implemented" placeholder text and unused `mergePackages`/`createPackageJson` aliases. The documented injectable install/git seams remain; the production CLI injects both.
- Split `src/template/source.ts` (1,425 lines) into `source.ts` (509), `custom-manifest.ts` (472), `template-project.ts` (395), plus shared `paths.ts` and `plan-guard.ts`. `source.ts` re-exports all prior public names.
- Split `src/template/resolve.ts` (531 lines) into `resolve.ts` (151), `fragments.ts` (277), and `environment.ts` (112), consolidating the duplicated `.env.sample` merge.
- `next-steps.ts`, `preflight.ts`, and `workflow.ts` now derive install/run command text only from `package-manager/commands.ts`.
- Hardening: hard links are rejected in fragment indexes, fragment manifests, fragment files, custom manifest files, and static trees; the writer verifies an EEXIST parent is a directory and only removes parent directories it created; path tests cover absolute, drive-letter, UNC, and traversal paths; `--db-url` rejects all control characters; `.env` is excluded from template-token scanning; template URL errors redact credentials; install child output is never logged; tar extraction re-checks file and byte limits during extraction.
- Startup: `cli.ts` handles `--help`/`--version` before dynamically importing the create path; `tar` loads lazily. Runtime dependency budget is unchanged: only `@clack/prompts@1.8.1` and `tar@7.5.22` direct runtime dependencies. No package.json or dependency changes.
- Exit-code mapping reviewed: usage/preflight -> 2, generation/install -> 1, interrupt -> 130. Malformed custom manifests stay generation (1); template compatibility and remote fetch failures stay usage/preflight (2).
- Retained decisions: static templates still normalize root `package.json` identity (`name`, `private`, `type`, `engines.node`) instead of copying it byte-for-byte; `--db-url` with `--template` remains a usage error because template-owned env files make the injected key ambiguous and the template may not be database-backed; generated `scripts/stackpress.ts` remains for the Windows import workaround.

## Verification Notes

- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm test` — 194 tests: 190 passed, 4 skipped (Windows symlinks, live GitHub template, two opt-in heavy smokes), 0 failed.
- Focused security suite (`writer`, `templates`, `resolve`, `package-manager-commands`, `create`, `install-git`) — 105 tests: 104 passed, 1 skipped (Windows symlink), 0 failed.
- `npm audit --omit=dev` — 0 vulnerabilities; `npm audit` — 0 vulnerabilities.
- Startup `node dist/cli.js --version`: final 3-run median 76.9 ms (75.3–98.8 ms) and settled 7-run median 72.9 ms (70.0–76.7 ms); pre-refactor 3-run median 151.2 ms; Node baseline ~51 ms.
- T-007A preserved: templates untouched and all snapshot tests pass.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
