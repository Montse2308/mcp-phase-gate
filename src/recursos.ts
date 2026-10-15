// Los documentos de las tareas, expuestos como MCP Resources de solo lectura. Un cliente que los
// muestra (con "@" en Claude Code, Cursor o VS Code) deja a la persona adjuntar al chat el plan
// técnico o un recibo sin pedírselo al modelo, y al modelo leerlos sin gastar una llamada a
// read_central_doc.
//
//   phase-gate://estado                                     el diagnóstico de la instalación
//   phase-gate://fases                                      las fases, con su documento y su capa
//   phase-gate://tareas/{proyecto}/{tarea}/{documento}      un archivo de la carpeta de una tarea
//   phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo} un recibo de lote de la Fase 4
//
// Solo lectura, y con las mismas defensas que read_central_doc: cada variable se decodifica y se
// valida como un segmento portable antes de armar ninguna ruta, la ruta final tiene que quedar
// dentro de la carpeta de la tarea, y la lectura está acotada a 1 MB de texto.

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ReadResourceResult, Resource } from "@modelcontextprotocol/sdk/types.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import * as fs from "fs";
import * as path from "path";

import { diagnosticar, fasesConCapa, formatearDiagnostico } from "./diagnostico.js";
import {
  discoverProjects,
  estaDentroReal,
  findProjectFolder,
  leerTextoAcotado,
  requireProjectFolder,
  taskFolderPath,
  validarSegmento,
} from "./paths.js";
import { discoverPhases, esCarpeta, nombreContextoInicial } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { listarTareas, tareaActiva } from "./tasks.js";

export const URI_ESTADO = "phase-gate://estado";
export const URI_FASES = "phase-gate://fases";

const MIME = "text/markdown";
const AUDIENCIA: ("user" | "assistant")[] = ["assistant", "user"];

export function uriDeDocumento(proyecto: string, tarea: string, documento: string): string {
  return `phase-gate://tareas/${encodeURIComponent(proyecto)}/${encodeURIComponent(tarea)}/${encodeURIComponent(documento)}`;
}

export function uriDeRecibo(proyecto: string, tarea: string, recibo: string): string {
  return `phase-gate://tareas/${encodeURIComponent(proyecto)}/${encodeURIComponent(tarea)}/recibos/${encodeURIComponent(recibo)}`;
}

// La subcarpeta de recibos la declara una fase en su cabecera (con los prompts de fábrica, la 4).
function subcarpetaDeRecibos(phases: Map<number, PhaseFile>): string | null {
  const conRecibos = [...phases.entries()].sort((a, b) => a[0] - b[0]).find(([, datos]) => datos.recibos);
  return conRecibos?.[1].recibos ?? null;
}

// statSync con throwIfNoEntry solo calla el ENOENT; un tramo de la ruta que es un archivo
// (ENOTDIR) o un permiso denegado no son un error para preguntar "¿es un archivo?".
function esArchivo(ruta: string): boolean {
  try {
    return fs.statSync(ruta, { throwIfNoEntry: false })?.isFile() ?? false;
  } catch {
    return false;
  }
}

// Lo que se lista o se autocompleta pasa por la misma contención que la lectura: un enlace dentro
// de la tarea que lleva fuera de ella no se lee, y tampoco se enseña su nombre ni su fecha.
function dentroDeLaTarea(carpetaTarea: string, ruta: string): boolean {
  try {
    return estaDentroReal(carpetaTarea, ruta);
  } catch {
    return false;
  }
}

// Los errores de lectura llegan al cliente con un código que dice qué pasó, no como un error
// interno: -32002 si el recurso no existe (el que propone la especificación de MCP), -32602 si el
// URI o lo que apunta no es válido, y -32603 solo para un fallo de E/S inesperado.
const RECURSO_NO_ENCONTRADO = -32002;

