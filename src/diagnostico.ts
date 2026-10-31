// X-ray of the installation: which version runs and from where, where each variable came from, which prompt
// file wins in each phase, which projects there are and what their active task is at, and the warnings that
// are deduced from all that.
//
// It is a single source for three outputs: `npx mcp-phase-gate doctor`, the tool `get_orchestrator_status`
// and the resource `phase-gate://estado`. If each one built its own diagnosis, they would say different
// things exactly the day someone compares them to understand why something does not work.
//
// It only reads. It writes nothing and does not throw on incomplete configuration: diagnosing a broken
// installation is precisely what it exists for, so each part catches its own error and turns it into a
// finding.

import * as fs from "fs";
import * as path from "path";
import {
  DOCS,
  MODULE_DIR,
  NOMBRES_LOGICOS,
  REPOS,
  SERVER_NAME,
  SERVER_VERSION,
  CLAVE_EN_MAQUINA,
  TASKS_SUBDIR_POR_DEFECTO,
  VARIABLES,
  configDir,
  errorDeEnv,
  idiomaDeEtiqueta,
  idiomaDeMaquina,
  idiomaDelEntorno,
  idiomaDelSistema,
  leerVariable,
  promptsLayers,
  requireBasePath,
  stateFile,
  valorDeMaquina,
} from "./config.js";
import type { LecturaVariable, NombreLogico, RutaRequerida } from "./config.js";
import { discoverProjects, estaDentro, findProjectFolder, leerTextoAcotado, requireProjectFolder } from "./paths.js";
import { SECCIONES_ESQUELETO, capasDe, configuracionDe, contextoInicialDe, ensamblarFase, fasesDe, frontmatterDeTarea, revisarBloques, textoDeReinyeccion } from "./capas.js";
import type { ConfiguracionProyecto, Procedencia } from "./capas.js";
import { conCacheDelIdioma, conflictoDeIdioma, copiasEnConflicto, describirPresets, idiomaDelProyecto, leerManifiesto, leerMaquina, manifiestoDe, presetsDisponibles, resolverRepos } from "./manifiesto.js";
import type { LecturaMaquina, Preset, RepoResuelto } from "./manifiesto.js";
import { PLAZO_DE_ESTADOS_MS, estadoDeRepoSincrono, estadosConPlazo } from "./repos.js";
import type { EstadoDeRepo } from "./repos.js";
import { fuerzaPorProyecto, resolverPorRaices } from "./roots.js";
import { GLOBAL_RULES_FILE, discoverPhases, esCarpeta, leerPromptNormalizado, resolveCommandFile, resolveGlobalRules } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { describeEstado, leerPunteros, listarTareas, tareaActiva } from "./tasks.js";
import type { EstadoTarea } from "./tasks.js";
import { reverificar } from "./anclas.js";
import { ensamblarIndice, faseEnCarpeta, lotesDelPlan, recibosDeLaTarea } from "./lotes.js";
import type { FaseDeLotes, ReciboEnDisco } from "./lotes.js";
import { GENERADO_POR, etiquetaDeLote, frontmatterDeRecibo } from "./recibos.js";
import { idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";
import { VOCABULARIO, idInglesDeRanura } from "./vocabulario.js";
import type { Idioma } from "./vocabulario.js";

export type Severidad = "error" | "aviso" | "info";
export type Hallazgo = { severidad: Severidad; codigo: string; texto: string };
export type EstadoRuta = { ruta?: string; existe: boolean; error?: string };
export type EtiquetaCapa = "fábrica" | "propia";
export type Via = "npx" | "global" | "dependencia" | "clon";

export type Diagnostico = {
  paquete: { version: string; ruta: string; via: Via };
  node: { version: string; plataforma: NodeJS.Platform };
  variables: LecturaVariable[];
  rutas: { docs: EstadoRuta; repos: EstadoRuta };
  estado: { archivo: string; existe: boolean; punteros: number };
  capas: { ruta: string; etiqueta: EtiquetaCapa; existe: boolean }[];
  reglasGlobales: { archivo: string | null; capa: string | null; faltan: string[] };
  fases: {
    numero: number;
    titulo: string;
    archivo: string;
    capa: string;
    documento?: string;
    recibos?: string;
    comando: string | null;
  }[];
  proyectos: {
    nombre: string;
    tareas: number;
    activa: { tarea: string; origen: "puntero" | "deducida"; fase: string } | null;
    // A canonical value, with no text inside; the error, apart and in the call's language.
    manifiesto: "válido" | "ausente" | "inválido";
    errorDelManifiesto: string | null;
    preset: { nombre: string; origen: string } | null; // null if it could not be resolved
    reglas: { lotes: boolean; commits: string } | null;
    repos: { id: string; ruta: string | null; origen: string | null; existe: boolean; esGit: boolean; rama: string | null }[];
    roots: { fuerza: "fuerte" | "debil" | null } | null; // null if the roots of the session are not known
  }[];
  configuracion: {
    configDir: string;
    maquina: { archivo: string; existe: boolean; valido: boolean; overrides: number; presetPorDefecto: string | null };
    presets: { nombre: string; origen: string; ruta: string | null }[];
  };
  cliente?: { nombre: string; version: string; capacidades: { elicitation: boolean; roots: boolean } };
  hallazgos: Hallazgo[];
};

// The sections of the global rules that the phases cite by name. A global-rules.md of one's own replaces the
// factory one (it is not added), so if it lacks one, the phases cite a rule that does not exist: doctor
// warns about it. They come from the vocabulary.
export const SECCIONES_GLOBALES: readonly string[] = VOCABULARIO.es.seccionesGlobales;
// The same ones, in an English global-rules.md: a section is there if it is in either.
export const SECCIONES_GLOBALES_EN: readonly string[] = VOCABULARIO.en.seccionesGlobales;

const ORDEN_SEVERIDAD: Record<Severidad, number> = { error: 0, aviso: 1, info: 2 };

// ─── How the package runs ───────────────────────────────────────────────────
// Only as information, never as a decision: the deduction can be wrong and nothing depends on it. It lets
// whoever reads the diagnosis know which copy is running, which is the first question when "I changed the
// prompt and it does not show".
export function deducirVia(ruta: string, entorno: NodeJS.ProcessEnv = process.env): Via {
  if (/[\\/]_npx[\\/]/.test(ruta)) return "npx";

  const prefijo = entorno.npm_config_prefix?.trim();
  if (prefijo) {
    const raizGlobal =
      process.platform === "win32" ? path.join(prefijo, "node_modules") : path.join(prefijo, "lib", "node_modules");
    if (estaDentro(raizGlobal, ruta)) return "global";
  }

  if (fs.existsSync(path.join(ruta, ".git"))) return "clon";
  return "dependencia";
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function estadoLegible(archivo: string): boolean {
  try {
    const crudo: unknown = JSON.parse(fs.readFileSync(archivo, "utf-8"));
    return crudo !== null && typeof crudo === "object" && !Array.isArray(crudo);
  } catch {
    return false;
  }
}

// What the environment or the .env say and override what machine.json says, with another value: the
// environment wins, and whoever put the variable in a client's "env" block rarely knows. It says which one
// wins and how to remove it.
function pisadasDeMaquina(variables: LecturaVariable[]): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const lectura of variables) {
    const clave = CLAVE_EN_MAQUINA[lectura.logica];
    if (!clave || lectura.usada === null || lectura.valor === undefined || (lectura.fuente !== "entorno" && lectura.fuente !== ".env")) continue;
    const guardado = valorDeMaquina(lectura.logica);
    if (guardado === undefined) continue;
    const comparable = (valor: string): string => (VARIABLES[lectura.logica].esRuta && valor.trim() ? path.resolve(valor.trim()) : valor.trim());
    if (comparable(guardado) === comparable(lectura.valor)) continue;
    hallazgos.push({
      severidad: "aviso",
      codigo: "VAR-PISA-MAQUINA",
      texto: mensaje("VAR-PISA-MAQUINA", { variable: lectura.usada, origen: lectura.fuente, clave: `rutas.${clave}`, valor: lectura.valor, guardado }),
    });
  }
  const delEntorno = idiomaDelEntorno();
  const deMaquina = idiomaDeMaquina();
  if (delEntorno && deMaquina && delEntorno !== deMaquina) {
    hallazgos.push({ severidad: "aviso", codigo: "LANG-PISA-MAQUINA", texto: mensaje("LANG-PISA-MAQUINA", { valor: process.env.PHASE_GATE_LANG ?? delEntorno, guardado: deMaquina }) });
  }
  return hallazgos;
}

