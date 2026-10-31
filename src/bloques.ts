// Blocks: the way to change the content of a slot without copying the whole prompt.
//
//   <!-- bloque: fase-3/pruebas -->
//   content that replaces the slot
//   <!-- /bloque -->
//
//   <!-- bloque: global/cero-rupturas | despues -->
//   content that is added at the end of the slot
//   <!-- /bloque -->
//
// A preset is a file of blocks, and a layer of one's own (global or per project) writes them in its
// `bloques.md`. Copying a whole prompt to change a paragraph leaves a frozen copy that no longer gets the
// improvements of the rest of the text; a block changes only its slot and leaves everything else alive.
//
// This module only reads and applies: which block files come in, and in what order, is decided by capas.ts.

import * as fs from "fs";

import type { Capa } from "./capas.js";
import type { Hallazgo } from "./diagnostico.js";
import { mensaje } from "./i18n/mensajes.js";
import { leerPromptNormalizado } from "./phases.js";
import { archivoCanonico, modoCanonico, nombreCanonicoDeRanura } from "./vocabulario.js";

export type ModoBloque = "reemplazar" | "antes" | "despues";

export type Bloque = {
  id: string; // "fase-3/pruebas"
  archivo: string; // "global" or "fase-N"
  ranura: string;
  modo: ModoBloque;
  contenido: string; // the lines between the markers, joined with \n, without the final line break
  origen: { capa: Capa; archivo: string; linea: number };
};

// Per line, like quitarMarcadores: a marker takes up its whole line. In both languages: `bloque` or `block`,
// `fase-3` or `phase-3`, the id of the slot or its English alias, and the mode in either (`despues` or
// `after`). Everything resolves to the canonical id and mode.
const APERTURA = /^[ \t]*<!--\s*(?:bloque|block):\s*(global|(?:fase|phase)-\d+)\/([\w-]+)\s*(?:\|\s*(reemplazar|antes|despues|replace|before|after)\s*)?-->[ \t]*$/;
const CIERRE = /^[ \t]*<!--\s*\/(?:bloque|block)\s*-->[ \t]*$/;
// What looks like a block marker and is neither of the two: a made-up identifier, a mode with an accent,
// text after it. Inside a block it would reach the model as is, and outside it would be ignored silently;
// both hide a mistake of whoever wrote it.
const PARECE_MARCADOR = /<!--\s*\/?\s*(?:bloque|block)\b/i;

// The canonical id of the block that this line opens, or null if it opens none. For whoever looks for a
// specific block in a file (eject), in either form of the marker.
export function idDeAperturaDeBloque(linea: string): string | null {
  const apertura = linea.match(APERTURA);
  return apertura ? `${archivoCanonico(apertura[1]!)}/${nombreCanonicoDeRanura(apertura[2]!)}` : null;
}

export function esCierreDeBloque(linea: string): boolean {
  return CIERRE.test(linea);
}

function aviso(codigo: string, texto: string): Hallazgo {
  return { severidad: "aviso", codigo, texto };
}

// The blocks of a text already normalized to LF. A shape error (unclosed, loose close, nested, badly
// written marker) invalidates the whole file: applying half a preset would give a prompt nobody wrote.
export function parsearBloques(texto: string, archivo: string, capa: Capa): { bloques: Bloque[]; avisos: Hallazgo[] } {
  const lineas = texto.split("\n");
  const bloques: Bloque[] = [];
  const avisos: Hallazgo[] = [];
  const vistos = new Set<string>();
  const malFormado = (linea: number, motivo: string): { bloques: Bloque[]; avisos: Hallazgo[] } => ({
    bloques: [],
    avisos: [aviso("BLOQUE-MAL-FORMADO", mensaje("BLOQUE-MAL-FORMADO", { archivo, linea, motivo }))],
  });

  let abierto: { archivo: string; ranura: string; modo: ModoBloque; linea: number; desde: number } | null = null;

  for (const [i, linea] of lineas.entries()) {
    const n = i + 1;
    const apertura = linea.match(APERTURA);
    const cierre = CIERRE.test(linea);

    if (apertura) {
      if (abierto) return malFormado(n, mensaje("BLOQUE-TXT-ANIDADO", { linea: abierto.linea }));
      abierto = {
        archivo: archivoCanonico(apertura[1]!),
        ranura: nombreCanonicoDeRanura(apertura[2]!),
        modo: modoCanonico(apertura[3]) ?? "reemplazar",
        linea: n,
        desde: i + 1,
      };
      continue;
    }

    if (cierre) {
      if (!abierto) return malFormado(n, mensaje("BLOQUE-TXT-CIERRE-SUELTO"));
      const id = `${abierto.archivo}/${abierto.ranura}`;
      if (vistos.has(id)) {
        avisos.push(aviso("BLOQUE-DUPLICADO", mensaje("BLOQUE-DUPLICADO", { archivo, linea: abierto.linea, id })));
      } else {
        vistos.add(id);
        bloques.push({
          id,
          archivo: abierto.archivo,
          ranura: abierto.ranura,
          modo: abierto.modo,
          contenido: lineas.slice(abierto.desde, i).join("\n"),
          origen: { capa, archivo, linea: abierto.linea },
        });
      }
      abierto = null;
      continue;
    }

    if (PARECE_MARCADOR.test(linea)) return malFormado(n, mensaje("BLOQUE-TXT-MARCADOR-MAL-ESCRITO"));
  }

  if (abierto) return malFormado(abierto.linea, mensaje("BLOQUE-TXT-SIN-CERRAR"));
  return { bloques, avisos };
}

