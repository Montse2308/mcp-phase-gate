// El Tablero en Chromium real: las fases en tarjetas, los lotes en una tabla con su estado, el visor, el
// sello que llega en vivo y el documento malicioso. La misma estructura en los dos temas.

import * as path from "node:path";

import type { Locator } from "@playwright/test";

import { commit } from "./arbol";
import { expect, fasesDeLaTarea, lotesDeLaFase, ningunEstadoSoloColor, ponerTema, sinDesbordamiento, sinViolacionesGraves, test } from "./ayudas";
import type { Servidor } from "./ayudas";

test("las fases en tarjetas: cerrada, en curso, hueco, con pendientes y pendiente, cada una con su forma y su texto", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  const fases = fasesDeLaTarea(page);
  await expect(fases).toHaveCount(6);
  await expect(fases.nth(0)).toContainText("00");
  await expect(fases.nth(1)).toContainText("Fase 1");
  for (const i of [0, 1, 2, 3]) await expect(fases.nth(i)).toContainText("cerrada");
  await expect(fases.nth(4)).toContainText("en curso");
  await expect(fases.nth(5)).toContainText("pendiente");
  await expect(fases.nth(0).locator(".indicador")).toHaveClass(/fase-cerrada/);
  await expect(fases.nth(4).locator(".indicador")).toHaveClass(/fase-en-curso/);
  await expect(fases.nth(5).locator(".indicador")).toHaveClass(/fase-pendiente/);
  await expect(fases.nth(0).locator("svg.marca-lleno")).toHaveCount(1);
  await expect(fases.nth(4).locator("svg.marca-anillo")).toHaveCount(1);
  await expect(fases.nth(5).locator("svg.marca-vacio")).toHaveCount(1);
  expect(await fases.nth(4).locator("svg").count()).toBe(1); // ya no hay semáforo: solo la marca

  await page.goto(`${servidor.origen}/#/tablero/TIENDA/con-hueco`);
  await expect(fasesDeLaTarea(page).nth(2)).toContainText("hueco");
  await expect(fasesDeLaTarea(page).nth(2).locator(".indicador")).toHaveClass(/fase-hueco/);
  await expect(fasesDeLaTarea(page).nth(2).locator("svg.marca-rombo")).toHaveCount(1);
  await expect(fasesDeLaTarea(page).nth(2).getByRole("button")).toBeDisabled(); // sin documento no hay visor
  await expect(fasesDeLaTarea(page).nth(2).locator(".fase-archivo"), "el archivo que falta se ve en la tarjeta").toBeVisible();
  await expect(fasesDeLaTarea(page).nth(1).locator(".fase-archivo")).toHaveCount(0);
  await expect(page.getByRole("note").filter({ hasText: "hueco" })).toBeVisible();

  await page.goto(`${servidor.origen}/#/tablero/INVESTIGACION/costos`);
  await expect(fasesDeLaTarea(page).nth(1)).toContainText("con pendientes");
  await expect(fasesDeLaTarea(page).nth(1).locator(".indicador")).toHaveClass(/fase-con-pendientes/);
  await expect(fasesDeLaTarea(page).nth(1).locator("svg.marca-triangulo")).toHaveCount(1);
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "las fases del tablero");
});

test("cada tarjeta de fase dice su archivo en su nombre accesible, y su botón abre el documento", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  const tercera = fasesDeLaTarea(page).nth(3).getByRole("button");
  await expect(tercera).toHaveAccessibleName(/Fase 3.*cerrada.*03 - Plan Técnico\.md/);
  await expect(tercera).toHaveAttribute("aria-pressed", "false");
  await tercera.click();
  await expect(tercera).toHaveAttribute("aria-pressed", "true");
  await expect(fasesDeLaTarea(page).nth(1).getByRole("button")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("complementary", { name: "03 - Plan Técnico.md" })).toBeVisible();
});

