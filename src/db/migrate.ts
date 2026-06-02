import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import 'dotenv/config';
import { databaseConfig } from './connection.js';

const connection = await mysql.createConnection({
  ...databaseConfig(),
  multipleStatements: true,
});

const db = drizzle(connection);

console.log('Running migrations...');
await migrate(db, { migrationsFolder: './src/db/migrations' });
console.log('Migrations complete.');

await connection.end();
