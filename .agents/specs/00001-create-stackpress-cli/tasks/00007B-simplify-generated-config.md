# 00007B: Simplify Generated Config To Canonical Stackpress Shape

- **Task ID:** T-007B
- **Task control:** 00007B
- **Parent:** T-007A
- **Status:** accepted
- **Depends on:** T-007A
- **Discovered:** 2026-10-30

## Task Summary

The T-007A correction added too many config files that are not part of a real Stackpress app. The canonical template has only `config/common.ts`, `config/develop.ts`, `config/build.ts`, and `config/client.ts`. Our generated app also added `config/base.ts`, `config/feature-types.ts`, `config/capabilities.ts`, `config/features.ts`, and `config/database.ts`.

Simplify to the canonical shape while retaining support for four presets:

- Merge `config/base.ts` into `config/common.ts`.
- Keep `config/features.ts` as the single preset-split file for `admin`, `api`, `auth`, and `views`.
- Remove `config/feature-types.ts`; type the feature object inline in `features.ts`.
- Remove `config/capabilities.ts`; the CLI's internal capability matrix remains the source of truth.
- Remove `config/database.ts`; database settings stay in `config/common.ts` and the connection stays in `plugins/store/connect.ts`.
- Update the app plugin to use `features.views` instead of a generated capabilities file.
- Update manifests, tests, docs, and acceptance artifacts.

## Verification Process

- `npm run typecheck`
- `npm test`
- Generate and build all four presets.
- Full-stack/PGlite: install, build, generate, push, and boot; check `/`, `/auth/signin`, `/admin`, `/api/auth/search`.

## Acceptance Criteria

The user reviews the simplified generated config tree and confirms it matches the canonical Stackpress shape with only the preset-split `features.ts` added.

## Implementation Notes

- Merged `config/base.ts` into `config/common.ts`; the shared config and the selected `admin`/`api`/`auth` sections now live in the canonical `common.ts`.
- Kept `config/features.ts` as the only preset-split file. It now carries `views` plus optional `admin`, `api`, and `auth` sections, typed inline.
- Removed `config/feature-types.ts`, `config/capabilities.ts`, and `config/database.ts` from the generated project.
- Removed the corresponding files from the base, type, and database manifests and from the test fixtures.
- `plugins/app/plugin.ts` now reads `features.views` instead of a generated capability file.
- Updated `tests/integration/create.test.ts`, `tests/snapshot/types.test.ts`, `tests/snapshot/databases.test.ts`, `tests/smoke/cli-package.test.ts`, fixtures, and README references.
- Generated config is now `config/common.ts`, `config/develop.ts`, `config/build.ts`, `config/client.ts`, and `config/features.ts`. The canonical four files are preserved; `features.ts` is the single preset split.
- Recorded a spec reopen in `status.md` and updated `architecture.md` File Ownership, Fragment Manifest, and Project Type Presets to match.

## Verification Notes

- `npm run typecheck` — passed.
- Focused tests: `tests/integration/create.test.ts`, `tests/snapshot/types.test.ts`, `tests/snapshot/databases.test.ts`, `tests/smoke/cli-package.test.ts` — 35 tests, 33 passed, 2 skipped, 0 failed.
- Full suite: 194 tests, 190 passed, 4 skipped, 0 failed.
- All four presets build after the simplification: full-stack, api-only, admin-only, minimal.
- Full-stack/PGlite: `npm run build`, `npm run generate`, and `npm run push` passed; `npm run dev` served `/` 200, `/auth/signin` 200, `/admin` 401, `/api/auth/search` 200.
- The generated config directory contains exactly `build.ts`, `client.ts`, `common.ts`, `develop.ts`, and `features.ts`.

## Acceptance Notes

- Accepted by the user on 2026-10-30 after reviewing the simplified generated project tree.
