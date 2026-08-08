import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Carpeta de este módulo. Sirve para localizar el .env de la raíz del repo y el estado local.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga el archivo .env de la raíz del repo (un nivel arriba de build/ o src/).
// Así cada dispositivo define su propia ruta de OneDrive sin tocar el mcp.json.
// quiet: true evita que dotenv v17 imprima su banner en stdout, que es el canal del JSON-RPC.
dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

// Paths absolutos del entorno. Se configuran por variable de entorno (vía .env o el bloque
// "env" del mcp.json) para poder usar el MCP en distintos dispositivos sin recompilar.
//
// No tienen valor por defecto, a propósito. Un default es siempre la ruta del equipo de
// quien escribió el código: en cualquier otro dispositivo el servidor arrancaba "bien" y el
// error salía mucho después, dentro de una tool, disfrazado de "no encontré el archivo" y
// sin mencionar que lo que faltaba era configurar una variable.
type RutaRequerida = { variable: string; apuntaA: string };

const DOCS: RutaRequerida = {
  variable: "ORQUESTADOR_DOCS_PATH",
  apuntaA: "la carpeta raíz de la Documentación Central",
};

const REPOS: RutaRequerida = {
  variable: "ORQUESTADOR_REPOS_PATH",
  apuntaA: "la carpeta que contiene tus repositorios de código",
};

// Se resuelve y valida en cada llamada, no una vez al arrancar. Así el servidor se queda en
// pie aunque falte configuración, las tools que no dependen de estas rutas siguen sirviendo,
// y el error llega al chat —donde está el usuario— en vez de quedarse enterrado en un log.
function requireBasePath({ variable, apuntaA }: RutaRequerida): string {
  const valor = process.env[variable]?.trim();

  if (!valor) {
    throw new Error(
      `Falta la variable ${variable}, que debe apuntar a ${apuntaA}. Defínela en el archivo ` +
        `.env de la raíz del repo, o en el bloque "env" del mcp.json de tu cliente.`
    );
  }

  const ruta = path.resolve(valor);

  // Una variable definida pero incorrecta falla igual de tarde que una ausente, así que la
  // existencia se comprueba aquí. El caso del encoding ya mordió una vez y no es adivinable.
  if (!fs.existsSync(ruta)) {
    throw new Error(
      `${variable} apunta a "${ruta}", que no existe en este equipo. Corrige la ruta en el .env. ` +
        `Si lleva acentos, revisa que el .env esté guardado en UTF-8 sin BOM: en UTF-16 los ` +
        `acentos llegan rotos y la carpeta parece no existir.`
    );
  }

  if (!fs.statSync(ruta).isDirectory()) {
    throw new Error(`${variable} apunta a "${ruta}", que es un archivo y no una carpeta.`);
  }

  return ruta;
}

// Comprueba que una ruta quede dentro de otra. No sirve startsWith, y falla en las dos
// direcciones: con base "C:\PROYECTOS\TRABAJO" deja pasar "C:\PROYECTOS\TRABAJO_VIEJO",
// que empieza igual sin estar dentro; y rechaza rutas válidas cuando la base viene escrita
// con otras mayúsculas. Comparar la ruta relativa resuelve ambos.
function estaDentro(base: string, ruta: string): boolean {
  const relativa = path.relative(path.resolve(base), path.resolve(ruta));
  return relativa === "" || (!relativa.startsWith("..") && !path.isAbsolute(relativa));
}

// Subcarpeta donde viven las tareas dentro de cada proyecto (ej. BOS/Proyectos/<tarea>).
// Es una convención de organización, no una ruta de dispositivo, pero vive en el entorno
// para no tener que introducir un archivo de configuración por una sola cadena.
// Vacía a propósito significa que las tareas cuelgan directo del proyecto.
const TASKS_SUBDIR = process.env.ORQUESTADOR_TASKS_SUBDIR?.trim() ?? "Proyectos";

// Carpeta con los prompts de las fases, en archivos .md sueltos.
// Vivir fuera del código permite afinar el texto de una fase sin recompilar:
// se edita el .md y la siguiente llamada a get_phase_prompt ya trae la versión nueva.
// Configurable para que alguien más pueda apuntar a su propio juego de prompts sin forkear.
const PROMPTS_PATH =
  process.env.ORQUESTADOR_PROMPTS_PATH ||
  path.join(__dirname, "..", "prompts");

