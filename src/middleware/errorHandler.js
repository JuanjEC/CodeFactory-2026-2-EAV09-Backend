import { ApiError } from "../utils/ApiError.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ code: "not_found", message: "Recurso no encontrado" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }

  console.error("Error no controlado:", err);
  return res
    .status(500)
    .json({ code: "internal_error", message: "Ocurrió un error inesperado. Intenta de nuevo." });
}
