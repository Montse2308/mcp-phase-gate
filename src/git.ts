// La única puerta a git, y de solo lectura para el servidor MCP. (La única escritura, gitEnLaDemo, es la de
// la demo del Studio en sus propios repos temporales: ver al final.)
//
// El servidor nunca escribe en git (principio 3 del plan): los commits los hace el agente con su
// terminal. Pero hasta leer tiene efectos si no se tiene cuidado: `git status` puede reescribir el
// índice y tomar index.lock (y estorbar a un commit que el agente esté haciendo a la vez), y si el
// repo configura core.fsmonitor, git EJECUTA ese comando. Un repo clonado de cualquier sitio podría
// traerlo. Por eso toda llamada pasa por aquí, con:
//   - `-c core.fsmonitor=false` delante de todo, y cada filtro de .gitattributes anulado (ver abajo);
//   - GIT_OPTIONAL_LOCKS=0, para que status no tome locks opcionales;
//   - GIT_TERMINAL_PROMPT=0, para que nada se quede esperando una contraseña;
//   - LC_ALL=C, para que los mensajes de error no dependan del idioma del equipo;
//   - execFile, sin shell, con argumentos que son constantes del código: ningún texto que venga del
//     modelo llega a la línea de comandos de git, salvo el hash de un lote: antes pasa por SHA (solo
//     hexadecimal) y va detrás de --end-of-options, y las consultas siguientes usan el SHA completo
//     que devolvió git.

