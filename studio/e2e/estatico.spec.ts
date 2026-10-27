// El sitio estático (§7.9 del plan) en Chromium real: `ui --export-static` del binario compilado, como en el
// workflow de Pages, servido bajo un subdirectorio (/mcp-phase-gate/) por un servidor de archivos sin nada
// más, como GitHub Pages: sin API, sin SSE y sin CSP. Todo lo que pide la página fuera del subdirectorio es
// un 404, y el fixture no admite ni un error en la consola ni una petición fuera de 127.0.0.1.

import { PREFIJO, expect, lotesDeLaFase, ponerTema, sinDesbordamiento, sinViolacionesGraves, sitio, testEstatico as test } from "./ayudas";

const SOLO_LECTURA = "En la demo publicada todo es de solo lectura. Pruébalo en tu equipo con npx mcp-phase-gate ui --demo.";

test("la Red, servida bajo un subdirectorio: los tres proyectos, la banda, ninguna petición a una API y las acciones de solo lectura", async ({ page, servidor, registro }) => {
  await page.goto(sitio(servidor));
  await expect(page.locator(".banda-demo")).toHaveText("Demo: datos de ejemplo. Todo es de solo lectura.");
  for (const nombre of ["TIENDA", "ASISTENTE", "INVESTIGACION"]) await expect(page.getByRole("heading", { name: nombre })).toBeVisible();
  // Las acciones van en la fila desplegada.
  await page.getByRole("heading", { level: 2, name: "TIENDA" }).getByRole("button").click();
  await expect(page.getByRole("article", { name: "TIENDA" }).getByText(SOLO_LECTURA)).toBeVisible();
  for (const boton of await page.locator(".accion-solo-lectura button").all()) await expect(boton).toBeDisabled();
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
  await expect(page.getByText(SOLO_LECTURA).first()).toBeVisible();
  await page.goto(sitio(servidor, "#/bitacora/TIENDA/cupones-de-descuento"));
  await expect(page.getByRole("list", { name: "Eventos de la tarea" }).getByRole("listitem").first()).toBeVisible();
  await page.goto(sitio(servidor, "#/taller/TIENDA?fase=9"));
  await expect(page.getByText("Esto no está en la demo publicada. Pruébalo en tu equipo con npx mcp-phase-gate ui --demo.")).toBeVisible();
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
