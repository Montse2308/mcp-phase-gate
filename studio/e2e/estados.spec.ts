// Los estados del Studio, uno por uno: cada uno se pinta con su forma, su color y su texto, y solo los que piden
// atención llevan insignia (el texto en mayúsculas, con borde del color del estado, en JetBrains Mono). La
// tabla de abajo se escribe aparte del código: si el indicador cambia una forma o una insignia, esta prueba
// lo dice. Los estados que el árbol de prueba no tiene (un repo que no existe, un lote no vigente…) se
// consiguen cambiando en el navegador la respuesta de la API.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { Locator, Page } from "@playwright/test";

import { expect, fasesDeLaTarea, lotesDeLaFase, ningunEstadoSoloColor, test } from "./ayudas";

type Forma = "lleno" | "anillo" | "rombo" | "vacio" | "cuadro" | "triangulo" | "raya" | "discontinuo" | "cuadro-vacio" | "rombo-vacio" | "triangulo-vacio";
type Tono = "verde" | "ambar" | "rojo" | "violeta" | "apagado";

// Una fila de la tabla: la clave que lleva el indicador, su forma, su color, si lleva insignia, el texto que
// dice y dónde está en la página. `literal`: la insignia lleva datos (un mensaje de git, un nombre de archivo) y
// no los pasa a mayúsculas. `titulo`: la insignia está en un título y toma su tamaño y su familia.
type Caso = { clave: string; forma: Forma; tono: Tono; insignia: boolean; texto: string; literal?: boolean; titulo?: boolean; donde: (p: Page) => Locator };

