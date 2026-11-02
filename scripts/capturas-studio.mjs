// Las capturas del Studio: se sacan del sitio estático (la demo, sin datos de nadie) con el Chromium de
// Playwright, sin abrir ningún navegador a la vista. Por defecto capturan el tablero de cupones-de-descuento,
// en el tema oscuro y en el claro, y se escriben en docs/medios/. Con --vistas se capturan otras vistas y, en ese caso,
// la página completa (para no cortar el contenido al comparar); --salida elige la carpeta.
//
// Con --portada se sacan las tres de la portada del sitio: la Red, el Tablero y Ajustes, en tema claro y en los
// dos idiomas, contra un `ui --demo` en vivo, porque Ajustes sobre el sitio estático saldría de solo lectura.
// Cada una son 1280×720 de interfaz, empezando bajo la banda de la demo (que solo dice en qué carpeta temporal
// vive, y en la portada es ruido), y se escribe en --salida (obligatoria) como captura-<vista>-<idioma>.<ext>.
// Con ellas sale también la imagen de la vista previa del link, social-preview-<idioma>.png, de 1200×630.
//
// Uso, después de `npm run build` y con Chromium instalado
// (PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium):
//   node scripts/capturas-studio.mjs
//   node scripts/capturas-studio.mjs --vistas red,tablero,taller,vigia,bitacora --salida <carpeta>
//   node scripts/capturas-studio.mjs --portada --salida <carpeta>

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { lanzarDemoEnVivo } from "./demo-en-vivo.mjs";
import { EXTENSION_DE_LAS_CAPTURAS, MEDIDAS_DE_LA_IMAGEN_SOCIAL, nombreDeLaImagenSocial } from "./portada.mjs";

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
  options: { vistas: { type: "string" }, salida: { type: "string" }, portada: { type: "boolean" } },
  strict: true,
});

// Las tres capturas de la portada, contra un `ui --demo` en vivo por idioma.
async function capturarPortada() {
  if (!argumentos.salida?.trim()) throw new Error("--portada necesita --salida <carpeta>.");
  if (argumentos.vistas !== undefined) throw new Error("--portada saca siempre la Red, el Tablero y Ajustes: no admite --vistas.");
  const salidaPortada = path.resolve(argumentos.salida);
  const idiomas = ["es", "en"];
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
      let tablero;
      try {
        const contexto = await navegador.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce", colorScheme: "light", locale: idioma === "en" ? "en-US" : "es-ES" });
        await contexto.addCookies([{ name: demo.cookie.name, value: demo.cookie.value, url: demo.origen }]);
        for (const [vista, { hash, listo }] of Object.entries(vistasDeLaPortada)) {
          const pagina = await contexto.newPage();
          await pagina.goto(`${demo.origen}/#${hash}?lang=${idioma}`);
          await listo(pagina);
          await pagina.evaluate(() => document.fonts.ready);
          // La banda de la demo dice en qué carpeta temporal se generó, y eso no le dice nada a quien llega a la
          // portada: la foto empieza justo debajo. La ventana crece lo que mide la banda para que la captura
          // siga siendo de 1280×720 de interfaz, que es lo que declara la plantilla.
          const banda = await pagina.evaluate(() => Math.ceil(document.querySelector(".banda-demo")?.getBoundingClientRect().height ?? 0));
          if (banda > 0) await pagina.setViewportSize({ width: 1280, height: 720 + banda });
          await listo(pagina);
          const archivo = path.join(salidaPortada, `captura-${vista}-${idioma}.${EXTENSION_DE_LAS_CAPTURAS}`);
          const recorte = { x: 0, y: banda, width: 1280, height: 720 };
          fs.writeFileSync(archivo, await fotografiar(navegador, pagina, recorte));
          console.log(`${archivo}: ${fs.statSync(archivo).size} bytes`);
          // El Tablero también va, en PNG, a la imagen de la vista previa del link.
          if (vista === "tablero") tablero = await pagina.screenshot({ type: "png", clip: recorte });
          await pagina.close();
        }
        await contexto.close();
        await imagenSocial(navegador, idioma, tablero, salidaPortada);
      } finally {
        await demo.detener();
      }
    }
  } finally {
    await navegador.close();
  }
}