function estadoRuta(requerida: RutaRequerida): EstadoRuta {
  try {
    return { ruta: requireBasePath(requerida), existe: true };
  } catch (error) {
    const { valor } = leerVariable(requerida.logica);
    return { ...(valor ? { ruta: path.resolve(valor) } : {}), existe: false, error: mensajeDe(error) };
  }
}

// ─── Layers and phases ──────────────────────────────────────────────────────
// The resource phase-gate://fases also uses them: it shows the same without the rest of the diagnosis.
export function capasDePrompts(): Diagnostico["capas"] {
  return promptsLayers().map((ruta, i) => ({
    ruta,
    etiqueta: (i === 0 ? "fábrica" : "propia") as EtiquetaCapa,
    existe: esCarpeta(ruta),
  }));
}

// The layer of a file is the highest one that contains it.
export function capaDeArchivo(archivo: string, capas: Diagnostico["capas"]): EtiquetaCapa | null {
  let encontrada: EtiquetaCapa | null = null;
  for (const capa of capas) if (estaDentro(capa.ruta, archivo)) encontrada = capa.etiqueta;
  return encontrada;
}

export function fasesConCapa(
  capas: Diagnostico["capas"] = capasDePrompts(),
  phases: Map<number, PhaseFile> = discoverPhases(capas.map((capa) => capa.ruta))
): Diagnostico["fases"] {
  const rutasCapas = capas.map((capa) => capa.ruta);
  return [...phases.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, datos]) => ({
      numero,
      titulo: datos.title,
      archivo: datos.file,
      capa: capaDeArchivo(datos.file, capas) ?? "desconocida",
      ...(datos.documento ? { documento: datos.documento } : {}),
      ...(datos.recibos ? { recibos: datos.recibos } : {}),
      comando: resolveCommandFile(numero, rutasCapas),
    }));
}

// The phases the tasks of a project are deduced with. If its manifest cannot be read, those of no project:
// the finding already says so.
function fasesDelProyecto(carpetaProyecto: string, sinProyecto: Map<number, PhaseFile>): Map<number, PhaseFile> {
  try {
    return fasesDe(carpetaProyecto);
  } catch {
    return sinProyecto;
  }
}

// ─── The configuration of a project ─────────────────────────────────────────
type ContextoDeConfiguracion = {
  maquina: LecturaMaquina;
  presets: Map<string, Preset>;
  presetPorDefecto: string | null;
  fuerzas: Map<string, "fuerte" | "debil"> | null;
  estado: { gitAusente: boolean; gitLento: boolean };
  // Computed beforehand, without blocking (the server); without this, synchronous git (doctor in the terminal).
  estados: EstadosDeRepos | null;
};

// The git state of each repo, by "<PROJECT>/<id>". null: it did not answer within the deadline.
export type EstadosDeRepos = Map<string, EstadoDeRepo | null>;

type ConfiguracionDiagnosticada = Pick<Diagnostico["proyectos"][number], "manifiesto" | "errorDelManifiesto" | "preset" | "reglas" | "repos" | "roots">;

function configuracionDelProyecto(
  nombre: string,
  tareas: EstadoTarea[],
  ctx: ContextoDeConfiguracion,
  hallar: (severidad: Severidad, codigo: string, texto: string) => void
): ConfiguracionDiagnosticada {
  const lectura = leerManifiesto(nombre);
  if (lectura.estado === "invalido") hallar("error", lectura.codigo === "PRESET-NO-EXISTE" ? "PRESET-NO-EXISTE" : "MANIFIESTO-INVALIDO", lectura.error);

  const conflictos = copiasEnConflicto(nombre);
  if (conflictos.length) {
    hallar(
      "aviso",
      "MANIFIESTO-CONFLICTO",
      mensaje("MANIFIESTO-CONFLICTO", { proyecto: nombre, copias: conflictos })
    );
  }

  // The tasks that declare a preset that does not exist would fail when their prompt is requested.
  let contexto: string | null = null;
  try {
    contexto = contextoInicialDe(nombre);
  } catch {
    contexto = null; // invalid manifest: already warned
  }
  const sinPresetPropio = tareas.filter((tarea) => {
    const declarado = contexto ? frontmatterDeTarea(tarea.folderPath, contexto).preset : null;
    if (declarado && !ctx.presets.has(declarado)) {
      hallar("error", "PRESET-NO-EXISTE", mensaje("PRESET-NO-EXISTE", { tarea: tarea.taskName, proyecto: nombre, preset: declarado, disponibles: describirPresets(ctx.presets) }));
    }
    return !declarado;
  });

  if (lectura.estado === "ausente" && !ctx.presetPorDefecto && sinPresetPropio.length) {
    hallar(
      "aviso",
      "PRESET-IMPLICITO",
      mensaje("PRESET-IMPLICITO", { proyecto: nombre, tareas: sinPresetPropio.length })
    );
  }

  let config: ConfiguracionProyecto | null = null;
  try {
    config = configuracionDe(nombre);
  } catch {
    config = null; // invalid manifest or a preset that does not exist: already warned
  }

  if (config) {
    try {
      for (const h of revisarBloques(capasDe(nombre))) hallar(h.severidad, h.codigo, h.texto);
    } catch {
      // Whatever prevents building the layers is already warned above.
    }
  }

  const repos: Diagnostico["proyectos"][number]["repos"] = [];
  if (config?.manifiesto) {
    const maquina = ctx.maquina.estado === "invalido" ? { ...ctx.maquina, repos: new Map<string, string>() } : ctx.maquina;
    for (const repo of resolverRepos(nombre, config.manifiesto.repos, maquina)) {
      let esGit = false;
      let rama: string | null = null;
      if (repo.ruta && !repo.existe) {
        hallar("aviso", "REPO-NO-EXISTE", mensaje("REPO-NO-EXISTE", { repo: repo.id, proyecto: nombre, ruta: repo.ruta, origen: repo.origenRuta }));
      } else if (repo.existe && !ctx.estado.gitAusente) {
        const estado = ctx.estados ? (ctx.estados.get(`${nombre}/${repo.id}`) ?? null) : estadoDeRepoSincrono(repo);
        if (!estado) {
          if (!ctx.estado.gitLento) {
            ctx.estado.gitLento = true;
            hallar("info", "GIT-LENTO", mensaje("GIT-LENTO", { segundos: PLAZO_DE_ESTADOS_MS / 1000 }));
          }
          repos.push({ id: repo.id, ruta: repo.ruta, origen: repo.origenRuta, existe: repo.existe, esGit: false, rama: null });
          continue;
        }
        // The text comes from git.ts, in the call's language: it is recognized in both.
        if (estado.error && /no está instalado|not installed/i.test(estado.error)) {
          ctx.estado.gitAusente = true;
          hallar("aviso", "GIT-NO-INSTALADO", mensaje("GIT-NO-INSTALADO", { error: estado.error }));
        }
        esGit = estado.esGit;
        rama = estado.separado ? mensaje("DOCTOR-RAMA-SEPARADA", { head: estado.head }) : estado.rama;
      }
      repos.push({ id: repo.id, ruta: repo.ruta, origen: repo.origenRuta, existe: repo.existe, esGit, rama });
    }
  }

  return {
    manifiesto: lectura.estado === "valido" ? "válido" : lectura.estado === "ausente" ? "ausente" : "inválido",
    errorDelManifiesto: lectura.estado === "invalido" ? lectura.error : null,
    preset: config ? { nombre: config.preset.nombre, origen: config.origenPreset } : null,
    reglas: config ? { lotes: config.reglas.lotes, commits: config.reglas.commits } : null,
    repos,
    roots: ctx.fuerzas ? { fuerza: ctx.fuerzas.get(nombre) ?? null } : null,
  };
}

