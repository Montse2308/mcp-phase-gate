// La referencia del árbol de accesibilidad: el `ariaSnapshot()` de <body> de cada vista, en los mismos estados que
// la prueba de la estructura única (tema.spec.ts), guardado en `referencia/`. Esa prueba compara claro contra
// oscuro; esta compara lo de hoy contra lo guardado, para que un cambio de aspecto no cambie lo que lee un lector
// de pantalla ni lo que ve un `getByRole`. Las fotos se sacan en el tema claro: el tema no cambia el árbol.
//
// Para regenerar la referencia a propósito (un cambio de estructura decidido), se corre con
// `ACTUALIZAR_REFERENCIA=1 npm run test:e2e -- referencia` y se revisa el diff de `referencia/` en el commit.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, fasesDeLaTarea, lotesDeLaFase, sitio, test, testEstatico } from "./ayudas";
import type { Registro } from "./ayudas";
import { fotografiar } from "./estructura";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CARPETA = path.join(AQUI, "referencia");
// Donde está el paquete: las rutas de los presets y de los prompts de fábrica salen en el Taller.
const PAQUETE = path.join(AQUI, "..", "..");
const ACTUALIZAR = process.env.ACTUALIZAR_REFERENCIA === "1";

type Escenario = {
  nombre: string;
  hash: string;
  ancho: number;
  permitidos?: RegExp[]; // mensajes de consola que este escenario provoca a propósito
  ordenar?: boolean; // sus listas salen en un orden que depende de la hora de la corrida
  antes?: (pagina: Page) => Promise<void>; // antes de navegar: respuestas simuladas
  listo: (pagina: Page) => Promise<void>; // el marcador de que la vista ya pintó sus datos
  despues?: (pagina: Page) => Promise<void>; // el estado a fotografiar: el visor, una vista previa…
};

