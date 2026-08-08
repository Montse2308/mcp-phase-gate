import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";

import {
  describePhaseFiles,
  discoverPhases,
  loadPhasePrompt,
  nombreContextoInicial,
  parsePhaseFile,
} from "../src/phases.js";
import { limpiarEntorno, promptsTemporales } from "./helpers.js";

afterEach(limpiarEntorno);

const FASE_1 = `---
documento: 01 - Análisis Técnico.md
documento_inicial: 00 - Contexto Inicial.md
---

# Descubrimiento

Cuerpo de la fase 1.
`;

const FASE_2 = `---
documento: 02 - Decisiones.md
---

# Decisiones

Cuerpo de la fase 2.
`;

describe("discoverPhases", () => {
  it("numera las fases por el nombre del archivo y lee su cabecera", () => {
    promptsTemporales({ "fase-1-descubrimiento.md": FASE_1, "fase-2-decisiones.md": FASE_2 });

    const fases = discoverPhases();

    assert.deepEqual([...fases.keys()].sort(), [1, 2]);
    assert.equal(fases.get(1)?.documento, "01 - Análisis Técnico.md");
    assert.equal(fases.get(1)?.documentoInicial, "00 - Contexto Inicial.md");
    assert.equal(fases.get(1)?.title, "Descubrimiento");
    assert.equal(fases.get(2)?.documentoInicial, undefined);
  });

  // El prefijo en inglés existe para que alguien pueda traducir los prompts sin tocar código.
  it("acepta el prefijo phase- igual que fase-", () => {
    promptsTemporales({ "phase-3-planning.md": "# Planning\n" });

    assert.equal(discoverPhases().get(3)?.title, "Planning");
  });

  it("no cuenta como fase lo que no sigue el patrón", () => {
    promptsTemporales({
      "fase-1-descubrimiento.md": FASE_1,
      "global-rules.md": "reglas",
      "README.md": "# Léeme",
      "fase-9-borrador.txt": "no es markdown",
      "faseX-sin-numero.md": "# Sin número",
    });

    assert.deepEqual([...discoverPhases().keys()], [1]);
  });

  it("deriva el título del nombre del archivo cuando no hay encabezado", () => {
    promptsTemporales({ "fase-7-sin-encabezado.md": "Cuerpo sin ningún # al principio.\n" });

    assert.equal(discoverPhases().get(7)?.title, "sin-encabezado");
  });

  it("no encuentra fases si la carpeta de prompts no existe", () => {
    process.env.ORQUESTADOR_PROMPTS_PATH = "/carpeta/que/no/existe";

    assert.equal(discoverPhases().size, 0);
  });
});

describe("parsePhaseFile", () => {
  it("separa la cabecera del cuerpo y no la deja en el prompt", () => {
    const carpeta = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1 });

    const { meta, cuerpo } = parsePhaseFile(`${carpeta}/fase-1-descubrimiento.md`);

    assert.equal(meta.documento, "01 - Análisis Técnico.md");
    assert.equal(cuerpo.includes("documento:"), false);
    assert.equal(cuerpo.trimStart().startsWith("# Descubrimiento"), true);
  });

  it("trata como cuerpo entero un archivo sin cabecera", () => {
    const carpeta = promptsTemporales({ "fase-4-ejecucion.md": "# Ejecución\n\nTodo cuerpo.\n" });

    const { meta, cuerpo } = parsePhaseFile(`${carpeta}/fase-4-ejecucion.md`);

    assert.deepEqual(meta, {});
    assert.equal(cuerpo.startsWith("# Ejecución"), true);
  });
});

describe("nombreContextoInicial", () => {
  it("lo toma de la cabecera de la fase 1", () => {
    promptsTemporales({ "fase-1-descubrimiento.md": FASE_1 });

    assert.equal(nombreContextoInicial(), "00 - Contexto Inicial.md");
  });

  it("cae al valor por defecto si la fase 1 no lo declara", () => {
    promptsTemporales({ "fase-1-descubrimiento.md": "# Descubrimiento\n" });

    assert.equal(nombreContextoInicial(), "00 - Contexto Inicial.md");
  });
});

describe("loadPhasePrompt", () => {
  it("antepone las reglas globales y añade los nombres de archivo", () => {
    promptsTemporales({
      "global-rules.md": "REGLAS GLOBALES",
      "fase-1-descubrimiento.md": FASE_1,
      "fase-2-decisiones.md": FASE_2,
    });

    const prompt = loadPhasePrompt(2);

    assert.equal(prompt.startsWith("REGLAS GLOBALES"), true);
    assert.equal(prompt.includes("Cuerpo de la fase 2."), true);
    assert.equal(prompt.includes("01 - Análisis Técnico.md"), true); // el previo, para leerlo
    assert.equal(prompt.includes("02 - Decisiones.md"), true); // el propio, para escribirlo
  });

  it("falla nombrando las fases que sí existen", () => {
    promptsTemporales({ "fase-1-descubrimiento.md": FASE_1 });

    assert.throws(() => loadPhasePrompt(9), /Fase no válida.*1/s);
  });
});

describe("describePhaseFiles", () => {
  it("avisa cuando la fase no deja documento", () => {
    promptsTemporales({ "fase-1-descubrimiento.md": FASE_1, "fase-5-auditoria.md": "# Auditoría\n" });

    const bloque = describePhaseFiles(discoverPhases(), 5);

    assert.equal(bloque.includes("no deja documento"), true);
  });
});
