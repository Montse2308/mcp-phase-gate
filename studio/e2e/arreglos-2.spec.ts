// Ninguna vista del Studio desborda en horizontal a 1280 px, en los dos idiomas: las seis vistas y las páginas de
// Ajustes. Ajustes › Avanzado, además, con la Documentación normal, vacía y rota, en los dos temas, y con los
// palabras enteras: solo se parten tras un guion bajo o un guion, nunca a media palabra. A 390 px la tabla es
// una lista (ajustes.spec.ts lo comprueba). Corre sobre sus propios `ui`: uno con el árbol de pruebas, otro con
// la Documentación vacía y otro con una ruta de Documentación que no existe.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

import { crearArbol } from "./arbol";
import type { Arbol } from "./arbol";
import { lanzarUi, ponerTema, sinDesbordamiento } from "./ayudas";
import type { Servidor } from "./ayudas";

type Docs = "normal" | "vacia" | "rota";
const ESTADOS: Docs[] = ["normal", "vacia", "rota"];
const IDIOMAS = [
  { locale: "es-ES", nombre: "español" },
  { locale: "en-US", nombre: "inglés" },
] as const;

// Un árbol sin proyectos: la Documentación existe y está vacía, o su ruta no existe.
function arbolSinProyectos(raiz: string, docs: "vacia" | "rota"): Arbol {
  const carpetas = Object.fromEntries(["repos", "estado", "config"].map((n) => [n, path.join(raiz, n)])) as Record<"repos" | "estado" | "config", string>;
  for (const c of Object.values(carpetas)) fs.mkdirSync(c, { recursive: true });
  const ruta = path.join(raiz, "docs");
  if (docs === "vacia") fs.mkdirSync(ruta, { recursive: true });
  const env = { PHASE_GATE_DOCS_PATH: ruta, PHASE_GATE_REPOS_PATH: carpetas.repos, PHASE_GATE_STATE_PATH: carpetas.estado, PHASE_GATE_CONFIG_PATH: carpetas.config, PHASE_GATE_LANG: "es" };
  return { raiz, docs: ruta, ...carpetas, env };
}

const test = base.extend<{ servidor: (docs: Docs) => Servidor }, { servidores: Record<Docs, Servidor> }>({
  servidores: [
    async ({}, use) => {
      const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-arreglos-2-"));
      const arboles: Record<Docs, () => Promise<Arbol>> = {
        normal: () => crearArbol(path.join(raiz, "normal")),
        vacia: async () => arbolSinProyectos(path.join(raiz, "vacia"), "vacia"),
        rota: async () => arbolSinProyectos(path.join(raiz, "rota"), "rota"),
      };
      const lanzados = [];
      const servidores = {} as Record<Docs, Servidor>;
      for (const docs of ESTADOS) {
        fs.mkdirSync(path.join(raiz, docs), { recursive: true });
        const lanzado = await lanzarUi(await arboles[docs]());
        lanzados.push(lanzado.hijo);
        servidores[docs] = lanzado.servidor;
      }
      await use(servidores);
      for (const hijo of lanzados) {
        hijo.kill();
        await new Promise((r) => (hijo.exitCode !== null ? r(null) : hijo.on("exit", r)));
      }
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: "worker" },
  ],
  servidor: async ({ servidores }, use) => {
    await use((docs) => servidores[docs]);
  },
});

