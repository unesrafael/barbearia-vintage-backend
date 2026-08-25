import { ZodError } from 'zod';
import { ApiError } from '../lib/ApiError.js';

/**
 * Traduz qualquer erro em um envelope unico:
 *   { error: { code, message, details? } }
 * O frontend nunca precisa interpretar stack trace nem codigo do Postgres.
 */
export function errorHandler(error, _req, res, _next) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  if (error instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: 'DADOS_INVALIDOS',
        message: 'Confira os campos destacados.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }

  // Violacoes do Postgres traduzidas para linguagem de barbearia.
  if (error.code === '23505' && error.constraint === 'uniq_horario_ativo') {
    return res.status(409).json({
      error: {
        code: 'HORARIO_OCUPADO',
        message: 'Já existe um agendamento neste horário. Escolha outro.',
      },
    });
  }

  if (error.code === '23505') {
    return res.status(409).json({
      error: { code: 'REGISTRO_DUPLICADO', message: 'Esse registro já existe.' },
    });
  }

  if (error.code === '23503') {
    return res.status(409).json({
      error: {
        code: 'REGISTRO_EM_USO',
        message: 'Este registro está vinculado a agendamentos e não pode ser removido.',
      },
    });
  }

  console.error('[erro não tratado]', error);
  return res.status(500).json({
    error: {
      code: 'ERRO_INTERNO',
      message: 'Algo deu errado no servidor. Tente novamente em instantes.',
    },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'ROTA_NAO_ENCONTRADA', message: `Rota ${req.method} ${req.path} não existe.` },
  });
}