// Ocho tipos de lote, cada uno con su clase estable, su palabra, su detalle y su recibo. Los otros dos, la
// nota y el no vigente, tienen su propio test.
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CASOS: { tipo: string; tarea: string; fila: number; palabra: string; detalle: (string | RegExp)[]; ancla: RegExp; recibo: boolean }[] = [
  { tipo: "verificado", tarea: "cupones", fila: 0, palabra: "verificado", detalle: [/^[0-9a-f]{7}$/, FECHA], ancla: /^commit [0-9a-f]{7} en `api`/, recibo: true },
  { tipo: "sellado", tarea: "variedad", fila: 0, palabra: "sellado", detalle: [/^[0-9a-f]{8}$/, FECHA], ancla: /^sha256 `[0-9a-f]{12}…` de `repo:web\/dist\/web\.txt`/, recibo: true },
  { tipo: "con-pendientes", tarea: "variedad", fila: 1, palabra: "con pendientes", detalle: [/^[0-9a-f]{7}$/, FECHA], ancla: /^commit [0-9a-f]{7} en `api`/, recibo: true },
  { tipo: "rechazado", tarea: "variedad", fila: 2, palabra: "rechazado", detalle: [FECHA], ancla: /./, recibo: true },
  { tipo: "descartado", tarea: "variedad", fila: 3, palabra: "descartado", detalle: [FECHA], ancla: /./, recibo: true },
  { tipo: "manual", tarea: "variedad", fila: 4, palabra: "manual", detalle: [/^[0-9a-f]{7}$/, FECHA], ancla: /^commit [0-9a-f]{7} en `api`/, recibo: true },
  { tipo: "commit-pendiente", tarea: "cupones", fila: 1, palabra: "commit pendiente", detalle: [], ancla: /^commit pendiente$/, recibo: true },
  { tipo: "sin-recibo", tarea: "variedad", fila: 5, palabra: "sin recibo", detalle: [], ancla: /^—$/, recibo: false },
];

for (const caso of CASOS) {
  test(`el lote ${caso.tipo}: su fila lleva su estado, su detalle, su ancla y su recibo`, async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/#/tablero/TIENDA/${caso.tarea}`);
    const fila = lotesDeLaFase(page).nth(caso.fila);
    await expect(fila.locator(`.estado-${caso.tipo}`)).toHaveText(caso.palabra);
    if (caso.detalle.length) await expect(fila.locator(".estado-detalle")).toHaveText(caso.detalle);
    else await expect(fila.locator(".estado-detalle")).toHaveCount(0);
    await expect(fila.getByRole("cell").nth(4)).toHaveText(caso.ancla);
    const boton = fila.getByRole("button");
    if (caso.recibo) {
      await expect(boton).toBeEnabled();
      await expect(boton).toHaveText(/^04 - Ejecución\/L0\d/);
    } else {
      await expect(boton).toBeDisabled();
    }
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, `el lote ${caso.tipo}`);
  });
}

test("el lote con nota: su ancla es una nota y el texto va en el detalle", async ({ page, servidor }) => {
  // Ningún lote del árbol de prueba trae un ancla nota (se registra con una política sin commits): la
  // respuesta de los lotes se cambia para tenerlo.
  await page.route("**/api/tareas/TIENDA/cupones/lotes*", async (ruta) => {
    const respuesta = await ruta.fetch();
    const cuerpo = await respuesta.json();
    const lote = cuerpo.estado.lotes[0];
    Object.assign(lote, { ancla: { tipo: "nota", resumen: "nota: sin commits en esta política" }, sello: { corto: null, sha256: null, fecha: "2026-05-04" }, origen: "servidor", vigente: null });
    await ruta.fulfill({ response: respuesta, json: cuerpo });
  });
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  const fila = lotesDeLaFase(page).nth(0);
  await expect(fila.locator(".estado-nota")).toHaveText("nota");
  await expect(fila.locator(".estado-detalle")).toHaveText(["sin commits en esta política"]);
  await expect(fila.locator(".estado-detalle")).toHaveClass(/estado-detalle-texto/); // la nota, en texto normal
  await expect(fila.getByRole("cell").nth(4)).toHaveText("nota: sin commits en esta política");
  await expect(fila.getByRole("button")).toBeEnabled();
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "el lote con nota");
});

