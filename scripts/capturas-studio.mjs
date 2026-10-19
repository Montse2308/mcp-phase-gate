// Las capturas del Studio para los README: el tablero de cupones-de-descuento, en Cabina y en Sobrio, sacadas
// del sitio estático (la demo, sin datos de nadie) con el Chromium de Playwright, sin abrir ningún navegador
// a la vista. Se escriben en docs/medios/ y los README las enlazan con una URL absoluta, que también se ve
// en npmjs.com.
//
// Uso, después de `npm run build` y con Chromium instalado
// (PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium):
//   node scripts/capturas-studio.mjs

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const salida = path.join(raiz, "docs", "medios");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

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
    for (const [modo, sufijo] of [["cabina", ""], ["sobrio", "?sobrio=1"]]) {
      const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", colorScheme: modo === "sobrio" ? "light" : "dark" });
      const pagina = await contexto.newPage();
      pagina.on("request", (peticion) => {
        if (!peticion.url().startsWith(`${origen}/`) && !peticion.url().startsWith("data:")) throw new Error(`Petición fuera de 127.0.0.1: ${peticion.url()}`);
      });
      await pagina.goto(`${origen}/#/tablero/TIENDA/cupones-de-descuento${sufijo}`);
      await pagina.locator("html").getAttribute("data-modo").then(async (actual) => {
        if (actual !== modo) await pagina.getByRole("button", { name: /^Modo:/ }).click();
      });
      await pagina.locator(`html[data-modo="${modo}"]`).waitFor();
      await pagina.getByText("ANULADO").or(pagina.getByText("descartado")).first().waitFor();
      await pagina.evaluate(() => document.fonts.ready);
      const archivo = path.join(salida, `tablero-${modo}.png`);
      await pagina.screenshot({ path: archivo });
      console.log(`${path.relative(raiz, archivo)}: ${fs.statSync(archivo).size} bytes`);
      await contexto.close();
    }
  } finally {
    await navegador.close();
  }
} finally {
  servidor.close();
  fs.rmSync(trabajo, { recursive: true, force: true, maxRetries: 3 });
}
