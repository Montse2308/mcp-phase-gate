// Ajustes en Chromium real: el menú, el borrador por archivo (un diff por archivo y un solo Aplicar), el conflicto
// con el disco, salir con cambios sin aplicar, el primer arranque, lo que se mudó de la Red, el Taller y el Vigía,
// y la cobertura de los esquemas. Corre sobre su propio `ui`, con su propio árbol: lo que aquí se escribe no le
// llega a las demás specs. El HOME es falso y el `claude` de mentira (entorno.ts).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { Browser, Page } from "@playwright/test";

import { crearArbol } from "./arbol";
import type { Arbol } from "./arbol";
import { expect, lanzarUi, ningunEstadoSoloColor, ponerTema, sinDesbordamiento, sinViolacionesGraves, test as base } from "./ayudas";
import type { Servidor } from "./ayudas";
import { huellaDeLosClientesReales } from "./entorno";

const test = base.extend<{}, { servidor: Servidor }>({
  servidor: [
    async ({}, use) => {
      const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-ajustes-"));
      const reales = huellaDeLosClientesReales();
      const arbol = await crearArbol(raiz);
      // Sin PHASE_GATE_LANG en el servidor: el idioma por defecto de machine.json es el que vale.
      delete arbol.env.PHASE_GATE_LANG;
      const { hijo, servidor } = await lanzarUi(arbol);
      await use(servidor);
      hijo.kill();
      await new Promise((r) => (hijo.exitCode !== null ? r(null) : hijo.on("exit", r)));
      expect(huellaDeLosClientesReales(), "la configuración real de los clientes no cambió").toEqual(reales);
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: "worker" },
  ],
});

const MENU = (p: Page) => p.getByRole("navigation", { name: "Páginas de Ajustes" });
const manifiestoDe = (s: Servidor, proyecto: string) => path.join(s.arbol.docs, proyecto, "phase-gate.json");
const maquinaDe = (s: Servidor) => path.join(s.arbol.config, "machine.json");
const leerJson = (ruta: string) => JSON.parse(fs.readFileSync(ruta, "utf-8")) as Record<string, any>;
const previa = (p: Page) => p.getByRole("region", { name: "Vista previa: Guardar los cambios" });
const abrirProyecto = async (p: Page, s: Servidor, proyecto: string) => {
  await p.goto(`${s.origen}/#/ajustes/proyecto/${proyecto}`);
  await expect(p.getByRole("heading", { level: 2, name: `Proyecto ${proyecto}` })).toBeVisible();
  await expect(p.getByLabel("Preset", { exact: true })).toBeVisible();
};
const cambiados = (p: Page) => p.locator(".indicador.ajustes-cambiado");
const aplicaciones = (p: Page) => {
  const hechas: string[] = [];
  p.on("request", (r) => {
    if (r.url().endsWith("/api/acciones/aplicar")) hechas.push(r.url());
  });
  return hechas;
};

// ─── Cada página, en los dos temas ──────────────────────────────────────────────────────────────────────
const PAGINAS: { nombre: string; hash: string; listo: (p: Page) => Promise<void>; conEstados: boolean }[] = [
  { nombre: "Este equipo", hash: "#/ajustes/equipo", conEstados: true, listo: (p) => expect(p.getByRole("heading", { level: 2, name: "Este equipo" })).toBeVisible() },
  { nombre: "un proyecto con manifiesto", hash: "#/ajustes/proyecto/TIENDA", conEstados: false, listo: (p) => expect(p.getByRole("table", { name: "Repos del proyecto" })).toBeVisible() },
  { nombre: "un proyecto sin manifiesto", hash: "#/ajustes/proyecto/NUEVO", conEstados: false, listo: (p) => expect(p.getByRole("button", { name: "Crear phase-gate.json: vista previa" })).toBeVisible() },
  { nombre: "un proyecto con el manifiesto roto", hash: "#/ajustes/proyecto/ROTO", conEstados: false, listo: (p) => expect(p.getByText("Su phase-gate.json no es válido")).toBeVisible() },
  { nombre: "Clientes MCP", hash: "#/ajustes/clientes", conEstados: true, listo: (p) => expect(p.getByRole("article", { name: "Cursor" })).toBeVisible() },
  { nombre: "Studio", hash: "#/ajustes/studio", conEstados: false, listo: (p) => expect(p.getByRole("group", { name: "Tema" })).toBeVisible() },
  { nombre: "Avanzado", hash: "#/ajustes/avanzado", conEstados: false, listo: (p) => expect(p.getByRole("table", { name: "Variables avanzadas" })).toBeVisible() },
];

for (const pagina of PAGINAS) {
  test(`${pagina.nombre}: se ve en los dos temas, sin violaciones graves de axe, y ningún estado va solo con color`, async ({ page, servidor }) => {
    await page.goto(`${servidor.origen}/${pagina.hash}`);
    await pagina.listo(page);
    for (const tema of ["oscuro", "claro"] as const) {
      await ponerTema(page, tema);
      await sinViolacionesGraves(page, `Ajustes, ${pagina.nombre}, en tema ${tema}`);
      if (pagina.conEstados) await ningunEstadoSoloColor(page);
    }
  });
}

