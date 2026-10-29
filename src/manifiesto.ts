// La configuración que no es una variable de entorno: el manifiesto de cada proyecto
// (`<DOCS>/<PROYECTO>/phase-gate.json`), la de cada equipo (`<configDir>/machine.json`) y los
// presets disponibles.
//
// Los dos archivos son opcionales. Un proyecto sin manifiesto usa los valores por defecto; un equipo
// sin machine.json, también. Pero un archivo que existe y está mal escrito es un error explícito,
// con la ruta exacta del problema: ignorarlo en silencio y caer a los valores por defecto es el
// fallo silencioso que este diseño quiere evitar (decisión F2 del plan).
//
// Una sola fuente: los shapes zod de aquí validan los archivos, y schema/project.json y
// schema/machine.json —los que un editor usa para autocompletar— se generan de ellos
// (scripts/generar-esquemas.mjs). Un test exige que los publicados coincidan con lo que se genera.

import { AsyncLocalStorage } from "node:async_hooks";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import { DOCS, REPOS, conMaquinaDeLaLlamada, configDir, idiomaDeMaquina, idiomaDelEntorno, idiomaDelSistema, idiomaSinProyecto, leerArchivoDeMaquina, raizPaquete, requireBasePath } from "./config.js";
import type { Hallazgo } from "./diagnostico.js";
import { ErrorConCodigo, mensaje } from "./i18n/mensajes.js";
import { ARCHIVO_MAQUINA, MaquinaConfig, URL_ESQUEMA_MAQUINA, errorDeZod, rutaDeError } from "./maquina.js";
import { tasksRootPath, validarSegmento } from "./paths.js";
import { leerPromptNormalizado, separarFrontmatter } from "./phases.js";
import { IDIOMAS, VOCABULARIO, valorDePreset } from "./vocabulario.js";
import type { Idioma } from "./vocabulario.js";

// ─── Shapes ─────────────────────────────────────────────────────────────────
export const POLITICAS_COMMIT = ["agente-commitea-con-OK", "agente-propone", "auto", "ninguno"] as const;
export type PoliticaCommit = (typeof POLITICAS_COMMIT)[number];

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const RepoManifiesto = z
  .object({
    // El mensaje es una función: se redacta al validar, en el idioma de la llamada.
    id: z.string().regex(ID, { error: () => mensaje("MANIFIESTO-TXT-ID-DE-REPO") }),
    dir: z.string().min(1), // relativo a PHASE_GATE_REPOS_PATH; ver leerManifiesto
    rol: z.string().max(60).optional(),
  })
  .strict();

export const Manifiesto = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    preset: z.string().regex(ID).default("software"),
    // Sin `idioma`, el del proyecto se deduce: primero de sus documentos, después del equipo (§8.3).
    idioma: z.enum(["es", "en"]).optional(),
    repos: z.array(RepoManifiesto).default([]),
    reglas: z
      .object({
        lotes: z.boolean().optional(), // si falta, decide el preset
        commits: z.enum(POLITICAS_COMMIT).optional(),
        verificacion: z.array(z.string().min(1)).max(20).optional(),
      })
      .strict()
      .default({}),
    fase5: z.object({ prPorRepo: z.boolean().optional() }).strict().default({}),
  })
  .strict();

export type Manifiesto = z.output<typeof Manifiesto>;

// The shape of machine.json lives in maquina.ts; it is re-exported here because the rest takes it from here.
export { ARCHIVO_MAQUINA, MaquinaConfig, URL_ESQUEMA_MAQUINA, rutaDeError };

export const ARCHIVO_MANIFIESTO = "phase-gate.json";
export const URL_ESQUEMA_PROYECTO = "https://unpkg.com/mcp-phase-gate@3/schema/project.json";

// ─── Errores legibles ───────────────────────────────────────────────────────
// Un JSON con BOM (el Bloc de notas lo pone) se lee igual.
function leerJson(ruta: string): unknown {
  return JSON.parse(fs.readFileSync(ruta, "utf-8").replace(/^\uFEFF/, ""));
}

