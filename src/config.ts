// Server configuration: environment paths, state location and identity.
//
// Everything that comes from the environment is read on every call, not once on importing the module. It is
// what `requireBasePath` already did and here it is extended to the rest: a value captured at startup forces
// restarting the client to change it, and makes it impossible to test a function with another configuration
// without reloading the whole module.

import { AsyncLocalStorage } from "node:async_hooks";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import { parseEnv } from "util";

import { fallo, mensaje } from "./i18n/mensajes.js";
import { ARCHIVO_MAQUINA, interpretarMaquina } from "./maquina.js";
import type { MaquinaConfig, RutasDeMaquina } from "./maquina.js";

// Folder of this module. It is used to locate the .env and the package.json at the root of the repo.
export const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── The .env ───────────────────────────────────────────────────────────────
// The .env at the package root (one level above build/ or src/) lets each device define its paths without
// touching mcp.json. It is read with a reader of its own and not with dotenv or process.loadEnvFile:
// loadEnvFile does not strip the UTF-8 BOM, and with a .env saved with a BOM the first key arrived as
// "\uFEFFORQUESTADOR_DOCS_PATH" and the variable vanished. And a UTF-16 .env —what PowerShell produces with
// ">"— would only show up as broken accents.
//
// The client's "env" block still wins: only the keys that are not already in the environment are assigned,
// as dotenv did.
const clavesCargadas = new Set<string>();
// The error is stored as a code and data, and is worded when read: the load runs on importing this module,
// when there is still no call (nor call language), and the text has to come out in the language of whoever
// reads it.
type ErrorDeCarga = { codigo: "ENV-TXT-ILEGIBLE" | "ENV-TXT-UTF16" | "ENV-TXT-NO-INTERPRETABLE"; parametros: Record<string, string> };
let errorDeCarga: ErrorDeCarga | null = null;

export function envPorDefecto(): string {
  return path.join(MODULE_DIR, "..", ".env");
}

// Keys that came from the .env; the others, from the environment. doctor uses this to say the source.
export function clavesDeEnv(): ReadonlySet<string> {
  return clavesCargadas;
}

// Stored error of the last load (for example, UTF-16), or null.
export function errorDeEnv(): string | null {
  return errorDeCarga ? mensaje(errorDeCarga.codigo, errorDeCarga.parametros) : null;
}

// Only for tests: removes from the environment the keys that came from the .env, and empties clavesDeEnv()
// and the stored error. Without it, a .env loaded in one test would contaminate the next.
export function reiniciarEnv(): void {
  for (const clave of clavesCargadas) delete process.env[clave];
  clavesCargadas.clear();
  errorDeCarga = null;
}

// Loads the .env. Without an argument, the one at the package root. It is called once on importing this
// module. Calling it again replaces what the previous time loaded.
export function cargarEnv(archivo: string = envPorDefecto()): void {
  reiniciarEnv();

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(archivo);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return; // no .env, everything comes from the environment
    errorDeCarga = { codigo: "ENV-TXT-ILEGIBLE", parametros: { archivo, detalle: error instanceof Error ? error.message : String(error) } };
    return;
  }

  // UTF-16 with a BOM in either order, or without a BOM but with NUL bytes: in a UTF-8 text .env there is no
  // NUL, and in UTF-16 there is one in almost every character.
  const conBom16 = bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
  if (conBom16 || bytes.subarray(0, 512).includes(0)) {
    errorDeCarga = { codigo: "ENV-TXT-UTF16", parametros: { archivo } };
    return;
  }

  const texto = bytes.toString("utf-8").replace(/^\uFEFF/, "");

  let valores: Record<string, string>;
  try {
    valores = parseEnv(texto) as Record<string, string>;
  } catch (error) {
    errorDeCarga = { codigo: "ENV-TXT-NO-INTERPRETABLE", parametros: { archivo, detalle: error instanceof Error ? error.message : String(error) } };
    return;
  }

  for (const [clave, valor] of Object.entries(valores)) {
    if (process.env[clave] !== undefined) continue;
    process.env[clave] = valor;
    clavesCargadas.add(clave);
  }
}

cargarEnv();

