# CLI Contract

## Status

Design v1 for `00001-create-stackpress-cli`. **Frozen on 2026-10-29.** Derived from the accepted decisions and [Proofs](proofs.md).

## Invocation

- Primary: `npx @cdsiats/create-stackpress [directory]`
- npm initializer form: `npm create @cdsiats/stackpress@latest [directory]` (verify npm's scoped initializer mapping before publishing)
- Global install: `create-stackpress [directory]`

The package is `@cdsiats/create-stackpress`; the executable is `create-stackpress`.

## Usage

```text
create-stackpress [directory] [options]

Options:
  --type <type>          full-stack | api-only | minimal | admin-only
  --db <database>        pglite | postgres | cockroachdb | mysql | sqlite
  --pm <manager>         npm | pnpm | yarn | bun
  --install              install dependencies after scaffolding
  --no-install           skip dependency installation
  --git                  initialize a git repository
  --no-git               skip git initialization
  --template <source>    local path, owner/repo, or GitHub URL
  --db-url <url>         write the database URL to .env
  --overwrite            allow writing into a non-empty target
  --dry-run              print the plan and file set without writing
  --yes, -y              accept defaults; requires a directory
  --no-input             force non-interactive mode
  --no-color             disable ANSI color
  --no-agents-md         omit AGENTS.md
  --help, -h             show help
  --version, -v          show CLI and template versions
```

`--json` is a deferred, provisional output mode; it is not part of the v1 freeze.

## Flag Rules

| Flag | Aliases | Validation |
| --- | --- | --- |
| `--type` | `fullstack`, `api`, `blank`, `admin` | Normalize to the four preset IDs. |
| `--db` | `pg`, `postgresql`, `cockroach`, `crdb` | Normalize to the five database IDs. |
| `--pm` | none | Must be npm, pnpm, yarn, or bun. Overrides detection. |
| `--install` / `--no-install` | none | Mutually exclusive. |
| `--git` / `--no-git` | none | Mutually exclusive. |
| `--template` | none | Local path, `owner/repo`, or GitHub URL with optional `#ref`. |
| `--db-url` | none | Accepted for database-backed presets; written to `.env`, never logged. |
| `--overwrite` | none | Required when the target is non-empty. |

Unknown flags, invalid values, and conflicting flags exit with code 2 before any write. A `.` directory targets the current directory; the package name is derived from the resolved directory name. Non-empty current directories require `--overwrite`.

## Defaults

| Choice | Interactive | `--yes` | Non-interactive without `--yes` |
| --- | --- | --- | --- |
| Type | Full-stack | Full-stack | Full-stack |
| Database | PGlite | PGlite | PGlite |
| Package manager | Detected, then npm fallback | Detected, then npm fallback | Detected, then npm fallback |
| Install | Yes | Yes | No |
| Git | Yes | Yes | No |
| AGENTS.md | Yes | Yes | Yes |
| Template | Core preset | Core preset | Core preset |

A directory is always required in `--yes` and non-interactive modes. It may be omitted only when an interactive prompt can ask for it.

## Interaction Mode

Interactive mode requires all of the following:

- `stdin` and `stdout` are TTYs;
- `CI` is not set;
- `--yes` and `--no-input` are not passed;
- no known agent environment is detected.

Known agent environments are treated as non-interactive; the CLI prints the complete one-shot command instead of prompting. The exact detection list is implementation-defined and must not change the flag contract.

If a required value is missing in non-interactive mode, the CLI exits with code 2 and names the flag that would supply it. It never waits on stdin.

## Interactive Flow

1. Target directory, if omitted.
2. Project type, default full-stack.
3. Database, default PGlite.
4. Package manager, default detected.
5. Install dependencies, default yes.
6. Initialize git, default yes.
7. Review the plan and confirm.

`--template` skips type and database questions when the template is a static copy. A template with `create-stackpress.json` may declare supported types and databases; only supported choices are offered. Declining the final confirmation cancels with exit 0 and no writes. Ctrl+C cancels with exit 130 and no writes.

## Plan Review

Before writing, show:

- target path and package name;
- project type and capability set;
- database, adapter, and pinned driver;
- package manager and detected source;
- install and git choices;
- template source and version;
- file count and any overwrite/backup notice.

The plan is the same in interactive confirmation and `--dry-run`.

## Output

- Human output goes to stdout; errors go to stderr.
- Color is disabled when stdout is not a TTY, `NO_COLOR` is set, or `--no-color` is passed.
- Never print `--db-url` values, tokens, or credentials.
- On success, print the created path, selected preset/database, pinned versions, and exact next steps.
- `--dry-run` prints the plan and file list, writes nothing, and exits 0 when preflight is valid.
- `--json`, if later implemented, must keep stdout machine-readable and send logs to stderr.

## Exit Codes

| Code | Meaning |
| --- | --- |
| 0 | Success, including a valid dry run and a git warning that did not block the scaffold. |
| 1 | Scaffold succeeded but a requested install step failed; the project remains and a retry command is printed. |
| 2 | Usage error, invalid flag, invalid package name, unsupported template, or non-empty target without `--overwrite`. |
| 130 | Interrupted; staging is cleaned up and the target is restored. |

## Error And Recovery Rules

- Preflight failures happen before any filesystem write.
- The target must be missing or a directory. A file or symlink target exits 2. An empty target ignores `.DS_Store`; every other entry makes it non-empty.
- If install is requested and the selected package manager is unavailable, exit 2 with the install command and the `--no-install` alternative. If git is requested and unavailable, warn, skip git, keep the project, and exit 0.
- Remote template fetch or extraction failure exits 2 before any target write.
- Render or validation failures remove the staging directory.
- Commit failures restore backed-up files; unrelated target files are never deleted.
- Install failure keeps the generated project, prints the failed command and retry command, and exits 1.
- Git failure is a warning; the project is kept and the manual commands are printed.
- A generated project is never left half-written in the target.

## Install And Git

- Install uses the selected package manager's install command in the target directory.
- On Windows, package-manager `.cmd` shims run with `shell: true`; POSIX runs with `shell: false`.
- Package-manager arguments are allowlisted; shell metacharacters are rejected.
- Git runs `git init`, `git add .`, and `git commit -m "Initial commit"` with `shell: false`.
- If the target is already inside a git worktree, skip `git init`, print a warning, and do not create a nested repository.
- The CLI does not auto-run `generate`, `push`, or `migrate`.
- `--db-url` writes `.env`; `.env.sample` is always generated; `.env` is gitignored.

## Next Steps

| Situation | Printed steps |
| --- | --- |
| Install skipped | `cd <target>`, `<pm> install` |
| Install done | `cd <target>` |
| Full-stack, API-only, or admin-only | `<pm> run generate`, `<pm> run push`, `<pm> run dev` |
| Minimal | `<pm> run dev` |
| Git skipped | `git init`, `git add .`, `git commit -m "Initial commit"` |

Commands are rendered for the selected package manager. PGlite works without a server; CockroachDB, PostgreSQL, MySQL, and SQLite print the expected `DATABASE_URL` and connection prerequisite.

## Template Behavior

- Core presets use the fragment architecture and are the default.
- `--template` accepts a local directory or GitHub source with optional `#ref`.
- A remote template may include `create-stackpress.json`; if present, the CLI validates compatibility and honors declared type/database support.
- A template without a manifest is copied as-is; `--type` and `--db` are rejected because compatibility cannot be verified. No generated `AGENTS.md` or README metadata is added; `--no-agents-md` has no effect.
- Remote template fetch or extraction failure exits 2 before writing.
- Remote templates reject symlinks, path traversal, oversized archives, and executable scripts.
- `--template` does not delegate to `stackpress create`; the two commands coexist.

## Examples

```bash
# Interactive, recommended defaults
npx @cdsiats/create-stackpress my-app

# Fully specified API project
npx @cdsiats/create-stackpress my-app \
  --type api-only \
  --db cockroachdb \
  --pm pnpm \
  --no-install \
  --no-git

# Non-interactive defaults
npx @cdsiats/create-stackpress my-app --yes

# Preview only
npx @cdsiats/create-stackpress my-app --type minimal --db pglite --dry-run

# Remote template
npx @cdsiats/create-stackpress my-app --template owner/repo#main
```
## Deferred

- `--json` output schema.
- Saved preferences and `--reset-preferences`.
- Upgrade command for generated projects.
- Template registry, monorepo scaffolding, release automation, and telemetry policy (telemetry is excluded, not deferred).
