/**
 * Crea (o reemplaza) un usuario de prueba ya verificado, con contraseña hasheada.
 *
 * Uso:
 *   npm run seed:user -- --email cliente@demo.com --password "Demo123!" --name "Camila Restrepo" --role cliente
 *   npm run seed:user -- --email proveedor@demo.com --password "Demo123!" --name "Servicios Aurora" --role proveedor --serviceType "Salón de belleza" --description "Cortes, color y tratamientos capilares." --providerCode PROV-1001
 */
import { pool } from "../src/db.js";
import { hashPassword, assertPasswordComplexity } from "../src/utils/password.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      args[key] = value;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { email, password, name, role = "cliente", serviceType, description, providerCode } = args;

  if (!email || !password || !name) {
    console.error("Faltan argumentos. Ejemplo:");
    console.error(
      '  npm run seed:user -- --email cliente@demo.com --password "Demo123!" --name "Camila Restrepo" --role cliente',
    );
    process.exit(1);
  }

  assertPasswordComplexity(password);
  const passwordHash = await hashPassword(password);

  if (role === "proveedor") {
    if (!providerCode) {
      console.error("Para role=proveedor debes pasar --providerCode (debe existir en provider_codes).");
      process.exit(1);
    }
    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status, provider_code, service_type, description)
       VALUES ($1, $2, $3, 'proveedor', 'activa', $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'activa'`,
      [name, email.toLowerCase(), passwordHash, providerCode, serviceType ?? null, description ?? null],
    );
    await pool.query(
      `UPDATE provider_codes SET used = TRUE, used_at = now() WHERE code = $1`,
      [providerCode],
    );
  } else {
    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'cliente', 'activa')
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'activa'`,
      [name, email.toLowerCase(), passwordHash],
    );
  }

  console.log(`Usuario listo: ${email} / ${password}`);
  await pool.end();
}

main().catch((err) => {
  console.error("Fallo creando el usuario de prueba:", err.message);
  process.exit(1);
});
