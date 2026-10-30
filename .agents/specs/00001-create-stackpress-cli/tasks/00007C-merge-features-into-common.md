# 00007C: Merge Preset Features Into `config/common.ts`

- **Task ID:** T-007C
- **Task control:** 00007C
- **Parent:** T-007B
- **Status:** accepted
- **Depends on:** T-007B
- **Discovered:** 2026-10-30

## Task Summary

T-007B left one extra generated config file, `config/features.ts`, to split `admin`, `api`, `auth`, and `views` across the four presets. The user asked whether those features can be merged into `config/common.ts` to match the canonical Stackpress shape exactly.

Merge them with a compile-time `{{type}}` constant in `config/common.ts`:

- `views` is true only for `full-stack`.
- `admin` is defined for `full-stack` and `admin-only`.
- `api` is defined for `full-stack` and `api-only`.
- `auth` is defined for `full-stack`, `api-only`, and `admin-only`.
- `minimal` gets none of them.

Then remove `config/features.ts` from the base/type layout and the generated project. Type fragments become manifest-only (capabilities and package metadata), while the base `config/common.ts` owns the feature conditionals.

## Verification Process

- `npm run typecheck`
- `npm test`
- Generate and build all four presets.
- Full-stack/PGlite: build, generate, push, boot; check `/`, `/auth/signin`, `/admin`, `/api/auth/search`.
- Generate a project with a target directory name that differs from the template defaults and confirm `{{name}}` is rendered in `config/common.ts`.

## Acceptance Criteria

The user reviews the generated config tree and confirms it contains only `config/common.ts`, `config/develop.ts`, `config/build.ts`, and `config/client.ts`.

## Implementation Notes

- Moved the preset feature conditionals into `config/common.ts` using `const type: string = '{{type}}';`.
- `views` is true only for `full-stack`.
- `admin` is defined for `full-stack` and `admin-only`.
- `api` is defined for `full-stack` and `api-only`.
- `auth` is defined for `full-stack`, `api-only`, and `admin-only`; `admin-only` redirects to `/admin`.
- `minimal` gets no feature sections.
- Removed `config/features.ts` from the base/type layout, type manifests, test fixtures, and generated projects. Type fragments are now manifest-only (capabilities and package metadata).
- Updated `plugins/app/plugin.ts` to import `views` from `config/common.ts`.
- Updated tests, fixtures, README, the spec reopen record, and architecture.
- `{{name}}` injection was verified in `config/common.ts`: brand name, CLI label, client module/package/build path, and 2FA issuer all use the target-derived package name.

## Verification Notes

- `npm run typecheck` — passed.
- Focused tests: 35 tests, 33 passed, 2 skipped, 0 failed.
- Full suite: 194 tests, 190 passed, 4 skipped, 0 failed.
- All four presets build with only `config/common.ts`, `config/develop.ts`, `config/build.ts`, and `config/client.ts`.
- Full-stack/PGlite: `npm run build`, `npm run generate`, and `npm run push` passed; `npm run dev` served `/` 200, `/auth/signin` 200, `/admin` 401, `/api/auth/search` 200.
- Generated project name `stackpress-merged` was rendered into `config/common.ts`; the config directory contained exactly four files.

## Acceptance Notes

- Accepted by the user on 2026-10-30 after reviewing the four-file generated config.
