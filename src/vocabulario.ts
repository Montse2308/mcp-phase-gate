// Los textos de los que depende el código, en los dos idiomas (§8.2 del plan maestro v3).
//
// Un prompt se puede reescribir entero sin que nada se rompa, salvo estos textos: los encabezados que el
// servidor busca (`## Validaciones pendientes`), las claves y los valores del frontmatter de recibos,
// índices, planes, prompts y presets, las secciones de un recibo, la cabecera de la tabla de lotes, las
// palabras de los marcadores (`ranura`, `bloque`) y la carpeta de los comandos. Viven aquí y en ningún
// otro sitio: traducir un prompt sin este módulo rompería en silencio la detección de pendientes o la
// lectura de recibos.
//
// Tres reglas:
//   - se ESCRIBE en el idioma del proyecto (recibos, índices y los bloques que añade el servidor);
//   - se LEE en los dos: un recibo en español sigue siendo un recibo para quien abre ese proyecto en inglés;
//   - los identificadores no se traducen: `L01…L99`, los ids de ranura (`fase-3/pruebas`), los SHA, las
//     rutas, los nombres de las tools y los de los presets. Las ranuras tienen además un alias en inglés
//     (`phase-3/tests`) que el parser acepta y resuelve al id canónico.
//
// Por dentro, el código trabaja siempre con los valores canónicos (los de la 2.x y la 3.0, en español):
// `estado: "verificado"`, `ancla: "pendiente"`. Este módulo traduce al escribir y normaliza al leer.

import type { EstadoLote, TituloCondicional } from "./recibos.js";

export type Idioma = "es" | "en";
export const IDIOMAS: readonly Idioma[] = ["es", "en"];

export function esIdioma(valor: unknown): valor is Idioma {
  return valor === "es" || valor === "en";
}

