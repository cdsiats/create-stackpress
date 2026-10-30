import type { Server } from 'stackpress/server';

export default async function connect() {
  return {
    query: async (_sql: string) => [{ ok: 1 }]
  };
}

export function register(server: Server) {
  server.on('config', async (_) => {
    server.register('database', await connect());
  });
}
