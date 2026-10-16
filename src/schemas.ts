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
  project: texto("project").trim().min(1, "`project` no puede ir vacío: omítelo para deducirlo de la carpeta abierta.").nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
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
  // Un texto propio: aquí, sin proyecto la tool no falla, entrega el prompt sin configuración de
  // proyecto (hallazgo 8 de la auditoría de la Etapa 3).
  project: texto("project")
    .nullish()
    .describe(
      "Proyecto: el nombre de una carpeta de proyecto de la Documentación Central. Pásalo siempre que lo sepas " +
        "—lo sabes por el repositorio que tienes abierto—: con él, el prompt sale con el preset, las reglas y la " +
        "configuración de ese proyecto, y se comprueba que no te saltas una fase (con su tarea activa). Si lo " +
        "omites, se deduce de la carpeta abierta si tu cliente la anuncia. Si no se puede deducir, o el proyecto no " +
        "existe, el prompt llega igual pero sin la configuración de ningún proyecto, y una nota al principio lo dice."
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
  project: texto("project").trim().min(1, "`project` no puede ir vacío: omítelo para deducirlo de la carpeta abierta.").nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
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

// ─── Repos de un proyecto (Etapa 3) ─────────────────────────────────────────
const ID_REPO = /^[a-z0-9][a-z0-9-]{0,39}$/;
const REPO =
  "Id del repo, tal como lo declara el phase-gate.json del proyecto (ej. 'api'). Los de la tarea salen en el " +
  "bloque CONFIGURACIÓN DEL PROYECTO de get_phase_prompt.";

export const readRepoFileShape = {
  project: texto("project").nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
  repo: texto("repo").regex(ID_REPO, "`repo` es el id de un repo: minúsculas, números y guiones (ej. 'api').").describe(REPO),
  path: obligatorio("path").describe("Ruta relativa del archivo dentro del repo (ej. 'src/main.ts'). No puede entrar en .git."),
};

export const repoStatusShape = {
  project: texto("project").nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
  repo: texto("repo")
    .regex(ID_REPO, "`repo` es el id de un repo: minúsculas, números y guiones (ej. 'api').")
    .nullish()
    .describe(`${REPO} Si lo omites, se devuelven los repos de la tarea activa.`),
};

// Salida de repo_status: el estado de cada repo, campo por campo (EstadoDeRepo de repos.ts).
export const repoStatusSalidaShape = {
  proyecto: z.string(),
  repos: z.array(
    z.object({
      id: z.string(),
      ruta: z.string().nullable(),
      existe: z.boolean(),
      esGit: z.boolean(),
      rama: z.string().nullable(),
      separado: z.boolean(),
      head: z.string().nullable(),
      adelante: z.number().int().nullable(),
      atras: z.number().int().nullable(),
      limpio: z.boolean().nullable(),
      cambios: z.number().int(),
      sinSeguimiento: z.number().int(),
      error: z.string().nullable(),
    })
  ),
};

// ─── Lotes de la Fase 4 (Etapa 4) ───────────────────────────────────────────
const ESTADOS_DE_LOTE = ["verificado", "con pendientes", "fallido", "descartado"] as const;
const TITULOS_CONDICIONALES = ["Lo que sigue igual", "Reversión", "Aviso a alguien más", "Deuda anotada"] as const;

const textoNoVacio = (campo: string) => texto(campo).trim().min(1, `\`${campo}\` no puede ir vacío.`);

const FILA_ARCHIVO = z
  .object({ archivo: textoNoVacio("archivo"), cambio: textoNoVacio("cambio") }, { error: mensaje("archivos") })
  .strict();
const FILA_ESPERA = z
  .object({ prueba: textoNoVacio("prueba"), esperado: textoNoVacio("esperado") }, { error: mensaje("espera_al_usuario") })
  .strict();
const CONDICIONAL = z
  .object(
    {
      titulo: z.enum(TITULOS_CONDICIONALES, { error: () => `\`titulo\` es uno de: ${TITULOS_CONDICIONALES.join(", ")}.` }),
      texto: textoNoVacio("texto"),
    },
    { error: mensaje("condicionales") }
  )
  .strict();

const PROYECTO_QUE_ESCRIBE = `${PROYECTO} Si lo omites, se deduce de la carpeta que tienes abierta, si tu cliente la anuncia y la coincidencia es firme; si no, la tool te lo pide.`;

export const recordBatchShape = {
  project: texto("project").nullish().describe(PROYECTO_QUE_ESCRIBE),
  task_name: texto("task_name").nullish().describe("Nombre de la carpeta de la tarea. Si lo omites, la tarea activa del proyecto."),
  lote: z
    .number({ error: mensaje("lote") })
    .int({ error: mensaje("lote") })
    .min(1, "`lote` va de 1 a 99.")
    .max(99, "`lote` va de 1 a 99.")
    .describe("Número del lote, el de la tabla de lotes del plan (L02 es 2)."),
  // El contenido: obligatorio al crear el recibo; se omite al solo anclar un recibo pendiente.
  titulo: textoNoVacio("titulo").max(120, "`titulo` no puede pasar de 120 caracteres.").nullish().describe("El objetivo del lote, en una frase. Da el nombre del recibo."),
  repo: texto("repo")
    .regex(ID_REPO, "`repo` es el id de un repo: minúsculas, números y guiones (ej. 'api').")
    .nullish()
    .describe(`${REPO} Si la tarea tiene un solo repo, se omite.`),
  estado: z
    .enum(ESTADOS_DE_LOTE, { error: () => "`estado` es verificado, con pendientes, fallido o descartado." })
    .nullish()
    .describe("Cómo quedó el lote tras su verificación."),
  que_se_hizo: textoNoVacio("que_se_hizo").nullish().describe("Una o dos frases, con el número que importe."),
  archivos: z
    .array(FILA_ARCHIVO, { error: mensaje("archivos") })
    .max(200, "`archivos` no puede tener más de 200 filas.")
    .nullish()
    .describe("Los archivos del lote, relativos a la raíz del repo, y qué cambió en cada uno. El servidor los compara con los del commit."),
  verificacion: textoNoVacio("verificacion").nullish().describe("Lo que ejecutaste para verificar el lote, con su resultado en números."),
  espera_al_usuario: z
    .array(FILA_ESPERA, { error: mensaje("espera_al_usuario") })
    .max(50, "`espera_al_usuario` no puede tener más de 50 filas.")
    .nullish()
    .describe("Las pruebas que solo puede hacer el usuario, con su resultado esperado."),
  desvios: texto("desvios").nullish().describe("Lo que no salió como decía el plan. Vacío si no hubo."),
  decisiones: texto("decisiones").nullish().describe("Las decisiones D<n> nuevas de este lote, cada una con su Base. Vacío si no hubo."),
  condicionales: z
    .array(CONDICIONAL, { error: mensaje("condicionales") })
    .max(4, "`condicionales` no puede tener más de 4 secciones.")
    .nullish()
    .describe("Las secciones condicionales del recibo que apliquen (Lo que sigue igual, Reversión, Aviso a alguien más, Deuda anotada)."),
  // El ancla: como mucho una de las tres.
  commit: texto("commit")
    .nullish()
    .describe("El hash del commit del lote (de 7 a 40 caracteres hexadecimales), cuando exista. Sin él, el lote queda con el commit pendiente."),
  artifact_path: texto("artifact_path")
    .nullish()
    .describe("Sin git: el archivo que cambió, relativo a la raíz del repo del lote o, sin repo, a la carpeta del proyecto. El servidor lo sella con su sha256."),
  verification_note: textoNoVacio("verification_note")
    .max(2000, "`verification_note` no puede pasar de 2000 caracteres.")
    .nullish()
    .describe("Sin git y sin archivo que sellar, o en un lote fallido o descartado: qué se comprobó o qué pasó."),
  // El cierre de la fase.
  cerrar_fase: booleano("cerrar_fase")
    .nullish()
    .describe(
      "Solo si el usuario decidió cerrar la Fase 4 sin hacer los lotes que faltan, o con lotes fallidos. Los que no tienen " +
        "recibo quedan descartados con `motivo_descarte`. Pide confirmación al usuario. Al anclar el último lote, la fase se " +
        "cierra sola: no hace falta."
    ),
  motivo_descarte: textoNoVacio("motivo_descarte")
    .max(500, "`motivo_descarte` no puede pasar de 500 caracteres.")
    .nullish()
    .describe("Con `cerrar_fase`: por qué se descartan los lotes que faltan, dicho por el usuario."),
  // El sellado.
  reanclar: booleano("reanclar")
    .nullish()
    .describe(
      "Solo para cambiar el ancla de un recibo sellado, por ejemplo cuando un rebase o un squash cambió el SHA: con `lote` " +
        "y el `commit` nuevo (o `artifact_path`). El contenido del lote no cambia. Pide confirmación al usuario."
    ),
  force: booleano("force")
    .nullish()
    .describe(
      "Solo si tu cliente no puede pedirle la confirmación al usuario directamente y el usuario la dio en el chat. " +
        "Nunca lo pongas sin esa confirmación."
    ),
};

export const getBatchStatusShape = {
  project: texto("project").nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
  task_name: texto("task_name").nullish().describe("Nombre de la carpeta de la tarea. Si lo omites, la tarea activa del proyecto."),
  reverificar: booleano("reverificar")
    .nullish()
    .describe("Repite la verificación de cada ancla: que su commit siga en la rama actual (tras un rebase o un squash) y que el sha256 de cada artefacto siga igual."),
};

const FILA_DE_ESTADO = z.object({
  lote: z.string(),
  repo: z.string().nullable(),
  objetivo: z.string().nullable(),
  commitPropuesto: z.string().nullable(),
  recibo: z.string().nullable(),
  estado: z.string().nullable(),
  ancla: z.object({ tipo: z.string(), resumen: z.string() }).nullable(),
  origen: z.enum(["servidor", "manual"]).nullable(),
  vigente: z.boolean().nullable(),
  problema: z.string().nullable(),
});

export const getBatchStatusSalidaShape = {
  tarea: z.string(),
  plan: z.string(),
  declarados: z.number().int(),
  cerrados: z.number().int(),
  siguiente: z.string(),
  faseCerrada: z.boolean(),
  lotes: z.array(FILA_DE_ESTADO),
  fueraDePlan: z.array(z.object({ codigo: z.literal("RECIBO-FUERA-DE-PLAN"), recibo: z.string() })),
  avisos: z.array(z.string()),
};

export const recordBatchSalidaShape = {
  recibo: z.string(),
  lote: z.string(),
  de: z.number().int(),
  estado: z.string(),
  ancla: z.object({ tipo: z.string(), resumen: z.string() }),
  avisos: z.array(z.string()),
  siguiente: z.string().nullable(),
  faseCerrada: z.boolean(),
  documentoDeFase: z.string().nullable(),
};

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
      manifiesto: z.string(),
      preset: z.object({ nombre: z.string(), origen: z.string() }).nullable(),
      reglas: z.object({ lotes: z.boolean(), commits: z.string() }).nullable(),
      repos: z.array(
        z.object({
          id: z.string(),
          ruta: z.string().nullable(),
          origen: z.string().nullable(),
          existe: z.boolean(),
          esGit: z.boolean(),
          rama: z.string().nullable(),
        })
      ),
      roots: z.object({ fuerza: z.enum(["fuerte", "debil"]).nullable() }).nullable(),
    })
  ),
  configuracion: z.object({
    configDir: z.string(),
    maquina: z.object({
      archivo: z.string(),
      existe: z.boolean(),
      valido: z.boolean(),
      overrides: z.number().int(),
      presetPorDefecto: z.string().nullable(),
    }),
    presets: z.array(z.object({ nombre: z.string(), origen: z.string(), ruta: z.string().nullable() })),
  }),
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
