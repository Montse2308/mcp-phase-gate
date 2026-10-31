// The Studio: a local interface that only SEES the orchestrator's state and runs configuration actions that
// already existed in the CLI. It is a separate process: the stdio MCP server never loads this module. Only
// `mcp-phase-gate ui` loads it, with a dynamic import (cli.ts), and no file in src/ outside src/studio/ imports
// it (test/aislamiento.test.ts).
//
// An HTTP server on 127.0.0.1 is a surface the stdio server did not have: any web page open in the browser
// can try to talk to it, and any process on the machine can connect.
// Each request goes through this filter, in this order:
//
//   1. Exact Host `127.0.0.1:<port>` or `localhost:<port>`, exactly once        → 421 (DNS rebinding)
//   2. Origin, if present, exactly `http://127.0.0.1:<port>` or `localhost`    → 403 (another site)
//   3. `GET /?token=<t>`: this startup's single-use token, exchanged for a cookie → 303 / 401
//   4. `/api/**` requires the session cookie                                    → 401
//   5. A method other than GET requires `X-Phase-Gate: 1` and a JSON body of
//      up to 64 kB; the header forces a CORS preflight that is never granted   → 403 / 413
//   6. Static files are served only from studio/dist, with the real path inside → 404
//
// Every response carries the CSP without 'unsafe-inline', nosniff and no-referrer.
//
// The language of what the API says (describeEstado, doctor's findings, a prompt's notes, the actions'
// summaries and the errors) is the interface's: the frontend sends it with every request in the
// X-Phase-Gate-Lang header ("es" or "en"; any other value is ignored), and the request is served inside
// `enIdioma`. Without the header, the usual one (PHASE_GATE_LANG or the system's). It does not touch the
// filter: a custom header on a same-origin fetch opens nothing, and a preflight is never granted.

import { execFile } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import type { AddressInfo } from "net";
import * as path from "path";

import type { OpcionesUi, Salida } from "../cli.js";
import { raizPaquete } from "../config.js";
import { enIdioma, idiomaDeMensajes, mensaje } from "../i18n/mensajes.js";
import { ejecutarComando } from "../init.js";
import { estaDentroReal, validarSegmento } from "../paths.js";
import { INTERVALO_MS, sesionesAbiertas } from "../sesiones.js";
import type { Idioma } from "../vocabulario.js";
import { crearApi, entornoInitDelProceso } from "./api.js";
import { activarDemo, entornoInitDeDemo, prepararDemo } from "./demo.js";
import type { CarpetasDeDemo } from "./demo.js";
import { crearEventos } from "./eventos.js";

export const HOST = "127.0.0.1";
export const CUERPO_MAXIMO = 64 * 1024;
export const CABECERA_DE_IDIOMA = "x-phase-gate-lang";
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// The cookie carries the port in its name: a browser does not separate cookies by port (RFC 6265,
// section 8.5), so with two Studios open at once (`ui` and `ui --demo`) the second exchange would overwrite
// the first one's session.
export function nombreDeCookie(puerto: number): string {
  return `pg_sesion_${puerto}`;
}

export function carpetaDist(): string {
  return path.join(raizPaquete(), "studio", "dist");
}

// ─── What the Studio adds on top of the filter ──────────────────────────────
// The API and the events plug in here: the filter has already checked Host, Origin and the cookie, and, for
// a method other than GET, the header and the body (already read and parsed).
export type PeticionApi = {
  metodo: string;
  ruta: string; // without the /api prefix, e.g. "/proyectos"
  consulta: URLSearchParams;
  cuerpo: unknown; // undefined on a GET
  req: http.IncomingMessage;
};
export type RespuestaApi = { estado: number; json: unknown };
// "manejada": the response was already written (the SSE).
export type ManejadorApi = (peticion: PeticionApi, res: http.ServerResponse) => Promise<RespuestaApi | "manejada">;

export type OpcionesStudio = {
  puerto?: number | null; // null or 0: any free one
  dist?: string; // by default <package>/studio/dist
  api?: ManejadorApi;
  // The content of /config.js: the mode the frontend starts in. Without it, the one in dist is served.
  configJs?: string;
  alCerrar?: () => void | Promise<void>;
};

export type Studio = {
  servidor: http.Server;
  puerto: number;
  url: string; // with the token: the one that is printed and opened
  cerrar: () => Promise<void>;
};

