import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Carpeta de este módulo. Sirve para localizar el .env de la raíz del repo y el estado local.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga el archivo .env de la raíz del repo (un nivel arriba de build/ o src/).
// Así cada dispositivo define su propia ruta de OneDrive sin tocar el mcp.json.
// quiet: true evita que dotenv v17 imprima su banner en stdout, que es el canal del JSON-RPC.
dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

// Paths absolutos del entorno.
// Son configurables por variable de entorno (vía .env o el bloque "env" del mcp.json)
// para poder usar el MCP en distintos dispositivos sin recompilar.
// Si la variable no está definida, se usa la ruta por defecto de la compu actual.
const DOCS_BASE_PATH =
  process.env.ORQUESTADOR_DOCS_PATH ||
  "C:\\Users\\Usuario general\\OneDrive - Abogados Manuel Solis\\Documentos\\DOCUMENTACIÓN";
const REPOS_BASE_PATH =
  process.env.ORQUESTADOR_REPOS_PATH ||
  "C:\\proyectos";

// Subcarpeta fija donde viven las tareas dentro de cada proyecto (ej. BOS/Proyectos/<tarea>)
const TASKS_SUBDIR = "Proyectos";

// Carpeta con los prompts de las fases, en archivos .md sueltos.
// Vivir fuera del código permite afinar el texto de una fase sin recompilar:
// se edita el .md y la siguiente llamada a get_phase_prompt ya trae la versión nueva.
// Configurable para que alguien más pueda apuntar a su propio juego de prompts sin forkear.
const PROMPTS_PATH =
  process.env.ORQUESTADOR_PROMPTS_PATH ||
  path.join(__dirname, "..", "prompts");

// Archivo de estado para recordar la tarea activa entre chats (Opción B)
const STATE_FILE = path.join(__dirname, "active_task.json");

