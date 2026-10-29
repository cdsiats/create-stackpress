# 00011: Remote and Local Templates

- **Task ID:** T-011
- **Task control:** 00011
- **Status:** open
- **Depends on:** T-009

## Task Summary

Add local-directory and GitHub template support, optional `create-stackpress.json` compatibility, static-template behavior, and archive security limits.

## Implementation Steps

1. Resolve local template directories without symlink or traversal escapes.
2. Fetch GitHub sources with optional `#ref` and extract with `tar` into a temporary directory.
3. Validate optional `create-stackpress.json` and declared type/database support.
4. Implement static-template behavior: copy as-is, reject `--type`/`--db`, no generated AGENTS/README metadata.
5. Enforce archive size, file-count, path, and symlink limits; never execute template scripts.
6. Add fixture templates, traversal/symlink/oversize tests, mocked fetch tests, and one optional live smoke.

## Verification Process

- `npm run typecheck`
- `npm test -- tests/unit/templates.test.ts tests/integration/remote-template.test.ts`
- Local fixture dry-run and creation.

## Acceptance Criteria

The user reviews terminal output from creating or dry-running a local template and from a static-template run, confirming compatibility and static-copy behavior match the Frozen contract.

## Implementation Notes

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Pending user review.
