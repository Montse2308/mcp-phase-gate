// El Studio en los dos idiomas (§8.6 del plan). Los diccionarios de la interfaz tienen las mismas claves y
// los mismos huecos (el tipo de en.ts ya lo exige al compilar el frontend; aquí, además, que no sobre ni
// quede vacía ninguna), las tablas de arreglos del Vigía también; y el servidor habla en el idioma que manda
// la interfaz en X-Phase-Gate-Lang, sin que eso cambie la huella de una acción ni el filtro de seguridad.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { fijarRaizDelPaquete } from "../src/config.js";
import { idiomaDePeticion } from "../src/studio/servidor.js";
import { en } from "../studio/src/i18n/en.js";
import { es } from "../studio/src/i18n/es.js";
import { ARREGLOS_EN } from "../studio/src/vigia/arreglos-en.js";
import { ARREGLOS_ES } from "../studio/src/vigia/arreglos-es.js";
import { carpetaTemporal, crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";
import { pedir, studioConApi } from "./studio-ayudas.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const huecos = (texto: string): string[] => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe("Studio: los diccionarios de la interfaz", () => {
  it("es y en tienen exactamente las mismas claves, ninguna vacía, con los mismos huecos", () => {
    assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
    const claves = Object.keys(es) as (keyof typeof es)[];
    assert.ok(claves.length >= 150, `${claves.length} claves`);
    for (const clave of claves) {
      for (const [idioma, diccionario] of [["es", es], ["en", en]] as const) {
        assert.ok(typeof diccionario[clave] === "string" && diccionario[clave].trim() !== "", `${clave}: vacía en ${idioma}`);
      }
      assert.deepEqual(huecos(en[clave]), huecos(es[clave]), `${clave}: los huecos no coinciden`);
    }
  });

  it("toda clave con plural tiene su forma .other, y sus formas llevan {n}", () => {
    for (const clave of Object.keys(es).filter((c) => /\.(?:zero|one|two|few|many|other)$/.test(c))) {
      const base = clave.replace(/\.[a-z]+$/, "");
      assert.ok(Object.prototype.hasOwnProperty.call(es, `${base}.other`), `${base}: falta .other`);
      assert.match(es[clave as keyof typeof es], /\{n\}/, clave);
    }
  });

  it("los sellos de la tabla de §8.6", () => {
    const sellos: [keyof typeof es, string, string][] = [
      ["sello.verificado", "VERIFICADO", "VERIFIED"],
      ["sello.sellado", "SELLADO", "SEALED"],
      ["sello.enVia", "EN VÍA", "IN TRANSIT"],
      ["sello.rechazado", "RECHAZADO", "REJECTED"],
      ["sello.anulado", "ANULADO", "VOID"],
      ["sello.manual", "MANUAL", "MANUAL"],
      ["sello.nota", "NOTA", "NOTE"],
      ["sello.banda", "CON PENDIENTES", "WITH PENDING ITEMS"],
      ["sobrio.noVigente", "no vigente", "stale"],
    ];
    for (const [clave, enEspanol, enIngles] of sellos) assert.deepEqual([es[clave], en[clave]], [enEspanol, enIngles], clave);
  });

  it("las tablas de arreglos del Vigía tienen los mismos códigos en los dos idiomas, ninguna línea vacía", () => {
    assert.deepEqual(Object.keys(ARREGLOS_EN).sort(), Object.keys(ARREGLOS_ES).sort());
    for (const tabla of [ARREGLOS_ES, ARREGLOS_EN]) for (const [codigo, texto] of Object.entries(tabla)) assert.ok(texto.trim(), codigo);
  });
});

