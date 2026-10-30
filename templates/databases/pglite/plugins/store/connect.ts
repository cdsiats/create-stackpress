import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { connect as pglite } from 'stackpress/pglite';

export default async function connect() {
  return pglite(async () => {
    const file = path.resolve(
      process.cwd(),
      process.env.DATABASE_URL || './.build/database'
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return new PGlite(file);
  });
}

