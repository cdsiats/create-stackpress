# Project Brief: create-stackpress

## Identity

- **Name:** `create-stackpress`
- **npm package:** `@cdsiats/create-stackpress`
- **GitHub repository:** `cdsiats/create-stackpress`
- **Repository summary:** developer tool for starting Stackpress applications.
- **Product category:** command-line project scaffolder comparable to `create-react-app`.
- **Current state:** greenfield product. The repository contains the `.agents/` workspace and proof prototypes under `proofs/`; production CLI source, package manifest, tests, and bundled templates do not exist yet.

## Goal

Provide a CLI that scaffolds ready-to-use Stackpress applications so a developer can select a project shape and database, generate the project, install dependencies, and begin development without assembling a Stackpress scaffold manually.

## Accepted Requirements

### Project Types

The first release supports four project types:

| Capability | Full-stack | API-only | Minimal/blank | Admin-only |
| --- | --- | --- | --- | --- |
| Public React views | Yes | No | No | No |
| Admin dashboard | Yes | No | No | Yes |
| API surface | Yes | Yes | No | Yes |
| Auth/session | Yes | Yes | No | Yes |
| Database/store | Yes | Yes | Yes | Yes |
| Content/pages | Yes | No | No | No |

Website/content was removed as a separate type because the user judged it equivalent to full-stack.

### Database Support

- The CLI supports multiple database options.
- **Local default:** PGlite, for zero-config onboarding.
- **Primary production target:** CockroachDB.
- **Additional targets:** PostgreSQL, MySQL, SQLite.
- CockroachDB and PostgreSQL use the PostgreSQL adapter and driver.

### CLI Experience

- Project type and database are independent choices (`--type`, `--db`).
- Interactive prompt flow when running in a TTY; every answer has a flag equivalent.
- Non-interactive mode when not in a TTY, when `CI` is set, or when `--no-input` is passed.
- Supported package managers: npm, pnpm, yarn, and bun, detected from invocation with a `--pm` override.
- Interactive defaults: install dependencies yes, initialize git yes.
- Non-interactive defaults: scaffold only unless `--install` or `--git` is passed.
- Bundle core templates with the CLI and allow optional GitHub/local templates.
- Generate a Stackpress-specific `AGENTS.md` by default; support `--no-agents-md`.
- No telemetry.
- Human-readable plan and exact next steps by default; `--dry-run` and `--no-color`/`NO_COLOR`; evaluate `--json`.
- Generate into a staging directory, validate, then commit to the target; roll back on failure; require `--overwrite` for non-empty targets.
- Accept a positional directory, support `.` for the current directory, derive and validate the package name, and require an empty target unless `--overwrite`.
- Generated README records the preset, database, environment variables, and exact package-manager commands.
- Never require database credentials during scaffolding and never auto-run `push` or `migrate`.

### Implementation Constraints

- The CLI must be written in **TypeScript**.
- Keep runtime dependencies to a minimum wherever practical.
- Run cross-platform on **Node.js**; the CLI requires Node.js 22 or newer.
- Test the preset x database matrix and smoke-test install/build on Windows, macOS, and Linux.

### Reference Material

- The Stackpress documentation site is the authoritative external reference: <https://www.stackpress.io/>.
- Verified platform facts and proof-verified generation constraints are recorded in [Stackpress platform](stackpress-platform.md).

## Remaining Scope Boundaries

These details remain open or pending review:

- user review of the drafted template architecture and CLI contract;
- exact generated file contents for each project type and database;
- release, publishing, and upgrade strategy details;
- live database integration testing for server-backed databases.

User-journey coverage is complete in the spec. The remaining items are implementation-planning or review questions and must not be treated as accepted truth until the user confirms them or the spec Freeze records them.

## Source Provenance

- Initial project prompt: [Verbatim initial project prompt](../resources/00001-initial-project-prompt.md). Load for the exact original wording behind this brief.
- Stackpress documentation: <https://www.stackpress.io/> (accessed 2026-10-29).
- Stackpress repository: <https://github.com/stackpress/stackpress> (accessed 2026-10-29).
- Grill decisions and proof evidence: [create-stackpress CLI spec](../specs/00001-create-stackpress-cli/index.md).
