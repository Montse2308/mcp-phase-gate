import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import type { PhaseFile } from "../src/phases.js";
import {
  avisoDeCompuerta,
  avisoDeSalto,
  describeEstado,
  detectarSalto,
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
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", ["00 - Contexto Inicial.md"]);

    const estado = estadoDeTarea("login-sso", carpeta, FASES);

    assert.deepEqual(estado.fasesHechas, []);
    assert.equal(estado.siguienteFase, 1);
  });

  it("deduce la fase de los documentos que existen", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", [
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
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", TODOS);

    const estado = estadoDeTarea("login-sso", carpeta, FASES);

    assert.equal(estado.siguienteFase, null);
    assert.deepEqual(estado.fasesHechas, [1, 2, 3, 4, 5]);
  });

  // Si borras un documento intermedio porque quedó mal, la fase baja sola. Es justo lo que
  // no podría hacer un registro guardado aparte.
  it("un hueco intermedio manda: la fase siguiente es la primera que falta", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", [
      "01 - Análisis Técnico.md",
      "03 - Plan Técnico.md",
    ]);

    const estado = estadoDeTarea("login-sso", carpeta, FASES);

    assert.equal(estado.siguienteFase, 2);
    assert.deepEqual(estado.fasesHechas, [1, 3]);
  });

  it("ignora las fases que no declaran documento", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", ["01 - Análisis Técnico.md"]);

    const sinDocumento = new Map<number, PhaseFile>([
      [1, { file: "fase-1.md", title: "Descubrimiento", documento: "01 - Análisis Técnico.md" }],
      [2, { file: "fase-2.md", title: "Solo chat" }],
    ]);

    const estado = estadoDeTarea("login-sso", carpeta, sinDocumento);

    assert.equal(estado.fasesConDocumento, 1);
    assert.equal(estado.siguienteFase, null); // la 2 no puede completarse, así que no bloquea
  });

  // La carpeta de una tarea puede acabar con archivos que no son documentos de fase: una nota
  // suelta, un anexo, o una copia en conflicto que dejó el sincronizador de la nube. Ninguno
  // debe contar como fase hecha ni adelantar la fecha de actividad, o la deducción —que es el
  // único registro de en qué fase va la tarea— empezaría a mentir por un archivo ajeno.
  it("un archivo que no declara ninguna fase no altera la deducción", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(
      docs,
      "PROYECTO-A",
      "login-sso",
      ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md"],
      { mtime: new Date("2026-01-01T00:00:00Z") }
    );

    const antes = estadoDeTarea("login-sso", carpeta, FASES);

    fs.writeFileSync(path.join(carpeta, "Anexo 02 - impacto en el reporte.md"), "x", "utf-8");
    fs.writeFileSync(path.join(carpeta, "02 - Decisiones.md.sync-conflict"), "x", "utf-8");

    const despues = estadoDeTarea("login-sso", carpeta, FASES);

    assert.deepEqual(despues.fasesHechas, [1]);
    assert.equal(despues.siguienteFase, 2);
    assert.equal(despues.ultimoCambio, antes.ultimoCambio);
  });

  it("sin ninguna fase con documento no hay nada que deducir", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso");

    const estado = estadoDeTarea("login-sso", carpeta, new Map());

    assert.equal(estado.fasesConDocumento, 0);
    assert.equal(describeEstado(estado, new Map()).includes("fase desconocida"), true);
  });
});

describe("describeEstado", () => {
  it("nombra la fase siguiente con su título", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "x", ["01 - Análisis Técnico.md"]);

    const frase = describeEstado(estadoDeTarea("x", carpeta, FASES), FASES);

    assert.equal(frase.includes("Fase 2 (Decisiones)"), true);
    assert.equal(frase.includes("hechas: 1"), true);
  });

  it("dice que está terminada cuando no falta ninguna", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "x", TODOS);

    assert.equal(describeEstado(estadoDeTarea("x", carpeta, FASES), FASES).includes("terminada"), true);
  });
});

describe("listarTareas", () => {
  it("lista las carpetas de tarea, de la más reciente a la más antigua", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "vieja", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-01-01") });
    crearTarea(docs, "PROYECTO-A", "reciente", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-08-01") });
    crearTarea(docs, "PROYECTO-A", "media", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-04-01") });

    const tareas = listarTareas("PROYECTO-A", FASES);

    assert.deepEqual(tareas.map((tarea) => tarea.taskName), ["reciente", "media", "vieja"]);
  });

  it("devuelve vacío si el proyecto todavía no tiene tareas", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    assert.deepEqual(listarTareas("PROYECTO-A", FASES), []);
  });

  it("también ve las tareas creadas a mano, sin pasar por start_task", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    fs.mkdirSync(path.join(docs, "PROYECTO-A", "Proyectos", "hecha-a-mano"), { recursive: true });

    assert.deepEqual(listarTareas("PROYECTO-A", FASES).map((t) => t.taskName), ["hecha-a-mano"]);
  });
});

