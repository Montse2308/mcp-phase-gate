// El tema en Chromium real: sin elección guardada sigue al del sistema, y lo dice el CSS (la CSP no admite
// un script en línea); el botón lo cambia y se recuerda; y una elección guardada no la pisa el sistema.
// Además, las hojas de tema solo declaran custom properties.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, test } from "./ayudas";

const ESTILOS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "estilos");

// El fondo de la página en cada tema (--fondo de tema-claro.css y de tema-oscuro.css).
const FONDO = { claro: "rgb(255, 255, 255)", oscuro: "rgb(12, 19, 27)" };

const boton = (page: Page) => page.getByRole("button", { name: "Tema oscuro" });
const fondo = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const guardado = (page: Page) => page.evaluate(() => window.localStorage.getItem("pg-tema"));

for (const [sistema, tema] of [["light", "claro"], ["dark", "oscuro"]] as const) {
  test(`sin elección guardada, el tema es el del sistema (${sistema}): lo dice el CSS, y el botón lo refleja`, async ({ page, servidor }) => {
    await page.emulateMedia({ colorScheme: sistema });
    await page.goto(`${servidor.origen}/#/red`);
    await expect(boton(page)).toHaveAttribute("aria-pressed", String(tema === "oscuro"));
    await expect(page.locator("html")).not.toHaveAttribute("data-tema");
    expect(await fondo(page)).toBe(FONDO[tema]);
    expect(await guardado(page)).toBeNull();
  });
}

test("sin elección guardada, un cambio del sistema repinta la página y el botón sin recargar", async ({ page, servidor }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${servidor.origen}/#/red`);
  await expect(boton(page)).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => ((window as unknown as { __sinRecargar: boolean }).__sinRecargar = true));
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(boton(page)).toHaveAttribute("aria-pressed", "true");
  expect(await fondo(page)).toBe(FONDO.oscuro);
  expect(await page.evaluate(() => (window as unknown as { __sinRecargar?: boolean }).__sinRecargar)).toBe(true);
  expect(await guardado(page), "seguir al sistema no guarda nada").toBeNull();
});

test("un clic cambia el tema, lo guarda y sobrevive a recargar; otro clic lo devuelve", async ({ page, servidor }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${servidor.origen}/#/red`);
  await boton(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  await expect(boton(page)).toHaveAttribute("aria-pressed", "true");
  expect(await fondo(page)).toBe(FONDO.oscuro);
  expect(await guardado(page)).toBe("oscuro");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  await expect(boton(page)).toHaveAttribute("aria-pressed", "true");
  expect(await fondo(page)).toBe(FONDO.oscuro);

  await boton(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
  expect(await guardado(page)).toBe("claro");
  await page.reload();
  expect(await fondo(page)).toBe(FONDO.claro);
  await expect(boton(page)).toHaveAttribute("aria-pressed", "false");
});

test("con la elección guardada, un cambio del sistema no la pisa", async ({ page, servidor }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${servidor.origen}/#/red`);
  await boton(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  for (const sistema of ["dark", "light", "dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: sistema });
    expect(await fondo(page), `con el sistema en ${sistema}`).toBe(FONDO.oscuro);
    await expect(boton(page)).toHaveAttribute("aria-pressed", "true");
  }
  // Y al revés: elegir el claro con el sistema en oscuro.
  await page.emulateMedia({ colorScheme: "dark" });
  await boton(page).click();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await fondo(page)).toBe(FONDO.claro);
});

test("con JavaScript apagado, el fondo ya es el del tema del sistema", async ({ browser, servidor }) => {
  for (const [sistema, tema] of [["light", "claro"], ["dark", "oscuro"]] as const) {
    const contexto = await browser.newContext({ javaScriptEnabled: false, colorScheme: sistema, locale: "es-ES" });
    await contexto.addCookies([{ ...servidor.cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict", secure: false }]);
    const pagina = await contexto.newPage();
    await pagina.goto(`${servidor.origen}/`);
    await expect(pagina.locator("html")).not.toHaveAttribute("data-tema");
    await expect(pagina.locator("html")).toHaveCSS("background-color", FONDO[tema]);
    await expect(pagina.locator("html")).toHaveCSS("color-scheme", sistema);
    await contexto.close();
  }
});

test("la elección de un modo que ya no existe, guardada o en el enlace, no se lee", async ({ page, servidor }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => window.localStorage.setItem("pg-modo", "sobrio"));
  await page.goto(`${servidor.origen}/#/red?sobrio=1`);
  await expect(boton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).not.toHaveAttribute("data-tema");
  expect(await fondo(page)).toBe(FONDO.oscuro);
  await page.goto(`${servidor.origen}/#/red?sobrio=0`);
  expect(await fondo(page)).toBe(FONDO.oscuro);
  expect(await guardado(page)).toBeNull();
});

// Las hojas de tema solo declaran custom properties (y color-scheme), bajo estos selectores y nada más.
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const leer = (archivo: string) => sinComentarios(fs.readFileSync(path.join(ESTILOS, archivo), "utf-8"));
// Cada bloque de declaraciones, con el selector que lo precede.
function bloques(css: string): { selector: string; declaraciones: Record<string, string> }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: m[1]!.replace(/^[\s\S]*\{/, "").trim().replace(/\s+/g, " "),
    declaraciones: Object.fromEntries(
      m[2]!
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()])
    ),
  }));
}

test("tema-claro.css y tema-oscuro.css solo declaran custom properties y color-scheme, con los mismos nombres", () => {
  const claro = bloques(leer("tema-claro.css"));
  const oscuro = bloques(leer("tema-oscuro.css"));
  expect(claro.map((b) => b.selector)).toEqual([':root:not([data-tema]), :root[data-tema="claro"]']);
  expect(oscuro.map((b) => b.selector)).toEqual([":root:not([data-tema])", ':root[data-tema="oscuro"]']);
  for (const b of [...claro, ...oscuro]) {
    for (const nombre of Object.keys(b.declaraciones)) expect(nombre, `${b.selector}: ${nombre}`).toMatch(/^(?:--[a-z-]+|color-scheme)$/);
  }
  const nombres = (b: { declaraciones: Record<string, string> }) => Object.keys(b.declaraciones).sort();
  expect(nombres(oscuro[0]!), "las dos paletas oscuras declaran lo mismo").toEqual(nombres(oscuro[1]!));
  expect(oscuro[0]!.declaraciones, "y con los mismos valores").toEqual(oscuro[1]!.declaraciones);
  expect(nombres(oscuro[0]!), "los dos temas declaran las mismas variables").toEqual(nombres(claro[0]!));
  expect(claro[0]!.declaraciones["color-scheme"]).toBe("light");
  expect(oscuro[0]!.declaraciones["color-scheme"]).toBe("dark");
  // La consulta de medios del oscuro envuelve solo la paleta que sigue al sistema.
  expect(leer("tema-oscuro.css")).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-tema\]\)/);
});

test("toda variable que usa un estilo está declarada en alguna hoja", () => {
  const hojas = fs.readdirSync(ESTILOS).filter((n) => n.endsWith(".css")).map((n) => leer(n));
  const declaradas = new Set(hojas.flatMap((css) => [...css.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]!)));
  const usadas = new Set(hojas.flatMap((css) => [...css.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1]!)));
  expect([...usadas].filter((v) => !declaradas.has(v)), "variables usadas y nunca declaradas").toEqual([]);
});
