import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as path from "node:path";

import {
  describePhaseFiles,
  discoverPhases,
  loadPhasePrompt,
  nombreContextoInicial,
  parsePhaseFile,
} from "../src/phases.js";
import { promptsLayers } from "../src/config.js";
import { limpiarEntorno, promptsTemporales } from "./helpers.js";

afterEach(limpiarEntorno);

// Las capas se pasan explícitas en casi todos los tests. Llamar sin argumentos usaría también
// los prompts reales del paquete, y entonces cada test dependería de cuántas fases traiga el
// repo hoy: agregar una fase 6 de verdad rompería tests que no hablan de eso.
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
    const capa = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1, "fase-2-decisiones.md": FASE_2 });

    const fases = discoverPhases([capa]);

    assert.deepEqual([...fases.keys()].sort(), [1, 2]);
    assert.equal(fases.get(1)?.documento, "01 - Análisis Técnico.md");
    assert.equal(fases.get(1)?.documentoInicial, "00 - Contexto Inicial.md");
    assert.equal(fases.get(1)?.title, "Descubrimiento");
    assert.equal(fases.get(2)?.documentoInicial, undefined);
  });

  // El prefijo en inglés existe para que alguien pueda traducir los prompts sin tocar código.
  it("acepta el prefijo phase- igual que fase-", () => {
    const capa = promptsTemporales({ "phase-3-planning.md": "# Planning\n" });

    assert.equal(discoverPhases([capa]).get(3)?.title, "Planning");
  });

  it("no cuenta como fase lo que no sigue el patrón", () => {
    const capa = promptsTemporales({
      "fase-1-descubrimiento.md": FASE_1,
      "global-rules.md": "reglas",
      "README.md": "# Léeme",
      "fase-9-borrador.txt": "no es markdown",
      "faseX-sin-numero.md": "# Sin número",
    });

    assert.deepEqual([...discoverPhases([capa]).keys()], [1]);
  });

  it("deriva el título del nombre del archivo cuando no hay encabezado", () => {
    const capa = promptsTemporales({ "fase-7-sin-encabezado.md": "Cuerpo sin ningún # al principio.\n" });

    assert.equal(discoverPhases([capa]).get(7)?.title, "sin-encabezado");
  });

  it("no encuentra fases si la carpeta de prompts no existe", () => {
    assert.equal(discoverPhases(["/carpeta/que/no/existe"]).size, 0);
  });

  it("una capa que no existe no impide leer las que sí", () => {
    const capa = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1 });

    assert.deepEqual([...discoverPhases(["/carpeta/que/no/existe", capa]).keys()], [1]);
  });
});

// El caso que motivó las capas: instalado desde npm, los prompts de fábrica viven dentro de
// node_modules y editarlos ahí no sirve de nada. Sin superposición, cambiar una fase obliga a
// copiar las cinco, y las que se te olviden desaparecen sin aviso.
describe("superposición de capas", () => {
  it("la capa de arriba pisa la fase de la de abajo y respeta las demás", () => {
    const fabrica = promptsTemporales({
      "fase-1-descubrimiento.md": FASE_1,
      "fase-2-decisiones.md": FASE_2,
    });
    const propia = promptsTemporales({ "fase-2-decisiones.md": "# Mis decisiones\n\nMi cuerpo.\n" });

    const fases = discoverPhases([fabrica, propia]);

    assert.deepEqual([...fases.keys()].sort(), [1, 2]);
    assert.equal(fases.get(2)?.title, "Mis decisiones");
    assert.equal(fases.get(1)?.title, "Descubrimiento"); // la que no tocaste sigue siendo la de fábrica
  });

  // Superponer por número y no por nombre es lo que evita tener que adivinar cómo se llama el
  // archivo del paquete para poder pisarlo.
  it("pisa por número de fase aunque el archivo se llame distinto", () => {
    const fabrica = promptsTemporales({ "fase-2-decisiones.md": FASE_2 });
    const propia = promptsTemporales({ "fase-2-como-yo-quiera.md": "# A mi manera\n" });

    assert.equal(discoverPhases([fabrica, propia]).get(2)?.title, "A mi manera");
  });

  it("una fase que solo existe arriba se añade", () => {
    const fabrica = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1 });
    const propia = promptsTemporales({ "fase-6-despliegue.md": "# Despliegue\n" });

    assert.deepEqual([...discoverPhases([fabrica, propia]).keys()].sort(), [1, 6]);
  });

  // Dentro de una capa gana el primero alfabéticamente. Esa regla no debe filtrarse entre
  // capas: si lo hiciera, un nombre "temprano" abajo bloquearía al de arriba.
  it("el desempate alfabético no cruza de una capa a otra", () => {
    const fabrica = promptsTemporales({ "fase-2-aaa.md": "# De fábrica\n" });
    const propia = promptsTemporales({ "fase-2-zzz.md": "# Mía\n" });

    assert.equal(discoverPhases([fabrica, propia]).get(2)?.title, "Mía");
  });

  it("tus reglas globales sustituyen a las de fábrica, no se suman", () => {
    const fabrica = promptsTemporales({
      "global-rules.md": "REGLAS DE FÁBRICA",
      "fase-1-descubrimiento.md": FASE_1,
    });
    const propia = promptsTemporales({ "global-rules.md": "MIS REGLAS" });

    const prompt = loadPhasePrompt(1, [fabrica, propia]);

    assert.equal(prompt.startsWith("MIS REGLAS"), true);
    assert.equal(prompt.includes("REGLAS DE FÁBRICA"), false);
  });

  it("sin reglas propias siguen valiendo las de fábrica", () => {
    const fabrica = promptsTemporales({
      "global-rules.md": "REGLAS DE FÁBRICA",
      "fase-1-descubrimiento.md": FASE_1,
    });
    const propia = promptsTemporales({ "fase-1-mia.md": "# Mi descubrimiento\n" });

    assert.equal(loadPhasePrompt(1, [fabrica, propia]).startsWith("REGLAS DE FÁBRICA"), true);
  });
});