// Las claves canónicas del frontmatter de un recibo o de un índice, tal como se escriben en español.
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
    reanclado: string; // el principio de cada línea del historial de reanclajes
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
  vacio: string[]; // frases que cuentan como sección vacía
  frontmatterPrompt: { documento: string; documentoInicial: string; recibos: string };
  frontmatterPreset: { nombre: string; descripcion: string; lotes: string };
  marcadores: { ranura: string; bloque: string; modos: Record<ModoDeBloque, string> };
  carpetaComandos: string;
  seccionesEsqueleto: [string, string]; // BASE y PENDIENTES de las reglas globales
  // EVIDENCIA, BASE y PENDIENTES: las secciones de las reglas globales que las fases citan por su nombre.
  // doctor avisa si a un global-rules.md propio le falta alguna (hallazgo 13 de la auditoría de la Etapa 6:
  // vivían en diagnostico.ts y capas.ts, fuera del vocabulario).
  seccionesGlobales: [string, string, string];
  // La línea que se añade al final del prompt cuando una tarea se redacta en otro idioma (§8.3), escrita
  // en el idioma del proyecto, por idioma de redacción.
  lineaDeRedaccion: Record<Idioma, string>;
  documentos: {
    contextoInicial: string;
    // Los nombres de los documentos de fase de fábrica, para reconocer en qué idioma están las tareas de
    // un proyecto que no lo declara (§8.3, paso 2).
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

// ─── Alias de las ranuras ───────────────────────────────────────────────────
// El id canónico es el de los presets, `eject` y el Studio (`fase-3/pruebas`). Quien escribe en inglés
// puede usar el alias (`phase-3/tests`) en un marcador de ranura o de bloque; el parser lo resuelve al
// canónico, así que la procedencia, `eject` y los avisos hablan siempre del mismo id.
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

// El alias inglés de un nombre canónico, o el mismo nombre si no tiene (extra, commits, pr).
export function aliasInglesDeRanura(nombre: string): string {
  return Object.entries(ALIAS_DE_RANURA).find(([, canonico]) => canonico === nombre)?.[0] ?? nombre;
}

export function nombreCanonicoDeRanura(nombre: string): string {
  return ALIAS_DE_RANURA[nombre.toLowerCase()] ?? nombre;
}

// "phase-3" -> "fase-3"; "global" y "fase-3" quedan igual.
export function archivoCanonico(archivo: string): string {
  const fase = archivo.match(/^(?:fase|phase)-(\d+)$/i);
  return fase ? `fase-${fase[1]}` : archivo.toLowerCase() === "global" ? "global" : archivo;
}

// "phase-3/tests" -> "fase-3/pruebas". Un id que no es de ranura se devuelve tal cual.
export function idCanonicoDeRanura(id: string): string {
  const corte = id.indexOf("/");
  if (corte === -1) return id;
  return `${archivoCanonico(id.slice(0, corte))}/${nombreCanonicoDeRanura(id.slice(corte + 1))}`;
}

// El id en inglés de una ranura canónica, para la interfaz en inglés: "fase-3/pruebas" -> "phase-3/tests".
export function idInglesDeRanura(id: string): string {
  const [archivo = "", nombre = ""] = id.split("/");
  return `${archivo.replace(/^fase-/, "phase-")}/${aliasInglesDeRanura(nombre)}`;
}

// ─── Lectura en los dos idiomas ─────────────────────────────────────────────
function invertir<K extends string>(mapa: Record<K, string>): Map<string, K> {
  return new Map(Object.entries(mapa).map(([canonico, local]) => [(local as string).toLowerCase(), canonico as K]));
}

// Clave inglesa -> clave canónica, para el frontmatter de recibos, índices y planes.
const CLAVES_EN = invertir(EN.recibo.claves);

// El frontmatter con las claves canónicas. Con la misma clave en los dos idiomas, gana la canónica.
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

// "verified", "Verificado" -> "verificado"; null si no es un estado de ningún idioma.
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

// Las secciones de un recibo en los dos idiomas: título en minúsculas -> sección canónica.
const SECCIONES = new Map<string, SeccionDeRecibo>([...invertir(ES.recibo.secciones), ...invertir(EN.recibo.secciones)]);

export function seccionCanonica(titulo: string): SeccionDeRecibo | null {
  return SECCIONES.get(titulo.trim().normalize("NFC").toLowerCase()) ?? null;
}

// Lo que cuenta como "nada" en una sección de pendientes, en los dos idiomas.
export const FORMAS_DE_VACIO: ReadonlySet<string> = new Set(["", ...ES.vacio, ...EN.vacio]);

// En una sección de recibo, solo las formas de "nada" (no "sin pendientes"): un recibo escrito por el
// servidor tiene que volver a dar los mismos bytes al leerlo y escribirlo otra vez.
export const FORMAS_DE_VACIO_EN_RECIBO: ReadonlySet<string> = new Set(["", "nada", "ninguna", "ninguno", "n/a", "no aplica", "none", "nothing", "not applicable"]);

// Un valor del frontmatter de un prompt (documento, documento_inicial, recibos), en el idioma que venga.
export function valorDePrompt(meta: Record<string, string>, clave: keyof Vocabulario["frontmatterPrompt"]): string | undefined {
  return meta[ES.frontmatterPrompt[clave]] || meta[EN.frontmatterPrompt[clave]] || undefined;
}

export function valorDePreset(meta: Record<string, string>, clave: keyof Vocabulario["frontmatterPreset"]): string | undefined {
  return meta[ES.frontmatterPreset[clave]] || meta[EN.frontmatterPreset[clave]] || undefined;
}

// El `lotes: N` de un plan, o `batches: N`.
export function lotesDelFrontmatter(meta: Record<string, string>): string | undefined {
  return meta[ES.plan.claveLotes] ?? meta[EN.plan.claveLotes];
}

// El idioma en que está escrito un frontmatter de recibo o de índice: el de sus claves. Sin claves que lo
// digan, el canónico.
const SOLO_ES = new Set(Object.values(ES.recibo.claves).filter((clave) => !Object.values(EN.recibo.claves).includes(clave)));
const SOLO_EN = new Set(Object.values(EN.recibo.claves).filter((clave) => !Object.values(ES.recibo.claves).includes(clave)));

export function idiomaDeFrontmatter(meta: Record<string, string>): Idioma {
  const claves = Object.keys(meta).map((clave) => clave.toLowerCase());
  return claves.filter((clave) => SOLO_EN.has(clave)).length > claves.filter((clave) => SOLO_ES.has(clave)).length ? "en" : "es";
}

// El encabezado "## Validaciones pendientes" o "## Pending validations" (sin distinguir mayúsculas).
export const ENCABEZADOS_DE_PENDIENTES: readonly string[] = [ES.encabezados.validacionesPendientes, EN.encabezados.validacionesPendientes];

// La carpeta de comandos en los dos idiomas: una capa propia puede usar cualquiera.
export const CARPETAS_DE_COMANDOS: readonly string[] = [ES.carpetaComandos, EN.carpetaComandos];

// Los modos de un bloque, en los dos idiomas -> canónico.
const MODOS = new Map<string, ModoDeBloque>([...invertir(ES.marcadores.modos), ...invertir(EN.marcadores.modos)]);

export function modoCanonico(valor: string | undefined): ModoDeBloque | null {
  if (valor === undefined) return "reemplazar";
  return MODOS.get(valor.trim().toLowerCase()) ?? null;
}
