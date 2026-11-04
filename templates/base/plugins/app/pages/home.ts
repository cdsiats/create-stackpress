//modules
import { action } from '@stackpress/ingest';
import { setViewProps } from 'stackpress/view';

const type = '{{type}}';
const database = '{{database}}';
const packageManager = '{{packageManager}}';

const TYPE_LABELS: Record<string, string> = {
  'full-stack': 'Full-stack',
  'api-only': 'API-only',
  minimal: 'Minimal',
  'admin-only': 'Admin-only'
};

const DATABASE_LABELS: Record<string, string> = {
  pglite: 'PGlite',
  postgres: 'PostgreSQL',
  cockroachdb: 'CockroachDB',
  mysql: 'MySQL',
  sqlite: 'SQLite'
};

export default action(async function HomePage({ req, res, ctx }) {
  //pass brand, language, and view props to the template layer
  setViewProps(req, res, ctx);
  //describe the selected preset for the starter page
  res.data.set('starter', {
    type,
    typeLabel: TYPE_LABELS[type] ?? type,
    database,
    databaseLabel: DATABASE_LABELS[database] ?? database,
    packageManager,
    admin: ctx.config.has('admin'),
    auth: ctx.config.has('auth'),
    api: ctx.config.has('api')
  });
  //render the starter page title from the configured brand
  res.results({
    title: `Welcome to ${ctx.config.path('brand.name', '{{name}}')}`
  });
});
