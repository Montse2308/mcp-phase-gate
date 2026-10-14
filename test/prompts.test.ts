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
