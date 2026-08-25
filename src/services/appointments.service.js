import { query } from '../db/index.js';
import { ApiError } from '../lib/ApiError.js';
import { describeInstant, zonedToUtc, dayRangeUtc, rangeUtc } from '../lib/datetime.js';

const SELECT_BASE = `
  SELECT a.id, a.starts_at, a.status, a.notes, a.created_at, a.updated_at,
         c.id AS client_id, c.name AS client_name, c.email AS client_email, c.phone AS client_phone,
         s.id AS service_id, s.name AS service_name, s.duration_min, s.price_cents,
         u.id AS user_id, u.name AS user_name
    FROM appointments a
    JOIN clients  c ON c.id = a.client_id
    JOIN services s ON s.id = a.service_id
    JOIN users    u ON u.id = a.created_by_id
`;

const toAppointment = (row) => ({
  id: row.id,
  startsAt: row.starts_at,
  when: describeInstant(row.starts_at),
  status: row.status,
  notes: row.notes,
  client: {
    id: row.client_id,
    name: row.client_name,
    email: row.client_email,
    phone: row.client_phone,
  },
  service: {
    id: row.service_id,
    name: row.service_name,
    durationMin: row.duration_min,
    priceCents: row.price_cents,
  },
  createdBy: { id: row.user_id, name: row.user_name },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * A agenda. Aceita `date` (um dia) ou `from`+`to` (intervalo), sempre
 * interpretados no fuso da barbearia e convertidos para UTC na consulta.
 */
export async function list({ date, from, to, status, clientId } = {}) {
  let start = null;
  let end = null;

  if (date) ({ start, end } = dayRangeUtc(date));
  else if (from && to) ({ start, end } = rangeUtc(from, to));

  const { rows } = await query(
    `${SELECT_BASE}
      WHERE ($1::timestamptz IS NULL OR a.starts_at >= $1)
        AND ($2::timestamptz IS NULL OR a.starts_at <  $2)
        AND ($3::text IS NULL OR a.status::text = $3)
        AND ($4::uuid IS NULL OR a.client_id = $4)
      ORDER BY a.starts_at`,
    [start, end, status ?? null, clientId ?? null]
  );

  return rows.map(toAppointment);
}

export async function getById(id) {
  const { rows } = await query(`${SELECT_BASE} WHERE a.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Agendamento não encontrado.');
  return toAppointment(rows[0]);
}

async function assertReferencesExist(clientId, serviceId) {
  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM clients  WHERE id = $1) AS client,
       (SELECT COUNT(*)::int FROM services WHERE id = $2) AS service`,
    [clientId, serviceId]
  );
  if (rows[0].client === 0) throw ApiError.notFound('Cliente não encontrado.');
  if (rows[0].service === 0) throw ApiError.notFound('Serviço não encontrado.');
}

export async function create({ clientId, serviceId, date, time, notes }, userId) {
  await assertReferencesExist(clientId, serviceId);
  const startsAt = zonedToUtc(date, time);

  const { rows } = await query(
    `INSERT INTO appointments (starts_at, client_id, service_id, created_by_id, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [startsAt, clientId, serviceId, userId, notes ?? null]
  );

  return getById(rows[0].id);
}

export async function update(id, { clientId, serviceId, date, time, notes, status }) {
  await assertReferencesExist(clientId, serviceId);
  const startsAt = zonedToUtc(date, time);

  const { rows } = await query(
    `UPDATE appointments
        SET starts_at = $2, client_id = $3, service_id = $4,
            notes = $5, status = COALESCE($6::appointment_status, status)
      WHERE id = $1
      RETURNING id`,
    [id, startsAt, clientId, serviceId, notes ?? null, status ?? null]
  );

  if (!rows[0]) throw ApiError.notFound('Agendamento não encontrado.');
  return getById(id);
}

/** Troca so o status — um clique na agenda, sem abrir formulario. */
export async function updateStatus(id, status) {
  const { rows } = await query(
    `UPDATE appointments SET status = $2::appointment_status
      WHERE id = $1 RETURNING id`,
    [id, status]
  );
  if (!rows[0]) throw ApiError.notFound('Agendamento não encontrado.');
  return getById(id);
}

export async function remove(id) {
  const { rowCount } = await query('DELETE FROM appointments WHERE id = $1', [id]);
  if (rowCount === 0) throw ApiError.notFound('Agendamento não encontrado.');
}

/**
 * Responde a duas perguntas que o cliente fez na carta:
 * "quantos atendimentos foram feitos" e "quais serviços foram mais procurados".
 */
export async function summary({ from, to }) {
  const { start, end } = rangeUtc(from, to);

  const totals = await query(
    `SELECT status::text AS status, COUNT(*)::int AS total
       FROM appointments
      WHERE starts_at >= $1 AND starts_at < $2
      GROUP BY status`,
    [start, end]
  );

  const revenue = await query(
    `SELECT COALESCE(SUM(s.price_cents), 0)::int AS cents
       FROM appointments a
       JOIN services s ON s.id = a.service_id
      WHERE a.starts_at >= $1 AND a.starts_at < $2
        AND a.status = 'CONCLUIDO'`,
    [start, end]
  );

  const ranking = await query(
    `SELECT s.name,
            COUNT(*)::int AS total,
            COALESCE(SUM(s.price_cents) FILTER (WHERE a.status = 'CONCLUIDO'), 0)::int AS revenue_cents
       FROM appointments a
       JOIN services s ON s.id = a.service_id
      WHERE a.starts_at >= $1 AND a.starts_at < $2
        AND a.status <> 'CANCELADO'
      GROUP BY s.name
      ORDER BY total DESC, s.name`,
    [start, end]
  );

  const byStatus = Object.fromEntries(totals.rows.map((r) => [r.status, r.total]));

  return {
    period: { from, to },
    total: totals.rows.reduce((sum, r) => sum + r.total, 0),
    byStatus: {
      AGENDADO: byStatus.AGENDADO ?? 0,
      CONCLUIDO: byStatus.CONCLUIDO ?? 0,
      CANCELADO: byStatus.CANCELADO ?? 0,
      NAO_COMPARECEU: byStatus.NAO_COMPARECEU ?? 0,
    },
    revenueCents: revenue.rows[0].cents,
    topServices: ranking.rows.map((r) => ({
      name: r.name,
      total: r.total,
      revenueCents: r.revenue_cents,
    })),
  };
}