// The repos of all the projects, resolved as the diagnosis resolves them. A broken manifest or machine.json
// does not prevent listing the others: the diagnosis already warns about it.
function reposDeTodos(): { clave: string; repo: RepoResuelto }[] {
  let maquina: LecturaMaquina | null = null;
  try {
    maquina = leerMaquina();
    if (maquina.estado === "invalido") maquina = { ...maquina, repos: new Map() };
  } catch {
    maquina = null;
  }
  const lista: { clave: string; repo: RepoResuelto }[] = [];
  try {
    for (const proyecto of discoverProjects().values()) {
      try {
        const manifiesto = manifiestoDe(proyecto);
        if (!manifiesto || !maquina) continue;
        for (const repo of resolverRepos(proyecto, manifiesto.repos, maquina)) lista.push({ clave: `${proyecto}/${repo.id}`, repo });
      } catch {
        // invalid manifest: already warned
      }
    }
  } catch {
    // without Documentation there are no repos
  }
  return lista;
}

// The diagnosis for the server: the git state of the repos is requested beforehand, in parallel and with a
// deadline, so as not to block the rest of the protocol's messages. doctor, in the terminal, keeps using
// diagnosticar(), which is synchronous.
export async function diagnosticarSinBloquear(opciones: Omit<OpcionesDeDiagnostico, "estadosDeRepos"> = {}): Promise<Diagnostico> {
  const repos = reposDeTodos();
  const estados = await estadosConPlazo(repos.map((r) => r.repo));
  return diagnosticar({ ...opciones, estadosDeRepos: new Map(repos.map((r, i) => [r.clave, estados[i] ?? null])) });
}

// ─── The receipts of Phase 4 ────────────────────────────────────────────────
// What can be checked without git: receipts of batches the plan does not declare, receipts written by hand
// and an index that is no longer the one the server would assemble with today's receipts.
type Hallar = (severidad: Severidad, codigo: string, texto: string) => void;

function revisarRecibos(nombre: string, tareas: EstadoTarea[], phases: Map<number, PhaseFile>, hallar: Hallar): void {
  const idioma = idiomaDelProyecto(nombre).idioma;
  for (const tarea of tareas) {
    let fase: FaseDeLotes;
    try {
      fase = faseEnCarpeta(tarea.folderPath, phases, nombre, idioma);
    } catch {
      return; // no phase of the project declares receipts
    }
    const quien = `${nombre}/${tarea.taskName}`;

    let porLote: Map<number, ReciboEnDisco[]>;
    try {
      porLote = recibosDeLaTarea(fase);
    } catch (error) {
      hallar("aviso", "RECIBO-ILEGIBLE", mensaje("RECIBO-ILEGIBLE", { quien, error: mensajeDe(error) }));
      continue;
    }
    let total: number | null = null;
    try {
      total = lotesDelPlan(fase);
    } catch {
      total = null; // without a plan, or without `lotes`: there is nothing to compare against
    }

    if (total !== null) {
      for (const [lote, recibos] of [...porLote.entries()].sort((a, b) => a[0] - b[0])) {
        if (lote <= total) continue;
        for (const r of recibos) {
          hallar("aviso", "RECIBO-FUERA-DE-PLAN", mensaje("RECIBO-FUERA-DE-PLAN", { quien, archivo: `${fase.recibos}/${r.nombre}`, total }));
        }
      }
    }

    const manuales = [...porLote.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, recibos]) => recibos.some((r) => r.recibo.origen === "manual"))
      .map(([lote]) => etiquetaDeLote(lote));
    if (manuales.length) {
      hallar(
        "info",
        "RECIBO-MANUAL",
        mensaje("RECIBO-MANUAL", { quien, lotes: manuales })
      );
    }

    // Only an index that the server generated: one written by hand with 2.x will never match.
    if (fase.documento && total !== null && total > 1) {
      const documento = path.join(tarea.folderPath, fase.documento);
      try {
        const texto = leerTextoAcotado(documento).replace(/\r\n/g, "\n");
        if (frontmatterDeRecibo(texto).meta.generado_por === GENERADO_POR && texto !== ensamblarIndice(tarea.folderPath, phases, fase.idioma)) {
          hallar(
            "aviso",
            "INDICE-DESINCRONIZADO",
            mensaje("INDICE-DESINCRONIZADO", { quien, documento: fase.documento })
          );
        }
      } catch {
        // no document yet, or unreadable: there is no index to compare
      }
    }
  }
}

// ─── Long paths ─────────────────────────────────────────────────────────────
// With a Documentation in a synchronized folder with a long path, near 255 or 260 characters OneDrive and
// many Windows tools can no longer open a file. It is warned about beforehand.
export const LARGO_DE_RUTA = 240;
const TOPE_DE_ENTRADAS = 50_000;

