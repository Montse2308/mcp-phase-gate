// Busca en los comentarios y en los nombres de los tests las referencias a documentos internos de trabajo, que
// no viajan con el repo: ni el código, ni sus comentarios, ni los nombres de sus tests deben apuntar a ellos.
//
// Uso: node scripts/referencias-al-plan.mjs [--resumen]
//   Revisa los archivos que git tiene versionados. Sin opciones lista cada hallazgo (archivo:línea); --resumen
//   deja solo los totales. Sale con 1 si encuentra alguna y con 0 si no.
//
// Qué busca, en español y en inglés:
//   - sin distinguir mayúsculas: el signo de sección; las palabras etapa, stage, hallazgo y finding seguidas de
//     un número; y las dos frases que nombran el documento de trabajo (ver SIN_MAYUSCULAS);
//   - distinguiendo mayúsculas: los códigos sueltos, una letra de H, R, S, F o A seguida de un número, para no
//     chocar con h2 y parecidos.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { comentariosDe, nombresDeTests } from "./comentarios-del-codigo.mjs";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SIN_MAYUSCULAS = [
  ["§", /§/g],
  ["Etapa N", /\betapa\s+\d+/gi],
  ["Stage N", /\bstage\s+\d+/gi],
  ["hallazgo N", /\bhallazgos?\s+\d+/gi],
  ["finding N", /\bfindings?\s+\d+/gi],
  ["del plan", /\bdel plan\b/gi],
  ["plan maestro", /\bplan maestro\b/gi],
];
const CON_MAYUSCULAS = [["código suelto (H3, R6…)", /\b[HRSFA]\d+\b/g]];
const REGLAS = [...SIN_MAYUSCULAS, ...CON_MAYUSCULAS];

export const CARPETAS = ["src", "test", "studio/src", "studio/e2e", "scripts", ".github", "sitio", "docs", "el resto (raíz y configuración)"];

function carpetaDe(ruta) {
  for (const c of CARPETAS.slice(0, -1)) if (ruta === c || ruta.startsWith(`${c}/`)) return c;
  return CARPETAS.at(-1);
}

export function hallazgosDe(ruta, texto) {
  const salida = [];
  const buscar = (donde, linea, renglon) => {
    for (const [regla, patron] of REGLAS) {
      for (const _ of renglon.matchAll(patron)) salida.push({ ruta, linea, donde, regla, renglon: renglon.trim() });
    }
  };
  for (const c of comentariosDe(ruta, texto) ?? []) c.lineas.forEach((renglon, i) => buscar("comentario", c.linea + i, renglon));
  for (const t of nombresDeTests(texto, ruta)) buscar("nombre de test", t.linea, t.texto);
  return salida;
}

function main() {
  const { values } = parseArgs({ options: { resumen: { type: "boolean", default: false } } });
  const lista = spawnSync("git", ["ls-files", "-z"], { cwd: raiz, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (lista.status !== 0) {
    console.error(`git ls-files falló: ${lista.stderr}`);
    process.exit(2);
  }
  const hallazgos = [];
  let revisados = 0;
  for (const ruta of lista.stdout.split("\0").filter(Boolean)) {
    if (!fs.existsSync(path.join(raiz, ruta))) continue;
    const texto = fs.readFileSync(path.join(raiz, ruta), "utf-8");
    const encontrados = hallazgosDe(ruta, texto);
    if (comentariosDe(ruta, "") !== null) revisados++;
    hallazgos.push(...encontrados);
  }

  if (!values.resumen) {
    for (const h of hallazgos) console.log(`${h.ruta}:${h.linea}  [${h.regla}, ${h.donde}]  ${h.renglon.length > 150 ? `${h.renglon.slice(0, 150)}…` : h.renglon}`);
    if (hallazgos.length > 0) console.log("");
  }
  const cuenta = (clave) => {
    const m = new Map();
    for (const h of hallazgos) m.set(clave(h), (m.get(clave(h)) ?? 0) + 1);
    return m;
  };
  const distintas = (donde) => new Set(hallazgos.filter((h) => h.donde === donde).map((h) => `${h.ruta}:${h.linea}`)).size;
  console.log(`Archivos revisados: ${revisados}. Referencias encontradas: ${hallazgos.length}.`);
  const porCarpeta = cuenta((h) => carpetaDe(h.ruta));
  console.log("Por carpeta:");
  for (const c of CARPETAS) console.log(`  ${c.padEnd(34)} ${String(porCarpeta.get(c) ?? 0).padStart(5)}`);
  const porRegla = cuenta((h) => h.regla);
  console.log("Por expresión:");
  for (const [regla] of REGLAS) console.log(`  ${regla.padEnd(34)} ${String(porRegla.get(regla) ?? 0).padStart(5)}`);
  const porDonde = cuenta((h) => h.donde);
  console.log(`En comentarios: ${porDonde.get("comentario") ?? 0}, en ${distintas("comentario")} líneas. En nombres de tests: ${porDonde.get("nombre de test") ?? 0}, en ${distintas("nombre de test")} nombres.`);
  process.exitCode = hallazgos.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