// ─── Variables ──────────────────────────────────────────────────────────────
// Each variable has a logical name and two environment names: PHASE_GATE_*, which follows the package name,
// and ORQUESTADOR_*, the original one, kept as an alias so as not to break any existing configuration. If
// both are present and say different things PHASE_GATE_* wins, and the discrepancy is reported: doctor shows
// it and the server logs it at startup.
export type NombreLogico =
  | "DOCS_PATH"
  | "REPOS_PATH"
  | "TASKS_SUBDIR"
  | "PROMPTS_PATH"
  | "STATE_PATH"
  | "CONFIG_PATH"
  | "ELICITATION"
  | "LANG";

type Nombres = { principal: string; alias: string | null; esRuta: boolean };

export const VARIABLES: Record<NombreLogico, Nombres> = {
  DOCS_PATH: { principal: "PHASE_GATE_DOCS_PATH", alias: "ORQUESTADOR_DOCS_PATH", esRuta: true },
  REPOS_PATH: { principal: "PHASE_GATE_REPOS_PATH", alias: "ORQUESTADOR_REPOS_PATH", esRuta: true },
  TASKS_SUBDIR: { principal: "PHASE_GATE_TASKS_SUBDIR", alias: "ORQUESTADOR_TASKS_SUBDIR", esRuta: false },
  PROMPTS_PATH: { principal: "PHASE_GATE_PROMPTS_PATH", alias: "ORQUESTADOR_PROMPTS_PATH", esRuta: true },
  STATE_PATH: { principal: "PHASE_GATE_STATE_PATH", alias: "ORQUESTADOR_STATE_PATH", esRuta: true },
  // No alias: it was born with the new name, like ELICITATION.
  CONFIG_PATH: { principal: "PHASE_GATE_CONFIG_PATH", alias: null, esRuta: true },
  ELICITATION: { principal: "PHASE_GATE_ELICITATION", alias: null, esRuta: false },
  // The language of the projects that do not declare it and whose documents do not say it, and that of the
  // messages when a call resolves no project.
  LANG: { principal: "PHASE_GATE_LANG", alias: null, esRuta: false },
};

export const NOMBRES_LOGICOS = Object.keys(VARIABLES) as NombreLogico[];

export type FuenteVariable = "entorno" | ".env" | "machine.json" | "sin definir";
export type LecturaVariable = {
  logica: NombreLogico;
  valor: string | undefined; // already trimmed
  usada: string | null; // environment name that won
  fuente: FuenteVariable;
  discrepancia: string | null; // text of the warning if both exist and differ
};

// Which name wins, in this order:
//   1. The source: the environment (the client's "env" block) wins over the .env, also when each name
//      arrives by a different route. Otherwise a .env with PHASE_GATE_X would beat an env block with
//      ORQUESTADOR_X, and "the client wins over the .env" would stop being true.
//   2. Within the same source, PHASE_GATE_* wins over ORQUESTADOR_*.
//   3. For DOCS_PATH, REPOS_PATH and TASKS_SUBDIR, what `rutas` in machine.json says. What belongs to the
//      run wins over what is stored, as in git and npm. It is read on every call, and only if the
//      environment does not define the variable.
//
// "Defined" means that it exists, even if empty: a TASKS_SUBDIR left empty on purpose means that the tasks
// hang straight from the project, and that has to be sayable with the new name too. In PATH variables, on
// the other hand, empty counts as absent: an empty path means nothing, and must not cover an alias that does
// point to a folder.
export function leerVariable(logica: NombreLogico): LecturaVariable {
  const { principal, alias, esRuta } = VARIABLES[logica];
  const definida = (nombre: string): boolean => {
    const valor = process.env[nombre];
    return valor !== undefined && (!esRuta || valor.trim() !== "");
  };
  const fuenteDe = (nombre: string): FuenteVariable => (clavesCargadas.has(nombre) ? ".env" : "entorno");

  const candidatos = (alias ? [principal, alias] : [principal]).filter(definida);
  // sort is stable: with the same source the order principal, alias is kept.
  candidatos.sort((a, b) => Number(fuenteDe(a) === ".env") - Number(fuenteDe(b) === ".env"));

  const usada = candidatos[0] ?? null;
  const ignorada = candidatos[1] ?? null;
  const crudo = usada ? process.env[usada] : undefined;

  if (usada === null) {
    const clave = CLAVE_EN_MAQUINA[logica];
    const guardado = valorDeMaquina(logica);
    if (clave && guardado !== undefined && (!esRuta || guardado.trim() !== "")) {
      return { logica, valor: guardado.trim(), usada: `rutas.${clave}`, fuente: "machine.json", discrepancia: null };
    }
  }

  let discrepancia: string | null = null;
  if (usada && ignorada) {
    const comparable = (valor: string): string => {
      const recortado = valor.trim();
      return esRuta && recortado ? path.resolve(recortado) : recortado;
    };
    if (comparable(process.env[usada]!) !== comparable(process.env[ignorada]!)) {
      discrepancia = mensaje("CONFIG-VAR-DIFIERE", { ignorada, usada, clienteGana: fuenteDe(usada) !== fuenteDe(ignorada) });
    }
  } else if (esRuta && alias && usada === alias && process.env[principal] !== undefined) {
    discrepancia = mensaje("CONFIG-VAR-VACIA", { principal, alias });
  }

  return {
    logica,
    valor: crudo?.trim(),
    usada,
    fuente: usada === null ? "sin definir" : fuenteDe(usada),
    discrepancia,
  };
}

