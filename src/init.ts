// `npx mcp-phase-gate init`: registers the server in the MCP clients of this machine, and optionally copies
// the /fN commands and, with --migrate, creates the phase-gate.json of the projects that lack one.
//
// It writes in files that are not its own (Cursor's and VS Code's configuration), so it does it with care:
// it reads tolerating comments and trailing commas, it does not touch a JSON it does not understand, it does
// not duplicate a registration that already exists (changing its key would change the name of all the tools
// and break the permissions already granted), it shows the diff and asks for confirmation before changing
// something that was already there, and it leaves a .bak copy before writing. With --dry-run it only says
// what it would do.
//
// Everything that touches the system (the user's folder, running `claude`, asking in the terminal) arrives
// in EntornoInit, so that the tests do it on temporary folders.

import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline/promises";

import { capasDeCuerpos, fasesDe, rutasDeCuerpos } from "./capas.js";
import type { Salida } from "./cli.js";
import { SERVER_NAME, SERVER_VERSION, leerArchivoDeMaquinaDelDisco, leerVariable } from "./config.js";
import { diagnosticar, formatearDiagnostico } from "./diagnostico.js";
import { leerMaquinaParaEditar, planDeEdicion } from "./ajustes/edicion-maquina.js";
import { escribirAtomico } from "./lotes.js";
import { ARCHIVO_MANIFIESTO, URL_ESQUEMA_PROYECTO, describirPresets, idiomaDelEquipo, idiomaDelProyecto, leerManifiesto, leerMaquina, presetsDisponibles, rutaMaquina } from "./manifiesto.js";
import { URL_ESQUEMA_MAQUINA, VERSION_DE_MAQUINA } from "./maquina.js";
import type { Idioma } from "./vocabulario.js";
import { discoverProjects } from "./paths.js";
import { leerPromptNormalizado, resolveCommandFile } from "./phases.js";
import { textoGenerico } from "./prompts-mcp.js";
import { fallo, idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";

export const CLIENTES = ["claude-code", "cursor", "vscode"] as const;
export type Cliente = (typeof CLIENTES)[number];

// The suggested key for a new registration. A registration that already exists keeps its own.
export const CLAVE_POR_DEFECTO = "pg";
export const CLAVE_VALIDA = /^[A-Za-z0-9_-]{1,64}$/;

export type OpcionesInit = {
  clientes: Cliente[] | null; // null: detect them
  clave: string | null; // null: CLAVE_POR_DEFECTO for new registrations
  docs: string | null;
  repos: string | null;
  comandos: boolean;
  migrate: boolean;
  preset: string | null;
  idioma?: Idioma | null; // --idioma: that of the projects without documents that say it
  soloEsteEquipo: boolean;
  dryRun: boolean;
  yes: boolean;
};

export type Ejecucion = { codigo: number; stdout: string; stderr: string };

export type EntornoInit = {
  home: string;
  appData: string | null; // Windows: %APPDATA%
  xdgConfig: string | null; // Linux: $XDG_CONFIG_HOME
  plataforma: NodeJS.Platform;
  salida: Salida;
  esTerminal: boolean;
  preguntar: (pregunta: string) => Promise<string>;
  ejecutar: (comando: string, args: string[]) => Promise<Ejecucion>;
  ahora: () => Date;
};

// ─── The real environment ───────────────────────────────────────────────────
// On Windows, `claude` can be an .exe (native installer) or a .cmd (installed with npm). execFile finds the
// .exe; a .cmd can only be launched through cmd.exe, with each argument in quotes (users' paths have spaces).
function citarParaCmd(argumento: string): string {
  return /[\s"&|<>^()%!]/.test(argumento) ? `"${argumento.replace(/"/g, '""')}"` : argumento;
}

function lanzar(comando: string, args: string[], opciones: { verbatim?: boolean } = {}): Promise<Ejecucion & { noEncontrado: boolean }> {
  return new Promise((resolver) => {
    execFile(
      comando,
      args,
      { timeout: 120_000, maxBuffer: 4_194_304, windowsHide: true, encoding: "utf8", windowsVerbatimArguments: opciones.verbatim ?? false },
      (error, stdout, stderr) => {
        const codigo = error ? (typeof error.code === "number" ? error.code : 1) : 0;
        resolver({ codigo, stdout, stderr: stderr || (error ? error.message : ""), noEncontrado: error?.code === "ENOENT" });
      }
    );
  });
}

export async function ejecutarComando(comando: string, args: string[]): Promise<Ejecucion> {
  const directo = await lanzar(comando, args);
  if (!directo.noEncontrado || process.platform !== "win32") {
    if (directo.noEncontrado) throw fallo("INIT-NO-INSTALADO", { comando });
    return directo;
  }
  // Inside cmd.exe /c, a % is expanded even in quotes, and a quote breaks the quoting: there is no reliable
  // way to pass them. Rather than risk another command, the person is asked to do it by hand.
  if (args.some((arg) => /[%"]/.test(arg))) {
    throw fallo("INIT-CMD-INSEGURO", { comando });
  }
  const linea = [`${comando}.cmd`, ...args].map(citarParaCmd).join(" ");
  const porCmd = await lanzar(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${linea}"`], { verbatim: true });
  if (porCmd.codigo !== 0 && /no se reconoce|is not recognized/i.test(porCmd.stderr)) {
    throw fallo("INIT-NO-INSTALADO", { comando });
  }
  return porCmd;
}

export function entornoDelProceso(salida: Salida): EntornoInit {
  return {
    home: os.homedir(),
    appData: process.env.APPDATA ?? null,
    xdgConfig: process.env.XDG_CONFIG_HOME ?? null,
    plataforma: process.platform,
    salida,
    esTerminal: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    preguntar: async (pregunta) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      try {
        return await rl.question(pregunta);
      } finally {
        rl.close();
      }
    },
    ejecutar: ejecutarComando,
    ahora: () => new Date(),
  };
}

// ─── JSON with comments ─────────────────────────────────────────────────────
// The clients' mcp.json files allow comments and trailing commas. They are tolerated ONLY for reading: what
// is written is strict JSON. It walks the text respecting the strings, so as not to take a "//" in a URL for
// a comment.
// Trailing commas are removed in the same walk, outside the strings: a regular expression over the whole
// text would also change an argument such as "--sep=,}" of another server. It also returns whether there
// were comments, to warn that they will be lost.
export function limpiarJsonc(texto: string): { limpio: string; comentarios: boolean } {
  let salida = "";
  let comentarios = false;
  let i = 0;
  while (i < texto.length) {
    const c = texto[i]!;
    if (c === '"') {
      let j = i + 1;
      while (j < texto.length && texto[j] !== '"') j += texto[j] === "\\" ? 2 : 1;
      salida += texto.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && texto[i + 1] === "/") {
      comentarios = true;
      while (i < texto.length && texto[i] !== "\n") i++;
    } else if (c === "/" && texto[i + 1] === "*") {
      comentarios = true;
      const fin = texto.indexOf("*/", i + 2);
      i = fin === -1 ? texto.length : fin + 2;
    } else if (c === "}" || c === "]") {
      // A trailing comma is the last non-blank thing written before closing.
      salida = salida.replace(/,(\s*)$/, "$1") + c;
      i++;
    } else {
      salida += c;
      i++;
    }
  }
  return { limpio: salida, comentarios };
}

export function quitarComentarios(texto: string): string {
  return limpiarJsonc(texto).limpio;
}

export type LecturaJson = { estado: "ausente" | "vacio" | "valido" | "roto"; datos: Record<string, unknown>; comentarios: boolean; error?: string };

export function leerJsonTolerante(archivo: string): LecturaJson {
  let texto: string;
  try {
    texto = fs.readFileSync(archivo, "utf-8").replace(/^\uFEFF/, "");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { estado: "ausente", datos: {}, comentarios: false };
    return { estado: "roto", datos: {}, comentarios: false, error: error instanceof Error ? error.message : String(error) };
  }
  // In some installations VS Code's mcp.json exists with 0 bytes.
  if (texto.trim() === "") return { estado: "vacio", datos: {}, comentarios: false };

  const { limpio, comentarios } = limpiarJsonc(texto);
  try {
    const datos: unknown = JSON.parse(limpio);
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
      return { estado: "roto", datos: {}, comentarios, error: mensaje("INIT-JSON-NO-OBJETO") };
    }
    return { estado: "valido", datos: datos as Record<string, unknown>, comentarios };
  } catch (error) {
    return { estado: "roto", datos: {}, comentarios, error: error instanceof Error ? error.message : String(error) };
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────
export function marcaDeTiempo(fecha: Date): string {
  const dos = (n: number): string => String(n).padStart(2, "0");
  return (
    `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}-` +
    `${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`
  );
}

// A small line diff (the blocks that are compared are a few dozen lines).
export function diffDeLineas(antes: string, despues: string): string {
  const a = antes.split("\n");
  const b = despues.split("\n");
  const largo: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      largo[i]![j] = a[i] === b[j] ? largo[i + 1]![j + 1]! + 1 : Math.max(largo[i + 1]![j]!, largo[i]![j + 1]!);
    }
  }
  const lineas: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      lineas.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || largo[i]![j + 1]! > largo[i + 1]![j]!)) {
      lineas.push(`+ ${b[j]}`);
      j++;
    } else {
      lineas.push(`- ${a[i]}`);
      i++;
    }
  }
  return lineas.join("\n");
}

