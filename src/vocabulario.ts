// The texts the code depends on, in both languages.
//
// A prompt can be rewritten whole without anything breaking, except these texts: the headings the server
// looks for (`## Validaciones pendientes`), the keys and values of the frontmatter of receipts, indexes,
// plans, prompts and presets, the sections of a receipt, the header of the batches table, the words of the
// markers (`ranura`, `bloque`) and the commands folder. They live here and nowhere else: translating a
// prompt without this module would silently break the detection of pending items or the reading of receipts.
//
// Three rules:
//   - it is WRITTEN in the project's language (receipts, indexes and the blocks the server adds);
//   - it is READ in both: a receipt in Spanish is still a receipt for whoever opens that project in English;
//   - identifiers are not translated: `L01…L99`, slot ids (`fase-3/pruebas`), SHAs, paths, tool names and
//     preset names. Slots also have an English alias (`phase-3/tests`) that the parser accepts and resolves
//     to the canonical id.
//
// Inside, the code always works with the canonical values (those of 2.x and 3.0, in Spanish):
// `estado: "verificado"`, `ancla: "pendiente"`. This module translates when writing and normalizes when
// reading.

import type { EstadoLote, TituloCondicional } from "./recibos.js";

export type Idioma = "es" | "en";
export const IDIOMAS: readonly Idioma[] = ["es", "en"];

export function esIdioma(valor: unknown): valor is Idioma {
  return valor === "es" || valor === "en";
}

// The canonical keys of the frontmatter of a receipt or an index, as they are written in Spanish.
export type ClaveDeRecibo =
  | "lote"
  | "de"
  | "repo"
  | "rama"
  | "estado"
  | "commit"
  | "fecha"
  | "ancla"
  | "commit_completo"
  | "asunto"
  | "artefacto"
  | "sha256"
  | "bytes"
  | "nota"
  | "registrado"
  | "origen"
  | "lotes"
  | "generado_por";

export type SeccionDeRecibo = "queSeHizo" | "archivos" | "verificacion" | "esperaAlUsuario" | "desvios" | "decisiones" | "verificacionDelCommit";
export type TipoDeAncla = "commit" | "sha256" | "nota" | "pendiente";
export type ModoDeBloque = "reemplazar" | "antes" | "despues";

export type Vocabulario = {
  encabezados: {
    validacionesPendientes: string;
    evidencia: string;
    base: string;
    pendientesHeredados: string;
    reglasAdicionales: string;
    archivosDeLaTarea: string;
    configuracionDelProyecto: string;
    configuracionDelManifiesto: string;
    commitsDeLaFase: (fase: number | string) => string;
    commitsVerificados: (fase: number | string) => string;
    compuerta: string;
    pendientesDetectados: string;
    recibosQueExisten: (tarea: string) => string;
  };
  recibo: {
    claves: Record<ClaveDeRecibo, string>;
    estados: Record<EstadoLote, string>;
    anclas: Record<TipoDeAncla, string>;
    commitPendiente: string;
    noAplica: string;
    origen: Record<"servidor" | "manual", string>;
    secciones: Record<SeccionDeRecibo, string>;
    condicionales: Record<TituloCondicional, string>;
    vacias: Record<Exclude<SeccionDeRecibo, "verificacionDelCommit">, string>;
    tablaArchivos: [string, string];
    tablaEspera: [string, string];
    reanclado: string; // the start of each line of the re-anchoring history
    descartadoAlCerrar: string;
    tituloPorDefecto: (lote: number) => string;
    notaPorDefecto: (estado: string) => string;
  };
  indice: {
    plan: string;
    rama: string;
    cierre: string;
    estado: string;
    lotes: string;
    variasRamas: string;
    cerradaSinPendientes: string;
    cerradaConPendientes: string;
    descartados: (n: number) => string;
    tablaLotes: string[];
    tablaLotesSinRepo: string[];
    sinRecibo: string;
    esperaAlUsuario: string;
    tablaEspera: string[];
    sinVerificacion: string;
    anclaNota: string;
    anclaPendiente: string;
  };
  plan: { claveLotes: string; cabeceraTablaLotes: string[]; columnaLote: string; columnaObjetivo: string; columnaCommit: string };
  vacio: string[]; // phrases that count as an empty section
  frontmatterPrompt: { documento: string; documentoInicial: string; recibos: string };
  frontmatterPreset: { nombre: string; descripcion: string; lotes: string };
  marcadores: { ranura: string; bloque: string; modos: Record<ModoDeBloque, string> };
  carpetaComandos: string;
  seccionesEsqueleto: [string, string]; // BASE and PENDIENTES of the global rules
  // EVIDENCIA, BASE and PENDIENTES: the sections of the global rules that the phases cite by name. doctor
  // warns if a global-rules.md of one's own lacks any of them.
  seccionesGlobales: [string, string, string];
  // The line added at the end of the prompt when a task is written in another language, written in the
  // project's language, per writing language.
  lineaDeRedaccion: Record<Idioma, string>;
  documentos: {
    contextoInicial: string;
    // The names of the factory phase documents, to recognize which language the tasks of a project that does
    // not declare it are in.
    deFase: string[];
  };
};

