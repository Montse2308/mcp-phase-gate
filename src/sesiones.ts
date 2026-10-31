// The registry of open MCP sessions: so that the Studio, which is another process and does not see the roots
// of any session, can say "Claude Code has PROYECTO-A open".
//
// Each MCP server over stdio leaves `<stateDir>/sesiones/<pid>.json`:
//   { "pid": 1234, "cliente": "claude-code 2.1.0", "raices": [...], "proyecto": "PROYECTO-A",
//     "rutas": { "documentacion": "...", ... }, "desde": "<ISO>", "actualizado": "<ISO>" }
// It is written when the roots are known (when initialize ends and after each roots/list_changed) and
// refreshed at most once a minute; it is deleted on exit (exit, SIGINT, SIGTERM and when the client closes
// stdin). It is ephemeral state and only informational: it stores nothing of the conversation, and writing
// it never brings the server down or delays a response (it goes in the background, and a failure is only
// logged).
//
// Whoever reads it (the Studio) treats it as untrusted input, because other processes write it: the name has
// to be a positive integer, the content has to match a zod shape and be small, the pid has to be alive and
// `actualizado` less than 10 minutes old. Anything else is ignored and, if asked, deleted without following
// links.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import { CLAVE_EN_MAQUINA, leerVariable, stateDir } from "./config.js";
import { mensaje } from "./i18n/mensajes.js";
import { log } from "./log.js";
import { alRecibirRaices, resolverPorRaices } from "./roots.js";

export const CARPETA_DE_SESIONES = "sesiones";
export const INTERVALO_MS = 60_000;
export const CADUCIDAD_MS = 10 * 60_000;
export const TAMANO_MAXIMO = 16 * 1024;
const MAX_RAICES = 20;
// A cap per path, so that the record still fits in TAMANO_MAXIMO.
const MAX_RUTA = 1024;
const NOMBRE = /^([1-9]\d{0,9})\.json$/;

export function carpetaDeSesiones(): string {
  return path.join(stateDir(), CARPETA_DE_SESIONES);
}

// The paths the server started with, as they came in its environment: the ones from machine.json are not
// recorded, because they change without restarting it. Optional, because the sessions of a 3.x server do not
// carry it.
export const RutasDeSesion = z
  .object({
    documentacion: z.string().max(MAX_RUTA).optional(),
    carpetaDeRepos: z.string().max(MAX_RUTA).optional(),
    subcarpetaTareas: z.string().max(MAX_RUTA).optional(),
  })
  .strict();
export type RutasDeSesion = z.infer<typeof RutasDeSesion>;

export const SesionArchivo = z
  .object({
    pid: z.number().int().positive(),
    cliente: z.string().max(200),
    raices: z.array(z.string().max(1024)).max(MAX_RAICES),
    proyecto: z.string().max(200).nullable(),
    rutas: RutasDeSesion.optional(),
    desde: z.iso.datetime(),
    actualizado: z.iso.datetime(),
  })
  .strict();
export type SesionArchivo = z.infer<typeof SesionArchivo>;

// ─── Writing (the MCP server) ───────────────────────────────────────────────
// What this process received from its environment (the client's "env" block or the .env) for its three paths.
// It is what does not change while the process lives, and what Ajustes compares with machine.json. A path
// longer than the cap is not recorded.
export function rutasDelEntorno(): RutasDeSesion | undefined {
  const rutas: RutasDeSesion = {};
  for (const [logica, clave] of Object.entries(CLAVE_EN_MAQUINA) as ["DOCS_PATH" | "REPOS_PATH" | "TASKS_SUBDIR", keyof RutasDeSesion][]) {
    const { valor, fuente } = leerVariable(logica);
    if (valor === undefined || (fuente !== "entorno" && fuente !== ".env") || valor.length > MAX_RUTA) continue;
    rutas[clave] = valor;
  }
  return Object.keys(rutas).length ? rutas : undefined;
}

export type Escritor = (ruta: string, contenido: string) => Promise<void>;