function conCodigo<T>(leerRecurso: () => T): T {
  try {
    return leerRecurso();
  } catch (error) {
    if (error instanceof McpError) throw error;
    const mensaje = error instanceof Error ? error.message : String(error);
    if (/^No existe/.test(mensaje)) throw new McpError(RECURSO_NO_ENCONTRADO, mensaje);
    if (typeof (error as NodeJS.ErrnoException)?.code === "string") throw new McpError(ErrorCode.InternalError, mensaje);
    throw new McpError(ErrorCode.InvalidParams, mensaje);
  }
}

// El SDK entrega las variables tal como venían en el URI, con su codificación porcentual. Se
// decodifican aquí y se validan DESPUÉS: un %2F decodificado a "/" lo rechaza validarSegmento.
function variable(variables: Variables, nombre: string): string {
  const crudo = variables[nombre];
  const valor = Array.isArray(crudo) ? crudo.join(",") : String(crudo ?? "");
  try {
    return decodeURIComponent(valor);
  } catch {
    throw new Error(`URI mal codificada: la parte "${nombre}" (${valor}) no es una codificación porcentual válida.`);
  }
}

// Ruta de un archivo dentro de una tarea, a partir de las variables ya decodificadas. Las carpetas
// y archivos con punto no son tareas ni documentos, igual que para write_central_doc.
function archivoDeTarea(proyecto: string, tarea: string, partes: string[]): { ruta: string; tarea: string } {
  validarSegmento(proyecto, "proyecto");
  validarSegmento(tarea, "tarea");
  for (const parte of partes) validarSegmento(parte, "documento");

  if (tarea.startsWith(".") || partes.some((parte) => parte.startsWith("."))) {
    throw new Error("Los archivos y carpetas que empiezan por punto no se exponen como recursos.");
  }

  const carpetaProyecto = requireProjectFolder(proyecto);
  const carpetaTarea = taskFolderPath(carpetaProyecto, tarea);
  if (!esCarpeta(carpetaTarea)) {
    throw new Error(`No existe la tarea "${tarea}" en ${carpetaProyecto}.`);
  }

  const ruta = path.join(carpetaTarea, ...partes);
  if (!estaDentroReal(carpetaTarea, ruta)) {
    throw new Error(`Acceso denegado: el recurso queda fuera de la carpeta de la tarea ${carpetaTarea}.`);
  }
  if (!esArchivo(ruta)) {
    throw new Error(`No existe "${partes.join("/")}" en la tarea "${tarea}" de ${carpetaProyecto}.`);
  }

  return { ruta, tarea: carpetaTarea };
}

function leer(uri: URL, ruta: string): ReadResourceResult {
  return { contents: [{ uri: uri.href, mimeType: MIME, text: leerTextoAcotado(ruta) }] };
}

function recurso(uri: string, nombre: string, titulo: string, ruta: string): Resource {
  let modificado: string | undefined;
  try {
    modificado = fs.statSync(ruta).mtime.toISOString();
  } catch {
    modificado = undefined;
  }
  return {
    uri,
    name: nombre,
    title: titulo,
    mimeType: MIME,
    annotations: { audience: AUDIENCIA, ...(modificado ? { lastModified: modificado } : {}) },
  };
}

// ─── Listado ────────────────────────────────────────────────────────────────
// Solo los documentos que existen de la tarea ACTIVA de cada proyecto. Listar todas las tareas de
// todos los proyectos inundaría el selector de "@" del cliente; el resto se alcanza por plantilla,
// con autocompletado. Si la Documentación no está configurada no hay nada que listar, y el listado
// no debe fallar por eso: los recursos fijos siguen sirviendo para diagnosticarlo.
function tareasActivas(): { proyecto: string; tarea: string; carpeta: string; phases: Map<number, PhaseFile> }[] {
  try {
    const phases = discoverPhases();
    return [...discoverProjects().values()].sort().flatMap((proyecto) => {
      const activa = tareaActiva(proyecto, phases);
      return activa ? [{ proyecto, tarea: activa.estado.taskName, carpeta: activa.estado.folderPath, phases }] : [];
    });
  } catch {
    return [];
  }
}

