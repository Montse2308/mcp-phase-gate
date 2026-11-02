// El fixture de los E2E: un `ui --no-abrir` de verdad (el binario compilado) sobre el árbol de fixtures,
// con las cuatro PHASE_GATE_* en carpetas temporales; el token se canjea una vez y cada página recibe la
// cookie. Cada página registra sus peticiones y su consola: al terminar, ninguna petición puede salir de
// 127.0.0.1 ni puede haber errores (tampoco violaciones de la CSP).

import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

import { crearArbol } from "./arbol";
import { entornoFalso, huellaDeLosClientesReales } from "./entorno";
import type { EntornoFalso } from "./entorno";
import type { Arbol } from "./arbol";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const BINARIO = path.join(AQUI, "..", "..", "build", "index.js");

export type Servidor = { origen: string; puerto: number; cookie: { name: string; value: string }; arbol: Arbol; falso: EntornoFalso };

// El entorno del proceso sin lo que diría dónde está el usuario de verdad (eso lo pone entornoFalso) ni las
// variables PHASE_GATE_* y ORQUESTADOR_* de quien lo corre: Ajustes las enseña, y lo que vale en este equipo no
// tiene que valer en otro.
function entornoDeUi(arbol: Arbol, falso: EntornoFalso): NodeJS.ProcessEnv {
  const fuera = new Set(["PATH", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME"]);
  const base = Object.fromEntries(Object.entries(process.env).filter(([clave]) => !fuera.has(clave.toUpperCase()) && !/^(?:PHASE_GATE_|ORQUESTADOR_)/i.test(clave)));
  // El .env de la raíz del paquete solo rellena lo que el entorno no define, y una ruta vacía cuenta como no
  // definida: así el .env de quien corre las pruebas no le da rutas a un Studio que no debe tenerlas.
  const sinRutas = Object.fromEntries(["DOCS_PATH", "REPOS_PATH", "PROMPTS_PATH"].flatMap((v) => [[`PHASE_GATE_${v}`, ""], [`ORQUESTADOR_${v}`, ""]]));
  return { ...base, ...sinRutas, ...falso.env, ...arbol.env };
}

function esperarUrl(hijo: ChildProcess): Promise<string> {
  return new Promise((resolver, rechazar) => {
    let salida = "";
    const plazo = setTimeout(() => rechazar(new Error(`ui no imprimió su enlace: ${salida}`)), 20_000);
    hijo.stdout!.on("data", (d: Buffer) => {
      salida += d.toString("utf-8");
      const m = salida.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);
      if (m) {
        clearTimeout(plazo);
        resolver(m[0]);
      }
    });
    hijo.on("exit", (codigo) => rechazar(new Error(`ui terminó con ${codigo}: ${salida}`)));
  });
}

export async function lanzarUi(arbol: Arbol, extra: string[] = []): Promise<{ hijo: ChildProcess; servidor: Servidor }> {
  const falso = entornoFalso(arbol.raiz);
  const hijo = spawn(process.execPath, [BINARIO, "ui", "--no-abrir", ...extra], { env: entornoDeUi(arbol, falso), stdio: ["ignore", "pipe", "pipe"] });
  hijo.stderr!.on("data", () => {});
  const url = new URL(await esperarUrl(hijo));
  const canje = await fetch(url, { redirect: "manual" });
  expect(canje.status).toBe(303);
  const [par = ""] = (canje.headers.get("set-cookie") ?? "").split(";");
  const [name = "", value = ""] = par.split("=");
  return { hijo, servidor: { origen: url.origin, puerto: Number(url.port), cookie: { name, value }, arbol, falso } };
}

// `permitidos`: mensajes de consola que una prueba concreta espera (y que no cuentan como error).
export type Registro = { peticiones: string[]; ajenas: string[]; errores: string[]; permitidos: RegExp[]; vistos: string[] };

export const test = base.extend<{ registro: Registro }, { servidor: Servidor }>({
  servidor: [
    async ({}, use) => {
      const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-"));
      const reales = huellaDeLosClientesReales();
      const arbol = await crearArbol(raiz);
      const { hijo, servidor } = await lanzarUi(arbol);
      await use(servidor);
      hijo.kill();
      await new Promise((r) => (hijo.exitCode !== null ? r(null) : hijo.on("exit", r)));
      expect(huellaDeLosClientesReales(), "la configuración real de los clientes no cambió").toEqual(reales);
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: "worker" },
  ],
  registro: async ({}, use) => {
    await use({ peticiones: [], ajenas: [], errores: [], permitidos: [], vistos: [] });
  },
  page: async ({ page, context, servidor, registro }, use, info) => {
    await context.addCookies([{ ...servidor.cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict", secure: false }]);
    page.on("request", (peticion) => {
      const url = peticion.url();
      if (url.startsWith("data:")) return; // no sale a la red
      registro.peticiones.push(url);
      if (!url.startsWith(`${servidor.origen}/`)) registro.ajenas.push(url);
    });
    page.on("console", (mensaje) => {
      const texto = mensaje.text();
      if (mensaje.type() !== "error" && !/Content Security Policy/i.test(texto)) return;
      if (registro.permitidos.some((p) => p.test(texto))) registro.vistos.push(texto);
      else registro.errores.push(texto);
    });
    page.on("pageerror", (error) => registro.errores.push(error.message));
    await use(page);
    console.log(`[peticiones] ${info.title}: ${registro.peticiones.length}, todas a ${servidor.origen.replace(/:\d+$/, "")}: ${registro.ajenas.length === 0 ? "sí" : "NO"}`);
    expect(registro.ajenas, "ninguna petición sale de 127.0.0.1").toEqual([]);
    expect(registro.errores, "sin errores ni violaciones de la CSP en la consola").toEqual([]);
  },
});

export { expect };

const requerir = createRequire(import.meta.url);
const AXE = fs.readFileSync(requerir.resolve("axe-core/axe.min.js"), "utf-8");

// axe-core sin violaciones serious ni critical. Se inyecta por el protocolo de depuración (page.evaluate),
// que no pasa por la CSP de la página: la página sigue sin admitir scripts en línea.
export async function sinViolacionesGraves(page: Page, contexto: string): Promise<void> {
  await page.evaluate(AXE);
  const violaciones = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodos: v.nodes.map((n) => n.target.join(" ")).slice(0, 3) }));
  });
  expect(violaciones.filter((v) => v.impact === "serious" || v.impact === "critical"), `axe en ${contexto}`).toEqual([]);
}

