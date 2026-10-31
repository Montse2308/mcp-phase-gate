// The repos of a project, by their id: read a file and ask for their git state.
//
// read_cross_repo reads any folder of PHASE_GATE_REPOS_PATH by its name; these functions work with the
// repos that the project's phase-gate.json declares, and find them wherever they are on this machine
// (machine.json or <REPOS_PATH>/<dir>).

import * as path from "path";

import { git, gitSincrono } from "./git.js";
import { fallo, idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";
import { manifiestoDe, resolverRepos } from "./manifiesto.js";
import type { RepoResuelto } from "./manifiesto.js";
import { esSegmentoDeGit, estaDentroReal, leerTextoAcotado, rutaReal, validarSegmento } from "./paths.js";
import type { Idioma } from "./vocabulario.js";

export function resolverRepo(carpetaProyecto: string, id: string): RepoResuelto {
  const manifiesto = manifiestoDe(carpetaProyecto);
  const ids = manifiesto?.repos.map((repo) => repo.id) ?? [];
  if (!manifiesto || ids.length === 0) {
    throw fallo("REPOS-SIN-REPOS", { proyecto: carpetaProyecto });
  }
  const repo = manifiesto.repos.find((r) => r.id === id);
  if (!repo) throw fallo("REPOS-NO-EXISTE", { id, proyecto: carpetaProyecto, ids });

  const [resuelto] = resolverRepos(carpetaProyecto, [repo]);
  if (!resuelto!.ruta) throw fallo("REPOS-SIN-RUTA", { id, error: resuelto!.error });
  if (!resuelto!.existe) {
    throw fallo("REPOS-RUTA-NO-EXISTE", { id, proyecto: carpetaProyecto, ruta: resuelto!.ruta });
  }
  return resuelto!;
}

// ─── Reading a file of a repo ───────────────────────────────────────────────
// No .git: the rule lives in paths.ts (esSegmentoDeGit), shared with read_cross_repo.
const esDeGit = esSegmentoDeGit;

export function rutaDeArchivoDeRepo(rutaDelRepo: string, relativa: string): string {
  if (path.win32.isAbsolute(relativa) || path.posix.isAbsolute(relativa)) {
    throw fallo("REPOS-PATH-ABSOLUTA", { relativa });
  }
  const segmentos = relativa.split(/[\\/]/);
  for (const segmento of segmentos) {
    validarSegmento(segmento, "path");
    if (esDeGit(segmento)) throw fallo("REPOS-PATH-EN-GIT", { relativa });
  }

  const ruta = path.join(rutaDelRepo, ...segmentos);
  if (!estaDentroReal(rutaDelRepo, ruta)) throw fallo("REPOS-PATH-FUERA", { relativa });

  // The same rule on the already resolved path: a link inside the repo that points at .git (or a short
  // 8.3 name such as GIT~1 on Windows) must not lead to .git/config.
  const real = path.relative(rutaReal(rutaDelRepo), rutaReal(ruta));
  if (real.split(/[\\/]/).some(esDeGit)) throw fallo("REPOS-PATH-GIT-POR-ENLACE", { relativa });

  return ruta;
}

export function leerArchivoDeRepo(carpetaProyecto: string, id: string, relativa: string): string {
  return leerTextoAcotado(rutaDeArchivoDeRepo(resolverRepo(carpetaProyecto, id).ruta!, relativa));
}

// ─── Git state ──────────────────────────────────────────────────────────────
export type EstadoDeRepo = {
  id: string;
  ruta: string | null;
  existe: boolean;
  esGit: boolean;
  rama: string | null; // null if detached or not git
  separado: boolean;
  head: string | null; // 7 characters; null without commits
  adelante: number | null; // null without upstream
  atras: number | null;
  limpio: boolean | null;
  cambios: number; // lines 1, 2 and u
  sinSeguimiento: number; // lines ?
  error: string | null;
};

// `git status --porcelain=v2 --branch`: "# branch.*" headers and one line per file. It is a stable format
// for machines, and it does not depend on git's language.
export function parsearStatus(salida: string): Pick<EstadoDeRepo, "rama" | "separado" | "head" | "adelante" | "atras" | "limpio" | "cambios" | "sinSeguimiento"> {
  let rama: string | null = null;
  let separado = false;
  let head: string | null = null;
  let adelante: number | null = null;
  let atras: number | null = null;
  let cambios = 0;
  let sinSeguimiento = 0;

  for (const linea of salida.replace(/\r\n/g, "\n").split("\n")) {
    if (linea.startsWith("# branch.oid ")) {
      const oid = linea.slice("# branch.oid ".length).trim();
      head = oid === "(initial)" ? null : oid.slice(0, 7);
    } else if (linea.startsWith("# branch.head ")) {
      const nombre = linea.slice("# branch.head ".length).trim();
      separado = nombre === "(detached)";
      rama = separado ? null : nombre;
    } else if (linea.startsWith("# branch.ab ")) {
      const ab = linea.match(/^# branch\.ab \+(\d+) -(\d+)/);
      if (ab) {
        adelante = Number(ab[1]);
        atras = Number(ab[2]);
      }
    } else if (/^[12u] /.test(linea)) {
      cambios++;
    } else if (linea.startsWith("? ")) {
      sinSeguimiento++;
    }
  }

  return { rama, separado, head, adelante, atras, limpio: cambios === 0 && sinSeguimiento === 0, cambios, sinSeguimiento };
}

const ARGUMENTOS_DE_STATUS = ["status", "--porcelain=v2", "--branch", "--untracked-files=normal"];

function conResultado(base: EstadoDeRepo, salida: string | null, error: unknown): EstadoDeRepo {
  if (salida !== null) return { ...base, esGit: true, ...parsearStatus(salida) };
  const motivo = (error as { motivo?: string }).motivo;
  if (motivo === "no-es-repo") return base;
  return { ...base, error: error instanceof Error ? error.message : String(error) };
}

// The synchronous version, for the diagnosis. Same gate, same flags.
export function estadoDeRepoSincrono(repo: RepoResuelto): EstadoDeRepo {
  const base = estadoBase(repo);
  if (!repo.ruta || !repo.existe) return base;
  try {
    return conResultado(base, gitSincrono(repo.ruta, ARGUMENTOS_DE_STATUS), null);
  } catch (error) {
    return conResultado(base, null, error);
  }
}

export async function estadoDeRepo(repo: RepoResuelto): Promise<EstadoDeRepo> {
  const base = estadoBase(repo);
  if (!repo.ruta || !repo.existe) return base;
  try {
    return conResultado(base, await git(repo.ruta, ARGUMENTOS_DE_STATUS), null);
  } catch (error) {
    return conResultado(base, null, error);
  }
}

function estadoBase(repo: RepoResuelto): EstadoDeRepo {
  return {
    id: repo.id,
    ruta: repo.ruta,
    existe: repo.existe,
    esGit: false,
    rama: null,
    separado: false,
    head: null,
    adelante: null,
    atras: null,
    limpio: null,
    cambios: 0,
    sinSeguimiento: 0,
    error: repo.ruta ? null : repo.error,
  };
}

// The state of several repos at once, without blocking the server: in parallel and with a shared deadline.
// What does not answer in time stays null (git carries on, with its own limit of 10 s).
export const PLAZO_DE_ESTADOS_MS = 3000;

export async function estadosConPlazo(repos: readonly RepoResuelto[], plazoMs: number = PLAZO_DE_ESTADOS_MS): Promise<(EstadoDeRepo | null)[]> {
  if (repos.length === 0) return [];
  let temporizador: NodeJS.Timeout | undefined;
  const vencido = new Promise<null>((resolver) => {
    temporizador = setTimeout(() => resolver(null), plazoMs);
    temporizador.unref();
  });
  try {
    return await Promise.all(repos.map((repo) => Promise.race([estadoDeRepo(repo), vencido])));
  } finally {
    clearTimeout(temporizador);
  }
}

// For the chat: "`api`: branch feat/x · a1b2c3d · 2 ahead · clean tree".
export function lineaDeEstado(e: EstadoDeRepo): string {
  const nombre = `\`${e.id}\``;
  if (!e.ruta) return mensaje("REPOS-LINEA-SIN-RUTA", { nombre, error: e.error });
  if (!e.existe) return mensaje("REPOS-LINEA-NO-EXISTE", { nombre, ruta: e.ruta });
  if (e.error) return `${nombre}: ${e.error}`;
  if (!e.esGit) return mensaje("REPOS-LINEA-NO-ES-GIT", { nombre, ruta: e.ruta });

  const partes = [
    e.separado ? mensaje("REPOS-LINEA-SEPARADO") : mensaje("REPOS-LINEA-RAMA", { rama: e.rama }),
    e.head ?? mensaje("REPOS-LINEA-SIN-COMMITS"),
  ];
  if (e.adelante) partes.push(mensaje("REPOS-LINEA-ADELANTE", { n: e.adelante }));
  if (e.atras) partes.push(mensaje("REPOS-LINEA-ATRAS", { n: e.atras }));
  if (e.limpio) {
    partes.push(mensaje("REPOS-ARBOL-LIMPIO"));
  } else {
    if (e.cambios) partes.push(mensaje("REPOS-CAMBIOS-SIN-COMMIT", { n: e.cambios }));
    if (e.sinSeguimiento) partes.push(mensaje("REPOS-LINEA-SIN-SEGUIMIENTO", { n: e.sinSeguimiento }));
  }
  return `${nombre}: ${partes.join(" · ")}`;
}

// The git column of the project-configuration block: " · git · branch `feat/x` · clean tree".
// null if it is not known (an error, or it did not arrive in time): the column is left out.
// It goes inside a prompt, so it is written in the language of the PROJECT. Without `idioma`, the one of
// the call, which in get_phase_prompt is already the project's (the server sets it when resolving it).
export function columnaDeConfiguracion(e: EstadoDeRepo, idioma: Idioma = idiomaDeMensajes()): string | null {
  if (e.error || !e.existe) return null;
  if (!e.esGit) return mensaje("REPOS-COLUMNA-SIN-GIT", {}, idioma);
  const donde = e.separado ? mensaje("REPOS-COLUMNA-SEPARADO", { head: e.head ?? "?" }, idioma) : mensaje("REPOS-COLUMNA-RAMA", { rama: e.rama }, idioma);
  const total = e.cambios + e.sinSeguimiento;
  const arbol = e.limpio ? mensaje("REPOS-ARBOL-LIMPIO", {}, idioma) : mensaje("REPOS-CAMBIOS-SIN-COMMIT", { n: total }, idioma);
  return ` · git · ${donde} · ${arbol}`;
}