// Atomic write: a temporary whose name starts with a dot (the reader does not take it for a session) and a rename.
export const escribirAtomico: Escritor = async (ruta, contenido) => {
  await fs.promises.mkdir(path.dirname(ruta), { recursive: true });
  const temporal = path.join(path.dirname(ruta), `.${path.basename(ruta)}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    await fs.promises.writeFile(temporal, contenido, "utf-8");
    await fs.promises.rename(temporal, ruta);
  } catch (error) {
    await fs.promises.unlink(temporal).catch(() => {});
    throw error;
  }
};

export type OpcionesDeRegistro = {
  pid?: number;
  ahora?: () => Date;
  intervaloMs?: number;
  escribir?: Escritor;
  // The paths from the server's environment; without them, the process's.
  rutas?: RutasDeSesion | undefined;
  // The process the exit and the signals are hooked to; the tests pass a fake one.
  proceso?: Pick<NodeJS.Process, "on" | "once" | "exit"> & { stdin?: { on: (evento: string, oyente: () => void) => unknown } };
};

export type RegistroDeSesion = { escrituras: () => number; borrar: () => void; cerrar: () => void };

export function registrarSesion(mcp: McpServer, opciones: OpcionesDeRegistro = {}): RegistroDeSesion {
  const pid = opciones.pid ?? process.pid;
  const ahora = opciones.ahora ?? (() => new Date());
  const intervalo = opciones.intervaloMs ?? INTERVALO_MS;
  const escribir = opciones.escribir ?? escribirAtomico;
  const proceso = opciones.proceso ?? process;
  // Read at start: what came from the environment does not change while the process lives.
  const rutas = "rutas" in opciones ? opciones.rutas : rutasDelEntorno();
  // The path is fixed at startup: if the state moved, the file that gets deleted is the one that was written.
  let ruta: string | null = null;
  let datos: SesionArchivo | null = null;
  let ultima = 0;
  let pendiente: NodeJS.Timeout | null = null;
  let escrituras = 0;
  let avisado = false;
  let cerrado = false;

  const nombreDelCliente = (): string => {
    const version = mcp.server.getClientVersion();
    return (version ? `${version.name} ${version.version}` : mensaje("SESION-CLIENTE-SIN-NOMBRE")).slice(0, 200);
  };

  const volcar = (): void => {
    pendiente = null;
    if (cerrado || !datos) return;
    ultima = Date.now();
    // The client, at write time: if the roots arrived before it was known, the next refresh sets it.
    datos = { ...datos, cliente: nombreDelCliente(), actualizado: ahora().toISOString() };
    escrituras++;
    try {
      ruta ??= path.join(carpetaDeSesiones(), `${pid}.json`);
    } catch (error) {
      if (!avisado) log("warning", mensaje("SESION-NO-REGISTRADA", { detalle: error instanceof Error ? error.message : String(error) }));
      avisado = true;
      return;
    }
    escribir(ruta, `${JSON.stringify(datos, null, 2)}\n`).catch((error: unknown) => {
      // Once: the server carries on as before, and the Studio will just stop seeing this session.
      if (!avisado) log("warning", mensaje("SESION-NO-REGISTRADA", { detalle: error instanceof Error ? error.message : String(error) }));
      avisado = true;
    });
  };

  // At most one write per interval; a change inside the interval is written when it ends.
  const programar = (): void => {
    if (cerrado || pendiente) return;
    const espera = ultima + intervalo - Date.now();
    if (espera <= 0) {
      volcar();
      return;
    }
    pendiente = setTimeout(volcar, espera);
    pendiente.unref();
  };

  alRecibirRaices(mcp, (raices) => {
    let proyecto: string | null = null;
    try {
      const resolucion = resolverPorRaices(raices);
      proyecto = resolucion.tipo === "unico" ? resolucion.carpetaProyecto : null;
    } catch {
      proyecto = null; // no Documentation configured, so there is no project to deduce
    }
    const cliente = nombreDelCliente();
    const momento = ahora().toISOString();
    datos = {
      pid,
      cliente,
      raices: raices.slice(0, MAX_RAICES).map((r) => r.slice(0, 1024)),
      proyecto: proyecto ? proyecto.slice(0, 200) : null,
      ...(rutas ? { rutas } : {}),
      desde: datos?.desde ?? momento,
      actualizado: momento,
    };
    programar();
  });

  // Refresh: without it, a long session would look expired after 10 minutes.
  const refresco = setInterval(() => {
    if (datos) programar();
  }, intervalo);
  refresco.unref();

  const borrar = (): void => {
    if (!ruta) return;
    try {
      fs.unlinkSync(ruta);
    } catch {
      // it was already gone, or it cannot be: the Studio will clean it up by pid
    }
  };
  const cerrar = (): void => {
    cerrado = true;
    clearInterval(refresco);
    if (pendiente) clearTimeout(pendiente);
    borrar();
  };

  proceso.on("exit", cerrar);
  // With a SIGINT or SIGTERM listener, Node no longer exits by itself: it exits with the signal's code.
  proceso.once("SIGINT", () => {
    cerrar();
    proceso.exit(130);
  });
  proceso.once("SIGTERM", () => {
    cerrar();
    proceso.exit(143);
  });
  proceso.stdin?.on("end", cerrar);

  return { escrituras: () => escrituras, borrar, cerrar };
}

// ─── Reading (the Studio) ───────────────────────────────────────────────────
// Is the process still alive? kill(pid, 0) sends no signal: it only checks. EPERM means it exists and
// belongs to another user: alive. A pid reused by another program also gives "alive"; that is what the
// 10-minute expiry is for.
export function pidVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

export type SesionAbierta = { pid: number; cliente: string; proyecto: string | null; rutas?: RutasDeSesion; desde: string; actualizado: string };

export type OpcionesDeLectura = { ahora?: () => number; vivo?: (pid: number) => boolean; borrar?: boolean };

// Deletes an entry without following links: unlink removes the link or the file; a Windows junction is
// removed with rmdir (not recursive: it never touches its target). A real folder is not deleted.
function borrarEntrada(ruta: string): void {
  try {
    const info = fs.lstatSync(ruta);
    if (info.isDirectory() && !info.isSymbolicLink()) return;
    try {
      fs.unlinkSync(ruta);
    } catch (error) {
      if (info.isSymbolicLink() && ["EPERM", "EISDIR"].includes((error as NodeJS.ErrnoException)?.code ?? "")) fs.rmdirSync(ruta);
      else throw error;
    }
  } catch {
    // another process already removed it, or it cannot be: it will be tried next time
  }
}

function leerSesion(ruta: string, pid: number): SesionArchivo | null {
  let descriptor: number;
  try {
    descriptor = fs.openSync(ruta, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  } catch {
    return null;
  }
  try {
    const info = fs.fstatSync(descriptor);
    if (!info.isFile() || info.size > TAMANO_MAXIMO) return null;
    const buffer = Buffer.alloc(TAMANO_MAXIMO + 1);
    const leidos = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (leidos > TAMANO_MAXIMO) return null;
    const crudo: unknown = JSON.parse(buffer.subarray(0, leidos).toString("utf-8"));
    const leido = SesionArchivo.safeParse(crudo);
    return leido.success && leido.data.pid === pid ? leido.data : null;
  } catch {
    return null;
  } finally {
    fs.closeSync(descriptor);
  }
}

// A temporary of a write in progress is not touched; one older than a minute belongs to a process that
// died while writing.
const TEMPORAL = /^\.[1-9]\d{0,9}\.json\.[0-9a-f]+\.tmp$/;

export function sesionesAbiertas(opciones: OpcionesDeLectura = {}): SesionAbierta[] {
  const ahora = opciones.ahora ?? Date.now;
  const vivo = opciones.vivo ?? pidVivo;
  const carpeta = carpetaDeSesiones();
  let entradas: fs.Dirent[];
  try {
    entradas = fs.readdirSync(carpeta, { withFileTypes: true });
  } catch {
    return [];
  }

  const abiertas: SesionAbierta[] = [];
  for (const entrada of entradas.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const ruta = path.join(carpeta, entrada.name);
    const descartar = (): void => {
      if (opciones.borrar) borrarEntrada(ruta);
    };
    if (TEMPORAL.test(entrada.name)) {
      const edad = ahora() - (fs.lstatSync(ruta, { throwIfNoEntry: false })?.mtimeMs ?? ahora());
      if (edad > INTERVALO_MS) descartar();
      continue;
    }
    const nombre = entrada.name.match(NOMBRE);
    let info: fs.Stats | undefined;
    try {
      info = fs.lstatSync(ruta);
    } catch {
      continue;
    }
    if (!nombre || !info.isFile() || info.size > TAMANO_MAXIMO) {
      descartar();
      continue;
    }
    const pid = Number(nombre[1]);
    const sesion = leerSesion(ruta, pid);
    const edad = sesion ? ahora() - Date.parse(sesion.actualizado) : Infinity;
    // A date in the future (by more than a minute) is not valid either: there is no way to know when it expires.
    if (!sesion || edad > CADUCIDAD_MS || edad < -INTERVALO_MS || !vivo(pid)) {
      descartar();
      continue;
    }
    abiertas.push({ pid, cliente: sesion.cliente, proyecto: sesion.proyecto, ...(sesion.rutas ? { rutas: sesion.rutas } : {}), desde: sesion.desde, actualizado: sesion.actualizado });
  }
  return abiertas;
}
