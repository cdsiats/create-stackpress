# Questions

Lossless question ledger for the `create-stackpress` grill pass. Exact user answers are preserved here before any decision is summarized in [Decisions and Gaps](decisions.md).

## Response Metadata

- Intake: `create-stackpress Grill Intake`
- Submitted: `2026-10-29T11:26:16.650Z`
- Presentation: HTML form served at `http://127.0.0.1:8787/`

## Status Summary

| Status | Count |
| --- | --- |
| answered-by-user | 14 |
| asked | 0 |
| queued | 0 |
| evidence-resolved | 0 |
| accepted-decision | 0 |
| deferred | 0 |
| blocked | 0 |
| superseded | 0 |

## Q-001: First-Release Project Types

- **Status:** answered-by-user
- **Source:** gap GAP-001
- **Question:** Which project types should the first release support? Select every type that must work.
- **User answer:** `Full-stack, API-only, Minimal/blank, Website/content, Admin-only`
- **Normalized note:** All five listed types are in first-release scope. Their capability definitions are still unresolved in Q-012.
- **Decision update:** GAP-001 and GAP-020 in [Decisions and Gaps](decisions.md).

## Q-002: Relationship to `stackpress create`

- **Status:** answered-by-user
- **Source:** gap GAP-008
- **Question:** How should `create-stackpress` relate to the existing `stackpress create` command?
- **User answer:** `Coexist`
- **Decision update:** GAP-008 in [Decisions and Gaps](decisions.md).

## Q-003: Default Database

- **Status:** answered-by-user
- **Source:** gap GAP-009
- **Question:** What should the default database selection be?
- **User answer:** `PGlite default with CockroachDB production`
- **Decision update:** GAP-009 in [Decisions and Gaps](decisions.md).

## Q-004: Package Managers

- **Status:** answered-by-user
- **Source:** gap GAP-004
- **Question:** Which package managers should the first release support?
- **User answer:** `npm, pnpm, yarn, bun`
- **Decision update:** GAP-004 in [Decisions and Gaps](decisions.md).

## Q-005: Minimum Node.js Version

- **Status:** answered-by-user
- **Source:** gap GAP-011
- **Question:** What minimum Node.js version should the CLI require?
- **User answer:** `Node.js 22+`
- **Decision update:** GAP-011 in [Decisions and Gaps](decisions.md).

## Q-006: Install and Git Defaults

- **Status:** answered-by-user
- **Source:** gaps GAP-005 and GAP-006
- **Question:** In interactive mode, what should the default answers be for dependency installation and git initialization?
- **User answer:** `Yes install, yes git`
- **Decision update:** GAP-005 and GAP-006 in [Decisions and Gaps](decisions.md).

## Q-007: Template Strategy

- **Status:** answered-by-user
- **Source:** gap GAP-007
- **Question:** How should templates be supplied for the first release?
- **User answer:** `Bundle plus optional remote`
- **Decision update:** GAP-007 in [Decisions and Gaps](decisions.md).

## Q-008: Generated Agent Guidance

- **Status:** answered-by-user
- **Source:** gap GAP-012
- **Question:** Should generated projects include agent guidance?
- **User answer:** `Include AGENTS.md`
- **Decision update:** GAP-012 in [Decisions and Gaps](decisions.md).

## Q-009: Telemetry

- **Status:** answered-by-user
- **Source:** gap GAP-013
- **Question:** What telemetry posture should the CLI take?
- **User answer:** `No telemetry`
- **Decision update:** GAP-013 in [Decisions and Gaps](decisions.md).

## Q-010: npm Package Identity

- **Status:** answered-by-user
- **Source:** gap GAP-003 / distribution
- **Question:** What npm package identity should the first release use?
- **User answer:** `Other`
- **Additional note (verbatim):** `For Q10 scope it to me cdsiats/create-stackpress`
- **Follow-up:** Q-011.
- **Normalized note:** Partial answer completed by Q-011. The GitHub repository target is `cdsiats/create-stackpress`; the npm package is `@cdsiats/create-stackpress`.
- **Decision update:** D-003 and GAP-019 in [Decisions and Gaps](decisions.md).

