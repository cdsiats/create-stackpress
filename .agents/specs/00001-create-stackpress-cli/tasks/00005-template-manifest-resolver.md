# 00005: Template Manifest, Resolver, and Package Merge

- **Task ID:** T-005
- **Task control:** 00005
- **Status:** open
- **Depends on:** T-002

## Task Summary

Implement manifest validation, base/type/database fragment resolution, file and package merging, token replacement, capability checks, and path safety.

## Implementation Steps

1. Define the fragment manifest schema and runtime validation.
2. Implement deterministic base -> type -> database resolution.
3. Merge files, dependencies, devDependencies, scripts, plugins, env lines, and capabilities.
4. Reject conflicting files, conflicting package versions, unresolved tokens, absolute paths, traversal, and symlinks.
5. Rename `gitignore` to `.gitignore` during rendering.
6. Add unit tests and a 20-combination snapshot matrix using fixture fragments.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/unit/manifest.test.ts tests/unit/resolver.test.ts tests/snapshot/combinations.test.ts`

## Acceptance Criteria

None. Resolver output is machine-readable and validated by snapshots and conflict tests.

## Implementation Notes

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Acceptance criteria: none; task may finish at `verified`.
