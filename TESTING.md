# Testing

## Prerequisites

- Node.js 22 or newer (CI covers 22 and 24).
- npm, using the committed `package-lock.json`.
- Git is optional; the real git tests skip when it is unavailable.

```bash
npm ci
npm run typecheck
npm test
npm run build
node dist/cli.js --version
```

`npm test` runs every `tests/**/*.test.ts` file, including `tests/version.test.ts`. It does not download project dependencies unless an opt-in smoke test is enabled.

## Test suites

| Suite | Location | Command | Purpose |
| --- | --- | --- | --- |
| Unit | `tests/unit/` | `npm run test:unit` | Flag parsing, aliases, package names, manifest and merge validation, path safety, command mapping, interaction rules. |
| Snapshot | `tests/snapshot/` | `npm run test:snapshot` | The twenty project-type/database combinations, fragment pins, and deterministic generated output. |
| Integration | `tests/integration/` | `npm run test:integration` | `runCreate` and `writeProject` with temp directories, injected install/git hooks, rollback, overwrite, remote/local templates, and the real writer. |
| Smoke | `tests/smoke/` | `npm run test:smoke` | Built CLI and package behavior, plus the required create scenarios. Default smoke is network-free. |

Run more than one suite by naming them:

```bash
node scripts/test.mjs unit snapshot
```

Run one file directly:

```bash
node --import tsx --test tests/smoke/create.test.ts
```

## Smoke tiers

### Default smoke (network-free, part of `npm test`)

- Builds `dist/` on demand with `npm run build` so the real CLI entrypoint is tested.
- Runs `create-stackpress --version` and `--help`.
- Generates full-stack/PGlite and API-only/PostgreSQL projects with the built CLI into temp directories and inspects the generated content.
- Covers `--dry-run` writing nothing, `--overwrite` preserving unrelated files, and cancellation/interrupt leaving no target.
- Runs `npm pack --dry-run --json` and asserts the publishable file list contains `dist/`, `templates/`, `README.md`, and `package.json`, with no `src/`, `tests/`, or `.agents/` leakage.

No dependency installation or registry access happens in this tier. Temporary directories are removed automatically.

### Heavy opt-in smoke (`CREATE_STACKPRESS_SMOKE=1`)

These tests install packages from the registry and can take several minutes:

- Packs the tarball, installs it into a temp directory, checks the `create-stackpress` bin shim, runs `--version` and `--help`, and generates a minimal project with the installed copy.
- Generates a full-stack/PGlite project and runs `npm install` followed by `npm run build` inside it.

PowerShell:

```powershell
$env:CREATE_STACKPRESS_SMOKE = '1'
npm run test:smoke
Remove-Item Env:CREATE_STACKPRESS_SMOKE
```

POSIX shell:

```bash
CREATE_STACKPRESS_SMOKE=1 npm run test:smoke
```

If the env var is absent, the heavy tests skip with a message that names the variable. Packed installation failures report the npm exit code plus captured stdout/stderr. CI sets `CREATE_STACKPRESS_SMOKE=1` for the Node 22 job on every OS, so at least one real packed install and one generated-project install/build run on Windows, macOS, and Linux.

The existing remote-template tests include a separate `CREATE_STACKPRESS_LIVE_TEMPLATE=1` opt-in for a live GitHub fetch. It is not part of `npm test`.

## Packaging checks

```bash
npm run build
npm pack --dry-run --json
```

The package `files` allowlist is `dist`, `templates`, and `README.md`; npm always adds `package.json`. Inspect the `files` array in the JSON output if the published artifact looks wrong. `tests/smoke/cli-package.test.ts` also fails if any fragment manifest disappears from `templates/`.

## CI matrix

`.github/workflows/ci.yml` runs Windows, macOS, and Linux with Node.js 22 and 24. Each job uses a read-only token, npm cache, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and the packaged-CLI smoke. Node 22 additionally enables the heavy smoke.

## Windows notes

- Creating symlinks is often blocked by Windows security policy. Symlink tests skip with an `EPERM`/`EACCES` message unless Developer Mode is enabled or the process is elevated. Test output that says symlinks are unavailable is expected, not a failure.
- Package-manager `.cmd` shims require `shell: true`; production install code handles that. Smoke tests spawn npm's JavaScript entrypoint with `node` instead, which avoids quoting problems when temp paths contain spaces.
- Use the PowerShell env-var syntax above to enable heavy smoke; `SET VAR=1` also works in `cmd.exe`.

## Troubleshooting

- **`dist/cli.js` is missing**: run `npm run build`; the smoke suite also builds it automatically.
- **`npm pack` lists no `dist` files**: build before inspecting the tarball.
- **Heavy smoke fails during install**: confirm registry access and npm auth, then rerun with `CREATE_STACKPRESS_SMOKE=1`. The failing command's stdout/stderr is included in the test error.
- **`npm test` and `npm run build` at the same time**: both write `dist/`; run them sequentially, as CI does.
- **Stale temp directories after a hard interrupt**: they live under the OS temp directory with `create-stackpress-` prefixes and are safe to delete.
