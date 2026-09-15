// Copia migrations.sql junto al database.js compilado.
// Se hace con Node.js puro (fs) en vez de comandos de shell (mkdir -p, cp)
// porque esos comandos no existen en Windows y rompian el build ahi
// ("La sintaxis del comando no es correcta").
import fs from "node:fs";
import path from "node:path";

const src = path.join("src", "db", "migrations.sql");
const destDir = path.join("dist", "src", "db");
const dest = path.join(destDir, "migrations.sql");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);

console.log(`Copiado ${src} -> ${dest}`);
