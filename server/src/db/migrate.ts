import { readFileSync } from 'fs';
import { join } from 'path';
import { getPool, closePool } from './connection';
import { getPool, closePool } from './connection.js';
import 'dotenv/config';

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
