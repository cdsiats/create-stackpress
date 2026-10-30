import type { HttpServer } from 'stackpress/http';

export default function app(server: HttpServer) {
  server.get('/', ({ res }) => {
    res.set('text/plain', 'Hello from {{name}}');
  });
}
