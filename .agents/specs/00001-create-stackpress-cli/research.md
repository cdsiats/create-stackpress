# Research: Scaffolder Landscape and CLI Experience

## Status

Initial research pass complete. Sources were accessed on 2026-10-29. Findings supported the decisions in [Decisions and Gaps](decisions.md); the spec was Frozen on 2026-10-29.

## Method

Reviewed official documentation, repositories, and CLI help for representative project scaffolders, plus database-initialization tools and general CLI UX guidance. Focus: selection model, automation surface, safety behavior, package-manager handling, post-scaffold output, and maintenance posture.

## Tools Reviewed

| Tool | Selection model | Automation surface | Notable experience detail | Lesson for create-stackpress |
| --- | --- | --- | --- | --- |
| Create React App | One fixed React template | `npx create-react-app <name>` | Officially deprecated for new apps on 2025-02-14; repo is in long-term stasis. | A single frozen scaffold ages badly. Version templates with the CLI and provide a migration path. |
| Create Vite | Framework + variant, or `--template` | `--template`, `--interactive` / `--no-interactive`, `--overwrite`, `--immediate`, `--eslint` | Detects TTY; prints a one-shot command when it detects an AI agent; can install and start immediately. | Prompts should be TTY-aware, and every prompt should have a flag equivalent. |
| Create Next App | Recommended defaults or full customization | `--yes`, `--no-*`, `--ts`/`--js`, `--api`, `--use-npm`/`pnpm`/`yarn`/`bun`, `--skip-install`, `--disable-git`, `--example`, `--reset-preferences` | "Recommended defaults" branch, reusable saved preferences, `AGENTS.md` by default, agent feedback option. | Offer a fast default path plus a customization path; persist preferences only when it earns its complexity. |
| Create T3 App | Modular feature selection | `--default`, `--noInstall`, `--noGit`, experimental CI-only flags incl. `--dbProvider` | Feature choices are optional modules; DB provider default is SQLite; CI flags are explicitly gated behind `--CI`. | Keep presets composable; make CI flags a stable contract, not a hidden side channel. |
| Create Astro | Official or community template | `--template` (name or GitHub repo), `--install`/`--no-install`, `--git`/`--no-git`, `--add`, `--yes`/`--no`, `--dry-run`, `--no-ai` | Empty-directory requirement; dry-run; integration add-ons; template can be any GitHub repo. | `--dry-run` and `--no-ai` are cheap trust builders. Separate template choice from extras. |
| Create Remix | Template from repo, URL, local path, or tarball | `--template`, `--overwrite`, `--token` | Collision detection with a confirmation prompt; supports private templates via token. | Template flexibility is useful, but collision handling must be explicit. |
| Create Redwood App | TS/JS plus install/git choices | `--typescript`, `--yarn-install`, `--overwrite`, `--git-init`, `--commit-message`, `--yes`, `--no-telemetry` | Prompts for language, git, and install; telemetry is disclosed and can be disabled. | Expose install, git, and telemetry as first-class choices. |
| Create Expo App | Template or example | `--yes`, `--no-install`, `--template`, `--example`, `--no-agents-md` | Generates `AGENTS.md` and agent settings; package manager is inferred from invocation. | Agent guidance is becoming a normal scaffold artifact, not an add-on. |
| Prisma CLI `init` | Datasource provider | `--datasource-provider` (incl. `cockroachdb`), `--db`, `--url`, non-interactive mode | Provider choice is a flag; newer init is idempotent and never prompts; local database default lowers setup friction. | Database choice belongs in the CLI contract and generated config, not only in docs. |
| Stackpress `create` | One bundled full-stack template | `stackpress create [--dry-run]` | Requires an empty directory, validates package name, renames `gitignore`, rewrites package name, prints install/generate/push/dev steps. | This is the baseline. The new CLI must add type/database choice, not duplicate the same single-template copy. |

## Cross-Cutting UX Patterns

1. **Interactive by default, fully automatable.** The strongest tools ask when a TTY is present and accept flags for every answer. In CI or a pipe, they fail with an actionable message naming the missing flag instead of hanging.
2. **Recommended defaults plus a customization branch.** Next's "use recommended defaults / customize" is a strong pattern. It keeps the first run fast without hiding choices.
3. **Package-manager awareness.** Tools detect the invoking package manager from `npm_config_user_agent`, then use lockfiles or `package.json#packageManager` as fallback. Explicit overrides (`--use-pnpm`, `--pm`) prevent wrong commands.
4. **Install and git are separate decisions.** Astro, Next, Redwood, and T3 all expose them independently. Bundling either action silently makes the scaffold less predictable.
5. **Template flexibility with a reliable default.** Astro and Remix allow GitHub/local templates; Next and Expo allow examples. A bundled core remains important for offline and deterministic behavior.
6. **Safety rails.** Empty-directory checks, `--overwrite`, collision confirmation, `--dry-run`, staged writes, and rollback all appear in mature tools or CLI guidance. Generation should be atomic from the user's perspective.
7. **Exact next steps.** Good scaffolders print the commands for the chosen package manager, not generic instructions. Some offer immediate install/start.
8. **Agent readiness.** Create Vite detects agents and prints a one-shot command; Next, Expo, and Remix generate agent guidance or skills. Non-interactive flags and `AGENTS.md` are now part of the experience.
9. **Maintenance discipline.** CRA's deprecation shows that a scaffold is a product with a lifecycle. Templates need version pinning, compatibility checks, and an upgrade story.
10. **Telemetry transparency.** Redwood exposes `--no-telemetry`; CRA's historical telemetry was a trust topic. Default-off or explicit opt-in is the safer posture.

## What Commonly Goes Wrong

