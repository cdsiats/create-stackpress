# 00010: Package Manager and Git Execution

- **Task ID:** T-010
- **Task control:** 00010
- **Status:** accepted
- **Depends on:** T-009

## Task Summary

Implement package-manager detection and command rendering, dependency installation, git initialization, missing-prerequisite behavior, and the Windows `.cmd` execution fallback.

## Implementation Steps

1. Detect the invoking package manager from `npm_config_user_agent`, `packageManager`, and lockfiles.
2. Implement command maps for npm, pnpm, yarn, and bun.
3. Run installs in the generated project with the P-002 Windows `shell:true` fallback and metacharacter rejection.
4. Implement `git init`, `git add .`, and `git commit -m "Initial commit"` with `shell:false`.
5. Handle missing package manager with `--install` (exit 2) and missing git (warn, skip, exit 0).
6. Skip `git init` inside an existing worktree.
7. Add unit tests, fake executables, and real temp-directory install/git tests.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/unit/package-manager.test.ts tests/integration/install-git.test.ts`
- Real `npm install` and `git init` in a temp project on Windows.

## Acceptance Criteria

The user reviews terminal output showing a successful install, a successful git initialization, and the missing-prerequisite behavior, confirming commands and messages match the Frozen contract.

## Implementation Notes

- Added `src/package-manager/commands.ts`: fixed npm/pnpm/yarn/bun maps for install and run-script, Windows executable resolution (`npm.cmd`, `pnpm.cmd`, `yarn.cmd`, `bun.exe`) and POSIX plain names, Windows-only `shell: true`, a positive argument/script allowlist that rejects shell metacharacters, and the exact next-step commands (`<pm> install`, `<pm> run generate|push|dev`). Returned commands expose `manager`, `executable`, `args`, and `display`.
- Added `src/package-manager/install.ts`: exports `installDependencies(context, options?)`. It runs the plan's already-selected package manager in `context.targetDir`, prints the command through `context.output`, uses `shell: true` on Windows and `shell: false` on POSIX, and never prints environment details or child output. Missing executables and nonzero exits throw `CliError.install` with the failed command, exit/ENOENT detail, and a retry hint naming the kept project path and `--no-install`; the generated project is untouched.
- Added `src/git/index.ts`: exports `initializeGit(context, options?)`. It checks `git rev-parse --is-inside-work-tree`; an enclosing worktree skips `git init`, returns `initialized: true`, and warns about nesting. Otherwise it runs `git init`, `git add .`, and `git commit -m "Initial commit"` with `shell: false`. Missing git or any failed step returns `initialized: false` plus a warning and never deletes the project.
- Wired `src/cli.ts` to pass `dependencies: { install: installDependencies, git: initializeGit }` to `runCreate`; all other CLI behavior is unchanged.
- Added `tests/unit/package-manager-commands.test.ts` and `tests/integration/install-git.test.ts`. Integration coverage uses runtime-generated fake executables (Windows `.cmd` and POSIX shell scripts), a real offline npm install in a tiny package, and real isolated git init/add/commit plus existing-worktree, missing-git, and failing-step cases. No files were added under `tests/fixtures/executables/` because the shims are generated per test.

## Verification Notes

- `npx tsc -p tsconfig.json --noEmit` — passed.
- `node --import tsx --test tests/unit/package-manager-commands.test.ts tests/integration/install-git.test.ts` — 17 tests passed, 0 failed, 0 skipped. This includes a real `npm install --ignore-scripts --no-audit --no-fund` in an offline tiny package, real `git init`/`git add`/`git commit` with an isolated identity, the Windows `.cmd` fake-shim path, nonzero install, missing executable, existing-worktree skip, missing git, and a failing git step.
- The full `npm test` suite was not run because T-011 was running concurrently; verification was limited to the focused checks above.
- Orchestrator follow-up on 2026-10-30: full suite passed 170 tests with 2 skips, and a real CLI run (`--type minimal --db pglite --install --git`) installed dependencies, created commit `cc12426`, and exited 0. Artifact: `C:\Users\Lenovo Idea Pad\AppData\Local\Temp\opencode\create-stackpress-acceptance\install-git-app`.

## Acceptance Notes

- Accepted by the user on 2026-10-30 after reviewing the real install/git terminal output and missing-prerequisite behavior.
- Corrected artifact: `C:\Users\Lenovo Idea Pad\AppData\Local\Temp\opencode\create-stackpress-acceptance\install-git-app-v2`; npm install succeeded and git created commit `a645f11` with a clean working tree.
