// Radiografía de la instalación: qué versión corre y desde dónde, de dónde salió cada variable,
// qué archivo de prompt gana en cada fase, qué proyectos hay y en qué va su tarea activa, y los
// avisos que se deducen de todo eso.
//
// Es una sola fuente para tres salidas: `npx mcp-phase-gate doctor`, la tool
// `get_orchestrator_status` y el recurso `phase-gate://estado`. Si cada una armara su propio
// diagnóstico, dirían cosas distintas justo el día en que alguien las compare para entender por
// qué algo no funciona.
//
// Solo lee. No escribe nada ni lanza por configuración incompleta: diagnosticar una instalación
// rota es precisamente para lo que existe, así que cada parte captura su propio error y lo
// convierte en un hallazgo.

import * as fs from "fs";
import * as path from "path";
import {
  DOCS,
  MODULE_DIR,
  NOMBRES_LOGICOS,
  REPOS,
  SERVER_NAME,
  SERVER_VERSION,
  TASKS_SUBDIR_POR_DEFECTO,
  configDir,
  errorDeEnv,
  idiomaDeEtiqueta,
  idiomaDelSistema,
  leerVariable,
  promptsLayers,
  requireBasePath,
  stateFile,
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
    // Desde la Etapa 3: su configuración.
    manifiesto: string; // "válido", "ausente" o "inválido: <error>"
    preset: { nombre: string; origen: string } | null; // null si no se pudo resolver
    reglas: { lotes: boolean; commits: string } | null;
    repos: { id: string; ruta: string | null; origen: string | null; existe: boolean; esGit: boolean; rama: string | null }[];
    roots: { fuerza: "fuerte" | "debil" | null } | null; // null si no se conocen las raíces de la sesión
  }[];
  configuracion: {
    configDir: string;
    maquina: { archivo: string; existe: boolean; valido: boolean; overrides: number; presetPorDefecto: string | null };
    presets: { nombre: string; origen: string; ruta: string | null }[];
  };
  cliente?: { nombre: string; version: string; capacidades: { elicitation: boolean; roots: boolean } };
  hallazgos: Hallazgo[];
};

// Las secciones de las reglas globales que las fases citan por su nombre. Un global-rules.md
// propio sustituye al de fábrica (no se suma), así que si le falta una, las fases citan una regla
// que no existe. Es el riesgo E1-R1, y el aviso que pedía la Etapa 1 para cuando hubiera doctor.
// Vienen del vocabulario (§8.2).
export const SECCIONES_GLOBALES: readonly string[] = VOCABULARIO.es.seccionesGlobales;
// Las mismas, en un global-rules.md en inglés: una sección está si está en cualquiera de los dos.
export const SECCIONES_GLOBALES_EN: readonly string[] = VOCABULARIO.en.seccionesGlobales;

const ORDEN_SEVERIDAD: Record<Severidad, number> = { error: 0, aviso: 1, info: 2 };

// ─── Cómo se ejecuta el paquete ─────────────────────────────────────────────
// Solo como información, nunca como decisión: la deducción puede equivocarse (riesgo E2-R7) y
// nada depende de ella. Sirve para que quien lea el diagnóstico sepa qué copia está corriendo,
// que es la primera pregunta cuando "cambié el prompt y no se nota".
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

function estadoRuta(requerida: RutaRequerida): EstadoRuta {
  try {
    return { ruta: requireBasePath(requerida), existe: true };
  } catch (error) {
    const { valor } = leerVariable(requerida.logica);
    return { ...(valor ? { ruta: path.resolve(valor) } : {}), existe: false, error: mensajeDe(error) };
  }
}

// ─── Capas y fases ──────────────────────────────────────────────────────────
// También las usa el recurso phase-gate://fases, que enseña lo mismo sin el resto del diagnóstico.
export function capasDePrompts(): Diagnostico["capas"] {
  return promptsLayers().map((ruta, i) => ({
    ruta,
    etiqueta: (i === 0 ? "fábrica" : "propia") as EtiquetaCapa,
    existe: esCarpeta(ruta),
  }));
}

// La capa de un archivo es la más alta que lo contiene.
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