// ─── La tabla ────────────────────────────────────────────────────────────────────────────────────────
const FASES: Omit<Caso, "donde">[] = [
  { clave: "fase-cerrada", forma: "lleno", tono: "verde", insignia: false, texto: "cerrada" },
  { clave: "fase-en-curso", forma: "anillo", tono: "ambar", insignia: false, texto: "en curso" },
  { clave: "fase-con-pendientes", forma: "triangulo", tono: "ambar", insignia: true, texto: "con pendientes" },
  { clave: "fase-hueco", forma: "rombo", tono: "rojo", insignia: true, texto: "hueco" },
  { clave: "fase-pendiente", forma: "vacio", tono: "apagado", insignia: false, texto: "pendiente" },
];
const LOTES: Omit<Caso, "donde">[] = [
  { clave: "estado-verificado", forma: "lleno", tono: "verde", insignia: false, texto: "verificado" },
  { clave: "estado-sellado", forma: "cuadro", tono: "verde", insignia: false, texto: "sellado" },
  { clave: "estado-con-pendientes", forma: "triangulo", tono: "ambar", insignia: true, texto: "con pendientes" },
  { clave: "estado-commit-pendiente", forma: "discontinuo", tono: "violeta", insignia: false, texto: "commit pendiente" },
  { clave: "estado-no-vigente", forma: "triangulo-vacio", tono: "ambar", insignia: true, texto: "no vigente" },
  { clave: "estado-rechazado", forma: "rombo", tono: "rojo", insignia: true, texto: "rechazado" },
  { clave: "estado-descartado", forma: "raya", tono: "apagado", insignia: false, texto: "descartado" },
  { clave: "estado-manual", forma: "cuadro-vacio", tono: "apagado", insignia: false, texto: "manual" },
  { clave: "estado-nota", forma: "vacio", tono: "apagado", insignia: false, texto: "nota" },
  { clave: "estado-sin-recibo", forma: "rombo-vacio", tono: "apagado", insignia: false, texto: "sin recibo" },
];
const RED: Omit<Caso, "donde">[] = [
  { clave: "red-manifiesto-valido", forma: "lleno", tono: "verde", insignia: false, texto: "phase-gate.json válido" },
  { clave: "red-manifiesto-ausente", forma: "vacio", tono: "apagado", insignia: false, texto: "sin phase-gate.json" },
  { clave: "red-manifiesto-invalido", forma: "rombo", tono: "rojo", insignia: true, texto: "phase-gate.json inválido", literal: true },
  { clave: "red-repo-limpio", forma: "lleno", tono: "verde", insignia: false, texto: "rama main · árbol limpio" },
  { clave: "red-repo-con-cambios", forma: "anillo", tono: "ambar", insignia: false, texto: "rama main · 3 cambios sin commit" },
  { clave: "red-repo-sin-git", forma: "raya", tono: "apagado", insignia: false, texto: "sin git" },
  { clave: "red-repo-no-existe", forma: "rombo", tono: "rojo", insignia: true, texto: "no existe en este equipo" },
  { clave: "red-repo-con-error", forma: "triangulo", tono: "ambar", insignia: true, texto: "fatal: algo raro", literal: true },
  { clave: "red-repo-con-error", forma: "triangulo", tono: "ambar", insignia: true, texto: "git no respondió a tiempo" }, // el mismo estado, otro motivo
  { clave: "red-sesion-abierta", forma: "lleno", tono: "verde", insignia: false, texto: "Abierto en cliente-e2e 1.0" },
  { clave: "red-sesion-ninguna", forma: "vacio", tono: "apagado", insignia: false, texto: "Ninguna sesión MCP lo tiene abierto" },
  { clave: "red-configuracion-con-error", forma: "triangulo", tono: "ambar", insignia: true, texto: "la configuración tiene un error" },
];
const VIGIA: Omit<Caso, "donde">[] = [
  { clave: "vigia-errores", forma: "rombo", tono: "rojo", insignia: true, texto: "Errores (1)", titulo: true },
  { clave: "vigia-avisos", forma: "triangulo", tono: "ambar", insignia: true, texto: "Avisos (2)", titulo: true },
  { clave: "vigia-info", forma: "vacio", tono: "apagado", insignia: false, texto: "Información (1)" },
];
const AJUSTES: Omit<Caso, "donde">[] = [
  { clave: "ajustes-cambiado", forma: "anillo", tono: "ambar", insignia: false, texto: "Cambiado, sin aplicar" },
  { clave: "ajustes-conflicto", forma: "rombo", tono: "rojo", insignia: true, texto: "En conflicto" },
  { clave: "ajustes-maquina-valida", forma: "lleno", tono: "verde", insignia: false, texto: "machine.json válido" },
  { clave: "ajustes-maquina-ausente", forma: "vacio", tono: "apagado", insignia: false, texto: "sin machine.json todavía" },
  { clave: "ajustes-maquina-invalida", forma: "rombo", tono: "rojo", insignia: true, texto: "machine.json inválido" },
  { clave: "ajustes-env-pisa", forma: "triangulo", tono: "ambar", insignia: true, texto: "PHASE_GATE_DOCS_PATH = /otra/docs: gana a machine.json", literal: true },
  { clave: "ajustes-env-coincide", forma: "lleno", tono: "verde", insignia: false, texto: "PHASE_GATE_REPOS_PATH = /x/repos: coincide con machine.json" },
  { clave: "ajustes-env-sin-valor", forma: "vacio", tono: "apagado", insignia: false, texto: "PHASE_GATE_LANG = es: machine.json no lo tiene" },
  { clave: "ajustes-cliente-detectado", forma: "lleno", tono: "verde", insignia: false, texto: "detectado en este equipo" },
  { clave: "ajustes-cliente-no-detectado", forma: "vacio", tono: "apagado", insignia: false, texto: "no detectado" },
];
const CLAVES = new Set([...FASES, ...LOTES, ...RED, ...VIGIA, ...AJUSTES].map((c) => c.clave));

