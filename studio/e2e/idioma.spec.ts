// El Studio en inglés (§8.6 del plan) en Chromium real: las cinco vistas con sus textos en inglés, `<html
// lang="en">` y axe sin violaciones graves; el selector ES / EN cambia el idioma en vivo y se recuerda;
// `#?lang=en` lo comparte por la URL; y lo que dice el servidor (describeEstado, los hallazgos de doctor,
// los errores, el asistente de clientes) llega también en inglés, porque cada petición lleva el idioma.
// Las pruebas de las vistas en español son las de siempre (el navegador va en es-ES, playwright.config.ts).

import { expect, fasesDeLaTarea, lotesDeLaFase, ningunEstadoSoloColor, ponerTema, sinViolacionesGraves, test } from "./ayudas";

test.describe("con el navegador en inglés", () => {
  test.use({ locale: "en-US" });

  test("la Red: textos de la interfaz y del servidor en inglés, plegada y desplegada, <html lang=en>, y axe en los dos temas", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/red`);
    await ponerTema(page, "oscuro");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Project network" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "Network" })).toHaveAttribute("aria-current", "page");
    for (const vista of ["Board", "Workshop", "Lookout", "Logbook"]) await expect(page.getByRole("link", { name: vista, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("group", { name: "Language" }).getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    const tienda = page.getByRole("article", { name: "TIENDA" });
    await expect(page.getByRole("list", { name: "Projects of the Documentation" })).toBeVisible();
    await expect(tienda.locator(".campo-preset dt")).toHaveText("Preset");
    await expect(tienda.locator(".campo-preset dd")).toHaveText("multi-repo-feature · from the project");
    await expect(tienda.getByRole("listitem").filter({ hasText: "api" })).toContainText("branch main · clean tree");
    await expect(tienda.locator(".campo-sesion")).toContainText("MCP session");
    await expect(tienda.locator(".campo-sesion dd")).toHaveText("Open in cliente-e2e 1.0");
    // describeEstado, del servidor: en inglés porque la petición lo pidió.
    await expect(tienda.locator(".campo-tarea")).toContainText("Active task");
    await expect(tienda.locator(".campo-tarea dd")).toContainText("batch 2 of 2, pending commit");
    await expect(page.getByRole("article", { name: "INVESTIGACION" }).locator(".campo-tarea dd")).toContainText("(deduced, the most recent)");
    await expect(page.getByRole("article", { name: "INVESTIGACION" }).locator(".campo-sesion dd")).toHaveText("No MCP session has it open");
    await expect(page.getByRole("article", { name: "ROTO" }).locator(".alerta-proyecto")).toHaveText("phase-gate.json invalid");
    await tienda.getByRole("heading", { level: 2, name: "TIENDA" }).getByRole("button").click();
    await expect(tienda.locator(".campo-manifiesto dd")).toHaveText("phase-gate.json valid");
    await expect(tienda.getByRole("listitem").filter({ hasText: "api" })).toContainText("api (backend)");
    const roto = page.getByRole("article", { name: "ROTO" });
    await roto.getByRole("heading", { level: 2, name: "ROTO" }).getByRole("button").click();
    await expect(roto.locator(".detalle-error")).toContainText("is not valid JSON");
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, "la Red en inglés, tema oscuro");
    await ponerTema(page, "claro");
    await expect(page.getByRole("button", { name: "Dark theme" })).toHaveAttribute("aria-pressed", "false");
    await expect(tienda.getByRole("listitem").filter({ hasText: "api" })).toContainText("api (backend) · branch main · clean tree");
    await sinViolacionesGraves(page, "la Red en inglés, tema claro");
  });

  test("el Tablero: fases y estados de lote en inglés (verified, sealed, with pending items, rejected, discarded, manual, pending commit, stale)", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
    await ponerTema(page, "oscuro");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const lista = lotesDeLaFase(page, "Batches of Phase 4");
    await expect(lista).toHaveCount(6);
    await expect(lista.nth(0).locator(".estado-sellado")).toHaveText("sealed");
    await expect(lista.nth(1).locator(".estado-con-pendientes")).toHaveText("with pending items");
    await expect(lista.nth(2).locator(".estado-rechazado")).toHaveText("rejected");
    await expect(lista.nth(3).locator(".estado-descartado")).toHaveText("discarded");
    await expect(lista.nth(4).locator(".estado-manual")).toHaveText("manual");
    await expect(lista.nth(5).locator(".estado-sin-recibo")).toHaveText("no receipt");
    await expect(page.getByRole("table", { name: "Batches of Phase 4" }).getByRole("columnheader")).toHaveText(["Batch", "Goal", "Repo", "State", "Detail", "Anchor", "Receipt"]);
    const fases = fasesDeLaTarea(page, "Phases of the task");
    await expect(fases.nth(0)).toContainText("Initial context");
    await expect(fases.nth(1)).toContainText("Phase 1");
    await expect(fases.nth(1)).toContainText("closed");
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, "el tablero en inglés, tema oscuro");

    await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
    await expect(lotesDeLaFase(page, "Batches of Phase 4").nth(1).locator(".estado-commit-pendiente")).toHaveText("pending commit");
    await expect(fasesDeLaTarea(page, "Phases of the task").nth(4)).toContainText("in progress");
    await ponerTema(page, "claro");
    await expect(lotesDeLaFase(page, "Batches of Phase 4").nth(0)).toContainText("verified");
    await sinViolacionesGraves(page, "el tablero en inglés, tema claro");

    await page.goto(`${servidor.origen}/#/tablero/TIENDA/reescrita`);
    await page.getByRole("button", { name: "Re-verify anchors" }).click();
    await expect(page.getByText("Anchors re-verified against git and the disk.")).toBeVisible();
    await expect(lotesDeLaFase(page, "Batches of Phase 4").nth(0).locator(".estado-no-vigente")).toHaveText("stale", { timeout: 15_000 });
  });

  test("el Taller: ranuras con su alias inglés y el id canónico, y las capas en inglés", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/taller/TALLER?fase=3`);
    await ponerTema(page, "oscuro");
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
    await sinViolacionesGraves(page, "el Taller en inglés, tema oscuro");
    await ponerTema(page, "claro");
    await sinViolacionesGraves(page, "el Taller en inglés, tema claro");
  });

  test("el Vigía: los hallazgos por código, con el texto del servidor y el arreglo en inglés", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/vigia`);
    await ponerTema(page, "oscuro");
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
    await sinViolacionesGraves(page, "el Vigía en inglés, tema oscuro");
    await ponerTema(page, "claro");
    await sinViolacionesGraves(page, "el Vigía en inglés, tema claro");
  });

  test("la Bitácora: tipos y títulos de los eventos en inglés, y la fecha completa en el title", async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/bitacora/TIENDA/cerrada`);
    await ponerTema(page, "oscuro");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Logbook of cerrada" })).toBeVisible();
    const eventos = page.getByRole("list", { name: "Events of the task" }).getByRole("listitem");
    for (const tipo of ["Document", "Receipt", "Commit", "Re-anchor", "Phase closed"]) await expect(eventos.filter({ hasText: tipo }).first(), tipo).toBeVisible();
    await expect(eventos.filter({ hasText: "re-anchored:" }).first()).toBeVisible(); // el título, del servidor
    await expect(page.locator(".linea-de-tiempo time").first()).toHaveAttribute("title", /\b20\d\d\b/);
    await expect(page.getByRole("group", { name: "What to show" })).toBeVisible();
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, "la Bitácora en inglés, tema oscuro");
    await ponerTema(page, "claro");
    await sinViolacionesGraves(page, "la Bitácora en inglés, tema claro");
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
