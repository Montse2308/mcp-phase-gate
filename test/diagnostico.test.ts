// El diagnóstico reúne en un objeto lo que hoy está repartido entre el entorno, las capas de
// prompts, el estado y la Documentación. Cada código de hallazgo tiene aquí su caso, y también su
// contrario: un aviso que salta sin motivo enseña a ignorar todos los demás.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { cargarEnv } from "../src/config.js";
import { deducirVia, diagnosticar, formatearDiagnostico } from "../src/diagnostico.js";
import type { Diagnostico } from "../src/diagnostico.js";
import { guardarPuntero } from "../src/tasks.js";
import {
  carpetaTemporal,
  crearProyecto,
  crearTarea,
  docsTemporales,
  estadoTemporal,
  limpiarEntorno,
  promptsTemporales,
} from "./helpers.js";

afterEach(limpiarEntorno);

// Este archivo compila a build-test/test/; los prompts del repo están dos niveles arriba.
const PROMPTS_DEL_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts");

const GLOBALES_COMPLETAS = [
  "## REGLA GLOBAL INQUEBRANTABLE (CERO RUPTURAS)",
  "## EVIDENCIA",
  "## BASE DE CADA DECISIÓN",
  "## PENDIENTES HEREDADOS",
].join("\n\n");

// Una instalación correcta: Documentación con un proyecto, repos, estado aislado y los prompts
// del repo como capa propia (en los tests la capa de fábrica, build-test/prompts, no existe).
function instalacionCorrecta(): { docs: string; repos: string } {
  const docs = docsTemporales();
  const repos = carpetaTemporal("repos");
  process.env.ORQUESTADOR_REPOS_PATH = repos;
  process.env.ORQUESTADOR_PROMPTS_PATH = PROMPTS_DEL_REPO;
  estadoTemporal();
  return { docs, repos };
}

function codigos(d: Diagnostico): string[] {
  return d.hallazgos.map((h) => h.codigo);
}

