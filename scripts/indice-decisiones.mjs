// El índice de docs/decisiones.md: una línea por entrada, con su título como texto del enlace y el ancla que GitHub
// le da al encabezado. Vive entre las marcas <!-- indice:inicio --> e <!-- indice:fin -->, y se genera para que no
// se desactualice a mano: cada decisión nueva trae su línea con solo volver a correr el script.
//
// Las entradas son los encabezados `## ` fuera de los bloques de código: el archivo no tiene otros.
//
// Uso:
//   node scripts/indice-decisiones.mjs              reescribe el índice en docs/decisiones.md
//   node scripts/indice-decisiones.mjs --comprobar  sale 1 si el índice no coincide con las entradas (lo corre un test)

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVO = path.join(raiz, "docs", "decisiones.md");
export const INICIO = "<!-- indice:inicio -->";
export const FIN = "<!-- indice:fin -->";

// Los títulos de las entradas, en el orden del archivo. Un `## ` dentro de un bloque de código (el de las ranuras
// de los prompts, por ejemplo) no es una entrada, y el índice mismo tampoco tiene encabezados.
export function titulosDeLasEntradas(texto) {
  const titulos = [];
  let enBloque = false;
  for (const linea of texto.split(/\r?\n/)) {
    if (/^\s*```/.test(linea)) enBloque = !enBloque;
    else if (!enBloque && linea.startsWith("## ")) titulos.push(linea.slice(3).trim());
  }
  return titulos;
}

// El ancla que GitHub le pone a un encabezado: minúsculas, sin lo que no sea letra, número, guion o espacio, y los
// espacios a guiones. Si dos títulos dan la misma, la segunda lleva -1, la tercera -2.
export function anclasDe(titulos) {
  const vistas = new Map();
  return titulos.map((titulo) => {
    const base = titulo.replace(/`/g, "").toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "").replace(/ /g, "-");
    const n = vistas.get(base) ?? 0;
    vistas.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  });
}

export function bloqueDelIndice(texto) {
  const titulos = titulosDeLasEntradas(texto);
  const anclas = anclasDe(titulos);
  // Un corchete en el título cerraría el enlace antes de tiempo.
  const lineas = titulos.map((titulo, i) => `- [${titulo.replace(/([[\]])/g, "\\$1")}](#${anclas[i]})`);
  return [
    INICIO,
    "**Índice** · *Index*",
    "",
    "Una línea por entrada, la más reciente primero. *One line per entry, newest first. The entries are written in Spanish: each one says what was decided, why, and what was discarded.*",
    "",
    ...lineas,
    FIN,
  ].join("\n");
}

// El texto con el índice al día. Falla si las marcas no están: sin ellas no se sabe dónde ponerlo.
export function conIndice(texto) {
  const inicio = texto.indexOf(INICIO);
  const fin = texto.indexOf(FIN);
  if (inicio === -1 || fin === -1 || fin < inicio) throw new Error(`docs/decisiones.md necesita las marcas ${INICIO} y ${FIN}.`);
  // El índice se calcula sobre el texto sin el índice mismo, así que no se cuenta a sí mismo.
  const sinIndice = texto.slice(0, inicio) + texto.slice(fin + FIN.length);
  const bloque = bloqueDelIndice(sinIndice);
  return texto.slice(0, inicio) + bloque + texto.slice(fin + FIN.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const texto = fs.readFileSync(ARCHIVO, "utf-8");
  const nuevo = conIndice(texto);
  if (process.argv.includes("--comprobar")) {
    if (nuevo !== texto) {
      console.error("El índice de docs/decisiones.md no coincide con sus entradas: corre `node scripts/indice-decisiones.mjs`.");
      process.exit(1);
    }
    console.log("El índice de docs/decisiones.md está al día.");
  } else {
    fs.writeFileSync(ARCHIVO, nuevo, "utf-8");
    console.log(`Índice de docs/decisiones.md: ${titulosDeLasEntradas(texto).length} entradas.`);
  }
}
