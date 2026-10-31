// Los arreglos de la revisión final del Studio, en Chromium real: el cambio de idioma de la demo publicada en
// cada ruta con proyecto, el Taller y la Red sin proyectos, la banda de la demo dentro de un landmark (axe sin
// «region») y el título de la pestaña.

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";

import type { Browser, Page } from "@playwright/test";

import { expect, lanzarUi, ponerTema, sitio, test as vivo, testEstatico as test } from "./ayudas";
import type { Arbol } from "./arbol";
import type { Servidor } from "./ayudas";

const requerir = createRequire(import.meta.url);
const AXE = fs.readFileSync(requerir.resolve("axe-core/axe.min.js"), "utf-8");

const idiomas = (page: Page) => page.getByRole("group", { name: /^(?:Idioma|Language)$/ });
const hashActual = (page: Page) => page.evaluate(() => window.location.hash);

// ─── El cambio de idioma de la demo publicada ───────────────────────────────────────────────────────────────
// Cada ruta con proyecto o tarea, en español y su equivalente en inglés. Los nombres cambian de idioma en los
// datos (TIENDA ↔ SHOP), y la ruta tiene que cambiar con ellos.
const RUTAS: { nombre: string; es: string; en: string; visible: (page: Page, proyecto: string) => Promise<void> }[] = [
  { nombre: "el Tablero", es: "#/tablero/TIENDA/envio-gratis", en: "#/tablero/SHOP/free-shipping", visible: (page, p) => expect(page.getByRole("main")).toContainText(p) },
  { nombre: "la Bitácora", es: "#/bitacora/TIENDA/envio-gratis", en: "#/bitacora/SHOP/free-shipping", visible: (page, p) => expect(page.getByRole("main")).toContainText(p) },
  { nombre: "Ajustes › proyecto", es: "#/ajustes/proyecto/TIENDA", en: "#/ajustes/proyecto/SHOP", visible: (page, p) => expect(page.getByRole("heading", { level: 2, name: new RegExp(`${p}$`) })).toBeVisible() },
  { nombre: "el Taller", es: "#/taller/TIENDA?fase=1&tarea=envio-gratis", en: "#/taller/SHOP?fase=1&tarea=free-shipping", visible: (page, p) => expect(page.getByLabel(/^(?:Proyecto|Project)$/)).toHaveValue(p) },
];

