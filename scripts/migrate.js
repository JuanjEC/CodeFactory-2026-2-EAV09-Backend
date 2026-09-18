import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "../src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  console.log("Aplicando db/schema.sql ...");
  await pool.query(sql);
  console.log("Listo.");
  await pool.end();
}

main().catch((err) => {
  console.error("Fallo la migración.");
  console.error("code:", err.code);
  console.error("message:", err.message || "(vacío)");
  if (Array.isArray(err.errors)) {
    err.errors.forEach((e, i) => console.error(`  causa ${i + 1}:`, e.code, e.message));
  }
  console.error(err.stack ?? err);
  process.exit(1);
});
