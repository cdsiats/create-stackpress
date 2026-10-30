import type { Server } from 'stackpress/server';
import connect from './connect.js';

export default function plugin(server: Server) {
  // Keep one parameter so Stackpress treats this as an event handler,
  // not a lazy import action.
  server.on('config', async (_) => {
    server.register('database', await connect());
  });
}