describe("diagnosticar", () => {
  it("sin nada configurado no lanza, y los dos VAR-FALTA son errores", () => {
    estadoTemporal();

    const d = diagnosticar();
    const faltan = d.hallazgos.filter((h) => h.codigo === "VAR-FALTA");
    assert.equal(faltan.length, 2);
    assert.ok(faltan.every((h) => h.severidad === "error"));
    assert.match(faltan[0]!.texto, /PHASE_GATE_DOCS_PATH/);
    assert.equal(d.rutas.docs.existe, false);
    assert.deepEqual(d.proyectos, []);
  });

  it("VAR-FALTA también con una ruta que no existe, y la ruta queda en el diagnóstico", () => {
    estadoTemporal();
    const inexistente = path.join(carpetaTemporal("diag"), "no-existe");
    process.env.PHASE_GATE_DOCS_PATH = inexistente;

    const d = diagnosticar();
    assert.equal(d.rutas.docs.ruta, inexistente);
    assert.equal(d.rutas.docs.existe, false);
    assert.ok(codigos(d).includes("VAR-FALTA"));
  });

  it("una instalación correcta no tiene errores ni avisos", () => {
    instalacionCorrecta();

    const d = diagnosticar();
    assert.deepEqual(
      d.hallazgos.filter((h) => h.severidad !== "info"),
      []
    );
    assert.equal(d.rutas.docs.existe, true);
    assert.equal(d.rutas.repos.existe, true);
    assert.deepEqual(d.fases.map((f) => f.numero), [1, 2, 3, 4, 5]);
    assert.equal(d.fases.find((f) => f.numero === 4)?.recibos, "04 - Ejecución");
  });

  it("VAR-DISCREPA avisa cuando las dos variables de un nombre difieren", () => {
    instalacionCorrecta();
    process.env.PHASE_GATE_REPOS_PATH = carpetaTemporal("otros-repos");

    const d = diagnosticar();
    const hallazgo = d.hallazgos.find((h) => h.codigo === "VAR-DISCREPA");
    assert.equal(hallazgo?.severidad, "aviso");
    assert.match(hallazgo?.texto ?? "", /ORQUESTADOR_REPOS_PATH difiere de PHASE_GATE_REPOS_PATH/);
  });

  it("ENV-UTF16 es un error cuando el .env está en UTF-16", () => {
    instalacionCorrecta();
    const archivo = path.join(carpetaTemporal("env"), ".env");
    fs.writeFileSync(archivo, Buffer.from("\uFEFFA=1\n", "utf16le"));
    cargarEnv(archivo);

    const hallazgo = diagnosticar().hallazgos.find((h) => h.codigo === "ENV-UTF16");
    assert.equal(hallazgo?.severidad, "error");
    assert.match(hallazgo?.texto ?? "", /UTF-8/);
  });

  // Riesgo E1-R1: un global-rules.md propio sustituye al de fábrica y las fases citan sus secciones.
  it("GLOBAL-SIN-BASE avisa de las secciones que le faltan a un global-rules.md propio", () => {
    instalacionCorrecta();
    promptsTemporales({ "global-rules.md": "## REGLA GLOBAL INQUEBRANTABLE (CERO RUPTURAS)\n\n## EVIDENCIA\n" });

    const d = diagnosticar();
    const hallazgo = d.hallazgos.find((h) => h.codigo === "GLOBAL-SIN-BASE");
    assert.equal(hallazgo?.severidad, "aviso");
    assert.match(hallazgo?.texto ?? "", /"## BASE DE CADA DECISIÓN", "## PENDIENTES HEREDADOS"/);
    assert.equal(d.reglasGlobales.capa, "propia");
    assert.deepEqual(d.reglasGlobales.faltan, ["BASE DE CADA DECISIÓN", "PENDIENTES HEREDADOS"]);
  });

  it("GLOBAL-SIN-BASE no salta con un global-rules.md propio completo, aunque esté en CRLF y con BOM", () => {
    instalacionCorrecta();
    promptsTemporales({ "global-rules.md": `\uFEFF${GLOBALES_COMPLETAS.replace(/\n/g, "\r\n")}\r\n` });

    const d = diagnosticar();
    assert.ok(!codigos(d).includes("GLOBAL-SIN-BASE"));
    assert.deepEqual(d.reglasGlobales.faltan, []);
  });

  it("GLOBAL-SIN-BASE cuenta la sección solo si es una línea de encabezado exacta", () => {
    instalacionCorrecta();
    promptsTemporales({
      "global-rules.md": "## EVIDENCIA\n## BASE DE CADA DECISIÓN\nVer ## PENDIENTES HEREDADOS en otro lado\n",
    });

    assert.deepEqual(diagnosticar().reglasGlobales.faltan, ["PENDIENTES HEREDADOS"]);
  });

  it("FASE-SIN-DOC avisa de una fase que no declara documento", () => {
    instalacionCorrecta();
    promptsTemporales({ "fase-6-extra.md": "# Extra\n\nSin cabecera." });

    const d = diagnosticar();
    const hallazgo = d.hallazgos.find((h) => h.codigo === "FASE-SIN-DOC");
    assert.equal(hallazgo?.severidad, "aviso");
    assert.match(hallazgo?.texto ?? "", /Fase 6 \(Extra\)/);
    assert.equal(d.fases.find((f) => f.numero === 6)?.documento, undefined);
  });

  it("FASE-SIN-COMANDO es informativo, y desaparece con un comandos/fN.md en una capa", () => {
    instalacionCorrecta();
    const capa = promptsTemporales({ "fase-6-extra.md": "---\ndocumento: 06 - Extra.md\n---\n# Extra\n" });

    const antes = diagnosticar().hallazgos.filter((h) => h.codigo === "FASE-SIN-COMANDO");
    assert.ok(antes.some((h) => h.severidad === "info" && /Fase 6/.test(h.texto)));

    fs.mkdirSync(path.join(capa, "comandos"));
    fs.writeFileSync(path.join(capa, "comandos", "f6.md"), "Comando de la fase 6", "utf-8");

    const d = diagnosticar();
    assert.ok(!d.hallazgos.some((h) => h.codigo === "FASE-SIN-COMANDO" && /Fase 6/.test(h.texto)));
    assert.equal(d.fases.find((f) => f.numero === 6)?.comando, path.join(capa, "comandos", "f6.md"));
  });

  it("CAPA-NO-EXISTE avisa cuando PROMPTS_PATH apunta a una carpeta que no existe", () => {
    instalacionCorrecta();
    const inexistente = path.join(carpetaTemporal("diag"), "mis-prompts");
    process.env.PHASE_GATE_PROMPTS_PATH = inexistente;

    const d = diagnosticar();
    const hallazgo = d.hallazgos.find((h) => h.codigo === "CAPA-NO-EXISTE");
    assert.equal(hallazgo?.severidad, "aviso");
    assert.match(hallazgo?.texto ?? "", /PHASE_GATE_PROMPTS_PATH/);
    assert.equal(d.capas.find((c) => c.etiqueta === "propia")?.existe, false);
  });

  it("PUNTERO-HUERFANO informa de un puntero a una tarea o a un proyecto que ya no existen", () => {
    const { docs } = instalacionCorrecta();
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "tarea-viva");
    guardarPuntero("PROYECTO-A", "tarea-borrada");
    guardarPuntero("PROYECTO-BORRADO", "x");

    const huerfanos = diagnosticar().hallazgos.filter((h) => h.codigo === "PUNTERO-HUERFANO");
    assert.equal(huerfanos.length, 2);
    assert.ok(huerfanos.every((h) => h.severidad === "info"));
    assert.ok(huerfanos.some((h) => /tarea-borrada/.test(h.texto)));
    assert.ok(huerfanos.some((h) => /proyecto-borrado/.test(h.texto)));
  });

  it("lista los proyectos con su número de tareas y la activa", () => {
    const { docs } = instalacionCorrecta();
    crearProyecto(docs, "PROYECTO-A");
    crearProyecto(docs, "PROYECTO-B");
    crearTarea(docs, "PROYECTO-A", "login", ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md"]);
    crearTarea(docs, "PROYECTO-A", "reporte");
    guardarPuntero("PROYECTO-A", "login");

    const d = diagnosticar();
    assert.deepEqual(
      d.proyectos.map((p) => [p.nombre, p.tareas, p.activa?.tarea ?? null, p.activa?.origen ?? null]),
      [
        ["PROYECTO-A", 2, "login", "puntero"],
        ["PROYECTO-B", 0, null, null],
      ]
    );
    assert.match(d.proyectos[0]!.activa!.fase, /va en Fase 2/);
    assert.equal(d.estado.punteros, 1);
    assert.equal(d.estado.existe, true);
  });

  it("los errores van antes que los avisos, y los avisos antes que lo informativo", () => {
    estadoTemporal();
    promptsTemporales({ "fase-6-extra.md": "# Extra" });

    const orden = { error: 0, aviso: 1, info: 2 } as const;
    const severidades = diagnosticar().hallazgos.map((h) => orden[h.severidad]);
    assert.deepEqual(severidades, [...severidades].sort((a, b) => a - b));
  });

  it("incluye el cliente solo cuando se lo pasan", () => {
    instalacionCorrecta();

    assert.equal("cliente" in diagnosticar(), false);
    const cliente = { nombre: "claude-code", version: "2.0", capacidades: { elicitation: true, roots: false } };
    assert.deepEqual(diagnosticar({ cliente }).cliente, cliente);
  });
});

