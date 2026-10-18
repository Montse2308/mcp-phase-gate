// La Red (§7.7.1 del plan) en Chromium real, en los dos modos.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, ningunEstadoSoloColor, ponerModo, sinDesbordamiento, sinViolacionesGraves, test } from "./ayudas";

test("cabina: estaciones con preset, manifiesto, vías, tren y farol", async ({ page, servidor, registro }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await ponerModo(page, "cabina");
  await expect(page.getByRole("heading", { level: 1, name: "Red de proyectos" })).toBeVisible();
  const tienda = page.getByRole("article", { name: "TIENDA" });
  await expect(tienda.locator(".placa")).toHaveText("multi-repo-feature · del proyecto");
  await expect(tienda).toContainText("phase-gate.json válido");
  await expect(tienda.getByRole("listitem").filter({ hasText: "api" })).toContainText("rama main · árbol limpio");
  await expect(tienda.getByRole("listitem").filter({ hasText: "web" })).toContainText("sin git");
  await expect(tienda).toContainText("cupones");
  await expect(tienda).toContainText("lote 2 de 2, commit pendiente");
  await expect(tienda).toContainText("Abierto en cliente-e2e 1.0");
  await expect(page.getByRole("article", { name: "INVESTIGACION" })).toContainText("sin phase-gate.json");
  await expect(page.getByRole("article", { name: "INVESTIGACION" })).toContainText("Ninguna sesión MCP lo tiene abierto");
  await expect(page.getByRole("article", { name: "ROTO" })).toContainText("phase-gate.json inválido");
  await expect(page.getByRole("article", { name: "ROTO" })).toContainText("no es un JSON válido");
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "la Red en modo cabina");
  test.info().annotations.push({ type: "peticiones", description: `${registro.peticiones.length}: ${registro.peticiones.map((u) => new URL(u).pathname).join(" ")}` });
});

test("sobrio: una tabla con las mismas columnas, que se recuerda al recargar", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await ponerModo(page, "sobrio");
  const tabla = page.getByRole("table", { name: "Proyectos de la Documentación" });
  await expect(tabla).toBeVisible();
  const fila = tabla.getByRole("row", { name: /TIENDA/ });
  await expect(fila).toContainText("multi-repo-feature · del proyecto");
  await expect(fila).toContainText("phase-gate.json válido");
  await expect(fila).toContainText("api: rama main · árbol limpio");
  await expect(fila).toContainText("cliente-e2e 1.0");
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "la Red en modo sobrio");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-modo", "sobrio");
  await expect(tabla).toBeVisible();
});

test("#?sobrio=1 comparte el modo por la URL, y sobrio=0 lo devuelve a cabina", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red?sobrio=1`);
  await expect(page.locator("html")).toHaveAttribute("data-modo", "sobrio");
  await page.goto(`${servidor.origen}/#/red?sobrio=0`);
  await expect(page.locator("html")).toHaveAttribute("data-modo", "cabina");
});

test("en un teléfono (390×844) no hay desbordamiento horizontal, en ningún modo", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/red`);
  for (const modo of ["cabina", "sobrio"] as const) {
    await ponerModo(page, modo);
    // Se mide con los datos ya pintados, no solo con el título.
    await expect(modo === "cabina" ? page.getByRole("article", { name: "TIENDA" }) : page.getByRole("row", { name: /TIENDA/ })).toBeVisible();
    await sinDesbordamiento(page, `la Red en ${modo}`);
  }
  await page.setViewportSize({ width: 360, height: 740 });
  await sinDesbordamiento(page, "la Red a 360 px");
});

test("con el teclado: saltar al contenido, recorrer las vistas y abrir el tablero", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await ponerModo(page, "cabina");
  await expect(page.getByRole("article", { name: "TIENDA" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Red", exact: true })).toBeFocused();
  const abrir = page.getByRole("article", { name: "TIENDA" }).getByRole("link", { name: "Abrir tablero" });
  await abrir.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/tablero\/TIENDA\/cupones$/);
});

test("con prefers-reduced-motion, el farol no se anima", async ({ page, servidor }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${servidor.origen}/#/red`);
  await ponerModo(page, "cabina");
  const halo = page.getByRole("article", { name: "TIENDA" }).locator(".farol-dibujo .halo");
  await expect(halo).toHaveCount(1);
  expect(await halo.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await halo.evaluate((e) => getComputedStyle(e).animationName)).toBe("brillo");
});

test("en vivo: una sesión que se abre enciende el farol sin recargar", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await ponerModo(page, "cabina");
  const investigacion = page.getByRole("article", { name: "INVESTIGACION" });
  await expect(investigacion).toContainText("Ninguna sesión MCP lo tiene abierto");
  // La sesión necesita un pid vivo: un proceso que espera mientras dura la prueba.
  const vivo = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  const archivo = path.join(servidor.arbol.estado, "sesiones", `${vivo.pid}.json`);
  try {
    const ahora = new Date().toISOString();
    fs.writeFileSync(archivo, JSON.stringify({ pid: vivo.pid, cliente: "otro-cliente 2.0", raices: [], proyecto: "INVESTIGACION", desde: ahora, actualizado: ahora }), "utf-8");
    await expect(investigacion).toContainText("Abierto en otro-cliente 2.0", { timeout: 15_000 });
  } finally {
    vivo.kill();
    fs.rmSync(archivo, { force: true });
  }
});
