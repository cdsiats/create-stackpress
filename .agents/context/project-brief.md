# Project Brief: create-stackpress

## Identity

- **Name:** `create-stackpress`
- **Repository summary:** developer tool for starting Stackpress applications.
- **Product category:** command-line project scaffolder comparable to `create-react-app`.
- **Current state:** greenfield repository. Before context initialization it contained only `README.md` and the `.agents/` workspace; there is no CLI source, package manifest, test suite, or bundled template yet.

## Goal

Provide a CLI that scaffolds ready-to-use Stackpress applications so a developer can select a project shape and database, generate the project, install dependencies, and begin development without assembling a Stackpress scaffold manually.

## Accepted Requirements

### Project Types

- The CLI must support multiple Stackpress project types rather than a single fixed template.
- The user named **full-stack** and **API-only** as examples of supported project types.
- The complete project-type list is not yet defined. The words "etc." in the initial request indicate more types are expected, but they must not be invented without confirmation.

### Database Support

- The CLI must support multiple database options.
- **Primary target:** CockroachDB.
- **Additional targets:** PostgreSQL, MySQL, SQLite, PGlite.

### Implementation Constraints

- The CLI must be written in **TypeScript**.
- Keep runtime dependencies to a minimum wherever practical.
- Run cross-platform on **Node.js**.

### Reference Material

- The Stackpress documentation site is the authoritative external reference: <https://www.stackpress.io/>.
- Verified platform facts are recorded in [Stackpress platform](stackpress-platform.md).

## Recorded Scope Boundaries

The initial request does not yet settle these design details:

- the full taxonomy of project types;
- the prompt flow and non-interactive flag surface;
- package manager support and whether dependencies are installed automatically;
- how templates are packaged or fetched;
- how the new CLI relates to the existing `stackpress create` command;
- the minimum supported Node.js version for the CLI itself;
- test, release, and publishing strategy.

These are implementation-planning questions and must not be treated as accepted truth until the user confirms them.

## Source Provenance

- Initial project prompt: [Verbatim initial project prompt](../resources/00001-initial-project-prompt.md). Load for the exact original wording behind this brief.
- Stackpress documentation: <https://www.stackpress.io/> (accessed 2026-10-29).
- Stackpress repository: <https://github.com/stackpress/stackpress> (accessed 2026-10-29).