// ─── Lo que se comprueba de cada fila ────────────────────────────────────────────────────────────────
async function comprobar(page: Page, caso: Caso): Promise<void> {
  const indicador = caso.donde(page);
  const nombre = `${caso.clave} («${caso.texto}»)`;
  await expect(indicador, `${nombre}: un solo indicador`).toHaveCount(1);
  await expect(indicador, `${nombre}: su clave`).toHaveClass(new RegExp(`(?:^|\\s)${caso.clave}(?:\\s|$)`));
  await expect(indicador, `${nombre}: su color`).toHaveClass(new RegExp(`(?:^|\\s)tono-${caso.tono}(?:\\s|$)`));
  await expect(indicador, `${nombre}: su texto`).toContainText(caso.texto);
  await expect(indicador.locator(`svg.marca-${caso.forma}`), `${nombre}: su forma`).toHaveCount(1);
  expect(await indicador.locator("svg").count(), `${nombre}: solo una forma`).toBe(1);
  await expect(indicador.locator(".insignia"), `${nombre}: ${caso.insignia ? "lleva" : "no lleva"} insignia`).toHaveCount(caso.insignia ? 1 : 0);
  if (!caso.insignia) return;
  const insignia = indicador.locator(".insignia");
  await expect(insignia, `${nombre}: el texto de la insignia`).toContainText(caso.texto.replace(/^rama main · /, ""));
  const estilo = await insignia.evaluate((el) => {
    const e = getComputedStyle(el);
    // Chrome ajusta el borde calculado a píxeles del dispositivo (a 1×, 1.5 px sale como 1 px): el ancho que
    // pide la hoja se lee de su regla.
    const regla = [...document.styleSheets].flatMap((h) => [...h.cssRules]).find((r) => r instanceof CSSStyleRule && r.selectorText === ".insignia") as CSSStyleRule | undefined;
    const titulo = el.closest("h1, h2, h3, h4, h5, h6");
    return { transformacion: e.textTransform, bordeDeclarado: regla?.style.borderTopWidth, bordeCalculado: parseFloat(e.borderTopWidth), estilo: e.borderTopStyle, radio: e.borderTopLeftRadius, tamano: e.fontSize, peso: e.fontWeight, familia: e.fontFamily, fondo: e.backgroundColor, colorDelBorde: e.borderTopColor, colorDelTexto: e.color, visible: (el as HTMLElement).innerText, tamanoDelTitulo: titulo ? getComputedStyle(titulo).fontSize : null };
  });
  expect(estilo, `${nombre}: el estilo de la insignia`).toMatchObject({ transformacion: caso.literal ? "none" : "uppercase", bordeDeclarado: "1.5px", estilo: "solid", radio: "4px", peso: "600", fondo: "rgba(0, 0, 0, 0)" });
  expect(estilo.bordeCalculado, `${nombre}: el borde se ve`).toBeGreaterThanOrEqual(1);
  expect(estilo.colorDelBorde, `${nombre}: el borde, del color del texto`).toBe(estilo.colorDelTexto);
  if (caso.titulo) {
    // En un título, la insignia mide lo que el título y va en su familia.
    expect(estilo.tamanoDelTitulo, `${nombre}: dentro de un título`).not.toBeNull();
    expect(estilo.tamano, `${nombre}: del tamaño del título`).toBe(estilo.tamanoDelTitulo);
    expect(estilo.familia, `${nombre}: la familia del título`).toMatch(/^Inter,/);
  } else {
    expect(estilo.tamano, `${nombre}: 12 px`).toBe("12px");
    expect(estilo.familia, `${nombre}: JetBrains Mono`).toMatch(/JetBrains Mono/);
  }
  if (caso.literal) expect(estilo.visible, `${nombre}: el dato tal cual`).toBe(caso.texto.replace(/^rama main · /, ""));
  else expect(estilo.visible, `${nombre}: en mayúsculas`).toBe(estilo.visible.toUpperCase());
}

// Cada indicador de la página es de un estado de la tabla, y cada uno lleva forma y texto.
async function soloEstadosDeLaTabla(page: Page): Promise<void> {
  const claves = await page.locator(".indicador").evaluateAll((els) => els.map((el) => [...el.classList]));
  expect(claves.length, "hay indicadores en la página").toBeGreaterThan(0);
  for (const clases of claves) expect(clases.filter((c) => CLAVES.has(c)), `un indicador de un estado que la tabla no tiene: ${clases.join(" ")}`).toHaveLength(1);
  await ningunEstadoSoloColor(page);
}

const con = (filas: Omit<Caso, "donde">[], clave: string, texto: string | null, donde: (p: Page) => Locator): Caso => {
  const fila = filas.find((f) => f.clave === clave && (texto === null || f.texto === texto));
  if (!fila) throw new Error(`la tabla no tiene ${clave}`);
  return { ...fila, donde };
};

// ─── Las fases ───────────────────────────────────────────────────────────────────────────────────────
const deLaFase = (i: number) => (p: Page) => fasesDeLaTarea(p).nth(i).locator(".indicador");

test("las cinco fases: cerrada, en curso, con pendientes, hueco y pendiente", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await expect(fasesDeLaTarea(page)).toHaveCount(6);
  await comprobar(page, con(FASES, "fase-cerrada", null, deLaFase(0)));
  await comprobar(page, con(FASES, "fase-en-curso", null, deLaFase(4)));
  await comprobar(page, con(FASES, "fase-pendiente", null, deLaFase(5)));
  await soloEstadosDeLaTabla(page);

  await page.goto(`${servidor.origen}/#/tablero/TIENDA/con-hueco`);
  await expect(fasesDeLaTarea(page)).toHaveCount(6);
  await comprobar(page, con(FASES, "fase-hueco", null, deLaFase(2)));

  await page.goto(`${servidor.origen}/#/tablero/INVESTIGACION/costos`);
  await expect(fasesDeLaTarea(page)).toHaveCount(6);
  await comprobar(page, con(FASES, "fase-con-pendientes", null, deLaFase(1)));
});

