// El Studio en inglés (§8.6 del plan) en Chromium real: las cinco vistas con sus textos en inglés, `<html
// lang="en">` y axe sin violaciones graves; el selector ES / EN cambia el idioma en vivo y se recuerda;
// `#?lang=en` lo comparte por la URL; y lo que dice el servidor (describeEstado, los hallazgos de doctor,
// los errores, el asistente de clientes) llega también en inglés, porque cada petición lleva el idioma.
// Las pruebas de las vistas en español son las de siempre (el navegador va en es-ES, playwright.config.ts).

import { expect, ningunEstadoSoloColor, ponerModo, sinViolacionesGraves, test } from "./ayudas";

const vagones = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Batches of Phase 4" });

test.describe("con el navegador en inglés", () => {
  test.use({ locale: "en-US" });

  test("la Red: textos de la interfaz y del servidor en inglés, <html lang=en>, y axe en los dos modos", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/red`);
    await ponerModo(page, "cabina");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Project network" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "Network" })).toHaveAttribute("aria-current", "page");
    for (const vista of ["Board", "Workshop", "Lookout", "Logbook"]) await expect(page.getByRole("link", { name: vista, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mode: Cockpit" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Language" }).getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    const tienda = page.getByRole("article", { name: "TIENDA" });
    await expect(tienda.locator(".placa")).toHaveText("multi-repo-feature · from the project");
    await expect(tienda).toContainText("phase-gate.json valid");
    await expect(tienda.getByRole("listitem").filter({ hasText: "api" })).toContainText("branch main · clean tree");
    await expect(tienda).toContainText("Open in cliente-e2e 1.0");
    // describeEstado, del servidor: en inglés porque la petición lo pidió.
    await expect(tienda).toContainText("batch 2 of 2, pending commit");
    await expect(page.getByRole("article", { name: "ROTO" })).toContainText("is not valid JSON");
    await expect(page.getByRole("article", { name: "INVESTIGACION" })).toContainText("No MCP session has it open");
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, "la Red en inglés, modo cabina");
    await ponerModo(page, "sobrio");
    await expect(page.getByRole("button", { name: "Mode: Plain" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Projects of the Documentation" }).getByRole("row", { name: /TIENDA/ })).toContainText("api: branch main · clean tree");
    await sinViolacionesGraves(page, "la Red en inglés, modo sobrio");
  });

  test("el Tablero: semáforos y sellos en inglés (VERIFIED, SEALED, WITH PENDING ITEMS, REJECTED, VOID, MANUAL, IN TRANSIT)", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
    await ponerModo(page, "cabina");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const lista = vagones(page).getByRole("listitem");
    await expect(lista).toHaveCount(6);
    await expect(lista.nth(0).locator(".sello-sellado")).toContainText("SEALED");
    await expect(lista.nth(1).locator(".sello-pendientes")).toContainText("VERIFIED");
    await expect(lista.nth(1).locator(".sello-banda")).toHaveText("WITH PENDING ITEMS");
    await expect(lista.nth(2).locator(".sello-rechazado")).toContainText("REJECTED");
    await expect(lista.nth(3).locator(".sello-anulado")).toContainText("VOID");
    await expect(lista.nth(4).locator(".sello-manual")).toContainText("MANUAL");
    await expect(lista.nth(5)).toContainText("no receipt");
    const estaciones = page.getByRole("list", { name: "Stations of the task" }).getByRole("listitem");
    await expect(estaciones.nth(0)).toContainText("Initial context");
    await expect(estaciones.nth(1)).toContainText("Phase 1");
    await expect(estaciones.nth(1)).toContainText("closed");
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, "el tablero en inglés, modo cabina");

    await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
    await expect(vagones(page).getByRole("listitem").nth(1).locator(".sello-en-via")).toContainText("IN TRANSIT");
    await expect(vagones(page).getByRole("listitem").nth(1)).toContainText("pending commit");
    await expect(page.getByRole("list", { name: "Stations of the task" }).getByRole("listitem").nth(4)).toContainText("in progress");
    await ponerModo(page, "sobrio");
    const tabla = page.getByRole("table", { name: "Batches of Phase 4" });
    await expect(tabla.getByRole("row", { name: /L01/ })).toContainText(/verified · [0-9a-f]{7}/);
    await expect(tabla.getByRole("row", { name: /L02/ })).toContainText("pending");
    await sinViolacionesGraves(page, "el tablero en inglés, modo sobrio");

    await page.goto(`${servidor.origen}/#/tablero/TIENDA/reescrita`);
    await page.getByRole("button", { name: "Re-verify anchors" }).click();
    await expect(page.getByText("Anchors re-verified against git and the disk.")).toBeVisible();
    await expect(tabla.getByRole("row", { name: /L01/ })).toContainText("stale", { timeout: 15_000 });
  });

  test("el Taller: ranuras con su alias inglés y el id canónico, y las capas en inglés", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/taller/TALLER?fase=3`);
    await ponerModo(page, "cabina");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Prompt workshop" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Slots of Phase 3/ })).toContainText("including the global ones");
    const ranuras = page.getByRole("list", { name: "Slots" });
    await expect(ranuras.getByRole("button", { name: /phase-3\/tests \(fase-3\/pruebas\)/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Layers" })).toContainText("factory");
    await expect(ranuras.getByText(/^preset: ai-agent-ops$/).first()).toBeVisible();
    await ranuras.getByRole("button", { name: /phase-3\/tests/ }).click();
    await expect(page.getByRole("button", { name: "Edit phase-3/tests (fase-3/pruebas) in the project layer: preview" })).toBeVisible();
    await expect(page.getByText("Commit policy")).toBeVisible();
    await sinViolacionesGraves(page, "el Taller en inglés, modo cabina");
    await ponerModo(page, "sobrio");
    await sinViolacionesGraves(page, "el Taller en inglés, modo sobrio");
  });

  test("el Vigía: los hallazgos por código, con el texto del servidor y el arreglo en inglés", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/vigia`);
    await ponerModo(page, "cabina");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Lookout" })).toBeVisible();
    const errores = page.getByRole("region", { name: /^Errors/ });
    const hallazgo = errores.getByRole("listitem").filter({ hasText: "MANIFIESTO-INVALIDO" });
    await expect(hallazgo).toContainText("How to fix it: Fix the phase-gate.json");
    await expect(hallazgo).toContainText("is not valid JSON"); // el texto del hallazgo, del servidor
    for (const arreglo of await page.locator(".arreglo").allTextContents()) expect(arreglo, "cada código tiene su arreglo").not.toContain("Read the finding's text");
    await expect(page.getByText(/File watching active/)).toBeVisible();
    const cursor = page.getByRole("article", { name: "Cursor" });
    await expect(cursor).toContainText("not detected");
    // Del servidor. Si vigia.spec.ts ya configuró Cursor en este mismo `ui`, dice que no hay cambios.
    await expect(cursor).toContainText(/It would be registered as "pg"\.|No changes: already registered as "pg"\./);
    await expect(page.getByRole("table", { name: "Environment variables" })).toBeVisible();
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, "el Vigía en inglés, modo cabina");
    await ponerModo(page, "sobrio");
    await sinViolacionesGraves(page, "el Vigía en inglés, modo sobrio");
  });

  test("la Bitácora: tipos y títulos de los eventos en inglés, y la fecha completa en el title", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/bitacora/TIENDA/cerrada`);
    await ponerModo(page, "cabina");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Logbook of cerrada" })).toBeVisible();
    const eventos = page.getByRole("list", { name: "Events of the task" }).getByRole("listitem");
    for (const tipo of ["Document", "Receipt", "Commit", "Re-anchor", "Phase closed"]) await expect(eventos.filter({ hasText: tipo }).first(), tipo).toBeVisible();
    await expect(eventos.filter({ hasText: "re-anchored:" }).first()).toBeVisible(); // el título, del servidor
    await expect(page.locator(".linea-de-tiempo time").first()).toHaveAttribute("title", /\b20\d\d\b/);
    await expect(page.getByRole("group", { name: "What to show" })).toBeVisible();
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, "la Bitácora en inglés, modo cabina");
    await ponerModo(page, "sobrio");
    await sinViolacionesGraves(page, "la Bitácora en inglés, modo sobrio");
  });

  test("un error de la API llega en inglés", async ({ page, servidor, registro }) => {
    registro.permitidos.push(/the server responded with a status of 404/);
    await page.goto(`${servidor.origen}/#/tablero/TIENDA/no-existe`);
    await expect(page.getByRole("alert").first()).toHaveText('Task "no-existe" does not exist in TIENDA.');
  });
});