test("la tabla de lotes dice el lote, su objetivo y su repo, y el Tablero es el mismo en el tema oscuro y en el claro", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
  const tabla = page.getByRole("table", { name: "Lotes de la Fase 4" });
  await expect(tabla.getByRole("columnheader")).toHaveText(["Lote", "Objetivo", "Repo", "Estado", "Detalle", "Ancla", "Recibo"]);
  await expect(lotesDeLaFase(page)).toHaveCount(6);
  await expect(lotesDeLaFase(page).nth(0).getByRole("rowheader")).toHaveText("L01");
  await expect(lotesDeLaFase(page).nth(0).getByRole("cell").nth(0)).toHaveText("Empaquetar la web");
  await expect(lotesDeLaFase(page).nth(0).getByRole("cell").nth(1)).toHaveText("web");
  await expect(lotesDeLaFase(page).nth(2).getByRole("cell").nth(1)).toHaveText("api");

  await ponerTema(page, "oscuro");
  const oscuro = await page.locator("main").innerHTML();
  const fondoOscuro = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  await ponerTema(page, "claro");
  expect(await page.locator("main").innerHTML(), "el DOM del Tablero no cambia con el tema").toBe(oscuro);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), "los colores sí cambian").not.toBe(fondoOscuro);
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "el tablero en tema claro");
  await ponerTema(page, "oscuro");
  await sinViolacionesGraves(page, "el tablero en tema oscuro");
});

test("el visor: un clic en una tarjeta de fase o en el recibo de un lote enseña el Markdown y el frontmatter como ficha", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await fasesDeLaTarea(page).nth(3).getByRole("button").click();
  const visor = page.getByRole("complementary", { name: "03 - Plan Técnico.md" });
  await expect(visor).toBeVisible();
  await expect(visor.getByRole("heading", { name: "03 - Plan Técnico.md" })).toBeFocused();
  await expect(visor.getByLabel("Frontmatter")).toContainText("lotes");
  await expect(visor.getByRole("table")).toContainText("Validar el cupón");
  const boton = lotesDeLaFase(page).nth(0).getByRole("button");
  await expect(boton).toHaveAttribute("aria-pressed", "false");
  await boton.click();
  await expect(boton).toHaveAttribute("aria-pressed", "true");
  const recibo = page.getByRole("complementary", { name: /04 - Ejecución\/L01/ });
  await expect(recibo.getByLabel("Frontmatter")).toContainText("ancla");
  await expect(recibo.getByLabel("Frontmatter")).toContainText("commit");
  await sinViolacionesGraves(page, "el tablero con el visor abierto");
  await recibo.getByRole("button", { name: "Cerrar el visor" }).click();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(boton).toHaveAttribute("aria-pressed", "false");
  await expect(boton, "al cerrar, el foco vuelve al botón que abrió el visor").toBeFocused();

  // Con el teclado: Enter en la tarjeta abre, Escape cierra y el foco vuelve a la tarjeta.
  const tarjeta = fasesDeLaTarea(page).nth(3).getByRole("button");
  await tarjeta.focus();
  await page.keyboard.press("Enter");
  await expect(visor).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(tarjeta).toBeFocused();
});

