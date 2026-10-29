// El sitio estático (§7.9 del plan) en Chromium real: `ui --export-static` del binario compilado, como en el
// workflow de Pages, servido bajo un subdirectorio (/mcp-phase-gate/) por un servidor de archivos sin nada
// más, como GitHub Pages: sin API, sin SSE y sin CSP. Todo lo que pide la página fuera del subdirectorio es
// un 404, y el fixture no admite ni un error en la consola ni una petición fuera de 127.0.0.1.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BINARIO, PREFIJO, expect, lotesDeLaFase, ponerTema, servirCarpeta, sinDesbordamiento, sinViolacionesGraves, sitio, testEstatico as test } from "./ayudas";

const SOLO_LECTURA = "En la demo publicada todo es de solo lectura. Pruébalo en tu equipo con npx mcp-phase-gate ui --demo.";

test("la Red, servida bajo un subdirectorio: los tres proyectos, la banda, ninguna petición a una API y Ajustes de solo lectura", async ({ page, servidor, registro }) => {
  await page.goto(sitio(servidor));
  await expect(page.locator(".banda-demo")).toHaveText("Demo: datos de ejemplo. Todo es de solo lectura.");
  for (const nombre of ["TIENDA", "ASISTENTE", "INVESTIGACION"]) await expect(page.getByRole("heading", { name: nombre })).toBeVisible();
  // La Red ya no cambia nada: su fila desplegada manda a Ajustes, que en el sitio publicado es de solo lectura.
  await page.getByRole("heading", { level: 2, name: "TIENDA" }).getByRole("button").click();
  await expect(page.getByRole("article", { name: "TIENDA" }).getByRole("link", { name: "Cambiar en Ajustes" })).toBeVisible();
  await page.goto(sitio(servidor, "#/ajustes/proyecto/TIENDA"));
  await expect(page.getByRole("heading", { level: 2, name: "Proyecto TIENDA" })).toBeVisible();
  await expect(page.getByText(SOLO_LECTURA)).toBeVisible();
  const botones = page.locator(".accion-solo-lectura button");
  expect(await botones.count()).toBeGreaterThan(0);
  for (const boton of await botones.all()) await expect(boton).toBeDisabled();
  await expect(page.getByLabel("Preset", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Política de commits")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Agregar a la lista" })).toHaveCount(0);
  expect(registro.peticiones.filter((u) => !u.startsWith(`${servidor.origen}${PREFIJO}`)), "todo bajo el subdirectorio").toEqual([]);
  expect(registro.peticiones.filter((u) => u.includes("/api/")), "ni API ni SSE").toEqual([]);
  // Los datos de la interfaz en español (§8.7): datos/es/.
  expect(registro.peticiones.some((u) => u.endsWith("/datos/es/indice.json"))).toBe(true);
  expect(registro.peticiones.some((u) => u.includes("/datos/en/"))).toBe(false);
});

test("al cambiar a inglés, cambia también de demo: SHOP, ASSISTANT y RESEARCH, la banda y los sellos en inglés", async ({ page, servidor, registro }) => {
  await page.goto(sitio(servidor));
  await expect(page.getByRole("heading", { name: "TIENDA" })).toBeVisible();
  await page.getByRole("group", { name: "Idioma" }).getByRole("button", { name: "EN" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".banda-demo")).toHaveText("Demo: sample data. Everything is read-only.");
  for (const nombre of ["SHOP", "ASSISTANT", "RESEARCH"]) await expect(page.getByRole("heading", { name: nombre })).toBeVisible();
  await expect(page.getByRole("heading", { name: "TIENDA" })).toHaveCount(0);
  expect(registro.peticiones.some((u) => u.endsWith("/datos/en/indice.json"))).toBe(true);
  await page.goto(sitio(servidor, "#/tablero/SHOP/discount-coupons?lang=en"));
  await ponerTema(page, "oscuro");
  const lista = lotesDeLaFase(page, "Phase 4");
  await expect(lista).toHaveCount(4);
  for (const i of [0, 1, 2]) await expect(lista.nth(i).locator(".estado-verificado")).toHaveText("verified");
  await expect(lista.nth(3).locator(".estado-descartado")).toHaveText("discarded");
  await sinViolacionesGraves(page, "el tablero estático en inglés");
  expect(registro.peticiones.filter((u) => !u.startsWith(`${servidor.origen}${PREFIJO}`)), "todo bajo el subdirectorio").toEqual([]);
});

