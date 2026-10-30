# 00008: Database Fragments and Connection Mapping

- **Task ID:** T-008
- **Task control:** 00008
- **Status:** verified
- **Depends on:** T-005, T-007

## Task Summary

Add PGlite, PostgreSQL, CockroachDB, MySQL, and SQLite fragments with pinned adapters/drivers, connection files, database config, and environment defaults.

## Implementation Steps

1. Add PGlite fragment with `@electric-sql/pglite` and `@stackpress/inquire-pglite`, pinned `0.3.15`.
2. Add PostgreSQL and CockroachDB fragments with `@stackpress/inquire-pg` and `pg`, pinned `8.16.3`.
3. Add MySQL fragment with `@stackpress/inquire-mysql2` and `mysql2`, pinned `3.15.3`.
4. Add SQLite fragment with `@stackpress/inquire-sqlite3` and `better-sqlite3`, pinned `12.4.1`.
5. Generate one-parameter `server.on('config', async (_) => ...)` handlers.
6. Add `.env.sample` lines and optional `.env` handling for `--db-url`.
7. Add content snapshots and a PGlite smoke check.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/snapshot/databases.test.ts`
- P-003 PGlite smoke.

## Acceptance Criteria

None. Database output is validated by snapshots and the PGlite smoke test; T-009 presents generated output.

## Implementation Notes

- Added `templates/databases/{pglite,postgres,cockroachdb,mysql,sqlite}`. Each manifest uses `database-<db>`, kind `database`, requires `base`, capabilities `database`, files `plugins/store/connect.ts` + `config/database.ts`, and plugin `plugins/store/plugin`.
- Pins and imports: PGlite `@stackpress/inquire-pglite` 0.10.8 + `@electric-sql/pglite` 0.3.15 via `stackpress/pglite`; PostgreSQL/CockroachDB `@stackpress/inquire-pg` 0.10.8 + `pg` 8.16.3 via `stackpress/pgsql`; MySQL `@stackpress/inquire-mysql2` 0.10.8 + `mysql2` 3.15.3 via `stackpress/mysql`; SQLite `@stackpress/inquire-sqlite3` 0.10.8 + `better-sqlite3` 12.4.1 via `stackpress/sqlite`.
- Each `connect.ts` exports `connect()` and `register(server)`; the base store plugin delegates to `register`, which keeps the one-parameter `server.on('config', async (_) => ...)` handler. Connections read `DATABASE_URL` with local defaults and never log it. PGlite matches proof 003; PostgreSQL/CockroachDB use a `pg` `Client`, MySQL uses `mysql2/promise`, SQLite uses `better-sqlite3`.
- Env defaults: pglite `./.build/database`; postgres `postgres://postgres:postgres@localhost:5432/app`; cockroachdb `postgres://root@localhost:26257/defaultdb?sslmode=disable`; mysql `mysql://root:root@localhost:3306/app`; sqlite `./.build/database.sqlite`. No database fragment writes `.env.sample`; the resolver merges manifest env lines.
- Added `@types/pg` 8.16.0 and `@types/better-sqlite3` 7.6.13 as fragment devDependencies, matching proof 001, so generated projects can typecheck.
- `tests/snapshot/databases.test.ts` builds a temp template root from each real database fragment plus owned base/type fixtures and a generated index; it asserts manifest conformity, metadata alignment, pins, contents, env, capabilities, and plugin lists. Owned fixtures live under `tests/fixtures/databases/`.

## Verification Notes

- `npx tsc -p tsconfig.json --noEmit` passed.
- `node --import tsx --test tests/snapshot/databases.test.ts` passed 7/7 tests.
- PGlite smoke initially deferred because `proofs/003-minimal-stackpress-pglite/node_modules` was absent. Orchestrator follow-up on 2026-10-30 ran `npm ci`, `npm run check`, and `node run.mjs` in `proofs/003-minimal-stackpress-pglite`: server booted, `/health` returned 200, the database registered, and the query returned `[{ ok: 1 }]`.
- Resolver integration confirmed with T-005's `resolveProject` and the real `templates/base` + `templates/types/minimal` fragments; minimal/PGlite resolves without conflicts.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
