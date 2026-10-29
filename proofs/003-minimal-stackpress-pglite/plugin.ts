import type { HttpServer } from 'stackpress/http';

export default function plugin(server: HttpServer) {
  server.get('/health', async ({ res, ctx }) => {
    const result: {
      ok: boolean;
      database: string;
      query?: unknown;
      error?: string;
    } = {
      ok: true,
      database: 'not-registered'
    };

    try {
      const engine = (ctx as unknown as {
        plugin: (name: string) => {
          query: (sql: string) => Promise<unknown>;
        };
      }).plugin('database');
      result.database = 'registered';
      result.query = await engine.query('SELECT 1 as ok');
    } catch (error) {
      result.database = 'error';
      result.error = error instanceof Error ? error.message : String(error);
    }

    res.json(result);
  });
}
