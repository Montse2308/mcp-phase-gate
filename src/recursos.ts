// The documents of the tasks, exposed as read-only MCP Resources. A client that shows them (with "@" in
// Claude Code, Cursor or VS Code) lets the person attach the technical plan or a receipt to the chat
// without asking the model, and lets the model read them without spending a call on read_central_doc.
//
//   phase-gate://estado                                     the diagnosis of the installation
//   phase-gate://fases                                      the phases, with their document and their layer
//   phase-gate://tareas/{proyecto}/{tarea}/{documento}      a file in the folder of a task
//   phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo} a batch receipt of Phase 4
//   phase-gate://configuracion/{proyecto}                   the effective configuration of a project
//
// Read-only, and with the same defenses as read_central_doc: every variable is decoded and validated as a
// portable segment before any path is built, the final path has to stay inside the task's folder, and the
// reading is bounded to 1 MB of text.

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ReadResourceResult, Resource } from "@modelcontextprotocol/sdk/types.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import * as fs from "fs";
import * as path from "path";

import { diagnosticarSinBloquear, fasesConCapa, formatearDiagnostico, informeDeConfiguracion } from "./diagnostico.js";
import { ErrorConCodigo, fallo, idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";
import {
  discoverProjects,
  estaDentroReal,
  findProjectFolder,
  leerTextoAcotado,
  requireProjectFolder,
  taskFolderPath,
  validarSegmento,
} from "./paths.js";
import { contextoInicialDe, fasesDe } from "./capas.js";
import { esCarpeta } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { listarTareas, tareaActiva } from "./tasks.js";
import type { Idioma } from "./vocabulario.js";

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

// The receipts subfolder is declared by a phase in its header (with the factory prompts, phase 4).
function subcarpetaDeRecibos(phases: Map<number, PhaseFile>): string | null {
  const conRecibos = [...phases.entries()].sort((a, b) => a[0] - b[0]).find(([, datos]) => datos.recibos);
  return conRecibos?.[1].recibos ?? null;
}

// statSync with throwIfNoEntry only silences ENOENT; a segment of the path that is a file (ENOTDIR) or a
// denied permission are not an error when asking "is it a file?".
function esArchivo(ruta: string): boolean {
  try {
    return fs.statSync(ruta, { throwIfNoEntry: false })?.isFile() ?? false;
  } catch {
    return false;
  }
}

// What is listed or autocompleted goes through the same containment as reading: a link inside the task that
// leads outside it is not read, and its name and its date are not shown either.
function dentroDeLaTarea(carpetaTarea: string, ruta: string): boolean {
  try {
    return estaDentroReal(carpetaTarea, ruta);
  } catch {
    return false;
  }
}

// Read errors reach the client with a code that says what happened, not as an internal error: -32002 if the
// resource does not exist (the one the MCP specification proposes), -32602 if the URI or what it points to
// is not valid, and -32603 only for an unexpected I/O failure.
const RECURSO_NO_ENCONTRADO = -32002;

// "Does not exist" is recognized by the message code, which does not depend on the language. The Spanish
// text is left for errors from other modules that still arrive without a code.
const CODIGOS_NO_ENCONTRADO = new Set(["RUTA-PROYECTO-NO-EXISTE", "RECURSO-TAREA-NO-EXISTE", "RECURSO-ARCHIVO-NO-EXISTE", "RECURSO-SIN-SUBCARPETA-DE-RECIBOS"]);

function conCodigo<T>(leerRecurso: () => T): T {
  try {
    return leerRecurso();
  } catch (error) {
    if (error instanceof McpError) throw error;
    const texto = error instanceof Error ? error.message : String(error);
    if ((error instanceof ErrorConCodigo && CODIGOS_NO_ENCONTRADO.has(error.codigo)) || /^No existe/.test(texto)) {
      throw new McpError(RECURSO_NO_ENCONTRADO, texto);
    }
    if (typeof (error as NodeJS.ErrnoException)?.code === "string") throw new McpError(ErrorCode.InternalError, texto);
    throw new McpError(ErrorCode.InvalidParams, texto);
  }
}

// The SDK delivers the variables as they came in the URI, with their percent-encoding. They are decoded
// here and validated AFTER: a %2F decoded to "/" is rejected by validarSegmento.
function variable(variables: Variables, nombre: string): string {
  const crudo = variables[nombre];
  const valor = Array.isArray(crudo) ? crudo.join(",") : String(crudo ?? "");
  try {
    return decodeURIComponent(valor);
  } catch {
    throw fallo("RECURSO-URI-MAL-CODIFICADA", { nombre, valor });
  }
}

// Path of a file inside a task, from the already decoded variables. Folders and files with a dot are
// neither tasks nor documents, as for write_central_doc. The Studio's API also uses it for its document
// viewer.
export function archivoDeTarea(proyecto: string, tarea: string, partes: string[]): { ruta: string; tarea: string } {
  validarSegmento(proyecto, "proyecto");
  validarSegmento(tarea, "tarea");
  for (const parte of partes) validarSegmento(parte, "documento");

  if (tarea.startsWith(".") || partes.some((parte) => parte.startsWith("."))) {
    throw fallo("RECURSO-CON-PUNTO");
  }

  const carpetaProyecto = requireProjectFolder(proyecto);
  const carpetaTarea = taskFolderPath(carpetaProyecto, tarea);
  if (!esCarpeta(carpetaTarea)) {
    throw fallo("RECURSO-TAREA-NO-EXISTE", { tarea, proyecto: carpetaProyecto });
  }

  const ruta = path.join(carpetaTarea, ...partes);
  if (!estaDentroReal(carpetaTarea, ruta)) {
    throw fallo("RECURSO-FUERA-DE-TAREA", { carpetaTarea });
  }
  if (!esArchivo(ruta)) {
    throw fallo("RECURSO-ARCHIVO-NO-EXISTE", { archivo: partes.join("/"), tarea, proyecto: carpetaProyecto });
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

// ─── Listing ────────────────────────────────────────────────────────────────
// Only the documents that exist of the ACTIVE task of each project, with the phases of ITS project. Listing
// all the tasks of all the projects would flood the client's "@" picker; the rest is reached through the
// template, with autocompletion. If the Documentation is not configured there is nothing to list, and the
// listing must not fail for that: the fixed resources keep serving so that it can be diagnosed.
function tareasActivas(): { proyecto: string; tarea: string; carpeta: string; phases: Map<number, PhaseFile>; contexto: string }[] {
  try {
    return [...discoverProjects().values()].sort().flatMap((proyecto) => {
      try {
        const phases = fasesDe(proyecto);
        const activa = tareaActiva(proyecto, phases);
        return activa
          ? [{ proyecto, tarea: activa.estado.taskName, carpeta: activa.estado.folderPath, phases, contexto: contextoInicialDe(proyecto) }]
          : [];
      } catch {
        return []; // a project with a broken manifest is not listed; doctor reports it
      }
    });
  } catch {
    return [];
  }
}

function listarDocumentos(): Resource[] {
  const lista: Resource[] = [];
  for (const { proyecto, tarea, carpeta, phases, contexto } of tareasActivas()) {
    const nombres = [
      contexto,
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

export function uriDeConfiguracion(proyecto: string): string {
  return `phase-gate://configuracion/${encodeURIComponent(proyecto)}`;
}

function listarConfiguraciones(): Resource[] {
  try {
    return [...discoverProjects().values()].sort().map((proyecto) => ({
      uri: uriDeConfiguracion(proyecto),
      name: `configuracion/${proyecto}`,
      title: mensaje("RECURSO-CONFIGURACION-DE", { proyecto }),
      mimeType: MIME,
      annotations: { audience: AUDIENCIA },
    }));
  } catch {
    return [];
  }
}

// ─── Autocompletion ─────────────────────────────────────────────────────────
// What was already typed filters the list, case-insensitively. A failure (Documentation not configured, a
// project that does not exist) returns an empty list: autocompletion is not the place to explain errors,
// reading does that.
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
    return filtrar(listarTareas(proyecto, fasesDe(proyecto)).map((tarea) => tarea.taskName), escrito);
  });
}

function carpetaDeTareaPedida(contexto?: { arguments?: Record<string, string> }): { carpeta: string; proyecto: string } | null {
  const proyecto = findProjectFolder(contexto?.arguments?.proyecto ?? "");
  const tarea = contexto?.arguments?.tarea ?? "";
  if (!proyecto || !tarea || tarea.startsWith(".")) return null;
  validarSegmento(tarea, "tarea");
  const carpeta = taskFolderPath(proyecto, tarea);
  return esCarpeta(carpeta) ? { carpeta, proyecto } : null;
}

function completarDocumento(escrito: string, contexto?: { arguments?: Record<string, string> }): string[] {
  return sinFallar(() => {
    const carpeta = carpetaDeTareaPedida(contexto)?.carpeta;
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
    const pedida = carpetaDeTareaPedida(contexto);
    return pedida ? filtrar(recibosDe(pedida.carpeta, fasesDe(pedida.proyecto)), escrito) : [];
  });
}

// ─── The table of phases ────────────────────────────────────────────────────
function celda(texto: string): string {
  return texto.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

export function tablaDeFases(): string {
  const fases = fasesConCapa();
  if (fases.length === 0) return mensaje("RECURSO-SIN-FASES");

  return [
    mensaje("RECURSO-TABLA-DE-FASES"),
    "|---|---|---|---|---|---|",
    ...fases.map(
      (fase) =>
        `| ${fase.numero} | ${celda(fase.titulo)} | ${fase.documento ? `\`${celda(fase.documento)}\`` : "—"} | ` +
        `${fase.recibos ? `\`${celda(fase.recibos)}/\`` : "—"} | ${fase.capa} | \`${celda(fase.archivo)}\` |`
    ),
  ].join("\n");
}

// ─── Registration ───────────────────────────────────────────────────────────
// The titles and descriptions are fixed at registration, in the language of startup (crearServidor's).
export function registrarRecursos(mcp: McpServer, idioma: Idioma = idiomaDeMensajes()): void {
  const texto = (codigo: string): string => mensaje(codigo, {}, idioma);

  mcp.registerResource(
    "estado",
    URI_ESTADO,
    {
      title: texto("RECURSO-ESTADO-TITULO"),
      description: texto("RECURSO-ESTADO-DESCRIPCION"),
      mimeType: MIME,
      annotations: { audience: AUDIENCIA },
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: MIME, text: formatearDiagnostico(await diagnosticarSinBloquear(), "markdown") }] })
  );

  mcp.registerResource(
    "fases",
    URI_FASES,
    {
      title: texto("RECURSO-FASES-TITULO"),
      description: texto("RECURSO-FASES-DESCRIPCION"),
      mimeType: MIME,
      annotations: { audience: AUDIENCIA },
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: MIME, text: tablaDeFases() }] })
  );

  // The effective configuration of each project: manifest, preset, rules and repos.
  mcp.registerResource(
    "configuracion",
    new ResourceTemplate("phase-gate://configuracion/{proyecto}", {
      list: async () => ({ resources: listarConfiguraciones() }),
      complete: { proyecto: completarProyecto },
    }),
    {
      title: texto("RECURSO-CONFIGURACION-TITULO"),
      description: texto("RECURSO-CONFIGURACION-DESCRIPCION"),
      mimeType: MIME,
    },
    async (uri, variables) => {
      const carpeta = conCodigo(() => {
        const proyecto = variable(variables, "proyecto");
        validarSegmento(proyecto, "proyecto");
        return requireProjectFolder(proyecto);
      });
      return { contents: [{ uri: uri.href, mimeType: MIME, text: await informeDeConfiguracion(carpeta) }] };
    }
  );

  // The receipts one goes before the documents one: both start the same, and the SDK uses the first template
  // that fits. With variables that do not cross "/" they do not step on each other, but the order makes it clear.
  mcp.registerResource(
    "recibo",
    new ResourceTemplate("phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo}", {
      list: async () => ({ resources: listarRecibos() }),
      complete: { proyecto: completarProyecto, tarea: completarTarea, recibo: completarRecibo },
    }),
    {
      title: texto("RECURSO-RECIBO-TITULO"),
      description: texto("RECURSO-RECIBO-DESCRIPCION"),
      mimeType: MIME,
    },
    async (uri, variables) =>
      conCodigo(() => {
        // The subfolder is declared by a phase of ITS project: the project is validated before looking at it.
        const proyecto = variable(variables, "proyecto");
        validarSegmento(proyecto, "proyecto");
        const subcarpeta = subcarpetaDeRecibos(fasesDe(requireProjectFolder(proyecto)));
        if (!subcarpeta) throw fallo("RECURSO-SIN-SUBCARPETA-DE-RECIBOS");
        const { ruta } = archivoDeTarea(proyecto, variable(variables, "tarea"), [
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
      title: texto("RECURSO-DOCUMENTO-TITULO"),
      description: texto("RECURSO-DOCUMENTO-DESCRIPCION"),
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
