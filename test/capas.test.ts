// El ensamblado por capas: qué cuerpo gana, en qué orden se
// aplican los bloques, qué se avisa y qué nunca llega al modelo.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import { capasDe, ensamblarConCapas, revisarBloques } from "../src/capas.js";
import type { Capa } from "../src/capas.js";
import { loadPhasePrompt } from "../src/phases.js";
import { carpetaTemporal, crearProyecto, docsTemporales, limpiarEntorno } from "./helpers.js";

const GLOBALES = [
  "## REGLA GLOBAL INQUEBRANTABLE (CERO RUPTURAS)",
  "<!-- ranura: cero-rupturas -->",
  "- No rompas nada.",
  "<!-- /ranura -->",
  "",
  "## EVIDENCIA",
  "<!-- ranura: evidencia -->",
  "Ancla cada afirmación.",
  "<!-- /ranura -->",
  "",
  "## BASE DE CADA DECISIÓN",
  "",
  "Base de fábrica.",
  "",
  "## PENDIENTES HEREDADOS",
  "",
  "Pendientes de fábrica.",
  "",
  "## REGLAS ADICIONALES",
  "<!-- ranura: extra -->",
  "<!-- /ranura -->",
  "",
].join("\n");

const FASE_1 = [
  "---",
  "documento: 01 - Análisis.md",
  "---",
  "",
  "# Descubrimiento",
  "",
  "## ROL",
  "<!-- ranura: rol -->",
  "Eres analista.",
  "<!-- /ranura -->",
  "",
  "## VERIFICACIÓN",
  "<!-- ranura: verificacion -->",
  "Ejecuta lo que se pueda.",
  "<!-- /ranura -->",
  "",
].join("\n");

function carpeta(prefijo: string, archivos: Record<string, string>): string {
  const ruta = carpetaTemporal(prefijo);
  for (const [nombre, contenido] of Object.entries(archivos)) fs.writeFileSync(path.join(ruta, nombre), contenido, "utf-8");
  return ruta;
}

function archivo(prefijo: string, contenido: string): string {
  const ruta = path.join(carpetaTemporal(prefijo), `${prefijo}.md`);
  fs.writeFileSync(ruta, contenido, "utf-8");
  return ruta;
}

const fabrica = (): Capa => ({ orden: 1, etiqueta: "fábrica", ruta: carpeta("fabrica", { "global-rules.md": GLOBALES, "fase-1-descubrimiento.md": FASE_1 }) });
const preset = (contenido: string): Capa => ({ orden: 2, etiqueta: "preset", ruta: archivo("preset", contenido) });
const global = (archivos: Record<string, string>): Capa => ({ orden: 3, etiqueta: "global", ruta: carpeta("global", archivos) });
const proyecto = (archivos: Record<string, string>): Capa => ({ orden: 4, etiqueta: "proyecto", ruta: carpeta("proyecto", archivos) });

function bloque(id: string, contenido: string, modo = ""): string {
  return `<!-- bloque: ${id}${modo ? ` | ${modo}` : ""} -->\n${contenido}\n<!-- /bloque -->\n`;
}

