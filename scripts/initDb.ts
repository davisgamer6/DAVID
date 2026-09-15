import { env } from "../src/config/env.js";
import { getDb } from "../src/db/database.js";

getDb(env.sqliteDbPath);
console.log(`Base de datos inicializada en ${env.sqliteDbPath}`);
