// Los prompts en inglés (§8.4 del plan maestro v3) frente a sus gemelos en español: mismas ranuras en el
// mismo orden, mismo número de puntos en cada PROHIBIDO / FORBIDDEN y AUTOVERIFICACIÓN / SELF-CHECK, mismos
// bloques en las variantes de regla, y un proyecto en inglés los ensambla sin avisos con cada regla. El
// test de contrato del vocabulario (test/vocabulario.test.ts) comprueba los encabezados y los nombres.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { parsearBloques, ranurasDe } from "../src/bloques.js";
import { ensamblarFase } from "../src/capas.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import { POLITICAS_COMMIT } from "../src/manifiesto.js";
import { separarFrontmatter } from "../src/phases.js";
import { crearProyecto, docsTemporales, limpiarEntorno } from "./helpers.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ES = path.join(RAIZ, "prompts", "es");
const EN = path.join(RAIZ, "prompts", "en");

const GEMELOS: [string, string][] = [
  ["global-rules.md", "global-rules.md"],
  ["fase-1-descubrimiento.md", "phase-1-discovery.md"],
  ["fase-2-decisiones.md", "phase-2-decisions.md"],
  ["fase-3-plan-tecnico.md", "phase-3-technical-plan.md"],
  ["fase-4-ejecucion.md", "phase-4-execution.md"],
  ["fase-5-auditoria-pr.md", "phase-5-audit.md"],
];

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

function leer(carpeta: string, archivo: string): string {
  return fs.readFileSync(path.join(carpeta, archivo), "utf-8").replace(/\r\n/g, "\n");
}

// Las secciones de reglas que se cuentan, en el orden del archivo, con su número de puntos (- o N.).
const SECCION_ES = /^#{2,3} (PROHIBIDO|AUTOVERIFICACIÓN)\b/;
const SECCION_EN = /^#{2,3} (FORBIDDEN|SELF-CHECK)\b/;

function puntosPorSeccion(texto: string, cabecera: RegExp): [string, number][] {
  const resultado: [string, number][] = [];
  let actual: [string, number] | null = null;
  for (const linea of texto.split("\n")) {
    if (/^#{2,3} /.test(linea)) {
      if (actual) resultado.push(actual);
      const m = linea.match(cabecera);
      actual = m ? [m[1]!, 0] : null;
      continue;
    }
    if (actual && /^(?:- |\d+\. )/.test(linea)) actual[1]++;
  }
  if (actual) resultado.push(actual);
  return resultado;
}

