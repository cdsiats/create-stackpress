# create-stackpress CLI Journey Details

Detailed journey walk for [User Journeys](../specs/00001-create-stackpress-cli/journeys.md). Load this file when reviewing step-level behavior, evidence, or acceptance impact. The owner file carries the coverage matrix and dispositions.

Step classifications: `Scope` is in-scope unless marked; `Clarity` is clear unless marked; `Readiness` is implementable unless marked.

## J-001: Interactive Core-Preset Creation

- **Use Case:** UC-001
- **Actor/state:** A-001 Developer / S-001 Interactive
- **Features:** F-001 through F-010, F-012, F-013
- **Trigger:** `npx @cdsiats/create-stackpress my-app`
- **Preconditions:** Node.js 22+, TTY, target missing or empty
- **Scenario:** Successful completion

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | Developer starts the CLI; system parses flags, detects a TTY, and shows the CLI version. | CLI contract |
| 2 | System asks for project type (default full-stack); developer accepts. | CLI contract |
| 3 | System asks for database (default PGlite); developer accepts. | CLI contract |
| 4 | System detects the package manager and asks for confirmation; developer accepts. | P-002 |
| 5 | System asks install and git defaults; developer accepts yes for both. | CLI contract |
| 6 | System prints the plan; developer confirms. | CLI contract |
| 7 | System stages, validates, commits, installs dependencies, and initializes git. | Architecture, P-003 |
| 8 | System prints versions and exact next steps (`generate`, `push`, `dev`). | CLI contract |

- **Outcome:** Project exists, dependencies installed, git repository initialized, next steps printed.
- **Failure/recovery:** Install or git failures follow J-012 and J-013; commit failure follows J-009.
- **Gaps:** None.

## J-002: Interactive Creation With Custom Options

- **Use Case:** UC-001
- **Actor/state:** A-001 / S-001
- **Features:** F-001 through F-013
- **Trigger:** `npx @cdsiats/create-stackpress my-app`
- **Preconditions:** Node.js 22+, TTY, target missing or empty
- **Scenario:** API-only on CockroachDB with pnpm, skipping install and git

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | Developer selects `api-only`. | Capability matrix |
| 2 | Developer selects `cockroachdb`; system shows the PostgreSQL-compatible adapter and pinned driver. | P-004 |
| 3 | Developer selects pnpm; system accepts the override. | P-002 |
| 4 | Developer selects no install and no git. | CLI contract |
| 5 | System prints the plan and confirms. | CLI contract |
| 6 | System stages, validates, commits, and prints install/git/generate/push/dev next steps. | Architecture |

- **Outcome:** API-only project generated with the CockroachDB store; no install or git performed.
- **Failure/recovery:** Same as J-001.
- **Gaps:** None.

## J-003: Dry-Run Preview

- **Use Case:** UC-001 / UC-002
- **Actor/state:** A-001 / S-001 or S-002
- **Features:** F-007, F-008, F-009, F-015
- **Trigger:** `create-stackpress my-app --type minimal --db pglite --dry-run`
- **Preconditions:** Node.js 22+, valid target state
- **Scenario:** Preview only

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System resolves the plan from flags or prompts. | CLI contract |
| 2 | System validates target, template, package manager, and package name. | Architecture |
| 3 | System prints the plan and file list without writing. | CLI contract |
| 4 | System exits 0 for a valid plan, or 2 for a preflight error. | CLI contract |

- **Outcome:** No filesystem changes; developer can adjust and rerun.
- **Gaps:** None.

## J-004: Invalid Input And Recovery

- **Use Case:** UC-001 / UC-002
- **Actor/state:** A-001 / S-001 or S-002
- **Features:** F-002, F-003, F-007, F-009, F-015
- **Trigger:** Invalid type, database, package name, conflicting flags, or non-empty target without overwrite
- **Scenario:** Invalid or conflicting input

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | Developer passes an invalid value or conflicting flags. | CLI contract |
| 2 | System exits 2, names the invalid flag or target condition, and writes nothing. | CLI contract |
| 3 | Developer corrects the flag or chooses another target. | CLI contract |
| 4 | System restarts the plan at step 1. | CLI contract |

