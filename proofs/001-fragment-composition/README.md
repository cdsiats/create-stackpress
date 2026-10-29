# P-001: Fragment-Based Template Composition

Tests whether a manifest-driven base + type + database fragment system can compose all 20 project combinations without full-template duplication.

## Run

```bash
node run.mjs
```

## What It Checks

- 4 project types x 5 databases = 20 combinations.
- Base, type, and database files merge without conflicts.
- Package manifests merge dependencies, scripts, and plugin lists.
- Each type gets its expected capability and feature files.
- Each database gets its adapter, driver, connection file, and env sample.
- No unresolved placeholders remain.
- File and package conflicts are detected.
- Generated projects are written to `out/` for inspection.

## Non-Goals

This proof does not install dependencies or boot a Stackpress app. Those are covered by P-003.
