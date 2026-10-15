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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";

import { DOCS, SERVER_NAME, SERVER_VERSION, requireBasePath, stateFile } from "./config.js";
import { diagnosticarSinBloquear, formatearDiagnostico } from "./diagnostico.js";
import { pedirConfirmacion } from "./confirmacion.js";
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
import { IDIOMA_POR_DEFECTO } from "./config.js";
import { describirPresets, manifiestoDe, presetsDisponibles } from "./manifiesto.js";
import type { RepoResuelto } from "./manifiesto.js";
import { columnaDeConfiguracion, estadoDeRepo, estadosConPlazo, leerArchivoDeRepo, lineaDeEstado, resolverRepo } from "./repos.js";
import { asegurarCapacidadDePrompts, sincronizarPrompts, vigilarCapas } from "./prompts-mcp.js";
import { registrarRecursos } from "./recursos.js";
import { errorSinProyecto, iniciarRoots, lineaDeDeduccion, proyectoPorRaices, raicesActuales } from "./roots.js";
import type { PhaseFile } from "./phases.js";
import {
  diagnosticoShape,
  getActiveTaskShape,
  getOrchestratorStatusShape,
  getPhasePromptShape,
  listTasksShape,
  readCentralDocShape,
  readCrossRepoShape,
  readRepoFileShape,
  repoStatusSalidaShape,
  repoStatusShape,
  sinNulos,
  startTaskShape,
  switchTaskShape,
  writeCentralDocShape,
} from "./schemas.js";
import {
  avisoDeCompuerta,
  avisoDePendientes,
  bloqueDeRecibos,
  describeEstado,
  guardarPuntero,
  listarTareas,
  motivoDeProteccion,
  resolverTareaDelPrompt,
  tareaActiva,
} from "./tasks.js";
import type { EstadoTarea } from "./tasks.js";

