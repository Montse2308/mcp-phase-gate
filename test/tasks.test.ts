import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import type { PhaseFile } from "../src/phases.js";
import {
  describeEstado,
  estadoDeTarea,
  guardarPuntero,
  leerPunteros,
  limpiarEstadoViejo,
  listarTareas,
  tareaActiva,
} from "../src/tasks.js";
import { stateFile } from "../src/config.js";
import {
  crearProyecto,
  crearTarea,
  docsTemporales,
  estadoTemporal,
  limpiarEntorno,
} from "./helpers.js";

afterEach(limpiarEntorno);

// Las cinco fases reales: las cuatro primeras dejan documento y la quinta también, desde que
// la auditoría se archiva. Se construye a mano para no depender de los prompts del repo.
const FASES = new Map<number, PhaseFile>([
  [1, { file: "fase-1.md", title: "Descubrimiento", documento: "01 - Análisis Técnico.md", documentoInicial: "00 - Contexto Inicial.md" }],
  [2, { file: "fase-2.md", title: "Decisiones", documento: "02 - Decisiones.md" }],
  [3, { file: "fase-3.md", title: "Plan Técnico", documento: "03 - Plan Técnico.md" }],
  [4, { file: "fase-4.md", title: "Ejecución", documento: "04 - Ejecución.md" }],
  [5, { file: "fase-5.md", title: "Auditoría / Pre-PR", documento: "05 - Auditoría.md" }],
]);

const TODOS = [
  "00 - Contexto Inicial.md",
  "01 - Análisis Técnico.md",
  "02 - Decisiones.md",
  "03 - Plan Técnico.md",
  "04 - Ejecución.md",
  "05 - Auditoría.md",
];

describe("estadoDeTarea", () => {
  it("una tarea recién creada va en la fase 1", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    const carpeta = crearTarea(docs, "BOS", "login-sso", ["00 - Contexto Inicial.md"]);

    const estado = estadoDeTarea("login-sso", carpeta, FASES);

    assert.deepEqual(estado.fasesHechas, []);
    assert.equal(estado.siguienteFase, 1);
  });

  it("deduce la fase de los documentos que existen", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    const carpeta = crearTarea(docs, "BOS", "login-sso", [
      "00 - Contexto Inicial.md",
      "01 - Análisis Técnico.md",
      "02 - Decisiones.md",
    ]);

    const estado = estadoDeTarea("login-sso", carpeta, FASES);

    assert.deepEqual(estado.fasesHechas, [1, 2]);
    assert.equal(estado.siguienteFase, 3);
  });

  // Es la razón por la que la fase 5 pasó a dejar documento: sin él, una tarea acabada se
  // quedaba para siempre en "lista para la fase 5" y no había forma de verla terminada.
  it("con todos los documentos, la tarea está terminada", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    const carpeta = crearTarea(docs, "BOS", "login-sso", TODOS);

    const estado = estadoDeTarea("login-sso", carpeta, FASES);

    assert.equal(estado.siguienteFase, null);
    assert.deepEqual(estado.fasesHechas, [1, 2, 3, 4, 5]);
  });

  // Si borras un documento intermedio porque quedó mal, la fase baja sola. Es justo lo que
  // no podría hacer un registro guardado aparte.
  it("un hueco intermedio manda: la fase siguiente es la primera que falta", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    const carpeta = crearTarea(docs, "BOS", "login-sso", [
      "01 - Análisis Técnico.md",
      "03 - Plan Técnico.md",
    ]);

    const estado = estadoDeTarea("login-sso", carpeta, FASES);

    assert.equal(estado.siguienteFase, 2);
    assert.deepEqual(estado.fasesHechas, [1, 3]);
  });

  it("ignora las fases que no declaran documento", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    const carpeta = crearTarea(docs, "BOS", "login-sso", ["01 - Análisis Técnico.md"]);

    const sinDocumento = new Map<number, PhaseFile>([
      [1, { file: "fase-1.md", title: "Descubrimiento", documento: "01 - Análisis Técnico.md" }],
      [2, { file: "fase-2.md", title: "Solo chat" }],
    ]);

    const estado = estadoDeTarea("login-sso", carpeta, sinDocumento);

    assert.equal(estado.fasesConDocumento, 1);
    assert.equal(estado.siguienteFase, null); // la 2 no puede completarse, así que no bloquea
  });

  it("sin ninguna fase con documento no hay nada que deducir", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    const carpeta = crearTarea(docs, "BOS", "login-sso");

    const estado = estadoDeTarea("login-sso", carpeta, new Map());

    assert.equal(estado.fasesConDocumento, 0);
    assert.equal(describeEstado(estado, new Map()).includes("fase desconocida"), true);
  });
});

describe("describeEstado", () => {
  it("nombra la fase siguiente con su título", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    const carpeta = crearTarea(docs, "BOS", "x", ["01 - Análisis Técnico.md"]);

    const frase = describeEstado(estadoDeTarea("x", carpeta, FASES), FASES);

    assert.equal(frase.includes("Fase 2 (Decisiones)"), true);
    assert.equal(frase.includes("hechas: 1"), true);
  });

  it("dice que está terminada cuando no falta ninguna", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    const carpeta = crearTarea(docs, "BOS", "x", TODOS);

    assert.equal(describeEstado(estadoDeTarea("x", carpeta, FASES), FASES).includes("terminada"), true);
  });
});

