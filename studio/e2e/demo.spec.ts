// La demo (§7.8 del plan) en Chromium real, contra un `ui --demo` de verdad: el temporal del sistema del
// proceso es una carpeta propia (ahí genera la demo) y sus cuatro PHASE_GATE_* apuntan a una Documentación
// de quien lo lanza, con un proyecto marcador que no puede aparecer y que al terminar sigue intacta. Los E2E
// de las vistas (L05 a L09) siguen sobre el árbol mínimo de arbol.ts: el documento malicioso, los
// manifiestos rotos o las tareas con hueco no caben en una demo que se publica.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { git } from "./arbol";
import type { Arbol } from "./arbol";
import { expect, fasesDeLaTarea, lanzarUi, lotesDeLaFase, ningunEstadoSoloColor, ponerTema, sinDesbordamiento, sinViolacionesGraves, test as base } from "./ayudas";
import type { Servidor } from "./ayudas";
import { huellaDeLosClientesReales } from "./entorno";

const raizDeLaDemo = (temporal: string) => path.join(temporal, process.getuid ? `mcp-phase-gate-demo-${process.getuid()}` : "mcp-phase-gate-demo");

function listado(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { recursive: true, withFileTypes: true }).map((e) => {
    const ruta = path.join(e.parentPath, e.name);
    const info = fs.statSync(ruta);
    return `${ruta}|${e.isDirectory() ? "d" : info.size}|${info.mtimeMs}`;
  });
}

const test = base.extend<{}, { servidor: Servidor }>({
  servidor: [
    async ({}, use) => {
      const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-demo-"));
      const reales = huellaDeLosClientesReales();
      const temporal = path.join(raiz, "tmp");
      const usuario = path.join(raiz, "usuario");
      const [docs, repos, estado, config] = ["docs", "repos", "estado", "config"].map((n) => path.join(usuario, n)) as [string, string, string, string];
      for (const c of [temporal, docs, repos, estado, config]) fs.mkdirSync(c, { recursive: true });
      fs.mkdirSync(path.join(docs, "MARCADOR", "Proyectos", "tarea"), { recursive: true });
      const arbol: Arbol = {
        raiz,
        docs,
        repos,
        estado,
        config,
        env: { PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config, TEMP: temporal, TMP: temporal, TMPDIR: temporal },
      };
      const antes = listado(usuario);
      const { hijo, servidor } = await lanzarUi(arbol, ["--demo", "--idioma", "es"]);
      await use(servidor);
      hijo.kill();
      await new Promise((r) => (hijo.exitCode !== null ? r(null) : hijo.on("exit", r)));
      expect(huellaDeLosClientesReales(), "la configuración real de los clientes no cambió").toEqual(reales);
      expect(listado(usuario), "la Documentación, los repos, el estado y la configuración de quien lo lanza, intactos").toEqual(antes);
      const { borrarDemo } = await import("../../build/studio/demo.js");
      borrarDemo(raizDeLaDemo(temporal));
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: "worker" },
  ],
});

const banda = (page: import("@playwright/test").Page) => page.locator(".banda-demo");

test("la Red de la demo: TIENDA, ASISTENTE e INVESTIGACION, nada de la Documentación de quien la lanza, y la banda fija", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/`);
  await expect(banda(page)).toHaveText(`Demo: datos de ejemplo en ${raizDeLaDemo(servidor.arbol.env.TEMP!)}`);
  await expect(banda(page)).toHaveAttribute("role", "note");
  for (const nombre of ["TIENDA", "ASISTENTE", "INVESTIGACION"]) await expect(page.getByRole("heading", { name: nombre })).toBeVisible();
  await expect(page.getByText("MARCADOR")).toHaveCount(0);
});

test("el tablero de cupones-de-descuento: cuatro lotes, verificado tres veces y descartado, las mismas filas en los dos temas", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones-de-descuento`);
  for (const tema of ["oscuro", "claro"] as const) {
    await ponerTema(page, tema);
    await expect(banda(page)).toBeVisible();
    const lista = lotesDeLaFase(page);
    await expect(lista).toHaveCount(4);
    for (const i of [0, 1, 2]) {
      await expect(lista.nth(i).locator(".estado-verificado")).toHaveText("verificado");
      await expect(lista.nth(i).locator(".estado-detalle").first()).toHaveText(/^[0-9a-f]{7}$/);
    }
    await expect(lista.nth(3).locator(".estado-descartado")).toHaveText("descartado");
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, `el tablero de la demo en tema ${tema}`);
  }
});