const json = (valor: unknown): string => JSON.stringify(valor, null, 2);

function existeCarpeta(ruta: string): boolean {
  return fs.statSync(ruta, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

type Contexto = { opciones: OpcionesInit; entorno: EntornoInit; fallos: number };

function decir(ctx: Contexto, texto: string): void {
  ctx.entorno.salida.out(ctx.opciones.dryRun ? `[dry-run] ${texto}` : texto);
}

function fallar(ctx: Contexto, texto: string): void {
  ctx.fallos++;
  ctx.entorno.salida.err(texto);
}

// In English the question is (y/N) and y or yes is accepted; in Spanish, (s/N) and s or sí.
async function confirmar(ctx: Contexto, pregunta: string): Promise<boolean> {
  if (ctx.opciones.yes) return true;
  if (ctx.opciones.dryRun || !ctx.entorno.esTerminal) return false;
  const idioma = idiomaDeMensajes();
  const respuesta = (await ctx.entorno.preguntar(mensaje("INIT-CONFIRMAR", { pregunta }, idioma))).trim();
  return (idioma === "en" ? /^y(es)?$/i : /^s[ií]?$/i).test(respuesta);
}

// Writes with a copy: if the file already had content, first <file>.bak-<YYYYMMDD-HHMMSS>.
function escribirConCopia(ctx: Contexto, archivo: string, texto: string): string | null {
  if (ctx.opciones.dryRun) return null;
  let copia: string | null = null;
  if (fs.existsSync(archivo) && fs.statSync(archivo).size > 0) {
    copia = `${archivo}.bak-${marcaDeTiempo(ctx.entorno.ahora())}`;
    fs.copyFileSync(archivo, copia);
  }
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  // A temporary file and a rename, like the Studio does: a running server that reads machine.json at that
  // moment sees the old file or the new one, never half of it.
  escribirAtomico(archivo, texto);
  return copia;
}

// ─── 1. Paths ───────────────────────────────────────────────────────────────
async function rutaPedida(ctx: Contexto, valor: string | null, logica: "DOCS_PATH" | "REPOS_PATH"): Promise<string | null> {
  const que = mensaje(logica === "DOCS_PATH" ? "INIT-RUTA-DOCS" : "INIT-RUTA-REPOS");
  let crudo = valor ?? leerVariable(logica).valor ?? null;
  if (!crudo && ctx.entorno.esTerminal) crudo = (await ctx.entorno.preguntar(mensaje("INIT-PREGUNTA-RUTA", { que }))).trim() || null;
  if (!crudo) {
    ctx.entorno.salida.err(mensaje("INIT-FALTA-RUTA", { que, bandera: logica === "DOCS_PATH" ? "--docs" : "--repos", logica, clave: logica === "DOCS_PATH" ? "rutas.documentacion" : "rutas.carpetaDeRepos" }));
    return null;
  }
  const ruta = path.resolve(crudo);
  if (!existeCarpeta(ruta)) {
    ctx.entorno.salida.err(mensaje("INIT-RUTA-NO-EXISTE", { que, ruta }));
    return null;
  }
  return ruta;
}

// This machine's paths are saved in machine.json, not in each client's "env": that way the server of each
// client and the Studio read them the same. It goes before registering anything, so that an entry that already
// carried the paths in its "env" does not stop working when they are taken out. It returns false if it could not.
async function guardarRutas(ctx: Contexto, rutas: Rutas): Promise<boolean> {
  const maquina = leerMaquinaParaEditar();
  if (maquina.estado === "invalido") {
    fallar(ctx, mensaje("INIT-NO-SE-TOCA", { error: maquina.error }));
    return false;
  }
  const planeada = planDeEdicion(maquina, { rutas: { documentacion: rutas.docs, carpetaDeRepos: rutas.repos } });
  if (!planeada) {
    ctx.entorno.salida.out(mensaje("INIT-MAQUINA-RUTAS-IGUALES"));
    return true;
  }
  // A value different from the one that was there is confirmed, like the preset: another client uses it.
  const guardadas = maquina.objeto && esObjetoPlano(maquina.objeto.rutas) ? maquina.objeto.rutas : {};
  const cambia = [
    ...(typeof guardadas.documentacion === "string" && guardadas.documentacion !== rutas.docs ? [`documentacion: ${guardadas.documentacion} -> ${rutas.docs}`] : []),
    ...(typeof guardadas.carpetaDeRepos === "string" && guardadas.carpetaDeRepos !== rutas.repos ? [`carpetaDeRepos: ${guardadas.carpetaDeRepos} -> ${rutas.repos}`] : []),
  ];
  if (cambia.length && !ctx.opciones.dryRun && !(await confirmar(ctx, mensaje("INIT-PREGUNTA-CAMBIAR-RUTAS", { cambios: cambia })))) {
    fallar(ctx, mensaje("INIT-MAQUINA-NO-CAMBIADA"));
    return false;
  }
  const copia = escribirConCopia(ctx, planeada.escritura.ruta, planeada.escritura.despues);
  decir(ctx, mensaje("INIT-MAQUINA-RUTAS-ESCRITA", { archivo: planeada.escritura.ruta, copia }));
  return true;
}

// ─── 2. Clients ─────────────────────────────────────────────────────────────
function carpetaDeVsCode(entorno: EntornoInit): string {
  if (entorno.plataforma === "win32") return path.join(entorno.appData ?? path.join(entorno.home, "AppData", "Roaming"), "Code", "User");
  if (entorno.plataforma === "darwin") return path.join(entorno.home, "Library", "Application Support", "Code", "User");
  return path.join(entorno.xdgConfig ?? path.join(entorno.home, ".config"), "Code", "User");
}

async function hayClaude(entorno: EntornoInit): Promise<boolean> {
  try {
    return (await entorno.ejecutar("claude", ["--version"])).codigo === 0;
  } catch {
    return false;
  }
}

export async function detectarClientes(entorno: EntornoInit): Promise<Cliente[]> {
  const encontrados: Cliente[] = [];
  if (await hayClaude(entorno)) encontrados.push("claude-code");
  if (existeCarpeta(path.join(entorno.home, ".cursor"))) encontrados.push("cursor");
  if (existeCarpeta(carpetaDeVsCode(entorno))) encontrados.push("vscode");
  return encontrados;
}

type Rutas = { docs: string; repos: string };

// The paths of this machine live in machine.json, not in the client's "env": the server of each client and the
// Studio read them from there. An entry only carries an "env" for what is really about that client.
export function entradaDelServidor(cliente: Cliente, plataforma: NodeJS.Platform): Record<string, unknown> {
  const env: Record<string, string> = {};
  // Cursor for Windows has an open bug where the confirmation form does not appear: it is registered with the
  // confirmations in the chat.
  if (cliente === "cursor" && plataforma === "win32") env.PHASE_GATE_ELICITATION = "off";
  const base = { command: "npx", args: ["-y", SERVER_NAME], ...(Object.keys(env).length ? { env } : {}) };
  return cliente === "vscode" ? { type: "stdio", ...base } : base;
}

// What an entry had in its "env" and is taken out: this machine's paths (and their ORQUESTADOR_* aliases) and,
// with `quitarIdioma`, PHASE_GATE_LANG.
export type QuitaDelEntorno = { documentacion?: string; carpetaDeRepos?: string; idioma?: string };
// `todas`: every path goes, also one that is different from machine.json's: `init --docs --repos` was given the
// paths of this machine, and they replace the old ones, as init always did.
export type OpcionesDeEntrada = { quitarIdioma?: boolean; todas?: boolean };
// A path that the entry keeps because it is not the one in machine.json: that client keeps using its own.
export type RutaDistinta = { clave: "documentacion" | "carpetaDeRepos"; variable: string; valor: string; guardada: string };

const NOMBRES_DE_RUTA = {
  documentacion: ["PHASE_GATE_DOCS_PATH", "ORQUESTADOR_DOCS_PATH"],
  carpetaDeRepos: ["PHASE_GATE_REPOS_PATH", "ORQUESTADOR_REPOS_PATH"],
} as const;

// The variable an entry's "env" really uses for a path: PHASE_GATE_* before its alias, and an empty one does not count.
export function variableDeRutaEnEntrada(env: Record<string, unknown>, clave: "documentacion" | "carpetaDeRepos"): string | null {
  return NOMBRES_DE_RUTA[clave].find((nombre) => typeof env[nombre] === "string" && env[nombre].trim() !== "") ?? null;
}

function rutasGuardadas(): { documentacion?: string | undefined; carpetaDeRepos?: string | undefined } {
  const rutas = leerArchivoDeMaquinaDelDisco().config?.rutas;
  return { documentacion: rutas?.documentacion, carpetaDeRepos: rutas?.carpetaDeRepos };
}

const mismaRuta = (a: string, b: string): boolean => {
  const [x, y] = [path.resolve(a), path.resolve(b)];
  return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
};

// What an entry's "env" says: the value that would win (PHASE_GATE_* before its alias).
export function rutasDelEnvDeEntrada(env: Record<string, unknown>): QuitaDelEntorno {
  const texto = (valor: unknown): string | undefined => (typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined);
  const documentacion = texto(env.PHASE_GATE_DOCS_PATH) ?? texto(env.ORQUESTADOR_DOCS_PATH);
  const carpetaDeRepos = texto(env.PHASE_GATE_REPOS_PATH) ?? texto(env.ORQUESTADOR_REPOS_PATH);
  const idioma = texto(env.PHASE_GATE_LANG);
  return { ...(documentacion ? { documentacion } : {}), ...(carpetaDeRepos ? { carpetaDeRepos } : {}), ...(idioma ? { idioma } : {}) };
}

// What the "env" of an entry that already exists stops carrying, and what is taken out of it. A path is taken out
// only if it is the one machine.json has, or if machine.json has none (then it moves there). One that is
// different stays, with its aliases: it is how a client uses another folder, and taking it out would switch that
// client to machine.json's without anyone deciding it. It comes back in `distintas`, to be said.
export function sinRutasEnElEntorno(
  env: Record<string, unknown>,
  opciones: OpcionesDeEntrada = {}
): { env: Record<string, unknown>; quita: QuitaDelEntorno; distintas: RutaDistinta[] } {
  const dicho = rutasDelEnvDeEntrada(env);
  const guardadas = opciones.todas ? {} : rutasGuardadas();
  const quita: QuitaDelEntorno = {};
  const distintas: RutaDistinta[] = [];
  const resto = { ...env };
  for (const clave of ["documentacion", "carpetaDeRepos"] as const) {
    const valor = dicho[clave];
    const guardada = guardadas[clave];
    if (valor !== undefined && guardada !== undefined && !mismaRuta(valor, guardada)) {
      distintas.push({ clave, variable: variableDeRutaEnEntrada(env, clave)!, valor, guardada });
      continue;
    }
    for (const variable of NOMBRES_DE_RUTA[clave]) delete resto[variable];
    if (valor !== undefined) quita[clave] = valor;
  }
  if (opciones.quitarIdioma && dicho.idioma !== undefined) {
    delete resto.PHASE_GATE_LANG;
    quita.idioma = dicho.idioma;
  }
  return { env: resto, quita, distintas };
}

// Does this part of a command launch mcp-phase-gate? The exact package (`mcp-phase-gate`, or with a version
// `mcp-phase-gate@3`), the global binary, or a build/index.js whose package.json, two folders up, is called
// mcp-phase-gate (a development clone). Merely containing the name, or being any build/index.js, would not
// do: init would inject its variables into someone else's server.
export function lanzaPhaseGate(parte: string): boolean {
  if (parte === SERVER_NAME || parte.startsWith(`${SERVER_NAME}@`)) return true;
  if (path.basename(parte).replace(/\.(cmd|exe)$/i, "") === SERVER_NAME && /[\\/]/.test(parte)) return true;
  if (!/(^|[\\/])build[\\/]index\.js$/.test(parte)) return false;
  try {
    const paquete = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(parte)), "package.json"), "utf-8")) as { name?: unknown };
    return paquete.name === SERVER_NAME;
  } catch {
    return false;
  }
}