export function rutasLargas(base: string, largo: number = LARGO_DE_RUTA): { cuenta: number; mas_larga: string | null; recortado: boolean } {
  let cuenta = 0;
  let masLarga: string | null = null;
  let vistas = 0;
  const pendientes = [base];
  while (pendientes.length) {
    const carpeta = pendientes.pop()!;
    let entradas: fs.Dirent[];
    try {
      entradas = fs.readdirSync(carpeta, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entrada of entradas) {
      if (++vistas > TOPE_DE_ENTRADAS) return { cuenta, mas_larga: masLarga, recortado: true };
      const ruta = path.join(carpeta, entrada.name);
      if (ruta.length > largo) {
        cuenta++;
        if (!masLarga || ruta.length > masLarga.length) masLarga = ruta;
      }
      // Without following links or entering .git: what matters are the documents.
      if (entrada.isDirectory() && !entrada.isSymbolicLink() && entrada.name.toLowerCase() !== ".git") pendientes.push(ruta);
    }
  }
  return { cuenta, mas_larga: masLarga, recortado: false };
}

// ─── Anchors that are no longer valid (doctor --reverificar) ────────────────
// It needs git, which is asynchronous: it is computed beforehand and reaches the diagnosis as findings
// already made.
export async function anclasNoVigentes(): Promise<Hallazgo[]> {
  const hallazgos: Hallazgo[] = [];
  let proyectos: string[];
  try {
    proyectos = [...discoverProjects().values()].sort();
  } catch {
    return hallazgos; // without Documentation there is already a VAR-FALTA
  }
  for (const nombre of proyectos) {
    let phases: Map<number, PhaseFile>;
    try {
      phases = fasesDe(nombre);
    } catch {
      continue; // the invalid manifest already comes out as a finding
    }
    for (const tarea of listarTareas(nombre, phases)) {
      let porLote: Map<number, ReciboEnDisco[]>;
      try {
        porLote = recibosDeLaTarea(faseEnCarpeta(tarea.folderPath, phases));
      } catch {
        continue;
      }
      for (const [lote, recibos] of [...porLote.entries()].sort((a, b) => a[0] - b[0])) {
        for (const { recibo } of recibos) {
          if (recibo.ancla.tipo !== "commit" && recibo.ancla.tipo !== "sha256") continue;
          const { vigente, texto } = await reverificar(nombre, recibo);
          if (!vigente) hallazgos.push({ severidad: "aviso", codigo: "ANCLA-NO-VIGENTE", texto: mensaje("ANCLA-NO-VIGENTE", { quien: `${nombre}/${tarea.taskName}`, lote: etiquetaDeLote(lote), texto }) });
        }
      }
    }
  }
  return hallazgos;
}

// ─── The diagnosis ──────────────────────────────────────────────────────────
// `raices`: those of the MCP session (the tool knows them; doctor, in the terminal, does not).
// `hallazgosExtra`: those computed beforehand because they need asynchronous git (doctor --reverificar).
export type OpcionesDeDiagnostico = { cliente?: Diagnostico["cliente"]; raices?: string[]; estadosDeRepos?: EstadosDeRepos; hallazgosExtra?: Hallazgo[] };

// With its cache of the per-language document count: each project is counted once (manifiesto.ts).
export function diagnosticar(opciones: OpcionesDeDiagnostico = {}): Diagnostico {
  return conCacheDelIdioma(() => diagnosticarSinCache(opciones));
}

function diagnosticarSinCache(opciones: OpcionesDeDiagnostico): Diagnostico {
  const hallazgos: Hallazgo[] = [];
  const hallar = (severidad: Severidad, codigo: string, texto: string): void => {
    hallazgos.push({ severidad, codigo, texto });
  };

  const rutaPaquete = path.resolve(MODULE_DIR, "..");

  // Variables and required paths.
  const variables = NOMBRES_LOGICOS.map((logica) => leerVariable(logica));
  for (const { discrepancia } of variables) {
    if (discrepancia) hallar("aviso", "VAR-DISCREPA", discrepancia);
  }
  for (const hallazgo of pisadasDeMaquina(variables)) hallazgos.push(hallazgo);

  // A PHASE_GATE_LANG that says neither es nor en does not count: it is ignored and the language comes from
  // the system. It is warned about, because whoever set it expected something else. Empty is like not having
  // it, and is not warned about.
  const lang = process.env.PHASE_GATE_LANG ?? "";
  if (lang.trim() && !idiomaDeEtiqueta(lang)) {
    hallar("aviso", "LANG-INVALIDO", mensaje("LANG-INVALIDO", { valor: lang.length > 40 ? `${lang.slice(0, 40)}…` : lang, sistema: idiomaDelSistema() }));
  }

  const delEnv = errorDeEnv();
  if (delEnv) hallar("error", /UTF-16/.test(delEnv) ? "ENV-UTF16" : "ENV-ILEGIBLE", delEnv);

  const rutas = { docs: estadoRuta(DOCS), repos: estadoRuta(REPOS) };
  for (const estado of [rutas.docs, rutas.repos]) {
    if (!estado.existe) hallar("error", "VAR-FALTA", estado.error ?? mensaje("VAR-FALTA"));
  }

  // Local state.
  const archivoEstado = stateFile();
  let punteros: Record<string, string> = {};
  try {
    punteros = leerPunteros();
  } catch {
    // leerPunteros already tolerates an unreadable file; this only covers an inaccessible folder.
  }
  const estado = { archivo: archivoEstado, existe: fs.existsSync(archivoEstado), punteros: Object.keys(punteros).length };

  // leerPunteros silences a corrupt file (so as not to leave without service), and doctor counted it as "0
  // pointers". Here it is said: the active task of each project is being deduced.
  if (estado.existe && !estadoLegible(archivoEstado)) {
    hallar(
      "aviso",
      "ESTADO-ILEGIBLE",
      mensaje("ESTADO-ILEGIBLE", { archivo: archivoEstado })
    );
  }

  // Prompt layers.
  const capas = capasDePrompts();
  const rutasCapas = capas.map((capa) => capa.ruta);

  for (const capa of capas) {
    if (capa.etiqueta === "propia" && !capa.existe) {
      const { usada } = leerVariable("PROMPTS_PATH");
      if (fs.existsSync(capa.ruta)) {
        hallar(
          "aviso",
          "CAPA-NO-ES-CARPETA",
          mensaje("CAPA-NO-ES-CARPETA", { variable: usada, ruta: capa.ruta })
        );
      } else {
        hallar(
          "aviso",
          "CAPA-NO-EXISTE",
          mensaje("CAPA-NO-EXISTE", { variable: usada, ruta: capa.ruta })
        );
      }
    }
  }

  const capaDe = (archivo: string): EtiquetaCapa | null => capaDeArchivo(archivo, capas);

  // Global rules.
  const archivoGlobales = resolveGlobalRules(rutasCapas);
  const capaGlobales = archivoGlobales ? capaDe(archivoGlobales) : null;
  // The missing ones, with the name in the language of the factory layer (prompts/es/ or prompts/en/).
  const nombres = path.basename(capas[0]?.ruta ?? "") === "en" ? SECCIONES_GLOBALES_EN : SECCIONES_GLOBALES;
  let faltanIndices: number[] = [];
  if (archivoGlobales) {
    try {
      const lineas = new Set(leerPromptNormalizado(archivoGlobales).split("\n").map((linea) => linea.trimEnd().normalize("NFC")));
      faltanIndices = SECCIONES_GLOBALES.map((_, i) => i).filter((i) => !lineas.has(`## ${SECCIONES_GLOBALES[i]}`) && !lineas.has(`## ${SECCIONES_GLOBALES_EN[i]}`));
    } catch {
      faltanIndices = SECCIONES_GLOBALES.map((_, i) => i);
    }
  }
  const faltan = faltanIndices.map((i) => nombres[i]!);
  // BASE and PENDIENTES are skeleton: if a global-rules.md of one's own lacks them, the assembly adds the
  // factory ones (GLOBAL-REINYECTADO). EVIDENCIA is a slot and is not re-injected: if it is missing, the
  // phases cite a section that does not exist (GLOBAL-SIN-BASE).
  if (archivoGlobales && capaGlobales !== "fábrica" && faltan.length) {
    const fabrica = path.join(capas[0]?.ruta ?? "", GLOBAL_RULES_FILE);
    // BASE and PENDIENTES are the skeleton ones, in whichever language.
    const reinyectadas = fs.existsSync(fabrica) ? faltanIndices.filter((i) => SECCIONES_ESQUELETO.includes(SECCIONES_GLOBALES[i]!)).map((i) => nombres[i]!) : [];
    const sinReinyectar = faltan.filter((seccion) => !reinyectadas.includes(seccion));

    if (reinyectadas.length) hallar("aviso", "GLOBAL-REINYECTADO", textoDeReinyeccion(archivoGlobales, reinyectadas));
    if (sinReinyectar.length) {
      hallar(
        "aviso",
        "GLOBAL-SIN-BASE",
        mensaje("GLOBAL-SIN-BASE", { archivo: archivoGlobales, secciones: sinReinyectar })
      );
    }
  }

  // Phases.
  // discoverPhases already skips the layers that are not a folder; this covers what remains (a folder without
  // read permission, for example). The diagnosis never throws: it turns it into a finding.
  let phases = new Map<number, PhaseFile>();
  try {
    phases = discoverPhases(rutasCapas);
  } catch (error) {
    hallar("error", "PROMPTS-ILEGIBLES", mensaje("PROMPTS-ILEGIBLES", { error: mensajeDe(error) }));
  }
  const fases = fasesConCapa(capas, phases);

  for (const fase of fases) {
    if (!fase.documento) {
      hallar(
        "aviso",
        "FASE-SIN-DOC",
        mensaje("FASE-SIN-DOC", { fase: fase.numero, titulo: fase.titulo })
      );
    }
    if (!fase.comando) {
      hallar(
        "info",
        "FASE-SIN-COMANDO",
        mensaje("FASE-SIN-COMANDO", { fase: fase.numero, titulo: fase.titulo })
      );
    }
  }

  // Local configuration: machine.json and the available presets.
  const maquina = leerMaquina();
  if (maquina.estado === "invalido") hallar("error", "MAQUINA-INVALIDA", mensaje("MAQUINA-INVALIDA", { error: maquina.error }));
  for (const aviso of maquina.avisos) hallar(aviso.severidad, aviso.codigo, aviso.texto);

  let presets = new Map<string, Preset>();
  try {
    presets = presetsDisponibles();
  } catch (error) {
    hallar("error", "PRESETS-ILEGIBLES", mensaje("PRESETS-ILEGIBLES", { error: mensajeDe(error) }));
  }
  const presetPorDefecto = maquina.config?.presetPorDefecto ?? null;
  if (presetPorDefecto && !presets.has(presetPorDefecto)) {
    hallar(
      "error",
      "PRESET-NO-EXISTE",
      mensaje("PRESET-NO-EXISTE", { maquina: maquina.ruta, preset: presetPorDefecto, disponibles: describirPresets(presets) })
    );
  }
  const configuracion: Diagnostico["configuracion"] = {
    configDir: configDir(),
    maquina: {
      archivo: maquina.ruta,
      existe: maquina.estado !== "ausente",
      valido: maquina.estado === "valido",
      overrides: maquina.repos.size,
      presetPorDefecto,
    },
    presets: [...presets.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => ({ nombre: p.nombre, origen: p.origen, ruta: p.ruta })),
  };

  // The blocks that apply without a project: the global layer and the machine.json preset.
  try {
    for (const h of revisarBloques(capasDe(null))) hallar(h.severidad, h.codigo, h.texto);
  } catch {
    // A machine.json preset that does not exist is already a PRESET-NO-EXISTE.
  }

  // Projects and pointers. Without DOCS_PATH there is nothing to list, and that is already a VAR-FALTA.
  const proyectos: Diagnostico["proyectos"] = [];
  if (rutas.docs.existe) {
    try {
      let fuerzas: Map<string, "fuerte" | "debil"> | null = null;
      if (opciones.raices) {
        fuerzas = fuerzaPorProyecto(opciones.raices);
        const resolucion = resolverPorRaices(opciones.raices);
        if (resolucion.tipo === "ambiguo") {
          hallar(
            "info",
            "ROOTS-AMBIGUO",
            mensaje("ROOTS-AMBIGUO", { candidatos: resolucion.candidatos })
          );
        }
      }

      const estado = { gitAusente: false, gitLento: false };
      for (const nombre of [...discoverProjects().values()].sort()) {
        // With the phases of ITS project. An invalid manifest does not bring the listing down: it is warned about,
        // and its tasks are counted with the phases of no project.
        const delProyecto = fasesDelProyecto(nombre, phases);
        const tareas = listarTareas(nombre, delProyecto);
        const activa = tareaActiva(nombre, delProyecto);
        proyectos.push({
          nombre,
          tareas: tareas.length,
          activa: activa
            ? { tarea: activa.estado.taskName, origen: activa.origen, fase: describeEstado(activa.estado, delProyecto) }
            : null,
          ...configuracionDelProyecto(nombre, tareas, { maquina, presets, presetPorDefecto, fuerzas, estado, estados: opciones.estadosDeRepos ?? null }, hallar),
        });
        revisarRecibos(nombre, tareas, delProyecto, hallar);
        // Documents of both languages without a declared language, or tasks of another language than the declared one.
        const conflicto = conflictoDeIdioma(nombre);
        if (conflicto) hallar(conflicto.severidad, conflicto.codigo, conflicto.texto);
      }

      const largas = rutasLargas(requireBasePath(DOCS));
      if (largas.cuenta) {
        hallar(
          "aviso",
          "RUTA-LARGA",
          mensaje("RUTA-LARGA", { cuenta: largas.cuenta, largo: LARGO_DE_RUTA, masLarga: largas.mas_larga!, tope: largas.recortado ? TOPE_DE_ENTRADAS : null })
        );
      }

      for (const [clave, tarea] of Object.entries(punteros)) {
        const carpeta = findProjectFolder(clave);
        if (!carpeta) {
          hallar("info", "PUNTERO-HUERFANO", mensaje("PUNTERO-HUERFANO", { proyecto: clave }));
        } else if (!listarTareas(carpeta, fasesDelProyecto(carpeta, phases)).some((t) => t.taskName === tarea)) {
          hallar(
            "info",
            "PUNTERO-HUERFANO",
            mensaje("PUNTERO-HUERFANO", { carpeta, tarea })
          );
        }
      }
    } catch (error) {
      hallar("error", "DOCS-ILEGIBLE", mensaje("DOCS-ILEGIBLE", { error: mensajeDe(error) }));
    }
  }

  for (const h of opciones.hallazgosExtra ?? []) hallazgos.push(h);

  // The same warning can come out of several projects (a malformed global bloques.md, for example).
  const unicos =hallazgos.filter((h, i) => hallazgos.findIndex((otro) => otro.codigo === h.codigo && otro.texto === h.texto) === i);
  unicos.sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);
  hallazgos.splice(0, hallazgos.length, ...unicos);

  return {
    paquete: { version: SERVER_VERSION, ruta: rutaPaquete, via: deducirVia(rutaPaquete) },
    node: { version: process.version, plataforma: process.platform },
    variables,
    rutas,
    estado,
    capas,
    reglasGlobales: { archivo: archivoGlobales, capa: capaGlobales, faltan },
    fases,
    proyectos,
    configuracion,
    ...(opciones.cliente ? { cliente: opciones.cliente } : {}),
    hallazgos,
  };
}

