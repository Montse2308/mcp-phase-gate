// El servidor MCP: registra las tools y las conecta con la lógica de los demás módulos.
// Aquí no se calcula nada — las rutas viven en paths.ts, las fases en phases.ts y las tareas en
// tasks.ts. Este archivo solo traduce entre el protocolo y esas funciones.
//
// crearServidor no conecta ningún transporte: lo hace index.ts con stdio, y los tests con un
// transporte en memoria. Así el servidor entero se puede probar sin lanzar un proceso.
//
// Cada tool se registra con su shape de schemas.ts: el SDK valida los argumentos antes del
// callback y convierte en `isError` tanto un fallo de validación como un Error lanzado aquí. Por
// eso los callbacks lanzan Error con el mensaje para el modelo, y no arman respuestas de error.
//
// Idiomas (§8.5): los títulos y las descripciones de las tools y de sus parámetros se fijan al crear el
// servidor, en el idioma de arranque. Cada llamada abre su propio contexto de mensajes y lo fija al idioma
// de su proyecto en cuanto lo sabe: sus errores y su respuesta salen en ese idioma.

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
import { condicionalCanonica, estadoCanonico } from "./vocabulario.js";
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

// La llamada ya sabe su proyecto, y existe: sus errores y su respuesta, en el idioma de ese proyecto. Un
// manifiesto que no se puede leer no cambia qué error se lanza: el idioma se queda como estaba.
function fijarIdiomaDelProyecto(carpetaProyecto: string | null | undefined): void {
  if (!carpetaProyecto) return;
  try {
    fijarIdiomaDeMensajes(idiomaDelProyecto(carpetaProyecto).idioma);
  } catch {
    // El error de verdad, si lo hay, lo dará quien lea el proyecto.
  }
}

// El proyecto de una llamada que lo necesita: el que se indica o, si no, el que deducen las raíces
// del cliente. Si no se puede deducir, la llamada falla pidiéndolo (con los candidatos si hay varios).
// `deducido` es la línea que la respuesta añade para que se vea de dónde salió.
//
// Para escribir hace falta una coincidencia fuerte (la carpeta abierta ES un repo del proyecto o está en
// su carpeta de la Documentación). Una débil (la carpeta abierta solo CONTIENE un repo suyo) basta para
// leer, pero no para escribir en un proyecto que la IA no nombró (hallazgo 3 de la auditoría de la Etapa 3).
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

// Para read_central_doc y write_central_doc: solo hace falta proyecto cuando se usa la forma
// recomendada (task_name + file_name) sin project; con file_path, no.
async function conProyecto<T extends ArgumentosDeDocumento>(mcp: McpServer, args: T, uso: "lee" | "escribe"): Promise<{ args: T; deducido: string | null }> {
  if (args.project) fijarIdiomaDelProyecto(proyectoSiExiste(args.project));
  if (args.project || args.file_path || !args.task_name || !args.file_name) return { args, deducido: null };
  const { nombre, deducido } = await proyectoDeLaLlamada(mcp, undefined, uso);
  return { args: { ...args, project: nombre }, deducido };
}