// ─── Los lotes ───────────────────────────────────────────────────────────────────────────────────────
const delLote = (i: number) => (p: Page) => lotesDeLaFase(p).nth(i).locator(".indicador");

test("los diez estados de un lote: los ocho del árbol de prueba", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/variedad`);
  await expect(lotesDeLaFase(page)).toHaveCount(6);
  const filas: [string, number][] = [["estado-sellado", 0], ["estado-con-pendientes", 1], ["estado-rechazado", 2], ["estado-descartado", 3], ["estado-manual", 4], ["estado-sin-recibo", 5]];
  for (const [clave, i] of filas) await comprobar(page, con(LOTES, clave, null, delLote(i)));
  await soloEstadosDeLaTabla(page);

  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await expect(lotesDeLaFase(page)).toHaveCount(2);
  await comprobar(page, con(LOTES, "estado-verificado", null, delLote(0)));
  await comprobar(page, con(LOTES, "estado-commit-pendiente", null, delLote(1)));
});

test("los dos estados de un lote que el árbol de prueba no tiene: nota y no vigente", async ({ page, servidor }) => {
  // El primer lote de cupones, con su ancla cambiada a una nota, y luego con su commit fuera de la rama.
  let como: "nota" | "no-vigente" = "nota";
  await page.route("**/api/tareas/TIENDA/cupones/lotes*", async (ruta) => {
    const respuesta = await ruta.fetch();
    const cuerpo = await respuesta.json();
    const lote = cuerpo.estado.lotes[0];
    if (como === "nota") Object.assign(lote, { ancla: { tipo: "nota", resumen: "nota: sin commits en esta política" }, sello: { corto: null, sha256: null, fecha: "2026-05-04" }, origen: "servidor", vigente: null });
    else Object.assign(lote, { vigente: false });
    await ruta.fulfill({ response: respuesta, json: cuerpo });
  });
  await page.goto(`${servidor.origen}/#/tablero/TIENDA/cupones`);
  await comprobar(page, con(LOTES, "estado-nota", null, delLote(0)));
  como = "no-vigente";
  await page.reload();
  await comprobar(page, con(LOTES, "estado-no-vigente", null, delLote(0)));
  await soloEstadosDeLaTabla(page);
});

// ─── La Red ──────────────────────────────────────────────────────────────────────────────────────────
const fila = (page: Page, nombre: string) => page.getByRole("article", { name: nombre });
const desplegar = (page: Page, nombre: string) => fila(page, nombre).getByRole("heading", { level: 2, name: nombre }).getByRole("button");
const repo = (proyecto: string, id: string) => (p: Page) => fila(p, proyecto).getByRole("list", { name: `Repositorios de ${proyecto}`, exact: true }).getByRole("listitem").filter({ hasText: id }).locator(".indicador");

