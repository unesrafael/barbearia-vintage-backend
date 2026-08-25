/**
 * Erro de aplicacao com codigo estavel + mensagem já em portugues.
 * O frontend so precisa repassar `message` para a tela.
 */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'REQUISICAO_INVALIDA', message, details);
  }

  static unauthorized(message = 'E-mail ou senha incorretos.') {
    return new ApiError(401, 'NAO_AUTENTICADO', message);
  }

  static forbidden(message = 'Você não tem permissão para esta ação.') {
    return new ApiError(403, 'SEM_PERMISSAO', message);
  }

  static notFound(message = 'Registro não encontrado.') {
    return new ApiError(404, 'NAO_ENCONTRADO', message);
  }

  static conflict(code, message) {
    return new ApiError(409, code, message);
  }

  static unprocessable(message, details) {
    return new ApiError(422, 'DADOS_INVALIDOS', message, details);
  }
}