// Las fases con las que se deducen las tareas de un proyecto. Si su manifiesto no se puede leer,
// las de sin proyecto: el hallazgo ya lo dice.
function fasesDelProyecto(carpetaProyecto: string, sinProyecto: Map<number, PhaseFile>): Map<number, PhaseFile> {
  try {
    return fasesDe(carpetaProyecto);
  } catch {
    return sinProyecto;
  }
}

// ─── La configuración de un proyecto ────────────────────────────────────────
type ContextoDeConfiguracion = {
  maquina: LecturaMaquina;
  presets: Map<string, Preset>;
  presetPorDefecto: string | null;
  fuerzas: Map<string, "fuerte" | "debil"> | null;
  estado: { gitAusente: boolean; gitLento: boolean };
  // Calculados antes, sin bloquear (el servidor); sin esto, git síncrono (doctor en la terminal).
  estados: EstadosDeRepos | null;
};

// El estado de git de cada repo, por "<PROYECTO>/<id>". null: no respondió dentro del plazo.
export type EstadosDeRepos = Map<string, EstadoDeRepo | null>;

type ConfiguracionDiagnosticada = Pick<Diagnostico["proyectos"][number], "manifiesto" | "preset" | "reglas" | "repos" | "roots">;

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

  // Las tareas que declaran un preset que no existe fallarían al pedir su prompt.
  let contexto: string | null = null;
  try {
    contexto = contextoInicialDe(nombre);
  } catch {
    contexto = null; // manifiesto inválido: ya avisado
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
    config = null; // manifiesto inválido o preset que no existe: ya avisado
  }

  if (config) {
    try {
      for (const h of revisarBloques(capasDe(nombre))) hallar(h.severidad, h.codigo, h.texto);
    } catch {
      // Lo que impida armar las capas ya está avisado arriba.
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
        // El texto viene de git.ts, en el idioma de la llamada: se reconoce en los dos.
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
    manifiesto: lectura.estado === "valido" ? "válido" : lectura.estado === "ausente" ? "ausente" : `inválido: ${lectura.error}`,
    preset: config ? { nombre: config.preset.nombre, origen: config.origenPreset } : null,
    reglas: config ? { lotes: config.reglas.lotes, commits: config.reglas.commits } : null,
    repos,
    roots: ctx.fuerzas ? { fuerza: ctx.fuerzas.get(nombre) ?? null } : null,
  };
}

// Los repos de todos los proyectos, resueltos como los resuelve el diagnóstico. Un manifiesto o un
// machine.json roto no impide listar los demás: ya lo avisa el diagnóstico.
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
        // manifiesto inválido: ya avisado
      }
    }
  } catch {
    // sin Documentación no hay repos
  }
  return lista;
}

// El diagnóstico para el servidor: el estado de git de los repos se pide antes, en paralelo y con plazo,
// para no bloquear el resto de mensajes del protocolo (hallazgo 2 de la auditoría de la Etapa 3). doctor,
// en la terminal, sigue usando diagnosticar(), síncrono.
export async function diagnosticarSinBloquear(opciones: Omit<OpcionesDeDiagnostico, "estadosDeRepos"> = {}): Promise<Diagnostico> {
  const repos = reposDeTodos();
  const estados = await estadosConPlazo(repos.map((r) => r.repo));
  return diagnosticar({ ...opciones, estadosDeRepos: new Map(repos.map((r, i) => [r.clave, estados[i] ?? null])) });
}

// ─── Los recibos de la Fase 4 (Etapa 4) ─────────────────────────────────────
// Lo que se puede revisar sin git: recibos de lotes que el plan no declara, recibos escritos a mano y un
// índice que ya no es el que el servidor ensamblaría con los recibos de hoy.
type Hallar = (severidad: Severidad, codigo: string, texto: string) => void;

function revisarRecibos(nombre: string, tareas: EstadoTarea[], phases: Map<number, PhaseFile>, hallar: Hallar): void {
  const idioma = idiomaDelProyecto(nombre).idioma;
  for (const tarea of tareas) {
    let fase: FaseDeLotes;
    try {
      fase = faseEnCarpeta(tarea.folderPath, phases, nombre, idioma);
    } catch {
      return; // ninguna fase del proyecto declara recibos
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
      total = null; // sin plan, o sin `lotes`: no hay contra qué comparar
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

    // Solo un índice que generó el servidor: uno escrito a mano con la 2.x nunca va a coincidir.
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
        // sin documento todavía, o ilegible: no hay índice que comparar
      }
    }
  }
}

