// El tema en Chromium real: sin elección guardada sigue al del sistema, y lo dice el CSS (la CSP no admite
// un script en línea); el botón lo cambia y se recuerda; y una elección guardada no la pisa el sistema.
// Además, las hojas de tema solo declaran custom properties, y el tema no cambia la estructura de ninguna
// vista: la función que lo compara (estructura.ts) tiene su prueba con árboles sintéticos, y las vistas se
// fotografían en los dos temas.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { BrowserContext, Page } from "@playwright/test";

import { expect, fasesDeLaTarea, lotesDeLaFase, sitio, test, testEstatico } from "./ayudas";
import type { Registro } from "./ayudas";
import { compararEstructuras, fotografiar } from "./estructura";
import type { Foto, Nodo } from "./estructura";

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

// ─── La función que compara estructuras, con árboles sintéticos ───────────────────────────────────────
const n = (etiqueta: string, atributos: Record<string, string> = {}, hijos: Nodo[] = [], texto = ""): Nodo => ({ etiqueta, atributos, hijos, ...(hijos.length === 0 ? { texto } : {}) });
const ARIA = ["- banner:", '  - button "Tema oscuro" [pressed]', '  - button "ES" [pressed]', "- main:", '  - heading "Red" [level=1]', "  - paragraph: Hola"].join("\n");
const foto = (): Foto => ({
  arbol: n("html", { lang: "es", "data-tema": "claro" }, [
    n("head", {}, [n("title", {}, [], "Studio")]),
    n("body", {}, [
      n("header", { class: "barra" }, [n("button", { class: "interruptor", "aria-pressed": "true", type: "button" }, [], "Tema oscuro"), n("button", { class: "idioma", "aria-pressed": "true" }, [], "ES")]),
      n("main", { id: "contenido" }, [n("h1", {}, [], "Red"), n("p", { class: "secundaria" }, [], "Hola")]),
    ]),
  ]),
  aria: ARIA,
});
// Un camino del árbol, para cambiar una hoja o un nodo: html > body > main > p.
const principal = (f: Foto) => f.arbol.hijos[1]!.hijos[1]!;
const barra = (f: Foto) => f.arbol.hijos[1]!.hijos[0]!;

