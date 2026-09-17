import { query, withTransaction } from "../db.js";
import { ApiError } from "../utils/ApiError.js";
import { hashPassword, comparePassword, assertPasswordComplexity } from "../utils/password.js";
import { isValidEmail, normalizeEmail } from "../utils/validators.js";
import { generateOpaqueToken, signSessionToken } from "../utils/tokens.js";
import {
  sendMail,
  verificationEmailContent,
  passwordResetEmailContent,
} from "../utils/mailer.js";
import { config } from "../config.js";
import { SESSION_COOKIE } from "../middleware/auth.js";

const USER_SAFE_FIELDS = `
  id, full_name AS "fullName", email, role, status, phone,
  provider_code AS "providerCode", service_type AS "serviceType",
  description, pending_email AS "pendingEmail"
`;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSecure ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

async function findUserByEmail(email) {
  const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [normalizeEmail(email)]);
  return rows[0];
}

async function createVerificationToken(client, userId) {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + config.emailVerificationHours * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt],
  );
  return token;
}

// --- Disponibilidad de correo / código de proveedor (usados durante el registro) ---

export async function checkEmail(req, res) {
  const email = String(req.query.email ?? "");
  if (!isValidEmail(email)) {
    return res.json({ available: false });
  }
  const existing = await findUserByEmail(email);
  res.json({ available: !existing });
}

export async function checkProviderCode(req, res) {
  const code = String(req.query.code ?? "").trim();
  const { rows } = await query(`SELECT used FROM provider_codes WHERE UPPER(code) = UPPER($1)`, [
    code,
  ]);
  const entry = rows[0];
  if (!entry) return res.json({ ok: false, reason: "El código de proveedor es inválido" });
  if (entry.used) return res.json({ ok: false, reason: "Este código ya fue usado" });
  res.json({ ok: true });
}

// --- HU-01: Registro ---

export async function register(req, res) {
  const { fullName, email, password, role, providerCode, serviceType, description } = req.body;

  if (typeof fullName !== "string" || fullName.trim().length < 3) {
    throw new ApiError(400, "invalid_name", "Ingresa tu nombre completo");
  }
  if (!isValidEmail(email)) {
    throw new ApiError(400, "invalid_email", "Ingresa un correo con formato válido");
  }
  if (role !== "cliente" && role !== "proveedor") {
    throw new ApiError(400, "invalid_role", "Rol inválido");
  }
  assertPasswordComplexity(password);

  const normalizedEmail = normalizeEmail(email);
  if (await findUserByEmail(normalizedEmail)) {
    throw new ApiError(409, "email_taken", "Este correo ya está registrado");
  }

  if (role === "proveedor") {
    const trimmedCode = (providerCode ?? "").trim();
    if (trimmedCode.length < 4) {
      throw new ApiError(400, "provider_code", "Ingresa tu código de proveedor");
    }
    if (!serviceType) {
      throw new ApiError(400, "service_type", "Selecciona el tipo de servicio");
    }
    if (!description || description.trim().length < 20) {
      throw new ApiError(400, "description", "Describe tu servicio (mínimo 20 caracteres)");
    }
  }

  const passwordHash = await hashPassword(password);

  const { user, verificationToken } = await withTransaction(async (client) => {
    if (role === "proveedor") {
      const trimmedCode = providerCode.trim().toUpperCase();
      // Bloquea la fila del código para evitar que dos registros concurrentes lo usen a la vez.
      const { rows: codeRows } = await client.query(
        `SELECT code, used FROM provider_codes WHERE UPPER(code) = UPPER($1) FOR UPDATE`,
        [trimmedCode],
      );
      const entry = codeRows[0];
      if (!entry) {
        throw new ApiError(400, "provider_code", "El código de proveedor es inválido o ya fue usado");
      }
      if (entry.used) {
        throw new ApiError(400, "provider_code", "El código de proveedor es inválido o ya fue usado");
      }

      const { rows: userRows } = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role, status, provider_code, service_type, description)
         VALUES ($1, $2, $3, 'proveedor', 'no_verificada', $4, $5, $6)
         RETURNING ${USER_SAFE_FIELDS}`,
        [fullName.trim(), normalizedEmail, passwordHash, trimmedCode, serviceType, description.trim()],
      );

      await client.query(
        `UPDATE provider_codes SET used = TRUE, used_by = $1, used_at = now() WHERE code = $2`,
        [userRows[0].id, entry.code],
      );

      const token = await createVerificationToken(client, userRows[0].id);
      return { user: userRows[0], verificationToken: token };
    }

    const { rows: userRows } = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'cliente', 'no_verificada')
       RETURNING ${USER_SAFE_FIELDS}`,
      [fullName.trim(), normalizedEmail, passwordHash],
    );
    const token = await createVerificationToken(client, userRows[0].id);
    return { user: userRows[0], verificationToken: token };
  });

  await sendMail(verificationEmailContent(verificationToken, user.email));

  res.status(201).json({ email: user.email });
}

