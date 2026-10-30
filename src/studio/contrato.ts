// The Studio API contract: one zod shape per response. The tests validate each response against them, and the
// frontend imports the types (only the types, with `import type`, so zod does not reach the bundle).
//
// Responses do not carry this machine's absolute paths except where the view needs them to say where to edit
// something (the diagnostic, the prompt layers and Ajustes): a task is identified by its project and its name,
// not by its folder.

import { z } from "zod";

import { diagnosticoShape } from "../schemas.js";

export const ErrorApi = z.object({ error: z.string() });

// ─── /api/estado ────────────────────────────────────────────────────────────
export const Modo = z.enum(["vivo", "demo", "estatico"]);
// activo: the watcher reports; degradado: polling saw a change the watcher did not report; apagado: there is none.
export const EstadoDelWatcher = z.enum(["activo", "degradado", "apagado"]);

export const EstadoRespuesta = z.object({
  diagnostico: z.object(diagnosticoShape),
  studio: z.object({ version: z.string(), modo: Modo, watcher: EstadoDelWatcher }),
});

// ─── Tasks ──────────────────────────────────────────────────────────────────
export const Progreso = z.object({
  total: z.number().int().nullable(),
  cerrados: z.number().int(),
  actual: z.number().int().nullable(),
  pendienteDeCommit: z.number().int().nullable(),
});

export const EstadoTareaApi = z.object({
  tarea: z.string(),
  fasesHechas: z.array(z.number().int()),
  siguienteFase: z.number().int().nullable(),
  fasesConDocumento: z.number().int(),
  ultimoCambio: z.number().nullable(),
  lotes: Progreso.nullable(),
  descripcion: z.string(), // describeEstado
});

export const TareasRespuesta = z.object({
  proyecto: z.string(),
  activa: z.object({ tarea: z.string(), origen: z.enum(["puntero", "deducida"]) }).nullable(),
  tareas: z.array(EstadoTareaApi),
});

// ─── Projects ───────────────────────────────────────────────────────────────
export const RepoApi = z.object({
  id: z.string(),
  rol: z.string().nullable(),
  origenRuta: z.enum(["machine.json", "PHASE_GATE_REPOS_PATH"]).nullable(),
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
  respondio: z.boolean(), // false: git did not answer in time
  error: z.string().nullable(),
});

export const SesionApi = z.object({
  pid: z.number().int(),
  cliente: z.string(),
  proyecto: z.string().nullable(),
  desde: z.string(),
  actualizado: z.string(),
});

export const ProyectoApi = z.object({
  nombre: z.string(),
  manifiesto: z.object({ estado: z.enum(["valido", "ausente", "invalido"]), error: z.string().nullable() }),
  preset: z.object({ nombre: z.string(), origen: z.string() }).nullable(),
  reglas: z.object({ lotes: z.boolean(), commits: z.string(), origenLotes: z.string(), origenCommits: z.string() }).nullable(),
  errorDeConfiguracion: z.string().nullable(),
  repos: z.array(RepoApi),
  tareas: z.number().int(),
  activa: z
    .object({
      tarea: z.string(),
      origen: z.enum(["puntero", "deducida"]),
      descripcion: z.string(),
      siguienteFase: z.number().int().nullable(),
      lotes: Progreso.nullable(),
    })
    .nullable(),
  sesiones: z.array(SesionApi),
});

export const ProyectosRespuesta = z.object({
  proyectos: z.array(ProyectoApi),
  presets: z.array(z.string()),
  error: z.string().nullable(), // no Documentation configured, for example
});

// ─── One task ───────────────────────────────────────────────────────────────
// The signal of each station on the board: shape, text and colour all come from here.
export const Senal = z.enum(["verde", "ambar", "rojo", "apagado"]);
export const TextoDeSenal = z.enum(["cerrada", "con pendientes", "en curso", "hueco", "pendiente"]);

