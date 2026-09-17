import { verifySessionToken } from "../utils/tokens.js";
import { ApiError } from "../utils/ApiError.js";
import { query } from "../db.js";

const SESSION_COOKIE = "qr_session";
export { SESSION_COOKIE };

/**
 * Exige una sesión válida (cookie httpOnly firmada) y que la versión del token
 * coincida con la actual en BD (se invalida al cambiar contraseña, HU-05).
 * También rechaza sesiones de cuentas que hayan sido inhabilitadas después de emitirse.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      throw new ApiError(401, "unauthenticated", "Debes iniciar sesión");
    }

    let payload;
    try {
      payload = verifySessionToken(token);
    } catch {
      throw new ApiError(401, "unauthenticated", "Tu sesión expiró, inicia sesión de nuevo");
    }

    const { rows } = await query(
      `SELECT id, role, status, token_version FROM users WHERE id = $1`,
      [payload.sub],
    );
    const user = rows[0];
    if (!user || user.token_version !== payload.tokenVersion) {
      throw new ApiError(401, "unauthenticated", "Tu sesión expiró, inicia sesión de nuevo");
    }
    if (user.status === "inactiva") {
      throw new ApiError(403, "inactive", "Esta cuenta está inactiva. Contacte al administrador");
    }

    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch (error) {
    next(error);
  }
}

/** Además de requireAuth, exige que el :userId de la ruta sea el del usuario autenticado. */
export function requireSelf(req, res, next) {
  if (req.params.userId !== req.userId) {
    return next(new ApiError(403, "forbidden", "No tienes permiso para esta acción"));
  }
  next();
}