export function ejecutaPhaseGate(entrada: unknown): boolean {
  if (!entrada || typeof entrada !== "object") return false;
  const { command, args } = entrada as { command?: unknown; args?: unknown };
  const partes = [command, ...(Array.isArray(args) ? args : [])].filter((p): p is string => typeof p === "string");
  return partes.some(lanzaPhaseGate);
}

// What init changes in an entry that already exists: it stops carrying the paths in its "env" (with their
// ORQUESTADOR_* aliases), except one that is not machine.json's (sinRutasEnElEntorno), and, if asked, PHASE_GATE_LANG. It keeps the command (a development clone still
// launches its build/index.js) and everything else, such as Cursor's PHASE_GATE_ELICITATION on Windows.
function actualizarEntrada(
  existente: Record<string, unknown>,
  nueva: Record<string, unknown>,
  opciones: OpcionesDeEntrada
): { entrada: Record<string, unknown>; quita: QuitaDelEntorno; distintas: RutaDistinta[] } {
  const actual = esObjetoPlano(existente.env) ? existente.env : {};
  const { env, quita, distintas } = sinRutasEnElEntorno(actual, opciones);
  const nuevo = { ...env, ...(esObjetoPlano(nueva.env) ? nueva.env : {}) };
  const entrada = { ...existente };
  if (Object.keys(nuevo).length) entrada.env = nuevo;
  else delete entrada.env;
  return { entrada, quita, distintas };
}

