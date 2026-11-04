//modules
import type { ServerConfigPageProps } from 'stackpress/view/client';
import {
  LayoutBlank,
  useConfig,
  useResponse,
  useSession,
  useTheme
} from 'stackpress/view/client';
import { useLanguage } from 'r22n';

const DOCS_URL = 'https://www.stackpress.io/guides/002-getting-started';
const ADMIN_URL = '/admin/profile/search';

type StarterConfig = {
  brand?: { name?: string; logo?: string };
  starter?: {
    type?: string;
    typeLabel?: string;
    database?: string;
    databaseLabel?: string;
    packageManager?: string;
    admin?: boolean;
    auth?: boolean;
    api?: boolean;
  };
};

export function Body() {
  const response = useResponse<{ title: string }>();
  const config = useConfig<StarterConfig>();
  const session = useSession();
  const { theme, toggle: toggleTheme } = useTheme();
  const starter = config.path<NonNullable<StarterConfig['starter']>>(
    'starter',
    {}
  );
  const authenticated = Boolean(session.data.id);
  const brandName = config.path('brand.name', '{{name}}');
  const brandLogo = config.path('brand.logo', '/logo.png');
  const title = response.results?.title || `Welcome to ${brandName}`;
  const runCommand = (script: string) =>
    `${starter.packageManager || 'npm'} run ${script}`;
  return (
    <main className="starter">
      <div className="starter-shell">
        <section className="starter-hero">
          <img className="starter-logo" src={brandLogo} alt={brandName} />
          <p className="starter-eyebrow">Stackpress starter</p>
          <h1 className="starter-title">{title}</h1>
          <p className="starter-lead">
            Your app is running. Edit{' '}
            <code>plugins/app/views/home.tsx</code> and save to see changes.
          </p>
          <div className="starter-actions">
            {starter.admin && (
              <a className="starter-action primary" href={ADMIN_URL}>
                <i className="fas fa-gauge-high" /> Open admin
              </a>
            )}
            {starter.auth &&
              (authenticated ? (
                <a className="starter-action" href="/auth/signout">
                  <i className="fas fa-right-from-bracket" /> Sign out
                </a>
              ) : (
                <a className="starter-action" href="/auth/signin">
                  <i className="fas fa-right-to-bracket" /> Sign in
                </a>
              ))}
            <a
              className="starter-action"
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
            >
              <i className="fas fa-book-open" /> Read the docs
            </a>
            <button
              type="button"
              className="starter-action"
              onClick={() => toggleTheme()}
            >
              <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />{' '}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </section>

        <section className="starter-grid">
          {starter.admin && (
            <article className="starter-card">
              <div className="starter-card-icon">
                <i className="fas fa-gauge-high" />
              </div>
              <h2>Admin</h2>
              <p>
                Manage profiles, auth records, apps, and sessions from the
                generated admin.
              </p>
              <a href={ADMIN_URL}>
                Open admin <i className="fas fa-arrow-right" />
              </a>
            </article>
          )}
          {starter.auth && (
            <article className="starter-card">
              <div className="starter-card-icon">
                <i className="fas fa-lock" />
              </div>
              <h2>Authentication</h2>
              <p>
                Sign in with a username, email address, or phone number, or
                create a new account.
              </p>
              <a href="/auth/signin">
                Choose a sign-in method <i className="fas fa-arrow-right" />
              </a>
            </article>
          )}
          {starter.api && (
            <article className="starter-card">
              <div className="starter-card-icon">
                <i className="fas fa-code" />
              </div>
              <h2>API</h2>
              <p>
                Call the generated JSON endpoints with public, app, and session
                access types.
              </p>
              <a href="/api/auth/search">
                Try an endpoint <i className="fas fa-arrow-right" />
              </a>
            </article>
          )}
          <article className="starter-card">
            <div className="starter-card-icon">
              <i className="fas fa-database" />
            </div>
            <h2>Database</h2>
            <p>
              This project uses{' '}
              <strong>{starter.databaseLabel || 'the configured database'}</strong>.
              Update <code>config/common.ts</code> and{' '}
              <code>plugins/store/connect.ts</code> to change it.
            </p>
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              Database guides <i className="fas fa-arrow-right" />
            </a>
          </article>
        </section>

        <section className="starter-next">
          <h2>Next steps</h2>
          <ol>
            <li>
              <div>
                <code>{runCommand('generate')}</code>
                <p>Generate the schema and client artifacts.</p>
              </div>
            </li>
            <li>
              <div>
                <code>{runCommand('push')}</code>
                <p>Apply the schema to your database.</p>
              </div>
            </li>
            {starter.auth && (
              <li>
                <div>
                  <code>{runCommand('populate')}</code>
                  <p>Seed the default admin account.</p>
                </div>
              </li>
            )}
            <li>
              <div>
                <code>{runCommand('dev')}</code>
                <p>Start the development server and edit this page.</p>
              </div>
            </li>
          </ol>
        </section>

        <footer className="starter-footer">
          <span>{brandName} · Stackpress</span>
          <span>
            {starter.typeLabel || starter.type || 'Full-stack'} ·{' '}
            {starter.databaseLabel || starter.database || 'database'}
          </span>
        </footer>
      </div>
    </main>
  );
}

export function Head(props: ServerConfigPageProps) {
  const { styles = [] } = props;
  const { _ } = useLanguage();
  return (
    <>
      <title>{_('Welcome to {{name}}')}</title>
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link rel="stylesheet" type="text/css" href="/styles/global.css" />
      {styles.map((href, index) => (
        <link key={index} rel="stylesheet" type="text/css" href={href} />
      ))}
    </>
  );
}

export function Page(props: ServerConfigPageProps) {
  const { data, session, request, response } = props;
  return (
    <LayoutBlank
      data={data}
      session={session}
      request={request}
      response={response}
    >
      <Body />
    </LayoutBlank>
  );
}

export default Page;
