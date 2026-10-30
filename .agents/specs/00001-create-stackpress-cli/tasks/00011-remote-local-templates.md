# 00011: Remote and Local Templates

- **Task ID:** T-011
- **Task control:** 00011
- **Status:** accepted
- **Depends on:** T-009

## Task Summary

Add local-directory and GitHub template support, optional `create-stackpress.json` compatibility, static-template behavior, and archive security limits.

## Implementation Steps

1. Resolve local template directories without symlink or traversal escapes.
2. Fetch GitHub sources with optional `#ref` and extract with `tar` into a temporary directory.
3. Validate optional `create-stackpress.json` and declared type/database support.
4. Implement static-template behavior: copy as-is, reject `--type`/`--db`, no generated AGENTS/README metadata.
5. Enforce archive size, file-count, path, and symlink limits; never execute template scripts.
6. Add fixture templates, traversal/symlink/oversize tests, mocked fetch tests, and one optional live smoke.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/unit/templates.test.ts tests/integration/remote-template.test.ts`
- Local fixture dry-run and creation.

## Acceptance Criteria

The user reviews terminal output from creating or dry-running a local template and from a static-template run, confirming compatibility and static-copy behavior match the Frozen contract.

## Implementation Notes

- Added a standalone template source layer:
  - `src/template/source.ts`: source parsing (`parseTemplateSource`), local root resolution, `create-stackpress.json` schema validation, compatibility checks, static/manifest resolution, and `assertStaticTemplatePlan`.
  - `src/template/remote.ts`: GitHub codeload tarball URL construction, mocked-fetch-friendly download/extraction, temporary workspace allocation, and idempotent cleanup.
  - `src/template/archive.ts`: streaming download limit, tar inspection/extraction, compressed/extracted/file/entry limits, path validation, and symlink/hard-link/device rejection.
- Public API: `prepareTemplateSource(plan, options?)`, `loadTemplateManifest(root)`, `assertTemplateCompatibility(plan, manifest)`, `resolveTemplateProject(prepared, plan)`, `assertStaticTemplatePlan(plan, explicitType, explicitDatabase)`, plus `parseTemplateSource`, `validateTemplateManifest`, `templateSupportsType`, `templateSupportsDatabase`, `walkTemplateTree`, `inspectArchive`, `extractArchive`, and `downloadToFile`.
- `create-stackpress.json` schema: `schemaVersion: 1`, optional `name`, `version`, `types`, `databases`, `files`, `assets`, `package`, `env`, and `capabilities`; unknown fields and unsafe/reserved paths are errors. Omitted `types`/`databases` mean all values are supported; declared `capabilities` must include the selected type's required set.
- Manifest templates render allowlisted tokens in declared text files, copy assets byte-for-byte, merge `package.json` package fields with manifest package data through the existing package helpers, merge env with `.env.sample`, rename `gitignore` to `.gitignore`, and omit `AGENTS.md` when `--no-agents-md` is set.
- Static templates copy regular files byte-for-byte (stored as binary `Uint8Array` so literal `{{...}}` survives), exclude `.git`, `node_modules`, and `.DS_Store`, parse and exclude root `package.json`, override package identity (`name`, `private`, `type`, `engines.node`), and never generate README/AGENTS metadata. `--no-agents-md` has no effect on static templates.
- Security: local roots and entries reject symlinks, hard links, special files, absolute paths, `..` traversal, backslashes, drive letters, and control characters. Remote archives enforce 10 MiB compressed, 100 MiB extracted, 1000 files, and 5000 entries by default; template scripts are never executed. Remote workspaces are removed on every failure and via the returned cleanup callback.
- Added fixtures under `tests/fixtures/templates/` (`static-basic`, `static-no-package`, `manifest-basic`) and focused tests in `tests/unit/templates.test.ts` and `tests/integration/remote-template.test.ts`, including mocked fetch, tar extraction, traversal/absolute/duplicate/hard-link rejection, oversize/file-count rejection, temp cleanup, and an opt-in live GitHub smoke test.

## Verification Notes

- `npx tsc -p tsconfig.json --noEmit` — passed.
- `node --import tsx --test tests/unit/templates.test.ts tests/integration/remote-template.test.ts` — passed: 31 tests passed, 1 skipped (opt-in live GitHub smoke test).
- Symlink-specific checks were skipped on this Windows host because `symlink` returned `EPERM`; the code paths are covered conditionally and hard-link checks ran successfully.
- Orchestrator wiring on 2026-10-30: preflight now prepares templates once, validates manifest compatibility or static `--type`/`--db` provenance, the workflow resolves templates and always cleans up remote workspaces, and the CLI passes explicit-flag provenance. `--db-url` with `--template` is rejected with a usage error.
- Orchestrator verification: full suite passed 170 tests with 2 skips; CLI static-template run exited 0, manifest-template run exited 0, and a static template with explicit `--type` exited 2 without creating the target. Artifacts: `static-template-app` and `manifest-template-app` under `C:\Users\Lenovo Idea Pad\AppData\Local\Temp\opencode\create-stackpress-acceptance\`.
- Static templates preserve file bytes but normalize the root `package.json` identity (`name`, `private`, `type`, `engines.node`) so the writer and validator can process them. If strict byte-for-byte `package.json` copying is required, revisit in T-013.

## Acceptance Notes

- Accepted by the user on 2026-10-30 after reviewing the static and manifest template terminal runs.
