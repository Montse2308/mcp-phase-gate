// Los argumentos de cada tool, declarados una sola vez con zod.
//
// Antes cada tool leía sus argumentos con String(args?.x), que no valida nada: sin task_name,
// String(undefined) creaba la tarea "undefined/" y la dejaba activa. Desde la Etapa 0 todo pasa
// por aquí antes de usarse, y el error nombra el campo.
//
// Se exportan shapes (los campos sueltos) y no z.object(...): es lo que recibe registerTool del
// SDK. El SDK genera con ellos el JSON Schema que ve el cliente —por eso cada campo lleva aquí su
// descripción— y valida cada llamada antes del callback.
//
// Los mensajes de error van en cada campo, en español, porque el SDK los entrega tal cual detrás
// de su prefijo en inglés ("Input validation error: Invalid arguments for tool …"). Sin ellos
// llegaría el texto genérico de zod ("expected string, received undefined"), que no le dice al
// modelo cómo corregir la llamada.
//
// Los opcionales son .nullish() y null cuenta como ausente: algunos clientes con modelos en
// modo estricto mandan null en todo campo opcional. Un número en texto (phase: "3") no se
// convierte: se rechaza con un mensaje que dice qué se espera. Es raro, el modelo lo corrige
// al primer intento, y convertirlo complicaría el JSON Schema que se genera desde aquí.

import { z } from "zod";

import { NOMBRES_LOGICOS } from "./config.js";
import type { NombreLogico } from "./config.js";

// Lo que se espera de cada tipo, dicho como se le diría al modelo para que corrija la llamada.
// El único número es `phase`, de ahí el ejemplo.
const TIPOS: Record<string, string> = {
  string: "un texto",
  number: "un número, por ejemplo 3",
  int: "un número entero, por ejemplo 3",
  boolean: "true o false",
  object: "un objeto",
  array: "una lista",
};

// El mensaje de un campo. null también es "falta": en un opcional se tolera antes de llegar aquí,
// en un obligatorio es lo mismo que no venir.
function mensaje(campo: string): (issue: z.core.$ZodRawIssue) => string {
  const nombre = `\`${campo}\``;
  return (issue) => {
    if (issue.input === undefined || issue.input === null) return `Falta ${nombre}.`;
    if (issue.code === "invalid_type") return `${nombre} debe ser ${TIPOS[issue.expected] ?? issue.expected}.`;
    // El único máximo que puede saltar es el del entero seguro de `phase`.
    if (issue.code === "too_big") return `${nombre} es demasiado grande.`;
    return `${nombre} no es válido.`;
  };
}

function texto(campo: string) {
  return z.string({ error: mensaje(campo) });
}

// `recortar` quita los espacios ANTES de exigir el mínimo: "   " cuenta como que falta.
function obligatorio(campo: string, opciones: { recortar?: boolean } = {}) {
  const base = opciones.recortar ? texto(campo).trim() : texto(campo);
  return base.min(1, `Falta \`${campo}\`.`);
}

function booleano(campo: string) {
  return z.boolean({ error: mensaje(campo) });
}

// ─── Descripciones ──────────────────────────────────────────────────────────
// Son estáticas: no nombran proyectos ni fases concretas. Antes se armaban al arrancar con la
// lista de proyectos y de fases, y se quedaban viejas en cuanto alguien creaba una carpeta con el
// cliente abierto, porque la lista de tools no se vuelve a pedir. Lo que cambia vive ahora en los
// recursos phase-gate://estado y phase-gate://fases, que sí avisan cuando cambian.
const PROYECTO =
  "Proyecto: el nombre de una carpeta de proyecto de la Documentación Central. Si no existe, la " +
  "tool te devuelve los que hay. También los listan `list_tasks`, `get_orchestrator_status` y el recurso " +
  "`phase-gate://estado`.";

// Donde el proyecto se puede deducir de la carpeta abierta (MCP Roots, Etapa 3).
const DEDUCIBLE = " Si lo omites, se deduce de la carpeta que tienes abierta, si tu cliente la anuncia; si no se puede, la tool te lo pide.";

