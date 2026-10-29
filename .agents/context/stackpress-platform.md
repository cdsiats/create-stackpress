# Stackpress Platform Context

Verified facts about the Stackpress ecosystem that constrain how `create-stackpress` should generate projects. These are external facts, not product decisions for the CLI.

## Source Provenance

- Stackpress home and guides: <https://www.stackpress.io/> (accessed 2026-10-29).
- Getting Started guide: <https://www.stackpress.io/guides/002-getting-started> (accessed 2026-10-29).
- Stackpress source and templates: <https://github.com/stackpress/stackpress> (accessed 2026-10-29).
- Inquire documentation: <https://www.stackpress.io/inquire> (accessed 2026-10-29).
- Inquire source and database examples: <https://github.com/stackpress/inquire> (accessed 2026-10-29).

## What Stackpress Is

Stackpress is a full-stack application framework with modern routing, React templating, SQL dialects, and an admin generator. It is server-side first, TypeScript/ESM/CJS, event-driven, pluggable, and unopinionated. It supports server and serverless deployment targets.

## Four Core Projects

Stackpress combines four open source projects:

- **Ingest** (<https://www.stackpress.io/ingest>): event-driven server/serverless framework owning routes, plugins, events, request handling, response handling, and adapter-style deployment surfaces. Documented deployment targets include AWS Lambda, GCP Functions, Azure, Netlify, and Vercel.
- **Inquire** (<https://www.stackpress.io/inquire>): lightweight TypeScript SQL query and schema builder. Supports MySQL, PostgreSQL, SQLite, PGlite, and PostgreSQL-compatible services including CockroachDB, Neon, Supabase, and Vercel Postgres.
- **Reactus** (<https://www.stackpress.io/reactus>): reactive React template engine used by the view layer.
- **Idea** (<https://www.stackpress.io/idea>): language specification and parser that transforms `schema.idea` declarations into generated schema, SQL, views, client code, and admin output.

## Built-in Stackpress Layer

On top of the four projects, Stackpress provides:

- authentication and session handling;
- roles and permissions;
- languages and translations;
- OAuth and RESTful API surfaces;
- administration dashboards.

## Source-to-App Loop

The primary source inputs in a Stackpress project are:

- `schema.idea`: application structure;
- `config/*`: boot and feature configuration;
- `plugins/*`: application behavior;
- `public/*`: browser-requestable assets.

The documented loop is: edit source input, run or inspect generated output when needed, then verify runtime behavior.

## Minimal Runtime Contract

The smallest useful Stackpress app is:

1. an npm project with `"type": "module"`;
2. a local plugin file with a default export receiving the HTTP server;
3. a route registered inside that plugin;
4. a `plugins` array in `package.json` pointing at the local plugin.

Example plugin:

```ts
import type { HttpServer } from 'stackpress/http';

export default function plugin(server: HttpServer) {
  server.get('/', ({ res }) => {
    res.set('text/plain', 'Hello Stackpress');
  });
}
```

Example package fields:

```json
{
  "type": "module",
  "plugins": ["./plugin"]
}
```

Run the development server with `npx stackpress develop -v`; the default URL is `http://localhost:3000/`. Verbose logs show the order: load package plugins, import plugin, register routes, serve requests.

## Full Project Template Shape

The repository's `templates/website` project is the current full-stack reference shape.

### Package Manifest

- `"type": "module"` and `"private": true`.
- Plugin list: `./plugins/app/plugin`, `./plugins/store/plugin`, and `stackpress`.
- Scripts:
  - `build`: `stackpress build --b config/build -v`
  - `dev`: `dotenv -e .env -- stackpress serve --b config/develop -v`
  - `emit`: `dotenv -e .env -- stackpress emit`
  - `generate`: `stackpress generate --b config/develop -v`
  - `migrate`: `dotenv -e .env -- stackpress migrate --b config/develop -v`
  - `populate`: `dotenv -e .env -- stackpress populate --b config/develop -v`
  - `preview`: `dotenv -e .env -- stackpress serve --b config/preview -v`
  - `purge`: `dotenv -e .env -- stackpress purge --b config/develop -v`
  - `push`: `dotenv -e .env -- stackpress push --b config/develop -v`
  - `query`: `dotenv -e .env -- stackpress query --b config/develop -v`
- At capture time the template pinned `stackpress` and `@stackpress/inquire-pglite` at `0.10.8`, React 19.2.4, and used PGlite as its default database.
- Dev tooling includes TypeScript, `tsx`, `ts-node`, `dotenv-cli`, Vite, UnoCSS, Prettier, `fast-glob`, `ts-morph`, and React type packages.

### Config

- `config/common.ts`: shared config for admin, API, auth, brand, CLI, client generation, cookies, database, email, language, server, session, and view.
- `config/develop.ts`: development config plus the HTTP bootstrap sequence: create server, set config, `bootstrap()`, then resolve `config`, `listen`, and `route`.
- `config/build.ts` and `config/client.ts`: production build and client-generation configuration.
- `tsconfig.json`: extends `stackpress/tsconfig/esm`, uses `nodenext` modules, outputs to `.build`, and includes `config/**/*.ts`, `plugins/**/*.ts`, and `plugins/**/*.tsx`.

### Plugins

- `plugins/app/plugin.ts`: registers application routes and views. It uses `server.import.get(...)` for handlers and `server.view.get(...)` for React views.
- `plugins/store/plugin.ts`: on `config`, connects and registers `database`; on `listen`, registers the `populate` event.
- `plugins/store/connect.ts`: current PGlite connection uses `stackpress/pglite` and `@electric-sql/pglite`, reads `DATABASE_URL`, and defaults to `./.build/database`.
- `plugins/store/populate.ts`: seeding logic.

### Schema, Environment, Assets

- `schema.idea` contains `use "stackpress/stackpress.idea"` and can be extended with application schema declarations.
- `.env.sample` contains `DATABASE_SEED` and `SESSION_SEED`.
- `public/*` stores static assets such as images, styles, and the favicon.

## Existing `stackpress create` Command

The Stackpress repository already ships a `create` command through `bin/stackpress.mjs`:

- Invocation documented in the repository README: `npx github:stackpress/stackpress create`.
- It copies the bundled scaffold at `skills/stackpress-app-scaffold/assets/template` into the current working directory.
- It requires the target directory to be empty, ignoring only `.DS_Store`.
- It derives the package name from the target folder name and validates npm package-name shape, length, and reserved names.
- It requires the template to contain `package.json` and a package-safe `gitignore`, then renames `gitignore` to `.gitignore`.
- It rewrites the copied `package.json` name to the folder-derived package name.
- It prints next steps: `yarn install`, `yarn generate`, `yarn push`, `yarn dev`.
- The same executable also routes non-create commands to the Stackpress runtime CLI and supports a `skills --target <codex|claude|opencode|path>` installer.

## Database Adapter Matrix

Inquire provides separate connection packages. The generated project must install the matching driver:

| Database | Inquire adapter | Driver package | Notes |
| --- | --- | --- | --- |
| CockroachDB | `@stackpress/inquire-pg` | `pg` | Primary CLI target. CockroachDB is PostgreSQL-compatible; Inquire's `with-crdb` example uses this adapter and driver. |
| PostgreSQL | `@stackpress/inquire-pg` | `pg` | Also covers PostgreSQL-compatible services such as Neon, Supabase, and Vercel Postgres. |
| MySQL | `@stackpress/inquire-mysql2` | `mysql2` | Uses `mysql2/promise`. |
| SQLite | `@stackpress/inquire-sqlite3` | `better-sqlite3` | Suitable for local/embedded use. |
| PGlite | `@stackpress/inquire-pglite` | `@electric-sql/pglite` | Current website-template default. |

The Inquire README lists **Node.js 22 or newer** and **yarn** as requirements. The Stackpress template scripts also assume yarn.

## Derived Implications for Scaffolding

These follow from the verified facts above; they are not yet accepted product decisions:

- A generated project must emit a `package.json` with `"type": "module"` and a valid `plugins` list, plus at least one local plugin with a default export.
- Database selection affects dependencies, the store `connect.ts` implementation, environment samples, and possibly database config.
- A full-stack scaffold needs the React/view stack; an API-only scaffold may omit some or all of it, but the exact boundary is unconfirmed.
- Compatibility behaviors worth considering from the existing `create` command: empty-directory enforcement, npm package-name validation, and `.gitignore` handling.
- The existing command already scaffolds one template. The new tool's differentiator is selectable project types and databases; how the two commands should relate is an open decision.
