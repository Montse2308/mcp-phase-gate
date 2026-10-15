import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as path from "node:path";

import {
  describePhaseFiles,
  discoverPhases,
  loadPhasePrompt,
  nombreContextoInicial,
  parsePhaseFile,
  quitarMarcadores,
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

const FASE_4 = `---
documento: 04 - Ejecución.md
recibos: 04 - Ejecución
---

# Ejecución
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
    const fases = discoverPhases([path.join(process.cwd(), "prompts", "es")]);

    assert.deepEqual([...fases.keys()].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
    for (const [numero, datos] of fases) {
      assert.ok(datos.documento, `la fase ${numero} no declara documento en su cabecera`);
    }
    assert.equal(fases.get(1)?.documentoInicial, "00 - Contexto Inicial.md");
    assert.equal(fases.get(4)?.recibos, "04 - Ejecución");
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

  // El nombre de la subcarpeta vive en el frontmatter de la Fase 4, como el del documento: el
  // modelo lo recibe del servidor y no de un texto copiado en cada prompt.
  it("la fase que declara recibos nombra su subcarpeta", () => {
    const capa = promptsTemporales({ "fase-2-decisiones.md": FASE_2, "fase-4-ejecucion.md": FASE_4 });

    const bloque = describePhaseFiles(discoverPhases([capa]), 4);

    assert.ok(bloque.includes("Los recibos de lote van en la subcarpeta `04 - Ejecución/`, uno por lote"), bloque);
    assert.ok(bloque.includes("`04 - Ejecución/L01 - <slug>.md`"), bloque);
    assert.ok(bloque.includes("Con un solo lote no hay subcarpeta: el recibo es el documento de esta fase."), bloque);
  });

  it("una fase posterior ve la subcarpeta junto al documento de la Fase 4", () => {
    const capa = promptsTemporales({
      "fase-4-ejecucion.md": FASE_4,
      "fase-5-auditoria.md": "---\ndocumento: 05 - Auditoría.md\n---\n\n# Auditoría\n",
    });

    const bloque = describePhaseFiles(discoverPhases([capa]), 5);

    assert.ok(bloque.includes("- Fase 4: `04 - Ejecución.md` (recibos de lote en `04 - Ejecución/`)"), bloque);
  });

  it("sin recibos declarados no menciona ninguna subcarpeta", () => {
    const capa = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1, "fase-2-decisiones.md": FASE_2 });

    assert.equal(describePhaseFiles(discoverPhases([capa]), 2).includes("recibos"), false);
  });
});

describe("recibos en el frontmatter", () => {
  it("discoverPhases lee la subcarpeta de recibos", () => {
    const capa = promptsTemporales({ "fase-4-ejecucion.md": FASE_4, "fase-2-decisiones.md": FASE_2 });

    const fases = discoverPhases([capa]);

    assert.equal(fases.get(4)?.recibos, "04 - Ejecución");
    assert.equal(fases.get(2)?.recibos, undefined);
  });

  // La subcarpeta acaba dentro de un file_name: tiene que ser un solo segmento portable.
  it("un valor que no es un solo segmento portable se ignora y se registra en el log", (t) => {
    const log = t.mock.method(console, "error", () => {});

    for (const valor of ["../fuera", "04/Ejecución", "CON", "recibos."]) {
      const capa = promptsTemporales({ "fase-4-ejecucion.md": `---\ndocumento: 04 - Ejecución.md\nrecibos: ${valor}\n---\n\n# Ejecución\n` });

      assert.equal(discoverPhases([capa]).get(4)?.recibos, undefined, valor);
    }
    assert.ok(log.mock.callCount() >= 4, `se registraron ${log.mock.callCount()} avisos`);
    assert.match(String(log.mock.calls[0]?.arguments[0]), /recibos/);
  });

  // Hallazgo 2 de la auditoría de la Etapa 1: un valor visible y portable puede igual romper el
  // flujo. Con punto delante, write_central_doc no escribe ahí; con el nombre de un documento, la
  // carpeta hace que ese documento "exista" al primer recibo.
  it("se ignora un valor con punto delante o con el nombre de un documento de fase", (t) => {
    const log = t.mock.method(console, "error", () => {});
    const FASE_3 = "---\ndocumento: 03 - Plan Técnico.md\n---\n\n# Plan\n";

    for (const valor of [".recibos", "04 - Ejecución.md", "04 - ejecución.MD", "00 - Contexto Inicial.md", "03 - Plan Técnico.md"]) {
      const capa = promptsTemporales({
        "fase-1-descubrimiento.md": FASE_1,
        "fase-3-plan-tecnico.md": FASE_3,
        "fase-4-ejecucion.md": `---\ndocumento: 04 - Ejecución.md\nrecibos: ${valor}\n---\n\n# Ejecución\n`,
      });

      assert.equal(discoverPhases([capa]).get(4)?.recibos, undefined, valor);
    }
    assert.equal(log.mock.callCount(), 5);
  });
});