## Q-011: npm Scope Follow-Up

- **Status:** answered-by-user
- **Source:** partial answer Q-010
- **Question:** Should the npm package be published as `@cdsiats/create-stackpress`, while the GitHub repository remains `cdsiats/create-stackpress`?
- **Options:** Yes, use `@cdsiats/create-stackpress`; No, keep unscoped `create-stackpress` and use `cdsiats/create-stackpress` only as the repository; Other.
- **User answer:** `yes`
- **Normalized note:** npm package `@cdsiats/create-stackpress`; GitHub repository `cdsiats/create-stackpress`.
- **Decision update:** GAP-019 in [Decisions and Gaps](decisions.md).

## Q-012: Capability Matrix for the Five Project Types

- **Status:** answered-by-user
- **Source:** gap GAP-020
- **Question:** Should the first release use the proposed capability matrix for the five project types, or should any type be adjusted?
- **Proposed matrix:** Full-stack = public views, admin, API, auth, database; API-only = API, auth, database, no public views/admin; Minimal/blank = base server plugin and database, no auth/admin/public views/API surface; Website/content = public views, content/pages, auth, database, admin; Admin-only = admin, auth, database, no public views/content.
- **User answer (verbatim):** `I think website/content can be removed since its the same as full stack`
- **Normalized note:** Remove Website/content from the first-release project types. The remaining matrix for Full-stack, API-only, Minimal/blank, and Admin-only was confirmed by Q-013.
- **Follow-up:** Q-013 (answered).
- **Decision update:** GAP-001 and GAP-020 in [Decisions and Gaps](decisions.md).

## Q-013: Remaining Capability Matrix

- **Status:** answered-by-user
- **Source:** partial answer Q-012
- **Question:** With Website/content removed, should the remaining capability matrix stay as proposed for Full-stack, API-only, Minimal/blank, and Admin-only?
- **Proposed matrix:** Full-stack = public views, admin, API, auth, database; API-only = API, auth, database; Minimal/blank = base server plugin and database; Admin-only = admin, auth, database, no public views/content.
- **User answer:** `use as proposed`
- **Decision update:** GAP-020 in [Decisions and Gaps](decisions.md).

## Q-014: Remaining Proposed Decisions

- **Status:** answered-by-user
- **Source:** gaps GAP-002, GAP-003, GAP-010, GAP-014, GAP-015, GAP-016, GAP-017, and GAP-018
- **Question:** Do you accept the remaining proposed decisions as written?
- **Proposed decisions:**
  - Project type and database are independent axes (`--type`, `--db`).
  - Interactive-first in a TTY, with flags for every answer; non-interactive for CI/agents or `--no-input`.
  - Do not require database credentials during scaffolding; generate `.env.sample`; never auto-run `push` or `migrate`.
  - Human-readable plan and next steps by default; `--dry-run`, `--no-color`/`NO_COLOR`, and evaluate `--json` for automation.
  - Stage generation, validate, then commit to the target; roll back on failure; require `--overwrite` for non-empty targets.
  - Snapshot the preset x database matrix and smoke-test install/build on Windows, macOS, and Linux.
  - Accept a positional directory, support `.`, derive and validate the package name, and require an empty target unless `--overwrite`.
  - Generate a README with the preset, database, environment variables, and exact package-manager commands.
- **Options:** Accept all as written; review individually; adjust specific decisions; other.
- **User answer:** `accept`
- **Decision update:** GAP-002, GAP-003, GAP-010, GAP-014, GAP-015, GAP-016, GAP-017, and GAP-018 in [Decisions and Gaps](decisions.md).

## Grill Pass Result

All 14 questions are answered. The grill pass is complete. The spec was Frozen on 2026-10-29 after design, user-journey, and Proof completion.

## Handling Rule

The user may answer in chat or in a follow-up form. Chat remains authoritative. Preserve exact answers here before updating decisions. If an answer is partial, create a linked follow-up and ask it next.