const esObjetoPlano = (valor: unknown): valor is Record<string, unknown> => valor !== null && typeof valor === "object" && !Array.isArray(valor);

function bloqueParaPegar(seccion: string, clave: string, entrada: Record<string, unknown>): string {
  return json({ [seccion]: { [clave]: entrada } });
}

// ─── The plan of a file client (Cursor, VS Code) ────────────────────────────
// What init would do in its mcp.json, without writing anything: a single function computes it, used by `init`
// (which then asks and writes) and the Studio (which shows it and applies it with its fingerprint).
type BaseDePlan = {
  cliente: "cursor" | "vscode";
  nombre: string; // "Cursor" or "VS Code"
  archivo: string;
  seccion: string;
  clave: string; // the one requested
};
export type PlanDeArchivo =
  | (BaseDePlan & { estado: "roto"; error: string | null; paraPegar: string })
  | (BaseDePlan & { estado: "forma-rara"; paraPegar: string })
  | (BaseDePlan & { estado: "clave-ocupada" })
  | (BaseDePlan & { estado: "sin-cambios"; claveFinal: string; distintas: RutaDistinta[] })
  | (BaseDePlan & {
      estado: "nuevo" | "actualiza";
      claveFinal: string;
      quita: QuitaDelEntorno; // what the "env" of the entry carried and stops carrying
      distintas: RutaDistinta[]; // the paths that stay because they are not machine.json's
      renombra: string | null; // the key that is replaced by --clave
      conserva: string | null; // the key it already had and keeps
      comentarios: boolean;
      diff: string | null; // the diff of the entry that already existed (null if it is new)
      entrada: string; // the entry that remains, in JSON
      texto: string; // the whole file that would be written
    });

export function carpetaDelCliente(cliente: "cursor" | "vscode", entorno: Pick<EntornoInit, "home" | "appData" | "xdgConfig" | "plataforma">): string {
  return cliente === "cursor" ? path.join(entorno.home, ".cursor") : carpetaDeVsCode(entorno as EntornoInit);
}

