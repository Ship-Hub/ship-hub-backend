import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL!,
  multipleStatements: true,
});

const db = drizzle(connection);

console.log('Running migrations...');
await migrate(db, { migrationsFolder: './src/db/migrations' });
console.log('Migrations complete.');

await connection.end();
