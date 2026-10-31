// Los presets en inglés: cada uno tiene los mismos bloques que su gemelo en
// español (los mismos ids canónicos, en el mismo orden y con los mismos modos), la misma cabecera, y un
// proyecto en inglés los ensambla sin huérfanos ni avisos.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { leerBloques } from "../src/bloques.js";
import { capasDe, ensamblarFase, revisarBloques } from "../src/capas.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import { presetsDisponibles } from "../src/manifiesto.js";
import { separarFrontmatter } from "../src/phases.js";
import { crearProyecto, docsTemporales, limpiarEntorno } from "./helpers.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ES = path.join(RAIZ, "presets", "es");
const EN = path.join(RAIZ, "presets", "en");
const NOMBRES = fs.readdirSync(ES).filter((a) => a.endsWith(".md")).map((a) => a.slice(0, -3)).sort();

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

describe("presets en inglés", () => {
  it("son los mismos cinco que en español", () => {
    assert.deepEqual(fs.readdirSync(EN).filter((a) => a.endsWith(".md")).map((a) => a.slice(0, -3)).sort(), NOMBRES);
    assert.equal(NOMBRES.length, 5);
  });

  for (const nombre of NOMBRES) {
    it(`${nombre}: la misma cabecera, con las claves inglesas, y los mismos valores`, () => {
      fijarRaizDelPaquete(RAIZ);
      const meta = separarFrontmatter(fs.readFileSync(path.join(EN, `${nombre}.md`), "utf-8")).meta;
      assert.deepEqual(Object.keys(meta).sort(), ["batches", "commits", "description", "name"]);
      const es = presetsDisponibles("es").get(nombre)!;
      const en = presetsDisponibles("en").get(nombre)!;
      assert.equal(en.lotes, es.lotes);
      assert.equal(en.commits, es.commits);
      assert.ok(en.descripcion && en.descripcion !== es.descripcion);
      assert.equal(meta.name, nombre);
    });

    it(`${nombre}: los mismos bloques, en el mismo orden y con los mismos modos`, () => {
      const capa = { orden: 2 as const, etiqueta: "preset" as const, ruta: "" };
      const es = leerBloques(path.join(ES, `${nombre}.md`), capa);
      const en = leerBloques(path.join(EN, `${nombre}.md`), capa);
      assert.deepEqual(en.avisos, []);
      assert.deepEqual(en.bloques.map((b) => [b.id, b.modo]), es.bloques.map((b) => [b.id, b.modo]));
      // Con la palabra y los alias ingleses.
      assert.ok(!/<!--\s*\/?bloque\b/.test(fs.readFileSync(path.join(EN, `${nombre}.md`), "utf-8")));
    });

    it(`${nombre}: un proyecto en inglés lo ensambla sin huérfanos ni avisos, y sin marcadores`, () => {
      fijarRaizDelPaquete(RAIZ);
      const docs = docsTemporales();
      crearProyecto(docs, "P");
      fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, idioma: "en", preset: nombre }));
      assert.deepEqual(revisarBloques(capasDe("P")), []);
      for (const fase of [1, 2, 3, 4, 5]) {
        const { texto, avisos } = ensamblarFase(fase, "P", null);
        assert.deepEqual(avisos, [], `fase ${fase}`);
        assert.ok(!texto.includes("<!--"), `fase ${fase}`);
      }
    });
  }
});
