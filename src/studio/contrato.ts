// El contrato de la API del Studio: un shape zod por respuesta. Los tests validan cada respuesta con
// ellos, y el frontend importa los tipos (solo los tipos: `import type`, que no lleva zod al bundle).
//
// Las respuestas no llevan las rutas absolutas del equipo salvo donde la vista las necesita para
// decir dónde editar algo (el diagnóstico y las capas de prompts): una tarea se identifica por su
// proyecto y su nombre, no por su carpeta.

import { z } from "zod";

import { diagnosticoShape } from "../schemas.js";

export const ErrorApi = z.object({ error: z.string() });

// ─── /api/estado ────────────────────────────────────────────────────────────
export const Modo = z.enum(["vivo", "demo", "estatico"]);
// activo: el watcher avisa; degradado: el sondeo vio un cambio que el watcher no avisó; apagado: no hay.
export const EstadoDelWatcher = z.enum(["activo", "degradado", "apagado"]);

export const EstadoRespuesta = z.object({
  diagnostico: z.object(diagnosticoShape),
  studio: z.object({ version: z.string(), modo: Modo, watcher: EstadoDelWatcher }),
});

// ─── Tareas ─────────────────────────────────────────────────────────────────
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

// ─── Proyectos ──────────────────────────────────────────────────────────────
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
  respondio: z.boolean(), // false: git no contestó a tiempo
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
  presets: z.array(z.string()), // los disponibles, para el selector
  error: z.string().nullable(), // sin Documentación configurada, por ejemplo
});

// ─── Una tarea ──────────────────────────────────────────────────────────────
// La señal de cada estación del tablero (§7.7.2): forma, texto y color salen de aquí.
export const Senal = z.enum(["verde", "ambar", "rojo", "apagado"]);
export const TextoDeSenal = z.enum(["cerrada", "con pendientes", "en curso", "hueco", "pendiente"]);

export const Estacion = z.object({
  numero: z.number().int(), // 0 es el contexto inicial
  titulo: z.string(),
  documento: z.string(),
  existe: z.boolean(),
  senal: Senal,
  texto: TextoDeSenal,
  mtimeMs: z.number().nullable(),
  recibos: z.string().nullable(), // la subcarpeta, en la fase que la declara
});

export const TareaRespuesta = z.object({
  proyecto: z.string(),
  estado: EstadoTareaApi,
  estaciones: z.array(Estacion),
  recibos: z.array(z.string()), // "04 - Ejecución/L01 - x.md"
  compuerta: z.string().nullable(), // el aviso de compuerta que recibiría la fase siguiente
  pendientes: z.string().nullable(), // el aviso de pendientes heredados de la fase siguiente
});

export const DocumentoRespuesta = z.object({
  proyecto: z.string(),
  tarea: z.string(),
  archivo: z.string(),
  texto: z.string(),
  frontmatter: z.record(z.string(), z.string()),
  mtimeMs: z.number(),
});

// ─── Lotes ──────────────────────────────────────────────────────────────────
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
  // Lo que pinta el sello: el SHA corto, los 8 primeros del sha256 y la fecha del recibo.
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

// ─── Prompts ────────────────────────────────────────────────────────────────
export const RanuraApi = z.object({
  id: z.string(), // "fase-3/pruebas", "global/evidencia"
  contenidoDe: z.string(), // "fábrica", o "<archivo>:<línea>" del bloque que ganó
  capa: z.string(), // "fábrica", "preset: <nombre>", "reglas: <variante>", "global" o "proyecto"
  modos: z.array(z.string()),
  efectivo: z.string(),
  fabrica: z.string().nullable(), // null si la ranura no existe en el cuerpo de fábrica
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
  texto: z.string(), // el de get_phase_prompt para este proyecto y esta tarea
  capas: z.array(CapaApi),
  ranuras: z.array(RanuraApi),
  avisos: z.array(z.object({ severidad: z.enum(["error", "aviso", "info"]), codigo: z.string(), texto: z.string() })),
  preset: z.object({ nombre: z.string(), origen: z.string() }),
  reglas: z.object({ lotes: z.boolean(), commits: z.string() }),
  fases: z.array(z.object({ numero: z.number().int(), titulo: z.string() })),
});

// ─── Clientes ───────────────────────────────────────────────────────────────
export const PlanDeClienteApi = z.object({
  cliente: z.enum(["claude-code", "cursor", "vscode"]),
  nombre: z.string(),
  detectado: z.boolean(),
  estado: z.enum(["nuevo", "actualiza", "sin-cambios", "roto", "forma-rara", "clave-ocupada", "existente", "sin-lista", "sin-rutas"]),
  archivo: z.string().nullable(), // con ~ en lugar de la carpeta del usuario
  comando: z.string().nullable(),
  diff: z.string().nullable(),
  mensaje: z.string(),
});

export const ClientesRespuesta = z.object({ clientes: z.array(PlanDeClienteApi) });

// ─── Acciones (§7.6) ────────────────────────────────────────────────────────
export const PlanRespuesta = z.union([
  z.object({
    posible: z.literal(true),
    resumen: z.string(),
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
export type PlanRespuesta = z.infer<typeof PlanRespuesta>;
export type AplicarRespuesta = z.infer<typeof AplicarRespuesta>;
export type EstadoDelWatcher = z.infer<typeof EstadoDelWatcher>;
