// El Vigía (§7.7.4 del plan) en Chromium real. El `ui` corre con un HOME falso y un `claude` de mentira
// (entorno.ts): lo que se aplica aquí cae en carpetas temporales, nunca en la configuración real.

import * as fs from "node:fs";
import * as path from "node:path";

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
  await expect(page.getByRole("table", { name: "Variables de entorno" }).getByRole("row", { name: /DOCS_PATH/ })).toContainText("PHASE_GATE_DOCS_PATH");
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "el Vigía en tema oscuro");
  await ponerTema(page, "claro");
  await sinViolacionesGraves(page, "el Vigía en tema claro");
});

test("el asistente de clientes: una tarjeta por cliente con el comando o el diff de su mcp.json", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/vigia`);
  const claude = page.getByRole("article", { name: "Claude Code" });
  await expect(claude).toContainText("detectado en este equipo");
  await expect(claude.locator("code").filter({ hasText: "claude mcp add pg --scope user" })).toBeVisible();
  const cursor = page.getByRole("article", { name: "Cursor" });
  await expect(cursor).toContainText("no detectado");
  await expect(cursor).toContainText("~/.cursor/mcp.json");
  await expect(cursor.getByLabel("Lo que cambiaría en Cursor").locator(".diff-mas").first()).toBeVisible();
  await expect(page.getByRole("article", { name: "VS Code" }).getByLabel(/Copiar también los comandos/)).toHaveCount(0);
  // Solo lee: claude --version y claude mcp list.
  expect(servidor.falso.llamadas().every((l) => l === "--version" || l === "mcp list")).toBe(true);
});

test("Aplicar en Cursor, con los comandos de fase, escribe en el HOME falso con su vista previa", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/vigia`);
  const cursor = page.getByRole("article", { name: "Cursor" });
  await cursor.getByLabel(/Copiar también los comandos/).check();
  await cursor.getByRole("button", { name: "Configurar Cursor: vista previa" }).click();
  const previa = cursor.getByRole("region", { name: "Vista previa: Configurar Cursor" });
  await expect(previa).toContainText("~/.cursor/mcp.json");
  await expect(previa).toContainText("~/.cursor/commands/f1.md");
  await previa.getByRole("button", { name: "Aplicar" }).click();
  await expect(cursor.getByRole("status").filter({ hasText: "Hecho" })).toContainText("Cursor: registrado como «pg».");
  const mcp = JSON.parse(fs.readFileSync(path.join(servidor.falso.casa, ".cursor", "mcp.json"), "utf-8"));
  // El mcp.json ya no lleva las rutas: viajaron a machine.json, que se escribe antes.
  expect(mcp.mcpServers.pg.env?.PHASE_GATE_DOCS_PATH).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(path.join(servidor.arbol.config, "machine.json"), "utf-8")).rutas.documentacion).toBe(servidor.arbol.docs);
  expect(fs.existsSync(path.join(servidor.falso.casa, ".cursor", "commands", "f4.md"))).toBe(true);
  await expect(cursor).toContainText("Sin cambios", { timeout: 15_000 });
});

test("Aplicar en Claude Code ejecuta el claude de mentira, no el de verdad", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/vigia`);
  const claude = page.getByRole("article", { name: "Claude Code" });
  await claude.getByRole("button", { name: "Configurar Claude Code: vista previa" }).click();
  const previa = claude.getByRole("region", { name: "Vista previa: Configurar Claude Code" });
  await expect(previa.locator(".diff-comando")).toContainText("$ claude mcp add pg --scope user");
  await previa.getByRole("button", { name: "Aplicar" }).click();
  await expect(claude.getByRole("status").filter({ hasText: "Hecho" })).toContainText("Registrado en Claude Code");
  expect(servidor.falso.llamadas().some((l) => l.startsWith("mcp add pg --scope user"))).toBe(true);
});

test("el Vigía en un teléfono (390×844) no desborda", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/vigia`);
  for (const tema of ["oscuro", "claro"] as const) {
    await ponerTema(page, tema);
    await expect(page.getByRole("article", { name: "Cursor" })).toBeVisible();
    await sinDesbordamiento(page, `el Vigía en tema ${tema}`);
  }
});
