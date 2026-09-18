import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa tu archivo .env`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  corsOrigins: (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES ?? 15),
  emailVerificationHours: Number(process.env.EMAIL_VERIFICATION_HOURS ?? 24),
  passwordResetMinutes: Number(process.env.PASSWORD_RESET_MINUTES ?? 60),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:8080",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? "",
  },
};