// ─── Format ─────────────────────────────────────────────────────────────────
// Text for the terminal (doctor) and Markdown for the chat (the tool and the resource). Both come out of the
// same object and have the same sections, in the same order. In the call's language; the values of the enums
// (severity, layer, origin…) stay canonical in the object and are translated here.

type Textos = {
  t: (codigo: string, parametros?: Record<string, unknown>) => string;
  valor: (valor: string) => string;
  columnas: (codigo: string) => string[];
};

function textos(idioma: Idioma = idiomaDeMensajes()): Textos {
  const t = (codigo: string, parametros: Record<string, unknown> = {}): string => mensaje(codigo, parametros, idioma);
  return { t, valor: (valor) => t("DOCTOR-VALOR", { valor }), columnas: (codigo) => t(codigo).split("|") };
}

// The width of the severity column: the longest one plus two (7 in Spanish).
function anchoDeSeveridad(x: Textos): number {
  return Math.max(...(["error", "aviso", "info"] as Severidad[]).map((s) => x.valor(s).length)) + 2;
}

type FilaVariable = { nombre: NombreLogico; marca: string; valor: string; origen: string };

function filasDeVariables(d: Diagnostico, { t }: Textos): FilaVariable[] {
  return d.variables.map((lectura) => {
    const origen = lectura.usada ? t("DOCTOR-ORIGEN-VARIABLE", { usada: lectura.usada, fuente: lectura.fuente }) : "";
    const nombre = lectura.logica;

    if (nombre === "DOCS_PATH" || nombre === "REPOS_PATH") {
      const ruta = nombre === "DOCS_PATH" ? d.rutas.docs : d.rutas.repos;
      return { nombre, marca: ruta.existe ? "✓" : "✗", valor: ruta.ruta ?? t("DOCTOR-SIN-DEFINIR"), origen };
    }

    if (lectura.valor === undefined || (lectura.valor === "" && nombre !== "TASKS_SUBDIR")) {
      if (nombre === "TASKS_SUBDIR") return { nombre, marca: "·", valor: TASKS_SUBDIR_POR_DEFECTO, origen: t("DOCTOR-ORIGEN-POR-DEFECTO") };
      if (nombre === "STATE_PATH") return { nombre, marca: "·", valor: t("DOCTOR-SIN-DEFINIR-ESTADO", { carpeta: path.dirname(d.estado.archivo) }), origen };
      return { nombre, marca: "·", valor: t("DOCTOR-SIN-DEFINIR"), origen };
    }

    if (nombre === "PROMPTS_PATH") {
      const propia = d.capas.find((capa) => capa.etiqueta === "propia");
      const existe = propia?.existe ?? false;
      return { nombre, marca: existe ? "✓" : "✗", valor: propia?.ruta ?? lectura.valor, origen };
    }

    if (nombre === "TASKS_SUBDIR" && lectura.valor === "") {
      return { nombre, marca: "·", valor: t("DOCTOR-SUBDIR-VACIA"), origen };
    }

    const valor = nombre === "STATE_PATH" ? path.dirname(d.estado.archivo) : lectura.valor;
    return { nombre, marca: "·", valor, origen };
  });
}

