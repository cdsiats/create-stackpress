import { Client } from 'pg';
import { connect as pgsql } from 'stackpress/pgsql';

const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/app';

export default async function connect() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || DEFAULT_DATABASE_URL
  });
  await client.connect();
  return pgsql(client);
}

