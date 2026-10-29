# P-004: Database Adapter Mapping

Verifies that the five requested databases map to published Inquire adapters, drivers, and Stackpress dialect exports.

## Run

```bash
node run.mjs
```

Run after P-003's `npm install` to include the PGlite import-shape check.

## What It Checks

- Every adapter package exists at `0.10.8`.
- Adapter peer dependencies match the expected driver:
  - `@stackpress/inquire-pg` -> `pg`
  - `@stackpress/inquire-mysql2` -> `mysql2`
  - `@stackpress/inquire-sqlite3` -> `better-sqlite3`
  - `@stackpress/inquire-pglite` -> `@electric-sql/pglite`
- Every adapter has an ESM root export.
- `stackpress` exposes `./pgsql`, `./mysql`, `./sqlite`, and `./pglite`.
- CockroachDB's official example uses the PostgreSQL adapter and `pg`.
- The installed PGlite adapter exports `connect` and a default factory.

## Non-Goals

This proof does not open live MySQL, PostgreSQL, CockroachDB, or SQLite connections. It proves package mapping and the PGlite import shape; runtime connectivity is covered by P-003 for PGlite and remains an integration concern for the server-backed databases.
