import { query } from '../db/index.js';
import { ApiError } from '../lib/ApiError.js';

const toService = (row) => ({
  id: row.id,
  name: row.name,
  durationMin: row.duration_min,
  priceCents: row.price_cents,
  active: row.active,
  createdAt: row.created_at,
});

export async function list({ includeInactive = false } = {}) {
  const { rows } = await query(
    `SELECT * FROM services
      WHERE ($1::boolean IS TRUE OR active IS TRUE)
      ORDER BY active DESC, name`,
    [includeInactive]
  );
  return rows.map(toService);
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM services WHERE id = $1', [id]);
  if (!rows[0]) throw ApiError.notFound('Serviço não encontrado.');
  return toService(rows[0]);
}

export async function create({ name, durationMin, priceCents, active = true }) {
  const { rows } = await query(
    `INSERT INTO services (name, duration_min, price_cents, active)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, durationMin, priceCents, active]
  );
  return toService(rows[0]);
}

export async function update(id, { name, durationMin, priceCents, active }) {
  const { rows } = await query(
    `UPDATE services
        SET name = $2, duration_min = $3, price_cents = $4, active = $5
      WHERE id = $1 RETURNING *`,
    [id, name, durationMin, priceCents, active]
  );
  if (!rows[0]) throw ApiError.notFound('Serviço não encontrado.');
  return toService(rows[0]);
}

export async function remove(id) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS total FROM appointments WHERE service_id = $1',
    [id]
  );

  // Serviço com histórico e desativado, nunca apagado — senao a agenda antiga quebra.
  if (rows[0].total > 0) {
    const { rows: updated } = await query(
      'UPDATE services SET active = false WHERE id = $1 RETURNING *',
      [id]
    );
    if (!updated[0]) throw ApiError.notFound('Serviço não encontrado.');
    return { deactivated: true, service: toService(updated[0]) };
  }

  const { rowCount } = await query('DELETE FROM services WHERE id = $1', [id]);
  if (rowCount === 0) throw ApiError.notFound('Serviço não encontrado.');
  return { deactivated: false };
}