test("el menú lista este equipo, cada proyecto, los clientes, el Studio y lo avanzado; se recorre con el teclado y marca la página actual", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes`);
  const menu = MENU(page);
  for (const nombre of ["Este equipo", "INVESTIGACION", "NUEVO", "ROTO", "TALLER", "TIENDA", "Clientes MCP", "Studio", "Avanzado"]) {
    await expect(menu.getByRole("link", { name: nombre, exact: true })).toBeVisible();
  }
  await expect(menu.getByRole("link", { name: "Este equipo", exact: true })).toHaveAttribute("aria-current", "page");
  // Con el teclado: Tab pasa al enlace siguiente del menú (el primer proyecto) y Enter lo abre.
  await menu.getByRole("link", { name: "Este equipo", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("link", { name: "INVESTIGACION", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/ajustes\/proyecto\/INVESTIGACION$/);
  await expect(menu.getByRole("link", { name: "INVESTIGACION", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: "Este equipo", exact: true })).not.toHaveAttribute("aria-current", "page");
});

test("por debajo de 760 px el menú es un selector, y ninguna página desborda en los dos temas", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/ajustes/equipo`);
  await expect(MENU(page).getByRole("link")).toHaveCount(0);
  const selector = MENU(page).getByRole("combobox", { name: "Ir a la página" });
  await expect(selector).toBeVisible();
  for (const pagina of PAGINAS) {
    await page.goto(`${servidor.origen}/${pagina.hash}`);
    await pagina.listo(page);
    for (const tema of ["oscuro", "claro"] as const) {
      await ponerTema(page, tema);
      await sinDesbordamiento(page, `Ajustes, ${pagina.nombre}, en tema ${tema}`);
    }
  }
  await selector.selectOption({ label: "Avanzado" });
  await expect(page).toHaveURL(/#\/ajustes\/avanzado$/);
  await expect(page.getByRole("table", { name: "Variables avanzadas" })).toBeVisible();
});

