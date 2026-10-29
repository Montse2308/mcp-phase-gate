// La demo del Studio (§7.8 del plan): un árbol completo de Documentación, repos, estado y configuración,
// generado EJECUTANDO las funciones reales (record_batch por registrarLote, switch_task por
// guardarPuntero) sobre carpetas nuevas, con git de verdad. Así no se queda atrás del producto: si el
// formato de un recibo cambia, la demo cambia con él.
//
// Es determinista: commits con autor y fecha fijos (gitEnLaDemo), un reloj que avanza una hora por paso
// desde 2026-03-02T10:00:00Z, la fecha de cada archivo fijada a la de su paso, y la zona horaria en UTC
// mientras se genera (los recibos guardan la fecha local). Dos generaciones, en dos carpetas y en dos
// procesos, dan los mismos SHA y los mismos bytes.
//
// Los textos viven en test/fixtures/demo/<idioma>/ (en el paquete publicado, copiados a build/studio/demo/):
// son de ejemplo, sin datos de ningún proyecto real. Desde la Etapa 6 hay dos demos con la misma historia
// (§8.7): TIENDA, ASISTENTE e INVESTIGACION en español; SHOP, ASSISTANT y RESEARCH en inglés. Cada una con
// sus repos, sus commits y sus fechas fijas: los SHA difieren entre idiomas, pero cada demo es determinista.

import { randomBytes } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

import { SERVER_VERSION, raizPaquete } from "../config.js";
import { MARCA_DE_DEMO, gitEnLaDemo } from "../git.js";
import { mensaje } from "../i18n/mensajes.js";
import { registrarLote } from "../lotes.js";
import type { EntradaDeLote } from "../lotes.js";
import type { EntornoInit } from "../init.js";
import { URL_ESQUEMA_PROYECTO } from "../manifiesto.js";
import { requireProjectFolder } from "../paths.js";
import { guardarPuntero } from "../tasks.js";
import type { Idioma } from "../vocabulario.js";

export { MARCA_DE_DEMO };

type Lote = {
  lote: number;
  repo: string;
  titulo: string;
  archivos: Record<string, string>;
  mensaje?: string;
  sinCommit?: boolean;
  artefacto?: string;
  que_se_hizo: string;
  verificacion: string;
  espera_al_usuario?: { prueba: string; esperado: string }[];
};
type Tarea = { nombre: string; documentos: string[]; lotes: Lote[]; cerrar?: { motivo_descarte: string }; despues?: string[] };
type Proyecto = { nombre: string; manifiesto: Record<string, unknown>; repos: Record<string, { git: boolean; archivos: Record<string, string> }>; activa: string; tareas: Tarea[] };
type Guion = { inicio: string; autor: { nombre: string; correo: string }; proyectos: Proyecto[] };

export type CarpetasDeDemo = { raiz: string; docs: string; repos: string; estado: string; config: string; casa: string; idioma: Idioma };

// Lo que cambia de un idioma a otro fuera de los textos de demo.json: la subcarpeta de las tareas (una demo
// en inglés con "Proyectos" desentonaría; así se ve además que es configurable), el mensaje del primer
// commit de cada repo y cómo se describe un archivo cambiado en la tabla de un recibo.
const DEL_IDIOMA: Record<Idioma, { subcarpeta: string; primerCommit: string; cambio: string }> = {
  es: { subcarpeta: "Proyectos", primerCommit: "chore: estado inicial", cambio: "modificado" },
  en: { subcarpeta: "Projects", primerCommit: "chore: initial state", cambio: "changed" },
};

// La marca dice qué versión y qué idioma generaron la demo, para que `ui --demo` sepa si puede reutilizarla.
// Es también la configuración global de git mientras se genera (gitEnLaDemo): un comentario, que git ignora.
// La de español es la de siempre, byte a byte.
export function textoDeLaMarca(idioma: Idioma = "es"): string {
  return idioma === "es"
    ? `# Demo del Studio de mcp-phase-gate ${SERVER_VERSION}. Es una carpeta temporal: se puede borrar.\n`
    : `# mcp-phase-gate Studio demo ${SERVER_VERSION} (en). It is a temporary folder: it can be deleted.\n`;
}