const ES: Vocabulario = {
  encabezados: {
    validacionesPendientes: "Validaciones pendientes",
    evidencia: "EVIDENCIA",
    base: "BASE DE CADA DECISIÓN",
    pendientesHeredados: "PENDIENTES HEREDADOS",
    reglasAdicionales: "REGLAS ADICIONALES",
    archivosDeLaTarea: "ARCHIVOS DE ESTA TAREA (nombres exactos)",
    configuracionDelProyecto: "CONFIGURACIÓN DEL PROYECTO",
    configuracionDelManifiesto: "CONFIGURACIÓN DEL PROYECTO (la declara phase-gate.json)",
    commitsDeLaFase: (fase) => `COMMITS DE LA FASE ${fase}`,
    commitsVerificados: (fase) => `COMMITS DE LA FASE ${fase} (verificados por el servidor al entregar este prompt)`,
    compuerta: "ATENCIÓN — COMPUERTA DE FASE",
    pendientesDetectados: "PENDIENTES HEREDADOS (detectados por el servidor)",
    recibosQueExisten: (tarea) => `RECIBOS QUE YA EXISTEN EN LA TAREA "${tarea}"`,
  },
  recibo: {
    claves: {
      lote: "lote",
      de: "de",
      repo: "repo",
      rama: "rama",
      estado: "estado",
      commit: "commit",
      fecha: "fecha",
      ancla: "ancla",
      commit_completo: "commit_completo",
      asunto: "asunto",
      artefacto: "artefacto",
      sha256: "sha256",
      bytes: "bytes",
      nota: "nota",
      registrado: "registrado",
      origen: "origen",
      lotes: "lotes",
      generado_por: "generado_por",
    },
    estados: { verificado: "verificado", "con pendientes": "con pendientes", fallido: "fallido", descartado: "descartado" },
    anclas: { commit: "commit", sha256: "sha256", nota: "nota", pendiente: "pendiente" },
    commitPendiente: "pendiente",
    noAplica: "no aplica",
    origen: { servidor: "servidor", manual: "manual" },
    secciones: {
      queSeHizo: "Qué se hizo",
      archivos: "Archivos",
      verificacion: "Verificación ejecutada",
      esperaAlUsuario: "Espera al usuario",
      desvios: "Desvíos del plan",
      decisiones: "Decisiones",
      verificacionDelCommit: "Verificación del commit",
    },
    condicionales: {
      "Lo que sigue igual": "Lo que sigue igual",
      Reversión: "Reversión",
      "Aviso a alguien más": "Aviso a alguien más",
      "Deuda anotada": "Deuda anotada",
    },
    vacias: { queSeHizo: "Nada.", archivos: "Ninguno.", verificacion: "Ninguna.", esperaAlUsuario: "Ninguna.", desvios: "Ninguno.", decisiones: "Ninguna." },
    tablaArchivos: ["Archivo", "Qué cambió"],
    tablaEspera: ["Prueba", "Resultado esperado"],
    reanclado: "Reanclado el ",
    descartadoAlCerrar: "No se hizo: se descartó al cerrar la fase.",
    tituloPorDefecto: (lote) => `Lote ${lote}`,
    notaPorDefecto: (estado) => `no aplica (lote ${estado})`,
  },
  indice: {
    plan: "Plan",
    rama: "Rama",
    cierre: "Cierre",
    estado: "Estado",
    lotes: "Lotes",
    variasRamas: "varias (ver lotes)",
    cerradaSinPendientes: "Fase cerrada sin pendientes",
    cerradaConPendientes: "Fase cerrada con pendientes (ver abajo)",
    descartados: (n) => `${n} ${n === 1 ? "lote descartado" : "lotes descartados"}`,
    tablaLotes: ["Lote", "Repo", "Objetivo", "Estado", "Ancla", "Recibo"],
    tablaLotesSinRepo: ["Lote", "Objetivo", "Estado", "Ancla", "Recibo"],
    sinRecibo: "sin recibo",
    esperaAlUsuario: "Espera al usuario",
    tablaEspera: ["Lote", "Prueba", "Resultado esperado"],
    sinVerificacion: "sin verificación registrada",
    anclaNota: "nota",
    anclaPendiente: "pendiente",
  },
  plan: {
    claveLotes: "lotes",
    cabeceraTablaLotes: ["Lote", "Repo", "Objetivo", "Pasos", "Criterio de salida", "Commit propuesto", "Revierte solo"],
    columnaLote: "lote",
    columnaObjetivo: "objetivo",
    columnaCommit: "commit propuesto",
  },
  vacio: ["ninguna", "ninguno", "ninguna pendiente", "nada", "sin pendientes", "no hay pendientes", "fase cerrada sin pendientes", "n/a", "no aplica"],
  frontmatterPrompt: { documento: "documento", documentoInicial: "documento_inicial", recibos: "recibos" },
  frontmatterPreset: { nombre: "nombre", descripcion: "descripcion", lotes: "lotes" },
  marcadores: { ranura: "ranura", bloque: "bloque", modos: { reemplazar: "reemplazar", antes: "antes", despues: "despues" } },
  carpetaComandos: "comandos",
  seccionesEsqueleto: ["BASE DE CADA DECISIÓN", "PENDIENTES HEREDADOS"],
  seccionesGlobales: ["EVIDENCIA", "BASE DE CADA DECISIÓN", "PENDIENTES HEREDADOS"],
  lineaDeRedaccion: {
    es: "Escribe el contenido de los documentos de esta tarea en español. Los encabezados, nombres de archivo y claves se mantienen como están.",
    en: "Escribe el contenido de los documentos de esta tarea en inglés. Los encabezados, nombres de archivo y claves se mantienen como están.",
  },
  documentos: {
    contextoInicial: "00 - Contexto Inicial.md",
    deFase: ["01 - Análisis Técnico.md", "02 - Decisiones.md", "03 - Plan Técnico.md", "04 - Ejecución.md", "05 - Auditoría.md"],
  },
};