// A file that does not exist has no blocks; one that cannot be read is a warning.
export function leerBloques(archivo: string, capa: Capa): { bloques: Bloque[]; avisos: Hallazgo[] } {
  if (!fs.statSync(archivo, { throwIfNoEntry: false })?.isFile()) return { bloques: [], avisos: [] };
  try {
    return parsearBloques(leerPromptNormalizado(archivo), archivo, capa);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { bloques: [], avisos: [aviso("BLOQUE-MAL-FORMADO", mensaje("BLOQUE-MAL-FORMADO", { archivo, error: detalle }))] };
  }
}

// ─── Slots ──────────────────────────────────────────────────────────────────
// `ranura` or `slot`, with the id or its English alias: the name that is returned is always the canonical one.
const RANURA_ABRE = /^[ \t]*<!--[ \t]*(?:ranura|slot)[ \t]*:[ \t]*([\w-]+)[ \t]*-->[ \t]*$/;
const RANURA_CIERRA = /^[ \t]*<!--[ \t]*\/(?:ranura|slot)[ \t]*-->[ \t]*$/;

type Ranura = { nombre: string; apertura: number; cierre: number }; // line indexes of the markers

// The slots of a text, in order. A slot that opens inside another, or is not closed, does not count: a test
// validates the factory prompts, and a malformed one of one's own is delivered as it is.
export function ranurasDe(texto: string): Ranura[] {
  const ranuras: Ranura[] = [];
  let abierta: { nombre: string; apertura: number } | null = null;
  for (const [i, linea] of texto.split("\n").entries()) {
    const abre = linea.match(RANURA_ABRE);
    if (abre) {
      abierta = abierta ? null : { nombre: nombreCanonicoDeRanura(abre[1]!), apertura: i };
      continue;
    }
    if (RANURA_CIERRA.test(linea) && abierta) {
      ranuras.push({ ...abierta, cierre: i });
      abierta = null;
    }
  }
  return ranuras;
}

export type Procedencia = { ranura: string; contenidoDe: string; modos: string[] };

function origenDe(bloque: Bloque): string {
  return `${bloque.origen.archivo}:${bloque.origen.linea}`;
}

// Without the blank lines of the edge it touches: when two contents are added they are separated by a
// single blank line, however each one comes.
function unir(primero: string, segundo: string): string {
  const a = primero.replace(/(?:[ \t]*\n)+$/, "").replace(/^\s*$/, "");
  const b = segundo.replace(/^(?:[ \t]*\n)+/, "").replace(/^\s*$/, "");
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

// Applies to the slots of `texto` (with their markers still in) the blocks of its file, in the order they
// arrive. Returns the text with the markers intact —whoever delivers the prompt removes them—, the origin
// of each slot and the blocks that did not fit in any.
//
// A slot that no block touches is left as it is, byte for byte: that is what guarantees that a project
// without blocks receives exactly the same prompt as before.
export function aplicarBloques(
  texto: string,
  archivo: string,
  bloques: Bloque[],
  contenidoPorDefecto: (linea: number) => string
): { texto: string; procedencia: Procedencia[]; huerfanos: Bloque[] } {
  const lineas = texto.split("\n");
  const ranuras = ranurasDe(texto);
  const estado = new Map(
    ranuras.map((ranura) => [
      ranura.nombre,
      {
        ranura,
        contenido: lineas.slice(ranura.apertura + 1, ranura.cierre).join("\n"),
        tocada: false,
        contenidoDe: contenidoPorDefecto(ranura.apertura + 1),
        modos: [] as string[],
      },
    ])
  );
  const huerfanos: Bloque[] = [];

  for (const bloque of bloques) {
    if (bloque.archivo !== archivo) continue;
    const actual = estado.get(bloque.ranura);
    if (!actual) {
      huerfanos.push(bloque);
      continue;
    }
    actual.tocada = true;
    if (bloque.modo === "reemplazar") {
      actual.contenido = bloque.contenido;
      actual.contenidoDe = origenDe(bloque);
      actual.modos = [];
    } else {
      actual.contenido = bloque.modo === "antes" ? unir(bloque.contenido, actual.contenido) : unir(actual.contenido, bloque.contenido);
      actual.modos.push(`${bloque.modo} (${origenDe(bloque)})`);
    }
  }

  // From the last slot to the first, so that the indexes of the ones above stay valid.
  for (const { ranura, contenido, tocada } of [...estado.values()].reverse()) {
    if (!tocada) continue;
    lineas.splice(ranura.apertura + 1, ranura.cierre - ranura.apertura - 1, ...(contenido === "" ? [] : contenido.split("\n")));
  }

  return {
    texto: lineas.join("\n"),
    procedencia: [...estado.values()].map(({ ranura, contenidoDe, modos }) => ({
      ranura: `${archivo}/${ranura.nombre}`,
      contenidoDe,
      modos,
    })),
    huerfanos,
  };
}

// Removes an empty slot together with the "## …" heading that introduces it. It is what the `global/extra`
// slot does: if nobody adds rules to it, the prompt does not carry an empty "## REGLAS ADICIONALES".
export function omitirRanuraVacia(texto: string, nombre: string): string {
  const lineas = texto.split("\n");
  const ranura = ranurasDe(texto).find((r) => r.nombre === nombre);
  if (!ranura) return texto;
  if (lineas.slice(ranura.apertura + 1, ranura.cierre).some((linea) => linea.trim() !== "")) return texto;

  let desde = ranura.apertura;
  let i = ranura.apertura - 1;
  while (i >= 0 && lineas[i]!.trim() === "") i--;
  if (i >= 0 && lineas[i]!.startsWith("## ")) desde = i;

  lineas.splice(desde, ranura.cierre - desde + 1);
  return lineas.join("\n");
}
