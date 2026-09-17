const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Colombiano: 10 dígitos, +57 opcional, espacios permitidos (igual a src/lib/validation.ts)
const PHONE_RE = /^(\+?57\s?)?3\d{2}\s?\d{3}\s?\d{4}$/;

export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

export function isValidPhone(phone) {
  if (phone === undefined || phone === null || phone === "") return true;
  return PHONE_RE.test(phone.trim());
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
