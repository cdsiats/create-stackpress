# create-stackpress

`@cdsiats/create-stackpress` is a TypeScript CLI for starting new Stackpress applications. It scaffolds a config-driven project from a project type and database, then optionally installs dependencies and initializes git.

It is for developers who want a repeatable Stackpress starting point, teams that want scripted or CI-safe scaffolding, and agents that need a complete one-shot command instead of an interactive prompt. The generated project uses the real Stackpress configuration architecture and the built-in `"stackpress"` plugin.

## Requirements

- Node.js 22 or newer.
- npm, pnpm, yarn, or bun when dependency installation is requested.
- Git is optional. If git is unavailable or initialization fails, the project is kept and the manual commands are printed.
- A running PostgreSQL, CockroachDB, or MySQL server when using those databases. PGlite runs locally; SQLite uses a local file.

## Install and run

Run without installing globally:

```bash
npx @cdsiats/create-stackpress my-app
```

Or install the CLI globally:

```bash
npm install -g @cdsiats/create-stackpress
create-stackpress my-app
```

The package is `@cdsiats/create-stackpress` and the executable is `create-stackpress`. Use `--help` or `--version` for the current CLI, template, and Stackpress versions.

## Usage

```text
create-stackpress [directory] [options]
```

A directory is always required with `--yes` or in non-interactive mode. It may be omitted only when an interactive prompt can ask for it. A `.` target uses the current directory. The npm package name is derived from the resolved target directory name and is rendered into `config/common.ts` for the brand name, client package, and CLI label.

### Flags and defaults

| Flag | Aliases or values | Default | Behavior |
| --- | --- | --- | --- |
| `--type <type>` | Values: `full-stack`, `api-only`, `minimal`, `admin-only`; aliases: `fullstack`, `api`, `blank`, `admin` | `full-stack` | Selects the project preset. |
| `--db <database>` | Values: `pglite`, `postgres`, `cockroachdb`, `mysql`, `sqlite`; aliases: `pg`, `postgresql`, `cockroach`, `crdb` | `pglite` | Selects the database adapter and driver. |
| `--pm <manager>` | `npm`, `pnpm`, `yarn`, `bun` | Detected, then npm fallback | Overrides package-manager detection. |
| `--install` | none | Yes in interactive and `--yes` modes; no otherwise | Installs dependencies after scaffolding. |
| `--no-install` | none | Off | Skips dependency installation. Mutually exclusive with `--install`. |
| `--git` | none | Yes in interactive and `--yes` modes; no otherwise | Runs `git init`, `git add .`, and `git commit -m "Initial commit"`. |
| `--no-git` | none | Off | Skips git initialization. Mutually exclusive with `--git`. |
| `--template <source>` | Local directory, `owner/repo`, `github:owner/repo`, or GitHub URL, with optional `#ref` | Core preset | Uses a custom template instead of the bundled presets. |
| `--db-url <url>` | none | none | Writes `DATABASE_URL` to `.env`. The value is never logged. Rejected with `--template`. |
| `--overwrite` | none | Off | Allows a non-empty target. Conflicting files are backed up before replacement. |
| `--dry-run` | none | Off | Prints the plan and file list without writing anything. |
| `--yes` | `-y` | Off | Accepts defaults without prompting. Requires a directory. |
| `--no-input` | none | Off | Forces non-interactive mode. Requires a directory. |
| `--no-color` | none | Off | Disables ANSI color. Color is also disabled when stdout is not a TTY or `NO_COLOR` is set. |
| `--no-agents-md` | none | Off | Omits `AGENTS.md` for core presets and manifest templates. Static templates ignore it. |
| `--help` | `-h` | Off | Shows help. |
| `--version` | `-v` | Off | Shows CLI, template, and Stackpress versions. |

Unknown flags, invalid values, and conflicting flags exit with code 2 before any write. A target that is a file or symlink also exits with code 2.

### Interaction modes

The CLI prompts only when stdin and stdout are TTYs, `CI` is not set, no known agent environment is detected, and neither `--yes` nor `--no-input` is passed. Otherwise it runs as a one-shot command and never waits on stdin.

In interactive mode the prompts are directory, project type, database, package manager, install, git, and final confirmation. Declining the final confirmation exits 0 without writes. Ctrl+C exits 130 and cleans up staging.

## Project types

| Preset | Capabilities | Included surfaces |
| --- | --- | --- |
| `full-stack` | `views`, `admin`, `api`, `auth`, `content`, `database` | Public views and pages, admin, API, auth, database, and content. |
| `api-only` | `api`, `auth`, `database` | API, auth, and database. No public views, admin, or content. |
| `minimal` | `database` | Base server plugin and database only. No public views, admin, API surface, auth, or content. |
| `admin-only` | `admin`, `auth`, `database` | Admin, auth, and database. No public views, content, or API surface. |

