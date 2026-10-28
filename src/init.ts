// `npx mcp-phase-gate init`: registra el servidor en los clientes MCP de este equipo, y opcionalmente
// copia los comandos /fN y migra los proyectos a la 3.0.
//
// Escribe en archivos que no son suyos (la configuración de Cursor y de VS Code), así que lo hace con
// cuidado: lee tolerando comentarios y comas finales, no toca un JSON que no entiende, no duplica un
// registro que ya existe (cambiar su clave cambiaría el nombre de todas las tools y rompería los
// permisos ya concedidos), muestra el diff y pide confirmación antes de cambiar algo que ya estaba, y
// deja una copia .bak antes de escribir. Con --dry-run solo dice lo que haría.
//
// Todo lo que toca el sistema (la carpeta del usuario, ejecutar `claude`, preguntar en la terminal)
// llega en EntornoInit, para que los tests lo hagan sobre carpetas temporales.

import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline/promises";

import { capasDeCuerpos, fasesDe, rutasDeCuerpos } from "./capas.js";
import type { Salida } from "./cli.js";
import { SERVER_NAME, SERVER_VERSION, leerVariable } from "./config.js";
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

// La clave sugerida para un registro nuevo. Un registro que ya existe conserva la suya.
export const CLAVE_POR_DEFECTO = "pg";
export const CLAVE_VALIDA = /^[A-Za-z0-9_-]{1,64}$/;

export type OpcionesInit = {
  clientes: Cliente[] | null; // null: detectarlos
  clave: string | null; // null: CLAVE_POR_DEFECTO para registros nuevos
  docs: string | null;
  repos: string | null;
  comandos: boolean;
  migrate: boolean;
  preset: string | null;
  idioma?: Idioma | null; // --idioma: el de los proyectos sin documentos que lo digan (§8.3)
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

// ─── El entorno real ────────────────────────────────────────────────────────
// En Windows, `claude` puede ser un .exe (instalador nativo) o un .cmd (instalado con npm). execFile
// encuentra el .exe; un .cmd solo se puede lanzar a través de cmd.exe, con cada argumento entre
// comillas (las rutas de los usuarios llevan espacios).
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
  // Dentro de cmd.exe /c, un % se expande aunque vaya entre comillas, y una comilla rompe la cita: no
  // hay forma fiable de pasarlos. Antes que arriesgar otro comando, se pide hacerlo a mano.
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

// ─── JSON con comentarios ───────────────────────────────────────────────────
// Los mcp.json de los clientes admiten comentarios y comas finales. Se toleran SOLO para leer: lo que
// se escribe es JSON estricto. Recorre el texto respetando las cadenas, para no tomar un "//" de una
// URL por un comentario.
// Las comas finales se quitan en el mismo recorrido, fuera de las cadenas: una expresión regular sobre
// el texto entero cambiaba también un argumento como "--sep=,}" de otro servidor (hallazgo 6 de la
// auditoría de la Etapa 3). Devuelve además si había comentarios, para avisar de que se perderán.
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
      // Una coma final es la última cosa no blanca que se escribió antes de cerrar.
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
  // En algunas instalaciones el mcp.json de VS Code existe con 0 bytes (validación V5).
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

// ─── Utilidades ─────────────────────────────────────────────────────────────
export function marcaDeTiempo(fecha: Date): string {
  const dos = (n: number): string => String(n).padStart(2, "0");
  return (
    `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}-` +
    `${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`
  );
}

// Un diff de líneas pequeño (los bloques que se comparan son de unas decenas de líneas).
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

// En inglés se pregunta (y/N) y se acepta y o yes; en español, (s/N) y s o sí, como siempre.
async function confirmar(ctx: Contexto, pregunta: string): Promise<boolean> {
  if (ctx.opciones.yes) return true;
  if (ctx.opciones.dryRun || !ctx.entorno.esTerminal) return false;
  const idioma = idiomaDeMensajes();
  const respuesta = (await ctx.entorno.preguntar(mensaje("INIT-CONFIRMAR", { pregunta }, idioma))).trim();
  return (idioma === "en" ? /^y(es)?$/i : /^s[ií]?$/i).test(respuesta);
}

// Escribe con copia: si el archivo ya tenía contenido, primero <archivo>.bak-<AAAAMMDD-HHMMSS>.
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

// ─── 1. Rutas ───────────────────────────────────────────────────────────────
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

// ─── 2. Clientes ────────────────────────────────────────────────────────────
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
  // Cursor para Windows tiene abierto un bug en el que el formulario de confirmación no aparece
  // (validación V4): se registra con las confirmaciones en el chat.
  if (cliente === "cursor" && plataforma === "win32") env.PHASE_GATE_ELICITATION = "off";
  const base = { command: "npx", args: ["-y", SERVER_NAME], ...(Object.keys(env).length ? { env } : {}) };
  return cliente === "vscode" ? { type: "stdio", ...base } : base;
}

