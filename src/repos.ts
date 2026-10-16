// Los repos de un proyecto, por su id: leer un archivo y preguntar su estado de git.
//
// read_cross_repo lee cualquier carpeta de PHASE_GATE_REPOS_PATH por su nombre; estas funciones
// trabajan con los repos que declara el phase-gate.json del proyecto, y los encuentran donde estén en
// este equipo (machine.json o <REPOS_PATH>/<dir>).

import * as path from "path";

import { git, gitSincrono } from "./git.js";
import { manifiestoDe, resolverRepos } from "./manifiesto.js";
import type { RepoResuelto } from "./manifiesto.js";
import { esSegmentoDeGit, estaDentroReal, leerTextoAcotado, rutaReal, validarSegmento } from "./paths.js";

export function resolverRepo(carpetaProyecto: string, id: string): RepoResuelto {
  const manifiesto = manifiestoDe(carpetaProyecto);
  const ids = manifiesto?.repos.map((repo) => repo.id) ?? [];
  if (!manifiesto || ids.length === 0) {
    throw new Error(
      `El proyecto ${carpetaProyecto} no declara repos en su phase-gate.json. Para leer cualquier carpeta de ` +
        `PHASE_GATE_REPOS_PATH, usa read_cross_repo.`
    );
  }
  const repo = manifiesto.repos.find((r) => r.id === id);
  if (!repo) throw new Error(`No existe el repo "${id}" en el phase-gate.json de ${carpetaProyecto}. Los repos son: ${ids.join(", ")}.`);

  const [resuelto] = resolverRepos(carpetaProyecto, [repo]);
  if (!resuelto!.ruta) throw new Error(`No se pudo resolver la ruta del repo "${id}": ${resuelto!.error}`);
  if (!resuelto!.existe) {
    throw new Error(
      `El repo "${id}" de ${carpetaProyecto} apunta a "${resuelto!.ruta}", que no existe en este equipo. Corrige su ` +
        `dir en phase-gate.json, o su ruta en machine.json ("${carpetaProyecto}/${id}").`
    );
  }
  return resuelto!;
}

// ─── Leer un archivo de un repo ─────────────────────────────────────────────
// Nada de .git: la regla vive en paths.ts (esSegmentoDeGit), compartida con read_cross_repo.
const esDeGit = esSegmentoDeGit;

export function rutaDeArchivoDeRepo(rutaDelRepo: string, relativa: string): string {
  if (path.win32.isAbsolute(relativa) || path.posix.isAbsolute(relativa)) {
    throw new Error(`\`path\` no puede ser una ruta absoluta ("${relativa}"): es relativa a la raíz del repo.`);
  }
  const segmentos = relativa.split(/[\\/]/);
  for (const segmento of segmentos) {
    validarSegmento(segmento, "path");
    if (esDeGit(segmento)) throw new Error(`\`path\` no puede entrar en .git ni leer archivos de git ("${relativa}").`);
  }

  const ruta = path.join(rutaDelRepo, ...segmentos);
  if (!estaDentroReal(rutaDelRepo, ruta)) throw new Error(`Acceso denegado: \`path\` "${relativa}" queda fuera del repositorio.`);

  // La misma regla sobre la ruta ya resuelta: un enlace dentro del repo que apunte a .git (o un
  // nombre corto 8.3 como GIT~1 en Windows) no puede llevar a .git/config.
  const real = path.relative(rutaReal(rutaDelRepo), rutaReal(ruta));
  if (real.split(/[\\/]/).some(esDeGit)) throw new Error(`Acceso denegado: \`path\` "${relativa}" lleva a .git a través de un enlace.`);

  return ruta;
}

export function leerArchivoDeRepo(carpetaProyecto: string, id: string, relativa: string): string {
  return leerTextoAcotado(rutaDeArchivoDeRepo(resolverRepo(carpetaProyecto, id).ruta!, relativa));
}

// ─── Estado de git ──────────────────────────────────────────────────────────
export type EstadoDeRepo = {
  id: string;
  ruta: string | null;
  existe: boolean;
  esGit: boolean;
  rama: string | null; // null si está separado (detached) o no es git
  separado: boolean;
  head: string | null; // 7 caracteres; null sin commits
  adelante: number | null; // null sin upstream
  atras: number | null;
  limpio: boolean | null;
  cambios: number; // líneas 1, 2 y u
  sinSeguimiento: number; // líneas ?
  error: string | null;
};

// `git status --porcelain=v2 --branch`: cabeceras "# branch.*" y una línea por archivo. Es un formato
// estable para máquinas, que no depende del idioma de git.
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

// La versión síncrona, para el diagnóstico. Misma puerta, mismas banderas.
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

// El estado de varios repos a la vez, sin bloquear al servidor: en paralelo y con un plazo común. Lo
// que no responde a tiempo queda en null (el git sigue su curso, con su propio plazo de 10 s).
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

// Para el chat: "`api`: rama feat/x · a1b2c3d · 2 adelante · árbol limpio".
export function lineaDeEstado(e: EstadoDeRepo): string {
  const nombre = `\`${e.id}\``;
  if (!e.ruta) return `${nombre}: sin ruta (${e.error ?? "no se pudo resolver"})`;
  if (!e.existe) return `${nombre}: \`${e.ruta}\` no existe en este equipo`;
  if (e.error) return `${nombre}: ${e.error}`;
  if (!e.esGit) return `${nombre}: \`${e.ruta}\` no es un repositorio de git`;

  const partes = [e.separado ? "separado (detached)" : `rama ${e.rama}`, e.head ?? "sin commits"];
  if (e.adelante) partes.push(`${e.adelante} adelante`);
  if (e.atras) partes.push(`${e.atras} atrás`);
  if (e.limpio) {
    partes.push("árbol limpio");
  } else {
    if (e.cambios) partes.push(`${e.cambios} ${e.cambios === 1 ? "cambio" : "cambios"} sin commit`);
    if (e.sinSeguimiento) partes.push(`${e.sinSeguimiento} sin seguimiento`);
  }
  return `${nombre}: ${partes.join(" · ")}`;
}

// La columna de git del bloque CONFIGURACIÓN DEL PROYECTO: " · git · rama `feat/x` · árbol limpio".
// null si no se sabe (error, o no llegó a tiempo): la columna se omite.
export function columnaDeConfiguracion(e: EstadoDeRepo): string | null {
  if (e.error || !e.existe) return null;
  if (!e.esGit) return " · sin git";
  const donde = e.separado ? `separado en \`${e.head ?? "?"}\`` : `rama \`${e.rama}\``;
  const total = e.cambios + e.sinSeguimiento;
  const arbol = e.limpio ? "árbol limpio" : `${total} ${total === 1 ? "cambio" : "cambios"} sin commit`;
  return ` · git · ${donde} · ${arbol}`;
}