test("las otras dos: la tarea de agente sellada por sha256 y la de investigación con pendientes en la Fase 1", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/ASISTENTE/tono-en-reclamos`);
  const sellados = lotesDeLaFase(page);
  await expect(sellados).toHaveCount(2);
  for (const i of [0, 1]) await expect(sellados.nth(i).locator(".estado-sellado")).toHaveText("sellado");
  await page.goto(`${servidor.origen}/#/tablero/INVESTIGACION/costo-de-embeddings`);
  await expect(fasesDeLaTarea(page).nth(1)).toContainText("con pendientes");
});

test("en vivo: el commit pendiente de envio-gratis se hace y se ancla, y el sello llega por SSE sin recargar", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/envio-gratis`);
  const lote = lotesDeLaFase(page).nth(1);
  await expect(lote.locator(".estado-commit-pendiente")).toHaveText("commit pendiente");
  await expect(lotesDeLaFase(page).nth(2)).toContainText("sin recibo");
  await page.evaluate(() => ((window as unknown as { __sinRecargar: boolean }).__sinRecargar = true));

  // Lo que haría el agente: el commit en tienda-web (el cambio ya estaba sin commitear) y record_batch con
  // su SHA, sobre la carpeta de la demo.
  const { carpetasDeDemo, entornoDeDemo } = await import("../../build/studio/demo.js");
  const demo = carpetasDeDemo(raizDeLaDemo(servidor.arbol.env.TEMP!));
  const web = path.join(demo.repos, "tienda-web");
  git(web, "add", "src/carrito.html");
  git(web, "commit", "-q", "-m", "feat(web): avisar de cuánto falta para el envío gratis");
  const sha = git(web, "rev-parse", "HEAD");
  const env = entornoDeDemo(demo);
  const anterior = { ...process.env };
  Object.assign(process.env, env);
  try {
    const { registrarLote } = await import("../../build/lotes.js");
    await registrarLote("TIENDA", "envio-gratis", { lote: 2, repo: "web", commit: sha });
  } finally {
    for (const clave of Object.keys(env)) delete process.env[clave];
    Object.assign(process.env, anterior);
  }
  await expect(lote.locator(".estado-verificado")).toHaveText("verificado", { timeout: 15_000 });
  await expect(lote.locator(".estado-detalle").first()).toHaveText(sha.slice(0, 7));
  await expect(lote).toHaveClass(/estado-nuevo/);
  expect(await page.evaluate(() => (window as unknown as { __sinRecargar?: boolean }).__sinRecargar)).toBe(true);
});

test("en inglés (#?lang=en): la banda y los sellos de la demo, y axe en los dos temas", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones-de-descuento?lang=en`);
  await ponerTema(page, "oscuro");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(banda(page)).toHaveText(`Demo: sample data in ${raizDeLaDemo(servidor.arbol.env.TEMP!)}`);
  const lista = lotesDeLaFase(page, "Batches of Phase 4");
  await expect(lista).toHaveCount(4);
  for (const i of [0, 1, 2]) await expect(lista.nth(i).locator(".estado-verificado")).toHaveText("verified");
  await expect(lista.nth(3).locator(".estado-descartado")).toHaveText("discarded");
  await sinViolacionesGraves(page, "el tablero de la demo en inglés, tema oscuro");
  await ponerTema(page, "claro");
  await expect(lotesDeLaFase(page, "Batches of Phase 4").nth(3)).toContainText("discarded");
  await sinViolacionesGraves(page, "el tablero de la demo en inglés, tema claro");
  await ponerTema(page, "oscuro");
  await page.goto(`${servidor.origen}/#/tablero/ASISTENTE/tono-en-reclamos`);
  const sellados = lotesDeLaFase(page, "Batches of Phase 4");
  for (const i of [0, 1]) await expect(sellados.nth(i).locator(".estado-sellado")).toHaveText("sealed");
});

test("en un teléfono (390×844), con la banda y su ruta larga, nada desborda en los dos temas", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/`);
  await expect(page.getByRole("heading", { name: "TIENDA" })).toBeVisible();
  await sinDesbordamiento(page, "la Red de la demo");
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones-de-descuento`);
  for (const tema of ["oscuro", "claro"] as const) {
    await ponerTema(page, tema);
    await expect(banda(page)).toBeVisible();
    await expect(page.getByText("descartado").first()).toBeVisible();
    await sinDesbordamiento(page, `el tablero de la demo en tema ${tema}`);
  }
});
