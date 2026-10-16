// Los prompts que se publican: que sus ranuras estén bien formadas y que el modelo nunca vea un
// marcador. Las reglas son las del mapa de ranuras del plan maestro v3 (§3.2):
//   1. Toda ranura abierta se cierra; no se anidan.
//   2. El nombre es único dentro de su archivo y pertenece al catálogo.
//   3. El encabezado "##" de la sección queda fuera de la ranura.
//   4. Los marcadores se quitan antes de entregar el prompt.
// Además, ningún marcador va dentro de un bloque de código: quitarMarcadores actúa por línea y
// lo quitaría también de ahí.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import { ensamblarFase } from "../src/capas.js";
import { defaultPromptsPath, fijarRaizDelPaquete } from "../src/config.js";
import { POLITICAS_COMMIT } from "../src/manifiesto.js";
import { PHASE_FILE_PATTERN, describePhaseFiles, discoverPhases, loadPhasePrompt } from "../src/phases.js";
import { crearProyecto, docsTemporales, limpiarEntorno } from "./helpers.js";

// Como en test/phases.test.ts: la capa de fábrica no se resuelve al repo desde build-test/.
const PROMPTS = path.join(process.cwd(), "prompts", "es");

// El catálogo de §3.2, por identificador de archivo (el de los bloques de la Etapa 3).
const CATALOGO: Record<string, string[]> = {
  global: ["cero-rupturas", "evidencia", "extra"],
  "fase-1": ["rol", "verificacion", "ejemplos"],
  "fase-2": ["rol", "verificacion", "ejemplos"],
  // La Etapa 4 (L08) suma las ranuras de las líneas de PROHIBIDO y AUTOVERIFICACIÓN que dependen de
  // una regla (deuda E3-D5): las variantes las sustituyen en vez de decir que "no aplican".
  "fase-3": ["rol", "comprobaciones", "lotes", "pruebas", "ejemplos", "prohibido-lotes", "autoverificacion-lotes"],
  "fase-4": ["rol", "verificacion", "pruebas", "lotes", "commits", "ejemplos", "prohibido-commits", "autoverificacion-commits"],
  "fase-5": ["rol", "pr", "ejemplos"],
};

const MARCADOR = /^[ \t]*<!--\s*(\/?)ranura(?:\s*:\s*([\w-]+))?\s*-->[ \t]*$/;
// Una valla de código se cierra solo con el mismo carácter y al menos la misma longitud, como en
// CommonMark: un ~~~ dentro de un bloque ``` no lo cierra.
const VALLA = /^[ \t]*(`{3,}|~{3,})/;
// Los ejemplos de PR de la Fase 5 van sin bloque de código, entre estas dos líneas, y sus "##"
// son parte del ejemplo, no secciones del prompt.
const EJEMPLO = /^--- (INICIO|FIN) EJEMPLO ---$/;

// Devuelve los incumplimientos, uno por línea afectada. Vacío si el texto está bien formado.
function revisarRanuras(texto: string, permitidas: string[]): string[] {
  const errores: string[] = [];
  const vistas = new Set<string>();
  let abierta: string | null = null;
  let valla: string | null = null;
  let ejemploDesde: number | null = null;

  for (const [i, linea] of texto.split(/\r?\n/).entries()) {
    const n = i + 1;
    const marca = linea.match(VALLA)?.[1];
    if (marca && !valla) valla = marca;
    else if (marca && valla && marca[0] === valla[0] && marca.length >= valla.length) valla = null;
    const enValla = valla !== null || marca !== undefined;

    const ejemplo = linea.match(EJEMPLO);
    if (ejemplo?.[1] === "INICIO") {
      if (ejemploDesde !== null) errores.push(`${n}: INICIO EJEMPLO sin cerrar el de la línea ${ejemploDesde}`);
      ejemploDesde = n;
    } else if (ejemplo?.[1] === "FIN") {
      if (ejemploDesde === null) errores.push(`${n}: FIN EJEMPLO sin INICIO`);
      ejemploDesde = null;
    }
    const enEjemplo = ejemploDesde !== null;

    const marcador = linea.match(MARCADOR);
    if (!marcador) {
      if (/<!--.*ranura/.test(linea)) errores.push(`${n}: marcador mal escrito`);
      if (abierta && !enValla && !enEjemplo && linea.startsWith("## ")) errores.push(`${n}: encabezado ## dentro de "${abierta}"`);
      continue;
    }

    if (enValla) errores.push(`${n}: marcador dentro de un bloque de código`);
    const [, cierre, nombre] = marcador;

    if (cierre) {
      if (!abierta) errores.push(`${n}: cierre sin ranura abierta`);
      abierta = null;
      continue;
    }

    if (abierta) errores.push(`${n}: "${nombre}" se abre dentro de "${abierta}"`);
    if (!nombre) {
      errores.push(`${n}: ranura sin nombre`);
    } else {
      if (!permitidas.includes(nombre)) errores.push(`${n}: "${nombre}" no está en el catálogo`);
      if (vistas.has(nombre)) errores.push(`${n}: "${nombre}" repetida`);
      vistas.add(nombre);
    }
    abierta = nombre ?? "(sin nombre)";
  }

  if (abierta) errores.push(`fin: "${abierta}" sin cerrar`);
  if (ejemploDesde !== null) errores.push(`fin: el ejemplo de la línea ${ejemploDesde} no tiene FIN EJEMPLO`);
  return errores;
}