// La imagen de la vista previa del link, 1200×630 y en PNG (los validadores y GitHub no leen WebP): el nombre y la
// frase del proyecto, el Tablero de la demo y las cinco fases. Se arma con HTML y las fuentes del Studio dentro de
// la propia página, sin pedir nada fuera, y falla si pasa de 1 MB, que es lo que admite GitHub como social preview.
async function imagenSocial(navegador, idioma, tableroPng, salida) {
  const { ancho, alto } = MEDIDAS_DE_LA_IMAGEN_SOCIAL;
  const textos = JSON.parse(fs.readFileSync(path.join(raiz, "sitio", "textos.json"), "utf-8"))[idioma];
  const fuente = (nombre) => fs.readFileSync(path.join(raiz, "studio", "dist", "fuentes", nombre)).toString("base64");
  const escapar = (texto) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const fases = [1, 2, 3, 4, 5].map((n) => `<li><span>${n}</span>${escapar(textos[`fase-${n}`])}</li>`).join("");
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
  try {
    await pagina.setContent(`<!doctype html><html lang="${idioma}"><head><meta charset="utf-8"><style>
      @font-face { font-family: "Inter"; font-weight: 100 900; src: url(data:font/woff2;base64,${fuente("inter-latin-wght-normal.woff2")}) format("woff2-variations"); }
      @font-face { font-family: "JetBrains Mono"; font-weight: 100 800; src: url(data:font/woff2;base64,${fuente("jetbrains-mono-latin-wght-normal.woff2")}) format("woff2-variations"); }
      * { box-sizing: border-box; margin: 0; }
      body { width: ${ancho}px; height: ${alto}px; padding: 56px; background: #f3f5f7; color: #18181b; font-family: "Inter", sans-serif; display: flex; flex-direction: column; justify-content: space-between; }
      .arriba { display: flex; align-items: center; justify-content: space-between; gap: 48px; }
      .texto { width: 440px; }
      h1 { font: 700 54px/1.1 "JetBrains Mono", monospace; color: #1d4ed8; letter-spacing: -1px; overflow-wrap: anywhere; }
      p { margin-top: 28px; font-size: 34px; font-weight: 600; line-height: 1.25; }
      img { width: 600px; height: 337.5px; border: 1px solid #dde2e8; border-radius: 12px; box-shadow: 0 12px 32px rgba(24, 24, 27, 0.16); }
      ol { display: flex; gap: 14px; list-style: none; padding: 0; font-size: 22px; font-weight: 600; }
      li { display: flex; align-items: center; gap: 10px; padding: 10px 16px 10px 10px; background: #ffffff; border: 1px solid #dde2e8; border-radius: 999px; }
      li span { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: #dbeafe; color: #1d4ed8; font-size: 18px; }
    </style></head><body>
      <div class="arriba"><div class="texto"><h1>mcp-phase-gate</h1><p>${escapar(textos["social-lema"])}</p></div><img alt="" src="data:image/png;base64,${tableroPng.toString("base64")}"></div>
      <ol>${fases}</ol>
    </body></html>`);
    await pagina.evaluate(() => document.fonts.ready);
    const archivo = path.join(salida, nombreDeLaImagenSocial(idioma));
    fs.writeFileSync(archivo, await pagina.screenshot({ type: "png" }));
    const bytes = fs.statSync(archivo).size;
    console.log(`${archivo}: ${bytes} bytes`);
    if (bytes > 1_000_000) throw new Error(`${archivo} pesa ${bytes} bytes: GitHub no admite más de 1 MB como social preview.`);
  } finally {
    await pagina.close();
  }
}

// La foto de la página en el formato de la portada. Chromium solo da PNG y JPEG: el WebP, mucho más chico para una
// interfaz de colores planos, lo codifica el propio navegador con un canvas, sin ninguna herramienta más.
async function fotografiar(navegador, pagina, recorte) {
  const png = await pagina.screenshot({ type: "png", clip: recorte });
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
