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
import { discoverPhases, loadPhasePrompt, nombreContextoInicial } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import {
  getActiveTaskShape,
  getPhasePromptShape,
  listTasksShape,
  readCentralDocShape,
  readCrossRepoShape,
  sinNulos,
  startTaskShape,
  switchTaskShape,
  writeCentralDocShape,
} from "./schemas.js";
import {
  avisoDeCompuerta,
  bloqueDeRecibos,
  describeEstado,
  guardarPuntero,
  listarTareas,
  motivoDeProteccion,
  tareaActiva,
  tareaDelPrompt,
} from "./tasks.js";
import type { EstadoTarea } from "./tasks.js";

function responder(texto: string): CallToolResult {
  return { content: [{ type: "text", text: texto }] };
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
  registrarTools(mcp);

  return mcp;
}

function registrarTools(mcp: McpServer): void {
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
    async (entrada) => {
      const args = sinNulos(entrada);
      const proj = args.project; // el schema ya le quitó los espacios
      const taskName = args.task_name;

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
      const contextoInicial = path.join(carpetaTarea, nombreContextoInicial());

      const docsBase = requireBasePath(DOCS);
      if (!estaDentroReal(docsBase, carpetaTarea)) {
        throw new Error(`Acceso denegado: la carpeta de la tarea queda fuera de ${docsBase}.`);
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

      if (!fs.existsSync(carpetaTarea)) {
        fs.mkdirSync(carpetaTarea, { recursive: true });
      }

      fs.writeFileSync(contextoInicial, args.initial_context, "utf-8");

      // Queda como activa de SU proyecto. Otra ventana trabajando en otro proyecto conserva
      // la suya: los punteros son independientes.
      guardarPuntero(carpetaProyecto, taskName);

      const aviso = estrenado ? `\nProyecto "${carpetaProyecto}" estrenado.` : "";

      return responder(
        `Tarea '${taskName}' inicializada correctamente. Archivo guardado en: ${contextoInicial}\n` +
          `Tarea activa de ${carpetaProyecto}: ${taskName}.${aviso}`
      );
    }
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
    async (entrada) => {
      // Que sea un entero ya lo garantiza el schema; si la fase no existe, lo dice loadPhasePrompt.
      const { phase, project, task_name } = sinNulos(entrada);
      const prompt = loadPhasePrompt(phase);

      // La compuerta avisa, no bloquea: el prompt se entrega siempre. Si comprobarla fallara
      // por lo que sea, entregarlo igual es mejor que dejar al usuario sin fase por un aviso.
      // Lo mismo con la lista de recibos: es una ayuda, no una condición.
      let aviso: string | null = null;
      let recibos: string | null = null;
      try {
        const phases = discoverPhases();
        const opciones = { ...(project ? { project } : {}), ...(task_name ? { taskName: task_name } : {}) };
        aviso = avisoDeCompuerta(phase, phases, opciones);

        const estado = tareaDelPrompt(phases, opciones);
        if (estado && estado !== "ambigua") recibos = bloqueDeRecibos(phase, estado, phases);
      } catch (error) {
        log("warning", `No se pudo comprobar la compuerta: ${error instanceof Error ? error.message : String(error)}`);
      }

      return responder([aviso, prompt, recibos].filter(Boolean).join("\n\n"));
    }
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
    async (entrada) => {
      const phases = discoverPhases();
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
    }
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
    async (entrada) => {
      const phases = discoverPhases();
      const pedido = sinNulos(entrada).project ?? "";

      const proyectos = pedido ? [requireProjectFolder(pedido)] : [...discoverProjects().values()].sort();

      const bloques: string[] = [];

      for (const carpetaProyecto of proyectos) {
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
    }
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
    async (entrada) => {
      const args = sinNulos(entrada);
      const phases = discoverPhases();
      const carpetaProyecto = requireProjectFolder(args.project);
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

      return responder(
        `Tarea activa de ${carpetaProyecto}: ${taskName}.\nFase: ${describeEstado(encontrada, phases)}\n` +
          `Carpeta: ${encontrada.folderPath}`
      );
    }
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
    async (entrada) => {
      const docsBase = requireBasePath(DOCS);
      const fullPath = resolveDocPath(sinNulos(entrada));

      if (!estaDentroReal(docsBase, fullPath)) {
        throw new Error(`Acceso denegado: la ruta queda fuera de ${docsBase}.`);
      }

      return responder(leerTextoAcotado(fullPath));
    }
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
    async (entrada) => {
      const args = sinNulos(entrada);
      const docsBase = requireBasePath(DOCS);
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

      const motivo = motivoDeProteccion(
        ubicacion.carpetaTarea,
        ubicacion.relativo,
        discoverPhases(),
        nombreContextoInicial()
      );
      if (motivo && args.force !== true) {
        throw new Error(
          `${motivo} Si de verdad hay que reescribirlo, pídele al usuario confirmación explícita ` +
            `y vuelve a llamar con force: true.`
        );
      }

      const existia = fs.existsSync(fullPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, args.content, "utf-8");

      // force también crea el contexto inicial cuando falta: no se dice "sobrescrito" si no lo era.
      const forzado = motivo ? (existia ? " (sobrescrito con force)" : " (creado con force)") : "";
      return responder(`Archivo escrito exitosamente en ${fullPath}${forzado}`);
    }
  );

  mcp.registerTool(
    "read_cross_repo",
    {
      title: "Leer archivo de repositorio",
      description:
        "Lee archivos de otros repositorios locales, dentro de la carpeta configurada en PHASE_GATE_REPOS_PATH.",
      inputSchema: readCrossRepoShape,
      annotations: anotaciones("Leer archivo de repositorio", true, false, true),
    },
    async (entrada) => {
      const args = sinNulos(entrada);
      return responder(leerTextoAcotado(resolveRepoPath(args.repo_name, args.file_path)));
    }
  );
}