describe("listarTareas", () => {
  it("lista las carpetas de tarea, de la más reciente a la más antigua", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    crearTarea(docs, "BOS", "vieja", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-01-01") });
    crearTarea(docs, "BOS", "reciente", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-08-01") });
    crearTarea(docs, "BOS", "media", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-04-01") });

    const tareas = listarTareas("BOS", FASES);

    assert.deepEqual(tareas.map((tarea) => tarea.taskName), ["reciente", "media", "vieja"]);
  });

  it("devuelve vacío si el proyecto todavía no tiene tareas", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");

    assert.deepEqual(listarTareas("BOS", FASES), []);
  });

  it("también ve las tareas creadas a mano, sin pasar por start_task", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "BOS");
    fs.mkdirSync(path.join(docs, "BOS", "Proyectos", "hecha-a-mano"), { recursive: true });

    assert.deepEqual(listarTareas("BOS", FASES).map((t) => t.taskName), ["hecha-a-mano"]);
  });
});

describe("punteros de tarea activa", () => {
  // El bug que originó todo esto: había un único puntero global, así que abrir una segunda
  // ventana en otro proyecto le cambiaba la tarea activa a la primera sin que se enterara.
  it("cada proyecto guarda la suya sin pisar la del otro", () => {
    estadoTemporal();

    guardarPuntero("BOS", "login-sso");
    guardarPuntero("CRM", "reporte-comisiones");

    assert.deepEqual(leerPunteros(), { bos: "login-sso", crm: "reporte-comisiones" });
  });

  it("la clave no distingue mayúsculas", () => {
    estadoTemporal();

    guardarPuntero("BOS", "login-sso");
    guardarPuntero("bos", "otra");

    assert.deepEqual(leerPunteros(), { bos: "otra" });
  });

  it("sin archivo de estado devuelve vacío en vez de fallar", () => {
    estadoTemporal();

    assert.deepEqual(leerPunteros(), {});
  });

  it("un archivo corrupto se ignora en vez de tumbar el servidor", () => {
    const carpeta = estadoTemporal();
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(stateFile(), "{esto no es json", "utf-8");

    assert.deepEqual(leerPunteros(), {});
  });

  it("descarta entradas con forma inesperada y conserva las buenas", () => {
    const carpeta = estadoTemporal();
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ bos: "login-sso", crm: 42, kanban: "" }), "utf-8");

    assert.deepEqual(leerPunteros(), { bos: "login-sso" });
  });

  it("no deja el temporal de la escritura atómica", () => {
    const carpeta = estadoTemporal();

    guardarPuntero("BOS", "login-sso");

    assert.deepEqual(fs.readdirSync(carpeta), ["active-tasks.json"]);
  });
});

describe("limpiarEstadoViejo", () => {
  it("borra el archivo del formato anterior", () => {
    const carpeta = estadoTemporal();
    fs.mkdirSync(carpeta, { recursive: true });
    const viejo = path.join(carpeta, "active_task.json");
    fs.writeFileSync(viejo, JSON.stringify({ project: "bos", task_name: "x" }), "utf-8");

    limpiarEstadoViejo();

    assert.equal(fs.existsSync(viejo), false);
  });

  it("no falla si no hay nada que borrar", () => {
    estadoTemporal();

    assert.doesNotThrow(limpiarEstadoViejo);
  });
});

describe("tareaActiva", () => {
  it("devuelve la apuntada, aunque no sea la más reciente", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "BOS");
    crearTarea(docs, "BOS", "vieja", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-01-01") });
    crearTarea(docs, "BOS", "reciente", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-08-01") });

    guardarPuntero("BOS", "vieja");
    const activa = tareaActiva("BOS", FASES);

    assert.equal(activa?.estado.taskName, "vieja");
    assert.equal(activa?.origen, "puntero");
  });

  it("sin puntero deduce la más reciente y lo declara", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "BOS");
    crearTarea(docs, "BOS", "vieja", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-01-01") });
    crearTarea(docs, "BOS", "reciente", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-08-01") });

    const activa = tareaActiva("BOS", FASES);

    assert.equal(activa?.estado.taskName, "reciente");
    assert.equal(activa?.origen, "deducida");
  });

  // Un puntero a una carpeta renombrada o borrada no debe dejar al usuario sin respuesta.
  it("si el puntero apunta a una tarea que ya no existe, deduce", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "BOS");
    crearTarea(docs, "BOS", "existe", ["01 - Análisis Técnico.md"]);

    guardarPuntero("BOS", "borrada-hace-tiempo");
    const activa = tareaActiva("BOS", FASES);

    assert.equal(activa?.estado.taskName, "existe");
    assert.equal(activa?.origen, "deducida");
  });

  it("sin tareas no hay activa", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "BOS");

    assert.equal(tareaActiva("BOS", FASES), null);
  });

  // La comprobación de extremo a extremo del bug original: dos ventanas, dos proyectos.
  it("dos ventanas en proyectos distintos conservan cada una su tarea", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "BOS");
    crearProyecto(docs, "CRM");
    crearTarea(docs, "BOS", "login-sso", ["01 - Análisis Técnico.md"]);
    crearTarea(docs, "CRM", "reporte-comisiones", ["01 - Análisis Técnico.md"]);

    guardarPuntero("BOS", "login-sso");
    guardarPuntero("CRM", "reporte-comisiones"); // la segunda ventana, después de la primera

    assert.equal(tareaActiva("BOS", FASES)?.estado.taskName, "login-sso");
    assert.equal(tareaActiva("CRM", FASES)?.estado.taskName, "reporte-comisiones");
  });
});