// ─── Este equipo ────────────────────────────────────────────────────────────────────────────────────────
test("este equipo: lo que el entorno define y machine.json no tiene se ofrece guardar, con su vista previa; crea machine.json versión 2", async ({ page, servidor }) => {
  const { docs, repos } = servidor.arbol;
  expect(fs.existsSync(maquinaDe(servidor))).toBe(false);
  await page.goto(`${servidor.origen}/#/ajustes/equipo`);
  await expect(page.locator(".indicador.ajustes-maquina-ausente")).toHaveText("sin machine.json todavía");
  const campoDocs = page.locator('[data-campo="documentacion"]');
  await expect(campoDocs).toContainText(`Tu entorno define ${docs}, y machine.json no lo tiene.`);
  await campoDocs.getByRole("button", { name: "Guardarlo en machine.json" }).click();
  await page.locator('[data-campo="carpetaDeRepos"]').getByRole("button", { name: "Guardarlo en machine.json" }).click();
  await expect(cambiados(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
  await expect(previa(page)).toContainText("Se crea el archivo.");
  await expect(previa(page).locator(".diff-mas").filter({ hasText: '"documentacion"' })).toHaveCount(1);
  await previa(page).getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toContainText("machine.json actualizado");
  const maquina = leerJson(maquinaDe(servidor));
  expect(maquina.version).toBe(2);
  expect(maquina.rutas).toEqual({ documentacion: docs, carpetaDeRepos: repos });
  expect(fs.readdirSync(servidor.arbol.config).some((n) => n.startsWith("machine.json.bak-"))).toBe(false);
  await expect(page.locator(".indicador.ajustes-maquina-valida")).toBeVisible();
  await expect(cambiados(page)).toHaveCount(0);
  await expect(campoDocs).not.toContainText("Tu entorno define");
});

test("este equipo: si el propio Studio usa otra ruta por su entorno, es el primer aviso", async ({ page, servidor }) => {
  const original = fs.readFileSync(maquinaDe(servidor), "utf-8");
  const otra = path.join(servidor.arbol.raiz, "otra-docs");
  fs.writeFileSync(maquinaDe(servidor), `${JSON.stringify({ ...JSON.parse(original), rutas: { ...JSON.parse(original).rutas, documentacion: otra } }, null, 2)}\n`, "utf-8");
  try {
    await page.goto(`${servidor.origen}/#/ajustes/equipo`);
    const primero = page.locator(".pagina-equipo .aviso").first();
    await expect(primero).toHaveClass(/propio-studio-pisa/);
    await expect(primero).toContainText(`Este Studio usa ${servidor.arbol.docs} por entorno, y machine.json dice ${otra}.`);
  } finally {
    fs.writeFileSync(maquinaDe(servidor), original, "utf-8");
  }
});

test("este equipo: el idioma por defecto se guarda en machine.json y vale (sin PHASE_GATE_LANG en el entorno del Studio)", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/equipo`);
  await page.getByLabel("Idioma por defecto del equipo").selectOption("en");
  await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
  await expect(previa(page).locator(".diff-mas").filter({ hasText: '"idiomaPorDefecto": "en"' })).toHaveCount(1);
  await previa(page).getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toBeVisible();
  expect(leerJson(maquinaDe(servidor)).idiomaPorDefecto).toBe("en");
  await expect(page.locator('[data-campo="idiomaPorDefecto"]')).toContainText("Ahora se usa English, de machine.json.");
});

test("este equipo: lo que dice el env de un cliente se enseña, y se quita de Cursor con su vista previa y sin perder lo demás", async ({ page, servidor }) => {
  // Cursor, registrado con el Studio; después, su env con otro idioma, otra Documentación y algo que no es de phase-gate.
  await page.goto(`${servidor.origen}/#/ajustes/clientes`);
  const cursor = page.getByRole("article", { name: "Cursor" });
  await cursor.getByRole("button", { name: "Configurar Cursor: vista previa" }).click();
  await cursor.getByRole("button", { name: "Aplicar" }).click();
  await expect(cursor.getByRole("status").filter({ hasText: "Hecho" })).toBeVisible();
  const archivo = path.join(servidor.falso.casa, ".cursor", "mcp.json");
  const mcp = leerJson(archivo);
  const entrada = mcp.mcpServers.pg;
  entrada.env = { ...(entrada.env ?? {}), PHASE_GATE_LANG: "es", PHASE_GATE_DOCS_PATH: path.join(servidor.arbol.raiz, "otra-docs"), OTRA: "se queda" };
  fs.writeFileSync(archivo, `${JSON.stringify(mcp, null, 2)}\n`, "utf-8");
  const maquina = leerJson(maquinaDe(servidor));
  expect(maquina.idiomaPorDefecto, "el idioma de la prueba anterior").toBe("en");

  await page.goto(`${servidor.origen}/#/ajustes/equipo`);
  const delCliente = page.getByRole("article", { name: "Cursor" });
  await expect(delCliente.locator(".indicador.ajustes-env-pisa").filter({ hasText: "PHASE_GATE_LANG = es" })).toHaveCount(1);
  await expect(delCliente.locator(".indicador.ajustes-env-pisa").filter({ hasText: "PHASE_GATE_DOCS_PATH" })).toHaveCount(1);
  await delCliente.getByRole("button", { name: "Quitarla de Cursor: vista previa" }).click();
  const region = delCliente.getByRole("region", { name: "Vista previa: Quitarla de Cursor" });
  await expect(region).toContainText("PHASE_GATE_LANG");
  await region.getByRole("button", { name: "Aplicar" }).click();
  await expect(delCliente.getByRole("status").filter({ hasText: "Hecho" })).toBeVisible();
  const despues = leerJson(archivo).mcpServers.pg.env;
  expect(despues.PHASE_GATE_LANG, "el idioma se quitó").toBeUndefined();
  expect(despues.OTRA, "lo demás se queda").toBe("se queda");
  expect(despues.PHASE_GATE_DOCS_PATH, "una Documentación distinta de la de machine.json se conserva, y se avisa").toBeDefined();
});

// ─── Cada proyecto: los cambios, juntos por archivo ─────────────────────────────────────────────────────
test("cambiar tres campos: se ve un solo diff y se aplica una sola vez; el menú cuenta los cambios y el disco cambia", async ({ page, servidor }) => {
  const hechas = aplicaciones(page);
  await abrirProyecto(page, servidor, "TALLER");
  await page.getByLabel("Preset", { exact: true }).selectOption("software-tdd");
  await page.getByLabel("Lotes", { exact: true }).selectOption({ label: "Sin lotes" });
  await page.getByLabel("Política de commits").selectOption("auto");
  await expect(cambiados(page)).toHaveCount(3);
  await expect(MENU(page).getByRole("link", { name: /^TALLER/ }).locator(".numero-de-cambios")).toContainText("3");
  await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
  await expect(previa(page)).toContainText("preset");
  await expect(previa(page).locator("pre.diff")).toHaveCount(1);
  await expect(previa(page).locator(".diff-mas").filter({ hasText: '"lotes": false' })).toHaveCount(1);
  await expect(previa(page).locator(".diff-mas").filter({ hasText: '"commits": "auto"' })).toHaveCount(1);
  await expect(previa(page).locator(".diff-mas").filter({ hasText: '"preset": "software-tdd"' })).toHaveCount(1);
  await previa(page).getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toContainText("TALLER actualizado");
  expect(hechas, "un solo Aplicar").toHaveLength(1);
  const manifiesto = leerJson(manifiestoDe(servidor, "TALLER"));
  expect(manifiesto.preset).toBe("software-tdd");
  expect(manifiesto.reglas).toEqual({ verificacion: ["npm test"], lotes: false, commits: "auto" });
  expect(fs.readdirSync(path.join(servidor.arbol.docs, "TALLER")).some((n) => n.startsWith("phase-gate.json.bak-"))).toBe(true);
  await expect(cambiados(page)).toHaveCount(0);
  await expect(MENU(page).getByRole("link", { name: /^TALLER/ }).locator(".numero-de-cambios")).toHaveCount(0);
  await expect(page.getByLabel("Preset", { exact: true })).toHaveValue("software-tdd");
});

test("agregar un repo con su ruta propia en esta computadora: dos diffs, cada uno con lo que es, y un solo Aplicar", async ({ page, servidor }) => {
  const hechas = aplicaciones(page);
  const propia = path.join(servidor.arbol.raiz, "otra-carpeta", "nuevo");
  await abrirProyecto(page, servidor, "TALLER");
  await page.getByLabel("Id del repo nuevo").fill("nuevo");
  await page.getByLabel("Carpeta del repo nuevo").fill("nuevo-dir");
  await page.getByLabel("Rol (opcional)").fill("extra");
  await page.getByLabel("En esta computadora está en otra carpeta (opcional)").fill(propia);
  await page.getByRole("button", { name: "Agregar a la lista" }).click();
  await expect(page.getByLabel("Carpeta de nuevo")).toHaveValue("nuevo-dir");
  await expect(page.getByLabel("Ruta propia de nuevo en esta computadora")).toHaveValue(propia);
  await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
  const region = previa(page);
  await expect(region.locator("pre.diff")).toHaveCount(2);
  await expect(region.getByText("Solo esta computadora")).toBeVisible();
  await expect(region.getByText("Viaja con la Documentación")).toBeVisible();
  await expect(region.getByLabel(/Cambios de Guardar los cambios en .*machine\.json/)).toBeVisible();
  await expect(region.getByLabel(/Cambios de Guardar los cambios en .*phase-gate\.json/)).toBeVisible();
  // Lo que el plan advierte y no impide: esa carpeta no existe en este equipo.
  await expect(region.getByRole("list", { name: "Avisos del plan" })).toContainText("no existe en este equipo");
  await region.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toContainText("TALLER actualizado");
  expect(hechas, "un solo Aplicar").toHaveLength(1);
  expect(leerJson(manifiestoDe(servidor, "TALLER")).repos).toEqual([{ id: "nuevo", dir: "nuevo-dir", rol: "extra" }]);
  const claves = leerJson(maquinaDe(servidor)).repos as Record<string, string>;
  expect(claves[Object.keys(claves).find((k) => k.toLowerCase() === "taller/nuevo")!]).toBe(path.resolve(propia));
});

test("reglas: la vista previa trae el diff del manifiesto, Aplicar, y el disco cambia", async ({ page, servidor }) => {
  await abrirProyecto(page, servidor, "TALLER");
  await expect(page.getByLabel("Lotes", { exact: true })).toHaveValue("no");
  await page.getByLabel("Lotes", { exact: true }).selectOption({ label: "Con lotes" });
  await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
  await expect(previa(page)).toContainText("reglas.lotes = true");
  await expect(previa(page).locator(".diff-mas").filter({ hasText: '"lotes": true' })).toHaveCount(1);
  await previa(page).getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toContainText("reglas.lotes = true");
  expect(leerJson(manifiestoDe(servidor, "TALLER")).reglas.lotes).toBe(true);
  await expect(page.getByLabel("Lotes", { exact: true })).toHaveValue("si");
});

test("el preset de un proyecto: su vista previa con el diff, y Cancelar no escribe nada", async ({ page, servidor }) => {
  const archivo = manifiestoDe(servidor, "TIENDA");
  const antes = fs.readFileSync(archivo, "utf-8");
  await abrirProyecto(page, servidor, "TIENDA");
  await page.getByLabel("Preset", { exact: true }).selectOption("software");
  await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
  await expect(previa(page).locator(".diff-menos").filter({ hasText: '"preset": "multi-repo-feature"' })).toHaveCount(1);
  await expect(previa(page).locator(".diff-mas").filter({ hasText: '"preset": "software"' })).toHaveCount(1);
  await previa(page).getByRole("button", { name: "Cancelar" }).click();
  await expect(previa(page)).toHaveCount(0);
  expect(fs.readFileSync(archivo, "utf-8")).toBe(antes);
  // El cambio sigue en el borrador, y Descartar lo quita.
  await expect(cambiados(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Descartar los cambios" }).click();
  await expect(cambiados(page)).toHaveCount(0);
  await expect(page.getByLabel("Preset", { exact: true })).toHaveValue("multi-repo-feature");
});

test("los comandos de verificación se escriben tecla a tecla: un espacio y una línea nueva no se pierden", async ({ page, servidor }) => {
  await abrirProyecto(page, servidor, "TIENDA");
  const campo = page.getByLabel("Comandos de verificación (uno por línea)");
  const antes = await campo.inputValue();
  await campo.focus();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await campo.pressSequentially("npm run lint ");
  await expect(campo).toHaveValue(`${antes}\nnpm run lint `);
  await expect(cambiados(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
  await expect(previa(page).locator(".diff-mas").filter({ hasText: '"npm run lint"' })).toHaveCount(1);
  await previa(page).getByRole("button", { name: "Cancelar" }).click();
  // Descartar devuelve el texto al del disco.
  await page.getByRole("button", { name: "Descartar los cambios" }).click();
  await expect(campo).toHaveValue(antes);
});

test("si el disco cambia entre la vista previa y Aplicar, 409: se dice, el borrador se conserva y se puede volver a ver el cambio", async ({ page, servidor, registro }) => {
  registro.permitidos.push(/the server responded with a status of 409/);
  // Sin SSE, la página no se entera del cambio: lo único que la protege es la huella.
  await page.route("**/api/eventos*", () => {});
  await abrirProyecto(page, servidor, "TALLER");
  await page.getByLabel("Idioma del proyecto").selectOption("en");
  await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
  await expect(previa(page)).toContainText("idioma");
  const archivo = manifiestoDe(servidor, "TALLER");
  fs.writeFileSync(archivo, `${JSON.stringify({ ...leerJson(archivo), fase5: { prPorRepo: true } }, null, 2)}\n`, "utf-8");
  await previa(page).getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "El disco cambió desde que viste el cambio." })).toContainText("Revísalo otra vez.");
  expect(leerJson(archivo).idioma, "no se escribió").toBeUndefined();
  // El borrador sigue ahí.
  await expect(page.getByLabel("Idioma del proyecto")).toHaveValue("en");
  await expect(cambiados(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Ver el cambio otra vez" }).click();
  await expect(previa(page)).toContainText("prPorRepo");
  await previa(page).getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toBeVisible();
  expect(leerJson(archivo).idioma).toBe("en");
  expect(leerJson(archivo).fase5).toEqual({ prPorRepo: true });
});

test("un campo que cambió en el disco y también está en el borrador se marca en conflicto: ni se pisa ni se descarta en silencio", async ({ page, servidor }) => {
  const archivo = manifiestoDe(servidor, "TALLER");
  const ponerEnElDisco = (commits: string) => fs.writeFileSync(archivo, `${JSON.stringify({ ...leerJson(archivo), reglas: { ...leerJson(archivo).reglas, commits } }, null, 2)}\n`, "utf-8");
  // El disco no se toca hasta que el SSE esté conectado: un cambio anterior a la conexión no llega a la página.
  const conectado = page.waitForResponse((respuesta) => respuesta.url().includes("/api/eventos"));
  await abrirProyecto(page, servidor, "TALLER");
  await conectado;
  await page.getByLabel("Política de commits").selectOption("agente-propone");
  await expect(cambiados(page)).toHaveCount(1);
  ponerEnElDisco("ninguno");
  const conflicto = page.getByRole("group", { name: "En conflicto" });
  await expect(conflicto).toContainText("ahora dice ninguno", { timeout: 15_000 });
  await expect(page.getByText("El archivo cambió en el disco mientras editabas.")).toBeVisible();
  // Me quedo con el mío: el campo sigue cambiado y deja de estar en conflicto.
  await conflicto.getByRole("button", { name: "Quedarme con el mío" }).click();
  await expect(conflicto).toHaveCount(0);
  await expect(page.getByLabel("Política de commits")).toHaveValue("agente-propone");
  await expect(cambiados(page)).toHaveCount(1);
  // Otro cambio en el disco, y ahora uso el del disco: el borrador de ese campo se va.
  ponerEnElDisco("auto");
  await expect(conflicto).toContainText("ahora dice auto", { timeout: 15_000 });
  await conflicto.getByRole("button", { name: "Usar el del disco" }).click();
  await expect(page.getByLabel("Política de commits")).toHaveValue("auto");
  await expect(cambiados(page)).toHaveCount(0);
});

test("salir de una página con cambios sin aplicar pide confirmación: si se cancela, la persona se queda con su borrador", async ({ page, servidor }) => {
  const mensajes: string[] = [];
  let aceptar = false;
  page.on("dialog", (d) => {
    mensajes.push(d.message());
    void (aceptar ? d.accept() : d.dismiss());
  });
  await abrirProyecto(page, servidor, "TIENDA");
  await page.getByLabel("Idioma del proyecto").selectOption("en");
  await expect(cambiados(page)).toHaveCount(1);
  const historial = await page.evaluate(() => history.length);
  await MENU(page).getByRole("link", { name: "Clientes MCP" }).click();
  await expect.poll(() => mensajes.length).toBe(1);
  expect(mensajes[0]).toContain("cambios sin aplicar");
  await expect(page).toHaveURL(/#\/ajustes\/proyecto\/TIENDA$/);
  // Quedarse no deja una entrada de más: «Atrás» no vuelve a preguntar por la misma página.
  expect(await page.evaluate(() => history.length)).toBe(historial + 1);
  await expect(page.getByLabel("Idioma del proyecto")).toHaveValue("en");
  await expect(cambiados(page)).toHaveCount(1);
  // Cambiar a otra vista, también.
  await page.getByRole("navigation", { name: "Vistas" }).getByRole("link", { name: "Red" }).click();
  await expect.poll(() => mensajes.length).toBe(2);
  await expect(page).toHaveURL(/#\/ajustes\/proyecto\/TIENDA$/);
  // Aceptando, se va y el borrador se pierde.
  aceptar = true;
  await MENU(page).getByRole("link", { name: "Clientes MCP" }).click();
  // Hasta que se haya respondido el diálogo no se toca la página: la confirmación es lo que decide si se va.
  await expect.poll(() => mensajes.length).toBe(3);
  await expect(page).toHaveURL(/#\/ajustes\/clientes$/);
  await expect(MENU(page).getByRole("link", { name: "Clientes MCP" })).toHaveAttribute("aria-current", "page");
  await abrirProyecto(page, servidor, "TIENDA");
  await expect(cambiados(page)).toHaveCount(0);
  await expect(page.getByLabel("Idioma del proyecto")).toHaveValue("");
});

test("un proyecto sin phase-gate.json se crea desde su página, con su vista previa", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/proyecto/NUEVO`);
  await expect(page.getByText("Este proyecto no tiene phase-gate.json todavía.")).toBeVisible();
  await page.getByLabel("Preset del phase-gate.json nuevo").selectOption("research-ops");
  await page.getByRole("button", { name: "Crear phase-gate.json: vista previa" }).click();
  const region = page.getByRole("region", { name: "Vista previa: Crear phase-gate.json" });
  await expect(region).toContainText("Crea");
  await expect(region.locator(".diff-mas").filter({ hasText: '"preset": "research-ops"' })).toHaveCount(1);
  await region.getByRole("button", { name: "Aplicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toBeVisible();
  expect(leerJson(manifiestoDe(servidor, "NUEVO")).preset).toBe("research-ops");
  // Ya tiene manifiesto: la página pasa a editarlo.
  await expect(page.getByLabel("Preset", { exact: true })).toHaveValue("research-ops");
  await expect(page.getByRole("link", { name: "NUEVO", exact: true })).toBeVisible();
});

// ─── Clientes MCP y lo avanzado (lo que estaba en el Vigía) ─────────────────────────────────────────────
test("el asistente de clientes: una tarjeta por cliente con el comando o el diff de su mcp.json", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/clientes`);
  const claude = page.getByRole("article", { name: "Claude Code" });
  await expect(claude).toContainText("detectado en este equipo");
  await expect(claude.locator("code").filter({ hasText: "claude mcp add pg --scope user" })).toBeVisible();
  const vscode = page.getByRole("article", { name: "VS Code" });
  await expect(vscode).toContainText("no detectado");
  await expect(vscode.getByLabel("Lo que cambiaría en VS Code").locator(".diff-mas").first()).toBeVisible();
  await expect(vscode.getByLabel(/Copiar también los comandos/)).toHaveCount(0);
  // Solo lee: claude --version y claude mcp list.
  expect(servidor.falso.llamadas().every((l) => l === "--version" || l === "mcp list")).toBe(true);
});

test("Aplicar en VS Code escribe en el HOME falso con su vista previa, y la tarjeta queda sin cambios", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/clientes`);
  const vscode = page.getByRole("article", { name: "VS Code" });
  await vscode.getByRole("button", { name: "Configurar VS Code: vista previa" }).click();
  const region = vscode.getByRole("region", { name: "Vista previa: Configurar VS Code" });
  await expect(region).toContainText("mcp.json");
  await region.getByRole("button", { name: "Aplicar" }).click();
  await expect(vscode.getByRole("status").filter({ hasText: "Hecho" })).toContainText("VS Code: registrado como «pg».");
  await expect(vscode).toContainText("Sin cambios", { timeout: 15_000 });
});

test("Aplicar en Cursor, con los comandos de fase, escribe en el HOME falso: el mcp.json ya no lleva las rutas", async ({ page, servidor }) => {
  const archivo = path.join(servidor.falso.casa, ".cursor", "mcp.json");
  fs.rmSync(archivo, { force: true });
  fs.rmSync(path.join(servidor.falso.casa, ".cursor", "commands"), { recursive: true, force: true });
  await page.goto(`${servidor.origen}/#/ajustes/clientes`);
  const cursor = page.getByRole("article", { name: "Cursor" });
  await expect(cursor).toContainText("~/.cursor/mcp.json");
  await cursor.getByLabel(/Copiar también los comandos/).check();
  await cursor.getByRole("button", { name: "Configurar Cursor: vista previa" }).click();
  const region = cursor.getByRole("region", { name: "Vista previa: Configurar Cursor" });
  await expect(region).toContainText("~/.cursor/mcp.json");
  await expect(region).toContainText("~/.cursor/commands/f1.md");
  await region.getByRole("button", { name: "Aplicar" }).click();
  await expect(cursor.getByRole("status").filter({ hasText: "Hecho" })).toContainText("Cursor: registrado como «pg».");
  const mcp = leerJson(archivo);
  expect(mcp.mcpServers.pg.env?.PHASE_GATE_DOCS_PATH).toBeUndefined();
  expect(leerJson(maquinaDe(servidor)).rutas.documentacion).toBe(servidor.arbol.docs);
  expect(fs.existsSync(path.join(servidor.falso.casa, ".cursor", "commands", "f4.md"))).toBe(true);
  await expect(cursor).toContainText("Sin cambios", { timeout: 15_000 });
});

test("Aplicar en Claude Code ejecuta el claude de mentira, no el de verdad", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/clientes`);
  const claude = page.getByRole("article", { name: "Claude Code" });
  await claude.getByRole("button", { name: "Configurar Claude Code: vista previa" }).click();
  const region = claude.getByRole("region", { name: "Vista previa: Configurar Claude Code" });
  await expect(region.locator(".diff-comando")).toContainText("$ claude mcp add pg --scope user");
  await region.getByRole("button", { name: "Aplicar" }).click();
  await expect(claude.getByRole("status").filter({ hasText: "Hecho" })).toContainText("Registrado en Claude Code");
  expect(servidor.falso.llamadas().some((l) => l.startsWith("mcp add pg --scope user"))).toBe(true);
});

test("las variables avanzadas: su valor, de dónde sale y cómo cambiarlas, sin editarse", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/avanzado`);
  const tabla = page.getByRole("table", { name: "Variables avanzadas" });
  await expect(tabla.getByRole("row")).toHaveCount(6);
  const estado = tabla.getByRole("row", { name: /PHASE_GATE_STATE_PATH/ });
  await expect(estado).toContainText(servidor.arbol.estado);
  await expect(estado).toContainText("entorno");
  await expect(estado).toContainText("No se edita desde Ajustes.");
  await expect(tabla.getByRole("row", { name: /PHASE_GATE_PROMPTS_PATH/ })).toContainText("sin definir");
  await expect(tabla.getByRole("textbox")).toHaveCount(0);
  await sinViolacionesGraves(page, "Avanzado");
});

// ─── Studio ─────────────────────────────────────────────────────────────────────────────────────────────
test("Studio: el tema se aplica al momento, Sistema borra la elección guardada y el botón de la barra queda como atajo", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/studio`);
  const tema = page.getByRole("group", { name: "Tema" });
  const guardado = () => page.evaluate(() => window.localStorage.getItem("pg-tema"));
  await tema.getByRole("radio", { name: "Oscuro" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "oscuro");
  expect(await guardado()).toBe("oscuro");
  await tema.getByRole("radio", { name: "Claro" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
  // El botón de la barra cambia la elección, y el selector lo refleja.
  await page.getByRole("button", { name: "Tema oscuro" }).click();
  await expect(tema.getByRole("radio", { name: "Oscuro" })).toBeChecked();
  await tema.getByRole("radio", { name: "Sistema" }).check();
  await expect(page.locator("html")).not.toHaveAttribute("data-tema", /.+/);
  expect(await guardado()).toBeNull();
  // Sin escribir nada en el disco: no hay vista previa ni Aplicar.
  await expect(page.getByRole("button", { name: /vista previa/ })).toHaveCount(0);
});

test("Studio: el idioma de la interfaz cambia sin recargar y la barra superior sigue de acuerdo", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/studio`);
  await page.getByRole("group", { name: "Idioma de la interfaz" }).getByRole("radio", { name: "English" }).check();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Language" }).getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "ES" }).click();
  await expect(page.getByRole("group", { name: "Interface language" }).or(page.getByRole("group", { name: "Idioma de la interfaz" }))).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

// ─── Los esquemas publicados ────────────────────────────────────────────────────────────────────────────
// Cada clave editable de schema/project.json y de schema/machine.json (sin $schema ni version) tiene su control
// en Ajustes. Si el esquema gana una clave y esta tabla no, la prueba falla; y cada control tiene que estar.
type Esquema = { properties?: Record<string, Esquema>; additionalProperties?: unknown };
function clavesEditables(esquema: Esquema, prefijo = ""): string[] {
  const propiedades = Object.entries(esquema.properties ?? {}).filter(([k]) => prefijo !== "" || (k !== "$schema" && k !== "version"));
  return propiedades.flatMap(([k, hijo]) => (hijo.properties ? clavesEditables(hijo, `${prefijo}${k}.`) : [`${prefijo}${k}`]));
}
const esquemaDe = (archivo: string): Esquema => JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "schema", archivo), "utf-8")) as Esquema;

