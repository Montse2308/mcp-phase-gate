// Las escenas del Studio para el GIF y el video: Chromium de Playwright graba cada escena con recordVideo a
// 1280×720 contra un `ui --demo` de verdad, en tema claro, y la última contra el sitio estático en un
// teléfono. Demo honesta: todo sale de código real ejecutándose. La escena en vivo hace lo que haría el
// agente —el commit del lote pendiente y `record_batch` con su SHA (registrarLote)— sobre la carpeta de la
// demo, y el sello llega por SSE. La de Ajustes cambia la política de commits de un proyecto y la aplica, con
// su diff. No se escenifica ninguna conversación ni ninguna sesión MCP.
//
// Las esperas son de eventos del DOM (un sello, un encabezado); después de cada una se deja la imagen quieta
// el tiempo justo para leerla, que es lo único que se mide en milisegundos.
//
// Uso, después de `npm run build` y con Chromium instalado (PLAYWRIGHT_BROWSERS_PATH=0):
//   node scripts/grabar-studio.mjs --idioma es|en --salida <carpeta> --sitio <sitio completo> [--segundos 2=4,3=7,...]
// Con --segundos, cada escena se deja quieta al final hasta durar lo que le toca; sin él, dura lo que tarden sus pasos.
// <sitio completo> es lo que se publica: la portada en la raíz (en inglés) y en es/, y la demo en demo/.
// Escribe en <carpeta> escena-2.webm … escena-7.webm; la 1, la terminal, es de VHS.

import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { lanzarDemoEnVivo } from "./demo-en-vivo.mjs";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: argumentos } = parseArgs({ options: { idioma: { type: "string" }, salida: { type: "string" }, sitio: { type: "string" }, segundos: { type: "string" } } });
const idioma = argumentos.idioma === "en" ? "en" : "es";
if (!argumentos.salida || !argumentos.sitio) throw new Error("Uso: node scripts/grabar-studio.mjs --idioma es|en --salida <carpeta> --sitio <sitio completo>");
fs.mkdirSync(path.resolve(argumentos.salida), { recursive: true });
// El nombre largo y real: en Windows, borrar por un nombre corto (8.3) falla con EPERM.
const salida = fs.realpathSync.native(path.resolve(argumentos.salida));
const sitio = path.resolve(argumentos.sitio);

const importar = (relativa) => import(pathToFileURL(path.join(raiz, "build", relativa)).href);
const { carpetasDeDemo, carpetaDeTextos, entornoDeDemo } = await importar("studio/demo.js");
const { gitEnLaDemo } = await importar("git.js");

// La historia de la demo de este idioma: la tarea en curso, su lote pendiente y la terminada.
const guion = JSON.parse(fs.readFileSync(path.join(carpetaDeTextos(idioma), "demo.json"), "utf-8"));
const tienda = guion.proyectos.find((p) => p.repos && Object.values(p.repos).some((r) => r.git));
const enCurso = tienda.tareas.find((t) => t.lotes.some((l) => l.sinCommit));
const pendiente = enCurso.lotes.find((l) => l.sinCommit);
const terminada = tienda.tareas.find((t) => t.cerrar);
// El Taller, en el proyecto cuyo preset sustituye la ranura de pruebas de la Fase 3 (ai-agent-ops): así el diff
// frente a la fábrica tiene algo que enseñar.
const deAgente = guion.proyectos.find((p) => p.manifiesto.preset === "ai-agent-ops");
const dirDelRepo = tienda.manifiesto.repos.find((r) => r.id === pendiente.repo).dir;

const TAMANO = { width: 1280, height: 720 };
const TELEFONO = { width: 390, height: 844 };
const quieto = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── ui --demo, en una carpeta propia ───────────────────────────────────────
const demoEnVivo = await lanzarDemoEnVivo({ raiz, idioma });
const { origen, raizDeLaDemo } = demoEnVivo;
const { name: nombre, value: valor } = demoEnVivo.cookie;

