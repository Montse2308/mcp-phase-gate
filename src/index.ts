#!/usr/bin/env node
// El shebang es lo que vuelve ejecutable este archivo como `bin` del paquete. Sin él,
// `npx mcp-phase-gate` falla en Linux y macOS: el sistema no sabe con qué interpretarlo.
//
// Servidor MCP: define las tools y las conecta con la lógica de los demás módulos.
// Aquí no se calcula nada — las rutas viven en paths.ts, las fases en phases.ts y las
// tareas en tasks.ts. Este archivo solo traduce entre el protocolo y esas funciones.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";

import { DOCS, REPOS, SERVER_NAME, SERVER_VERSION, requireBasePath, stateFile } from "./config.js";
import {
  describeProjects,
  discoverProjects,
  estaDentro,
  findProjectFolder,
  requireProjectFolder,
  resolveDocPath,
  taskFolderPath,
} from "./paths.js";
import {
  describePhases,
  discoverPhases,
  loadPhasePrompt,
  nombreContextoInicial,
} from "./phases.js";
import {
  avisoDeCompuerta,
  describeEstado,
  guardarPuntero,
  limpiarEstadoViejo,
  listarTareas,
  tareaActiva,
} from "./tasks.js";
import type { EstadoTarea } from "./tasks.js";
import type { PhaseFile } from "./phases.js";

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// La lista de tools es estática, así que estas descripciones se arman una sola vez al
// arrancar. La de proyectos puede quedarse vieja si creas una carpeta con el cliente abierto:
// es orientativa, y la lista que manda es la que devuelven las tools al rechazar un proyecto.
const PHASES_DESCRIPTION = describePhases();
const PROJECTS_DESCRIPTION = describeProjects();

