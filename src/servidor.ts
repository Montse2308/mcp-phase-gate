// The MCP server: it registers the tools and connects them with the logic of the other modules. Nothing is
// computed here — paths live in paths.ts, phases in phases.ts and tasks in tasks.ts. This file only
// translates between the protocol and those functions.
//
// crearServidor does not connect any transport: index.ts does it with stdio, and the tests with an in-memory
// transport. That way the whole server can be tested without launching a process.
//
// Each tool is registered with its shape from schemas.ts: the SDK validates the arguments before the callback
// and turns into `isError` both a validation failure and an Error thrown here. That is why the callbacks
// throw Error with the message for the model, and do not build error responses.
//
// Languages: the titles and descriptions of the tools and of their parameters are fixed when the server is
// created, in the startup language. Each call opens its own message context and fixes it to its project's
// language as soon as it knows it: its errors and its response come out in that language.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";

import { DOCS, SERVER_NAME, SERVER_VERSION, requireBasePath, stateFile } from "./config.js";
import { diagnosticarSinBloquear, formatearDiagnostico } from "./diagnostico.js";
import { pedirConfirmacion } from "./confirmacion.js";
import { conContextoDeMensajes, enIdioma, fallo, fijarIdiomaDeMensajes, idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";
import { conectarLog, log } from "./log.js";
import {
  describeProjects,
  discoverProjects,
  estaDentroReal,
  findProjectFolder,
  leerTextoAcotado,
  requireProjectFolder,
  resolveDocPath,
  resolveRepoPath,
  taskFolderPath,
  ubicarEnTarea,
  validarNombreVisible,
  validarSegmento,
} from "./paths.js";
import type { ArgumentosDeDocumento } from "./paths.js";
import { configuracionDe, contextoInicialDe, ensamblarFase, fasesDe, notaDeHuerfano, reposDeLaTarea } from "./capas.js";
import { conCacheDelIdioma, conflictoDeIdioma, describirPresets, idiomaDelProyecto, manifiestoDe, presetsDisponibles } from "./manifiesto.js";
import type { RepoResuelto } from "./manifiesto.js";
import { bloqueDeCommitsConPlazo, estadoDeLotes, registrarLote } from "./lotes.js";
import { comoManual } from "./recibos.js";
import type { EstadoLote, TituloCondicional } from "./recibos.js";
import { VOCABULARIO, condicionalCanonica, estadoCanonico } from "./vocabulario.js";
import { columnaDeConfiguracion, estadoDeRepo, estadosConPlazo, leerArchivoDeRepo, lineaDeEstado, resolverRepo } from "./repos.js";
import { asegurarCapacidadDePrompts, sincronizarPrompts, vigilarCapas } from "./prompts-mcp.js";
import { registrarRecursos } from "./recursos.js";
import { errorSinProyecto, iniciarRoots, lineaDeDeduccion, proyectoPorRaices, raicesActuales } from "./roots.js";
import type { PhaseFile } from "./phases.js";
import {
  diagnosticoShape,
  getBatchStatusSalidaShape,
  recordBatchSalidaShape,
  repoStatusSalidaShape,
  shapesDe,
  sinNulos,
} from "./schemas.js";
import {
  avisoDeCompuerta,
  avisoDePendientes,
  bloqueDeRecibos,
  describeEstado,
  esMotivoDeLotes,
  guardarPuntero,
  listarTareas,
  motivoDeProteccion,
  resolverTareaDelPrompt,
  tareaActiva,
} from "./tasks.js";
import type { EstadoTarea } from "./tasks.js";
import type { Idioma } from "./vocabulario.js";

function responder(texto: string): CallToolResult {
  return { content: [{ type: "text", text: texto }] };
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// IDIOMA-CON-TAREAS: the manifest declares a language and there are tasks with documents of the other one.
// The deduction would take those tasks as "without documents", so nothing that reads or writes phase
// documents goes on: get_phase_prompt, start_task, record_batch, get_batch_status and write_central_doc with
// the name of a phase document refuse with doctor's text. list_tasks, which only lists, puts it in front as
// a warning.
function conflictoConTareas(carpetaProyecto: string): string | null {
  const conflicto = conflictoDeIdioma(carpetaProyecto);
  return conflicto?.codigo === "IDIOMA-CON-TAREAS" ? `${conflicto.texto} (${conflicto.codigo})` : null;
}

function negarSiHayTareasDelOtroIdioma(carpetaProyecto: string): void {
  const texto = conflictoConTareas(carpetaProyecto);
  if (texto) throw new Error(texto);
}

// The names of the factory phase documents, in both languages, compared case-insensitively.
const DOCUMENTOS_DE_FASE = new Set(
  (["es", "en"] as const).flatMap((idioma) => [VOCABULARIO[idioma].documentos.contextoInicial, ...VOCABULARIO[idioma].documentos.deFase]).map((n) => n.normalize("NFC").toLowerCase())
);

// The call already knows its project, and it exists: its errors and its response, in that project's language.
// A manifest that cannot be read does not change which error is thrown: the language stays as it was.
function fijarIdiomaDelProyecto(carpetaProyecto: string | null | undefined): void {
  if (!carpetaProyecto) return;
  try {
    fijarIdiomaDeMensajes(idiomaDelProyecto(carpetaProyecto).idioma);
  } catch {
    // The real error, if there is one, will come from whoever reads the project.
  }
}

// The project of a call that needs it: the one indicated or, otherwise, the one that the client's roots
// deduce. If it cannot be deduced, the call fails asking for it (with the candidates if there are several).
// `deducido` is the line the response adds so that it shows where it came from.
//
// Writing needs a strong match (the open folder IS a repo of the project or is in its folder of the
// Documentation). A weak one (the open folder only CONTAINS a repo of its own) is enough for reading, but
// not for writing in a project the AI did not name.
async function proyectoDeLaLlamada(
  mcp: McpServer,
  project: string | undefined,
  uso: "lee" | "escribe"
): Promise<{ nombre: string; deducido: string | null }> {
  if (project) {
    fijarIdiomaDelProyecto(proyectoSiExiste(project));
    return { nombre: project, deducido: null };
  }
  const porRaices = await proyectoPorRaices(mcp);
  if (porRaices.tipo !== "unico") throw errorSinProyecto(porRaices);
  fijarIdiomaDelProyecto(porRaices.carpetaProyecto);
  if (uso === "escribe" && porRaices.fuerza === "debil") {
    throw fallo("SERVIDOR-ESCRIBIR-COINCIDENCIA-DEBIL", { carpetaProyecto: porRaices.carpetaProyecto, motivo: porRaices.motivo });
  }
  return { nombre: porRaices.carpetaProyecto, deducido: lineaDeDeduccion(porRaices) };
}

// For read_central_doc and write_central_doc: a project is only needed when the recommended form
// (task_name + file_name) is used without project; with file_path, no.
async function conProyecto<T extends ArgumentosDeDocumento>(mcp: McpServer, args: T, uso: "lee" | "escribe"): Promise<{ args: T; deducido: string | null }> {
  if (args.project) fijarIdiomaDelProyecto(proyectoSiExiste(args.project));
  if (args.project || args.file_path || !args.task_name || !args.file_name) return { args, deducido: null };
  const { nombre, deducido } = await proyectoDeLaLlamada(mcp, undefined, uso);
  return { args: { ...args, project: nombre }, deducido };
}

// With file_path, the project comes from the path: if it falls in the folder of a task, its messages go in
// that project's language.
function fijarIdiomaDeLaRuta(rutaAbsoluta: string): void {
  try {
    fijarIdiomaDelProyecto(ubicarEnTarea(rutaAbsoluta)?.carpetaProyecto);
  } catch {
    // A path that cannot be located does not change the language.
  }
}

function notaSinProyecto(pedido: string | undefined): string {
  let preset = "software";
  let origen: string | null = null;
  try {
    const config = configuracionDe(null);
    preset = config.preset.nombre;
    origen = config.origenPreset;
  } catch {
    preset = "software";
    origen = null;
  }
  return mensaje("SERVIDOR-NOTA-SIN-PROYECTO", { pedido: pedido ? pedido.replace(/\s+/g, " ").trim() : null, preset, origen });
}

// A project that does not exist does not prevent delivering a prompt: it is delivered without its
// configuration, and the gate says so in the log as always. Without Documentation configured, there is no
// project either.
function proyectoSiExiste(project: string): string | null {
  try {
    return findProjectFolder(project);
  } catch {
    return null;
  }
}

// The header that start_task writes in the initial context when the task chooses its repos or its preset.
// It is validated BEFORE creating anything: a misspelled id must not leave half a task created.
function cabeceraDeTarea(
  carpetaProyecto: string,
  estrenado: boolean,
  repos: string[] | undefined,
  preset: string | undefined,
  redaccion: string | undefined
): string {
  const manifiesto = estrenado ? null : manifiestoDe(carpetaProyecto);
  const lineas: string[] = [];

  if (repos && repos.length) {
    const validos = manifiesto?.repos.map((repo) => repo.id) ?? [];
    if (validos.length === 0) {
      throw fallo("TOOL-START-SIN-REPOS-DECLARADOS", { carpetaProyecto });
    }
    const desconocidos = repos.filter((id) => !validos.includes(id));
    if (desconocidos.length) {
      throw fallo("TOOL-START-REPOS-DESCONOCIDOS", { desconocidos, carpetaProyecto, validos });
    }
    lineas.push(`repos: ${[...new Set(repos)].join(", ")}`);
  }

  if (preset) {
    const presets = presetsDisponibles(idiomaDelProyecto(estrenado ? null : carpetaProyecto, manifiesto).idioma);
    if (!presets.has(preset)) throw fallo("TOOL-START-PRESET-NO-EXISTE", { preset, disponibles: describirPresets(presets) });
    lineas.push(`preset: ${preset}`);
  }

  // The language the task is written in, if requested. frontmatterDeTarea reads it.
  if (redaccion) lineas.push(`redaccion: ${redaccion}`);

  return lineas.length ? `---\n${lineas.join("\n")}\n---\n` : "";
}

// `estado` and the titles of `condicionales` may arrive in English (the English prompts use them that way):
// the batch engine works with the canonical values.
export function normalizarEntradaDeLote<T extends { estado?: string | undefined; condicionales?: { titulo: string; texto: string }[] | undefined }>(
  entrada: T
): Omit<T, "estado" | "condicionales"> & { estado?: EstadoLote | undefined; condicionales?: { titulo: TituloCondicional; texto: string }[] | undefined } {
  return {
    ...entrada,
    estado: entrada.estado === undefined ? undefined : (estadoCanonico(entrada.estado) ?? undefined),
    condicionales: entrada.condicionales?.map((c) => ({ ...c, titulo: condicionalCanonica(c.titulo) ?? (c.titulo as TituloCondicional) })),
  };
}

function siCancelada(extra: { signal: AbortSignal }): void {
  if (extra.signal.aborted) throw fallo("SERVIDOR-CANCELADA");
}

// The phases of a project for a listing. If that project was requested, an invalid manifest is an error; in
// the listing of all of them, that project comes out with its error and the others are listed anyway.
function fasesDelListado(carpetaProyecto: string, pedido: boolean, bloques: string[]): Map<number, PhaseFile> | null {
  try {
    return fasesDe(carpetaProyecto);
  } catch (error) {
    if (pedido) throw error;
    bloques.push(mensaje("SERVIDOR-LISTADO-CONFIG-ILEGIBLE", { carpetaProyecto, error: mensajeDe(error) }));
    return null;
  }
}

function lineaDeTarea(estado: EstadoTarea, phases: Map<number, PhaseFile>): string {
  return `- ${estado.taskName} — ${describeEstado(estado, phases)}`;
}

// The annotations tell the client what each tool does, so that it can decide whether to ask for permission.
// The protocol's default values are pessimistic (destructive and open-world), so all of them declare the
// four values. openWorldHint is false in all of them: none leaves the configured folders.
function anotaciones(
  title: string,
  readOnlyHint: boolean,
  destructiveHint: boolean,
  idempotentHint: boolean
): { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean } {
  return { title, readOnlyHint, destructiveHint, idempotentHint, openWorldHint: false };
}

// `idioma`: that of the titles and descriptions of the tools, their parameters, the /fN and the resources.
// By default, that of the messages at startup (PHASE_GATE_LANG or, otherwise, the system's).
export function crearServidor(idioma: Idioma = idiomaDeMensajes()): McpServer {
  const mcp = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { logging: {} } }
  );

  conectarLog(mcp);
  iniciarRoots(mcp);
  registrarTools(mcp, idioma);
  enIdioma(idioma, () => registrarRecursos(mcp));

  // The /fN are registered now, before connecting, and synchronized again after each tool and when a prompts
  // layer changes.
  sincronizarPrompts(mcp, idioma);
  asegurarCapacidadDePrompts(mcp);
  const dejarDeVigilar = vigilarCapas(mcp);
  const alCerrar = mcp.server.onclose;
  mcp.server.onclose = () => {
    dejarDeVigilar();
    alCerrar?.();
  };

  return mcp;
}

