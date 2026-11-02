// Lista los comentarios de src/ que parecen estar en español, para revisarlos a mano: el código del producto se
// comenta en inglés. No es una prueba (el idioma de un texto no se decide con certeza): es una lista de dónde
// mirar, y siempre sale con 0.
//
// Uso: node scripts/comentarios-en-espanol.mjs [carpeta] [--resumen]
//   Sin argumentos revisa src/. Cada hallazgo sale como archivo:línea y el principio del comentario; --resumen
//   deja solo los totales por carpeta.
//
// Cómo decide que un comentario parece español: cuenta, entre sus palabras, las que solo son del español (sus
// artículos, preposiciones y verbos más comunes) y las que solo son del inglés. Parece español si trae letras
// que el inglés no usa (ñ, vocales con tilde, ¿ ¡) o si las palabras del español ganan a las del inglés. Un
// comentario de una o dos palabras sin tilde no se juzga.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { comentariosDeCodigo, esElPrincipal } from "./comentarios-del-codigo.mjs";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ESPANOL = new Set(
  ("el la los las un una unos unas de del al y o u que se su sus por para con sin sobre entre como pero porque cuando donde " +
    "es son era fue ser está están hay no si ya más muy solo también esto esta este estos estas eso esa ese lo le les me mi " +
    "nos tu cada todo toda todos todas otro otra otros otras mismo misma cual cuyo hasta desde durante antes después " +
    "puede pueden debe deben tiene tienen hace hacen va van sea sean nunca siempre aquí ahí aunque según además " +
    "nada algo alguien nadie cualquier ninguno ninguna quien").split(" "),
);
const INGLES = new Set(
  ("the a an of and or to is are was were be been being in on at by for with without from into onto over under between " +
    "as but because when where which who whom whose that this these those it its they them their there here not no yes " +
    "if then than so such only also just each every all any some other same can could should would will shall may might " +
    "must has have had do does did done get gets got use used uses via per while until since before after about up out " +
    "we you he she his her our your more most less very too both either neither one two").split(" "),
);
const LETRAS_DEL_ESPANOL = /[ñÑáéíóúÁÉÍÓÚ¿¡]/;

export function pareceEspanol(lineas) {
  const texto = lineas.join(" ");
  if (LETRAS_DEL_ESPANOL.test(texto)) return true;
  let es = 0;
  let en = 0;
  const palabras = texto.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const p of palabras) {
    if (ESPANOL.has(p) && !INGLES.has(p)) es++;
    else if (INGLES.has(p) && !ESPANOL.has(p)) en++;
  }
  return palabras.length >= 3 && es > en;
}

// Las líneas `//` que van una tras otra son un solo comentario para quien lo lee: juntas se juzga mejor que
// una por una, porque una línea de continuación suelta («No cambia estructura, encabezados ni nombres.») no
// trae palabras que delaten el idioma. Cada bloque lleva su primer renglón como `linea`.
export function agruparLineas(comentarios) {
  const bloques = [];
  for (const c of comentarios) {
    const ultimo = bloques.at(-1);
    const sigue = ultimo && c.texto.startsWith("//") && ultimo.esDeLinea && c.linea === ultimo.ultima + 1;
    if (sigue) {
      ultimo.lineas.push(...c.lineas);
      ultimo.ultima = c.linea;
    } else {
      bloques.push({ linea: c.linea, lineas: [...c.lineas], texto: c.texto, esDeLinea: c.texto.startsWith("//"), ultima: c.linea + c.texto.split("\n").length - 1 });
    }
  }
  return bloques;
}

function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { resumen: { type: "boolean", default: false } } });
  const carpeta = (positionals[0] ?? "src").replace(/\\/g, "/").replace(/\/$/, "");
  const lista = spawnSync("git", ["ls-files", "-z", "--", carpeta], { cwd: raiz, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  if (lista.status !== 0) {
    console.error(`git ls-files falló: ${lista.stderr}`);
    process.exit(2);
  }
  const archivos = lista.stdout.split("\0").filter((r) => /\.(ts|tsx|mjs|js)$/.test(r) && fs.existsSync(path.join(raiz, r)));
  const porCarpeta = new Map();
  let total = 0;
  let comentarios = 0;
  for (const ruta of archivos) {
    const delArchivo = agruparLineas(comentariosDeCodigo(fs.readFileSync(path.join(raiz, ruta), "utf-8"), ruta));
    comentarios += delArchivo.length;
    for (const c of delArchivo) {
      // Un directivo de compilador o un deshabilitador de reglas no es prosa de nadie.
      if (/^\/\/\/\s*<|^\/\/\s*eslint-/.test(c.texto)) continue;
      if (!pareceEspanol(c.lineas)) continue;
      total++;
      const dir = path.posix.dirname(ruta);
      porCarpeta.set(dir, (porCarpeta.get(dir) ?? 0) + 1);
      if (!values.resumen) {
        const primero = c.lineas.find((l) => l !== "") ?? "";
        console.log(`${ruta}:${c.linea}  ${primero.length > 120 ? `${primero.slice(0, 120)}…` : primero}`);
      }
    }
  }
  if (!values.resumen && total > 0) console.log("");
  if (archivos.length === 0) console.log(`Aviso: git no tiene archivos de código versionados en «${carpeta}»; ¿está bien escrita la carpeta?`);
  console.log(`Comentarios en ${carpeta}/ (las líneas // seguidas cuentan como uno): ${comentarios}. Que parecen español: ${total}.`);
  for (const [dir, n] of [...porCarpeta].sort()) console.log(`  ${dir.padEnd(28)} ${String(n).padStart(5)}`);
}

if (esElPrincipal(import.meta.url)) main();