test("el tablero de cupones-de-descuento: cuatro lotes, el visor y Reverificar anclas, en los dos temas y con axe", async ({ page, servidor, registro }) => {
  await page.goto(sitio(servidor, "#/tablero/TIENDA/cupones-de-descuento"));
  await ponerTema(page, "oscuro");
  const lista = lotesDeLaFase(page);
  await expect(lista).toHaveCount(4);
  for (const i of [0, 1, 2]) await expect(lista.nth(i).locator(".estado-verificado")).toHaveText("verificado");
  await expect(lista.nth(3).locator(".estado-descartado")).toHaveText("descartado");
  await lista.nth(0).getByRole("button").click();
  const recibo = page.getByRole("complementary", { name: /04 - Ejecución\/L01/ });
  await expect(recibo.getByLabel("Frontmatter")).toContainText("commit");
  await sinViolacionesGraves(page, "el tablero estático en tema oscuro");
  await recibo.getByRole("button", { name: "Cerrar el visor" }).click();
  await page.getByRole("button", { name: "Reverificar anclas" }).click();
  await expect(page.getByText("Anclas reverificadas contra git y el disco.")).toBeVisible();
  await ponerTema(page, "claro");
  await expect(lotesDeLaFase(page).nth(3)).toContainText("descartado");
  await sinViolacionesGraves(page, "el tablero estático en tema claro");
  expect(registro.peticiones.filter((u) => u.includes("/api/"))).toEqual([]);
});

test("el Taller, el Vigía y la Bitácora también salen de los datos exportados; lo que no se exportó se dice", async ({ page, servidor }) => {
  await page.goto(sitio(servidor, "#/taller/TIENDA?fase=4&tarea=cupones-de-descuento"));
  await expect(page.getByRole("list", { name: "Ranuras" }).getByRole("button").first()).toBeVisible();
  await page.getByText("Ver prompt completo").click();
  await expect(page.getByLabel("Prompt completo")).toContainText("<repos>/tienda-api");
  await page.goto(sitio(servidor, "#/vigia"));
  await expect(page.getByRole("heading", { name: "Diagnóstico" })).toBeVisible();
  await page.goto(sitio(servidor, "#/ajustes/clientes"));
  await expect(page.getByRole("article", { name: "Cursor" })).toBeVisible();
  await expect(page.getByText(SOLO_LECTURA).first()).toBeVisible();
  await page.goto(sitio(servidor, "#/bitacora/TIENDA/cupones-de-descuento"));
  await expect(page.getByRole("list", { name: "Eventos de la tarea" }).getByRole("listitem").first()).toBeVisible();
  await page.goto(sitio(servidor, "#/taller/TIENDA?fase=9"));
  await expect(page.getByText("Esto no está en la demo publicada. Pruébalo en tu equipo con npx mcp-phase-gate ui --demo.")).toBeVisible();
});

