import pg, { type PoolClient } from 'pg';

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 3, min: 0, idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000, statement_timeout: 15_000, application_name: 'ethiosms' });
  // Never log raw errors: driver messages can contain connection details or SQL values.
  pool.on('error', () => console.error('Database idle connection failed'));
  return pool;
}

export async function transaction<T>(pool: pg.Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
