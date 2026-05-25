import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";

// Paths absolutos del entorno
const DOCS_BASE_PATH = "C:\\Users\\Usuario general\\OneDrive - Abogados Manuel Solis\\Documentos\\DOCUMENTACIÓN";
const REPOS_BASE_PATH = "C:\\proyectos";

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

// Plantillas Maestras Agnósticas
const GLOBAL_RULES = `## REGLA GLOBAL INQUEBRANTABLE (CERO RUPTURAS)
- Nunca modifiques lógica, componentes, o funciones ya existentes a menos que sea 100% necesario. Si modificar algo existente podría romper otra parte del sistema que lo usa, DETENTE.
- Si debes hacer un cambio en código existente o tomar una decisión de arquitectura, SIEMPRE pregúntale al usuario primero.
- Cuando propongas un cambio, DEBES explicar detalladamente por qué se necesita y qué implicaciones tiene en el resto del sistema, para que el usuario pueda entenderlo y aprobarlo.`;

const PHASES_PROMPTS: Record<number, string> = {
  1: `${GLOBAL_RULES}

## ROL DE COMPORTAMIENTO (GLOBAL)
Eres un Arquitecto de Software y Analista de Sistemas Senior. Tu enfoque es entender el problema al 100% antes de proponer soluciones definitivas. Tu prioridad es la investigación profunda y el pensamiento crítico.

## REGLAS DE LA FASE 1 (DESCUBRIMIENTO)
1. NO escribas código para producción aún.
2. Usa tus herramientas para leer la documentación central y el código base actual, enfocándote en comprender la estructura del proyecto en el que estamos.
3. Analiza el impacto general del requerimiento planteado.
4. Genera un documento (ej. '01 - Análisis Técnico.md') en la carpeta de la tarea desglosando técnica y funcionalmente el problema.`,
  2: `${GLOBAL_RULES}

## ROL DE COMPORTAMIENTO (GLOBAL)
Eres un Líder Técnico especializado en seguridad y escalabilidad. No asumes absolutamente nada. Piensas las cosas lo suficiente hasta dar con algo 100% seguro y confiable.

## REGLAS DE LA FASE 2 (DECISIONES)
1. Lee el documento de Resumen Inicial / Análisis Técnico.
2. Identifica lagunas técnicas, posibles fallos, o dependencias cruzadas con otros sistemas.
3. Hazme una lista de Preguntas Críticas de Decisión. Al hacerme las preguntas, explícame las implicaciones y el contexto para yo poder responder de manera segura.
4. Detente por completo y espera mis respuestas.`,
  3: `${GLOBAL_RULES}

## ROL DE COMPORTAMIENTO (GLOBAL)
Eres un Ingeniero de Software de Élite enfocado en la prevención de fallos (Zero-defect mindset). 

## REGLAS DE LA FASE 3 (PLAN TÉCNICO)
1. Con las decisiones tomadas, genera un plan de implementación técnico paso a paso (ej. '03 - Plan Técnico.md').
2. LÍMITE ESTRICTO: No planees nada que se salga de los patrones del código actual de esta aplicación. Lo principal es la seguridad. Si algo puede dar problemas, sáltalo o pregúntame.
3. Incluye una sección para saber cómo verificar rápidamente que todo funcionará.`,
  4: `${GLOBAL_RULES}

## ROL DE COMPORTAMIENTO (GLOBAL)
Eres un Especialista en Desarrollo de Software. Escribes código limpio y mantenible respetando al máximo el stack del proyecto actual.

## REGLAS DE LA FASE 4 (EJECUCIÓN)
1. Ejecuta el plan técnico paso a paso de manera segura.
2. Antes de dar un paso, asegúrate de haber investigado todo lo necesario. Si dudas, pregúntame.
3. Al final de una tanda de cambios, indícame cómo verificarlos para poder avanzar.
4. Aplica estrictamente las reglas de código del repositorio.`
};

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
        description: "Obtiene el prompt maestro de comportamiento según la fase (1: Descubrimiento, 2: Decisiones, 3: Plan Técnico, 4: Ejecución).",
        inputSchema: {
          type: "object",
          properties: {
            phase: { type: "number", description: "Número de la fase (1, 2, 3 o 4)" }
          },
          required: ["phase"],
        },
      },
      {
        name: "read_central_doc",
        description: "Lee el contenido de un archivo dentro de la carpeta de Documentación Central.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Ruta relativa dentro de DOCUMENTACIÓN (ej. 'BOS/tarea/01-analisis.md')" }
          },
          required: ["file_path"],
        },
      },
      {
        name: "write_central_doc",
        description: "Escribe o sobrescribe un archivo en la Documentación Central.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Ruta relativa dentro de DOCUMENTACIÓN" },
            content: { type: "string", description: "Contenido a escribir" }
          },
          required: ["file_path", "content"],
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

      const baseFolder = PROJECT_DOC_DIRS[proj] || proj.toUpperCase();
      const taskFolderPath = path.join(DOCS_BASE_PATH, baseFolder, taskName);

      if (!fs.existsSync(taskFolderPath)) {
        fs.mkdirSync(taskFolderPath, { recursive: true });
      }

      const filePath = path.join(taskFolderPath, "00 - Contexto Inicial.md");
      fs.writeFileSync(filePath, context, "utf-8");

      return {
        content: [{ type: "text", text: `Tarea '${taskName}' inicializada correctamente. Archivo guardado en: ${filePath}` }],
      };
    }

    if (name === "get_phase_prompt") {
      const phase = Number(args?.phase);
      const prompt = PHASES_PROMPTS[phase];
      if (!prompt) {
        throw new Error("Fase no válida. Debe ser 1, 2, 3 o 4.");
      }
      return {
        content: [{ type: "text", text: prompt }],
      };
    }

    if (name === "read_central_doc") {
      const filePath = String(args?.file_path);
      const fullPath = path.join(DOCS_BASE_PATH, filePath);
      
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
      const filePath = String(args?.file_path);
      const content = String(args?.content);
      const fullPath = path.join(DOCS_BASE_PATH, filePath);

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
