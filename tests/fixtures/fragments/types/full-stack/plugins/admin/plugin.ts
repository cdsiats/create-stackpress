import type { HttpServer } from 'stackpress/http';

export default function admin(server: HttpServer) {
  server.get('/admin', ({ res }) => {
    res.set('text/plain', '{{name}} admin');
  });
}