// ─── Presets ────────────────────────────────────────────────────────────────
// Un preset es un solo archivo de bloques con una cabecera plana. Los del paquete viven en
// presets/<idioma>/ y los del usuario en <configDir>/presets/; con el mismo nombre gana el del
// usuario. `software` es el preset por defecto: son los prompts de fábrica tal cual, así que existe
// aunque no haya archivo.
export const PRESET_POR_DEFECTO = "software";

export type OrigenPreset = "paquete" | "usuario" | "integrado";
export type Preset = {
  nombre: string;
  descripcion: string | null;
  lotes: boolean | null; // valores por defecto del preset; `reglas` del manifiesto los sobrescribe
  commits: PoliticaCommit | null;
  ruta: string | null; // null: el integrado `software`
  origen: OrigenPreset;
};

export function carpetaPresetsDelPaquete(idioma: string = idiomaSinProyecto()): string {
  return path.join(raizPaquete(), "presets", idioma);
}

export function carpetaPresetsDelUsuario(): string {
  return path.join(configDir(), "presets");
}

function leerPreset(ruta: string, nombre: string, origen: OrigenPreset): Preset {
  let meta: Record<string, string> = {};
  try {
    meta = separarFrontmatter(leerPromptNormalizado(ruta)).meta;
  } catch {
    // Un preset ilegible sigue existiendo: el error real sale al leer sus bloques.
  }
  // Las claves en el idioma del preset: `lotes` o `batches`, `descripcion` o `description` (§8.2).
  const delPreset = valorDePreset(meta, "lotes");
  const lotes = delPreset === "true" ? true : delPreset === "false" ? false : null;
  const commits = (POLITICAS_COMMIT as readonly string[]).includes(meta.commits ?? "") ? (meta.commits as PoliticaCommit) : null;
  return { nombre, descripcion: valorDePreset(meta, "descripcion") || null, lotes, commits, ruta, origen };
}

function presetsDe(carpeta: string, origen: OrigenPreset): Preset[] {
  let nombres: string[];
  try {
    nombres = fs.readdirSync(carpeta);
  } catch {
    return [];
  }
  return nombres
    .filter((archivo) => archivo.toLowerCase().endsWith(".md") && ID.test(archivo.slice(0, -3)))
    .sort()
    .filter((archivo) => fs.statSync(path.join(carpeta, archivo), { throwIfNoEntry: false })?.isFile())
    .map((archivo) => leerPreset(path.join(carpeta, archivo), archivo.slice(0, -3), origen));
}

// Sin idioma, el del equipo (§8.3): los presets del paquete existen en los dos idiomas con los mismos nombres.
export function presetsDisponibles(idioma: string = idiomaSinProyecto()): Map<string, Preset> {
  const presets = new Map<string, Preset>();
  presets.set(PRESET_POR_DEFECTO, {
    nombre: PRESET_POR_DEFECTO,
    descripcion: mensaje("MANIFIESTO-TXT-PRESET-SOFTWARE"),
    lotes: true,
    commits: "agente-commitea-con-OK",
    ruta: null,
    origen: "integrado",
  });
  for (const preset of presetsDe(carpetaPresetsDelPaquete(idioma), "paquete")) presets.set(preset.nombre, preset);
  for (const preset of presetsDe(carpetaPresetsDelUsuario(), "usuario")) presets.set(preset.nombre, preset);
  return presets;
}

export function describirPresets(presets: Map<string, Preset> = presetsDisponibles()): string {
  return [...presets.keys()].sort().join(", ");
}

// ─── Manifiesto ─────────────────────────────────────────────────────────────
export type LecturaManifiesto =
  | { estado: "ausente"; ruta: string }
  | { estado: "valido"; ruta: string; manifiesto: Manifiesto }
  | { estado: "invalido"; ruta: string; codigo: "MANIFIESTO-INVALIDO" | "PRESET-NO-EXISTE"; error: string };

export function rutaManifiesto(carpetaProyecto: string): string {
  return path.join(requireBasePath(DOCS), carpetaProyecto, ARCHIVO_MANIFIESTO);
}

