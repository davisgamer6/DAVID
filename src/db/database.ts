import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Usamos el modulo `node:sqlite`, integrado en Node.js desde la version 22.5
 * (a diferencia de `better-sqlite3`, no requiere compilar codigo nativo con
 * Python/Visual Studio, lo cual es una fuente comun de errores de
 * instalacion en Windows para usuarios sin experiencia tecnica).
 */
export type Db = DatabaseSync;

let dbInstance: DatabaseSync | null = null;

export function getDb(dbPath: string): DatabaseSync {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
  db.exec("PRAGMA journal_mode = WAL;");

  const migrationsSql = fs.readFileSync(path.join(__dirname, "migrations.sql"), "utf-8");
  db.exec(migrationsSql);

  dbInstance = db;
  return db;
}
