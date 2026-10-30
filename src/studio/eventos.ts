// The Studio's live events: what changes on disk reaches the browser over Server-Sent Events, already
// translated into domain events, so each view reloads only its own data.
//
//   documento {p, t, archivo}   a file in a task folder
//   recibo    {p, t, lote}      a file in the receipts subfolder
//   config    {p}               the project's phase-gate.json or .phase-gate/**
//   prompts   {}                the global layer or <configDir>/presets
//   equipo    {}                <configDir>/machine.json: this machine's paths may have changed
//   sesiones  {}                <stateDir>/sesiones
//   punteros  {}                the active-tasks file (switch_task, start_task)
//
// It watches with a recursive fs.watch (the Documentation, the global layer, the configuration folder and the
// state folder), and since that is not reliable in OneDrive folders, a backup poll every 5 s checks the files
// of the active tasks. If the poll sees a change the watcher did not report, it emits the event and the
// watcher's state becomes "degradado".
//
// The watched folders are recalculated when machine.json changes, because the Documentation may be another.
//
// OneDrive noise: desktop.ini, Thumbs.db, ~$*, *.tmp (atomic-write temporaries included) and anything starting
// with a dot inside a task are ignored, and a notification only counts if the file's mtime or size really
// changed: OneDrive notifies on sync or when freeing space without touching the content.

import * as fs from "fs";
import type * as http from "http";
import * as path from "path";

import { DOCS, carpetaPromptsGlobal, configDir, requireBasePath, stateDir, stateFile, tasksSubdir } from "../config.js";
import { fasesDe } from "../capas.js";
import { mensaje } from "../i18n/mensajes.js";
import { ARCHIVO_MAQUINA, ARCHIVO_MANIFIESTO } from "../manifiesto.js";
import { discoverProjects, estaDentro } from "../paths.js";
import { loteDelNombre, etiquetaDeLote } from "../recibos.js";
import { tareaActiva } from "../tasks.js";
import type { EstadoDelWatcher } from "./contrato.js";

export type EventoDeDominio =
  | { tipo: "documento"; datos: { p: string; t: string; archivo: string } }
  | { tipo: "recibo"; datos: { p: string; t: string; lote: string } }
  | { tipo: "config"; datos: { p: string } }
  | { tipo: "prompts"; datos: Record<string, never> }
  | { tipo: "equipo"; datos: Record<string, never> }
  | { tipo: "sesiones"; datos: Record<string, never> }
  | { tipo: "punteros"; datos: Record<string, never> };

// What reports the changes: a recursive fs.watch, or a fake one in the tests. `alCambiar` receives the file's
// absolute path (or null if the system does not say which), and `alFallar` the error if it stops working.
export type Vigilante = (raiz: string, alCambiar: (ruta: string | null) => void, alFallar: (error: Error) => void) => { cerrar: () => void };

export const vigilanteDeFs: Vigilante = (raiz, alCambiar, alFallar) => {
  if (process.platform === "linux") return vigilarPorCarpetas(raiz, alCambiar, alFallar);
  const watcher = fs.watch(raiz, { recursive: true, persistent: false }, (_evento, nombre) => alCambiar(nombre ? path.join(raiz, nombre.toString()) : null));
  watcher.on("error", (error) => alFallar(error));
  return { cerrar: () => watcher.close() };
};

