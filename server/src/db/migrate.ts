import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPool, closePool } from './connection.ts';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const pool = getPool();
  const migrationPath = join(__dirname, 'migrations', '001_initial.sql');
  const sql = readFileSync(migrationPath, 'utf-8');

  console.log('[DB] Running migration 001_initial.sql...');
  await pool.query(sql);
  console.log('[DB] Migration complete.');

  await closePool();
}

migrate().catch((err) => {
  console.error('[DB] Migration failed:', err);
  process.exit(1);
});