// --- HU-02: Inicio de sesión ---

export async function login(req, res) {
  const { email, password } = req.body;
  if (!isValidEmail(email) || typeof password !== "string" || password.length === 0) {
    throw new ApiError(400, "invalid_credentials", "Correo o contraseña incorrectos");
  }

  const normalizedEmail = normalizeEmail(email);
  const user = await findUserByEmail(normalizedEmail);

  async function logAttempt(success, reason, userId) {
    await query(
      `INSERT INTO login_history (user_id, email_tried, success, reason) VALUES ($1, $2, $3, $4)`,
      [userId ?? null, normalizedEmail, success, reason ?? null],
    );
  }

  if (!user) {
    await logAttempt(false, "not_found", null);
    // Mensaje genérico: no revela si el correo existe (HU-02, escenario 3).
    throw new ApiError(401, "invalid_credentials", "Correo o contraseña incorrectos");
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await logAttempt(false, "locked", user.id);
    throw new ApiError(
      423,
      "locked",
      `Cuenta bloqueada temporalmente por ${config.loginLockMinutes} minutos`,
    );
  }

  const passwordOk = await comparePassword(password, user.password_hash);
  if (!passwordOk) {
    const attempts = user.failed_login_attempts + 1;
    if (attempts >= config.maxLoginAttempts) {
      const lockedUntil = new Date(Date.now() + config.loginLockMinutes * 60 * 1000);
      await query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = $2 WHERE id = $1`,
        [user.id, lockedUntil],
      );
      await logAttempt(false, "locked", user.id);
      throw new ApiError(
        423,
        "locked",
        `Cuenta bloqueada temporalmente por ${config.loginLockMinutes} minutos`,
      );
    }
    await query(`UPDATE users SET failed_login_attempts = $2 WHERE id = $1`, [user.id, attempts]);
    await logAttempt(false, "invalid_password", user.id);
    throw new ApiError(401, "invalid_credentials", "Correo o contraseña incorrectos");
  }

  if (user.status === "no_verificada") {
    await logAttempt(false, "unverified", user.id);
    throw new ApiError(403, "unverified", "Debes verificar tu correo antes de iniciar sesión");
  }
  if (user.status === "inactiva") {
    await logAttempt(false, "inactive", user.id);
    throw new ApiError(403, "inactive", "Esta cuenta está inactiva. Contacte al administrador");
  }

  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
    [user.id],
  );
  await logAttempt(true, null, user.id);

  const token = signSessionToken(user);
  res.cookie(SESSION_COOKIE, token, cookieOptions());

  res.json({
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? undefined,
    providerCode: user.provider_code ?? undefined,
    serviceType: user.service_type ?? undefined,
    description: user.description ?? undefined,
    pendingEmail: user.pending_email ?? undefined,
  });
}

export function logout(req, res) {
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: 0 });
  res.status(204).end();
}

// --- HU-04: Verificación de correo ---

export async function resendVerification(req, res) {
  const email = String(req.body?.email ?? "");
  if (isValidEmail(email)) {
    const user = await findUserByEmail(email);
    if (user && user.status === "no_verificada") {
      const token = await withTransaction((client) => createVerificationToken(client, user.id));
      await sendMail(verificationEmailContent(token, user.email));
    }
  }
  // Siempre responde éxito: no revela si el correo existe.
  res.status(204).end();
}

export async function verifyEmail(req, res) {
  const { token } = req.params;

  const accountToken = await query(
    `SELECT * FROM email_verification_tokens WHERE token = $1`,
    [token],
  );
  const accountRow = accountToken.rows[0];
  if (accountRow) {
    if (accountRow.used || new Date(accountRow.expires_at) < new Date()) {
      throw new ApiError(400, "expired", "Enlace expirado, solicita uno nuevo");
    }
    await withTransaction(async (client) => {
      await client.query(`UPDATE email_verification_tokens SET used = TRUE WHERE token = $1`, [
        token,
      ]);
      await client.query(
        `UPDATE users SET status = 'activa' WHERE id = $1 AND status = 'no_verificada'`,
        [accountRow.user_id],
      );
    });
    return res.status(204).end();
  }

  // Si no es un token de activación de cuenta, puede ser de confirmación de cambio de correo (HU-03).
  const changeToken = await query(`SELECT * FROM email_change_tokens WHERE token = $1`, [token]);
  const changeRow = changeToken.rows[0];
  if (changeRow) {
    if (changeRow.used || new Date(changeRow.expires_at) < new Date()) {
      throw new ApiError(400, "expired", "Enlace expirado, solicita uno nuevo");
    }
    const conflict = await findUserByEmail(changeRow.new_email);
    if (conflict && conflict.id !== changeRow.user_id) {
      throw new ApiError(409, "email_taken", "Este correo ya está registrado");
    }
    await withTransaction(async (client) => {
      await client.query(`UPDATE email_change_tokens SET used = TRUE WHERE token = $1`, [token]);
      await client.query(
        `UPDATE users SET email = $2, pending_email = NULL WHERE id = $1`,
        [changeRow.user_id, changeRow.new_email],
      );
    });
    return res.status(204).end();
  }

  throw new ApiError(400, "expired", "Enlace expirado, solicita uno nuevo");
}

// --- HU-05: Recuperación de contraseña ---

export async function forgotPassword(req, res) {
  const email = String(req.body?.email ?? "");
  if (isValidEmail(email)) {
    const user = await findUserByEmail(email);
    if (user) {
      const token = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + config.passwordResetMinutes * 60 * 1000);
      await query(
        `INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
        [token, user.id, expiresAt],
      );
      await sendMail(passwordResetEmailContent(token, user.email));
    }
  }
  // Nunca revela si el correo existe (HU-05).
  res.status(204).end();
}

export async function resetPassword(req, res) {
  const { token } = req.params;
  const { password } = req.body;

  const { rows } = await query(`SELECT * FROM password_reset_tokens WHERE token = $1`, [token]);
  const row = rows[0];
  if (!row || row.used || new Date(row.expires_at) < new Date()) {
    throw new ApiError(400, "expired", "Enlace expirado, solicita uno nuevo");
  }

  assertPasswordComplexity(password);
  const passwordHash = await hashPassword(password);

  await withTransaction(async (client) => {
    await client.query(`UPDATE password_reset_tokens SET used = TRUE WHERE token = $1`, [token]);
    // token_version++ invalida cualquier sesión activa anterior (HU-05).
    await client.query(
      `UPDATE users
       SET password_hash = $2, token_version = token_version + 1,
           failed_login_attempts = 0, locked_until = NULL
       WHERE id = $1`,
      [row.user_id, passwordHash],
    );
    await client.query(
      `UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
      [row.user_id],
    );
  });

  res.status(204).end();
}

export { USER_SAFE_FIELDS, findUserByEmail };