describe("punteros de tarea activa", () => {
  // El bug que originó todo esto: había un único puntero global, así que abrir una segunda
  // ventana en otro proyecto le cambiaba la tarea activa a la primera sin que se enterara.
  it("cada proyecto guarda la suya sin pisar la del otro", () => {
    estadoTemporal();

    guardarPuntero("PROYECTO-A", "login-sso");
    guardarPuntero("PROYECTO-B", "reporte-comisiones");

    assert.deepEqual(leerPunteros(), { "proyecto-a": "login-sso", "proyecto-b": "reporte-comisiones" });
  });

  it("la clave no distingue mayúsculas", () => {
    estadoTemporal();

    guardarPuntero("PROYECTO-A", "login-sso");
    guardarPuntero("proyecto-a", "otra");

    assert.deepEqual(leerPunteros(), { "proyecto-a": "otra" });
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
    fs.writeFileSync(stateFile(), JSON.stringify({ "proyecto-a": "login-sso", "proyecto-b": 42, "proyecto-c": "" }), "utf-8");

    assert.deepEqual(leerPunteros(), { "proyecto-a": "login-sso" });
  });

  it("no deja el temporal de la escritura atómica", () => {
    const carpeta = estadoTemporal();

    guardarPuntero("PROYECTO-A", "login-sso");

    assert.deepEqual(fs.readdirSync(carpeta), ["active-tasks.json"]);
  });
});

describe("limpiarEstadoViejo", () => {
  it("borra el archivo del formato anterior", () => {
    const carpeta = estadoTemporal();
    fs.mkdirSync(carpeta, { recursive: true });
    const viejo = path.join(carpeta, "active_task.json");
    fs.writeFileSync(viejo, JSON.stringify({ project: "proyecto-a", task_name: "x" }), "utf-8");

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
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "vieja", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-01-01") });
    crearTarea(docs, "PROYECTO-A", "reciente", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-08-01") });

    guardarPuntero("PROYECTO-A", "vieja");
    const activa = tareaActiva("PROYECTO-A", FASES);

    assert.equal(activa?.estado.taskName, "vieja");
    assert.equal(activa?.origen, "puntero");
  });

  it("sin puntero deduce la más reciente y lo declara", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "vieja", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-01-01") });
    crearTarea(docs, "PROYECTO-A", "reciente", ["01 - Análisis Técnico.md"], { mtime: new Date("2026-08-01") });

    const activa = tareaActiva("PROYECTO-A", FASES);

    assert.equal(activa?.estado.taskName, "reciente");
    assert.equal(activa?.origen, "deducida");
  });

  // Un puntero a una carpeta renombrada o borrada no debe dejar al usuario sin respuesta.
  it("si el puntero apunta a una tarea que ya no existe, deduce", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "existe", ["01 - Análisis Técnico.md"]);

    guardarPuntero("PROYECTO-A", "borrada-hace-tiempo");
    const activa = tareaActiva("PROYECTO-A", FASES);

    assert.equal(activa?.estado.taskName, "existe");
    assert.equal(activa?.origen, "deducida");
  });

  it("sin tareas no hay activa", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");

    assert.equal(tareaActiva("PROYECTO-A", FASES), null);
  });

  // La comprobación de extremo a extremo del bug original: dos ventanas, dos proyectos.
  it("dos ventanas en proyectos distintos conservan cada una su tarea", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");
    crearProyecto(docs, "PROYECTO-B");
    crearTarea(docs, "PROYECTO-A", "login-sso", ["01 - Análisis Técnico.md"]);
    crearTarea(docs, "PROYECTO-B", "reporte-comisiones", ["01 - Análisis Técnico.md"]);

    guardarPuntero("PROYECTO-A", "login-sso");
    guardarPuntero("PROYECTO-B", "reporte-comisiones"); // la segunda ventana, después de la primera

    assert.equal(tareaActiva("PROYECTO-A", FASES)?.estado.taskName, "login-sso");
    assert.equal(tareaActiva("PROYECTO-B", FASES)?.estado.taskName, "reporte-comisiones");
  });
});