export async function sinDesbordamiento(page: Page, contexto: string): Promise<void> {
  const { ancho, vista } = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth }));
  expect(ancho, `desbordamiento horizontal en ${contexto}`).toBeLessThanOrEqual(vista);
}

// Cada estado lleva su forma y su texto: ninguno va solo con color. Mira cada indicador de estado (o, con otro
// selector, cada elemento que haga de uno, como la leyenda de la Bitácora) y falla si no encuentra ninguno: así
// la prueba no pasa en vacío.
export async function ningunEstadoSoloColor(page: Page, selector = ".indicador"): Promise<void> {
  const { total, malos } = await page.evaluate((sel) => {
    const estados = [...document.querySelectorAll(sel)];
    const malos = estados
      .filter((estado) => {
        const copia = estado.cloneNode(true) as HTMLElement;
        copia.querySelectorAll("svg").forEach((s) => s.remove());
        return estado.querySelector("svg.marca") === null || copia.textContent!.trim() === "";
      })
      .map((estado) => estado.outerHTML.slice(0, 120));
    return { total: estados.length, malos };
  }, selector);
  expect(total, `no hay ningún ${selector} en la página: la prueba no vería nada`).toBeGreaterThan(0);
  expect(malos, `${selector} sin forma o sin texto`).toEqual([]);
}

// Las tarjetas de fase de un Tablero y las filas de su tabla de lotes (sin la cabecera). Los nombres de la
// lista y de la tabla cambian con el idioma.
export function fasesDeLaTarea(page: Page, nombre = "Fases de la tarea") {
  return page.getByRole("list", { name: nombre }).getByRole("listitem");
}