const CONTROLES_DE_PROYECTO: Record<string, (p: Page) => ReturnType<Page["locator"]>> = {
  preset: (p) => p.getByLabel("Preset", { exact: true }),
  idioma: (p) => p.getByLabel("Idioma del proyecto"),
  repos: (p) => p.getByRole("table", { name: "Repos del proyecto" }),
  "reglas.lotes": (p) => p.getByLabel("Lotes", { exact: true }),
  "reglas.commits": (p) => p.getByLabel("Política de commits"),
  "reglas.verificacion": (p) => p.getByLabel("Comandos de verificación (uno por línea)"),
  "fase5.prPorRepo": (p) => p.getByLabel("Un PR por repo"),
};
const CONTROLES_DE_MAQUINA: Record<string, (p: Page) => ReturnType<Page["locator"]>> = {
  "rutas.documentacion": (p) => p.getByLabel("Carpeta de la Documentación"),
  "rutas.carpetaDeRepos": (p) => p.getByLabel("Carpeta de los repos"),
  "rutas.subcarpetaTareas": (p) => p.getByLabel("Subcarpeta de las tareas", { exact: true }),
  idiomaPorDefecto: (p) => p.getByLabel("Idioma por defecto del equipo"),
  presetPorDefecto: (p) => p.getByLabel("Preset para los proyectos sin phase-gate.json"),
  // La ruta propia de cada repo vive en la página del proyecto (junto a su carpeta).
  repos: (p) => p.getByRole("table", { name: "Repos del proyecto" }).getByRole("columnheader", { name: "En esta computadora" }),
};

