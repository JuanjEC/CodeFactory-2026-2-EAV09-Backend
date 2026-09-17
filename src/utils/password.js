import bcrypt from "bcryptjs";
import { ApiError } from "./ApiError.js";

const SALT_ROUNDS = 12;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Replica las reglas del frontend (src/lib/validation.ts -> passwordRules) para que
 * el servidor nunca confíe únicamente en la validación del cliente.
 * Lanza ApiError con el primer requisito incumplido, nombrándolo explícitamente
 * (HU-01, escenario de error: "no un mensaje genérico").
 */
export function assertPasswordComplexity(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new ApiError(400, "password_length", "La contraseña debe tener al menos 8 caracteres");
  }
  if (!/[A-Z]/.test(password)) {
    throw new ApiError(400, "password_upper", "La contraseña debe incluir una mayúscula");
  }
  if (!/\d/.test(password)) {
    throw new ApiError(400, "password_number", "La contraseña debe incluir un número");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new ApiError(
      400,
      "password_special",
      "La contraseña debe incluir un carácter especial",
    );
  }
}
