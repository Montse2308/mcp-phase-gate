// Las fases y sus prompts. El número de fases no está cableado: se descubren de los
// archivos que existan en la carpeta de prompts, y cada una declara en su propia cabecera
// cómo se llama el documento que produce.

import * as fs from "fs";
import * as path from "path";
import { promptsLayers } from "./config.js";
import { log } from "./log.js";
import { claveDeNombre, validarSegmento } from "./paths.js";

// Las reglas globales se anteponen a cada fase.
export const GLOBAL_RULES_FILE = "global-rules.md";

// Comando de cada fase (`/fN`): `comandos/fN.md` dentro de una capa de prompts. Gana la capa más
// alta que lo tenga, igual que las fases; sin ninguno, la fase usa un texto genérico.
export const CARPETA_COMANDOS = "comandos";

export function resolveCommandFile(numero: number, capas: string[] = promptsLayers()): string | null {
  for (const base of [...capas].reverse()) {
    const ruta = path.join(base, CARPETA_COMANDOS, `f${numero}.md`);
    if (fs.statSync(ruta, { throwIfNoEntry: false })?.isFile()) return ruta;
  }
  return null;
}

// Acepta "fase-1-descubrimiento.md" y también "phase-1-discovery.md",
// para que un juego de prompts en inglés funcione sin tocar el código.
export const PHASE_FILE_PATTERN = /^(?:fase|phase)-(\d+)[-.]/i;

// Cabecera opcional al inicio del .md, entre líneas de ---, con "clave: valor".
// Ahí cada fase declara cómo se llama el documento que produce. Vive pegada al prompt que
// describe ese documento —no en un archivo de configuración aparte— para que el nombre exista
// en un solo lugar y se lea en vivo, sin recompilar, igual que el resto del prompt.
const PHASE_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type PhaseFile = {
  file: string;                           // ruta completa: con capas ya no basta el nombre
  title: string;
  documento?: string | undefined;         // el que produce la fase
  documentoInicial?: string | undefined;  // solo la fase 1: el archivo que escribe start_task
  recibos?: string | undefined;           // subcarpeta de los recibos de lote (la Fase 4)
};