test.describe("compararEstructuras", () => {
  test("dos fotos iguales, también si son copias distintas, no difieren", () => {
    expect(compararEstructuras(foto(), foto())).toEqual([]);
    expect(compararEstructuras(foto(), structuredClone(foto()))).toEqual([]);
  });

  test("un atributo con otro valor, uno de más o uno de menos se señalan con su sitio", () => {
    const otro = foto();
    principal(otro).hijos[1]!.atributos["class"] = "terciaria";
    expect(compararEstructuras(foto(), otro)).toEqual(['html > body[1] > main#contenido[1] > p.secundaria[1]: el atributo class es "secundaria" y "terciaria"']);
    const demas = foto();
    principal(demas).atributos["hidden"] = "";
    expect(compararEstructuras(foto(), demas)).toEqual(['html > body[1] > main#contenido[1]: el atributo hidden solo está en el segundo ("")']);
    const demenos = foto();
    delete principal(demenos).atributos["id"];
    expect(compararEstructuras(foto(), demenos)).toEqual(['html > body[1] > main#contenido[1]: el atributo id solo está en el primero ("contenido")']);
  });

  test("otra etiqueta, o un hijo de más, se señalan", () => {
    const otra = foto();
    principal(otra).hijos[1]!.etiqueta = "div";
    expect(compararEstructuras(foto(), otra)).toEqual(["html > body[1] > main#contenido[1] > p.secundaria[1]: la etiqueta es <p> y <div>"]);
    const mas = foto();
    principal(mas).hijos.push(n("p", {}, [], "otro"));
    expect(compararEstructuras(foto(), mas)).toEqual(["html > body[1] > main#contenido[1]: tiene 2 hijos y 3"]);
  });

  test("un texto distinto se señala, en el árbol y en el de accesibilidad", () => {
    const otro = foto();
    principal(otro).hijos[1]!.texto = "Adiós";
    otro.aria = ARIA.replace("paragraph: Hola", "paragraph: Adiós");
    expect(compararEstructuras(foto(), otro)).toEqual(['html > body[1] > main#contenido[1] > p.secundaria[1]: el texto es "Hola" y "Adiós"', 'aria, línea 6: "- paragraph: Hola" y "- paragraph: Adiós"']);
    const soloAria = foto();
    soloAria.aria = ARIA.replace('heading "Red"', 'heading "Network"');
    expect(compararEstructuras(foto(), soloAria)).toEqual([expect.stringMatching(/^aria, línea 5: .*Red.* y .*Network/)]);
    const mas = foto();
    mas.aria = `${ARIA}\n  - paragraph: de más`;
    expect(compararEstructuras(foto(), mas)).toEqual(['aria, línea 7: "(no hay)" y "- paragraph: de más"']);
  });

  test("el mismo contenido en otro orden se señala, en el árbol y en el de accesibilidad", () => {
    const otro = foto();
    principal(otro).hijos.reverse();
    const lineas = ARIA.split("\n");
    [lineas[4], lineas[5]] = [lineas[5]!, lineas[4]!];
    otro.aria = lineas.join("\n");
    const dif = compararEstructuras(foto(), otro);
    expect(dif.filter((d) => d.startsWith("html"))).toEqual([
      "html > body[1] > main#contenido[1] > h1[0]: la etiqueta es <h1> y <p>",
      "html > body[1] > main#contenido[1] > p.secundaria[1]: la etiqueta es <p> y <h1>",
    ]);
    expect(dif.filter((d) => d.startsWith("aria"))).toHaveLength(2);
  });

  test("el orden de los atributos no cuenta", () => {
    const otro = foto();
    principal(otro).atributos = { id: "contenido" };
    barra(otro).hijos[1]!.atributos = { "aria-pressed": "true", class: "idioma" };
    expect(compararEstructuras(foto(), otro)).toEqual([]);
  });

  test("solo data-tema en <html> y el estado pulsado del botón del tema se ignoran", () => {
    const otro = foto();
    otro.arbol.atributos["data-tema"] = "oscuro";
    barra(otro).hijos[0]!.atributos["aria-pressed"] = "false";
    otro.aria = ARIA.replace('"Tema oscuro" [pressed]', '"Tema oscuro"');
    expect(compararEstructuras(foto(), otro)).toEqual([]);
    const sinAtributo = foto();
    delete sinAtributo.arbol.atributos["data-tema"];
    expect(compararEstructuras(foto(), sinAtributo)).toEqual([]);
    // En inglés, el mismo botón con otro nombre.
    const ingles = { ...foto(), aria: ARIA.replace("Tema oscuro", "Dark theme") };
    expect(compararEstructuras(ingles, { ...ingles, aria: ingles.aria.replace('"Dark theme" [pressed]', '"Dark theme"') })).toEqual([]);

    // Lo demás sí cuenta: data-tema en otro elemento, aria-pressed en otro botón o en otra etiqueta, el
    // estado pulsado de otro botón en el árbol de accesibilidad, o un cambio en el propio botón del tema.
    const enOtroElemento = foto();
    principal(enOtroElemento).atributos["data-tema"] = "oscuro";
    expect(compararEstructuras(foto(), enOtroElemento)).toHaveLength(1);
    const enOtroBoton = foto();
    barra(enOtroBoton).hijos[1]!.atributos["aria-pressed"] = "false";
    expect(compararEstructuras(foto(), enOtroBoton)).toHaveLength(1);
    const otroPulsado = foto();
    otroPulsado.aria = ARIA.replace('"ES" [pressed]', '"ES"');
    expect(compararEstructuras(foto(), otroPulsado)).toHaveLength(1);
    const botonCambiado = foto();
    barra(botonCambiado).hijos[0]!.atributos["class"] = "interruptor nuevo";
    barra(botonCambiado).hijos[0]!.atributos["title"] = "otro";
    expect(compararEstructuras(foto(), botonCambiado).length).toBeGreaterThan(0);
  });
});

// ─── Las vistas, en los dos temas ─────────────────────────────────────────────────────────────────────
type Tema = "claro" | "oscuro";
type Escenario = {
  nombre: string;
  hash: string;
  ancho: number;
  contiene: string; // un texto que la foto tiene que traer: sin él, una vista vacía daría igual en los dos temas
  permitidos?: RegExp[]; // mensajes de consola que este escenario provoca a propósito
  antes?: (pagina: Page) => Promise<void>; // antes de navegar: respuestas simuladas
  listo: (pagina: Page) => Promise<void>; // el marcador de que la vista ya pintó sus datos
  despues?: (pagina: Page) => Promise<void>; // el estado a fotografiar: el visor, una vista previa…
};

