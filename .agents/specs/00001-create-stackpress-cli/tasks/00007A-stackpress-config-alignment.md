# 00007A: Align Templates With Real Stackpress Config

- **Task ID:** T-007A
- **Task control:** 00007A
- **Parent:** T-007, T-008
- **Status:** accepted
- **Depends on:** T-007, T-008
- **Discovered:** 2026-10-30

## Task Summary

The first template pass produced minimal placeholder apps that do not match a real Stackpress application. The canonical `templates/website` and `skills/stackpress-app-scaffold/assets/template` sources in `stackpress/stackpress` use a config-driven architecture:

- `config/common.ts`, `config/develop.ts`, `config/build.ts`, and `config/client.ts`;
- `schema.idea`;
- `uno.config.ts`;
- `plugins/app/plugin.ts`, `plugins/app/pages/home.ts`, and `plugins/app/views/home.tsx`;
- `plugins/store/plugin.ts`, `plugins/store/connect.ts`, and `plugins/store/populate.ts`;
- the built-in `"stackpress"` entry in `package.json.plugins`, which loads `stackpress-admin`, `stackpress-api`, `stackpress-csrf`, `stackpress-session`, `stackpress-sql`, `stackpress-view`, and the schema/language/server plugins.

The built-in API plugin skips when `config.api` is absent. The admin plugin is driven by generated client models. CSRF always registers. The built-in plugin is what turns config into API routes, admin surfaces, authentication, CSRF, roles, permissions, sessions, and schema-driven models.

The current generated output instead uses fake `plugins/admin`, `plugins/api`, `plugins/auth`, and `plugins/views` route files, has no `config/develop.ts` or `schema.idea`, and does not load the built-in `"stackpress"` plugin. That is a correctness defect, not a hardening detail.

## Required Correction

1. Replace the base placeholder with the real config-driven skeleton:
   - `config/base.ts` for shared config;
   - `config/common.ts` re-exporting shared config and type-selected features;
   - `config/develop.ts`, `config/build.ts`, `config/client.ts`;
   - `config/feature-types.ts`;
   - `schema.idea`, `uno.config.ts`, real app/store plugins, home page/view, and populate.
2. Add `"stackpress"` to the base package plugin list.
3. Update package scripts and dependencies to the canonical Stackpress commands and dev tooling.
4. Replace fake type plugins with type-owned `config/features.ts` and `config/capabilities.ts`:
   - full-stack: `admin`, `api`, `auth`;
   - api-only: `api`, `auth`;
   - admin-only: `admin`, `auth`;
   - minimal: no feature sections.
5. Keep database fragments responsible for `plugins/store/connect.ts` and `config/database.ts`; use the canonical default-export connection shape.
6. Update tests, fixtures, snapshots, and accepted file lists.
7. Regenerate acceptance projects and verify a full-stack/PGlite app installs, builds, boots, and serves the home page plus built-in auth/admin/API surfaces.

## Verification Process

- `npm run typecheck`
- `npm test`
- Generate a full-stack/PGlite project, install, build, and boot it.
- Fetch `/`, `/auth/signin`, `/api/auth/search`, and `/admin` and record the observed status codes.
- Regenerate the T-009/T-010/T-011 acceptance artifacts.

## Acceptance Criteria

The user reviews the corrected full-stack/PGlite generated project tree and a terminal or browser artifact showing the config-driven built-in Stackpress surfaces, and confirms the app matches the canonical Stackpress architecture.

## Implementation Notes

- Research sources: `stackpress/stackpress` `templates/website` and `skills/stackpress-app-scaffold/assets/template` on `main`, accessed 2026-10-30.
- The canonical `config/common.ts` contains `admin`, `api`, `auth`, `brand`, `cli`, `client`, `cookie`, `csrf`, `database`, `email`, `language`, `server`, `session`, and `view` settings.
- `config/develop.ts`, `config/build.ts`, and `config/client.ts` each build a `Config` object and call `server.config.set`, `server.bootstrap`, and `server.resolve('config'|'listen'|'route')`.
- The canonical package scripts use `stackpress build --b config/build -v`, `dotenv -e .env -- stackpress serve --b config/develop -v`, `stackpress generate --b config/develop -v`, and `dotenv -e .env -- stackpress push --b config/develop -v`.
- The canonical dependency set includes `stackpress@0.10.8`, React 19.2.4, `dotenv-cli`, `@vitejs/plugin-react`, `unocss`, `vite`, and the existing database adapter/driver pins.
- Replaced the base placeholder with `config/base.ts`, `config/feature-types.ts`, `config/common.ts`, `config/develop.ts`, `config/build.ts`, `config/client.ts`, `schema.idea`, `uno.config.ts`, the real app/store plugins, home page/view, populate, and the canonical tsconfig/gitignore.
- Added `"stackpress"` to the base package plugin list so the built-in plugin loads `stackpress-admin`, `stackpress-api`, `stackpress-csrf`, `stackpress-session`, `stackpress-sql`, `stackpress-view`, and the schema/language/server plugins.
- Split project features into `config/features.ts` per type: full-stack supplies admin/api/auth; api-only supplies api/auth; admin-only supplies admin/auth; minimal supplies none. `config/common.ts` re-exports the selected feature sections.
- Added `scripts/stackpress.ts`, a Windows-safe launcher that resolves the bootstrap path with `pathToFileURL` before importing it. The canonical `stackpress-server/bin.ts` uses `await import(path.resolve(...))`, which fails on Windows with `ERR_UNSUPPORTED_ESM_URL_SCHEME`; the launcher keeps the canonical config-driven behavior and fixes Windows.
- Database fragments now use the canonical default-export `connect()` shape; the base store plugin registers the database and populate event.

## Verification Notes

- `npm run typecheck` — passed.
- `npm test` — 178 passed, 0 failed, 4 skipped (Windows symlinks, live GitHub template, and the two opt-in heavy smokes).
- Full-stack/PGlite: `npm install`, `npm run build`, `npm run generate`, and `npm run push` all passed; `npm run dev` served `/` 200 with the project name, `/auth/signin` 200, `/admin` 401 (auth required), and `/api/auth/search` 200.
- API-only, admin-only, and minimal presets: `npm run build`, `npm run generate`, and `npm run push` all passed.
- Windows path failure in canonical `stackpress-server/bin.ts` reproduced and bypassed with `scripts/stackpress.ts`; the generated project now builds and serves on Windows.

## Acceptance Notes

- Accepted by the user on 2026-10-30 after reviewing the corrected full-stack/PGlite project and the config-driven built-in surfaces.
- Artifact: `C:\Users\Lenovo Idea Pad\AppData\Local\Temp\opencode\create-stackpress-acceptance\full-stack-pglite-v2`.
- Observed routes after `npm run generate`, `npm run push`, and `npm run dev`: `/` 200, `/auth/signin` 200, `/admin` 401 (auth required), `/api/auth/search` 200.
