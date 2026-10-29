// El Taller (§7.7.3 del plan) y las escrituras con huella (§7.6) en Chromium real.

import * as fs from "node:fs";
import * as path from "node:path";

import { expect, ponerTema, sinDesbordamiento, sinViolacionesGraves, test } from "./ayudas";

const api = (page: import("@playwright/test").Page, ruta: string) => page.evaluate((r) => fetch(r).then((x) => x.json()), ruta);

test("la procedencia de cada ranura de la fase, con su ficha de origen y el diff frente a la fábrica", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/taller/TALLER?fase=3`);
  await ponerTema(page, "oscuro");
  const lista = page.getByRole("list", { name: "Ranuras" });
  const datos = await api(page, "./api/prompts/TALLER/3");
  await expect(lista.getByRole("listitem")).toHaveCount(datos.ranuras.length);
  expect(datos.ranuras.some((r: { id: string }) => r.id.startsWith("global/"))).toBe(true);
  await expect(page.getByRole("heading", { name: /Ranuras de la Fase 3/ })).toContainText(`(${datos.ranuras.length}, con las globales)`);
  const delPreset = datos.ranuras.find((r: { capa: string }) => r.capa === "preset: ai-agent-ops");
  expect(delPreset, "alguna ranura sale del preset").toBeTruthy();
  await lista.getByRole("button", { name: new RegExp(delPreset.id) }).click();
  const diff = page.getByLabel(`Diferencias de ${delPreset.id} con la fábrica`);
  await expect(diff.locator(".diff-mas").first()).toBeVisible();
  await expect(diff.locator(".diff-menos").first()).toBeVisible();
  await expect(page.getByRole("list").filter({ hasText: "fábrica" }).first()).toBeVisible();
  await sinViolacionesGraves(page, "el Taller en tema oscuro");
  await ponerTema(page, "claro");
  await sinViolacionesGraves(page, "el Taller en tema claro");
});

test("ver el prompt completo: el mismo texto que get_phase_prompt, y se puede copiar", async ({ page, servidor, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: servidor.origen });
  await page.goto(`${servidor.origen}/#/taller/TALLER?fase=4&tarea=afinar`);
  const datos = await api(page, "./api/prompts/TALLER/4?tarea=afinar");
  await page.getByText("Ver prompt completo").click();
  // Exacto: toHaveText normaliza los espacios, textContent no.
  await expect(page.getByLabel("Prompt completo")).toBeVisible();
  expect(await page.getByLabel("Prompt completo").textContent()).toBe(datos.texto);
  await page.getByRole("button", { name: "Copiar" }).click();
  await expect(page.getByRole("button", { name: "Copiado" })).toBeVisible();
  // El portapapeles de Windows guarda los saltos como CRLF.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(datos.texto);
});

test("editar una ranura: eject a la capa del proyecto con vista previa, y después gana el proyecto", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/taller/TALLER?fase=3`);
  await page.getByRole("list", { name: "Ranuras" }).getByRole("button", { name: /fase-3\/pruebas/ }).click();
  await page.getByRole("button", { name: "Editar fase-3/pruebas en la capa del proyecto: vista previa" }).click();
  const previa = page.getByRole("region", { name: /Vista previa: Editar fase-3\/pruebas en la capa del proyecto/ });
  await expect(previa).toContainText("bloques.md");
  await previa.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toContainText("bloques.md");
  expect(fs.existsSync(path.join(servidor.arbol.docs, "TALLER", ".phase-gate", "prompts", "bloques.md"))).toBe(true);
  await expect(page.getByRole("list", { name: "Ranuras" }).getByRole("listitem").filter({ hasText: "fase-3/pruebas" })).toContainText("proyecto");
});

test("las reglas del proyecto se leen en el Taller y se cambian en Ajustes: el enlace lleva a la página del proyecto", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/taller/TIENDA?fase=3`);
  const reglas = page.getByRole("region", { name: "Reglas de TIENDA" });
  await expect(reglas).toContainText("Preset: multi-repo-feature (del proyecto)");
  await expect(reglas).toContainText(/Lotes: (sí|no) · Commits: /);
  // Solo se leen: ni un control para cambiarlas ni una vista previa.
  await expect(reglas.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Cambiar las reglas/ })).toHaveCount(0);
  await reglas.getByRole("link", { name: "Cambiar en Ajustes" }).click();
  await expect(page).toHaveURL(/#\/ajustes\/proyecto\/TIENDA$/);
  await expect(page.getByRole("heading", { level: 2, name: "Proyecto TIENDA" })).toBeVisible();
});

test("el Taller en un teléfono (390×844) no desborda", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/taller/TALLER?fase=3`);
  await page.getByRole("list", { name: "Ranuras" }).getByRole("button").first().click();
  await page.getByText("Ver prompt completo").click();
  for (const tema of ["oscuro", "claro"] as const) {
    await ponerTema(page, tema);
    await expect(page.getByLabel("Prompt completo")).toBeVisible();
    await sinDesbordamiento(page, `el Taller en tema ${tema}`);
  }
});
