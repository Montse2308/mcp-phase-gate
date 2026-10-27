// La tipografía del Studio en Chromium real: el cuerpo mide 15 px y ningún texto de ninguna vista baja de 12 px,
// ni el de las cabeceras de tabla, las etiquetas, el código o la insignia de un estado. Se mide con
// getComputedStyle en cada elemento que tiene texto, y en los pseudoelementos con contenido (las etiquetas de
// las fichas de un teléfono), en los dos temas.

import type { Page } from "@playwright/test";

import { expect, fasesDeLaTarea, lotesDeLaFase, test } from "./ayudas";

const MINIMO = 12;

type Vista = { nombre: string; hash: string; ancho: number; listo: (p: Page) => Promise<void>; despues?: (p: Page) => Promise<void> };

const botonDeFila = (p: Page, nombre: string) => p.getByRole("article", { name: nombre }).getByRole("heading", { level: 2, name: nombre }).getByRole("button");

const VISTAS: Vista[] = [
  ...[1280, 390].map((ancho) => ({
    nombre: `la Red con dos filas desplegadas a ${ancho} px`,
    hash: "#/red",
    ancho,
    listo: async (p: Page) => {
      await expect(p.getByRole("list", { name: "Proyectos de la Documentación" }).getByRole("article")).toHaveCount(5);
    },
    despues: async (p: Page) => {
      await botonDeFila(p, "TIENDA").click();
      await botonDeFila(p, "ROTO").click();
      await expect(p.getByRole("article", { name: "ROTO" }).locator(".detalle-error")).toBeVisible();
    },
  })),
  ...[1280, 390].map((ancho) => ({
    nombre: `el Tablero con el visor abierto a ${ancho} px`,
    hash: "#/tablero/TIENDA/variedad",
    ancho,
    listo: async (p: Page) => {
      await expect(fasesDeLaTarea(p)).toHaveCount(6);
      await expect(lotesDeLaFase(p)).toHaveCount(6);
    },
    despues: async (p: Page) => {
      await lotesDeLaFase(p).nth(0).getByRole("button").click();
      await expect(p.getByRole("complementary", { name: /04 - Ejecución\/L01/ }).getByLabel("Frontmatter")).toContainText("ancla");
    },
  })),
  ...[1280, 390].map((ancho) => ({
    nombre: `el Taller con la vista previa de una ranura a ${ancho} px`,
    hash: "#/taller/TALLER?fase=3",
    ancho,
    listo: async (p: Page) => {
      await expect(p.getByRole("list", { name: "Ranuras" }).getByRole("listitem").first()).toBeVisible();
    },
    despues: async (p: Page) => {
      await p.getByRole("list", { name: "Ranuras" }).getByRole("button", { name: /fase-3\/pruebas/ }).click();
      await p.getByRole("button", { name: "Editar fase-3/pruebas en la capa global: vista previa" }).click();
      await expect(p.getByRole("region", { name: /Vista previa: Editar fase-3\/pruebas en la capa global/ })).toBeVisible();
    },
  })),
  ...[1280, 390].map((ancho) => ({
    nombre: `el Vigía con la vista previa de un cliente a ${ancho} px`,
    hash: "#/vigia",
    ancho,
    listo: async (p: Page) => {
      await expect(p.getByRole("table", { name: "Variables de entorno" })).toBeVisible();
    },
    despues: async (p: Page) => {
      const cursor = p.getByRole("article", { name: "Cursor" });
      await cursor.getByRole("button", { name: "Configurar Cursor: vista previa" }).click();
      await expect(cursor.getByRole("region", { name: "Vista previa: Configurar Cursor" })).toBeVisible();
    },
  })),
  ...[1280, 390].map((ancho) => ({
    nombre: `la Bitácora a ${ancho} px`,
    hash: "#/bitacora/TIENDA/cerrada",
    ancho,
    listo: async (p: Page) => {
      await expect(p.getByRole("list", { name: "Eventos de la tarea" }).getByRole("listitem").first()).toBeVisible();
    },
  })),
];

// Lo que mide el navegador: cada elemento visible con texto propio (o un campo de formulario) y cada
// pseudoelemento con contenido. Corre dentro de la página: tiene que bastarse solo.
function textosPequenos(minimo: number): { cuerpo: string; pequenos: string[]; vistos: number } {
  const pequenos: string[] = [];
  let vistos = 0;
  const describir = (el: Element, pseudo: string) => `${el.localName}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/)[0]}` : ""}${pseudo}`;
  for (const el of document.body.querySelectorAll("*")) {
    if (!el.checkVisibility()) continue;
    const texto = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
    if (texto !== "" || /^(?:input|select|textarea)$/.test(el.localName)) {
      vistos++;
      const tamano = parseFloat(getComputedStyle(el).fontSize);
      if (tamano < minimo) pequenos.push(`${describir(el, "")}: ${tamano}px «${texto.slice(0, 40)}»`);
    }
    for (const pseudo of ["::before", "::after"]) {
      const estilo = getComputedStyle(el, pseudo);
      if (estilo.content === "none" || estilo.content === "normal" || estilo.content === '""' || estilo.display === "none") continue;
      vistos++;
      const tamano = parseFloat(estilo.fontSize);
      if (tamano < minimo) pequenos.push(`${describir(el, pseudo)}: ${tamano}px ${estilo.content.slice(0, 40)}`);
    }
  }
  return { cuerpo: getComputedStyle(document.body).fontSize, pequenos, vistos };
}

for (const tema of ["claro", "oscuro"] as const) {
  for (const v of VISTAS) {
    test(`ningún texto mide menos de ${MINIMO} px y el cuerpo mide 15 px, en el tema ${tema}: ${v.nombre}`, async ({ page, servidor }) => {
      await page.setViewportSize({ width: v.ancho, height: v.ancho >= 1000 ? 900 : 844 });
      await page.addInitScript((elegido) => window.localStorage.setItem("pg-tema", elegido), tema);
      await page.goto(`${servidor.origen}/${v.hash}`);
      await v.listo(page);
      await v.despues?.(page);
      await expect(page.locator("html")).toHaveAttribute("data-tema", tema);
      const { cuerpo, pequenos, vistos } = await page.evaluate(textosPequenos, MINIMO);
      expect(vistos, "la prueba mide textos de verdad").toBeGreaterThan(40);
      expect(cuerpo).toBe("15px");
      expect(pequenos, `textos por debajo de ${MINIMO} px`).toEqual([]);
    });
  }
}

test("la tipografía es Inter para el texto y JetBrains Mono para el código, y las dos cargan", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
  await expect(fasesDeLaTarea(page)).toHaveCount(6);
  await expect(lotesDeLaFase(page)).toHaveCount(6);
  const familias = await page.evaluate(async () => {
    await document.fonts.ready;
    const detalle = document.querySelector(".estado-detalle");
    return {
      cuerpo: getComputedStyle(document.body).fontFamily,
      titulo: getComputedStyle(document.querySelector("h1")!).fontWeight,
      codigo: detalle ? getComputedStyle(detalle).fontFamily : "",
      cargadas: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")).sort(),
    };
  });
  expect(familias.cuerpo).toMatch(/^Inter,/);
  expect(familias.codigo).toMatch(/^"?JetBrains Mono"?,/);
  expect(familias.titulo).toBe("600");
  expect(familias.cargadas).toEqual(["Inter", "JetBrains Mono"]);
});
