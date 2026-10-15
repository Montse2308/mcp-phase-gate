// La prueba de oro (§5.5.2 del plan maestro v3): con el preset software-replica, cada fase se
// ensambla EXACTAMENTE como la entregaba la 2.2.0. Es la garantía de que el flujo de quien ya usaba
// la réplica no cambia al pasar a la 3.0, aunque los prompts base sean ahora genéricos.
//
// test/oro/2.2.0/fase-N.txt se generaron con loadPhasePrompt(N) del build de la etiqueta v2.2.0.
// Se excluye el bloque CONFIGURACIÓN DEL PROYECTO (incluirConfigProyecto: false), que no existía.
// Si un cambio posterior toca a propósito un texto compartido, estos archivos se regeneran en el
// mismo lote y se dice en el commit (riesgo E3-R8).

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

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

function oro(fase: number): string {
  return fs.readFileSync(path.join(ORO, `fase-${fase}.txt`), "utf-8").replace(/\r\n/g, "\n");
}

function proyecto(manifiesto?: unknown): void {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  crearProyecto(docs, "PROYECTO-A");
  if (manifiesto) fs.writeFileSync(path.join(docs, "PROYECTO-A", "phase-gate.json"), JSON.stringify(manifiesto), "utf-8");
}

describe("prueba de oro: software-replica reproduce la 2.2.0", () => {
  for (const fase of [1, 2, 3, 4, 5]) {
    it(`fase ${fase}, con "preset": "software-replica" en el manifiesto`, () => {
      proyecto({ version: 1, preset: "software-replica" });

      const { texto, avisos } = ensamblarFase(fase, "PROYECTO-A", null, { incluirConfigProyecto: false });
      assert.deepEqual(avisos, []);
      assert.equal(texto, oro(fase));
    });
  }

  it("lo mismo sin manifiesto, con presetPorDefecto en machine.json, y también sin proyecto", () => {
    proyecto();
    fs.writeFileSync(path.join(configTemporal(), "machine.json"), JSON.stringify({ version: 1, presetPorDefecto: "software-replica" }), "utf-8");

    for (const fase of [1, 2, 3, 4, 5]) {
      assert.equal(ensamblarFase(fase, "PROYECTO-A", null, { incluirConfigProyecto: false }).texto, oro(fase), `fase ${fase} con proyecto`);
      assert.equal(ensamblarFase(fase, null).texto, oro(fase), `fase ${fase} sin proyecto`);
    }
  });

  // La red tiene que poder fallar: con el preset por defecto, las fases 1 a 4 ya no son las de la
  // 2.2.0 (cambian seis ranuras) y la 5 sí, porque ninguna de sus ranuras cambió.
  it("con software, las fases 1 a 4 difieren de la 2.2.0 y la 5 no", () => {
    proyecto();

    for (const fase of [1, 2, 3, 4]) assert.notEqual(ensamblarFase(fase, null).texto, oro(fase), `fase ${fase}`);
    assert.equal(ensamblarFase(5, null).texto, oro(5));
  });
});