// ─── El sitio completo, bajo un subdirectorio como en Pages ─────────────────
const PREFIJO = "/mcp-phase-gate/";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png" };
const estatico = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (!url.startsWith(PREFIJO)) return res.writeHead(404).end();
  // Una carpeta (la raíz, es/, demo/) sirve su index.html, como GitHub Pages.
  const pedida = url.slice(PREFIJO.length);
  const ruta = path.resolve(sitio, pedida === "" || pedida.endsWith("/") ? `${pedida}index.html` : pedida);
  if (path.relative(sitio, ruta).startsWith("..") || !fs.statSync(ruta, { throwIfNoEntry: false })?.isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] ?? "application/octet-stream" }).end(fs.readFileSync(ruta));
});
await new Promise((r) => estatico.listen(0, "127.0.0.1", r));
const origenEstatico = `http://127.0.0.1:${estatico.address().port}${PREFIJO}`;

// ─── Las escenas ────────────────────────────────────────────────────────────
const navegador = await chromium.launch();
// Lo que graba Playwright, en bruto, junto a la salida: se borra al terminar.
const crudo = fs.mkdtempSync(path.join(salida, "crudo-"));
// Lo que dura cada escena, en segundos, tal como se grabó: medios.mjs avisa si lo que pidió el guion pasa de lo que
// le toca y al recortarla perdería el final.
const objetivo = Object.fromEntries((argumentos.segundos ?? "").split(",").filter(Boolean).map((par) => par.split("=").map(Number)));
const duraciones = {};
async function escena(numero, tamano, grabar) {
  const carpeta = path.join(crudo, `escena-${numero}`);
  const contexto = await navegador.newContext({ viewport: tamano, recordVideo: { dir: carpeta, size: tamano }, reducedMotion: "no-preference", colorScheme: "light", locale: idioma === "en" ? "en-US" : "es-ES" });
  await contexto.addCookies([{ name: nombre, value: valor, url: origen }]);
  const pagina = await contexto.newPage();
  const inicio = Date.now();
  await grabar(pagina);
  // Lo que pidieron los pasos, antes de completar el tiempo de la escena.
  duraciones[numero] = Math.round((Date.now() - inicio) / 100) / 10;
  // Si terminan antes de su tiempo, la última imagen se queda quieta hasta completarlo.
  if (objetivo[numero] && duraciones[numero] < objetivo[numero]) await quieto((objetivo[numero] - duraciones[numero]) * 1000);
  const video = pagina.video();
  await contexto.close();
  fs.copyFileSync(await video.path(), path.join(salida, `escena-${numero}.webm`));
  console.log(`escena ${numero} (${duraciones[numero]} s): ${path.join(salida, `escena-${numero}.webm`)}`);
}
const vista = (hash) => `${origen}/#${hash}${hash.includes("?") ? "&" : "?"}lang=${idioma}`;
const listo = (pagina) => pagina.evaluate(() => document.fonts.ready);

