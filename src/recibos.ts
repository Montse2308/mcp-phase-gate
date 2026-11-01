// Batch receipts as data: the only place that reads and writes them.
//
// Up to 2.x the receipt was drafted by the model with write_central_doc, following a template from the
// prompt. Since 3.0 the server writes it (record_batch) from fields, and this module fixes its format: the
// original template with more keys in the frontmatter. The 2.x keys are kept in place, so a 3.0 receipt is
// still readable with the rules of then.
//
// Two guarantees:
//   - writing is deterministic: the same Recibo always gives the same bytes, in LF and with a final line
//     break, and writing what was read from a receipt written here gives the same bytes again;
//   - reading is tolerant: a receipt written by hand with 2.x is read without throwing, with whatever it has.

import * as path from "path";

import { fallo, mensaje } from "./i18n/mensajes.js";
import { leerTextoAcotado, validarSegmento } from "./paths.js";
import {
  FORMAS_DE_VACIO_EN_RECIBO as FORMAS_DE_VACIO,
  condicionalCanonica,
  esCommitNoAplica,
  esOrigenServidor,
  estadoCanonico,
  idiomaDeFrontmatter,
  normalizarClaves,
  seccionCanonica,
  tipoDeAnclaCanonico,
  vocabulario,
} from "./vocabulario.js";
import type { Idioma, SeccionDeRecibo } from "./vocabulario.js";

export type EstadoLote = "verificado" | "con pendientes" | "fallido" | "descartado";

export type Ancla =
  | { tipo: "commit"; repo: string; sha: string; corto: string; asunto: string; rama: string; verificado: string }
  | { tipo: "sha256"; ruta: string; sha256: string; bytes: number; verificado: string }
  | { tipo: "nota"; texto: string }
  | { tipo: "pendiente" };

export type TituloCondicional = "Lo que sigue igual" | "Reversión" | "Aviso a alguien más" | "Deuda anotada";
export const TITULOS_CONDICIONALES: readonly TituloCondicional[] = ["Lo que sigue igual", "Reversión", "Aviso a alguien más", "Deuda anotada"];

export type Recibo = {
  lote: number;
  de: number;
  titulo: string;
  repo: string | null;
  rama: string | null;
  estado: EstadoLote;
  ancla: Ancla;
  fecha: string; // YYYY-MM-DD
  registrado: string; // ISO, date of the last write by the server
  origen: "servidor" | "manual"; // manual = receipt written by hand with 2.x
  queSeHizo: string;
  archivos: { archivo: string; cambio: string }[];
  verificacion: string;
  esperaAlUsuario: { prueba: string; esperado: string }[];
  desvios: string;
  decisiones: string;
  condicionales: { titulo: TituloCondicional; texto: string }[];
  verificacionDelCommit: string | null; // differences between the commit and the Archivos table
};

// What the server puts in the frontmatter of the documents it generates itself (the index, or the receipt
// that becomes the phase's document with a single batch).
export const GENERADO_POR = "mcp-phase-gate";

// ─── Name of the receipt ────────────────────────────────────────────────────
// "L02 - filtro por categoría.md". The slug is made by the server, not by the model: the prompt used to ask
// for "no : / \ < > ..." and a "fix(rutas): …" copied from the commit was enough to create a file that
// Windows does not store.
//
// 40 characters at most: with a Documentation in a synchronized folder with a long path, a slug of 60 left
// the receipt's path close to the limit of 255.
export const LARGO_MAXIMO_DEL_SLUG = 40;

export function dosDigitos(lote: number): string {
  return String(lote).padStart(2, "0");
}

export function etiquetaDeLote(lote: number): string {
  return `L${dosDigitos(lote)}`;
}