export function planDeArchivo(cliente: "cursor" | "vscode", claveDada: string | null, entorno: Pick<EntornoInit, "home" | "appData" | "xdgConfig" | "plataforma">, opciones: OpcionesDeEntrada = {}): PlanDeArchivo {
  const nombre = cliente === "cursor" ? "Cursor" : "VS Code";
  const archivo = path.join(carpetaDelCliente(cliente, entorno), "mcp.json");
  const seccion = cliente === "cursor" ? "mcpServers" : "servers";
  const deseada = entradaDelServidor(cliente, entorno.plataforma);
  const clave = claveDada ?? CLAVE_POR_DEFECTO;
  const base = { cliente, nombre, archivo, seccion, clave };

  const lectura = leerJsonTolerante(archivo);
  if (lectura.estado === "roto") return { ...base, estado: "roto", error: lectura.error ?? null, paraPegar: bloqueParaPegar(seccion, clave, deseada) };

  const datos = lectura.datos;
  // A section or an env that is not an object is not "fixed" on its own: the file is not touched.
  const esObjeto = (valor: unknown): valor is Record<string, unknown> => valor !== null && typeof valor === "object" && !Array.isArray(valor);
  const seccionActual = datos[seccion];
  const formaRara =
    (seccionActual !== undefined && !esObjeto(seccionActual)) ||
    (esObjeto(seccionActual) && Object.values(seccionActual).some((e) => esObjeto(e) && e.env !== undefined && !esObjeto(e.env)));
  if (formaRara) return { ...base, estado: "forma-rara", paraPegar: bloqueParaPegar(seccion, clave, deseada) };
  const servidores = { ...((seccionActual as Record<string, unknown> | undefined) ?? {}) };

  // Is it already registered? It is looked for first under the requested key and then under any other.
  const yaRegistrada = Object.keys(servidores).find((k) => k === clave && ejecutaPhaseGate(servidores[k])) ?? Object.keys(servidores).find((k) => ejecutaPhaseGate(servidores[k]));

  let claveFinal = clave;
  let nuevaEntrada = deseada;
  let quita: QuitaDelEntorno = {};
  let distintas: RutaDistinta[] = [];
  let renombra: string | null = null;
  let conserva: string | null = null;

  if (yaRegistrada) {
    ({ entrada: nuevaEntrada, quita, distintas } = actualizarEntrada(servidores[yaRegistrada] as Record<string, unknown>, deseada, opciones));
    if (yaRegistrada !== clave && claveDada === null) {
      claveFinal = yaRegistrada;
      conserva = yaRegistrada;
    } else if (yaRegistrada !== clave) {
      renombra = yaRegistrada;
    }
  } else if (servidores[clave] !== undefined) {
    return { ...base, estado: "clave-ocupada" };
  }

  const antes = yaRegistrada ? json(servidores[yaRegistrada]) : "";
  const despues = json(nuevaEntrada);
  if (yaRegistrada && !renombra && antes === despues) return { ...base, estado: "sin-cambios", claveFinal, distintas };

  if (renombra) delete servidores[renombra];
  servidores[claveFinal] = nuevaEntrada;
  return {
    ...base,
    estado: yaRegistrada ? "actualiza" : "nuevo",
    claveFinal,
    quita,
    distintas,
    renombra,
    conserva,
    comentarios: lectura.comentarios,
    diff: yaRegistrada ? diffDeLineas(antes, despues) : null,
    entrada: despues,
    texto: `${json({ ...datos, [seccion]: servidores })}\n`,
  };
}

async function registrarEnArchivo(ctx: Contexto, cliente: "cursor" | "vscode"): Promise<void> {
  const plan = planDeArchivo(cliente, ctx.opciones.clave, ctx.entorno, { todas: true });
  const { nombre, archivo, seccion, clave } = plan;

  if (plan.estado === "roto") {
    fallar(ctx, mensaje("INIT-ARCHIVO-ROTO", { nombre, archivo, error: plan.error, paraPegar: plan.paraPegar }));
    return;
  }
  if (plan.estado === "forma-rara") {
    fallar(ctx, mensaje("INIT-ARCHIVO-FORMA-RARA", { nombre, archivo, seccion, paraPegar: plan.paraPegar }));
    return;
  }
  if (plan.estado === "clave-ocupada") {
    fallar(ctx, mensaje("INIT-CLAVE-OCUPADA", { nombre, clave, archivo }));
    return;
  }

  const conserva = plan.estado === "sin-cambios" ? (plan.claveFinal !== clave ? plan.claveFinal : null) : plan.conserva;
  if (conserva) {
    decir(ctx, mensaje("INIT-CONSERVA-CLAVE", { nombre, clave: conserva }));
  } else if (plan.estado !== "sin-cambios" && plan.renombra) {
    decir(ctx, mensaje("INIT-RENOMBRA-CLAVE", { nombre, antes: plan.renombra, clave }));
  }

  if (plan.estado === "sin-cambios") {
    ctx.entorno.salida.out(mensaje("INIT-SIN-CAMBIOS", { nombre, archivo, clave: plan.claveFinal }));
    return;
  }

  // Changing something that already existed (or losing comments) is confirmed; adding a new entry, not.
  const yaRegistrada = plan.estado === "actualiza";
  const cambiaAlgo = yaRegistrada || plan.comentarios;
  if (yaRegistrada) ctx.entorno.salida.out(mensaje("INIT-DIFF", { nombre, clave: plan.claveFinal, archivo, diff: plan.diff }));
  if (plan.comentarios) ctx.entorno.salida.out(mensaje("INIT-COMENTARIOS", { nombre, archivo }));
  if (cambiaAlgo && !ctx.opciones.dryRun && !(await confirmar(ctx, mensaje("INIT-PREGUNTA-APLICAR", { archivo })))) {
    fallar(ctx, mensaje("INIT-NO-APLICADO", { nombre }));
    return;
  }

  const copia = escribirConCopia(ctx, archivo, plan.texto);
  decir(ctx, mensaje("INIT-REGISTRADO-ARCHIVO", { nombre, actualizado: yaRegistrada, clave: plan.claveFinal, archivo, copia }));
}

// `claude mcp list` prints one line per server: "<key>: <command or URL> - <status>".
export function registroEnClaude(lista: string): string | null {
  for (const linea of lista.split(/\r?\n/)) {
    const corte = linea.indexOf(": ");
    if (corte <= 0) continue;
    // "<command and args> - <status>": the parts of the command, without the status at the end.
    const comando = linea.slice(corte + 2).replace(/\s+-\s+\S*\s.*$/, "");
    if (comando.split(/\s+/).some(lanzaPhaseGate)) return linea.slice(0, corte);
  }
  return null;
}

// No environment variables: the paths live in machine.json.
function comandoDeClaude(clave: string): string[] {
  return ["mcp", "add", clave, "--scope", "user", "--", "npx", "-y", SERVER_NAME];
}

// A server's JSON, as a single argument in the terminal of whoever will run it: PowerShell on Windows (with the
// double quotes escaped, which is what it expects when calling a program) and a POSIX terminal elsewhere.
function citarJson(texto: string, plataforma: NodeJS.Platform): string {
  if (plataforma === "win32") return `'${texto.replace(/'/g, "''").replace(/"/g, '\\"')}'`;
  return `'${texto.replace(/'/g, "'\\''")}'`;
}

