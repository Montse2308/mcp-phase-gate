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

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import { DOCS, IDIOMA_POR_DEFECTO, REPOS, configDir, idiomaDelEntorno, idiomaDelSistema, raizPaquete, requireBasePath } from "./config.js";
import type { Hallazgo } from "./diagnostico.js";
import { ErrorConCodigo, mensaje } from "./i18n/mensajes.js";
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

export const MaquinaConfig = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    // "<PROYECTO>/<repo id>" -> ruta absoluta en ESTE equipo
    // Ruta absoluta: una relativa se resolvería contra el directorio de trabajo del cliente, que es
    // distinto en cada uno (hallazgo 17 de la auditoría de la Etapa 3).
    repos: z
      .record(
        z.string().regex(/^[^/\\]+\/[a-z0-9][a-z0-9-]{0,39}$/),
        z
          .string()
          .min(1)
          .refine((ruta) => path.win32.isAbsolute(ruta) || path.posix.isAbsolute(ruta), { error: () => mensaje("MAQUINA-TXT-RUTA-ABSOLUTA") })
      )
      .default({}),
    presetPorDefecto: z.string().optional(), // para proyectos sin manifiesto; si falta, "software"
    // Para proyectos que no declaran idioma ni tienen documentos que lo digan (§8.3, paso 3).
    idiomaPorDefecto: z.enum(["es", "en"]).optional(),
  })
  .strict();

export type MaquinaConfig = z.output<typeof MaquinaConfig>;

export const ARCHIVO_MANIFIESTO = "phase-gate.json";
export const ARCHIVO_MAQUINA = "machine.json";
export const URL_ESQUEMA_PROYECTO = "https://unpkg.com/mcp-phase-gate@3/schema/project.json";
export const URL_ESQUEMA_MAQUINA = "https://unpkg.com/mcp-phase-gate@3/schema/machine.json";

// ─── Errores legibles ───────────────────────────────────────────────────────
// "repos[1].dir", no ["repos", 1, "dir"]: es lo que la persona busca en su archivo.
export function rutaDeError(ruta: readonly PropertyKey[]): string {
  let texto = "";
  for (const parte of ruta) texto += typeof parte === "number" ? `[${parte}]` : `${texto ? "." : ""}${String(parte)}`;
  return texto || mensaje("MANIFIESTO-TXT-RAIZ");
}

// El valor que había en esa ruta del archivo: zod no lo guarda en el error, y sin él no se distingue
// un campo que falta de uno que vale otra cosa.
function valorEn(crudo: unknown, ruta: readonly PropertyKey[]): unknown {
  let actual: unknown = crudo;
  for (const parte of ruta) {
    if (actual === null || typeof actual !== "object") return undefined;
    actual = (actual as Record<PropertyKey, unknown>)[parte];
  }
  return actual;
}

function mensajeDe(issue: z.core.$ZodIssue, crudo: unknown): string {
  if ((issue.code === "invalid_type" || issue.code === "invalid_value") && valorEn(crudo, issue.path) === undefined) return mensaje("MANIFIESTO-TXT-FALTA");
  const i = issue as z.core.$ZodIssue & { keys?: string[]; values?: unknown[]; expected?: string; minimum?: number | bigint; maximum?: number | bigint; origin?: string };
  switch (i.code) {
    case "unrecognized_keys":
      return mensaje("MANIFIESTO-TXT-CLAVE-DESCONOCIDA", { claves: i.keys ?? [] });
    case "invalid_type":
      return mensaje("MANIFIESTO-TXT-TIPO", { tipo: i.expected });
    case "invalid_key":
      return mensaje("MANIFIESTO-TXT-CLAVE-MAQUINA");
    case "invalid_value":
      return mensaje("MANIFIESTO-TXT-VALOR", { valores: i.values ?? [] });
    case "too_small":
      return i.origin === "string" && Number(i.minimum) === 1 ? mensaje("MANIFIESTO-TXT-VACIO") : mensaje("MANIFIESTO-TXT-CORTO", { minimo: String(i.minimum) });
    case "too_big":
      return mensaje("MANIFIESTO-TXT-LARGO", { maximo: String(i.maximum) });
    case "invalid_format":
      return /^Invalid/.test(i.message) ? mensaje("MANIFIESTO-TXT-FORMATO") : i.message;
    default:
      return i.message;
  }
}

function errorDeZod(error: z.ZodError, crudo: unknown): string {
  return error.issues.map((issue) => `${rutaDeError(issue.path)}: ${mensajeDe(issue, crudo)}`).join("; ");
}

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

