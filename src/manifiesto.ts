// The configuration that is not an environment variable: the manifest of each project
// (`<DOCS>/<PROJECT>/phase-gate.json`), the one of each machine (`<configDir>/machine.json`) and the
// available presets.
//
// Both files are optional. A project without a manifest uses the default values; a machine without
// machine.json, too. But a file that exists and is badly written is an explicit error, with the exact path
// of the problem: ignoring it silently and falling back to the default values is the silent failure this
// design wants to avoid.
//
// A single source: the zod shapes here validate the files, and schema/project.json and schema/machine.json
// —the ones an editor uses for autocompletion— are generated from them (scripts/generar-esquemas.mjs). A
// test requires the published ones to match what is generated.

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
    // The message is a function: it is worded when validating, in the language of the call.
    id: z.string().regex(ID, { error: () => mensaje("MANIFIESTO-TXT-ID-DE-REPO") }),
    dir: z.string().min(1), // relative to PHASE_GATE_REPOS_PATH; see leerManifiesto
    rol: z.string().max(60).optional(),
  })
  .strict();

export const Manifiesto = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    preset: z.string().regex(ID).default("software"),
    // Without `idioma`, the project's is deduced: first from its documents, then the machine's.
    idioma: z.enum(["es", "en"]).optional(),
    repos: z.array(RepoManifiesto).default([]),
    reglas: z
      .object({
        lotes: z.boolean().optional(), // if missing, the preset decides
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

// ─── Readable errors ────────────────────────────────────────────────────────
// A JSON with a BOM (Notepad adds it) is read the same.
function leerJson(ruta: string): unknown {
  return JSON.parse(fs.readFileSync(ruta, "utf-8").replace(/^\uFEFF/, ""));
}

// ─── Presets ────────────────────────────────────────────────────────────────
// A preset is a single file of blocks with a flat header. The package's live in presets/<language>/ and the
// user's in <configDir>/presets/; with the same name the user's wins. `software` is the default preset: it
// is the factory prompts as they are, so it exists even without a file.
export const PRESET_POR_DEFECTO = "software";

export type OrigenPreset = "paquete" | "usuario" | "integrado";
export type Preset = {
  nombre: string;
  descripcion: string | null;
  lotes: boolean | null; // default values of the preset; the manifest's `reglas` override them
  commits: PoliticaCommit | null;
  ruta: string | null; // null: the built-in `software`
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
    // An unreadable preset still exists: the real error comes out when reading its blocks.
  }
  // The keys in the preset's language: `lotes` or `batches`, `descripcion` or `description`.
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

// Without a language, the machine's: the package's presets exist in both languages with the same names.
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

// A repo's dir is relative to PHASE_GATE_REPOS_PATH and does not leave it: not absolute (on any system,
// because the manifest travels between machines) nor with "..". For a repo that lives elsewhere there is
// machine.json, which belongs to each machine.
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

// For whoever needs the manifest to work: null if there is none, and an error with the path of the problem
// if it is badly written.
export function manifiestoDe(carpetaProyecto: string): Manifiesto | null {
  const lectura = leerManifiesto(carpetaProyecto);
  if (lectura.estado === "invalido") throw new ErrorConCodigo("MANIFIESTO-TXT-INVALIDO", lectura.error);
  return lectura.estado === "valido" ? lectura.manifiesto : null;
}

// The copies not called exactly phase-gate.json: the one OneDrive leaves when the same file is edited on two
// machines ("phase-gate-PC.json"), or a "phase-gate (1).json". None is read.
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

// ─── Language of the project ────────────────────────────────────────────────
// The STRUCTURAL language of a project: the factory layer (prompts/<language>/, presets/<language>/), the
// names of the documents and the vocabulary the server writes with. It belongs to the project, because the
// phase deduction depends on the document names. In this order:
//   1. `idioma` of the manifest;
//   2. what is already on disk: the language of the documents of its tasks ("the disk is the truth": a
//      project without a manifest, with tasks in Spanish, must not suddenly look like it has no phases done
//      just because the system is in English); with documents of both, the one with the most, and doctor
//      gives IDIOMA-MIXTO;
//   3. PHASE_GATE_LANG: what belongs to the run wins over what is stored, as in the paths;
//   4. `idiomaPorDefecto` of machine.json;
//   5. the system language (es if its locale starts with "es"; otherwise en). Except for a project with a
//      manifest without `idioma`: that manifest is from 3.0 or 3.1, whose schema defaulted to "es", and it
//      stays in Spanish even if the system is in English, as on a Linux without LANG. machine.json and
//      PHASE_GATE_LANG, which someone set on purpose, do count.
export type OrigenDelIdioma = "del proyecto" | "de sus documentos" | "de machine.json" | "de PHASE_GATE_LANG" | "del manifiesto sin idioma" | "del sistema";
export type DocumentosPorIdioma = Record<Idioma, { documentos: number; tareas: string[] }>;
// `sinIdiomaDeclarado`: it has a valid manifest that does not state its language (doctor gives
// MANIFIESTO-SIN-IDIOMA if its documents do not state it either).
export type IdiomaResuelto = { idioma: Idioma; origen: OrigenDelIdioma; enDisco: DocumentosPorIdioma; sinIdiomaDeclarado: boolean };

function sinDocumentos(): DocumentosPorIdioma {
  return { es: { documentos: 0, tareas: [] }, en: { documentos: 0, tareas: [] } };
}

// The names are compared in NFC and case-insensitively, the same on every system: on Windows and macOS the
// disk does not distinguish capitals and on Linux it does, and a name that arrives in NFD (macOS, OneDrive)
// is the same document.
const comparable = (nombre: string): string => nombre.normalize("NFC").toLowerCase();
const NOMBRES_POR_IDIOMA: ReadonlyArray<[Idioma, ReadonlySet<string>]> = IDIOMAS.map((idioma) => {
  const { contextoInicial, deFase } = VOCABULARIO[idioma].documentos;
  return [idioma, new Set([contextoInicial, ...deFase].map(comparable))];
});

// The count of a call (a tool, a read request of the Studio, a doctor): a project's language is asked many
// times in the same call (the messages' language, the presets' when reading the manifest, the layers', the
// prompt's…), and each count reads all its task folders. With this, once per project and per call. Outside
// a call there is no cache: each question looks at the disk. The same call also reads machine.json once
// (conMaquinaDeLaLlamada).
const recuentosDeLaLlamada = new AsyncLocalStorage<Map<string, DocumentosPorIdioma>>();

export function conCacheDelIdioma<T>(funcion: () => T): T {
  return conMaquinaDeLaLlamada(() => (recuentosDeLaLlamada.getStore() ? funcion() : recuentosDeLaLlamada.run(new Map(), funcion)));
}

// How many phase documents named in each language the tasks of the project have, and in which tasks.
export function documentosPorIdioma(carpetaProyecto: string): DocumentosPorIdioma {
  let raiz: string;
  try {
    raiz = tasksRootPath(carpetaProyecto);
  } catch {
    return sinDocumentos(); // without Documentation there is nothing to count
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
    return cuenta; // without a tasks folder there is nothing to count
  }
  for (const tarea of tareas) {
    let nombres: string[];
    try {
      nombres = fs.readdirSync(path.join(raiz, tarea)).map(comparable);
    } catch {
      continue; // a folder that disappears or cannot be read does not count
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

// Steps 3 to 5: the language of this machine, without a project. An invalid machine.json does not bring
// anything down here: doctor says so, and whoever needs it to work reads it with maquinaDe.
export function idiomaDelEquipo(): { idioma: Idioma; origen: Exclude<OrigenDelIdioma, "del proyecto" | "de sus documentos"> } {
  const delEntorno = idiomaDelEntorno();
  if (delEntorno) return { idioma: delEntorno, origen: "de PHASE_GATE_LANG" };
  const deMaquina = idiomaDeMaquina();
  if (deMaquina) return { idioma: deMaquina, origen: "de machine.json" };
  return { idioma: idiomaDelSistema(), origen: "del sistema" };
}

// `manifiesto` is for whoever already read it (undefined: read it here; null: it has none). An invalid
// manifest does not prevent knowing the language: it goes on with the disk.
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
    // With both, the one with the most documents; on a tie, Spanish (that of every 2.x project).
    return { idioma: enDisco.en.documentos > enDisco.es.documentos ? "en" : "es", origen: "de sus documentos", enDisco, sinIdiomaDeclarado };
  }
  const delEquipo = idiomaDelEquipo();
  if (sinIdiomaDeclarado && delEquipo.origen === "del sistema") return { idioma: "es", origen: "del manifiesto sin idioma", enDisco, sinIdiomaDeclarado };
  return { ...delEquipo, enDisco, sinIdiomaDeclarado };
}

// What does not fit the project's language (doctor, and get_phase_prompt for IDIOMA-CON-TAREAS):
//   IDIOMA-MIXTO           no language declared, and there are documents with names of both languages;
//   IDIOMA-CON-TAREAS      the manifest declares a language and there are tasks with documents of the
//                          other one: the deduction would take them as "without documents". Changing the
//                          language renames nothing;
//   MANIFIESTO-SIN-IDIOMA  (warning) the manifest does not state its language, and neither do its
//                          documents: the language comes from this machine, or is the Spanish of 3.x,
//                          and the manifest travels between machines.
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
  // Repo overrides with the normalized key: the project in lowercase, as in the pointers.
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

  // "proyecto-a/api" and "PROYECTO-A/api" are the same key. If there are two, the first one counts.
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

// For whoever needs machine.json to work: an invalid file is an error, not a "there is none".
export function maquinaDe(): LecturaMaquina {
  const lectura = leerMaquina();
  if (lectura.estado === "invalido") throw new ErrorConCodigo("MAQUINA-TXT-INVALIDA", lectura.error!);
  return lectura;
}

// ─── Repos of a project ─────────────────────────────────────────────────────
export type RepoManifiesto = z.output<typeof RepoManifiesto>;

export type RepoResuelto = {
  id: string;
  dir: string;
  rol: string | null;
  ruta: string | null; // null if it could not be resolved (PHASE_GATE_REPOS_PATH is missing)
  origenRuta: "machine.json" | "PHASE_GATE_REPOS_PATH" | null;
  existe: boolean;
  error: string | null;
};

// Where each repo is on THIS machine: the machine.json override ("<PROJECT>/<id>") if there is one, and
// otherwise <PHASE_GATE_REPOS_PATH>/<dir>. machine.json is only read if there are repos to resolve: a
// broken machine.json must not bring down the projects that do not need it.
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

// ─── Published JSON Schemas ─────────────────────────────────────────────────
// What goes in schema/*.json, generated from the shapes above. It is used by the script that writes them and
// by the test that checks that what is published matches.
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