// Con file_path, el proyecto sale de la ruta: si cae en la carpeta de una tarea, sus mensajes van en el
// idioma de ese proyecto.
function fijarIdiomaDeLaRuta(rutaAbsoluta: string): void {
  try {
    fijarIdiomaDelProyecto(ubicarEnTarea(rutaAbsoluta)?.carpetaProyecto);
  } catch {
    // Una ruta que no se puede ubicar no cambia el idioma.
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

// Un proyecto que no existe no impide entregar un prompt: se entrega sin su configuración, y la
// compuerta lo dice en el log como siempre. Sin Documentación configurada, tampoco hay proyecto.
function proyectoSiExiste(project: string): string | null {
  try {
    return findProjectFolder(project);
  } catch {
    return null;
  }
}

// La cabecera que start_task escribe en el contexto inicial cuando la tarea elige sus repos o su
// preset. Se valida ANTES de crear nada: un id mal escrito no debe dejar media tarea creada.
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

  // El idioma en que se redacta la tarea, si se pidió (§8.3). Lo lee frontmatterDeTarea.
  if (redaccion) lineas.push(`redaccion: ${redaccion}`);

  return lineas.length ? `---\n${lineas.join("\n")}\n---\n` : "";
}

// `estado` y los títulos de `condicionales` pueden llegar en inglés (los prompts en inglés los usan así): el
// motor de lotes trabaja con los valores canónicos (§8.2).
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

// Las fases de un proyecto para un listado. Si se pidió ese proyecto, un manifiesto inválido es un
// error; en el listado de todos, ese proyecto sale con su error y los demás se listan igual.
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

// Las anotaciones dicen al cliente qué hace cada tool, para que decida si pide permiso. Los
// valores por defecto del protocolo son pesimistas (destructiva y de mundo abierto), así que todas
// declaran los cuatro valores. openWorldHint es false en todas: ninguna sale de las carpetas
// configuradas.
function anotaciones(
  title: string,
  readOnlyHint: boolean,
  destructiveHint: boolean,
  idempotentHint: boolean
): { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean } {
  return { title, readOnlyHint, destructiveHint, idempotentHint, openWorldHint: false };
}

// `idioma`: el de los títulos y las descripciones de las tools, sus parámetros, los /fN y los recursos.
// Por defecto, el de los mensajes al arrancar (PHASE_GATE_LANG o, si no, el del sistema).
export function crearServidor(idioma: Idioma = idiomaDeMensajes()): McpServer {
  const mcp = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { logging: {} } }
  );

  conectarLog(mcp);
  iniciarRoots(mcp);
  registrarTools(mcp, idioma);
  enIdioma(idioma, () => registrarRecursos(mcp));

  // Los /fN se registran ya, antes de conectar, y se vuelven a sincronizar tras cada tool y
  // cuando cambia una capa de prompts.
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
  // El título y la descripción de una tool, en el idioma del servidor.
  const titulo = (codigo: string): string => mensaje(`${codigo}-TITULO`, {}, idioma);
  const descripcion = (codigo: string): string => mensaje(codigo, {}, idioma);

  // Cada llamada abre su contexto de mensajes (el idioma de su proyecto, en cuanto lo sepa) y su caché del
  // recuento de documentos por idioma (conCacheDelIdioma), y tras ella se sincronizan los prompts /fN. Leer las carpetas de prompts cuesta milisegundos, y es lo único que
  // garantiza que una fase nueva aparezca en OneDrive, donde fs.watch no avisa.
  const sincronizandoTras =
    <A extends unknown[], R>(callback: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await conContextoDeMensajes(() => conCacheDelIdioma(() => callback(...args)));
      } finally {
        sincronizarPrompts(mcp, idioma);
      }
    };

  // start_task no es destructiva (se niega a pisar una tarea) ni idempotente (la segunda llamada falla).
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

      // `create_project` es `crear_proyecto` con su nombre en inglés: vale cualquiera, y los dos a la vez
      // solo si dicen lo mismo.
      if (args.crear_proyecto !== undefined && args.create_project !== undefined && args.crear_proyecto !== args.create_project) {
        throw fallo("TOOL-START-ALIAS-DISCREPA");
      }
      const crearProyecto = args.crear_proyecto ?? args.create_project;

      // Sin project, el de la carpeta abierta. Un proyecto nuevo no se deduce: estrenarlo exige
      // decir su nombre.
      if (!args.project && crearProyecto === true) {
        throw fallo("TOOL-START-CREAR-SIN-NOMBRE");
      }
      const { nombre: proj, deducido } = await proyectoDeLaLlamada(mcp, args.project, "escribe"); // el schema ya le quitó los espacios

      // Estrenar proyecto tiene que ser deliberado: sin esta puerta, un nombre mal escrito
      // creaba una carpeta suelta en la Documentación y nadie se enteraba hasta buscarla.
      let carpetaProyecto = findProjectFolder(proj);
      let estrenado = false;

      if (!carpetaProyecto) {
        if (crearProyecto !== true) {
          throw fallo("TOOL-START-PROYECTO-NO-EXISTE", { proyecto: proj, disponibles: describeProjects(), mayusculas: proj.toUpperCase() });
        }
        // El nombre se vuelve carpeta tal cual: "../evil" la creaba fuera de la Documentación.
        validarSegmento(proj, "project");
        validarNombreVisible(proj, "project");
        carpetaProyecto = proj.toUpperCase();
        estrenado = true;
      }

      validarNombreVisible(taskName, "task_name");
      const carpetaTarea = taskFolderPath(carpetaProyecto, taskName);
      const contextoInicial = path.join(carpetaTarea, contextoInicialDe(carpetaProyecto));
      const cabecera = cabeceraDeTarea(carpetaProyecto, estrenado, args.repos, args.preset, args.redaccion);

      const docsBase = requireBasePath(DOCS);
      if (!estaDentroReal(docsBase, carpetaTarea)) {
        throw fallo("TOOL-ACCESO-DENEGADO-TAREA", { docsBase });
      }

      // Estrenar un proyecto se le confirma a la persona si el cliente puede preguntarle. Sin
      // crear_proyecto no se pregunta nada: ofrecer "¿lo creo?" ante un nombre desconocido
      // invitaría a aceptar un typo con un clic.
      if (estrenado) {
        const { estado, nota } = await pedirConfirmacion(mcp, extra, {
          mensaje: mensaje("TOOL-START-CONFIRMAR", { carpetaProyecto, ruta: path.join(docsBase, carpetaProyecto) }),
          etiqueta: mensaje("TOOL-START-CONFIRMAR-ETIQUETA", { carpetaProyecto }),
        });
        if (estado === "rechazada") {
          throw fallo("TOOL-START-RECHAZADO", { nota });
        }
      }

      // start_task escribe el contexto inicial sin preguntar, así que llamarlo sobre una tarea
      // que ya existe borraba el requerimiento original — el único documento que no se puede
      // regenerar leyendo el código. Retomar una tarea es switch_task, que no toca archivos.
      if (fs.existsSync(contextoInicial)) {
        throw fallo("TOOL-START-TAREA-YA-EXISTE", { taskName, carpetaProyecto, carpetaTarea });
      }

      siCancelada(extra);
      if (!fs.existsSync(carpetaTarea)) {
        fs.mkdirSync(carpetaTarea, { recursive: true });
      }

      fs.writeFileSync(contextoInicial, `${cabecera}${args.initial_context}`, "utf-8");

      // Queda como activa de SU proyecto. Otra ventana trabajando en otro proyecto conserva
      // la suya: los punteros son independientes.
      guardarPuntero(carpetaProyecto, taskName);
      // Cambia la tarea activa, y con ella qué documentos se listan como recursos.
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
      // Que sea un entero ya lo garantiza el schema; si la fase no existe, lo dice ensamblarFase.
      const { phase, project, task_name } = sinNulos(entrada);

      // El proyecto del prompt (su preset, sus reglas, sus capas y el bloque de configuración) es el
      // que se indica o, si no, el de la carpeta abierta. El único puntero solo sirve para la
      // compuerta y los pendientes, como antes.
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

      // Con proyecto: la suya. Sin proyecto: la de cada uno. Antes había un único puntero
      // global y responder "la activa" a secas obligaba a adivinar cuál de dos ventanas
      // preguntaba; listar todas es la respuesta honesta cuando no se sabe.
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

        bloques.push(mensaje("TOOL-LISTAR-BLOQUE", { carpetaProyecto, total: tareas.length, lineas: lineas.join("\n") }));
      }

      return responder(bloques.join("\n\n") || mensaje("TOOL-LISTAR-SIN-PROYECTOS"));
    })
  );

  // Escribe el puntero, así que no es de solo lectura; pero repetirla da el mismo estado.
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

      // La línea de la deducción va aparte, para no mezclarla con el contenido del documento.
      const resultado = responder(leerTextoAcotado(fullPath));
      if (deducido) resultado.content.push({ type: "text", text: deducido });
      return resultado;
    })
  );

  // La única destructiva: puede sobrescribir un documento. Repetirla con el mismo contenido deja
  // el mismo archivo, así que es idempotente.
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

      // Antes del mkdir: con una tarea mal escrita, el mkdir recursivo creaba su carpeta.
      const ubicacion = ubicarEnTarea(fullPath);
      if (!ubicacion) {
        throw fallo("TOOL-ESCRIBIR-FUERA-DE-TAREA");
      }
      fijarIdiomaDelProyecto(ubicacion.carpetaProyecto);

      // Con los nombres de documento de SU proyecto: uno que sustituye una fase con otro documento
      // protege ese.
      const motivo = motivoDeProteccion(
        ubicacion.carpetaTarea,
        ubicacion.relativo,
        fasesDe(ubicacion.carpetaProyecto),
        contextoInicialDe(ubicacion.carpetaProyecto)
      );
      const existia = fs.existsSync(fullPath);

      // Un documento protegido se le pregunta a la persona si el cliente puede mostrarle la
      // pregunta; entonces force no basta, porque lo pone el modelo. Solo sin elicitation decide
      // force, como antes.
      let sufijo = "";
      if (motivo) {
        const archivo = ubicacion.relativo;
        // Un recibo o el documento de la Fase 4: la escotilla es para reparar a mano un archivo dañado.
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

        // force también crea el contexto inicial cuando falta: no se dice "sobrescrito" si no lo era.
        sufijo = mensaje("TOOL-ESCRIBIR-SUFIJO", { confirmada: estado === "confirmada", existia });
        if (deLotes) sufijo += mensaje("TOOL-ESCRIBIR-SUFIJO-MANUAL");
        if (nota) sufijo += `\n${nota}`;
      }

      // Si el cliente canceló la llamada mientras se esperaba algo (una confirmación), ya no
      // escucha la respuesta: escribir ahora dejaría un archivo que el modelo cree que no existe.
      siCancelada(extra);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, motivo && esMotivoDeLotes(motivo) ? comoManual(args.content) : args.content, "utf-8");

      // Un archivo nuevo puede ser un documento o un recibo que se lista como recurso. Reescribir
      // uno que ya existía no cambia la lista.
      if (!existia) mcp.sendResourceListChanged();

      return responder(mensaje("TOOL-ESCRIBIR-OK", { ruta: fullPath, sufijo, deducido }));
    })
  );

  // Escribe recibos, así que no es de solo lectura; no es destructiva (nunca pisa un recibo sellado) ni
  // idempotente (la segunda llamada con el mismo lote cambia de modo o falla).
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

      // La tarea activa solo si es la que el usuario eligió: escribir en una deducida por fecha sería
      // escribir en la tarea equivocada sin que nadie lo diga.
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
      // Un recibo nuevo (o renombrado) cambia la lista de recursos.
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

  // La misma radiografía que `npx mcp-phase-gate doctor`, más lo que solo se sabe desde dentro de
  // una sesión: qué cliente está conectado y qué capacidades anunció.
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

      // Las raíces de la sesión dicen con qué proyecto coincide la carpeta abierta.
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

