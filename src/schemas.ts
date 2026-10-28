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
// Los mensajes de error van en cada campo, en el idioma del servidor (§8.5), porque el SDK los entrega
// tal cual detrás de su prefijo en inglés ("Input validation error: Invalid arguments for tool …"). Sin
// ellos llegaría el texto genérico de zod ("expected string, received undefined"), que no le dice al
// modelo cómo corregir la llamada.
//
// Las descripciones y los mensajes se fijan al arrancar, en un idioma: `shapesDe(idioma)` construye los
// shapes de entrada de ese idioma (una vez por idioma), y crearServidor los pide con el suyo. Los nombres
// de siempre (startTaskShape…) siguen exportados: son los del idioma de los mensajes al usarlos, y se
// construyen al primer uso, no al importar este módulo.
//
// Los opcionales son .nullish() y null cuenta como ausente: algunos clientes con modelos en
// modo estricto mandan null en todo campo opcional. Un número en texto (phase: "3") no se
// convierte: se rechaza con un mensaje que dice qué se espera. Es raro, el modelo lo corrige
// al primer intento, y convertirlo complicaría el JSON Schema que se genera desde aquí.

import { z } from "zod";

import { NOMBRES_LOGICOS } from "./config.js";
import type { NombreLogico } from "./config.js";
import { idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";
import type { Idioma } from "./vocabulario.js";

const ID_REPO = /^[a-z0-9][a-z0-9-]{0,39}$/;
// Los valores canónicos y, desde la Etapa 6, también sus nombres en inglés (los usan los prompts en inglés).
// record_batch los normaliza al canónico antes de usarlos (normalizarEntradaDeLote).
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

// ─── Shapes de entrada, en un idioma ────────────────────────────────────────
function construirShapes(idioma: Idioma) {
  const t = (codigo: string, parametros: Record<string, unknown> = {}): string => mensaje(codigo, parametros, idioma);

  // El mensaje de un campo. null también es "falta": en un opcional se tolera antes de llegar aquí,
  // en un obligatorio es lo mismo que no venir.
  const errorDe =
    (campo: string) =>
    (issue: z.core.$ZodRawIssue): string => {
      if (issue.input === undefined || issue.input === null) return t("TOOL-ARG-FALTA", { campo });
      if (issue.code === "invalid_type") return t("TOOL-ARG-TIPO", { campo, esperado: issue.expected });
      // El único máximo que puede saltar es el del entero seguro de `phase`.
      if (issue.code === "too_big") return t("TOOL-ARG-DEMASIADO-GRANDE", { campo });
      return t("TOOL-ARG-NO-VALIDO", { campo });
    };

  const texto = (campo: string) => z.string({ error: errorDe(campo) });

  // `recortar` quita los espacios ANTES de exigir el mínimo: "   " cuenta como que falta.
  const obligatorio = (campo: string, opciones: { recortar?: boolean } = {}) => {
    const base = opciones.recortar ? texto(campo).trim() : texto(campo);
    return base.min(1, t("TOOL-ARG-FALTA", { campo }));
  };

  const booleano = (campo: string) => z.boolean({ error: errorDe(campo) });

  // ─── Descripciones ────────────────────────────────────────────────────────
  // Son estáticas: no nombran proyectos ni fases concretas. Antes se armaban al arrancar con la
  // lista de proyectos y de fases, y se quedaban viejas en cuanto alguien creaba una carpeta con el
  // cliente abierto, porque la lista de tools no se vuelve a pedir. Lo que cambia vive ahora en los
  // recursos phase-gate://estado y phase-gate://fases, que sí avisan cuando cambian.
  const PROYECTO = t("DESC-ARG-PROYECTO");
  // Donde el proyecto se puede deducir de la carpeta abierta (MCP Roots, Etapa 3).
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
    // El mismo parámetro con su nombre en inglés: vale cualquiera de los dos (si vienen los dos, iguales).
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
    // Un texto propio: aquí, sin proyecto la tool no falla, entrega el prompt sin configuración de
    // proyecto (hallazgo 8 de la auditoría de la Etapa 3).
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

  // Los cuatro son opcionales por separado: qué combinación vale lo decide resolveDocPath.
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

  // ─── Repos de un proyecto (Etapa 3) ───────────────────────────────────────
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

  // ─── Lotes de la Fase 4 (Etapa 4) ─────────────────────────────────────────
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
    // El contenido: obligatorio al crear el recibo; se omite al solo anclar un recibo pendiente.
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
    // El ancla: como mucho una de las tres.
    commit: texto("commit").nullish().describe(t("DESC-ARG-LOTE-COMMIT")),
    artifact_path: texto("artifact_path").nullish().describe(t("DESC-ARG-LOTE-ARTIFACT")),
    verification_note: textoNoVacio("verification_note")
      .max(2000, t("TOOL-ARG-MAX-CARACTERES", { campo: "verification_note", max: 2000 }))
      .nullish()
      .describe(t("DESC-ARG-LOTE-NOTE")),
    // El cierre de la fase.
    cerrar_fase: booleano("cerrar_fase").nullish().describe(t("DESC-ARG-LOTE-CERRAR")),
    motivo_descarte: textoNoVacio("motivo_descarte")
      .max(500, t("TOOL-ARG-MAX-CARACTERES", { campo: "motivo_descarte", max: 500 }))
      .nullish()
      .describe(t("DESC-ARG-LOTE-MOTIVO")),
    // El sellado.
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
    // get_orchestrator_status no recibe nada.
    getOrchestratorStatus: {},
    readRepoFile,
    repoStatus,
    recordBatch,
    getBatchStatus,
  };
}

export type ShapesDeEntrada = ReturnType<typeof construirShapes>;

const porIdioma = new Map<Idioma, ShapesDeEntrada>();

// Los shapes de entrada de todas las tools, con descripciones y mensajes en `idioma`. Se construyen una
// vez por idioma: dos servidores en el mismo idioma comparten los mismos objetos.
export function shapesDe(idioma: Idioma): ShapesDeEntrada {
  let shapes = porIdioma.get(idioma);
  if (!shapes) {
    shapes = construirShapes(idioma);
    porIdioma.set(idioma, shapes);
  }
  return shapes;
}

// Un shape de entrada con el nombre de siempre, en el idioma de los mensajes al usarlo. Se resuelve al
// primer acceso (no al importar: los mensajes no se piden al cargar un módulo) y se comporta como el
// objeto de verdad para leer sus campos, recorrerlo o pasarlo a z.object.
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

// ─── Shapes de entrada con su nombre de siempre ─────────────────────────────
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

// ─── Salidas ────────────────────────────────────────────────────────────────
// No llevan descripciones: su estructura es la misma en los dos idiomas.

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

// null cuenta como ausente: se quita una vez, al entrar en la tool, para que ninguna tenga que
// distinguir entre un campo que no vino y uno que vino vacío.
export type SinNulos<T> = { [K in keyof T]: Exclude<T[K], null> };

export function sinNulos<T extends Record<string, unknown>>(args: T): SinNulos<T> {
  return Object.fromEntries(Object.entries(args).filter(([, valor]) => valor !== null)) as SinNulos<T>;
}
