//stackpress
import type {
  Trace,
  ServerConfigPageProps
} from 'stackpress/view/client';
import {
  LayoutBlank,
  useConfig,
  useLanguage,
  useResponse
} from 'stackpress/view/client';

export type ErrorConfig = {
  server: {
    mode: string;
    auth?: boolean;
  };
};

export type ErrorPageProps = ServerConfigPageProps<ErrorConfig>;

type ErrorTrace = Trace & {
  snippet?: Record<string, string | undefined>;
};

export function Head(props: ErrorPageProps) {
  const { request, response, styles = [] } = props;
  const { _ } = useLanguage();
  const url = request.url?.pathname || '/';
  const title = response.code === 404 ? _('Not Found') : _('Oops...');
  const description =
    response.code === 404
      ? _('The requested resource was not found.')
      : _('There was an error.');
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:image" content="/icon.png" />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:image" content="/icon.png" />
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link rel="stylesheet" type="text/css" href="/styles/global.css" />
      {styles.map((href, index) => (
        <link key={index} rel="stylesheet" type="text/css" href={href} />
      ))}
    </>
  );
}

export function Body() {
  const { _ } = useLanguage();
  const config = useConfig<ErrorConfig>();
  const response = useResponse();
  const production = config.path('server.mode', 'production') === 'production';
  const withAuth = config.path('server.auth', false);
  const notFound = response.code === 404;
  const title = notFound ? _('Not Found') : _('Oops...');
  const description = notFound
    ? _('The requested resource was not found.')
    : _(response.error || 'There was an error.');
  const stack = (response.stack || []) as ErrorTrace[];
  return (
    <main className="error-page">
      <div className="error-shell">
        <p className="error-code">{response.code || 500}</p>
        <h1 className="error-title">{title}</h1>
        <p className="error-description">{description}</p>
        <div className="error-actions">
          <a className="starter-action primary" href="/">
            {_('Back to home')}
          </a>
          {withAuth && (
            <a className="starter-action" href="/auth/signin">
              {_('Sign in')}
            </a>
          )}
        </div>
        {!production && !notFound && stack.length > 0 && (
          <section className="error-stack">
            <h2>{_('Stack trace')}</h2>
            {stack.map((trace, index) => (
              <article key={index} className="error-trace">
                <header>
                  <strong>
                    #{stack.length - Number(index)} {trace.method}
                  </strong>
                  <span>
                    {trace.file}:{trace.line}:{trace.char}
                  </span>
                </header>
                {trace.snippet && (
                  <div>
                    {trace.snippet.before && (
                      <pre>{trace.line - 1} | {trace.snippet.before}</pre>
                    )}
                    {trace.snippet.main && (
                      <pre>{trace.line} | {trace.snippet.main}</pre>
                    )}
                    {trace.snippet.location && (
                      <pre>{' '.repeat(String(trace.line).length + 3)}{trace.snippet.location}</pre>
                    )}
                    {trace.snippet.after && (
                      <pre>{trace.line + 1} | {trace.snippet.after}</pre>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

export function Page(props: ErrorPageProps) {
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
