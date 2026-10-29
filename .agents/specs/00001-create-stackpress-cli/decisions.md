# Decisions and Gaps

## Decision Rules

- A **Proposed** decision is a researched recommendation, not yet accepted by the user.
- An **Accepted** decision comes from a recorded user answer in [Questions](questions.md).
- An **Unresolved** gap blocks Freeze when it changes generated output, the CLI contract, or distribution.

## Accepted for This Research Pass

- **D-001:** Compare Create React App, Create Vite, Create Next App, Create T3 App, Create Astro, Create Remix, Create Redwood App, Create Expo App, Prisma CLI, and the existing Stackpress `create` command.
- **D-002:** Record findings and recommendations without implementing the CLI or freezing product decisions.
- **D-003:** The GitHub repository is `cdsiats/create-stackpress` and the npm package is `@cdsiats/create-stackpress`.

## Gap Ledger

| ID | Question | Status | Current Position and Evidence |
| --- | --- | --- | --- |
| GAP-001 | Which project types should the first release support? | Accepted | Full-stack, API-only, Minimal/blank, and Admin-only. Website/content was removed because the user judged it the same as full-stack. Capability definitions are accepted in GAP-020. |
| GAP-002 | Should project type and database be independent choices? | Accepted | Treat type and database as orthogonal axes (`--type` and `--db`) so the matrix stays small and composable. T3 and Next treat feature/database choices as independent options. |
| GAP-003 | Should the CLI be interactive-first or flag-first? | Accepted | Interactive when running in a TTY, with every answer available as a flag. Non-interactive when stdin/stdout is not a TTY, `CI` is set, or `--no-input` is passed. Create Vite, Astro, T3, and general CLI guidance converge on this. |
| GAP-004 | Which package managers should be supported? | Accepted | npm, pnpm, yarn, and bun. Detect the invoking package manager from `npm_config_user_agent`, then fall back to lockfiles or the `packageManager` field; allow `--pm` to override. |
| GAP-005 | Should dependencies be installed automatically? | Accepted | Interactive default: ask, with yes recommended. Non-interactive default: scaffold only unless `--install` is passed. Provide `--install` / `--no-install`. |
| GAP-006 | Should the CLI initialize git? | Accepted | Interactive default: ask, with yes recommended. Non-interactive default: no unless `--git` is passed. Provide `--git` / `--no-git` and an optional initial commit message. |
| GAP-007 | Should templates be bundled, remote, or both? | Accepted | Bundle core presets with the CLI for offline reliability and pinned compatibility. Add optional `--template <github-or-local>` for advanced use, but do not make it the only path. |
| GAP-008 | How should this CLI relate to the existing `stackpress create` command? | Accepted | Coexist. `create-stackpress` is the higher-level preset generator; the existing command stays unchanged. |
| GAP-009 | What should the default database be? | Accepted | PGlite is the zero-config local default. CockroachDB is the first-class production target. |
| GAP-010 | Should the CLI collect database credentials during scaffolding? | Accepted | Do not require credentials to scaffold. Generate `.env.sample` and placeholder config, support optional `--db-url`, and never auto-run `push` or `migrate` against a real database. |
| GAP-011 | What Node.js version should the CLI require? | Accepted | Node.js 22+. |
| GAP-012 | Should generated projects include agent guidance? | Accepted | Include a Stackpress-specific `AGENTS.md` by default and allow `--no-agents-md`. |
| GAP-013 | Should the CLI collect telemetry? | Accepted | No telemetry. |
| GAP-014 | What automation output should the CLI provide? | Accepted | Human-readable plan and exact next steps by default. Add `--dry-run`, `--no-color` plus `NO_COLOR` support, and consider `--json` for CI. |
| GAP-015 | How should failed or partial generation be handled? | Accepted | Write into a staging directory, validate the generated project, then move it into place. Roll back on failure and require `--overwrite` for non-empty targets. |
| GAP-016 | What testing and release gates are required? | Accepted | Test the preset x database matrix with snapshot tests, then smoke-test install and build on Windows, macOS, and Linux across supported Node versions. Check template/CLI version compatibility at generation time. |
| GAP-017 | How should project naming and target directories work? | Accepted | Accept a positional directory, support `.` for the current directory, derive the package name from the directory, validate npm package-name rules, and require an empty target unless `--overwrite`. |
| GAP-018 | What should the generated README contain? | Accepted | Include the selected preset, database adapter, required environment variables, and exact install/generate/push/dev commands for the chosen package manager. |
| GAP-019 | What npm package identity should be used? | Accepted | npm package `@cdsiats/create-stackpress`; GitHub repository `cdsiats/create-stackpress`. |
| GAP-020 | What capabilities define each of the four remaining project types? | Accepted | Full-stack: public views, admin, API, auth, database, content/pages. API-only: API, auth, database. Minimal/blank: base server plugin and database. Admin-only: admin, auth, database, no public views/content. |

## Accepted Capability Matrix

| Capability | Full-stack | API-only | Minimal/blank | Admin-only |
| --- | --- | --- | --- | --- |
| Public React views | Yes | No | No | No |
| Admin dashboard | Yes | No | No | Yes |
| API surface | Yes | Yes | No | Yes |
| Auth/session | Yes | Yes | No | Yes |
| Database/store | Yes | Yes | Yes | Yes |
| Content/pages | Yes | No | No | No |

Website/content was removed as a separate project type because the user judged it equivalent to Full-stack.

## Proof-Verified Decisions

- **D-004:** On Windows, launch package-manager `.cmd` shims with `shell: true`; keep `shell: false` on POSIX and for generic executable runs. Reject shell metacharacters in package-manager arguments. Evidence: P-002.
- **D-005:** Generated Stackpress event handlers must accept at least one parameter. Zero-parameter functions are treated as lazy import actions. Evidence: P-003.
- **D-006:** Pin driver versions to adapter peer ranges. Use `better-sqlite3` `12.4.1` (peer `^12`) and `@electric-sql/pglite` `0.3.15` (peer `^0.3`) for the current adapters. Evidence: P-004.
- **D-007:** The PGlite connection imports `connect` from `stackpress/pglite` and installs both `@electric-sql/pglite` and `@stackpress/inquire-pglite`. Evidence: P-003 and P-004.

## Design Clarifications From The Journey Audit

- **D-008:** Target must be missing or a directory. `.DS_Store` is ignored when deciding emptiness; files and symlinks exit 2.
- **D-009:** A `.` target is staged beside the current directory and copied in with backup/restore; the current directory is never renamed or removed.
- **D-010:** Declining the final plan confirmation cancels with exit 0 and no writes. Ctrl+C exits 130.
- **D-011:** If the target is inside an existing git worktree, skip `git init`, warn, and do not create a nested repository.
- **D-012:** A static remote template is copied as-is. No generated `AGENTS.md` or README metadata is added, and `--type`/`--db` are rejected.
- **D-013:** Missing package manager with `--install` exits 2 before writes. Missing git with `--git` warns, skips git, and exits 0.
- **D-014:** Remote template fetch or extraction failure exits 2 before any target write.

## Freeze Record

- **Status:** Frozen
- **Frozen on:** 2026-10-29
- **Approved by:** User
- **Basis:** v1 architecture, CLI contract, user journeys, D-008 through D-014, and the final context review.
- **Open items at Freeze:** none that block implementation. Deferred items remain: `--json`, saved preferences, upgrade command, template registry, monorepo scaffolding, release automation, and exact license.
- **Reopening:** Requires explicit user permission. Record the reason, affected files, and new evidence before editing.