const FASE =
  "Número de fase. Con los prompts de fábrica son 1 a 5; `get_orchestrator_status` y el recurso " +
  "`phase-gate://fases` listan las disponibles con su título y documento.";

const TAREA = "Nombre de la carpeta de la tarea.";

const ARCHIVO =
  "Nombre (o ruta relativa) del archivo dentro de la carpeta de la tarea (ej. '01 - Análisis Técnico.md').";

// ─── Shapes ─────────────────────────────────────────────────────────────────
export const startTaskShape = {
  project: texto("project").trim().nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
  task_name: obligatorio("task_name").describe("Nombre de la tarea (creará una carpeta con este nombre)."),
  initial_context: obligatorio("initial_context").describe("El contexto, correo o requerimiento inicial completo."),
  crear_proyecto: booleano("crear_proyecto")
    .nullish()
    .describe(
      "Solo para ESTRENAR un proyecto que todavía no existe. Déjalo sin poner salvo que el usuario te haya " +
        "dicho explícitamente que quiere crear un proyecto nuevo: sirve para que un nombre mal escrito no cree " +
        "una carpeta suelta en la Documentación."
    ),
  repos: z
    .array(texto("repos"), { error: mensaje("repos") })
    .nullish()
    .describe(
      "Solo si la tarea toca algunos de los repos que declara el phase-gate.json del proyecto, no todos: sus ids " +
        "(ej. ['api', 'web']). Sin esto, la tarea usa todos. Un id que no existe devuelve los válidos."
    ),
  preset: texto("preset")
    .nullish()
    .describe(
      "Solo si esta tarea usa un preset distinto del de su proyecto (ej. 'ai-agent-ops' para el mantenimiento de " +
        "un agente). Si no existe, la tool devuelve los disponibles."
    ),
};

export const getPhasePromptShape = {
  phase: z.number({ error: mensaje("phase") }).int({ error: mensaje("phase") }).describe(FASE),
  project: texto("project")
    .nullish()
    .describe(
      `${PROYECTO} Pásalo siempre que lo sepas —lo sabes por el repositorio que tienes abierto— para que se ` +
        "pueda comprobar que no te saltas una fase. La tarea se toma de la activa de ese proyecto." +
        DEDUCIBLE
    ),
  task_name: texto("task_name")
    .nullish()
    .describe("Solo si quieres comprobar contra una tarea distinta de la activa del proyecto. Normalmente se omite."),
};

export const getActiveTaskShape = {
  project: texto("project")
    .nullish()
    .describe(`${PROYECTO} Si lo omites, se devuelve la tarea activa de cada proyecto.`),
};

export const listTasksShape = {
  project: texto("project").nullish().describe(`${PROYECTO} Si lo omites, se listan todos.`),
};

export const switchTaskShape = {
  project: texto("project").trim().nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
  task_name: obligatorio("task_name").describe(
    "Nombre de la carpeta de la tarea a activar. Si no existe, la tool te devuelve las que sí."
  ),
};

// Los cuatro son opcionales por separado: qué combinación vale lo decide resolveDocPath.
export const readCentralDocShape = {
  project: texto("project").nullish().describe(`${PROYECTO} Úsalo junto con task_name y file_name.${DEDUCIBLE}`),
  task_name: texto("task_name").nullish().describe(TAREA),
  file_name: texto("file_name").nullish().describe(ARCHIVO),
  file_path: texto("file_path")
    .nullish()
    .describe(
      "ALTERNATIVA: ruta relativa dentro de la Documentación Central (ej. " +
        "'PROYECTO-A/Proyectos/tarea/01 - Análisis Técnico.md'). Solo si no usas project+task_name."
    ),
};

