// The phases and their prompts. The number of phases is not hard-wired: they are discovered from the files
// in the prompts folder, and each one declares in its own header what the document it produces is called.

import * as fs from "fs";
import * as path from "path";
import { capasDesdeRutas, ensamblarConCapas, ensamblarFase } from "./capas.js";
import { promptsLayers } from "./config.js";
import { fallo, mensaje } from "./i18n/mensajes.js";
import { log } from "./log.js";
import { claveDeNombre, validarSegmento } from "./paths.js";
import { CARPETAS_DE_COMANDOS, valorDePrompt, vocabulario } from "./vocabulario.js";
import type { Idioma } from "./vocabulario.js";

// The global rules are prepended to each phase.
export const GLOBAL_RULES_FILE = "global-rules.md";

// The command of each phase (`/fN`): `comandos/fN.md` inside a prompts layer (`commands/fN.md` in an English
// layer; within one layer `comandos/` wins). The highest layer that has it wins, like the phases; with none,
// the phase uses a generic text.
export function resolveCommandFile(numero: number, capas: string[] = promptsLayers()): string | null {
  for (const base of [...capas].reverse()) {
    for (const carpeta of CARPETAS_DE_COMANDOS) {
      const ruta = path.join(base, carpeta, `f${numero}.md`);
      if (tipoDe(ruta) === "archivo") return ruta;
    }
  }
  return null;
}

// statSync with throwIfNoEntry only silences ENOENT: if a segment of the path is a file (ENOTDIR) or there
// is no permission, it throws all the same. To ask "is it a folder?" that is not an error.
function tipoDe(ruta: string): "archivo" | "carpeta" | "otro" | null {
  try {
    const info = fs.statSync(ruta, { throwIfNoEntry: false });
    if (!info) return null;
    return info.isDirectory() ? "carpeta" : info.isFile() ? "archivo" : "otro";
  } catch {
    return null;
  }
}

export function esCarpeta(ruta: string): boolean {
  return tipoDe(ruta) === "carpeta";
}

// Accepts "fase-1-descubrimiento.md" and also "phase-1-discovery.md", so that a set of prompts in English
// works without touching the code.
export const PHASE_FILE_PATTERN = /^(?:fase|phase)-(\d+)[-.]/i;

// Optional header at the start of the .md, between --- lines, with "key: value". There each phase declares
// what the document it produces is called. It lives attached to the prompt that describes that document —not
// in a separate configuration file— so that the name exists in one place only and is read live, without
// recompiling, like the rest of the prompt.
const PHASE_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type PhaseFile = {
  file: string;                           // full path: with layers the name is no longer enough
  title: string;
  documento?: string | undefined;         // the one the phase produces
  documentoInicial?: string | undefined;  // phase 1 only: the file start_task writes
  recibos?: string | undefined;           // subfolder of the batch receipts (Phase 4)
};