// Los nombres de las ranuras que abre un texto, ordenados.
function ranurasEn(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.match(MARCADOR))
    .flatMap((marcador) => (marcador && !marcador[1] && marcador[2] ? [marcador[2]] : []))
    .sort();
}

function identificador(archivo: string): string | null {
  if (archivo === "global-rules.md") return "global";
  const fase = archivo.match(PHASE_FILE_PATTERN);
  return fase ? `fase-${fase[1]}` : null;
}

describe("revisarRanuras (el propio validador)", () => {
  const PERMITIDAS = ["rol", "ejemplos"];

  it("acepta ranuras bien formadas, con el encabezado fuera", () => {
    const texto = "## ROL\n<!-- ranura: rol -->\nEres X.\n### Sub\n<!-- /ranura -->\n\n## EJEMPLOS\n<!-- ranura: ejemplos -->\nA\n<!-- /ranura -->\n";

    assert.deepEqual(revisarRanuras(texto, PERMITIDAS), []);
  });

  const malos: Array<[string, string, RegExp]> = [
    ["sin cerrar", "<!-- ranura: rol -->\nA\n", /sin cerrar/],
    ["cierre suelto", "A\n<!-- /ranura -->\n", /cierre sin ranura/],
    ["anidada", "<!-- ranura: rol -->\n<!-- ranura: ejemplos -->\n<!-- /ranura -->\n<!-- /ranura -->\n", /se abre dentro/],
    ["repetida", "<!-- ranura: rol -->\n<!-- /ranura -->\n<!-- ranura: rol -->\n<!-- /ranura -->\n", /repetida/],
    ["fuera del catálogo", "<!-- ranura: inventada -->\n<!-- /ranura -->\n", /catálogo/],
    ["sin nombre", "<!-- ranura -->\n<!-- /ranura -->\n", /sin nombre/],
    ["encabezado dentro", "<!-- ranura: rol -->\n## ROL\n<!-- /ranura -->\n", /encabezado/],
    ["dentro de un bloque de código", "```markdown\n<!-- ranura: rol -->\n```\n", /bloque de código/],
    ["mal escrito", "<!-- ranura rol -->\n", /mal escrito/],
  ];

  for (const [caso, texto, motivo] of malos) {
    it(`detecta una ranura ${caso}`, () => {
      assert.match(revisarRanuras(texto, PERMITIDAS).join("\n"), motivo);
    });
  }

  it("un ## dentro de un bloque de código de una ranura no cuenta como encabezado", () => {
    const texto = "<!-- ranura: rol -->\n```markdown\n## Qué se hizo\n```\n<!-- /ranura -->\n";

    assert.deepEqual(revisarRanuras(texto, PERMITIDAS), []);
  });

  it("un ## dentro de un ejemplo delimitado tampoco cuenta, pero sí al salir de él", () => {
    const dentro = "<!-- ranura: ejemplos -->\n--- INICIO EJEMPLO ---\n## Cambios\n--- FIN EJEMPLO ---\n<!-- /ranura -->\n";
    const despues = "<!-- ranura: ejemplos -->\n--- INICIO EJEMPLO ---\n--- FIN EJEMPLO ---\n## ENTREGA\n<!-- /ranura -->\n";

    assert.deepEqual(revisarRanuras(dentro, PERMITIDAS), []);
    assert.match(revisarRanuras(despues, PERMITIDAS).join("\n"), /encabezado/);
  });

  // Hallazgo 8 de la auditoría de la Etapa 1: un ejemplo sin FIN eximía el resto del archivo, y
  // un ~~~ cerraba un bloque abierto con ```.
  it("un ejemplo sin FIN, o un FIN suelto, es un error", () => {
    assert.match(revisarRanuras("--- INICIO EJEMPLO ---\n## Cambios\n", PERMITIDAS).join("\n"), /no tiene FIN EJEMPLO/);
    assert.match(revisarRanuras("--- FIN EJEMPLO ---\n", PERMITIDAS).join("\n"), /sin INICIO/);
  });

  it("una valla solo la cierra otra del mismo tipo", () => {
    const texto = "<!-- ranura: rol -->\n```markdown\n~~~\n## Dentro del bloque\n```\n## Fuera\n<!-- /ranura -->\n";

    assert.deepEqual(revisarRanuras(texto, PERMITIDAS), ['6: encabezado ## dentro de "rol"']);
  });
});

