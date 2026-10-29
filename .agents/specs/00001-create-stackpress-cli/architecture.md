# Template Architecture

## Status

Design v1 for `00001-create-stackpress-cli`. **Frozen on 2026-10-29.** Derived from the accepted decisions in [Decisions and Gaps](decisions.md) and the results in [Proofs](proofs.md).

## Goals And Constraints

- Generate four project types across five databases without per-combination templates.
- Keep core presets bundled and deterministic; remote templates are optional.
- Prefer Node.js built-ins and a minimal runtime dependency budget.
- Generate safely: staging, validation, rollback, explicit overwrite.
- Coexist with the existing `stackpress create` command.

## Package Layout

```text
src/
  cli.ts                 entrypoint and exit-code handling
  create/                command orchestration
    args.ts              flag parsing and aliases
    plan.ts              resolved plan and preflight checks
    prompts.ts           interactive flow
  template/              fragment loading, merging, rendering
    manifest.ts          manifest types and validation
    resolve.ts           base + type + database resolution
    package.ts           package.json merge and render
    validate.ts          rendered-project validation
    write.ts             staging, commit, backup, rollback
  database/              adapter, driver, and connect-file mapping
  package-manager/       detection, command maps, install execution
  git/                   init, add, commit, failure handling
  output/                human output, dry-run plan, color, next steps
templates/
  manifest.json          bundled fragment index and pinned versions
  base/                  shared project skeleton
  types/                 full-stack, api-only, minimal, admin-only
  databases/             pglite, postgres, cockroachdb, mysql, sqlite
tests/
  unit/                  parsing, validation, merge, security
  snapshot/              generated output per combination
  smoke/                 create, install, build, health check
```

## Composition Model

A generated project is the merge of three fragment layers:

1. **Base**: package skeleton, app plugin, store plugin, tsconfig, README, `AGENTS.md`, `gitignore`, `.env.sample`.
2. **Project type**: capability config, public views, admin, API, auth, type-specific plugins and dependencies.
3. **Database**: store connection, database config, adapter/driver dependencies, environment defaults.

The resolver merges in base, type, database order. A remote template replaces this composition and must declare compatibility if it wants `--type` or `--db` support. Core presets are checked into the CLI package and never fetched at generation time.

## Fragment Manifest

```json
{
  "schemaVersion": 1,
  "id": "database-pglite",
  "kind": "database",
  "requires": ["base"],
  "capabilities": ["database"],
  "files": ["plugins/store/connect.ts", "config/database.ts"],
  "assets": [],
  "package": {
    "dependencies": {
      "@electric-sql/pglite": "0.3.15",
      "@stackpress/inquire-pglite": "0.10.8"
    },
    "devDependencies": {},
    "scripts": {},
    "plugins": ["plugins/store/plugin"]
  },
  "env": ["DATABASE_URL=./.build/database"]
}
```

The manifest is data, not executable code. The CLI validates `schemaVersion`, IDs, relative file paths, known kinds, and package values before rendering.

## File Ownership

| Owner | Owns |
| --- | --- |
| Base | `package.json` fields, `plugins/app/plugin`, `plugins/store/plugin`, `tsconfig.json`, `README.md`, `AGENTS.md`, `gitignore`, `.env.sample` |
| Project type | `config/capabilities.ts`, public views and pages, admin/API/auth plugins, type-specific dependencies and scripts |
| Database | `plugins/store/connect.ts`, `config/database.ts`, adapter/driver dependencies, database env line |
| CLI | `package.json` rendering, package name, generated README metadata, next-step commands |
| Remote template | Its declared file set; cannot silently overwrite core fragments |

## Merge Rules

- **Files**: every path is unique. Two fragments writing different content to the same path is a hard error.
- **Package**: `dependencies`, `devDependencies`, `scripts`, and `plugins` merge. The same key with different values is a hard error; plugin entries are deduplicated.
- **Environment**: `.env.sample` lines are unioned. The same key with different values is an error.
- **Capabilities**: the union must equal the project type's accepted capability set.
- **Assets**: binary files are copied as-is and never token-rendered.
- **Ignore file**: the template stores `gitignore`; the writer renames it to `.gitignore`.
- **Tokens**: only allowlisted tokens such as `{{name}}`, `{{type}}`, `{{database}}`, `{{adapter}}`, and `{{driver}}` are replaced. Unresolved tokens fail validation.
- **Paths**: reject absolute paths, `..` traversal, and symlinks in remote templates.

## Generation Pipeline

1. Parse flags and detect the interaction mode.
2. Resolve the plan: target, type, database, package manager, install, git, template source.
3. Preflight: Node version, package name, target state, template compatibility, package-manager and git availability when requested.
4. Load fragments or the remote template; validate manifests and file sets.
5. Render into a sibling staging directory named `.create-stackpress-<random>`.
6. Validate the rendered project: package JSON, expected files, capabilities, tokens, path safety, and plugin list.
7. Commit the staged project to the target.
8. Run optional install and git steps, then print next steps.

### Staging And Commit

