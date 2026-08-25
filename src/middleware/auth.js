import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../lib/ApiError.js';

/**
 * Sistema interno: não existe cadastro publico e nenhuma rota de dados
 * responde sem token válido.
 */
export function authenticate(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(
      new ApiError(401, 'NAO_AUTENTICADO', 'Faça login para acessar o sistema.')
    );
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = { id: payload.sub, name: payload.name, email: payload.email };
    return next();
  } catch {
    return next(
      new ApiError(401, 'SESSAO_EXPIRADA', 'Sua sessão expirou. Entre novamente.')
    );
  }
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, name: user.name, email: user.email },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}
