// Los presets que trae el paquete (§5.5 del plan maestro v3): bien formados, sin bloques huérfanos,
// y cada uno ensambla las cinco fases sin dejar marcadores para el modelo.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { leerBloques } from "../src/bloques.js";
import { ensamblarFase, revisarBloques } from "../src/capas.js";
import type { Capa } from "../src/capas.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import { POLITICAS_COMMIT, presetsDisponibles } from "../src/manifiesto.js";
import { separarFrontmatter } from "../src/phases.js";
import { crearProyecto, docsTemporales, limpiarEntorno } from "./helpers.js";

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRESETS = path.join(RAIZ, "presets", "es");
const FABRICA: Capa = { orden: 1, etiqueta: "fábrica", ruta: path.join(RAIZ, "prompts", "es") };

const ARCHIVOS = fs.readdirSync(PRESETS).filter((archivo) => archivo.endsWith(".md")).sort();

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

function conPreset(preset: string): void {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  crearProyecto(docs, "PROYECTO-A");
  fs.writeFileSync(path.join(docs, "PROYECTO-A", "phase-gate.json"), JSON.stringify({ version: 1, preset }), "utf-8");
}

describe("presets publicados", () => {
  it("son los cinco del plan, y software sigue existiendo sin archivo", () => {
    assert.deepEqual(ARCHIVOS, ["ai-agent-ops.md", "multi-repo-feature.md", "research-ops.md", "software-replica.md", "software-tdd.md"]);

    fijarRaizDelPaquete(RAIZ);
    assert.deepEqual([...presetsDisponibles().keys()].sort(), ["ai-agent-ops", "multi-repo-feature", "research-ops", "software", "software-replica", "software-tdd"]);
  });

  for (const archivo of ARCHIVOS) {
    const nombre = archivo.slice(0, -3);

    it(`${nombre}: su cabecera tiene nombre, descripción, lotes y una política de commits válida`, () => {
      const { meta } = separarFrontmatter(fs.readFileSync(path.join(PRESETS, archivo), "utf-8"));

      assert.equal(meta.nombre, nombre);
      assert.ok((meta.descripcion ?? "").length > 20, "sin descripción");
      assert.ok(meta.lotes === "true" || meta.lotes === "false", `lotes: ${meta.lotes}`);
      assert.ok((POLITICAS_COMMIT as readonly string[]).includes(meta.commits ?? ""), `commits: ${meta.commits}`);
    });

    it(`${nombre}: ningún bloque huérfano, duplicado ni mal formado`, () => {
      const capa: Capa = { orden: 2, etiqueta: "preset", ruta: path.join(PRESETS, archivo) };

      assert.ok(leerBloques(capa.ruta, capa).bloques.length > 0, "no tiene ningún bloque");
      assert.deepEqual(revisarBloques([FABRICA, capa]), []);
    });

    it(`${nombre}: ensambla las cinco fases sin <!-- en la salida y sin avisos`, () => {
      conPreset(nombre);

      for (const fase of [1, 2, 3, 4, 5]) {
        const { texto, avisos } = ensamblarFase(fase, "PROYECTO-A");
        assert.deepEqual(avisos, [], `fase ${fase}`);
        assert.equal(texto.includes("<!--"), false, `fase ${fase} deja un comentario HTML`);
        assert.ok(texto.includes(`- Preset: \`${nombre}\` (del proyecto)`), `fase ${fase}`);
      }
    });
  }
});

describe("lo que cambia cada preset", () => {
  it("software-tdd: el plan exige una prueba en rojo por lote y la ejecución sigue rojo, verde, suite", () => {
    conPreset("software-tdd");

    assert.ok(ensamblarFase(3, "PROYECTO-A").texto.includes("## PRUEBAS Y PARIDAD\nEste proyecto trabaja con pruebas primero."));
    assert.ok(ensamblarFase(4, "PROYECTO-A").texto.includes("### Pruebas\nCiclo por lote, en este orden"));
  });

  it("multi-repo-feature: suma contratos, orden entre repositorios y un PR por repo, sin quitar nada", () => {
    conPreset("multi-repo-feature");
    const fase3 = ensamblarFase(3, "PROYECTO-A").texto;
    const base3 = ensamblarFase(3, null).texto;

    assert.ok(fase3.includes("y quién más consume lo que vas a tocar.\n\nEn esta tarea, además, comprueba **cada contrato"));
    assert.ok(fase3.includes("**Orden entre repositorios.**"));
    assert.ok(fase3.length > base3.length);
    assert.ok(ensamblarFase(5, "PROYECTO-A").texto.includes("**Varios repositorios.** Entrega **una descripción de PR por repositorio**"));
  });

  it("ai-agent-ops: evidencia con transcript, batería de casos y la auditoría de regresión antes del PR", () => {
    conPreset("ai-agent-ops");
    const fase5 = ensamblarFase(5, "PROYECTO-A").texto;

    assert.ok(fase5.includes("para el comportamiento del agente, un **transcript o log real**"));
    assert.ok(fase5.includes("- En un agente, \"romper\" también es cambiar su comportamiento fuera del alcance"));
    assert.ok(fase5.indexOf("**Este preset entrega primero una auditoría de regresión") < fase5.indexOf("## EJEMPLOS DE REFERENCIA"));
    assert.ok(ensamblarFase(3, "PROYECTO-A").texto.includes("| # | Tipo | Entrada | Salida esperada | Restricción que vigila |"));
  });

  it("research-ops: un informe en lugar del PR y sin commits por lote", () => {
    conPreset("research-ops");

    assert.ok(ensamblarFase(5, "PROYECTO-A").texto.includes("La entrega de esta fase es un **informe**"));
    const fase4 = ensamblarFase(4, "PROYECTO-A").texto;
    assert.ok(fase4.includes("Política: **sin commits por lote.**"));
    assert.ok(fase4.includes("- Lotes: sí · Commits: ninguno"));
  });
});