export const Estacion = z.object({
  numero: z.number().int(), // 0 is the initial context
  titulo: z.string(),
  documento: z.string(),
  existe: z.boolean(),
  senal: Senal,
  texto: TextoDeSenal,
  mtimeMs: z.number().nullable(),
  recibos: z.string().nullable(), // the subfolder, in the phase that declares it
});

export const TareaRespuesta = z.object({
  proyecto: z.string(),
  estado: EstadoTareaApi,
  estaciones: z.array(Estacion),
  recibos: z.array(z.string()), // "04 - Ejecución/L01 - x.md"
  compuerta: z.string().nullable(), // the gate warning the next phase would receive
  pendientes: z.string().nullable(), // the warning about pending items inherited by the next phase
});

export const DocumentoRespuesta = z.object({
  proyecto: z.string(),
  tarea: z.string(),
  archivo: z.string(),
  texto: z.string(),
  frontmatter: z.record(z.string(), z.string()),
  mtimeMs: z.number(),
});

// ─── Batches ────────────────────────────────────────────────────────────────
export const FilaDeLote = z.object({
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
  // What the seal paints: the short SHA, the first 8 characters of the sha256 and the receipt's date.
  sello: z.object({ corto: z.string().nullable(), sha256: z.string().nullable(), fecha: z.string().nullable() }).nullable(),
});

export const LotesRespuesta = z.union([
  z.object({
    disponible: z.literal(true),
    estado: z.object({
      tarea: z.string(),
      plan: z.string(),
      declarados: z.number().int(),
      cerrados: z.number().int(),
      siguiente: z.string(),
      faseCerrada: z.boolean(),
      lotes: z.array(FilaDeLote),
      fueraDePlan: z.array(z.object({ codigo: z.literal("RECIBO-FUERA-DE-PLAN"), recibo: z.string() })),
      avisos: z.array(z.string()),
    }),
    reverificado: z.boolean(),
  }),
  z.object({ disponible: z.literal(false), motivo: z.string() }),
]);

// ─── Log (bitácora) ─────────────────────────────────────────────────────────
export const EventoDeBitacora = z.object({
  tipo: z.enum(["documento", "recibo", "commit", "reanclaje", "fase-cerrada"]),
  fecha: z.string(), // ISO; a re-anchor only carries the day
  titulo: z.string(),
  archivo: z.string().nullable(),
  lote: z.string().nullable(),
  commit: z.object({ corto: z.string(), asunto: z.string() }).nullable(),
});

export const BitacoraRespuesta = z.object({ proyecto: z.string(), tarea: z.string(), eventos: z.array(EventoDeBitacora) });

// ─── Prompts ────────────────────────────────────────────────────────────────
export const RanuraApi = z.object({
  id: z.string(), // "fase-3/pruebas", "global/evidencia"
  contenidoDe: z.string(), // "fábrica", or "<file>:<line>" of the block that won
  capa: z.string(), // "fábrica", "preset: <name>", "reglas: <variant>", "global" or "proyecto"
  modos: z.array(z.string()),
  efectivo: z.string(),
  fabrica: z.string().nullable(), // null if the slot does not exist in the factory body
});

export const CapaApi = z.object({
  orden: z.number(),
  etiqueta: z.enum(["fábrica", "preset", "reglas", "global", "proyecto"]),
  ruta: z.string(),
  existe: z.boolean(),
});

export const PromptRespuesta = z.object({
  proyecto: z.string(),
  fase: z.number().int(),
  tarea: z.string().nullable(),
  texto: z.string(), // what get_phase_prompt returns for this project and task
  capas: z.array(CapaApi),
  ranuras: z.array(RanuraApi),
  avisos: z.array(z.object({ severidad: z.enum(["error", "aviso", "info"]), codigo: z.string(), texto: z.string() })),
  preset: z.object({ nombre: z.string(), origen: z.string() }),
  reglas: z.object({ lotes: z.boolean(), commits: z.string() }),
  fases: z.array(z.object({ numero: z.number().int(), titulo: z.string() })),
});

