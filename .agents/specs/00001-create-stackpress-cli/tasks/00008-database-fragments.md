# 00008: Database Fragments and Connection Mapping

- **Task ID:** T-008
- **Task control:** 00008
- **Status:** open
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

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