export function carpetaPresetsDelPaquete(idioma: string = IDIOMA_POR_DEFECTO): string {
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

export function presetsDisponibles(idioma: string = IDIOMA_POR_DEFECTO): Map<string, Preset> {
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

  const leido = Manifiesto.safeParse(crudo);
  if (!leido.success) return invalido(`${errorDeZod(leido.error, crudo)}.`);
  const manifiesto = leido.data;

  // Lo que zod no expresa.
  const vistos = new Set<string>();
  for (const [i, repo] of manifiesto.repos.entries()) {
    if (vistos.has(repo.id)) return invalido(mensaje("MANIFIESTO-TXT-ID-REPETIDO", { i, id: repo.id }));
    vistos.add(repo.id);
    const problema = errorDeDir(repo.dir);
    if (problema) return invalido(`repos[${i}].dir: ${problema}`);
  }

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
//   3. `idiomaPorDefecto` de machine.json;
//   4. PHASE_GATE_LANG;
//   5. el idioma del sistema (es si su locale empieza por "es"; si no, en).
export type OrigenDelIdioma = "del proyecto" | "de sus documentos" | "de machine.json" | "de PHASE_GATE_LANG" | "del sistema";
export type DocumentosPorIdioma = Record<Idioma, { documentos: number; tareas: string[] }>;
export type IdiomaResuelto = { idioma: Idioma; origen: OrigenDelIdioma; enDisco: DocumentosPorIdioma };

function sinDocumentos(): DocumentosPorIdioma {
  return { es: { documentos: 0, tareas: [] }, en: { documentos: 0, tareas: [] } };
}

// Cuántos documentos de fase con nombre de cada idioma tienen las tareas del proyecto, y en qué tareas.
export function documentosPorIdioma(carpetaProyecto: string): DocumentosPorIdioma {
  const cuenta = sinDocumentos();
  let raiz: string;
  let tareas: string[];
  try {
    raiz = tasksRootPath(carpetaProyecto);
    tareas = fs
      .readdirSync(raiz, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return cuenta; // sin Documentación o sin carpeta de tareas no hay nada que contar
  }
  for (const tarea of tareas) {
    for (const idioma of IDIOMAS) {
      const { contextoInicial, deFase } = VOCABULARIO[idioma].documentos;
      const hay = [contextoInicial, ...deFase].filter((nombre) => fs.existsSync(path.join(raiz, tarea, nombre))).length;
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
  const maquina = leerMaquina();
  if (maquina.config?.idiomaPorDefecto) return { idioma: maquina.config.idiomaPorDefecto, origen: "de machine.json" };
  const delEntorno = idiomaDelEntorno();
  if (delEntorno) return { idioma: delEntorno, origen: "de PHASE_GATE_LANG" };
  return { idioma: idiomaDelSistema(), origen: "del sistema" };
}

// `manifiesto` es para quien ya lo leyó (undefined: leerlo aquí; null: no tiene). Un manifiesto inválido
// no impide saber el idioma: se sigue con el disco.
export function idiomaDelProyecto(carpetaProyecto: string | null, manifiesto?: Manifiesto | null): IdiomaResuelto {
  const enDisco = carpetaProyecto ? documentosPorIdioma(carpetaProyecto) : sinDocumentos();
  let declarado: Idioma | undefined;
  if (manifiesto === undefined && carpetaProyecto) {
    const lectura = leerManifiesto(carpetaProyecto);
    declarado = lectura.estado === "valido" ? lectura.manifiesto.idioma : undefined;
  } else {
    declarado = manifiesto?.idioma;
  }
  if (declarado) return { idioma: declarado, origen: "del proyecto", enDisco };
  if (enDisco.es.documentos || enDisco.en.documentos) {
    // Con los dos, el que más documentos tenga; a la par, el español (el de todos los proyectos de la 2.x).
    return { idioma: enDisco.en.documentos > enDisco.es.documentos ? "en" : "es", origen: "de sus documentos", enDisco };
  }
  return { ...idiomaDelEquipo(), enDisco };
}

// Lo que no cuadra con el idioma del proyecto (doctor, y get_phase_prompt para IDIOMA-CON-TAREAS):
//   IDIOMA-MIXTO       sin idioma declarado, hay documentos con nombres de los dos idiomas;
//   IDIOMA-CON-TAREAS  el manifiesto declara un idioma y hay tareas con documentos del otro: la deducción
//                      las daría por "sin documentos". Cambiar el idioma no renombra nada (P7).
export function conflictoDeIdioma(carpetaProyecto: string, resuelto: IdiomaResuelto = idiomaDelProyecto(carpetaProyecto)): Hallazgo | null {
  const otro: Idioma = resuelto.idioma === "es" ? "en" : "es";
  const delOtro = resuelto.enDisco[otro];
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
  const ruta = rutaMaquina();
  const vacia = { config: null, repos: new Map<string, string>(), avisos: [] };
  if (!fs.existsSync(ruta)) return { estado: "ausente", ruta, error: null, ...vacia };

  const invalido = (error: string): LecturaMaquina => ({
    estado: "invalido",
    ruta,
    error: mensaje("MAQUINA-TXT-INVALIDA", { archivo: ARCHIVO_MAQUINA, ruta, error }),
    ...vacia,
  });

  let crudo: unknown;
  try {
    crudo = leerJson(ruta);
  } catch (error) {
    return invalido(mensaje("MANIFIESTO-TXT-JSON-INVALIDO", { detalle: error instanceof Error ? error.message : String(error) }));
  }

  const leido = MaquinaConfig.safeParse(crudo);
  if (!leido.success) return invalido(`${errorDeZod(leido.error, crudo)}.`);

  // "proyecto-a/api" y "PROYECTO-A/api" son la misma clave. Si hay dos, vale la primera.
  const repos = new Map<string, string>();
  const avisos: Hallazgo[] = [];
  for (const [clave, destino] of Object.entries(leido.data.repos)) {
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

  return { estado: "valido", ruta, config: leido.data, repos, error: null, avisos };
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
      "Configuración de mcp-phase-gate en este equipo: rutas de repos que salen de PHASE_GATE_REPOS_PATH y preset por defecto para proyectos sin manifiesto."
    ),
  };
}

export function textoDeEsquema(esquema: Record<string, unknown>): string {
  return `${JSON.stringify(esquema, null, 2)}\n`;
}
