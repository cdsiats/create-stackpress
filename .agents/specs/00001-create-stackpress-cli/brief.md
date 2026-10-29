# Brief: create-stackpress CLI

**Status:** Frozen 2026-10-29.

## User Goals

Initial request, preserved as written:

> lets initialize the context for this project. I want to build a CLI tool similar to create-react-app or similar ones that helps scaffold stackpress applications. It should support different project types like full-stack, API only etc. It should also support multiple database types like primarily cockroachdb, postgres, mysql, sqlite, pglite.
>
> It should be built with typescript with minimal dependencies as much as possible. It should be cross-platform as well using nodejs.
>
> The documentation site for stackpress is https://www.stackpress.io/

Follow-up research request:

> Can we do research on similar applications and how we can improve the overall experience?

## Scope

This spec covers the product and experience design of `create-stackpress`:

- competitive research on representative project scaffolders;
- cross-cutting CLI UX patterns worth adopting or avoiding;
- database-selection and preset design for Stackpress projects;
- a prioritized set of recommendations to guide implementation.

## Non-Goals

- Implementing the CLI in this spec pass.
- Freezing the final project-type taxonomy without user confirmation.
- Selecting template internals or file layout without further design.
- Replacing or modifying the existing Stackpress `create` command.
- Publishing to npm or choosing a release schedule.

## Design Outputs

- [Template Architecture](architecture.md): fragment composition, merge rules, generation pipeline, database mapping, remote templates, dependencies, and testing.
- [CLI Contract](cli-contract.md): flags, defaults, interaction modes, output, exit codes, install/git behavior, and examples.
- [User Journeys](journeys.md): actor/state coverage, feature matrix, Use Cases, scenarios, and journey-audit clarifications.

## Context

- [Project brief](../../context/project-brief.md): accepted goals and constraints. Load before changing scope.
- [Stackpress platform](../../context/stackpress-platform.md): framework, template, existing create command, and database adapter facts. Load before designing generated output.
- [Initial project prompt](../../resources/00001-initial-project-prompt.md): verbatim original request.

## Source Material

- Stackpress documentation and repository (accessed 2026-10-29).
- Official documentation and repositories for Create React App, Create Vite, Create Next App, Create T3 App, Create Astro, Create Remix, Create Redwood App, Create Expo App, and Prisma CLI (accessed 2026-10-29).
- npm registry check: `create-stackpress` returned 404 on 2026-10-29, so the unscoped package name is currently unclaimed.

## Success Signal

A developer can choose a Stackpress project type and database, understand the generated result before it is written, scaffold successfully on Windows/macOS/Linux, and follow exact next steps to a running app without reading framework internals.
