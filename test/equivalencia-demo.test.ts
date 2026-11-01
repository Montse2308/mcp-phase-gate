// equivalente contra la demo de verdad: cada proyecto y cada tarea, en el orden en que el Studio los
// lista (proyectos alfabéticos, tareas por último cambio descendente), empareja con el de la otra
// lengua del mismo guion. Misma longitud y distinto orden no avisa: devuelve el de esa posición, no null.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { fasesDe } from "../src/capas.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import { discoverProjects } from "../src/paths.js";
import { conEntornoDeDemo, generarDemo } from "../src/studio/demo.js";
import type { CarpetasDeDemo } from "../src/studio/demo.js";
import { listarTareas } from "../src/tasks.js";
import { equivalente } from "../studio/src/equivalente.js";
import { carpetaTemporal, limpiarEntorno } from "./helpers.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type Guion = { proyectos: { nombre: string; tareas: { nombre: string }[] }[] };

function guion(idioma: "es" | "en"): Guion {
  return JSON.parse(fs.readFileSync(path.join(RAIZ, "test", "fixtures", "demo", idioma, "demo.json"), "utf-8")) as Guion;
}

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

// El mismo orden que /api/proyectos y /api/proyectos/:p/tareas: los proyectos ordenados, las tareas por
// último cambio, de la más reciente a la más antigua.
async function listas(c: CarpetasDeDemo): Promise<{ proyectos: string[]; tareas: Map<string, string[]> }> {
  return conEntornoDeDemo(c, async () => {
    const proyectos = [...discoverProjects().values()].sort();
    const tareas = new Map<string, string[]>();
    for (const nombre of proyectos) tareas.set(nombre, listarTareas(nombre, fasesDe(nombre)).map((t) => t.taskName));
    return { proyectos, tareas };
  });
}

describe("equivalente y la demo", () => {
  it("recorre cada proyecto y cada tarea de la demo", async () => {
    fijarRaizDelPaquete(RAIZ);
    const demoEs = await generarDemo(path.join(carpetaTemporal("eq-es"), "demo"), "es");
    const demoEn = await generarDemo(path.join(carpetaTemporal("eq-en"), "demo"), "en");
    const listaEs = await listas(demoEs);
    const listaEn = await listas(demoEn);
    const guionEs = guion("es");
    const guionEn = guion("en");
    assert.equal(guionEs.proyectos.length, guionEn.proyectos.length);
    assert.equal(listaEs.proyectos.length, guionEs.proyectos.length);
    assert.equal(listaEn.proyectos.length, guionEn.proyectos.length);

    let tareas = 0;
    for (let i = 0; i < guionEs.proyectos.length; i++) {
      const nombreEs = guionEs.proyectos[i]!.nombre;
      const nombreEn = guionEn.proyectos[i]!.nombre;
      assert.equal(equivalente(nombreEs, listaEs.proyectos, listaEn.proyectos), nombreEn, nombreEs);
      assert.equal(equivalente(nombreEn, listaEn.proyectos, listaEs.proyectos), nombreEs, nombreEn);
      const tareasEs = listaEs.tareas.get(nombreEs);
      const tareasEn = listaEn.tareas.get(nombreEn);
      assert.ok(tareasEs && tareasEn, `${nombreEs}/${nombreEn}`);
      const delGuionEs = guionEs.proyectos[i]!.tareas.map((t) => t.nombre);
      const delGuionEn = guionEn.proyectos[i]!.tareas.map((t) => t.nombre);
      assert.equal(delGuionEs.length, delGuionEn.length, nombreEs);
      assert.deepEqual([...tareasEs].sort(), [...delGuionEs].sort(), nombreEs);
      assert.deepEqual([...tareasEn].sort(), [...delGuionEn].sort(), nombreEn);
      for (let j = 0; j < delGuionEs.length; j++) {
        const tareaEs = delGuionEs[j]!;
        const tareaEn = delGuionEn[j]!;
        assert.equal(equivalente(tareaEs, tareasEs, tareasEn), tareaEn, `${nombreEs}/${tareaEs}`);
        assert.equal(equivalente(tareaEn, tareasEn, tareasEs), tareaEs, `${nombreEn}/${tareaEn}`);
        tareas++;
      }
    }
    assert.equal(tareas, guionEs.proyectos.reduce((n, p) => n + p.tareas.length, 0));
  });

  it("misma longitud y distinto orden no avisa", () => {
    // Misma longitud y distinto orden no avisa: no devuelve null (eso manda a la Red) sino el nombre de esa posición.
    const proyectosEs = guion("es").proyectos.map((p) => p.nombre);
    const proyectosEn = guion("en").proyectos.map((p) => p.nombre);
    const proyectosEnAlReves = [...proyectosEn].reverse();
    assert.notDeepEqual(proyectosEnAlReves, proyectosEn);
    assert.equal(equivalente(proyectosEs[0]!, proyectosEs, proyectosEnAlReves), proyectosEnAlReves[0]);
    assert.notEqual(equivalente(proyectosEs[0]!, proyectosEs, proyectosEnAlReves), null);

    const tareasEs = guion("es").proyectos[0]!.tareas.map((t) => t.nombre);
    const tareasEnAlReves = [...guion("en").proyectos[0]!.tareas.map((t) => t.nombre)].reverse();
    assert.ok(tareasEs.length > 1);
    assert.equal(tareasEnAlReves.length, tareasEs.length);
    assert.equal(equivalente(tareasEs[0]!, tareasEs, tareasEnAlReves), tareasEnAlReves[0]);
    assert.notEqual(equivalente(tareasEs[0]!, tareasEs, tareasEnAlReves), null);
  });
});
