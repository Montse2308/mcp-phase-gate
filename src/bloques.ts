// Bloques: la forma de cambiar el contenido de una ranura sin copiar el prompt entero.
//
//   <!-- bloque: fase-3/pruebas -->
//   contenido que sustituye a la ranura
//   <!-- /bloque -->
//
//   <!-- bloque: global/cero-rupturas | despues -->
//   contenido que se añade al final de la ranura
//   <!-- /bloque -->
//
// Un preset es un archivo de bloques, y una capa propia (global o de proyecto) los escribe en su
// `bloques.md`. Copiar un prompt entero para cambiar un párrafo deja una copia congelada que ya no
// recibe las mejoras del resto del texto; un bloque cambia solo su ranura y deja vivo lo demás.
//
// Este módulo solo lee y aplica: qué archivos de bloques entran y en qué orden lo decide capas.ts.

import * as fs from "fs";

import type { Capa } from "./capas.js";
import type { Hallazgo } from "./diagnostico.js";
import { mensaje } from "./i18n/mensajes.js";
import { leerPromptNormalizado } from "./phases.js";
import { archivoCanonico, modoCanonico, nombreCanonicoDeRanura } from "./vocabulario.js";

export type ModoBloque = "reemplazar" | "antes" | "despues";

export type Bloque = {
  id: string; // "fase-3/pruebas"
  archivo: string; // "global" o "fase-N"
  ranura: string;
  modo: ModoBloque;
  contenido: string; // las líneas entre los marcadores, unidas con \n, sin el salto final
  origen: { capa: Capa; archivo: string; linea: number };
};

// Por línea, como quitarMarcadores: un marcador ocupa su propia línea entera. En los dos idiomas (§8.2):
// `bloque` o `block`, `fase-3` o `phase-3`, el id de la ranura o su alias inglés, y el modo en cualquiera
// de los dos (`despues` o `after`). Todo se resuelve al id y al modo canónicos.
const APERTURA = /^[ \t]*<!--\s*(?:bloque|block):\s*(global|(?:fase|phase)-\d+)\/([\w-]+)\s*(?:\|\s*(reemplazar|antes|despues|replace|before|after)\s*)?-->[ \t]*$/;
const CIERRE = /^[ \t]*<!--\s*\/(?:bloque|block)\s*-->[ \t]*$/;
// Lo que parece un marcador de bloque y no es ninguno de los dos: un identificador inventado, un
// modo con acento, texto detrás. Dentro de un bloque llegaría tal cual al modelo, y fuera se
// ignoraría en silencio; las dos cosas esconden un error de quien lo escribió.
const PARECE_MARCADOR = /<!--\s*\/?\s*(?:bloque|block)\b/i;

// El id canónico del bloque que abre esta línea, o null si no abre ninguno. Para quien busca un bloque
// concreto en un archivo (eject), en cualquiera de las dos formas del marcador.
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

// Los bloques de un texto ya normalizado a LF. Un error de forma (sin cerrar, cierre suelto,
// anidado, marcador mal escrito) invalida el archivo entero: aplicar la mitad de un preset daría un
// prompt que nadie escribió.
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

// Un archivo que no existe no tiene bloques; uno que no se puede leer, sí es un aviso.
export function leerBloques(archivo: string, capa: Capa): { bloques: Bloque[]; avisos: Hallazgo[] } {
  if (!fs.statSync(archivo, { throwIfNoEntry: false })?.isFile()) return { bloques: [], avisos: [] };
  try {
    return parsearBloques(leerPromptNormalizado(archivo), archivo, capa);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    return { bloques: [], avisos: [aviso("BLOQUE-MAL-FORMADO", mensaje("BLOQUE-MAL-FORMADO", { archivo, error: detalle }))] };
  }
}

// ─── Ranuras ────────────────────────────────────────────────────────────────
// `ranura` o `slot`, con el id o su alias inglés: el nombre que se devuelve es siempre el canónico.
const RANURA_ABRE = /^[ \t]*<!--[ \t]*(?:ranura|slot)[ \t]*:[ \t]*([\w-]+)[ \t]*-->[ \t]*$/;
const RANURA_CIERRA = /^[ \t]*<!--[ \t]*\/(?:ranura|slot)[ \t]*-->[ \t]*$/;

type Ranura = { nombre: string; apertura: number; cierre: number }; // índices de línea de los marcadores

// Las ranuras de un texto, en orden. Una ranura que se abre dentro de otra, o que no se cierra, no
// cuenta: los prompts de fábrica los valida un test, y uno propio mal formado se entrega como esté.
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

// Sin las líneas en blanco del borde que toca: al sumar dos contenidos los separa una sola línea en
// blanco, venga cada uno como venga.
function unir(primero: string, segundo: string): string {
  const a = primero.replace(/(?:[ \t]*\n)+$/, "").replace(/^\s*$/, "");
  const b = segundo.replace(/^(?:[ \t]*\n)+/, "").replace(/^\s*$/, "");
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

// Aplica a las ranuras de `texto` (con sus marcadores todavía) los bloques de su archivo, en el orden
// en que llegan. Devuelve el texto con los marcadores intactos —los quita quien entrega el prompt—,
// la procedencia de cada ranura y los bloques que no encajaron en ninguna.
//
// Una ranura que ningún bloque toca se deja tal cual, byte a byte: es lo que garantiza que un
// proyecto sin bloques reciba exactamente el mismo prompt que antes.
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

  // De la última ranura a la primera, para que los índices de las de arriba sigan valiendo.
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

// Quita una ranura vacía junto con el encabezado "## …" que la presenta. Es lo que hace la ranura
// `global/extra`: si nadie le añade reglas, el prompt no lleva un "## REGLAS ADICIONALES" vacío.
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