The CLI tracks the accepted capability set internally. The preset-specific `admin`, `api`, `auth`, and `views` conditionals live in `config/common.ts`.

## Databases

| ID | Adapter | Driver | Connection import | Prerequisite |
| --- | --- | --- | --- | --- |
| `pglite` | `@stackpress/inquire-pglite` 0.10.8 | `@electric-sql/pglite` 0.3.15 | `stackpress/pglite` | None. Runs from a local data directory. |
| `postgres` | `@stackpress/inquire-pg` 0.10.8 | `pg` 8.16.3 | `stackpress/pgsql` | PostgreSQL must be reachable. |
| `cockroachdb` | `@stackpress/inquire-pg` 0.10.8 | `pg` 8.16.3 | `stackpress/pgsql` | CockroachDB must be reachable. |
| `mysql` | `@stackpress/inquire-mysql2` 0.10.8 | `mysql2` 3.15.3 | `stackpress/mysql` | MySQL must be reachable. |
| `sqlite` | `@stackpress/inquire-sqlite3` 0.10.8 | `better-sqlite3` 12.4.1 | `stackpress/sqlite` | The target directory must be writable. |

PGlite is the interactive default and CockroachDB is the production target. The CLI prints the pinned adapter and driver versions. For core presets, `.env.sample` always contains a `DATABASE_URL` placeholder; `--db-url` additionally writes `.env`, which is gitignored. The supplied URL is never printed. No generated command automatically runs `push` or `migrate`.

## Generated project

A generated app contains:

```text
config/
  common.ts
  develop.ts
  build.ts
  client.ts
plugins/
  app/
    plugin.ts
    pages/home.ts
    views/home.tsx
  store/
    plugin.ts
    connect.ts
    populate.ts
scripts/
  stackpress.ts
schema.idea
uno.config.ts
tsconfig.json
.env.sample
.gitignore
AGENTS.md
README.md
package.json
```

`config/common.ts` combines the shared configuration with the selected type features. `config/develop.ts`, `config/build.ts`, and `config/client.ts` bootstrap the Stackpress server for development, production, and client generation. Database settings live in `config/common.ts`; `plugins/store/connect.ts` is database-specific.

For core presets, the generated `package.json` uses the target directory name, sets `private: true`, `type: "module"`, and `engines.node: ">=22"`, and includes the `dev`, `build`, `generate`, and `push` scripts. Its `plugins` list contains `plugins/app/plugin`, `plugins/store/plugin`, and the built-in `"stackpress"` plugin. The built-in plugin loads the admin, API, CSRF, session, SQL, view, schema, language, and server plugins from the config.

For core presets, `AGENTS.md` is included by default and can be omitted with `--no-agents-md`. The application does not wrap or replace the existing `stackpress create` command.

## Templates

`--template` accepts:

- a local directory, for example `--template ./my-template`;
- a GitHub shorthand, for example `--template owner/repo` or `--template github:owner/repo`;
- a GitHub URL, for example `--template https://github.com/owner/repo`;
- a GitHub shorthand or URL with a branch, tag, or commit suffix, for example `--template owner/repo#main`.

A bare two-segment value is treated as GitHub `owner/repo` unless a matching local directory exists. Remote templates are limited to `github.com` and are fetched as archives; fetch and extraction failures exit 2 before any target write. Any `--template` source skips the type and database questions. Manifest templates use the default type and database unless you pass `--type` or `--db`; unsupported choices fail preflight. Static templates reject explicitly supplied `--type` and `--db`.

### Manifest templates

A template may include `create-stackpress.json` at its root:

```json
{
  "schemaVersion": 1,
  "name": "my-template",
  "version": "1.0.0",
  "types": ["full-stack", "api-only"],
  "databases": ["pglite", "postgres"],
  "files": ["README.md", "config/app.ts"],
  "assets": ["public/logo.png"],
  "package": {
    "dependencies": {
      "stackpress": "0.10.8"
    }
  },
  "env": ["PUBLIC_API_URL=http://localhost:3000"],
  "capabilities": ["views", "admin", "api", "auth", "content", "database"]
}
```

`types` and `databases` restrict the choices the template supports; omitting either means every value is supported. `capabilities` must cover the selected preset when present. `files` and `assets` are the only template files copied, with assets copied without token rendering. A root `package.json` contributes dependencies, devDependencies, scripts, and plugins, which are merged with the manifest `package` data. Unknown manifest fields are rejected.

Only declared files are copied for manifest templates. The manifest file itself is not copied, and the CLI renders the generated `package.json`.

### Static templates

A template without `create-stackpress.json` is copied as a static project. `--type` and `--db` are rejected when explicitly supplied because compatibility cannot be verified. No generated README metadata or `AGENTS.md` is added, and `--no-agents-md` has no effect.