test("el selector ES / EN cambia el idioma en vivo, vuelve a pedir los datos y se recuerda al recargar", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  const tienda = page.getByRole("article", { name: "TIENDA" });
  await expect(tienda).toContainText("lote 2 de 2, commit pendiente");
  await page.evaluate(() => ((window as unknown as { __sinRecargar: boolean }).__sinRecargar = true));

  const idiomas = page.getByRole("group", { name: "Idioma" });
  await expect(idiomas.getByRole("button", { name: "ES" })).toHaveAttribute("aria-pressed", "true");
  await idiomas.getByRole("button", { name: "EN" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Project network" })).toBeVisible();
  await expect(tienda).toContainText("batch 2 of 2, pending commit"); // pedido otra vez, ya en inglés
  await expect(page.getByRole("group", { name: "Language" }).getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => (window as unknown as { __sinRecargar?: boolean }).__sinRecargar)).toBe(true);
  await sinViolacionesGraves(page, "la Red tras cambiar a inglés");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Project network" })).toBeVisible();

  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "ES" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Red de proyectos" })).toBeVisible();
  await expect(tienda).toContainText("lote 2 de 2, commit pendiente");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("#?lang=en comparte el idioma por la URL, la elección se queda al navegar, y #?lang=es lo devuelve", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#?lang=en`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Project network" })).toBeVisible();
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await expect(page).toHaveURL(/#\/tablero$/);
  await expect(page.getByRole("heading", { level: 1, name: "Board" })).toBeVisible();
  await expect(page.getByText("Choose a task.")).toBeVisible();

  // El selector, con lang en el enlace, lo reescribe: al recargar no vuelve el de antes.
  await page.goto(`${servidor.origen}/#/red?lang=en`);
  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "ES" }).click();
  await expect(page).toHaveURL(/#\/red\?lang=es$/);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");

  await page.goto(`${servidor.origen}/#/vigia?lang=en`);
  await expect(page.getByRole("heading", { level: 1, name: "Lookout" })).toBeVisible();
  await page.goto(`${servidor.origen}/#/vigia?lang=es`);
  await expect(page.getByRole("heading", { level: 1, name: "Vigía" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("un cambio del hash justo después de cargar, antes de que corran los efectos, también cambia de vista", async ({ page, servidor }) => {
  // Así va un runner lento: Preact corre los efectos tras el siguiente frame o, sin él, con un temporizador de
  // 35 ms. Sin frames y con ese temporizador a 2 s, el hashchange llega antes de que la vista lo escuche.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    const original = window.setTimeout;
    window.setTimeout = ((f: TimerHandler, ms?: number, ...resto: unknown[]) => original(f, ms === 35 ? 2000 : ms, ...resto)) as typeof window.setTimeout;
  });
  await page.goto(`${servidor.origen}/#/red?lang=es`);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.goto(`${servidor.origen}/#/vigia?lang=en`);
  await expect(page.getByRole("heading", { level: 1, name: "Lookout" })).toBeVisible();
});