import { execFile, execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { fallo, mensaje } from "./i18n/mensajes.js";

export const ESPERA_DE_GIT_MS = 10_000;
const SALIDA_MAXIMA = 1_048_576;

export type MotivoDeError = "no-instalado" | "no-es-repo" | "propiedad-dudosa" | "tiempo" | "otro";

export class ErrorDeGit extends Error {
  constructor(
    message: string,
    readonly motivo: MotivoDeError
  ) {
    super(message);
  }
}

// El error de git dicho para una persona, con lo que tiene que hacer.
export type FalloDeEjecucion = { code?: string | number | null | undefined; killed?: boolean | undefined; message: string };

export function traducirError(error: FalloDeEjecucion, stderr: string, dir: string): ErrorDeGit {
  if (error.code === "ENOENT") return new ErrorDeGit(mensaje("GITX-NO-INSTALADO"), "no-instalado");
  if (error.killed) return new ErrorDeGit(mensaje("GITX-TIEMPO", { segundos: ESPERA_DE_GIT_MS / 1000, dir }), "tiempo");
  if (/dubious ownership/i.test(stderr)) {
    return new ErrorDeGit(mensaje("GITX-PROPIEDAD-DUDOSA", { dir, seguro: dir.replace(/\\/g, "/") }), "propiedad-dudosa");
  }
  if (/not a git repository/i.test(stderr)) return new ErrorDeGit(mensaje("GITX-NO-ES-REPO", { dir }), "no-es-repo");
  return new ErrorDeGit(mensaje("GITX-FALLO", { dir, detalle: stderr.trim() || error.message }), "otro");
}

// Las mismas opciones para las dos variantes: es lo que hace de esto una sola puerta.
function opcionesDe(dir: string) {
  return {
    cwd: dir,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
    timeout: ESPERA_DE_GIT_MS,
    maxBuffer: SALIDA_MAXIMA,
    windowsHide: true,
    encoding: "utf8" as const,
  };
}

const ARGUMENTOS_FIJOS = ["-c", "core.fsmonitor=false"];

// Los filtros de .gitattributes (`filter.<nombre>.clean`, `.smudge`, `.process`) también son comandos
// que git ejecuta: `git status` pasa por el filtro clean un archivo que cambió de fecha, y como
// GIT_OPTIONAL_LOCKS=0 no refresca el índice, lo haría en cada llamada. Un `.git/config` manipulado
// podría traer uno, igual que un core.fsmonitor (hallazgo 1 de la auditoría de la Etapa 3). Leer la
// configuración no ejecuta nada, así que primero se leen los nombres de los drivers definidos (en
// cualquier ámbito) y cada uno se anula con -c. Comprobado con control positivo en git 2.51: con el
// valor vacío, ni clean ni process se ejecutan.
const CONSULTA_DE_FILTROS = ["config", "--get-regexp", "^filter\\."];

export function anularFiltros(salidaDeConfig: string, dir: string): string[] {
  const nombres = new Set<string>();
  for (const linea of salidaDeConfig.split(/\r?\n/)) {
    const clave = linea.split(/\s/, 1)[0] ?? "";
    if (!clave.startsWith("filter.")) continue;
    nombres.add(clave.slice("filter.".length, clave.lastIndexOf(".")));
  }
  const args: string[] = [];
  for (const nombre of nombres) {
    // Un nombre que no se puede escribir en un -c sin ambigüedad no se puede anular: se falla cerrado.
    if (!nombre || /[=\s]/.test(nombre)) throw new ErrorDeGit(mensaje("GITX-FILTRO-RARO", { dir, nombre }), "otro");
    for (const variable of ["clean", "smudge", "process"]) args.push("-c", `filter.${nombre}.${variable}=`);
    args.push("-c", `filter.${nombre}.required=false`);
  }
  return args;
}

// `git config --get-regexp` sale con 1 cuando no encuentra nada: eso no es un error.
const sinCoincidencias = (codigo: unknown): boolean => codigo === 1;

// Con un cwd que no existe, execFile da ENOENT y se confundiría con "git no está instalado".
function siNoEsCarpeta(dir: string): ErrorDeGit | null {
  return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? null : new ErrorDeGit(mensaje("GITX-NO-ES-CARPETA", { dir }), "otro");
}

// `aceptados`: los códigos de salida que son una respuesta y no un error (merge-base --is-ancestor
// contesta "no" con un 1).
function ejecutar(dir: string, args: readonly string[], aceptados: readonly number[] = []): Promise<{ stdout: string; stderr: string; codigo: number }> {
  return new Promise((resolve, reject) => {
    execFile("git", [...ARGUMENTOS_FIJOS, ...args], opcionesDe(dir), (error, stdout, stderr) => {
      const codigo = error ? Number(error.code) : 0;
      const esRespuesta = !error || (typeof error.code === "number" && (aceptados.includes(error.code) || (args === CONSULTA_DE_FILTROS && sinCoincidencias(error.code))));
      if (!esRespuesta) reject(traducirError(error!, stderr, dir));
      else resolve({ stdout, stderr, codigo });
    });
  });
}

async function conFiltrosAnulados(dir: string, args: readonly string[], aceptados: readonly number[] = []): Promise<{ stdout: string; stderr: string; codigo: number }> {
  const noEs = siNoEsCarpeta(dir);
  if (noEs) throw noEs;
  const filtros = anularFiltros((await ejecutar(dir, CONSULTA_DE_FILTROS)).stdout, dir);
  return ejecutar(dir, [...filtros, ...args], aceptados);
}

export async function git(dir: string, args: readonly string[]): Promise<string> {
  return (await conFiltrosAnulados(dir, args)).stdout;
}

function ejecutarSincrono(dir: string, args: readonly string[]): string {
  try {
    return execFileSync("git", [...ARGUMENTOS_FIJOS, ...args], { ...opcionesDe(dir), stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const fallo = error as { code?: string; status?: number; signal?: string; message: string; stderr?: string };
    if (args === CONSULTA_DE_FILTROS && sinCoincidencias(fallo.status)) return "";
    throw traducirError({ code: fallo.code, killed: fallo.signal === "SIGTERM", message: fallo.message }, String(fallo.stderr ?? ""), dir);
  }
}

// La misma puerta, síncrona: solo para `doctor`, que se ejecuta de una vez en la terminal. El servidor
// usa siempre la asíncrona, para no bloquear el resto de mensajes mientras git responde.
export function gitSincrono(dir: string, args: readonly string[]): string {
  const noEs = siNoEsCarpeta(dir);
  if (noEs) throw noEs;
  const filtros = anularFiltros(ejecutarSincrono(dir, CONSULTA_DE_FILTROS), dir);
  return ejecutarSincrono(dir, [...filtros, ...args]);
}

// ─── Commits de los lotes (Etapa 4, §6.3 del plan) ──────────────────────────
// El hash que registra un lote viene del modelo. Antes de llegar a git se valida con SHA: así no entran
// referencias (HEAD, nombres de rama), opciones (--help) ni prefijos de menos de 7 caracteres, que git
// resolvería sin quejarse (desde 4). Después de resolverCommit, el resto de consultas recibe el SHA
// completo que devolvió git, nunca el texto del modelo.
export const SHA = /^[0-9a-f]{7,40}$/i;
const SHA_COMPLETO = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/; // SHA-1, o SHA-256 en un repo que lo use

export type CommitResuelto = { ok: true; sha: string } | { ok: false; motivo: "formato" | "no-existe" | "ambiguo" };

// Sin --quiet: con él, git calla el "short object ID … is ambiguous" y un hash ambiguo salía con 1, igual
// que uno que no existe (hallazgo 3 de la auditoría de la Etapa 4). Medido en git 2.51: ambiguo, 128 con
// "is ambiguous"; inexistente, 128 con "Needed a single revision"; un árbol o un blob, 128 con "expected
// commit type". Lo que no es una respuesta sobre el hash (no es un repo, propiedad dudosa) es un error.
export function clasificarRevParse(dir: string, codigo: number, stdout: string, stderr: string): CommitResuelto {
  const completo = stdout.trim().toLowerCase();
  if (codigo === 0 && SHA_COMPLETO.test(completo)) return { ok: true, sha: completo };
  if (/is ambiguous/i.test(stderr)) return { ok: false, motivo: "ambiguo" };
  if (/not a git repository|dubious ownership/i.test(stderr)) throw traducirError({ code: codigo, message: stderr.trim() }, stderr, dir);
  return { ok: false, motivo: "no-existe" };
}

export async function resolverCommit(dir: string, sha: string): Promise<CommitResuelto> {
  if (!SHA.test(sha)) return { ok: false, motivo: "formato" };
  const { codigo, stdout, stderr } = await conFiltrosAnulados(dir, ["rev-parse", "--verify", "--end-of-options", `${sha}^{commit}`], [1, 128]);
  return clasificarRevParse(dir, codigo, stdout, stderr);
}

// merge-base --is-ancestor contesta con el código de salida: 0 sí, 1 no, y otro (128) si no pudo.
export async function esAncestroDeHead(dir: string, sha: string): Promise<{ resultado: "si" | "no" | "error"; salida: string }> {
  try {
    const { codigo, stderr } = await conFiltrosAnulados(dir, ["merge-base", "--is-ancestor", sha, "HEAD"], [1]);
    return { resultado: codigo === 0 ? "si" : "no", salida: stderr.trim() };
  } catch (error) {
    if (error instanceof ErrorDeGit && error.motivo === "otro") return { resultado: "error", salida: error.message };
    throw error;
  }
}

// Solo para el mensaje: decir en qué rama está un commit que no está en la actual.
export async function ramasQueContienen(dir: string, sha: string): Promise<string[]> {
  const salida = await git(dir, ["branch", "--contains", sha, "--format=%(refname:short)"]);
  return salida.split(/\r?\n/).map((rama) => rama.trim()).filter(Boolean);
}

// --no-show-signature: con log.showSignature en la configuración, `show` verifica la firma y ejecuta
// gpg.program, que también puede venir en .git/config.
export async function datosDeCommit(dir: string, sha: string): Promise<{ sha: string; corto: string; fecha: string; asunto: string }> {
  const salida = await git(dir, ["show", "-s", "--no-show-signature", "--format=%H%n%h%n%cI%n%s", "--abbrev=7", sha]);
  const [completo = "", corto = "", fecha = "", ...asunto] = salida.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return { sha: completo.trim(), corto: corto.trim(), fecha: fecha.trim(), asunto: asunto.join("\n").trim() };
}

// Los archivos que toca un commit, con / y tal como los guarda git. -z: sin comillas ni escapes en los
// nombres con acentos; --root: también el primer commit del repo.
export async function archivosDeCommit(dir: string, sha: string): Promise<string[]> {
  const salida = await git(dir, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "--root", sha]);
  return salida.split("\0").filter(Boolean);
}

// null si HEAD está separado (detached).
export async function ramaActual(dir: string): Promise<string | null> {
  return (await git(dir, ["branch", "--show-current"])).trim() || null;
}

// ¿El commit tiene padre? El primero del repo no, y `<sha>^` no existe (rev-parse sale con 1).
export async function tienePadre(dir: string, sha: string): Promise<boolean> {
  const { codigo } = await conFiltrosAnulados(dir, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${sha}^`], [1]);
  return codigo === 0;
}

// ¿Los commits de los lotes son, en orden, exactamente los de `<primero>^..<último>`? Si el primero es
// el commit raíz, `<primero>^` no existe: entonces se listan todos los ancestros del último (medido: la
// forma con ^ falla con 128). Los SHA llegan completos, de resolverCommit.
export async function sonConsecutivos(dir: string, shas: string[]): Promise<boolean> {
  if (shas.length === 0) return false;
  const primero = shas[0]!;
  const ultimo = shas[shas.length - 1]!;
  const rango = (await tienePadre(dir, primero)) ? [`${primero}^..${ultimo}`] : [ultimo];
  const lista = (await git(dir, ["rev-list", "--reverse", ...rango])).split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
  return lista.length === shas.length && lista.every((sha, i) => sha === shas[i]!.toLowerCase());
}

// ─── Los repos de la demo del Studio ────────────────────────────────────────
// La única escritura en git del paquete, y no la hace el servidor MCP: la demo del Studio (§7.8 del plan)
// crea sus propios repos en una carpeta nueva y hace en ellos commits reales, con autor y fecha fijos, para
// que sus SHA sean siempre los mismos. Solo vale dentro de una carpeta marcada como demo (MARCA_DE_DEMO en
// su raíz), y deja fuera la configuración global y del sistema de quien la genera: sus hooks, su
// core.autocrlf o una firma obligatoria cambiarían los SHA, o ejecutarían código. El archivo de la marca,
// que solo lleva un comentario, hace de configuración global.
export const MARCA_DE_DEMO = ".demo-mcp-phase-gate";

export function gitEnLaDemo(raizDemo: string, dir: string, args: readonly string[], cuando: { fecha: string; nombre: string; correo: string }): string {
  const marca = path.join(raizDemo, MARCA_DE_DEMO);
  if (!fs.statSync(marca, { throwIfNoEntry: false })?.isFile()) throw fallo("GITX-DEMO-NO-MARCADA", { raiz: raizDemo });
  const relativa = path.relative(path.resolve(raizDemo), path.resolve(dir));
  if (!relativa || relativa.startsWith("..") || path.isAbsolute(relativa)) throw fallo("GITX-DEMO-FUERA", { dir });
  // Ninguna GIT_* de quien la genera (GIT_DIR, GIT_TEMPLATE_DIR, GIT_CONFIG_PARAMETERS…): solo las de aquí.
  const heredado = Object.fromEntries(Object.entries(process.env).filter(([clave]) => !clave.toUpperCase().startsWith("GIT_")));
  const env = {
    ...heredado,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: marca,
    GIT_AUTHOR_NAME: cuando.nombre,
    GIT_AUTHOR_EMAIL: cuando.correo,
    GIT_AUTHOR_DATE: cuando.fecha,
    GIT_COMMITTER_NAME: cuando.nombre,
    GIT_COMMITTER_EMAIL: cuando.correo,
    GIT_COMMITTER_DATE: cuando.fecha,
    GIT_TERMINAL_PROMPT: "0",
    LC_ALL: "C",
  };
  const fijos = [...ARGUMENTOS_FIJOS, "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", "-c", `core.hooksPath=${path.join(raizDemo, ".sin-hooks")}`];
  return execFileSync("git", [...fijos, ...args], { cwd: dir, env, timeout: ESPERA_DE_GIT_MS, maxBuffer: SALIDA_MAXIMA, windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// ¿La carpeta está dentro de un repositorio de git? Cualquier otro fallo (git no instalado, propiedad
// dudosa) se lanza: no es lo mismo que "no tiene git".
export async function tieneGit(dir: string): Promise<boolean> {
  try {
    return (await git(dir, ["rev-parse", "--is-inside-work-tree"])).trim() === "true";
  } catch (error) {
    if (error instanceof ErrorDeGit && error.motivo === "no-es-repo") return false;
    throw error;
  }
}
