# Task Status

Implementation ledger for `00001-create-stackpress-cli`. Plan accepted 2026-10-29.

## Status Values

`proposed` -> `open` -> `started` -> `verified` -> `accepted`. Tasks with `Acceptance criteria: none` finish at `verified`.

## Tasks

| ID | Control | Task | Status | Depends on | Acceptance |
| --- | --- | --- | --- | --- | --- |
| [T-001](00001-repository-foundation.md) | 00001 | Repository and package foundation | verified | None | None |
| [T-002](00002-cli-types-errors-output.md) | 00002 | CLI types, errors, and output primitives | verified | T-001 | None |
| [T-003](00003-argument-parsing-help-version.md) | 00003 | Argument parsing, help, and version | accepted | T-002 | Terminal help/version |
| [T-004](00004-interaction-detection-prompts.md) | 00004 | Interaction detection and prompts | accepted | T-002, T-003 | Terminal interaction |
| [T-005](00005-template-manifest-resolver.md) | 00005 | Template manifest, resolver, and package merge | verified | T-002 | None |
| [T-006](00006-staging-commit-rollback.md) | 00006 | Staging, commit, overwrite, and rollback | verified | T-005 | None |
| [T-007](00007-base-type-fragments.md) | 00007 | Base and project-type fragments | verified | T-005 | None |
| [T-008](00008-database-fragments.md) | 00008 | Database fragments and connection mapping | verified | T-005, T-007 | None |
| [T-007A](00007A-stackpress-config-alignment.md) | 00007A | Align templates with real Stackpress config | accepted | T-007, T-008 | Config-driven app review |
| [T-007B](00007B-simplify-generated-config.md) | 00007B | Simplify generated config to canonical shape | accepted | T-007A | Simplified config review |
| [T-007C](00007C-merge-features-into-common.md) | 00007C | Merge preset features into config/common.ts | accepted | T-007B | Four-file config review |
| [T-009](00009-create-workflow.md) | 00009 | Create workflow and next steps | accepted | T-003 through T-008 | Generated project + terminal |
| [T-010](00010-package-manager-git.md) | 00010 | Package manager and git execution | accepted | T-009 | Terminal install/git |
| [T-011](00011-remote-local-templates.md) | 00011 | Remote and local templates | accepted | T-009 | Terminal template run |
| [T-012](00012-test-matrix-ci.md) | 00012 | Test matrix and CI | verified | T-001 through T-011 | None |
| [T-013](00013-refactor-hardening.md) | 00013 | Refactor and hardening pass | verified | T-012 | None |
| [T-014](00014-docs-release-readiness.md) | 00014 | Documentation and release readiness | accepted | T-013 | README + pack output |

Parallel wave 1 completed 2026-10-30: T-005, T-006, T-007, and T-008 ran concurrently against the read-only shared contract in `src/template/types.ts` and all reached `verified`. T-009 then reached `verified`. Parallel wave 2 (T-010 and T-011) also reached `verified`; the orchestrator wired template preparation and explicit-flag provenance into the workflow. T-012 is the current wave. T-007A is a correctness side quest discovered during user review: the generated templates did not use the real config-driven Stackpress architecture. T-009/T-010/T-011 acceptance is on hold until T-007A lands and the acceptance artifacts are regenerated.

## Verification Log