function registrarTools(mcp: McpServer, idioma: Idioma): void {
  const shapes = shapesDe(idioma);
  // The title and description of a tool, in the server's language.
  const titulo = (codigo: string): string => mensaje(`${codigo}-TITULO`, {}, idioma);
  const descripcion = (codigo: string): string => mensaje(codigo, {}, idioma);

  // Each call opens its message context (its project's language, as soon as it knows it) and its cache of the
  // per-language document count (conCacheDelIdioma), and after it the /fN prompts are synchronized. Reading
  // the prompts folders costs milliseconds, and it is the only thing that guarantees that a new phase shows up
  // on OneDrive, where fs.watch does not notify.
  const sincronizandoTras =
    <A extends unknown[], R>(callback: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await conContextoDeMensajes(() => conCacheDelIdioma(() => callback(...args)));
      } finally {
        sincronizarPrompts(mcp, idioma);
      }
    };

  // start_task is not destructive (it refuses to overwrite a task) nor idempotent (the second call fails).
  mcp.registerTool(
    "start_task",
    {
      title: titulo("DESC-TOOL-START-TASK"),
      description: descripcion("DESC-TOOL-START-TASK"),
      inputSchema: shapes.startTask,
      annotations: anotaciones(titulo("DESC-TOOL-START-TASK"), false, false, false),
    },
    sincronizandoTras(async (entrada, extra) => {
      const args = sinNulos(entrada);
      const taskName = args.task_name;

      // `create_project` is `crear_proyecto` with its English name: either is valid, and both at once only if they
      // say the same.
      if (args.crear_proyecto !== undefined && args.create_project !== undefined && args.crear_proyecto !== args.create_project) {
        throw fallo("TOOL-START-ALIAS-DISCREPA");
      }
      const crearProyecto = args.crear_proyecto ?? args.create_project;

      // Without project, that of the open folder. A new project is not deduced: opening one requires saying its
      // name.
      if (!args.project && crearProyecto === true) {
        throw fallo("TOOL-START-CREAR-SIN-NOMBRE");
      }
      const { nombre: proj, deducido } = await proyectoDeLaLlamada(mcp, args.project, "escribe"); // the schema already trimmed the spaces

      // Opening a project has to be deliberate: without this door, a misspelled name would create a loose folder in
      // the Documentation and nobody would find out until looking for it.
      let carpetaProyecto = findProjectFolder(proj);
      let estrenado = false;

      if (!carpetaProyecto) {
        if (crearProyecto !== true) {
          throw fallo("TOOL-START-PROYECTO-NO-EXISTE", { proyecto: proj, disponibles: describeProjects(), mayusculas: proj.toUpperCase() });
        }
        // The name becomes a folder as is: "../evil" would create it outside the Documentation.
        validarSegmento(proj, "project");
        validarNombreVisible(proj, "project");
        carpetaProyecto = proj.toUpperCase();
        estrenado = true;
      }

      if (!estrenado) negarSiHayTareasDelOtroIdioma(carpetaProyecto);

      validarNombreVisible(taskName, "task_name");
      const carpetaTarea = taskFolderPath(carpetaProyecto, taskName);
      const contextoInicial = path.join(carpetaTarea, contextoInicialDe(carpetaProyecto));
      const cabecera = cabeceraDeTarea(carpetaProyecto, estrenado, args.repos, args.preset, args.redaccion);

      const docsBase = requireBasePath(DOCS);
      if (!estaDentroReal(docsBase, carpetaTarea)) {
        throw fallo("TOOL-ACCESO-DENEGADO-TAREA", { docsBase });
      }

      // Opening a project is confirmed with the person if the client can ask them. Without crear_proyecto nothing
      // is asked: offering "shall I create it?" for an unknown name would invite accepting a typo with a click.
      if (estrenado) {
        const { estado, nota } = await pedirConfirmacion(mcp, extra, {
          mensaje: mensaje("TOOL-START-CONFIRMAR", { carpetaProyecto, ruta: path.join(docsBase, carpetaProyecto) }),
          etiqueta: mensaje("TOOL-START-CONFIRMAR-ETIQUETA", { carpetaProyecto }),
        });
        if (estado === "rechazada") {
          throw fallo("TOOL-START-RECHAZADO", { nota });
        }
      }

      // start_task writes the initial context without asking, so calling it on a task that already exists would
      // erase the original requirement — the only document that cannot be regenerated by reading the code.
      // Resuming a task is switch_task, which touches no files.
      if (fs.existsSync(contextoInicial)) {
        throw fallo("TOOL-START-TAREA-YA-EXISTE", { taskName, carpetaProyecto, carpetaTarea });
      }

      siCancelada(extra);
      if (!fs.existsSync(carpetaTarea)) {
        fs.mkdirSync(carpetaTarea, { recursive: true });
      }

      fs.writeFileSync(contextoInicial, `${cabecera}${args.initial_context}`, "utf-8");

      // It becomes the active one of ITS project. Another window working on another project keeps its own: the
      // pointers are independent.
      guardarPuntero(carpetaProyecto, taskName);
      // The active task changes, and with it which documents are listed as resources.
      mcp.sendResourceListChanged();

      return responder(mensaje("TOOL-START-OK", { taskName, contextoInicial, carpetaProyecto, estrenado, deducido }));
    })
  );

  mcp.registerTool(
    "get_phase_prompt",
    {
      title: titulo("DESC-TOOL-GET-PHASE-PROMPT"),
      description: descripcion("DESC-TOOL-GET-PHASE-PROMPT"),
      inputSchema: shapes.getPhasePrompt,
      annotations: anotaciones(titulo("DESC-TOOL-GET-PHASE-PROMPT"), true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      // That it is an integer is already guaranteed by the schema; if the phase does not exist, ensamblarFase says so.
      const { phase, project, task_name } = sinNulos(entrada);

      // The project of the prompt (its preset, its rules, its layers and the configuration block) is the one
      // indicated or, otherwise, the one of the open folder. The single pointer is only used for the gate and the
      // pending items.
      let carpetaProyecto = project ? proyectoSiExiste(project) : null;
      let deducido: string | null = null;
      if (!project) {
        const porRaices = await proyectoPorRaices(mcp);
        if (porRaices.tipo === "unico") {
          carpetaProyecto = porRaices.carpetaProyecto;
          deducido = `> ${lineaDeDeduccion(porRaices)}`;
        }
      }
      fijarIdiomaDelProyecto(carpetaProyecto);
      return responder(await textoDelPromptDeFase(phase, { project, task_name, carpetaProyecto, deducido }));
    })
  );

  mcp.registerTool(
    "get_active_task",
    {
      title: titulo("DESC-TOOL-GET-ACTIVE-TASK"),
      description: descripcion("DESC-TOOL-GET-ACTIVE-TASK"),
      inputSchema: shapes.getActiveTask,
      annotations: anotaciones(titulo("DESC-TOOL-GET-ACTIVE-TASK"), true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const pedido = sinNulos(entrada).project ?? "";

      // With a project: its own. Without a project: each one's. A single global pointer would mean that answering
      // just "the active one" forced guessing which of two windows was asking; listing all of them is the honest
      // answer when it is not known.
      if (pedido) fijarIdiomaDelProyecto(proyectoSiExiste(pedido));
      const proyectos = pedido ? [requireProjectFolder(pedido)] : [...discoverProjects().values()].sort();

      if (proyectos.length === 0) {
        return responder(mensaje("TOOL-ACTIVA-SIN-PROYECTOS"));
      }

      const bloques: string[] = [];

      for (const carpetaProyecto of proyectos) {
        const phases = fasesDelListado(carpetaProyecto, Boolean(pedido), bloques);
        if (!phases) continue;
        const activa = tareaActiva(carpetaProyecto, phases);

        if (!activa) {
          bloques.push(mensaje("TOOL-ACTIVA-SIN-TAREAS", { carpetaProyecto }));
          continue;
        }

        bloques.push(
          mensaje("TOOL-ACTIVA-BLOQUE", {
            carpetaProyecto,
            taskName: activa.estado.taskName,
            deducida: activa.origen === "deducida",
            fase: describeEstado(activa.estado, phases),
            carpeta: activa.estado.folderPath,
          })
        );
      }

      return responder(`${bloques.join("\n\n")}\n\n${mensaje("TOOL-ACTIVA-PUNTEROS", { archivo: stateFile() })}`);
    })
  );

  mcp.registerTool(
    "list_tasks",
    {
      title: titulo("DESC-TOOL-LIST-TASKS"),
      description: descripcion("DESC-TOOL-LIST-TASKS"),
      inputSchema: shapes.listTasks,
      annotations: anotaciones(titulo("DESC-TOOL-LIST-TASKS"), true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const pedido = sinNulos(entrada).project ?? "";

      if (pedido) fijarIdiomaDelProyecto(proyectoSiExiste(pedido));
      const proyectos = pedido ? [requireProjectFolder(pedido)] : [...discoverProjects().values()].sort();

      const bloques: string[] = [];

      for (const carpetaProyecto of proyectos) {
        const phases = fasesDelListado(carpetaProyecto, Boolean(pedido), bloques);
        if (!phases) continue;
        const tareas = listarTareas(carpetaProyecto, phases);
        const activa = tareaActiva(carpetaProyecto, phases);

        if (tareas.length === 0) {
          bloques.push(mensaje("TOOL-LISTAR-SIN-TAREAS", { carpetaProyecto }));
          continue;
        }

        const lineas = tareas.map((tarea) => {
          const marca = tarea.taskName === activa?.estado.taskName ? mensaje("TOOL-LISTAR-MARCA-ACTIVA") : "";
          return `${lineaDeTarea(tarea, phases)}${marca}`;
        });

        const aviso = conflictoConTareas(carpetaProyecto);
        bloques.push(`${aviso ? `${aviso}\n\n` : ""}${mensaje("TOOL-LISTAR-BLOQUE", { carpetaProyecto, total: tareas.length, lineas: lineas.join("\n") })}`);
      }

      return responder(bloques.join("\n\n") || mensaje("TOOL-LISTAR-SIN-PROYECTOS"));
    })
  );

  // It writes the pointer, so it is not read-only; but repeating it gives the same state.
  mcp.registerTool(
    "switch_task",
    {
      title: titulo("DESC-TOOL-SWITCH-TASK"),
      description: descripcion("DESC-TOOL-SWITCH-TASK"),
      inputSchema: shapes.switchTask,
      annotations: anotaciones(titulo("DESC-TOOL-SWITCH-TASK"), false, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      const { nombre, deducido } = await proyectoDeLaLlamada(mcp, args.project, "escribe");
      const carpetaProyecto = requireProjectFolder(nombre);
      const phases = fasesDe(carpetaProyecto);
      const taskName = args.task_name;

      const tareas = listarTareas(carpetaProyecto, phases);
      const encontrada = tareas.find((tarea) => tarea.taskName === taskName);

      if (!encontrada) {
        throw fallo("TOOL-CAMBIAR-NO-EXISTE", { taskName, carpetaProyecto, disponibles: tareas.map((tarea) => tarea.taskName) });
      }

      guardarPuntero(carpetaProyecto, taskName);
      mcp.sendResourceListChanged();

      return responder(
        mensaje("TOOL-CAMBIAR-OK", { carpetaProyecto, taskName, fase: describeEstado(encontrada, phases), carpeta: encontrada.folderPath, deducido })
      );
    })
  );

  mcp.registerTool(
    "read_central_doc",
    {
      title: titulo("DESC-TOOL-READ-CENTRAL-DOC"),
      description: descripcion("DESC-TOOL-READ-CENTRAL-DOC"),
      inputSchema: shapes.readCentralDoc,
      annotations: anotaciones(titulo("DESC-TOOL-READ-CENTRAL-DOC"), true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const docsBase = requireBasePath(DOCS);
      const { args, deducido } = await conProyecto(mcp, sinNulos(entrada), "lee");
      const fullPath = resolveDocPath(args);
      if (!args.project) fijarIdiomaDeLaRuta(fullPath);

      if (!estaDentroReal(docsBase, fullPath)) {
        throw fallo("TOOL-ACCESO-DENEGADO-RUTA", { docsBase });
      }

      // The deduction line goes apart, so as not to mix it with the document's content.
      const resultado = responder(leerTextoAcotado(fullPath));
      if (deducido) resultado.content.push({ type: "text", text: deducido });
      return resultado;
    })
  );

  // The only destructive one: it can overwrite a document. Repeating it with the same content leaves the same
  // file, so it is idempotent.
  mcp.registerTool(
    "write_central_doc",
    {
      title: titulo("DESC-TOOL-WRITE-CENTRAL-DOC"),
      description: descripcion("DESC-TOOL-WRITE-CENTRAL-DOC"),
      inputSchema: shapes.writeCentralDoc,
      annotations: anotaciones(titulo("DESC-TOOL-WRITE-CENTRAL-DOC"), false, true, true),
    },
    sincronizandoTras(async (entrada, extra) => {
      const docsBase = requireBasePath(DOCS);
      const { args, deducido } = await conProyecto(mcp, sinNulos(entrada), "escribe");
      const fullPath = resolveDocPath(args);

      if (!estaDentroReal(docsBase, fullPath)) {
        throw fallo("TOOL-ACCESO-DENEGADO-RUTA", { docsBase });
      }

      // Before the mkdir: with a misspelled task, the recursive mkdir would create its folder.
      const ubicacion = ubicarEnTarea(fullPath);
      if (!ubicacion) {
        throw fallo("TOOL-ESCRIBIR-FUERA-DE-TAREA");
      }
      fijarIdiomaDelProyecto(ubicacion.carpetaProyecto);
      if (DOCUMENTOS_DE_FASE.has(ubicacion.relativo.normalize("NFC").toLowerCase())) negarSiHayTareasDelOtroIdioma(ubicacion.carpetaProyecto);

      // With the document names of ITS project: one that replaces a phase with another document protects that one.
      const motivo = motivoDeProteccion(
        ubicacion.carpetaTarea,
        ubicacion.relativo,
        fasesDe(ubicacion.carpetaProyecto),
        contextoInicialDe(ubicacion.carpetaProyecto)
      );
      const existia = fs.existsSync(fullPath);

      // A protected document is asked about to the person if the client can show them the question; then force is
      // not enough, because the model sets it. Only without elicitation does force decide.
      let sufijo = "";
      if (motivo) {
        const archivo = ubicacion.relativo;
        // A receipt or the Phase 4 document: the hatch is for repairing a damaged file by hand.
        const deLotes = esMotivoDeLotes(motivo);
        const { estado, nota } = await pedirConfirmacion(mcp, extra, {
          mensaje: deLotes
            ? mensaje("TOOL-ESCRIBIR-CONFIRMAR-LOTES", { archivo, taskName: ubicacion.taskName, existia })
            : mensaje("TOOL-ESCRIBIR-CONFIRMAR-PROTEGIDO", { archivo, taskName: ubicacion.taskName, motivo: motivo.replace(/\.$/, ""), existia }),
          etiqueta: mensaje("TOOL-ESCRIBIR-CONFIRMAR-ETIQUETA", { archivo, existia }),
        });

        if (estado === "rechazada") {
          throw fallo("TOOL-ESCRIBIR-RECHAZADO", { archivo, existia, nota });
        }
        if (estado === "no-disponible" && args.force !== true) {
          throw fallo(deLotes ? "TOOL-ESCRIBIR-PIDE-FORCE-LOTES" : "TOOL-ESCRIBIR-PIDE-FORCE", { motivo, nota });
        }

        // force also creates the initial context when it is missing: it is not said "overwritten" if it was not.
        sufijo = mensaje("TOOL-ESCRIBIR-SUFIJO", { confirmada: estado === "confirmada", existia });
        if (deLotes) sufijo += mensaje("TOOL-ESCRIBIR-SUFIJO-MANUAL");
        if (nota) sufijo += `\n${nota}`;
      }

      // If the client cancelled the call while something was awaited (a confirmation), it no longer listens to the
      // response: writing now would leave a file that the model believes does not exist.
      siCancelada(extra);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, motivo && esMotivoDeLotes(motivo) ? comoManual(args.content) : args.content, "utf-8");

      // A new file may be a document or a receipt that is listed as a resource. Rewriting one that already existed
      // does not change the list.
      if (!existia) mcp.sendResourceListChanged();

      return responder(mensaje("TOOL-ESCRIBIR-OK", { ruta: fullPath, sufijo, deducido }));
    })
  );

  // It writes receipts, so it is not read-only; it is not destructive (it never overwrites a sealed receipt)
  // nor idempotent (the second call with the same batch changes mode or fails).
  mcp.registerTool(
    "record_batch",
    {
      title: titulo("DESC-TOOL-RECORD-BATCH"),
      description: descripcion("DESC-TOOL-RECORD-BATCH"),
      inputSchema: shapes.recordBatch,
      outputSchema: recordBatchSalidaShape,
      annotations: anotaciones(titulo("DESC-TOOL-RECORD-BATCH"), false, false, false),
    },
    sincronizandoTras(async (entrada, extra) => {
      const args = sinNulos(entrada);
      const { nombre, deducido } = await proyectoDeLaLlamada(mcp, args.project, "escribe");
      const carpetaProyecto = requireProjectFolder(nombre);
      negarSiHayTareasDelOtroIdioma(carpetaProyecto);

      // The active task only if it is the one the user chose: writing in one deduced by date would be writing in
      // the wrong task without anyone saying so.
      let taskName = args.task_name;
      if (!taskName) {
        const activa = tareaActiva(carpetaProyecto, fasesDe(carpetaProyecto));
        if (!activa || activa.origen !== "puntero") {
          throw fallo("TOOL-LOTE-SIN-TAREA-ACTIVA", { carpetaProyecto });
        }
        taskName = activa.estado.taskName;
      }

      const { project: _proyecto, task_name: _tarea, ...delLote } = args;
      const resultado = await registrarLote(carpetaProyecto, taskName, normalizarEntradaDeLote(delLote), {
        antesDeEscribir: () => siCancelada(extra),
        confirmar: (pregunta) => pedirConfirmacion(mcp, extra, pregunta),
      });
      // A new (or renamed) receipt changes the list of resources.
      if (resultado.archivoNuevo) mcp.sendResourceListChanged();

      return {
        content: [{ type: "text", text: `${resultado.texto}${deducido ? `\n${deducido}` : ""}` }],
        structuredContent: resultado.salida,
      };
    })
  );

  mcp.registerTool(
    "get_batch_status",
    {
      title: titulo("DESC-TOOL-GET-BATCH-STATUS"),
      description: descripcion("DESC-TOOL-GET-BATCH-STATUS"),
      inputSchema: shapes.getBatchStatus,
      outputSchema: getBatchStatusSalidaShape,
      annotations: anotaciones(titulo("DESC-TOOL-GET-BATCH-STATUS"), true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      const { nombre, deducido } = await proyectoDeLaLlamada(mcp, args.project, "lee");
      const carpetaProyecto = requireProjectFolder(nombre);
      negarSiHayTareasDelOtroIdioma(carpetaProyecto);

      let taskName = args.task_name;
      let nota: string | null = null;
      if (!taskName) {
        const activa = tareaActiva(carpetaProyecto, fasesDe(carpetaProyecto));
        if (!activa) throw fallo("TOOL-ESTADO-LOTES-SIN-TAREAS", { carpetaProyecto });
        taskName = activa.estado.taskName;
        if (activa.origen === "deducida") nota = mensaje("TOOL-ESTADO-LOTES-DEDUCIDA", { taskName });
      }

      const { texto, salida } = await estadoDeLotes(carpetaProyecto, taskName, { reverificar: args.reverificar === true });
      return {
        content: [{ type: "text", text: [texto, nota, deducido].filter(Boolean).join("\n\n") }],
        structuredContent: salida,
      };
    })
  );

  // The same X-ray as `npx mcp-phase-gate doctor`, plus what is only known from inside a session: which client
  // is connected and which capabilities it announced.
  mcp.registerTool(
    "get_orchestrator_status",
    {
      title: titulo("DESC-TOOL-GET-ORCHESTRATOR-STATUS"),
      description: descripcion("DESC-TOOL-GET-ORCHESTRATOR-STATUS"),
      inputSchema: shapes.getOrchestratorStatus,
      outputSchema: diagnosticoShape,
      annotations: anotaciones(titulo("DESC-TOOL-GET-ORCHESTRATOR-STATUS"), true, false, true),
    },
    sincronizandoTras(async () => {
      const version = mcp.server.getClientVersion();
      const capacidades = mcp.server.getClientCapabilities();
      const cliente = version
        ? {
            nombre: version.name,
            version: version.version,
            capacidades: { elicitation: Boolean(capacidades?.elicitation?.form), roots: Boolean(capacidades?.roots) },
          }
        : undefined;

      // The roots of the session say which project the open folder matches.
      const raices = capacidades?.roots ? await raicesActuales(mcp) : undefined;
      const diagnostico = await diagnosticarSinBloquear({ ...(cliente ? { cliente } : {}), ...(raices ? { raices } : {}) });
      return {
        content: [{ type: "text", text: formatearDiagnostico(diagnostico, "markdown") }],
        structuredContent: diagnostico,
      };
    })
  );

  mcp.registerTool(
    "read_cross_repo",
    {
      title: titulo("DESC-TOOL-READ-CROSS-REPO"),
      description: descripcion("DESC-TOOL-READ-CROSS-REPO"),
      inputSchema: shapes.readCrossRepo,
      annotations: anotaciones(titulo("DESC-TOOL-READ-CROSS-REPO"), true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      return responder(leerTextoAcotado(resolveRepoPath(args.repo_name, args.file_path)));
    })
  );

  mcp.registerTool(
    "read_repo_file",
    {
      title: titulo("DESC-TOOL-READ-REPO-FILE"),
      description: descripcion("DESC-TOOL-READ-REPO-FILE"),
      inputSchema: shapes.readRepoFile,
      annotations: anotaciones(titulo("DESC-TOOL-READ-REPO-FILE"), true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      const { nombre, deducido } = await proyectoDeLaLlamada(mcp, args.project, "lee");
      const carpetaProyecto = requireProjectFolder(nombre);
      const resultado = responder(leerArchivoDeRepo(carpetaProyecto, args.repo, args.path));
      if (deducido) resultado.content.push({ type: "text", text: deducido });
      return resultado;
    })
  );

  mcp.registerTool(
    "repo_status",
    {
      title: titulo("DESC-TOOL-REPO-STATUS"),
      description: descripcion("DESC-TOOL-REPO-STATUS"),
      inputSchema: shapes.repoStatus,
      outputSchema: repoStatusSalidaShape,
      annotations: anotaciones(titulo("DESC-TOOL-REPO-STATUS"), true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      const { nombre, deducido } = await proyectoDeLaLlamada(mcp, args.project, "lee");
      const carpetaProyecto = requireProjectFolder(nombre);

      let repos: RepoResuelto[];
      let tituloDelEstado: string;
      if (args.repo) {
        repos = [resolverRepo(carpetaProyecto, args.repo)];
        tituloDelEstado = mensaje("TOOL-REPOS-TITULO-REPO", { repo: args.repo, carpetaProyecto });
      } else {
        const activa = tareaActiva(carpetaProyecto, fasesDe(carpetaProyecto));
        repos = reposDeLaTarea(configuracionDe(carpetaProyecto, activa?.estado.folderPath ?? null));
        if (repos.length === 0) {
          throw fallo("TOOL-REPOS-SIN-REPOS", { carpetaProyecto });
        }
        tituloDelEstado = activa
          ? mensaje("TOOL-REPOS-TITULO-TAREA", { taskName: activa.estado.taskName, carpetaProyecto })
          : mensaje("TOOL-REPOS-TITULO-PROYECTO", { carpetaProyecto });
      }

      const estados = await Promise.all(repos.map((repo) => estadoDeRepo(repo)));
      const texto = [tituloDelEstado, ...estados.map((estado) => `- ${lineaDeEstado(estado)}`), ...(deducido ? ["", deducido] : [])].join("\n");
      return { content: [{ type: "text", text: texto }], structuredContent: { proyecto: carpetaProyecto, repos: estados } };
    })
  );
}

