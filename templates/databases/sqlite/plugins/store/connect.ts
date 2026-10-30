import fs from 'node:fs';
import path from 'node:path';
import sqlite from 'better-sqlite3';
import { connect as sqliteAdapter } from 'stackpress/sqlite';

const DEFAULT_DATABASE_URL = './.build/database.sqlite';

export default async function connect() {
  const file = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  fs.mkdirSync(path.dirname(path.resolve(process.cwd(), file)), {
    recursive: true
  });
  return sqliteAdapter(new sqlite(file));
}