// How a variable is named in a message: the main one, and the alias in parentheses.
export function nombrarVariable(logica: NombreLogico): string {
  const { principal, alias } = VARIABLES[logica];
  return alias ? mensaje("CONFIG-VAR-CON-ALIAS", { principal, alias }) : principal;
}

// Absolute paths from the environment. They are configured by environment variable (via .env or the "env"
// block of mcp.json) so that the MCP can be used on different devices without recompiling.
//
// They have no default value, on purpose. A default is always the path of the machine of whoever wrote the
// code: on any other device the server started "fine" and the error came out much later, inside a tool,
// disguised as "I did not find the file" and without mentioning that what was missing was configuring a
// variable.
//
// `apuntaA` is a getter: the text is worded when read, in the language of the call.
export type RutaRequerida = { logica: NombreLogico; apuntaA: string };

export const DOCS: RutaRequerida = {
  logica: "DOCS_PATH",
  get apuntaA() {
    return mensaje("CONFIG-APUNTA-A-DOCS");
  },
};

export const REPOS: RutaRequerida = {
  logica: "REPOS_PATH",
  get apuntaA() {
    return mensaje("CONFIG-APUNTA-A-REPOS");
  },
};

// It is resolved and validated on every call, not once at startup. That way the server stays up even if
// configuration is missing, the tools that do not depend on these paths keep serving, and the error reaches
// the chat —where the user is— instead of staying buried in a log.
export function requireBasePath({ logica, apuntaA }: RutaRequerida): string {
  const { valor, usada, fuente } = leerVariable(logica);

  if (!valor || !usada) {
    // If the .env could not be loaded, or machine.json cannot be read, that is almost surely the cause: it is
    // said first.
    const maquina = maquinaVigente();
    throw fallo("CONFIG-FALTA-VARIABLE", {
      variable: nombrarVariable(logica),
      apuntaA,
      clave: `rutas.${CLAVE_EN_MAQUINA[logica]}`,
      delEnv: errorDeEnv(),
      delMaquina: maquina.estado === "invalido" && !maquina.deMemoria ? maquina.error : null,
    });
  }

  const ruta = path.resolve(valor);

  // A variable that is defined but wrong fails as late as a missing one, so existence is checked here. The BOM
  // and UTF-16 are already handled by cargarEnv; a .env saved in ANSI still breaks the accents without being
  // detectable with certainty.
  // If the value came from machine.json, the error names that file and not an environment variable.
  const variable = fuente === "machine.json" ? `${ARCHIVO_MAQUINA} (${usada})` : usada;
  if (!fs.existsSync(ruta)) {
    throw fallo("CONFIG-RUTA-NO-EXISTE", { variable, ruta, fuente });
  }

  if (!fs.statSync(ruta).isDirectory()) {
    throw fallo("CONFIG-RUTA-ES-ARCHIVO", { variable, ruta });
  }

  return ruta;
}

// Subfolder where the tasks live inside each project (e.g. PROYECTO-A/Proyectos/<task>). It is an
// organization convention, not a device path, but it lives in the environment so as not to introduce a
// configuration file for a single string. Empty on purpose means that the tasks hang straight from the
// project.
export const TASKS_SUBDIR_POR_DEFECTO = "Proyectos";

