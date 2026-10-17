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
import { ARCHIVO_MANIFIESTO, URL_ESQUEMA_MAQUINA, URL_ESQUEMA_PROYECTO, describirPresets, leerMaquina, presetsDisponibles, rutaMaquina } from "./manifiesto.js";
import { discoverProjects } from "./paths.js";
import { leerPromptNormalizado, resolveCommandFile } from "./phases.js";
import { textoGenerico } from "./prompts-mcp.js";

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
    if (directo.noEncontrado) throw new Error(`${comando} no está instalado o no está en el PATH.`);
    return directo;
  }
  // Dentro de cmd.exe /c, un % se expande aunque vaya entre comillas, y una comilla rompe la cita: no
  // hay forma fiable de pasarlos. Antes que arriesgar otro comando, se pide hacerlo a mano.
  if (args.some((arg) => /[%"]/.test(arg))) {
    throw new Error(`no se puede lanzar ${comando}.cmd con seguridad: algún argumento lleva % o comillas. Ejecuta el comando a mano.`);
  }
  const linea = [`${comando}.cmd`, ...args].map(citarParaCmd).join(" ");
  const porCmd = await lanzar(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `"${linea}"`], { verbatim: true });
  if (porCmd.codigo !== 0 && /no se reconoce|is not recognized/i.test(porCmd.stderr)) {
    throw new Error(`${comando} no está instalado o no está en el PATH.`);
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
      return { estado: "roto", datos: {}, comentarios, error: "no es un objeto JSON" };
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

async function confirmar(ctx: Contexto, pregunta: string): Promise<boolean> {
  if (ctx.opciones.yes) return true;
  if (ctx.opciones.dryRun || !ctx.entorno.esTerminal) return false;
  return /^s[ií]?$/i.test((await ctx.entorno.preguntar(`${pregunta} (s/N) `)).trim());
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
  fs.writeFileSync(archivo, texto, "utf-8");
  return copia;
}

// ─── 1. Rutas ───────────────────────────────────────────────────────────────
async function rutaPedida(ctx: Contexto, valor: string | null, logica: "DOCS_PATH" | "REPOS_PATH", que: string): Promise<string | null> {
  let crudo = valor ?? leerVariable(logica).valor ?? null;
  if (!crudo && ctx.entorno.esTerminal) crudo = (await ctx.entorno.preguntar(`Ruta de ${que}: `)).trim() || null;
  if (!crudo) {
    ctx.entorno.salida.err(`Falta la ruta de ${que}: pásala con ${logica === "DOCS_PATH" ? "--docs" : "--repos"} o define PHASE_GATE_${logica}.`);
    return null;
  }
  const ruta = path.resolve(crudo);
  if (!existeCarpeta(ruta)) {
    ctx.entorno.salida.err(`La ruta de ${que} no existe o no es una carpeta: ${ruta}`);
    return null;
  }
  return ruta;
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

export function entradaDelServidor(cliente: Cliente, rutas: Rutas, plataforma: NodeJS.Platform): Record<string, unknown> {
  const env: Record<string, string> = { PHASE_GATE_DOCS_PATH: rutas.docs, PHASE_GATE_REPOS_PATH: rutas.repos };
  // Cursor para Windows tiene abierto un bug en el que el formulario de confirmación no aparece
  // (validación V4): se registra con las confirmaciones en el chat.
  if (cliente === "cursor" && plataforma === "win32") env.PHASE_GATE_ELICITATION = "off";
  const base = { command: "npx", args: ["-y", SERVER_NAME], env };
  return cliente === "vscode" ? { type: "stdio", ...base } : base;
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

// Lo que cambia init en una entrada que ya existe: las dos rutas, con los nombres nuevos. Conserva el
// comando (un clon de desarrollo sigue lanzando su build/index.js) y el resto de variables, salvo los
// alias ORQUESTADOR_* de esas dos, que quedarían en discrepancia.
function actualizarEntrada(existente: Record<string, unknown>, nueva: Record<string, unknown>): Record<string, unknown> {
  const env = { ...((existente.env as Record<string, string> | undefined) ?? {}) };
  delete env.ORQUESTADOR_DOCS_PATH;
  delete env.ORQUESTADOR_REPOS_PATH;
  return { ...existente, env: { ...env, ...(nueva.env as Record<string, string>) } };
}

function bloqueParaPegar(seccion: string, clave: string, entrada: Record<string, unknown>): string {
  return json({ [seccion]: { [clave]: entrada } });
}

async function registrarEnArchivo(ctx: Contexto, cliente: "cursor" | "vscode", rutas: Rutas): Promise<void> {
  const nombre = cliente === "cursor" ? "Cursor" : "VS Code";
  const archivo = cliente === "cursor" ? path.join(ctx.entorno.home, ".cursor", "mcp.json") : path.join(carpetaDeVsCode(ctx.entorno), "mcp.json");
  const seccion = cliente === "cursor" ? "mcpServers" : "servers";
  const deseada = entradaDelServidor(cliente, rutas, ctx.entorno.plataforma);
  const clave = ctx.opciones.clave ?? CLAVE_POR_DEFECTO;

  const lectura = leerJsonTolerante(archivo);
  if (lectura.estado === "roto") {
    fallar(
      ctx,
      `${nombre}: no se pudo leer ${archivo} (${lectura.error}). No se toca. Para registrarlo a mano, añade:\n` +
        bloqueParaPegar(seccion, clave, deseada)
    );
    return;
  }

  const datos = lectura.datos;
  // Una sección o un env que no son un objeto no se "arreglan" por su cuenta: no se toca el archivo.
  const esObjeto = (valor: unknown): valor is Record<string, unknown> => valor !== null && typeof valor === "object" && !Array.isArray(valor);
  const seccionActual = datos[seccion];
  const formaRara =
    (seccionActual !== undefined && !esObjeto(seccionActual)) ||
    (esObjeto(seccionActual) && Object.values(seccionActual).some((e) => esObjeto(e) && e.env !== undefined && !esObjeto(e.env)));
  if (formaRara) {
    fallar(
      ctx,
      `${nombre}: en ${archivo}, "${seccion}" o el "env" de alguna entrada no es un objeto. No se toca. Para registrarlo a mano, añade:\n` +
        bloqueParaPegar(seccion, clave, deseada)
    );
    return;
  }
  const servidores = { ...((seccionActual as Record<string, unknown> | undefined) ?? {}) };

  // ¿Ya está registrado? Se busca primero bajo la clave pedida y después bajo cualquier otra.
  const yaRegistrada = Object.keys(servidores).find((k) => k === clave && ejecutaPhaseGate(servidores[k])) ?? Object.keys(servidores).find((k) => ejecutaPhaseGate(servidores[k]));

  let claveFinal = clave;
  let nuevaEntrada = deseada;
  let renombrar: string | null = null;

  if (yaRegistrada) {
    nuevaEntrada = actualizarEntrada(servidores[yaRegistrada] as Record<string, unknown>, deseada);
    if (yaRegistrada !== clave && ctx.opciones.clave === null) {
      claveFinal = yaRegistrada;
      decir(ctx, `${nombre}: ya estaba registrado como «${yaRegistrada}»; se actualiza esa entrada y se conserva su clave (cambiarla cambiaría el nombre de las tools y los prompts, y los permisos concedidos).`);
    } else if (yaRegistrada !== clave) {
      renombrar = yaRegistrada;
      decir(ctx, `${nombre}: ya estaba registrado como «${yaRegistrada}»; --clave pide renombrarlo a «${clave}». Ojo: cambia el nombre de todas las tools y prompts, y los permisos concedidos.`);
    }
  } else if (servidores[clave] !== undefined) {
    fallar(ctx, `${nombre}: la clave «${clave}» ya la usa otro servidor en ${archivo}. Elige otra con --clave.`);
    return;
  }

  const antes = yaRegistrada ? json(servidores[yaRegistrada]) : "";
  const despues = json(nuevaEntrada);
  if (yaRegistrada && !renombrar && antes === despues) {
    ctx.entorno.salida.out(`${nombre}: sin cambios (${archivo}, «${claveFinal}»).`);
    return;
  }

  // Cambiar algo que ya existía (o perder comentarios) se confirma; añadir una entrada nueva, no.
  const cambiaAlgo = Boolean(yaRegistrada) || lectura.comentarios;
  if (yaRegistrada) ctx.entorno.salida.out(`${nombre}: cambios en «${claveFinal}» (${archivo}):\n${diffDeLineas(antes, despues)}`);
  if (lectura.comentarios) ctx.entorno.salida.out(`${nombre}: ${archivo} tiene comentarios; al reescribirlo se perderán (queda la copia .bak).`);
  if (cambiaAlgo && !ctx.opciones.dryRun && !(await confirmar(ctx, `¿Aplicar los cambios en ${archivo}?`))) {
    fallar(ctx, `${nombre}: no se aplicó. Repite con --yes, o en una terminal para confirmarlo.`);
    return;
  }

  if (renombrar) delete servidores[renombrar];
  servidores[claveFinal] = nuevaEntrada;
  const copia = escribirConCopia(ctx, archivo, `${json({ ...datos, [seccion]: servidores })}\n`);
  const accion = yaRegistrada ? "actualizado" : "registrado";
  decir(ctx, `${nombre}: ${accion} como «${claveFinal}» en ${archivo}.${copia ? ` Copia: ${copia}` : ""}`);
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

function comandoDeClaude(clave: string, rutas: Rutas): string[] {
  return ["mcp", "add", clave, "--scope", "user", "--env", `PHASE_GATE_DOCS_PATH=${rutas.docs}`, "--env", `PHASE_GATE_REPOS_PATH=${rutas.repos}`, "--", "npx", "-y", SERVER_NAME];
}

function mostrarComando(args: string[]): string {
  return ["claude", ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
}

async function registrarEnClaude(ctx: Contexto, rutas: Rutas): Promise<void> {
  let lista: Ejecucion;
  try {
    lista = await ctx.entorno.ejecutar("claude", ["mcp", "list"]);
  } catch (error) {
    fallar(ctx, `Claude Code: no se pudo ejecutar claude mcp list (${error instanceof Error ? error.message : String(error)}).`);
    return;
  }
  // Sin la lista no se puede saber si ya está registrado: añadirlo podría duplicarlo.
  if (lista.codigo !== 0) {
    fallar(ctx, `Claude Code: claude mcp list falló (${lista.stderr.trim() || `código ${lista.codigo}`}); no se registra para no duplicarlo.`);
    return;
  }

  // `mcp list` no enseña las variables de un registro, así que uno que ya existe no se toca: se dice
  // cómo actualizarlo a mano, con su misma clave.
  const existente = registroEnClaude(lista.stdout);
  if (existente) {
    ctx.entorno.salida.out(
      `Claude Code: ya está registrado como «${existente}»; no se toca. Para cambiar sus rutas: ` +
        `claude mcp remove ${existente}  y después  ${mostrarComando(comandoDeClaude(existente, rutas))}`
    );
    return;
  }

  const clave = ctx.opciones.clave ?? CLAVE_POR_DEFECTO;
  const args = comandoDeClaude(clave, rutas);
  if (ctx.opciones.dryRun) {
    decir(ctx, `Claude Code: se ejecutaría ${mostrarComando(args)}`);
    return;
  }
  const resultado = await ctx.entorno.ejecutar("claude", args).catch((error: unknown) => ({ codigo: 1, stdout: "", stderr: String(error) }));
  if (resultado.codigo !== 0) {
    fallar(ctx, `Claude Code: claude mcp add falló (${resultado.stderr.trim() || `código ${resultado.codigo}`}).`);
    return;
  }
  decir(ctx, `Claude Code: registrado como «${clave}» (ámbito user).`);
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

async function copiarComandos(ctx: Contexto, clientes: Cliente[]): Promise<void> {
  const destinos: [string, string][] = [];
  if (clientes.includes("claude-code")) destinos.push(["Claude Code", path.join(ctx.entorno.home, ".claude", "commands")]);
  if (clientes.includes("cursor")) destinos.push(["Cursor", path.join(ctx.entorno.home, ".cursor", "commands")]);
  if (destinos.length === 0) {
    ctx.entorno.salida.out("--comandos: ninguno de los clientes elegidos lee comandos de archivo (Claude Code o Cursor).");
    return;
  }

  const comandos = comandosDeFabrica();
  for (const [nombre, carpeta] of destinos) {
    for (const { numero, texto } of comandos) {
      const archivo = path.join(carpeta, `f${numero}.md`);
      const contenido = `${MARCA_DE_COMANDO} v${SERVER_VERSION} -->\n${texto}\n`;
      if (fs.statSync(archivo, { throwIfNoEntry: false })?.isDirectory()) {
        fallar(ctx, `${nombre}: ${archivo} es una carpeta; no se toca.`);
        continue;
      }
      const actual = fs.existsSync(archivo) ? fs.readFileSync(archivo, "utf-8").replace(/\r\n/g, "\n") : null;

      if (actual !== null && !actual.startsWith(MARCA_DE_COMANDO)) {
        // Un archivo sin la marca es de la persona: no se pisa sin --yes.
        if (!ctx.opciones.yes) {
          ctx.entorno.salida.out(`${nombre}: ${archivo} es tuyo (no lo generó init); no se toca. Con --yes se reemplaza, con copia.`);
          continue;
        }
      } else if (actual !== null && actual.slice(actual.indexOf("\n") + 1) === `${texto}\n`) {
        ctx.entorno.salida.out(`${nombre}: /f${numero} sin cambios.`);
        continue;
      }

      // Reemplazar un archivo de la persona deja copia; uno generado por init se reescribe sin más.
      let copia: string | null = null;
      if (actual !== null && !actual.startsWith(MARCA_DE_COMANDO)) {
        copia = escribirConCopia(ctx, archivo, contenido);
      } else if (!ctx.opciones.dryRun) {
        fs.mkdirSync(carpeta, { recursive: true });
        fs.writeFileSync(archivo, contenido, "utf-8");
      }
      decir(ctx, `${nombre}: /f${numero} ${actual === null ? "copiado" : "actualizado"} en ${archivo}.${copia ? ` Copia: ${copia}` : ""}`);
    }
  }
}

// ─── 4. Migración ───────────────────────────────────────────────────────────
async function migrar(ctx: Contexto, docs: string): Promise<boolean> {
  const preset = ctx.opciones.preset ?? "software-replica";
  const presets = presetsDisponibles();
  if (!presets.has(preset)) {
    ctx.entorno.salida.err(`No existe el preset "${preset}". Los disponibles son: ${describirPresets(presets)}.`);
    return false;
  }

  if (ctx.opciones.soloEsteEquipo) {
    const archivo = rutaMaquina();
    const lectura = leerMaquina();
    if (lectura.estado === "invalido") {
      fallar(ctx, `${lectura.error} No se toca.`);
      return true;
    }
    const actual: Record<string, unknown> & { presetPorDefecto?: string | undefined } = lectura.config ?? { version: 1 };
    if (actual.presetPorDefecto === preset) {
      ctx.entorno.salida.out(`machine.json: presetPorDefecto ya es "${preset}"; sin cambios.`);
      return true;
    }
    const nuevo = { $schema: URL_ESQUEMA_MAQUINA, ...actual, presetPorDefecto: preset };
    if (actual.presetPorDefecto && !ctx.opciones.dryRun && !(await confirmar(ctx, `machine.json ya tiene presetPorDefecto "${actual.presetPorDefecto}". ¿Cambiarlo a "${preset}"?`))) {
      fallar(ctx, "machine.json: no se cambió. Repite con --yes, o en una terminal para confirmarlo.");
      return true;
    }
    const copia = escribirConCopia(ctx, archivo, `${json(nuevo)}\n`);
    decir(ctx, `machine.json: presetPorDefecto "${preset}" en ${archivo}. Los proyectos sin manifiesto de este equipo lo usan.${copia ? ` Copia: ${copia}` : ""}`);
    return true;
  }

  const proyectos = [...discoverProjects(docs).values()].sort();
  let creados = 0;
  for (const proyecto of proyectos) {
    const archivo = path.join(docs, proyecto, ARCHIVO_MANIFIESTO);
    if (fs.existsSync(archivo)) continue; // solo crea, nunca sobrescribe
    if (!ctx.opciones.dryRun) fs.writeFileSync(archivo, `${json({ $schema: URL_ESQUEMA_PROYECTO, version: 1, preset })}\n`, "utf-8");
    decir(ctx, `--migrate: ${archivo} con "preset": "${preset}".`);
    creados++;
  }
  if (creados === 0) ctx.entorno.salida.out("--migrate: todos los proyectos ya tienen phase-gate.json; nada que crear.");
  return true;
}

// ─── 6. El candado de git push ──────────────────────────────────────────────
export const CANDADO_DE_PUSH = `Candado opcional para git push (init no lo instala; de menos a más firme):
  1. Claude Code: reglas deny en ~/.claude/settings.json, para las dos herramientas de terminal:
       "permissions": { "deny": ["Bash(git push *)", "PowerShell(git push *)"] }
     La de PowerShell hace falta en Windows. No son una frontera de seguridad: \`git -C . push\` las esquiva.
  2. Un hook pre-push de git que rechace el push. Más firme, aunque \`git push --no-verify\` lo salta (y el
     prompt de la Fase 4 prohíbe usarlo).
  3. La única frontera real está en el remoto: protección de ramas (en GitHub, un ruleset), o que el entorno
     del agente no tenga credenciales para hacer push.`;

// ─── init ───────────────────────────────────────────────────────────────────
export async function ejecutarInit(opciones: OpcionesInit, entorno: EntornoInit): Promise<number> {
  const ctx: Contexto = { opciones, entorno, fallos: 0 };

  const docs = await rutaPedida(ctx, opciones.docs, "DOCS_PATH", "la Documentación Central");
  if (!docs) return 2;
  const repos = await rutaPedida(ctx, opciones.repos, "REPOS_PATH", "la carpeta de repositorios");
  if (!repos) return 2;
  const rutas = { docs, repos };

  const clientes = opciones.clientes ?? (await detectarClientes(entorno));
  if (clientes.length === 0) {
    entorno.salida.out(
      "No encontré ningún cliente MCP (Claude Code, Cursor ni VS Code). Para registrarlo a mano, en el mcp.json de tu cliente:\n" +
        bloqueParaPegar("mcpServers", opciones.clave ?? CLAVE_POR_DEFECTO, entradaDelServidor("claude-code", rutas, entorno.plataforma))
    );
  }
  for (const cliente of clientes) {
    if (cliente === "claude-code") await registrarEnClaude(ctx, rutas);
    else await registrarEnArchivo(ctx, cliente, rutas);
  }

  if (opciones.comandos) await copiarComandos(ctx, clientes);
  if (opciones.migrate && !(await migrar(ctx, docs))) return 2;

  entorno.salida.out(`\n${CANDADO_DE_PUSH}`);
  entorno.salida.out(`\n${formatearDiagnostico(diagnosticar(), "texto")}`);
  if (opciones.dryRun) entorno.salida.out("\n--dry-run: no se escribió nada.");

  return ctx.fallos ? 1 : 0;
}

