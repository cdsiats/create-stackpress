# P-002: Cross-Platform Command Resolution

Tests package-manager detection, executable resolution, command mapping, and harmless execution from a path containing spaces.

## Run

```bash
node run.mjs
```

## What It Checks

- Detection from `npm_config_user_agent`, `packageManager`, and lockfiles.
- Windows `.cmd`/`.exe` resolution and POSIX executable names.
- Install, run, and exec command mapping for npm, pnpm, yarn, and bun.
- Actual `--version` execution for installed package managers from a path with spaces.
- Literal argument preservation for spaces and shell metacharacters with `shell: false`.
- Invalid manager and command rejection.

## Non-Goals

This proof does not install dependencies or prove every package-manager version. It proves the command layer and Windows execution path used by the CLI.