export function slugDe(titulo: string): string {
  const limpio = titulo
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N} -]/gu, " ")
    .replace(/ {2,}/g, " ")
    .trim();

  // By code points, not by UTF-16 units: so that a cut never splits a character.
  let caracteres = Array.from(limpio);
  if (caracteres.length > LARGO_MAXIMO_DEL_SLUG) {
    // Without splitting words: it is cut at the last space of the first 41 characters (if the 41st is a space,
    // word 40 fits whole). A single word longer than the cap is cut bluntly.
    const ultimoEspacio = caracteres.slice(0, LARGO_MAXIMO_DEL_SLUG + 1).lastIndexOf(" ");
    caracteres = caracteres.slice(0, ultimoEspacio > 0 ? ultimoEspacio : LARGO_MAXIMO_DEL_SLUG);
  }

  const slug = caracteres.join("").replace(/[ .]+$/, "");
  return slug || "lote";
}

export function nombreDeRecibo(lote: number, titulo: string): string {
  if (!Number.isInteger(lote) || lote < 1 || lote > 99) {
    throw fallo("RECIBOS-LOTE-FUERA-DE-RANGO", { lote });
  }
  return validarSegmento(`${etiquetaDeLote(lote)} - ${slugDe(titulo)}.md`, mensaje("RECIBOS-CAMPO-NOMBRE"));
}

// The batch of a receipt name ("L02 - x.md" -> 2), or null if it is not one.
export function loteDelNombre(nombre: string): number | null {
  const encontrado = nombre.match(/^L(\d{2}) - .*\.md$/i);
  const lote = encontrado ? Number(encontrado[1]) : NaN;
  return lote >= 1 && lote <= 99 ? lote : null;
}

// ─── Writing ────────────────────────────────────────────────────────────────
// In the project's language: keys, values, sections and what is written in an empty section, so that a
// heading never stays without text. When reading, any usual way of saying "nothing" in both languages
// counts as empty.
function sinCR(texto: string): string {
  return texto.replace(/\r\n?/g, "\n");
}

