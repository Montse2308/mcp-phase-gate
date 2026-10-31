// Busca en los comentarios, en los nombres de los tests y en el valor de las claves $comentario de los JSON las
// referencias a los documentos de planeación de la versión, que no están en el repo: ni el código, ni sus
// comentarios, ni los nombres de sus tests deben apuntar a ellos. El plan de la versión 3 sí está en docs/, pero
// como historia de aquella versión, no como una fuente a la que el código remita.
//
// Uso: node scripts/referencias-al-plan.mjs [--resumen]
//   Revisa los archivos que git tiene versionados. Sin opciones lista cada hallazgo (archivo:línea); --resumen
//   deja solo los totales. Sale con 1 si encuentra alguna y con 0 si no.
//
// Qué busca, en español y en inglés:
//   - sin distinguir mayúsculas: el signo de sección; las palabras etapa, stage, hallazgo y finding seguidas de
//     un número; y la frase que nombra el documento de trabajo (ver SIN_MAYUSCULAS). «del plan» a secas no se
//     busca: el plan de cada tarea (el documento de la Fase 3) es parte del producto y se nombra así;
//   - distinguiendo mayúsculas: los códigos sueltos, una letra de H, R, S, F o A seguida de un número, para no
//     chocar con h2 y parecidos; y las otras familias de códigos de planeación que ya se vieron en el repo: una E con
//     su número y una letra de riesgo o de deuda con el suyo, unidas por un guion; la palabra validación seguida
//     de una V y un número (una V con número a secas no se busca: es también el motor de JavaScript); una P con
//     número; y una L de dos cifras entre paréntesis (las L de dos cifras sueltas son los lotes del producto).
//
// Solo revisa los comentarios y los nombres de tests de los archivos de código, CSS, HTML, JSON con comentarios y
// los que llevan # (YAML, .gitignore…), y en los .json y .jsonc el valor de cada clave $comentario (el campo con
// que un JSON, que no admite comentarios, se explica a sí mismo; viaja con el paquete si el archivo viaja). No
// revisa el texto de los .md, .txt ni los demás literales de las cadenas: las carpetas docs y sitio salen con 0
// porque ahí no hay comentarios que leer, no porque estén limpias.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { comentariosDe, esElPrincipal, nombresDeTests } from "./comentarios-del-codigo.mjs";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SIN_MAYUSCULAS = [
  ["§", /§/g],
  ["Etapa N", /\betapa\s+\d+/gi],
  ["Stage N", /\bstage\s+\d+/gi],
  ["hallazgo N", /\bhallazgos?\s+\d+/gi],
  ["finding N", /\bfindings?\s+\d+/gi],
  ["plan maestro", /\bplan maestro\b/gi],
];
const CON_MAYUSCULAS = [
  ["código suelto (H3, R6…)", /\b[HRSFA]\d+\b/g],
  ["código de etapa (E3-D5)", /\bE\d+-[A-Z]\d+\b/g],
  ["validación V4", /\b(?:validaci[oó]n|validation) V\d+\b/g],
  ["código P7", /\bP\d+\b/g],
  ["lote entre paréntesis (L02)", /\(L\d{2}\)/g],
];
const REGLAS = [...SIN_MAYUSCULAS, ...CON_MAYUSCULAS];

export const CARPETAS = ["src", "test", "studio/src", "studio/e2e", "scripts", ".github", "sitio", "docs", "el resto (raíz y configuración)"];

function carpetaDe(ruta) {
  for (const c of CARPETAS.slice(0, -1)) if (ruta === c || ruta.startsWith(`${c}/`)) return c;
  return CARPETAS.at(-1);
}

// El valor de cada clave "$comentario" de un JSON, con la línea donde empieza. Se busca en el texto y no con
// JSON.parse porque los .jsonc (tsconfig) admiten comentarios y comas finales.
const CLAVE_COMENTARIO = /"\$comentario"\s*:\s*"((?:[^"\\\n]|\\.)*)"/g;

function valoresDeComentario(texto) {
  return [...texto.matchAll(CLAVE_COMENTARIO)].map((m) => {
    let valor = m[1];
    try {
      valor = JSON.parse(`"${m[1]}"`);
    } catch {
      // un escape inválido: se revisa el texto tal cual
    }
    return { linea: texto.slice(0, m.index).split("\n").length, valor };
  });
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
  if ([".json", ".jsonc"].includes(path.posix.extname(ruta))) {
    for (const v of valoresDeComentario(texto)) buscar("$comentario", v.linea, v.valor);
  }
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
  console.log(`En comentarios: ${porDonde.get("comentario") ?? 0}, en ${distintas("comentario")} líneas. En nombres de tests: ${porDonde.get("nombre de test") ?? 0}, en ${distintas("nombre de test")} nombres. En valores de $comentario: ${porDonde.get("$comentario") ?? 0}, en ${distintas("$comentario")} líneas.`);
  console.log("No revisa el texto de los .md ni de los .txt, ni los demás literales de las cadenas: un 0 en docs o en sitio no dice que estén limpios.");
  process.exitCode = hallazgos.length === 0 ? 0 : 1;
}

if (esElPrincipal(import.meta.url)) main();
