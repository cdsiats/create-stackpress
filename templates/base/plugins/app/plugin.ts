//modules
import type { HttpServer } from '@stackpress/ingest';
import { type Config, views } from '../../config/common.js';

export default function plugin(server: HttpServer<Config>) {
  server.on('listen', async _ => {
    //log terminal errors and render the global error page for HTTP errors
    server.on('error', ({ req, res }) => {
      //if there is already a body
      if (res.body) return;
      if (req.mimetype === 'terminal/arguments') {
        console.log('CLI Error:', res.toStatusResponse());
        return;
      }
    });
    server.on('error', () => import('./pages/error.js'));
    //on response, check for errors that still need a response body
    server.on('response', async ({ req, res, ctx }) => {
      if (res.error && !res.body) {
        await ctx.emit('error', req, res);
      }
    });
  });
  server.on('route', async _ => {
    server.import.get('/', () => import('./pages/home.js'));
    if (views) {
      server.view.get('/', '@/plugins/app/views/home');
    }
    //register the error page and view so production builds include the template
    server.import.get('/error', () => import('./pages/error.js'));
    server.view.get('/error', '@/plugins/app/views/error');
  });
}