// Lo que cambia de una corrida a otra o de un sistema a otro, y no es estructura: la carpeta temporal de la
// prueba y la del paquete, con sus separadores; los SHA de los commits que la prueba acaba de hacer; las fechas,
// que salen de la hora de la corrida y de la zona horaria de quien la corre; y el contenido de los diffs de las
// vistas previas, que lleva las rutas del sistema, el idioma del servidor y las variables PHASE_GATE_* del
// entorno de quien corre la prueba. De cada diff queda que hay un texto, no cuál es.
function normalizar(aria: string, raiz: string, ordenar: boolean): string {
  let texto = aria;
  // En Windows, la ruta llega con barras invertidas, y dentro de un JSON mostrado, con las barras escapadas
  // una y otra vez: cada separador es una racha de `\` o de `/`.
  const separador = "[\\\\/]+";
  for (const [carpeta, nombre] of [[raiz, "<raiz>"], [PAQUETE, "<paquete>"]] as const) {
    const ruta = carpeta.split(/[\\/]+/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    texto = texto.replace(new RegExp(ruta.join(separador), "g"), nombre);
  }
  texto = texto
    .replace(/^( *- text: )"(?:\+\+\+|---|\+ )[^\n]*$/gm, "$1<diff>")
    // Los separadores, solo dentro de las rutas (lo que sigue a `<raiz>`, `<paquete>`, `<Documentación>`… o a `~`):
    // el resto del texto, como las comillas escapadas, se compara tal cual.
    .replace(/(<[^<>\s]+>|~)((?:[\\/]+[^\s"'`\\/()]*)+)/g, (_, inicio: string, resto: string) => `${inicio}${resto.replace(/\\+/g, "/")}`)
    // `claude mcp add --env "X=ruta"`: las comillas solo salen si la ruta lleva espacios.
    .replace(/--env "([^"]*)"/g, "--env $1")
    .replace(/~\/(?:AppData\/Roaming|\.config|Library\/Application Support)\/Code\/User\/mcp\.json/g, "~/<carpeta de VS Code>/mcp.json")
    .replace(/mcp-phase-gate \d+\.\d+\.\d+(?:-[\w.]+)?(?: \(clon\))?/g, "mcp-phase-gate <versión>")
    .replace(/Node v\d+\.\d+\.\d+/g, "Node <versión>")
    .replace(/\b[0-9a-f]{7,64}\b/g, "<sha>")
    .replace(/\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?/g, "<fecha>")
    .trimEnd();
  return `${ordenar ? ordenarElementos(texto) : texto}\n`;
}

// Las listas que se ordenan por fecha (la Bitácora) o por la fecha de la carpeta (las tareas del selector)
// empatan en la misma corrida y salen en otro orden: se comparan sus elementos sin contar el orden.
function ordenarElementos(texto: string): string {
  const lineas = texto.split("\n");
  const fuera: string[] = [];
  for (let i = 0; i < lineas.length; ) {
    const m = /^( *)- listitem:$/.exec(lineas[i]!);
    if (!m) {
      fuera.push(lineas[i++]!);
      continue;
    }
    const sangria = m[1]!.length;
    const bloques: string[] = [];
    while (i < lineas.length && new RegExp(`^ {${sangria}}- listitem:$`).test(lineas[i]!)) {
      const bloque = [lineas[i++]!];
      while (i < lineas.length && lineas[i]!.search(/\S/) > sangria) bloque.push(lineas[i++]!);
      bloques.push(bloque.join("\n"));
    }
    fuera.push(...bloques.sort().join("\n").split("\n"));
  }
  return fuera.join("\n");
}

const nombreDeArchivo = (prefijo: string, nombre: string) =>
  `${prefijo}-${nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.aria.yml`;

async function compararConLaReferencia(page: Page, registro: Registro, raiz: string, url: string, archivo: string, e: Escenario, vivo: boolean): Promise<void> {
  registro.permitidos.push(...(e.permitidos ?? []));
  await page.setViewportSize({ width: e.ancho, height: e.ancho >= 1000 ? 900 : 844 });
  await page.addInitScript(() => window.localStorage.setItem("pg-tema", "claro"));
  // El SSE se deja colgado: un evento a mitad de la foto cambiaría la vista, y no es lo que se compara.
  if (vivo) await page.route("**/api/eventos*", () => {});
  await e.antes?.(page);
  await page.goto(url);
  await e.listo(page);
  await e.despues?.(page);
  await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
  const actual = normalizar((await fotografiar(page)).aria, raiz, e.ordenar === true);
  expect(actual.split("\n").length, "la foto no está vacía").toBeGreaterThan(15);
  const ruta = path.join(CARPETA, archivo);
  if (ACTUALIZAR) {
    fs.mkdirSync(CARPETA, { recursive: true });
    fs.writeFileSync(ruta, actual, "utf-8");
    return;
  }
  expect(fs.existsSync(ruta), `falta la referencia ${archivo}: se genera con ACTUALIZAR_REFERENCIA=1`).toBe(true);
  expect(actual, `el árbol de accesibilidad de ${e.nombre} cambió respecto de ${archivo}`).toBe(fs.readFileSync(ruta, "utf-8").replace(/\r\n/g, "\n"));
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
  // El selector de proyectos se llena cuando llega la lista de proyectos, después del resto de la vista.
  await expect(p.locator("#taller-proyecto option")).not.toHaveCount(0);
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
  ...ANCHOS.map((ancho) => ({ nombre: `la Red plegada a ${ancho} px`, hash: "#/red", ancho, listo: redLista })),
  ...ANCHOS.map((ancho) => ({
    nombre: `la Red con dos filas desplegadas a ${ancho} px`,
    hash: "#/red",
    ancho,
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
    permitidos: [/the server responded with a status of 500/],
    antes: async (p) => {
      await p.route("**/api/proyectos", (ruta) => ruta.fulfill({ status: 500, json: { error: "fallo de prueba" } }));
    },
    listo: (p) => expect(p.getByRole("alert")).toHaveText("fallo de prueba"),
  },
  ...ANCHOS.map((ancho) => ({ nombre: `el Tablero a ${ancho} px`, hash: "#/tablero/TIENDA/variedad", ancho, listo: tableroListo })),
  ...ANCHOS.map((ancho) => ({ nombre: `el Tablero con el visor abierto a ${ancho} px`, hash: "#/tablero/TIENDA/variedad", ancho, listo: tableroListo, despues: abrirElRecibo })),
  {
    nombre: "el Tablero de una tarea que no existe (error de la API)",
    hash: "#/tablero/TIENDA/no-existe",
    ancho: 1280,
    permitidos: [/the server responded with a status of 404/],
    listo: (p) => expect(p.getByRole("alert").first()).toContainText("no-existe"),
  },
  ...ANCHOS.map((ancho) => ({
    nombre: `el selector de tareas a ${ancho} px`,
    hash: "#/tablero",
    ancho,
    ordenar: true,
    listo: (p: Page) => expect(p.getByRole("region", { name: "TIENDA" }).getByRole("link", { name: "cupones" })).toBeVisible(),
  })),
  ...ANCHOS.map((ancho) => ({ nombre: `el Taller a ${ancho} px`, hash: "#/taller/TALLER?fase=3", ancho, listo: tallerListo })),
  {
    nombre: "el Taller con la vista previa de editar una ranura abierta",
    hash: "#/taller/TALLER?fase=3",
    ancho: 1280,
    listo: tallerListo,
    despues: async (p) => {
      await p.getByRole("list", { name: "Ranuras" }).getByRole("button", { name: /fase-3\/pruebas/ }).click();
      await p.getByRole("button", { name: "Editar fase-3/pruebas en la capa global: vista previa" }).click();
      await expect(p.getByRole("region", { name: /Vista previa: Editar fase-3\/pruebas en la capa global/ })).toBeVisible();
    },
  },
  ...ANCHOS.map((ancho) => ({ nombre: `el Vigía a ${ancho} px`, hash: "#/vigia", ancho, listo: vigiaListo })),
  {
    nombre: "el Vigía con la vista previa de configurar un cliente abierta",
    hash: "#/vigia",
    ancho: 1280,
    listo: vigiaListo,
    despues: async (p) => {
      const cursor = p.getByRole("article", { name: "Cursor" });
      await cursor.getByRole("button", { name: "Configurar Cursor: vista previa" }).click();
      await expect(cursor.getByRole("region", { name: "Vista previa: Configurar Cursor" })).toBeVisible();
    },
  },
  ...ANCHOS.map((ancho) => ({ nombre: `la Bitácora a ${ancho} px`, hash: "#/bitacora/TIENDA/cerrada", ancho, ordenar: true, listo: bitacoraLista })),
];

for (const e of VIVAS) {
  test(`la referencia del árbol de accesibilidad: ${e.nombre}`, async ({ page, servidor, registro }) => {
    await compararConLaReferencia(page, registro, servidor.arbol.raiz, `${servidor.origen}/${e.hash}`, nombreDeArchivo("vivo", e.nombre), e, true);
  });
}

// El sitio estático, servido bajo un subdirectorio y sin API ni SSE.
const ESTATICAS: Escenario[] = [
  ...ANCHOS.map((ancho) => ({
    nombre: `la Red a ${ancho} px`,
    hash: "",
    ancho,
    listo: async (p: Page) => {
      await expect(p.getByRole("list", { name: "Proyectos de la Documentación" }).getByRole("article")).toHaveCount(3);
    },
  })),
  ...ANCHOS.map((ancho) => ({
    nombre: `el Tablero con el visor abierto a ${ancho} px`,
    hash: "#/tablero/TIENDA/cupones-de-descuento",
    ancho,
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
    listo: async (p: Page) => {
      await expect(p.getByRole("list", { name: "Ranuras" }).getByRole("button").first()).toBeVisible();
    },
  })),
  ...ANCHOS.map((ancho) => ({
    nombre: `el Vigía a ${ancho} px`,
    hash: "#/vigia",
    ancho,
    listo: async (p: Page) => {
      await expect(p.getByText("En la demo publicada todo es de solo lectura.").first()).toBeVisible();
    },
  })),
  ...ANCHOS.map((ancho) => ({ nombre: `la Bitácora a ${ancho} px`, hash: "#/bitacora/TIENDA/cupones-de-descuento", ancho, listo: bitacoraLista })),
  {
    nombre: "lo que no se exportó (un aviso en lugar de la vista)",
    hash: "#/taller/TIENDA?fase=9",
    ancho: 1280,
    permitidos: [/the server responded with a status of 404/],
    listo: (p) => expect(p.getByText("Esto no está en la demo publicada.")).toBeVisible(),
  },
];

for (const e of ESTATICAS) {
  testEstatico(`la referencia del árbol de accesibilidad del sitio estático: ${e.nombre}`, async ({ page, servidor, registro }) => {
    await compararConLaReferencia(page, registro, servidor.arbol.raiz, sitio(servidor, e.hash), nombreDeArchivo("estatico", e.nombre), e, false);
  });
}