describe("Studio: el idioma de la petición", () => {
  const peticion = (...rawHeaders: string[]) => ({ rawHeaders }) as unknown as Parameters<typeof idiomaDePeticion>[0];

  it("solo cuenta una cabecera X-Phase-Gate-Lang con exactamente es o en", () => {
    assert.equal(idiomaDePeticion(peticion("X-Phase-Gate-Lang", "en")), "en");
    assert.equal(idiomaDePeticion(peticion("x-phase-gate-lang", "es")), "es");
    assert.equal(idiomaDePeticion(peticion()), null);
    for (const valor of ["fr", "EN", "en-US", "", " en", "es,en"]) assert.equal(idiomaDePeticion(peticion("X-Phase-Gate-Lang", valor)), null, valor);
    assert.equal(idiomaDePeticion(peticion("X-Phase-Gate-Lang", "en", "X-Phase-Gate-Lang", "es")), null, "repetida");
  });

  function instalacion() {
    fijarRaizDelPaquete(RAIZ);
    const docs = docsTemporales();
    estadoTemporal();
    process.env.PHASE_GATE_REPOS_PATH = carpetaTemporal("repos");
    crearProyecto(docs, "P");
    crearTarea(docs, "P", "t", ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md"]);
    fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), `${JSON.stringify({ version: 1, preset: "software" }, null, 2)}\n`, "utf-8");
    return { docs };
  }

  it("lo que dice la API sale en el idioma de la cabecera; sin ella, en el de siempre", async () => {
    instalacion();
    const s = await studioConApi();
    const get = (ruta: string, idioma?: string) => pedir(s.puerto, "GET", ruta, { Cookie: s.cookie, ...(idioma ? { "X-Phase-Gate-Lang": idioma } : {}) });

    const tareaEn = await get("/api/tareas/P/t", "en");
    const tareaEs = await get("/api/tareas/P/t", "es");
    const tareaSin = await get("/api/tareas/P/t");
    const tareaRara = await get("/api/tareas/P/t", "fr");
    assert.equal(tareaEn.estado, 200, tareaEn.texto);
    assert.match(tareaEn.json.estado.descripcion, /phase/i);
    assert.equal(tareaEn.json.estaciones[0].titulo, "Initial context");
    assert.equal(tareaEs.json.estaciones[0].titulo, "Contexto inicial");
    assert.notEqual(tareaEn.json.estado.descripcion, tareaEs.json.estado.descripcion);
    // Sin cabecera (o con una que no vale), el de siempre: PHASE_GATE_LANG=es en los tests.
    assert.equal(tareaSin.json.estado.descripcion, tareaEs.json.estado.descripcion);
    assert.equal(tareaRara.json.estado.descripcion, tareaEs.json.estado.descripcion);
    // Las fichas del contrato no cambian con el idioma: la interfaz las traduce.
    assert.deepEqual(
      tareaEn.json.estaciones.map((e: { texto: string }) => e.texto),
      tareaEs.json.estaciones.map((e: { texto: string }) => e.texto)
    );

    const noExisteEn = await get("/api/tareas/P/otra", "en");
    assert.equal(noExisteEn.estado, 404);
    assert.equal(noExisteEn.json.error, 'Task "otra" does not exist in P.');
    assert.equal((await get("/api/tareas/P/otra", "es")).json.error, 'No existe la tarea "otra" en P.');
    assert.equal((await get("/api/nada", "en")).json.error, "That API route does not exist.");

    // El diagnóstico (doctor), con sus códigos de siempre y el texto en el idioma pedido.
    const estadoEn = await get("/api/estado", "en");
    const estadoEs = await get("/api/estado", "es");
    assert.deepEqual(
      estadoEn.json.diagnostico.hallazgos.map((h: { codigo: string }) => h.codigo),
      estadoEs.json.diagnostico.hallazgos.map((h: { codigo: string }) => h.codigo)
    );
  });

  it("una acción: el resumen en el idioma de la petición, y la huella vale en los dos", async () => {
    const { docs } = instalacion();
    const s = await studioConApi();
    const post = (ruta: string, cuerpo: unknown, idioma: string) => pedir(s.puerto, "POST", ruta, { Cookie: s.cookie, "X-Phase-Gate": "1", "X-Phase-Gate-Lang": idioma }, JSON.stringify(cuerpo));
    const argumentos = { proyecto: "P", preset: "software-tdd" };

    const planEn = await post("/api/acciones/plan", { accion: "preset", argumentos }, "en");
    const planEs = await post("/api/acciones/plan", { accion: "preset", argumentos }, "es");
    assert.equal(planEn.estado, 200, planEn.texto);
    assert.equal(planEn.json.resumen, 'The preset of P becomes "software-tdd".');
    assert.equal(planEs.json.resumen, 'El preset de P pasa a ser "software-tdd".');
    assert.equal(planEn.json.huella, planEs.json.huella, "la huella no depende del idioma");

    // Visto en inglés, aplicado con la interfaz ya en español.
    const hecho = await post("/api/acciones/aplicar", { accion: "preset", argumentos, huella: planEn.json.huella }, "es");
    assert.equal(hecho.estado, 200, hecho.texto);
    assert.equal(hecho.json.mensaje, 'P usa ahora el preset "software-tdd".');
    assert.equal(JSON.parse(fs.readFileSync(path.join(docs, "P", "phase-gate.json"), "utf-8")).preset, "software-tdd");

    // La huella ya usada: 409, dicho en el idioma de la petición.
    const otra = await post("/api/acciones/aplicar", { accion: "preset", argumentos, huella: planEn.json.huella }, "en");
    assert.equal(otra.estado, 409);
    assert.match(otra.json.error, /^The disk changed since you saw the change\./);
  });

  it("la cabecera no abre nada: sin la cookie sigue siendo 401, y un POST sin X-Phase-Gate, 403", async () => {
    instalacion();
    const s = await studioConApi();
    assert.equal((await pedir(s.puerto, "GET", "/api/proyectos", { "X-Phase-Gate-Lang": "en" })).estado, 401);
    assert.equal((await pedir(s.puerto, "POST", "/api/acciones/plan", { Cookie: s.cookie, "X-Phase-Gate-Lang": "en" }, "{}")).estado, 403);
  });
});