// Custom prompts, written for example with Notepad, arrive in CRLF, and sometimes with a BOM at the start.
// They are normalized when read: what is delivered to the model and what is compared in the tests is always
// in LF and without BOM. With the BOM in front, the frontmatter was not recognized and the phase was left
// without a document.
function aLF(texto: string): string {
  return texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

// Removes the slot markers and keeps their content. The model never sees them.
// A slot marks the content of a section that a preset can replace:
//   <!-- ranura: verificacion -->
//   default content
//   <!-- /ranura -->
// Only a marker that takes up its own line counts, and the whole line is removed. A marker with text after
// it, or two on the same line, is not touched: loadPhasePrompt warns about it.
// In English the marker is `<!-- slot: tests -->`.
export const MARCADOR_RANURA = /^[ \t]*<!--[ \t]*\/?(?:ranura|slot)(?:[ \t]*:[ \t]*[\w-]+)?[ \t]*-->[ \t]*\r?$\n?/gm;

export function quitarMarcadores(texto: string): string {
  return texto.replace(MARCADOR_RANURA, "");
}

// What looks like a slot marker and survived quitarMarcadores: badly written (with an accent, in capitals,
// with text after it). It would reach the model as is, so it is left in the log.
const RESTO_DE_MARCADOR = /<!--[^\n]*?(?:ranura|\bslot\b)/i;

export function entregable(texto: string, archivo: string): string {
  const limpio = quitarMarcadores(texto);
  if (RESTO_DE_MARCADOR.test(limpio)) {
    log("warning", mensaje("FASE-TXT-MARCADOR-NO-RECONOCIDO", { archivo }));
  }
  return limpio.trim();
}

// The receipts subfolder ends up inside a file_name, so it has to be a single portable segment, and visible:
// write_central_doc does not write in segments that start with a dot. An invalid value does not bring the
// phase down: it is ignored and left in the log.
function leerRecibos(valor: string | undefined, archivo: string): string | undefined {
  if (!valor) return undefined;
  try {
    const segmento = validarSegmento(valor, "recibos");
    if (segmento.startsWith(".")) throw fallo("FASE-TXT-RECIBOS-CON-PUNTO");
    return segmento;
  } catch (error: any) {
    log("warning", mensaje("FASE-TXT-RECIBOS-IGNORADO", { archivo, motivo: error.message }));
    return undefined;
  }
}

// A receipts subfolder named like a document breaks the flow: if it is called like the phase's document,
// the folder makes the phase count as closed at the first receipt. It is checked at the end, with the
// phases of all the layers already resolved.
function descartarRecibosQueChocan(phases: Map<number, PhaseFile>): void {
  const documentos = new Set<string>();
  for (const datos of phases.values()) {
    for (const nombre of [datos.documento, datos.documentoInicial]) {
      if (nombre) documentos.add(claveDeNombre(nombre));
    }
  }

  for (const datos of phases.values()) {
    if (datos.recibos && documentos.has(claveDeNombre(datos.recibos))) {
      log("warning", mensaje("FASE-TXT-RECIBOS-CHOCAN", { archivo: datos.file, recibos: datos.recibos }));
      datos.recibos = undefined;
    }
  }
}

export function parsePhaseFile(fullPath: string): { meta: Record<string, string>; cuerpo: string } {
  return separarFrontmatter(fs.readFileSync(fullPath, "utf-8"));
}

// The "key: value" header of an already read text, and the rest. It works the same for a prompt as for a
// batch receipt, which use the same format.
export function separarFrontmatter(texto: string): { meta: Record<string, string>; cuerpo: string } {
  const crudo = aLF(texto);
  const encontrada = crudo.match(PHASE_FRONTMATTER);

  if (!encontrada) return { meta: {}, cuerpo: crudo };

  const meta: Record<string, string> = {};
  for (const linea of (encontrada[1] ?? "").split(/\r?\n/)) {
    const corte = linea.indexOf(":");
    if (corte === -1) continue;
    meta[linea.slice(0, corte).trim()] = linea
      .slice(corte + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }

  return { meta, cuerpo: crudo.slice(encontrada[0].length) };
}

// Discovers the available phases from the files of the prompt folders. Adding a "fase-6-*.md" is enough for
// phase 6 to exist — also in the own folder, so layering does not only let one change phases: it lets one
// add them.
//
// The layers are walked in order and the last one that declares a phase is the one that stays. It layers BY
// PHASE NUMBER, not by file name: the user need not call their phase 2 the same as the package does, and
// forcing them to guess the exact name would be a trap.
//
// `capas` is a parameter and not a direct read of the environment so that the behavior can be tested with
// specific folders without depending on what the installed package brings.
export function discoverPhases(capas: string[] = promptsLayers()): Map<number, PhaseFile> {
  const phases = new Map<number, PhaseFile>();

  for (const base of capas) {
    // A layer that does not exist or is not a folder (PHASE_GATE_PROMPTS_PATH pointing to a file) is skipped:
    // doctor warns about it, and the phases of the other layers keep being served.
    if (!esCarpeta(base)) continue;

    // Resolved layer by layer: within one, the first in alphabetical order wins; between layers, the highest
    // wins. Without this intermediate map the alphabetical rule of the low layer would block the upper one,
    // which is exactly the opposite of what is wanted.
    const deEstaCapa = new Map<number, PhaseFile>();

    for (const file of fs.readdirSync(base).sort()) {
      const match = file.match(PHASE_FILE_PATTERN);
      if (!match || !file.toLowerCase().endsWith(".md")) continue;

      const phaseNumber = Number(match[1]);
      if (deEstaCapa.has(phaseNumber)) continue; // the first in alphabetical order wins

      const fullPath = path.join(base, file);

      let meta: Record<string, string> = {};
      let cuerpo = "";
      try {
        ({ meta, cuerpo } = parsePhaseFile(fullPath));
      } catch {
        // If the file cannot be read here, the real error is reported when the phase is invoked.
      }

      deEstaCapa.set(phaseNumber, {
        file: fullPath,
        title: readPhaseTitle(cuerpo, file),
        // In the language of the prompt: `documento` or `document`, `recibos` or `receipts`.
        documento: valorDePrompt(meta, "documento"),
        documentoInicial: valorDePrompt(meta, "documentoInicial"),
        recibos: leerRecibos(valorDePrompt(meta, "recibos"), fullPath),
      });
    }

    for (const [numero, datos] of deEstaCapa) phases.set(numero, datos);
  }

  descartarRecibosQueChocan(phases);
  return phases;
}

// The title is the first "# ..." heading of the body; if there is none, it is derived from the file name so
// that the tool's description stays useful.
export function readPhaseTitle(cuerpo: string, fileName: string): string {
  for (const line of cuerpo.split(/\r?\n/)) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  return fileName.replace(PHASE_FILE_PATTERN, "").replace(/\.md$/i, "");
}

// Name of the initial context file that start_task writes. Phase 1 declares it in its header; the constant
// is only the fallback for a set of prompts that does not declare it.
export const CONTEXTO_INICIAL_POR_DEFECTO = "00 - Contexto Inicial.md";

export function nombreContextoInicial(capas: string[] = promptsLayers()): string {
  return discoverPhases(capas).get(1)?.documentoInicial || CONTEXTO_INICIAL_POR_DEFECTO;
}

// Read on every call (not cached) so that a prompt can be tuned and tried right away, without restarting the
// MCP server. The assembly (global rules, phase body, blocks over its slots and the list of files) lives in
// capas.ts; this is left for whoever asks for the text with a specific list of folders, without a project.
export function loadPhasePrompt(phase: number, capas?: string[]): string {
  return (capas ? ensamblarConCapas(phase, capasDesdeRutas(capas)) : ensamblarFase(phase, null)).texto;
}

// The global-rules.md of the highest layer that has it. A file of one's own replaces the factory one, but
// the skeleton sections (BASE DE CADA DECISIÓN and PENDIENTES HEREDADOS) that it lacks are re-injected on
// assembly (capas.ts). The recommended way to add rules is no longer to copy the file: it is a bloques.md
// with `global/cero-rupturas`, `global/evidencia` or `global/extra`.
export function resolveGlobalRules(capas: string[] = promptsLayers()): string | null {
  for (const base of [...capas].reverse()) {
    const ruta = path.join(base, GLOBAL_RULES_FILE);
    if (fs.existsSync(ruta)) return ruta;
  }

  return null;
}

// The text of a custom prompt as the model sees it: in LF and without BOM. Used by whoever reads a prompts
// file outside this module, such as the diagnosis.
export function leerPromptNormalizado(ruta: string): string {
  return aLF(fs.readFileSync(ruta, "utf-8"));
}

// Block added at the end of the prompt with the exact names of the documents: the one this phase produces
// and those of the previous ones, which are the ones to read, and the receipts subfolder of the phase that
// declares it. It goes here and not in the client's command so that the name lives in a single place; this
// way tuning a prompt does not also force editing a command on every device.
// It is written in the project's language (`idioma`), like every block the server adds to a prompt.
export function describePhaseFiles(available: Map<number, PhaseFile>, phase: number, idioma: Idioma = "es"): string {
  const propio = available.get(phase)?.documento;

  const previos = [...available.entries()]
    .filter(([numero, datos]) => numero < phase && datos.documento)
    .sort((a, b) => a[0] - b[0])
    .map(([numero, datos]) =>
      mensaje("FASE-TXT-DOCUMENTO-PREVIO", { numero, documento: datos.documento, recibos: datos.recibos ?? null }, idioma)
    );

  if (!propio && previos.length === 0) return "";

  const lineas = [`## ${vocabulario(idioma).encabezados.archivosDeLaTarea}`];

  if (previos.length) {
    lineas.push("", mensaje("FASE-TXT-LEE-PREVIOS", {}, idioma), ...previos);
  }

  if (propio) {
    // In the batches phase, the document and the receipts are written by record_batch: the server refuses to
    // write them with write_central_doc, so saying otherwise here would send the model against a wall.
    const recibos = available.get(phase)?.recibos;
    if (recibos) {
      lineas.push(
        "",
        mensaje("FASE-TXT-DOCUMENTO-DE-LOTES", { documento: propio }, idioma),
        "",
        mensaje("FASE-TXT-RECIBOS-DE-LOTE", { recibos }, idioma)
      );
    } else {
      lineas.push("", mensaje("FASE-TXT-DOCUMENTO-PROPIO", { documento: propio }, idioma));
    }
  } else {
    lineas.push("", mensaje("FASE-TXT-SIN-DOCUMENTO", {}, idioma));
  }

  return lineas.join("\n");
}