export function tasksSubdir(): string {
  return leerVariable("TASKS_SUBDIR").valor ?? TASKS_SUBDIR_POR_DEFECTO;
}

// ─── Prompts, in layers ─────────────────────────────────────────────────────
// The phase prompts live in loose .md files. Living outside the code lets one tune the text of a phase
// without recompiling: the .md is edited and the next call to get_phase_prompt already brings the new version.
//
// They are loaded in LAYERS, not by replacement: first the package's and on top, if it exists, the folder
// the user declares. The last layer that declares a phase is the one that stays.
//
// A `PROMPTS_PATH` that replaced the whole folder would only work with a clone of the repo around, where
// editing `prompts/` is natural. Installed from npm the factory ones fall inside node_modules, where editing
// them is useless because the next install takes them away. Replacing would then force copying the five
// phases to change one: you end up with frozen copies that no longer receive improvements and, if you
// forget to copy one, that phase simply stops existing without anything warning you.
//
// The factory ones live in a subfolder per language (prompts/es/), so that the English version arrives
// alongside without moving anything. The layers of one's own do not change: a user's prompts folder still
// has its fase-N-*.md at the root.
export const IDIOMA_POR_DEFECTO = "es";

// ─── Language of the environment and of the system ──────────────────────────
// They live in i18n/idioma.ts, without dependencies: the messages need them and this module writes messages
// when loading (the .env).
export { fijarLocaleDelSistema, idiomaDeEtiqueta, idiomaDelEntorno, idiomaDelSistema } from "./i18n/idioma.js";
import { idiomaDelEntorno as idiomaDelEntornoBase, idiomaDelSistema as idiomaDelSistemaBase } from "./i18n/idioma.js";
import type { Idioma } from "./vocabulario.js";

// The package root: the folder that has build/, prompts/ and presets/ beside it. The tests run from
// build-test/, which does not have those folders beside it; they point it at the repo with
// fijarRaizDelPaquete when they need the real factory prompts and presets.
let raizDelPaquete = path.join(MODULE_DIR, "..");

export function raizPaquete(): string {
  return raizDelPaquete;
}

// Only for tests. null goes back to the real root.
export function fijarRaizDelPaquete(ruta: string | null): void {
  raizDelPaquete = ruta ?? path.join(MODULE_DIR, "..");
}

// The language of this machine when there is no project: PHASE_GATE_LANG, then `idiomaPorDefecto` of
// machine.json and, last, the system's. As with the paths, what belongs to the run wins over what is stored.
// It is the same as idiomaDelEquipo (manifiesto.ts), which also says where it came from; both read
// machine.json with the same reader, so this module does not import the manifest's, which imports it. An
// unreadable machine.json does not count: doctor says so.
export function idiomaSinProyecto(): Idioma {
  return idiomaDelEntornoBase() ?? idiomaDeMaquina() ?? idiomaDelSistemaBase();
}

// Without a language, the machine's: the factory layer without a project can be prompts/en/.
export function defaultPromptsPath(idioma: string = idiomaSinProyecto()): string {
  return path.join(raizPaquete(), "prompts", idioma);
}

// From lowest to highest priority. The user's goes last: it wins.
// The layers that contribute bodies (fase-N-*.md, global-rules.md, comandos/) without a project: the
// factory one (in the machine's language, or the one requested) and the global one. The full assembly, with
// presets, rules and the project's layer, is built by capasDe in capas.ts; this stays as its version without
// a project.
export function promptsLayers(idioma: string = idiomaSinProyecto()): string[] {
  const capas = [defaultPromptsPath(idioma)];
  const global = carpetaPromptsGlobal();

  if (global) capas.push(global);

  return capas;
}

// The global layer: PHASE_GATE_PROMPTS_PATH if it is defined; otherwise <configDir>/prompts/ when it exists.
// That way one can have a layer of one's own without defining any variable: creating the folder is enough
// (eject --a global creates it).
export function carpetaPromptsGlobal(): string | null {
  const propia = leerVariable("PROMPTS_PATH").valor;
  if (propia) return path.resolve(propia);

  const enConfig = path.join(configDir(), "prompts");
  try {
    return fs.statSync(enConfig).isDirectory() ? enConfig : null;
  } catch {
    return null;
  }
}