for (const ruta of RUTAS) {
  test(`al cambiar de idioma en ${ruta.nombre}, la ruta pasa al nombre equivalente y la vista sigue entera, en los dos sentidos`, async ({ page, servidor }) => {
    await page.goto(sitio(servidor, ruta.es));
    await ruta.visible(page, "TIENDA");
    await idiomas(page).getByRole("button", { name: "EN" }).click();
    await expect.poll(() => hashActual(page)).toBe(ruta.en);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await ruta.visible(page, "SHOP");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText(/This is not in the published demo/)).toHaveCount(0);
    await idiomas(page).getByRole("button", { name: "ES" }).click();
    await expect.poll(() => hashActual(page)).toBe(ruta.es);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await ruta.visible(page, "TIENDA");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("al cambiar de idioma con un enlace con ?lang, el enlace sigue diciendo el idioma nuevo y el nombre equivalente", async ({ page, servidor }) => {
  await page.goto(sitio(servidor, "#/tablero/TIENDA/envio-gratis?lang=es"));
  await expect(page.getByRole("main")).toContainText("TIENDA");
  await idiomas(page).getByRole("button", { name: "EN" }).click();
  await expect.poll(() => hashActual(page)).toBe("#/tablero/SHOP/free-shipping?lang=en");
  await expect(page.getByRole("main")).toContainText("SHOP");
});

test("al cambiar de idioma en una ruta sin equivalente, vuelve a la Red en vez de dejar la vista rota", async ({ page, servidor }) => {
  await page.goto(sitio(servidor, "#/tablero/NO-EXISTE/nada"));
  await idiomas(page).getByRole("button", { name: "EN" }).click();
  await expect.poll(() => hashActual(page)).toBe("#/red");
  await expect(page.getByRole("heading", { level: 1, name: "Network" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SHOP" })).toBeVisible();
  // Un proyecto que sí existe, con una tarea que no.
  await page.goto(sitio(servidor, "#/tablero/SHOP/no-existe"));
  await idiomas(page).getByRole("button", { name: "ES" }).click();
  await expect.poll(() => hashActual(page)).toBe("#/red");
  await expect(page.getByRole("heading", { name: "TIENDA" })).toBeVisible();
});

test("las vistas sin proyecto ni tarea no cambian de ruta al cambiar de idioma", async ({ page, servidor }) => {
  await page.goto(sitio(servidor, "#/vigia"));
  await idiomas(page).getByRole("button", { name: "EN" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await hashActual(page)).toBe("#/vigia");
});

// ─── La banda de la demo y axe ──────────────────────────────────────────────────────────────────────────────
// Todas las reglas de axe, con sus violaciones de cualquier gravedad: la banda fuera de un landmark era una
// violación moderada de «region».
async function violacionesDeAxe(page: Page): Promise<{ id: string; impact: string | null; nodos: string[] }[]> {
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodos: v.nodes.map((n) => n.target.join(" ")).slice(0, 3) }));
  });
}

const VISTAS = ["#/red", "#/tablero/TIENDA/envio-gratis", "#/taller/TIENDA", "#/vigia", "#/bitacora/TIENDA/envio-gratis", "#/ajustes/equipo"];

test("la banda de la demo va dentro de un landmark, y axe no marca ninguna violación en ninguna vista, en los dos temas y los dos idiomas", async ({ page, servidor }) => {
  for (const idioma of ["es", "en"]) {
    for (const hash of VISTAS) {
      await page.goto(sitio(servidor, `${hash}${hash.includes("?") ? "&" : "?"}lang=${idioma}`));
      await expect(page.locator(".banda-demo")).toBeVisible();
      // La banda es un complementary con nombre.
      await expect(page.locator("aside.banda-demo")).toHaveAttribute("aria-label", /.+/);
      for (const tema of ["claro", "oscuro"] as const) {
        await ponerTema(page, tema);
        await expect(page.getByRole("main")).toBeVisible();
        expect(await violacionesDeAxe(page), `axe en ${hash} (${idioma}, tema ${tema})`).toEqual([]);
      }
    }
  }
});

// ─── El título de la pestaña ────────────────────────────────────────────────────────────────────────────────
test("el título de la pestaña dice la vista y, si los hay, el proyecto y la tarea, y cambia con el idioma", async ({ page, servidor }) => {
  const casos: { hash: string; es: string; en: string }[] = [
    { hash: "#/red", es: "Red · Studio", en: "Network · Studio" },
    { hash: "#/tablero", es: "Tablero · Studio", en: "Board · Studio" },
    { hash: "#/tablero/TIENDA/envio-gratis", es: "Tablero · TIENDA · envio-gratis · Studio", en: "Board · SHOP · free-shipping · Studio" },
    { hash: "#/bitacora/TIENDA/envio-gratis", es: "Bitácora · TIENDA · envio-gratis · Studio", en: "Logbook · SHOP · free-shipping · Studio" },
    { hash: "#/taller/TIENDA?tarea=envio-gratis", es: "Taller · TIENDA · envio-gratis · Studio", en: "Workshop · SHOP · free-shipping · Studio" },
    { hash: "#/taller/TIENDA", es: "Taller · TIENDA · Studio", en: "Workshop · SHOP · Studio" },
    { hash: "#/vigia", es: "Vigía · Studio", en: "Lookout · Studio" },
    { hash: "#/ajustes/proyecto/TIENDA", es: "Ajustes · TIENDA · Studio", en: "Settings · SHOP · Studio" },
    { hash: "#/ajustes/equipo", es: "Ajustes · Studio", en: "Settings · Studio" },
  ];
  for (const caso of casos) {
    await page.goto(sitio(servidor, caso.hash));
    await page.reload();
    await expect(page, caso.hash).toHaveTitle(caso.es);
    await idiomas(page).getByRole("button", { name: "EN" }).click();
    await expect(page, `${caso.hash} en inglés`).toHaveTitle(caso.en);
    await idiomas(page).getByRole("button", { name: "ES" }).click();
    await expect(page, `${caso.hash} de vuelta en español`).toHaveTitle(caso.es);
  }
  // Al navegar dentro de la página, el título sigue a la ruta.
  await page.goto(sitio(servidor, "#/red"));
  await page.getByRole("navigation", { name: "Vistas" }).getByRole("link", { name: "Vigía" }).click();
  await expect(page).toHaveTitle("Vigía · Studio");
});

// ─── El Taller y la Red sin proyectos ───────────────────────────────────────────────────────────────────────
// Un Studio de verdad sobre una Documentación vacía, y sobre una ruta que no existe.
async function conUiSinProyectos(browser: Browser, docs: (raiz: string) => string, hacer: (page: Page, servidor: Servidor) => Promise<void>): Promise<void> {
  const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-sin-proyectos-"));
  const [repos, estado, config] = ["repos", "estado", "config"].map((n) => path.join(raiz, n)) as [string, string, string];
  for (const c of [repos, estado, config]) fs.mkdirSync(c);
  const carpeta = docs(raiz);
  const arbol: Arbol = { raiz, docs: carpeta, repos, estado, config, env: { PHASE_GATE_DOCS_PATH: carpeta, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config, PHASE_GATE_LANG: "es" } };
  const { hijo, servidor } = await lanzarUi(arbol);
  const contexto = await browser.newContext({ locale: "es-ES" });
  await contexto.addCookies([{ ...servidor.cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict", secure: false }]);
  const page = await contexto.newPage();
  try {
    await hacer(page, servidor);
  } finally {
    await contexto.close();
    hijo.kill();
    await new Promise((r) => (hijo.exitCode !== null ? r(null) : hijo.on("exit", r)));
    fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
  }
}

vivo("el Taller con la Documentación vacía no se queda cargando: dice que no hay proyectos", async ({ browser }) => {
  await conUiSinProyectos(
    browser,
    (raiz) => {
      const docs = path.join(raiz, "docs");
      fs.mkdirSync(docs);
      return docs;
    },
    async (page, servidor) => {
      await page.goto(`${servidor.origen}/#/taller`);
      await expect(page.getByRole("heading", { level: 1, name: "Taller" })).toBeVisible();
      await expect(page.getByText("No hay proyectos en la Documentación todavía.")).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "Cargando" })).toHaveCount(0);
      await page.waitForTimeout(1000);
      await expect(page.getByRole("status").filter({ hasText: "Cargando" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Abrir Ajustes" })).toHaveAttribute("href", "#/ajustes/equipo");
    }
  );
});

vivo("el Taller con la ruta de la Documentación rota no se queda cargando: enseña el aviso de /api/proyectos", async ({ browser }) => {
  await conUiSinProyectos(
    browser,
    (raiz) => path.join(raiz, "no-existe"),
    async (page, servidor) => {
      await page.goto(`${servidor.origen}/#/taller`);
      await expect(page.getByRole("heading", { level: 1, name: "Taller" })).toBeVisible();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page.getByRole("alert")).not.toHaveText("");
      await expect(page.getByRole("status").filter({ hasText: "Cargando" })).toHaveCount(0);
      await expect(page.getByText("No hay proyectos en la Documentación todavía.")).toHaveCount(0);
    }
  );
});

vivo("el Taller con un error de /api/proyectos (HTTP) enseña el aviso y no se queda cargando", async ({ page, servidor, registro }) => {
  registro.permitidos.push(/status of 500/);
  await page.route("**/api/proyectos", (route) => route.fulfill({ status: 500, json: { error: "la API de prueba falló" } }));
  await page.goto(`${servidor.origen}/#/taller`);
  await expect(page.getByRole("alert")).toHaveText("la API de prueba falló");
  await expect(page.getByRole("status").filter({ hasText: "Cargando" })).toHaveCount(0);
});

vivo("la Red con la Documentación vacía dice el siguiente paso y enlaza a Ajustes, en los dos idiomas", async ({ browser }) => {
  await conUiSinProyectos(
    browser,
    (raiz) => {
      const docs = path.join(raiz, "docs");
      fs.mkdirSync(docs);
      return docs;
    },
    async (page, servidor) => {
      await page.goto(`${servidor.origen}/#/red`);
      await expect(page.getByText("No hay proyectos en la Documentación todavía.")).toBeVisible();
      await expect(page.getByText(/\/f1/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Abrir Ajustes" })).toHaveAttribute("href", "#/ajustes/equipo");
      await page.goto(`${servidor.origen}/#/red?lang=en`);
      await expect(page.getByText("There are no projects in the Documentation yet.")).toBeVisible();
      await expect(page.getByText(/\/f1/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "#/ajustes/equipo");
    }
  );
});

// ─── La banda de `ui --demo` y la ruta de la carpeta temporal ───────────────────────────────────────────────
// La carpeta temporal llega por un enlace (en Windows puede llegar como un nombre corto 8.3): el título de la
// banda tiene que decir la ruta real, no la que dio el sistema, y el texto de la banda es corto: a 390 px cabe en
// dos líneas.
vivo("ui --demo con la carpeta temporal por un enlace: el título de la banda dice la ruta larga, el texto es corto y a 390 px no desborda", async ({ browser }) => {
  vivo.setTimeout(180_000);
  const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-demo-larga-"));
  const real = path.join(raiz, "temporal-real");
  const enlace = path.join(raiz, "enlace");
  const [docs, repos, estado, config] = ["docs", "repos", "estado", "config"].map((n) => path.join(raiz, n)) as [string, string, string, string];
  for (const c of [real, docs, repos, estado, config]) fs.mkdirSync(c);
  fs.symlinkSync(real, enlace, process.platform === "win32" ? "junction" : "dir");
  const demo = path.join(real, process.getuid ? `mcp-phase-gate-demo-${process.getuid()}` : "mcp-phase-gate-demo");
  const arbol: Arbol = { raiz, docs, repos, estado, config, env: { PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config, TEMP: enlace, TMP: enlace, TMPDIR: enlace } };
  const { hijo, servidor } = await lanzarUi(arbol, ["--demo", "--idioma", "es"]);
  const contexto = await browser.newContext({ locale: "es-ES", viewport: { width: 390, height: 844 } });
  await contexto.addCookies([{ ...servidor.cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict", secure: false }]);
  const page = await contexto.newPage();
  try {
    await page.goto(`${servidor.origen}/`);
    const banda = page.locator(".banda-demo");
    await expect(banda).toHaveText("Demo: datos de ejemplo. Qué es mcp-phase-gate");
    await expect(banda).toHaveAttribute("title", `Demo: datos de ejemplo en ${demo}`);
    expect(await banda.getAttribute("title")).not.toContain(enlace);
    const { alto, linea } = await banda.evaluate((e) => ({ alto: e.getBoundingClientRect().height, linea: parseFloat(getComputedStyle(e).lineHeight) }));
    expect(alto, "la banda no ocupa más de dos líneas").toBeLessThanOrEqual(linea * 2 + 24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally {
    await contexto.close();
    hijo.kill();
    await new Promise((r) => (hijo.exitCode !== null ? r(null) : hijo.on("exit", r)));
    const { borrarDemo } = await import("../../build/studio/demo.js");
    if (fs.existsSync(demo)) borrarDemo(demo);
    fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
  }
});