test("cada clave editable de project.json y de machine.json tiene su control en Ajustes", async ({ page, servidor }) => {
  const deProyecto = clavesEditables(esquemaDe("project.json"));
  const deMaquina = clavesEditables(esquemaDe("machine.json"));
  expect(deProyecto.sort(), "las claves de project.json y la tabla de controles").toEqual(Object.keys(CONTROLES_DE_PROYECTO).sort());
  expect(deMaquina.sort(), "las claves de machine.json y la tabla de controles").toEqual(Object.keys(CONTROLES_DE_MAQUINA).sort());
  await page.goto(`${servidor.origen}/#/ajustes/proyecto/TIENDA`);
  await expect(page.getByRole("heading", { level: 2, name: "Proyecto TIENDA" })).toBeVisible();
  for (const clave of deProyecto) await expect(CONTROLES_DE_PROYECTO[clave]!(page), `project.json: ${clave}`).toBeVisible();
  await page.goto(`${servidor.origen}/#/ajustes/equipo`);
  await expect(page.getByRole("heading", { level: 2, name: "Este equipo" })).toBeVisible();
  for (const clave of deMaquina.filter((c) => c !== "repos")) await expect(CONTROLES_DE_MAQUINA[clave]!(page), `machine.json: ${clave}`).toBeVisible();
  await page.goto(`${servidor.origen}/#/ajustes/proyecto/TIENDA`);
  await expect(CONTROLES_DE_MAQUINA["repos"]!(page), "machine.json: repos (la ruta propia de cada repo)").toBeVisible();
});

