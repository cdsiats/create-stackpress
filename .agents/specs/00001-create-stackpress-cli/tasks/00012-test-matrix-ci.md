# 00012: Test Matrix and CI

- **Task ID:** T-012
- **Task control:** 00012
- **Status:** verified
- **Depends on:** T-001 through T-011

## Task Summary

Complete the unit, snapshot, integration, and smoke suites and add a cross-platform CI matrix for Windows, macOS, and Linux on Node.js 22 and 24.

## Implementation Steps

1. Consolidate unit, snapshot, integration, and smoke suites under `tests/`.
2. Add the 20-combination snapshot matrix and generated-tree assertions.
3. Add smoke coverage for full-stack/PGlite, API-only/Postgres content, dry-run, overwrite, and cancellation.
4. Add GitHub Actions for Windows, macOS, and Linux with Node.js 22 and 24.
5. Add a package-pack smoke test that installs the packed tarball.
6. Document how to run the matrix locally.

## Verification Process

- `npm test`
- CI matrix green.
- `npm pack --dry-run` and packed-tarball smoke.

## Acceptance Criteria

None. Test and CI results are validation; no human-reviewable visual artifact is produced by this task.

## Implementation Notes

- Added `.github/workflows/ci.yml` with a Windows/macOS/Linux x Node.js 22/24 matrix, `contents: read`, npm cache, and checkout, setup-node, `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and packaged-CLI smoke steps. Node 22 enables the heavy smoke on every OS; Node 24 stays light.
- Added `tests/smoke/create.test.ts`: dry-run writes nothing, overwrite preserves unrelated files, prompt cancellation leaves no target, and a simulated SIGINT during staging removes staging and leaves no target.
- Added `tests/smoke/cli-package.test.ts`: built CLI `--version`/`--help`; full-stack/PGlite and API-only/PostgreSQL generation with pinned versions, capabilities, env, and connection assertions; package `npm pack --dry-run --json` file-list assertions; opt-in packed-tarball install/run/generation and generated full-stack/PGlite install/build.
- Added `tests/smoke/helpers.ts` for temp roots, CLI/npm process helpers, build-on-demand, JSON/file helpers, and cleanup.
- Extended `scripts/test.mjs` with explicit `unit`, `snapshot`, `integration`, and `smoke` suite selection while keeping no-argument discovery unchanged. Added `test:unit`, `test:snapshot`, `test:integration`, and `test:smoke` scripts.
- Added `TESTING.md` with suite commands, network-free default smoke, `CREATE_STACKPRESS_SMOKE=1` heavy opt-in, packaging checks, CI matrix, and Windows symlink limitations.
- Default `npm test` remains network-free; registry installs are gated behind `CREATE_STACKPRESS_SMOKE=1`. No `src/` or `templates/` files were changed.

## Verification Notes

- `npm run typecheck` passed (Windows, Node.js 22.15.1, npm 10.9.2).
- `npm test` passed: 182 tests, 178 passed, 4 skipped (live template, one symlink case, two heavy opt-ins).
- `npm run build` passed.
- `npm pack --dry-run --json` passed: 154 entries (104 `dist/`, 48 `templates/`), includes `README.md` and `package.json`, with no `tests/`, `src/`, `scripts/`, `.github/`, or `.agents/` leakage.
- `node --import tsx --test tests/smoke/*.test.ts` passed: 10 tests, 8 passed, 2 skipped (heavy opt-in).
- `CREATE_STACKPRESS_SMOKE=1 node --import tsx --test tests/smoke/cli-package.test.ts` passed: 6 tests, including packed-tarball install, `--version`/`--help`, packed minimal generation, and full-stack/PGlite install/build (about 156 seconds for the build case).
- Suite commands passed: `npm run test:unit` (104 tests, 103 passed, 1 skipped), `npm run test:snapshot` (14 passed), `npm run test:integration` (53 tests, 52 passed, 1 skipped), `npm run test:smoke` (10 tests, 8 passed, 2 skipped).
- `.github/workflows/ci.yml` parsed successfully with a YAML parser; the GitHub Actions matrix itself was not executed locally.
- Verification was repeated after the concurrent T-007A config-alignment template and test updates landed; the full suite is green.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
