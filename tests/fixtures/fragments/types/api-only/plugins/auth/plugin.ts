import type { HttpServer } from 'stackpress/http';

export default function auth(server: HttpServer) {
  server.get('/auth', ({ res }) => {
    res.set('text/plain', 'auth enabled for {{name}}');
  });
}
