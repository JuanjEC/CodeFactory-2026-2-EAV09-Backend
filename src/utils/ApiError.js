export class ApiError extends Error {
  /**
   * @param {number} status Código HTTP
   * @param {string} code Código de negocio, usado por el frontend (ej. "invalid_credentials")
   * @param {string} message Mensaje para mostrar al usuario
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
