// The only door to git, and read-only for the MCP server. (The only write, gitEnLaDemo, is the one of the
// Studio's demo in its own temporary repos: see the end.)
//
// The server never writes to git: the commits are made by the agent with its terminal. But even reading has
// effects if one is not careful: `git status` can rewrite the index and take index.lock (and get in the way
// of a commit the agent is making at the same time), and if the repo configures core.fsmonitor, git RUNS
// that command. A repo cloned from anywhere could bring it. That is why every call goes through here, with:
//   - `-c core.fsmonitor=false` in front of everything, and every .gitattributes filter cancelled (see below);
//   - GIT_OPTIONAL_LOCKS=0, so that status takes no optional locks;
//   - GIT_TERMINAL_PROMPT=0, so that nothing is left waiting for a password;
//   - LC_ALL=C, so that the error messages do not depend on the machine's language;
//   - execFile, without a shell, with arguments that are constants of the code: no text that comes from the
//     model reaches git's command line, except the hash of a batch: first it goes through SHA (hexadecimal
//     only) and it goes after --end-of-options, and the following queries use the full SHA that git returned.

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

// A git error put for a person, with what they have to do.
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

// The same options for both variants: that is what makes this a single door.
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

// The .gitattributes filters (`filter.<name>.clean`, `.smudge`, `.process`) are also commands that git runs:
// `git status` passes through the clean filter a file whose date changed, and since GIT_OPTIONAL_LOCKS=0 does
// not refresh the index, it would do so on every call. A tampered `.git/config` could bring one, just like a
// core.fsmonitor. Reading the configuration runs nothing, so the names of the defined drivers are read first
// (in any scope) and each one is cancelled with -c. Checked with a positive control on git 2.51: with the
// empty value, neither clean nor process runs.
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
    // A name that cannot be written in a -c without ambiguity cannot be cancelled: it fails closed.
    if (!nombre || /[=\s]/.test(nombre)) throw new ErrorDeGit(mensaje("GITX-FILTRO-RARO", { dir, nombre }), "otro");
    for (const variable of ["clean", "smudge", "process"]) args.push("-c", `filter.${nombre}.${variable}=`);
    args.push("-c", `filter.${nombre}.required=false`);
  }
  return args;
}

// `git config --get-regexp` exits with 1 when it finds nothing: that is not an error.
const sinCoincidencias = (codigo: unknown): boolean => codigo === 1;

// With a cwd that does not exist, execFile gives ENOENT and it would be mistaken for "git is not installed".
function siNoEsCarpeta(dir: string): ErrorDeGit | null {
  return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? null : new ErrorDeGit(mensaje("GITX-NO-ES-CARPETA", { dir }), "otro");
}

// `aceptados`: the exit codes that are an answer and not an error (merge-base --is-ancestor answers "no"
// with a 1).
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

// The same door, synchronous: only for `doctor`, which runs at once in the terminal. The server always uses
// the asynchronous one, so as not to block the rest of the messages while git answers.
export function gitSincrono(dir: string, args: readonly string[]): string {
  const noEs = siNoEsCarpeta(dir);
  if (noEs) throw noEs;
  const filtros = anularFiltros(ejecutarSincrono(dir, CONSULTA_DE_FILTROS), dir);
  return ejecutarSincrono(dir, [...filtros, ...args]);
}

// ─── Commits of the batches ─────────────────────────────────────────────────
// The hash that a batch records comes from the model. Before reaching git it is validated with SHA: so that
// no references (HEAD, branch names), options (--help) or prefixes of fewer than 7 characters get in, which
// git would resolve without complaint from 4 characters on. After resolverCommit, the rest of the queries
// receive the full SHA that git returned, never the model's text.
export const SHA = /^[0-9a-f]{7,40}$/i;
const SHA_COMPLETO = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/; // SHA-1, or SHA-256 in a repo that uses it

export type CommitResuelto = { ok: true; sha: string } | { ok: false; motivo: "formato" | "no-existe" | "ambiguo" };

// Without --quiet: with it, git silences the "short object ID … is ambiguous" and an ambiguous hash came out
// with 1, the same as one that does not exist. Measured on git 2.51: ambiguous, 128 with "is ambiguous";
// nonexistent, 128 with "Needed a single revision"; a tree or a blob, 128 with "expected commit type". What
// is not an answer about the hash (not a repo, dubious ownership) is an error.
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

// merge-base --is-ancestor answers with the exit code: 0 yes, 1 no, and another (128) if it could not.
export async function esAncestroDeHead(dir: string, sha: string): Promise<{ resultado: "si" | "no" | "error"; salida: string }> {
  try {
    const { codigo, stderr } = await conFiltrosAnulados(dir, ["merge-base", "--is-ancestor", sha, "HEAD"], [1]);
    return { resultado: codigo === 0 ? "si" : "no", salida: stderr.trim() };
  } catch (error) {
    if (error instanceof ErrorDeGit && error.motivo === "otro") return { resultado: "error", salida: error.message };
    throw error;
  }
}

// Only for the message: to say which branch a commit that is not on the current one is on.
export async function ramasQueContienen(dir: string, sha: string): Promise<string[]> {
  const salida = await git(dir, ["branch", "--contains", sha, "--format=%(refname:short)"]);
  return salida.split(/\r?\n/).map((rama) => rama.trim()).filter(Boolean);
}

