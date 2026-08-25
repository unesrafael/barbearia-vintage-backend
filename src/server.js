import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool, closePool } from './db/index.js';

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('[db] conectado');
  } catch (error) {
    console.error('[db] não foi possível conectar:', error.message);
    console.error('     Confira DATABASE_URL no .env e se o Postgres está no ar.');
    process.exit(1);
  }

  const server = createApp().listen(env.port, () => {
    console.log(`\n  Barbearia Vintage — API`);
    console.log(`  http://localhost:${env.port}`);
    console.log(`  fuso: ${env.timezone}`);
    console.log(
      `  n8n: ${env.n8n.webhookUrl ? 'configurado' : 'não configurado (disparos so no log)'}\n`
    );
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} recebido, encerrando...`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
