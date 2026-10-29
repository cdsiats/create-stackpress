# Implementation Sprint: create-stackpress CLI

## Status

- **Spec:** `00001-create-stackpress-cli`
- **Spec status:** Frozen 2026-10-29
- **Implementation status:** `proposed`
- **Plan accepted:** No
- **Task files:** Not created until the user accepts this plan.

## Goal

Build the v1 `@cdsiats/create-stackpress` CLI from the Frozen architecture, CLI contract, and user journeys, with proof-backed cross-platform behavior and a maintainable test suite.

## Constraints

- TypeScript, Node.js 22+, ESM, minimal runtime dependencies.
- Core presets bundled; remote templates optional.
- Four project types, five databases, npm/pnpm/yarn/bun.
- Safe staging, validation, overwrite backup, rollback.
- No telemetry; no automatic `push` or `migrate`.
- Changes to Frozen spec files require explicit reopening permission.

## Ordering Rationale

Foundation first, then reusable units, composition, the primary workflow, external integrations, and finally hardening and release readiness. Placeholder fragments and test doubles are introduced early so the workflow can be tested before real template content and package-manager execution are complete. Each layer keeps verification close to the code it validates.

## Proposed Tasks

| ID | Task | Layer | Summary | Depends on | Verification | Acceptance |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | Repository and package foundation | Foundation | Create `package.json`, `tsconfig`, `src/cli.ts`, bin entry, build scripts, `.gitignore`, test harness, and initial README. Keep the package private until release readiness. | None | `npm run typecheck`, `npm run build`, `npm test`, CLI version smoke. | None. |
| T-002 | CLI types, errors, and output primitives | Foundation | Define project type, database, package manager, plan, result, and error contracts. Add exit-code mapping, color/no-color handling, and version metadata. | T-001 | Unit tests for exit codes, color suppression, version output, and type guards. | None. |
| T-003 | Argument parsing, help, and version | Reusable unit | Parse positional directory and all v1 flags with `node:util.parseArgs`; normalize aliases; reject conflicts and unknown values; render help and version. | T-002 | Unit tests for every flag, alias, conflict, and invalid value; help/version snapshots. | Terminal `--help` and `--version` output presented for review. |
| T-004 | Interaction detection and prompts | Reusable unit | Implement TTY/CI/agent detection, prompt adapter, defaults, `--yes`, `--no-input`, plan review, decline, and cancellation behavior. | T-002, T-003 | Unit and integration tests with fake streams and prompt adapters; non-TTY behavior. | Terminal recording or screenshot of interactive and non-interactive flows. |
| T-005 | Template manifest, resolver, and package merge | Composition | Validate fragment manifests; merge base/type/database files, package manifests, env lines, capabilities, and tokens; enforce conflict and path-safety rules. | T-002 | Unit tests plus 20-combination snapshot matrix; injected file/package conflicts. | None. |
| T-006 | Staging, commit, overwrite, and rollback | Reusable unit | Implement target-state checks, `.DS_Store` handling, sibling staging, `.` target copy, backup/restore, overwrite, signal cleanup, and no half-written targets. | T-005 | Temp-directory integration tests; failure injection; interrupted-run tests. | None. |
| T-007 | Base and project-type fragments | Placeholder template | Create the base skeleton and four type fragments: capabilities, config, plugins, scripts, README, `AGENTS.md`, and `gitignore`. Use minimal but valid content. | T-005 | Snapshot file sets per type; generated tree checks; capability assertions. | None; T-009 presents generated output. |
| T-008 | Database fragments and connection mapping | Template | Add five database fragments with adapters, pinned drivers, `connect.ts`, database config, env defaults, and PGlite working connection. | T-005, T-007 | Snapshot content; P-003 PGlite smoke; adapter/driver pin checks. | None. |
| T-009 | Create workflow and next steps | Primary workflow | Wire preflight, plan, prompts, resolution, staging, validation, commit, install/git hooks, output, dry-run, exit codes, and next-step text. | T-003 through T-008 | Integration scenarios for interactive, non-interactive, dry-run, overwrite, and errors; full-stack/PGlite smoke. | Generated project tree plus terminal next steps for one full-stack/PGlite and one API-only/Postgres run. |
| T-010 | Package manager and git execution | External integration | Detect the invoking package manager, render commands, install dependencies, initialize git, handle missing prerequisites, and apply the Windows `shell:true` fallback safely. | T-009 | P-002 harness; fake executables; real npm install and git init in temp directories; metacharacter rejection. | Terminal output showing install, git, and missing-prerequisite behavior. |
| T-011 | Remote and local templates | External integration | Support local directories, GitHub sources with optional refs, `tar` extraction, optional `create-stackpress.json`, static-template behavior, and security limits. | T-009 | Fixture templates; traversal/symlink/oversize tests; mocked fetch; one optional real GitHub smoke. | Terminal creation or dry-run from a local template presented for review. |
| T-012 | Test matrix and CI | Hardening | Add unit, snapshot, integration, and smoke suites; GitHub Actions for Windows, macOS, and Linux on Node 22 and 24; package-pack smoke. | T-001 through T-011 | `npm test`; CI matrix green; package pack contents checked. | None. |
| T-013 | Refactor and hardening pass | Refactor | Remove placeholder seams, review module boundaries and dependency budget, check startup time, audit security-sensitive paths, and update tests. | T-012 | Code review; full test suite; `npm audit`; startup benchmark; security checks. | None. |
| T-014 | Documentation and release readiness | Primary output | Write README usage and troubleshooting, document presets and templates, decide the license, run `npm pack --dry-run` and `npm publish --dry-run`, and verify package identity. | T-013 | Pack contents review; docs link check; publish dry run; scope/name check. | README and `npm pack --dry-run` output presented for review. |

## Milestones

1. **Skeleton:** T-001 through T-004.
2. **Composition:** T-005 through T-008.
3. **Working create flow:** T-009 and T-010.
4. **Advanced templates:** T-011.
5. **Release-ready:** T-012 through T-014.

## Verification Process

- Run `npm run typecheck`, `npm test`, and the focused checks named in each task.
- Snapshot all 20 type/database combinations after T-008.
- Run integration scenarios for interactive, non-interactive, dry-run, overwrite, cancellation, and failure recovery.
- Run real install and git flows in temporary directories on Windows; repeat in CI on macOS and Linux.
- Keep verification separate from acceptance. Tests, logs, and static checks are validation, not acceptance.

## Acceptance Process

- Tasks T-003, T-004, T-009, T-010, T-011, and T-014 have terminal or generated-artifact acceptance.
- Tasks without a human-reviewable artifact use `Acceptance criteria: none` and finish at `verified`.
- Task files and `tasks/status.md` are created only after the plan is accepted.
- Acceptance remains human unless explicitly delegated.

## Risks And Implementation Decisions

- License choice is required before publishing.
- GitHub template fetching uses `tar`; network behavior needs fixture tests and one optional live smoke.
- Exact generated template content remains implementation work; the fragment contract is Frozen.
- Yarn and bun may be unavailable locally; CI should install or explicitly skip them with recorded evidence.
- Package name and scope must be re-checked before publishing.

## Definition Of Done

All tasks are verified or accepted, the CI matrix is green, the package pack contents are correct, documentation covers the Frozen CLI contract, and no Frozen constraint is violated.

## Proposed Next Step

Review and accept or adjust this plan. Once accepted, create `tasks/status.md` and the individual task files with full implementation steps, verification, and acceptance criteria.
