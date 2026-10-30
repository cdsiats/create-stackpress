# Status

## Current State

**Frozen on 2026-10-29** after user approval of the v1 design. Research, the grill pass, P-001 through P-004, the template architecture, CLI contract, user-journey audit, and final context review are complete. All 14 grill questions are answered and every in-scope actor, feature, Use Case, and journey scenario is covered.

## Grill Pass

- Questions answered: 14
- Asked or queued: 0
- Ledger: [Questions](questions.md)
- New gaps from the grill: none; all recorded gaps are accepted or resolved.

## Work Items

| Item | Status | Next Action |
| --- | --- | --- |
| Read project context | Complete | None. |
| Set up spec package | Complete | None. |
| Research representative scaffolders | Complete | None. |
| Synthesize cross-cutting UX patterns | Complete | None. |
| Record database-scaffolding patterns | Complete | None. |
| Complete grill pass | Complete | None. |
| Confirm project-type taxonomy | Complete | Four types and the capability matrix are accepted. |
| Confirm relationship to `stackpress create` | Complete | Coexist. |
| Confirm default database semantics | Complete | PGlite local default; CockroachDB production target. |
| Confirm CLI contract | Complete | Remaining proposed decisions accepted. |
| Confirm npm and GitHub identity | Complete | npm `@cdsiats/create-stackpress`; GitHub `cdsiats/create-stackpress`. |
| Define template composition architecture | Complete | `architecture.md` records the fragment model, merge rules, pipeline, and testing strategy. |
| Define database generation matrix | Complete | `architecture.md` records adapters, drivers, pins, connection imports, and env behavior. |
| Define cross-platform test matrix | Complete | `architecture.md` records unit, snapshot, integration, smoke, security, OS, and Node coverage. |
| Define CLI contract | Complete | `cli-contract.md` records invocation, flags, defaults, interaction modes, exit codes, and examples. |
| User journey coverage | Complete | `journeys.md` covers 7 developer states, 15 features, 8 Use Cases, and 14 journeys; no new Gaps. |
| Design review | Complete | User approved the architecture, CLI contract, and D-008 through D-014. |
| Proofs | Complete | P-001, P-002, P-003, and P-004 are proved and recorded in `proofs.md`. |
| Context promotion review | Complete | Proof-verified constraints and accepted product decisions were promoted; the final context review found no conflicts. |
| Freeze | Complete | Spec frozen on 2026-10-29. |

## Freeze Record

- **Status:** Frozen
- **Frozen on:** 2026-10-29
- **Approved by:** User
- **Basis:** v1 architecture, CLI contract, user journeys, and D-008 through D-014 approved.
- **Reopening:** Requires explicit user permission. Record the reason, affected files, and new evidence before editing.

## Reopen Record

- **Opened on:** 2026-10-30
- **Approved by:** User review comment: the generated config had unnecessary files compared with the canonical Stackpress templates.
- **Reason:** T-007A added `config/base.ts`, `config/feature-types.ts`, `config/capabilities.ts`, and `config/database.ts` beyond the canonical `config/common.ts`, `config/develop.ts`, `config/build.ts`, and `config/client.ts`. The extra files were an implementation device, not Stackpress requirements.
- **Affected files:** `architecture.md` (Fragment Manifest example, File Ownership, Project Type Presets), `tasks/00007B-simplify-generated-config.md`.
- **New evidence:** `stackpress/stackpress` `templates/website` and `skills/stackpress-app-scaffold/assets/template` on `main`, accessed 2026-10-30.
- **Resolution:** Keep exactly the canonical four config files. The four-preset split is a compile-time `{{type}}` conditional inside `config/common.ts`, not a separate file. Capabilities are tracked internally by the CLI. Database settings stay in `config/common.ts`; the database connection stays in `plugins/store/connect.ts`.

## Implementation

- **Status:** `completed`
- **Completed on:** 2026-10-30
- **Plan:** [Implementation Sprint](tasks/sprint.md)
- **Plan accepted:** 2026-10-29
- **Task ledger:** [Task Status](tasks/status.md)
- **Next action:** Release version decision and npm publish authentication.

## Recommended Next Action

All implementation tasks are accepted. The package is release-ready at `0.1.0`, MIT, with a 164-entry pack and a passing publish dry run. Authenticate to the `@cdsiats` npm scope, then publish.