// ─── Estado local (tarea activa) ────────────────────────────────────────────
// El estado vive en la carpeta de datos del usuario, NO junto al build.
// Antes se guardaba en build/, que es una carpeta generada y gitignoreada: borrarla
// para recompilar desde cero se llevaba la tarea activa. Además, esta ubicación es la
// única que funciona cuando el servidor se ejecuta desde un paquete instalado.
const APP_DIR_NAME = "mcp-orquestador";

function resolveStateDir(): string {
  if (process.env.ORQUESTADOR_STATE_PATH) {
    return process.env.ORQUESTADOR_STATE_PATH;
  }

  const home = os.homedir();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, APP_DIR_NAME);
  }

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_DIR_NAME);
  }

  const stateHome = process.env.XDG_STATE_HOME || path.join(home, ".local", "state");
  return path.join(stateHome, APP_DIR_NAME);
}

const STATE_DIR = resolveStateDir();
const STATE_FILE = path.join(STATE_DIR, "active_task.json");

// Ubicación anterior, junto al build. Se conserva solo para migrar una vez.
const LEGACY_STATE_FILE = path.join(__dirname, "active_task.json");

// Mueve el estado de la ubicación vieja a la nueva la primera vez que arranca
// esta versión, para que nadie pierda su tarea activa al actualizar.
function migrateLegacyState(): void {
  if (fs.existsSync(STATE_FILE) || !fs.existsSync(LEGACY_STATE_FILE)) return;

  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.copyFileSync(LEGACY_STATE_FILE, STATE_FILE);
    fs.unlinkSync(LEGACY_STATE_FILE);
    console.error(`[orquestador] Tarea activa migrada a ${STATE_FILE}`);
  } catch (error: any) {
    // No es fatal: si falla, se sigue trabajando y solo se pierde la tarea activa previa.
    console.error(`[orquestador] No se pudo migrar el estado anterior: ${error.message}`);
  }
}

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

// ─── Proyectos ──────────────────────────────────────────────────────────────
// Los proyectos no se declaran en ninguna parte: son las carpetas que existen. Antes había
// una tabla con bos/crm/kanban que no restringía nada —cualquier nombre inventado resolvía
// una ruta y start_task le creaba la carpeta— porque solo era una tabla de alias y los tres
// nombres coincidían con su propio nombre en mayúsculas.
//
// Es proyecto la carpeta que contenga la subcarpeta de tareas. Esa regla deja fuera sola a
// las carpetas que no son proyectos, y da de alta uno nuevo con solo crearle su subcarpeta.
// Si TASKS_SUBDIR está vacío la regla no se puede aplicar y vale cualquier carpeta.
function discoverProjects(): Map<string, string> {
  const proyectos = new Map<string, string>(); // clave en minúsculas -> nombre real de la carpeta
  const base = requireBasePath(DOCS);

  for (const entrada of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
    if (TASKS_SUBDIR && !fs.existsSync(path.join(base, entrada.name, TASKS_SUBDIR))) continue;
    proyectos.set(entrada.name.toLowerCase(), entrada.name);
  }

  return proyectos;
}

function describeProjects(): string {
  try {
    const nombres = [...discoverProjects().values()].sort();
    return nombres.length ? nombres.join(", ") : "(ninguno todavía)";
  } catch {
    // Sin ORQUESTADOR_DOCS_PATH configurada no se pueden listar; el error real lo da la tool.
    return "(no se pudieron leer: revisa ORQUESTADOR_DOCS_PATH)";
  }
}

// Devuelve el nombre real de la carpeta, respetando mayúsculas, o null si no existe.
function findProjectFolder(project: string): string | null {
  return discoverProjects().get(String(project).trim().toLowerCase()) ?? null;
}

function requireProjectFolder(project: string): string {
  const carpeta = findProjectFolder(project);
  if (!carpeta) {
    throw new Error(
      `No existe el proyecto "${project}". Los proyectos disponibles son: ${describeProjects()}.`
    );
  }
  return carpeta;
}

// Opción A: la ruta de una tarea SIEMPRE se arma aquí, en un solo lugar.
// Estructura: <ORQUESTADOR_DOCS_PATH>/<PROYECTO>/<TASKS_SUBDIR>/<tarea>
function taskFolderPath(carpetaProyecto: string, taskName: string): string {
  return path.join(requireBasePath(DOCS), carpetaProyecto, TASKS_SUBDIR, taskName);
}

function resolveTaskFolder(project: string, taskName: string): string {
  return taskFolderPath(requireProjectFolder(project), taskName);
}

