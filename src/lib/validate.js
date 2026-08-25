import { z } from 'zod';

/** Middleware: válida req.body contra um schema zod e substitui pelo valor tipado. */
export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(result.error);
  req.body = result.data;
  return next();
};

/** Idem para query string. */
export const validateQuery = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) return next(result.error);
  req.validatedQuery = result.data;
  return next();
};

export const uuid = z.string().uuid('Identificador inválido.');
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.');
export const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM.');

export const APPOINTMENT_STATUS = [
  'AGENDADO',
  'CONCLUIDO',
  'CANCELADO',
  'NAO_COMPARECEU',
];