try {
  // 2. La Red: los tres proyectos de la demo, una fila cada uno con su preset, sus repos y su rama.
  await escena(2, TAMANO, async (p) => {
    await p.goto(vista("/red"));
    for (const proyecto of guion.proyectos) await p.getByRole("heading", { name: proyecto.nombre }).waitFor();
    await listo(p);
    await quieto(2800);
  });

  // 3. El tablero de la tarea terminada: las fases cerradas y la tabla de lotes de la Fase 4 con su estado; un clic
  //    en el recibo de un lote lo abre en el visor.
  await escena(3, TAMANO, async (p) => {
    await p.goto(vista(`/tablero/${tienda.nombre}/${terminada.nombre}`));
    await p.locator(".estado-verificado").nth(2).waitFor();
    await p.locator(".estado-descartado").first().waitFor();
    await listo(p);
    await quieto(3000);
    await p.getByRole("row").filter({ has: p.locator(".estado-verificado") }).first().getByRole("button").click();
    await quieto(2400);
  });

  // 4. En vivo: el lote con el commit pendiente se commitea y se ancla con record_batch, y su estado
  //    verificado llega por SSE sin recargar, con la fila resaltada.
  await escena(4, TAMANO, async (p) => {
    await p.goto(vista(`/tablero/${tienda.nombre}/${enCurso.nombre}`));
    await p.locator(".estado-commit-pendiente").first().waitFor();
    await listo(p);
    await quieto(1500);
    const demo = carpetasDeDemo(raizDeLaDemo, idioma);
    const dir = path.join(demo.repos, dirDelRepo);
    const autor = { fecha: new Date().toISOString(), ...guion.autor };
    gitEnLaDemo(raizDeLaDemo, dir, ["add", "--", ...Object.keys(pendiente.archivos)], autor);
    gitEnLaDemo(raizDeLaDemo, dir, ["commit", "-q", "-m", pendiente.mensaje ?? pendiente.titulo], autor);
    const sha = gitEnLaDemo(raizDeLaDemo, dir, ["rev-parse", "HEAD"], autor).trim();
    const env = entornoDeDemo(demo);
    const antes = { ...process.env };
    Object.assign(process.env, env);
    try {
      const { registrarLote } = await importar("lotes.js");
      await registrarLote(tienda.nombre, enCurso.nombre, { lote: pendiente.lote, repo: pendiente.repo, commit: sha });
    } finally {
      for (const clave of Object.keys(env)) delete process.env[clave];
      Object.assign(process.env, antes);
    }
    await p.locator(".estado-nuevo").first().waitFor({ timeout: 30_000 });
    await quieto(3000);
  });

  // 5. Ajustes: la política de commits de TIENDA cambia, la vista previa enseña su diff de un solo archivo y se
  //    aplica. Es el ciclo de siempre del Studio, el que sustituye a `init` en la v4.
  await escena(5, TAMANO, async (p) => {
    const manifiesto = path.join(carpetasDeDemo(raizDeLaDemo, idioma).docs, tienda.nombre, "phase-gate.json");
    const antes = JSON.parse(fs.readFileSync(manifiesto, "utf-8"));
    const nueva = antes.reglas?.commits === "auto" ? "agente-propone" : "auto";
    await p.goto(vista(`/ajustes/proyecto/${tienda.nombre}`));
    const politica = p.locator('[data-campo="commits"] select');
    await politica.waitFor();
    // La lista de presets llega un instante después del formulario: sin esperarla, ese select se ve en blanco.
    await p.waitForFunction(() => document.querySelector('[data-campo="preset"] select')?.value);
    await listo(p);
    await quieto(800);
    await politica.selectOption(nueva);
    await quieto(500);
    await p.locator(".pie-ajustes .accion > button").click();
    await p.locator(".vista-previa .diff-mas").first().waitFor();
    // La vista previa queda bajo el formulario: se baja hasta ella para que el diff se lea.
    await p.locator(".vista-previa").evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    await quieto(3200);
    await p.locator(".vista-previa .boton-principal").click();
    await p.locator(".aviso-hecho").waitFor();
    await quieto(1500);
  });

  // 6. El Taller: de dónde sale la ranura de pruebas de la Fase 3 (el preset frente a la fábrica), con su diff.
  await escena(6, TAMANO, async (p) => {
    await p.goto(vista(`/taller/${deAgente.nombre}?fase=3&tarea=${encodeURIComponent(deAgente.tareas[0].nombre)}`));
    const ranura = p.getByRole("button", { name: /fase-3\/pruebas/ }).first();
    await ranura.waitFor();
    await listo(p);
    await quieto(800);
    await ranura.click();
    await quieto(3000);
  });

  // 7. El cierre: el sitio publicado, en un teléfono. La portada y, con su botón, la demo.
  await escena(7, TELEFONO, async (p) => {
    await p.goto(`${origenEstatico}${idioma === "es" ? "es/" : ""}`);
    await p.locator(".boton-principal").waitFor();
    await listo(p);
    await quieto(2200);
    await p.locator(".boton-principal").click();
    await p.getByRole("heading", { name: guion.proyectos[0].nombre }).waitFor();
    await listo(p);
    await quieto(2000);
  });
  fs.writeFileSync(path.join(salida, "duraciones.json"), `${JSON.stringify(duraciones, null, 2)}\n`, "utf-8");
} finally {
  await navegador.close();
  estatico.close();
  await demoEnVivo.detener();
  // Borrar lo crudo es limpieza: si falla (en Windows, un video aún abierto), no tapa el error de la escena.
  try {
    fs.rmSync(crudo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`No se pudo borrar ${crudo}: ${error.message}`);
  }
}
