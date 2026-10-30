//node
import path from 'node:path';
//modules
import type { ToastPosition } from 'react-toastify';
//types
import type {
  AdminConfig,
  APIType,
  ApiConfig,
  AuthConfig,
  Method
} from 'stackpress/types';
export type { Config } from 'stackpress/types';
export type Cascade = 'CASCADE' | 'RESTRICT' | 'SET NULL';

const type: string = '{{type}}';

//pathnames
export const cwd = process.cwd();
export const build = path.join(cwd, '.build');
export const assets = path.join(cwd, 'public');
export const modules = path.join(cwd, 'node_modules');

//environment variables
export const seed = {
  database: process.env.DATABASE_SEED || 'abc123',
  session: process.env.SESSION_SEED || 'abc123'
};

//csrf
export const csrf = {
  name: 'csrf'
};

export const brand = {
  name: '{{name}}',
  logo: '/logo.png',
  icon: '/icon.png',
  favicon: '/favicon.ico'
};

export const cli = {
  label: '[{{name}}]',
  idea: path.join(cwd, 'schema.idea')
};

export const client = {
  //whether to compile the client in `js` or `ts`
  lang: 'js',
  //used by `stackpress/client` to `import()` the generated client code
  module: '{{name}}-client',
  //name of the client package used in package.json
  package: '{{name}}-client',
  //where to store serialized idea json files for historical revisions
  revisions: path.join(build, 'revisions'),
  //where to store the generated client code
  build: path.join(cwd, 'node_modules', '{{name}}-client'),
  //what tsconfig file to base the TypeScript compiler on
  tsconfig: path.join(cwd, 'tsconfig.json')
};

export const cookie = {
  path: '/'
};

export const database = {
  //used to encrypt/decrypt data in the database
  seed: seed.database,
  //where to store create and alter table migration files
  migrations: path.join(build, 'migrations'),
  //cascading rules used when generating the database schema
  schema: {
    onDelete: 'CASCADE' as Cascade,
    onUpdate: 'RESTRICT' as Cascade
  }
};

export const email = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: 'username',
    pass: 'password'
  }
};

export const language = {
  //url flag used to change the user's locale; also the cookie name
  key: 'locale',
  //default locale
  locale: 'en_US',
  //languages and translations
  languages: {
    en_US: {
      label: 'EN',
      translations: {
        'Sign In': 'Signin',
        'Home Page': 'Home Page'
      }
    }
  }
};

export const server = {
  port: 3000,
  cwd
};

export const session = {
  //name of the session cookie
  key: 'session',
  //used to generate the session id
  seed: seed.session,
  access: {
    ADMIN: [
      { method: 'ALL', route: '/' },
      { method: 'ALL', route: '/auth/**' },
      { method: 'ALL', route: '/admin/**' },
      { method: 'ALL', route: '/api/**' }
    ],
    USER: [
      { method: 'ALL', route: '/' },
      { method: 'ALL', route: '/auth/**' },
      { method: 'ALL', route: '/api/**' }
    ],
    GUEST: [
      { method: 'ALL', route: '/' },
      { method: 'ALL', route: '/auth/**' },
      { method: 'ALL', route: '/api/**' }
    ]
  }
};

export const view = {
  //url flag used to disable template rendering and show raw json
  noview: 'json',
  //used by vite and in development mode to determine the project root
  base: '/',
  //frontend notification display settings
  notify: {
    position: 'bottom-center' as ToastPosition,
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: 'dark'
  }
};

//project-type feature sections
export const views = type === 'full-stack';

export const admin: AdminConfig | undefined =
  type === 'full-stack' || type === 'admin-only'
    ? {
        name: 'Admin',
        base: '/admin',
        menu: [
          {
            name: 'Profiles',
            icon: 'user',
            path: '/admin/profile/search',
            match: '/admin/profile'
          },
          {
            name: 'Auth',
            icon: 'lock',
            path: '/admin/auth/search',
            match: '/admin/auth'
          },
          {
            name: 'Apps',
            icon: 'laptop',
            path: '/admin/application/search',
            match: '/admin/application'
          },
          {
            name: 'Sessions',
            icon: 'coffee',
            path: '/admin/session/search',
            match: '/admin/session'
          }
        ]
      }
    : undefined;

export const api: ApiConfig | undefined =
  type === 'full-stack' || type === 'api-only'
    ? {
        expires: 1000 * 60 * 60 * 24 * 365,
        webhooks: [
          {
            event: 'auth-signout',
            uri: 'http://localhost:3000/api/webhook',
            method: 'POST' as Method,
            validity: {},
            data: {}
          }
        ],
        scopes: {
          user: {
            name: 'User API Service',
            description: 'Profile Endpoints'
          }
        },
        endpoints: [
          {
            method: 'GET' as Method,
            route: '/api/auth/search',
            type: 'public' as APIType,
            event: 'auth-search',
            cors: true,
            data: {}
          },
          {
            method: 'GET' as Method,
            route: '/api/profile/search',
            type: 'app' as APIType,
            scopes: ['user'],
            event: 'profile-search',
            data: {}
          },
          {
            method: 'GET' as Method,
            route: '/api/profile/detail/:id',
            type: 'app' as APIType,
            scopes: ['user'],
            event: 'profile-detail',
            data: {}
          },
          {
            method: 'GET' as Method,
            route: '/api/profile/get/:key/:value',
            type: 'app' as APIType,
            scopes: ['user'],
            event: 'profile-get',
            data: {}
          },
          {
            method: 'GET' as Method,
            route: '/api/my/address',
            type: 'session' as APIType,
            scopes: ['user'],
            event: 'profile-detail',
            data: {}
          },
          {
            method: 'GET' as Method,
            route: '/api/my/files',
            type: 'session' as APIType,
            scopes: ['user'],
            event: 'profile-detail',
            data: {}
          }
        ]
      }
    : undefined;

export const auth: AuthConfig | undefined =
  type === 'full-stack' || type === 'api-only' || type === 'admin-only'
    ? {
        base: '/auth',
        redirect: type === 'admin-only' ? '/admin' : '/',
        '2fa': { issuer: '{{name}}' },
        roles: ['USER'],
        username: true,
        email: true,
        phone: true,
        password: {
          min: 8,
          max: 32,
          upper: true,
          lower: true,
          number: true,
          special: true
        }
      }
    : undefined;
