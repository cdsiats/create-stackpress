# 00001: Repository and Package Foundation

- **Task ID:** T-001
- **Task control:** 00001
- **Status:** verified
- **Depends on:** none

## Task Summary

Create the TypeScript package foundation for `@cdsiats/create-stackpress`: package manifest, build configuration, CLI entrypoint, test harness, ignore rules, and initial README.

## Implementation Steps

1. Add `package.json` with ESM, Node `>=22`, bin `create-stackpress`, build/typecheck/test scripts, and private publishing state.
2. Add dev dependencies: TypeScript, `@types/node`, and `tsx`.
3. Add `tsconfig.json` compiling `src/` to `dist/`.
4. Add `src/version.ts` and a minimal `src/cli.ts` with a shebang and version output.
5. Add a `node:test` test for the version and CLI smoke behavior.
6. Add root `.gitignore` for dependencies, build output, logs, env files, and OS artifacts.
7. Expand `README.md` with project identity, status, and development commands.

## Verification Process

- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `node dist/cli.js --version`

## Acceptance Criteria

None. This is a repository foundation with no human-reviewable visual output; verification is sufficient.

## Implementation Notes

- Added root `package.json`, `tsconfig.json`, `.gitignore`, `README.md`, `src/version.ts`, and minimal `src/cli.ts`.
- Added `scripts/test.mjs` for cross-platform TypeScript test discovery.
- Added `tests/version.test.ts`.
- Installed 18 packages including the approved runtime dependencies.

## Verification Notes

- `npm run typecheck` passed.
- `npm test` passed: 1 test, 0 failures.
- `npm run build` passed.
- `node dist/cli.js --version` printed `create-stackpress 0.0.0`.

## Acceptance Notes

- Acceptance criteria: none; task finished at `verified`.