function lineaDeCliente(cliente: NonNullable<Diagnostico["cliente"]>, { t }: Textos): string {
  return t("DOCTOR-LINEA-CLIENTE", {
    nombre: cliente.nombre,
    version: cliente.version,
    elicitation: cliente.capacidades.elicitation,
    roots: cliente.capacidades.roots,
  });
}

function archivosDeFase(fase: Diagnostico["fases"][number], { t }: Textos): string {
  if (!fase.documento) return t("DOCTOR-SIN-DOCUMENTO");
  return fase.recibos ? `${fase.documento} + ${fase.recibos}/` : fase.documento;
}

function lineaDeProyecto(proyecto: Diagnostico["proyectos"][number], { t }: Textos): string {
  return t("DOCTOR-LINEA-PROYECTO", { tareas: proyecto.tareas, activa: proyecto.activa });
}

function lineaDeConfiguracion(proyecto: Diagnostico["proyectos"][number], { t }: Textos): string {
  return t("DOCTOR-LINEA-CONFIGURACION", {
    manifiesto: proyecto.manifiesto,
    preset: proyecto.preset,
    reglas: proyecto.reglas,
    fuerza: proyecto.roots?.fuerza ?? null,
  });
}

function lineaDeRepo(repo: Diagnostico["proyectos"][number]["repos"][number], { t }: Textos): string {
  return t("DOCTOR-LINEA-REPO", repo);
}

function lineaDeMaquina(c: Diagnostico["configuracion"], { t }: Textos): string {
  return t("DOCTOR-LINEA-MAQUINA", {
    existe: c.maquina.existe,
    valido: c.maquina.valido,
    overrides: c.maquina.overrides,
    presetPorDefecto: c.maquina.presetPorDefecto,
  });
}

function formatearTexto(d: Diagnostico, x: Textos): string {
  const { t, valor } = x;
  const lineas: string[] = [];
  const columna = (texto: string, ancho: number): string => texto.padEnd(ancho);

  lineas.push(t("DOCTOR-CABECERA", { servidor: SERVER_NAME, version: d.paquete.version, via: d.paquete.via }));
  lineas.push(`${columna(t("DOCTOR-ETIQUETA-PAQUETE"), 13)}${d.paquete.ruta}`);
  lineas.push(`${columna("Node", 13)}${d.node.version} · ${d.node.plataforma}`);
  if (d.cliente) lineas.push(`${columna(t("DOCTOR-ETIQUETA-CLIENTE"), 13)}${lineaDeCliente(d.cliente, x)}`);

  lineas.push("", t("DOCTOR-TITULO-VARIABLES"));
  const filas = filasDeVariables(d, x);
  const anchoNombre = Math.max(...filas.map((fila) => fila.nombre.length)) + 2;
  const anchoValor = Math.max(...filas.map((fila) => fila.valor.length)) + 4;
  for (const fila of filas) {
    const resto = fila.origen ? `${columna(fila.valor, anchoValor)}${fila.origen}` : fila.valor;
    lineas.push(`  ${columna(fila.nombre, anchoNombre)}${fila.marca} ${resto}`.trimEnd());
  }

  const punteros = t("DOCTOR-PUNTEROS", { n: d.estado.punteros });
  lineas.push("", `${columna(t("DOCTOR-TITULO-ESTADO"), 15)}${d.estado.archivo} · ${d.estado.existe ? punteros : t("DOCTOR-NO-EXISTE-TODAVIA")}`);

  lineas.push("", `${columna(t("DOCTOR-TITULO-CONFIGURACION"), 15)}${d.configuracion.configDir}`);
  lineas.push(`  ${columna("machine.json", 14)}${lineaDeMaquina(d.configuracion, x)}`);
  lineas.push(`  ${columna("presets", 14)}${d.configuracion.presets.map((p) => `${p.nombre} (${valor(p.origen)})`).join(", ") || t("DOCTOR-NINGUNO")}`);

  lineas.push("", t("DOCTOR-TITULO-PROMPTS-PRIORIDAD"));
  for (const capa of d.capas) {
    lineas.push(`  ${columna(valor(capa.etiqueta), 13)}${capa.ruta}${capa.existe ? "" : `  ${t("DOCTOR-NO-EXISTE-MARCA")}`}`);
  }
  lineas.push(
    `  ${t("DOCTOR-TEXTO-REGLAS-GLOBALES", { hay: Boolean(d.reglasGlobales.archivo), capa: d.reglasGlobales.capa, faltan: d.reglasGlobales.faltan })}`
  );
  const nombreDeFase = (fase: Diagnostico["fases"][number]): string => t("DOCTOR-FASE", { numero: fase.numero, titulo: fase.titulo });
  const anchoFase = Math.max(0, ...d.fases.map((fase) => nombreDeFase(fase).length)) + 3;
  for (const fase of d.fases) {
    const comando = fase.comando ? ` · /f${fase.numero}` : ` · ${t("DOCTOR-COMANDO-GENERICO", { numero: fase.numero })}`;
    lineas.push(
      `  ${columna(nombreDeFase(fase), anchoFase)}← ${columna(valor(fase.capa), 9)}· ${archivosDeFase(fase, x)}${comando}`
    );
  }

  lineas.push("", t("DOCTOR-TITULO-PROYECTOS"));
  if (!d.rutas.docs.existe) {
    lineas.push(`  ${t("DOCTOR-PROYECTOS-SIN-DOCS-TEXTO")}`);
  } else if (d.proyectos.length === 0) {
    lineas.push(`  ${t("DOCTOR-PROYECTOS-NINGUNO-TEXTO")}`);
  } else {
    const anchoProyecto = Math.max(...d.proyectos.map((p) => p.nombre.length)) + 3;
    for (const proyecto of d.proyectos) {
      lineas.push(`  ${columna(proyecto.nombre, anchoProyecto)}${lineaDeProyecto(proyecto, x)}`);
      lineas.push(`  ${columna("", anchoProyecto)}${lineaDeConfiguracion(proyecto, x)}`);
      for (const repo of proyecto.repos) lineas.push(`  ${columna("", anchoProyecto)}  repo ${lineaDeRepo(repo, x)}`);
    }
  }

  lineas.push("", t("DOCTOR-TITULO-HALLAZGOS"));
  if (d.hallazgos.length === 0) {
    lineas.push(`  ${t("DOCTOR-NINGUNO")}`);
  } else {
    const anchoSeveridad = anchoDeSeveridad(x);
    const anchoCodigo = Math.max(...d.hallazgos.map((h) => h.codigo.length)) + 2;
    for (const h of d.hallazgos) lineas.push(`  ${columna(valor(h.severidad), anchoSeveridad)}${columna(h.codigo, anchoCodigo)}${h.texto}`);
  }

  return lineas.join("\n");
}

