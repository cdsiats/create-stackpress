# 00014: Documentation and Release Readiness

- **Task ID:** T-014
- **Task control:** 00014
- **Status:** open
- **Depends on:** T-013

## Task Summary

Write user documentation, decide the license, verify package contents, and run publish dry runs for `@cdsiats/create-stackpress`.

## Implementation Steps

1. Write README usage, presets, databases, flags, templates, troubleshooting, and development commands.
2. Add a license decision and `LICENSE` file.
3. Document the remote template manifest and security limits.
4. Run `npm pack --dry-run` and review the included files.
5. Run `npm publish --dry-run` and verify the package identity and access.
6. Re-check npm scope/name availability and the GitHub repository target.
7. Update the task and spec status.

## Verification Process

- `npm run build`
- `npm test`
- `npm pack --dry-run`
- `npm publish --dry-run`
- Documentation link check.

## Acceptance Criteria

The user reviews the README and the `npm pack --dry-run` output, confirming the package contents, usage instructions, license, and publish identity match the Frozen contract.

## Implementation Notes

- Pending.

## Verification Notes

- Pending.

## Acceptance Notes

- Pending user review.
