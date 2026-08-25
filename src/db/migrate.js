/**
 * Runner de migrations. Le os arquivos .sql de db/migrations em ordem
 * alfabetica e aplica os que ainda não foram registrados.
 *
 *   npm run migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'db', 'migrations');

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await pool.query('SELECT name FROM _migrations')).rows.map((r) => r.name)
  );

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  = ${file} (já aplicada)`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  + ${file} aplicada`);
      count += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`  ! falha em ${file}: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(
    count === 0 ? 'Banco já estava atualizado.' : `${count} migration(s) aplicada(s).`
  );
}

run()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