export function carpetasDeDemo(raiz: string, idioma: Idioma = "es"): CarpetasDeDemo {
  return { raiz, docs: path.join(raiz, "docs"), repos: path.join(raiz, "repos"), estado: path.join(raiz, "estado"), config: path.join(raiz, "config"), casa: path.join(raiz, "casa"), idioma };
}

// Dónde están los textos de un idioma: junto al módulo compilado (build/studio/demo/<idioma>/, en el paquete)
// o en el repo (test/fixtures/demo/<idioma>/, al desarrollar y en los tests).
export function carpetaDeTextos(idioma: Idioma = "es"): string {
  const junto = path.join(path.dirname(fileURLToPath(import.meta.url)), "demo", idioma);
  if (fs.existsSync(path.join(junto, "demo.json"))) return junto;
  return path.join(raizPaquete(), "test", "fixtures", "demo", idioma);
}

const sinCR = (texto: string): string => texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

// Las PHASE_GATE_* que usan las funciones del servidor, apuntando a la demo. Mientras se genera, todo lo
// demás del entorno (los alias ORQUESTADOR_*, una capa de prompts propia, un GIT_DIR) queda fuera.
export function entornoDeDemo(c: CarpetasDeDemo): Record<string, string> {
  return {
    PHASE_GATE_DOCS_PATH: c.docs,
    PHASE_GATE_REPOS_PATH: c.repos,
    PHASE_GATE_STATE_PATH: c.estado,
    PHASE_GATE_CONFIG_PATH: c.config,
    PHASE_GATE_TASKS_SUBDIR: DEL_IDIOMA[c.idioma].subcarpeta,
  };
}

// También las GIT_*: gitEnLaDemo ya las deja fuera de sus commits, pero las lecturas de git del servidor
// (registrarLote comprueba el repo y el commit) las heredan del proceso, y un GIT_DIR las llevaría a otro
// repo.
const PREFIJOS = ["PHASE_GATE_", "ORQUESTADOR_", "GIT_"];

// Con un entorno prestado: se quita lo que el servidor leería de quien ejecuta y se pone el de la demo; al
// terminar se devuelve exactamente lo que había.
async function conEntorno<T>(env: Record<string, string>, hacer: () => Promise<T>): Promise<T> {
  const antes = { ...process.env };
  for (const clave of Object.keys(process.env)) if (PREFIJOS.some((p) => clave.toUpperCase().startsWith(p))) delete process.env[clave];
  Object.assign(process.env, env, { TZ: "UTC" });
  try {
    return await hacer();
  } finally {
    for (const clave of Object.keys(process.env)) if (!(clave in antes)) delete process.env[clave];
    Object.assign(process.env, antes);
    if (antes.TZ === undefined) delete process.env.TZ;
  }
}

// Todo lo que se hace sobre una demo sin que dependa de quien lo hace: generarla, y leerla para el export
// estático. Además de las PHASE_GATE_* de la demo, las lecturas de git del servidor (el asunto y la fecha de
// cada commit que guarda el recibo) usan, como los commits, la marca como configuración global y ninguna del
// sistema: un i18n.commitEncoding de quien la genera cambiaría la codificación del asunto, y con ella los
// bytes de los recibos.
// `extra`: more variables for that reading; the export sets PHASE_GATE_LANG so that the language Ajustes says it
// uses is the one of the data set and not the one of the system of whoever exports.
export function conEntornoDeDemo<T>(c: CarpetasDeDemo, hacer: () => Promise<T>, extra: Record<string, string> = {}): Promise<T> {
  return conEntorno({ ...entornoDeDemo(c), GIT_CONFIG_GLOBAL: path.join(c.raiz, MARCA_DE_DEMO), GIT_CONFIG_NOSYSTEM: "1", ...extra }, hacer);
}