// A Markdown table cell: without line breaks and with the bars escaped.
function celda(texto: string): string {
  return texto.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function codigo(texto: string): string {
  return texto ? `\`${celda(texto)}\`` : "";
}

function tabla(encabezados: string[], filas: string[][]): string[] {
  return [
    `| ${encabezados.join(" | ")} |`,
    `|${encabezados.map(() => "---").join("|")}|`,
    ...filas.map((fila) => `| ${fila.join(" | ")} |`),
  ];
}

function formatearMarkdown(d: Diagnostico, x: Textos): string {
  const { t, valor, columnas } = x;
  const lineas: string[] = [];

  lineas.push(`### ${t("DOCTOR-CABECERA", { servidor: SERVER_NAME, version: d.paquete.version, via: d.paquete.via })}`, "");
  lineas.push(`- **${t("DOCTOR-ETIQUETA-PAQUETE")}:** ${codigo(d.paquete.ruta)}`);
  lineas.push(`- **Node:** ${d.node.version} · ${d.node.plataforma}`);
  if (d.cliente) lineas.push(`- **${t("DOCTOR-ETIQUETA-CLIENTE")}:** ${celda(lineaDeCliente(d.cliente, x))}`);

  lineas.push("", `### ${t("DOCTOR-TITULO-VARIABLES")}`, "");
  lineas.push(
    ...tabla(
      columnas("DOCTOR-TABLA-VARIABLES"),
      filasDeVariables(d, x).map((fila) => [fila.nombre, fila.marca, codigo(fila.valor), celda(fila.origen)])
    )
  );

  const punteros = t("DOCTOR-PUNTEROS", { n: d.estado.punteros });
  lineas.push("", `### ${t("DOCTOR-TITULO-ESTADO")}`, "", `${codigo(d.estado.archivo)} · ${d.estado.existe ? punteros : t("DOCTOR-NO-EXISTE-TODAVIA")}`);

  lineas.push("", `### ${t("DOCTOR-TITULO-CONFIGURACION")}`, "");
  lineas.push(`- **${t("DOCTOR-ETIQUETA-CARPETA")}:** ${codigo(d.configuracion.configDir)}`);
  lineas.push(`- **machine.json:** ${codigo(d.configuracion.maquina.archivo)} · ${celda(lineaDeMaquina(d.configuracion, x))}`);
  lineas.push(`- **Presets:** ${d.configuracion.presets.map((p) => `\`${p.nombre}\` (${valor(p.origen)})`).join(", ") || t("DOCTOR-NINGUNO")}`);

  lineas.push("", `### ${t("DOCTOR-TITULO-PROMPTS")}`, "", t("DOCTOR-CAPAS-PRIORIDAD"), "");
  lineas.push(
    ...tabla(
      columnas("DOCTOR-TABLA-CAPAS"),
      d.capas.map((capa) => [valor(capa.etiqueta), codigo(capa.ruta), t("DOCTOR-SI-NO", { valor: capa.existe })])
    )
  );
  lineas.push(
    "",
    t("DOCTOR-MD-REGLAS-GLOBALES", {
      archivo: d.reglasGlobales.archivo ? codigo(d.reglasGlobales.archivo) : null,
      capa: d.reglasGlobales.capa,
      faltan: d.reglasGlobales.faltan,
    }),
    ""
  );
  lineas.push(
    ...tabla(
      columnas("DOCTOR-TABLA-FASES"),
      d.fases.map((fase) => [
        String(fase.numero),
        celda(fase.titulo),
        valor(fase.capa),
        codigo(fase.documento ?? ""),
        codigo(fase.recibos ? `${fase.recibos}/` : ""),
        fase.comando ? `/f${fase.numero}` : t("DOCTOR-COMANDO-GENERICO", { numero: fase.numero }),
        codigo(fase.archivo),
      ])
    )
  );

  lineas.push("", `### ${t("DOCTOR-TITULO-PROYECTOS")}`, "");
  if (!d.rutas.docs.existe) {
    lineas.push(t("DOCTOR-PROYECTOS-SIN-DOCS-MD"));
  } else if (d.proyectos.length === 0) {
    lineas.push(t("DOCTOR-PROYECTOS-NINGUNO-MD"));
  } else {
    lineas.push(
      ...tabla(
        columnas("DOCTOR-TABLA-PROYECTOS"),
        d.proyectos.map((p) => [
          celda(p.nombre),
          String(p.tareas),
          p.activa ? `${celda(p.activa.tarea)} (${valor(p.activa.origen)})` : "",
          p.activa ? celda(p.activa.fase) : "",
          celda(lineaDeConfiguracion(p, x)),
          celda(p.repos.map((repo) => lineaDeRepo(repo, x)).join("; ")),
        ])
      )
    );
  }

  lineas.push("", `### ${t("DOCTOR-TITULO-HALLAZGOS")}`, "");
  if (d.hallazgos.length === 0) {
    lineas.push(t("DOCTOR-NINGUNO-PUNTO"));
  } else {
    lineas.push(...tabla(columnas("DOCTOR-TABLA-HALLAZGOS"), d.hallazgos.map((h) => [valor(h.severidad), h.codigo, celda(h.texto)])));
  }

  return lineas.join("\n");
}

