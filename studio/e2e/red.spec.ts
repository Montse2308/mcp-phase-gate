// La Red en Chromium real: una fila por proyecto, en una lista que se despliega, con la misma estructura en
// los dos modos. Plegada dice el nombre, el preset (con el aviso de un manifiesto inválido o de un error de
// configuración), el git y el rol de cada repo, la tarea activa y la sesión; desplegada, además, el
// manifiesto, las reglas y las acciones.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { Page } from "@playwright/test";

import { expect, ningunEstadoSoloColor, ponerModo, sinDesbordamiento, sinViolacionesGraves, test } from "./ayudas";

const fila = (page: Page, nombre: string) => page.getByRole("article", { name: nombre });
// El nombre de cada proyecto va en un h2 que envuelve el botón que despliega su fila.
const desplegar = (page: Page, nombre: string) => fila(page, nombre).getByRole("heading", { level: 2, name: nombre }).getByRole("button");

// Cambia en el navegador la respuesta de /api/proyectos: el servidor no llega a algunos estados con los fixtures.
type Proyecto = { nombre: string; repos: Record<string, unknown>[] } & Record<string, unknown>;
async function cambiarProyectos(page: Page, cambiar: (datos: { proyectos: Proyecto[]; error: string | null }) => void): Promise<void> {
  await page.route("**/api/proyectos", async (route) => {
    const respuesta = await route.fetch();
    const datos = await respuesta.json();
    cambiar(datos);
    await route.fulfill({ response: respuesta, json: datos });
  });
}