const EN: Vocabulario = {
  encabezados: {
    validacionesPendientes: "Pending validations",
    evidencia: "EVIDENCE",
    base: "BASIS OF EACH DECISION",
    pendientesHeredados: "INHERITED PENDING ITEMS",
    reglasAdicionales: "ADDITIONAL RULES",
    archivosDeLaTarea: "FILES OF THIS TASK (exact names)",
    configuracionDelProyecto: "PROJECT CONFIGURATION",
    configuracionDelManifiesto: "PROJECT CONFIGURATION (declared by phase-gate.json)",
    commitsDeLaFase: (fase) => `PHASE ${fase} COMMITS`,
    commitsVerificados: (fase) => `PHASE ${fase} COMMITS (verified by the server when delivering this prompt)`,
    compuerta: "ATTENTION — PHASE GATE",
    pendientesDetectados: "INHERITED PENDING ITEMS (detected by the server)",
    recibosQueExisten: (tarea) => `RECEIPTS THAT ALREADY EXIST IN TASK "${tarea}"`,
  },
  recibo: {
    claves: {
      lote: "batch",
      de: "of",
      repo: "repo",
      rama: "branch",
      estado: "status",
      commit: "commit",
      fecha: "date",
      ancla: "anchor",
      commit_completo: "full_commit",
      asunto: "subject",
      artefacto: "artifact",
      sha256: "sha256",
      bytes: "bytes",
      nota: "note",
      registrado: "recorded",
      origen: "origin",
      lotes: "batches",
      generado_por: "generated_by",
    },
    estados: { verificado: "verified", "con pendientes": "with pending items", fallido: "failed", descartado: "discarded" },
    anclas: { commit: "commit", sha256: "sha256", nota: "note", pendiente: "pending" },
    commitPendiente: "pending",
    noAplica: "not applicable",
    origen: { servidor: "server", manual: "manual" },
    secciones: {
      queSeHizo: "What was done",
      archivos: "Files",
      verificacion: "Verification run",
      esperaAlUsuario: "Awaiting the user",
      desvios: "Deviations from the plan",
      decisiones: "Decisions",
      verificacionDelCommit: "Commit check",
    },
    condicionales: {
      "Lo que sigue igual": "What stays the same",
      Reversión: "Rollback",
      "Aviso a alguien más": "Heads-up to someone else",
      "Deuda anotada": "Debt noted",
    },
    vacias: { queSeHizo: "Nothing.", archivos: "None.", verificacion: "None.", esperaAlUsuario: "None.", desvios: "None.", decisiones: "None." },
    tablaArchivos: ["File", "What changed"],
    tablaEspera: ["Test", "Expected result"],
    reanclado: "Re-anchored on ",
    descartadoAlCerrar: "Not done: discarded when the phase was closed.",
    tituloPorDefecto: (lote) => `Batch ${lote}`,
    notaPorDefecto: (estado) => `not applicable (${estado} batch)`,
  },
  indice: {
    plan: "Plan",
    rama: "Branch",
    cierre: "Closed",
    estado: "Status",
    lotes: "Batches",
    variasRamas: "several (see batches)",
    cerradaSinPendientes: "Phase closed with no pending items",
    cerradaConPendientes: "Phase closed with pending items (see below)",
    descartados: (n) => `${n} ${n === 1 ? "batch discarded" : "batches discarded"}`,
    tablaLotes: ["Batch", "Repo", "Goal", "Status", "Anchor", "Receipt"],
    tablaLotesSinRepo: ["Batch", "Goal", "Status", "Anchor", "Receipt"],
    sinRecibo: "no receipt",
    esperaAlUsuario: "Awaiting the user",
    tablaEspera: ["Batch", "Test", "Expected result"],
    sinVerificacion: "no verification recorded",
    anclaNota: "note",
    anclaPendiente: "pending",
  },
  plan: {
    claveLotes: "batches",
    cabeceraTablaLotes: ["Batch", "Repo", "Goal", "Steps", "Exit criterion", "Proposed commit", "Reverts alone"],
    columnaLote: "batch",
    columnaObjetivo: "goal",
    columnaCommit: "proposed commit",
  },
  vacio: ["none", "nothing", "no pending items", "nothing pending", "phase closed with no pending items", "n/a", "not applicable"],
  frontmatterPrompt: { documento: "document", documentoInicial: "initial_document", recibos: "receipts" },
  frontmatterPreset: { nombre: "name", descripcion: "description", lotes: "batches" },
  marcadores: { ranura: "slot", bloque: "block", modos: { reemplazar: "replace", antes: "before", despues: "after" } },
  carpetaComandos: "commands",
  seccionesEsqueleto: ["BASIS OF EACH DECISION", "INHERITED PENDING ITEMS"],
  seccionesGlobales: ["EVIDENCE", "BASIS OF EACH DECISION", "INHERITED PENDING ITEMS"],
  lineaDeRedaccion: {
    es: "Write the content of this task's documents in Spanish. Headings, file names and keys stay as they are.",
    en: "Write the content of this task's documents in English. Headings, file names and keys stay as they are.",
  },
  documentos: {
    contextoInicial: "00 - Initial Context.md",
    deFase: ["01 - Technical Analysis.md", "02 - Decisions.md", "03 - Technical Plan.md", "04 - Execution.md", "05 - Audit.md"],
  },
};

