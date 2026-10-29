export const base = {
  files: {
    'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["config/**/*.ts", "plugins/**/*.ts", "plugins/**/*.tsx"]
}
`,
    'README.md': `# {{NAME}}

Generated proof project.

- Project type: {{TYPE_LABEL}}
- Database: {{DATABASE_LABEL}}
- Adapter: {{ADAPTER}}
- Driver: {{DRIVER}}
`,
    'AGENTS.md': `# Agent Notes

This project is a {{TYPE_LABEL}} Stackpress app using {{DATABASE_LABEL}}.

Run the generated project with the package manager commands in README.md.
`,
    '.env.sample': `SESSION_SEED=abc123
`,
    'plugins/app/plugin.ts': `import type { HttpServer } from 'stackpress/http';

export default function plugin(server: HttpServer) {
  server.get('/health', ({ res }) => {
    res.json({ ok: true, type: '{{TYPE}}', database: '{{DATABASE}}' });
  });
}
`,
    'plugins/store/plugin.ts': `import type { Server } from 'stackpress/server';
import connect from './connect.js';

export default function plugin(server: Server) {
  server.on('config', async () => {
    server.register('database', await connect());
  });
}
`
  },
  package: {
    scripts: {
      build: 'tsc -p tsconfig.json',
      dev: 'stackpress develop -v',
      generate: 'stackpress generate -v',
      push: 'stackpress push -v'
    },
    dependencies: {
      stackpress: '0.10.8'
    },
    devDependencies: {
      '@types/node': '25.3.5',
      tsx: '4.21.0',
      typescript: '5.9.3'
    },
    plugins: ['./plugins/app/plugin', './plugins/store/plugin']
  }
};

export const types = {
  'full-stack': {
    label: 'Full-stack',
    capabilities: ['views', 'admin', 'api', 'auth', 'database', 'content'],
    files: {
      'config/capabilities.ts': `export const capabilities = ['views', 'admin', 'api', 'auth', 'database', 'content'] as const;
`,
      'plugins/app/pages/home.ts': `export default function home() {
  return { title: 'Home' };
}
`,
      'plugins/app/views/home.tsx': `export default function HomeView() {
  return <main><h1>Home</h1></main>;
}
`,
      'plugins/admin/plugin.ts': `import type { Server } from 'stackpress/server';

export default function plugin(server: Server) {
  server.get('/admin', ({ res }) => res.json({ ok: true, area: 'admin' }));
}
`,
      'plugins/api/plugin.ts': `import type { Server } from 'stackpress/server';

export default function plugin(server: Server) {
  server.get('/api/health', ({ res }) => res.json({ ok: true, area: 'api' }));
}
`
    },
    package: {
      dependencies: {
        react: '19.2.4',
        'react-dom': '19.2.4'
      },
      plugins: ['./plugins/admin/plugin', './plugins/api/plugin']
    }
  },
  'api-only': {
    label: 'API-only',
    capabilities: ['api', 'auth', 'database'],
    files: {
      'config/capabilities.ts': `export const capabilities = ['api', 'auth', 'database'] as const;
`,
      'plugins/api/plugin.ts': `import type { Server } from 'stackpress/server';

export default function plugin(server: Server) {
  server.get('/api/health', ({ res }) => res.json({ ok: true, area: 'api' }));
}
`
    },
    package: {
      plugins: ['./plugins/api/plugin']
    }
  },
  'minimal': {
    label: 'Minimal/blank',
    capabilities: ['database'],
    files: {
      'config/capabilities.ts': `export const capabilities = ['database'] as const;
`
    },
    package: {}
  },
  'admin-only': {
    label: 'Admin-only',
    capabilities: ['admin', 'auth', 'database'],
    files: {
      'config/capabilities.ts': `export const capabilities = ['admin', 'auth', 'database'] as const;
`,
      'plugins/admin/plugin.ts': `import type { Server } from 'stackpress/server';

export default function plugin(server: Server) {
  server.get('/admin', ({ res }) => res.json({ ok: true, area: 'admin' }));
}
`
    },
    package: {
      plugins: ['./plugins/admin/plugin']
    }
  }
};

export const databases = {
  pglite: {
    label: 'PGlite',
    adapter: '@stackpress/inquire-pglite',
    driver: '@electric-sql/pglite',
    driverVersion: '0.3.15',
    env: 'DATABASE_URL=./.build/database',
    files: {
      'config/database.ts': `export const database = { provider: 'pglite', adapter: '{{ADAPTER}}' } as const;
`,
      'plugins/store/connect.ts': `import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { connect as pglite } from 'stackpress/pglite';

export default async function connect() {
  return pglite(async () => {
    const file = path.resolve(process.cwd(), process.env.DATABASE_URL || './.build/database');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return new PGlite(file);
  });
}
`
    },
    package: {
      dependencies: {
        '@electric-sql/pglite': '0.3.15',
        '@stackpress/inquire-pglite': '0.10.8'
      }
    }
  },
  postgres: {
    label: 'PostgreSQL',
    adapter: '@stackpress/inquire-pg',
    driver: 'pg',
    driverVersion: '8.16.3',
    env: 'DATABASE_URL=postgres://postgres:postgres@localhost:5432/app',
    files: {
      'config/database.ts': `export const database = { provider: 'postgres', adapter: '{{ADAPTER}}' } as const;
`,
      'plugins/store/connect.ts': `import { Client } from 'pg';
import { connect } from 'stackpress/pgsql';

export default async function connect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return connect(client);
}
`
    },
    package: {
      dependencies: {
        '@stackpress/inquire-pg': '0.10.8',
        pg: '8.16.3'
      },
      devDependencies: {
        '@types/pg': '8.16.0'
      }
    }
  },
  cockroachdb: {
    label: 'CockroachDB',
    adapter: '@stackpress/inquire-pg',
    driver: 'pg',
    driverVersion: '8.16.3',
    env: 'DATABASE_URL=postgres://root@localhost:26257/defaultdb?sslmode=disable',
    files: {
      'config/database.ts': `export const database = { provider: 'cockroachdb', adapter: '{{ADAPTER}}' } as const;