export const writeCentralDocShape = {
  ...readCentralDocShape,
  file_path: texto("file_path")
    .nullish()
    .describe(
      "ALTERNATIVA: ruta relativa dentro de la Documentación Central, que tiene que caer dentro de la carpeta " +
        "de una tarea que ya existe (ej. 'PROYECTO-A/Proyectos/tarea/01 - Análisis Técnico.md'). Los archivos " +
        "del proyecto no se escriben con esta tool. Solo si no usas project+task_name."
    ),
  content: texto("content").describe("Contenido a escribir."),
  force: booleano("force")
    .nullish()
    .describe(
      "Permite reescribir un documento congelado o el contexto inicial. Solo se usa si tu cliente no puede " +
        "pedirle la confirmación al usuario directamente. Nunca lo pongas sin que el usuario lo haya confirmado en el chat."
    ),
};

export const readCrossRepoShape = {
  repo_name: obligatorio("repo_name").describe("Nombre del repositorio (ej. 'repo-a', 'repo-b')."),
  file_path: obligatorio("file_path").describe("Ruta relativa del archivo dentro del repositorio (ej. 'src/main.ts')."),
};

// get_orchestrator_status no recibe nada.
export const getOrchestratorStatusShape = {};

// ─── Salida de get_orchestrator_status ──────────────────────────────────────
// El objeto Diagnostico de diagnostico.ts, campo por campo. Con un outputSchema el cliente recibe
// además `structuredContent`, y el SDK comprueba antes de enviarlo que cuadra con este shape:
// si diagnostico.ts cambia y esto no, la tool falla en los tests en vez de mentir al cliente.
const estadoRuta = z.object({ ruta: z.string().optional(), existe: z.boolean(), error: z.string().optional() });

export const diagnosticoShape = {
  paquete: z.object({
    version: z.string(),
    ruta: z.string(),
    via: z.enum(["npx", "global", "dependencia", "clon"]),
  }),
  node: z.object({ version: z.string(), plataforma: z.string() }),
  variables: z.array(
    z.object({
      logica: z.enum(NOMBRES_LOGICOS as [NombreLogico, ...NombreLogico[]]),
      valor: z.string().optional(),
      usada: z.string().nullable(),
      fuente: z.enum(["entorno", ".env", "sin definir"]),
      discrepancia: z.string().nullable(),
    })
  ),
  rutas: z.object({ docs: estadoRuta, repos: estadoRuta }),
  estado: z.object({ archivo: z.string(), existe: z.boolean(), punteros: z.number().int() }),
  capas: z.array(z.object({ ruta: z.string(), etiqueta: z.enum(["fábrica", "propia"]), existe: z.boolean() })),
  reglasGlobales: z.object({ archivo: z.string().nullable(), capa: z.string().nullable(), faltan: z.array(z.string()) }),
  fases: z.array(
    z.object({
      numero: z.number().int(),
      titulo: z.string(),
      archivo: z.string(),
      capa: z.string(),
      documento: z.string().optional(),
      recibos: z.string().optional(),
      comando: z.string().nullable(),
    })
  ),
  proyectos: z.array(
    z.object({
      nombre: z.string(),
      tareas: z.number().int(),
      activa: z
        .object({ tarea: z.string(), origen: z.enum(["puntero", "deducida"]), fase: z.string() })
        .nullable(),
    })
  ),
  cliente: z
    .object({
      nombre: z.string(),
      version: z.string(),
      capacidades: z.object({ elicitation: z.boolean(), roots: z.boolean() }),
    })
    .optional(),
  hallazgos: z.array(
    z.object({ severidad: z.enum(["error", "aviso", "info"]), codigo: z.string(), texto: z.string() })
  ),
};

// null cuenta como ausente: se quita una vez, al entrar en la tool, para que ninguna tenga que
// distinguir entre un campo que no vino y uno que vino vacío.
export type SinNulos<T> = { [K in keyof T]: Exclude<T[K], null> };

export function sinNulos<T extends Record<string, unknown>>(args: T): SinNulos<T> {
  return Object.fromEntries(Object.entries(args).filter(([, valor]) => valor !== null)) as SinNulos<T>;
}
