// The arguments of each tool, declared once with zod.
//
// Reading the arguments with String(args?.x) validates nothing: without task_name, String(undefined) would
// create the task "undefined/" and leave it active. That is why everything goes through here before being
// used, and the error names the field.
//
// Shapes (the loose fields) are exported and not z.object(...): that is what the SDK's registerTool
// receives. The SDK generates from them the JSON Schema that the client sees —that is why each field
// carries its description here— and validates each call before the callback.
//
// The error messages go in each field, in the server's language, because the SDK delivers them as they are
// behind its English prefix ("Input validation error: Invalid arguments for tool …"). Without them the
// generic zod text would arrive ("expected string, received undefined"), which does not tell the model how
// to correct the call.
//
// The descriptions and the messages are fixed at startup, in one language: `shapesDe(idioma)` builds the
// input shapes of that language (once per language), and crearServidor asks for them with its own. The usual
// names (startTaskShape…) remain exported: they are those of the messages' language when used, and they are
// built on first use, not when this module is imported.
//
// The optionals are .nullish() and null counts as absent: some clients with models in strict mode send null
// in every optional field. A number as text (phase: "3") is not converted: it is rejected with a message
// that says what is expected. It is rare, the model corrects it on the first try, and converting it would
// complicate the JSON Schema that is generated from here.

import { z } from "zod";

