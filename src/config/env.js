import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Copie o .env.example para .env e preencha.`
    );
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3333),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  // Fuso usado para interpretar e exibir horários na borda da aplicacao.
  // O banco guarda tudo em UTC.
  timezone: process.env.TIMEZONE ?? 'America/Sao_Paulo',

  // Automação. Se a URL estiver vazia o disparo e apenas registrado no log,
  // o que mantem o sistema utilizavel sem o n8n no ar.
  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL ?? '',
    secret: process.env.N8N_WEBHOOK_SECRET ?? '',
    timeoutMs: Number(process.env.N8N_TIMEOUT_MS ?? 5000),
  },
};
