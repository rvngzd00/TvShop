import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === 'test' ? 3 : 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'daily-baku-api',
  // Docker-da PostgreSQL private şəbəkədə SSL-siz işləyir. Xarici managed
  // database istifadə edilərsə DATABASE_SSL=require ilə açıq aktivləşdirilir.
  ssl: env.DATABASE_SSL === 'require'
    ? { rejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED }
    : false
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