Static templates keep their own files, but the root `package.json` identity is normalized: `name` becomes the planned package name, `private` becomes `true`, `type` becomes `"module"`, and `engines.node` becomes `">=22"`. This is a deliberate deviation from a byte-for-byte copy so the generated project passes the same validation as a core preset.

`--db-url` is rejected with every `--template` source. Put environment values in the template's `.env.sample` or `.env` instead.

### Template safety limits

Remote archives are capped at 10 MiB compressed. Both remote archives and local template trees are capped at 100 MiB extracted, 1,000 files, and 5,000 entries. Absolute paths, `..` traversal, symlinks, and hard links are rejected. The CLI never executes scripts from a template.

## Next steps

After scaffolding, the CLI prints the exact commands for the selected package manager:

| Situation | Printed steps |
| --- | --- |
| Install skipped | `cd <target>`, `<pm> install` |
| Install completed | `cd <target>` |
| Full-stack, API-only, or admin-only | `<pm> run generate`, `<pm> run push`, `<pm> run dev` |
| Minimal | `<pm> run dev` |
| Git skipped or failed | `git init`, `git add .`, `git commit -m "Initial commit"` |

Copy `.env.sample` to `.env` before starting the app, unless `--db-url` already created `.env`. The default development server listens on <http://localhost:3000>.

Database prerequisites:

- PGlite uses `./.build/database` and needs no server.
- PostgreSQL expects `postgres://postgres:postgres@localhost:5432/app`.
- CockroachDB expects `postgres://root@localhost:26257/defaultdb?sslmode=disable`.
- MySQL expects `mysql://root:root@localhost:3306/app`.
- SQLite uses `./.build/database.sqlite` and needs a writable target directory.

These are placeholder values from `.env.sample`. Adjust `.env` to match your environment.

## Windows notes

- The generated `scripts/stackpress.ts` launcher resolves the bootstrap path with `pathToFileURL` before importing it. This works around the upstream `stackpress-server` ESM import bug that fails on Windows with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
- npm, pnpm, and yarn `.cmd` shims run with `shell: true` on Windows; bun uses `bun.exe`. POSIX systems run package managers without a shell. All package-manager arguments are allowlisted and shell metacharacters are rejected.
- Git commands always run with `shell: false` so the commit message stays literal.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success, including a valid dry run and a git warning that did not block the scaffold. |
| `1` | Scaffold succeeded but a requested install failed. The project is kept and a retry command is printed. |
| `2` | Usage error, invalid flag, invalid package name, unsupported template, or non-empty target without `--overwrite`. |
| `130` | Interrupted. Staging is cleaned up and the target is restored. |

## Testing

See [TESTING.md](https://github.com/cdsiats/create-stackpress/blob/main/TESTING.md) for prerequisites, suite layout, smoke tiers, and Windows notes.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

`npm test` runs every `tests/**/*.test.ts` file and does not download project dependencies. CI runs Windows, macOS, and Linux on Node.js 22 and 24. The heavy smoke test is opt-in with `CREATE_STACKPRESS_SMOKE=1`; it installs the packed tarball and builds a generated full-stack/PGlite project. CI enables it for the Node.js 22 job on every operating system.

## Troubleshooting

- **`Node.js 22 or newer is required`**: upgrade Node.js and re-run.
- **Target directory is not empty**: choose an empty target or pass `--overwrite`. Conflicting files are backed up; unrelated files are preserved.
- **Invalid npm package name**: the name comes from the target directory. Use a lowercase npm-compatible directory name such as `my-app`.
- **Package manager is not available**: install the selected manager or pass `--no-install`. The CLI exits 2 before writing when an install was requested.
- **Dependency installation failed**: the project was already created and is kept. Run `cd <target>` and `<pm> install` to retry. This exits 1.
- **Git initialization failed**: the project is kept and the manual `git init`, `git add .`, and `git commit` commands are printed. This is a warning, not a scaffold failure.
- **Database connection failed**: confirm the server is running and `DATABASE_URL` in `.env` matches the expected placeholder for the selected database. Copy `.env.sample` to `.env` first.
- **`--db-url` is rejected with `--template`**: add the environment value to the template instead. Template-owned env files make an injected database key ambiguous.
- **`--type` or `--db` is rejected with a template**: the template has no `create-stackpress.json`. Remove the flags or add a manifest that declares supported types and databases.
- **No prompts appear**: stdin/stdout is not a TTY, `CI` is set, a known agent environment is detected, or `--yes`/`--no-input` was passed. Pass the directory and flags explicitly.
- **Windows reports `ERR_UNSUPPORTED_ESM_URL_SCHEME`**: use the generated `scripts/stackpress.ts` launcher rather than importing the upstream `stackpress-server` bin directly.
- **`--dry-run` did not create files**: that is expected. Dry runs print the plan and file list only.

## License

MIT. See [LICENSE](LICENSE). Copyright (c) 2026 CDSIATS.
