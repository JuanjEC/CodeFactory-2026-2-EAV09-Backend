import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Neon requiere TLS; no verificamos la CA del proveedor administrado.
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  // Errores en clientes inactivos del pool: no deben tumbar el proceso.
  console.error("Error inesperado en el pool de Postgres", err);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Ejecuta un callback dentro de una transacción, con rollback automático si falla. */
export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
