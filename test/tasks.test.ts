import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import type { PhaseFile } from "../src/phases.js";
import {
  avisoDeCompuerta,
  avisoDePendientes,
  avisoDeSalto,
  bloqueDeRecibos,
  describeEstado,
  detectarSalto,
  estadoDeTarea,
  guardarPuntero,
  leerPunteros,
  limpiarEstadoViejo,
  listarTareas,
  motivoDeProteccion,
  tareaActiva,
  tieneValidacionesPendientes,
} from "../src/tasks.js";
import type { EstadoTarea } from "../src/tasks.js";
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

// Un documento de fase se congela en cuanto una fase posterior está presente. La tabla recorre cada caso,
// con la Fase 4 escribiendo sus recibos en una subcarpeta.
describe("motivoDeProteccion", () => {
  const CON_RECIBOS = new Map<number, PhaseFile>(FASES);
  CON_RECIBOS.set(4, { ...(FASES.get(4) as PhaseFile), recibos: "04 - Ejecución" });

  const CONTEXTO = "00 - Contexto Inicial.md";
  const [C00, D01, D02, D03, D04, D05] = TODOS as [string, string, string, string, string, string];
  const RECIBO_L01 = "04 - Ejecución/L01 - rutas.md";
  const RECIBO_L02 = "04 - Ejecución/L02 - x.md";

  // [existen, se escribe, motivo esperado (null = permitido)]
  // Los recibos y el documento de la Fase 4 los escribe record_batch: con
  // write_central_doc se rechazan siempre, antes que cualquier otra regla. Las filas que cambiaron con
  // eso lo dicen al final.
  const RECORD_RECIBO = /Los recibos los escribe `record_batch`/;
  const RECORD_DOCUMENTO = /Este documento lo genera `record_batch` al cerrar el último lote/;
  const tabla: Array<[string[], string, RegExp | null]> = [
    [[C00, D01], CONTEXTO, /contexto inicial está siempre protegido/],
    [[C00, D01, D02], D01, /01 - Análisis Técnico\.md` está congelado: la Fase 2 .*02 - Decisiones\.md/],
    [[C00, D01, D02], D02, null],
    [[C00, D01, D02], D03, null],
    [TODOS, D05, null],
    [TODOS, D04, RECORD_DOCUMENTO], // antes: congelado por la Fase 5
    [[C00, D01, D02, D03, RECIBO_L01], D03, /congelado: la Fase 4 .*04 - Ejecución\//],
    [[C00, D01, D02, D03, RECIBO_L01], D04, RECORD_DOCUMENTO], // antes: permitido (el cierre)
    [[C00, D01, D02, D03, RECIBO_L01], RECIBO_L02, RECORD_RECIBO], // antes: permitido
    [[...TODOS, RECIBO_L01], RECIBO_L02, RECORD_RECIBO], // antes: congelado por la Fase 5
    [[C00, D01, D02, D03], D04, RECORD_DOCUMENTO], // nueva
    [[C00, D01, D02, D03], RECIBO_L01, RECORD_RECIBO],
    [[C00, D01, D03], D02, null],
    [[C00, D01, D03], D01, /congelado: la Fase 3/],
    [TODOS, "notas.md", null],
    // Un nombre en otras mayúsculas o en NFD no esquiva
    // la protección, exista o no el archivo con ese nombre.
    [[D01], "00 - contexto inicial.md", /contexto inicial está siempre protegido/],
    [[C00, D01, D02], "01 - análisis técnico.md", /congelado: la Fase 2/],
    [[C00, D01, D02], D01.normalize("NFD"), /congelado: la Fase 2/],
    [TODOS, "04 - ejecución/L01 - x.md", RECORD_RECIBO], // antes: congelado por la Fase 5
    [[C00, D01, D02, D03], "04 - EJECUCIÓN.md".normalize("NFD"), RECORD_DOCUMENTO],
    [[C00, D01, D02, D03, RECIBO_L01], "03 - plan técnico.md", /congelado: la Fase 4/],
    [[C00, D01], "02 - decisiones.md", null],
  ];

  for (const [existen, relativo, esperado] of tabla) {
    const caso = `con ${existen.map((d) => (d.includes("/") ? "recibo" : d.slice(0, 2))).join(", ")}, escribir ${relativo}${relativo === relativo.normalize("NFC") ? "" : " (NFD)"}: ${esperado ? "rechazo" : "permitido"}`;
    it(caso, () => {
      const docs = docsTemporales();
      crearProyecto(docs, "PROYECTO-A");
      const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso");
      for (const documento of existen) {
        fs.mkdirSync(path.dirname(path.join(carpeta, documento)), { recursive: true });
        fs.writeFileSync(path.join(carpeta, documento), "x", "utf-8");
      }

      const motivo = motivoDeProteccion(carpeta, relativo, CON_RECIBOS, CONTEXTO);

      if (esperado) assert.match(motivo ?? "(permitido)", esperado);
      else assert.equal(motivo, null);
    });
  }

  // Solo start_task lo crea sin force.
  it("el contexto inicial también se protege cuando todavía no existe", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso");

    assert.match(motivoDeProteccion(carpeta, CONTEXTO, CON_RECIBOS, CONTEXTO) ?? "", /siempre protegido/);
  });

  // La Fase 4 solo está presente por sus recibos si hay al menos un .md en la subcarpeta.
  it("una subcarpeta de recibos vacía o sin .md no congela nada", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", [C00, D01, D02, D03]);
    fs.mkdirSync(path.join(carpeta, "04 - Ejecución"));

    assert.equal(motivoDeProteccion(carpeta, D03, CON_RECIBOS, CONTEXTO), null);

    fs.writeFileSync(path.join(carpeta, "04 - Ejecución", "notas.txt"), "x", "utf-8");
    assert.equal(motivoDeProteccion(carpeta, D03, CON_RECIBOS, CONTEXTO), null);
  });
});

// Ninguna tool lista una carpeta, así que el
// servidor nombra los recibos que existen al final del prompt.
describe("bloqueDeRecibos", () => {
  const CON_RECIBOS = new Map<number, PhaseFile>(FASES);
  CON_RECIBOS.set(4, { ...(FASES.get(4) as PhaseFile), recibos: "04 - Ejecución" });

  function tareaConRecibos(archivos: string[]): string {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", ["00 - Contexto Inicial.md"]);
    fs.mkdirSync(path.join(carpeta, "04 - Ejecución"));
    for (const archivo of archivos) fs.writeFileSync(path.join(carpeta, "04 - Ejecución", archivo), "x", "utf-8");
    return carpeta;
  }

  it("en la fase de los recibos y en las posteriores, los lista ordenados y solo los .md", () => {
    const carpeta = tareaConRecibos(["L02 - filtro.md", "L01 - rutas.md", "notas.txt"]);
    const estado = estadoDeTarea("login-sso", carpeta, CON_RECIBOS);

    for (const fase of [4, 5]) {
      const bloque = bloqueDeRecibos(fase, estado, CON_RECIBOS) ?? "";

      assert.match(bloque, /RECIBOS QUE YA EXISTEN EN LA TAREA "login-sso"/);
      assert.ok(bloque.indexOf("L01 - rutas.md") < bloque.indexOf("L02 - filtro.md"), bloque);
      assert.ok(bloque.includes("- Fase 4: `04 - Ejecución/L01 - rutas.md`"), bloque);
      assert.equal(bloque.includes("notas.txt"), false);
    }
  });

  it("antes de la fase de los recibos, o sin recibos, no añade nada", () => {
    const conRecibos = tareaConRecibos(["L01 - rutas.md"]);
    const sinRecibos = tareaConRecibos([]);

    assert.equal(bloqueDeRecibos(3, estadoDeTarea("login-sso", conRecibos, CON_RECIBOS), CON_RECIBOS), null);
    assert.equal(bloqueDeRecibos(4, estadoDeTarea("login-sso", sinRecibos, CON_RECIBOS), CON_RECIBOS), null);
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

  // Con la subcarpeta vacía las tareas cuelgan del proyecto, junto a .phase-gate/ o .git/.
  it("una carpeta que empieza por punto no es tarea", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "real");
    crearTarea(docs, "PROYECTO-A", ".obsidian");

    assert.deepEqual(listarTareas("PROYECTO-A", FASES).map((t) => t.taskName), ["real"]);

    process.env.ORQUESTADOR_TASKS_SUBDIR = "";
    fs.mkdirSync(path.join(docs, "PROYECTO-A", ".phase-gate"));
    fs.mkdirSync(path.join(docs, "PROYECTO-A", ".git"));

    assert.deepEqual(listarTareas("PROYECTO-A", FASES).map((t) => t.taskName), ["Proyectos"]);
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

describe("avisoDePendientes", () => {
  // Las fases reales, con la subcarpeta de recibos que declara la Fase 4.
  const CON_RECIBOS = new Map(FASES);
  CON_RECIBOS.set(4, { ...FASES.get(4)!, recibos: "04 - Ejecución" });

  function tareaCon(documentos: Record<string, string>): EstadoTarea {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "tarea", []);
    for (const [relativo, contenido] of Object.entries(documentos)) {
      const ruta = path.join(carpeta, ...relativo.split("/"));
      fs.mkdirSync(path.dirname(ruta), { recursive: true });
      fs.writeFileSync(ruta, contenido, "utf-8");
    }
    return estadoDeTarea("tarea", carpeta, CON_RECIBOS);
  }

  const PLAN_CON_PENDIENTES = "# Plan\n\n## Validaciones pendientes\n\n- Probar el login con SSO en staging.\n\n## Lotes\n\n| L01 |";

  it("aparece cuando el documento de la fase anterior tiene `## Validaciones pendientes` con contenido", () => {
    const estado = tareaCon({ "03 - Plan Técnico.md": PLAN_CON_PENDIENTES });

    const aviso = avisoDePendientes(4, estado, CON_RECIBOS);
    assert.equal(
      aviso,
      [
        "## PENDIENTES HEREDADOS (detectados por el servidor)",
        "",
        "- `03 - Plan Técnico.md` tiene una sección `## Validaciones pendientes`.",
        "",
        "Nómbraselos al usuario antes de empezar (ver PENDIENTES HEREDADOS en las reglas globales).",
      ].join("\n")
    );
  });

  // La sección termina en el siguiente "## ": un "### " dentro es parte de su contenido.
  it("cuenta como contenido un subencabezado dentro de la sección, y la sección al final del archivo", () => {
    assert.ok(avisoDePendientes(4, tareaCon({ "03 - Plan Técnico.md": "## Validaciones pendientes\n### Staging\n" }), CON_RECIBOS));
    assert.ok(avisoDePendientes(4, tareaCon({ "03 - Plan Técnico.md": "x\n## Validaciones pendientes\r\n- algo\r\n" }), CON_RECIBOS));
  });

  for (const vacia of ["", "Ninguna.", "Nada.", "Sin pendientes.", "Fase cerrada sin pendientes.", "  NINGUNA  ", "nada"]) {
    it(`no aparece con la sección vacía o que solo dice ${JSON.stringify(vacia)}`, () => {
      const estado = tareaCon({ "03 - Plan Técnico.md": `# Plan\n\n## Validaciones pendientes\n\n${vacia}\n\n## Lotes\n` });

      assert.equal(avisoDePendientes(4, estado, CON_RECIBOS), null);
    });
  }

  it("no aparece sin la sección, ni con un encabezado parecido que no es el exacto", () => {
    assert.equal(avisoDePendientes(4, tareaCon({ "03 - Plan Técnico.md": "# Plan\n\n## Lotes\n" }), CON_RECIBOS), null);
    assert.equal(
      avisoDePendientes(4, tareaCon({ "03 - Plan Técnico.md": "### Validaciones pendientes\n- algo\n" }), CON_RECIBOS),
      null
    );
  });

  // Solo la fase anterior con documento: lo de más atrás ya lo nombró la fase siguiente a ella.
  it("mira solo el documento existente más reciente por debajo de la fase pedida", () => {
    const estado = tareaCon({
      "02 - Decisiones.md": "## Validaciones pendientes\n- algo viejo\n",
      "03 - Plan Técnico.md": "# Plan sin pendientes\n",
    });

    assert.equal(avisoDePendientes(4, estado, CON_RECIBOS), null);
    assert.ok(avisoDePendientes(3, estado, CON_RECIBOS));
  });

  it("en la Fase 5 lista los recibos con pendientes, fallidos o descartados, y no los hechos", () => {
    const recibo = (estado: string) => `---\nlote: L01\nestado: ${estado}\ncommit: abc1234\n---\n# L0x\n`;
    const estado = tareaCon({
      "04 - Ejecución.md": "# Ejecución\n\n## Lotes\n",
      "04 - Ejecución/L01 - base.md": recibo("hecho"),
      "04 - Ejecución/L02 - api.md": recibo("con pendientes"),
      "04 - Ejecución/L03 - filtro por categoría.md": recibo("fallido"),
      "04 - Ejecución/L04 - ui.md": recibo("Descartado"),
    });

    const aviso = avisoDePendientes(5, estado, CON_RECIBOS) ?? "";
    assert.match(aviso, /- `04 - Ejecución\/L02 - api\.md`: estado `con pendientes`\./);
    assert.match(aviso, /- `04 - Ejecución\/L03 - filtro por categoría\.md`: estado `fallido`\./);
    assert.match(aviso, /- `04 - Ejecución\/L04 - ui\.md`: estado `descartado`\./);
    assert.equal(aviso.includes("L01"), false);
  });

  // Con lotes: 1 el recibo es el documento de la fase.
  it("con un solo lote, mira el frontmatter del documento de la Fase 4", () => {
    const estado = tareaCon({ "04 - Ejecución.md": "---\nlote: L01\nestado: con pendientes\n---\n# L01\n" });

    assert.match(avisoDePendientes(5, estado, CON_RECIBOS) ?? "", /- `04 - Ejecución\.md`: estado `con pendientes`\./);
  });

  it("los recibos solo cuentan para las fases posteriores a la que los declara", () => {
    const estado = tareaCon({ "04 - Ejecución/L01 - x.md": "---\nestado: fallido\n---\n" });

    assert.equal(avisoDePendientes(4, estado, CON_RECIBOS), null);
  });
});