// Un dir de repo es relativo a PHASE_GATE_REPOS_PATH y no sale de ahí: ni absoluto (en ningún
// sistema, porque el manifiesto viaja entre equipos) ni con "..". Para un repo que vive en otro
// sitio está machine.json, que es de cada equipo.
function errorDeDir(dir: string): string | null {
  if (path.win32.isAbsolute(dir) || path.posix.isAbsolute(dir)) {
    return mensaje("MANIFIESTO-TXT-DIR-ABSOLUTO");
  }
  try {
    for (const segmento of dir.split(/[\\/]/)) validarSegmento(segmento, "dir");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

// What makes a manifest valid, without looking at the disk: its shape and what zod does not express (a
// repeated repo id, a folder that leaves PHASE_GATE_REPOS_PATH). Used by leerManifiesto and the Ajustes plans,
// so that "valid" means the same when reading and when writing.
export function validarManifiesto(crudo: unknown): { ok: true; manifiesto: Manifiesto } | { ok: false; error: string } {
  const leido = Manifiesto.safeParse(crudo);
  if (!leido.success) return { ok: false, error: `${errorDeZod(leido.error, crudo)}.` };
  const vistos = new Set<string>();
  for (const [i, repo] of leido.data.repos.entries()) {
    if (vistos.has(repo.id)) return { ok: false, error: mensaje("MANIFIESTO-TXT-ID-REPETIDO", { i, id: repo.id }) };
    vistos.add(repo.id);
    const problema = errorDeDir(repo.dir);
    if (problema) return { ok: false, error: `repos[${i}].dir: ${problema}` };
  }
  return { ok: true, manifiesto: leido.data };
}

export function leerManifiesto(carpetaProyecto: string): LecturaManifiesto {
  const ruta = rutaManifiesto(carpetaProyecto);
  if (!fs.existsSync(ruta)) return { estado: "ausente", ruta };

  const invalido = (error: string, codigo: "MANIFIESTO-INVALIDO" | "PRESET-NO-EXISTE" = "MANIFIESTO-INVALIDO"): LecturaManifiesto => ({
    estado: "invalido",
    ruta,
    codigo,
    error: mensaje("MANIFIESTO-TXT-INVALIDO", { archivo: ARCHIVO_MANIFIESTO, proyecto: carpetaProyecto, ruta, error }),
  });

  let crudo: unknown;
  try {
    crudo = leerJson(ruta);
  } catch (error) {
    return invalido(mensaje("MANIFIESTO-TXT-JSON-INVALIDO", { detalle: error instanceof Error ? error.message : String(error) }));
  }

  const validado = validarManifiesto(crudo);
  if (!validado.ok) return invalido(validado.error);
  const manifiesto = validado.manifiesto;

  const presets = presetsDisponibles(idiomaDelProyecto(carpetaProyecto, manifiesto).idioma);
  if (!presets.has(manifiesto.preset)) {
    return invalido(mensaje("MANIFIESTO-TXT-PRESET-NO-EXISTE", { preset: manifiesto.preset, disponibles: describirPresets(presets) }), "PRESET-NO-EXISTE");
  }

  return { estado: "valido", ruta, manifiesto };
}

// Para quien necesita el manifiesto para trabajar: null si no hay, y un error con la ruta del
// problema si está mal escrito.
export function manifiestoDe(carpetaProyecto: string): Manifiesto | null {
  const lectura = leerManifiesto(carpetaProyecto);
  if (lectura.estado === "invalido") throw new ErrorConCodigo("MANIFIESTO-TXT-INVALIDO", lectura.error);
  return lectura.estado === "valido" ? lectura.manifiesto : null;
}

// Las copias que no se llaman exactamente phase-gate.json: la que deja OneDrive al editar el mismo
// archivo en dos equipos ("phase-gate-PC.json"), o un "phase-gate (1).json". Ninguna se lee.
export function copiasEnConflicto(carpetaProyecto: string): string[] {
  try {
    return fs
      .readdirSync(path.join(requireBasePath(DOCS), carpetaProyecto))
      .filter((nombre) => /^phase-gate.*\.json$/i.test(nombre) && nombre !== ARCHIVO_MANIFIESTO)
      .sort();
  } catch {
    return [];
  }
}

// ─── Idioma del proyecto (§8.3) ─────────────────────────────────────────────
// El idioma ESTRUCTURAL de un proyecto: la capa de fábrica (prompts/<idioma>/, presets/<idioma>/), los
// nombres de los documentos y el vocabulario con que escribe el servidor. Es del proyecto, porque la
// deducción de fase depende de los nombres de documento. En este orden:
//   1. `idioma` del manifiesto;
//   2. lo que ya hay en disco: el idioma de los documentos de sus tareas ("el disco es la verdad": un
//      proyecto sin manifiesto, con tareas en español, no se ve de golpe sin fases hechas porque el
//      sistema esté en inglés); con documentos de los dos, el que más tenga, y doctor da IDIOMA-MIXTO;
//   3. PHASE_GATE_LANG: what belongs to the run wins over what is stored, as in the paths;
//   4. `idiomaPorDefecto` of machine.json;
//   5. el idioma del sistema (es si su locale empieza por "es"; si no, en). Salvo para un proyecto con un
//      manifiesto sin `idioma`: ese manifiesto es de la 3.0 o la 3.1, cuyo esquema daba "es" por defecto, y
//      sigue en español aunque el sistema esté en inglés, como en un Linux sin LANG (hallazgo 2 de la
//      auditoría de la Etapa 6). machine.json y PHASE_GATE_LANG, que alguien fijó a propósito, sí cuentan.
export type OrigenDelIdioma = "del proyecto" | "de sus documentos" | "de machine.json" | "de PHASE_GATE_LANG" | "del manifiesto sin idioma" | "del sistema";
export type DocumentosPorIdioma = Record<Idioma, { documentos: number; tareas: string[] }>;
// `sinIdiomaDeclarado`: tiene un manifiesto válido que no dice su idioma (doctor da MANIFIESTO-SIN-IDIOMA
// si tampoco lo dicen sus documentos).
export type IdiomaResuelto = { idioma: Idioma; origen: OrigenDelIdioma; enDisco: DocumentosPorIdioma; sinIdiomaDeclarado: boolean };

function sinDocumentos(): DocumentosPorIdioma {
  return { es: { documentos: 0, tareas: [] }, en: { documentos: 0, tareas: [] } };
}

// Los nombres se comparan en NFC y sin mayúsculas, igual en todos los sistemas: en Windows y macOS el disco
// no distingue mayúsculas y en Linux sí, y un nombre que llega en NFD (macOS, OneDrive) es el mismo documento
// (hallazgo 12 de la auditoría de la Etapa 6).
const comparable = (nombre: string): string => nombre.normalize("NFC").toLowerCase();
const NOMBRES_POR_IDIOMA: ReadonlyArray<[Idioma, ReadonlySet<string>]> = IDIOMAS.map((idioma) => {
  const { contextoInicial, deFase } = VOCABULARIO[idioma].documentos;
  return [idioma, new Set([contextoInicial, ...deFase].map(comparable))];
});

// El recuento de una llamada (una tool, una petición de lectura del Studio, un doctor): el idioma de un
// proyecto se pregunta muchas veces en la misma llamada (el idioma de los mensajes, el de los presets al leer
// el manifiesto, el de las capas, el del prompt…), y cada recuento lee todas sus carpetas de tarea. Con esto,
// una vez por proyecto y por llamada (hallazgo 3 de la auditoría de la Etapa 6). Fuera de una llamada no hay
// caché: cada pregunta mira el disco. The same call also reads machine.json once (conMaquinaDeLaLlamada).
const recuentosDeLaLlamada = new AsyncLocalStorage<Map<string, DocumentosPorIdioma>>();

export function conCacheDelIdioma<T>(funcion: () => T): T {
  return conMaquinaDeLaLlamada(() => (recuentosDeLaLlamada.getStore() ? funcion() : recuentosDeLaLlamada.run(new Map(), funcion)));
}

// Cuántos documentos de fase con nombre de cada idioma tienen las tareas del proyecto, y en qué tareas.
export function documentosPorIdioma(carpetaProyecto: string): DocumentosPorIdioma {
  let raiz: string;
  try {
    raiz = tasksRootPath(carpetaProyecto);
  } catch {
    return sinDocumentos(); // sin Documentación no hay nada que contar
  }
  const cache = recuentosDeLaLlamada.getStore();
  const guardado = cache?.get(raiz);
  if (guardado) return structuredClone(guardado);
  const cuenta = contarDocumentos(raiz);
  cache?.set(raiz, structuredClone(cuenta));
  return cuenta;
}

function contarDocumentos(raiz: string): DocumentosPorIdioma {
  const cuenta = sinDocumentos();
  let tareas: string[];
  try {
    tareas = fs
      .readdirSync(raiz, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return cuenta; // sin carpeta de tareas no hay nada que contar
  }
  for (const tarea of tareas) {
    let nombres: string[];
    try {
      nombres = fs.readdirSync(path.join(raiz, tarea)).map(comparable);
    } catch {
      continue; // una carpeta que desaparece o no se puede leer no cuenta
    }
    for (const [idioma, suyos] of NOMBRES_POR_IDIOMA) {
      const hay = new Set(nombres.filter((nombre) => suyos.has(nombre))).size;
      if (hay) {
        cuenta[idioma].documentos += hay;
        cuenta[idioma].tareas.push(tarea);
      }
    }
  }
  return cuenta;
}

// Los pasos 3 a 5: el idioma de este equipo, sin proyecto. Un machine.json inválido no tumba nada aquí:
// lo dice doctor, y quien lo necesite para trabajar lo lee con maquinaDe.
export function idiomaDelEquipo(): { idioma: Idioma; origen: Exclude<OrigenDelIdioma, "del proyecto" | "de sus documentos"> } {
  const delEntorno = idiomaDelEntorno();
  if (delEntorno) return { idioma: delEntorno, origen: "de PHASE_GATE_LANG" };
  const deMaquina = idiomaDeMaquina();
  if (deMaquina) return { idioma: deMaquina, origen: "de machine.json" };
  return { idioma: idiomaDelSistema(), origen: "del sistema" };
}

// `manifiesto` es para quien ya lo leyó (undefined: leerlo aquí; null: no tiene). Un manifiesto inválido
// no impide saber el idioma: se sigue con el disco.
export function idiomaDelProyecto(carpetaProyecto: string | null, manifiesto?: Manifiesto | null): IdiomaResuelto {
  const enDisco = carpetaProyecto ? documentosPorIdioma(carpetaProyecto) : sinDocumentos();
  let delManifiesto: Manifiesto | null = null;
  if (manifiesto === undefined && carpetaProyecto) {
    const lectura = leerManifiesto(carpetaProyecto);
    delManifiesto = lectura.estado === "valido" ? lectura.manifiesto : null;
  } else {
    delManifiesto = manifiesto ?? null;
  }
  const sinIdiomaDeclarado = delManifiesto !== null && !delManifiesto.idioma;
  if (delManifiesto?.idioma) return { idioma: delManifiesto.idioma, origen: "del proyecto", enDisco, sinIdiomaDeclarado };
  if (enDisco.es.documentos || enDisco.en.documentos) {
    // Con los dos, el que más documentos tenga; a la par, el español (el de todos los proyectos de la 2.x).
    return { idioma: enDisco.en.documentos > enDisco.es.documentos ? "en" : "es", origen: "de sus documentos", enDisco, sinIdiomaDeclarado };
  }
  const delEquipo = idiomaDelEquipo();
  if (sinIdiomaDeclarado && delEquipo.origen === "del sistema") return { idioma: "es", origen: "del manifiesto sin idioma", enDisco, sinIdiomaDeclarado };
  return { ...delEquipo, enDisco, sinIdiomaDeclarado };
}

// Lo que no cuadra con el idioma del proyecto (doctor, y get_phase_prompt para IDIOMA-CON-TAREAS):
//   IDIOMA-MIXTO           sin idioma declarado, hay documentos con nombres de los dos idiomas;
//   IDIOMA-CON-TAREAS      el manifiesto declara un idioma y hay tareas con documentos del otro: la deducción
//                          las daría por "sin documentos". Cambiar el idioma no renombra nada (P7);
//   MANIFIESTO-SIN-IDIOMA  (aviso) el manifiesto no dice su idioma ni lo dicen sus documentos: el idioma
//                          sale de este equipo, o es el español de la 3.x, y el manifiesto viaja entre equipos.
export function conflictoDeIdioma(carpetaProyecto: string, resuelto: IdiomaResuelto = idiomaDelProyecto(carpetaProyecto)): Hallazgo | null {
  const otro: Idioma = resuelto.idioma === "es" ? "en" : "es";
  const delOtro = resuelto.enDisco[otro];
  if (resuelto.sinIdiomaDeclarado && resuelto.origen !== "de sus documentos") {
    return {
      severidad: "aviso",
      codigo: "MANIFIESTO-SIN-IDIOMA",
      texto: mensaje("MANIFIESTO-SIN-IDIOMA", { proyecto: carpetaProyecto, archivo: ARCHIVO_MANIFIESTO, idioma: resuelto.idioma, origen: resuelto.origen }),
    };
  }
  if (delOtro.documentos === 0) return null;
  if (resuelto.origen === "del proyecto") {
    return {
      severidad: "error",
      codigo: "IDIOMA-CON-TAREAS",
      texto: mensaje("IDIOMA-CON-TAREAS", { proyecto: carpetaProyecto, idioma: resuelto.idioma, archivo: ARCHIVO_MANIFIESTO, tareas: delOtro.tareas, otro }),
    };
  }
  if (resuelto.origen === "de sus documentos") {
    return {
      severidad: "error",
      codigo: "IDIOMA-MIXTO",
      texto: mensaje("IDIOMA-MIXTO", {
        proyecto: carpetaProyecto,
        es: resuelto.enDisco.es.documentos,
        en: resuelto.enDisco.en.documentos,
        idioma: resuelto.idioma,
        archivo: ARCHIVO_MANIFIESTO,
      }),
    };
  }
  return null;
}

// ─── machine.json ───────────────────────────────────────────────────────────
export type LecturaMaquina = {
  estado: "ausente" | "valido" | "invalido";
  ruta: string;
  config: MaquinaConfig | null;
  // Overrides de repos con la clave normalizada: el proyecto en minúsculas, como en los punteros.
  repos: Map<string, string>;
  error: string | null;
  avisos: Hallazgo[];
};

export function rutaMaquina(): string {
  return path.join(configDir(), ARCHIVO_MAQUINA);
}

export function claveDeRepo(carpetaProyecto: string, id: string): string {
  return `${carpetaProyecto.toLowerCase()}/${id}`;
}

function normalizarClave(clave: string): string {
  const corte = clave.indexOf("/");
  return `${clave.slice(0, corte).toLowerCase()}${clave.slice(corte)}`;
}

export function leerMaquina(): LecturaMaquina {
  const archivo = leerArchivoDeMaquina();
  const { ruta } = archivo;
  const vacia = { config: null, repos: new Map<string, string>(), avisos: [] };
  if (archivo.estado === "ausente") return { estado: "ausente", ruta, error: null, ...vacia };
  if (archivo.estado === "invalido") return { estado: "invalido", ruta, error: archivo.error, ...vacia };
  const config = archivo.config!;

  // "proyecto-a/api" y "PROYECTO-A/api" son la misma clave. Si hay dos, vale la primera.
  const repos = new Map<string, string>();
  const avisos: Hallazgo[] = [];
  for (const [clave, destino] of Object.entries(config.repos)) {
    const normalizada = normalizarClave(clave);
    if (repos.has(normalizada)) {
      avisos.push({
        severidad: "aviso",
        codigo: "MAQUINA-CLAVE-DUPLICADA",
        texto: mensaje("MAQUINA-CLAVE-DUPLICADA", { ruta, clave }),
      });
      continue;
    }
    repos.set(normalizada, path.resolve(destino));
  }

  return { estado: "valido", ruta, config, repos, error: null, avisos };
}

// Para quien necesita machine.json para trabajar: un archivo inválido es un error, no un "no hay".
export function maquinaDe(): LecturaMaquina {
  const lectura = leerMaquina();
  if (lectura.estado === "invalido") throw new ErrorConCodigo("MAQUINA-TXT-INVALIDA", lectura.error!);
  return lectura;
}

// ─── Repos de un proyecto ───────────────────────────────────────────────────
export type RepoManifiesto = z.output<typeof RepoManifiesto>;

export type RepoResuelto = {
  id: string;
  dir: string;
  rol: string | null;
  ruta: string | null; // null si no se pudo resolver (falta PHASE_GATE_REPOS_PATH)
  origenRuta: "machine.json" | "PHASE_GATE_REPOS_PATH" | null;
  existe: boolean;
  error: string | null;
};

// Dónde está cada repo en ESTE equipo: el override de machine.json ("<PROYECTO>/<id>") si lo hay, y
// si no, <PHASE_GATE_REPOS_PATH>/<dir>.
// machine.json solo se lee si hay repos que resolver: un machine.json roto no debe tumbar los proyectos
// que no lo necesitan (hallazgo 7 de la auditoría de la Etapa 3).
export function resolverRepos(carpetaProyecto: string, repos: readonly RepoManifiesto[], maquinaDada?: LecturaMaquina): RepoResuelto[] {
  if (repos.length === 0) return [];
  const maquina = maquinaDada ?? maquinaDe();
  let base: string | null = null;
  let errorBase: string | null = null;
  const baseDeRepos = (): string | null => {
    if (base === null && errorBase === null) {
      try {
        base = requireBasePath(REPOS);
      } catch (error) {
        errorBase = error instanceof Error ? error.message : String(error);
      }
    }
    return base;
  };

  return repos.map((repo) => {
    const override = maquina.repos.get(claveDeRepo(carpetaProyecto, repo.id));
    const raiz = override ? null : baseDeRepos();
    const ruta = override ?? (raiz ? path.join(raiz, ...repo.dir.split(/[\\/]/)) : null);
    let existe = false;
    try {
      existe = ruta !== null && fs.statSync(ruta).isDirectory();
    } catch {
      existe = false;
    }
    return {
      id: repo.id,
      dir: repo.dir,
      rol: repo.rol ?? null,
      ruta,
      origenRuta: override ? "machine.json" : ruta ? "PHASE_GATE_REPOS_PATH" : null,
      existe,
      error: ruta ? null : errorBase,
    };
  });
}

// ─── JSON Schema publicados ─────────────────────────────────────────────────
// Lo que va en schema/*.json, generado de los shapes de arriba. Lo usan el script que los escribe y
// el test que comprueba que lo publicado coincide.
export function esquemasPublicados(): Record<"project.json" | "machine.json", Record<string, unknown>> {
  const con = (esquema: z.ZodType, id: string, titulo: string, descripcion: string): Record<string, unknown> => {
    const { $schema, ...resto } = z.toJSONSchema(esquema, { io: "input" }) as Record<string, unknown>;
    return { $schema, $id: id, title: titulo, description: descripcion, ...resto };
  };
  return {
    "project.json": con(
      Manifiesto,
      URL_ESQUEMA_PROYECTO,
      "phase-gate.json",
      "Manifiesto de un proyecto de mcp-phase-gate: preset, idioma, repositorios y reglas. Vive en <DOCS>/<PROYECTO>/phase-gate.json."
    ),
    "machine.json": con(
      MaquinaConfig,
      URL_ESQUEMA_MAQUINA,
      "machine.json",
      "Configuración de mcp-phase-gate en este equipo: las rutas de la Documentación y de los repos, la ruta propia de cada repo, el preset por defecto para proyectos sin manifiesto y el idioma por defecto. Vive en la carpeta de configuración de este equipo, no en la Documentación."
    ),
  };
}

export function textoDeEsquema(esquema: Record<string, unknown>): string {
  return `${JSON.stringify(esquema, null, 2)}\n`;
}
