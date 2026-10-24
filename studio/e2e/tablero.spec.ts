// El Tablero (§7.7.2 del plan) en Chromium real: semáforos, vagones, sellos, el visor y el documento
// malicioso, en los dos modos.

import * as path from "node:path";

import { commit } from "./arbol";
import { expect, ningunEstadoSoloColor, ponerModo, sinDesbordamiento, sinViolacionesGraves, test } from "./ayudas";

const via = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Estaciones de la tarea" });
const vagones = (page: import("@playwright/test").Page) => page.getByRole("list", { name: "Lotes de la Fase 4" });

test("los semáforos: cerrada, en curso, hueco, con pendientes y pendiente", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await ponerModo(page, "cabina");
  const estaciones = via(page).getByRole("listitem");
  await expect(estaciones).toHaveCount(6);
  await expect(estaciones.nth(0)).toContainText("00");
  for (const i of [0, 1, 2, 3]) await expect(estaciones.nth(i)).toContainText("cerrada");
  await expect(estaciones.nth(4)).toContainText("en curso");
  await expect(estaciones.nth(5)).toContainText("pendiente");
  await expect(estaciones.nth(4).locator("svg.senal-ambar")).toHaveCount(1);
  await expect(estaciones.nth(0).locator("svg.senal-verde")).toHaveCount(1);

  await page.goto(`${servidor.origen}/#/tablero/TIENDA/con-hueco`);
  await expect(via(page).getByRole("listitem").nth(2)).toContainText("hueco");
  await expect(via(page).getByRole("listitem").nth(2).locator("svg.senal-rojo path")).toHaveCount(1); // un rombo
  await expect(page.getByRole("note").filter({ hasText: "hueco" })).toBeVisible();

  await page.goto(`${servidor.origen}/#/tablero/INVESTIGACION/costos`);
  await expect(via(page).getByRole("listitem").nth(1)).toContainText("con pendientes");
  await ningunEstadoSoloColor(page);
});

test("los vagones y sus sellos: verificado, sellado, con pendientes, rechazado, anulado, manual, en vía y sin recibo", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
  await ponerModo(page, "cabina");
  const lista = vagones(page).getByRole("listitem");
  await expect(lista).toHaveCount(6);
  await expect(lista.nth(0).locator(".sello-sellado")).toContainText("SELLADO");
  await expect(lista.nth(0).locator(".sello-detalle")).toHaveText([/^[0-9a-f]{8}$/, /^\d{4}-\d{2}-\d{2}$/]);
  await expect(lista.nth(1).locator(".sello-pendientes")).toContainText("VERIFICADO");
  await expect(lista.nth(1).locator(".sello-banda")).toHaveText("CON PENDIENTES");
  await expect(lista.nth(2).locator(".sello-rechazado")).toContainText("RECHAZADO");
  await expect(lista.nth(3).locator(".sello-anulado")).toContainText("ANULADO");
  await expect(lista.nth(4).locator(".sello-manual")).toContainText("MANUAL");
  await expect(lista.nth(5)).toContainText("sin recibo");
  await expect(lista.nth(5).getByRole("button")).toBeDisabled();

  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await expect(vagones(page).getByRole("listitem").nth(0).locator(".sello-verificado .sello-detalle")).toHaveText([/^[0-9a-f]{7}$/, /^\d{4}-\d{2}-\d{2}$/]);
  await expect(vagones(page).getByRole("listitem").nth(1).locator(".sello-en-via")).toContainText("EN VÍA");
  await sinViolacionesGraves(page, "el tablero en modo cabina");
});

test("sobrio: tablas con las mismas estaciones y lotes, y los sellos como texto", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
  await ponerModo(page, "sobrio");
  const lotes = page.getByRole("table", { name: "Lotes de la Fase 4" });
  await expect(lotes.getByRole("row", { name: /L01/ })).toContainText(/sha256 · [0-9a-f]{8}/);
  await expect(lotes.getByRole("row", { name: /L02/ })).toContainText("con pendientes");
  await expect(lotes.getByRole("row", { name: /L03/ })).toContainText("fallido");
  await expect(lotes.getByRole("row", { name: /L04/ })).toContainText("descartado");
  await expect(lotes.getByRole("row", { name: /L05/ })).toContainText("manual");
  await expect(lotes.getByRole("row", { name: /L06/ })).toContainText("—");
  await expect(page.getByRole("table", { name: "Estaciones" }).getByRole("row", { name: /Fase 4/ })).toContainText("en curso");
  await expect(page.locator("img.sello-marco")).toHaveCount(0);
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "el tablero en modo sobrio");
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await expect(page.getByRole("table", { name: "Lotes de la Fase 4" }).getByRole("row", { name: /L01/ })).toContainText(/verificado · [0-9a-f]{7}/);
  await expect(page.getByRole("table", { name: "Lotes de la Fase 4" }).getByRole("row", { name: /L02/ })).toContainText("pendiente");
});