function escribir(ruta: string, texto: string, fecha: Date): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, texto, "utf-8");
  fs.utimesSync(ruta, fecha, fecha);
}

// Todas las carpetas, de las más hondas a la raíz, con la última fecha: la fecha de una carpeta no puede
// depender de cuándo se generó.
function fijarCarpetas(raiz: string, fecha: Date): void {
  const recorrer = (carpeta: string): void => {
    for (const e of fs.readdirSync(carpeta, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== ".git") recorrer(path.join(carpeta, e.name));
    }
    fs.utimesSync(carpeta, fecha, fecha);
  };
  recorrer(raiz);
}

export async function generarDemo(destino: string, idioma: Idioma = "es"): Promise<CarpetasDeDemo> {
  if (fs.existsSync(destino) && fs.readdirSync(destino).length) throw new Error(mensaje("DEMO-NO-VACIA", { destino }));
  const c = carpetasDeDemo(destino, idioma);
  const delIdioma = DEL_IDIOMA[idioma];
  fs.mkdirSync(destino, { recursive: true, mode: 0o700 });
  for (const carpeta of [c.docs, c.repos, c.estado, c.config, c.casa]) fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(destino, MARCA_DE_DEMO), textoDeLaMarca(idioma), "utf-8");

  const textos = carpetaDeTextos(idioma);
  const guion = JSON.parse(fs.readFileSync(path.join(textos, "demo.json"), "utf-8")) as Guion;
  let momento = Date.parse(guion.inicio);
  const paso = (): Date => {
    const fecha = new Date(momento);
    momento += 3_600_000;
    return fecha;
  };
  const git = (dir: string, args: string[], fecha: Date): string => gitEnLaDemo(destino, dir, args, { fecha: fecha.toISOString(), ...guion.autor });

  await conEntornoDeDemo(c, async () => {
    for (const p of guion.proyectos) {
      const carpetaProyecto = path.join(c.docs, p.nombre);
      fs.mkdirSync(path.join(carpetaProyecto, delIdioma.subcarpeta), { recursive: true });
      escribir(path.join(carpetaProyecto, "phase-gate.json"), `${JSON.stringify({ $schema: URL_ESQUEMA_PROYECTO, ...p.manifiesto }, null, 2)}\n`, paso());

      // Los repos, con sus archivos de partida y, si tienen git, un primer commit.
      const dirs = new Map<string, string>();
      for (const repo of (p.manifiesto.repos as { id: string; dir: string }[] | undefined) ?? []) {
        const dir = path.join(c.repos, repo.dir);
        dirs.set(repo.id, dir);
        const datos = p.repos[repo.id]!;
        const fecha = paso();
        for (const [archivo, texto] of Object.entries(datos.archivos)) escribir(path.join(dir, archivo), texto, fecha);
        if (datos.git) {
          git(dir, ["init", "-q", "--template="], fecha);
          git(dir, ["add", "--", ...Object.keys(datos.archivos)], fecha);
          git(dir, ["commit", "-q", "-m", delIdioma.primerCommit], fecha);
        }
      }

      for (const t of p.tareas) {
        const carpetaTarea = path.join(carpetaProyecto, delIdioma.subcarpeta, t.nombre);
        for (const documento of t.documentos) escribir(path.join(carpetaTarea, documento), sinCR(fs.readFileSync(path.join(textos, p.nombre, t.nombre, documento), "utf-8")), paso());

        // Cada lote, con record_batch (registrarLote): el commit primero, si lo hay, y su recibo con el reloj
        // de la demo.
        for (const l of t.lotes) {
          const dir = dirs.get(l.repo)!;
          const fecha = paso();
          for (const [archivo, texto] of Object.entries(l.archivos)) escribir(path.join(dir, archivo), texto, fecha);
          const conGit = p.repos[l.repo]!.git;
          const entrada: EntradaDeLote = {
            lote: l.lote,
            repo: l.repo,
            titulo: l.titulo,
            estado: "verificado",
            que_se_hizo: l.que_se_hizo,
            archivos: Object.keys(l.archivos).map((archivo) => ({ archivo, cambio: delIdioma.cambio })),
            verificacion: l.verificacion,
            ...(l.espera_al_usuario ? { espera_al_usuario: l.espera_al_usuario } : {}),
          };
          if (conGit && !l.sinCommit) {
            git(dir, ["add", "--", ...Object.keys(l.archivos)], fecha);
            git(dir, ["commit", "-q", "-m", l.mensaje ?? l.titulo], fecha);
            entrada.commit = git(dir, ["rev-parse", "HEAD"], fecha).trim();
          } else if (!conGit && l.artefacto) {
            entrada.artifact_path = l.artefacto;
          }
          const registro = paso();
          await registrarLote(requireProjectFolder(p.nombre), t.nombre, entrada, { ahora: () => registro });
          fijarRecibos(carpetaTarea, registro);
        }

        if (t.cerrar) {
          const registro = paso();
          const ultimo = Math.max(0, ...t.lotes.map((l) => l.lote)) + 1;
          await registrarLote(requireProjectFolder(p.nombre), t.nombre, { lote: ultimo, cerrar_fase: true, motivo_descarte: t.cerrar.motivo_descarte }, { ahora: () => registro, confirmar: async () => ({ estado: "confirmada" }) });
          fijarRecibos(carpetaTarea, registro);
        }
        for (const documento of t.despues ?? []) escribir(path.join(carpetaTarea, documento), sinCR(fs.readFileSync(path.join(textos, p.nombre, t.nombre, documento), "utf-8")), paso());
      }
      guardarPuntero(p.nombre, p.activa);
    }
  });

  const final = paso();
  const punteros = path.join(c.estado, "active-tasks.json");
  if (fs.existsSync(punteros)) fs.utimesSync(punteros, final, final);
  fs.utimesSync(path.join(destino, MARCA_DE_DEMO), final, final);
  fijarCarpetas(destino, final);
  return c;
}

