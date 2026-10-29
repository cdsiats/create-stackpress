# create-stackpress Proofs

Runnable prototypes for the technical risks in spec `00001-create-stackpress-cli`. These are evidence artifacts, not production code.

## Proofs

| Proof | Command | Result |
| --- | --- | --- |
| P-001 Fragment composition | `cd 001-fragment-composition && node run.mjs` | Proved: 20/20 type x database combinations, no conflicts. |
| P-002 Command resolution | `cd 002-command-resolution && node run.mjs` | Proved with fallback: Windows `.cmd` needs `shell: true`; npm and pnpm execute, yarn/bun logic-tested. |
| P-003 Minimal Stackpress + PGlite | `cd 003-minimal-stackpress-pglite && npm install && npm run check && node run.mjs` | Proved: server boots, PGlite registers, `/health` query succeeds. |
| P-004 Adapter mapping | `cd 004-database-adapter-mapping && node run.mjs` | Proved: 5/5 mappings; pin `better-sqlite3` 12.4.1 and PGlite 0.3.15. |

## Notes

- P-003 installs dependencies into its local `node_modules/`; P-004 uses the installed PGlite adapter for its import check.
- Generated output from P-001 is written to `001-fragment-composition/out/`.
- `node_modules/`, `out/`, and database build artifacts are ignored by `proofs/.gitignore`.
- Live MySQL, PostgreSQL, CockroachDB, and SQLite connections are not covered by these prototypes.

Full findings are recorded in `.agents/specs/00001-create-stackpress-cli/proofs.md`.
