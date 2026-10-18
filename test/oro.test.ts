// La prueba de oro (§5.5.2 del plan maestro v3): con el preset software-replica, cada fase se
// ensambla EXACTAMENTE como la entregaba la 2.2.0. Es la garantía de que el flujo de quien ya usaba
// la réplica no cambia al pasar a la 3.0, aunque los prompts base sean ahora genéricos.
//
// test/oro/2.2.0/fase-N.txt se generaron con loadPhasePrompt(N) del build de la etiqueta v2.2.0.
// Se excluye el bloque CONFIGURACIÓN DEL PROYECTO (incluirConfigProyecto: false), que no existía.
// Si un cambio posterior toca a propósito un texto compartido, estos archivos se regeneran en el
// mismo lote y se dice en el commit (riesgo E3-R8).
//
// La 3.0.0 cambia a propósito las Fases 4 y 5 (L08 de la Etapa 4: la Fase 4 ejecuta con record_batch y
// la 5 audita los commits que lista el servidor). Esas dos se comparan con test/oro/3.0.0/, generado
// con ensamblarFase después de cambiar los textos y revisado a mano (ORO_REGENERAR=1 los reescribe;
// nunca los de la 2.2.0). Las fases 1, 2 y 3 siguen comparándose con la 2.2.0, sin tocarlas.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ensamblarFase } from "../src/capas.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import { configTemporal, crearProyecto, docsTemporales, limpiarEntorno } from "./helpers.js";

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ORO = path.join(RAIZ, "test", "oro", "2.2.0");
const ORO_3 = path.join(RAIZ, "test", "oro", "3.0.0");
const CAMBIAN_EN_LA_3 = new Set([4, 5]);

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

function archivoDeOro(fase: number): string {
  return path.join(CAMBIAN_EN_LA_3.has(fase) ? ORO_3 : ORO, `fase-${fase}.txt`);
}

function oro(fase: number): string {
  return fs.readFileSync(archivoDeOro(fase), "utf-8").replace(/\r\n/g, "\n");
}

function oro22(fase: number): string {
  return fs.readFileSync(path.join(ORO, `fase-${fase}.txt`), "utf-8").replace(/\r\n/g, "\n");
}

function proyecto(manifiesto?: unknown): void {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  crearProyecto(docs, "PROYECTO-A");
  if (manifiesto) fs.writeFileSync(path.join(docs, "PROYECTO-A", "phase-gate.json"), JSON.stringify(manifiesto), "utf-8");
}

describe("prueba de oro: software-replica reproduce la 2.2.0 (fases 1 a 3) y la 3.0.0 (fases 4 y 5)", () => {
  for (const fase of [1, 2, 3, 4, 5]) {
    it(`fase ${fase}, con "preset": "software-replica" en el manifiesto (oro ${CAMBIAN_EN_LA_3.has(fase) ? "3.0.0" : "2.2.0"})`, () => {
      proyecto({ version: 1, preset: "software-replica" });

      const { texto, avisos } = ensamblarFase(fase, "PROYECTO-A", null, { incluirConfigProyecto: false });
      assert.deepEqual(avisos, []);
      if (process.env.ORO_REGENERAR === "1" && CAMBIAN_EN_LA_3.has(fase)) {
        fs.mkdirSync(ORO_3, { recursive: true });
        fs.writeFileSync(archivoDeOro(fase), texto, "utf-8");
      }
      assert.equal(texto, oro(fase));
    });
  }

  // El cambio de la 3.0.0 es de verdad: las fases 4 y 5 ya no son las de la 2.2.0, y las 1 a 3 sí.
  it("las fases 4 y 5 de la 3.0.0 no son las de la 2.2.0; las 1 a 3, sí", () => {
    for (const fase of [4, 5]) assert.notEqual(oro(fase), oro22(fase), `fase ${fase}`);
    for (const fase of [1, 2, 3]) assert.equal(archivoDeOro(fase), path.join(ORO, `fase-${fase}.txt`));
  });

  it("lo mismo sin manifiesto, con presetPorDefecto en machine.json, y también sin proyecto", () => {
    proyecto();
    fs.writeFileSync(path.join(configTemporal(), "machine.json"), JSON.stringify({ version: 1, presetPorDefecto: "software-replica" }), "utf-8");

    for (const fase of [1, 2, 3, 4, 5]) {
      assert.equal(ensamblarFase(fase, "PROYECTO-A", null, { incluirConfigProyecto: false }).texto, oro(fase), `fase ${fase} con proyecto`);
      assert.equal(ensamblarFase(fase, null).texto, oro(fase), `fase ${fase} sin proyecto`);
    }
  });

  // La red tiene que poder fallar: con el preset por defecto, las fases 1 a 4 ya no son las de su oro
  // (cambian seis ranuras) y la 5 sí, porque ninguna de sus ranuras cambió.
  it("con software, las fases 1 a 4 difieren de su oro y la 5 no", () => {
    proyecto();

    for (const fase of [1, 2, 3, 4]) assert.notEqual(ensamblarFase(fase, null).texto, oro(fase), `fase ${fase}`);
    assert.equal(ensamblarFase(5, null).texto, oro(5));
  });
});

// La prueba de oro en inglés (§8.4, L06 de la Etapa 6): con "idioma": "en" y software-replica, cada fase se
// ensambla exactamente como test/oro/3.2.0-en/fase-N.txt, generado una vez con ORO_REGENERAR_EN=1 y revisado.
// Desde entonces, cualquier cambio en los prompts o presets en inglés lo tiene que regenerar a propósito
// (E3-R8). Las de español (2.2.0 y 3.0.0) no cambian: esta etapa no tocó el español.
const ORO_EN = path.join(RAIZ, "test", "oro", "3.2.0-en");

describe("prueba de oro en inglés: software-replica con idioma en (3.2.0-en)", () => {
  for (const fase of [1, 2, 3, 4, 5]) {
    it(`fase ${fase}`, () => {
      proyecto({ version: 1, preset: "software-replica", idioma: "en" });

      const { texto, avisos } = ensamblarFase(fase, "PROYECTO-A", null, { incluirConfigProyecto: false });
      assert.deepEqual(avisos, []);
      const archivo = path.join(ORO_EN, `fase-${fase}.txt`);
      if (process.env.ORO_REGENERAR_EN === "1") {
        fs.mkdirSync(ORO_EN, { recursive: true });
        fs.writeFileSync(archivo, texto, "utf-8");
      }
      assert.equal(texto, fs.readFileSync(archivo, "utf-8").replace(/\r\n/g, "\n"));
    });
  }

  it("cada fase en inglés es distinta de su gemela en español, y sin restos de marcadores ni de bloques del servidor en español", () => {
    proyecto({ version: 1, preset: "software-replica", idioma: "en" });
    for (const fase of [1, 2, 3, 4, 5]) {
      const en = fs.readFileSync(path.join(ORO_EN, `fase-${fase}.txt`), "utf-8");
      assert.notEqual(en, oro(fase));
      assert.ok(!en.includes("<!--"), `fase ${fase}`);
      assert.ok(!/ARCHIVOS DE ESTA TAREA|Fase \d|léelos/.test(en), `fase ${fase}`);
    }
  });
});
