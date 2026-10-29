// La portada del sitio en Chromium real: el sitio entero como lo arma el workflow de Pages (la demo en demo/, la
// portada con scripts/portada.mjs y sus tres capturas con scripts/capturas-studio.mjs --portada), servido bajo
// un subdirectorio (/mcp-phase-gate/) por un servidor de archivos sin nada más, como GitHub Pages. Comprueba los
// dos idiomas y su elección recordada, que los botones lleven a la demo y a la guía, axe, que a 390 px nada
// desborde, que no se pida nada fuera del sitio, el peso de la primera carga y que los enlaces de la demo de antes
// lleguen a demo/ con su hash.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

import { BINARIO, PREFIJO, PREFIJO_DE_LA_DEMO, servirCarpeta, sinDesbordamiento, sinViolacionesGraves } from "./ayudas";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(AQUI, "..", "..", "scripts");
const TOPE_DE_LA_PRIMERA_CARGA = 300 * 1000; // 300 kB

const GUIA = {
  en: "https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/installation.md",
  es: "https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/instalacion.md",
};

type Sitio = { origen: string; raiz: string };
type Registro = { peticiones: string[]; errores: string[] };

const test = base.extend<{ registro: Registro }, { sitio: Sitio }>({
  sitio: [
    async ({}, use) => {
      const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-portada-"));
      const carpetas = ["docs", "repos", "estado", "config"].map((n) => path.join(raiz, n));
      for (const c of carpetas) fs.mkdirSync(c);
      const [docs, repos, estado, config] = carpetas as [string, string, string, string];
      const publicado = path.join(raiz, "sitio");
      fs.mkdirSync(publicado);
      const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PHASE_GATE_|ORQUESTADOR_)/i.test(k)));
      const correr = (args: string[], extra: NodeJS.ProcessEnv = {}) => {
        const r = spawnSync(process.execPath, args, { env: { ...env, ...extra }, encoding: "utf-8", timeout: 200_000 });
        expect(r.status, `${args.join(" ")}\n${r.stdout}${r.stderr}`).toBe(0);
      };
      correr([BINARIO, "ui", "--export-static", path.join(publicado, "demo")], { PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config });
      correr([path.join(SCRIPTS, "portada.mjs"), "--salida", publicado]);
      correr([path.join(SCRIPTS, "capturas-studio.mjs"), "--portada", "--salida", path.join(publicado, "medios")]);
      const { servidor, puerto } = await servirCarpeta(publicado);
      await use({ origen: `http://127.0.0.1:${puerto}`, raiz: publicado });
      await new Promise((resolver) => servidor.close(resolver));
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: "worker", timeout: 300_000 },
  ],
  registro: async ({ page }, use) => {
    const registro: Registro = { peticiones: [], errores: [] };
    page.on("request", (peticion) => {
      if (!peticion.url().startsWith("data:")) registro.peticiones.push(peticion.url());
    });
    page.on("console", (mensaje) => {
      if (mensaje.type() === "error") registro.errores.push(mensaje.text());
    });
    page.on("pageerror", (error) => registro.errores.push(error.message));
    await use(registro);
    expect(registro.errores, "sin errores en la consola").toEqual([]);
  },
});

const portada = (s: Sitio, ruta = "") => `${s.origen}${PREFIJO}${ruta}`;
const idiomaGuardado = (page: Page) => page.evaluate(() => window.localStorage.getItem("pg-idioma"));