// ─── El primer arranque ─────────────────────────────────────────────────────────────────────────────────
async function paginaDeUi(browser: Browser, s: Servidor): Promise<Page> {
  const contexto = await browser.newContext({ locale: "es-ES" });
  await contexto.addCookies([{ ...s.cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict", secure: false }]);
  return contexto.newPage();
}

test("el primer arranque: sin rutas, Ajustes pide la Documentación; se escribe, la Red la lee sin reiniciar y un documento nuevo llega en vivo", async ({ browser }) => {
  const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-primero-"));
  const [docs, repos, estado, config] = ["mi-documentacion", "mis-repos", "estado", "config"].map((n) => path.join(raiz, n)) as [string, string, string, string];
  for (const c of [docs, repos, estado, config]) fs.mkdirSync(c);
  const contexto = (proyecto: string) => {
    const carpeta = path.join(docs, proyecto, "Proyectos", "primera");
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, "00 - Contexto Inicial.md"), "# Primera\n", "utf-8");
  };
  contexto("MIO");
  // Un Studio sin PHASE_GATE_DOCS_PATH ni PHASE_GATE_REPOS_PATH: solo dónde guarda su estado y su configuración.
  const arbol: Arbol = { raiz, docs, repos, estado, config, env: { PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config } };
  const { hijo, servidor } = await lanzarUi(arbol);
  const page = await paginaDeUi(browser, servidor);
  try {
    await page.goto(`${servidor.origen}/`);
    await expect(page).toHaveURL(/#\/ajustes\/equipo$/);
    await expect(page.getByRole("heading", { level: 2, name: "Dime dónde está tu Documentación" })).toBeVisible();
    await expect(page.getByLabel("Carpeta de la Documentación")).toBeFocused();
    await page.getByLabel("Carpeta de la Documentación").fill(docs);
    await page.getByLabel("Carpeta de los repos").fill(repos);
    await page.getByRole("button", { name: "Guardar los cambios: vista previa" }).click();
    await expect(previa(page).locator(".diff-mas").filter({ hasText: '"documentacion"' })).toHaveCount(1);
    await previa(page).getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Hecho" })).toBeVisible();
    expect(leerJson(path.join(config, "machine.json")).rutas).toEqual({ documentacion: docs, carpetaDeRepos: repos });

    // La Red lee las rutas nuevas sin reiniciar el Studio.
    await page.getByRole("navigation", { name: "Vistas" }).getByRole("link", { name: "Red" }).click();
    await expect(page.getByRole("article", { name: "MIO" })).toBeVisible();
    await page.evaluate(() => ((window as unknown as { __sinRecargar: boolean }).__sinRecargar = true));
    // Y vigila la carpeta nueva: un proyecto que aparece en ella llega solo.
    contexto("OTRO");
    await expect(page.getByRole("article", { name: "OTRO" })).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => (window as unknown as { __sinRecargar?: boolean }).__sinRecargar)).toBe(true);
  } finally {
    await page.context().close();
    hijo.kill();
    await new Promise((r) => (hijo.exitCode !== null ? r(null) : hijo.on("exit", r)));
    fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
  }
});