test("el visor: un clic en una estación o en un vagón enseña el Markdown y el frontmatter como ficha", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await ponerModo(page, "cabina");
  await via(page).getByRole("listitem").nth(3).getByRole("button").click();
  const visor = page.getByRole("complementary", { name: "03 - Plan Técnico.md" });
  await expect(visor).toBeVisible();
  await expect(visor.getByRole("heading", { name: "03 - Plan Técnico.md" })).toBeFocused();
  await expect(visor.getByLabel("Frontmatter")).toContainText("lotes");
  await expect(visor.getByRole("table")).toContainText("Validar el cupón");
  await vagones(page).getByRole("listitem").nth(0).getByRole("button").click();
  const recibo = page.getByRole("complementary", { name: /04 - Ejecución\/L01/ });
  await expect(recibo.getByLabel("Frontmatter")).toContainText("ancla");
  await expect(recibo.getByLabel("Frontmatter")).toContainText("commit");
  await sinViolacionesGraves(page, "el tablero con el visor abierto");
  await recibo.getByRole("button", { name: "Cerrar el visor" }).click();
  await expect(page.getByRole("complementary")).toHaveCount(0);
});

test("un documento con HTML malicioso no ejecuta nada, no sale a la red ni rompe la CSP", async ({ page, servidor, registro }) => {
  // Tres avisos que vienen del análisis y no del Studio: al analizar el HTML hostil, DOMPurify usa un
  // documento de DOMParser, que hereda la CSP de la página. Un atributo style o un <base href> en ese
  // documento se bloquean (y se avisan) antes de que DOMPurify los quite, y con el Chromium nuevo lo
  // mismo pasa con los atributos on…=: el navegador avisa del manejador en línea antes de que DOMPurify
  // quite el atributo. Nada de eso llega a ejecutarse ni a quedar en la página (las aserciones de abajo
  // lo comprueban).
  registro.permitidos.push(/^Applying inline style violates the following Content Security Policy directive 'style-src 'self''/);
  registro.permitidos.push(/^Setting the document's base URI to '.*' violates the following Content Security Policy directive: "base-uri 'none'"/);
  registro.permitidos.push(/^Executing inline event handler violates the following Content Security Policy directive 'script-src 'self''/);
  const dialogos: string[] = [];
  page.on("dialog", (d) => {
    dialogos.push(d.message());
    void d.dismiss();
  });
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/malicioso`);
  await via(page).getByRole("listitem").nth(1).getByRole("button").click();
  const visor = page.getByRole("complementary", { name: "01 - Análisis Técnico.md" });
  await expect(visor).toContainText("Texto normal al final");
  await visor.locator(".raton").hover();
  await visor.locator(".raton").click();
  await visor.getByText("a con javascript").click();
  await visor.getByText("enlace javascript").click();
  await visor.getByText("a una sección").click();
  const externo = visor.getByRole("link", { name: "un sitio externo" });
  await expect(externo).toHaveAttribute("target", "_blank");
  await expect(externo).toHaveAttribute("rel", "noopener noreferrer");
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __xss?: string }).__xss)).toBeUndefined();
  expect(dialogos).toEqual([]);
  await expect(page).toHaveURL(/#\/tablero\/TIENDA\/malicioso$/); // ni el meta refresh ni el enlace a #seccion la cambian
  for (const etiqueta of ["script", "iframe", "form", "input", "style", "meta", "object", "embed", "base", "link"]) {
    await expect(visor.locator(etiqueta)).toHaveCount(0);
  }
  await expect(visor.locator("[style], [onerror], [onload], [onclick], [onmouseover], [ontoggle]")).toHaveCount(0);
  // Ningún atributo que empiece por "on" queda en el visor: la lista de arriba es lo que trae el documento
  // hostil, pero un manejador nuevo (onfocus, onanimationstart…) se colaría si no se mira el nombre entero.
  expect(
    await visor.evaluate((el) => {
      const nombres = [el, ...el.querySelectorAll("*")].flatMap((n) => [...n.attributes].map((a) => a.name));
      return nombres.filter((n) => n.toLowerCase().startsWith("on"));
    })
  ).toEqual([]);
  // Ninguna imagen se carga: la externa, la relativa y el svg incrustado quedan como texto.
  await expect(visor.locator("img")).toHaveCount(0);
  expect(await visor.locator(".imagen-externa").count()).toBeGreaterThanOrEqual(3);
  await expect(visor.getByText("un párrafo con estilo en línea")).toBeVisible();
});

test("en vivo: un recibo nuevo aparece por SSE, sin recargar, y su sello cae una vez", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/en-vivo`);
  await ponerModo(page, "cabina");
  const lote = vagones(page).getByRole("listitem").nth(0);
  await expect(lote).toContainText("sin recibo");
  await page.evaluate(() => ((window as unknown as { __sinRecargar: boolean }).__sinRecargar = true));

  const anterior = { ...process.env };
  Object.assign(process.env, servidor.arbol.env);
  try {
    const { registrarLote } = await import("../../build/lotes.js");
    const sha = commit(path.join(servidor.arbol.repos, "api"), "en-vivo.txt", "feat(api): llega en vivo");
    await registrarLote("TIENDA", "en-vivo", { lote: 1, repo: "api", titulo: "Llega en vivo", estado: "verificado", que_se_hizo: "Hecho.", verificacion: "test", commit: sha });
  } finally {
    for (const clave of Object.keys(servidor.arbol.env)) delete process.env[clave];
    Object.assign(process.env, anterior);
  }
  await expect(lote.locator(".sello-verificado")).toContainText("VERIFICADO", { timeout: 15_000 });
  await expect(lote.locator(".sello-nuevo")).toHaveCount(1);
  expect(await lote.locator(".sello-nuevo").evaluate((e) => getComputedStyle(e).animationName)).toBe("estampar");
  expect(await page.evaluate(() => (window as unknown as { __sinRecargar?: boolean }).__sinRecargar)).toBe(true);
  // Con un solo lote, anclarlo cierra la fase: el recibo pasa a ser su documento.
  await expect(via(page).getByRole("listitem").nth(4)).toContainText("cerrada");
});

