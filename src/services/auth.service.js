import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { ApiError } from '../lib/ApiError.js';
import { signToken } from '../middleware/auth.js';

export async function login({ email, password }) {
  const { rows } = await query(
    'SELECT id, name, email, password_hash FROM users WHERE lower(email) = lower($1)',
    [email]
  );

  const user = rows[0];
  // Compara mesmo sem usuário para não vazar quais e-mails existem.
  const hash = user?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) throw ApiError.unauthorized();

  const publicUser = { id: user.id, name: user.name, email: user.email };
  return { token: signToken(publicUser), user: publicUser };
}

export async function findById(id) {
  const { rows } = await query(
    'SELECT id, name, email FROM users WHERE id = $1',
    [id]
  );
  if (!rows[0]) throw ApiError.unauthorized('Usuário não encontrado.');
  return rows[0];
}