// Los prompts propios, escritos por ejemplo con el Bloc de notas, llegan en CRLF, y a veces con
// BOM al principio. Se normalizan al leer: lo que se entrega al modelo y lo que se compara en los
// tests va siempre en LF y sin BOM. Con el BOM delante, el frontmatter no se reconocía y la fase
// se quedaba sin documento.
function aLF(texto: string): string {
  return texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

// Quita los marcadores de ranura y conserva su contenido. El modelo nunca los ve.
// Una ranura marca el contenido de una sección que un preset podrá sustituir en la Etapa 3:
//   <!-- ranura: verificacion -->
//   contenido por defecto
//   <!-- /ranura -->
// Solo cuenta un marcador que ocupa su propia línea, y la línea se quita entera. Un marcador con
// texto detrás, o dos en la misma línea, no se toca: lo avisa loadPhasePrompt.
export const MARCADOR_RANURA = /^[ \t]*<!--[ \t]*\/?ranura(?:[ \t]*:[ \t]*[\w-]+)?[ \t]*-->[ \t]*\r?$\n?/gm;

export function quitarMarcadores(texto: string): string {
  return texto.replace(MARCADOR_RANURA, "");
}

// Lo que parece un marcador de ranura y sobrevivió a quitarMarcadores: mal escrito (con acento,
// en mayúsculas, con texto detrás). Llegaría tal cual al modelo, así que queda en el log.
const RESTO_DE_MARCADOR = /<!--[^\n]*?ranura/i;

function entregable(texto: string, archivo: string): string {
  const limpio = quitarMarcadores(texto);
  if (RESTO_DE_MARCADOR.test(limpio)) {
    log("warning", `${archivo} tiene un marcador de ranura que no se reconoce: llega tal cual al modelo.`);
  }
  return limpio.trim();
}

// La subcarpeta de recibos acaba dentro de un file_name, así que tiene que ser un solo segmento
// portable, y visible: write_central_doc no escribe en segmentos que empiezan por punto. Un valor
// inválido no tumba la fase: se ignora y queda en el log.
function leerRecibos(valor: string | undefined, archivo: string): string | undefined {
  if (!valor) return undefined;
  try {
    const segmento = validarSegmento(valor, "recibos");
    if (segmento.startsWith(".")) throw new Error("no puede empezar por punto.");
    return segmento;
  } catch (error: any) {
    log("warning", `Se ignora el frontmatter recibos de ${archivo}: ${error.message}`);
    return undefined;
  }
}

// Una subcarpeta de recibos con el nombre de un documento rompe el flujo: si se llama como el
// documento de la fase, la carpeta hace que la fase cuente como cerrada al primer recibo. Se
// comprueba al final, con las fases de todas las capas ya resueltas.
function descartarRecibosQueChocan(phases: Map<number, PhaseFile>): void {
  const documentos = new Set<string>();
  for (const datos of phases.values()) {
    for (const nombre of [datos.documento, datos.documentoInicial]) {
      if (nombre) documentos.add(claveDeNombre(nombre));
    }
  }

  for (const datos of phases.values()) {
    if (datos.recibos && documentos.has(claveDeNombre(datos.recibos))) {
      log(
        "warning",
        `Se ignora el frontmatter recibos de ${datos.file}: ` +
          `"${datos.recibos}" es el nombre de un documento de fase.`
      );
      datos.recibos = undefined;
    }
  }
}

export function parsePhaseFile(fullPath: string): { meta: Record<string, string>; cuerpo: string } {
  const crudo = aLF(fs.readFileSync(fullPath, "utf-8"));
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

// Descubre las fases disponibles a partir de los archivos de las carpetas de prompts.
// Agregar un "fase-6-*.md" basta para que exista la fase 6 — también en la carpeta propia,
// así que superponer no solo permite cambiar fases: permite añadirlas.
//
// Las capas se recorren en orden y la última que declare una fase es la que queda. Se
// superpone POR NÚMERO DE FASE, no por nombre de archivo: el usuario no tiene por qué llamar
// a su fase 2 igual que el paquete, y obligarle a adivinar el nombre exacto sería una trampa.
//
// `capas` es un parámetro y no una lectura directa del entorno para poder probar el
// comportamiento con carpetas concretas sin depender de qué traiga el paquete instalado.
export function discoverPhases(capas: string[] = promptsLayers()): Map<number, PhaseFile> {
  const phases = new Map<number, PhaseFile>();

  for (const base of capas) {
    if (!fs.existsSync(base)) continue;

    // Se resuelve capa por capa: dentro de una, gana el primero por orden alfabético; entre
    // capas, gana la de más arriba. Sin este mapa intermedio la regla alfabética de la capa
    // baja bloquearía a la de arriba, que es justo al revés de lo que se quiere.
    const deEstaCapa = new Map<number, PhaseFile>();

    for (const file of fs.readdirSync(base).sort()) {
      const match = file.match(PHASE_FILE_PATTERN);
      if (!match || !file.toLowerCase().endsWith(".md")) continue;

      const phaseNumber = Number(match[1]);
      if (deEstaCapa.has(phaseNumber)) continue; // gana el primero por orden alfabético

      const fullPath = path.join(base, file);

      let meta: Record<string, string> = {};
      let cuerpo = "";
      try {
        ({ meta, cuerpo } = parsePhaseFile(fullPath));
      } catch {
        // Si el archivo no se puede leer aquí, el error real se reporta al invocar la fase.
      }

      deEstaCapa.set(phaseNumber, {
        file: fullPath,
        title: readPhaseTitle(cuerpo, file),
        documento: meta.documento || undefined,
        documentoInicial: meta.documento_inicial || undefined,
        recibos: leerRecibos(meta.recibos, fullPath),
      });
    }

    for (const [numero, datos] of deEstaCapa) phases.set(numero, datos);
  }

  descartarRecibosQueChocan(phases);
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

export function nombreContextoInicial(capas: string[] = promptsLayers()): string {
  return discoverPhases(capas).get(1)?.documentoInicial || CONTEXTO_INICIAL_POR_DEFECTO;
}

// Se lee en cada llamada (no se cachea) para poder afinar un prompt y probarlo
// de inmediato, sin reiniciar el servidor MCP.
export function loadPhasePrompt(phase: number, capas: string[] = promptsLayers()): string {
  const available = discoverPhases(capas);
  const entry = available.get(phase);

  if (!entry) {
    const list = [...available.keys()].sort((a, b) => a - b).join(", ");
    throw new Error(
      list
        ? `Fase no válida. Las fases disponibles son: ${list}.`
        : `No se encontró ningún prompt de fase en ${capas.join(", ")}. Verifica que la carpeta 'prompts' exista junto al build.`
    );
  }

  const parts: string[] = [];

  const globales = resolveGlobalRules(capas);
  if (globales) {
    parts.push(entregable(aLF(fs.readFileSync(globales, "utf-8")), globales));
  }

  parts.push(entregable(parsePhaseFile(entry.file).cuerpo, entry.file));

  const archivos = describePhaseFiles(available, phase);
  if (archivos) parts.push(archivos);

  return parts.join("\n\n");
}

// Las reglas globales de la capa más alta que las tenga. Las tuyas SUSTITUYEN a las de
// fábrica, no se suman: concatenar dos juegos de reglas hace imposible saber de qué archivo
// salió la instrucción que estorbó cuando algo sale raro, que es justo el momento en que hay
// que saberlo. Si quieres las de fábrica y algo más, las copias y añades.
export function resolveGlobalRules(capas: string[] = promptsLayers()): string | null {
  for (const base of [...capas].reverse()) {
    const ruta = path.join(base, GLOBAL_RULES_FILE);
    if (fs.existsSync(ruta)) return ruta;
  }

  return null;
}

// El texto de un prompt propio tal como lo ve el modelo: en LF y sin BOM. Lo usan quienes leen
// un archivo de prompts fuera de este módulo, como el diagnóstico.
export function leerPromptNormalizado(ruta: string): string {
  return aLF(fs.readFileSync(ruta, "utf-8"));
}

// Bloque que se añade al final del prompt con los nombres exactos de los documentos: el que
// produce esta fase y los de las anteriores, que son los que hay que leer, y la subcarpeta de
// recibos de la fase que la declare. Va aquí y no en el
// comando del cliente para que el nombre viva en un solo sitio; así afinar un prompt no obliga
// a editar además un comando en cada dispositivo.
export function describePhaseFiles(available: Map<number, PhaseFile>, phase: number): string {
  const propio = available.get(phase)?.documento;

  const previos = [...available.entries()]
    .filter(([numero, datos]) => numero < phase && datos.documento)
    .sort((a, b) => a[0] - b[0])
    .map(([numero, datos]) => {
      const recibos = datos.recibos ? ` (recibos de lote en \`${datos.recibos}/\`)` : "";
      return `- Fase ${numero}: \`${datos.documento}\`${recibos}`;
    });

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

    const recibos = available.get(phase)?.recibos;
    if (recibos) {
      lineas.push(
        "",
        `Los recibos de lote van en la subcarpeta \`${recibos}/\`, uno por lote: ` +
          `\`${recibos}/L01 - <slug>.md\`. Con un solo lote no hay subcarpeta: el recibo es el ` +
          "documento de esta fase."
      );
    }
  } else {
    lineas.push("", "Esta fase no deja documento en la Documentación Central: su salida va en el chat.");
  }

  return lineas.join("\n");
}