// Una página nueva, con la elección de tema ya guardada antes de que corra la aplicación. Escucha lo mismo
// que la página del fixture: ninguna petición sale de 127.0.0.1 y la consola no admite errores.
async function paginaConTema(contexto: BrowserContext, registro: Registro, origen: string, tema: Tema, ancho: number, vivo: boolean): Promise<Page> {
  const pagina = await contexto.newPage();
  await pagina.setViewportSize({ width: ancho, height: ancho >= 1000 ? 900 : 844 });
  await pagina.addInitScript((elegido) => window.localStorage.setItem("pg-tema", elegido), tema);
  pagina.on("request", (peticion) => {
    const url = peticion.url();
    if (!url.startsWith("data:") && !url.startsWith(`${origen}/`)) registro.ajenas.push(url);
  });
  pagina.on("console", (mensaje) => {
    const texto = mensaje.text();
    if (mensaje.type() !== "error" && !/Content Security Policy/i.test(texto)) return;
    if (!registro.permitidos.some((p) => p.test(texto))) registro.errores.push(texto);
  });
  pagina.on("pageerror", (error) => registro.errores.push(error.message));
  // El SSE se deja colgado: un evento a mitad de la foto cambiaría la vista, y no es lo que se compara.
  if (vivo) await pagina.route("**/api/eventos*", () => {});
  return pagina;
}

async function fotoDe(contexto: BrowserContext, registro: Registro, origen: string, url: string, tema: Tema, e: Escenario, vivo: boolean): Promise<{ foto: Foto; fondo: string }> {
  const pagina = await paginaConTema(contexto, registro, origen, tema, e.ancho, vivo);
  try {
    await e.antes?.(pagina);
    await pagina.goto(url);
    await e.listo(pagina);
    await e.despues?.(pagina);
    // Que el tema pedido es el que se ve: si no, dos fotos iguales no probarían nada.
    await expect(pagina.locator("html")).toHaveAttribute("data-tema", tema);
    await expect(pagina.locator("html")).toHaveCSS("color-scheme", tema === "oscuro" ? "dark" : "light");
    const fondo = await pagina.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    return { foto: await fotografiar(pagina), fondo };
  } finally {
    await pagina.close();
  }
}

async function comprobarEstructura(contexto: BrowserContext, registro: Registro, origen: string, url: string, e: Escenario, vivo: boolean): Promise<void> {
  registro.permitidos.push(...(e.permitidos ?? []));
  const claro = await fotoDe(contexto, registro, origen, url, "claro", e, vivo);
  expect(claro.foto.aria, "la foto trae la vista").toContain(e.contiene);
  expect(claro.foto.aria.split("\n").length, "y no está vacía").toBeGreaterThan(15);
  // El control: el mismo tema dos veces tiene que dar lo mismo. Si no, la prueba daría falsos positivos.
  const control = await fotoDe(contexto, registro, origen, url, "claro", e, vivo);
  expect(compararEstructuras(claro.foto, control.foto), "control: claro contra claro").toEqual([]);
  const oscuro = await fotoDe(contexto, registro, origen, url, "oscuro", e, vivo);
  expect(oscuro.fondo, "el tema oscuro se pinta con otros colores").not.toBe(claro.fondo);
  expect(compararEstructuras(claro.foto, oscuro.foto), "la estructura en el tema claro y en el oscuro").toEqual([]);
}

const botonDeFila = (p: Page, nombre: string) => p.getByRole("article", { name: nombre }).getByRole("heading", { level: 2, name: nombre }).getByRole("button");
const redLista = async (p: Page) => {
  await expect(p.getByRole("list", { name: "Proyectos de la Documentación" }).getByRole("article")).toHaveCount(5);
  await expect(p.getByRole("article", { name: "TIENDA" }).locator(".campo-sesion dd")).toHaveText("Abierto en cliente-e2e 1.0");
};
const tableroListo = async (p: Page) => {
  await expect(fasesDeLaTarea(p)).toHaveCount(6);
  await expect(lotesDeLaFase(p)).toHaveCount(6);
  await expect(lotesDeLaFase(p).nth(5).locator(".estado-sin-recibo")).toHaveText("sin recibo");
};
const abrirElRecibo = async (p: Page) => {
  await lotesDeLaFase(p).nth(0).getByRole("button").click();
  await expect(p.getByRole("complementary", { name: /04 - Ejecución\/L01/ }).getByLabel("Frontmatter")).toContainText("ancla");
};
const tallerListo = async (p: Page) => {
  await expect(p.getByRole("list", { name: "Ranuras" }).getByRole("listitem").first()).toBeVisible();
  await expect(p.getByText("Política de commits")).toBeVisible();
};
const vigiaListo = async (p: Page) => {
  await expect(p.getByRole("heading", { name: "Diagnóstico" })).toBeVisible();
  await expect(p.getByRole("article", { name: "Cursor" })).toBeVisible();
  await expect(p.getByRole("table", { name: "Variables de entorno" })).toBeVisible();
};
const bitacoraLista = async (p: Page) => {
  await expect(p.getByRole("list", { name: "Eventos de la tarea" }).getByRole("listitem").first()).toBeVisible();
};

