/**
 * Teste de integracao de ponta a ponta.
 *
 * Sobe a API numa porta livre, sobe um n8n falso para provar que o webhook
 * dispara, e exercita o fluxo inteiro contra o Postgres real.
 *
 *   npm run test:api
 *
 * Pre-requisito: banco migrado (npm run migrate).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// O n8n falso precisa existir antes de a configuracao ser lida.
const webhookCalls = [];
const fakeN8n = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    webhookCalls.push({ headers: req.headers, body: JSON.parse(body || '{}') });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
});

let baseUrl;
let token;
let server;
let closePool;

const api = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
};

before(async () => {
  await new Promise((resolve) => fakeN8n.listen(0, '127.0.0.1', resolve));
  process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${fakeN8n.address().port}/webhook/teste`;
  process.env.N8N_WEBHOOK_SECRET = 'segredo-de-teste';
  process.env.JWT_SECRET ||= 'chave-de-teste';

  const { createApp } = await import('../src/app.js');
  ({ closePool } = await import('../src/db/index.js'));

  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  fakeN8n.close();
  await closePool?.();
});

// ---------------------------------------------------------------

test('rota protegida recusa acesso sem token', async () => {
  const { status, body } = await api('/clients');
  assert.equal(status, 401);
  assert.equal(body.error.code, 'NAO_AUTENTICADO');
});

test('login com senha errada nao vaza informacao', async () => {
  const { status, body } = await api('/auth/login', {
    method: 'POST',
    body: { email: 'marcelo@barbeariavintage.com', password: 'senha-errada' },
  });
  assert.equal(status, 401);
  assert.equal(body.error.message, 'E-mail ou senha incorretos.');
});

test('login valido devolve token e usuario', async () => {
  const { status, body } = await api('/auth/login', {
    method: 'POST',
    body: { email: 'marcelo@barbeariavintage.com', password: 'vintage123' },
  });
  assert.equal(status, 200);
  assert.ok(body.token);
  assert.equal(body.user.email, 'marcelo@barbeariavintage.com');
  assert.equal(body.user.passwordHash, undefined, 'nunca devolver o hash');
  token = body.token;
});

test('/auth/me confirma a sessao', async () => {
  const { status, body } = await api('/auth/me');
  assert.equal(status, 200);
  assert.equal(body.user.name, 'Marcelo Andrade');
});

// ---------------------------------------------------------------

let clientId;
let serviceId;

test('cadastro de cliente valida o e-mail', async () => {
  const { status, body } = await api('/clients', {
    method: 'POST',
    body: { name: 'Teste Sem Email', email: 'nao-e-email' },
  });
  assert.equal(status, 422);
  assert.equal(body.error.code, 'DADOS_INVALIDOS');
  assert.equal(body.error.details[0].field, 'email');
});

test('cria, busca, edita e lista cliente', async () => {
  const created = await api('/clients', {
    method: 'POST',
    body: {
      name: 'Cliente De Teste',
      email: 'cliente.teste@exemplo.com',
      phone: '(11) 91234-5678',
      notes: 'Criado pelo teste automatizado.',
    },
  });
  assert.equal(created.status, 201);
  clientId = created.body.id;

  const search = await api('/clients?q=Cliente De Teste');
  assert.equal(search.status, 200);
  assert.equal(search.body.length, 1);

  const edited = await api(`/clients/${clientId}`, {
    method: 'PUT',
    body: { name: 'Cliente De Teste', email: 'novo.email@exemplo.com' },
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.email, 'novo.email@exemplo.com');
});

test('cria servico', async () => {
  const { status, body } = await api('/services', {
    method: 'POST',
    body: { name: 'Servico De Teste', durationMin: 30, priceCents: 4500 },
  });
  assert.equal(status, 201);
  assert.equal(body.priceCents, 4500);
  serviceId = body.id;
});

// ---------------------------------------------------------------

let appointmentId;
const FUTURE_DATE = '2030-03-14';

test('cria agendamento e dispara a automacao', async () => {
  const { status, body } = await api('/appointments', {
    method: 'POST',
    body: { clientId, serviceId, date: FUTURE_DATE, time: '14:30' },
  });

  assert.equal(status, 201);
  assert.equal(body.status, 'AGENDADO');
  assert.equal(body.client.id, clientId);
  appointmentId = body.id;

  // Horario guardado em UTC, exibido no fuso da barbearia (UTC-3).
  assert.equal(body.when.date, FUTURE_DATE);
  assert.equal(body.when.time, '14:30');
  assert.equal(body.startsAt, '2030-03-14T17:30:00.000Z');

  // O disparo e assincrono: espera a chamada chegar no n8n falso.
  const deadline = Date.now() + 3000;
  while (webhookCalls.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }

  assert.equal(webhookCalls.length, 1, 'o webhook do n8n deveria ter sido chamado');
  const call = webhookCalls[0];
  assert.equal(call.headers['x-webhook-secret'], 'segredo-de-teste');
  assert.equal(call.body.event, 'appointment.created');
  assert.equal(call.body.client.email, 'novo.email@exemplo.com');
  assert.equal(call.body.appointment.time, '14:30');
  assert.equal(call.body.analysis.isFirstVisit, true);
  assert.equal(call.body.service.priceFormatted.includes('45,00'), true);
});

test('horario duplicado e recusado com 409', async () => {
  const { status, body } = await api('/appointments', {
    method: 'POST',
    body: { clientId, serviceId, date: FUTURE_DATE, time: '14:30' },
  });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'HORARIO_OCUPADO');
  assert.match(body.error.message, /Já existe um agendamento neste horário/);
});

test('a agenda do dia vem ordenada por horario', async () => {
  await api('/appointments', {
    method: 'POST',
    body: { clientId, serviceId, date: FUTURE_DATE, time: '09:00' },
  });

  const { status, body } = await api(`/appointments?date=${FUTURE_DATE}`);
  assert.equal(status, 200);
  assert.equal(body.length, 2);
  assert.deepEqual(body.map((a) => a.when.time), ['09:00', '14:30']);
});

test('troca de status em um clique', async () => {
  const { status, body } = await api(`/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    body: { status: 'CONCLUIDO' },
  });
  assert.equal(status, 200);
  assert.equal(body.status, 'CONCLUIDO');
});

test('status invalido e recusado', async () => {
  const { status } = await api(`/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    body: { status: 'INVENTADO' },
  });
  assert.equal(status, 422);
});

test('cancelar libera o horario para um novo agendamento', async () => {
  await api(`/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    body: { status: 'CANCELADO' },
  });

  const retry = await api('/appointments', {
    method: 'POST',
    body: { clientId, serviceId, date: FUTURE_DATE, time: '14:30' },
  });
  assert.equal(retry.status, 201, 'horario cancelado deve voltar a ficar livre');

  await api(`/appointments/${retry.body.id}`, { method: 'DELETE' });
});

test('cliente com horario futuro nao pode ser removido', async () => {
  const { status, body } = await api(`/clients/${clientId}`, { method: 'DELETE' });
  assert.equal(status, 409);
  assert.equal(body.error.code, 'CLIENTE_COM_AGENDAMENTO');
});

test('resumo do periodo conta atendimentos e ranking de servicos', async () => {
  const { status, body } = await api(
    `/appointments/summary?from=${FUTURE_DATE}&to=${FUTURE_DATE}`
  );
  assert.equal(status, 200);
  assert.ok(body.total >= 1);
  assert.ok(Array.isArray(body.topServices));
  assert.equal(typeof body.revenueCents, 'number');
});

test('id inexistente devolve 404 e id malformado devolve 422', async () => {
  const missing = await api('/appointments/00000000-0000-4000-8000-000000000000');
  assert.equal(missing.status, 404);

  const malformed = await api('/appointments/abc');
  assert.equal(malformed.status, 422);
});

// ---------------------------------------------------------------

test('limpeza: remove os dados criados pelo teste', async () => {
  const list = await api(`/appointments?date=${FUTURE_DATE}`);
  for (const appointment of list.body) {
    await api(`/appointments/${appointment.id}`, { method: 'DELETE' });
  }
  assert.equal((await api(`/clients/${clientId}`, { method: 'DELETE' })).status, 204);
  assert.equal((await api(`/services/${serviceId}`, { method: 'DELETE' })).status, 204);
});
