import { Client } from 'pg';
import { connect as pgsql } from 'stackpress/pgsql';

const DEFAULT_DATABASE_URL =
  'postgres://root@localhost:26257/defaultdb?sslmode=disable';

// CockroachDB is PostgreSQL-compatible; use the PostgreSQL adapter.
export default async function connect() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || DEFAULT_DATABASE_URL
  });
  await client.connect();
  return pgsql(client);
}