const ANCHOS = [1280, 390];
const VIVAS: Escenario[] = [
  ...ANCHOS.map((ancho) => ({ nombre: `la Red plegada a ${ancho} px`, hash: "#/red", ancho, contiene: "Red de proyectos", listo: redLista })),
  ...ANCHOS.map((ancho) => ({
    nombre: `la Red con dos filas desplegadas a ${ancho} px`,
    hash: "#/red",
    ancho,
    contiene: "phase-gate.json inválido",
    listo: redLista,
    despues: async (p: Page) => {
      await botonDeFila(p, "TIENDA").click();
      await botonDeFila(p, "ROTO").click();
      await expect(p.getByRole("article", { name: "ROTO" }).locator(".detalle-error")).toBeVisible();
    },
  })),
  {
    nombre: "la Red con la vista previa de cambiar el preset abierta",
    hash: "#/red",
    ancho: 1280,
    contiene: "Vista previa: Cambiar el preset",
    listo: redLista,
    despues: async (p) => {
      const tienda = p.getByRole("article", { name: "TIENDA" });
      await botonDeFila(p, "TIENDA").click();
      await tienda.getByLabel("Preset", { exact: true }).selectOption("software");
      await tienda.getByRole("button", { name: "Cambiar el preset: vista previa" }).click();
      await expect(tienda.getByRole("region", { name: "Vista previa: Cambiar el preset" }).locator(".diff-mas").first()).toBeVisible();
    },
  },
  {
    nombre: "la Red cuando la API falla",
    hash: "#/red",
    ancho: 1280,
    contiene: "fallo de prueba",
    permitidos: [/the server responded with a status of 500/],
    antes: async (p) => {
      await p.route("**/api/proyectos", (ruta) => ruta.fulfill({ status: 500, json: { error: "fallo de prueba" } }));
    },
    listo: (p) => expect(p.getByRole("alert")).toHaveText("fallo de prueba"),
  },
  ...ANCHOS.map((ancho) => ({ nombre: `el Tablero a ${ancho} px`, hash: "#/tablero/TIENDA/variedad", ancho, contiene: "Fases de la tarea", listo: tableroListo })),
  ...ANCHOS.map((ancho) => ({ nombre: `el Tablero con el visor abierto a ${ancho} px`, hash: "#/tablero/TIENDA/variedad", ancho, contiene: "Cerrar el visor", listo: tableroListo, despues: abrirElRecibo })),
  {
    nombre: "el Tablero de una tarea que no existe (error de la API)",
    hash: "#/tablero/TIENDA/no-existe",
    ancho: 1280,
    contiene: "no-existe",
    permitidos: [/the server responded with a status of 404/],
    listo: (p) => expect(p.getByRole("alert").first()).toContainText("no-existe"),
  },
  ...ANCHOS.map((ancho) => ({
    nombre: `el selector de tareas a ${ancho} px`,
    hash: "#/tablero",
    ancho,
    contiene: "Elige una tarea",
    listo: (p: Page) => expect(p.getByRole("region", { name: "TIENDA" }).getByRole("link", { name: "cupones" })).toBeVisible(),
  })),
  ...ANCHOS.map((ancho) => ({ nombre: `el Taller a ${ancho} px`, hash: "#/taller/TALLER?fase=3", ancho, contiene: "Ranuras de la Fase 3", listo: tallerListo })),
  {
    nombre: "el Taller con la vista previa de editar una ranura abierta",
    hash: "#/taller/TALLER?fase=3",
    ancho: 1280,
    contiene: "Vista previa: Editar fase-3/pruebas",
    listo: tallerListo,
    despues: async (p) => {
      await p.getByRole("list", { name: "Ranuras" }).getByRole("button", { name: /fase-3\/pruebas/ }).click();
      await p.getByRole("button", { name: "Editar fase-3/pruebas en la capa del proyecto: vista previa" }).click();
      await expect(p.getByRole("region", { name: /Vista previa: Editar fase-3\/pruebas en la capa del proyecto/ })).toBeVisible();
    },
  },
  ...ANCHOS.map((ancho) => ({ nombre: `el Vigía a ${ancho} px`, hash: "#/vigia", ancho, contiene: "Diagnóstico", listo: vigiaListo })),
  {
    nombre: "el Vigía con la vista previa de configurar un cliente abierta",
    hash: "#/vigia",
    ancho: 1280,
    contiene: "Vista previa: Configurar Cursor",
    listo: vigiaListo,
    despues: async (p) => {
      const cursor = p.getByRole("article", { name: "Cursor" });
      await cursor.getByRole("button", { name: "Configurar Cursor: vista previa" }).click();
      await expect(cursor.getByRole("region", { name: "Vista previa: Configurar Cursor" })).toBeVisible();
    },
  },
  ...ANCHOS.map((ancho) => ({ nombre: `la Bitácora a ${ancho} px`, hash: "#/bitacora/TIENDA/cerrada", ancho, contiene: "Bitácora de cerrada", listo: bitacoraLista })),
];

