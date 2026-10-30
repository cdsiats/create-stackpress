import mysql from 'mysql2/promise';
import { connect as mysqlAdapter } from 'stackpress/mysql';

const DEFAULT_DATABASE_URL = 'mysql://root:root@localhost:3306/app';

export default async function connect() {
  const connection = await mysql.createConnection(
    process.env.DATABASE_URL || DEFAULT_DATABASE_URL
  );
  return mysqlAdapter(connection);
}

