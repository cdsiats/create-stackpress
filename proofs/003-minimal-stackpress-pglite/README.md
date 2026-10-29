# P-003: Minimal Stackpress Runtime With PGlite

Tests whether a minimal Stackpress app with a PGlite store can install, typecheck, boot, and answer a database-backed health route.

## Run

```bash
npm install
npm run check
node run.mjs
```

`run.mjs` starts `npm run dev`, waits for `GET /health`, asserts the response, and stops the process tree.

## What It Checks

- `stackpress` 0.10.8 installs with the PGlite adapter and driver.
- The minimal plugin and store plugin typecheck with `tsc`.
- The Stackpress development server boots.
- The store plugin registers the PGlite database on the `config` event.
- `GET /health` returns `{ ok: true, database: "registered", query: [{ ok: 1 }] }`.

## Non-Goals

This proof does not cover React views, admin, auth, full template content, or non-PGlite databases.