// ─── Clients ────────────────────────────────────────────────────────────────
export const PlanDeClienteApi = z.object({
  cliente: z.enum(["claude-code", "cursor", "vscode"]),
  nombre: z.string(),
  detectado: z.boolean(),
  estado: z.enum(["nuevo", "actualiza", "sin-cambios", "roto", "forma-rara", "clave-ocupada", "existente", "sin-lista", "sin-rutas"]),
  archivo: z.string().nullable(), // with ~ instead of the user's folder
  comando: z.string().nullable(),
  diff: z.string().nullable(),
  mensaje: z.string(),
});

export const ClientesRespuesta = z.object({ clientes: z.array(PlanDeClienteApi) });

// ─── /api/ajustes ───────────────────────────────────────────────────────────
// For each path of this machine and for the language: what machine.json says, what really applies and where it
// comes from; and who overrides it with their own env.
export const NombreDeCampo = z.enum(["documentacion", "carpetaDeRepos", "subcarpetaTareas", "idioma"]);

export const CampoAjustes = z.object({
  campo: NombreDeCampo,
  variable: z.string(),
  enMaquina: z.string().nullable(),
  efectivo: z.string().nullable(),
  fuente: z.enum(["entorno", ".env", "machine.json", "sistema", "por defecto", "sin definir"]),
  // This same Studio, through its environment or its .env, uses another value than machine.json: the first warning.
  propioStudioPisa: z.boolean(),
  // Its environment or its .env say something machine.json does not have: it can be saved there.
  sinGuardar: z.boolean(),
});

// What an env says of a field, compared with machine.json.
export const EnvDeCliente = z.object({
  campo: NombreDeCampo,
  variable: z.string(),
  valor: z.string(),
  estado: z.enum(["pisa", "coincide", "sin-valor-en-maquina"]),
});

export const EntradaDeCliente = z.object({
  clave: z.string(),
  ambito: z.enum(["archivo", "usuario", "local"]),
  carpeta: z.string().nullable(), // in Claude Code, the folder of a local scope
  variables: z.array(EnvDeCliente),
});

export const ClienteAjustes = z.object({
  cliente: z.enum(["claude-code", "cursor", "vscode"]),
  nombre: z.string(),
  archivo: z.string(), // with ~ instead of the user's folder
  lectura: z.enum(["leido", "no-existe", "ilegible"]),
  entradas: z.array(EntradaDeCliente),
});

// An open server, of any client: its paths are the ones it received at start.
export const SesionDeAjustes = z.object({
  pid: z.number().int(),
  cliente: z.string(),
  proyecto: z.string().nullable(),
  sinRutas: z.boolean(), // it is a 3.x server, which does not record its paths
  variables: z.array(EnvDeCliente),
});

export const AvanzadaApi = z.object({
  logica: z.string(),
  variable: z.string(),
  descripcion: z.string(),
  valor: z.string().nullable(),
  usada: z.string().nullable(),
  fuente: z.enum(["entorno", ".env", "machine.json", "sin definir"]),
  comoCambiarla: z.string(),
});

export const AjustesRespuesta = z.object({
  maquina: z.object({
    estado: z.enum(["ausente", "valido", "invalido"]),
    error: z.string().nullable(),
    // With the file broken, this process goes on with the last valid one it read.
    deMemoria: z.boolean(),
    version: z.number().int().nullable(),
    // The preset for projects without a manifest, as machine.json says it (null: it does not say).
    presetPorDefecto: z.string().nullable(),
  }),
  campos: z.array(CampoAjustes),
  clientes: z.array(ClienteAjustes),
  sesiones: z.array(SesionDeAjustes),
  avanzadas: z.array(AvanzadaApi),
});