describe("prompts publicados", () => {
  const archivos = fs.readdirSync(PROMPTS).filter((archivo) => archivo.endsWith(".md")).sort();

  // Etapa 3, L01: los de fábrica viven en una subcarpeta por idioma. Un prompt que se quedara en
  // la raíz de prompts/ ya no lo lee nadie, y se publicaría igual.
  it("los prompts de fábrica viven en prompts/es/ y no queda ninguno suelto en prompts/", () => {
    const raiz = path.dirname(PROMPTS);
    const sueltos = fs.readdirSync(raiz, { withFileTypes: true }).filter((entrada) => entrada.isFile());

    assert.deepEqual(sueltos.map((entrada) => entrada.name), []);
    assert.equal(fs.existsSync(path.join(raiz, "comandos")), false, "prompts/comandos/ debía moverse a prompts/es/comandos/");
    assert.ok(path.resolve(defaultPromptsPath()).endsWith(path.join("prompts", "es")));
    assert.ok(archivos.includes("global-rules.md"));
  });

  it("cada prompt es de un archivo del catálogo", () => {
    for (const archivo of archivos) {
      assert.ok(identificador(archivo), `${archivo} no es global-rules.md ni una fase`);
    }
  });

  // Mientras los prompts no tengan ranuras (llegan en L04 a L08), pasa con cero.
  for (const archivo of archivos) {
    it(`las ranuras de ${archivo} están bien formadas`, () => {
      const permitidas = CATALOGO[identificador(archivo) ?? ""] ?? [];
      const texto = fs.readFileSync(path.join(PROMPTS, archivo), "utf-8");

      assert.deepEqual(revisarRanuras(texto, permitidas), []);
    });
  }

  // Hallazgo 8: comprobar solo que cada ranura fuera del catálogo dejaba pasar que se borrara una.
  // Cada archivo tiene exactamente las de su catálogo, y entre todos son las 23 de §3.2 y §5.3.5 (la Etapa 3 suma `global/extra`)
  // más las 4 de la Etapa 4.
  it("cada prompt tiene exactamente las ranuras de su catálogo, 27 en total", () => {
    let total = 0;
    for (const archivo of archivos) {
      const id = identificador(archivo) ?? "";
      const encontradas = ranurasEn(fs.readFileSync(path.join(PROMPTS, archivo), "utf-8"));

      assert.deepEqual(encontradas, [...(CATALOGO[id] ?? [])].sort(), archivo);
      total += encontradas.length;
    }
    assert.equal(total, 27);
  });

  for (const fase of [1, 2, 3, 4, 5]) {
    it(`get_phase_prompt(${fase}) no entrega ningún comentario HTML`, () => {
      assert.equal(loadPhasePrompt(fase, [PROMPTS]).includes("<!--"), false);
    });
  }

  // L05 (#39 y #40 en las Fases 1 y 2): cada fase ancla Base y Pendientes con frases cortas, y
  // marca como ranura su rol, su verificación y sus ejemplos.
  const leer = (archivo: string): string => fs.readFileSync(path.join(PROMPTS, archivo), "utf-8");

  it("la Fase 1 marca sus ranuras y pide la Base de cada decisión", () => {
    const texto = leer("fase-1-descubrimiento.md");

    assert.deepEqual(ranurasEn(texto), ["ejemplos", "rol", "verificacion"]);
    for (const fragmento of [
      "- **Base:** ver BASE DE CADA DECISIÓN en las reglas globales.",
      "| Validaciones pendientes | no hubo acceso para comprobar algo, o una medición sale de una fuente",
      "- Una decisión `D<n>` sin línea **Base**, o marcada `medido` sin fuente y vigencia.",
      "8. ¿Cada `D<n>` tiene su línea **Base**",
      "10. Si la fase cerró con lagunas, ¿están bajo `## Validaciones pendientes`",
    ]) {
      assert.ok(texto.includes(fragmento), `falta: ${fragmento}`);
    }
    assert.equal(texto.includes("app/Models/Ejemplo.php"), false, "el ejemplo sigue siendo de un framework concreto");
  });

  it("la Fase 2 abre con los pendientes heredados y lleva la Base en la tabla y en el bloque", () => {
    const texto = leer("fase-2-decisiones.md");

    assert.deepEqual(ranurasEn(texto), ["ejemplos", "rol", "verificacion"]);
    for (const fragmento of [
      "0. **Revisa los pendientes heredados de la Fase 1**",
      "| # | Tema | Decisión | Fundamento | Base |",
      "- **Base:** ver BASE DE CADA DECISIÓN en las reglas globales.",
      "**Empieza por las decisiones que la Fase 1 marcó como `inferido`**",
      "| Validaciones pendientes | quedó algo sin comprobar o sin decidir.",
      "- Plantear decisiones sin haber nombrado antes los pendientes heredados de la Fase 1.",
      "10. ¿Abrí nombrando los pendientes heredados de la Fase 1",
    ]) {
      assert.ok(texto.includes(fragmento), `falta: ${fragmento}`);
    }
  });

  // L06: en la Fase 3 los lotes son estructurales. La sección condicional "Etapas con commits
  // separados" desaparece y la política de pruebas se junta en una sola ranura.
  it("la Fase 3 planea por lotes y junta las pruebas en PRUEBAS Y PARIDAD", () => {
    const texto = leer("fase-3-plan-tecnico.md");
    const prompt = loadPhasePrompt(3, [PROMPTS]);

    assert.deepEqual(ranurasEn(texto), ["autoverificacion-lotes", "comprobaciones", "ejemplos", "lotes", "prohibido-lotes", "pruebas", "rol"]);
    assert.equal(/etapas con commits separados/i.test(prompt), false, "sigue la sección condicional de etapas");
    assert.equal(prompt.includes("No hay suite de pruebas automatizadas en el proyecto"), false, "sigue afirmando que no hay suite");
    for (const fragmento of [
      "\n## LOTES\n",
      "\n## PRUEBAS Y PARIDAD\n",
      "lotes: 3",
      "| Lote | Repo | Objetivo | Pasos | Criterio de salida | Commit propuesto | Revierte solo |",
      "8. **Lotes.** La tabla de LOTES. Cada paso pertenece a exactamente un lote.",
      "**Antes de verificar nada, revisa los pendientes heredados**",
      "- Escribir el plan sin la tabla de lotes, o sin el frontmatter `lotes: N`.",
      "12. ¿El documento empieza con el frontmatter `lotes: N`",
    ]) {
      assert.ok(prompt.includes(fragmento), `falta: ${fragmento.trim()}`);
    }
  });

  // L07 de la Etapa 1: la Fase 4 ejecuta lote por lote, con un recibo y un commit con OK por lote.
  // L08 de la Etapa 4: los recibos y el documento de la fase los escribe record_batch; el prompt ya
  // no trae la plantilla del recibo ni la del índice, y el ciclo se apoya en get_batch_status.
  it("la Fase 4 ejecuta por lotes con record_batch, y el commit con el OK del usuario", () => {
    const texto = leer("fase-4-ejecucion.md");
    const fases = discoverPhases([PROMPTS]);
    const prompt = `${loadPhasePrompt(4, [PROMPTS])}\n\n${describePhaseFiles(fases, 4)}`;

    assert.deepEqual(ranurasEn(texto), ["autoverificacion-commits", "commits", "ejemplos", "lotes", "prohibido-commits", "pruebas", "rol", "verificacion"]);
    for (const quitado of [
      "## NO SUBES NADA",
      "## EL DOCUMENTO\n",
      "El proyecto no tiene suite.",
      "¿Hice commit o subí algo? No debí.",
      "commit: pendiente | <hash corto> | no aplica",
      "### Plantilla del recibo",
      "### Índice de cierre",
      "Con un solo lote no hay subcarpeta",
      "Guárdalo con `write_central_doc`",
    ]) {
      assert.equal(prompt.includes(quitado), false, `sigue: ${quitado.trim()}`);
    }
    for (const fragmento of [
      "\n## ANTES DEL PRIMER LOTE: PENDIENTES HEREDADOS\n",
      "\n## LOTES Y RECIBOS\n",
      "\n## COMMITS\n",
      "\n### Pruebas\n",
      "**nunca escribas recibos ni el documento de esta fase con `write_central_doc`**",
      "1. **Mira dónde vas:** `get_batch_status` te dice qué lote toca",
      "4. **Regístralo ANTES del commit:** `record_batch` con `lote`, `titulo`",
      "6. **Ancla el lote:** `record_batch` con `lote` y `commit` (el hash).",
      "`record_batch` con `cerrar_fase: true` y `motivo_descarte`",
      "`reanclar: true`",
      "Los recibos de lote van en la subcarpeta `04 - Ejecución/`, uno por lote",
      "Lo genera `record_batch` al cerrar el último lote: no lo escribas con `write_central_doc`.",
      "`git add -A`, `git add .`, `git add -u`, una carpeta entera ni `git commit -a`",
      "no uses `--amend`",
      "**Antes del primer commit de la fase**, comprueba en qué rama estás (`git branch --show-current`)",
      "15. ¿Comprobé la rama antes del primer commit, y coincidía con la del plan?",
      "Nunca hagas `push`, no crees ni cambies de rama y no abras un PR.",
      "- Hacer push, crear o cambiar de rama, o abrir un PR.",
      "- Escribir recibos o el documento de esta fase con `write_central_doc`: los escribe `record_batch`.",
      "14. ¿Cada commit tuvo el OK del usuario, llevó solo los archivos de su lote y no hubo ningún push?",
      "13. ¿Las decisiones nuevas tienen su **Base**?",
    ]) {
      assert.ok(prompt.includes(fragmento), `falta: ${fragmento.trim()}`);
    }
  });

  // L08 de la Etapa 1: la Fase 5 trata los pendientes sin comprobar como bloqueantes, con su propio
  // PROHIBIDO y su AUTOVERIFICACIÓN. L08 de la Etapa 4: la entrada son los commits que lista el
  // servidor al final del prompt (COMMITS DE LA FASE 4), no los que el modelo saque de los recibos.
  it("la Fase 5 audita los commits que lista el servidor y bloquea con pendientes sin comprobar", () => {
    const texto = leer("fase-5-auditoria-pr.md");
    const prompt = loadPhasePrompt(5, [PROMPTS]);

    assert.deepEqual(ranurasEn(texto), ["ejemplos", "pr", "rol"]);
    assert.equal(prompt.includes("el usuario te indicará los commits o el rango"), false, "la entrada sigue siendo solo la del usuario");
    assert.equal(prompt.includes("los commits que registran los recibos"), false, "la entrada sigue saliendo de los recibos");
    for (const fragmento of [
      '1. ENTRADA: los commits que lista el servidor al final de este prompt, en "COMMITS DE LA FASE 4". Si el usuario indica otro rango, manda el suyo, y dilo si no coincide.',
      "\n## ANTES DE AUDITAR: PENDIENTES HEREDADOS\n",
      "y no hay constancia de que el usuario lo comprobó, es **BLOQUEANTE**.",
      "\n### PROHIBIDO (auditoría)\n",
      '- Auditar commits distintos de los que lista el servidor en "COMMITS DE LA FASE 4" sin decirlo.',
      "\n### AUTOVERIFICACIÓN (auditoría)\n",
      "3. ¿Los commits auditados coinciden con los que lista el servidor? Si no, ¿lo dije?",
    ]) {
      assert.ok(prompt.includes(fragmento), `falta: ${fragmento.trim()}`);
    }
    // Lo nuevo de la auditoría va antes de SALIDA 2, no dentro del contrato del PR.
    assert.ok(prompt.indexOf("### PROHIBIDO (auditoría)") < prompt.indexOf("## SALIDA 2"));
  });

  // L04 (#39 y #40): se escriben una vez en las reglas globales, que se anteponen a cada fase.
  for (const fase of [1, 2, 3, 4, 5]) {
    it(`get_phase_prompt(${fase}) trae la base de cada decisión y los pendientes heredados`, () => {
      const prompt = loadPhasePrompt(fase, [PROMPTS]);

      for (const encabezado of ["## EVIDENCIA", "## BASE DE CADA DECISIÓN", "## PENDIENTES HEREDADOS"]) {
        assert.ok(prompt.includes(`\n${encabezado}\n`), `falta ${encabezado}`);
      }
    });
  }
});

