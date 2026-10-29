# User Journeys

Coverage and journey ledger for `00001-create-stackpress-cli`. Detailed step walks live in [CLI Journey Details](../../references/00004-create-stackpress-cli-journey-details.md).

## Status

- **Coverage:** complete
- **Specification behavior:** complete
- **Frozen:** 2026-10-29
- **Journeys:** 14
- **New journey Gaps:** none
- **Design clarifications:** D-008 through D-014 in [Decisions and Gaps](decisions.md)

## Sources

- [Project brief](../../context/project-brief.md)
- [Stackpress platform](../../context/stackpress-platform.md)
- [Brief](brief.md), [Decisions](decisions.md), [CLI Contract](cli-contract.md), [Architecture](architecture.md)
- [Research](research.md) and [Proofs](proofs.md)

## Actors And States

| ID | Actor | States | In scope |
| --- | --- | --- | --- |
| A-001 | Developer | S-001 Interactive; S-002 Non-interactive/CI; S-003 Agent-assisted; S-004 Existing target/overwrite; S-005 Missing prerequisite; S-006 Remote template; S-007 Post-scaffold recovery | Yes |
| A-002 | Template author | Creates remote templates and manifests | No; external authoring boundary. The CLI consumes templates but does not author them. |
| A-003 | Maintainer | Publishes CLI and templates | No; release and publishing strategy is deferred. |
| A-004 | Generated app end user | Uses the generated Stackpress app | No; runtime app behavior belongs to the generated app, not the scaffolder. |

External dependencies and handoffs: package managers, git, filesystem, GitHub/network fetches, and AI agents. They are not human actors.

## Features

| ID | Feature | Evidence |
| --- | --- | --- |
| F-001 | Create a project from a core preset | Architecture, CLI contract |
| F-002 | Select project type | Capability matrix |
| F-003 | Select database | Database matrix |
| F-004 | Detect or override package manager | P-002 |
| F-005 | Install dependencies | P-002, CLI contract |
| F-006 | Initialize git | CLI contract |
| F-007 | Review plan and confirm | CLI contract |
| F-008 | Dry-run preview | CLI contract |
| F-009 | Safe generation, overwrite, rollback | Architecture |
| F-010 | Generate AGENTS.md | CLI contract |
| F-011 | Use a remote or local template | Architecture, CLI contract |
| F-012 | Handle database URL and env files | Architecture, CLI contract |
| F-013 | Generate README and next steps | Architecture |
| F-014 | Show help and version | CLI contract |
| F-015 | Handle errors and recovery | CLI contract |

## Applicability Matrix

Cells contain the Use Case ID. `—` means not applicable for that state; see the disposition notes.

| Feature | S-001 Int | S-002 CI | S-003 Agent | S-004 Target | S-005 Prereq | S-006 Remote | S-007 Recovery |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F-001 Core preset | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | — | — |
| F-002 Type | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | — |
| F-003 Database | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | — |
| F-004 Package manager | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 |
| F-005 Install | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 |
| F-006 Git | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 |
| F-007 Plan review | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | — |
| F-008 Dry-run | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | — |
| F-009 Safe generation | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 |
| F-010 AGENTS.md | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | — | — |
| F-011 Remote template | UC-006 | UC-006 | UC-006 | UC-006 | UC-006 | UC-006 | — |
| F-012 DB URL/env | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | — |
| F-013 README/next steps | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 |
| F-014 Help/version | UC-008 | UC-008 | UC-008 | UC-008 | UC-008 | UC-008 | UC-008 |
| F-015 Error/recovery | UC-001 | UC-002 | UC-003 | UC-004 | UC-005 | UC-006 | UC-007 |

**Disposition notes:** S-007 is post-scaffold recovery, so creation, type/database, plan, dry-run, AGENTS, and database-URL features are already complete. S-006 cells marked `—` apply to static templates without a manifest; manifest templates use UC-006. All other `—` cells are outside the state's reachable flow.

## Use Cases

| ID | Actor/state | Goal | Features | Journeys |
| --- | --- | --- | --- | --- |
| UC-001 | S-001 | Create a project interactively | F-001..F-010, F-012, F-013, F-015 | J-001..J-005 |
| UC-002 | S-002 | Create a project non-interactively or in CI | F-001..F-009, F-012, F-013, F-015 | J-006, J-007 |
| UC-003 | S-003 | Create a project through an agent handoff | F-001..F-009, F-012, F-013, F-015 | J-008 |
| UC-004 | S-004 | Create or update an existing target safely | F-001..F-009, F-012, F-013, F-015 | J-009 |
| UC-005 | S-005 | Recover from a missing prerequisite | F-001, F-004..F-009, F-012, F-013, F-015 | J-010 |
| UC-006 | S-006 | Create from a remote or local template | F-001..F-013, F-015 | J-011 |
| UC-007 | S-007 | Recover from post-scaffold failure | F-004, F-005, F-006, F-009, F-013, F-015 | J-012, J-013 |
| UC-008 | Any | Get help or version information | F-014 | J-014 |

## Scenario Coverage

