// Los eventos en vivo del Studio (§7.5.1 del plan): lo que cambia en el disco llega al navegador por
// Server-Sent Events, ya traducido a eventos de dominio, para que cada vista recargue solo lo suyo.
//
//   documento {p, t, archivo}   un archivo de una carpeta de tarea
//   recibo    {p, t, lote}      un archivo de la subcarpeta de recibos
//   config    {p}               phase-gate.json o .phase-gate/** del proyecto
//   prompts   {}                la capa global, <configDir>/presets o machine.json
//   sesiones  {}                <stateDir>/sesiones
//   punteros  {}                el archivo de las tareas activas (switch_task, start_task)
//
// Se vigila con fs.watch recursivo (la Documentación, la capa global, la carpeta de configuración y la
// de estado), y como en carpetas de OneDrive no es fiable, hay un sondeo de respaldo cada 5 s sobre los
// archivos de las tareas activas. Si el sondeo ve un cambio que el watcher no avisó, emite el evento y
// el estado del watcher pasa a "degradado".
//
// El ruido de OneDrive (validación V8): se ignoran desktop.ini, Thumbs.db, ~$*, *.tmp (también los
// temporales de la escritura atómica) y lo que empieza por punto dentro de una tarea, y un aviso solo
// cuenta si la fecha o el tamaño del archivo cambiaron de verdad: OneDrive avisa al sincronizar o al
// liberar espacio sin tocar el contenido.

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
  | { tipo: "sesiones"; datos: Record<string, never> }
  | { tipo: "punteros"; datos: Record<string, never> };

// Quien avisa de los cambios: fs.watch recursivo, o uno simulado en los tests. `alCambiar` recibe la
// ruta absoluta del archivo (o null si el sistema no dice cuál), y `alFallar`, el error si deja de
// funcionar.
export type Vigilante = (raiz: string, alCambiar: (ruta: string | null) => void, alFallar: (error: Error) => void) => { cerrar: () => void };

export const vigilanteDeFs: Vigilante = (raiz, alCambiar, alFallar) => {
  const watcher = fs.watch(raiz, { recursive: true, persistent: false }, (_evento, nombre) => alCambiar(nombre ? path.join(raiz, nombre.toString()) : null));
  watcher.on("error", (error) => alFallar(error));
  return { cerrar: () => watcher.close() };
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
// Una pestaña abre una conexión; con varias pestañas o recargas seguidas se suman unas pocas. Más de
// ocho a la vez no es un uso normal, y cada una es un socket abierto.
export const MAX_CONEXIONES = 8;
// Cada cuántos sondeos se vuelve a calcular qué tareas están activas (con 5 s, cada minuto).
const SONDEOS_POR_RECALCULO = 12;

// ─── Ruido ──────────────────────────────────────────────────────────────────
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

// ─── Traducción a eventos de dominio ────────────────────────────────────────
function segmentosDentro(base: string, ruta: string): string[] | null {
  if (!estaDentro(base, ruta)) return null;
  const relativa = path.relative(base, ruta);
  return relativa ? relativa.split(/[\\/]/) : [];
}

export function traducir(ruta: string): EventoDeDominio | null {
  // Lo de la máquina antes que la Documentación: el estado y la configuración pueden ser la misma
  // carpeta (en Windows y macOS lo son por defecto).
  const sesiones = path.join(stateDir(), "sesiones");
  if (segmentosDentro(sesiones, ruta) !== null) return { tipo: "sesiones", datos: {} };
  if (path.resolve(ruta) === path.resolve(stateFile())) return { tipo: "punteros", datos: {} };

  const global = carpetaPromptsGlobal();
  if (global && segmentosDentro(global, ruta) !== null) return { tipo: "prompts", datos: {} };
  const deConfig = segmentosDentro(configDir(), ruta);
  if (deConfig !== null && deConfig.length) {
    const [primero = ""] = deConfig;
    if (primero === ARCHIVO_MAQUINA || primero === "presets" || primero === "prompts") return { tipo: "prompts", datos: {} };
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

  // Con el manifiesto roto, las fases sin proyecto: un recibo sigue siendo un recibo.
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

// ─── Los eventos ────────────────────────────────────────────────────────────
export type Eventos = {
  manejar: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  estado: () => EstadoDelWatcher;
  conexiones: () => number;
  // Para los tests y para el sondeo: emitir un evento a todos.
  emitir: (evento: EventoDeDominio) => void;
  cerrar: () => void;
};

// Las raíces que se vigilan, sin una dentro de otra (el estado y la configuración suelen coincidir).
function raicesAVigilar(): string[] {
  const candidatas: string[] = [];
  try {
    candidatas.push(requireBasePath(DOCS));
  } catch {
    // sin Documentación no hay nada que vigilar ahí
  }
  const global = carpetaPromptsGlobal();
  if (global) candidatas.push(global);
  candidatas.push(configDir(), stateDir());
  const existentes = [...new Set(candidatas.map((c) => path.resolve(c)))].filter((c) => fs.statSync(c, { throwIfNoEntry: false })?.isDirectory());
  return existentes.filter((c) => !existentes.some((otra) => otra !== c && estaDentro(otra, c)));
}

// Los archivos de las tareas activas, para el sondeo: sus documentos y sus recibos.
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
      // un proyecto que no se puede leer no se sondea; la API lo dice
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

  // Un aviso cuenta si el archivo cambió de verdad respecto de lo último que se vio de él; uno que no se
  // había visto, si cambió después de arrancar.
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

  const vigilantes: { cerrar: () => void }[] = [];
  for (const raiz of raicesAVigilar()) {
    try {
      const vigilante = vigilar(raiz, alCambiar, () => {
        degradado = true;
        try {
          vigilante.cerrar();
        } catch {
          // ya estaba cerrado
        }
        vigilantes.splice(vigilantes.indexOf(vigilante), 1);
      });
      vigilantes.push(vigilante);
    } catch {
      degradado = true;
    }
  }

  // ─── El sondeo de respaldo ────────────────────────────────────────────────
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
      if (pendientes.has(ruta)) continue; // el watcher ya lo avisó y está agrupando
      const actual = huellaDe(ruta);
      if (actual === "carpeta") continue;
      const anterior = conocidas.get(ruta);
      if (anterior !== undefined && iguales(anterior, actual)) continue;
      conocidas.set(ruta, actual);
      if (anterior === undefined) continue; // primera vez que se ve: no hay con qué comparar
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
    estado: () => (vigilantes.length === 0 ? "apagado" : degradado ? "degradado" : "activo"),
    conexiones: () => conexiones.size,
    emitir,
    cerrar: () => {
      cerrado = true;
      if (agrupando) clearTimeout(agrupando);
      clearInterval(sondeo);
      clearInterval(latido);
      for (const v of vigilantes.splice(0)) {
        try {
          v.cerrar();
        } catch {
          // ya estaba cerrado
        }
      }
      for (const res of conexiones) res.end();
      conexiones.clear();
    },
  };
}
