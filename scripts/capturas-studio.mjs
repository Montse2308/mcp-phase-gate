// Las capturas del Studio: se sacan del sitio estático (la demo, sin datos de nadie) con el Chromium de
// Playwright, sin abrir ningún navegador a la vista. Por defecto capturan el tablero de cupones-de-descuento,
// en el tema oscuro y en el claro, y se escriben en docs/medios/. Con --vistas se capturan otras vistas y, en ese caso,
// la página completa (para no cortar el contenido al comparar); --salida elige la carpeta.
//
// Con --portada se sacan las tres de la portada del sitio: la Red, el Tablero y Ajustes, en tema claro y en los
// dos idiomas (o en los de --idiomas), contra un `ui --demo` en vivo, porque Ajustes sobre el sitio estático
// saldría de solo lectura. Cada una es el viewport de 1280×720, y se escribe en --salida (obligatoria) como
// captura-<vista>-<idioma>.<extensión>.
//
// Uso, después de `npm run build` y con Chromium instalado
// (PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium):
//   node scripts/capturas-studio.mjs
//   node scripts/capturas-studio.mjs --vistas red,tablero,taller,vigia,bitacora --salida <carpeta>
//   node scripts/capturas-studio.mjs --portada --salida <carpeta> [--idiomas es,en]

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { lanzarDemoEnVivo } from "./demo-en-vivo.mjs";
import { EXTENSION_DE_LAS_CAPTURAS } from "./portada.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

// Cada vista: el hash de la demo y qué esperar antes de la foto, algo que solo aparece cuando la vista
// ya cargó sus datos del sitio estático. La tarea de la demo es TIENDA/cupones-de-descuento.
const VISTAS = {
  red: { hash: "#/red", listo: async (pagina) => { await pagina.getByText("TIENDA").first().waitFor(); } },
  tablero: { hash: "#/tablero/TIENDA/cupones-de-descuento", listo: async (pagina) => { await pagina.getByText("descartado").first().waitFor(); } },
  taller: { hash: "#/taller/TIENDA?fase=4&tarea=cupones-de-descuento", listo: async (pagina) => { await pagina.getByRole("list", { name: "Ranuras" }).waitFor(); } },
  vigia: { hash: "#/vigia", listo: async (pagina) => { await pagina.getByRole("heading", { name: "Diagnóstico" }).waitFor(); } },
  bitacora: { hash: "#/bitacora/TIENDA/cupones-de-descuento", listo: async (pagina) => { await pagina.getByRole("list", { name: "Eventos de la tarea" }).waitFor(); } },
};

// --vistas y --salida. Sin --vistas se captura solo el tablero, como antes de que existieran las opciones.
const { values: argumentos } = parseArgs({
  options: { vistas: { type: "string" }, salida: { type: "string" }, portada: { type: "boolean" }, idiomas: { type: "string" } },
  strict: true,
});