| Task | Verified on | Evidence | Notes |
| --- | --- | --- | --- |
| T-001 | 2026-10-29 | `npm run typecheck`, `npm test`, `npm run build`, `node dist/cli.js --version` | 1 test passed; CLI printed `create-stackpress 0.0.0`. |
| T-002 | 2026-10-29 | `npm run typecheck`, `npm test` | 7 tests passed; types, errors, output, and color behavior covered. |
| T-003 | 2026-10-29 | `npm run typecheck`, `npm test`, `npm run build`, help/version/invalid-flag smoke | 13 tests passed; help/version output and exit code 2 verified. |
| T-004 | 2026-10-29 | `npm run typecheck`, `npm test`, non-TTY smoke, interactive PTY walkthrough | 29 tests passed; prompts, defaults, cancel/decline, and plan review verified. |
| T-005 | 2026-10-30 | `npm run typecheck`; focused resolver tests; full suite | 42 focused tests with 1 Windows symlink skip; 20-combination matrix; directory-junction coverage passed. |
| T-006 | 2026-10-30 | `npm run typecheck`; `tests/integration/writer.test.ts`; full suite | 18/18 writer tests passed; staging, overwrite, rollback, and interrupt cleanup covered. |
| T-007 | 2026-10-30 | `npm run typecheck`; `tests/snapshot/types.test.ts`; full suite | 5/5 type tests passed; all four presets resolve with canonical capabilities and plugin lists. |
| T-008 | 2026-10-30 | `npm run typecheck`; `tests/snapshot/databases.test.ts`; P-003 smoke | 7/7 database tests passed; proof 003 booted, `/health` returned 200, and PGlite query returned `[{ ok: 1 }]`. |
| T-005–T-008 | 2026-10-30 | `npm test` after wave integration | 100 passed, 0 failed, 1 skipped (Windows symlink EPERM); typecheck clean. |
| T-009 | 2026-10-30 | `npm run typecheck`; `tests/integration/create.test.ts`; full suite; generated-project install/build/boot smoke | 18/18 workflow tests; full suite 118 passed, 1 skipped; full-stack/PGlite installed, built, booted, `/health` 200, `/` rendered. Accepted 2026-10-30. |
| T-010 | 2026-10-30 | `npm run typecheck`; focused install/git tests; full suite; real CLI install/git run | 17/17 focused tests; full suite 170 passed, 2 skipped; minimal/PGlite CLI installed dependencies and created commit `cc12426`. Accepted 2026-10-30. |
| T-011 | 2026-10-30 | `npm run typecheck`; focused template tests; full suite; CLI static/manifest template runs | 31/32 focused tests (live GitHub smoke skipped); full suite 170 passed, 2 skipped; static and manifest template runs exited 0; explicit static `--type` exited 2 with no target. Accepted 2026-10-30. |
| T-007A | 2026-10-30 | Full suite; generated-project build/generate/push/boot checks | 178 passed, 0 failed, 4 skipped; all four presets build/generate/push; full-stack `/` 200, `/auth/signin` 200, `/admin` 401, `/api/auth/search` 200. Accepted 2026-10-30. |
| T-012 | 2026-10-30 | Full suite; suite filters; `npm pack --dry-run`; heavy packed-install smoke | 182 tests, 178 passed, 4 skipped; pack 154 entries; heavy packed-tarball install and generated full-stack install/build passed. CI matrix not run remotely. |
| T-013 | 2026-10-30 | `npm run typecheck`, `npm test`, `npm run build`, `npm audit`, startup benchmark | 194 tests, 190 passed, 4 skipped; audit 0 vulnerabilities; startup median ~73 ms; templates untouched and T-007A snapshots pass. |
| T-014 | 2026-10-30 | README review; `npm run typecheck`, `npm test`, `npm run build`; `npm pack --dry-run --json`; `npm publish --dry-run --json` | 194 tests, 190 passed, 4 skipped; pack 164 entries after T-007C; publish dry run exit 0; package `@cdsiats/create-stackpress@0.0.0`, MIT, `private: false`. Accepted 2026-10-30. |
| T-007B | 2026-10-30 | Full suite; all four preset builds; full-stack build/generate/push/boot | 194 tests, 190 passed, 4 skipped; generated config reduced to `common.ts`, `develop.ts`, `build.ts`, `client.ts`, and `features.ts`; full-stack routes still 200/200/401/200. Accepted 2026-10-30. |
| T-007C | 2026-10-30 | Full suite; all four preset builds; full-stack build/generate/push/boot; name injection check | 194 tests, 190 passed, 4 skipped; config now exactly four files; `{{name}}` rendered into `common.ts`; full-stack routes still 200/200/401/200. Accepted 2026-10-30. |

## Acceptance Log

| Task | Accepted on | Mode | Evidence | Notes |
| --- | --- | --- | --- | --- |
| T-001 | Not applicable | None | Verification only | Acceptance criteria: none. |
| T-003 | 2026-10-29 | Manual terminal review | `node dist/cli.js --help`, `node dist/cli.js --version` | Accepted by user. |
| T-004 | 2026-10-30 | Manual terminal review | Interactive PTY walkthrough and non-TTY plan output | Accepted by user. |
| T-005 | Not applicable | None | Verification only | Acceptance criteria: none. |
| T-006 | Not applicable | None | Verification only | Acceptance criteria: none. |
| T-007 | Not applicable | None | Verification only | Acceptance criteria: none; generated output is presented in T-009. |
| T-008 | Not applicable | None | Verification only | Acceptance criteria: none; generated output is presented in T-009. |
| T-007A | 2026-10-30 | User review | `full-stack-pglite-v2`, config-driven routes | Accepted by user. |
| T-007B | 2026-10-30 | User review | Simplified generated config tree | Accepted by user. |
| T-007C | 2026-10-30 | User review | Four-file `config/` in `full-stack-pglite-v4` | Accepted by user. |
| T-009 | 2026-10-30 | User review | `full-stack-pglite-v4`, `api-only-postgres-v2`; terminal next steps | Accepted by user. |
| T-010 | 2026-10-30 | User review | `install-git-app-v2`; commit `a645f11`; install/git output | Accepted by user. |
| T-011 | 2026-10-30 | User review | `static-template-app`, `manifest-template-app` terminal runs | Accepted by user. |
| T-012 | Not applicable | None | Verification only | Acceptance criteria: none. |
| T-013 | Not applicable | None | Verification only | Acceptance criteria: none. |
| T-014 | 2026-10-30 | User review | `README.md`, `LICENSE`, 164-entry pack, publish dry run | Accepted by user. |