// Opción B: guarda cuál es la tarea activa para sobrevivir cambios de chat / pérdida de contexto.
function setActiveTask(project: string, taskName: string, folderPath: string): void {
  const data = {
    project: String(project).toLowerCase(),
    task_name: taskName,
    folder_path: folderPath,
    updated_at: new Date().toISOString(),
  };
  fs.mkdirSync(STATE_DIR, { recursive: true });
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
    return path.join(requireBasePath(DOCS), String(args.file_path));
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

// Cabecera opcional al inicio del .md, entre líneas de ---, con "clave: valor".
// Ahí cada fase declara cómo se llama el documento que produce. Vive pegada al prompt que
// describe ese documento —no en un archivo de configuración aparte— para que el nombre exista
// en un solo lugar y se lea en vivo, sin recompilar, igual que el resto del prompt.
const PHASE_FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

type PhaseFile = {
  file: string;
  title: string;
  documento?: string | undefined;         // el que produce la fase (la 5 no produce ninguno)
  documentoInicial?: string | undefined;  // solo la fase 1: el archivo que escribe start_task
};

function parsePhaseFile(fullPath: string): { meta: Record<string, string>; cuerpo: string } {
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

    let meta: Record<string, string> = {};
    let cuerpo = "";
    try {
      ({ meta, cuerpo } = parsePhaseFile(path.join(PROMPTS_PATH, file)));
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
function readPhaseTitle(cuerpo: string, fileName: string): string {
  for (const line of cuerpo.split(/\r?\n/)) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  return fileName.replace(PHASE_FILE_PATTERN, "").replace(/\.md$/i, "");
}

// Nombre del archivo de contexto inicial que escribe start_task. Lo declara la fase 1 en su
// cabecera; la constante es solo el respaldo para un juego de prompts que no lo declare.
const CONTEXTO_INICIAL_POR_DEFECTO = "00 - Contexto Inicial.md";

function nombreContextoInicial(): string {
  return discoverPhases().get(1)?.documentoInicial || CONTEXTO_INICIAL_POR_DEFECTO;
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

  parts.push(parsePhaseFile(path.join(PROMPTS_PATH, entry.file)).cuerpo.trim());

  const archivos = describePhaseFiles(available, phase);
  if (archivos) parts.push(archivos);

  return parts.join("\n\n");
}

// Bloque que se añade al final del prompt con los nombres exactos de los documentos: el que
// produce esta fase y los de las anteriores, que son los que hay que leer. Va aquí y no en el
// comando del cliente para que el nombre viva en un solo sitio; así afinar un prompt no obliga
// a editar además un comando en cada dispositivo.
function describePhaseFiles(available: Map<number, PhaseFile>, phase: number): string {
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

// La lista de tools se arma una sola vez al arrancar, así que esta foto de los proyectos
// puede quedarse vieja si creas una carpeta con Cursor abierto. Es orientativa: la lista
// que manda es la que devuelven las tools al rechazar un proyecto inexistente.
const PROJECTS_DESCRIPTION = describeProjects();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "start_task",
        description: "Inicia una nueva tarea creando una carpeta en la Documentación Central y guardando el contexto inicial.",
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
            project: { type: "string", description: `Proyecto, uno de los existentes: ${PROJECTS_DESCRIPTION}. Úsalo junto con task_name y file_name.` },
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

      if (!fs.existsSync(carpetaTarea)) {
        fs.mkdirSync(carpetaTarea, { recursive: true });
      }

      const filePath = path.join(carpetaTarea, nombreContextoInicial());
      fs.writeFileSync(filePath, context, "utf-8");

      // Opción B: recordar esta como la tarea activa.
      setActiveTask(carpetaProyecto, taskName, carpetaTarea);

      const aviso = estrenado ? `\nProyecto "${carpetaProyecto}" estrenado.` : "";

      return {
        content: [{ type: "text", text: `Tarea '${taskName}' inicializada correctamente. Archivo guardado en: ${filePath}\nTarea activa registrada (proyecto: ${carpetaProyecto}).${aviso}` }],
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
      let state: any;
      try {
        state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      } catch {
        // Un archivo corrupto no debe dejar al usuario sin saber qué pasó ni dónde mirar.
        throw new Error(
          `El archivo de tarea activa está dañado o no se pudo leer: ${STATE_FILE}. Bórralo y vuelve a iniciar la tarea con 'start_task'.`
        );
      }
      return {
        content: [{ type: "text", text: `Tarea activa:\n- Proyecto: ${state.project}\n- Tarea: ${state.task_name}\n- Carpeta: ${state.folder_path}\n- Actualizada: ${state.updated_at}\n- Estado guardado en: ${STATE_FILE}` }],
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

async function main() {
  migrateLegacyState();
  reportarRutas();

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Orchestrator Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