// La compuerta es una comparación contra la fase deducida. De ahí sale gratis el caso que
// más fácil se implementa mal: volver a una fase anterior para corregirla no es un salto.
describe("detectarSalto", () => {
  function estadoCon(documentos: string[]) {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", documentos);
    return estadoDeTarea("login-sso", carpeta, FASES);
  }

  it("pedir una fase por delante de la que toca es un salto", () => {
    const estado = estadoCon(["01 - Análisis Técnico.md", "02 - Decisiones.md"]); // va en 3

    const salto = detectarSalto(4, estado, FASES);

    assert.equal(salto?.fasePedida, 4);
    assert.equal(salto?.siguienteFase, 3);
    assert.deepEqual(salto?.faltan, [{ fase: 3, documento: "03 - Plan Técnico.md" }]);
  });

  it("pedir la fase que toca no es salto", () => {
    assert.equal(detectarSalto(3, estadoCon(["01 - Análisis Técnico.md", "02 - Decisiones.md"]), FASES), null);
  });

  it("volver a una fase anterior para corregirla no es salto", () => {
    const estado = estadoCon(["01 - Análisis Técnico.md", "02 - Decisiones.md"]); // va en 3

    assert.equal(detectarSalto(2, estado, FASES), null);
    assert.equal(detectarSalto(1, estado, FASES), null);
  });

  it("lista todas las fases anteriores que faltan, no solo la inmediata", () => {
    const salto = detectarSalto(4, estadoCon(["00 - Contexto Inicial.md"]), FASES);

    assert.deepEqual(salto?.faltan.map((f) => f.fase), [1, 2, 3]);
  });

  it("una tarea terminada no tiene huecos, así que nada es salto", () => {
    assert.equal(detectarSalto(2, estadoCon(TODOS), FASES), null);
  });

  it("sin fases con documento no hay nada contra qué comparar", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "x");

    assert.equal(detectarSalto(4, estadoDeTarea("x", carpeta, new Map()), new Map()), null);
  });
});

describe("avisoDeSalto", () => {
  it("nombra la tarea, el documento que falta y la fase real", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", ["01 - Análisis Técnico.md"]);
    const salto = detectarSalto(4, estadoDeTarea("login-sso", carpeta, FASES), FASES);

    const aviso = avisoDeSalto(salto!, "login-sso", FASES);

    assert.equal(aviso.includes("login-sso"), true);
    assert.equal(aviso.includes("02 - Decisiones.md"), true);
    assert.equal(aviso.includes("03 - Plan Técnico.md"), true);
    assert.equal(aviso.includes("Fase 2 (Decisiones)"), true);
  });
});

describe("avisoDeCompuerta", () => {
  function montarDosProyectos() {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");
    crearProyecto(docs, "PROYECTO-B");
    crearTarea(docs, "PROYECTO-A", "login-sso", ["01 - Análisis Técnico.md", "02 - Decisiones.md"]);
    crearTarea(docs, "PROYECTO-B", "reporte", TODOS);
    return docs;
  }

  it("con project explícito avisa del salto de su tarea activa", () => {
    montarDosProyectos();
    guardarPuntero("PROYECTO-A", "login-sso");

    const aviso = avisoDeCompuerta(4, FASES, { project: "proyecto-a" });

    assert.equal(aviso?.includes("COMPUERTA DE FASE"), true);
    assert.equal(aviso?.includes("03 - Plan Técnico.md"), true);
  });

  it("calla cuando la fase pedida es la que toca", () => {
    montarDosProyectos();
    guardarPuntero("PROYECTO-A", "login-sso");

    assert.equal(avisoDeCompuerta(3, FASES, { project: "proyecto-a" }), null);
  });

  // El flujo normal es escribir "/f4" y ya: si el servidor no pudiera resolver la tarea solo,
  // el modelo acabaría preguntándosela al usuario en cada fase.
  it("sin project lo resuelve solo si hay un único proyecto con tarea activa", () => {
    montarDosProyectos();
    guardarPuntero("PROYECTO-A", "login-sso");

    assert.equal(avisoDeCompuerta(4, FASES)?.includes("COMPUERTA DE FASE"), true);
  });

  it("sin project y con varios punteros lo dice en voz alta en vez de callar", () => {
    montarDosProyectos();
    guardarPuntero("PROYECTO-A", "login-sso");
    guardarPuntero("PROYECTO-B", "reporte");

    const aviso = avisoDeCompuerta(4, FASES);

    assert.equal(aviso?.includes("no se comprobó la compuerta"), true);
    assert.equal(aviso?.includes("`project`"), true);
  });

  it("sin ninguna tarea activa todavía no hay nada que avisar", () => {
    montarDosProyectos();

    assert.equal(avisoDeCompuerta(4, FASES), null);
  });

  it("task_name comprueba contra otra tarea distinta de la activa", () => {
    const docs = montarDosProyectos();
    crearTarea(docs, "PROYECTO-A", "otra", ["01 - Análisis Técnico.md"]);
    guardarPuntero("PROYECTO-A", "login-sso");

    // La activa (login-sso) va en la 3; "otra" va en la 2. Que el aviso hable de "otra"
    // demuestra que se comprobó contra ella y no contra la activa.
    const aviso = avisoDeCompuerta(4, FASES, { project: "proyecto-a", taskName: "otra" });

    assert.equal(aviso?.includes("otra"), true);
    assert.equal(aviso?.includes("02 - Decisiones.md"), true);
  });

  it("un proyecto sin tareas no produce aviso", () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");

    assert.equal(avisoDeCompuerta(4, FASES, { project: "proyecto-a" }), null);
  });
});
