import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbInstance: Database.Database | null = null;

export function getDb(dbPath: string): Database.Database {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const migrationsSql = fs.readFileSync(path.join(__dirname, "migrations.sql"), "utf-8");
  db.exec(migrationsSql);

  dbInstance = db;
  return db;
}