// What an entry had in its "env" and is taken out: this machine's paths (and their ORQUESTADOR_* aliases) and,
// with `quitarIdioma`, PHASE_GATE_LANG.
export type QuitaDelEntorno = { documentacion?: string; carpetaDeRepos?: string; idioma?: string };
export type OpcionesDeEntrada = { quitarIdioma?: boolean };

const VARIABLES_DE_RUTAS = ["PHASE_GATE_DOCS_PATH", "ORQUESTADOR_DOCS_PATH", "PHASE_GATE_REPOS_PATH", "ORQUESTADOR_REPOS_PATH"] as const;

// What an entry's "env" says: the value that would win (PHASE_GATE_* before its alias).
export function rutasDelEnvDeEntrada(env: Record<string, unknown>): QuitaDelEntorno {
  const texto = (valor: unknown): string | undefined => (typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined);
  const documentacion = texto(env.PHASE_GATE_DOCS_PATH) ?? texto(env.ORQUESTADOR_DOCS_PATH);
  const carpetaDeRepos = texto(env.PHASE_GATE_REPOS_PATH) ?? texto(env.ORQUESTADOR_REPOS_PATH);
  const idioma = texto(env.PHASE_GATE_LANG);
  return { ...(documentacion ? { documentacion } : {}), ...(carpetaDeRepos ? { carpetaDeRepos } : {}), ...(idioma ? { idioma } : {}) };
}

// What the "env" of an entry that already exists stops carrying, and what is taken out of it.
export function sinRutasEnElEntorno(env: Record<string, unknown>, opciones: OpcionesDeEntrada = {}): { env: Record<string, unknown>; quita: QuitaDelEntorno } {
  const quita = rutasDelEnvDeEntrada(env);
  const resto = { ...env };
  for (const variable of VARIABLES_DE_RUTAS) delete resto[variable];
  if (opciones.quitarIdioma) delete resto.PHASE_GATE_LANG;
  else delete quita.idioma;
  return { env: resto, quita };
}

// ¿Esta parte de un comando lanza mcp-phase-gate? El paquete exacto (`mcp-phase-gate`, o con versión
// `mcp-phase-gate@3`), el binario global, o un build/index.js cuyo package.json, dos carpetas más
// arriba, se llama mcp-phase-gate (un clon de desarrollo). Antes bastaba con contener el nombre o con
// ser un build/index.js cualquiera, y init le inyectaba sus variables a un servidor ajeno (hallazgo 5
// de la auditoría de la Etapa 3).
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
// ORQUESTADOR_* aliases) and, if asked, PHASE_GATE_LANG. It keeps the command (a development clone still
// launches its build/index.js) and everything else, such as Cursor's PHASE_GATE_ELICITATION on Windows.
function actualizarEntrada(existente: Record<string, unknown>, nueva: Record<string, unknown>, opciones: OpcionesDeEntrada): { entrada: Record<string, unknown>; quita: QuitaDelEntorno } {
  const actual = esObjetoPlano(existente.env) ? existente.env : {};
  const { env, quita } = sinRutasEnElEntorno(actual, opciones);
  const nuevo = { ...env, ...(esObjetoPlano(nueva.env) ? nueva.env : {}) };
  const entrada = { ...existente };
  if (Object.keys(nuevo).length) entrada.env = nuevo;
  else delete entrada.env;
  return { entrada, quita };
}

const esObjetoPlano = (valor: unknown): valor is Record<string, unknown> => valor !== null && typeof valor === "object" && !Array.isArray(valor);

function bloqueParaPegar(seccion: string, clave: string, entrada: Record<string, unknown>): string {
  return json({ [seccion]: { [clave]: entrada } });
}