// ─── Local state ────────────────────────────────────────────────────────────
// The state lives in the user's data folder, NOT next to the build. `build/` is a generated folder:
// deleting it to recompile from scratch took the state with it. Also, this location is the only one that
// works when the server runs from an installed package, without a repo around.
// It follows the package name: this path is written in the README, so leaving it with the old name would
// force explaining why the folder is called differently from everything else. Pointers stored under the old
// name are not migrated: a `switch_task` recomputes the pointer, and migration code would cost more than
// the problem.
export const APP_DIR_NAME = "mcp-phase-gate";

// The variable is trimmed and resolved, like the other paths: a space stuck to the end of the value would
// create another state folder.
export function stateDir(): string {
  const propia = leerVariable("STATE_PATH").valor;
  if (propia) return path.resolve(propia);

  const home = os.homedir();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, APP_DIR_NAME);
  }

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_DIR_NAME);
  }

  const stateHome = process.env.XDG_STATE_HOME || path.join(home, ".local", "state");
  return path.join(stateHome, APP_DIR_NAME);
}

// ─── Local configuration ────────────────────────────────────────────────────
// The folder of machine.json and of one's own presets: what belongs to this machine and does not travel
// with the Documentation. On Windows and macOS it coincides with the state's; on Linux it does not (state
// in XDG_STATE_HOME, configuration in XDG_CONFIG_HOME), which is what each system expects.
export function configDir(): string {
  const propia = leerVariable("CONFIG_PATH").valor;
  if (propia) return path.resolve(propia);

  const home = os.homedir();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, APP_DIR_NAME);
  }

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_DIR_NAME);
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(configHome, APP_DIR_NAME);
}

// ─── machine.json ───────────────────────────────────────────────────────────
// What this module reads of machine.json: its `rutas` and its `idiomaPorDefecto`. The whole file is
// validated by maquina.ts, so that "broken" means the same here, in doctor and in Ajustes; the repos and the
// preset are resolved by manifiesto.ts with the same reading.
//
// There is no cache by the file's mtime: on NTFS it did not change in 48 % of back-to-back atomic writes. It
// is read once per call (a tool, a read of the Studio, a doctor: conMaquinaDeLaLlamada) and, outside a call,
// on every question. The only thing kept between calls is the last valid file this process read: if the file
// stops being valid, its paths and its language keep applying until it is fixed, and one warning is logged.
export type LecturaDeMaquina = {
  estado: "ausente" | "valido" | "invalido";
  ruta: string;
  config: MaquinaConfig | null;
  error: string | null;
  // What made it invalid, independent of the language of `error`: the warning is logged once per cause.
  causa: string | null;
  // The text that was read, so that whoever edits the file works on the same text that was validated.
  texto: string | null;
};

// `deMemoria`: the file is invalid and `config` is the last valid one this process read.
export type MaquinaVigente = LecturaDeMaquina & { deMemoria: boolean };

export const CLAVE_EN_MAQUINA: Partial<Record<NombreLogico, keyof RutasDeMaquina>> = {
  DOCS_PATH: "documentacion",
  REPOS_PATH: "carpetaDeRepos",
  TASKS_SUBDIR: "subcarpetaTareas",
};

export function rutaDeMaquina(): string {
  return path.join(configDir(), ARCHIVO_MAQUINA);
}