function listarDocumentos(): Resource[] {
  const lista: Resource[] = [];
  for (const { proyecto, tarea, carpeta, phases } of tareasActivas()) {
    const nombres = [
      nombreContextoInicial(),
      ...[...phases.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, datos]) => (datos.documento ? [datos.documento] : [])),
    ];
    for (const documento of nombres) {
      const ruta = path.join(carpeta, documento);
      if (!esArchivo(ruta) || !dentroDeLaTarea(carpeta, ruta)) continue;
      lista.push(recurso(uriDeDocumento(proyecto, tarea, documento), `${proyecto}/${tarea}/${documento}`, `${tarea} · ${documento}`, ruta));
    }
  }
  return lista;
}

function recibosDe(carpetaTarea: string, phases: Map<number, PhaseFile>): string[] {
  const subcarpeta = subcarpetaDeRecibos(phases);
  if (!subcarpeta) return [];
  const carpeta = path.join(carpetaTarea, subcarpeta);
  if (!esCarpeta(carpeta) || !dentroDeLaTarea(carpetaTarea, carpeta)) return [];
  return fs
    .readdirSync(carpeta, { withFileTypes: true })
    .filter((entrada) => entrada.isFile() && entrada.name.toLowerCase().endsWith(".md") && !entrada.name.startsWith("."))
    .map((entrada) => entrada.name)
    .filter((nombre) => dentroDeLaTarea(carpetaTarea, path.join(carpeta, nombre)))
    .sort();
}

function listarRecibos(): Resource[] {
  const lista: Resource[] = [];
  for (const { proyecto, tarea, carpeta, phases } of tareasActivas()) {
    const subcarpeta = subcarpetaDeRecibos(phases);
    for (const recibo of recibosDe(carpeta, phases)) {
      lista.push(
        recurso(
          uriDeRecibo(proyecto, tarea, recibo),
          `${proyecto}/${tarea}/${subcarpeta}/${recibo}`,
          `${tarea} · ${recibo}`,
          path.join(carpeta, subcarpeta!, recibo)
        )
      );
    }
  }
  return lista;
}

// ─── Autocompletado ─────────────────────────────────────────────────────────
// Lo que ya se escribió filtra la lista, sin distinguir mayúsculas. Un fallo (Documentación sin
// configurar, proyecto que no existe) devuelve una lista vacía: autocompletar no es el sitio
// para explicar errores, eso lo hace la lectura.
function filtrar(valores: string[], escrito: string): string[] {
  const prefijo = escrito.toLowerCase();
  return valores.filter((valor) => valor.toLowerCase().startsWith(prefijo));
}

function sinFallar(calcular: () => string[]): string[] {
  try {
    return calcular();
  } catch {
    return [];
  }
}

function completarProyecto(escrito: string): string[] {
  return sinFallar(() => filtrar([...discoverProjects().values()].sort(), escrito));
}

function completarTarea(escrito: string, contexto?: { arguments?: Record<string, string> }): string[] {
  return sinFallar(() => {
    const proyecto = findProjectFolder(contexto?.arguments?.proyecto ?? "");
    if (!proyecto) return [];
    return filtrar(listarTareas(proyecto, discoverPhases()).map((tarea) => tarea.taskName), escrito);
  });
}

function carpetaDeTareaPedida(contexto?: { arguments?: Record<string, string> }): string | null {
  const proyecto = findProjectFolder(contexto?.arguments?.proyecto ?? "");
  const tarea = contexto?.arguments?.tarea ?? "";
  if (!proyecto || !tarea || tarea.startsWith(".")) return null;
  validarSegmento(tarea, "tarea");
  const carpeta = taskFolderPath(proyecto, tarea);
  return esCarpeta(carpeta) ? carpeta : null;
}

function completarDocumento(escrito: string, contexto?: { arguments?: Record<string, string> }): string[] {
  return sinFallar(() => {
    const carpeta = carpetaDeTareaPedida(contexto);
    if (!carpeta) return [];
    const documentos = fs
      .readdirSync(carpeta, { withFileTypes: true })
      .filter((entrada) => entrada.isFile() && entrada.name.toLowerCase().endsWith(".md") && !entrada.name.startsWith("."))
      .map((entrada) => entrada.name)
      .filter((nombre) => dentroDeLaTarea(carpeta, path.join(carpeta, nombre)))
      .sort();
    return filtrar(documentos, escrito);
  });
}