describe("deducirVia", () => {
  it("una ruta dentro de _npx es npx", () => {
    assert.equal(deducirVia(path.join("C:", "Users", "ana", "AppData", "Local", "npm-cache", "_npx", "3f1a", "node_modules", "mcp-phase-gate")), "npx");
    assert.equal(deducirVia("/home/ana/.npm/_npx/3f1a/node_modules/mcp-phase-gate"), "npx");
  });

  it("una ruta bajo la raíz global de npm es global", () => {
    const prefijo = carpetaTemporal("prefijo");
    const raiz = process.platform === "win32" ? path.join(prefijo, "node_modules") : path.join(prefijo, "lib", "node_modules");

    assert.equal(deducirVia(path.join(raiz, "mcp-phase-gate"), { npm_config_prefix: prefijo }), "global");
  });

  it("una carpeta con .git es un clon", () => {
    const clon = carpetaTemporal("clon");
    fs.mkdirSync(path.join(clon, ".git"));

    assert.equal(deducirVia(clon, {}), "clon");
  });

  it("si no, es una dependencia", () => {
    assert.equal(deducirVia(carpetaTemporal("dep"), {}), "dependencia");
  });
});

describe("formatearDiagnostico", () => {
  it("en texto tiene las secciones en orden y marca las rutas", () => {
    const { docs } = instalacionCorrecta();
    crearProyecto(docs, "PROYECTO-A");

    const texto = formatearDiagnostico(diagnosticar(), "texto");
    const secciones = ["Variables", "Estado", "Prompts (de menor a mayor prioridad)", "Proyectos", "Hallazgos"];
    const posiciones = secciones.map((s) => texto.search(new RegExp(`^${s.replace(/[()]/g, "\\$&")}`, "m")));
    assert.ok(posiciones.every((p) => p >= 0), texto);
    assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b));

    assert.match(texto, /^mcp-phase-gate \S+ · vía \w+$/m);
    assert.match(texto, /^ {2}DOCS_PATH +✓ .+ORQUESTADOR_DOCS_PATH · entorno$/m);
    assert.match(texto, /^ {2}TASKS_SUBDIR +· Proyectos +ORQUESTADOR_TASKS_SUBDIR · entorno$/m);
    assert.match(texto, /^ {2}Fase 4 .+← propia +· 04 - Ejecución\.md \+ 04 - Ejecución\/ · \/f4$/m);
    assert.match(texto, /^ {2}PROYECTO-A +0 tareas$/m);
  });

  it("en texto, sin DOCS_PATH, la marca es ✗ y los proyectos no se listan", () => {
    estadoTemporal();

    const texto = formatearDiagnostico(diagnosticar(), "texto");
    assert.match(texto, /^ {2}DOCS_PATH +✗ sin definir$/m);
    assert.match(texto, /no se pueden listar sin DOCS_PATH/);
    assert.match(texto, /^ {2}error +VAR-FALTA/m);
  });

  it("en Markdown tiene las secciones como encabezados ### y tablas", () => {
    instalacionCorrecta();

    const md = formatearDiagnostico(diagnosticar(), "markdown");
    for (const seccion of ["Variables", "Estado", "Prompts", "Proyectos", "Hallazgos"]) {
      assert.match(md, new RegExp(`^### ${seccion}$`, "m"));
    }
    assert.match(md, /^\| Variable \|/m);
    assert.match(md, /^\| Fase \| Título \|/m);
  });

  it("en Markdown escapa las barras para no romper las tablas", () => {
    instalacionCorrecta();
    const d = diagnosticar();
    d.hallazgos.push({ severidad: "info", codigo: "PRUEBA", texto: "a | b" });

    assert.match(formatearDiagnostico(d, "markdown"), /\| info \| PRUEBA \| a \\\| b \|/);
  });
});
