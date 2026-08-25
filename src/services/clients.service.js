import { query } from '../db/index.js';
import { ApiError } from '../lib/ApiError.js';
import { describeInstant } from '../lib/datetime.js';

const toClient = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(row.appointments_count !== undefined
    ? { appointmentsCount: Number(row.appointments_count) }
    : {}),
});

export async function list({ q } = {}) {
  const term = q?.trim();
  const { rows } = await query(
    `SELECT c.*, COUNT(a.id) AS appointments_count
       FROM clients c
       LEFT JOIN appointments a ON a.client_id = c.id
      WHERE ($1::text IS NULL
             OR c.name  ILIKE '%' || $1 || '%'
             OR c.email ILIKE '%' || $1 || '%'
             OR c.phone ILIKE '%' || $1 || '%')
      GROUP BY c.id
      ORDER BY c.name`,
    [term || null]
  );
  return rows.map(toClient);
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM clients WHERE id = $1', [id]);
  if (!rows[0]) throw ApiError.notFound('Cliente não encontrado.');
  return toClient(rows[0]);
}

/** Detalhe da ficha: dados + histórico de agendamentos, do mais recente ao mais antigo. */
export async function getWithHistory(id) {
  const client = await getById(id);
  const { rows } = await query(
    `SELECT a.id, a.starts_at, a.status, s.name AS service_name, s.price_cents
       FROM appointments a
       JOIN services s ON s.id = a.service_id
      WHERE a.client_id = $1
      ORDER BY a.starts_at DESC
      LIMIT 50`,
    [id]
  );

  return {
    ...client,
    appointments: rows.map((row) => ({
      id: row.id,
      status: row.status,
      service: { name: row.service_name, priceCents: row.price_cents },
      startsAt: row.starts_at,
      when: describeInstant(row.starts_at),
    })),
  };
}

export async function create({ name, email, phone, notes }) {
  const { rows } = await query(
    `INSERT INTO clients (name, email, phone, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, email, phone ?? null, notes ?? null]
  );
  return toClient(rows[0]);
}

export async function update(id, { name, email, phone, notes }) {
  const { rows } = await query(
    `UPDATE clients
        SET name = $2, email = $3, phone = $4, notes = $5
      WHERE id = $1
      RETURNING *`,
    [id, name, email, phone ?? null, notes ?? null]
  );
  if (!rows[0]) throw ApiError.notFound('Cliente não encontrado.');
  return toClient(rows[0]);
}

export async function remove(id) {
  // Regra de negocio: não se apaga um cliente com horário marcado no futuro.
  const { rows: future } = await query(
    `SELECT COUNT(*)::int AS total
       FROM appointments
      WHERE client_id = $1
        AND status = 'AGENDADO'
        AND starts_at >= now()`,
    [id]
  );

  if (future[0].total > 0) {
    throw ApiError.conflict(
      'CLIENTE_COM_AGENDAMENTO',
      'Este cliente tem horário marcado. Cancele o agendamento antes de remover.'
    );
  }

  const { rowCount } = await query('DELETE FROM clients WHERE id = $1', [id]);
  if (rowCount === 0) throw ApiError.notFound('Cliente não encontrado.');
}

/** Quantos atendimentos o cliente já teve — usado pela automação do n8n. */
export async function countAppointments(clientId, { excludeId } = {}) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total
       FROM appointments
      WHERE client_id = $1 AND ($2::uuid IS NULL OR id <> $2)`,
    [clientId, excludeId ?? null]
  );
  return rows[0].total;
}