// Lo que acaba de escribir registrarLote (el recibo, y el documento de la fase si la cerró) lleva la fecha
// del paso. Se mira todo lo que cambió desde el principio del paso: el resto ya tenía su fecha.
function fijarRecibos(carpetaTarea: string, fecha: Date): void {
  const candidatos = [carpetaTarea, ...fs.readdirSync(carpetaTarea, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(carpetaTarea, e.name))];
  for (const carpeta of candidatos) {
    for (const e of fs.readdirSync(carpeta, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const ruta = path.join(carpeta, e.name);
      if (fs.statSync(ruta).mtimeMs > fecha.getTime() + 3_600_000) fs.utimesSync(ruta, fecha, fecha);
    }
  }
}

// ─── Borrar una demo ────────────────────────────────────────────────────────
// Solo una carpeta con la marca de la demo, sin seguir enlaces. unlinkSync y no rmSync: en Node 24.11 para
// Windows, rmSync no borra un nombre con acentos y no lanza ("01 - Análisis Técnico.md"). Los objetos de
// git son de solo lectura en Windows: se les quita antes.
export function borrarDemo(raiz: string): void {
  if (!fs.statSync(path.join(raiz, MARCA_DE_DEMO), { throwIfNoEntry: false })?.isFile()) throw new Error(mensaje("DEMO-NO-ES-DEMO", { raiz }));
  const borrar = (ruta: string): void => {
    const info = fs.lstatSync(ruta);
    if (info.isDirectory() && !info.isSymbolicLink()) {
      for (const nombre of fs.readdirSync(ruta)) borrar(path.join(ruta, nombre));
      fs.rmdirSync(ruta);
      return;
    }
    try {
      fs.unlinkSync(ruta);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      fs.chmodSync(ruta, 0o666);
      fs.unlinkSync(ruta);
    }
  };
  borrar(raiz);
}

// ─── `ui --demo` ────────────────────────────────────────────────────────────
// La demo de `ui --demo` vive en una carpeta fija del temporal del sistema, y se reutiliza mientras la haya
// generado esta misma versión: arrancar no tarda lo que tarda generarla. Se genera al lado, con otro nombre,
// y se renombra al terminar: dos `ui --demo` a la vez no se pisan, y una generación cortada no deja una demo
// a medias con la marca puesta.
//
// En Linux y macOS el temporal es compartido entre usuarios: la carpeta lleva el uid, y solo se reutiliza si
// es de quien la abre, no es un enlace y nadie más puede escribir en ella. Si no, otro usuario podría dejar
// preparada una "demo" con enlaces a archivos de quien la abre.
// La demo en inglés, en su propia carpeta (con "-en"): las dos pueden convivir.
export function carpetaDeLaDemo(idioma: Idioma = "es"): string {
  const sufijo = idioma === "es" ? "" : `-${idioma}`;
  return path.join(os.tmpdir(), process.getuid ? `mcp-phase-gate-demo${sufijo}-${process.getuid()}` : `mcp-phase-gate-demo${sufijo}`);
}

function demoValida(raiz: string, idioma: Idioma): boolean {
  try {
    const info = fs.lstatSync(raiz);
    if (!info.isDirectory()) return false;
    if (process.getuid && (info.uid !== process.getuid() || (info.mode & 0o022) !== 0)) return false;
    return fs.readFileSync(path.join(raiz, MARCA_DE_DEMO), "utf-8") === textoDeLaMarca(idioma) && fs.statSync(path.join(raiz, "docs")).isDirectory();
  } catch {
    return false;
  }
}

export async function prepararDemo(idioma: Idioma = "es", raiz: string = carpetaDeLaDemo(idioma)): Promise<{ carpetas: CarpetasDeDemo; reutilizada: boolean }> {
  if (demoValida(raiz, idioma)) return { carpetas: carpetasDeDemo(raiz, idioma), reutilizada: true };
  if (fs.existsSync(raiz)) borrarDemo(raiz); // de otra versión, o a medias; sin la marca, borrarDemo no toca nada y lanza
  const nueva = `${raiz}.${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    await generarDemo(nueva, idioma);
    fs.renameSync(nueva, raiz);
  } catch (error) {
    if (fs.existsSync(path.join(nueva, MARCA_DE_DEMO))) borrarDemo(nueva);
    // Otro `ui --demo` la terminó antes: vale la suya.
    if (!demoValida(raiz, idioma)) throw error;
  }
  return { carpetas: carpetasDeDemo(raiz, idioma), reutilizada: false };
}

// El proceso de `ui --demo` trabaja solo sobre la demo: fuera las PHASE_GATE_*, ORQUESTADOR_* y GIT_* de
// quien lo lanza (también las que vinieron del .env), dentro las de la demo. Se conserva PHASE_GATE_LANG: no
// es una ruta ni dice nada del equipo, y es el idioma en que esa persona quiere los mensajes.
export function activarDemo(c: CarpetasDeDemo): void {
  for (const clave of Object.keys(process.env)) {
    if (clave.toUpperCase() !== "PHASE_GATE_LANG" && PREFIJOS.some((p) => clave.toUpperCase().startsWith(p))) delete process.env[clave];
  }
  Object.assign(process.env, entornoDeDemo(c));
}

// init-cliente, en la demo, escribe en la casa de la demo y nunca ejecuta `claude`: Claude Code sale como
// "no se puede saber si ya está registrado".
export function entornoInitDeDemo(c: CarpetasDeDemo): EntornoInit {
  return {
    home: c.casa,
    appData: path.join(c.casa, "AppData", "Roaming"),
    xdgConfig: path.join(c.casa, ".config"),
    plataforma: process.platform,
    salida: { out: () => {}, err: () => {} },
    esTerminal: false,
    preguntar: async () => "",
    ejecutar: async (comando) => {
      throw new Error(`en la demo no se ejecuta \`${comando}\``);
    },
    ahora: () => new Date(),
  };
}
