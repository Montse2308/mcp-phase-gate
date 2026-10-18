// El presupuesto del frontend del Studio (§7.2 del plan): JS, CSS y fuentes de studio/dist/**, sumados
// en gzip, no pasan de 200 kB (200 000 bytes, como cuenta Vite). Las fuentes woff2 ya van comprimidas: su
// tamaño en gzip es casi el mismo. Sale con 1 si se pasa, para que `npm run build` falle.
//
// Uso: node scripts/presupuesto-studio.mjs [carpeta]   (por defecto, studio/dist)

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

export const PRESUPUESTO = 200_000;
const CUENTAN = new Set([".js", ".css", ".woff2"]);

const raiz = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "studio", "dist"));
if (!fs.statSync(raiz, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`No existe ${raiz}: compila antes el frontend (npm run build).`);
  process.exit(1);
}

const filas = [];
for (const relativa of fs.readdirSync(raiz, { recursive: true, encoding: "utf-8" }).sort()) {
  const archivo = path.join(raiz, relativa);
  if (!fs.statSync(archivo).isFile()) continue;
  const contenido = fs.readFileSync(archivo);
  filas.push({ archivo: relativa.split(path.sep).join("/"), bytes: contenido.length, gzip: gzipSync(contenido).length, cuenta: CUENTAN.has(path.extname(relativa).toLowerCase()) });
}

const kb = (n) => `${(n / 1000).toFixed(2)} kB`;
let total = 0;
for (const f of filas) {
  if (f.cuenta) total += f.gzip;
  console.log(`${f.cuenta ? " " : "·"} ${f.archivo.padEnd(58)} ${kb(f.bytes).padStart(10)}  gzip ${kb(f.gzip).padStart(10)}`);
}
console.log(`\nJS + CSS + fuentes, en gzip: ${kb(total)} de ${kb(PRESUPUESTO)} (· = no cuenta).`);
if (total > PRESUPUESTO) {
  console.error(`El frontend pasa del presupuesto por ${kb(total - PRESUPUESTO)}.`);
  process.exit(1);
}
