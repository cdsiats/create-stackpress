# 00014: Documentation and Release Readiness

- **Task ID:** T-014
- **Task control:** 00014
- **Status:** accepted
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

- Rewrote `README.md` for release: audience and purpose, Node.js 22 requirement, `npx`/global usage, all v1 flags and defaults, interaction modes, four project types with the canonical capability matrix, five databases with adapter/driver pins and connection imports, generated project structure, template behavior and manifest example, next steps and database prerequisites, Windows notes, exit codes, testing, troubleshooting, and the MIT license section.
- Added standard MIT `LICENSE` with copyright holder `CDSIATS` and year `2026`.
- Updated `package.json`: `private: false`, `license: MIT`, GitHub `repository`/`homepage`/`bugs`, npm keywords, `LICENSE` in `files`, and normalized the bin path from `./dist/cli.js` to `dist/cli.js` to remove npm's publish-time auto-correction warning. Dependencies, scripts, and version were not changed.
- Synchronized the root `license` field in `package-lock.json` to `MIT`.
- Documented the retained decisions: static templates normalize root `package.json` identity (`name`, `private`, `type`, `engines.node`) as a deliberate deviation from byte-for-byte copying; `--db-url` is rejected with `--template`; generated `scripts/stackpress.ts` remains the Windows-safe launcher.
- Version bumped from `0.0.0` to `0.1.0` on 2026-10-30 at the user's request; publishing remains user-owned.
- Corrected the interactive-template wording during orchestrator review: any `--template` source currently skips type/database prompts; manifest templates use defaults unless `--type`/`--db` are supplied, and unsupported choices fail preflight. The Frozen contract's "only supported choices are offered" interactive filtering remains a known gap.
- After T-007C merged the preset features into `config/common.ts`, the pack is 164 entries and `npm publish --dry-run --json` still exits 0. The README generated-structure and capability wording were updated to match.
- After the version bump to `0.1.0`, the package identity is `@cdsiats/create-stackpress@0.1.0`; the publish dry run remains user-owned.

## Verification Notes

- `npm run typecheck` and `npm run build` passed.
- `npm test` passed: 194 tests, 190 passed, 4 skipped, 0 failed. Skips are the Windows symlink tests, live GitHub template test, and two opt-in heavy smokes. One earlier full-suite run hit an unrelated tar `write after end` flake in `tests/integration/remote-template.test.ts`; the focused file passed and two subsequent full runs passed.
- Documentation link check: both links resolved (`LICENSE` local, `TESTING.md` GitHub).
- `npm pack --dry-run --json`: `@cdsiats/create-stackpress@0.0.0`, tarball `cdsiats-create-stackpress-0.0.0.tgz`, 179 entries, 105,710 bytes packed / 483,149 bytes unpacked. Contains `dist/`, `templates/`, `README.md`, `LICENSE`, and `package.json`; no `src/`, `tests/`, `scripts/`, `.github/`, or `.agents/` leakage.
- `npm publish --dry-run --json`: exit 0, identity `@cdsiats/create-stackpress@0.0.0`, tag `latest`, default access, 179 entries, no lifecycle or packaging error. The only warning is that a real publish requires registry login; nothing was published.
- `npm view @cdsiats/create-stackpress version` returned E404 (name not currently published). Registry auth is not configured (`npm whoami` fails), so the `@cdsiats` scope must be authenticated before publishing. GitHub origin is `https://github.com/cdsiats/create-stackpress` and `refs/heads/main` is reachable.
- The `npm create @cdsiats/stackpress@latest` initializer form was not exercised because the package is unpublished; the README documents the verified `npx` and global-install forms.

## Acceptance Notes

- Accepted by the user on 2026-10-30 after reviewing the README and the pack/publish dry-run output.