// What has to be run to redo a Claude Code entry without its paths, in its scope.
// `comandos` is empty when there is nothing to take out; `distintas` are the paths that stay because they are not
// the ones in machine.json.
export type RehacerEnClaude = { ambito: "user" | "local"; carpeta: string | null; comandos: string[]; quita: QuitaDelEntorno; distintas: RutaDistinta[] };

// The entries of this server with that key in ~/.claude.json: the user one and the local ones of each folder.
function entradasDeClaude(home: string, clave: string): { ambito: "user" | "local"; carpeta: string | null; entrada: Record<string, unknown> }[] {
  const lectura = leerJsonTolerante(path.join(home, ".claude.json"));
  if (lectura.estado !== "valido") return [];
  const encontradas: { ambito: "user" | "local"; carpeta: string | null; entrada: Record<string, unknown> }[] = [];
  const delUsuario = lectura.datos.mcpServers;
  if (esObjetoPlano(delUsuario) && esObjetoPlano(delUsuario[clave]) && ejecutaPhaseGate(delUsuario[clave])) encontradas.push({ ambito: "user", carpeta: null, entrada: delUsuario[clave] });
  const proyectos = lectura.datos.projects;
  if (esObjetoPlano(proyectos)) {
    for (const [carpeta, datos] of Object.entries(proyectos)) {
      const locales = esObjetoPlano(datos) ? datos.mcpServers : undefined;
      if (esObjetoPlano(locales) && esObjetoPlano(locales[clave]) && ejecutaPhaseGate(locales[clave])) encontradas.push({ ambito: "local", carpeta, entrada: locales[clave] });
    }
  }
  return encontradas;
}

export function comandosParaRehacer(home: string, clave: string, plataforma: NodeJS.Platform, opciones: OpcionesDeEntrada = {}): RehacerEnClaude[] {
  const rehacer: RehacerEnClaude[] = [];
  for (const { ambito, carpeta, entrada } of entradasDeClaude(home, clave)) {
    const { env, quita, distintas } = sinRutasEnElEntorno(esObjetoPlano(entrada.env) ? entrada.env : {}, opciones);
    if (!Object.keys(quita).length) {
      if (distintas.length) rehacer.push({ ambito, carpeta, quita, distintas, comandos: [] });
      continue;
    }
    const nueva = { ...entrada };
    if (Object.keys(env).length) nueva.env = env;
    else delete nueva.env;
    rehacer.push({
      ambito,
      carpeta,
      quita,
      distintas,
      comandos: [`claude mcp remove ${clave} --scope ${ambito}`, `claude mcp add-json ${clave} ${citarJson(JSON.stringify(nueva), plataforma)} --scope ${ambito}`],
    });
  }
  return rehacer;
}

function mostrarComando(args: string[]): string {
  return ["claude", ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
}

// The plan in Claude Code: the command that would be run, or why not. It reads `claude mcp list`, which
// writes nothing.
// An entry that already exists is not touched: `rehacer` says, for each scope where it is, the two commands
// that leave it the same but without the paths (`claude mcp remove` and `claude mcp add-json`). The person
// runs them: if the add failed after the remove, the server would be left unregistered. `quita` is what it
// carried in its "env".
export type PlanDeClaude =
  | { cliente: "claude-code"; estado: "sin-lista"; mensaje: string }
  | { cliente: "claude-code"; estado: "existente"; existente: string; comando: string | null; rehacer: RehacerEnClaude[]; quita: QuitaDelEntorno; distintas: RutaDistinta[] }
  | { cliente: "claude-code"; estado: "nuevo"; clave: string; args: string[]; comando: string };

export async function planDeClaude(claveDada: string | null, entorno: Pick<EntornoInit, "ejecutar" | "home" | "plataforma">, opciones: OpcionesDeEntrada = {}): Promise<PlanDeClaude> {
  let lista: Ejecucion;
  try {
    lista = await entorno.ejecutar("claude", ["mcp", "list"]);
  } catch (error) {
    return { cliente: "claude-code", estado: "sin-lista", mensaje: mensaje("INIT-CLAUDE-SIN-LISTA", { error: error instanceof Error ? error.message : String(error) }) };
  }
  // Without the list there is no way to know whether it is already registered: adding it could duplicate it.
  if (lista.codigo !== 0) {
    return { cliente: "claude-code", estado: "sin-lista", mensaje: mensaje("INIT-CLAUDE-LISTA-FALLO", { stderr: lista.stderr.trim(), codigo: lista.codigo }) };
  }

  // `mcp list` does not show a registration's variables: they are read from ~/.claude.json. One that already
  // exists is not touched.
  const existente = registroEnClaude(lista.stdout);
  if (existente) {
    const todas = comandosParaRehacer(entorno.home, existente, entorno.plataforma, opciones);
    const rehacer = todas.filter((r) => r.comandos.length);
    const distintas = todas.flatMap((r) => r.distintas);
    const quita: QuitaDelEntorno = Object.assign({}, ...rehacer.map((r) => r.quita).reverse());
    const comando = rehacer.length ? rehacer.map((r) => mensaje("INIT-CLAUDE-REHACER", { ambito: r.ambito, carpeta: r.carpeta, comandos: r.comandos })).join("\n") : null;
    return { cliente: "claude-code", estado: "existente", existente, comando, rehacer, quita, distintas };
  }
  const clave = claveDada ?? CLAVE_POR_DEFECTO;
  const args = comandoDeClaude(clave);
  return { cliente: "claude-code", estado: "nuevo", clave, args, comando: mostrarComando(args) };
}

async function registrarEnClaude(ctx: Contexto): Promise<void> {
  const plan = await planDeClaude(ctx.opciones.clave, ctx.entorno, { todas: true });
  if (plan.estado === "sin-lista") {
    fallar(ctx, `Claude Code: ${plan.mensaje}`);
    return;
  }
  if (plan.estado === "existente") {
    ctx.entorno.salida.out(plan.comando ? mensaje("INIT-CLAUDE-EXISTENTE", { existente: plan.existente, comando: plan.comando }) : mensaje("INIT-CLAUDE-AL-DIA", { existente: plan.existente }));
    return;
  }

  const { clave, args } = plan;
  if (ctx.opciones.dryRun) {
    decir(ctx, mensaje("INIT-CLAUDE-SE-EJECUTARIA", { comando: plan.comando }));
    return;
  }
  const resultado = await ctx.entorno.ejecutar("claude", args).catch((error: unknown) => ({ codigo: 1, stdout: "", stderr: String(error) }));
  if (resultado.codigo !== 0) {
    fallar(ctx, mensaje("INIT-CLAUDE-ADD-FALLO", { stderr: resultado.stderr.trim(), codigo: resultado.codigo }));
    return;
  }
  decir(ctx, mensaje("INIT-CLAUDE-REGISTRADO", { clave }));
}

// ─── 3. Commands ────────────────────────────────────────────────────────────
export const MARCA_DE_COMANDO = "<!-- generado por mcp-phase-gate init";

function comandosDeFabrica(): { numero: number; texto: string }[] {
  const capas = rutasDeCuerpos(capasDeCuerpos(null));
  return [...fasesDe(null).entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, datos]) => {
      const archivo = resolveCommandFile(numero, capas);
      return { numero, texto: archivo ? leerPromptNormalizado(archivo).trim() : textoGenerico(numero, datos.title) };
    });
}