test("la Red: el manifiesto, la sesión y el git de los repos del árbol de prueba", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/red`);
  await expect(page.getByRole("list", { name: "Proyectos de la Documentación" }).getByRole("article")).toHaveCount(5);
  for (const nombre of ["TIENDA", "INVESTIGACION", "ROTO"]) await desplegar(page, nombre).click();
  await comprobar(page, con(RED, "red-manifiesto-valido", null, (p) => fila(p, "TIENDA").locator(".campo-manifiesto .indicador")));
  await comprobar(page, con(RED, "red-manifiesto-ausente", null, (p) => fila(p, "INVESTIGACION").locator(".campo-manifiesto .indicador")));
  await comprobar(page, con(RED, "red-manifiesto-invalido", null, (p) => fila(p, "ROTO").locator(".campo-manifiesto .indicador")));
  // El inválido también se avisa con la fila plegada, junto al preset.
  await comprobar(page, con(RED, "red-manifiesto-invalido", null, (p) => fila(p, "ROTO").locator(".alerta-proyecto .indicador")));
  await comprobar(page, con(RED, "red-sesion-abierta", null, (p) => fila(p, "TIENDA").locator(".campo-sesion .indicador")));
  await comprobar(page, con(RED, "red-sesion-ninguna", null, (p) => fila(p, "INVESTIGACION").locator(".campo-sesion .indicador")));
  await comprobar(page, { ...con(RED, "red-repo-limpio", null, (p) => fila(p, "TIENDA").locator(".campo-repos .indicador").filter({ hasText: "api" })) });
  await comprobar(page, con(RED, "red-repo-sin-git", null, (p) => fila(p, "TIENDA").locator(".campo-repos .indicador").filter({ hasText: "web" })));
  await soloEstadosDeLaTabla(page);
});

test("la Red: cada estado de un repo y el error de configuración, con respuestas simuladas", async ({ page, servidor }) => {
  await page.route("**/api/proyectos", async (route) => {
    const respuesta = await route.fetch();
    const datos = await respuesta.json();
    const tienda = datos.proyectos.find((p: { nombre: string }) => p.nombre === "TIENDA");
    const base = tienda.repos[0];
    tienda.repos = [
      { ...base, id: "perdido", existe: false },
      { ...base, id: "lento", respondio: false },
      { ...base, id: "raro", error: "fatal: algo raro" },
      { ...base, id: "sucio", limpio: false, cambios: 2, sinSeguimiento: 1 },
      { ...base, id: "limpio" },
    ];
    tienda.errorDeConfiguracion = "la configuración de prueba no se pudo leer";
    await route.fulfill({ response: respuesta, json: datos });
  });
  await page.goto(`${servidor.origen}/#/red`);
  await expect(fila(page, "TIENDA")).toBeVisible();
  await comprobar(page, con(RED, "red-repo-no-existe", null, repo("TIENDA", "perdido")));
  await comprobar(page, con(RED, "red-repo-con-error", "git no respondió a tiempo", repo("TIENDA", "lento")));
  await comprobar(page, con(RED, "red-repo-con-error", "fatal: algo raro", repo("TIENDA", "raro")));
  await comprobar(page, con(RED, "red-repo-con-cambios", null, repo("TIENDA", "sucio")));
  await comprobar(page, con(RED, "red-repo-limpio", null, repo("TIENDA", "limpio")));
  await comprobar(page, con(RED, "red-configuracion-con-error", null, (p) => fila(p, "TIENDA").locator(".alerta-proyecto .indicador")));
  await soloEstadosDeLaTabla(page);
});

// ─── El Vigía ────────────────────────────────────────────────────────────────────────────────────────
test("el Vigía: errores, avisos e información", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/vigia`);
  await expect(page.getByRole("heading", { name: "Diagnóstico" })).toBeVisible();
  await comprobar(page, con(VIGIA, "vigia-errores", null, (p) => p.getByRole("heading", { level: 3, name: "Errores (1)" }).locator(".indicador")));
  await comprobar(page, con(VIGIA, "vigia-avisos", null, (p) => p.getByRole("heading", { level: 3, name: "Avisos (2)" }).locator(".indicador")));
  await comprobar(page, con(VIGIA, "vigia-info", null, (p) => p.getByRole("heading", { level: 3, name: "Información (1)" }).locator(".indicador")));
  await soloEstadosDeLaTabla(page);
});

// ─── Ajustes ─────────────────────────────────────────────────────────────────────────────────────────
// Cambia en el navegador la respuesta de /api/ajustes: el árbol de prueba no tiene un machine.json roto ni un
// cliente con el env lleno, y cambiarlos en el disco tocaría lo de las demás pruebas.
async function cambiarAjustes(page: Page, cambiar: (datos: any) => void): Promise<void> {
  await page.route("**/api/ajustes", async (route) => {
    const respuesta = await route.fetch();
    const datos = await respuesta.json();
    cambiar(datos);
    await route.fulfill({ response: respuesta, json: datos });
  });
}
const deLaMaquina = (p: Page) => p.locator(".estado-de-maquina .indicador");

test("Ajustes: machine.json ausente, válido e inválido", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/equipo`);
  await expect(page.getByRole("heading", { level: 2, name: "Este equipo" })).toBeVisible();
  await comprobar(page, con(AJUSTES, "ajustes-maquina-ausente", null, deLaMaquina));
  await soloEstadosDeLaTabla(page);

  await cambiarAjustes(page, (d) => Object.assign(d.maquina, { estado: "valido", version: 2 }));
  await page.reload();
  await comprobar(page, con(AJUSTES, "ajustes-maquina-valida", null, deLaMaquina));

  await page.unroute("**/api/ajustes");
  await cambiarAjustes(page, (d) => Object.assign(d.maquina, { estado: "invalido", error: "machine.json no es válido: carácter inesperado en la línea 1", version: null }));
  await page.reload();
  await comprobar(page, con(AJUSTES, "ajustes-maquina-invalida", null, deLaMaquina));
});

