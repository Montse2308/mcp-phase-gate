// Los estados del Studio, uno por uno: cada uno se pinta con su forma, su color y su texto, y solo los que piden
// atención llevan insignia (el texto en mayúsculas, con borde del color del estado, en JetBrains Mono). La
// tabla de abajo se escribe aparte del código: si el indicador cambia una forma o una insignia, esta prueba
// lo dice. Los estados que el árbol de prueba no tiene (un repo que no existe, un lote no vigente…) se
// consiguen cambiando en el navegador la respuesta de la API.

import type { Locator, Page } from "@playwright/test";

import { expect, fasesDeLaTarea, lotesDeLaFase, ningunEstadoSoloColor, test } from "./ayudas";

type Forma = "lleno" | "anillo" | "rombo" | "vacio" | "cuadro" | "triangulo" | "raya" | "discontinuo" | "cuadro-vacio" | "rombo-vacio" | "triangulo-vacio";
type Tono = "verde" | "ambar" | "rojo" | "violeta" | "apagado";

// Una fila de la tabla: la clave que lleva el indicador, su forma, su color, si lleva insignia, el texto que
// dice y dónde está en la página.
type Caso = { clave: string; forma: Forma; tono: Tono; insignia: boolean; texto: string; donde: (p: Page) => Locator };

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
  { clave: "red-manifiesto-invalido", forma: "rombo", tono: "rojo", insignia: true, texto: "phase-gate.json inválido" },
  { clave: "red-repo-limpio", forma: "lleno", tono: "verde", insignia: false, texto: "rama main · árbol limpio" },
  { clave: "red-repo-con-cambios", forma: "anillo", tono: "ambar", insignia: false, texto: "rama main · 3 cambios sin commit" },
  { clave: "red-repo-sin-git", forma: "raya", tono: "apagado", insignia: false, texto: "sin git" },
  { clave: "red-repo-no-existe", forma: "rombo", tono: "rojo", insignia: true, texto: "no existe en este equipo" },
  { clave: "red-repo-con-error", forma: "triangulo", tono: "ambar", insignia: true, texto: "fatal: algo raro" },
  { clave: "red-repo-con-error", forma: "triangulo", tono: "ambar", insignia: true, texto: "git no respondió a tiempo" }, // el mismo estado, otro motivo
  { clave: "red-sesion-abierta", forma: "lleno", tono: "verde", insignia: false, texto: "Abierto en cliente-e2e 1.0" },
  { clave: "red-sesion-ninguna", forma: "vacio", tono: "apagado", insignia: false, texto: "Ninguna sesión MCP lo tiene abierto" },
  { clave: "red-configuracion-con-error", forma: "triangulo", tono: "ambar", insignia: true, texto: "la configuración tiene un error" },
];
const VIGIA: Omit<Caso, "donde">[] = [
  { clave: "vigia-errores", forma: "rombo", tono: "rojo", insignia: true, texto: "Errores (1)" },
  { clave: "vigia-avisos", forma: "triangulo", tono: "ambar", insignia: true, texto: "Avisos (2)" },
  { clave: "vigia-info", forma: "vacio", tono: "apagado", insignia: false, texto: "Información (1)" },
  { clave: "vigia-cliente-detectado", forma: "lleno", tono: "verde", insignia: false, texto: "detectado en este equipo" },
  { clave: "vigia-cliente-no-detectado", forma: "vacio", tono: "apagado", insignia: false, texto: "no detectado" },
];
const CLAVES = new Set([...FASES, ...LOTES, ...RED, ...VIGIA].map((c) => c.clave));

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
    return { transformacion: e.textTransform, bordeDeclarado: regla?.style.borderTopWidth, bordeCalculado: parseFloat(e.borderTopWidth), estilo: e.borderTopStyle, radio: e.borderTopLeftRadius, tamano: e.fontSize, peso: e.fontWeight, familia: e.fontFamily, fondo: e.backgroundColor, colorDelBorde: e.borderTopColor, colorDelTexto: e.color, visible: (el as HTMLElement).innerText };
  });
  expect(estilo, `${nombre}: el estilo de la insignia`).toMatchObject({ transformacion: "uppercase", bordeDeclarado: "1.5px", estilo: "solid", radio: "4px", tamano: "12px", peso: "600", fondo: "rgba(0, 0, 0, 0)" });
  expect(estilo.bordeCalculado, `${nombre}: el borde se ve`).toBeGreaterThanOrEqual(1);
  expect(estilo.familia, `${nombre}: JetBrains Mono`).toMatch(/JetBrains Mono/);
  expect(estilo.colorDelBorde, `${nombre}: el borde, del color del texto`).toBe(estilo.colorDelTexto);
  expect(estilo.visible, `${nombre}: en mayúsculas`).toBe(estilo.visible.toUpperCase());
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
test("el Vigía: errores, avisos e información, y los clientes detectados y no detectados", async ({ page, servidor }) => {
  await page.goto(`${servidor.origen}/#/vigia`);
  await expect(page.getByRole("heading", { name: "Diagnóstico" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Cursor" })).toBeVisible();
  await comprobar(page, con(VIGIA, "vigia-errores", null, (p) => p.getByRole("heading", { level: 3, name: "Errores (1)" }).locator(".indicador")));
  await comprobar(page, con(VIGIA, "vigia-avisos", null, (p) => p.getByRole("heading", { level: 3, name: "Avisos (2)" }).locator(".indicador")));
  await comprobar(page, con(VIGIA, "vigia-info", null, (p) => p.getByRole("heading", { level: 3, name: "Información (1)" }).locator(".indicador")));
  await comprobar(page, con(VIGIA, "vigia-cliente-detectado", null, (p) => p.getByRole("article", { name: "Claude Code" }).locator(".indicador")));
  await comprobar(page, con(VIGIA, "vigia-cliente-no-detectado", null, (p) => p.getByRole("article", { name: "VS Code" }).locator(".indicador")));
  await soloEstadosDeLaTabla(page);
});

test("la tabla cubre cada estado que puede pintar el código: ni uno de más ni uno de menos", async () => {
  // 5 fases, 10 lotes, 11 estados de la Red y 5 del Vigía (el repo con error de git y el que no respondió son uno).
  expect(FASES).toHaveLength(5);
  expect(LOTES).toHaveLength(10);
  expect(new Set(RED.map((c) => c.clave)).size).toBe(11);
  expect(VIGIA).toHaveLength(5);
  expect(CLAVES.size).toBe(31);
});
