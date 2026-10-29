// El Vigía en Chromium real: el diagnóstico de doctor. Los clientes MCP y las variables, que
// antes estaban aquí, se mudaron a Ajustes (ajustes.spec.ts).

import { expect, ningunEstadoSoloColor, ponerTema, sinDesbordamiento, sinViolacionesGraves, test } from "./ayudas";

test("el diagnóstico agrupado por severidad, cada hallazgo con su código y cómo se arregla", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/vigia`);
  await ponerTema(page, "oscuro");
  const errores = page.getByRole("region", { name: /^Errores/ });
  await expect(errores).toBeVisible();
  await expect(errores.getByRole("listitem").filter({ hasText: "MANIFIESTO-INVALIDO" })).toContainText("Cómo se arregla: Corrige el phase-gate.json");
  const hallazgos = page.locator(".hallazgo");
  expect(await hallazgos.count()).toBeGreaterThan(0);
  for (const arreglo of await page.locator(".arreglo").allTextContents()) {
    expect(arreglo, "cada código tiene su arreglo").not.toContain("Lee el texto del hallazgo");
  }
  await expect(page.getByText(/Vigilancia activa/)).toBeVisible();
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "el Vigía en tema oscuro");
  await ponerTema(page, "claro");
  await sinViolacionesGraves(page, "el Vigía en tema claro");
});

test("los clientes MCP y las variables ya no están en el Vigía: un enlace lleva a Ajustes", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/vigia`);
  await expect(page.getByRole("heading", { name: "Diagnóstico" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Cursor" })).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /vista previa/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Abrir Ajustes" }).click();
  await expect(page).toHaveURL(/#\/ajustes\/clientes$/);
  await expect(page.getByRole("article", { name: "Cursor" })).toBeVisible();
});

test("el Vigía en un teléfono (390×844) no desborda", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/vigia`);
  for (const tema of ["oscuro", "claro"] as const) {
    await ponerTema(page, tema);
    await expect(page.getByRole("heading", { name: "Diagnóstico" })).toBeVisible();
    await sinDesbordamiento(page, `el Vigía en tema ${tema}`);
  }
});
