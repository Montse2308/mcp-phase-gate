// La Bitácora (§7.7.5 del plan) en Chromium real.

import { expect, ningunEstadoSoloColor, ponerTema, sinDesbordamiento, sinViolacionesGraves, test } from "./ayudas";

const eventos = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Eventos de la tarea" }).getByRole("listitem");

test("la línea de tiempo: documentos, recibo, commit con su asunto, reanclaje y cierre, de lo más reciente a lo más antiguo", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/bitacora/TIENDA/cerrada`);
  await ponerTema(page, "oscuro");
  await expect(page.getByRole("heading", { level: 1, name: "Bitácora de cerrada" })).toBeVisible();
  for (const tipo of ["Documento", "Recibo", "Commit", "Reanclaje", "Fase cerrada"]) {
    await expect(eventos(page).filter({ hasText: tipo }).first(), tipo).toBeVisible();
  }
  const commit = eventos(page).filter({ has: page.locator(".evento-commit") }).first();
  await expect(commit.locator(".evento-commit")).toContainText("feat(api): cerrar la fase, rehecho");
  await expect(commit.locator(".evento-commit code")).toHaveText(/^[0-9a-f]{7}$/);
  const fechas = await page.locator(".linea-de-tiempo time").evaluateAll((ts) => ts.map((t) => t.getAttribute("datetime")!));
  const momentos = fechas.map((f) => Date.parse(f.length === 10 ? `${f}T00:00:00` : f));
  expect(momentos).toEqual([...momentos].sort((a, b) => b - a));
  await ningunEstadoSoloColor(page, ".tipo-evento"); // la leyenda de la Bitácora conserva su marca, sin indicador
  await sinViolacionesGraves(page, "la Bitácora en tema oscuro");
  await ponerTema(page, "claro");
  await sinViolacionesGraves(page, "la Bitácora en tema claro");
});

test("los filtros por tipo, y cada evento abre su documento o su recibo", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/bitacora/TIENDA/cupones`);
  await expect(eventos(page).first()).toBeVisible();
  const total = await eventos(page).count();
  await page.getByLabel("Documentos").uncheck();
  await expect(page.locator(".evento-documento")).toHaveCount(0);
  expect(await eventos(page).count()).toBeLessThan(total);
  await page.getByLabel("Recibos").uncheck();
  await page.getByLabel("Commits").uncheck();
  await expect(page.getByText("No hay eventos con esos filtros.")).toBeVisible();
  await page.getByLabel("Recibos").check();
  await eventos(page).filter({ hasText: "L01" }).first().getByRole("button", { name: /Ver 04 - Ejecución\/L01/ }).click();
  await expect(page.getByRole("complementary", { name: /04 - Ejecución\/L01/ }).getByLabel("Frontmatter")).toContainText("ancla");
});

test("sin tarea elegida ofrece las de cada proyecto, y en un teléfono no desborda", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/bitacora`);
  await page.getByRole("region", { name: "TIENDA" }).getByRole("link", { name: "cerrada" }).click();
  await expect(page).toHaveURL(/#\/bitacora\/TIENDA\/cerrada$/);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tema of ["oscuro", "claro"] as const) {
    await ponerTema(page, tema);
    await expect(eventos(page).first()).toBeVisible();
    await sinDesbordamiento(page, `la Bitácora en tema ${tema}`);
  }
});
