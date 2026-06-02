import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as schema from './schema/index.js';
import 'dotenv/config';
import { databaseConfig } from './connection.js';

const pool = mysql.createPool({
  ...databaseConfig(),
  waitForConnections: true,
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: 'default' });