- **UC-001:** Success J-001; invalid input J-004; auth/verification N/A (no CLI auth); authorization N/A; first-use/empty J-001; duplicate N/A (target must be empty); cancellation J-005; external failure J-010/J-012; stale data N/A; feedback J-001/J-004; completion J-001.
- **UC-002:** Success J-006; invalid input J-007; auth N/A; authorization N/A; first-use J-006; duplicate N/A; cancellation J-005 for SIGINT; external failure J-010/J-012; stale data N/A; feedback J-006/J-007; completion J-006.
- **UC-003:** Success J-008; invalid input J-007; auth N/A; authorization N/A; first-use J-008; duplicate N/A; cancellation N/A; external failure J-010/J-012; stale data N/A; feedback J-008; completion J-008.
- **UC-004:** Success J-009; invalid/conflict J-004/J-009; auth N/A; authorization N/A; lifecycle existing target J-009; duplicate N/A; cancellation J-005/J-009; external failure J-012; stale data N/A; feedback J-009; completion J-009.
- **UC-005:** Success N/A (the prerequisite is missing); invalid input J-010; auth N/A; authorization N/A; first-use J-010; duplicate N/A; cancellation N/A; external failure J-010; stale data N/A; feedback J-010; completion J-010 (recovery path).
- **UC-006:** Success J-011; invalid/incompatible J-011; auth N/A; authorization N/A; first-use J-011; duplicate N/A; cancellation J-005; external failure J-011; stale data N/A; feedback J-011; completion J-011.
- **UC-007:** Success J-012/J-013 (recovery); invalid N/A; auth N/A; authorization N/A; first-use N/A; duplicate N/A; cancellation N/A; external failure J-012/J-013; stale data N/A; feedback J-012/J-013; completion J-012/J-013.
- **UC-008:** Success J-014; all other categories N/A.

## Journey Index

| ID | Journey | Use Case |
| --- | --- | --- |
| J-001 | [Interactive core-preset creation](../../references/00004-create-stackpress-cli-journey-details.md#j-001-interactive-core-preset-creation) | UC-001 |
| J-002 | [Interactive custom options](../../references/00004-create-stackpress-cli-journey-details.md#j-002-interactive-creation-with-custom-options) | UC-001 |
| J-003 | [Dry-run preview](../../references/00004-create-stackpress-cli-journey-details.md#j-003-dry-run-preview) | UC-001/002 |
| J-004 | [Invalid input and recovery](../../references/00004-create-stackpress-cli-journey-details.md#j-004-invalid-input-and-recovery) | UC-001/002 |
| J-005 | [Cancellation or declined confirmation](../../references/00004-create-stackpress-cli-journey-details.md#j-005-cancellation-or-declined-confirmation) | UC-001 |
| J-006 | [Non-interactive or CI creation](../../references/00004-create-stackpress-cli-journey-details.md#j-006-non-interactive-or-ci-creation) | UC-002 |
| J-007 | [Non-interactive invalid flags](../../references/00004-create-stackpress-cli-journey-details.md#j-007-non-interactive-invalid-flags-or-missing-directory) | UC-002 |
| J-008 | [Agent-assisted creation](../../references/00004-create-stackpress-cli-journey-details.md#j-008-agent-assisted-creation) | UC-003 |
| J-009 | [Existing target and overwrite](../../references/00004-create-stackpress-cli-journey-details.md#j-009-existing-target-overwrite-and-special-paths) | UC-004 |
| J-010 | [Missing prerequisites](../../references/00004-create-stackpress-cli-journey-details.md#j-010-missing-prerequisites) | UC-005 |
| J-011 | [Remote or local template](../../references/00004-create-stackpress-cli-journey-details.md#j-011-remote-or-local-template) | UC-006 |
| J-012 | [Install failure recovery](../../references/00004-create-stackpress-cli-journey-details.md#j-012-install-failure-recovery) | UC-007 |
| J-013 | [Git failure recovery](../../references/00004-create-stackpress-cli-journey-details.md#j-013-git-failure-recovery) | UC-007 |
| J-014 | [Help and version](../../references/00004-create-stackpress-cli-journey-details.md#j-014-help-and-version) | UC-008 |

## Design Clarifications From This Audit

- **D-008:** Target must be missing or a directory; `.DS_Store` is ignored for emptiness; files and symlinks exit 2.
- **D-009:** A `.` target is staged beside the directory and copied in with backup/restore; the directory itself is never renamed.
- **D-010:** Declining the final confirmation cancels with exit 0 and no writes; Ctrl+C exits 130.
- **D-011:** A target inside an existing git worktree skips `git init` and warns; no nested repository.
- **D-012:** A static remote template is copied as-is; no generated AGENTS.md or README metadata; type/database flags are rejected.
- **D-013:** Missing package manager with `--install` exits 2 before writes; missing git with `--git` warns, skips git, and exits 0.
- **D-014:** Remote template fetch or extraction failure exits 2 before any target write.

## Freeze Impact

Coverage is complete and no new journey Gaps remain. The spec still needs user design review and the final context review before Freeze.