// The plan of --comandos for a client that reads commands from files: each /fN, where it would go, with what
// text and what would happen. "ajeno" is a file without init's mark: it is the person's and is not
// overwritten without --yes.
export type ComandoPlaneado = { numero: number; archivo: string; texto: string; estado: "nuevo" | "actualiza" | "sin-cambios" | "ajeno" | "carpeta" };

export function carpetaDeComandos(cliente: "claude-code" | "cursor", entorno: Pick<EntornoInit, "home">): string {
  return path.join(entorno.home, cliente === "claude-code" ? ".claude" : ".cursor", "commands");
}

export function planDeComandos(cliente: "claude-code" | "cursor", entorno: Pick<EntornoInit, "home">): ComandoPlaneado[] {
  const carpeta = carpetaDeComandos(cliente, entorno);
  return comandosDeFabrica().map(({ numero, texto }) => {
    const archivo = path.join(carpeta, `f${numero}.md`);
    const contenido = `${MARCA_DE_COMANDO} v${SERVER_VERSION} -->\n${texto}\n`;
    if (fs.statSync(archivo, { throwIfNoEntry: false })?.isDirectory()) return { numero, archivo, texto: contenido, estado: "carpeta" };
    const actual = fs.existsSync(archivo) ? fs.readFileSync(archivo, "utf-8").replace(/\r\n/g, "\n") : null;
    if (actual === null) return { numero, archivo, texto: contenido, estado: "nuevo" };
    if (!actual.startsWith(MARCA_DE_COMANDO)) return { numero, archivo, texto: contenido, estado: "ajeno" };
    if (actual.slice(actual.indexOf("\n") + 1) === `${texto}\n`) return { numero, archivo, texto: contenido, estado: "sin-cambios" };
    return { numero, archivo, texto: contenido, estado: "actualiza" };
  });
}

async function copiarComandos(ctx: Contexto, clientes: Cliente[]): Promise<void> {
  const destinos: ["claude-code" | "cursor", string][] = [];
  if (clientes.includes("claude-code")) destinos.push(["claude-code", "Claude Code"]);
  if (clientes.includes("cursor")) destinos.push(["cursor", "Cursor"]);
  if (destinos.length === 0) {
    ctx.entorno.salida.out(mensaje("INIT-COMANDOS-SIN-CLIENTE"));
    return;
  }

  for (const [cliente, nombre] of destinos) {
    for (const { numero, archivo, texto: contenido, estado } of planDeComandos(cliente, ctx.entorno)) {
      if (estado === "carpeta") {
        fallar(ctx, mensaje("INIT-COMANDO-CARPETA", { nombre, archivo }));
        continue;
      }
      // A file without the mark is the person's: it is not overwritten without --yes.
      if (estado === "ajeno" && !ctx.opciones.yes) {
        ctx.entorno.salida.out(mensaje("INIT-COMANDO-AJENO", { nombre, archivo }));
        continue;
      }
      if (estado === "sin-cambios") {
        ctx.entorno.salida.out(mensaje("INIT-COMANDO-SIN-CAMBIOS", { nombre, numero }));
        continue;
      }

      // Replacing a person's file leaves a copy; one generated by init is rewritten as is.
      let copia: string | null = null;
      if (estado === "ajeno") {
        copia = escribirConCopia(ctx, archivo, contenido);
      } else if (!ctx.opciones.dryRun) {
        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        fs.writeFileSync(archivo, contenido, "utf-8");
      }
      decir(ctx, mensaje("INIT-COMANDO-COPIADO", { nombre, numero, nuevo: estado === "nuevo", archivo, copia }));
    }
  }
}

// ─── 4. Migration ───────────────────────────────────────────────────────────
// The phase-gate.json that the migration creates (and "Crear phase-gate.json" in the Studio): $schema,
// version, preset and idioma. The idioma is always written: so the project does not change language if the
// machine's changes tomorrow.
export function manifiestoNuevo(preset: string, idioma?: Idioma): string {
  return `${json({ $schema: URL_ESQUEMA_PROYECTO, version: 1, preset, ...(idioma ? { idioma } : {}) })}\n`;
}

// The language of a new manifest: that of the project's documents if there are any (never the system's), and
// otherwise, the chosen one.
export function idiomaParaManifiesto(carpetaProyecto: string, elegido: Idioma): Idioma {
  const enDisco = idiomaDelProyecto(carpetaProyecto, null);
  return enDisco.origen === "de sus documentos" ? enDisco.idioma : elegido;
}