// La heurística de "sección vacía".
describe("tieneValidacionesPendientes", () => {
  const conSeccion = (cuerpo: string, encabezado = "## Validaciones pendientes") =>
    `# Plan\n\n${encabezado}\n\n${cuerpo}\n\n## Lotes\n`;

  for (const vacia of ["- Ninguna.", "Ninguna pendiente.", "N/A", "_Ninguna._", "Ninguna...", "* Nada", "1. Ninguno", "**No aplica.**", "Ninguna…"]) {
    it(`cuenta como vacía ${JSON.stringify(vacia)}`, () => {
      assert.equal(tieneValidacionesPendientes(conSeccion(vacia)), false);
    });
  }

  it("una sección con un pendiente real sí cuenta, aunque empiece por \"Ninguna\"", () => {
    assert.equal(tieneValidacionesPendientes(conSeccion("- Ninguna de las pruebas de staging se corrió.")), true);
  });

  it("reconoce el encabezado en otras mayúsculas", () => {
    assert.equal(tieneValidacionesPendientes(conSeccion("- probar en staging", "## Validaciones Pendientes")), true);
  });
});

// Dentro de la Fase 4, la deducción sabe por qué lote va, leyendo solo el
// frontmatter del plan y de los recibos. La fase sigue saliendo de qué documentos existen.
describe("progreso por lote en la Fase 4", () => {
  const CON_RECIBOS = new Map<number, PhaseFile>(FASES);
  CON_RECIBOS.set(4, { ...(FASES.get(4) as PhaseFile), recibos: "04 - Ejecución" });

  function enFase4(plan: string, recibos: Record<string, string> = {}): string {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const carpeta = crearTarea(docs, "PROYECTO-A", "login-sso", TODOS.slice(0, 3));
    fs.writeFileSync(path.join(carpeta, "03 - Plan Técnico.md"), plan, "utf-8");
    fs.mkdirSync(path.join(carpeta, "04 - Ejecución"));
    for (const [nombre, texto] of Object.entries(recibos)) fs.writeFileSync(path.join(carpeta, "04 - Ejecución", nombre), texto, "utf-8");
    return carpeta;
  }
  const recibo = (lote: string, commit: string, estado = "verificado") => `---\nlote: ${lote}\nde: 4\nestado: ${estado}\ncommit: ${commit}\n---\n# ${lote} — x\n`;

  it("sin recibos: lote 1 de 4", () => {
    const estado = estadoDeTarea("login-sso", enFase4("---\nlotes: 4\n---\n# Plan\n"), CON_RECIBOS);
    assert.deepEqual(estado.lotes, { total: 4, cerrados: 0, actual: 1, pendienteDeCommit: null });
    assert.equal(describeEstado(estado, CON_RECIBOS), "va en Fase 4 (Ejecución, lote 1 de 4); hechas: 1, 2, 3");
  });

  it("con el lote 2 esperando su commit: lote 2 de 4, commit pendiente", () => {
    const carpeta = enFase4("---\nlotes: 4\n---\n", { "L01 - a.md": recibo("L01", "a1b2c3d"), "L02 - b.md": recibo("L02", "pendiente") });
    const estado = estadoDeTarea("login-sso", carpeta, CON_RECIBOS);
    assert.deepEqual(estado.lotes, { total: 4, cerrados: 1, actual: 2, pendienteDeCommit: 2 });
    assert.equal(describeEstado(estado, CON_RECIBOS), "va en Fase 4 (Ejecución, lote 2 de 4, commit pendiente); hechas: 1, 2, 3");
  });

  it("un plan sin `lotes`: el plan no declara lotes", () => {
    const estado = estadoDeTarea("login-sso", enFase4("# Plan sin frontmatter\n"), CON_RECIBOS);
    assert.equal(estado.lotes?.total, null);
    assert.equal(describeEstado(estado, CON_RECIBOS), "va en Fase 4 (Ejecución; el plan no declara lotes); hechas: 1, 2, 3");
  });

  it("un fallido no cuenta como cerrado; una nota sí", () => {
    const carpeta = enFase4("---\nlotes: 3\n---\n", { "L01 - a.md": recibo("L01", "no aplica"), "L02 - b.md": recibo("L02", "no aplica", "fallido") });
    assert.deepEqual(estadoDeTarea("login-sso", carpeta, CON_RECIBOS).lotes, { total: 3, cerrados: 1, actual: 2, pendienteDeCommit: null });
  });

  it("solo se calcula cuando la fase siguiente es la de los recibos; la fase sigue saliendo de los documentos", () => {
    const carpeta = enFase4("---\nlotes: 2\n---\n", { "L01 - a.md": recibo("L01", "a1b2c3d"), "L02 - b.md": recibo("L02", "e4f5a6b") });
    const enCuatro = estadoDeTarea("login-sso", carpeta, CON_RECIBOS);
    assert.equal(enCuatro.siguienteFase, 4, "todos los recibos cerrados no cierran la fase: la cierra su documento");
    assert.equal(describeEstado(enCuatro, CON_RECIBOS), "va en Fase 4 (Ejecución, 2 de 2 lotes cerrados); hechas: 1, 2, 3");
    fs.writeFileSync(path.join(carpeta, "04 - Ejecución.md"), "índice", "utf-8");
    assert.equal(estadoDeTarea("login-sso", carpeta, CON_RECIBOS).lotes, null);
    assert.equal(estadoDeTarea("login-sso", carpeta, FASES).lotes, null, "sin fase con recibos, no hay progreso");
  });

  it("ultimoCambio sube con un recibo nuevo", () => {
    const viejo = new Date("2026-01-01T00:00:00Z");
    const carpeta = enFase4("---\nlotes: 2\n---\n");
    for (const documento of [...TODOS.slice(0, 4)]) fs.utimesSync(path.join(carpeta, documento), viejo, viejo);
    const antes = estadoDeTarea("login-sso", carpeta, CON_RECIBOS).ultimoCambio!;
    assert.equal(antes, viejo.getTime());

    fs.writeFileSync(path.join(carpeta, "04 - Ejecución", "L01 - a.md"), recibo("L01", "pendiente"), "utf-8");
    const despues = estadoDeTarea("login-sso", carpeta, CON_RECIBOS).ultimoCambio!;
    assert.ok(despues > antes, `${despues} > ${antes}`);
  });

  // Un recibo de un lote que el plan no declara, con el commit
  // pendiente, hacía decir "lote 5 de 2".
  it("un recibo fuera de plan no es el lote actual", () => {
    const carpeta = enFase4("---\nlotes: 2\n---\n", { "L05 - fuera.md": recibo("L05", "pendiente") });
    const estado = estadoDeTarea("login-sso", carpeta, CON_RECIBOS);
    assert.equal(estado.lotes?.pendienteDeCommit, null);
    assert.equal(describeEstado(estado, CON_RECIBOS), "va en Fase 4 (Ejecución, lote 1 de 2); hechas: 1, 2, 3");
  });
});
