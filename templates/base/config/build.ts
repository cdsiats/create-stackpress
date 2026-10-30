//node
import path from 'node:path';
//modules
import unocss from 'unocss/vite';
//stackpress
import { server as http } from 'stackpress/http';
import { CLIENT_TEMPLATE, PAGE_TEMPLATE } from 'stackpress/view';
//config
import type { Config } from './common.js';
import * as common from './common.js';

export const config: Config = {
  server: {
    ...common.server,
    mode: 'production',
    build: common.build
  },
  view: {
    ...common.view,
    engine: {
      assetPath: path.join(common.assets, 'assets'),
      clientPath: path.join(common.assets, 'client'),
      clientTemplate: CLIENT_TEMPLATE,
      cssFiles: [
        'frui/frui.css',
        'stackpress/stackpress.css',
        'virtual:uno.css'
      ],
      pagePath: path.join(common.cwd, '.build/views'),
      pageTemplate: PAGE_TEMPLATE,
      plugins: [unocss()],
      vite: undefined
    }
  },
  ...(common.admin ? { admin: common.admin } : {}),
  ...(common.api ? { api: common.api } : {}),
  ...(common.auth ? { auth: common.auth } : {}),
  brand: common.brand,
  cli: common.cli,
  client: common.client,
  database: common.database,
  email: common.email,
  cookie: common.cookie,
  language: common.language,
  session: common.session,
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