describe("quitarMarcadores", () => {
  it("quita las líneas de marcador enteras y conserva su contenido", () => {
    const texto = "## ROL\n<!-- ranura: rol -->\nEres X.\n<!-- /ranura -->\n\n## OTRA\n";

    assert.equal(quitarMarcadores(texto), "## ROL\nEres X.\n\n## OTRA\n");
  });

  it("tolera sangría, espacios y un marcador al final sin salto de línea", () => {
    assert.equal(quitarMarcadores("  <!--ranura:verificacion-->  \nA\n\t<!--  /ranura  -->"), "A\n");
  });

  // Solo se quitan los marcadores de ranura y solo cuando ocupan su propia línea.
  it("deja intactos otros comentarios y un marcador en mitad de una línea", () => {
    const texto = "texto <!-- ranura: rol --> sigue\n<!-- nota -->\n";

    assert.equal(quitarMarcadores(texto), texto);
  });
});

// Los archivos propios de la usuaria, escritos con el Bloc de notas, llegan en CRLF (§1.3).
describe("finales de línea y marcadores en el prompt entregado", () => {
  it("parsePhaseFile entrega el cuerpo en LF aunque el archivo venga en CRLF", () => {
    const carpeta = promptsTemporales({ "fase-1-descubrimiento.md": FASE_1.replace(/\n/g, "\r\n") });

    const { meta, cuerpo } = parsePhaseFile(path.join(carpeta, "fase-1-descubrimiento.md"));

    assert.equal(meta.documento, "01 - Análisis Técnico.md");
    assert.equal(cuerpo.includes("\r"), false);
  });

  it("un prompt propio escrito en CRLF se entrega en LF, con las reglas globales", () => {
    const capa = promptsTemporales({
      "global-rules.md": "# REGLAS\r\n\r\nUna regla.\r\n",
      "fase-1-descubrimiento.md": FASE_1.replace(/\n/g, "\r\n"),
    });

    const prompt = loadPhasePrompt(1, [capa]);

    assert.equal(prompt.includes("\r"), false);
    assert.ok(prompt.includes("# REGLAS\n\nUna regla."));
    assert.ok(prompt.includes("Cuerpo de la fase 1."));
  });

  it("los marcadores no llegan al prompt, ni de las reglas globales ni de la fase", () => {
    const capa = promptsTemporales({
      "global-rules.md": "## EVIDENCIA\n<!-- ranura: evidencia -->\nCita archivo:línea.\n<!-- /ranura -->\n",
      "fase-1-descubrimiento.md": `${FASE_1}\n## ROL\n<!-- ranura: rol -->\r\nEres analista.\r\n<!-- /ranura -->\n`,
    });

    const prompt = loadPhasePrompt(1, [capa]);

    assert.equal(prompt.includes("<!--"), false);
    assert.ok(prompt.includes("## EVIDENCIA\nCita archivo:línea."));
    assert.ok(prompt.includes("## ROL\nEres analista."));
  });

  // Hallazgo 15 de la auditoría de la Etapa 1: el Bloc de notas puede guardar con BOM, y con él
  // delante el frontmatter no se reconocía y llegaba en crudo al modelo.
  it("un prompt propio guardado con BOM conserva su frontmatter", () => {
    const capa = promptsTemporales({ "global-rules.md": "﻿# REGLAS\n", "fase-4-ejecucion.md": `﻿${FASE_4}` });

    const fases = discoverPhases([capa]);
    const prompt = loadPhasePrompt(4, [capa]);

    assert.equal(fases.get(4)?.documento, "04 - Ejecución.md");
    assert.equal(fases.get(4)?.recibos, "04 - Ejecución");
    assert.equal(prompt.includes("﻿"), false);
    assert.equal(prompt.includes("documento:"), false);
  });

  // Hallazgo 7: un marcador solo se quita si ocupa su línea entera. Lo que parece un marcador y
  // no se reconoce llega al modelo, así que queda en el log.
  it("un marcador con texto detrás, o dos en una línea, no se quitan y se avisan", (t) => {
    const log = t.mock.method(console, "error", () => {});
    const lineas = ["<!-- ranura: rol --> Eres X.", "<!-- ranura: rol --><!-- /ranura -->", "<!-- ranura: verificación -->"];

    for (const linea of lineas) {
      assert.equal(quitarMarcadores(`${linea}\n`), `${linea}\n`, linea);
    }

    const capa = promptsTemporales({ "fase-1-descubrimiento.md": `${FASE_1}\n${lineas.join("\n")}\n` });
    loadPhasePrompt(1, [capa]);

    assert.equal(log.mock.callCount(), 1);
    assert.match(String(log.mock.calls[0]?.arguments[0]), /marcador de ranura que no se reconoce/);
  });
});