export function formatearDiagnostico(d: Diagnostico, formato: "texto" | "markdown"): string {
  const x = textos();
  return formato === "texto" ? formatearTexto(d, x) : formatearMarkdown(d, x);
}

// ─── Origin of a phase (doctor --fase N --proyecto P) ───────────────────────
// Which layer and which file:line wins in each slot of the prompt the model receives, and which modes were
// added to it. With a project, for its active task (which can declare its own preset).
export type InformeDeProcedencia = {
  fase: number;
  proyecto: string | null;
  tarea: string | null;
  preset: { nombre: string; origen: string };
  procedencia: Procedencia[];
  avisos: Hallazgo[];
};

export function procedenciaDeFase(fase: number, proyecto: string | null): InformeDeProcedencia {
  const carpeta = proyecto ? requireProjectFolder(proyecto) : null;
  const activa = carpeta ? tareaActiva(carpeta, fasesDe(carpeta)) : null;
  const carpetaTarea = activa?.estado.folderPath ?? null;
  const config = configuracionDe(carpeta, carpetaTarea);
  const { procedencia, avisos } = ensamblarFase(fase, carpeta, carpetaTarea, { incluirConfigProyecto: false });
  return {
    fase,
    proyecto: carpeta,
    tarea: activa?.estado.taskName ?? null,
    preset: { nombre: config.preset.nombre, origen: config.origenPreset },
    procedencia,
    avisos,
  };
}

export function formatearProcedencia(informe: InformeDeProcedencia): string {
  const x = textos();
  const { t, valor } = x;
  const lineas = [
    t("DOCTOR-PROCEDENCIA-CABECERA", {
      fase: informe.fase,
      proyecto: informe.proyecto,
      tarea: informe.tarea,
      preset: informe.preset.nombre,
      origen: informe.preset.origen,
    }),
    "",
  ];
  // In English, each slot with its alias and the canonical id in parentheses, and "fábrica" and the modes
  // translated.
  const enIngles = idiomaDeMensajes() === "en";
  const MODOS_EN: Record<string, string> = { reemplazar: "replace", antes: "before", despues: "after" };
  const nombreDe = (id: string): string => (enIngles && idInglesDeRanura(id) !== id ? `${idInglesDeRanura(id)} (${id})` : id);
  const deDonde = (texto: string): string => (enIngles ? texto.replace(/^fábrica$/, valor("fábrica")) : texto);
  const modoDe = (modo: string): string => (enIngles ? modo.replace(/^(reemplazar|antes|despues)\b/, (m) => MODOS_EN[m]!) : modo);
  const ancho = Math.max(6, ...informe.procedencia.map((p) => nombreDe(p.ranura).length)) + 3;
  lineas.push(`  ${t("DOCTOR-PROCEDENCIA-RANURA").padEnd(ancho)}${t("DOCTOR-PROCEDENCIA-GANA")}`);
  for (const p of informe.procedencia) {
    const modos = p.modos.length ? `  + ${p.modos.map(modoDe).join(", ")}` : "";
    lineas.push(`  ${nombreDe(p.ranura).padEnd(ancho)}${deDonde(p.contenidoDe)}${modos}`);
  }
  if (informe.avisos.length) {
    lineas.push("", t("DOCTOR-PROCEDENCIA-AVISOS"));
    const anchoSeveridad = anchoDeSeveridad(x);
    for (const h of informe.avisos) lineas.push(`  ${valor(h.severidad).padEnd(anchoSeveridad)}${h.codigo}  ${h.texto}`);
  }
  return lineas.join("\n");
}

// ─── The configuration report of a project (phase-gate://configuracion/{proyecto}) ───
// The effective manifest, where each value comes from and the state of its repos on this machine. The git
// state is requested beforehand, without blocking, with the same deadline as the diagnosis.
export async function informeDeConfiguracion(carpetaProyecto: string): Promise<string> {
  let repos: RepoResuelto[] = [];
  try {
    const m = manifiestoDe(carpetaProyecto);
    if (m?.repos.length) repos = resolverRepos(carpetaProyecto, m.repos);
  } catch {
    repos = []; // the report itself shows the error
  }
  const estados = await estadosConPlazo(repos);
  return textoDeConfiguracion(carpetaProyecto, new Map(repos.map((repo, i) => [repo.id, estados[i] ?? null])));
}

function textoDeConfiguracion(carpetaProyecto: string, estados: Map<string, EstadoDeRepo | null>): string {
  const { t, valor, columnas } = textos();
  const siNo = (si: boolean): string => t("DOCTOR-SI-NO", { valor: si });
  const lectura = leerManifiesto(carpetaProyecto);
  const lineas = [t("DOCTOR-CONFIG-TITULO", { proyecto: carpetaProyecto }), ""];
  lineas.push(
    t("DOCTOR-CONFIG-MANIFIESTO", { ruta: codigo(lectura.ruta), estado: lectura.estado, error: lectura.estado === "invalido" ? celda(lectura.error) : "" })
  );

  let config: ConfiguracionProyecto | null = null;
  try {
    config = configuracionDe(carpetaProyecto);
  } catch (error) {
    lineas.push("", t("DOCTOR-CONFIG-SIN-RESOLVER", { error: celda(mensajeDe(error)) }));
    return lineas.join("\n");
  }

  const m = config.manifiesto;
  const delManifiesto = (definido: boolean): string => (definido ? "phase-gate.json" : valor("por defecto"));
  const [preset = "", idioma = "", lotes = "", commits = "", verificacion = "", prPorRepo = ""] = columnas("DOCTOR-CONFIG-FILAS");
  lineas.push(
    "",
    ...tabla(columnas("DOCTOR-TABLA-CONFIG"), [
      [preset, codigo(config.preset.nombre), valor(config.origenPreset)],
      [idioma, config.idioma, valor(config.origenIdioma)],
      [lotes, siNo(config.reglas.lotes), valor(config.reglas.origen.lotes)],
      [commits, codigo(config.reglas.commits), valor(config.reglas.origen.commits)],
      [verificacion, m?.reglas.verificacion?.map(codigo).join(", ") || "—", delManifiesto(Boolean(m?.reglas.verificacion))],
      [prPorRepo, siNo(Boolean(m?.fase5.prPorRepo)), delManifiesto(m?.fase5.prPorRepo !== undefined)],
    ])
  );

  if (m?.repos.length) {
    lineas.push("", "#### Repos", "");
    const filas = resolverRepos(carpetaProyecto, m.repos).map((repo) => {
      const estado = estados.get(repo.id) ?? null;
      const git = !repo.existe
        ? "—"
        : !estado
          ? t("DOCTOR-SIN-RESPUESTA", { segundos: PLAZO_DE_ESTADOS_MS / 1000 })
          : estado.error
            ? celda(estado.error)
            : estado.esGit
              ? t("DOCTOR-GIT-ESTADO", { rama: estado.rama, separado: estado.separado, limpio: estado.limpio })
              : t("DOCTOR-SIN-GIT");
      return [codigo(repo.id), celda(repo.rol ?? ""), repo.ruta ? codigo(repo.ruta) : celda(repo.error ?? ""), repo.origenRuta ?? "—", siNo(repo.existe), git];
    });
    lineas.push(...tabla(columnas("DOCTOR-TABLA-REPOS"), filas));
  } else {
    lineas.push("", t("DOCTOR-CONFIG-SIN-REPOS"));
  }

  return lineas.join("\n");
}
