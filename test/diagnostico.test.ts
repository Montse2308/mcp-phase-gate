// El diagnóstico reúne en un objeto lo que hoy está repartido entre el entorno, las capas de
// prompts, el estado y la Documentación. Cada código de hallazgo tiene aquí su caso, y también su
// contrario: un aviso que salta sin motivo enseña a ignorar todos los demás.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { execFileSync } from "node:child_process";

import { doctorReverificando, ejecutarCli } from "../src/cli.js";
import { cargarEnv, fijarRaizDelPaquete } from "../src/config.js";
import { LARGO_DE_RUTA, anclasNoVigentes, deducirVia, diagnosticar, formatearDiagnostico } from "../src/diagnostico.js";
import type { Diagnostico } from "../src/diagnostico.js";
import { registrarLote } from "../src/lotes.js";
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
const PROMPTS_DEL_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts", "es");

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

  // Etapa 3, L02: BASE y PENDIENTES son esqueleto y se reinyectan desde la fábrica; EVIDENCIA no.
  it("GLOBAL-REINYECTADO sustituye a GLOBAL-SIN-BASE cuando la fábrica tiene las secciones que faltan", () => {
    instalacionCorrecta();
    fijarRaizDelPaquete(path.resolve(PROMPTS_DEL_REPO, "..", ".."));
    try {
      promptsTemporales({ "global-rules.md": "## REGLA GLOBAL INQUEBRANTABLE (CERO RUPTURAS)\n\n## EVIDENCIA\n" });
      const sinEsqueleto = diagnosticar();
      const reinyectado = sinEsqueleto.hallazgos.find((h) => h.codigo === "GLOBAL-REINYECTADO");
      assert.equal(reinyectado?.severidad, "aviso");
      assert.match(reinyectado?.texto ?? "", /se añaden al final las de fábrica/);
      assert.match(reinyectado?.texto ?? "", /global\/evidencia/);
      assert.ok(!codigos(sinEsqueleto).includes("GLOBAL-SIN-BASE"));

      // Sin EVIDENCIA, que es una ranura y no se reinyecta, sigue saliendo GLOBAL-SIN-BASE para ella.
      promptsTemporales({ "global-rules.md": "## BASE DE CADA DECISIÓN\n\n## PENDIENTES HEREDADOS\n" });
      const sinEvidencia = diagnosticar();
      assert.ok(!codigos(sinEvidencia).includes("GLOBAL-REINYECTADO"));
      assert.match(sinEvidencia.hallazgos.find((h) => h.codigo === "GLOBAL-SIN-BASE")?.texto ?? "", /no tiene "## EVIDENCIA"\./);
    } finally {
      fijarRaizDelPaquete(null);
    }
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

// Ajustes de la auditoría de la Etapa 2: el diagnóstico no puede lanzar ante una instalación rota.
describe("diagnosticar ante instalaciones rotas", () => {
  it("PROMPTS_PATH apuntando a un archivo no lanza y lo avisa como CAPA-NO-ES-CARPETA", () => {
    instalacionCorrecta();
    const archivo = path.join(carpetaTemporal("diag"), "prompts.md");
    fs.writeFileSync(archivo, "no soy una carpeta", "utf-8");
    process.env.PHASE_GATE_PROMPTS_PATH = archivo;

    const d = diagnosticar();
    const hallazgo = d.hallazgos.find((h) => h.codigo === "CAPA-NO-ES-CARPETA");
    assert.equal(hallazgo?.severidad, "aviso");
    assert.match(hallazgo?.texto ?? "", /no es una carpeta/);
    assert.ok(!codigos(d).includes("CAPA-NO-EXISTE"));
    assert.doesNotThrow(() => formatearDiagnostico(d, "texto"));
  });

  it("un active-tasks.json corrupto se avisa como ESTADO-ILEGIBLE", () => {
    instalacionCorrecta();
    fs.writeFileSync(path.join(process.env.ORQUESTADOR_STATE_PATH!, "active-tasks.json"), "{ esto no es json", "utf-8");

    const hallazgo = diagnosticar().hallazgos.find((h) => h.codigo === "ESTADO-ILEGIBLE");
    assert.equal(hallazgo?.severidad, "aviso");
  });

  it("un active-tasks.json válido no produce ESTADO-ILEGIBLE", () => {
    instalacionCorrecta();
    fs.writeFileSync(path.join(process.env.ORQUESTADOR_STATE_PATH!, "active-tasks.json"), "{}", "utf-8");

    assert.ok(!codigos(diagnosticar()).includes("ESTADO-ILEGIBLE"));
  });

  it("un .env que no se puede leer (una carpeta) es ENV-ILEGIBLE", () => {
    instalacionCorrecta();
    cargarEnv(carpetaTemporal("env-carpeta"));

    const hallazgo = diagnosticar().hallazgos.find((h) => h.codigo === "ENV-ILEGIBLE");
    assert.equal(hallazgo?.severidad, "error");
  });
});

// L09 de la Etapa 4: doctor revisa los recibos, las anclas y los índices de la Fase 4, y las rutas largas.
describe("diagnosticar: los recibos de la Fase 4", () => {
  const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  afterEach(() => fijarRaizDelPaquete(null));

  const g = (dir: string, ...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=Prueba", "-c", "user.email=prueba@ejemplo.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

  // Un proyecto con una tarea en la Fase 4; con `repo`, un repo de git `api` declarado en el manifiesto.
  function enFase4(lotes: number, conRepo = false) {
    fijarRaizDelPaquete(RAIZ);
    const { docs, repos } = instalacionCorrecta();
    crearProyecto(docs, "P");
    if (conRepo) {
      fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, repos: [{ id: "api", dir: "api" }] }), "utf-8");
      fs.mkdirSync(path.join(repos, "api"));
      g(path.join(repos, "api"), "init", "-q");
    }
    const tarea = crearTarea(docs, "P", "t", ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md", "02 - Decisiones.md"]);
    fs.writeFileSync(path.join(tarea, "03 - Plan Técnico.md"), `---\nlotes: ${lotes}\n---\n# Plan\n`, "utf-8");
    return { docs, tarea, repo: path.join(repos, "api") };
  }
  const lote = (n: number, extra: Record<string, unknown> = {}) => ({ lote: n, titulo: `lote ${n}`, estado: "verificado" as const, que_se_hizo: "x", verificacion: "y", ...extra });

  it("un recibo de un lote que el plan no declara es RECIBO-FUERA-DE-PLAN, y uno escrito a mano, RECIBO-MANUAL (info)", () => {
    const { tarea } = enFase4(2);
    fs.mkdirSync(path.join(tarea, "04 - Ejecución"));
    fs.writeFileSync(path.join(tarea, "04 - Ejecución", "L01 - a mano.md"), "---\nlote: L01\nestado: verificado\ncommit: no aplica\n---\n# L01 — a mano\n", "utf-8");
    fs.writeFileSync(path.join(tarea, "04 - Ejecución", "L03 - sobra.md"), "---\nlote: L03\norigen: servidor\ncommit: pendiente\n---\n", "utf-8");

    const d = diagnosticar();
    const fuera = d.hallazgos.find((h) => h.codigo === "RECIBO-FUERA-DE-PLAN");
    assert.equal(fuera?.severidad, "aviso");
    assert.match(fuera!.texto, /^P\/t: `04 - Ejecución\/L03 - sobra\.md` es de un lote que el plan no declara \(declara 2\)\./);
    const manual = d.hallazgos.find((h) => h.codigo === "RECIBO-MANUAL");
    assert.equal(manual?.severidad, "info");
    assert.match(manual!.texto, /^P\/t: el recibo de L01 se escribió a mano/);
  });

  it("INDICE-DESINCRONIZADO: el índice que generó el servidor ya no es el que ensamblaría hoy", async () => {
    const { tarea } = enFase4(2);
    await registrarLote("P", "t", lote(1, { verification_note: "revisado" }));
    await registrarLote("P", "t", lote(2, { verification_note: "revisado" }));
    assert.ok(fs.existsSync(path.join(tarea, "04 - Ejecución.md")));
    assert.equal(codigos(diagnosticar()).includes("INDICE-DESINCRONIZADO"), false, "recién cerrado coincide");

    // Un recibo tocado a mano después del cierre.
    const recibo = path.join(tarea, "04 - Ejecución", "L02 - lote 2.md");
    fs.writeFileSync(recibo, fs.readFileSync(recibo, "utf-8").replace("estado: verificado", "estado: con pendientes"), "utf-8");
    const h = diagnosticar().hallazgos.find((x) => x.codigo === "INDICE-DESINCRONIZADO");
    assert.equal(h?.severidad, "aviso");
    assert.match(h!.texto, /^P\/t: `04 - Ejecución\.md` no coincide con lo que el servidor ensamblaría hoy/);
  });

  // Hallazgo 12 de la auditoría de la Etapa 4: el código existía y no tenía test.
  it("un recibo que no se puede leer (binario) es RECIBO-ILEGIBLE", () => {
    const { tarea } = enFase4(2);
    fs.mkdirSync(path.join(tarea, "04 - Ejecución"));
    fs.writeFileSync(path.join(tarea, "04 - Ejecución", "L01 - roto.md"), Buffer.from([0, 1, 2, 0]));
    const h = diagnosticar().hallazgos.find((x) => x.codigo === "RECIBO-ILEGIBLE");
    assert.equal(h?.severidad, "aviso");
    assert.match(h!.texto, /^P\/t: No se pudo leer el recibo `04 - Ejecución\/L01 - roto\.md`: .*parece binario/);
  });

  it("un índice escrito a mano (de la 2.x) no se compara", async () => {
    const { tarea } = enFase4(2);
    fs.writeFileSync(path.join(tarea, "04 - Ejecución.md"), "---\nlotes: 2\n---\n# Ejecución a mano\n", "utf-8");
    assert.equal(codigos(diagnosticar()).includes("INDICE-DESINCRONIZADO"), false);
  });

  it("RUTA-LARGA: alguna ruta de la Documentación pasa de 240 caracteres", () => {
    const { tarea } = enFase4(1);
    assert.equal(codigos(diagnosticar()).includes("RUTA-LARGA"), false);
    const carpeta = path.join(tarea, "una carpeta con un nombre largo de verdad");
    fs.mkdirSync(carpeta);
    const nombre = `${"x".repeat(Math.max(1, LARGO_DE_RUTA + 3 - carpeta.length - 4))}.md`;
    fs.writeFileSync(path.join(carpeta, nombre), "x", "utf-8");
    assert.ok(path.join(carpeta, nombre).length > LARGO_DE_RUTA);

    const h = diagnosticar().hallazgos.find((x) => x.codigo === "RUTA-LARGA");
    assert.equal(h?.severidad, "aviso");
    assert.match(h!.texto, /^1 ruta de la Documentación pasa de 240 caracteres; la más larga \(\d+\):/);
  });

  it("ANCLA-NO-VIGENTE solo con doctor --reverificar: tras un --amend, el commit del recibo ya no está en la rama", async () => {
    const { repo } = enFase4(2, true);
    fs.writeFileSync(path.join(repo, "a.txt"), "a\n", "utf-8");
    g(repo, "add", "a.txt");
    g(repo, "commit", "-q", "-m", "lote 1");
    await registrarLote("P", "t", lote(1, { commit: g(repo, "rev-parse", "HEAD"), archivos: [{ archivo: "a.txt", cambio: "nuevo" }] }));
    assert.deepEqual(await anclasNoVigentes(), []);

    g(repo, "commit", "-q", "--amend", "-m", "lote 1, reescrito");
    const hallazgos = await anclasNoVigentes();
    assert.equal(hallazgos.length, 1);
    assert.equal(hallazgos[0]!.severidad, "aviso");
    assert.match(hallazgos[0]!.texto, /^P\/t, L01: El commit `[0-9a-f]{7}` ya no está en la rama actual \(`main`\)/);
    assert.equal(codigos(diagnosticar()).includes("ANCLA-NO-VIGENTE"), false, "sin --reverificar no se mira git");

    let salida = "";
    const codigo = await doctorReverificando(true, { out: (t) => (salida += t), err: () => {} });
    assert.equal(codigo, 0, "un aviso no es un error");
    assert.ok((JSON.parse(salida) as Diagnostico).hallazgos.some((h) => h.codigo === "ANCLA-NO-VIGENTE"));
  });

  it("doctor --reverificar es una acción aparte, y no va con --fase", () => {
    const err: string[] = [];
    const salida = { out: () => {}, err: (t: string) => err.push(t) };
    assert.deepEqual(ejecutarCli(["doctor", "--reverificar"], salida), { accion: "doctor-reverificar", json: false });
    assert.deepEqual(ejecutarCli(["doctor", "--reverificar", "--json"], salida), { accion: "doctor-reverificar", json: true });
    assert.deepEqual(ejecutarCli(["doctor", "--reverificar", "--fase", "3"], salida), { accion: "salir", codigo: 2 });
    assert.match(err.join("\n"), /--reverificar no va con --fase ni con --proyecto/);
  });
});