// ─── Formato de las respuestas de tarea ─────────────────────────────────────
function lineaDeTarea(estado: EstadoTarea, phases: Map<number, PhaseFile>): string {
  return `- ${estado.taskName} — ${describeEstado(estado, phases)}`;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "start_task",
        description: "Inicia una tarea NUEVA creando su carpeta en la Documentación Central y guardando el contexto inicial. Para volver a una tarea que ya existe usa 'switch_task': start_task reescribiría su contexto inicial.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: `Proyecto. Tiene que ser uno de los que ya existen: ${PROJECTS_DESCRIPTION}. Si no lo es, la tool te devuelve la lista actualizada.` },
            task_name: { type: "string", description: "Nombre de la tarea (creará una carpeta con este nombre)" },
            initial_context: { type: "string", description: "El contexto, correo o requerimiento inicial completo" },
            crear_proyecto: { type: "boolean", description: "Solo para ESTRENAR un proyecto que todavía no existe. Déjalo sin poner salvo que el usuario te haya dicho explícitamente que quiere crear un proyecto nuevo: sirve para que un nombre mal escrito no cree una carpeta suelta en la Documentación." }
          },
          required: ["project", "task_name", "initial_context"],
        },
      },
      {
        name: "get_phase_prompt",
        description: `Obtiene el prompt maestro de comportamiento según la fase. Fases disponibles — ${PHASES_DESCRIPTION}. Comprueba además que no te estés saltando una fase: si faltan documentos anteriores, el prompt llega con un aviso al principio.`,
        inputSchema: {
          type: "object",
          properties: {
            phase: { type: "number", description: `Número de la fase. Disponibles: ${PHASES_DESCRIPTION}.` },
            project: { type: "string", description: `Proyecto en el que estás trabajando: ${PROJECTS_DESCRIPTION}. Pásalo siempre que lo sepas —lo sabes por el repositorio que tienes abierto— para que se pueda comprobar que no te saltas una fase. La tarea se toma de la activa de ese proyecto.` },
            task_name: { type: "string", description: "Solo si quieres comprobar contra una tarea distinta de la activa del proyecto. Normalmente se omite." }
          },
          required: ["phase"],
        },
      },
      {
        name: "get_active_task",
        description: "Devuelve la tarea activa y en qué fase va, deducida de los documentos que ya tiene. Úsalo al iniciar un chat nuevo o si perdiste el contexto. Sin 'project' devuelve la activa de CADA proyecto.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: `Proyecto del que quieres la tarea activa: ${PROJECTS_DESCRIPTION}. Si lo omites, se listan las de todos los proyectos.` }
          },
        },
      },
      {
        name: "list_tasks",
        description: "Lista las tareas que existen y la fase en la que va cada una. Úsalo para retomar una tarea vieja o para saber qué hay pendiente.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: `Proyecto a listar: ${PROJECTS_DESCRIPTION}. Si lo omites, se listan todos.` }
          },
        },
      },
      {
        name: "switch_task",
        description: "Cambia cuál es la tarea activa de un proyecto, sin tocar ningún archivo. Es la forma correcta de retomar una tarea que ya existe.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: `Proyecto de la tarea: ${PROJECTS_DESCRIPTION}.` },
            task_name: { type: "string", description: "Nombre de la carpeta de la tarea a activar. Si no existe, la tool te devuelve las que sí." }
          },
          required: ["project", "task_name"],
        },
      },
      {
        name: "read_central_doc",
        description: "Lee un archivo de la Documentación Central. RECOMENDADO: pasa 'project' + 'task_name' + 'file_name' y el servidor arma la ruta correcta automáticamente (<PROYECTO>/Proyectos/<tarea>/<archivo>). Alternativamente puedes pasar 'file_path' relativo a DOCUMENTACIÓN.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: `Proyecto, uno de los existentes: ${PROJECTS_DESCRIPTION}. Úsalo junto con task_name y file_name.` },
            task_name: { type: "string", description: "Nombre de la carpeta de la tarea." },
            file_name: { type: "string", description: "Nombre (o ruta relativa) del archivo dentro de la carpeta de la tarea (ej. '01 - Análisis Técnico.md')." },
            file_path: { type: "string", description: "ALTERNATIVA: ruta relativa dentro de DOCUMENTACIÓN (ej. 'PROYECTO-A/Proyectos/tarea/01-analisis.md'). Solo si no usas project+task_name." }
          },
        },
      },
      {
        name: "write_central_doc",
        description: "Escribe o sobrescribe un archivo en la Documentación Central. RECOMENDADO: pasa 'project' + 'task_name' + 'file_name' y el servidor arma la ruta correcta automáticamente (<PROYECTO>/Proyectos/<tarea>/<archivo>). Alternativamente puedes pasar 'file_path' relativo a DOCUMENTACIÓN.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: `Proyecto, uno de los existentes: ${PROJECTS_DESCRIPTION}. Úsalo junto con task_name y file_name.` },
            task_name: { type: "string", description: "Nombre de la carpeta de la tarea." },
            file_name: { type: "string", description: "Nombre (o ruta relativa) del archivo dentro de la carpeta de la tarea (ej. '01 - Análisis Técnico.md')." },
            file_path: { type: "string", description: "ALTERNATIVA: ruta relativa dentro de DOCUMENTACIÓN. Solo si no usas project+task_name." },
            content: { type: "string", description: "Contenido a escribir" }
          },
          required: ["content"],
        },
      },
      {
        name: "read_cross_repo",
        description: "Lee archivos de otros repositorios locales, dentro de la carpeta configurada en ORQUESTADOR_REPOS_PATH.",
        inputSchema: {
          type: "object",
          properties: {
            repo_name: { type: "string", description: "Nombre del repositorio (ej. 'repo-a', 'repo-b')" },
            file_path: { type: "string", description: "Ruta relativa del archivo dentro del repositorio (ej. 'src/main.ts')" }
          },
          required: ["repo_name", "file_path"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "start_task") {
      const proj = String(args?.project).trim();
      const taskName = String(args?.task_name);
      const context = String(args?.initial_context);

      // Estrenar proyecto tiene que ser deliberado: sin esta puerta, un nombre mal escrito
      // creaba una carpeta suelta en la Documentación y nadie se enteraba hasta buscarla.
      let carpetaProyecto = findProjectFolder(proj);
      let estrenado = false;

      if (!carpetaProyecto) {
        if (args?.crear_proyecto !== true) {
          throw new Error(
            `No existe el proyecto "${proj}". Los proyectos disponibles son: ${describeProjects()}. ` +
              `Si el usuario te confirmó que quiere estrenar el proyecto "${proj.toUpperCase()}", ` +
              `vuelve a llamar a start_task con crear_proyecto: true.`
          );
        }
        carpetaProyecto = proj.toUpperCase();
        estrenado = true;
      }

      const carpetaTarea = taskFolderPath(carpetaProyecto, taskName);
      const contextoInicial = path.join(carpetaTarea, nombreContextoInicial());

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

      fs.writeFileSync(contextoInicial, context, "utf-8");

      // Queda como activa de SU proyecto. Otra ventana trabajando en otro proyecto conserva
      // la suya: los punteros son independientes.
      guardarPuntero(carpetaProyecto, taskName);

      const aviso = estrenado ? `\nProyecto "${carpetaProyecto}" estrenado.` : "";

      return {
        content: [{ type: "text", text: `Tarea '${taskName}' inicializada correctamente. Archivo guardado en: ${contextoInicial}\nTarea activa de ${carpetaProyecto}: ${taskName}.${aviso}` }],
      };
    }

    if (name === "get_phase_prompt") {
      const phase = Number(args?.phase);
      if (!Number.isInteger(phase)) {
        throw new Error(`Debes indicar un número de fase. Disponibles: ${PHASES_DESCRIPTION}.`);
      }

      const prompt = loadPhasePrompt(phase);

      // La compuerta avisa, no bloquea: el prompt se entrega siempre. Si comprobarla fallara
      // por lo que sea, entregarlo igual es mejor que dejar al usuario sin fase por un aviso.
      let aviso: string | null = null;
      try {
        aviso = avisoDeCompuerta(phase, discoverPhases(), {
          ...(args?.project ? { project: String(args.project) } : {}),
          ...(args?.task_name ? { taskName: String(args.task_name) } : {}),
        });
      } catch (error: any) {
        console.error(`[orquestador] No se pudo comprobar la compuerta: ${error.message}`);
      }

      return {
        content: [{ type: "text", text: aviso ? `${aviso}\n\n${prompt}` : prompt }],
      };
    }

    if (name === "get_active_task") {
      const phases = discoverPhases();
      const pedido = args?.project ? String(args.project) : "";

      // Con proyecto: la suya. Sin proyecto: la de cada uno. Antes había un único puntero
      // global y responder "la activa" a secas obligaba a adivinar cuál de dos ventanas
      // preguntaba; listar todas es la respuesta honesta cuando no se sabe.
      const proyectos = pedido
        ? [requireProjectFolder(pedido)]
        : [...discoverProjects().values()].sort();

      if (proyectos.length === 0) {
        return { content: [{ type: "text", text: `No hay ningún proyecto en la Documentación Central todavía.` }] };
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

      return {
        content: [{ type: "text", text: `${bloques.join("\n\n")}\n\nPunteros guardados en: ${stateFile()}` }],
      };
    }

    if (name === "list_tasks") {
      const phases = discoverPhases();
      const pedido = args?.project ? String(args.project) : "";

      const proyectos = pedido
        ? [requireProjectFolder(pedido)]
        : [...discoverProjects().values()].sort();

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

      return {
        content: [{ type: "text", text: bloques.join("\n\n") || "No hay proyectos todavía." }],
      };
    }

    if (name === "switch_task") {
      const phases = discoverPhases();
      const carpetaProyecto = requireProjectFolder(String(args?.project));
      const taskName = String(args?.task_name);

      const tareas = listarTareas(carpetaProyecto, phases);
      const encontrada = tareas.find((tarea) => tarea.taskName === taskName);

      if (!encontrada) {
        const disponibles = tareas.length
          ? tareas.map((tarea) => `"${tarea.taskName}"`).join(", ")
          : "(ninguna)";
        throw new Error(
          `No existe la tarea "${taskName}" en ${carpetaProyecto}. Las que hay son: ${disponibles}. ` +
            `Si es una tarea nueva, créala con start_task.`
        );
      }

      guardarPuntero(carpetaProyecto, taskName);

      return {
        content: [{ type: "text", text: `Tarea activa de ${carpetaProyecto}: ${taskName}.\nFase: ${describeEstado(encontrada, phases)}\nCarpeta: ${encontrada.folderPath}` }],
      };
    }

    if (name === "read_central_doc") {
      const docsBase = requireBasePath(DOCS);
      const fullPath = resolveDocPath(args);

      if (!estaDentro(docsBase, fullPath)) {
        throw new Error(`Acceso denegado: la ruta queda fuera de ${docsBase}.`);
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    }

    if (name === "write_central_doc") {
      const content = String(args?.content);
      const docsBase = requireBasePath(DOCS);
      const fullPath = resolveDocPath(args);

      if (!estaDentro(docsBase, fullPath)) {
        throw new Error(`Acceso denegado: la ruta queda fuera de ${docsBase}.`);
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");

      return {
        content: [{ type: "text", text: `Archivo escrito exitosamente en ${fullPath}` }],
      };
    }

    if (name === "read_cross_repo") {
      const repoName = String(args?.repo_name);
      const filePath = String(args?.file_path);
      const reposBase = requireBasePath(REPOS);
      const fullPath = path.join(reposBase, repoName, filePath);

      if (!estaDentro(reposBase, fullPath)) {
        throw new Error(`Acceso denegado: la ruta queda fuera de ${reposBase}.`);
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error ejecutando tool ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// Deja en el log el estado de cada ruta al arrancar. No aborta: el servidor sigue en pie y
// el error real se entrega al llamar la tool. Esto es solo para que, cuando alguien acabe
// abriendo el log, el motivo ya esté ahí escrito.
function reportarRutas(): void {
  for (const requerida of [DOCS, REPOS]) {
    try {
      console.error(`[orquestador] ${requerida.variable} = ${requireBasePath(requerida)}`);
    } catch (error: any) {
      console.error(`[orquestador] SIN CONFIGURAR: ${error.message}`);
    }
  }
}

// Un servidor MCP habla JSON-RPC por stdin y no imprime nada por stdout. Ejecutado a mano en
// una terminal —que es exactamente lo que hace quien acaba de leer `npx mcp-phase-gate` en el
// README— se queda esperando entrada, sin señal de vida, y parece roto. Estas dos banderas
// existen para que ese momento devuelva una explicación en vez de un cursor parpadeando.
const AYUDA = `${SERVER_NAME} v${SERVER_VERSION}

Servidor MCP que parte cada requerimiento en cinco fases con compuerta y obliga a que cada
una deje su documento en una documentación central.

Esto NO se ejecuta a mano: lo lanza tu cliente MCP. Ejecutado directamente se queda esperando
mensajes JSON-RPC por stdin, que es lo que parece que se colgó.

Regístralo en tu cliente (Cursor, VS Code, Claude Code) así:

  {
    "mcpServers": {
      "${SERVER_NAME}": {
        "command": "npx",
        "args": ["-y", "mcp-phase-gate"],
        "env": {
          "ORQUESTADOR_DOCS_PATH": "<tu carpeta de documentación>",
          "ORQUESTADOR_REPOS_PATH": "<tu carpeta de repositorios>"
        }
      }
    }
  }

Variables de entorno:
  ORQUESTADOR_DOCS_PATH      Obligatoria. Raíz de la Documentación Central.
  ORQUESTADOR_REPOS_PATH     Obligatoria. Carpeta con tus repositorios de código.
  ORQUESTADOR_TASKS_SUBDIR   Subcarpeta de tareas dentro de cada proyecto. Por defecto "Proyectos".
  ORQUESTADOR_PROMPTS_PATH   Carpeta de prompts propios, que se superponen a los del paquete.
  ORQUESTADOR_STATE_PATH     Dónde guardar los punteros de tarea activa.

Documentación: https://github.com/Montse2308/mcp-phase-gate`;

async function main() {
  const bandera = process.argv[2];

  if (bandera === "--version" || bandera === "-v") {
    console.log(SERVER_VERSION);
    return;
  }

  if (bandera === "--help" || bandera === "-h") {
    console.log(AYUDA);
    return;
  }

  limpiarEstadoViejo();
  reportarRutas();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} MCP server running on stdio`);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