`,
      'plugins/store/connect.ts': `import { Client } from 'pg';
import { connect } from 'stackpress/pgsql';

// CockroachDB is PostgreSQL-compatible; use the PostgreSQL adapter.
export default async function connect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return connect(client);
}
`
    },
    package: {
      dependencies: {
        '@stackpress/inquire-pg': '0.10.8',
        pg: '8.16.3'
      },
      devDependencies: {
        '@types/pg': '8.16.0'
      }
    }
  },
  mysql: {
    label: 'MySQL',
    adapter: '@stackpress/inquire-mysql2',
    driver: 'mysql2',
    driverVersion: '3.15.3',
    env: 'DATABASE_URL=mysql://root:root@localhost:3306/app',
    files: {
      'config/database.ts': `export const database = { provider: 'mysql', adapter: '{{ADAPTER}}' } as const;
`,
      'plugins/store/connect.ts': `import mysql from 'mysql2/promise';
import { connect } from 'stackpress/mysql';

export default async function connect() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL as string);
  return connect(connection);
}
`
    },
    package: {
      dependencies: {
        '@stackpress/inquire-mysql2': '0.10.8',
        mysql2: '3.15.3'
      }
    }
  },
  sqlite: {
    label: 'SQLite',
    adapter: '@stackpress/inquire-sqlite3',
    driver: 'better-sqlite3',
    driverVersion: '12.4.1',
    env: 'DATABASE_URL=./.build/database.sqlite',
    files: {
      'config/database.ts': `export const database = { provider: 'sqlite', adapter: '{{ADAPTER}}' } as const;
`,
      'plugins/store/connect.ts': `import sqlite from 'better-sqlite3';
import { connect } from 'stackpress/sqlite';

export default async function connect() {
  return connect(sqlite(process.env.DATABASE_URL || './.build/database.sqlite'));
}
`
    },
    package: {
      dependencies: {
        '@stackpress/inquire-sqlite3': '0.10.8',
        'better-sqlite3': '12.4.1'
      },
      devDependencies: {
        '@types/better-sqlite3': '7.6.13'
      }
    }
  }
};