test("Ajustes en el sitio publicado: las páginas con datos se ven de solo lectura, y la página Studio funciona porque solo cambia el navegador", async ({ page, servidor, registro }) => {
  await page.goto(sitio(servidor, "#/ajustes/equipo"));
  await expect(page.getByRole("heading", { level: 2, name: "Este equipo" })).toBeVisible();
  await expect(page.getByLabel("Carpeta de la Documentación")).toBeDisabled();
  await expect(page.getByLabel("Carpeta de la Documentación")).toHaveValue("");
  await expect(page.getByText("Ahora se usa <Documentación>, de entorno.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Guardar los cambios/ })).toBeDisabled();
  await page.goto(sitio(servidor, "#/ajustes/avanzado"));
  await expect(page.getByRole("table", { name: "Variables avanzadas" }).getByRole("row", { name: /PHASE_GATE_STATE_PATH/ })).toContainText("<estado>");
  // La página Studio funciona: el tema y el idioma son del navegador.
  await page.goto(sitio(servidor, "#/ajustes/studio"));
  await page.getByRole("group", { name: "Tema" }).getByRole("radio", { name: "Oscuro" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  await page.getByRole("group", { name: "Idioma de la interfaz" }).getByRole("radio", { name: "English" }).check();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await sinViolacionesGraves(page, "Ajustes, Studio, en el sitio publicado");
  expect(registro.peticiones.filter((u) => u.includes("/api/")), "ni API ni SSE").toEqual([]);
  expect(registro.peticiones.filter((u) => !u.startsWith(`${servidor.origen}${PREFIJO}`)), "todo bajo el subdirectorio").toEqual([]);
});

// Sirve su propio sitio, en otro puerto: no usa la página del fixture, que solo admite el origen del suyo.
test("con una Documentación exportada, las páginas de Ajustes que enseñan rutas dicen que no están disponibles", async ({ browser }) => {
  const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-export-real-"));
  const [docs, repos, estado, config] = ["docs", "repos", "estado", "config"].map((n) => path.join(raiz, n)) as [string, string, string, string];
  for (const c of [docs, repos, estado, config]) fs.mkdirSync(c);
  const tarea = path.join(docs, "REAL", "Proyectos", "una-tarea");
  fs.mkdirSync(tarea, { recursive: true });
  fs.writeFileSync(path.join(tarea, "00 - Contexto Inicial.md"), "# Una tarea\n", "utf-8");
  const sitioReal = path.join(raiz, "sitio");
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PHASE_GATE_|ORQUESTADOR_)/i.test(k)));
  const r = spawnSync(process.execPath, [BINARIO, "ui", "--export-static", sitioReal, "--incluir-datos-reales", "--yes"], { env: { ...env, PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config }, encoding: "utf-8", timeout: 120_000 });
  expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
  const { servidor: estatico, puerto } = await servirCarpeta(sitioReal);
  const contexto = await browser.newContext({ locale: "es-ES" });
  const page = await contexto.newPage();
  const peticiones: string[] = [];
  page.on("request", (r) => peticiones.push(r.url()));
  try {
    const origen = `http://127.0.0.1:${puerto}${PREFIJO}`;
    for (const hash of ["#/ajustes/equipo", "#/ajustes/proyecto/REAL", "#/ajustes/clientes", "#/ajustes/avanzado"]) {
      await page.goto(`${origen}${hash}`);
      await expect(page.getByText("No disponible en una exportación.")).toBeVisible();
    }
    // Los menús siguen, y la página Studio funciona.
    await expect(page.getByRole("navigation", { name: "Páginas de Ajustes" }).getByRole("link", { name: "REAL", exact: true })).toBeVisible();
    await page.goto(`${origen}#/ajustes/studio`);
    await page.getByRole("group", { name: "Tema" }).getByRole("radio", { name: "Claro" }).check();
    await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
    await expect(page.getByText("No disponible en una exportación.")).toHaveCount(0);
    expect(peticiones.filter((u) => u.includes("/api/")), "ni API ni SSE").toEqual([]);
    // Ni una ruta de quien exportó en lo que se publica.
    for (const e of fs.readdirSync(sitioReal, { recursive: true, withFileTypes: true }).filter((x) => x.isFile() && /[.](?:json|js)$/.test(x.name))) {
      const texto = fs.readFileSync(path.join(e.parentPath, e.name), "utf-8").toLowerCase();
      // La ruta tal cual y con las barras invertidas escapadas, como sale dentro de un JSON.
      for (const ruta of [raiz, os.homedir()]) {
        expect(texto, `${e.name} lleva ${ruta}`).not.toContain(ruta.toLowerCase());
        expect(texto, `${e.name} lleva ${ruta} escapada`).not.toContain(ruta.toLowerCase().split("\\").join("\\\\"));
      }
    }
  } finally {
    await contexto.close();
    await new Promise((resolver) => estatico.close(resolver));
    fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("en un teléfono (390×844), nada desborda", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitio(servidor));
  await expect(page.getByRole("heading", { name: "TIENDA" })).toBeVisible();
  await sinDesbordamiento(page, "la Red estática");
  await page.goto(sitio(servidor, "#/tablero/TIENDA/cupones-de-descuento"));
  await expect(lotesDeLaFase(page)).toHaveCount(4);
  await sinDesbordamiento(page, "el tablero estático");
});