test("reverificar anclas: un commit que ya no está en la rama sale con el sello agrietado", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/reescrita`);
  await ponerModo(page, "cabina");
  const lote = vagones(page).getByRole("listitem").nth(0);
  await expect(lote.locator(".sello-verificado")).toBeVisible();
  await page.getByRole("button", { name: "Reverificar anclas" }).click();
  await expect(lote.locator(".sello-agrietado")).toContainText("ya no está en la rama", { timeout: 15_000 });
  await expect(page.getByText("Anclas reverificadas contra git y el disco.")).toBeVisible();
  await ponerModo(page, "sobrio");
  await expect(page.getByRole("table", { name: "Lotes de la Fase 4" }).getByRole("row", { name: /L01/ })).toContainText("no vigente");
});

test("con prefers-reduced-motion, el sello no cae", async ({ page, servidor }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await ponerModo(page, "cabina");
  await expect(page.locator(".sello-verificado").first()).toBeVisible();
  await page.evaluate(() => {
    const s = document.querySelector(".sello-verificado")!;
    s.classList.add("sello-nuevo");
  });
  expect(await page.locator(".sello-nuevo").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});

test("en un teléfono (390×844), la vía va en vertical y nada desborda, en los dos modos", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
  await ponerModo(page, "cabina");
  await expect(vagones(page).getByRole("listitem")).toHaveCount(6);
  expect(await via(page).evaluate((e) => getComputedStyle(e).flexDirection)).toBe("column");
  await sinDesbordamiento(page, "el tablero en cabina");
  await vagones(page).getByRole("listitem").nth(0).getByRole("button").click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await sinDesbordamiento(page, "el tablero con el visor");
  await ponerModo(page, "sobrio");
  await expect(page.getByRole("table", { name: "Lotes de la Fase 4" })).toBeVisible();
  await sinDesbordamiento(page, "el tablero en sobrio");
});

test("sin tarea elegida, el tablero ofrece las de cada proyecto", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero`);
  await expect(page.getByRole("heading", { level: 1, name: "Tablero" })).toBeVisible();
  await page.getByRole("region", { name: "TIENDA" }).getByRole("link", { name: "cupones" }).click();
  await expect(page).toHaveURL(/#\/tablero\/TIENDA\/cupones$/);
  await expect(via(page)).toBeVisible();
});