test.describe("con el navegador en inglés", () => {
  test.use({ locale: "en-US" });

  test("la portada en inglés: la frase, los dos botones, las cinco fases, las tres capturas, el comando y el pie con la versión", async ({ page, sitio, registro }) => {
    await page.goto(portada(sitio));
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("An MCP server that turns any AI coding agent into a gated, auditable, batch-by-batch engineering workflow.");
    await expect(page.getByRole("link", { name: "Open the live demo" })).toHaveAttribute("href", "demo/");
    await expect(page.getByRole("link", { name: "Install" })).toHaveAttribute("href", GUIA.en);
    await expect(page.locator("ol.fases > li")).toHaveCount(5);
    for (const fase of ["Discovery", "Decisions", "Technical plan", "Execution", "Audit"]) await expect(page.getByRole("heading", { level: 3, name: fase })).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(3);
    await expect(page.locator("pre.comando")).toHaveText("npx mcp-phase-gate ui --demo");
    const { version } = JSON.parse(fs.readFileSync(path.join(AQUI, "..", "..", "package.json"), "utf-8")) as { version: string };
    await expect(page.locator("footer")).toContainText(`Version ${version}`);
    await expect(page.locator("footer").getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/Montse2308/mcp-phase-gate");
    await expect(page.locator("footer").getByRole("link", { name: "npm" })).toHaveAttribute("href", "https://www.npmjs.com/package/mcp-phase-gate");
    await expect(page.locator("footer").getByRole("link", { name: "MIT license" })).toBeVisible();
    // Las tres capturas cargaron de verdad.
    for (const img of await page.getByRole("img").all()) expect(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
    await sinViolacionesGraves(page, "la portada en inglés");
    expect(registro.peticiones.filter((u) => !u.startsWith(`${sitio.origen}${PREFIJO}`)), "todo bajo el subdirectorio del sitio").toEqual([]);
  });

  test("el selector EN / ES lleva a la otra portada y recuerda la elección, la misma que usa el Studio", async ({ page, sitio }) => {
    await page.goto(portada(sitio));
    await expect(page.getByRole("link", { name: "EN", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("link", { name: "ES", exact: true })).not.toHaveAttribute("aria-current", "true");
    await page.getByRole("link", { name: "ES", exact: true }).click();
    await expect(page).toHaveURL(portada(sitio, "es/"));
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    expect(await idiomaGuardado(page)).toBe("es");
    // Con español elegido, la portada en inglés lleva sola a es/, aunque el navegador esté en inglés.
    await page.goto(portada(sitio));
    await expect(page).toHaveURL(portada(sitio, "es/"));
    // Y volver a inglés se recuerda también.
    await page.getByRole("link", { name: "EN", exact: true }).click();
    await expect(page).toHaveURL(portada(sitio));
    expect(await idiomaGuardado(page)).toBe("en");
    await page.goto(portada(sitio));
    await expect(page).toHaveURL(portada(sitio));
    // Lo que se elige en el Studio también lo recuerda la portada.
    await page.goto(`${sitio.origen}${PREFIJO_DE_LA_DEMO}#/red?lang=es`);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.goto(portada(sitio));
    await expect(page).toHaveURL(portada(sitio, "es/"));
  });

  test("un ?lang= en la URL manda sobre lo guardado y se recuerda", async ({ page, sitio }) => {
    await page.goto(portada(sitio, "?lang=es"));
    await expect(page).toHaveURL(portada(sitio, "es/"));
    expect(await idiomaGuardado(page)).toBe("es");
    await page.goto(portada(sitio, "es/?lang=en"));
    await expect(page).toHaveURL(portada(sitio));
    expect(await idiomaGuardado(page)).toBe("en");
  });

  test("los botones llevan a la demo y a la guía de instalación", async ({ page, sitio }) => {
    await page.goto(portada(sitio));
    await page.getByRole("link", { name: "Open the live demo" }).click();
    await expect(page).toHaveURL(portada(sitio, "demo/"));
    await expect(page.getByRole("heading", { name: "SHOP" })).toBeVisible();
    // La guía vive en GitHub: se comprueba el destino, sin salir del sitio.
    await page.goto(portada(sitio));
    await expect(page.getByRole("link", { name: "Install" })).toHaveAttribute("href", GUIA.en);
  });

  test("a 390 px nada desborda, y el selector y los botones se ven", async ({ page, sitio }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(portada(sitio));
    await sinDesbordamiento(page, "la portada en inglés");
    await expect(page.getByRole("link", { name: "Open the live demo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ES", exact: true })).toBeVisible();
    await page.goto(portada(sitio, "es/"));
    await sinDesbordamiento(page, "la portada en español");
  });

  test("la primera carga, con las capturas, no pasa de 300 kB", async ({ page, sitio }) => {
    const cuerpos: Record<string, number> = {};
    page.on("response", (respuesta) => {
      void respuesta.body().then((cuerpo) => {
        cuerpos[respuesta.url()] = cuerpo.length;
      });
    });
    for (const ruta of ["", "es/"]) {
      for (const k of Object.keys(cuerpos)) delete cuerpos[k];
      await page.goto(portada(sitio, ruta), { waitUntil: "networkidle" });
      // Hasta abajo, para que cargue también lo que está fuera de la primera pantalla.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState("networkidle");
      const total = Object.values(cuerpos).reduce((a, b) => a + b, 0);
      const detalle = Object.entries(cuerpos).map(([u, n]) => `${u.replace(sitio.origen, "")}: ${n}`).join("\n");
      console.log(`[peso] la portada ${ruta || "en inglés"}: ${total} bytes en ${Object.keys(cuerpos).length} archivos\n${detalle}`);
      expect(total, `la portada ${ruta || "en inglés"} pesa ${total} bytes:\n${detalle}`).toBeLessThanOrEqual(TOPE_DE_LA_PRIMERA_CARGA);
    }
  });

  test("las anclas de la portada no la redirigen", async ({ page, sitio }) => {
    for (const ancla of ["fases", "capturas", "probar"]) {
      await page.goto(portada(sitio, `#${ancla}`));
      await expect(page).toHaveURL(portada(sitio, `#${ancla}`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("los links de la demo de antes llegan a demo/ con su hash", async ({ page, sitio }) => {
    const viejos = ["#/tablero/TIENDA/cupones-de-descuento", "#red", "#?lang=en", "#?sobrio=1"];
    for (const hash of viejos) {
      await page.goto(portada(sitio, hash));
      await expect(page).toHaveURL(portada(sitio, `demo/${hash}`));
      await expect(page.locator("#app")).not.toBeEmpty();
    }
    // La misma redirección desde la portada en español.
    await page.goto(portada(sitio, "es/#/red"));
    await expect(page).toHaveURL(portada(sitio, "demo/#/red"));
    // Y la vista que dice el hash es la que se abre (el navegador va en inglés, y la demo con él).
    await page.goto(portada(sitio, "#/taller/SHOP"));
    await expect(page.getByRole("navigation", { name: "Views" }).getByRole("link", { name: "Workshop" })).toHaveAttribute("aria-current", "page");
  });
});

test.describe("con el navegador en español", () => {
  test.use({ locale: "es-ES" });

  test("la portada en español: sin elección guardada, la de inglés lleva a es/, y todo sale en español", async ({ page, sitio, registro }) => {
    await page.goto(portada(sitio));
    await expect(page).toHaveURL(portada(sitio, "es/"));
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Un servidor MCP que convierte a cualquier agente de IA que programa en un flujo de ingeniería con compuertas, auditable y lote por lote.");
    await expect(page.getByRole("link", { name: "Abrir la demo en vivo" })).toHaveAttribute("href", "../demo/");
    await expect(page.getByRole("link", { name: "Instalar" })).toHaveAttribute("href", GUIA.es);
    for (const fase of ["Descubrimiento", "Decisiones", "Plan técnico", "Ejecución", "Auditoría"]) await expect(page.getByRole("heading", { level: 3, name: fase })).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(3);
    for (const img of await page.getByRole("img").all()) expect(await img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
    await expect(page.locator("footer")).toContainText("Versión");
    await sinViolacionesGraves(page, "la portada en español");
    expect(registro.peticiones.filter((u) => !u.startsWith(`${sitio.origen}${PREFIJO}`)), "todo bajo el subdirectorio del sitio").toEqual([]);
  });

  test("elegir inglés gana al idioma del navegador, y el botón de la demo abre la demo en el idioma elegido", async ({ page, sitio }) => {
    await page.goto(portada(sitio, "es/"));
    await page.getByRole("link", { name: "EN", exact: true }).click();
    await expect(page).toHaveURL(portada(sitio));
    await page.goto(portada(sitio));
    await expect(page).toHaveURL(portada(sitio));
    await page.getByRole("link", { name: "Open the live demo" }).click();
    await expect(page).toHaveURL(portada(sitio, "demo/"));
    await expect(page.getByRole("heading", { name: "SHOP" })).toBeVisible();
  });
});
