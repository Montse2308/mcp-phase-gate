// El Studio: una interfaz local que solo VE el estado del orquestador y ejecuta acciones de
// configuración que ya existían en el CLI (§7 del plan maestro v3). Es otro proceso: el servidor MCP
// por stdio nunca carga este módulo. Solo lo carga `mcp-phase-gate ui`, con un import dinámico
// (cli.ts), y ningún archivo de src/ fuera de src/studio/ lo importa (test/aislamiento.test.ts).
//
// Un servidor HTTP en 127.0.0.1 es una superficie que el servidor por stdio no tenía: cualquier web
// abierta en el navegador puede intentar hablarle, y cualquier proceso del equipo puede conectarse.
// Cada petición pasa por este filtro, en este orden (§7.3):
//
//   1. Host exacto `127.0.0.1:<puerto>` o `localhost:<puerto>`, una sola vez     → 421 (DNS rebinding)
//   2. Origin, si viene, exacto `http://127.0.0.1:<puerto>` o `localhost`       → 403 (otra web)
//   3. `GET /?token=<t>`: el token de este arranque, de un solo uso, por cookie → 303 / 401
//   4. `/api/**` exige la cookie de sesión                                      → 401
//   5. Un método distinto de GET exige `X-Phase-Gate: 1` y un cuerpo JSON de
//      hasta 64 kB; la cabecera obliga a un preflight CORS que nunca se concede → 403 / 413
//   6. Los estáticos se sirven solo desde studio/dist, con la ruta real dentro  → 404
//
// Toda respuesta lleva la CSP sin 'unsafe-inline', nosniff y no-referrer.

import { execFile } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import type { AddressInfo } from "net";
import * as path from "path";

import type { OpcionesUi, Salida } from "../cli.js";
import { raizPaquete } from "../config.js";
import { ejecutarComando } from "../init.js";
import { estaDentroReal, validarSegmento } from "../paths.js";
import { crearApi, entornoInitDelProceso } from "./api.js";
import { crearEventos } from "./eventos.js";

export const HOST = "127.0.0.1";
export const CUERPO_MAXIMO = 64 * 1024;
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

// La cookie lleva el puerto en el nombre: un navegador no separa las cookies por puerto (RFC 6265,
// §8.5), así que con dos Studios abiertos a la vez (`ui` y `ui --demo`) el segundo canje pisaría la
// sesión del primero.
export function nombreDeCookie(puerto: number): string {
  return `pg_sesion_${puerto}`;
}

export function carpetaDist(): string {
  return path.join(raizPaquete(), "studio", "dist");
}

// ─── Lo que el Studio añade encima del filtro ───────────────────────────────
// La API (L02) y los eventos (L03) se enchufan aquí: el filtro ya comprobó Host, Origin y la cookie,
// y para un método distinto de GET, la cabecera y el cuerpo (ya leído y parseado).
export type PeticionApi = {
  metodo: string;
  ruta: string; // sin el prefijo /api, p. ej. "/proyectos"
  consulta: URLSearchParams;
  cuerpo: unknown; // undefined en un GET
  req: http.IncomingMessage;
};
export type RespuestaApi = { estado: number; json: unknown };
// "manejada": la respuesta ya se escribió (el SSE).
export type ManejadorApi = (peticion: PeticionApi, res: http.ServerResponse) => Promise<RespuestaApi | "manejada">;

export type OpcionesStudio = {
  puerto?: number | null; // null o 0: uno libre
  dist?: string; // por defecto <paquete>/studio/dist
  api?: ManejadorApi;
  // El contenido de /config.js: el modo en que arranca el frontend. Sin él, se sirve el de dist.
  configJs?: string;
  alCerrar?: () => void | Promise<void>;
};

export type Studio = {
  servidor: http.Server;
  puerto: number;
  url: string; // con el token: la que se imprime y se abre
  cerrar: () => Promise<void>;
};

// ─── Utilidades del filtro ──────────────────────────────────────────────────
// Los valores de una cabecera tal como llegaron. Node descarta los duplicados de Host al armar
// req.headers (se queda con el primero), así que contar repeticiones exige mirar rawHeaders.
function valoresDe(req: http.IncomingMessage, nombre: string): string[] {
  const valores: string[] = [];
  for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i]!.toLowerCase() === nombre) valores.push(req.rawHeaders[i + 1]!);
  }
  return valores;
}