// One read of the disk, without memory: what the file says now.
function leerDelDisco(ruta: string): LecturaDeMaquina {
  let texto: string;
  try {
    texto = fs.readFileSync(ruta, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { estado: "ausente", ruta, config: null, error: null, causa: null, texto: null };
    const detalle = error instanceof Error ? error.message : String(error);
    return { estado: "invalido", ruta, config: null, error: mensaje("MAQUINA-TXT-INVALIDA", { archivo: ARCHIVO_MAQUINA, ruta, error: detalle }), causa: detalle, texto: null };
  }
  const leido = interpretarMaquina(texto);
  if (!leido.ok) return { estado: "invalido", ruta, config: null, error: mensaje("MAQUINA-TXT-INVALIDA", { archivo: ARCHIVO_MAQUINA, ruta, error: leido.error }), causa: texto, texto };
  return { estado: "valido", ruta, config: leido.config, error: null, causa: null, texto };
}

// One call reads machine.json once: a doctor asks for it more than a hundred times, and every read is a moment
// in which a write of the file can fail on Windows (a rename over a file that another process has open). It also
// means that a single call never mixes two versions of the file. Writes always read the disk, outside a call.
const lecturasDeLaLlamada = new AsyncLocalStorage<Map<string, LecturaDeMaquina>>();

export function conMaquinaDeLaLlamada<T>(funcion: () => T): T {
  return lecturasDeLaLlamada.getStore() ? funcion() : lecturasDeLaLlamada.run(new Map(), funcion);
}

// What the file says now, or what it said at the start of this call.
export function leerArchivoDeMaquina(): LecturaDeMaquina {
  const ruta = rutaDeMaquina();
  const deLaLlamada = lecturasDeLaLlamada.getStore();
  const guardada = deLaLlamada?.get(ruta);
  if (guardada) return guardada;
  const lectura = leerDelDisco(ruta);
  deLaLlamada?.set(ruta, lectura);
  return lectura;
}

// For whoever is about to write the file: the disk, even inside a call.
export function leerArchivoDeMaquinaDelDisco(): LecturaDeMaquina {
  return leerDelDisco(rutaDeMaquina());
}

let ultimaValida: { ruta: string; config: MaquinaConfig } | null = null;
let ultimoAviso: string | null = null;

// What applies now: the file if it is valid; if it is broken, the last valid one this process read (from that
// same path), with a warning the first time; and if there never was one, nothing.
export function maquinaVigente(): MaquinaVigente {
  const lectura = leerArchivoDeMaquina();
  if (lectura.estado === "valido") {
    ultimaValida = { ruta: lectura.ruta, config: lectura.config! };
    ultimoAviso = null;
    return { ...lectura, deMemoria: false };
  }
  if (lectura.estado === "ausente") {
    ultimaValida = null;
    ultimoAviso = null;
    return { ...lectura, deMemoria: false };
  }
  if (ultimaValida && ultimaValida.ruta === lectura.ruta) {
    if (ultimoAviso !== lectura.causa) {
      ultimoAviso = lectura.causa;
      console.error(`[${SERVER_NAME}] ${mensaje("CONFIG-MAQUINA-EN-MEMORIA", { error: lectura.error })}`);
    }
    return { ...lectura, config: ultimaValida.config, deMemoria: true };
  }
  return { ...lectura, deMemoria: false };
}

// Only for tests: forgets the last valid machine.json and the warning.
export function reiniciarMaquina(): void {
  ultimaValida = null;
  ultimoAviso = null;
}

// What machine.json says of a variable, whether or not the environment or the .env wins. Only DOCS_PATH,
// REPOS_PATH and TASKS_SUBDIR have a value in machine.json.
export function valorDeMaquina(logica: NombreLogico): string | undefined {
  const clave = CLAVE_EN_MAQUINA[logica];
  return clave ? maquinaVigente().config?.rutas?.[clave] : undefined;
}

export function idiomaDeMaquina(): Idioma | null {
  return maquinaVigente().config?.idiomaPorDefecto ?? null;
}

// The name is plural because the file stores one pointer per project, not a single task. The singular
// `active_task.json` was the previous format and is no longer read: see `limpiarEstadoViejo`.
export function stateFile(): string {
  return path.join(stateDir(), "active-tasks.json");
}

// ─── Server identity ────────────────────────────────────────────────────────
// It is what the client shows in its MCP panel. It is `mcp-phase-gate` to be exactly the name of the package
// on npm and of the repo: three equal names instead of three similar ones. The `mcp-` prefix is redundant
// inside an MCP server, but the package needs it to be found when searching npm for "mcp". "phase-gate" is the
// process-engineering term for advancing by phases without being able to skip the previous one, which is
// exactly what this flow does.
//
// Careful: this is metadata. What identifies the server and gives the prefix to the tools is the key in the
// client's configuration file, so renaming here breaks no registration.
export const SERVER_NAME = "mcp-phase-gate";

// The version comes from package.json so as not to have the same number in two places.
export const SERVER_VERSION = ((): string => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(MODULE_DIR, "..", "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();