// ─── Rutas largas (validación V7) ───────────────────────────────────────────
// Con una Documentación en una carpeta sincronizada de ruta larga, cerca de 255 o 260 caracteres
// OneDrive y muchas herramientas de Windows dejan de poder abrir un archivo. Se avisa antes.
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
      // Sin seguir enlaces ni entrar en .git: lo que importa son los documentos.
      if (entrada.isDirectory() && !entrada.isSymbolicLink() && entrada.name.toLowerCase() !== ".git") pendientes.push(ruta);
    }
  }
  return { cuenta, mas_larga: masLarga, recortado: false };
}

// ─── Anclas que ya no valen (doctor --reverificar) ──────────────────────────
// Necesita git, que es asíncrono: se calcula antes y llega al diagnóstico como hallazgos hechos.
export async function anclasNoVigentes(): Promise<Hallazgo[]> {
  const hallazgos: Hallazgo[] = [];
  let proyectos: string[];
  try {
    proyectos = [...discoverProjects().values()].sort();
  } catch {
    return hallazgos; // sin Documentación ya hay un VAR-FALTA
  }
  for (const nombre of proyectos) {
    let phases: Map<number, PhaseFile>;
    try {
      phases = fasesDe(nombre);
    } catch {
      continue; // el manifiesto inválido ya sale como hallazgo
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

// ─── El diagnóstico ─────────────────────────────────────────────────────────
// `raices`: las de la sesión MCP (la tool las conoce; doctor, en la terminal, no). `hallazgosExtra`: los
// que se calcularon antes porque necesitan git asíncrono (doctor --reverificar).
export type OpcionesDeDiagnostico = { cliente?: Diagnostico["cliente"]; raices?: string[]; estadosDeRepos?: EstadosDeRepos; hallazgosExtra?: Hallazgo[] };

// Con su caché del recuento de documentos por idioma: cada proyecto se cuenta una vez (manifiesto.ts).
export function diagnosticar(opciones: OpcionesDeDiagnostico = {}): Diagnostico {
  return conCacheDelIdioma(() => diagnosticarSinCache(opciones));
}

function diagnosticarSinCache(opciones: OpcionesDeDiagnostico): Diagnostico {
  const hallazgos: Hallazgo[] = [];
  const hallar = (severidad: Severidad, codigo: string, texto: string): void => {
    hallazgos.push({ severidad, codigo, texto });
  };

  const rutaPaquete = path.resolve(MODULE_DIR, "..");

  // Variables y rutas obligatorias.
  const variables = NOMBRES_LOGICOS.map((logica) => leerVariable(logica));
  for (const { discrepancia } of variables) {
    if (discrepancia) hallar("aviso", "VAR-DISCREPA", discrepancia);
  }

  // Un PHASE_GATE_LANG que no dice es ni en no cuenta: se ignora y el idioma sale del sistema. Se avisa,
  // porque quien lo puso esperaba otra cosa (hallazgo 10 de la auditoría de la Etapa 6). Vacío es como no
  // tenerlo, y no se avisa.
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

  // Estado local.
  const archivoEstado = stateFile();
  let punteros: Record<string, string> = {};
  try {
    punteros = leerPunteros();
  } catch {
    // leerPunteros ya tolera un archivo ilegible; esto solo cubre una carpeta inaccesible.
  }
  const estado = { archivo: archivoEstado, existe: fs.existsSync(archivoEstado), punteros: Object.keys(punteros).length };

  // leerPunteros calla un archivo corrupto (para no dejar sin servicio), y doctor lo contaba como
  // "0 punteros". Aquí se dice: la tarea activa de cada proyecto se está deduciendo.
  if (estado.existe && !estadoLegible(archivoEstado)) {
    hallar(
      "aviso",
      "ESTADO-ILEGIBLE",
      mensaje("ESTADO-ILEGIBLE", { archivo: archivoEstado })
    );
  }

  // Capas de prompts.
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

  // Reglas globales.
  const archivoGlobales = resolveGlobalRules(rutasCapas);
  const capaGlobales = archivoGlobales ? capaDe(archivoGlobales) : null;
  // Las que faltan, con el nombre del idioma de la capa de fábrica (prompts/es/ o prompts/en/).
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
  // BASE y PENDIENTES son esqueleto: si un global-rules.md propio no las tiene, el ensamblado añade
  // las de fábrica (GLOBAL-REINYECTADO). EVIDENCIA es una ranura y no se reinyecta: si falta, las
  // fases citan una sección que no existe (GLOBAL-SIN-BASE).
  if (archivoGlobales && capaGlobales !== "fábrica" && faltan.length) {
    const fabrica = path.join(capas[0]?.ruta ?? "", GLOBAL_RULES_FILE);
    // BASE y PENDIENTES son las esqueleto, en el idioma que sea.
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

  // Fases.
  // discoverPhases ya salta las capas que no son carpeta; esto cubre lo que quede (una carpeta
  // sin permiso de lectura, por ejemplo). El diagnóstico no lanza nunca: lo convierte en hallazgo.
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

  // Configuración local: machine.json y los presets disponibles.
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

  // Los bloques que se aplican sin proyecto: la capa global y el preset de machine.json.
  try {
    for (const h of revisarBloques(capasDe(null))) hallar(h.severidad, h.codigo, h.texto);
  } catch {
    // Un preset de machine.json que no existe ya es un PRESET-NO-EXISTE.
  }

  // Proyectos y punteros. Sin DOCS_PATH no hay nada que listar, y eso ya es un VAR-FALTA.
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
        // Con las fases de SU proyecto. Un manifiesto inválido no tumba el listado: se avisa, y sus
        // tareas se cuentan con las fases sin proyecto.
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
        // §8.3: documentos de los dos idiomas sin idioma declarado, o tareas del otro idioma que el declarado.
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

  // El mismo aviso puede salir de varios proyectos (un bloques.md global mal formado, por ejemplo).
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

// ─── Formato ────────────────────────────────────────────────────────────────
// Texto para la terminal (doctor) y Markdown para el chat (la tool y el recurso). Las dos salen
// del mismo objeto y tienen las mismas secciones, en el mismo orden. En el idioma de la llamada; los
// valores de los enums (severidad, capa, origen…) siguen canónicos en el objeto y se traducen aquí.

type Textos = {
  t: (codigo: string, parametros?: Record<string, unknown>) => string;
  valor: (valor: string) => string;
  columnas: (codigo: string) => string[];
};

function textos(idioma: Idioma = idiomaDeMensajes()): Textos {
  const t = (codigo: string, parametros: Record<string, unknown> = {}): string => mensaje(codigo, parametros, idioma);
  return { t, valor: (valor) => t("DOCTOR-VALOR", { valor }), columnas: (codigo) => t(codigo).split("|") };
}

// El ancho de la columna de severidad: la más larga más dos (7 en español, como siempre).
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

// Una celda de tabla Markdown: sin saltos de línea y con las barras escapadas.
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

// ─── Procedencia de una fase (doctor --fase N --proyecto P) ─────────────────
// Qué capa y qué archivo:línea gana en cada ranura del prompt que recibe el modelo, y qué modos se le
// sumaron. Con proyecto, para su tarea activa (que puede declarar su propio preset).
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
  // En inglés, cada ranura con su alias y el id canónico entre paréntesis (§8.2), y "fábrica" y los modos
  // traducidos. En español, como siempre.
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

// ─── El informe de configuración de un proyecto (phase-gate://configuracion/{proyecto}) ───
// El manifiesto efectivo, de dónde sale cada valor y el estado de sus repos en este equipo. El estado
// de git se pide antes, sin bloquear, con el mismo plazo que el diagnóstico.
export async function informeDeConfiguracion(carpetaProyecto: string): Promise<string> {
  let repos: RepoResuelto[] = [];
  try {
    const m = manifiestoDe(carpetaProyecto);
    if (m?.repos.length) repos = resolverRepos(carpetaProyecto, m.repos);
  } catch {
    repos = []; // el error lo enseña el propio informe
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