// `%ct` is the commit date in seconds since the Unix epoch: formatting it here — instead of letting git
// write `%cI` — keeps the result identical to the second, in UTC and ending in Z, whatever git version and
// whatever timezone stored the commit. `toISOString` would add milliseconds; the slice drops them.
function isoDeUnix(segundos: string): string {
  if (!segundos) return "";
  const instante = Number(segundos) * 1000;
  if (!Number.isFinite(instante)) return "";
  const fecha = new Date(instante);
  if (Number.isNaN(fecha.getTime())) return "";
  const texto = fecha.toISOString();
  // Outside years 0000-9999 Date writes "+010000-…", which is not YYYY-MM-DDTHH:MM:SSZ: there is no
  // canonical text for that instant, so it is left empty instead of making one up.
  return /^\d{4}-\d{2}-\d{2}T/.test(texto) ? texto.slice(0, 19) + "Z" : "";
}

// --no-show-signature: with log.showSignature in the configuration, `show` verifies the signature and runs
// gpg.program, which can also come from .git/config.
export async function datosDeCommit(dir: string, sha: string): Promise<{ sha: string; corto: string; fecha: string; asunto: string }> {
  const salida = await git(dir, ["show", "-s", "--no-show-signature", "--format=%H%n%h%n%ct%n%s", "--abbrev=7", sha]);
  const [completo = "", corto = "", segundos = "", ...asunto] = salida.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return { sha: completo.trim(), corto: corto.trim(), fecha: isoDeUnix(segundos.trim()), asunto: asunto.join("\n").trim() };
}

// The files a commit touches, with / and as git stores them. -z: no quotes or escapes in names with accents;
// --root: also the first commit of the repo.
export async function archivosDeCommit(dir: string, sha: string): Promise<string[]> {
  const salida = await git(dir, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "--root", sha]);
  return salida.split("\0").filter(Boolean);
}

// null if HEAD is detached.
export async function ramaActual(dir: string): Promise<string | null> {
  return (await git(dir, ["branch", "--show-current"])).trim() || null;
}

// Does the commit have a parent? The first one of the repo does not, and `<sha>^` does not exist (rev-parse exits with 1).
export async function tienePadre(dir: string, sha: string): Promise<boolean> {
  const { codigo } = await conFiltrosAnulados(dir, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${sha}^`], [1]);
  return codigo === 0;
}

// Are the commits of the batches, in order, exactly those of `<first>^..<last>`? If the first is the root
// commit, `<first>^` does not exist: then all the ancestors of the last one are listed (measured: the form
// with ^ fails with 128). The SHAs arrive complete, from resolverCommit.
export async function sonConsecutivos(dir: string, shas: string[]): Promise<boolean> {
  if (shas.length === 0) return false;
  const primero = shas[0]!;
  const ultimo = shas[shas.length - 1]!;
  const rango = (await tienePadre(dir, primero)) ? [`${primero}^..${ultimo}`] : [ultimo];
  const lista = (await git(dir, ["rev-list", "--reverse", ...rango])).split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
  return lista.length === shas.length && lista.every((sha, i) => sha === shas[i]!.toLowerCase());
}

// ─── The repos of the Studio's demo ─────────────────────────────────────────
// The only git write of the package, and the MCP server does not do it: the Studio's demo creates its own
// repos in a new folder and makes real commits in them, with a fixed author and date, so that their SHAs are
// always the same. It is only valid inside a folder marked as a demo (MARCA_DE_DEMO at its root), and it
// leaves out the global and system configuration of whoever generates it: their hooks, their core.autocrlf
// or a mandatory signature would change the SHAs, or run code. The mark file, which only holds a comment,
// acts as the global configuration.
export const MARCA_DE_DEMO = ".demo-mcp-phase-gate";

export function gitEnLaDemo(raizDemo: string, dir: string, args: readonly string[], cuando: { fecha: string; nombre: string; correo: string }): string {
  const marca = path.join(raizDemo, MARCA_DE_DEMO);
  if (!fs.statSync(marca, { throwIfNoEntry: false })?.isFile()) throw fallo("GITX-DEMO-NO-MARCADA", { raiz: raizDemo });
  const relativa = path.relative(path.resolve(raizDemo), path.resolve(dir));
  if (!relativa || relativa.startsWith("..") || path.isAbsolute(relativa)) throw fallo("GITX-DEMO-FUERA", { dir });
  // No GIT_* of whoever generates it (GIT_DIR, GIT_TEMPLATE_DIR, GIT_CONFIG_PARAMETERS…): only the ones from here.
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
  // The demo is ephemeral: git's auto-maintenance is disabled so a commit does not leave a
  // `git maintenance run --auto` writing into the folder after it returns (racing with its removal).
  const fijos = [...ARGUMENTOS_FIJOS, "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", "-c", "maintenance.auto=false", "-c", "gc.auto=0", "-c", `core.hooksPath=${path.join(raizDemo, ".sin-hooks")}`];
  return execFileSync("git", [...fijos, ...args], { cwd: dir, env, timeout: ESPERA_DE_GIT_MS, maxBuffer: SALIDA_MAXIMA, windowsHide: true, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Is the folder inside a git repository? Any other failure (git not installed, dubious ownership) is
// thrown: it is not the same as "it has no git".
export async function tieneGit(dir: string): Promise<boolean> {
  try {
    return (await git(dir, ["rev-parse", "--is-inside-work-tree"])).trim() === "true";
  } catch (error) {
    if (error instanceof ErrorDeGit && error.motivo === "no-es-repo") return false;
    throw error;
  }
}