test("Ajustes: lo que dice el env de un cliente, si pisa, si coincide o si machine.json no lo tiene", async ({ page, servidor }) => {
  await cambiarAjustes(page, (d) => {
    const claude = d.clientes.find((c: { cliente: string }) => c.cliente === "claude-code");
    claude.lectura = "leido";
    claude.entradas = [
      {
        clave: "pg",
        ambito: "usuario",
        carpeta: null,
        variables: [
          { campo: "documentacion", variable: "PHASE_GATE_DOCS_PATH", valor: "/otra/docs", estado: "pisa" },
          { campo: "carpetaDeRepos", variable: "PHASE_GATE_REPOS_PATH", valor: "/x/repos", estado: "coincide" },
          { campo: "idioma", variable: "PHASE_GATE_LANG", valor: "es", estado: "sin-valor-en-maquina" },
        ],
      },
    ];
  });
  await page.goto(`${servidor.origen}/#/ajustes/equipo`);
  const claude = (p: Page) => p.getByRole("article", { name: "Claude Code" });
  await expect(claude(page)).toBeVisible();
  await comprobar(page, con(AJUSTES, "ajustes-env-pisa", null, (p) => claude(p).locator(".indicador.ajustes-env-pisa")));
  await comprobar(page, con(AJUSTES, "ajustes-env-coincide", null, (p) => claude(p).locator(".indicador.ajustes-env-coincide")));
  await comprobar(page, con(AJUSTES, "ajustes-env-sin-valor", null, (p) => claude(p).locator(".indicador.ajustes-env-sin-valor")));
  await soloEstadosDeLaTabla(page);
});

test("Ajustes: un campo cambiado y un campo en conflicto con el disco", async ({ page, servidor }) => {
  let enElDisco: string | null = null;
  await page.route("**/api/ajustes/proyectos/TIENDA", async (route) => {
    const respuesta = await route.fetch();
    const datos = await respuesta.json();
    if (enElDisco !== null && datos.archivo) datos.archivo.commits = enElDisco;
    await route.fulfill({ response: respuesta, json: datos });
  });
  await page.goto(`${servidor.origen}/#/ajustes/proyecto/TIENDA`);
  await page.getByLabel("Política de commits").selectOption("agente-propone");
  await comprobar(page, con(AJUSTES, "ajustes-cambiado", null, (p) => p.locator(".indicador.ajustes-cambiado")));
  // El disco cambia ese mismo campo; cambiar el idioma de la interfaz vuelve a pedir los datos.
  enElDisco = "ninguno";
  await page.getByRole("group", { name: "Idioma" }).getByRole("button", { name: "EN" }).click();
  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "ES" }).click();
  await comprobar(page, con(AJUSTES, "ajustes-conflicto", null, (p) => p.getByRole("group", { name: "En conflicto" }).locator(".indicador")));
  await soloEstadosDeLaTabla(page);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Ajustes: los clientes detectados y no detectados", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/ajustes/clientes`);
  await expect(page.getByRole("article", { name: "Cursor" })).toBeVisible();
  await comprobar(page, con(AJUSTES, "ajustes-cliente-detectado", null, (p) => p.getByRole("article", { name: "Claude Code" }).locator(".indicador")));
  await comprobar(page, con(AJUSTES, "ajustes-cliente-no-detectado", null, (p) => p.getByRole("article", { name: "VS Code" }).locator(".indicador")));
  await soloEstadosDeLaTabla(page);
});

test("la tabla cubre cada estado que puede pintar el código: ni uno de más ni uno de menos", async () => {
  // Las claves del registro de indicador.tsx, leídas del código: una clave nueva allí, sin su fila aquí, falla.
  const fuente = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "comun", "indicador.tsx"), "utf-8");
  const delCodigo = [...fuente.matchAll(/^\s*"([a-z-]+)": \{ forma:/gm)].map((m) => m[1]!);
  expect(delCodigo.length, "leo las claves de indicador.tsx").toBeGreaterThan(0);
  expect([...CLAVES].sort()).toEqual([...new Set(delCodigo)].sort());
  // 5 fases, 10 lotes, 11 estados de la Red, 3 del Vigía y 10 de Ajustes (el repo con error de git y el que no
  // respondió son uno).
  expect(FASES).toHaveLength(5);
  expect(LOTES).toHaveLength(10);
  expect(new Set(RED.map((c) => c.clave)).size).toBe(11);
  expect(VIGIA).toHaveLength(3);
  expect(AJUSTES).toHaveLength(10);
  expect(CLAVES.size).toBe(39);
});