// Las tres capturas de la portada, contra un `ui --demo` en vivo por idioma.
async function capturarPortada() {
  if (!argumentos.salida?.trim()) throw new Error("--portada necesita --salida <carpeta>.");
  if (argumentos.vistas !== undefined) throw new Error("--portada saca siempre la Red, el Tablero y Ajustes: no admite --vistas.");
  const salidaPortada = path.resolve(argumentos.salida);
  const idiomas = (argumentos.idiomas ?? "es,en").split(",").map((i) => i.trim()).filter(Boolean);
  for (const i of idiomas) if (i !== "es" && i !== "en") throw new Error(`Idioma desconocido: ${i}. Valores: es, en.`);
  const { carpetaDeTextos } = await import(pathToFileURL(path.join(raiz, "build", "studio", "demo.js")).href);
  fs.mkdirSync(salidaPortada, { recursive: true });
  const navegador = await chromium.launch();
  try {
    for (const idioma of idiomas) {
      const guion = JSON.parse(fs.readFileSync(path.join(carpetaDeTextos(idioma), "demo.json"), "utf-8"));
      const tienda = guion.proyectos.find((p) => p.repos && Object.values(p.repos).some((r) => r.git));
      const terminada = tienda.tareas.find((t) => t.cerrar);
      const vistasDeLaPortada = {
        red: { hash: "/red", listo: async (p) => { for (const proyecto of guion.proyectos) await p.getByRole("heading", { name: proyecto.nombre }).waitFor(); } },
        tablero: { hash: `/tablero/${tienda.nombre}/${terminada.nombre}`, listo: async (p) => { await p.locator(".estado-verificado").nth(2).waitFor(); await p.locator(".estado-descartado").first().waitFor(); } },
        // La lista de presets llega un instante después del formulario: sin esperarla, el select sale en blanco.
        ajustes: { hash: `/ajustes/proyecto/${tienda.nombre}`, listo: async (p) => { await p.locator('[data-campo="commits"] select').waitFor(); await p.waitForFunction(() => document.querySelector('[data-campo="preset"] select')?.value); } },
      };
      const demo = await lanzarDemoEnVivo({ raiz, idioma });
      try {
        const contexto = await navegador.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce", colorScheme: "light", locale: idioma === "en" ? "en-US" : "es-ES" });
        await contexto.addCookies([{ name: demo.cookie.name, value: demo.cookie.value, url: demo.origen }]);
        for (const [vista, { hash, listo }] of Object.entries(vistasDeLaPortada)) {
          const pagina = await contexto.newPage();
          await pagina.goto(`${demo.origen}/#${hash}?lang=${idioma}`);
          await listo(pagina);
          await pagina.evaluate(() => document.fonts.ready);
          const archivo = path.join(salidaPortada, `captura-${vista}-${idioma}.${EXTENSION_DE_LAS_CAPTURAS}`);
          fs.writeFileSync(archivo, await fotografiar(navegador, pagina));
          console.log(`${archivo}: ${fs.statSync(archivo).size} bytes`);
          await pagina.close();
        }
        await contexto.close();
      } finally {
        await demo.detener();
      }
    }
  } finally {
    await navegador.close();
  }
}

// La foto de la página en el formato de la portada. Chromium solo da PNG y JPEG: el WebP, mucho más chico para una
// interfaz de colores planos, lo codifica el propio navegador con un canvas, sin ninguna herramienta más.
async function fotografiar(navegador, pagina) {
  const png = await pagina.screenshot({ type: "png" });
  if (EXTENSION_DE_LAS_CAPTURAS === "png") return png;
  const aparte = await navegador.newPage();
  try {
    const base64 = await aparte.evaluate(async (origen) => {
      const imagen = new Image();
      imagen.src = `data:image/png;base64,${origen}`;
      await imagen.decode();
      const lienzo = document.createElement("canvas");
      lienzo.width = imagen.width;
      lienzo.height = imagen.height;
      lienzo.getContext("2d").drawImage(imagen, 0, 0);
      return lienzo.toDataURL("image/webp", 0.8).split(",")[1];
    }, png.toString("base64"));
    return Buffer.from(base64, "base64");
  } finally {
    await aparte.close();
  }
}

if (argumentos.portada) {
  await capturarPortada();
  process.exit(0);
}
if (argumentos.idiomas !== undefined) throw new Error("--idiomas solo vale con --portada.");
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
      // Sin elección guardada, el tema es el del sistema: basta con el colorScheme del navegador.
      for (const [tema, esquema] of [["oscuro", "dark"], ["claro", "light"]]) {
        const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", colorScheme: esquema, locale: "es-ES" });
        const pagina = await contexto.newPage();
        pagina.on("request", (peticion) => {
          if (!peticion.url().startsWith(`${origen}/`) && !peticion.url().startsWith("data:")) throw new Error(`Petición fuera de 127.0.0.1: ${peticion.url()}`);
        });
        await pagina.goto(`${origen}/${VISTAS[vista].hash}`);
        await pagina.getByRole("button", { name: "Tema oscuro" }).waitFor();
        const oscuro = await pagina.getByRole("button", { name: "Tema oscuro" }).getAttribute("aria-pressed");
        if (oscuro !== String(tema === "oscuro")) throw new Error(`La captura de ${vista} salió en otro tema que el ${tema}.`);
        await VISTAS[vista].listo(pagina);
        await pagina.evaluate(() => document.fonts.ready);
        const archivo = path.join(salida, `${vista}-${tema}.png`);
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