describe("promptsLayers", () => {
  it("sin carpeta propia declarada solo está la de fábrica", () => {
    assert.equal(promptsLayers().length, 1);
  });

  it("la carpeta propia se añade al final, para que gane", () => {
    const propia = promptsTemporales({ "fase-1-mia.md": "# Mía\n" });

    const capas = promptsLayers();

    assert.equal(capas.length, 2);
    assert.equal(capas[1], propia);
  });

  // La capa de fábrica se resuelve relativa al módulo, así que en el build de tests no apunta
  // al repo. Lo que sí se puede comprobar —y es lo que importa— es que los prompts que se
  // publican estén bien formados: nombre que encaje con el patrón y cabecera legible. Si
  // alguien renombra un archivo de `prompts/` y rompe el patrón, esa fase desaparece del
  // paquete en silencio, y esto es lo único que lo caza.
  it("los prompts que se publican declaran sus cinco fases con documento", () => {
    const fases = discoverPhases([path.join(process.cwd(), "prompts")]);

    assert.deepEqual([...fases.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
    for (const [numero, datos] of fases) {
      assert.ok(datos.documento, `la fase ${numero} no declara documento en su cabecera`);
    }
    assert.equal(fases.get(1)?.documentoInicial, "00 - Contexto Inicial.md");
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
    const capa = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1 });

    assert.equal(nombreContextoInicial([capa]), "00 - Contexto Inicial.md");
  });

  it("cae al valor por defecto si la fase 1 no lo declara", () => {
    const capa = promptsTemporales({ "fase-1-descubrimiento.md": "# Descubrimiento\n" });

    assert.equal(nombreContextoInicial([capa]), "00 - Contexto Inicial.md");
  });
});

describe("loadPhasePrompt", () => {
  it("antepone las reglas globales y añade los nombres de archivo", () => {
    const capa = promptsTemporales({
      "global-rules.md": "REGLAS GLOBALES",
      "fase-1-descubrimiento.md": FASE_1,
      "fase-2-decisiones.md": FASE_2,
    });

    const prompt = loadPhasePrompt(2, [capa]);

    assert.equal(prompt.startsWith("REGLAS GLOBALES"), true);
    assert.equal(prompt.includes("Cuerpo de la fase 2."), true);
    assert.equal(prompt.includes("01 - Análisis Técnico.md"), true); // el previo, para leerlo
    assert.equal(prompt.includes("02 - Decisiones.md"), true); // el propio, para escribirlo
  });

  it("falla nombrando las fases que sí existen", () => {
    const capa = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1 });

    assert.throws(() => loadPhasePrompt(9, [capa]), /Fase no válida.*1/s);
  });
});

describe("describePhaseFiles", () => {
  it("avisa cuando la fase no deja documento", () => {
    const capa = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1, "fase-5-auditoria.md": "# Auditoría\n" });

    const bloque = describePhaseFiles(discoverPhases([capa]), 5);

    assert.equal(bloque.includes("no deja documento"), true);
  });
});
