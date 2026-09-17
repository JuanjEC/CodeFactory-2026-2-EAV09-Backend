import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

/** Token aleatorio para enlaces de verificación / recuperación (no es JWT, es opaco). */
export function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * El JWT incluye tokenVersion: al cambiar la contraseña se incrementa en la BD,
 * lo que invalida automáticamente cualquier sesión firmada con la versión anterior
 * (HU-05: "se invalidan las sesiones activas anteriores por seguridad").
 */
export function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, tokenVersion: user.token_version },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export function verifySessionToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