export const VOCABULARIO: Record<Idioma, Vocabulario> = { es: ES, en: EN };

export function vocabulario(idioma: Idioma = "es"): Vocabulario {
  return VOCABULARIO[idioma];
}

// ─── Slot aliases ───────────────────────────────────────────────────────────
// The canonical id is the one of the presets, `eject` and the Studio (`fase-3/pruebas`). Whoever writes in
// English can use the alias (`phase-3/tests`) in a slot or block marker; the parser resolves it to the
// canonical one, so the origin, `eject` and the warnings always speak of the same id.
export const ALIAS_DE_RANURA: Readonly<Record<string, string>> = {
  "zero-breakage": "cero-rupturas",
  evidence: "evidencia",
  role: "rol",
  verification: "verificacion",
  examples: "ejemplos",
  checks: "comprobaciones",
  batches: "lotes",
  tests: "pruebas",
  "forbidden-batches": "prohibido-lotes",
  "self-check-batches": "autoverificacion-lotes",
  "forbidden-commits": "prohibido-commits",
  "self-check-commits": "autoverificacion-commits",
};

// The English alias of a canonical name, or the same name if it has none (extra, commits, pr).
export function aliasInglesDeRanura(nombre: string): string {
  return Object.entries(ALIAS_DE_RANURA).find(([, canonico]) => canonico === nombre)?.[0] ?? nombre;
}

