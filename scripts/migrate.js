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
  console.error("Fallo la migración:", err.message);
  process.exit(1);
});