test("el visor: solo queda pulsado el botón que lo abrió, aunque otro lleve al mismo documento", async ({ page, servidor }) => {
  // En una tarea de un solo lote, el recibo del lote es también el documento de la Fase 4.
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cerrada`);
  const recibo = lotesDeLaFase(page).nth(0).getByRole("button");
  const fase4 = fasesDeLaTarea(page).nth(4).getByRole("button");
  await expect(recibo).toHaveText("04 - Ejecución.md");
  await expect(fase4).toHaveAccessibleName(/04 - Ejecución\.md/);
  await recibo.click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await expect(page.getByRole("main").locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(recibo).toHaveAttribute("aria-pressed", "true");
  await fase4.click();
  await expect(page.getByRole("main").locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(fase4).toHaveAttribute("aria-pressed", "true");
});

test("textos sin espacios (una URL en la nota) no ensanchan la tabla: a 390 px nada desborda, y a 1280 px el visor no la tapa", async ({ page, servidor }) => {
  const URL_LARGA = "https://github.com/organizacion/repositorio/pull/1234/files#diff-0123456789abcdef0123456789abcdef";
  await page.route("**/api/tareas/TIENDA/variedad/lotes*", async (ruta) => {
    const respuesta = await ruta.fetch();
    const cuerpo = await respuesta.json();
    Object.assign(cuerpo.estado.lotes[0], { ancla: { tipo: "nota", resumen: `nota: ver ${URL_LARGA}` }, sello: { corto: null, sha256: null, fecha: null }, origen: "servidor", vigente: null });
    Object.assign(cuerpo.estado.lotes[1], { ancla: { tipo: "nota", resumen: `nota: ${"x".repeat(200)}` }, sello: { corto: null, sha256: null, fecha: null }, origen: "servidor", vigente: null });
    await ruta.fulfill({ response: respuesta, json: cuerpo });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
  await expect(lotesDeLaFase(page).nth(0).locator(".estado-detalle")).toHaveText([`ver ${URL_LARGA}`]);
  for (const tema of ["oscuro", "claro"] as const) {
    await ponerTema(page, tema);
    await sinDesbordamiento(page, `la tabla con una URL en la nota, en tema ${tema}`);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await lotesDeLaFase(page).nth(2).getByRole("button").click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await sinDesbordamiento(page, "la tabla con el visor abierto");
  const { tabla, visor } = await page.evaluate(() => ({
    tabla: document.querySelector(".tabla-lotes")!.getBoundingClientRect().right,
    visor: document.querySelector(".visor")!.getBoundingClientRect().left,
  }));
  expect(tabla, "la tabla acaba antes de que empiece el visor").toBeLessThanOrEqual(visor);
  const partidas = await page.evaluate(() =>
    [...document.querySelectorAll(".tabla-lotes thead th, .tabla-lotes tbody th")].filter((celda) => {
      const rango = document.createRange();
      rango.selectNodeContents(celda);
      return new Set([...rango.getClientRects()].map((r) => Math.round(r.top))).size > 1;
    }).map((celda) => celda.textContent)
  );
  expect(partidas, "las cabeceras y los nombres de lote no se parten a media palabra").toEqual([]);
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
  await fasesDeLaTarea(page).nth(1).getByRole("button").click();
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

// Lo que haría el agente: el commit del lote y record_batch con su SHA, sobre el árbol de prueba.
async function registrarEnVivo(servidor: Servidor, tarea: string, titulo: string): Promise<void> {
  const anterior = { ...process.env };
  Object.assign(process.env, servidor.arbol.env);
  try {
    const { registrarLote } = await import("../../build/lotes.js");
    const sha = commit(path.join(servidor.arbol.repos, "api"), `${tarea}.txt`, `feat(api): ${titulo}`);
    await registrarLote("TIENDA", tarea, { lote: 1, repo: "api", titulo, estado: "verificado", que_se_hizo: "Hecho.", verificacion: "test", commit: sha });
  } finally {
    for (const clave of Object.keys(servidor.arbol.env)) delete process.env[clave];
    Object.assign(process.env, anterior);
  }
}

const animacionDe = (fila: Locator) => fila.evaluate((e) => getComputedStyle(e).animationName);
const fondoDe = (fila: Locator) => fila.evaluate((e) => getComputedStyle(e).backgroundColor);
const SIN_FONDO = "rgba(0, 0, 0, 0)";

test("en vivo: un recibo nuevo aparece por SSE, sin recargar, y su fila se resalta un momento", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/en-vivo`);
  const fila = lotesDeLaFase(page).nth(0);
  await expect(fila).toContainText("sin recibo");
  await expect(fila).not.toHaveClass(/estado-nuevo/);
  await page.evaluate(() => ((window as unknown as { __sinRecargar: boolean }).__sinRecargar = true));

  await registrarEnVivo(servidor, "en-vivo", "llega en vivo");
  await expect(fila.locator(".estado-verificado")).toHaveText("verificado", { timeout: 15_000 });
  await expect(fila).toHaveClass(/estado-nuevo/);
  expect(await animacionDe(fila)).toBe("resaltar");
  await expect(fila.locator(".estado-detalle").first()).toHaveText(/^[0-9a-f]{7}$/);
  expect(await page.evaluate(() => (window as unknown as { __sinRecargar?: boolean }).__sinRecargar)).toBe(true);
  // Con un solo lote, anclarlo cierra la fase: el recibo pasa a ser su documento.
  await expect(fasesDeLaTarea(page).nth(4)).toContainText("cerrada");
  // Es un momento: la fila vuelve a la normalidad sola, y las demás nunca se resaltaron.
  await expect(fila).not.toHaveClass(/estado-nuevo/, { timeout: 10_000 });
});

