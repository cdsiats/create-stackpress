# 00010: Package Manager and Git Execution

- **Task ID:** T-010
- **Task control:** 00010
- **Status:** open
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

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Pending user review.