describe("prompts en inglés: paridad con el español", () => {
  for (const [es, en] of GEMELOS) {
    it(`${en}: las mismas ranuras, en el mismo orden`, () => {
      const deEs = ranurasDe(separarFrontmatter(leer(ES, es)).cuerpo).map((r) => r.nombre);
      const deEn = ranurasDe(separarFrontmatter(leer(EN, en)).cuerpo).map((r) => r.nombre);
      assert.deepEqual(deEn, deEs);
      // En inglés, con la palabra y el alias ingleses: ningún marcador en español.
      assert.ok(!/<!--\s*\/?ranura/.test(leer(EN, en)), "queda un marcador `ranura`");
    });

    it(`${en}: el mismo número de puntos en cada PROHIBIDO y AUTOVERIFICACIÓN`, () => {
      const deEs = puntosPorSeccion(leer(ES, es), SECCION_ES).map(([, n]) => n);
      const deEn = puntosPorSeccion(leer(EN, en), SECCION_EN).map(([, n]) => n);
      assert.deepEqual(deEn, deEs);
      if (es !== "global-rules.md") assert.ok(deEs.length >= 2, `${es}: ${deEs.length} secciones`);
    });

    it(`${en}: el mismo número de ejemplos delimitados`, () => {
      const contar = (texto: string, marca: RegExp) => texto.split("\n").filter((l) => marca.test(l)).length;
      assert.equal(contar(leer(EN, en), /^--- BEGIN EXAMPLE ---$/), contar(leer(ES, es), /^--- INICIO EJEMPLO ---$/));
      assert.equal(contar(leer(EN, en), /^--- END EXAMPLE ---$/), contar(leer(ES, es), /^--- FIN EJEMPLO ---$/));
    });
  }

  it("las variantes de regla tienen los mismos bloques, con los mismos modos y el mismo número de puntos", () => {
    const capa = { orden: 2.5 as const, etiqueta: "reglas" as const, ruta: "" };
    const enEs = fs.readdirSync(path.join(ES, "reglas")).sort();
    assert.deepEqual(fs.readdirSync(path.join(EN, "reglas")).sort(), enEs);
    for (const archivo of enEs) {
      const deEs = parsearBloques(leer(path.join(ES, "reglas"), archivo), archivo, capa);
      const deEn = parsearBloques(leer(path.join(EN, "reglas"), archivo), archivo, capa);
      assert.deepEqual(deEn.avisos, []);
      assert.deepEqual(deEn.bloques.map((b) => [b.id, b.modo]), deEs.bloques.map((b) => [b.id, b.modo]), archivo);
      const puntos = (contenido: string) => contenido.split("\n").filter((l) => /^(?:- |\d+\. )/.test(l)).map((l) => l.match(/^(\d+)\./)?.[1] ?? "-");
      for (const [i, bloque] of deEn.bloques.entries()) {
        assert.deepEqual(puntos(bloque.contenido), puntos(deEs.bloques[i]!.contenido), `${archivo}: ${bloque.id}`);
      }
    }
  });

  it("los comandos /f1…/f5 existen en commands/ y nombran la fase en inglés", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const texto = leer(path.join(EN, "commands"), `f${n}.md`);
      assert.match(texto, new RegExp(`PHASE ${n}\\b`));
      assert.match(texto, new RegExp(`get_phase_prompt\\(${n}\\)`));
    }
  });
});

describe("prompts en inglés: un proyecto en inglés los ensambla", () => {
  it("cada fase, con cada política de commits y con y sin lotes: sin avisos, sin marcadores y sin restos en español", () => {
    fijarRaizDelPaquete(RAIZ);
    const docs = docsTemporales();
    crearProyecto(docs, "P");
    for (const commits of POLITICAS_COMMIT) {
      for (const lotes of [true, false]) {
        fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, idioma: "en", reglas: { commits, lotes } }));
        for (const fase of [1, 2, 3, 4, 5]) {
          const { texto, avisos } = ensamblarFase(fase, "P", null);
          const donde = `fase ${fase} · ${commits} · lotes ${lotes}`;
          assert.deepEqual(avisos, [], donde);
          assert.ok(!/<!--\s*\/?(?:slot|ranura|block|bloque)\b/.test(texto), `${donde}: queda un marcador`);
          assert.ok(!/\b(?:Fase \d|Documentación|recibos de lote|nombres exactos|CONFIGURACIÓN)\b/.test(texto), `${donde}: queda texto del servidor en español`);
          assert.match(texto, /## PROJECT CONFIGURATION/);
          // La prohibición del push no depende de ninguna regla (P1).
          if (fase === 4) assert.match(texto, /push/i, donde);
        }
      }
    }
  });

  it("los nombres de los documentos que da el servidor son los ingleses", () => {
    fijarRaizDelPaquete(RAIZ);
    const docs = docsTemporales();
    crearProyecto(docs, "P");
    fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, idioma: "en" }));
    const texto = ensamblarFase(5, "P", null).texto;
    assert.match(texto, /## FILES OF THIS TASK \(exact names\)/);
    for (const nombre of ["01 - Technical Analysis.md", "03 - Technical Plan.md", "04 - Execution.md", "05 - Audit.md"]) assert.ok(texto.includes(nombre), nombre);
  });
});
