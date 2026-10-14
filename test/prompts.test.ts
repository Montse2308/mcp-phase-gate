// Los prompts que se publican: que sus ranuras estén bien formadas y que el modelo nunca vea un
// marcador. Las reglas son las del mapa de ranuras del plan maestro v3 (§3.2):
//   1. Toda ranura abierta se cierra; no se anidan.
//   2. El nombre es único dentro de su archivo y pertenece al catálogo.
//   3. El encabezado "##" de la sección queda fuera de la ranura.
//   4. Los marcadores se quitan antes de entregar el prompt.
// Además, ningún marcador va dentro de un bloque de código: quitarMarcadores actúa por línea y
// lo quitaría también de ahí.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import { PHASE_FILE_PATTERN, loadPhasePrompt } from "../src/phases.js";

// Como en test/phases.test.ts: la capa de fábrica no se resuelve al repo desde build-test/.
const PROMPTS = path.join(process.cwd(), "prompts");

// El catálogo de §3.2, por identificador de archivo (el de los bloques de la Etapa 3).
const CATALOGO: Record<string, string[]> = {
  global: ["cero-rupturas", "evidencia"],
  "fase-1": ["rol", "verificacion", "ejemplos"],
  "fase-2": ["rol", "verificacion", "ejemplos"],
  "fase-3": ["rol", "comprobaciones", "lotes", "pruebas", "ejemplos"],
  "fase-4": ["rol", "verificacion", "pruebas", "lotes", "commits", "ejemplos"],
  "fase-5": ["rol", "pr", "ejemplos"],
};

const MARCADOR = /^[ \t]*<!--\s*(\/?)ranura(?:\s*:\s*([\w-]+))?\s*-->[ \t]*$/;
const VALLA = /^[ \t]*(```|~~~)/;

// Devuelve los incumplimientos, uno por línea afectada. Vacío si el texto está bien formado.
function revisarRanuras(texto: string, permitidas: string[]): string[] {
  const errores: string[] = [];
  const vistas = new Set<string>();
  let abierta: string | null = null;
  let enValla = false;

  for (const [i, linea] of texto.split(/\r?\n/).entries()) {
    const n = i + 1;
    if (VALLA.test(linea)) enValla = !enValla;

    const marcador = linea.match(MARCADOR);
    if (!marcador) {
      if (/<!--.*ranura/.test(linea)) errores.push(`${n}: marcador mal escrito`);
      if (abierta && !enValla && linea.startsWith("## ")) errores.push(`${n}: encabezado ## dentro de "${abierta}"`);
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
  return errores;
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
});

describe("prompts publicados", () => {
  const archivos = fs.readdirSync(PROMPTS).filter((archivo) => archivo.endsWith(".md")).sort();

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

  for (const fase of [1, 2, 3, 4, 5]) {
    it(`get_phase_prompt(${fase}) no entrega ningún comentario HTML`, () => {
      assert.equal(loadPhasePrompt(fase, [PROMPTS]).includes("<!--"), false);
    });
  }

  // L05 (#39 y #40 en las Fases 1 y 2): cada fase ancla Base y Pendientes con frases cortas, y
  // marca como ranura su rol, su verificación y sus ejemplos.
  const leer = (archivo: string): string => fs.readFileSync(path.join(PROMPTS, archivo), "utf-8");
  const ranurasDe = (texto: string): string[] =>
    texto
      .split(/\r?\n/)
      .map((linea) => linea.match(MARCADOR))
      .flatMap((marcador) => (marcador && !marcador[1] && marcador[2] ? [marcador[2]] : []))
      .sort();

  it("la Fase 1 marca sus ranuras y pide la Base de cada decisión", () => {
    const texto = leer("fase-1-descubrimiento.md");

    assert.deepEqual(ranurasDe(texto), ["ejemplos", "rol", "verificacion"]);
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

    assert.deepEqual(ranurasDe(texto), ["ejemplos", "rol", "verificacion"]);
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

    assert.deepEqual(ranurasDe(texto), ["comprobaciones", "ejemplos", "lotes", "pruebas", "rol"]);
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