import { NOMBRES_LOGICOS } from "./config.js";
import type { NombreLogico } from "./config.js";
import { idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";
import type { Idioma } from "./vocabulario.js";

const ID_REPO = /^[a-z0-9][a-z0-9-]{0,39}$/;
// The canonical values and also their English names (the English prompts use them). record_batch normalizes
// them to the canonical one before using them (normalizarEntradaDeLote).
const ESTADOS_DE_LOTE = ["verificado", "con pendientes", "fallido", "descartado", "verified", "with pending items", "failed", "discarded"] as const;
const TITULOS_CONDICIONALES = [
  "Lo que sigue igual",
  "Reversión",
  "Aviso a alguien más",
  "Deuda anotada",
  "What stays the same",
  "Rollback",
  "Heads-up to someone else",
  "Debt noted",
] as const;

// ─── Input shapes, in one language ──────────────────────────────────────────
function construirShapes(idioma: Idioma) {
  const t = (codigo: string, parametros: Record<string, unknown> = {}): string => mensaje(codigo, parametros, idioma);

  // The message of a field. null is also "missing": in an optional it is tolerated before getting here, in a
  // required one it is the same as not coming.
  const errorDe =
    (campo: string) =>
    (issue: z.core.$ZodRawIssue): string => {
      if (issue.input === undefined || issue.input === null) return t("TOOL-ARG-FALTA", { campo });
      if (issue.code === "invalid_type") return t("TOOL-ARG-TIPO", { campo, esperado: issue.expected });
      // The only maximum that can trigger is the one of the safe integer of `phase`.
      if (issue.code === "too_big") return t("TOOL-ARG-DEMASIADO-GRANDE", { campo });
      return t("TOOL-ARG-NO-VALIDO", { campo });
    };

  const texto = (campo: string) => z.string({ error: errorDe(campo) });

  // `recortar` trims the spaces BEFORE demanding the minimum: "   " counts as missing.
  const obligatorio = (campo: string, opciones: { recortar?: boolean } = {}) => {
    const base = opciones.recortar ? texto(campo).trim() : texto(campo);
    return base.min(1, t("TOOL-ARG-FALTA", { campo }));
  };

  const booleano = (campo: string) => z.boolean({ error: errorDe(campo) });

  // ─── Descriptions ─────────────────────────────────────────────────────────
  // They are static: they name no specific projects or phases. A description built at startup with the list
  // of projects and phases would go stale as soon as someone created a folder with the client open, because
  // the list of tools is not requested again. What changes lives in the resources phase-gate://estado and
  // phase-gate://fases, which do notify when they change.
  const PROYECTO = t("DESC-ARG-PROYECTO");
  // Where the project can be deduced from the open folder (MCP Roots).
  const DEDUCIBLE = t("DESC-ARG-DEDUCIBLE");
  const FASE = t("DESC-ARG-FASE");
  const TAREA = t("DESC-ARG-TAREA");
  const ARCHIVO = t("DESC-ARG-ARCHIVO");
  const PROJECT_NO_VACIO = t("TOOL-ARG-PROJECT-VACIO");
  const REPO_ID = t("TOOL-ARG-REPO-ID");

  const startTask = {
    project: texto("project").trim().min(1, PROJECT_NO_VACIO).nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
    task_name: obligatorio("task_name").describe(t("DESC-ARG-START-TASK-NAME")),
    initial_context: obligatorio("initial_context").describe(t("DESC-ARG-START-INITIAL-CONTEXT")),
    crear_proyecto: booleano("crear_proyecto").nullish().describe(t("DESC-ARG-START-CREAR-PROYECTO")),
    // The same parameter with its English name: either is valid (if both come, they must be equal).
    create_project: booleano("create_project").nullish().describe(t("DESC-ARG-START-CREATE-PROJECT")),
    repos: z
      .array(texto("repos"), { error: errorDe("repos") })
      .nullish()
      .describe(t("DESC-ARG-START-REPOS")),
    preset: texto("preset").nullish().describe(t("DESC-ARG-START-PRESET")),
    redaccion: z
      .enum(["es", "en"], { error: () => t("TOOL-ARG-REDACCION") })
      .nullish()
      .describe(t("DESC-ARG-START-REDACCION")),
  };

  const getPhasePrompt = {
    phase: z.number({ error: errorDe("phase") }).int({ error: errorDe("phase") }).describe(FASE),
    // A text of its own: here, without a project the tool does not fail, it delivers the prompt without the
    // project configuration.
    project: texto("project").nullish().describe(t("DESC-ARG-PROMPT-PROJECT")),
    task_name: texto("task_name").nullish().describe(t("DESC-ARG-PROMPT-TASK-NAME")),
  };

  const getActiveTask = {
    project: texto("project")
      .nullish()
      .describe(`${PROYECTO}${t("DESC-ARG-ACTIVA-SUFIJO")}`),
  };

  const listTasks = {
    project: texto("project").nullish().describe(`${PROYECTO}${t("DESC-ARG-LISTAR-SUFIJO")}`),
  };

  const switchTask = {
    project: texto("project").trim().min(1, PROJECT_NO_VACIO).nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
    task_name: obligatorio("task_name").describe(t("DESC-ARG-CAMBIAR-TASK-NAME")),
  };

  // The four are optional separately: which combination is valid is decided by resolveDocPath.
  const readCentralDoc = {
    project: texto("project").nullish().describe(`${PROYECTO}${t("DESC-ARG-LEER-SUFIJO")}${DEDUCIBLE}`),
    task_name: texto("task_name").nullish().describe(TAREA),
    file_name: texto("file_name").nullish().describe(ARCHIVO),
    file_path: texto("file_path").nullish().describe(t("DESC-ARG-LEER-FILE-PATH")),
  };

  const writeCentralDoc = {
    ...readCentralDoc,
    file_path: texto("file_path").nullish().describe(t("DESC-ARG-ESCRIBIR-FILE-PATH")),
    content: texto("content").describe(t("DESC-ARG-ESCRIBIR-CONTENT")),
    force: booleano("force").nullish().describe(t("DESC-ARG-ESCRIBIR-FORCE")),
  };

  const readCrossRepo = {
    repo_name: obligatorio("repo_name").describe(t("DESC-ARG-CROSS-REPO-NAME")),
    file_path: obligatorio("file_path").describe(t("DESC-ARG-CROSS-FILE-PATH")),
  };

  // ─── Repos of a project ───────────────────────────────────────────────────
  const REPO = t("DESC-ARG-REPO");

  const readRepoFile = {
    project: texto("project").nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
    repo: texto("repo").regex(ID_REPO, REPO_ID).describe(REPO),
    path: obligatorio("path").describe(t("DESC-ARG-REPO-FILE-PATH")),
  };

  const repoStatus = {
    project: texto("project").nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
    repo: texto("repo")
      .regex(ID_REPO, REPO_ID)
      .nullish()
      .describe(`${REPO}${t("DESC-ARG-REPO-STATUS-SUFIJO")}`),
  };

  // ─── Batches of Phase 4 ───────────────────────────────────────────────────
  const textoNoVacio = (campo: string) => texto(campo).trim().min(1, t("TOOL-ARG-NO-VACIO", { campo }));

  const FILA_ARCHIVO = z
    .object({ archivo: textoNoVacio("archivo"), cambio: textoNoVacio("cambio") }, { error: errorDe("archivos") })
    .strict();
  const FILA_ESPERA = z
    .object({ prueba: textoNoVacio("prueba"), esperado: textoNoVacio("esperado") }, { error: errorDe("espera_al_usuario") })
    .strict();
  const CONDICIONAL = z
    .object(
      {
        titulo: z.enum(TITULOS_CONDICIONALES, { error: () => t("TOOL-ARG-TITULO-CONDICIONAL", { titulos: TITULOS_CONDICIONALES.join(", ") }) }),
        texto: textoNoVacio("texto"),
      },
      { error: errorDe("condicionales") }
    )
    .strict();

  const PROYECTO_QUE_ESCRIBE = `${PROYECTO}${t("DESC-ARG-QUE-ESCRIBE")}`;
  const LOTE_RANGO = t("TOOL-ARG-LOTE-RANGO");

  const recordBatch = {
    project: texto("project").nullish().describe(PROYECTO_QUE_ESCRIBE),
    task_name: texto("task_name").nullish().describe(t("DESC-ARG-LOTE-TASK-NAME")),
    lote: z
      .number({ error: errorDe("lote") })
      .int({ error: errorDe("lote") })
      .min(1, LOTE_RANGO)
      .max(99, LOTE_RANGO)
      .describe(t("DESC-ARG-LOTE")),
    // The content: required when creating the receipt; omitted when only anchoring a pending receipt.
    titulo: textoNoVacio("titulo")
      .max(120, t("TOOL-ARG-MAX-CARACTERES", { campo: "titulo", max: 120 }))
      .nullish()
      .describe(t("DESC-ARG-LOTE-TITULO")),
    repo: texto("repo")
      .regex(ID_REPO, REPO_ID)
      .nullish()
      .describe(`${REPO}${t("DESC-ARG-LOTE-REPO-SUFIJO")}`),
    estado: z
      .enum(ESTADOS_DE_LOTE, { error: () => t("TOOL-ARG-ESTADO") })
      .nullish()
      .describe(t("DESC-ARG-LOTE-ESTADO")),
    que_se_hizo: textoNoVacio("que_se_hizo").nullish().describe(t("DESC-ARG-LOTE-QUE-SE-HIZO")),
    archivos: z
      .array(FILA_ARCHIVO, { error: errorDe("archivos") })
      .max(200, t("TOOL-ARG-MAX-FILAS", { campo: "archivos", max: 200 }))
      .nullish()
      .describe(t("DESC-ARG-LOTE-ARCHIVOS")),
    verificacion: textoNoVacio("verificacion").nullish().describe(t("DESC-ARG-LOTE-VERIFICACION")),
    espera_al_usuario: z
      .array(FILA_ESPERA, { error: errorDe("espera_al_usuario") })
      .max(50, t("TOOL-ARG-MAX-FILAS", { campo: "espera_al_usuario", max: 50 }))
      .nullish()
      .describe(t("DESC-ARG-LOTE-ESPERA")),
    desvios: texto("desvios").nullish().describe(t("DESC-ARG-LOTE-DESVIOS")),
    decisiones: texto("decisiones").nullish().describe(t("DESC-ARG-LOTE-DECISIONES")),
    condicionales: z
      .array(CONDICIONAL, { error: errorDe("condicionales") })
      .max(4, t("TOOL-ARG-MAX-SECCIONES", { campo: "condicionales", max: 4 }))
      .nullish()
      .describe(t("DESC-ARG-LOTE-CONDICIONALES")),
    // The anchor: at most one of the three.
    commit: texto("commit").nullish().describe(t("DESC-ARG-LOTE-COMMIT")),
    artifact_path: texto("artifact_path").nullish().describe(t("DESC-ARG-LOTE-ARTIFACT")),
    verification_note: textoNoVacio("verification_note")
      .max(2000, t("TOOL-ARG-MAX-CARACTERES", { campo: "verification_note", max: 2000 }))
      .nullish()
      .describe(t("DESC-ARG-LOTE-NOTE")),
    // Closing the phase.
    cerrar_fase: booleano("cerrar_fase").nullish().describe(t("DESC-ARG-LOTE-CERRAR")),
    motivo_descarte: textoNoVacio("motivo_descarte")
      .max(500, t("TOOL-ARG-MAX-CARACTERES", { campo: "motivo_descarte", max: 500 }))
      .nullish()
      .describe(t("DESC-ARG-LOTE-MOTIVO")),
    // Sealing.
    reanclar: booleano("reanclar").nullish().describe(t("DESC-ARG-LOTE-REANCLAR")),
    force: booleano("force").nullish().describe(t("DESC-ARG-LOTE-FORCE")),
  };

  const getBatchStatus = {
    project: texto("project").nullish().describe(`${PROYECTO}${DEDUCIBLE}`),
    task_name: texto("task_name").nullish().describe(t("DESC-ARG-LOTE-TASK-NAME")),
    reverificar: booleano("reverificar").nullish().describe(t("DESC-ARG-REVERIFICAR")),
  };

  return {
    startTask,
    getPhasePrompt,
    getActiveTask,
    listTasks,
    switchTask,
    readCentralDoc,
    writeCentralDoc,
    readCrossRepo,
    // get_orchestrator_status receives nothing.
    getOrchestratorStatus: {},
    readRepoFile,
    repoStatus,
    recordBatch,
    getBatchStatus,
  };
}

export type ShapesDeEntrada = ReturnType<typeof construirShapes>;

const porIdioma = new Map<Idioma, ShapesDeEntrada>();

// The input shapes of all the tools, with descriptions and messages in `idioma`. They are built once per
// language: two servers in the same language share the same objects.
export function shapesDe(idioma: Idioma): ShapesDeEntrada {
  let shapes = porIdioma.get(idioma);
  if (!shapes) {
    shapes = construirShapes(idioma);
    porIdioma.set(idioma, shapes);
  }
  return shapes;
}

// An input shape with the usual name, in the language of the messages when used. It is resolved on first
// access (not on import: the messages are not requested when a module loads) and it behaves like the real
// object for reading its fields, walking it or passing it to z.object.
function perezoso<K extends keyof ShapesDeEntrada>(clave: K): ShapesDeEntrada[K] {
  const real = (): object => shapesDe(idiomaDeMensajes())[clave];
  return new Proxy(
    {},
    {
      get: (_, propiedad) => Reflect.get(real(), propiedad),
      has: (_, propiedad) => Reflect.has(real(), propiedad),
      ownKeys: () => Reflect.ownKeys(real()),
      getOwnPropertyDescriptor: (_, propiedad) => {
        const descriptor = Reflect.getOwnPropertyDescriptor(real(), propiedad);
        return descriptor ? { ...descriptor, configurable: true } : undefined;
      },
    }
  ) as ShapesDeEntrada[K];
}

// ─── Input shapes with their usual name ─────────────────────────────────────
export const startTaskShape = perezoso("startTask");
export const getPhasePromptShape = perezoso("getPhasePrompt");
export const getActiveTaskShape = perezoso("getActiveTask");
export const listTasksShape = perezoso("listTasks");
export const switchTaskShape = perezoso("switchTask");
export const readCentralDocShape = perezoso("readCentralDoc");
export const writeCentralDocShape = perezoso("writeCentralDoc");
export const readCrossRepoShape = perezoso("readCrossRepo");
export const getOrchestratorStatusShape = {};
export const readRepoFileShape = perezoso("readRepoFile");
export const repoStatusShape = perezoso("repoStatus");
export const recordBatchShape = perezoso("recordBatch");
export const getBatchStatusShape = perezoso("getBatchStatus");

// ─── Outputs ────────────────────────────────────────────────────────────────
// They carry no descriptions: their structure is the same in both languages.

// Output of repo_status: the state of each repo, field by field (EstadoDeRepo in repos.ts).
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

// ─── Output of get_orchestrator_status ──────────────────────────────────────
// The Diagnostico object of diagnostico.ts, field by field. With an outputSchema the client also receives
// `structuredContent`, and the SDK checks before sending it that it matches this shape: if diagnostico.ts
// changes and this does not, the tool fails in the tests instead of lying to the client.
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
      fuente: z.enum(["entorno", ".env", "machine.json", "sin definir"]),
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
      manifiesto: z.enum(["válido", "ausente", "inválido"]),
      errorDelManifiesto: z.string().nullable(),
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

// null counts as absent: it is removed once, on entering the tool, so that no tool has to distinguish
// between a field that did not come and one that came empty.
export type SinNulos<T> = { [K in keyof T]: Exclude<T[K], null> };

export function sinNulos<T extends Record<string, unknown>>(args: T): SinNulos<T> {
  return Object.fromEntries(Object.entries(args).filter(([, valor]) => valor !== null)) as SinNulos<T>;
}
