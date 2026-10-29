# Proofs

Proof queue and result ledger for `00001-create-stackpress-cli`. Prototypes live under root `proofs/`, outside `.agents/`. **Status:** all proofs proved; frozen with the spec on 2026-10-29.

## Result Summary

| Proof | Result | Evidence |
| --- | --- | --- |
| P-001 Fragment composition | Proved | `node run.mjs`: 20/20 combinations, no conflicts, conflict detection passed. |
| P-002 Command resolution | Proved with fallback | `node run.mjs`: detection and mapping pass; Windows `.cmd` fails with `shell:false` (`EINVAL`); `shell:true` works for npm and pnpm. |
| P-003 Minimal Stackpress + PGlite | Proved | `npm install`, `npm run check`, `node run.mjs`: `/health` 200, database registered, query returned `[{ ok: 1 }]`. |
| P-004 Database adapter mapping | Proved | `node run.mjs`: 5/5 mappings, peer ranges, dialect exports, PGlite import; pinning constraints found. |

No additional Proofs are required for these hypotheses. Live MySQL, PostgreSQL, CockroachDB, and SQLite connection tests remain implementation integration work.

## P-001: Fragment-Based Template Composition

- **Status:** proved
- **Gap question:** Can a manifest-driven fragment system generate all four project types across all five database choices without per-combination templates or file conflicts?
- **Hypothesis:** A shared base fragment plus one type fragment and one database fragment can produce a deterministic file manifest for all 20 combinations.
- **Expected proof signal:** All 20 combinations resolve; expected files exist; package manifests are valid; no placeholders or conflicting writes.
- **Result:** Proved. The prototype composed 20/20 combinations, merged package manifests, enforced type and database file expectations, and detected injected file and package conflicts. Outputs were written to `proofs/001-fragment-composition/out/` for inspection.
- **Remaining unknown:** The prototype uses representative file contents, not the final template content.
- **Prototype:** `proofs/001-fragment-composition/`

## P-002: Cross-Platform Command Resolution

- **Status:** proved with accepted fallback
- **Gap question:** Can the CLI resolve and execute package-manager commands safely on Windows and POSIX without shell string concatenation, including paths containing spaces?
- **Hypothesis:** `child_process.spawn` with an executable resolver and `shell: false` works for the supported package managers.
- **Expected proof signal:** Detection and command maps pass; Windows shims resolve; a harmless command runs from a path with spaces.
- **Result:** The original hypothesis failed on Windows. `spawn('npm.cmd', ..., { shell: false })` threw `EINVAL`. Fallback proved: `shell: true` launches `.cmd` shims successfully; npm and pnpm `--version` ran from a path containing spaces. Literal argument preservation was proved separately with `process.execPath` and `shell: false`. Yarn and bun were not installed, so their execution remains logic-tested only.
- **Remaining unknown:** Actual yarn and bun execution on Windows and POSIX CI.
- **Prototype:** `proofs/002-command-resolution/`

## P-003: Minimal Stackpress Runtime With PGlite

- **Status:** proved
- **Gap question:** Does a minimal scaffold generated from the proposed base plus PGlite fragment install, typecheck, and serve a database-backed health route with the current Stackpress packages?
- **Hypothesis:** A minimal `package.json`, local plugin, store connection plugin, and PGlite adapter can boot under the Stackpress CLI, answer `GET /health`, and execute a trivial query.
- **Expected proof signal:** Install and typecheck succeed; server starts; `/health` returns success; PGlite query returns a row.
- **Result:** Proved. `npm install` added 87 packages; `tsc` passed; `node run.mjs` booted the server, registered the PGlite database, and returned `{ ok: true, database: "registered", query: [{ ok: 1 }] }`.
- **Important learning:** A Stackpress event handler with zero parameters is treated as a lazy import action. The store's `server.on('config', async () => ...)` failed; changing it to `async (_) => ...` fixed boot.
- **Prototype:** `proofs/003-minimal-stackpress-pglite/`

## P-004: Database Adapter Mapping

- **Status:** proved
- **Gap question:** Do the five requested databases map to resolvable Inquire adapter and driver packages with the expected entry points?
- **Hypothesis:** PostgreSQL and CockroachDB use `@stackpress/inquire-pg` with `pg`; MySQL uses `@stackpress/inquire-mysql2` with `mysql2`; SQLite uses `@stackpress/inquire-sqlite3` with `better-sqlite3`; PGlite uses `@stackpress/inquire-pglite` with `@electric-sql/pglite`.
- **Expected proof signal:** Registry metadata resolves every package; peer dependencies and exports match; PGlite imports.
- **Result:** Proved. All five mappings resolved at adapter `0.10.8`; peer ranges and Stackpress dialect exports matched; the PGlite adapter exposed `connect` and a default factory. Two pinning constraints were found: `better-sqlite3` latest `13.0.3` is outside peer `^12` (pin `12.4.1`), and `@electric-sql/pglite` latest `0.5.13` is outside peer `^0.3` (pin `0.3.15`).
- **Remaining unknown:** Live connections for server-backed databases.
- **Prototype:** `proofs/004-database-adapter-mapping/`

## Proof-Verified Constraints

- **Windows command launch:** `.cmd` shims require `shell: true` (or an explicit `cmd.exe` wrapper). Use `shell: true` only for allowlisted package-manager commands, reject shell metacharacters in arguments, and keep `shell: false` for POSIX and generic executable runs.
- **Stackpress event handlers:** Give generated event handlers at least one parameter. Zero-parameter functions are interpreted as lazy import actions, not handlers.
- **Driver pinning:** Pin driver versions that satisfy adapter peer ranges. Do not install latest blindly: `better-sqlite3` must stay on `^12` and PGlite on `^0.3` for the current adapters.
- **PGlite connection import:** The working minimal project imports `connect` from `stackpress/pglite` and installs `@electric-sql/pglite` plus `@stackpress/inquire-pglite`.

## Follow-Up

- Add live database integration tests for PostgreSQL, CockroachDB, MySQL, and SQLite during implementation.
- Validate yarn and bun execution on Windows and POSIX CI.
- Promote the accepted proof constraints into context during the Freeze review.