// The project's language for the blocks the server adds to the prompt. If it cannot be known, the call's.
function idiomaDelPrompt(carpetaProyecto: string | null): Idioma {
  try {
    return idiomaDelProyecto(carpetaProyecto).idioma;
  } catch {
    return idiomaDeMensajes();
  }
}

// The text that get_phase_prompt delivers, once the project is resolved: `project` is the one requested (it
// may not exist), `carpetaProyecto` the one that exists (the requested one or the one the roots deduced) and
// `deducido` the line of the deduction. The tool calls it after deducing; the Studio, with the project and
// the task the person chooses, to show exactly the same text.
export async function textoDelPromptDeFase(
  phase: number,
  { project, task_name, carpetaProyecto, deducido }: { project?: string | undefined; task_name?: string | undefined; carpetaProyecto: string | null; deducido: string | null }
): Promise<string> {
  const delPrompt = project ?? carpetaProyecto;
  const opciones = { ...(delPrompt ? { project: delPrompt } : {}), ...(task_name ? { taskName: task_name } : {}) };

  // The gate warns, it does not block: the prompt is always delivered. If checking it failed for whatever
  // reason, delivering it anyway is better than leaving the user without a phase over a warning. The same goes
  // for the list of receipts: it is a help, not a condition.
  let aviso: string | null = null;
  let pendientes: string | null = null;
  let recibos: string | null = null;
  let commits: string | null = null;
  let carpetaTarea: string | null = null;
  try {
    aviso = avisoDeCompuerta(phase, fasesDe, opciones);

    const resuelta = resolverTareaDelPrompt(fasesDe, opciones);
    if (resuelta && resuelta !== "ambigua") {
      // The blocks added to the prompt, in the language of the task's project.
      const idiomaDeLaTarea = idiomaDelPrompt(resuelta.carpetaProyecto);
      pendientes = avisoDePendientes(phase, resuelta.estado, resuelta.phases, idiomaDeLaTarea);
      recibos = bloqueDeRecibos(phase, resuelta.estado, resuelta.phases, idiomaDeLaTarea);
      // The task contributes its preset if it declares one in its initial context.
      if (carpetaProyecto && resuelta.carpetaProyecto === carpetaProyecto) carpetaTarea = resuelta.estado.folderPath;
      // In the phase after the batches one (the 5th), the already verified commits for the auditor.
      const deLotes = [...resuelta.phases.entries()].find(([, datos]) => datos.recibos);
      if (deLotes && phase === deLotes[0] + 1) commits = await bloqueDeCommitsConPlazo(resuelta.carpetaProyecto, resuelta.estado.folderPath, resuelta.phases);
    }
  } catch (error) {
    log("warning", mensaje("SERVIDOR-COMPUERTA-FALLO", { error: mensajeDe(error) }));
  }

  // A project that declares a language and has tasks in the other: the deduction would take them as without
  // documents, so the prompt is not delivered (IDIOMA-CON-TAREAS), with the same text as doctor.
  if (carpetaProyecto) negarSiHayTareasDelOtroIdioma(carpetaProyecto);

  // A badly written manifest or preset is an error: delivering the factory prompt in its place would be the
  // silent failure the manifest avoids.
  const columnas = carpetaProyecto ? await columnasDeGit(carpetaProyecto, carpetaTarea) : new Map<string, string>();
  const ensamblado = ensamblarFase(phase, carpetaProyecto, carpetaTarea, { estadoDeRepo: (repo) => columnas.get(repo.id) ?? null });
  const idiomaDelEnsamblado = idiomaDelPrompt(carpetaProyecto);
  const notas = ensamblado.avisos.filter((h) => h.codigo === "BLOQUE-HUERFANO").map((h) => notaDeHuerfano(h, idiomaDelEnsamblado));
  for (const h of ensamblado.avisos) if (h.codigo !== "BLOQUE-HUERFANO") log("warning", h.texto);
  // Without a project, the prompt carries no project's configuration: it is said, so that the model does not
  // believe it has its project's preset. In the call's language.
  if (!carpetaProyecto) notas.unshift(notaSinProyecto(project));

  // What the model has to read first goes in front: the phase skip and the pending items.
  return [deducido, aviso, pendientes, notas.join("\n") || null, ensamblado.texto, recibos, commits].filter(Boolean).join("\n\n");
}

// The git state of the task's repos, for the PROJECT CONFIGURATION block. If it takes more than 3 s or
// fails, the column is left out and the prompt is delivered anyway: it is a help, not a condition.
export const ESPERA_DE_ESTADO_MS = 3000;

async function columnasDeGit(carpetaProyecto: string, carpetaTarea: string | null): Promise<Map<string, string>> {
  let repos: RepoResuelto[];
  try {
    repos = reposDeLaTarea(configuracionDe(carpetaProyecto, carpetaTarea));
  } catch {
    return new Map(); // the configuration error comes from ensamblarFase
  }
  // A repo that does not answer in time loses its column; the others keep theirs.
  const estados = await estadosConPlazo(repos, ESPERA_DE_ESTADO_MS);
  return new Map(
    repos.flatMap((repo, i) => {
      const estado = estados[i];
      const columna = estado ? columnaDeConfiguracion(estado) : null;
      return columna ? [[repo.id, columna] as [string, string]] : [];
    })
  );
}