test("plegada: cada fila dice el nombre, el preset, el git y el rol de cada repo con su forma, la tarea activa, la sesión y el aviso del manifiesto inválido", async ({ page, servidor, registro }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await expect(page.getByRole("heading", { level: 1, name: "Red de proyectos" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Proyectos de la Documentación" }).getByRole("article")).toHaveCount(5);
  const tienda = fila(page, "TIENDA");
  await expect(desplegar(page, "TIENDA")).toHaveAttribute("aria-expanded", "false");
  await expect(tienda.locator(".campo-preset dd")).toHaveText("multi-repo-feature · del proyecto");
  const api = tienda.getByRole("listitem").filter({ hasText: "api" });
  await expect(api).toHaveText("api (backend) · rama main · árbol limpio");
  await expect(api.locator("svg.marca-lleno")).toHaveCount(1);
  const web = tienda.getByRole("listitem").filter({ hasText: "web" });
  await expect(web).toHaveText("web · sin git");
  await expect(web.locator("svg.marca-raya")).toHaveCount(1);
  const tarea = tienda.locator(".campo-tarea dd");
  await expect(tarea).toContainText("cupones");
  await expect(tarea).toContainText("lote 2 de 2, commit pendiente");
  await expect(tarea).not.toContainText("deducida");
  await expect(tarea.getByRole("link", { name: "Abrir tablero" })).toBeVisible();
  await expect(tienda.locator(".campo-sesion dd")).toHaveText("Abierto en cliente-e2e 1.0");
  await expect(tienda.locator(".campo-sesion svg.marca-lleno")).toHaveCount(1);
  // Lo de la fila desplegada no se ve.
  await expect(tienda.locator(".campo-manifiesto")).toBeHidden();
  await expect(tienda.getByRole("button", { name: "Cambiar el preset: vista previa" })).toBeHidden();
  await expect(tienda.locator(".alerta-proyecto")).toHaveCount(0);

  const investigacion = fila(page, "INVESTIGACION");
  await expect(investigacion.locator(".campo-tarea dd")).toContainText("costos (deducida, la más reciente)");
  await expect(investigacion.locator(".campo-repos dd")).toHaveText("Sin repos declarados.");
  await expect(investigacion.locator(".campo-sesion dd")).toHaveText("Ninguna sesión MCP lo tiene abierto");
  await expect(investigacion.locator(".campo-sesion svg.marca-vacio")).toHaveCount(1);
  const roto = fila(page, "ROTO");
  await expect(roto.locator(".campo-tarea dd")).toHaveText("Sin tareas todavía.");
  // El manifiesto inválido se ve sin desplegar, con su forma.
  await expect(roto.locator(".campo-preset .alerta-proyecto")).toHaveText("phase-gate.json inválido");
  await expect(roto.locator(".campo-preset .alerta-proyecto svg.marca-rombo")).toHaveCount(1);
  for (const modo of ["cabina", "sobrio"] as const) {
    await ponerModo(page, modo);
    await ningunEstadoSoloColor(page);
    await sinViolacionesGraves(page, `la Red plegada en modo ${modo}`);
  }
  test.info().annotations.push({ type: "peticiones", description: `${registro.peticiones.length}: ${registro.peticiones.map((u) => new URL(u).pathname).join(" ")}` });
});

test("desplegada: el manifiesto con su forma y su error, las reglas, el rol de cada repo y las acciones", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  const datos: { proyectos: { nombre: string; reglas: { lotes: boolean; commits: string } | null }[] } = await page.evaluate(() => fetch("./api/proyectos").then((r) => r.json()));
  const reglas = datos.proyectos.find((p) => p.nombre === "TIENDA")!.reglas!;
  const tienda = fila(page, "TIENDA");
  await desplegar(page, "TIENDA").click();
  await expect(desplegar(page, "TIENDA")).toHaveAttribute("aria-expanded", "true");
  await expect(tienda.locator(".campo-manifiesto dd")).toBeVisible();
  await expect(tienda.locator(".campo-manifiesto dd")).toHaveText("phase-gate.json válido");
  await expect(tienda.locator(".campo-manifiesto svg.marca-lleno")).toHaveCount(1);
  await expect(tienda.locator(".campo-reglas dd")).toHaveText(`Lotes: ${reglas.lotes ? "sí" : "no"} · Commits: ${reglas.commits}`);
  await expect(tienda.getByRole("listitem").filter({ hasText: "api" })).toHaveText("api (backend) · rama main · árbol limpio");
  await expect(tienda.getByLabel("Preset", { exact: true })).toBeVisible();
  await expect(tienda.getByRole("button", { name: "Cambiar el preset: vista previa" })).toBeVisible();
  await expect(desplegar(page, "ROTO")).toHaveAttribute("aria-expanded", "false");

  const roto = fila(page, "ROTO");
  await desplegar(page, "ROTO").click();
  await expect(roto.locator(".campo-manifiesto dd")).toContainText("phase-gate.json inválido");
  await expect(roto.locator(".campo-manifiesto svg.marca-rombo")).toHaveCount(1);
  await expect(roto.locator(".detalle-error")).toContainText("no es un JSON válido");
  await expect(roto.getByRole("combobox")).toHaveCount(0); // con el manifiesto inválido no hay acciones

  const investigacion = fila(page, "INVESTIGACION");
  await desplegar(page, "INVESTIGACION").click();
  await expect(investigacion.locator(".campo-manifiesto dd")).toHaveText("sin phase-gate.json");
  await expect(investigacion.locator(".campo-manifiesto svg.marca-vacio")).toHaveCount(1);
  await expect(investigacion.getByRole("button", { name: "Crear phase-gate.json: vista previa" })).toBeVisible();
  await ningunEstadoSoloColor(page);
  await sinViolacionesGraves(page, "la Red con filas desplegadas");

  await desplegar(page, "TIENDA").click();
  await expect(desplegar(page, "TIENDA")).toHaveAttribute("aria-expanded", "false");
  await expect(tienda.locator(".campo-manifiesto")).toBeHidden();
});

test("los estados que el árbol de prueba no tiene: cada forma de repo, el error de configuración y las tareas sin activa", async ({ page, servidor }) => {
  // La respuesta de la API, cambiada en el navegador: el servidor no llega a estos estados con los fixtures.
  await page.route("**/api/proyectos", async (route) => {
    const respuesta = await route.fetch();
    const datos = await respuesta.json();
    const tienda = datos.proyectos.find((p: { nombre: string }) => p.nombre === "TIENDA");
    const base = tienda.repos[0];
    tienda.repos = [
      { ...base, id: "perdido", existe: false },
      { ...base, id: "lento", respondio: false },
      { ...base, id: "raro", error: "fatal: algo raro" },
      { ...base, id: "sucio", limpio: false, cambios: 2, sinSeguimiento: 1, adelante: 1, atras: 2 },
      { ...base, id: "suelto", separado: true, head: "abc1234" },
    ];
    tienda.activa = null;
    tienda.tareas = 3;
    tienda.errorDeConfiguracion = "la configuración de prueba no se pudo leer";
    await route.fulfill({ response: respuesta, json: datos });
  });
  await page.goto(`${servidor.origen}/#/red`);
  const tienda = fila(page, "TIENDA");
  const casos = [
    ["perdido", "rombo", "perdido (backend) · no existe en este equipo"],
    ["lento", "triangulo", "lento (backend) · git no respondió a tiempo"],
    ["raro", "triangulo", "raro (backend) · fatal: algo raro"],
    ["sucio", "anillo", "sucio (backend) · rama main · 3 cambios sin commit · 1 adelante, 2 atrás"],
    ["suelto", "lleno", "suelto (backend) · separado en abc1234 · árbol limpio"],
  ] as const;
  for (const [id, forma, texto] of casos) {
    const repo = tienda.getByRole("listitem").filter({ hasText: id });
    await expect(repo, id).toHaveText(texto);
    await expect(repo.locator(`svg.marca-${forma}`), id).toHaveCount(1);
  }
  await expect(tienda.locator(".campo-tarea dd")).toHaveText("3 tareas, ninguna activa.");
  await expect(tienda.getByRole("link", { name: "Abrir tablero" })).toHaveCount(0);
  // Plegada, el error de configuración se avisa junto al preset; desplegada, dice cuál es.
  await expect(tienda.locator(".campo-preset .alerta-proyecto")).toHaveText("la configuración tiene un error");
  await expect(tienda.locator(".campo-preset .alerta-proyecto svg.marca-triangulo")).toHaveCount(1);
  await desplegar(page, "TIENDA").click();
  await expect(tienda.locator(".campo-manifiesto .detalle-error")).toHaveText("la configuración de prueba no se pudo leer");
  await ningunEstadoSoloColor(page);
});

test("con muchos repos, la fila plegada dice cuántos hay en cada estado y la lista completa va al detalle", async ({ page, servidor }) => {
  await cambiarProyectos(page, (datos) => {
    const tienda = datos.proyectos.find((p) => p.nombre === "TIENDA")!;
    const base = tienda.repos[0]!;
    const limpios = Array.from({ length: 6 }, (_, i) => ({ ...base, id: `limpio-${i}`, rol: `rol-${i}` }));
    tienda.repos = [...limpios, { ...base, id: "sucio", limpio: false, cambios: 1 }, { ...base, id: "perdido", existe: false }];
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/red`);
  const tienda = fila(page, "TIENDA");
  const resumen = tienda.getByRole("list", { name: "Resumen de los repositorios de TIENDA" });
  await expect(tienda.locator(".campo-repos dd")).toContainText("8 repos");
  // De más grave a menos, cada estado con su forma.
  await expect(resumen.getByRole("listitem")).toHaveText(["1 no existe", "1 con cambios", "6 limpios"]);
  await expect(resumen.getByRole("listitem").nth(0).locator("svg.marca-rombo")).toHaveCount(1);
  await expect(resumen.getByRole("listitem").nth(1).locator("svg.marca-anillo")).toHaveCount(1);
  await expect(resumen.getByRole("listitem").nth(2).locator("svg.marca-lleno")).toHaveCount(1);
  const lista = tienda.getByRole("list", { name: "Repositorios de TIENDA", exact: true });
  await expect(lista).toBeHidden();
  await desplegar(page, "TIENDA").click();
  await expect(lista.getByRole("listitem")).toHaveCount(8);
  await expect(lista.getByRole("listitem").filter({ hasText: "limpio-0" })).toHaveText("limpio-0 (rol-0) · rama main · árbol limpio");
  await ningunEstadoSoloColor(page);
  await sinDesbordamiento(page, "la Red con muchos repos");
  await sinViolacionesGraves(page, "la Red con muchos repos");
});

test("dos proyectos cuyo nombre solo difiere en un espacio o un acento: cada fila con sus ids, su nombre y su detalle", async ({ page, servidor }) => {
  await cambiarProyectos(page, (datos) => {
    const tienda = datos.proyectos.find((p) => p.nombre === "TIENDA")!;
    datos.proyectos.push({ ...tienda, nombre: "mi proyecto" }, { ...tienda, nombre: "mi_proyecto" }, { ...tienda, nombre: "Diseño" }, { ...tienda, nombre: "Dise_o" });
  });
  await page.goto(`${servidor.origen}/#/red`);
  await expect(page.getByRole("article")).toHaveCount(9);
  const ids = await page.evaluate(() => [...document.querySelectorAll("[id]")].map((e) => e.id));
  expect(ids.filter((id, i) => ids.indexOf(id) !== i), "ids repetidos").toEqual([]);
  for (const nombre of ["mi proyecto", "mi_proyecto", "Diseño", "Dise_o"]) {
    await expect(fila(page, nombre), nombre).toHaveCount(1);
    await desplegar(page, nombre).click();
    const controla = await desplegar(page, nombre).getAttribute("aria-controls");
    await expect(fila(page, nombre).locator(`[id="${controla}"]`), nombre).toBeVisible();
    await expect(fila(page, nombre).getByLabel("Preset", { exact: true }), nombre).toBeVisible();
  }
});

test("sin proyectos, o con un error de la API: el aviso, y ninguna lista", async ({ page, servidor }) => {
  let error: string | null = null;
  await cambiarProyectos(page, (datos) => {
    datos.proyectos = [];
    datos.error = error;
  });
  await page.goto(`${servidor.origen}/#/red`);
  await expect(page.getByText("No hay proyectos en la Documentación todavía.")).toBeVisible();
  await expect(page.locator("ul.proyectos")).toHaveCount(0);
  for (const modo of ["cabina", "sobrio"] as const) {
    await ponerModo(page, modo);
    await sinViolacionesGraves(page, `la Red vacía en modo ${modo}`);
  }
  error = "no se pudo leer la Documentación de prueba";
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText("no se pudo leer la Documentación de prueba");
  await expect(page.getByText("No hay proyectos en la Documentación todavía.")).toHaveCount(0);
  await expect(page.locator("ul.proyectos")).toHaveCount(0);
});

test("la fila desplegada sigue desplegada al ir a otra vista y volver", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await desplegar(page, "TALLER").click();
  await expect(desplegar(page, "TALLER")).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Tablero", exact: true }).click();
  await expect(page).toHaveURL(/#\/tablero$/);
  await page.getByRole("link", { name: "Red", exact: true }).click();
  await expect(desplegar(page, "TALLER")).toHaveAttribute("aria-expanded", "true");
  await expect(fila(page, "TALLER").locator(".campo-manifiesto dd")).toBeVisible();
  await expect(desplegar(page, "TIENDA")).toHaveAttribute("aria-expanded", "false");
  // Plegarla también se recuerda.
  await desplegar(page, "TALLER").click();
  await page.getByRole("link", { name: "Tablero", exact: true }).click();
  await page.getByRole("link", { name: "Red", exact: true }).click();
  await expect(desplegar(page, "TALLER")).toHaveAttribute("aria-expanded", "false");
});

test("Cabina y Sobrio pintan la misma lista, con una fila desplegada: solo cambian los colores; el modo se recuerda al recargar", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await ponerModo(page, "cabina");
  await desplegar(page, "TIENDA").click();
  await expect(fila(page, "TIENDA").locator(".campo-manifiesto dd")).toBeVisible();
  const lista = page.getByRole("list", { name: "Proyectos de la Documentación" });
  const enCabina = await page.locator("main").innerHTML();
  const fondoEnCabina = await fila(page, "TIENDA").evaluate((e) => getComputedStyle(e).backgroundColor);
  await ponerModo(page, "sobrio");
  expect(await page.locator("main").innerHTML(), "el mismo DOM en los dos modos").toBe(enCabina);
  expect(await fila(page, "TIENDA").evaluate((e) => getComputedStyle(e).backgroundColor), "otros colores").not.toBe(fondoEnCabina);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-modo", "sobrio");
  await expect(lista.getByRole("article")).toHaveCount(5);
});

test("#?sobrio=1 comparte el modo por la URL, y sobrio=0 lo devuelve a cabina", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red?sobrio=1`);
  await expect(page.locator("html")).toHaveAttribute("data-modo", "sobrio");
  await page.goto(`${servidor.origen}/#/red?sobrio=0`);
  await expect(page.locator("html")).toHaveAttribute("data-modo", "cabina");
});

test("en un teléfono (390×844), plegada y desplegada, los campos se apilan y no hay desbordamiento horizontal en ningún modo", async ({ page, servidor }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${servidor.origen}/#/red`);
  // Se mide con los datos ya pintados, no solo con el título.
  await expect(fila(page, "TIENDA").locator(".campo-sesion dd")).toBeVisible();
  const izquierdas = await fila(page, "TIENDA").locator(".fila-resumen .campo").evaluateAll((campos) => campos.map((c) => Math.round(c.getBoundingClientRect().left)));
  expect(new Set(izquierdas).size, "los cuatro campos, uno debajo de otro").toBe(1);
  for (const modo of ["cabina", "sobrio"] as const) {
    await ponerModo(page, modo);
    await sinDesbordamiento(page, `la Red plegada en ${modo}`);
  }
  for (const nombre of ["TIENDA", "ROTO"]) await desplegar(page, nombre).click();
  await expect(fila(page, "ROTO").locator(".detalle-error")).toBeVisible();
  for (const modo of ["cabina", "sobrio"] as const) {
    await ponerModo(page, modo);
    await sinDesbordamiento(page, `la Red desplegada en ${modo}`);
  }
  await page.setViewportSize({ width: 360, height: 740 });
  await sinDesbordamiento(page, "la Red a 360 px");
});

test("con el teclado: saltar al contenido, desplegar y plegar una fila con Enter y Espacio, y abrir el tablero", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await expect(fila(page, "TIENDA")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Red", exact: true })).toBeFocused();
  const investigacion = fila(page, "INVESTIGACION");
  const boton = desplegar(page, "INVESTIGACION");
  const abrir = investigacion.getByRole("link", { name: "Abrir tablero" });
  const manifiesto = investigacion.locator(".campo-manifiesto dd");
  await boton.focus();
  await page.keyboard.press("Enter");
  await expect(boton).toHaveAttribute("aria-expanded", "true");
  await expect(manifiesto).toBeVisible();
  // Desplegada, después del enlace de la tarea vienen las acciones del detalle.
  await abrir.focus();
  await page.keyboard.press("Tab");
  await expect(investigacion.getByLabel("Preset del phase-gate.json nuevo")).toBeFocused();
  await boton.focus();
  await page.keyboard.press("Space");
  await expect(boton).toHaveAttribute("aria-expanded", "false");
  await expect(manifiesto).toBeHidden();
  // Plegada, el detalle oculto no recibe el foco: del enlace se salta a la fila siguiente.
  await page.keyboard.press("Tab");
  await expect(abrir).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(desplegar(page, "NUEVO")).toBeFocused();
  await abrir.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/tablero\/INVESTIGACION\/costos$/);
});

test("la acción de preset, desde la fila desplegada: su vista previa con el diff, y Cancelar no escribe nada", async ({ page, servidor }) => {
  const archivo = path.join(servidor.arbol.docs, "TIENDA", "phase-gate.json");
  const antes = fs.readFileSync(archivo, "utf-8");
  await page.goto(`${servidor.origen}/#/red`);
  const tienda = fila(page, "TIENDA");
  await desplegar(page, "TIENDA").click();
  await tienda.getByLabel("Preset", { exact: true }).selectOption("software");
  await tienda.getByRole("button", { name: "Cambiar el preset: vista previa" }).click();
  const previa = tienda.getByRole("region", { name: "Vista previa: Cambiar el preset" });
  await expect(previa.locator(".diff-menos").filter({ hasText: '"preset": "multi-repo-feature"' })).toHaveCount(1);
  await expect(previa.locator(".diff-mas").filter({ hasText: '"preset": "software"' })).toHaveCount(1);
  await previa.getByRole("button", { name: "Cancelar" }).click();
  await expect(previa).toHaveCount(0);
  expect(fs.readFileSync(archivo, "utf-8")).toBe(antes);
});

test("en vivo: una sesión que se abre se ve en su fila sin recargar, y la fila desplegada no se pliega", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  const sesion = fila(page, "INVESTIGACION").locator(".campo-sesion dd");
  await expect(sesion).toHaveText("Ninguna sesión MCP lo tiene abierto");
  await desplegar(page, "INVESTIGACION").click();
  await page.evaluate(() => ((window as unknown as { __sinRecargar: boolean }).__sinRecargar = true));
  // La sesión necesita un pid vivo: un proceso que espera mientras dura la prueba.
  const vivo = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
  const archivo = path.join(servidor.arbol.estado, "sesiones", `${vivo.pid}.json`);
  try {
    const ahora = new Date().toISOString();
    fs.writeFileSync(archivo, JSON.stringify({ pid: vivo.pid, cliente: "otro-cliente 2.0", raices: [], proyecto: "INVESTIGACION", desde: ahora, actualizado: ahora }), "utf-8");
    await expect(sesion).toHaveText("Abierto en otro-cliente 2.0", { timeout: 15_000 });
    await expect(sesion.locator("svg.marca-lleno")).toHaveCount(1);
    await expect(desplegar(page, "INVESTIGACION")).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => (window as unknown as { __sinRecargar?: boolean }).__sinRecargar)).toBe(true);
  } finally {
    vivo.kill();
    fs.rmSync(archivo, { force: true });
  }
});