- **Outcome:** No partial project; actionable error.
- **Gaps:** None.

## J-005: Cancellation Or Declined Confirmation

- **Use Case:** UC-001
- **Actor/state:** A-001 / S-001
- **Features:** F-007, F-009, F-015
- **Trigger:** Ctrl+C during a prompt or declining the final confirmation
- **Scenario:** Cancellation

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | Developer interrupts or declines. | CLI contract |
| 2 | System removes staging, restores backups, and writes nothing to the target. | Architecture |
| 3 | System prints a cancellation message; exit 0 for decline, 130 for interrupt. | CLI contract |

- **Outcome:** Target unchanged.
- **Gaps:** None.

## J-006: Non-Interactive Or CI Creation

- **Use Case:** UC-002
- **Actor/state:** A-001 / S-002
- **Features:** F-001 through F-009, F-012, F-013, F-015
- **Trigger:** `CI=1 create-stackpress my-app --type api-only --db postgres --pm npm --install --git`
- **Preconditions:** Node.js 22+, directory provided, no TTY
- **Scenario:** Fully flag-driven success

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System detects non-interactive mode and uses flags/defaults without prompting. | CLI contract |
| 2 | System prints the plan and preflights the target, package manager, and template. | CLI contract |
| 3 | System stages, validates, commits, installs, and initializes git. | Architecture |
| 4 | System prints next steps and exits 0. | CLI contract |

- **Outcome:** Same project as interactive success without prompts.
- **Failure/recovery:** Missing directory or invalid flags exit 2 before writes; install failure follows J-012.
- **Gaps:** None.

## J-007: Non-Interactive Invalid Flags Or Missing Directory

- **Use Case:** UC-002
- **Actor/state:** A-001 / S-002
- **Features:** F-002, F-003, F-007, F-015
- **Trigger:** Missing directory, unknown flag, or invalid value in a non-interactive run
- **Scenario:** Invalid input

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System cannot prompt and detects a missing or invalid value. | CLI contract |
| 2 | System exits 2 and names the missing flag or accepted values. | CLI contract |
| 3 | Developer reruns with the corrected command. | CLI contract |

- **Outcome:** No writes; actionable failure.
- **Gaps:** None.

## J-008: Agent-Assisted Creation

- **Use Case:** UC-003
- **Actor/state:** A-001 / S-003; the AI agent is an external handoff
- **Features:** F-001 through F-009, F-012, F-013, F-015
- **Trigger:** An agent runs the CLI with a complete flag set
- **Scenario:** Non-interactive automation

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | Agent environment is detected; system treats the run as non-interactive. | CLI contract |
| 2 | Agent supplies directory, type, database, package manager, and install/git flags. | CLI contract |
| 3 | System prints the plan and proceeds without prompts. | CLI contract |
| 4 | System returns human-readable output and an exit code; a future JSON mode may be added. | CLI contract |
| 5 | Agent reports the result to the developer. | Handoff |

- **Outcome:** Deterministic scaffold with machine-observable exit code.
- **Failure/recovery:** Missing flags exit 2; agent retries with the named flag.
- **Gaps:** None.

## J-009: Existing Target, Overwrite, And Special Paths

- **Use Case:** UC-004
- **Actor/state:** A-001 / S-004
- **Features:** F-001 through F-009, F-012, F-013, F-015
- **Trigger:** Target exists, is `.`, or is a file/symlink
- **Scenario:** Existing target and overwrite

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System checks the target; a `.DS_Store`-only directory is treated as empty. | Architecture |
| 2 | A file or symlink target exits 2; a non-empty directory without `--overwrite` exits 2. | CLI contract |
| 3 | With `--overwrite`, system backs up conflicting files and preserves unrelated files. | Architecture |
| 4 | For `.`, system validates in a sibling staging directory, then copies into the current directory with backup/restore. | Architecture |
| 5 | If the target is inside an existing git worktree, system skips git init and warns. | CLI contract |
| 6 | Success prints the created path and next steps; commit failure restores backups. | Architecture |