// L08 de la Etapa 4, sobre los prompts ensamblados de verdad: con cada preset del paquete y cada
// combinación de reglas (las cuatro políticas de commits, con y sin lotes).
describe("prompts de la Fase 4 ensamblados con cada preset y cada regla", () => {
  const RAIZ = process.cwd();
  const PRESETS = ["software", ...fs.readdirSync(path.join(RAIZ, "presets", "es")).filter((a) => a.endsWith(".md")).map((a) => a.slice(0, -3))];
  afterEach(() => {
    limpiarEntorno();
    fijarRaizDelPaquete(null);
  });

  function ensamblar(fase: number, preset: string, commits: string, lotes: boolean): string {
    fijarRaizDelPaquete(RAIZ);
    const docs = docsTemporales();
    crearProyecto(docs, "P");
    fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, preset, reglas: { commits, lotes } }), "utf-8");
    return ensamblarFase(fase, "P", null, { incluirConfigProyecto: false }).texto;
  }

  const combinaciones = PRESETS.flatMap((preset) => POLITICAS_COMMIT.flatMap((commits) => [true, false].map((lotes) => ({ preset, commits, lotes }))));

  it("hay presets y combinaciones que comprobar", () => {
    assert.ok(PRESETS.length >= 6 && combinaciones.length >= 48, `${PRESETS.length} presets, ${combinaciones.length} combinaciones`);
  });

  // Toda mención de write_central_doc en la Fase 4 es para decir que NO se use con los recibos ni con el
  // documento de la fase: el servidor los rechaza (L05), así que pedirlo sería mandar al modelo contra un muro.
  it("ningún prompt de la Fase 4 pide escribir recibos o el documento de la fase con write_central_doc", () => {
    const NEGATIVA = /nunca escribas|no lo escribas|sin usar `write_central_doc`|^- Escribir recibos o el documento de esta fase con `write_central_doc`: los escribe `record_batch`\.$/;
    for (const { preset, commits, lotes } of combinaciones) {
      const texto = ensamblar(4, preset, commits, lotes);
      const caso = `${preset}, commits ${commits}, lotes ${lotes}`;
      const menciones = texto.split("\n").filter((linea) => linea.includes("write_central_doc"));
      assert.ok(menciones.length >= 3, `${caso}: deberían quedar las tres negativas`);
      for (const linea of menciones) assert.match(linea, NEGATIVA, `${caso}: ${linea}`);
      for (const resto of ["commit: pendiente | <hash corto>", "Escribe su recibo", "Actualiza el recibo con el hash", "lo que este prompt dice en PROHIBIDO"]) {
        assert.equal(texto.includes(resto), false, `${caso}: sigue «${resto}»`);
      }
      assert.ok(texto.includes("record_batch") && texto.includes("get_batch_status"), caso);
    }
  });

  // Deuda E3-D5 (b): las líneas de PROHIBIDO y AUTOVERIFICACIÓN que dependen de una regla son ranuras, y
  // cada variante pone las suyas en vez de avisar de que "no aplican".
  it("cada política pone sus propias líneas de PROHIBIDO y AUTOVERIFICACIÓN sobre los commits", () => {
    const esperado: Record<string, [string, string]> = {
      "agente-commitea-con-OK": ["- Hacer un commit sin el OK del usuario", "14. ¿Cada commit tuvo el OK del usuario"],
      "agente-propone": ["- Ejecutar `git add`, `git commit` o `git push`: con esta política el commit lo hace el usuario", "14. ¿Propuse cada commit con la lista exacta de archivos"],
      auto: ["- Hacer el commit de un lote que no quedó `verificado`", "14. ¿Cada commit fue de un lote verificado"],
      ninguno: ["- Ejecutar comandos de git que escriben", "14. ¿Me detuve al cerrar cada lote"],
    };
    for (const [commits, [prohibido, autoverificacion]] of Object.entries(esperado)) {
      const texto = ensamblar(4, "software", commits, true);
      const prohibidos = texto.slice(texto.indexOf("## PROHIBIDO"), texto.indexOf("## MARCAS DE CALIDAD"));
      assert.ok(prohibidos.includes(prohibido), `${commits}: falta «${prohibido}»`);
      assert.ok(texto.slice(texto.indexOf("## AUTOVERIFICACIÓN")).includes(autoverificacion), `${commits}: falta «${autoverificacion}»`);
      if (commits !== "agente-commitea-con-OK") assert.equal(prohibidos.includes("Hacer un commit sin el OK del usuario"), false, commits);
    }
  });

  it("sin lotes, la Fase 3 pide solo el frontmatter `lotes: 1` y la Fase 4 añade su ciclo de un lote", () => {
    const fase3 = ensamblar(3, "software", "agente-commitea-con-OK", false);
    assert.ok(fase3.includes("- Escribir el plan sin el frontmatter `lotes: 1`."));
    assert.ok(fase3.includes("12. ¿El documento empieza con el frontmatter `lotes: 1`?"));
    assert.equal(fase3.includes("Escribir el plan sin la tabla de lotes"), false);

    const fase4 = ensamblar(4, "software", "agente-commitea-con-OK", false);
    assert.ok(fase4.includes("1. **Mira dónde vas:** `get_batch_status`"), "el bloque de sin-lotes va después del ciclo, no en su lugar");
    assert.ok(fase4.includes("El plan tiene un solo lote (`lotes: 1`). Sigue el mismo ciclo una sola vez"));
  });
});