describe("ensamblarConCapas", () => {
  it("solo con la fábrica: sin marcadores y sin el encabezado de una ranura extra vacía", () => {
    const { texto, avisos } = ensamblarConCapas(1, [fabrica()]);

    assert.equal(texto.includes("<!--"), false);
    assert.equal(texto.includes("REGLAS ADICIONALES"), false);
    assert.ok(texto.startsWith("## REGLA GLOBAL INQUEBRANTABLE (CERO RUPTURAS)\n- No rompas nada.\n"));
    assert.ok(texto.includes("## ARCHIVOS DE ESTA TAREA"));
    assert.deepEqual(avisos, []);
  });

  it("los bloques se aplican por capa ascendente: el de más arriba manda", () => {
    const capas = [
      fabrica(),
      preset(bloque("fase-1/rol", "Y además del preset.", "despues") + bloque("fase-1/verificacion", "Verificación del preset.")),
      global({ "bloques.md": bloque("fase-1/rol", "Rol de la capa global.") }),
      proyecto({ "bloques.md": bloque("fase-1/verificacion", "Y del proyecto.", "despues") }),
    ];

    const { texto, procedencia } = ensamblarConCapas(1, capas);
    assert.ok(texto.includes("## ROL\nRol de la capa global.\n\n## VERIFICACIÓN"), "el despues del preset lo borra el reemplazar de arriba");
    assert.ok(texto.includes("## VERIFICACIÓN\nVerificación del preset.\n\nY del proyecto."));
    const verificacion = procedencia.find((p) => p.ranura === "fase-1/verificacion");
    assert.match(verificacion?.contenidoDe ?? "", /preset\.md:\d+$/);
    assert.match(verificacion?.modos[0] ?? "", /^despues \(.*bloques\.md:1\)$/);
  });

  it("un bloque de una capa por debajo del cuerpo también aplica", () => {
    const cuerpoPropio = FASE_1.replace("documento: 01 - Análisis.md", "documento: 01 - Propio.md").replace("Eres analista.", "Eres otro.");
    const capas = [fabrica(), preset(bloque("fase-1/rol", "Rol del preset.")), proyecto({ "fase-1-mia.md": cuerpoPropio })];

    const { texto, procedencia } = ensamblarConCapas(1, capas);
    assert.ok(texto.includes("## ROL\nRol del preset."));
    assert.equal(texto.includes("Eres otro."), false);
    assert.ok(texto.includes("`01 - Propio.md`"), "el documento lo da la cabecera del cuerpo que gana");
    // El contenido por defecto de un cuerpo propio dice su archivo y la línea real del marcador.
    const contenidoDe = procedencia.find((p) => p.ranura === "fase-1/verificacion")?.contenidoDe ?? "";
    assert.match(contenidoDe, /fase-1-mia\.md:13$/);
  });

  it("un bloque no puede cambiar el nombre del documento", () => {
    const capas = [fabrica(), preset("---\ndocumento: 99 - Otro.md\n---\n" + bloque("fase-1/rol", "documento: 99 - Otro.md"))];

    const { texto } = ensamblarConCapas(1, capas);
    assert.ok(texto.includes("`01 - Análisis.md`"));
    assert.equal(texto.includes("`99 - Otro.md`"), false);
  });

  it("los huérfanos de la fase y de las reglas globales se avisan; los de otra fase, no", () => {
    const capas = [
      fabrica(),
      preset(bloque("fase-1/verificaion", "x") + bloque("global/evidensia", "y") + bloque("fase-3/pruebas", "z")),
    ];

    const { texto, avisos } = ensamblarConCapas(1, capas);
    assert.equal(texto.includes("x\n"), false);
    assert.deepEqual(
      avisos.map((a) => a.codigo),
      ["BLOQUE-HUERFANO", "BLOQUE-HUERFANO"]
    );
    assert.match(avisos[0]?.texto ?? "", /«global\/evidensia» de .*preset\.md:4 no encaja en ninguna ranura/);
    assert.match(avisos[1]?.texto ?? "", /«fase-1\/verificaion» de .*preset\.md:1/);
  });

  it("un archivo de bloques mal formado se ignora entero y se avisa", () => {
    const capas = [fabrica(), global({ "bloques.md": bloque("fase-1/rol", "Rol bueno") + "<!-- bloque: fase-1/verificacion -->\nsin cerrar\n" })];

    const { texto, avisos } = ensamblarConCapas(1, capas);
    assert.ok(texto.includes("Eres analista."));
    assert.deepEqual(avisos.map((a) => a.codigo), ["BLOQUE-MAL-FORMADO"]);
  });

  it("un bloque duplicado se avisa y vale el primero", () => {
    const capas = [fabrica(), global({ "bloques.md": bloque("fase-1/rol", "Primero") + bloque("fase-1/rol", "Segundo") })];

    const { texto, avisos } = ensamblarConCapas(1, capas);
    assert.ok(texto.includes("## ROL\nPrimero\n"));
    assert.deepEqual(avisos.map((a) => a.codigo), ["BLOQUE-DUPLICADO"]);
  });

  it("global/extra con contenido aparece con su encabezado", () => {
    const { texto } = ensamblarConCapas(1, [fabrica(), global({ "bloques.md": bloque("global/extra", "- Responde en español.") })]);

    assert.ok(texto.includes("## REGLAS ADICIONALES\n- Responde en español.\n\n# Descubrimiento"));
  });

  it("un global-rules.md propio sin BASE ni PENDIENTES recibe las de fábrica al final (GLOBAL-REINYECTADO)", () => {
    const propio = "## REGLA GLOBAL INQUEBRANTABLE (CERO RUPTURAS)\n\n- Mi regla.\n\n## EVIDENCIA\n\nMía.\n";
    const { texto, avisos } = ensamblarConCapas(1, [fabrica(), global({ "global-rules.md": propio })]);

    const reglas = texto.slice(0, texto.indexOf("# Descubrimiento"));
    assert.ok(reglas.includes("- Mi regla."));
    assert.ok(reglas.trimEnd().endsWith("## BASE DE CADA DECISIÓN\n\nBase de fábrica.\n\n## PENDIENTES HEREDADOS\n\nPendientes de fábrica."));
    assert.deepEqual(avisos.map((a) => a.codigo), ["GLOBAL-REINYECTADO"]);
    assert.match(avisos[0]?.texto ?? "", /"## BASE DE CADA DECISIÓN" ni "## PENDIENTES HEREDADOS"/);
  });

  it("solo se reinyecta la sección que falta, y nada si están las dos", () => {
    const conBase = "## EVIDENCIA\n\nMía.\n\n## BASE DE CADA DECISIÓN\n\nMi base.\n";
    const unaSola = ensamblarConCapas(1, [fabrica(), global({ "global-rules.md": conBase })]);
    assert.ok(unaSola.texto.includes("Mi base."));
    assert.equal(unaSola.texto.includes("Base de fábrica."), false);
    assert.ok(unaSola.texto.includes("Pendientes de fábrica."));

    const completo = `${conBase}\n## PENDIENTES HEREDADOS\n\nMis pendientes.\n`;
    const ninguna = ensamblarConCapas(1, [fabrica(), global({ "global-rules.md": completo })]);
    assert.equal(ninguna.texto.includes("de fábrica."), false);
    assert.deepEqual(ninguna.avisos, []);
  });

  it("loadPhasePrompt con carpetas explícitas aplica el bloques.md de la carpeta propia", () => {
    const capaFabrica = fabrica();
    const propia = carpeta("propia", { "bloques.md": bloque("fase-1/rol", "Rol propio.") });

    assert.ok(loadPhasePrompt(1, [capaFabrica.ruta, propia]).includes("## ROL\nRol propio.\n"));
  });

  it("una fase que no existe en ninguna capa lanza con la lista de las que hay", () => {
    assert.throws(() => ensamblarConCapas(7, [fabrica()]), /Fase no válida. Las fases disponibles son: 1\./);
  });
});