export function nombreCanonicoDeRanura(nombre: string): string {
  return ALIAS_DE_RANURA[nombre.toLowerCase()] ?? nombre;
}

// "phase-3" -> "fase-3"; "global" and "fase-3" stay the same.
export function archivoCanonico(archivo: string): string {
  const fase = archivo.match(/^(?:fase|phase)-(\d+)$/i);
  return fase ? `fase-${fase[1]}` : archivo.toLowerCase() === "global" ? "global" : archivo;
}

// "phase-3/tests" -> "fase-3/pruebas". An id that is not a slot's is returned as is.
export function idCanonicoDeRanura(id: string): string {
  const corte = id.indexOf("/");
  if (corte === -1) return id;
  return `${archivoCanonico(id.slice(0, corte))}/${nombreCanonicoDeRanura(id.slice(corte + 1))}`;
}

// The English id of a canonical slot, for the English interface: "fase-3/pruebas" -> "phase-3/tests".
export function idInglesDeRanura(id: string): string {
  const [archivo = "", nombre = ""] = id.split("/");
  return `${archivo.replace(/^fase-/, "phase-")}/${aliasInglesDeRanura(nombre)}`;
}

// ─── Reading in both languages ──────────────────────────────────────────────
function invertir<K extends string>(mapa: Record<K, string>): Map<string, K> {
  return new Map(Object.entries(mapa).map(([canonico, local]) => [(local as string).toLowerCase(), canonico as K]));
}

// English key -> canonical key, for the frontmatter of receipts, indexes and plans.
const CLAVES_EN = invertir(EN.recibo.claves);

// The frontmatter with the canonical keys. With the same key in both languages, the canonical one wins.
export function normalizarClaves(meta: Record<string, string>): Record<string, string> {
  const normal: Record<string, string> = {};
  for (const [clave, valor] of Object.entries(meta)) {
    const canonica = CLAVES_EN.get(clave.toLowerCase());
    if (canonica && canonica !== clave && meta[canonica] !== undefined) continue;
    normal[canonica ?? clave] = valor;
  }
  return normal;
}

const ESTADOS = new Map<string, EstadoLote>([...invertir(ES.recibo.estados), ...invertir(EN.recibo.estados)]);
const TIPOS_DE_ANCLA = new Map<string, TipoDeAncla>([...invertir(ES.recibo.anclas), ...invertir(EN.recibo.anclas)]);
const CONDICIONALES = new Map<string, TituloCondicional>([...invertir(ES.recibo.condicionales), ...invertir(EN.recibo.condicionales)]);

// "verified", "Verificado" -> "verificado"; null if it is not a state in either language.
export function estadoCanonico(valor: string | undefined): EstadoLote | null {
  return ESTADOS.get((valor ?? "").trim().toLowerCase()) ?? null;
}