const server = new Server(
  {
    name: "cursor-mcp-orchestrator",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Mapeo de proyectos a sus rutas de documentación
const PROJECT_DOC_DIRS: Record<string, string> = {
  bos: "BOS",
  crm: "CRM",
  kanban: "KANBAN",
};

// Opción A: la ruta de una tarea SIEMPRE se arma aquí, en un solo lugar.
// Estructura: <DOCS_BASE_PATH>/<PROYECTO>/<TASKS_SUBDIR>/<tarea>
function resolveTaskFolder(project: string, taskName: string): string {
  const proj = String(project).toLowerCase();
  const baseFolder = PROJECT_DOC_DIRS[proj] || proj.toUpperCase();
  return path.join(DOCS_BASE_PATH, baseFolder, TASKS_SUBDIR, taskName);
}

// Opción B: guarda cuál es la tarea activa para sobrevivir cambios de chat / pérdida de contexto.
function setActiveTask(project: string, taskName: string, folderPath: string): void {
  const data = {
    project: String(project).toLowerCase(),
    task_name: taskName,
    folder_path: folderPath,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// Resuelve la ruta absoluta para read/write. Prioriza project+task_name+file_name (Opción A);
// si no, cae al modo legacy con file_path relativo a DOCUMENTACIÓN.
function resolveDocPath(args: any): string {
  const project = args?.project ? String(args.project) : "";
  const taskName = args?.task_name ? String(args.task_name) : "";
  const fileName = args?.file_name ? String(args.file_name) : "";

  if (project && taskName && fileName) {
    return path.join(resolveTaskFolder(project, taskName), fileName);
  }

  if (args?.file_path) {
    return path.join(DOCS_BASE_PATH, String(args.file_path));
  }

  throw new Error("Debes proporcionar (project + task_name + file_name) o bien file_path.");
}

// ─── Prompts de fase ────────────────────────────────────────────────────────
// Las reglas globales y cada fase viven en prompts/*.md. El archivo de reglas
// globales se antepone automáticamente a la fase, igual que hacía la versión
// anterior con plantillas de string.
const GLOBAL_RULES_FILE = "global-rules.md";

// Acepta "fase-1-descubrimiento.md" y también "phase-1-discovery.md",
// para que un juego de prompts en inglés funcione sin tocar el código.
const PHASE_FILE_PATTERN = /^(?:fase|phase)-(\d+)[-.]/i;

type PhaseFile = { file: string; title: string };

// Descubre las fases disponibles a partir de los archivos de PROMPTS_PATH.
// El número de fases no está cableado: agregar un "fase-6-*.md" basta para
// que exista la fase 6.
function discoverPhases(): Map<number, PhaseFile> {
  const phases = new Map<number, PhaseFile>();

  if (!fs.existsSync(PROMPTS_PATH)) {
    return phases;
  }

  for (const file of fs.readdirSync(PROMPTS_PATH).sort()) {
    const match = file.match(PHASE_FILE_PATTERN);
    if (!match || !file.toLowerCase().endsWith(".md")) continue;

    const phaseNumber = Number(match[1]);
    if (phases.has(phaseNumber)) continue; // gana el primero por orden alfabético

    phases.set(phaseNumber, {
      file,
      title: readPhaseTitle(path.join(PROMPTS_PATH, file), file),
    });
  }

  return phases;
}

// El título es el primer encabezado "# ..." del archivo; si no lo hay, se
// deriva del nombre del archivo para que la descripción de la tool siga siendo útil.
function readPhaseTitle(fullPath: string, fileName: string): string {
  try {
    for (const line of fs.readFileSync(fullPath, "utf-8").split(/\r?\n/)) {
      if (line.startsWith("# ")) return line.slice(2).trim();
    }
  } catch {
    // Si el archivo no se puede leer aquí, el error real se reporta al invocar la fase.
  }
  return fileName.replace(PHASE_FILE_PATTERN, "").replace(/\.md$/i, "");
}

// Se lee en cada llamada (no se cachea) para poder afinar un prompt y probarlo
// de inmediato, sin reiniciar el servidor MCP.
function loadPhasePrompt(phase: number): string {
  const available = discoverPhases();
  const entry = available.get(phase);

  if (!entry) {
    const list = [...available.keys()].sort((a, b) => a - b).join(", ");
    throw new Error(
      list
        ? `Fase no válida. Las fases disponibles son: ${list}.`
        : `No se encontró ningún prompt de fase en ${PROMPTS_PATH}. Verifica que la carpeta 'prompts' exista junto al build.`
    );
  }

  const parts: string[] = [];

  const globalRulesPath = path.join(PROMPTS_PATH, GLOBAL_RULES_FILE);
  if (fs.existsSync(globalRulesPath)) {
    parts.push(fs.readFileSync(globalRulesPath, "utf-8").trim());
  }

  parts.push(fs.readFileSync(path.join(PROMPTS_PATH, entry.file), "utf-8").trim());

  return parts.join("\n\n");
}

// La lista de tools es estática, así que la descripción se arma una sola vez al arrancar.
function describePhases(): string {
  const available = discoverPhases();
  if (available.size === 0) return "No se encontraron prompts de fase.";

  return [...available.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([number, { title }]) => `${number}: ${title}`)
    .join(", ");
}

const PHASES_DESCRIPTION = describePhases();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "start_task",
        description: "Inicia una nueva tarea creando una carpeta en la Documentación Central y guardando el contexto inicial.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Proyecto (bos, crm, kanban)" },
            task_name: { type: "string", description: "Nombre de la tarea (creará una carpeta con este nombre)" },
            initial_context: { type: "string", description: "El contexto, correo o requerimiento inicial completo" }
          },
          required: ["project", "task_name", "initial_context"],
        },
      },
      {
        name: "get_phase_prompt",
        description: `Obtiene el prompt maestro de comportamiento según la fase. Fases disponibles — ${PHASES_DESCRIPTION}.`,
        inputSchema: {
          type: "object",
          properties: {
            phase: { type: "number", description: `Número de la fase. Disponibles: ${PHASES_DESCRIPTION}.` }
          },
          required: ["phase"],
        },
      },
      {
        name: "get_active_task",
        description: "Devuelve la tarea activa actual (proyecto, nombre y ruta de carpeta). Úsalo al iniciar un chat nuevo o si perdiste el contexto de dónde escribir la documentación.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "read_central_doc",
        description: "Lee un archivo de la Documentación Central. RECOMENDADO: pasa 'project' + 'task_name' + 'file_name' y el servidor arma la ruta correcta automáticamente (<PROYECTO>/Proyectos/<tarea>/<archivo>). Alternativamente puedes pasar 'file_path' relativo a DOCUMENTACIÓN.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Proyecto (bos, crm, kanban). Úsalo junto con task_name y file_name." },
            task_name: { type: "string", description: "Nombre de la carpeta de la tarea." },
            file_name: { type: "string", description: "Nombre (o ruta relativa) del archivo dentro de la carpeta de la tarea (ej. '01 - Análisis Técnico.md')." },
            file_path: { type: "string", description: "ALTERNATIVA: ruta relativa dentro de DOCUMENTACIÓN (ej. 'BOS/Proyectos/tarea/01-analisis.md'). Solo si no usas project+task_name." }
          },
        },
      },
      {
        name: "write_central_doc",
        description: "Escribe o sobrescribe un archivo en la Documentación Central. RECOMENDADO: pasa 'project' + 'task_name' + 'file_name' y el servidor arma la ruta correcta automáticamente (<PROYECTO>/Proyectos/<tarea>/<archivo>). Alternativamente puedes pasar 'file_path' relativo a DOCUMENTACIÓN.",
        inputSchema: {
          type: "object",
          properties: {
            project: { type: "string", description: "Proyecto (bos, crm, kanban). Úsalo junto con task_name y file_name." },
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
        description: "Permite leer archivos de otros repositorios locales en C:/proyectos.",
        inputSchema: {
          type: "object",
          properties: {
            repo_name: { type: "string", description: "Nombre del repositorio (ej. 'kanban', 'crm')" },
            file_path: { type: "string", description: "Ruta relativa del archivo dentro del repositorio (ej. 'Kanban-back/src/main.ts')" }
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
      const proj = String(args?.project).toLowerCase();
      const taskName = String(args?.task_name);
      const context = String(args?.initial_context);

      const taskFolderPath = resolveTaskFolder(proj, taskName);

      if (!fs.existsSync(taskFolderPath)) {
        fs.mkdirSync(taskFolderPath, { recursive: true });
      }

      const filePath = path.join(taskFolderPath, "00 - Contexto Inicial.md");
      fs.writeFileSync(filePath, context, "utf-8");

      // Opción B: recordar esta como la tarea activa.
      setActiveTask(proj, taskName, taskFolderPath);

      return {
        content: [{ type: "text", text: `Tarea '${taskName}' inicializada correctamente. Archivo guardado en: ${filePath}\nTarea activa registrada (proyecto: ${proj}).` }],
      };
    }

    if (name === "get_phase_prompt") {
      const phase = Number(args?.phase);
      if (!Number.isInteger(phase)) {
        throw new Error(`Debes indicar un número de fase. Disponibles: ${PHASES_DESCRIPTION}.`);
      }
      return {
        content: [{ type: "text", text: loadPhasePrompt(phase) }],
      };
    }

    if (name === "get_active_task") {
      if (!fs.existsSync(STATE_FILE)) {
        return {
          content: [{ type: "text", text: "No hay ninguna tarea activa registrada. Inicia una con 'start_task' o especifica project + task_name al leer/escribir." }],
        };
      }
      const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      return {
        content: [{ type: "text", text: `Tarea activa:\n- Proyecto: ${state.project}\n- Tarea: ${state.task_name}\n- Carpeta: ${state.folder_path}\n- Actualizada: ${state.updated_at}` }],
      };
    }

    if (name === "read_central_doc") {
      const fullPath = resolveDocPath(args);

      // Simple security check to avoid traversing outside DOCS_BASE_PATH
      if (!fullPath.startsWith(DOCS_BASE_PATH)) {
        throw new Error("Acceso denegado fuera de la carpeta DOCUMENTACIÓN.");
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      return {
        content: [{ type: "text", text: content }],
      };
    }

    if (name === "write_central_doc") {
      const content = String(args?.content);
      const fullPath = resolveDocPath(args);

      if (!fullPath.startsWith(DOCS_BASE_PATH)) {
        throw new Error("Acceso denegado fuera de la carpeta DOCUMENTACIÓN.");
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
      const fullPath = path.join(REPOS_BASE_PATH, repoName, filePath);

      if (!fullPath.startsWith(REPOS_BASE_PATH)) {
        throw new Error("Acceso denegado fuera de la carpeta C:/proyectos.");
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Orchestrator Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
