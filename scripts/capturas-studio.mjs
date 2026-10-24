// Las capturas del Studio: se sacan del sitio estático (la demo, sin datos de nadie) con el Chromium de
// Playwright, sin abrir ningún navegador a la vista. Por defecto capturan el tablero de cupones-de-descuento,
// en Cabina y en Sobrio, y se escriben en docs/medios/. Con --vistas se capturan otras vistas y, en ese caso,
// la página completa (para no cortar el contenido al comparar); --salida elige la carpeta.
//
// Uso, después de `npm run build` y con Chromium instalado
// (PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium):
//   node scripts/capturas-studio.mjs
//   node scripts/capturas-studio.mjs --vistas red,tablero,taller,vigia,bitacora --salida <carpeta>

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

// Cada vista: el hash de la demo y qué esperar antes de la foto, algo que solo aparece cuando la vista
// ya cargó sus datos del sitio estático. La tarea de la demo es TIENDA/cupones-de-descuento.
const VISTAS = {
  red: { hash: (sobrio) => `#/red${sobrio ? "?sobrio=1" : ""}`, listo: async (pagina) => { await pagina.getByText("TIENDA").first().waitFor(); } },
  tablero: { hash: (sobrio) => `#/tablero/TIENDA/cupones-de-descuento${sobrio ? "?sobrio=1" : ""}`, listo: async (pagina) => { await pagina.getByText("ANULADO").or(pagina.getByText("descartado")).first().waitFor(); } },
  taller: { hash: (sobrio) => `#/taller/TIENDA?fase=4&tarea=cupones-de-descuento${sobrio ? "&sobrio=1" : ""}`, listo: async (pagina) => { await pagina.getByRole("list", { name: "Ranuras" }).waitFor(); } },
  vigia: { hash: (sobrio) => `#/vigia${sobrio ? "?sobrio=1" : ""}`, listo: async (pagina) => { await pagina.getByRole("heading", { name: "Diagnóstico" }).waitFor(); } },
  bitacora: { hash: (sobrio) => `#/bitacora/TIENDA/cupones-de-descuento${sobrio ? "?sobrio=1" : ""}`, listo: async (pagina) => { await pagina.getByRole("list", { name: "Eventos de la tarea" }).waitFor(); } },
};

// --vistas y --salida. Sin --vistas se captura solo el tablero, como antes de que existieran las opciones.
const { values: argumentos } = parseArgs({
  options: { vistas: { type: "string" }, salida: { type: "string" } },
  strict: true,
});
const vistas = (argumentos.vistas ?? "tablero").split(",").map((v) => v.trim()).filter(Boolean);
if (vistas.length === 0) throw new Error("--vistas necesita al menos una vista: red, tablero, taller, vigia, bitacora.");
for (const vista of vistas) if (!Object.hasOwn(VISTAS, vista)) throw new Error(`Vista desconocida: ${vista}. Valores: ${Object.keys(VISTAS).join(", ")}.`);
// Un --salida vacío (--salida= o una variable sin definir) es un error: si no, las capturas caerían en docs/medios/.
if (argumentos.salida !== undefined && !argumentos.salida.trim()) throw new Error("--salida necesita una carpeta.");
const salida = argumentos.salida !== undefined ? path.resolve(argumentos.salida) : path.join(raiz, "docs", "medios");
const paginaCompleta = argumentos.vistas !== undefined;

const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-phase-gate-capturas-"));
const servidor = http.createServer((req, res) => {
  const relativa = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "") || "index.html";
  const ruta = path.resolve(trabajo, "sitio", relativa);
  if (path.relative(path.join(trabajo, "sitio"), ruta).startsWith("..") || !fs.statSync(ruta, { throwIfNoEntry: false })?.isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] ?? "application/octet-stream" }).end(fs.readFileSync(ruta));
});

// Con Ctrl+C no corre el `finally`: se limpia la carpeta temporal y se cierra el servidor antes de salir.
process.once("SIGINT", () => {
  if (servidor.listening) servidor.close();
  fs.rmSync(trabajo, { recursive: true, force: true, maxRetries: 3 });
  process.exit(130);
});

try {
  // El export de la demo, con las cuatro variables en carpetas vacías: nunca la Documentación de quien lo corre.
  const carpetas = Object.fromEntries(["DOCS", "REPOS", "STATE", "CONFIG"].map((n) => [`PHASE_GATE_${n}_PATH`, fs.mkdtempSync(path.join(trabajo, `${n.toLowerCase()}-`))]));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PHASE_GATE_|ORQUESTADOR_)/i.test(k)));
  const exportar = spawnSync(process.execPath, [path.join(raiz, "build", "index.js"), "ui", "--export-static", path.join(trabajo, "sitio")], { env: { ...env, ...carpetas }, encoding: "utf-8" });
  if (exportar.status !== 0) throw new Error(`El export falló: ${exportar.stdout}${exportar.stderr}`);

  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const origen = `http://127.0.0.1:${servidor.address().port}`;
  const navegador = await chromium.launch();
  try {
    fs.mkdirSync(salida, { recursive: true });
    for (const vista of vistas) {
      for (const [modo, sobrio] of [["cabina", false], ["sobrio", true]]) {
        const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", colorScheme: modo === "sobrio" ? "light" : "dark", locale: "es-ES" });
        const pagina = await contexto.newPage();
        pagina.on("request", (peticion) => {
          if (!peticion.url().startsWith(`${origen}/`) && !peticion.url().startsWith("data:")) throw new Error(`Petición fuera de 127.0.0.1: ${peticion.url()}`);
        });
        await pagina.goto(`${origen}/${VISTAS[vista].hash(sobrio)}`);
        const actual = await pagina.locator("html").getAttribute("data-modo");
        if (actual !== modo) await pagina.getByRole("button", { name: /^Modo:/ }).click();
        await pagina.locator(`html[data-modo="${modo}"]`).waitFor();
        await VISTAS[vista].listo(pagina);
        await pagina.evaluate(() => document.fonts.ready);
        const archivo = path.join(salida, `${vista}-${modo}.png`);
        await pagina.screenshot({ path: archivo, ...(paginaCompleta ? { fullPage: true } : {}) });
        console.log(`${path.relative(raiz, archivo)}: ${fs.statSync(archivo).size} bytes`);
        await contexto.close();
      }
    }
  } finally {
    await navegador.close();
  }
} finally {
  servidor.close();
  fs.rmSync(trabajo, { recursive: true, force: true, maxRetries: 3 });
}
