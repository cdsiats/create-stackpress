# 00005: Template Manifest, Resolver, and Package Merge

- **Task ID:** T-005
- **Task control:** 00005
- **Status:** verified
- **Depends on:** T-002

## Task Summary

Implement manifest validation, base/type/database fragment resolution, file and package merging, token replacement, capability checks, and path safety.

## Implementation Steps

1. Define the fragment manifest schema and runtime validation.
2. Implement deterministic base -> type -> database resolution.
3. Merge files, dependencies, devDependencies, scripts, plugins, env lines, and capabilities.
4. Reject conflicting files, conflicting package versions, unresolved tokens, absolute paths, traversal, and symlinks.
5. Rename `gitignore` to `.gitignore` during rendering.
6. Add unit tests and a 20-combination snapshot matrix using fixture fragments.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/unit/manifest.test.ts tests/unit/resolver.test.ts tests/snapshot/combinations.test.ts`

## Acceptance Criteria

None. Resolver output is machine-readable and validated by snapshots and conflict tests.

## Implementation Notes

- Added `src/template/manifest.ts` with schema-v1 fragment and index validation, canonical capability sets, the type-to-capability matrix, and database adapter/driver metadata (including pins and connection imports) from the architecture Database Matrix.
- Added `src/template/resolve.ts` exporting `resolveProject({ plan, templateRoot? })`. Default root is `<repo>/templates`; it resolves `base -> type -> database` through `templates/manifest.json`, falling back to canonical paths when the index is absent. Fragment manifests may be named `fragment.json` or `manifest.json`.
- Manifest validation rejects unsupported schema versions, non-kebab IDs, unknown kinds/capabilities, unsafe or duplicate paths, overlapping files/assets, duplicate env keys, invalid package names/versions/scripts, and unknown package fields. Template-data failures use `CliError.generation`; invalid plan type/database/package name use `CliError.usage`.
- Files are read in base/type/database order; output paths are unique, identical duplicate contents dedupe with a warning, and different contents are a hard `CliError.generation`. Assets remain binary and are never token-rendered. `gitignore` renders as `.gitignore`. Absolute paths, `..` traversal, drive/UNC paths, symlinks, directory junctions, and root escapes are rejected.
- Package manifests merge dependencies, devDependencies, scripts, and plugins. Different values for the same key fail; plugins dedupe and all package keys sort deterministically. The resolver renders `package.json` from fragment manifest data, not a template `package.json`, and rejects fragments that declare one.
- Capabilities union must equal the type fragment's declared set, which must in turn equal the preset matrix. Environment lines union across fragment manifests and `.env.sample`; conflicting values fail, missing lines are appended in sorted order, and `resolved.env` is sorted. `plan.noAgentsMd` omits `AGENTS.md`.
- Added `src/template/package.ts` (`mergePackageFragments`, `renderPackageJson`) and `src/template/validate.ts` (`renderTokens`, `findUnresolvedTokens`, `assertNoUnresolvedTokens`, `validateResolvedProject`). Only `{{name}}`, `{{type}}`, `{{database}}`, `{{adapter}}`, and `{{driver}}` render; any remaining token fails.
- Added `templates/manifest.json` mapping all ten bundled fragment IDs to `base`, `types/<type>`, and `databases/<db>`. Added unit tests plus a 20-combination snapshot matrix and fixtures under `tests/fixtures/fragments/`.

## Verification Notes

- `npx tsc -p tsconfig.json --noEmit`: passed with no output.
- `node --import tsx --test tests/unit/manifest.test.ts tests/unit/resolve.test.ts tests/unit/package.test.ts tests/snapshot/combinations.test.ts`: 42 tests, 41 passed, 0 failed, 1 skipped (file symlink creation denied with `EPERM` on Windows; directory-junction coverage passed).
- Additional integration check: `node --import tsx --test tests/snapshot/types.test.ts tests/snapshot/databases.test.ts`: 12 tests passed against the concurrently authored T-007/T-008 fragments.
- Manual resolution against the bundled templates confirmed `full-stack`/`pglite` produces the expected 17 files, rendered tokens, merged pins, sorted plugins, and `DATABASE_URL` union in `.env.sample`.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