// La página con la sesión del servidor elegido: las cookies no distinguen puertos, así que cada prueba lleva la suya.
async function abrir(page: Page, servidor: Servidor, hash: string): Promise<void> {
  await page.context().clearCookies();
  await page.context().addCookies([{ ...servidor.cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict", secure: false }]);
  await page.goto(`${servidor.origen}/${hash}`);
}

// Los datos ya llegaron: la vista no dice que carga, y tiene algo de contenido.
async function cargada(page: Page): Promise<void> {
  const principal = page.locator("main");
  await expect(principal.locator("h1, h2").first()).toBeVisible();
  await expect(principal).not.toContainText(/Cargando…|Loading…/);
}

// Ninguna palabra de la tabla se parte a media palabra: si una palabra pasa a otra línea, es justo después de un
// guion bajo o de un guion. Se mira letra a letra, en todas las celdas menos las del valor, donde van las rutas del
// equipo y pueden partirse donde haga falta. Cuenta además cuántos nombres PHASE_GATE_… se miraron.
async function palabrasEnteras(page: Page): Promise<void> {
  const { nombres, partidas } = await page.evaluate(() => {
    const celdas = [...document.querySelectorAll(".pagina-avanzado tbody tr > *")].filter((celda) => celda.matches(":not(:nth-child(3))"));
    const partidas: string[] = [];
    let nombres = 0;
    for (const celda of celdas) {
      // Las letras de la celda, de todos sus nodos de texto: un nombre va en varios trozos (uno por guion bajo).
      // Entre dos elementos (el nombre y su descripción, separados por un <br>) hay un espacio que no es texto.
      const letras: { nodo: Node | null; i: number; c: string }[] = [];
      const trozos = document.createTreeWalker(celda, NodeFilter.SHOW_TEXT);
      let padre: Node | null = null;
      for (let nodo = trozos.nextNode(); nodo; nodo = trozos.nextNode()) {
        if (padre && nodo.parentNode !== padre) letras.push({ nodo: null, i: 0, c: " " });
        padre = nodo.parentNode;
        [...(nodo.textContent ?? "")].forEach((c, i) => letras.push({ nodo, i, c }));
      }
      for (const palabra of letras.map((l) => l.c).join("").matchAll(/\S+/g)) {
        if (/^PHASE_GATE_/.test(palabra[0])) nombres++;
        let arriba: number | null = null;
        for (let k = 0; k < palabra[0].length; k++) {
          const { nodo, i } = letras[palabra.index! + k]!;
          if (!nodo) continue;
          const rango = document.createRange();
          rango.setStart(nodo, i);
          rango.setEnd(nodo, i + 1);
          const linea = Math.round(rango.getBoundingClientRect().top);
          if (arriba !== null && linea !== arriba && !"_-".includes(palabra[0][k - 1]!)) partidas.push(`${palabra[0]} (se parte antes de «${palabra[0].slice(k)}»)`);
          arriba = linea;
        }
      }
    }
    return { nombres, partidas };
  });
  expect(nombres, "hay nombres de variables en la tabla").toBeGreaterThan(5);
  expect(partidas, "palabras partidas a media palabra").toEqual([]);
}

for (const { locale, nombre } of IDIOMAS) {
  test.describe(`en ${nombre}`, () => {
    test.use({ locale, viewport: { width: 1280, height: 800 } });

    for (const docs of ESTADOS) {
      test(`Ajustes › Avanzado con la Documentación ${docs}: no desborda en horizontal y los nombres de las variables no se parten, en los dos temas`, async ({ page, servidor }) => {
        await abrir(page, servidor(docs), "#/ajustes/avanzado");
        await expect(page.getByRole("table")).toBeVisible();
        for (const tema of ["oscuro", "claro"] as const) {
          await ponerTema(page, tema);
          await sinDesbordamiento(page, `Ajustes › Avanzado, Documentación ${docs}, ${nombre}, tema ${tema}`);
          await palabrasEnteras(page);
        }
      });
    }

    const VISTAS: { nombre: string; hash: string }[] = [
      { nombre: "la Red", hash: "#/red" },
      { nombre: "el Tablero (una tarea con lotes de todos los estados)", hash: "#/tablero/TIENDA/variedad" },
      { nombre: "el Tablero (una tarea cerrada)", hash: "#/tablero/TIENDA/cupones" },
      { nombre: "el Taller", hash: "#/taller/TALLER?fase=3" },
      { nombre: "el Vigía", hash: "#/vigia" },
      { nombre: "la Bitácora", hash: "#/bitacora/TIENDA/cupones" },
      { nombre: "Ajustes › Este equipo", hash: "#/ajustes/equipo" },
      { nombre: "Ajustes › un proyecto con manifiesto", hash: "#/ajustes/proyecto/TIENDA" },
      { nombre: "Ajustes › un proyecto sin manifiesto", hash: "#/ajustes/proyecto/NUEVO" },
      { nombre: "Ajustes › un proyecto con el manifiesto roto", hash: "#/ajustes/proyecto/ROTO" },
      { nombre: "Ajustes › Clientes MCP", hash: "#/ajustes/clientes" },
      { nombre: "Ajustes › Studio", hash: "#/ajustes/studio" },
      { nombre: "Ajustes › Avanzado", hash: "#/ajustes/avanzado" },
    ];
    for (const vista of VISTAS) {
      test(`${vista.nombre} no desborda en horizontal a 1280 px, en los dos temas`, async ({ page, servidor }) => {
        await abrir(page, servidor("normal"), vista.hash);
        await cargada(page);
        for (const tema of ["oscuro", "claro"] as const) {
          await ponerTema(page, tema);
          await sinDesbordamiento(page, `${vista.nombre}, ${nombre}, tema ${tema}`);
        }
      });
    }
  });
}