for (const e of VIVAS) {
  test(`la estructura no cambia con el tema: ${e.nombre}`, async ({ page, servidor, registro }) => {
    await comprobarEstructura(page.context(), registro, servidor.origen, `${servidor.origen}/${e.hash}`, e, true);
  });
}

// El sitio estático, servido bajo un subdirectorio y sin API ni SSE.
const ESTATICAS: Escenario[] = [
  ...ANCHOS.map((ancho) => ({
    nombre: `la Red a ${ancho} px`,
    hash: "",
    ancho,
    contiene: "Red de proyectos",
    listo: async (p: Page) => {
      await expect(p.getByRole("list", { name: "Proyectos de la Documentación" }).getByRole("article")).toHaveCount(3);
    },
  })),
  ...ANCHOS.map((ancho) => ({
    nombre: `el Tablero con el visor abierto a ${ancho} px`,
    hash: "#/tablero/TIENDA/cupones-de-descuento",
    ancho,
    contiene: "Cerrar el visor",
    listo: async (p: Page) => {
      await expect(lotesDeLaFase(p)).toHaveCount(4);
    },
    despues: async (p: Page) => {
      await lotesDeLaFase(p).nth(0).getByRole("button").click();
      await expect(p.getByRole("complementary", { name: /04 - Ejecución\/L01/ }).getByLabel("Frontmatter")).toContainText("commit");
    },
  })),
  ...ANCHOS.map((ancho) => ({
    nombre: `el Taller a ${ancho} px`,
    hash: "#/taller/TIENDA?fase=4&tarea=cupones-de-descuento",
    ancho,
    contiene: "Ranuras",
    listo: async (p: Page) => {
      await expect(p.getByRole("list", { name: "Ranuras" }).getByRole("button").first()).toBeVisible();
    },
  })),
  ...ANCHOS.map((ancho) => ({
    nombre: `el Vigía a ${ancho} px`,
    hash: "#/vigia",
    ancho,
    contiene: "Diagnóstico",
    listo: async (p: Page) => {
      await expect(p.getByText("En la demo publicada todo es de solo lectura.").first()).toBeVisible();
    },
  })),
  ...ANCHOS.map((ancho) => ({
    nombre: `la Bitácora a ${ancho} px`,
    hash: "#/bitacora/TIENDA/cupones-de-descuento",
    ancho,
    contiene: "Bitácora de cupones-de-descuento",
    listo: bitacoraLista,
  })),
  {
    nombre: "lo que no se exportó (un aviso en lugar de la vista)",
    hash: "#/taller/TIENDA?fase=9",
    ancho: 1280,
    contiene: "Esto no está en la demo publicada",
    permitidos: [/the server responded with a status of 404/],
    listo: (p) => expect(p.getByText("Esto no está en la demo publicada.")).toBeVisible(),
  },
];

for (const e of ESTATICAS) {
  testEstatico(`la estructura del sitio estático no cambia con el tema: ${e.nombre}`, async ({ page, servidor, registro }) => {
    await comprobarEstructura(page.context(), registro, servidor.origen, sitio(servidor, e.hash), e, false);
  });
}