// El idioma del proyecto para los bloques que el servidor añade al prompt. Si no se puede saber, el de
// la llamada.
function idiomaDelPrompt(carpetaProyecto: string | null): Idioma {
  try {
    return idiomaDelProyecto(carpetaProyecto).idioma;
  } catch {
    return idiomaDeMensajes();
  }
}

// El texto que entrega get_phase_prompt, una vez resuelto el proyecto: `project` es el que se pidió (puede
// no existir), `carpetaProyecto` el que existe (el pedido o el que dedujeron las raíces) y `deducido` la
// línea de la deducción. La tool lo llama tras deducir; el Studio, con el proyecto y la tarea que elige la
// persona, para enseñar exactamente el mismo texto.
export async function textoDelPromptDeFase(
  phase: number,
  { project, task_name, carpetaProyecto, deducido }: { project?: string | undefined; task_name?: string | undefined; carpetaProyecto: string | null; deducido: string | null }
): Promise<string> {
  const delPrompt = project ?? carpetaProyecto;
  const opciones = { ...(delPrompt ? { project: delPrompt } : {}), ...(task_name ? { taskName: task_name } : {}) };

  // La compuerta avisa, no bloquea: el prompt se entrega siempre. Si comprobarla fallara
  // por lo que sea, entregarlo igual es mejor que dejar al usuario sin fase por un aviso.
  // Lo mismo con la lista de recibos: es una ayuda, no una condición.
  let aviso: string | null = null;
  let pendientes: string | null = null;
  let recibos: string | null = null;
  let commits: string | null = null;
  let carpetaTarea: string | null = null;
  try {
    aviso = avisoDeCompuerta(phase, fasesDe, opciones);

    const resuelta = resolverTareaDelPrompt(fasesDe, opciones);
    if (resuelta && resuelta !== "ambigua") {
      // Los bloques que se añaden al prompt, en el idioma del proyecto de la tarea.
      const idiomaDeLaTarea = idiomaDelPrompt(resuelta.carpetaProyecto);
      pendientes = avisoDePendientes(phase, resuelta.estado, resuelta.phases, idiomaDeLaTarea);
      recibos = bloqueDeRecibos(phase, resuelta.estado, resuelta.phases, idiomaDeLaTarea);
      // La tarea aporta su preset si declara uno en su contexto inicial.
      if (carpetaProyecto && resuelta.carpetaProyecto === carpetaProyecto) carpetaTarea = resuelta.estado.folderPath;
      // En la fase siguiente a la de los lotes (la 5), los commits ya verificados para el auditor.
      const deLotes = [...resuelta.phases.entries()].find(([, datos]) => datos.recibos);
      if (deLotes && phase === deLotes[0] + 1) commits = await bloqueDeCommitsConPlazo(resuelta.carpetaProyecto, resuelta.estado.folderPath, resuelta.phases);
    }
  } catch (error) {
    log("warning", mensaje("SERVIDOR-COMPUERTA-FALLO", { error: mensajeDe(error) }));
  }

  // Un proyecto que declara un idioma y tiene tareas en el otro: la deducción las daría por sin
  // documentos, así que el prompt no se entrega (IDIOMA-CON-TAREAS, §8.3), con el mismo texto que doctor.
  if (carpetaProyecto) {
    const conflicto = conflictoDeIdioma(carpetaProyecto);
    if (conflicto?.codigo === "IDIOMA-CON-TAREAS") throw new Error(`${conflicto.texto} (${conflicto.codigo})`);
  }

  // Un manifiesto o un preset mal escrito sí es un error: entregar el prompt de fábrica en su
  // lugar sería el fallo silencioso que el manifiesto evita.
  const columnas = carpetaProyecto ? await columnasDeGit(carpetaProyecto, carpetaTarea) : new Map<string, string>();
  const ensamblado = ensamblarFase(phase, carpetaProyecto, carpetaTarea, { estadoDeRepo: (repo) => columnas.get(repo.id) ?? null });
  const idiomaDelEnsamblado = idiomaDelPrompt(carpetaProyecto);
  const notas = ensamblado.avisos.filter((h) => h.codigo === "BLOQUE-HUERFANO").map((h) => notaDeHuerfano(h, idiomaDelEnsamblado));
  for (const h of ensamblado.avisos) if (h.codigo !== "BLOQUE-HUERFANO") log("warning", h.texto);
  // Sin proyecto, el prompt no lleva la configuración de ninguno: se dice, para que el modelo no crea
  // que tiene el preset de su proyecto (hallazgo 8 de la auditoría de la Etapa 3). En el idioma de la llamada.
  if (!carpetaProyecto) notas.unshift(notaSinProyecto(project));

  // Lo que el modelo tiene que leer antes de nada va delante: el salto de fase y los pendientes.
  return [deducido, aviso, pendientes, notas.join("\n") || null, ensamblado.texto, recibos, commits].filter(Boolean).join("\n\n");
}

// El estado de git de los repos de la tarea, para el bloque CONFIGURACIÓN DEL PROYECTO. Si tarda más de
// 3 s o falla, la columna se omite y el prompt se entrega igual: es una ayuda, no una condición.
export const ESPERA_DE_ESTADO_MS = 3000;

async function columnasDeGit(carpetaProyecto: string, carpetaTarea: string | null): Promise<Map<string, string>> {
  let repos: RepoResuelto[];
  try {
    repos = reposDeLaTarea(configuracionDe(carpetaProyecto, carpetaTarea));
  } catch {
    return new Map(); // el error de configuración lo da ensamblarFase
  }
  // Un repo que no responde a tiempo pierde su columna; los demás la conservan.
  const estados = await estadosConPlazo(repos, ESPERA_DE_ESTADO_MS);
  return new Map(
    repos.flatMap((repo, i) => {
      const estado = estados[i];
      const columna = estado ? columnaDeConfiguracion(estado) : null;
      return columna ? [[repo.id, columna] as [string, string]] : [];
    })
  );
}
