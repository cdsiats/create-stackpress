import type { HttpServer } from 'stackpress/http';

export default function api(server: HttpServer) {
  server.get('/api', ({ res }) => {
    res.set('application/json', JSON.stringify({ preset: '{{type}}' }));
  });
}