- **Outcome:** Existing directory updated safely; no nested git repository.
- **Gaps:** None after design clarifications D-008 through D-011.

## J-010: Missing Prerequisites

- **Use Case:** UC-005
- **Actor/state:** A-001 / S-005
- **Features:** F-004, F-005, F-006, F-007, F-009, F-015
- **Trigger:** `--install` with a missing package manager, or `--git` with missing git
- **Scenario:** External dependency failure

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System preflights the requested package manager and git. | CLI contract |
| 2 | Missing package manager with `--install`: exit 2 before writes, show install command and `--no-install`. | CLI contract |
| 3 | Missing git with `--git`: warn, skip git, keep the scaffold, exit 0, print manual commands. | CLI contract |
| 4 | Developer installs the missing tool or reruns with the suggested flag. | CLI contract |

- **Outcome:** No half-scaffolded project; actionable recovery.
- **Gaps:** None.

## J-011: Remote Or Local Template

- **Use Case:** UC-006
- **Actor/state:** A-001 / S-006
- **Features:** F-001 through F-013, F-015
- **Trigger:** `--template ./local-template` or `--template owner/repo#ref`
- **Scenario:** Template with and without a manifest

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System resolves and extracts the local or GitHub source with size and path checks. | Architecture |
| 2 | A template manifest is validated; supported type/database choices are enforced. | Architecture |
| 3 | A static template without a manifest is copied as-is; `--type` and `--db` are rejected; no generated AGENTS.md or README metadata is added. | CLI contract |
| 4 | Fetch, extraction, or compatibility failure exits 2 before writes. | CLI contract |
| 5 | Success stages, validates, commits, and prints next steps. | Architecture |

- **Outcome:** Template created or rejected safely.
- **Gaps:** None after design clarifications D-012 and D-014.

## J-012: Install Failure Recovery

- **Use Case:** UC-007
- **Actor/state:** A-001 / S-007
- **Features:** F-004, F-005, F-013, F-015
- **Trigger:** Dependency install fails after the scaffold is committed
- **Scenario:** External dependency failure

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System commits the scaffold, then runs the selected install command. | Architecture |
| 2 | Install fails; system keeps the project, prints the failed command and retry command, exits 1. | CLI contract |
| 3 | Developer fixes the network/registry issue and reruns install manually. | CLI contract |
| 4 | Developer continues with generate/push/dev. | CLI contract |

- **Outcome:** Project preserved; clear retry path.
- **Gaps:** None.

## J-013: Git Failure Recovery

- **Use Case:** UC-007
- **Actor/state:** A-001 / S-007
- **Features:** F-006, F-013, F-015
- **Trigger:** Git init or commit fails after scaffolding
- **Scenario:** Optional step failure

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System keeps the generated project and prints a git warning. | CLI contract |
| 2 | System exits 0 and prints the manual git commands. | CLI contract |
| 3 | Developer initializes or commits later. | CLI contract |

- **Outcome:** Project preserved; git is recoverable.
- **Gaps:** None.

## J-014: Help And Version

- **Use Case:** UC-008
- **Actor/state:** A-001 / any state
- **Features:** F-014
- **Trigger:** `--help` or `--version`
- **Scenario:** Informational request

| # | Actor action / system response | Evidence |
| --- | --- | --- |
| 1 | System prints usage or CLI/template/Stackpress versions. | CLI contract |
| 2 | System exits 0 without reading the target or writing files. | CLI contract |

- **Outcome:** Information available in every mode.
- **Gaps:** None.
