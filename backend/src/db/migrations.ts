import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type pg from 'pg';
import { transaction } from './pool.js';

export const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
export async function readMigrations(directory = migrationDirectory) {
  const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!names.length) throw new Error('No database migrations found');
  if (new Set(names.map(name => name.slice(0,3))).size !== names.length) throw new Error('Duplicate migration version');
  return Promise.all(names.map(async name => {
    const sql = await readFile(join(directory,name),'utf8');
    return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}
export async function migrate(pool: pg.Pool, directory = migrationDirectory): Promise<string[]> {
  const migrations = await readMigrations(directory);
  return transaction(pool, async client => {
    // Transaction-level lock survives transaction pooling and releases at commit/rollback.
    await client.query('SELECT pg_advisory_xact_lock(174962, 1)');
    await client.query(`CREATE TABLE IF NOT EXISTS public.ethiosms_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = await client.query<{name:string; checksum:string}>('SELECT name,checksum FROM public.ethiosms_migrations ORDER BY name');
    if (applied.rows.some((row,i) => row.name !== migrations[i]?.name || row.checksum !== migrations[i]?.checksum)) {
      throw new Error('Applied migration history differs from source; restore matching files before continuing');
    }
    const pending = migrations.slice(applied.rows.length);
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query('INSERT INTO public.ethiosms_migrations(name,checksum) VALUES ($1,$2)',[migration.name,migration.checksum]);
    }
    return pending.map(item => item.name);
  });
}
export async function databaseReady(pool: pg.Pool): Promise<boolean> {
  const expected = await readMigrations();
  const result = await pool.query<{name:string; checksum:string}>('SELECT name,checksum FROM public.ethiosms_migrations ORDER BY name');
  return result.rows.length === expected.length && expected.every((item,i) => item.name === result.rows[i]?.name && item.checksum === result.rows[i]?.checksum);
}