async function migrar(ctx: Contexto, docs: string): Promise<boolean> {
  const preset = ctx.opciones.preset ?? "software-replica";
  const presets = presetsDisponibles();
  if (!presets.has(preset)) {
    ctx.entorno.salida.err(mensaje("INIT-PRESET-NO-EXISTE", { preset, disponibles: describirPresets(presets) }));
    return false;
  }

  if (ctx.opciones.soloEsteEquipo) {
    const archivo = rutaMaquina();
    const lectura = leerMaquina();
    if (lectura.estado === "invalido") {
      fallar(ctx, mensaje("INIT-NO-SE-TOCA", { error: lectura.error }));
      return true;
    }
    const actual: Record<string, unknown> & { presetPorDefecto?: string | undefined; idiomaPorDefecto?: string | undefined } = lectura.config ?? { version: VERSION_DE_MAQUINA };
    const idioma = ctx.opciones.idioma ?? null;
    if (actual.presetPorDefecto === preset && (!idioma || actual.idiomaPorDefecto === idioma)) {
      ctx.entorno.salida.out(mensaje("INIT-MAQUINA-SIN-CAMBIOS", { preset, idioma }));
      return true;
    }
    // Everything written is version 2, with the $schema of this series: the one the file had (an old @3)
    // does not stay, and the other keys keep their order.
    const { $schema: _anterior, ...resto } = actual;
    const nuevo = { $schema: URL_ESQUEMA_MAQUINA, ...resto, version: VERSION_DE_MAQUINA, presetPorDefecto: preset, ...(idioma ? { idiomaPorDefecto: idioma } : {}) };
    if (actual.presetPorDefecto && !ctx.opciones.dryRun && !(await confirmar(ctx, mensaje("INIT-PREGUNTA-CAMBIAR-PRESET", { actual: actual.presetPorDefecto, preset })))) {
      fallar(ctx, mensaje("INIT-MAQUINA-NO-CAMBIADA"));
      return true;
    }
    const copia = escribirConCopia(ctx, archivo, `${json(nuevo)}\n`);
    decir(ctx, mensaje("INIT-MAQUINA-ESCRITA", { preset, archivo, copia }));
    return true;
  }

  const proyectos = [...discoverProjects(docs).values()].sort();
  const nuevos = proyectos.filter((proyecto) => !fs.existsSync(path.join(docs, proyecto, ARCHIVO_MANIFIESTO)));
  // For the projects whose documents do not say their language: --idioma, or it is asked with the machine's as
  // the default; without a terminal, the machine's.
  let elegido: Idioma | null = ctx.opciones.idioma ?? null;
  const sinDocumentos = nuevos.filter((proyecto) => idiomaDelProyecto(proyecto, null).origen !== "de sus documentos");
  if (!elegido && sinDocumentos.length) {
    const delEquipo = idiomaDelEquipo().idioma;
    elegido = delEquipo;
    if (ctx.entorno.esTerminal && !ctx.opciones.yes) {
      const respuesta = (await ctx.entorno.preguntar(mensaje("INIT-PREGUNTA-IDIOMA", { proyectos: sinDocumentos, delEquipo }))).trim().toLowerCase();
      if (respuesta === "es" || respuesta === "en") elegido = respuesta;
    }
  }
  let creados = 0;
  for (const proyecto of nuevos) {
    const archivo = path.join(docs, proyecto, ARCHIVO_MANIFIESTO);
    const idioma = idiomaParaManifiesto(proyecto, elegido ?? "es");
    if (!ctx.opciones.dryRun) fs.writeFileSync(archivo, manifiestoNuevo(preset, idioma), "utf-8");
    decir(ctx, mensaje("INIT-MIGRATE-CREADO", { archivo, preset, idioma }));
    creados++;
  }
  const completados = completarIdiomas(ctx, proyectos.filter((proyecto) => !nuevos.includes(proyecto)));
  if (creados === 0 && completados === 0) ctx.entorno.salida.out(mensaje("INIT-MIGRATE-NADA"));
  return true;
}

// The migration reads manifests and documents with the server's functions, which look for the Documentation
// in PHASE_GATE_DOCS_PATH; init's can come from --docs or from the question, without that variable in the
// environment. Without this, the language of the documents was not detected and a manifest could not be read.
async function conLaDocumentacion<T>(docs: string, funcion: () => Promise<T>): Promise<T> {
  const antes = process.env.PHASE_GATE_DOCS_PATH;
  process.env.PHASE_GATE_DOCS_PATH = docs;
  try {
    return await funcion();
  } finally {
    if (antes === undefined) delete process.env.PHASE_GATE_DOCS_PATH;
    else process.env.PHASE_GATE_DOCS_PATH = antes;
  }
}

// The 3.0 and 3.1 manifests carry no `idioma`. The one the project already uses is added (that of its
// documents, or the Spanish of 3.x if it has none), so that it does not depend on the machine that opens it.
// Only that key is added, after `preset`, and a copy of the original is left; an invalid manifest is not
// touched: doctor says so.
function completarIdiomas(ctx: Contexto, proyectos: string[]): number {
  let completados = 0;
  for (const proyecto of proyectos) {
    const lectura = leerManifiesto(proyecto);
    if (lectura.estado !== "valido" || lectura.manifiesto.idioma) continue;
    const idioma = idiomaDelProyecto(proyecto, lectura.manifiesto).idioma;
    const crudo = JSON.parse(fs.readFileSync(lectura.ruta, "utf-8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
    const conIdioma: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(crudo)) {
      conIdioma[clave] = valor;
      if (clave === "preset") conIdioma.idioma = idioma;
    }
    if (!("idioma" in conIdioma)) conIdioma.idioma = idioma;
    const copia = escribirConCopia(ctx, lectura.ruta, `${json(conIdioma)}\n`);
    decir(ctx, mensaje("INIT-MIGRATE-IDIOMA", { archivo: lectura.ruta, idioma, copia }));
    completados++;
  }
  return completados;
}

// ─── 6. The git push lock ───────────────────────────────────────────────────
// In the messages' language: a function, because it is computed when used.
export function candadoDePush(): string {
  return mensaje("INIT-CANDADO-DE-PUSH");
}

// ─── init ───────────────────────────────────────────────────────────────────
export async function ejecutarInit(opciones: OpcionesInit, entorno: EntornoInit): Promise<number> {
  const ctx: Contexto = { opciones, entorno, fallos: 0 };

  const docs = await rutaPedida(ctx, opciones.docs, "DOCS_PATH");
  if (!docs) return 2;
  const repos = await rutaPedida(ctx, opciones.repos, "REPOS_PATH");
  if (!repos) return 2;
  if (!(await guardarRutas(ctx, { docs, repos }))) return 1;

  const clientes = opciones.clientes ?? (await detectarClientes(entorno));
  if (clientes.length === 0) {
    entorno.salida.out(mensaje("INIT-SIN-CLIENTES", { bloque: bloqueParaPegar("mcpServers", opciones.clave ?? CLAVE_POR_DEFECTO, entradaDelServidor("claude-code", entorno.plataforma)) }));
  }
  for (const cliente of clientes) {
    if (cliente === "claude-code") await registrarEnClaude(ctx);
    else await registrarEnArchivo(ctx, cliente);
  }

  if (opciones.comandos) await copiarComandos(ctx, clientes);
  if (opciones.migrate && !(await conLaDocumentacion(docs, () => migrar(ctx, docs)))) return 2;

  entorno.salida.out(`\n${candadoDePush()}`);
  entorno.salida.out(`\n${formatearDiagnostico(diagnosticar(), "texto")}`);
  if (opciones.dryRun) entorno.salida.out(`\n${mensaje("INIT-DRY-RUN-FIN")}`);

  return ctx.fallos ? 1 : 0;
}