function responder(texto: string): CallToolResult {
  return { content: [{ type: "text", text: texto }] };
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// El proyecto de una llamada que lo necesita: el que se indica o, si no, el que deducen las raíces
// del cliente. Si no se puede deducir, la llamada falla pidiéndolo (con los candidatos si hay varios).
// `deducido` es la línea que la respuesta añade para que se vea de dónde salió.
async function proyectoDeLaLlamada(mcp: McpServer, project: string | undefined): Promise<{ nombre: string; deducido: string | null }> {
  if (project) return { nombre: project, deducido: null };
  const porRaices = await proyectoPorRaices(mcp);
  if (porRaices.tipo !== "unico") throw errorSinProyecto(porRaices);
  return { nombre: porRaices.carpetaProyecto, deducido: lineaDeDeduccion(porRaices) };
}

// Para read_central_doc y write_central_doc: solo hace falta proyecto cuando se usa la forma
// recomendada (task_name + file_name) sin project; con file_path, no.
async function conProyecto<T extends ArgumentosDeDocumento>(mcp: McpServer, args: T): Promise<{ args: T; deducido: string | null }> {
  if (args.project || args.file_path || !args.task_name || !args.file_name) return { args, deducido: null };
  const { nombre, deducido } = await proyectoDeLaLlamada(mcp, undefined);
  return { args: { ...args, project: nombre }, deducido };
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
function cabeceraDeTarea(carpetaProyecto: string, estrenado: boolean, repos: string[] | undefined, preset: string | undefined): string {
  const manifiesto = estrenado ? null : manifiestoDe(carpetaProyecto);
  const lineas: string[] = [];

  if (repos && repos.length) {
    const validos = manifiesto?.repos.map((repo) => repo.id) ?? [];
    if (validos.length === 0) {
      throw new Error(
        `El proyecto ${carpetaProyecto} no declara repos en su phase-gate.json, así que la tarea no puede elegir ` +
          `entre ellos. Quita \`repos\`, o decláralos primero en el manifiesto.`
      );
    }
    const desconocidos = repos.filter((id) => !validos.includes(id));
    if (desconocidos.length) {
      throw new Error(
        `${desconocidos.map((id) => `"${id}"`).join(", ")} no ${desconocidos.length === 1 ? "es un repo" : "son repos"} ` +
          `del phase-gate.json de ${carpetaProyecto}. Los válidos son: ${validos.join(", ")}.`
      );
    }
    lineas.push(`repos: ${[...new Set(repos)].join(", ")}`);
  }

  if (preset) {
    const presets = presetsDisponibles(manifiesto?.idioma ?? IDIOMA_POR_DEFECTO);
    if (!presets.has(preset)) throw new Error(`No existe el preset "${preset}". Los disponibles son: ${describirPresets(presets)}.`);
    lineas.push(`preset: ${preset}`);
  }

  return lineas.length ? `---\n${lineas.join("\n")}\n---\n` : "";
}

function siCancelada(extra: { signal: AbortSignal }): void {
  if (extra.signal.aborted) throw new Error("El cliente canceló la llamada antes de escribir. No se escribió nada.");
}

// Las fases de un proyecto para un listado. Si se pidió ese proyecto, un manifiesto inválido es un
// error; en el listado de todos, ese proyecto sale con su error y los demás se listan igual.
function fasesDelListado(carpetaProyecto: string, pedido: boolean, bloques: string[]): Map<number, PhaseFile> | null {
  try {
    return fasesDe(carpetaProyecto);
  } catch (error) {
    if (pedido) throw error;
    bloques.push(`${carpetaProyecto}: no se pudo leer su configuración. ${mensajeDe(error)}`);
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

export function crearServidor(): McpServer {
  const mcp = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { logging: {} } }
  );

  conectarLog(mcp);
  iniciarRoots(mcp);
  registrarTools(mcp);
  registrarRecursos(mcp);

  // Los /fN se registran ya, antes de conectar, y se vuelven a sincronizar tras cada tool y
  // cuando cambia una capa de prompts.
  sincronizarPrompts(mcp);
  asegurarCapacidadDePrompts(mcp);
  const dejarDeVigilar = vigilarCapas(mcp);
  const alCerrar = mcp.server.onclose;
  mcp.server.onclose = () => {
    dejarDeVigilar();
    alCerrar?.();
  };

  return mcp;
}

function registrarTools(mcp: McpServer): void {
  // Tras cada llamada a una tool se sincronizan los prompts /fN. Leer las carpetas de prompts
  // cuesta milisegundos, y es lo único que garantiza que una fase nueva aparezca en OneDrive,
  // donde fs.watch no avisa.
  const sincronizandoTras =
    <A extends unknown[], R>(callback: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await callback(...args);
      } finally {
        sincronizarPrompts(mcp);
      }
    };

  // start_task no es destructiva (se niega a pisar una tarea) ni idempotente (la segunda llamada falla).
  mcp.registerTool(
    "start_task",
    {
      title: "Iniciar tarea",
      description:
        "Inicia una tarea NUEVA creando su carpeta en la Documentación Central y guardando el contexto inicial. " +
        "Para volver a una tarea que ya existe usa 'switch_task': start_task reescribiría su contexto inicial.",
      inputSchema: startTaskShape,
      annotations: anotaciones("Iniciar tarea", false, false, false),
    },
    sincronizandoTras(async (entrada, extra) => {
      const args = sinNulos(entrada);
      const taskName = args.task_name;

      // Sin project, el de la carpeta abierta. Un proyecto nuevo no se deduce: estrenarlo exige
      // decir su nombre.
      if (!args.project && args.crear_proyecto === true) {
        throw new Error("Para estrenar un proyecto, indica su nombre en `project`.");
      }
      const { nombre: proj, deducido } = await proyectoDeLaLlamada(mcp, args.project); // el schema ya le quitó los espacios

      // Estrenar proyecto tiene que ser deliberado: sin esta puerta, un nombre mal escrito
      // creaba una carpeta suelta en la Documentación y nadie se enteraba hasta buscarla.
      let carpetaProyecto = findProjectFolder(proj);
      let estrenado = false;

      if (!carpetaProyecto) {
        if (args.crear_proyecto !== true) {
          throw new Error(
            `No existe el proyecto "${proj}". Los proyectos disponibles son: ${describeProjects()}. ` +
              `Si el usuario te confirmó que quiere estrenar el proyecto "${proj.toUpperCase()}", ` +
              `vuelve a llamar a start_task con crear_proyecto: true.`
          );
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
      const cabecera = cabeceraDeTarea(carpetaProyecto, estrenado, args.repos, args.preset);

      const docsBase = requireBasePath(DOCS);
      if (!estaDentroReal(docsBase, carpetaTarea)) {
        throw new Error(`Acceso denegado: la carpeta de la tarea queda fuera de ${docsBase}.`);
      }

      // Estrenar un proyecto se le confirma a la persona si el cliente puede preguntarle. Sin
      // crear_proyecto no se pregunta nada: ofrecer "¿lo creo?" ante un nombre desconocido
      // invitaría a aceptar un typo con un clic.
      if (estrenado) {
        const { estado, nota } = await pedirConfirmacion(mcp, extra, {
          mensaje: `¿Estrenar el proyecto «${carpetaProyecto}»? Se creará la carpeta \`${path.join(docsBase, carpetaProyecto)}\`.`,
          etiqueta: `Crear el proyecto ${carpetaProyecto}`,
        });
        if (estado === "rechazada") {
          throw new Error(`El usuario no confirmó el proyecto nuevo. No se creó nada.${nota ? ` ${nota}` : ""}`);
        }
      }

      // start_task escribe el contexto inicial sin preguntar, así que llamarlo sobre una tarea
      // que ya existe borraba el requerimiento original — el único documento que no se puede
      // regenerar leyendo el código. Retomar una tarea es switch_task, que no toca archivos.
      if (fs.existsSync(contextoInicial)) {
        throw new Error(
          `La tarea "${taskName}" ya existe en ${carpetaProyecto} y start_task reescribiría su ` +
            `contexto inicial. Si quieres retomarla, usa switch_task. Si de verdad quieres ` +
            `empezar de cero, borra o renombra la carpeta primero: ${carpetaTarea}`
        );
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

      const aviso = estrenado ? `\nProyecto "${carpetaProyecto}" estrenado.` : "";

      return responder(
        `Tarea '${taskName}' inicializada correctamente. Archivo guardado en: ${contextoInicial}\n` +
          `Tarea activa de ${carpetaProyecto}: ${taskName}.${aviso}${deducido ? `\n${deducido}` : ""}`
      );
    })
  );

  mcp.registerTool(
    "get_phase_prompt",
    {
      title: "Prompt de fase",
      description:
        "Obtiene el prompt maestro de comportamiento de una fase. Comprueba además que no te estés saltando una " +
        "fase: si faltan documentos anteriores, el prompt llega con un aviso al principio.",
      inputSchema: getPhasePromptShape,
      annotations: anotaciones("Prompt de fase", true, false, true),
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
      const delPrompt = project ?? carpetaProyecto;
      const opciones = { ...(delPrompt ? { project: delPrompt } : {}), ...(task_name ? { taskName: task_name } : {}) };

      // La compuerta avisa, no bloquea: el prompt se entrega siempre. Si comprobarla fallara
      // por lo que sea, entregarlo igual es mejor que dejar al usuario sin fase por un aviso.
      // Lo mismo con la lista de recibos: es una ayuda, no una condición.
      let aviso: string | null = null;
      let pendientes: string | null = null;
      let recibos: string | null = null;
      let carpetaTarea: string | null = null;
      try {
        aviso = avisoDeCompuerta(phase, fasesDe, opciones);

        const resuelta = resolverTareaDelPrompt(fasesDe, opciones);
        if (resuelta && resuelta !== "ambigua") {
          pendientes = avisoDePendientes(phase, resuelta.estado, resuelta.phases);
          recibos = bloqueDeRecibos(phase, resuelta.estado, resuelta.phases);
          // La tarea aporta su preset si declara uno en su contexto inicial.
          if (carpetaProyecto && resuelta.carpetaProyecto === carpetaProyecto) carpetaTarea = resuelta.estado.folderPath;
        }
      } catch (error) {
        log("warning", `No se pudo comprobar la compuerta: ${mensajeDe(error)}`);
      }

      // Un manifiesto o un preset mal escrito sí es un error: entregar el prompt de fábrica en su
      // lugar sería el fallo silencioso que el manifiesto evita.
      const columnas = carpetaProyecto ? await columnasDeGit(carpetaProyecto, carpetaTarea) : new Map<string, string>();
      const ensamblado = ensamblarFase(phase, carpetaProyecto, carpetaTarea, { estadoDeRepo: (repo) => columnas.get(repo.id) ?? null });
      const notas = ensamblado.avisos.filter((h) => h.codigo === "BLOQUE-HUERFANO").map(notaDeHuerfano);
      for (const h of ensamblado.avisos) if (h.codigo !== "BLOQUE-HUERFANO") log("warning", h.texto);

      // Lo que el modelo tiene que leer antes de nada va delante: el salto de fase y los pendientes.
      return responder([deducido, aviso, pendientes, notas.join("\n") || null, ensamblado.texto, recibos].filter(Boolean).join("\n\n"));
    })
  );

  mcp.registerTool(
    "get_active_task",
    {
      title: "Tarea activa",
      description:
        "Devuelve la tarea activa y en qué fase va, deducida de los documentos que ya tiene. Úsalo al iniciar un " +
        "chat nuevo o si perdiste el contexto. Sin 'project' devuelve la activa de CADA proyecto.",
      inputSchema: getActiveTaskShape,
      annotations: anotaciones("Tarea activa", true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const pedido = sinNulos(entrada).project ?? "";

      // Con proyecto: la suya. Sin proyecto: la de cada uno. Antes había un único puntero
      // global y responder "la activa" a secas obligaba a adivinar cuál de dos ventanas
      // preguntaba; listar todas es la respuesta honesta cuando no se sabe.
      const proyectos = pedido ? [requireProjectFolder(pedido)] : [...discoverProjects().values()].sort();

      if (proyectos.length === 0) {
        return responder("No hay ningún proyecto en la Documentación Central todavía.");
      }

      const bloques: string[] = [];

      for (const carpetaProyecto of proyectos) {
        const phases = fasesDelListado(carpetaProyecto, Boolean(pedido), bloques);
        if (!phases) continue;
        const activa = tareaActiva(carpetaProyecto, phases);

        if (!activa) {
          bloques.push(`${carpetaProyecto}: sin tareas todavía.`);
          continue;
        }

        const nota =
          activa.origen === "deducida"
            ? " (deducida por ser la más reciente: no había puntero guardado, confírmalo antes de escribir)"
            : "";

        bloques.push(
          `${carpetaProyecto}: ${activa.estado.taskName}${nota}\n` +
            `  Fase: ${describeEstado(activa.estado, phases)}\n` +
            `  Carpeta: ${activa.estado.folderPath}`
        );
      }

      return responder(`${bloques.join("\n\n")}\n\nPunteros guardados en: ${stateFile()}`);
    })
  );

  mcp.registerTool(
    "list_tasks",
    {
      title: "Listar tareas",
      description:
        "Lista las tareas que existen y la fase en la que va cada una. Úsalo para retomar una tarea vieja o para " +
        "saber qué hay pendiente.",
      inputSchema: listTasksShape,
      annotations: anotaciones("Listar tareas", true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const pedido = sinNulos(entrada).project ?? "";

      const proyectos = pedido ? [requireProjectFolder(pedido)] : [...discoverProjects().values()].sort();

      const bloques: string[] = [];

      for (const carpetaProyecto of proyectos) {
        const phases = fasesDelListado(carpetaProyecto, Boolean(pedido), bloques);
        if (!phases) continue;
        const tareas = listarTareas(carpetaProyecto, phases);
        const activa = tareaActiva(carpetaProyecto, phases);

        if (tareas.length === 0) {
          bloques.push(`${carpetaProyecto}: sin tareas.`);
          continue;
        }

        const lineas = tareas.map((tarea) => {
          const marca = tarea.taskName === activa?.estado.taskName ? " [activa]" : "";
          return `${lineaDeTarea(tarea, phases)}${marca}`;
        });

        bloques.push(`${carpetaProyecto} (${tareas.length}), de la más reciente a la más antigua:\n${lineas.join("\n")}`);
      }

      return responder(bloques.join("\n\n") || "No hay proyectos todavía.");
    })
  );

  // Escribe el puntero, así que no es de solo lectura; pero repetirla da el mismo estado.
  mcp.registerTool(
    "switch_task",
    {
      title: "Cambiar de tarea activa",
      description:
        "Cambia cuál es la tarea activa de un proyecto, sin tocar ningún archivo. Es la forma correcta de " +
        "retomar una tarea que ya existe.",
      inputSchema: switchTaskShape,
      annotations: anotaciones("Cambiar de tarea activa", false, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      const { nombre, deducido } = await proyectoDeLaLlamada(mcp, args.project);
      const carpetaProyecto = requireProjectFolder(nombre);
      const phases = fasesDe(carpetaProyecto);
      const taskName = args.task_name;

      const tareas = listarTareas(carpetaProyecto, phases);
      const encontrada = tareas.find((tarea) => tarea.taskName === taskName);

      if (!encontrada) {
        const disponibles = tareas.length ? tareas.map((tarea) => `"${tarea.taskName}"`).join(", ") : "(ninguna)";
        throw new Error(
          `No existe la tarea "${taskName}" en ${carpetaProyecto}. Las que hay son: ${disponibles}. ` +
            `Si es una tarea nueva, créala con start_task.`
        );
      }

      guardarPuntero(carpetaProyecto, taskName);
      mcp.sendResourceListChanged();

      return responder(
        `Tarea activa de ${carpetaProyecto}: ${taskName}.\nFase: ${describeEstado(encontrada, phases)}\n` +
          `Carpeta: ${encontrada.folderPath}${deducido ? `\n${deducido}` : ""}`
      );
    })
  );

  mcp.registerTool(
    "read_central_doc",
    {
      title: "Leer documento",
      description:
        "Lee un archivo de la Documentación Central. RECOMENDADO: pasa 'project' + 'task_name' + 'file_name' y el " +
        "servidor arma la ruta correcta automáticamente (<PROYECTO>/<subcarpeta de tareas>/<tarea>/<archivo>). " +
        "Alternativamente puedes pasar 'file_path' relativo a la Documentación Central.",
      inputSchema: readCentralDocShape,
      annotations: anotaciones("Leer documento", true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const docsBase = requireBasePath(DOCS);
      const { args, deducido } = await conProyecto(mcp, sinNulos(entrada));
      const fullPath = resolveDocPath(args);

      if (!estaDentroReal(docsBase, fullPath)) {
        throw new Error(`Acceso denegado: la ruta queda fuera de ${docsBase}.`);
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
      title: "Escribir documento",
      description:
        "Escribe o sobrescribe un archivo en la Documentación Central. RECOMENDADO: pasa 'project' + 'task_name' + " +
        "'file_name' y el servidor arma la ruta correcta automáticamente " +
        "(<PROYECTO>/<subcarpeta de tareas>/<tarea>/<archivo>). Alternativamente puedes pasar 'file_path' relativo " +
        "a la Documentación Central.",
      inputSchema: writeCentralDocShape,
      annotations: anotaciones("Escribir documento", false, true, true),
    },
    sincronizandoTras(async (entrada, extra) => {
      const docsBase = requireBasePath(DOCS);
      const { args, deducido } = await conProyecto(mcp, sinNulos(entrada));
      const fullPath = resolveDocPath(args);

      if (!estaDentroReal(docsBase, fullPath)) {
        throw new Error(`Acceso denegado: la ruta queda fuera de ${docsBase}.`);
      }

      // Antes del mkdir: con una tarea mal escrita, el mkdir recursivo creaba su carpeta.
      const ubicacion = ubicarEnTarea(fullPath);
      if (!ubicacion) {
        throw new Error(
          "write_central_doc solo escribe dentro de la carpeta de una tarea que ya existe " +
            "(<DOCS>/<PROYECTO>/<subcarpeta de tareas>/<tarea>/). Los archivos del proyecto, como " +
            "phase-gate.json, no se escriben con esta tool. Para una tarea nueva, usa start_task."
        );
      }

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
        const { estado, nota } = await pedirConfirmacion(mcp, extra, {
          mensaje:
            `\`${archivo}\` de la tarea «${ubicacion.taskName}» está protegido: ${motivo.replace(/\.$/, "")}. ` +
            (existia ? "¿Reescribirlo?" : "¿Crearlo?"),
          etiqueta: `${existia ? "Reescribir" : "Crear"} ${archivo}`,
        });
        const conNota = nota ? ` ${nota}` : "";

        if (estado === "rechazada") {
          const accion = existia ? "la reescritura" : "la escritura";
          throw new Error(`El usuario no confirmó ${accion} de \`${archivo}\`. No se escribió nada.${conNota}`);
        }
        if (estado === "no-disponible" && args.force !== true) {
          throw new Error(
            `${motivo} Si de verdad hay que reescribirlo, pídele al usuario confirmación explícita ` +
              `y vuelve a llamar con force: true.${conNota}`
          );
        }

        // force también crea el contexto inicial cuando falta: no se dice "sobrescrito" si no lo era.
        sufijo =
          estado === "confirmada"
            ? existia
              ? " (reescrito con confirmación del usuario)"
              : " (creado con confirmación del usuario)"
            : existia
              ? " (sobrescrito con force)"
              : " (creado con force)";
        if (nota) sufijo += `\n${nota}`;
      }

      // Si el cliente canceló la llamada mientras se esperaba algo (una confirmación), ya no
      // escucha la respuesta: escribir ahora dejaría un archivo que el modelo cree que no existe.
      siCancelada(extra);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, args.content, "utf-8");

      // Un archivo nuevo puede ser un documento o un recibo que se lista como recurso. Reescribir
      // uno que ya existía no cambia la lista.
      if (!existia) mcp.sendResourceListChanged();

      return responder(`Archivo escrito exitosamente en ${fullPath}${sufijo}${deducido ? `\n${deducido}` : ""}`);
    })
  );

  // La misma radiografía que `npx mcp-phase-gate doctor`, más lo que solo se sabe desde dentro de
  // una sesión: qué cliente está conectado y qué capacidades anunció.
  mcp.registerTool(
    "get_orchestrator_status",
    {
      title: "Estado de la instalación",
      description:
        "Radiografía de la instalación: versión y ruta del paquete, variables y de dónde salió cada una, qué " +
        "archivo de prompt gana en cada fase, configuración (machine.json y presets), proyectos con su tarea activa, " +
        "manifiesto, preset, reglas y repos, y avisos. Úsala cuando algo no se comporte como esperas.",
      inputSchema: getOrchestratorStatusShape,
      outputSchema: diagnosticoShape,
      annotations: anotaciones("Estado de la instalación", true, false, true),
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
      title: "Leer archivo de repositorio",
      description:
        "Lee un archivo de cualquier carpeta dentro de PHASE_GATE_REPOS_PATH. Si el proyecto declara repos en " +
        "phase-gate.json, usa read_repo_file.",
      inputSchema: readCrossRepoShape,
      annotations: anotaciones("Leer archivo de repositorio", true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      return responder(leerTextoAcotado(resolveRepoPath(args.repo_name, args.file_path)));
    })
  );

  mcp.registerTool(
    "read_repo_file",
    {
      title: "Leer archivo de un repo del proyecto",
      description:
        "Lee un archivo de uno de los repos que declara el phase-gate.json del proyecto, por su id, esté donde esté " +
        "en este equipo. No lee nada de .git.",
      inputSchema: readRepoFileShape,
      annotations: anotaciones("Leer archivo de un repo del proyecto", true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      const { nombre, deducido } = await proyectoDeLaLlamada(mcp, args.project);
      const resultado = responder(leerArchivoDeRepo(requireProjectFolder(nombre), args.repo, args.path));
      if (deducido) resultado.content.push({ type: "text", text: deducido });
      return resultado;
    })
  );

  mcp.registerTool(
    "repo_status",
    {
      title: "Estado de git de los repos",
      description:
        "Rama, commit, adelante/atrás de su upstream y si el árbol está limpio, de un repo del proyecto o de todos los " +
        "de la tarea activa. Solo lee: no toma locks ni ejecuta comandos del repo (core.fsmonitor, filtros de .gitattributes).",
      inputSchema: repoStatusShape,
      outputSchema: repoStatusSalidaShape,
      annotations: anotaciones("Estado de git de los repos", true, false, true),
    },
    sincronizandoTras(async (entrada) => {
      const args = sinNulos(entrada);
      const { nombre, deducido } = await proyectoDeLaLlamada(mcp, args.project);
      const carpetaProyecto = requireProjectFolder(nombre);

      let repos: RepoResuelto[];
      let titulo: string;
      if (args.repo) {
        repos = [resolverRepo(carpetaProyecto, args.repo)];
        titulo = `Repo \`${args.repo}\` de ${carpetaProyecto}:`;
      } else {
        const activa = tareaActiva(carpetaProyecto, fasesDe(carpetaProyecto));
        repos = reposDeLaTarea(configuracionDe(carpetaProyecto, activa?.estado.folderPath ?? null));
        if (repos.length === 0) {
          throw new Error(`El proyecto ${carpetaProyecto} no declara repos en su phase-gate.json.`);
        }
        titulo = activa ? `Repos de la tarea «${activa.estado.taskName}» de ${carpetaProyecto}:` : `Repos de ${carpetaProyecto}:`;
      }

      const estados = await Promise.all(repos.map((repo) => estadoDeRepo(repo)));
      const texto = [titulo, ...estados.map((estado) => `- ${lineaDeEstado(estado)}`), ...(deducido ? ["", deducido] : [])].join("\n");
      return { content: [{ type: "text", text: texto }], structuredContent: { proyecto: carpetaProyecto, repos: estados } };
    })
  );
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