// timingSafeEqual lanza si las longitudes difieren: se comparan antes. Saber la longitud no ayuda a
// nadie (los dos secretos miden siempre 43 caracteres) y así nunca se llega a lanzar.
export function igualesEnTiempoConstante(dado: string, esperado: string): boolean {
  const a = Buffer.from(dado, "utf-8");
  const b = Buffer.from(esperado, "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function secreto(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// Las cookies de la petición con ese nombre. Una cookie sin "=" o repetida no es una sesión válida.
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

// La ruta de un estático, o null si no es una ruta de dist. Cada segmento se decodifica UNA vez y se
// valida como un nombre portable: un %2F o un %5C decodificados, un NUL, "..", ":" (los flujos
// alternos ::$DATA de NTFS) o un nombre reservado de Windows quedan fuera; lo que empieza por punto
// tampoco se sirve. Después, la ruta real tiene que quedar dentro de dist (un enlace o un nombre
// corto 8.3 que lleve fuera no vale).
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

// Lee el cuerpo cortándolo mientras llega: con un Content-Length de más, sin leer nada; si no, en
// cuanto lo recibido pasa del límite. Devuelve el texto, o el estado del rechazo.
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

// Tras un 413 no se sigue leyendo: se responde y se cierra la conexión.
function rechazarCuerpo(res: http.ServerResponse, estado: 413 | 400, req: http.IncomingMessage): void {
  const texto = estado === 413 ? `El cuerpo pasa de ${CUERPO_MAXIMO / 1024} kB.` : "El cuerpo no se pudo leer.";
  res.writeHead(estado, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(texto), Connection: "close" });
  res.end(texto, () => req.socket.destroy());
}

// ─── El servidor ────────────────────────────────────────────────────────────
export async function arrancarStudio(opciones: OpcionesStudio = {}): Promise<Studio> {
  const dist = opciones.dist ?? carpetaDist();
  let token: string | null = secreto();
  const sesion = secreto();
  let puerto = 0;

  const atender = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    cabecerasComunes(res);
    const permitidos = [`${HOST}:${puerto}`, `localhost:${puerto}`];

    // 1. Host: exactamente uno, y exactamente uno de los dos nombres con este puerto.
    const hosts = valoresDe(req, "host");
    if (hosts.length !== 1 || !permitidos.includes(hosts[0]!)) {
      enviar(res, 421, "Host no permitido: el Studio solo atiende en 127.0.0.1 y localhost, con su puerto.");
      return;
    }

    // 2. Origin: si viene, exactamente uno y de este mismo Studio ("null" no lo es).
    const origenes = valoresDe(req, "origin");
    if (origenes.length > 1 || (origenes.length === 1 && !permitidos.map((h) => `http://${h}`).includes(origenes[0]!))) {
      enviar(res, 403, "Origen no permitido.");
      return;
    }

    // La ruta tal como llegó, sin normalizar: el analizador WHATWG de URL convierte %2e%2e en ".." y
    // quita segmentos antes de que nadie los valide. Aquí cada segmento se decodifica una sola vez,
    // donde se usa, y se valida después.
    const crudo = req.url ?? "";
    if (!crudo.startsWith("/")) {
      enviar(res, 400, "Petición mal formada.");
      return;
    }
    const corte = crudo.indexOf("?");
    const url = { pathname: corte === -1 ? crudo : crudo.slice(0, corte), searchParams: new URLSearchParams(corte === -1 ? "" : crudo.slice(corte + 1)) };
    const metodo = req.method ?? "";

    // 3. El canje del token por la cookie. De un solo uso: la copia del historial ya no sirve.
    if (metodo === "GET" && url.pathname === "/" && url.searchParams.has("token")) {
      const dados = url.searchParams.getAll("token");
      if (token === null || dados.length !== 1 || !igualesEnTiempoConstante(dados[0]!, token)) {
        enviar(res, 401, "Este enlace no vale o ya se usó. Vuelve a lanzar `mcp-phase-gate ui` y abre el enlace nuevo.");
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

    // 4. La API exige la sesión.
    const esApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    if (esApi) {
      const cookies = valoresDeCookie(req, nombreDeCookie(puerto));
      if (!cookies || cookies.length !== 1 || !igualesEnTiempoConstante(cookies[0]!, sesion)) {
        res.setHeader("Cache-Control", "no-store");
        enviar(res, 401, "Falta la sesión: abre el enlace que imprimió `mcp-phase-gate ui`.");
        return;
      }
    }

    // 5. Un método distinto de GET: la cabecera propia (que fuerza un preflight que nunca se concede)
    // y un cuerpo JSON acotado.
    let cuerpo: unknown;
    if (metodo !== "GET") {
      const marca = valoresDe(req, "x-phase-gate");
      if (marca.length !== 1 || marca[0] !== "1") {
        enviar(res, 403, "Falta la cabecera X-Phase-Gate.");
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
          enviarJson(res, 400, { error: "El cuerpo no es un JSON válido." });
          return;
        }
      }
    }

    if (esApi) {
      if (!opciones.api) {
        enviarJson(res, 404, { error: "No existe esa ruta de la API." });
        return;
      }
      try {
        const respuesta = await opciones.api({ metodo, ruta: url.pathname.slice("/api".length) || "/", consulta: url.searchParams, cuerpo, req }, res);
        if (respuesta !== "manejada") enviarJson(res, respuesta.estado, respuesta.json);
      } catch {
        enviarJson(res, 500, { error: "Error interno del Studio." });
      }
      return;
    }

    // 6. Estáticos, solo con GET.
    if (metodo !== "GET") {
      enviar(res, 405, "Método no permitido.", undefined, { Allow: "GET" });
      return;
    }
    if (url.pathname === "/config.js" && opciones.configJs !== undefined) {
      enviar(res, 200, opciones.configJs, TIPOS[".js"]);
      return;
    }
    const ruta = rutaDeEstatico(dist, url.pathname);
    if (!ruta) {
      enviar(res, 404, "No existe.");
      return;
    }
    let contenido: Buffer;
    try {
      contenido = fs.readFileSync(ruta);
    } catch {
      enviar(res, 404, "No existe.");
      return;
    }
    enviar(res, 200, contenido, TIPOS[path.extname(ruta).toLowerCase()] ?? "application/octet-stream");
  };

  // requireHostHeader: false para que una petición sin Host llegue al filtro (y dé su 421) en vez de
  // un 400 de Node: una sola autoridad decide.
  const servidor = http.createServer({ requireHostHeader: false }, (req, res) => {
    atender(req, res).catch(() => enviar(res, 500, "Error interno del Studio."));
  });
  // Un cliente lento no retiene una conexión: cabeceras en 10 s y la petición entera en 15 s. No
  // afecta al SSE, que es una respuesta larga a una petición corta.
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

// ─── Abrir el navegador ─────────────────────────────────────────────────────
// La URL solo puede llevar estos caracteres: en Windows pasa por `cmd /c start`, donde un & partiría
// el comando (validación V10). El token es base64url, así que siempre pasa.
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
// Arranca, imprime el enlace, lo abre (salvo --no-abrir) y se queda en primer plano hasta Ctrl+C.
export async function lanzarStudio(opciones: OpcionesUi, salida: Salida, abrirNavegador: (url: string) => boolean = abrir): Promise<number> {
  let studio: Studio;
  const eventos = crearEventos();
  try {
    const api = crearApi({
      modo: "vivo",
      watcher: eventos.estado,
      sesiones: () => [],
      entornoInit: () => entornoInitDelProceso(ejecutarComando),
      eventos: (peticion, res) => eventos.manejar(peticion.req, res),
    });
    studio = await arrancarStudio({ puerto: opciones.puerto, api, alCerrar: () => eventos.cerrar() });
  } catch (error) {
    eventos.cerrar();
    const codigo = (error as NodeJS.ErrnoException)?.code;
    salida.err(codigo === "EADDRINUSE" ? `El puerto ${opciones.puerto} ya está en uso: elige otro con --puerto, o déjalo libre.` : `No se pudo arrancar el Studio: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  salida.out(`Studio de mcp-phase-gate en ${studio.url}`);
  salida.out("El enlace sirve una sola vez: ábrelo en tu navegador. Ctrl+C para cerrar.");
  if (opciones.abrir && !abrirNavegador(studio.url)) salida.err("No se pudo abrir el navegador: copia el enlace.");

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