export function tipoDeAnclaCanonico(valor: string | undefined): TipoDeAncla | null {
  return TIPOS_DE_ANCLA.get((valor ?? "").trim().toLowerCase()) ?? null;
}

export function condicionalCanonica(titulo: string): TituloCondicional | null {
  return CONDICIONALES.get(titulo.trim().normalize("NFC").toLowerCase()) ?? null;
}

export function esOrigenServidor(valor: string | undefined): boolean {
  const limpio = (valor ?? "").trim().toLowerCase();
  return limpio === ES.recibo.origen.servidor || limpio === EN.recibo.origen.servidor;
}

export function esCommitNoAplica(valor: string): boolean {
  const limpio = valor.trim().toLowerCase();
  return limpio === ES.recibo.noAplica || limpio === EN.recibo.noAplica;
}

// The sections of a receipt in both languages: lowercase title -> canonical section.
const SECCIONES = new Map<string, SeccionDeRecibo>([...invertir(ES.recibo.secciones), ...invertir(EN.recibo.secciones)]);

export function seccionCanonica(titulo: string): SeccionDeRecibo | null {
  return SECCIONES.get(titulo.trim().normalize("NFC").toLowerCase()) ?? null;
}

// What counts as "nothing" in a pending section, in both languages.
export const FORMAS_DE_VACIO: ReadonlySet<string> = new Set(["", ...ES.vacio, ...EN.vacio]);

// In a receipt section, only the forms of "nothing" (not "sin pendientes"): a receipt written by the server
// has to give the same bytes again when read and written back.
export const FORMAS_DE_VACIO_EN_RECIBO: ReadonlySet<string> = new Set(["", "nada", "ninguna", "ninguno", "n/a", "no aplica", "none", "nothing", "not applicable"]);

// A value of a prompt's frontmatter (documento, documento_inicial, recibos), in whichever language it comes.
export function valorDePrompt(meta: Record<string, string>, clave: keyof Vocabulario["frontmatterPrompt"]): string | undefined {
  return meta[ES.frontmatterPrompt[clave]] || meta[EN.frontmatterPrompt[clave]] || undefined;
}

export function valorDePreset(meta: Record<string, string>, clave: keyof Vocabulario["frontmatterPreset"]): string | undefined {
  return meta[ES.frontmatterPreset[clave]] || meta[EN.frontmatterPreset[clave]] || undefined;
}

// The `lotes: N` of a plan, or `batches: N`.
export function lotesDelFrontmatter(meta: Record<string, string>): string | undefined {
  return meta[ES.plan.claveLotes] ?? meta[EN.plan.claveLotes];
}

// The language a receipt's or an index's frontmatter is written in: that of its keys. Without keys that say
// it, the canonical one.
const SOLO_ES = new Set(Object.values(ES.recibo.claves).filter((clave) => !Object.values(EN.recibo.claves).includes(clave)));
const SOLO_EN = new Set(Object.values(EN.recibo.claves).filter((clave) => !Object.values(ES.recibo.claves).includes(clave)));

export function idiomaDeFrontmatter(meta: Record<string, string>): Idioma {
  const claves = Object.keys(meta).map((clave) => clave.toLowerCase());
  return claves.filter((clave) => SOLO_EN.has(clave)).length > claves.filter((clave) => SOLO_ES.has(clave)).length ? "en" : "es";
}

// The "## Validaciones pendientes" or "## Pending validations" heading (case-insensitive).
export const ENCABEZADOS_DE_PENDIENTES: readonly string[] = [ES.encabezados.validacionesPendientes, EN.encabezados.validacionesPendientes];

// The commands folder in both languages: a layer of one's own can use either.
export const CARPETAS_DE_COMANDOS: readonly string[] = [ES.carpetaComandos, EN.carpetaComandos];

// The modes of a block, in both languages -> canonical.
const MODOS = new Map<string, ModoDeBloque>([...invertir(ES.marcadores.modos), ...invertir(EN.marcadores.modos)]);

export function modoCanonico(valor: string | undefined): ModoDeBloque | null {
  if (valor === undefined) return "reemplazar";
  return MODOS.get(valor.trim().toLowerCase()) ?? null;
}
