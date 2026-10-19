// Las escenas del Studio para el GIF y el video (§8.8 del plan): Chromium de Playwright graba cada escena
// con recordVideo a 1280×720 contra un `ui --demo` de verdad, y la última contra el sitio estático en un
// teléfono. Demo honesta: todo sale de código real ejecutándose. La escena en vivo hace lo que haría el
// agente —el commit del lote pendiente y `record_batch` con su SHA (registrarLote)— sobre la carpeta de la
// demo, y el sello llega por SSE. No se escenifica ninguna conversación ni ninguna sesión MCP.
//
// Las esperas son de eventos del DOM (un sello, un encabezado); después de cada una se deja la imagen quieta
// el tiempo justo para leerla, que es lo único que se mide en milisegundos.
//
// Uso, después de `npm run build` y con Chromium instalado (PLAYWRIGHT_BROWSERS_PATH=0):
//   node scripts/grabar-studio.mjs --idioma es|en --salida <carpeta> --sitio <export estático>
// Escribe en <carpeta> escena-3.webm … escena-7.webm.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = await import("@playwright/test");

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: argumentos } = parseArgs({ options: { idioma: { type: "string" }, salida: { type: "string" }, sitio: { type: "string" } } });
const idioma = argumentos.idioma === "en" ? "en" : "es";
if (!argumentos.salida || !argumentos.sitio) throw new Error("Uso: node scripts/grabar-studio.mjs --idioma es|en --salida <carpeta> --sitio <export estático>");
const salida = path.resolve(argumentos.salida);
const sitio = path.resolve(argumentos.sitio);
fs.mkdirSync(salida, { recursive: true });

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
// La banda de la demo dice dónde está (§7.8), y esa ruta sale en el video: en la CI de Pages es /tmp/…, pero en
// un equipo puede llevar el nombre de quien graba. Se avisa; MEDIOS_TEMPORAL permite elegir otra base.
const base = fs.realpathSync.native(process.env.MEDIOS_TEMPORAL ?? os.tmpdir());
if (base.toLowerCase().includes(os.userInfo().username.toLowerCase())) {
  console.warn(`Aviso: la ruta de la demo (${base}) lleva el nombre del usuario y saldrá en la banda: no publiques estos medios.`);
}
const trabajo = fs.mkdtempSync(path.join(base, "mcp-phase-gate-medios-"));
const temporal = path.join(trabajo, "tmp");
const vacias = Object.fromEntries(["DOCS", "REPOS", "STATE", "CONFIG"].map((n) => [`PHASE_GATE_${n}_PATH`, path.join(trabajo, n.toLowerCase())]));
for (const carpeta of [temporal, ...Object.values(vacias)]) fs.mkdirSync(carpeta, { recursive: true });
const limpio = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PHASE_GATE_|ORQUESTADOR_|GIT_)/i.test(k)));
const hijo = spawn(process.execPath, [path.join(raiz, "build", "index.js"), "ui", "--demo", "--no-abrir", "--idioma", idioma], {
  env: { ...limpio, ...vacias, PHASE_GATE_LANG: idioma, TEMP: temporal, TMP: temporal, TMPDIR: temporal },
  stdio: ["ignore", "pipe", "pipe"],
});
const enlace = await new Promise((resolver, rechazar) => {
  let texto = "";
  const plazo = setTimeout(() => rechazar(new Error(`ui --demo no imprimió su enlace: ${texto}`)), 120_000);
  const leer = (d) => {
    texto += d.toString("utf-8");
    const m = texto.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);
    if (m) {
      clearTimeout(plazo);
      resolver(new URL(m[0]));
    }
  };
  hijo.stdout.on("data", leer);
  hijo.stderr.on("data", leer);
  hijo.on("exit", (codigo) => rechazar(new Error(`ui --demo terminó con ${codigo}: ${texto}`)));
});
// El token es de un solo uso: se canjea aquí una vez y cada contexto grabado recibe la cookie.
const canje = await fetch(enlace, { redirect: "manual" });
const [nombre, valor] = (canje.headers.get("set-cookie") ?? "").split(";")[0].split("=");
const origen = enlace.origin;
const raizDeLaDemo = path.join(temporal, process.getuid ? `mcp-phase-gate-demo${idioma === "es" ? "" : `-${idioma}`}-${process.getuid()}` : `mcp-phase-gate-demo${idioma === "es" ? "" : `-${idioma}`}`);