// A frontmatter value is a single line. Line breaks and backslashes are escaped, so that a multi-line note
// comes back the same when read.
function enUnaLinea(valor: string): string {
  return sinCR(valor.trim()).replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

function deUnaLinea(valor: string): string {
  return valor.replace(/\\(\\|n)/g, (_, c: string) => (c === "n" ? "\n" : "\\"));
}

// A table cell: `|` as `\|` and line breaks as <br>. The index uses it too.
export function celda(texto: string): string {
  return sinCR(texto).trim().replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function tabla(cabecera: [string, string], filas: [string, string][], vacia: string): string {
  if (filas.length === 0) return vacia;
  return [`| ${cabecera[0]} | ${cabecera[1]} |`, "|---|---|", ...filas.map(([a, b]) => `| ${celda(a)} | ${celda(b)} |`)].join("\n");
}

// A line that starts like a heading is indented one space: inside a section it is text, and when reading it
// would cut the section in two.
function texto(contenido: string, vacia: string): string {
  const limpio = sinCR(contenido).trim();
  if (!limpio) return vacia;
  return limpio
    .split("\n")
    .map((linea) => (/^#{1,2} /.test(linea) ? ` ${linea}` : linea))
    .join("\n");
}

function valorDeCommit(ancla: Ancla, idioma: Idioma): string {
  if (ancla.tipo === "commit") return ancla.corto;
  if (ancla.tipo === "pendiente") return vocabulario(idioma).recibo.commitPendiente;
  return vocabulario(idioma).recibo.noAplica;
}

export function escribirRecibo(r: Recibo, opciones: { comoDocumento?: boolean; idioma?: Idioma } = {}): string {
  const idioma = opciones.idioma ?? "es";
  const v = vocabulario(idioma).recibo;
  const k = v.claves;
  const fm: [string, string][] = [];
  // With a single batch, the receipt becomes the phase's document and its frontmatter says so.
  if (opciones.comoDocumento) fm.push([k.lotes, String(r.de)], [k.generado_por, GENERADO_POR]);
  fm.push(
    [k.lote, etiquetaDeLote(r.lote)],
    [k.de, String(r.de)],
    [k.repo, r.repo ?? "—"],
    [k.rama, r.rama ?? "—"],
    [k.estado, v.estados[r.estado]],
    [k.commit, valorDeCommit(r.ancla, idioma)],
    [k.fecha, r.fecha],
    [k.ancla, v.anclas[r.ancla.tipo]]
  );
  if (r.ancla.tipo === "commit") fm.push([k.commit_completo, r.ancla.sha], [k.asunto, enUnaLinea(r.ancla.asunto)]);
  if (r.ancla.tipo === "sha256") fm.push([k.artefacto, enUnaLinea(r.ancla.ruta)], [k.sha256, r.ancla.sha256], [k.bytes, String(r.ancla.bytes)]);
  if (r.ancla.tipo === "nota") fm.push([k.nota, enUnaLinea(r.ancla.texto)]);
  fm.push([k.registrado, r.registrado], [k.origen, v.origen[r.origen]]);

  const s = v.secciones;
  const secciones: [string, string][] = [
    [s.queSeHizo, texto(r.queSeHizo, v.vacias.queSeHizo)],
    [s.archivos, tabla(v.tablaArchivos, r.archivos.map((f) => [f.archivo, f.cambio]), v.vacias.archivos)],
    [s.verificacion, texto(r.verificacion, v.vacias.verificacion)],
    [s.esperaAlUsuario, tabla(v.tablaEspera, r.esperaAlUsuario.map((f) => [f.prueba, f.esperado]), v.vacias.esperaAlUsuario)],
    [s.desvios, texto(r.desvios, v.vacias.desvios)],
    [s.decisiones, texto(r.decisiones, v.vacias.decisiones)],
  ];

  // The conditionals only if they carry text, always in the template's order.
  const condicionales = [...r.condicionales]
    .filter((c) => sinCR(c.texto).trim())
    .sort((a, b) => TITULOS_CONDICIONALES.indexOf(a.titulo) - TITULOS_CONDICIONALES.indexOf(b.titulo));
  for (const c of condicionales) secciones.push([v.condicionales[c.titulo], texto(c.texto, "")]);

  if (r.ancla.tipo === "commit" && r.verificacionDelCommit !== null && sinCR(r.verificacionDelCommit).trim()) {
    secciones.push([s.verificacionDelCommit, texto(r.verificacionDelCommit, "")]);
  }

  const titulo = r.titulo.replace(/\s+/g, " ").trim();
  return [
    "---",
    ...fm.map(([clave, valor]) => `${clave}: ${valor}`),
    "---",
    "",
    `# ${etiquetaDeLote(r.lote)} — ${titulo}`,
    "",
    secciones.map(([encabezado, cuerpo]) => `## ${encabezado}\n${cuerpo}`).join("\n\n"),
    "",
  ].join("\n");
}

// ─── Reading ────────────────────────────────────────────────────────────────
const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

// The "key: value" frontmatter of a receipt, without touching quotes: a commit subject can start with one.
// It normalizes the BOM and the line endings first.
export function frontmatterDeRecibo(contenido: string): { meta: Record<string, string>; cuerpo: string } {
  const crudo = sinCR(contenido.replace(/^\uFEFF/, ""));
  const encontrado = crudo.match(FRONTMATTER);
  if (!encontrado) return { meta: {}, cuerpo: crudo };
  // With the canonical keys: a receipt in English (`batch`, `status`…) is read the same.
  return { meta: normalizarClaves(frontmatterCrudo(encontrado[1] ?? "")), cuerpo: crudo.slice(encontrado[0].length) };
}

function frontmatterCrudo(lineas: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const linea of lineas.split("\n")) {
    const corte = linea.indexOf(":");
    if (corte === -1) continue;
    meta[linea.slice(0, corte).trim()] = linea.slice(corte + 1).trim();
  }
  return meta;
}

// A "## X" section of the receipt, in either language: the template's canonical section or the canonical
// title of a conditional.
function seccionConocida(titulo: string): SeccionDeRecibo | TituloCondicional | null {
  return seccionCanonica(titulo) ?? condicionalCanonica(titulo);
}

// The known "## X" sections, with their text. A "## " that is not from the template stays inside the
// section where it appears: it is never lost and does not make the reading fail.
function secciones(cuerpo: string): { h1: string | null; mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  let h1: string | null = null;
  let actual: string | null = null;
  let lineas: string[] = [];
  const cerrar = () => {
    if (actual !== null) mapa.set(actual, lineas.join("\n").trim());
  };

  for (const linea of cuerpo.split("\n")) {
    if (h1 === null && actual === null && linea.startsWith("# ")) {
      h1 = linea.slice(2).trim();
      continue;
    }
    const conocida = linea.startsWith("## ") ? seccionConocida(linea.slice(3)) : null;
    if (conocida) {
      cerrar();
      actual = conocida;
      lineas = [];
    } else if (actual !== null) {
      lineas.push(linea);
    }
  }
  cerrar();
  return { h1, mapa };
}

function esVacia(texto: string): boolean {
  return FORMAS_DE_VACIO.has(texto.replace(/[_*`]/g, "").trim().replace(/[.…]+$/, "").trim().toLowerCase());
}

function textoDe(mapa: Map<string, string>, titulo: string): string {
  const contenido = mapa.get(titulo) ?? "";
  return esVacia(contenido) ? "" : contenido;
}

// The cells of a table row, splitting at the `|` that are not escaped.
function celdas(linea: string): string[] {
  const interior = linea.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return interior.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n"));
}

function filasDeTabla(contenido: string): [string, string][] {
  const filas = contenido.split("\n").filter((linea) => linea.trim().startsWith("|"));
  return filas
    .slice(1) // the header
    .filter((linea) => !/^\|?\s*:?-{3,}/.test(linea.trim()))
    .map((linea) => {
      const [a = "", b = ""] = celdas(linea);
      return [a, b];
    });
}

const ES_HASH = /^[0-9a-f]{7,40}$/i;

// In either language. A state that is not recognized is not taken as good: it stays with pending items.
function estadoDe(valor: string | undefined): EstadoLote {
  return estadoCanonico(valor) ?? "con pendientes";
}

function nulo(valor: string | undefined): string | null {
  const limpio = (valor ?? "").trim();
  return limpio === "" || limpio === "—" || limpio === "-" ? null : limpio;
}

function anclaDe(meta: Record<string, string>, repo: string | null, rama: string | null, verificado: string): Ancla {
  const commit = (meta.commit ?? "").trim();
  switch (tipoDeAnclaCanonico(meta.ancla)) {
    case "commit":
      return {
        tipo: "commit",
        repo: repo ?? "",
        sha: (meta.commit_completo ?? commit).trim(),
        corto: commit,
        asunto: deUnaLinea(meta.asunto ?? ""),
        rama: rama ?? "",
        verificado,
      };
    case "sha256":
      return { tipo: "sha256", ruta: deUnaLinea(meta.artefacto ?? ""), sha256: (meta.sha256 ?? "").trim(), bytes: Number(meta.bytes) || 0, verificado };
    case "nota":
      return { tipo: "nota", texto: deUnaLinea(meta.nota ?? "") };
    case "pendiente":
      return { tipo: "pendiente" };
  }

  // A 2.x receipt has no `ancla`: it is deduced from `commit`. A hash stays as an unverified commit
  // (empty verificado); `no aplica`, as a note.
  if (ES_HASH.test(commit)) return { tipo: "commit", repo: repo ?? "", sha: commit, corto: commit.slice(0, 7), asunto: "", rama: rama ?? "", verificado: "" };
  if (esCommitNoAplica(commit)) return { tipo: "nota", texto: commit.toLowerCase() };
  return { tipo: "pendiente" };
}

// What comes in by hand through the write_central_doc escape hatch (a receipt or the Phase 4 document) can
// never pass for something the server wrote: its frontmatter is left with `origen: manual` and without
// `generado_por`, whatever the text says.
export function comoManual(contenido: string): string {
  const crudo = sinCR(contenido.replace(/^\uFEFF/, ""));
  const encontrado = crudo.match(FRONTMATTER);
  if (!encontrado) return crudo;
  // In the language the frontmatter comes in, and without those keys in either.
  const origen = vocabulario(idiomaDeFrontmatter(frontmatterCrudo(encontrado[1] ?? ""))).recibo.claves.origen;
  const lineas = (encontrado[1] ?? "").split("\n").filter((linea) => !/^\s*(origen|origin|generado_por|generated_by)\s*:/i.test(linea));
  return `---\n${[...lineas, `${origen}: manual`].join("\n")}\n---\n${crudo.slice(encontrado[0].length)}`;
}

// What is needed to know how a batch is doing, reading only the frontmatter: for the progress of a task
// (tasks.ts), which is computed on every listing.
export function cabeceraDeRecibo(contenido: string, nombre: string = ""): { lote: number; estado: EstadoLote; ancla: Ancla["tipo"] } {
  const { meta } = frontmatterDeRecibo(contenido);
  const deMeta = Number((meta.lote ?? "").replace(/^L/i, ""));
  const lote = Number.isInteger(deMeta) && deMeta > 0 ? deMeta : (loteDelNombre(nombre) ?? 0);
  return { lote, estado: estadoDe(meta.estado), ancla: anclaDe(meta, nulo(meta.repo), nulo(meta.rama), "").tipo };
}

// A receipt from its text. `nombre` is the file's: it gives the batch and the title when the frontmatter or
// the heading do not carry them.
export function parsearRecibo(contenido: string, nombre: string = ""): Recibo {
  const { meta, cuerpo } = frontmatterDeRecibo(contenido);
  const { h1, mapa } = secciones(cuerpo);

  const deMeta = Number((meta.lote ?? "").replace(/^L/i, ""));
  const lote = Number.isInteger(deMeta) && deMeta > 0 ? deMeta : (loteDelNombre(nombre) ?? 0);
  const delNombre = nombre.replace(/^L\d{2} - /i, "").replace(/\.md$/i, "");
  const titulo = (h1 ?? "").replace(/^L\d+\s*[—–:-]\s*/i, "").trim() || delNombre;

  const repo = nulo(meta.repo);
  const rama = nulo(meta.rama);
  const origen = esOrigenServidor(meta.origen) ? "servidor" : "manual";
  const registrado = (meta.registrado ?? "").trim();

  const condicionales: Recibo["condicionales"] = [];
  for (const titulo of TITULOS_CONDICIONALES) {
    const textoCondicional = mapa.get(titulo);
    if (textoCondicional) condicionales.push({ titulo, texto: textoCondicional });
  }

  return {
    lote,
    de: Number(meta.de) || 0,
    titulo,
    repo,
    rama,
    estado: estadoDe(meta.estado),
    // What the server verified, it verified when writing it; a manual receipt was never verified.
    ancla: anclaDe(meta, repo, rama, origen === "servidor" ? registrado : ""),
    fecha: (meta.fecha ?? "").trim(),
    registrado,
    origen,
    queSeHizo: textoDe(mapa, "queSeHizo"),
    archivos: esVacia(mapa.get("archivos") ?? "") ? [] : filasDeTabla(mapa.get("archivos") ?? "").map(([archivo, cambio]) => ({ archivo, cambio })),
    verificacion: textoDe(mapa, "verificacion"),
    esperaAlUsuario: esVacia(mapa.get("esperaAlUsuario") ?? "") ? [] : filasDeTabla(mapa.get("esperaAlUsuario") ?? "").map(([prueba, esperado]) => ({ prueba, esperado })),
    desvios: textoDe(mapa, "desvios"),
    decisiones: textoDe(mapa, "decisiones"),
    condicionales,
    verificacionDelCommit: mapa.has("verificacionDelCommit") ? (mapa.get("verificacionDelCommit") ?? "") : null,
  };
}

export function leerRecibo(ruta: string): Recibo {
  return parsearRecibo(leerTextoAcotado(ruta), path.basename(ruta));
}
