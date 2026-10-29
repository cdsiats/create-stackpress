# 00007: Base and Project-Type Fragments

- **Task ID:** T-007
- **Task control:** 00007
- **Status:** open
- **Depends on:** T-005

## Task Summary

Create the bundled base skeleton and four project-type fragments with minimal but valid Stackpress content.

## Implementation Steps

1. Add base files: package manifest data, `plugins/app/plugin`, `plugins/store/plugin`, tsconfig, README, `AGENTS.md`, `gitignore`, and `.env.sample`.
2. Add full-stack capabilities: public views, admin, API, auth, content/pages.
3. Add API-only capabilities: API, auth, database.
4. Add minimal capabilities: database only.
5. Add admin-only capabilities: admin, auth, database.
6. Add `config/capabilities.ts` to every type.
7. Add snapshot tests for file sets, capabilities, and plugin lists.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/snapshot/types.test.ts`

## Acceptance Criteria

None. The generated project output is presented for acceptance in T-009.

## Implementation Notes

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