// On Linux, Node's recursive fs.watch watches each file by its inode: a file replaced by a rename (the atomic
// write of the Studio itself, and of many editors) keeps the watcher on the old inode, and from then on its
// changes are never reported. Here each folder is watched instead, which reports every name that changes
// inside it, whatever the inode. A folder that appears is walked and watched, and what it already holds is
// reported (it may have been written before its watcher existed).
export const vigilarPorCarpetas: Vigilante = (raiz, alCambiar, alFallar) => {
  const watchers = new Map<string, fs.FSWatcher>();
  let cerrado = false;

  const soltar = (carpeta: string): void => {
    for (const [otra, watcher] of watchers) {
      if (otra === carpeta || estaDentro(carpeta, otra)) {
        watcher.close();
        watchers.delete(otra);
      }
    }
  };

  const abrir = (carpeta: string): void => {
    if (cerrado || watchers.has(carpeta)) return;
    const watcher = fs.watch(carpeta, { persistent: false }, (_evento, nombre) => {
      if (cerrado) return;
      if (!nombre) return alCambiar(null);
      const ruta = path.join(carpeta, nombre.toString());
      const info = fs.statSync(ruta, { throwIfNoEntry: false });
      if (info?.isDirectory()) {
        if (!watchers.has(ruta)) recorrer(ruta, true);
      } else if (!info && watchers.has(ruta)) {
        soltar(ruta);
      }
      alCambiar(ruta);
    });
    watcher.on("error", (error) => {
      watcher.close();
      watchers.delete(carpeta);
      // A subfolder that is deleted is not a failure of the watcher.
      if (carpeta === raiz) alFallar(error);
    });
    watchers.set(carpeta, watcher);
  };

  const recorrer = (carpeta: string, avisar: boolean): void => {
    try {
      abrir(carpeta);
    } catch (error) {
      if (carpeta === raiz) throw error;
      return;
    }
    let entradas: fs.Dirent[];
    try {
      entradas = fs.readdirSync(carpeta, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const ruta = path.join(carpeta, e.name);
      if (e.isDirectory() && !e.isSymbolicLink()) recorrer(ruta, avisar);
      else if (avisar) alCambiar(ruta);
    }
  };

  recorrer(raiz, false);
  return {
    cerrar: () => {
      cerrado = true;
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
};

export type OpcionesEventos = {
  vigilar?: Vigilante;
  agrupacionMs?: number;
  sondeoMs?: number;
  latidoMs?: number;
  maxConexiones?: number;
  ahora?: () => number;
};

export const AGRUPACION_MS = 300;
export const SONDEO_MS = 5000;
export const LATIDO_MS = 25_000;
// A tab opens one connection; several tabs or quick reloads add up to a few. More than eight at once is not
// normal use, and each one is an open socket.
export const MAX_CONEXIONES = 8;
// How many polls between recomputations of which tasks are active (at 5 s, once a minute).
const SONDEOS_POR_RECALCULO = 12;

// ─── Noise ──────────────────────────────────────────────────────────────────
export function esRuido(ruta: string): boolean {
  const nombre = path.basename(ruta);
  const minusculas = nombre.toLowerCase();
  return minusculas === "desktop.ini" || minusculas === "thumbs.db" || nombre.startsWith("~$") || minusculas.endsWith(".tmp");
}

type Huella = { mtimeMs: number; size: number } | "no-existe";

function huellaDe(ruta: string): Huella | "carpeta" {
  try {
    const info = fs.statSync(ruta);
    return info.isDirectory() ? "carpeta" : { mtimeMs: info.mtimeMs, size: info.size };
  } catch {
    return "no-existe";
  }
}

const iguales = (a: Huella | undefined, b: Huella): boolean =>
  a !== undefined && (a === "no-existe" || b === "no-existe" ? a === b : a.mtimeMs === b.mtimeMs && a.size === b.size);

// ─── Translation into domain events ─────────────────────────────────────────
function segmentosDentro(base: string, ruta: string): string[] | null {
  if (!estaDentro(base, ruta)) return null;
  const relativa = path.relative(base, ruta);
  return relativa ? relativa.split(/[\\/]/) : [];
}

export function traducir(ruta: string): EventoDeDominio | null {
  // The machine's folders before the Documentation: state and configuration can be the same folder (on
  // Windows and macOS they are by default).
  const sesiones = path.join(stateDir(), "sesiones");
  if (segmentosDentro(sesiones, ruta) !== null) return { tipo: "sesiones", datos: {} };
  if (path.resolve(ruta) === path.resolve(stateFile())) return { tipo: "punteros", datos: {} };

  const global = carpetaPromptsGlobal();
  if (global && segmentosDentro(global, ruta) !== null) return { tipo: "prompts", datos: {} };
  const deConfig = segmentosDentro(configDir(), ruta);
  if (deConfig !== null && deConfig.length) {
    const [primero = ""] = deConfig;
    if (primero === ARCHIVO_MAQUINA) return { tipo: "equipo", datos: {} };
    if (primero === "presets" || primero === "prompts") return { tipo: "prompts", datos: {} };
  }

  let docs: string;
  try {
    docs = requireBasePath(DOCS);
  } catch {
    return null;
  }
  const enDocs = segmentosDentro(docs, ruta);
  if (!enDocs || enDocs.length < 2) return null;
  const [p = "", ...resto] = enDocs;
  if (p.startsWith(".")) return null;
  if (resto[0] === ARCHIVO_MANIFIESTO || resto[0] === ".phase-gate") return { tipo: "config", datos: { p } };

  const subdir = tasksSubdir();
  const dentro = subdir ? (resto[0] === subdir ? resto.slice(1) : null) : resto;
  if (!dentro || dentro.length < 2) return null;
  const [t = "", ...archivo] = dentro;
  if (t.startsWith(".") || archivo.some((s) => s.startsWith("."))) return null;

  // With a broken manifest, the phases without a project: a receipt is still a receipt.
  const subcarpeta = (proyecto: string | null): string | null => [...fasesDe(proyecto).values()].find((d) => d.recibos)?.recibos ?? null;
  let recibos: string | null = null;
  try {
    recibos = subcarpeta(p);
  } catch {
    try {
      recibos = subcarpeta(null);
    } catch {
      recibos = null;
    }
  }
  if (recibos && archivo.length === 2 && archivo[0] === recibos) {
    const lote = loteDelNombre(archivo[1]!);
    if (lote !== null) return { tipo: "recibo", datos: { p, t, lote: etiquetaDeLote(lote) } };
  }
  return { tipo: "documento", datos: { p, t, archivo: archivo.join("/") } };
}

// ─── The events ─────────────────────────────────────────────────────────────
export type Eventos = {
  manejar: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  estado: () => EstadoDelWatcher;
  conexiones: () => number;
  emitir: (evento: EventoDeDominio) => void;
  cerrar: () => void;
};

// The roots to watch, with none inside another (state and configuration often coincide).
function raicesAVigilar(): string[] {
  const candidatas: string[] = [];
  try {
    candidatas.push(requireBasePath(DOCS));
  } catch {
    // without Documentation there is nothing to watch there
  }
  const global = carpetaPromptsGlobal();
  if (global) candidatas.push(global);
  candidatas.push(configDir(), stateDir());
  const existentes = [...new Set(candidatas.map((c) => path.resolve(c)))].filter((c) => fs.statSync(c, { throwIfNoEntry: false })?.isDirectory());
  return existentes.filter((c) => !existentes.some((otra) => otra !== c && estaDentro(otra, c)));
}

function archivosDeTareasActivas(): string[] {
  const archivos: string[] = [];
  let proyectos: string[];
  try {
    proyectos = [...discoverProjects().values()];
  } catch {
    return archivos;
  }
  for (const p of proyectos) {
    try {
      const phases = fasesDe(p);
      const activa = tareaActiva(p, phases);
      if (!activa) continue;
      const carpeta = activa.estado.folderPath;
      const recibos = [...phases.values()].find((d) => d.recibos)?.recibos;
      for (const sub of [carpeta, ...(recibos ? [path.join(carpeta, recibos)] : [])]) {
        for (const e of fs.readdirSync(sub, { withFileTypes: true })) {
          if (e.isFile() && !e.name.startsWith(".")) archivos.push(path.join(sub, e.name));
        }
      }
    } catch {
      // an unreadable project is not polled; the API reports it
    }
  }
  return archivos;
}

export function crearEventos(opciones: OpcionesEventos = {}): Eventos {
  const vigilar = opciones.vigilar ?? vigilanteDeFs;
  const agrupacionMs = opciones.agrupacionMs ?? AGRUPACION_MS;
  const ahora = opciones.ahora ?? Date.now;
  const inicio = ahora();
  const conexiones = new Set<http.ServerResponse>();
  const conocidas = new Map<string, Huella>();
  const pendientes = new Set<string>();
  let agrupando: NodeJS.Timeout | null = null;
  let degradado = false;
  let cerrado = false;

  const enviar = (res: http.ServerResponse, texto: string): void => {
    try {
      res.write(texto);
    } catch {
      conexiones.delete(res);
    }
  };
  const emitir = (evento: EventoDeDominio): void => {
    const texto = `event: ${evento.tipo}\ndata: ${JSON.stringify(evento.datos)}\n\n`;
    for (const res of conexiones) enviar(res, texto);
  };

  // A notification counts if the file really changed since the last time it was seen; for one never seen
  // before, if it changed after startup.
  const cambioDeVerdad = (ruta: string): boolean => {
    const actual = huellaDe(ruta);
    if (actual === "carpeta") return false;
    const anterior = conocidas.get(ruta);
    conocidas.set(ruta, actual);
    if (anterior === undefined) return actual === "no-existe" || actual.mtimeMs >= inicio;
    return !iguales(anterior, actual);
  };

  const procesar = (): void => {
    agrupando = null;
    const vistos = new Map<string, EventoDeDominio>();
    for (const ruta of pendientes) {
      if (!cambioDeVerdad(ruta)) continue;
      const evento = traducir(ruta);
      if (evento) vistos.set(`${evento.tipo}:${JSON.stringify(evento.datos)}`, evento);
    }
    pendientes.clear();
    // machine.json changed: the Documentation may be another, so the current one is watched before announcing.
    if ([...vistos.values()].some((e) => e.tipo === "equipo")) reajustar();
    for (const evento of vistos.values()) emitir(evento);
  };

  const alCambiar = (ruta: string | null): void => {
    if (cerrado || ruta === null || esRuido(ruta)) return;
    pendientes.add(path.resolve(ruta));
    if (!agrupando) {
      agrupando = setTimeout(procesar, agrupacionMs);
      agrupando.unref();
    }
  };

  const vigilantes = new Map<string, { cerrar: () => void }>();
  const abrir = (raiz: string): void => {
    try {
      const vigilante = vigilar(raiz, alCambiar, () => {
        degradado = true;
        try {
          vigilante.cerrar();
        } catch {
          // already closed
        }
        vigilantes.delete(raiz);
      });
      vigilantes.set(raiz, vigilante);
    } catch {
      degradado = true;
    }
  };
  for (const raiz of raicesAVigilar()) abrir(raiz);

  // The folders watched now: those no longer needed are closed and the new ones are opened. And the backup
  // poll works out again which tasks are active, which depend on the Documentation.
  const reajustar = (): void => {
    if (cerrado) return;
    const deseadas = new Set(raicesAVigilar());
    for (const [raiz, vigilante] of vigilantes) {
      if (deseadas.has(raiz)) continue;
      try {
        vigilante.cerrar();
      } catch {
        // already closed
      }
      vigilantes.delete(raiz);
    }
    for (const raiz of deseadas) if (!vigilantes.has(raiz)) abrir(raiz);
    archivosSondeados = archivosDeTareasActivas();
    for (const archivo of archivosSondeados) {
      const h = huellaDe(archivo);
      if (h !== "carpeta" && !conocidas.has(archivo)) conocidas.set(archivo, h);
    }
  };

  // ─── The backup poll ──────────────────────────────────────────────────────
  let archivosSondeados: string[] = archivosDeTareasActivas();
  for (const ruta of archivosSondeados) {
    const h = huellaDe(ruta);
    if (h !== "carpeta" && !conocidas.has(ruta)) conocidas.set(ruta, h);
  }
  let sondeos = 0;
  const sondear = (): void => {
    if (cerrado) return;
    if (++sondeos % SONDEOS_POR_RECALCULO === 0) archivosSondeados = archivosDeTareasActivas();
    const vistos = new Map<string, EventoDeDominio>();
    for (const ruta of archivosSondeados) {
      if (pendientes.has(ruta)) continue; // the watcher already reported it and is batching
      const actual = huellaDe(ruta);
      if (actual === "carpeta") continue;
      const anterior = conocidas.get(ruta);
      if (anterior !== undefined && iguales(anterior, actual)) continue;
      conocidas.set(ruta, actual);
      if (anterior === undefined) continue; // first time seen: nothing to compare against
      degradado = true;
      const evento = traducir(ruta);
      if (evento) vistos.set(`${evento.tipo}:${JSON.stringify(evento.datos)}`, evento);
    }
    for (const evento of vistos.values()) emitir(evento);
  };
  const sondeo = setInterval(sondear, opciones.sondeoMs ?? SONDEO_MS);
  sondeo.unref();

  const latido = setInterval(() => {
    for (const res of conexiones) enviar(res, ": latido\n\n");
  }, opciones.latidoMs ?? LATIDO_MS);
  latido.unref();

  const maximo = opciones.maxConexiones ?? MAX_CONEXIONES;
  return {
    manejar: (req, res) => {
      if (conexiones.size >= maximo) {
        const texto = JSON.stringify({ error: mensaje("STUDIO-EVENTOS-LLENO", { maximo }) });
        res.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(texto), "Cache-Control": "no-store", "Retry-After": "10" });
        res.end(texto);
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
      conexiones.add(res);
      enviar(res, ": conectado\n\n");
      const quitar = (): void => {
        conexiones.delete(res);
      };
      req.on("close", quitar);
      res.on("close", quitar);
    },
    estado: () => (vigilantes.size === 0 ? "apagado" : degradado ? "degradado" : "activo"),
    conexiones: () => conexiones.size,
    emitir,
    cerrar: () => {
      cerrado = true;
      if (agrupando) clearTimeout(agrupando);
      clearInterval(sondeo);
      clearInterval(latido);
      for (const v of vigilantes.values()) {
        try {
          v.cerrar();
        } catch {
          // already closed
        }
      }
      vigilantes.clear();
      for (const res of conexiones) res.end();
      conexiones.clear();
    },
  };
}
