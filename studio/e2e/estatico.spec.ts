// El sitio estático (§7.9 del plan) en Chromium real: `ui --export-static` del binario compilado, como en el
// workflow de Pages, servido bajo un subdirectorio (/mcp-phase-gate/) por un servidor de archivos sin nada
// más, como GitHub Pages: sin API, sin SSE y sin CSP. Todo lo que pide la página fuera del subdirectorio es
// un 404, y el fixture no admite ni un error en la consola ni una petición fuera de 127.0.0.1.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

import { BINARIO, expect, ponerModo, sinDesbordamiento, sinViolacionesGraves, test as base } from "./ayudas";
import type { Servidor } from "./ayudas";

const PREFIJO = "/mcp-phase-gate/";
const SOLO_LECTURA = "En la demo publicada todo es de solo lectura. Pruébalo en tu equipo con npx mcp-phase-gate ui --demo.";
const TIPOS: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };

function servirCarpeta(raiz: string): Promise<{ servidor: http.Server; puerto: number }> {
  const servidor = http.createServer((req, res) => {
    const crudo = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (crudo === PREFIJO.slice(0, -1)) {
      res.writeHead(301, { Location: PREFIJO }).end();
      return;
    }
    if (!crudo.startsWith(PREFIJO)) {
      res.writeHead(404).end();
      return;
    }
    const relativa = crudo.slice(PREFIJO.length) || "index.html";
    const ruta = path.resolve(raiz, relativa);
    if (path.relative(raiz, ruta).startsWith("..") || !fs.statSync(ruta, { throwIfNoEntry: false })?.isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] ?? "application/octet-stream" }).end(fs.readFileSync(ruta));
  });
  return new Promise((resolver) => servidor.listen(0, "127.0.0.1", () => resolver({ servidor, puerto: (servidor.address() as { port: number }).port })));
}

const test = base.extend<{}, { servidor: Servidor }>({
  servidor: [
    async ({}, use) => {
      const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-estatico-"));
      const carpetas = ["docs", "repos", "estado", "config"].map((n) => path.join(raiz, n));
      for (const c of carpetas) fs.mkdirSync(c);
      const [docs, repos, estado, config] = carpetas as [string, string, string, string];
      const sitio = path.join(raiz, "sitio");
      const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PHASE_GATE_|ORQUESTADOR_)/i.test(k)));
      const r = spawnSync(process.execPath, [BINARIO, "ui", "--export-static", sitio], { env: { ...env, PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config }, encoding: "utf-8", timeout: 120_000 });
      expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
      const { servidor, puerto } = await servirCarpeta(sitio);
      const origen = `http://127.0.0.1:${puerto}`;
      await use({ origen, puerto, cookie: { name: "sin-sesion", value: "1" }, arbol: { raiz, docs, repos, estado, config, env: {} }, falso: { env: {}, casa: raiz, llamadas: () => [] } });
      await new Promise((r2) => servidor.close(r2));
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: "worker" },
  ],
});

const sitio = (s: Servidor, hash = "") => `${s.origen}${PREFIJO}${hash}`;
const vagones = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Lotes de la Fase 4" });

test("la Red, servida bajo un subdirectorio: los tres proyectos, la banda, ninguna petición a una API y las acciones de solo lectura", async ({ page, servidor, registro }) => {
  await page.goto(sitio(servidor));
  await expect(page.locator(".banda-demo")).toHaveText("Demo: datos de ejemplo. Todo es de solo lectura.");
  for (const nombre of ["TIENDA", "ASISTENTE", "INVESTIGACION"]) await expect(page.getByRole("heading", { name: nombre })).toBeVisible();
  await expect(page.getByText(SOLO_LECTURA).first()).toBeVisible();
  for (const boton of await page.locator(".accion-solo-lectura button").all()) await expect(boton).toBeDisabled();
  expect(registro.peticiones.filter((u) => !u.startsWith(`${servidor.origen}${PREFIJO}`)), "todo bajo el subdirectorio").toEqual([]);
  expect(registro.peticiones.filter((u) => u.includes("/api/")), "ni API ni SSE").toEqual([]);
  expect(registro.peticiones.some((u) => u.endsWith("/datos/indice.json"))).toBe(true);
});

test("el tablero de cupones-de-descuento: cuatro vagones, el visor y Reverificar anclas, en los dos modos y con axe", async ({ page, servidor, registro }) => {
  await page.goto(sitio(servidor, "#/tablero/TIENDA/cupones-de-descuento"));
  await ponerModo(page, "cabina");
  const lista = vagones(page).getByRole("listitem");
  await expect(lista).toHaveCount(4);
  for (const i of [0, 1, 2]) await expect(lista.nth(i).locator(".sello-verificado")).toContainText("VERIFICADO");
  await expect(lista.nth(3).locator(".sello-anulado")).toContainText("ANULADO");
  await lista.nth(0).getByRole("button").click();
  const recibo = page.getByRole("complementary", { name: /04 - Ejecución\/L01/ });
  await expect(recibo.getByLabel("Frontmatter")).toContainText("commit");
  await sinViolacionesGraves(page, "el tablero estático en modo cabina");
  await recibo.getByRole("button", { name: "Cerrar el visor" }).click();
  await page.getByRole("button", { name: "Reverificar anclas" }).click();
  await expect(page.getByText("Anclas reverificadas contra git y el disco.")).toBeVisible();
  await ponerModo(page, "sobrio");
  await expect(page.getByRole("table", { name: "Lotes de la Fase 4" }).getByRole("row", { name: /L04/ })).toContainText("descartado");
  await sinViolacionesGraves(page, "el tablero estático en modo sobrio");
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
  await expect(vagones(page).getByRole("listitem")).toHaveCount(4);
  await sinDesbordamiento(page, "el tablero estático");
});