function completarRecibo(escrito: string, contexto?: { arguments?: Record<string, string> }): string[] {
  return sinFallar(() => {
    const carpeta = carpetaDeTareaPedida(contexto);
    return carpeta ? filtrar(recibosDe(carpeta, discoverPhases()), escrito) : [];
  });
}

// ─── La tabla de fases ──────────────────────────────────────────────────────
function celda(texto: string): string {
  return texto.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

export function tablaDeFases(): string {
  const fases = fasesConCapa();
  if (fases.length === 0) return "No se encontró ningún prompt de fase.";

  return [
    "| Fase | Título | Documento | Recibos | Capa | Archivo |",
    "|---|---|---|---|---|---|",
    ...fases.map(
      (fase) =>
        `| ${fase.numero} | ${celda(fase.titulo)} | ${fase.documento ? `\`${celda(fase.documento)}\`` : "—"} | ` +
        `${fase.recibos ? `\`${celda(fase.recibos)}/\`` : "—"} | ${fase.capa} | \`${celda(fase.archivo)}\` |`
    ),
  ].join("\n");
}

// ─── Registro ───────────────────────────────────────────────────────────────
export function registrarRecursos(mcp: McpServer): void {
  mcp.registerResource(
    "estado",
    URI_ESTADO,
    {
      title: "Estado de mcp-phase-gate",
      description: "Radiografía de la instalación: variables, prompts, proyectos con su tarea activa y avisos.",
      mimeType: MIME,
      annotations: { audience: AUDIENCIA },
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: MIME, text: formatearDiagnostico(diagnosticar(), "markdown") }] })
  );

  mcp.registerResource(
    "fases",
    URI_FASES,
    {
      title: "Fases disponibles",
      description: "Número, título, documento, subcarpeta de recibos y archivo de prompt que gana en cada fase.",
      mimeType: MIME,
      annotations: { audience: AUDIENCIA },
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: MIME, text: tablaDeFases() }] })
  );

  // El de recibos va antes que el de documentos: los dos empiezan igual, y el SDK usa la primera
  // plantilla que encaja. Con variables que no cruzan "/" no se pisan, pero el orden lo deja claro.
  mcp.registerResource(
    "recibo",
    new ResourceTemplate("phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo}", {
      list: async () => ({ resources: listarRecibos() }),
      complete: { proyecto: completarProyecto, tarea: completarTarea, recibo: completarRecibo },
    }),
    {
      title: "Recibo de lote",
      description: "Un recibo de lote de la Fase 4, en la subcarpeta que declara su prompt.",
      mimeType: MIME,
    },
    async (uri, variables) =>
      conCodigo(() => {
        const subcarpeta = subcarpetaDeRecibos(discoverPhases());
        if (!subcarpeta) throw new Error("No existe ninguna fase que declare una subcarpeta de recibos.");
        const { ruta } = archivoDeTarea(variable(variables, "proyecto"), variable(variables, "tarea"), [
          subcarpeta,
          variable(variables, "recibo"),
        ]);
        return leer(uri, ruta);
      })
  );

  mcp.registerResource(
    "documento",
    new ResourceTemplate("phase-gate://tareas/{proyecto}/{tarea}/{documento}", {
      list: async () => ({ resources: listarDocumentos() }),
      complete: { proyecto: completarProyecto, tarea: completarTarea, documento: completarDocumento },
    }),
    {
      title: "Documento de una tarea",
      description: "Un archivo de la carpeta de una tarea: el contexto inicial o el documento de una fase.",
      mimeType: MIME,
    },
    async (uri, variables) =>
      conCodigo(() => {
        const { ruta } = archivoDeTarea(variable(variables, "proyecto"), variable(variables, "tarea"), [
          variable(variables, "documento"),
        ]);
        return leer(uri, ruta);
      })
  );
}