// ─── El plan de un cliente de archivo (Cursor, VS Code) ─────────────────────
// Qué haría init en su mcp.json, sin escribir nada: lo calcula una sola función, que usan `init` (que
// después pregunta y escribe) y el Studio (que lo enseña y lo aplica con su huella).
type BaseDePlan = {
  cliente: "cursor" | "vscode";
  nombre: string; // "Cursor" o "VS Code"
  archivo: string;
  seccion: string;
  clave: string; // la pedida
};
export type PlanDeArchivo =
  | (BaseDePlan & { estado: "roto"; error: string | null; paraPegar: string })
  | (BaseDePlan & { estado: "forma-rara"; paraPegar: string })
  | (BaseDePlan & { estado: "clave-ocupada" })
  | (BaseDePlan & { estado: "sin-cambios"; claveFinal: string })
  | (BaseDePlan & {
      estado: "nuevo" | "actualiza";
      claveFinal: string;
      quita: QuitaDelEntorno; // lo que el "env" de la entrada llevaba y deja de llevar
      renombra: string | null; // la clave que se sustituye por --clave
      conserva: string | null; // la clave que ya tenía y se conserva
      comentarios: boolean;
      diff: string | null; // el de la entrada que ya existía (null si es nueva)
      entrada: string; // la entrada que queda, en JSON
      texto: string; // el archivo entero que se escribiría
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
  // Una sección o un env que no son un objeto no se "arreglan" por su cuenta: no se toca el archivo.
  const esObjeto = (valor: unknown): valor is Record<string, unknown> => valor !== null && typeof valor === "object" && !Array.isArray(valor);
  const seccionActual = datos[seccion];
  const formaRara =
    (seccionActual !== undefined && !esObjeto(seccionActual)) ||
    (esObjeto(seccionActual) && Object.values(seccionActual).some((e) => esObjeto(e) && e.env !== undefined && !esObjeto(e.env)));
  if (formaRara) return { ...base, estado: "forma-rara", paraPegar: bloqueParaPegar(seccion, clave, deseada) };
  const servidores = { ...((seccionActual as Record<string, unknown> | undefined) ?? {}) };

  // ¿Ya está registrado? Se busca primero bajo la clave pedida y después bajo cualquier otra.
  const yaRegistrada = Object.keys(servidores).find((k) => k === clave && ejecutaPhaseGate(servidores[k])) ?? Object.keys(servidores).find((k) => ejecutaPhaseGate(servidores[k]));

  let claveFinal = clave;
  let nuevaEntrada = deseada;
  let quita: QuitaDelEntorno = {};
  let renombra: string | null = null;
  let conserva: string | null = null;

  if (yaRegistrada) {
    ({ entrada: nuevaEntrada, quita } = actualizarEntrada(servidores[yaRegistrada] as Record<string, unknown>, deseada, opciones));
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
  if (yaRegistrada && !renombra && antes === despues) return { ...base, estado: "sin-cambios", claveFinal };

  if (renombra) delete servidores[renombra];
  servidores[claveFinal] = nuevaEntrada;
  return {
    ...base,
    estado: yaRegistrada ? "actualiza" : "nuevo",
    claveFinal,
    quita,
    renombra,
    conserva,
    comentarios: lectura.comentarios,
    diff: yaRegistrada ? diffDeLineas(antes, despues) : null,
    entrada: despues,
    texto: `${json({ ...datos, [seccion]: servidores })}\n`,
  };
}

async function registrarEnArchivo(ctx: Contexto, cliente: "cursor" | "vscode"): Promise<void> {
  const plan = planDeArchivo(cliente, ctx.opciones.clave, ctx.entorno);
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

  // Cambiar algo que ya existía (o perder comentarios) se confirma; añadir una entrada nueva, no.
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

// `claude mcp list` imprime una línea por servidor: "<clave>: <comando o URL> - <estado>".
export function registroEnClaude(lista: string): string | null {
  for (const linea of lista.split(/\r?\n/)) {
    const corte = linea.indexOf(": ");
    if (corte <= 0) continue;
    // "<comando y args> - <estado>": las partes del comando, sin el estado del final.
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
export type RehacerEnClaude = { ambito: "user" | "local"; carpeta: string | null; comandos: string[]; quita: QuitaDelEntorno };

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
    const { env, quita } = sinRutasEnElEntorno(esObjetoPlano(entrada.env) ? entrada.env : {}, opciones);
    if (!Object.keys(quita).length) continue;
    const nueva = { ...entrada };
    if (Object.keys(env).length) nueva.env = env;
    else delete nueva.env;
    rehacer.push({
      ambito,
      carpeta,
      quita,
      comandos: [`claude mcp remove ${clave} --scope ${ambito}`, `claude mcp add-json ${clave} ${citarJson(JSON.stringify(nueva), plataforma)} --scope ${ambito}`],
    });
  }
  return rehacer;
}

function mostrarComando(args: string[]): string {
  return ["claude", ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
}

// El plan en Claude Code: el comando que se ejecutaría, o por qué no. Lee `claude mcp list`, que no
// escribe nada.
// An entry that already exists is not touched: `rehacer` says, for each scope where it is, the two commands
// that leave it the same but without the paths (`claude mcp remove` and `claude mcp add-json`). The person
// runs them: if the add failed after the remove, the server would be left unregistered. `quita` is what it
// carried in its "env".
export type PlanDeClaude =
  | { cliente: "claude-code"; estado: "sin-lista"; mensaje: string }
  | { cliente: "claude-code"; estado: "existente"; existente: string; comando: string | null; rehacer: RehacerEnClaude[]; quita: QuitaDelEntorno }
  | { cliente: "claude-code"; estado: "nuevo"; clave: string; args: string[]; comando: string };

export async function planDeClaude(claveDada: string | null, entorno: Pick<EntornoInit, "ejecutar" | "home" | "plataforma">, opciones: OpcionesDeEntrada = {}): Promise<PlanDeClaude> {
  let lista: Ejecucion;
  try {
    lista = await entorno.ejecutar("claude", ["mcp", "list"]);
  } catch (error) {
    return { cliente: "claude-code", estado: "sin-lista", mensaje: mensaje("INIT-CLAUDE-SIN-LISTA", { error: error instanceof Error ? error.message : String(error) }) };
  }
  // Sin la lista no se puede saber si ya está registrado: añadirlo podría duplicarlo.
  if (lista.codigo !== 0) {
    return { cliente: "claude-code", estado: "sin-lista", mensaje: mensaje("INIT-CLAUDE-LISTA-FALLO", { stderr: lista.stderr.trim(), codigo: lista.codigo }) };
  }

  // `mcp list` does not show a registration's variables: they are read from ~/.claude.json. One that already
  // exists is not touched.
  const existente = registroEnClaude(lista.stdout);
  if (existente) {
    const rehacer = comandosParaRehacer(entorno.home, existente, entorno.plataforma, opciones);
    const quita: QuitaDelEntorno = Object.assign({}, ...rehacer.map((r) => r.quita).reverse());
    const comando = rehacer.length ? rehacer.map((r) => mensaje("INIT-CLAUDE-REHACER", { ambito: r.ambito, carpeta: r.carpeta, comandos: r.comandos })).join("\n") : null;
    return { cliente: "claude-code", estado: "existente", existente, comando, rehacer, quita };
  }
  const clave = claveDada ?? CLAVE_POR_DEFECTO;
  const args = comandoDeClaude(clave);
  return { cliente: "claude-code", estado: "nuevo", clave, args, comando: mostrarComando(args) };
}

async function registrarEnClaude(ctx: Contexto): Promise<void> {
  const plan = await planDeClaude(ctx.opciones.clave, ctx.entorno);
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

// ─── 3. Comandos ────────────────────────────────────────────────────────────
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

// El plan de --comandos para un cliente que lee comandos de archivo: cada /fN, dónde iría, con qué texto y
// qué pasaría. "ajeno" es un archivo sin la marca de init: es de la persona y no se pisa sin --yes.
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
      // Un archivo sin la marca es de la persona: no se pisa sin --yes.
      if (estado === "ajeno" && !ctx.opciones.yes) {
        ctx.entorno.salida.out(mensaje("INIT-COMANDO-AJENO", { nombre, archivo }));
        continue;
      }
      if (estado === "sin-cambios") {
        ctx.entorno.salida.out(mensaje("INIT-COMANDO-SIN-CAMBIOS", { nombre, numero }));
        continue;
      }

      // Reemplazar un archivo de la persona deja copia; uno generado por init se reescribe sin más.
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

// ─── 4. Migración ───────────────────────────────────────────────────────────
// El phase-gate.json que crea la migración (y "Crear phase-gate.json" en el Studio): $schema, version,
// preset e idioma. El idioma va siempre escrito: así el proyecto no cambia de idioma si mañana cambia el
// del equipo (§8.3).
export function manifiestoNuevo(preset: string, idioma?: Idioma): string {
  return `${json({ $schema: URL_ESQUEMA_PROYECTO, version: 1, preset, ...(idioma ? { idioma } : {}) })}\n`;
}

// El idioma de un manifiesto nuevo: el de los documentos del proyecto si los hay (paso 2 de §8.3, nunca el
// del sistema), y si no, el elegido.
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
  // Para los proyectos cuyos documentos no dicen su idioma: --idioma, o se pregunta con el del equipo por
  // defecto (pasos 3 a 5 de §8.3); sin terminal, el del equipo.
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

// La migración lee manifiestos y documentos con las funciones del servidor, que buscan la Documentación en
// PHASE_GATE_DOCS_PATH; la de init puede venir de --docs o de la pregunta, sin esa variable en el entorno.
// Sin esto, el idioma de los documentos no se detectaba y un manifiesto no se podía leer.
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

// Los manifiestos de la 3.0 y la 3.1 no llevan `idioma`. Se les añade el que el proyecto ya usa (el de sus
// documentos, o el español de la 3.x si no tiene), para que no dependa del equipo que lo abra (hallazgo 2
// de la auditoría de la Etapa 6). Solo se añade esa clave, detrás de `preset`, y queda copia del original;
// un manifiesto inválido no se toca: lo dice doctor.
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

// ─── 6. El candado de git push ──────────────────────────────────────────────
// En el idioma de los mensajes: una función, porque se calcula al usarlo.
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