describe("revisarBloques", () => {
  it("lista los huérfanos de todas las fases y los de una fase que no existe", () => {
    const capas = [fabrica(), preset(bloque("fase-1/rol", "bien") + bloque("fase-1/rl", "mal") + bloque("fase-9/rol", "sin fase"))];

    const avisos = revisarBloques(capas);
    assert.deepEqual(
      avisos.map((a) => a.texto.match(/«(.+?)»/)?.[1]).sort(),
      ["fase-1/rl", "fase-9/rol"]
    );
  });
});

describe("capasDe", () => {
  afterEach(limpiarEntorno);

  it("sin proyecto: la fábrica y, si está definida, la carpeta global", () => {
    assert.deepEqual(capasDe(null).map((c) => c.etiqueta), ["fábrica"]);

    const propia = carpetaTemporal("propia");
    process.env.PHASE_GATE_PROMPTS_PATH = propia;
    assert.deepEqual(capasDe(null).map((c) => [c.orden, c.etiqueta, c.ruta]).slice(1), [[3, "global", propia]]);
  });

  it("con proyecto, la capa 4 es <DOCS>/<PROYECTO>/.phase-gate/prompts", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    const capa = capasDe("PROYECTO-A").at(-1);
    assert.deepEqual(capa, { orden: 4, etiqueta: "proyecto", ruta: path.join(docs, "PROYECTO-A", ".phase-gate", "prompts") });
  });
});