export function lotesDeLaFase(page: Page, nombre = "Lotes de la Fase 4") {
  return page.getByRole("table", { name: nombre }).locator("tbody").getByRole("row");
}

// El botón del tema se llama «Tema oscuro» (o «Dark theme») y está pulsado cuando el tema activo es el oscuro,
// sea por la elección guardada o por el sistema. Después de pulsarlo, el tema se comprueba en el estilo.
export async function ponerTema(page: Page, tema: "claro" | "oscuro"): Promise<void> {
  const boton = page.getByRole("button", { name: /^(?:Tema oscuro|Dark theme)$/ });
  if ((await boton.getAttribute("aria-pressed")) !== String(tema === "oscuro")) await boton.click();
  await expect(boton).toHaveAttribute("aria-pressed", String(tema === "oscuro"));
  await expect(page.locator("html")).toHaveCSS("color-scheme", tema === "oscuro" ? "dark" : "light");
}

// El sitio estático: `ui --export-static` del binario compilado, como en el workflow de Pages, servido bajo un
// subdirectorio (/mcp-phase-gate/) por un servidor de archivos sin nada más, como GitHub Pages: sin API, sin SSE
// y sin CSP. Todo lo que pide la página fuera del subdirectorio es un 404. La demo vive en demo/, como en el sitio.
export const PREFIJO = "/mcp-phase-gate/";
export const PREFIJO_DE_LA_DEMO = `${PREFIJO}demo/`;
const TIPOS: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };

export function servirCarpeta(raiz: string): Promise<{ servidor: http.Server; puerto: number }> {
  const servidor = http.createServer((req, res) => {
    const crudo = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (crudo === PREFIJO.slice(0, -1)) {
      res.writeHead(301, { Location: PREFIJO }).end();
      return;
    }
    if (!crudo.startsWith(PREFIJO)) {
      res.writeHead(404).end();
      return;
    }
    // Una carpeta (la raíz del sitio, demo/, es/) sirve su index.html, como GitHub Pages.
    const pedida = crudo.slice(PREFIJO.length);
    const relativa = pedida === "" || pedida.endsWith("/") ? `${pedida}index.html` : pedida;
    const ruta = path.resolve(raiz, relativa);
    if (path.relative(raiz, ruta).startsWith("..") || !fs.statSync(ruta, { throwIfNoEntry: false })?.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] ?? "application/octet-stream" }).end(fs.readFileSync(ruta));
  });
  return new Promise((resolver) => servidor.listen(0, "127.0.0.1", () => resolver({ servidor, puerto: (servidor.address() as { port: number }).port })));
}

export const testEstatico = test.extend<{}, { servidor: Servidor }>({
  servidor: [
    async ({}, use) => {
      const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-estatico-"));
      const carpetas = ["docs", "repos", "estado", "config"].map((n) => path.join(raiz, n));
      for (const c of carpetas) fs.mkdirSync(c);
      const [docs, repos, estado, config] = carpetas as [string, string, string, string];
      const sitio = path.join(raiz, "sitio");
      fs.mkdirSync(sitio);
      const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PHASE_GATE_|ORQUESTADOR_)/i.test(k)));
      const r = spawnSync(process.execPath, [BINARIO, "ui", "--export-static", path.join(sitio, "demo")], { env: { ...env, PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config }, encoding: "utf-8", timeout: 120_000 });
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      const { servidor, puerto } = await servirCarpeta(sitio);
      const origen = `http://127.0.0.1:${puerto}`;
      await use({ origen, puerto, cookie: { name: "sin-sesion", value: "1" }, arbol: { raiz, docs, repos, estado, config, env: {} }, falso: { env: {}, casa: raiz, llamadas: () => [] } });
      await new Promise((r2) => servidor.close(r2));
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: "worker" },
  ],
});

export const sitio = (s: Servidor, hash = "") => `${s.origen}${PREFIJO_DE_LA_DEMO}${hash}`;