- Prompt loops or silent defaults when stdin is not a TTY.
- Installing dependencies without asking, or assuming npm in the final instructions.
- Writing into a non-empty directory without a clear overwrite decision.
- Coupling project type and database into a large, untested matrix of full templates.
- Letting template versions drift from the CLI's supported Stackpress version.
- Running database-affecting commands (`push`, `migrate`) as part of scaffolding.
- Treating generated projects as finished products instead of starting points with clear next steps.

## Database-Scaffolding Patterns

- Provider choice is usually a flag: Prisma's `--datasource-provider` includes `cockroachdb`; T3's `--dbProvider` includes mysql, postgres, planetscale, and sqlite.
- Local-first defaults reduce friction: T3 defaults to SQLite; Prisma defaults to local Prisma Postgres in newer docs; the Stackpress website template defaults to PGlite.
- Database choice changes dependencies, connection code, environment samples, and migration commands. It should not change every application file.
- Credentials are separate from provider choice. Scaffolding should work without a live database; connection values belong in `.env`.
- CockroachDB is PostgreSQL-compatible and uses the PostgreSQL adapter/driver in the Stackpress ecosystem.

## Recommendations for create-stackpress

### P0: Make the first run trustworthy

1. **Use a preset model.** Compose `project type x database` instead of maintaining a full template for every combination. Start with the confirmed types only: full-stack and API-only.
2. **Interactive wizard with recommended defaults.** Ask only the questions that change output: directory, type, database, package manager, install, git. Show a review summary before writing.
3. **Full flag parity.** At minimum: `--type`, `--db`, `--pm`, `--install`/`--no-install`, `--git`/`--no-git`, `--name`, `--yes`, `--dry-run`, `--no-color`, `--no-input`.
4. **TTY/CI/agent detection.** Prompt only when interactive. Otherwise use defaults or fail with the exact flag needed. Never hang in CI.
5. **Package-manager detection and correct commands.** Detect invocation first, then lockfile/`packageManager`; support npm, pnpm, yarn, and bun; print commands for the selected manager.
6. **Stage, validate, then commit the scaffold.** Generate into a temporary directory, validate required files and package JSON, then move into place. Roll back on failure. Require `--overwrite` for non-empty targets.
7. **Database-aware generation.** Map each database to its Inquire adapter and driver; generate the correct store connection file and `.env.sample`; never auto-run `push` or `migrate`.
8. **Post-scaffold path.** Install dependencies only when chosen; run `generate` only when chosen; print exact `generate`, `push`, and `dev` steps. Do not start the dev server automatically unless explicitly requested.
9. **README and AGENTS.md.** Generated README records the preset, database, environment variables, and commands. Generated `AGENTS.md` tells coding agents the same facts.
10. **Version transparency.** Print CLI version and pinned Stackpress/template version. Check compatibility before generation and fail with a clear message.
11. **Cross-platform execution.** Use Node path APIs, avoid shell-specific syntax, resolve package-manager executables with the Windows `.cmd` shim, and test Windows, macOS, and Linux.
12. **Dependency posture.** Use Node built-ins for argument parsing, filesystem work, process spawning, and testing. Add one small prompt library only if it earns its complexity; avoid a heavy CLI framework stack that conflicts with the minimal-dependency goal.

### P1: Reduce friction for repeat and advanced use

- `--template <github-or-local>` for advanced users, with a bundled core default.
- `--dry-run` plan that lists files and dependency changes without writing.
- `--reset-preferences` and optional saved preferences, if preferences are added.
- `--json` output for CI/agent automation.
- Optional initial git commit message.
- Cached/offline template assets.
- `--verbose` diagnostics and a support-friendly error report.

### P2: Product differentiation

- Optional feature fragments such as auth, admin, API surface, or views, layered on a base preset.
- An upgrade command for generated projects.
- A curated template registry or Stackpress examples integration.
- Monorepo/workspace scaffolding if demand appears.

## Proposed Command Sketch

```bash
# Interactive
npx create-stackpress my-app

# Fully specified
npx create-stackpress my-app \
  --type api \
  --db cockroachdb \
  --pm pnpm \
  --no-install \
  --no-git

# Fast defaults / preview
npx create-stackpress my-app --yes
npx create-stackpress my-app --type full-stack --db pglite --dry-run
```

The default database selection is still **GAP-009**. The sketch shows the shape, not a final default.

## Key Product Insight

Stackpress already has a `create` command that copies one full-stack template. The opportunity is not another template copier; it is a **guided, database-aware, testable preset generator** that makes the first five minutes deterministic and the next step obvious.

## Sources

- Create React App sunset announcement: <https://react.dev/blog/2025/02/14/sunsetting-create-react-app>
- Create Vite source and README: <https://github.com/vitejs/vite/tree/main/packages/create-vite>
- Create Next App CLI reference: <https://nextjs.org/docs/app/api-reference/cli/create-next-app>
- Create T3 App installation and CLI: <https://create.t3.gg/en/installation>
- Create Astro README: <https://github.com/withastro/astro/tree/main/packages/create-astro>
- Create Remix CLI: <https://remix.run/docs/en/main/other-api/create-remix>
- Create Redwood App: <https://docs.redwoodjs.com/docs/create-redwood-app>
- Create Expo App: <https://docs.expo.dev/more/create-expo/>
- Prisma CLI init: <https://www.prisma.io/docs/cli/init>
- Stackpress repository and CLI: <https://github.com/stackpress/stackpress>
- Stackpress documentation: <https://www.stackpress.io/>
- Package manager detection reference: <https://www.npmjs.com/package/package-manager-detector>
- CLI guidance on non-interactive behavior: <https://discourse.ubuntu.com/t/interactive-prompts/18881>
