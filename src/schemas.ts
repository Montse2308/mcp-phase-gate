// Los argumentos de cada tool, declarados una sola vez con zod.
//
// Antes cada tool leía sus argumentos con String(args?.x), que no valida nada: sin task_name,
// String(undefined) creaba la tarea "undefined/" y la dejaba activa. Ahora todo pasa por aquí
// antes de usarse, y el error nombra el campo.
//
// Se exportan shapes (los campos sueltos) y no z.object(...): es lo que recibe registerTool
// del SDK, al que se pasarán tal cual en la migración a McpServer (Etapa 2).
//
// Los opcionales son .nullish() y null cuenta como ausente: algunos clientes con modelos en
// modo estricto mandan null en todo campo opcional. Un número en texto (phase: "3") no se
// convierte: se rechaza con un mensaje que dice qué se espera. Es raro, el modelo lo corrige
// al primer intento, y convertirlo complicaría el JSON Schema que se generará desde aquí.

import { z } from "zod";

export const startTaskShape = {
  project: z.string().trim().min(1, "Falta `project`."),
  task_name: z.string().min(1, "Falta `task_name`."),
  initial_context: z.string().min(1, "Falta `initial_context`."),
  crear_proyecto: z.boolean().nullish(),
};

export const getPhasePromptShape = {
  phase: z.number().int(),
  project: z.string().nullish(),
  task_name: z.string().nullish(),
};

export const getActiveTaskShape = {
  project: z.string().nullish(),
};

export const listTasksShape = {
  project: z.string().nullish(),
};

export const switchTaskShape = {
  project: z.string().trim().min(1, "Falta `project`."),
  task_name: z.string().min(1, "Falta `task_name`."),
};

// Los cuatro son opcionales por separado: qué combinación vale lo decide resolveDocPath.
export const readCentralDocShape = {
  project: z.string().nullish(),
  task_name: z.string().nullish(),
  file_name: z.string().nullish(),
  file_path: z.string().nullish(),
};

export const writeCentralDocShape = {
  ...readCentralDocShape,
  content: z.string(),
  // Solo con confirmación explícita del usuario en el chat. Permite reescribir un documento
  // congelado o el contexto inicial.
  force: z.boolean().nullish(),
};

export const readCrossRepoShape = {
  repo_name: z.string().min(1, "Falta `repo_name`."),
  file_path: z.string().min(1, "Falta `file_path`."),
};

const SHAPES = {
  start_task: startTaskShape,
  get_phase_prompt: getPhasePromptShape,
  get_active_task: getActiveTaskShape,
  list_tasks: listTasksShape,
  switch_task: switchTaskShape,
  read_central_doc: readCentralDocShape,
  write_central_doc: writeCentralDocShape,
  read_cross_repo: readCrossRepoShape,
};

type NombreTool = keyof typeof SHAPES;

// validarLlamada quita los null, así que ninguna tool los ve.
type SinNulos<T> = { [K in keyof T]: Exclude<T[K], null> };

// Una llamada ya validada. Es una unión discriminada por `tool`: al comprobar el nombre,
// TypeScript sabe qué argumentos trae y de qué tipo, sin un solo String().
export type LlamadaValidada = {
  [K in NombreTool]: { tool: K; args: SinNulos<z.output<z.ZodObject<(typeof SHAPES)[K]>>> };
}[NombreTool];

// Lo que se espera de cada tipo, dicho como se le diría al modelo para que corrija la llamada.
// El único número es `phase`, de ahí el ejemplo.
const TIPOS: Record<string, string> = {
  string: "un texto",
  number: "un número, por ejemplo 3",
  int: "un número entero, por ejemplo 3",
  boolean: "true o false",
  object: "un objeto",
};

function describirProblema(issue: z.core.$ZodIssue, recibidos: Record<string, unknown>): string {
  const campo = issue.path.map(String).join(".");
  if (!campo) return "los argumentos tienen que ser un objeto.";

  const nombre = `\`${campo}\``;

  // null también es "falta": en un opcional se tolera, en un obligatorio es lo mismo que no venir.
  if (issue.code === "invalid_type") {
    return recibidos[campo] == null
      ? `Falta ${nombre}.`
      : `${nombre} debe ser ${TIPOS[issue.expected] ?? issue.expected}.`;
  }

  // Los mínimos llevan su mensaje en español en el propio shape ("Falta `task_name`.").
  if (issue.code === "too_small") return issue.message;

  // Los máximos no: el único que puede saltar es el del entero seguro de `phase`.
  if (issue.code === "too_big") return `${nombre} es demasiado grande.`;

  return `${nombre}: ${issue.message}.`;
}

export function validarLlamada(tool: string, args: unknown): LlamadaValidada {
  if (!Object.hasOwn(SHAPES, tool)) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  const resultado = z.object(SHAPES[tool as NombreTool]).safeParse(args ?? {});

  if (!resultado.success) {
    const recibidos = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
    const problemas = resultado.error.issues.map((issue) => describirProblema(issue, recibidos));
    throw new Error(`Argumentos no válidos. ${problemas.join(" ")}`);
  }

  // null cuenta como ausente: se quita aquí, una vez, para que ninguna tool tenga que
  // distinguir entre un campo que no vino y uno que vino vacío.
  const sinNulos = Object.fromEntries(Object.entries(resultado.data).filter(([, valor]) => valor !== null));

  // El cast es seguro: los datos los acaba de producir el shape de esta misma tool.
  return { tool, args: sinNulos } as LlamadaValidada;
}