// ─── Filter utilities ───────────────────────────────────────────────────────
// A header's values as they arrived. Node drops duplicate Host headers when building req.headers (it keeps
// the first), so counting repetitions requires looking at rawHeaders.
function valoresDe(req: http.IncomingMessage, nombre: string): string[] {
  const valores: string[] = [];
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i]!.toLowerCase() === nombre) valores.push(req.rawHeaders[i + 1]!);
  }
  return valores;
}

// The interface language the frontend sends: a single header, exactly "es" or "en". Anything else
// (repeated, empty, "fr", "EN-us") does not count, and the request goes on with the default language.
export function idiomaDePeticion(req: http.IncomingMessage): Idioma | null {
  const valores = valoresDe(req, CABECERA_DE_IDIOMA);
  return valores.length === 1 && (valores[0] === "es" || valores[0] === "en") ? valores[0] : null;
}

// timingSafeEqual throws if the lengths differ, so they are compared first. Knowing the length helps no one
// (both secrets are always 43 characters) and it means the call never throws.
export function igualesEnTiempoConstante(dado: string, esperado: string): boolean {
  const a = Buffer.from(dado, "utf-8");
  const b = Buffer.from(esperado, "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function secreto(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// The request's cookies with that name. A cookie without "=" or a repeated one is not a valid session.
function valoresDeCookie(req: http.IncomingMessage, nombre: string): string[] | null {
  const valores: string[] = [];
  for (const cabecera of valoresDe(req, "cookie")) {
    for (const parte of cabecera.split(";")) {
      const pieza = parte.trim();
      if (!pieza) continue;
      const igual = pieza.indexOf("=");
      if (igual === -1) {
        if (pieza === nombre) return null;
        continue;
      }
      if (pieza.slice(0, igual).trim() === nombre) valores.push(pieza.slice(igual + 1).trim());
    }
  }
  return valores;
}

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

function cabecerasComunes(res: http.ServerResponse): void {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function enviar(res: http.ServerResponse, estado: number, cuerpo: string | Buffer, tipo = "text/plain; charset=utf-8", extra: Record<string, string> = {}): void {
  if (res.headersSent) return;
  res.writeHead(estado, { "Content-Type": tipo, "Content-Length": Buffer.byteLength(cuerpo), ...extra });
  res.end(cuerpo);
}

function enviarJson(res: http.ServerResponse, estado: number, valor: unknown): void {
  enviar(res, estado, JSON.stringify(valor), "application/json; charset=utf-8", { "Cache-Control": "no-store" });
}

// The path of a static file, or null if it is not a path in dist. Each segment is decoded ONCE and validated
// as a portable name: a decoded %2F or %5C, a NUL, "..", ":" (NTFS's ::$DATA alternate streams) or a Windows
// reserved name are rejected; anything starting with a dot is not served either. Then the real path must
// fall inside dist (a link or an 8.3 short name leading outside does not count).
export function rutaDeEstatico(dist: string, pathname: string): string | null {
  const crudos = pathname.split("/").slice(1);
  if (crudos.length === 1 && crudos[0] === "") return path.join(dist, "index.html");
  const segmentos: string[] = [];
  for (const crudo of crudos) {
    let segmento: string;
    try {
      segmento = decodeURIComponent(crudo);
    } catch {
      return null;
    }
    try {
      validarSegmento(segmento, "ruta");
    } catch {
      return null;
    }
    if (segmento.startsWith(".")) return null;
    segmentos.push(segmento);
  }
  const ruta = path.join(dist, ...segmentos);
  try {
    if (!estaDentroReal(dist, ruta)) return null;
    return fs.statSync(ruta, { throwIfNoEntry: false })?.isFile() ? ruta : null;
  } catch {
    return null;
  }
}

// Reads the body, cutting it off as it arrives: with an oversized Content-Length, without reading anything;
// otherwise as soon as what was received passes the limit. Returns the text, or the rejection status.
function leerCuerpo(req: http.IncomingMessage): Promise<{ texto: string } | { estado: 413 | 400 }> {
  return new Promise((resolver) => {
    const declarado = Number(req.headers["content-length"] ?? "0");
    if (Number.isFinite(declarado) && declarado > CUERPO_MAXIMO) {
      resolver({ estado: 413 });
      return;
    }
    const partes: Buffer[] = [];
    let total = 0;
    let terminado = false;
    req.on("data", (trozo: Buffer) => {
      if (terminado) return;
      total += trozo.length;
      if (total > CUERPO_MAXIMO) {
        terminado = true;
        req.pause();
        resolver({ estado: 413 });
        return;
      }
      partes.push(trozo);
    });
    req.on("end", () => {
      if (terminado) return;
      terminado = true;
      resolver({ texto: Buffer.concat(partes).toString("utf-8") });
    });
    req.on("error", () => {
      if (terminado) return;
      terminado = true;
      resolver({ estado: 400 });
    });
  });
}

// After a 413 it stops reading: it responds and closes the connection.
function rechazarCuerpo(res: http.ServerResponse, estado: 413 | 400, req: http.IncomingMessage): void {
  const texto = estado === 413 ? mensaje("STUDIO-FILTRO-CUERPO-GRANDE", { kb: CUERPO_MAXIMO / 1024 }) : mensaje("STUDIO-FILTRO-CUERPO-ILEGIBLE");
  res.writeHead(estado, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(texto), Connection: "close" });
  res.end(texto, () => req.socket.destroy());
}

// ─── The server ─────────────────────────────────────────────────────────────
export async function arrancarStudio(opciones: OpcionesStudio = {}): Promise<Studio> {
  const dist = opciones.dist ?? carpetaDist();
  let token: string | null = secreto();
  const sesion = secreto();
  let puerto = 0;

  const atender = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    cabecerasComunes(res);
    const permitidos = [`${HOST}:${puerto}`, `localhost:${puerto}`];

    // 1. Host: exactly one, and exactly one of the two names with this port.
    const hosts = valoresDe(req, "host");
    if (hosts.length !== 1 || !permitidos.includes(hosts[0]!)) {
      enviar(res, 421, mensaje("STUDIO-FILTRO-HOST"));
      return;
    }

    // 2. Origin: if present, exactly one and from this same Studio ("null" is not).
    const origenes = valoresDe(req, "origin");
    if (origenes.length > 1 || (origenes.length === 1 && !permitidos.map((h) => `http://${h}`).includes(origenes[0]!))) {
      enviar(res, 403, mensaje("STUDIO-FILTRO-ORIGEN"));
      return;
    }

    // The path as it arrived, not normalized: the WHATWG URL parser turns %2e%2e into ".." and drops segments
    // before anyone validates them. Here each segment is decoded exactly once, where it is used, and
    // validated afterwards.
    const crudo = req.url ?? "";
    if (!crudo.startsWith("/")) {
      enviar(res, 400, mensaje("STUDIO-FILTRO-MAL-FORMADA"));
      return;
    }
    const corte = crudo.indexOf("?");
    const url = { pathname: corte === -1 ? crudo : crudo.slice(0, corte), searchParams: new URLSearchParams(corte === -1 ? "" : crudo.slice(corte + 1)) };
    const metodo = req.method ?? "";

    // 3. Exchanging the token for the cookie. Single use: a copy from the browser history no longer works.
    if (metodo === "GET" && url.pathname === "/" && url.searchParams.has("token")) {
      const dados = url.searchParams.getAll("token");
      if (token === null || dados.length !== 1 || !igualesEnTiempoConstante(dados[0]!, token)) {
        enviar(res, 401, mensaje("STUDIO-FILTRO-ENLACE-USADO"));
        return;
      }
      token = null;
      res.writeHead(303, {
        Location: "/",
        "Set-Cookie": `${nombreDeCookie(puerto)}=${sesion}; HttpOnly; SameSite=Strict; Path=/`,
        "Cache-Control": "no-store",
        "Content-Length": "0",
      });
      res.end();
      return;
    }

    // 4. The API requires the session.
    const esApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (esApi) {
      const cookies = valoresDeCookie(req, nombreDeCookie(puerto));
      if (!cookies || cookies.length !== 1 || !igualesEnTiempoConstante(cookies[0]!, sesion)) {
        res.setHeader("Cache-Control", "no-store");
        enviar(res, 401, mensaje("STUDIO-FILTRO-SIN-SESION"));
        return;
      }
    }

    // 5. A method other than GET: the custom header (which forces a preflight that is never granted) and a
    // bounded JSON body.
    let cuerpo: unknown;
    if (metodo !== "GET") {
      const marca = valoresDe(req, "x-phase-gate");
      if (marca.length !== 1 || marca[0] !== "1") {
        enviar(res, 403, mensaje("STUDIO-FILTRO-SIN-CABECERA"));
        return;
      }
      const leido = await leerCuerpo(req);
      if ("estado" in leido) {
        rechazarCuerpo(res, leido.estado, req);
        return;
      }
      if (leido.texto.trim()) {
        try {
          cuerpo = JSON.parse(leido.texto);
        } catch {
          enviarJson(res, 400, { error: mensaje("STUDIO-JSON-INVALIDO", {}, idiomaDePeticion(req) ?? undefined) });
          return;
        }
      }
    }

    if (esApi) {
      const idioma = idiomaDePeticion(req);
      if (!opciones.api) {
        enviarJson(res, 404, { error: mensaje("STUDIO-RUTA-NO-EXISTE", {}, idioma ?? undefined) });
        return;
      }
      const api = opciones.api;
      const peticion: PeticionApi = { metodo, ruta: url.pathname.slice("/api".length) || "/", consulta: url.searchParams, cuerpo, req };
      try {
        const respuesta = await (idioma ? enIdioma(idioma, () => api(peticion, res)) : api(peticion, res));
        if (respuesta !== "manejada") enviarJson(res, respuesta.estado, respuesta.json);
      } catch {
        enviarJson(res, 500, { error: mensaje("STUDIO-ERROR-INTERNO-DEL-STUDIO", {}, idioma ?? undefined) });
      }
      return;
    }

    // 6. Static files, GET only.
    if (metodo !== "GET") {
      enviar(res, 405, mensaje("STUDIO-FILTRO-METODO"), undefined, { Allow: "GET" });
      return;
    }
    if (url.pathname === "/config.js" && opciones.configJs !== undefined) {
      enviar(res, 200, opciones.configJs, TIPOS[".js"]);
      return;
    }
    const ruta = rutaDeEstatico(dist, url.pathname);
    if (!ruta) {
      enviar(res, 404, mensaje("STUDIO-FILTRO-NO-EXISTE"));
      return;
    }
    let contenido: Buffer;
    try {
      contenido = fs.readFileSync(ruta);
    } catch {
      enviar(res, 404, mensaje("STUDIO-FILTRO-NO-EXISTE"));
      return;
    }
    enviar(res, 200, contenido, TIPOS[path.extname(ruta).toLowerCase()] ?? "application/octet-stream");
  };

  // requireHostHeader: false so a request without Host reaches the filter (and gets its 421) instead of
  // Node's 400: a single authority decides.
  const servidor = http.createServer({ requireHostHeader: false }, (req, res) => {
    atender(req, res).catch(() => enviar(res, 500, mensaje("STUDIO-FILTRO-INTERNO")));
  });
  // A slow client cannot hold a connection: headers within 10 s and the whole request within 15 s. It does
  // not affect the SSE, which is a long response to a short request.
  servidor.headersTimeout = 10_000;
  servidor.requestTimeout = 15_000;

  await new Promise<void>((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(opciones.puerto ?? 0, HOST, () => {
      servidor.off("error", rechazar);
      resolver();
    });
  });
  puerto = (servidor.address() as AddressInfo).port;

  const cerrar = async (): Promise<void> => {
    await opciones.alCerrar?.();
    servidor.closeAllConnections();
    await new Promise<void>((resolver) => servidor.close(() => resolver()));
  };

  return { servidor, puerto, url: `http://${HOST}:${puerto}/?token=${token}`, cerrar };
}

// ─── Opening the browser ────────────────────────────────────────────────────
// The URL may only contain these characters: on Windows it goes through `cmd /c start`, where an & would
// split the command. The token is base64url, so it always passes.
export const URL_ABRIBLE = /^[A-Za-z0-9:/?=._-]+$/;

export type Lanzador = (comando: string, args: string[], opciones: { windowsHide: boolean }, alTerminar: (error: Error | null) => void) => unknown;

export function abrir(url: string, plataforma: NodeJS.Platform = process.platform, lanzar: Lanzador = execFile as unknown as Lanzador): boolean {
  if (!URL_ABRIBLE.test(url)) return false;
  const [comando, args]: [string, string[]] =
    plataforma === "win32" ? ["cmd", ["/c", "start", "", url]] : plataforma === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  lanzar(comando, args, { windowsHide: true }, () => {});
  return true;
}

// ─── `mcp-phase-gate ui` ────────────────────────────────────────────────────
// Starts, prints the link, opens it (unless --no-abrir) and stays in the foreground until Ctrl+C.
export async function lanzarStudio(opciones: OpcionesUi, salida: Salida, abrirNavegador: (url: string) => boolean = abrir): Promise<number> {
  // What is printed in the terminal, and the demo: in the language requested with --idioma; without it, the
  // messages' language (PHASE_GATE_LANG or the system's). The server cannot know which language the browser
  // will resolve.
  const idiomaDeLaTerminal = opciones.idioma ?? idiomaDeMensajes();
  let studio: Studio;
  // With --demo, the whole process works on the demo: its PHASE_GATE_* variables replace those of whoever
  // launches it before anything is read, and init-cliente writes into the demo's home.
  let demo: CarpetasDeDemo | null = null;
  if (opciones.demo) {
    try {
      const preparada = await prepararDemo(idiomaDeLaTerminal);
      demo = preparada.carpetas;
      if (!preparada.reutilizada) salida.out(mensaje("UI-DEMO-GENERADA", { raiz: demo.raiz }, idiomaDeLaTerminal));
    } catch (error) {
      salida.err(mensaje("UI-DEMO-FALLO", { detalle: error instanceof Error ? error.message : String(error) }, idiomaDeLaTerminal));
      return 1;
    }
    activarDemo(demo);
  }
  const eventos = crearEventos();
  // Expired sessions, or those with a dead pid, are deleted at startup and every minute, never inside a
  // GET: reading the API does not write to disk.
  sesionesAbiertas({ borrar: true });
  const limpieza = setInterval(() => sesionesAbiertas({ borrar: true }), INTERVALO_MS);
  limpieza.unref();
  const parar = (): void => {
    clearInterval(limpieza);
    eventos.cerrar();
  };
  try {
    const enDemo = demo;
    const api = crearApi({
      modo: enDemo ? "demo" : "vivo",
      watcher: eventos.estado,
      sesiones: () => sesionesAbiertas(),
      entornoInit: () => (enDemo ? entornoInitDeDemo(enDemo) : entornoInitDelProceso(ejecutarComando)),
      eventos: (peticion, res) => eventos.manejar(peticion.req, res),
    });
    // The banner goes out in both languages: PG_BANDA in Spanish (the original) and the folder separately, so
    // the frontend can say it in the interface's language.
    const configJs = enDemo
      ? `window.PG_MODO = "demo";\nwindow.PG_BANDA = ${JSON.stringify(`Demo: datos de ejemplo en ${enDemo.raiz}`)};\nwindow.PG_DEMO_RAIZ = ${JSON.stringify(enDemo.raiz)};\n`
      : undefined;
    studio = await arrancarStudio({ puerto: opciones.puerto, api, alCerrar: parar, ...(configJs ? { configJs } : {}) });
  } catch (error) {
    parar();
    const codigo = (error as NodeJS.ErrnoException)?.code;
    salida.err(
      codigo === "EADDRINUSE"
        ? mensaje("UI-PUERTO-OCUPADO", { puerto: opciones.puerto }, idiomaDeLaTerminal)
        : mensaje("UI-NO-ARRANCA", { detalle: error instanceof Error ? error.message : String(error) }, idiomaDeLaTerminal)
    );
    return 1;
  }

  salida.out(mensaje("UI-EN-MARCHA", { url: studio.url }, idiomaDeLaTerminal));
  salida.out(mensaje("UI-ENLACE-UNA-VEZ", {}, idiomaDeLaTerminal));
  if (opciones.abrir && !abrirNavegador(studio.url)) salida.err(mensaje("UI-SIN-NAVEGADOR", {}, idiomaDeLaTerminal));

  await new Promise<void>((resolver) => {
    const parar = (): void => {
      process.off("SIGINT", parar);
      process.off("SIGTERM", parar);
      resolver();
    };
    process.on("SIGINT", parar);
    process.on("SIGTERM", parar);
  });
  await studio.cerrar();
  return 0;
}
