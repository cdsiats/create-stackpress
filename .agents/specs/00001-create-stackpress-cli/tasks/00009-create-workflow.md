# 00009: Create Workflow and Next Steps

- **Task ID:** T-009
- **Task control:** 00009
- **Status:** accepted
- **Depends on:** T-003 through T-008

## Task Summary

Wire the complete create workflow: preflight, plan, prompts, resolution, staging, validation, commit, install/git hooks, output, dry-run, exit codes, and next steps.

## Implementation Steps

1. Compose the preflight sequence: Node version, package name, target state, template compatibility, prerequisite checks.
2. Connect argument parsing, interaction detection, prompt flow, and plan review.
3. Resolve fragments, stage, validate, and commit through the writer.
4. Add `--dry-run` plan and file list without writes.
5. Add human output, success summary, pinned versions, and next-step commands.
6. Map all errors to the Frozen exit codes and recovery messages.
7. Add integration tests for interactive, non-interactive, dry-run, overwrite, cancellation, and invalid input.
8. Add a full-stack/PGlite creation smoke test.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/integration/create.test.ts`
- Generate one full-stack/PGlite project and one API-only/Postgres project.

## Acceptance Criteria

The user reviews the generated project tree and terminal next-step output for one full-stack/PGlite run and one API-only/Postgres run, confirming the selected presets, files, and commands match the Frozen contract.

## Implementation Notes

- Added `src/create/plan.ts`, `src/create/preflight.ts`, `src/create/documents.ts`, `src/create/next-steps.ts`, and `src/create/workflow.ts`; wired `src/cli.ts` to `runCreate`.
- `runCreate` builds the absolute plan, runs preflight (Node >=22, package name, target state, template rejection, package-manager/git availability), resolves core fragments with the real default template root, validates the resolved project, writes through `writeProject` with a staged-tree validation callback, then runs injectable install/git hooks and prints success output plus exact next steps.
- `--dry-run` prints the full plan and a sorted file list including `package.json` and writes nothing. `--db-url` adds a generated `.env` `DATABASE_URL` line without printing the value. `--no-agents-md` is honored by the resolver. README.md and AGENTS.md npm commands are rewritten for the selected package manager.
- `--template` is rejected with `CliError.usage` until T-011 replaces the hook. Missing install implementation raises `CliError.install` with a `--no-install` hint; missing/unavailable git warns, skips, and keeps exit 0.
- Next steps follow the Frozen table for install/git state and preset, with PGlite noting no server and the other databases printing the expected `.env.sample` DATABASE_URL plus their connection prerequisite. The user-supplied URL is never printed.
- Tests added: `tests/integration/create.test.ts` and `tests/unit/plan.test.ts`.

## Verification Notes

- `npx tsc -p tsconfig.json --noEmit` — passed.
- `node --import tsx --test tests/integration/create.test.ts tests/unit/plan.test.ts` — 18 tests passed, 0 failed.
- Generated acceptance artifacts outside the repo: `C:\Users\Lenovo Idea Pad\AppData\Local\Temp\opencode\create-stackpress-acceptance\full-stack-pglite` (18 files) and `...\api-only-postgres` (13 files); both CLI runs exited 0 with the expected plan, pinned versions, and next steps. No dependencies were installed.
- CLI smoke: `--dry-run` exited 0 and created no target; `--template owner/repo` exited 2 before writing.
- Full suite after adding the workflow: `npm test` passed 118 tests with 1 Windows symlink skip; `npm run typecheck` passed.
- Orchestrator acceptance smoke on `full-stack-pglite`: `npm install` and `npm run build` passed, the server booted, `/health` returned 200, and `/` rendered the full-stack view.
- T-010 still needs to inject the real install and git implementations into `runCreate`; the current build intentionally fails a requested install and warns/skips git initialization.

## Acceptance Notes

- Accepted by the user on 2026-10-30 after reviewing the corrected generated project trees and terminal output.
- Full-stack/PGlite artifact: `C:\Users\Lenovo Idea Pad\AppData\Local\Temp\opencode\create-stackpress-acceptance\full-stack-pglite-v2` (24 files; install, build, generate, push, and boot verified).
- API-only/PostgreSQL artifact: `C:\Users\Lenovo Idea Pad\AppData\Local\Temp\opencode\create-stackpress-acceptance\api-only-postgres-v2` (24 files; build requires a running PostgreSQL server, as the canonical store plugin connects on `config`).