// ─── El sitio estático, bajo un subdirectorio como en Pages ─────────────────
const PREFIJO = "/mcp-phase-gate/";
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const estatico = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (!url.startsWith(PREFIJO)) return res.writeHead(404).end();
  const ruta = path.resolve(sitio, url.slice(PREFIJO.length) || "index.html");
  if (path.relative(sitio, ruta).startsWith("..") || !fs.statSync(ruta, { throwIfNoEntry: false })?.isFile()) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] ?? "application/octet-stream" }).end(fs.readFileSync(ruta));
});
await new Promise((r) => estatico.listen(0, "127.0.0.1", r));
const origenEstatico = `http://127.0.0.1:${estatico.address().port}${PREFIJO}`;

// ─── Las escenas ────────────────────────────────────────────────────────────
const navegador = await chromium.launch();
async function escena(numero, tamano, grabar) {
  const carpeta = path.join(trabajo, `escena-${numero}`);
  const contexto = await navegador.newContext({ viewport: tamano, recordVideo: { dir: carpeta, size: tamano }, reducedMotion: "no-preference", colorScheme: "dark", locale: idioma === "en" ? "en-US" : "es-ES" });
  await contexto.addCookies([{ name: nombre, value: valor, url: origen }]);
  const pagina = await contexto.newPage();
  await grabar(pagina);
  const video = pagina.video();
  await contexto.close();
  fs.copyFileSync(await video.path(), path.join(salida, `escena-${numero}.webm`));
  console.log(`escena ${numero}: ${path.join(salida, `escena-${numero}.webm`)}`);
}
const vista = (hash) => `${origen}/#${hash}${hash.includes("?") ? "&" : "?"}lang=${idioma}`;
const listo = (pagina) => pagina.evaluate(() => document.fonts.ready);

try {
  // 3. La Red: los tres proyectos de la demo como estaciones, con sus vías (repos y rama).
  await escena(3, TAMANO, async (p) => {
    await p.goto(vista("/red"));
    for (const proyecto of guion.proyectos) await p.getByRole("heading", { name: proyecto.nombre }).waitFor();
    await listo(p);
    await quieto(4000);
  });

  // 4. El tablero de la tarea terminada: semáforos en verde y la Fase 4 desplegada en vagones con sus sellos.
  await escena(4, TAMANO, async (p) => {
    await p.goto(vista(`/tablero/${tienda.nombre}/${terminada.nombre}`));
    await p.locator(".sello-verificado").nth(2).waitFor();
    await p.locator(".sello-anulado").first().waitFor();
    await listo(p);
    await quieto(2500);
    await p.locator(".sello-verificado").first().click();
    await quieto(3000);
  });

  // 5. En vivo: el lote con el commit pendiente ("en vía") se commitea y se ancla con record_batch, y el sello
  //    VERIFICADO llega por SSE sin recargar.
  await escena(5, TAMANO, async (p) => {
    await p.goto(vista(`/tablero/${tienda.nombre}/${enCurso.nombre}`));
    await p.locator(".sello-en-via").first().waitFor();
    await listo(p);
    await quieto(2000);
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
    await p.locator(".sello-nuevo").first().waitFor({ timeout: 30_000 });
    await quieto(3500);
  });

  // 6. El Taller: de dónde sale la ranura de pruebas de la Fase 3 (el preset frente a la fábrica), con su diff.
  await escena(6, TAMANO, async (p) => {
    await p.goto(vista(`/taller/${deAgente.nombre}?fase=3&tarea=${encodeURIComponent(deAgente.tareas[0].nombre)}`));
    const ranura = p.getByRole("button", { name: /fase-3\/pruebas/ }).first();
    await ranura.waitFor();
    await listo(p);
    await quieto(1000);
    await ranura.click();
    await quieto(3500);
  });

  // 7. El cierre: el sitio publicado, en un teléfono.
  await escena(7, TELEFONO, async (p) => {
    await p.goto(`${origenEstatico}#/red?lang=${idioma}`);
    await p.getByRole("heading", { name: guion.proyectos[0].nombre }).waitFor();
    await listo(p);
    await quieto(1200);
    await p.goto(`${origenEstatico}#/tablero/${tienda.nombre}/${terminada.nombre}?lang=${idioma}`);
    await p.locator(".sello-verificado, .sello-anulado").first().waitFor();
    await quieto(2000);
  });
} finally {
  await navegador.close();
  estatico.close();
  hijo.kill();
  await new Promise((r) => (hijo.exitCode !== null ? r() : hijo.on("exit", r)));
  try {
    const { borrarDemo } = await importar("studio/demo.js");
    if (fs.existsSync(raizDeLaDemo)) borrarDemo(raizDeLaDemo);
  } catch {
    // la demo vive en el temporal de este trabajo: se borra con él
  }
  fs.rmSync(trabajo, { recursive: true, force: true, maxRetries: 3 });
}