// ─── /api/ajustes/proyectos/:p ──────────────────────────────────────────────
// What the per-project page ("cada proyecto") edits: what phase-gate.json says (null: the key is not there and the preset
// or the team decides), what really applies, and the own path of each repo in this machine's machine.json.
export const AjustesDeProyecto = z.object({
  proyecto: z.string(),
  manifiesto: z.object({ estado: z.enum(["valido", "ausente", "invalido"]), error: z.string().nullable() }),
  archivo: z
    .object({
      preset: z.string().nullable(),
      idioma: z.enum(["es", "en"]).nullable(),
      lotes: z.boolean().nullable(),
      commits: z.string().nullable(),
      verificacion: z.array(z.string()).nullable(),
      prPorRepo: z.boolean().nullable(),
      repos: z.array(z.object({ id: z.string(), dir: z.string(), rol: z.string().nullable() })),
    })
    .nullable(),
  // delPreset: what the preset alone decides, without the file: what applies if the key is removed.
  efectivo: z
    .object({ preset: z.string(), origenDelPreset: z.string(), lotes: z.boolean(), commits: z.string(), delPreset: z.object({ lotes: z.boolean(), commits: z.string() }) })
    .nullable(),
  rutasPropias: z.record(z.string(), z.string()),
});

// ─── Actions ────────────────────────────────────────────────────────────────
export const PlanRespuesta = z.union([
  z.object({
    posible: z.literal(true),
    resumen: z.string(),
    // What the plan warns about and does not prevent: a path that does not exist, a receipt that cites a repo being removed.
    avisos: z.array(z.string()),
    diff: z.string(),
    huella: z.string().regex(/^[0-9a-f]{64}$/),
    cambios: z.array(z.object({ archivo: z.string(), tipo: z.enum(["crear", "reemplazar", "comando"]) })),
  }),
  z.object({ posible: z.literal(false), motivo: z.string() }),
]);
export const AplicarRespuesta = z.object({ hecho: z.literal(true), mensaje: z.string(), archivos: z.array(z.string()), copias: z.array(z.string()) });

export type EstadoRespuesta = z.infer<typeof EstadoRespuesta>;
export type EstadoTareaApi = z.infer<typeof EstadoTareaApi>;
export type TareasRespuesta = z.infer<typeof TareasRespuesta>;
export type RepoApi = z.infer<typeof RepoApi>;
export type SesionApi = z.infer<typeof SesionApi>;
export type ProyectoApi = z.infer<typeof ProyectoApi>;
export type ProyectosRespuesta = z.infer<typeof ProyectosRespuesta>;
export type Senal = z.infer<typeof Senal>;
export type Estacion = z.infer<typeof Estacion>;
export type TareaRespuesta = z.infer<typeof TareaRespuesta>;
export type DocumentoRespuesta = z.infer<typeof DocumentoRespuesta>;
export type FilaDeLote = z.infer<typeof FilaDeLote>;
export type LotesRespuesta = z.infer<typeof LotesRespuesta>;
export type RanuraApi = z.infer<typeof RanuraApi>;
export type CapaApi = z.infer<typeof CapaApi>;
export type PromptRespuesta = z.infer<typeof PromptRespuesta>;
export type PlanDeClienteApi = z.infer<typeof PlanDeClienteApi>;
export type ClientesRespuesta = z.infer<typeof ClientesRespuesta>;
export type Modo = z.infer<typeof Modo>;
export type EventoDeBitacora = z.infer<typeof EventoDeBitacora>;
export type BitacoraRespuesta = z.infer<typeof BitacoraRespuesta>;
export type PlanRespuesta = z.infer<typeof PlanRespuesta>;
export type NombreDeCampo = z.infer<typeof NombreDeCampo>;
export type CampoAjustes = z.infer<typeof CampoAjustes>;
export type EnvDeCliente = z.infer<typeof EnvDeCliente>;
export type EntradaDeCliente = z.infer<typeof EntradaDeCliente>;
export type ClienteAjustes = z.infer<typeof ClienteAjustes>;
export type SesionDeAjustes = z.infer<typeof SesionDeAjustes>;
export type AvanzadaApi = z.infer<typeof AvanzadaApi>;
export type AjustesRespuesta = z.infer<typeof AjustesRespuesta>;
export type AjustesDeProyecto = z.infer<typeof AjustesDeProyecto>;
export type AplicarRespuesta = z.infer<typeof AplicarRespuesta>;
export type EstadoDelWatcher = z.infer<typeof EstadoDelWatcher>;
