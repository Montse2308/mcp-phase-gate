// Las fases y sus prompts. El número de fases no está cableado: se descubren de los
// archivos que existan en la carpeta de prompts, y cada una declara en su propia cabecera
// cómo se llama el documento que produce.

import * as fs from "fs";
import * as path from "path";
import { promptsPath } from "./config.js";

// Las reglas globales se anteponen a cada fase.
const GLOBAL_RULES_FILE = "global-rules.md";

// Acepta "fase-1-descubrimiento.md" y también "phase-1-discovery.md",
// para que un juego de prompts en inglés funcione sin tocar el código.
export const PHASE_FILE_PATTERN = /^(?:fase|phase)-(\d+)[-.]/i;

// Cabecera opcional al inicio del .md, entre líneas de ---, con "clave: valor".
// Ahí cada fase declara cómo se llama el documento que produce. Vive pegada al prompt que
// describe ese documento —no en un archivo de configuración aparte— para que el nombre exista
// en un solo lugar y se lea en vivo, sin recompilar, igual que el resto del prompt.
const PHASE_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type PhaseFile = {
  file: string;
  title: string;
  documento?: string | undefined;         // el que produce la fase
  documentoInicial?: string | undefined;  // solo la fase 1: el archivo que escribe start_task
};

export function parsePhaseFile(fullPath: string): { meta: Record<string, string>; cuerpo: string } {
  const crudo = fs.readFileSync(fullPath, "utf-8");
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

// Descubre las fases disponibles a partir de los archivos de la carpeta de prompts.
// Agregar un "fase-6-*.md" basta para que exista la fase 6.
export function discoverPhases(): Map<number, PhaseFile> {
  const phases = new Map<number, PhaseFile>();
  const base = promptsPath();

  if (!fs.existsSync(base)) {
    return phases;
  }

  for (const file of fs.readdirSync(base).sort()) {
    const match = file.match(PHASE_FILE_PATTERN);
    if (!match || !file.toLowerCase().endsWith(".md")) continue;

    const phaseNumber = Number(match[1]);
    if (phases.has(phaseNumber)) continue; // gana el primero por orden alfabético

    let meta: Record<string, string> = {};
    let cuerpo = "";
    try {
      ({ meta, cuerpo } = parsePhaseFile(path.join(base, file)));
    } catch {
      // Si el archivo no se puede leer aquí, el error real se reporta al invocar la fase.
    }

    phases.set(phaseNumber, {
      file,
      title: readPhaseTitle(cuerpo, file),
      documento: meta.documento || undefined,
      documentoInicial: meta.documento_inicial || undefined,
    });
  }

  return phases;
}

// El título es el primer encabezado "# ..." del cuerpo; si no lo hay, se deriva del nombre
// del archivo para que la descripción de la tool siga siendo útil.
export function readPhaseTitle(cuerpo: string, fileName: string): string {
  for (const line of cuerpo.split(/\r?\n/)) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  return fileName.replace(PHASE_FILE_PATTERN, "").replace(/\.md$/i, "");
}

// Nombre del archivo de contexto inicial que escribe start_task. Lo declara la fase 1 en su
// cabecera; la constante es solo el respaldo para un juego de prompts que no lo declare.
export const CONTEXTO_INICIAL_POR_DEFECTO = "00 - Contexto Inicial.md";

export function nombreContextoInicial(): string {
  return discoverPhases().get(1)?.documentoInicial || CONTEXTO_INICIAL_POR_DEFECTO;
}

// Se lee en cada llamada (no se cachea) para poder afinar un prompt y probarlo
// de inmediato, sin reiniciar el servidor MCP.
export function loadPhasePrompt(phase: number): string {
  const base = promptsPath();
  const available = discoverPhases();
  const entry = available.get(phase);

  if (!entry) {
    const list = [...available.keys()].sort((a, b) => a - b).join(", ");
    throw new Error(
      list
        ? `Fase no válida. Las fases disponibles son: ${list}.`
        : `No se encontró ningún prompt de fase en ${base}. Verifica que la carpeta 'prompts' exista junto al build.`
    );
  }

  const parts: string[] = [];

  const globalRulesPath = path.join(base, GLOBAL_RULES_FILE);
  if (fs.existsSync(globalRulesPath)) {
    parts.push(fs.readFileSync(globalRulesPath, "utf-8").trim());
  }

  parts.push(parsePhaseFile(path.join(base, entry.file)).cuerpo.trim());

  const archivos = describePhaseFiles(available, phase);
  if (archivos) parts.push(archivos);

  return parts.join("\n\n");
}

// Bloque que se añade al final del prompt con los nombres exactos de los documentos: el que
// produce esta fase y los de las anteriores, que son los que hay que leer. Va aquí y no en el
// comando del cliente para que el nombre viva en un solo sitio; así afinar un prompt no obliga
// a editar además un comando en cada dispositivo.
export function describePhaseFiles(available: Map<number, PhaseFile>, phase: number): string {
  const propio = available.get(phase)?.documento;

  const previos = [...available.entries()]
    .filter(([numero, datos]) => numero < phase && datos.documento)
    .sort((a, b) => a[0] - b[0])
    .map(([numero, datos]) => `- Fase ${numero}: \`${datos.documento}\``);

  if (!propio && previos.length === 0) return "";

  const lineas = ["## ARCHIVOS DE ESTA TAREA (nombres exactos)"];

  if (previos.length) {
    lineas.push("", "Documentos de las fases anteriores, léelos con `read_central_doc`:", ...previos);
  }

  if (propio) {
    lineas.push(
      "",
      `El documento de esta fase se llama exactamente \`${propio}\`. Guárdalo con ` +
        "`write_central_doc` en la carpeta de la tarea activa, con ese nombre y sin cambiarlo."
    );
  } else {
    lineas.push("", "Esta fase no deja documento en la Documentación Central: su salida va en el chat.");
  }

  return lineas.join("\n");
}

export function describePhases(): string {
  const available = discoverPhases();
  if (available.size === 0) return "No se encontraron prompts de fase.";

  return [...available.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, { title }]) => `${number}: ${title}`)
    .join(", ");
}
