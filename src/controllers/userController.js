import { query, withTransaction } from "../db.js";
import { ApiError } from "../utils/ApiError.js";
import { isValidEmail, isValidPhone, normalizeEmail } from "../utils/validators.js";
import { generateOpaqueToken } from "../utils/tokens.js";
import { sendMail, emailChangeConfirmationContent } from "../utils/mailer.js";
import { config } from "../config.js";
import { USER_SAFE_FIELDS, findUserByEmail } from "./authController.js";

function toClient(row) {
  return {
    id: row.id,
    fullName: row.fullName ?? row.full_name,
    email: row.email,
    role: row.role,
    phone: row.phone ?? undefined,
    providerCode: row.providerCode ?? row.provider_code ?? undefined,
    serviceType: row.serviceType ?? row.service_type ?? undefined,
    description: row.description ?? undefined,
    pendingEmail: row.pendingEmail ?? row.pending_email ?? undefined,
  };
}

export async function getMe(req, res) {
  const { rows } = await query(`SELECT ${USER_SAFE_FIELDS} FROM users WHERE id = $1`, [
    req.userId,
  ]);
  if (!rows[0]) throw new ApiError(404, "not_found", "Usuario no encontrado");
  res.json(toClient(rows[0]));
}

export async function updateProfile(req, res) {
  const { userId } = req.params;
  const { fullName, phone, email, serviceType, description } = req.body;

  const { rows: existingRows } = await query(`SELECT * FROM users WHERE id = $1`, [userId]);
  const user = existingRows[0];
  if (!user) throw new ApiError(404, "not_found", "Usuario no encontrado");

  if (typeof fullName !== "string" || fullName.trim().length < 3) {
    throw new ApiError(400, "invalid_name", "Ingresa tu nombre completo");
  }
  if (!isValidPhone(phone)) {
    throw new ApiError(
      400,
      "invalid_phone",
      "Formato inválido. Ej: 3001234567 o +57 300 1234567",
    );
  }
  if (!isValidEmail(email)) {
    throw new ApiError(400, "invalid_email", "Ingresa un correo con formato válido");
  }

  const normalizedEmail = normalizeEmail(email);
  const emailChanged = normalizedEmail !== user.email;

  if (emailChanged) {
    const conflict = await findUserByEmail(normalizedEmail);
    if (conflict) {
      throw new ApiError(409, "email_taken", "Este correo ya está registrado");
    }
  }

  const updated = await withTransaction(async (client) => {
    let pendingEmailToken = null;

    if (emailChanged) {
      pendingEmailToken = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + config.emailVerificationHours * 60 * 60 * 1000);
      // Invalida cualquier cambio de correo pendiente anterior antes de crear uno nuevo.
      await client.query(
        `UPDATE email_change_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
        [userId],
      );
      await client.query(
        `INSERT INTO email_change_tokens (token, user_id, new_email, expires_at) VALUES ($1, $2, $3, $4)`,
        [pendingEmailToken, userId, normalizedEmail, expiresAt],
      );
    }

    const { rows } = await client.query(
      `UPDATE users
       SET full_name = $2,
           phone = $3,
           pending_email = CASE WHEN $4 THEN $5 ELSE pending_email END,
           service_type = CASE WHEN role = 'proveedor' THEN $6 ELSE service_type END,
           description = CASE WHEN role = 'proveedor' THEN $7 ELSE description END,
           updated_at = now()
       WHERE id = $1
       RETURNING ${USER_SAFE_FIELDS}`,
      [
        userId,
        fullName.trim(),
        phone ? phone.trim() : null,
        emailChanged,
        emailChanged ? normalizedEmail : null,
        serviceType ?? null,
        description ?? null,
      ],
    );

    return { row: rows[0], pendingEmailToken };
  });

  if (updated.pendingEmailToken) {
    await sendMail(emailChangeConfirmationContent(updated.pendingEmailToken, normalizedEmail));
  }

  res.json(toClient(updated.row));
}