- The target must be missing or a directory. A file, symlink, or other non-directory target is a preflight error.
- An empty target ignores `.DS_Store` when deciding emptiness; every other entry makes the target non-empty.
- The staging directory is created beside the target so the final rename stays on the same filesystem.
- An empty or missing target is removed if empty, then replaced by the staging directory.
- A non-empty target requires `--overwrite`. Conflicting files are backed up before replacement; unrelated files remain; any failure restores the backup.
- For a `.` target, validate in a sibling staging directory, then copy staged files into the current directory with backup and restore. Never rename or remove the current directory itself.
- If the target is already inside a git worktree, skip `git init` and print a warning; do not create a nested repository.
- Interrupt signals remove staging and restore backups. Post-scaffold install or git failures never delete the generated project; the error tells the user how to retry.

## Project Type Presets

| Preset | Includes | Excludes |
| --- | --- | --- |
| `full-stack` | Public views, admin, API, auth, database, content/pages | None of the accepted capabilities |
| `api-only` | API, auth, database | Public views, admin, content/pages |
| `minimal` | Base server plugin and database | Public views, admin, API surface, auth, content/pages |
| `admin-only` | Admin, auth, database | Public views, content/pages |

The generated `config/capabilities.ts` records the accepted set so future code can branch without guessing.

## Database Matrix

| Database | Adapter | Driver | Pinned driver | Connection import |
| --- | --- | --- | --- | --- |
| PGlite | `@stackpress/inquire-pglite` | `@electric-sql/pglite` | `0.3.15` | `stackpress/pglite` |
| PostgreSQL | `@stackpress/inquire-pg` | `pg` | `8.16.3` | `stackpress/pgsql` |
| CockroachDB | `@stackpress/inquire-pg` | `pg` | `8.16.3` | `stackpress/pgsql` |
| MySQL | `@stackpress/inquire-mysql2` | `mysql2` | `3.15.3` | `stackpress/mysql` |
| SQLite | `@stackpress/inquire-sqlite3` | `better-sqlite3` | `12.4.1` | `stackpress/sqlite` |

- PGlite is the interactive default; CockroachDB is the production target.
- Each database fragment generates `plugins/store/connect.ts` with a one-parameter `server.on('config', async (_) => ...)` handler.
- `--db-url` writes `.env` for the selected database; `.env.sample` always contains a placeholder. The URL is never logged.
- No generated command auto-runs `push` or `migrate`.
- Drivers are pinned to adapter peer ranges; the CLI prints the pinned versions.

## Package Manifest Rendering

- `name`: derived from the target directory; validated against npm package-name rules.
- `private: true`, `type: "module"`, `engines.node: ">=22"`.
- `scripts`: base `dev`, `build`, `generate`, `push`; type fragments may add or narrow commands.
- `plugins`: base app and store plugins plus type plugins; deduplicated and sorted.
- Dependencies and devDependencies are sorted for deterministic snapshots.
- README and `AGENTS.md` receive the preset, database, adapter, env variables, and exact package-manager commands.
- The template version and pinned Stackpress version are recorded in the README and printed on success.

## Remote Templates

- Accept a local directory, a GitHub `owner/repo` shorthand, or a GitHub URL. Support an optional `#ref`.
- A remote template may include `create-stackpress.json`. If present, the CLI validates compatibility and may compose its declared files with a type/database fragment.
- Without a manifest, the template is copied as-is; `--type` and `--db` are rejected because compatibility cannot be verified. Generated README metadata and `AGENTS.md` are not added to a static template; `--no-agents-md` has no effect there.
- Remote fetch or extraction failures are preflight errors with no target writes.
- Remote templates are extracted with size and file-count limits, reject symlinks and traversal, and never execute repository scripts.
- Core presets remain the default; remote templates are an advanced escape hatch.

## Dependency Budget

- Runtime: Node.js built-ins plus one prompt library (`@clack/prompts`) and one archive extractor (`tar`) for remote templates.
- No Commander/yargs, ora, chalk, fs-extra, execa, or semver at runtime; use `node:util.parseArgs`, ANSI/no-color handling, `node:fs`, `child_process`, and a small peer-range check.
- Dev: TypeScript, `@types/node`, `tsx`, and `node:test`.
- Build with `tsc` to ESM; ship `dist/`, `templates/`, `README.md`, and the license.

## Testing Strategy

- Unit: flag parsing, aliases, package-name rules, merge conflicts, path safety, peer-range checks, command mapping.
- Snapshot: four project types x five databases, plus every flag combination that changes output.
- Integration: run the CLI in a temp directory; validate `--dry-run`, `--overwrite`, rollback, non-TTY behavior, and next-step text.
- Smoke: install and build selected presets on Windows, macOS, and Linux; run the PGlite health route.
- Security: reject traversal, symlinks, oversized remote templates, unsafe package-manager args, and secrets in logs.
- CI matrix: Node.js 22 and 24; npm, pnpm, yarn, and bun command mapping; at least one real install per OS.

## Deferred

- `--json` output schema, saved preferences, upgrade command, template registry, monorepo scaffolding, and license/release decisions.