test("en vivo, con prefers-reduced-motion: la fila nueva se marca, pero sin animación", async ({ page, servidor }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/en-vivo-quieto`);
  const fila = lotesDeLaFase(page).nth(0);
  await expect(fila).toContainText("sin recibo");
  expect(await fondoDe(fila)).toBe(SIN_FONDO);

  await registrarEnVivo(servidor, "en-vivo-quieto", "llega sin movimiento");
  await expect(fila.locator(".estado-verificado")).toHaveText("verificado", { timeout: 15_000 });
  await expect(fila).toHaveClass(/estado-nuevo/);
  expect(await animacionDe(fila)).toBe("none");
  expect(await fondoDe(fila), "la marca queda fija en lugar de animarse").not.toBe(SIN_FONDO);
  await expect(fila).not.toHaveClass(/estado-nuevo/, { timeout: 10_000 });
  expect(await fondoDe(fila)).toBe(SIN_FONDO);
});

test("reverificar anclas: un commit que ya no está en la rama sale como no vigente, con su motivo", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/reescrita`);
  const fila = lotesDeLaFase(page).nth(0);
  await expect(fila.locator(".estado-verificado")).toBeVisible();
  await page.getByRole("button", { name: "Reverificar anclas" }).click();
  await expect(fila.locator(".estado-no-vigente")).toHaveText("no vigente", { timeout: 15_000 });
  await expect(fila.locator(".estado-detalle")).toHaveText(["ya no está en la rama"]);
  await expect(fila.getByRole("cell").nth(4)).toContainText(/^commit [0-9a-f]{7} en `pagos`/);
  await expect(page.getByText("Anclas reverificadas contra git y el disco.")).toBeVisible();
  await expect(fila).not.toHaveClass(/estado-nuevo/); // reverificar no es un sello nuevo
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "el lote no vigente");
});

test("en un teléfono (390×844), las tarjetas de fase se apilan, los lotes se vuelven fichas y nada desborda, en los dos temas", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
  const fases = fasesDeLaTarea(page);
  await expect(fases).toHaveCount(6);
  const cajas = await fases.evaluateAll((lis) => lis.map((li) => li.getBoundingClientRect()).map((c) => ({ x: c.x, y: c.y, ancho: c.width })));
  expect(new Set(cajas.map((c) => c.x)).size, "las tarjetas comparten columna").toBe(1);
  expect(cajas.map((c) => c.y), "y se apilan de arriba abajo").toEqual([...cajas.map((c) => c.y)].sort((a, b) => a - b));
  expect(new Set(cajas.map((c) => c.y)).size).toBe(6);
  await expect(lotesDeLaFase(page)).toHaveCount(6);
  for (const tema of ["oscuro", "claro"] as const) {
    await ponerTema(page, tema);
    await sinDesbordamiento(page, `el tablero en tema ${tema}`);
    await ningunEstadoSoloColor(page);
  }
  await lotesDeLaFase(page).nth(0).getByRole("button").click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await sinDesbordamiento(page, "el tablero con el visor");
});

test("sin tarea elegida, el tablero ofrece las de cada proyecto", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero`);
  await expect(page.getByRole("heading", { level: 1, name: "Tablero" })).toBeVisible();
  await page.getByRole("region", { name: "TIENDA" }).getByRole("link", { name: "cupones" }).click();
  await expect(page).toHaveURL(/#\/tablero\/TIENDA\/cupones$/);
  await expect(fasesDeLaTarea(page)).toHaveCount(6);
});
