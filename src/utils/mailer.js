import { config } from "../config.js";

let transporterPromise = null;

async function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporterPromise) {
    transporterPromise = import("nodemailer").then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, password: config.smtp.password } : undefined,
      }),
    );
  }
  return transporterPromise;
}

/**
 * Envía un correo si hay SMTP configurado; si no, lo imprime en consola.
 * Así el flujo completo (HU-04, HU-05, cambio de correo en HU-03) funciona en
 * desarrollo sin depender de un proveedor de correo real.
 */
export async function sendMail({ to, subject, html, text }) {
  const transporter = await getTransporter();
  if (!transporter) {
    console.log("\n----- CORREO (modo consola, sin SMTP configurado) -----");
    console.log("Para:", to);
    console.log("Asunto:", subject);
    console.log(text ?? html);
    console.log("--------------------------------------------------------\n");
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, html, text });
}

export function verificationEmailContent(token, email) {
  const link = `${config.frontendUrl}/verify-email/${token}`;
  return {
    to: email,
    subject: "Confirma tu correo — Quiero Reservar",
    text: `Confirma tu cuenta visitando este enlace (vence en ${config.emailVerificationHours}h): ${link}`,
    html: `<p>Confirma tu cuenta haciendo clic en el siguiente enlace (vence en ${config.emailVerificationHours}h):</p><p><a href="${link}">${link}</a></p>`,
  };
}

export function passwordResetEmailContent(token, email) {
  const link = `${config.frontendUrl}/reset-password/${token}`;
  return {
    to: email,
    subject: "Restablece tu contraseña — Quiero Reservar",
    text: `Restablece tu contraseña visitando este enlace (vence en ${config.passwordResetMinutes} minutos): ${link}`,
    html: `<p>Restablece tu contraseña haciendo clic en el siguiente enlace (vence en ${config.passwordResetMinutes} minutos):</p><p><a href="${link}">${link}</a></p>`,
  };
}

export function emailChangeConfirmationContent(token, newEmail) {
  const link = `${config.frontendUrl}/verify-email/${token}`;
  return {
    to: newEmail,
    subject: "Confirma tu nuevo correo — Quiero Reservar",
    text: `Confirma tu nuevo correo visitando este enlace: ${link}`,
    html: `<p>Confirma tu nuevo correo haciendo clic en el siguiente enlace:</p><p><a href="${link}">${link}</a></p>`,
  };
}
