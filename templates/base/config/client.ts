//node
import path from 'node:path';
//modules
import unocss from 'unocss/vite';
//stackpress
import { server as http } from 'stackpress/http';
import { CLIENT_TEMPLATE, DOCUMENT_TEMPLATE } from 'stackpress/view';
//config
import type { Config } from './common.js';
import * as common from './common.js';

export const config: Config = {
  client: {
    ...common.client,
    lang: 'ts',
    module: 'client-source',
    package: 'client-source',
    build: path.join(common.cwd, 'client-source')
  },
  server: {
    ...common.server,
    mode: 'development',
    build: common.build
  },
  view: {
    ...common.view,
    engine: {
      basePath: '/',
      clientRoute: '/client',
      clientTemplate: CLIENT_TEMPLATE,
      cssFiles: [
        'frui/frui.css',
        'stackpress/stackpress.css',
        'virtual:uno.css'
      ],
      documentTemplate: DOCUMENT_TEMPLATE,
      plugins: [unocss()],
      vite: undefined,
      watchIgnore: []
    }
  },
  session: {
    ...common.session,
    access: {
      ADMIN: [
        ...common.session.access.ADMIN,
        { method: 'ALL', route: '/@vite/client' },
        { method: 'ALL', route: '/@react-refresh' },
        { method: 'ALL', route: '/@fs/**' },
        { method: 'ALL', route: '/node_modules/**' },
        { method: 'ALL', route: '/__uno.css' },
        { method: 'ALL', route: '/plugins/**' },
        { method: 'ALL', route: '/react.svg' },
        { method: 'GET', route: '/assets/**' },
        { method: 'GET', route: '/client/**' },
        { method: 'GET', route: '/images/**' },
        { method: 'GET', route: '/styles/**' },
        { method: 'GET', route: '/favicon.ico' },
        { method: 'GET', route: '/favicon.png' }
      ],
      USER: [
        ...common.session.access.USER,
        { method: 'ALL', route: '/@vite/client' },
        { method: 'ALL', route: '/@react-refresh' },
        { method: 'ALL', route: '/@fs/**' },
        { method: 'ALL', route: '/node_modules/**' },
        { method: 'ALL', route: '/__uno.css' },
        { method: 'ALL', route: '/plugins/**' },
        { method: 'ALL', route: '/react.svg' },
        { method: 'GET', route: '/assets/**' },
        { method: 'GET', route: '/client/**' },
        { method: 'GET', route: '/images/**' },
        { method: 'GET', route: '/styles/**' },
        { method: 'GET', route: '/favicon.ico' },
        { method: 'GET', route: '/favicon.png' }
      ],
      GUEST: [
        ...common.session.access.GUEST,
        { method: 'ALL', route: '/@vite/client' },
        { method: 'ALL', route: '/@react-refresh' },
        { method: 'ALL', route: '/@fs/**' },
        { method: 'ALL', route: '/node_modules/**' },
        { method: 'ALL', route: '/__uno.css' },
        { method: 'ALL', route: '/plugins/**' },
        { method: 'ALL', route: '/react.svg' },
        { method: 'GET', route: '/assets/**' },
        { method: 'GET', route: '/client/**' },
        { method: 'GET', route: '/images/**' },
        { method: 'GET', route: '/styles/**' },
        { method: 'GET', route: '/favicon.ico' },
        { method: 'GET', route: '/favicon.png' }
      ]
    }
  },
  ...(common.admin ? { admin: common.admin } : {}),
  ...(common.api ? { api: common.api } : {}),
  ...(common.auth ? { auth: common.auth } : {}),
  brand: common.brand,
  cli: common.cli,
  client: common.client,
  cookie: common.cookie,
  database: common.database,
  email: common.email,
  language: common.language,
  csrf: common.csrf
};

export default async function bootstrap() {
  const server = http();
  server.config.set(config);
  await server.bootstrap();
  await server.resolve('config');
  await server.resolve('listen');
  await server.resolve('route');
  return server;
}
