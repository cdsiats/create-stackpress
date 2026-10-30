# 00007: Base and Project-Type Fragments

- **Task ID:** T-007
- **Task control:** 00007
- **Status:** verified
- **Depends on:** T-005

## Task Summary

Create the bundled base skeleton and four project-type fragments with minimal but valid Stackpress content.

## Implementation Steps

1. Add base files: package manifest data, `plugins/app/plugin`, `plugins/store/plugin`, tsconfig, README, `AGENTS.md`, `gitignore`, and `.env.sample`.
2. Add full-stack capabilities: public views, admin, API, auth, content/pages.
3. Add API-only capabilities: API, auth, database.
4. Add minimal capabilities: database only.
5. Add admin-only capabilities: admin, auth, database.
6. Add `config/capabilities.ts` to every type.
7. Add snapshot tests for file sets, capabilities, and plugin lists.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/snapshot/types.test.ts`

## Acceptance Criteria

None. The generated project output is presented for acceptance in T-009.

## Implementation Notes

- `templates/base/` contains `manifest.json`, `plugins/app/plugin.ts`, `plugins/store/plugin.ts`, `tsconfig.json`, `README.md`, `AGENTS.md`, `gitignore`, and `.env.sample`. Manifest id `base`, kind `base`, no requires or capabilities, and package data with `stackpress@0.10.8`, dev dependencies (`@types/node@25.3.5`, `tsx@4.23.15`, `typescript@5.9.3`), scripts `build`/`dev`/`generate`/`push`, and plugins `plugins/app/plugin` plus `plugins/store/plugin`.
- Base `plugins/store/plugin.ts` calls the `register` export from the database-owned `plugins/store/connect.ts`; all five T-008 connection files provide that export.
- Type fragments use ids `full-stack`, `api-only`, `minimal`, and `admin-only` with kind `type` and `requires: ["base"]`. Capability sets: full-stack `views,admin,api,auth,content,database`; api-only `api,auth,database`; minimal `database`; admin-only `admin,auth,database`.
- Full-stack adds `config/capabilities.ts`, admin/api/auth/content plugins, `plugins/content/pages.ts`, `plugins/app/views/home.tsx`, and `plugins/views/plugin.ts`; React `19.3.1` and React types `19.3.0` are type-fragment dependencies. The view plugin renders the component with `react-dom/server` because `server.view.get` takes an action string, not a component.
- API-only adds `config/capabilities.ts`, `plugins/api/plugin.ts`, and `plugins/auth/plugin.ts`; admin-only adds `config/capabilities.ts`, `plugins/admin/plugin.ts`, and `plugins/auth/plugin.ts`; minimal adds only `config/capabilities.ts`.
- Plugin entries use bare paths (`plugins/...`) to match the T-008 database manifests and deduplicate into one store plugin entry.
- Tokens `{{name}}`, `{{type}}`, `{{database}}`, `{{adapter}}`, and `{{driver}}` appear only in README, `AGENTS.md`, and the full-stack home view; the resolver supplies them from the plan and database metadata.
- `tests/snapshot/types.test.ts` validates every fragment manifest against `validateFragmentManifest`, checks that declared files/assets exactly match disk, builds a temp template root (base + all four types + `tests/fixtures/types/database-stub` + generated index), and resolves each type. It asserts file sets (including `gitignore` → `.gitignore`), capabilities, plugins, package plugin list, env values, and absence of unresolved tokens.

## Verification Notes

- `npx tsc -p tsconfig.json --noEmit` — passed.
- `node --import tsx --test tests/snapshot/types.test.ts` — 5 tests passed (manifest integrity plus four type resolutions).
- Ad-hoc resolution of all 4 types × 5 real database fragments passed with no conflicts and no unresolved tokens.
- Generated-project install/build was not run here; it is covered by T-009/T-012. `node_modules` was absent during the session and was restored with `npm ci` before verification.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
