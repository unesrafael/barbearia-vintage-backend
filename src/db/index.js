import pg from 'pg';
import { env } from '../config/env.js';

// timestamptz volta como Date do Node (UTC). Não deixamos o driver
// converter para string, para não perder o fuso no caminho.
const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseUrl.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[db] erro inesperado no pool de conexoes:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Executa varias queries dentro de uma transacao. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await pool.end();
}
