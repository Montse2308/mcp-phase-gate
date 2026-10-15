// El diagnóstico ampliado de la Etapa 3 (§5.9 del plan maestro v3): configuración local, manifiestos,
// presets, bloques, repos y raíces. Cada código nuevo tiene aquí su caso y, cuando importa, su
// contrario.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ejecutarCli } from "../src/cli.js";
import type { Salida } from "../src/cli.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import { diagnosticar, diagnosticarSinBloquear, formatearDiagnostico, informeDeConfiguracion, procedenciaDeFase } from "../src/diagnostico.js";
import { estadosConPlazo } from "../src/repos.js";
import type { Diagnostico } from "../src/diagnostico.js";
import { ejecutarEject } from "../src/eject.js";
import { conectar, textoDe } from "./cliente.js";
import { carpetaTemporal, configTemporal, crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTEXTO = "00 - Contexto Inicial.md";

function instalacion(): { docs: string; repos: string; config: string } {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  const repos = carpetaTemporal("repos");
  process.env.PHASE_GATE_REPOS_PATH = repos;
  estadoTemporal();
  const config = configTemporal();
  return { docs, repos, config };
}

function proyecto(docs: string, nombre: string, manifiesto?: unknown, tareas: string[] = []): string {
  crearProyecto(docs, nombre);
  for (const tarea of tareas) crearTarea(docs, nombre, tarea, [CONTEXTO]);
  if (manifiesto !== undefined) {
    fs.writeFileSync(path.join(docs, nombre, "phase-gate.json"), typeof manifiesto === "string" ? manifiesto : JSON.stringify(manifiesto), "utf-8");
  }
  return path.join(docs, nombre);
}

const hallazgo = (d: Diagnostico, codigo: string) => d.hallazgos.filter((h) => h.codigo === codigo);
const codigos = (d: Diagnostico) => d.hallazgos.map((h) => h.codigo);

function repoGit(destino: string): void {
  fs.mkdirSync(destino, { recursive: true });
  const g = (...args: string[]) => execFileSync("git", ["-c", "user.name=P", "-c", "user.email=p@e.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: destino, stdio: "ignore" });
  g("init", "-q");
  fs.writeFileSync(path.join(destino, "a.txt"), "a", "utf-8");
  g("add", "a.txt");
  g("commit", "-q", "-m", "uno");
}

describe("diagnosticar: configuración local", () => {
  it("configDir, machine.json con sus overrides y los presets disponibles con su origen", () => {
    const { config } = instalacion();
    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, repos: { "P/api": "C:/x" }, presetPorDefecto: "software-tdd" }), "utf-8");

    const d = diagnosticar();
    assert.equal(d.configuracion.configDir, config);
    assert.deepEqual(d.configuracion.maquina, { archivo: path.join(config, "machine.json"), existe: true, valido: true, overrides: 1, presetPorDefecto: "software-tdd" });
    assert.deepEqual(
      d.configuracion.presets.map((p) => `${p.nombre}:${p.origen}`),
      ["ai-agent-ops:paquete", "multi-repo-feature:paquete", "research-ops:paquete", "software:integrado", "software-replica:paquete", "software-tdd:paquete"]
    );
    const texto = formatearDiagnostico(d, "texto");
    assert.match(texto, /machine\.json {2}válido · 1 override de repo · presetPorDefecto software-tdd/);
    assert.match(formatearDiagnostico(d, "markdown"), /### Configuración/);
  });

  it("MAQUINA-INVALIDA y MAQUINA-CLAVE-DUPLICADA", () => {
    const { config } = instalacion();
    fs.writeFileSync(path.join(config, "machine.json"), "{ roto", "utf-8");
    assert.equal(hallazgo(diagnosticar(), "MAQUINA-INVALIDA")[0]?.severidad, "error");

    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, repos: { "P/api": "C:/a", "p/api": "C:/b" } }), "utf-8");
    assert.equal(hallazgo(diagnosticar(), "MAQUINA-CLAVE-DUPLICADA")[0]?.severidad, "aviso");
  });

  it("PRESET-NO-EXISTE por el presetPorDefecto de machine.json", () => {
    const { config } = instalacion();
    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, presetPorDefecto: "no-existe" }), "utf-8");

    const h = hallazgo(diagnosticar(), "PRESET-NO-EXISTE");
    assert.equal(h[0]?.severidad, "error");
    assert.match(h[0]?.texto ?? "", /presetPorDefecto .* es "no-existe", que no existe/);
  });
});

describe("diagnosticar: manifiestos y presets de cada proyecto", () => {
  it("un proyecto con manifiesto válido muestra su preset, sus reglas y sus repos", () => {
    const { docs, repos } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 1, preset: "research-ops", repos: [{ id: "api", dir: "api" }] });
    repoGit(path.join(repos, "api"));

    const p = diagnosticar().proyectos.find((x) => x.nombre === "PROYECTO-A")!;
    assert.equal(p.manifiesto, "válido");
    assert.deepEqual(p.preset, { nombre: "research-ops", origen: "del proyecto" });
    assert.deepEqual(p.reglas, { lotes: true, commits: "ninguno" });
    assert.deepEqual(p.repos, [{ id: "api", ruta: path.join(repos, "api"), origen: "PHASE_GATE_REPOS_PATH", existe: true, esGit: true, rama: "main" }]);
    assert.equal(p.roots, null, "sin raíces de sesión no se dice nada de ellas");
    assert.match(formatearDiagnostico(diagnosticar(), "texto"), /manifiesto válido · preset research-ops \(del proyecto\) · lotes sí · commits ninguno/);
  });

  it("MANIFIESTO-INVALIDO es un error y el proyecto se lista igual, sin preset", () => {
    const { docs } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 2 }, ["t"]);

    const d = diagnosticar();
    assert.match(hallazgo(d, "MANIFIESTO-INVALIDO")[0]?.texto ?? "", /phase-gate\.json de PROYECTO-A no es válido .*version: debe ser 1/);
    const p = d.proyectos.find((x) => x.nombre === "PROYECTO-A")!;
    assert.equal(p.tareas, 1);
    assert.match(p.manifiesto, /^inválido: /);
    assert.equal(p.preset, null);
  });

  it("PRESET-NO-EXISTE por el manifiesto y por una tarea", () => {
    const { docs } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 1, preset: "inventado" });
    const conTarea = proyecto(docs, "PROYECTO-B", { version: 1 }, ["t"]);
    fs.writeFileSync(path.join(conTarea, "Proyectos", "t", CONTEXTO), "---\npreset: otro-inventado\n---\nreq", "utf-8");

    const textos = hallazgo(diagnosticar(), "PRESET-NO-EXISTE").map((h) => h.texto);
    assert.ok(textos.some((t) => /PROYECTO-A .*no existe el preset "inventado"/.test(t)), textos.join("\n"));
    assert.ok(textos.some((t) => /La tarea "t" de PROYECTO-B declara el preset "otro-inventado"/.test(t)), textos.join("\n"));
  });

  it("MANIFIESTO-CONFLICTO avisa de una copia que dejó OneDrive", () => {
    const { docs } = instalacion();
    const carpeta = proyecto(docs, "PROYECTO-A", { version: 1 });
    fs.writeFileSync(path.join(carpeta, "phase-gate-PORTATIL.json"), "{}", "utf-8");

    assert.match(hallazgo(diagnosticar(), "MANIFIESTO-CONFLICTO")[0]?.texto ?? "", /"phase-gate-PORTATIL\.json"/);
  });

  it("PRESET-IMPLICITO: sin manifiesto ni presetPorDefecto y con tareas; no con cualquiera de los dos, ni sin tareas", () => {
    const { docs, config } = instalacion();
    proyecto(docs, "CON-TAREAS", undefined, ["t1", "t2"]);
    proyecto(docs, "SIN-TAREAS");
    proyecto(docs, "CON-MANIFIESTO", { version: 1 }, ["t"]);

    const h = hallazgo(diagnosticar(), "PRESET-IMPLICITO");
    assert.equal(h.length, 1);
    assert.match(h[0]!.texto, /^CON-TAREAS no tiene phase-gate\.json .*sus 2 tareas usan el preset `software`.*init --migrate/);

    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, presetPorDefecto: "software-replica" }), "utf-8");
    assert.deepEqual(hallazgo(diagnosticar(), "PRESET-IMPLICITO"), []);
  });
});

describe("diagnosticar: bloques, repos, git y raíces", () => {
  it("BLOQUE-HUERFANO, BLOQUE-DUPLICADO y BLOQUE-MAL-FORMADO, sin repetirse entre proyectos", () => {
    const { docs, config } = instalacion();
    const a = proyecto(docs, "PROYECTO-A", { version: 1 });
    proyecto(docs, "PROYECTO-B", { version: 1 });
    fs.mkdirSync(path.join(a, ".phase-gate", "prompts"), { recursive: true });
    fs.writeFileSync(
      path.join(a, ".phase-gate", "prompts", "bloques.md"),
      "<!-- bloque: fase-3/verificaion -->\nx\n<!-- /bloque -->\n<!-- bloque: fase-1/rol -->\na\n<!-- /bloque -->\n<!-- bloque: fase-1/rol -->\nb\n<!-- /bloque -->\n",
      "utf-8"
    );
    fs.mkdirSync(path.join(config, "prompts"));
    fs.writeFileSync(path.join(config, "prompts", "bloques.md"), "<!-- bloque: fase-1/rol -->\nsin cerrar\n", "utf-8");

    const d = diagnosticar();
    assert.match(hallazgo(d, "BLOQUE-HUERFANO")[0]?.texto ?? "", /«fase-3\/verificaion» de .*bloques\.md:1/);
    assert.equal(hallazgo(d, "BLOQUE-DUPLICADO").length, 1);
    assert.equal(hallazgo(d, "BLOQUE-MAL-FORMADO").length, 1, "el bloques.md global sale una vez, no una por proyecto");
  });

  it("REPO-NO-EXISTE avisa de un repo que no está en este equipo", () => {
    const { docs } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 1, repos: [{ id: "api", dir: "no-esta" }] });

    assert.match(hallazgo(diagnosticar(), "REPO-NO-EXISTE")[0]?.texto ?? "", /El repo `api` de PROYECTO-A apunta a ".*no-esta" \(PHASE_GATE_REPOS_PATH\)/);
  });

  it("GIT-NO-INSTALADO, una sola vez, cuando git no está en el PATH", () => {
    const { docs, repos } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 1, repos: [{ id: "uno", dir: "uno" }, { id: "dos", dir: "dos" }] });
    fs.mkdirSync(path.join(repos, "uno"));
    fs.mkdirSync(path.join(repos, "dos"));

    const path0 = process.env.PATH;
    process.env.PATH = carpetaTemporal("sin-git");
    try {
      assert.equal(hallazgo(diagnosticar(), "GIT-NO-INSTALADO").length, 1);
    } finally {
      process.env.PATH = path0;
    }
    assert.deepEqual(hallazgo(diagnosticar(), "GIT-NO-INSTALADO"), []);
  });

  it("ROOTS-AMBIGUO es informativo, y cada proyecto dice con qué fuerza coincide", () => {
    const { docs, repos } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 1, repos: [{ id: "api", dir: "api" }] });
    proyecto(docs, "PROYECTO-B", { version: 1, repos: [{ id: "web", dir: "web" }] });
    proyecto(docs, "PROYECTO-C");
    fs.mkdirSync(path.join(repos, "api"));
    fs.mkdirSync(path.join(repos, "web"));

    const d = diagnosticar({ raices: [path.join(repos, "api"), path.join(repos, "web")] });
    assert.equal(hallazgo(d, "ROOTS-AMBIGUO")[0]?.severidad, "info");
    assert.deepEqual(
      d.proyectos.map((p) => [p.nombre, p.roots?.fuerza]),
      [
        ["PROYECTO-A", "fuerte"],
        ["PROYECTO-B", "fuerte"],
        ["PROYECTO-C", null],
      ]
    );
    assert.ok(!codigos(diagnosticar({ raices: [path.join(repos, "api")] })).includes("ROOTS-AMBIGUO"));
  });
});

// Hallazgo 2 de la auditoría de la Etapa 3: el servidor no puede llamar a git de forma síncrona.
describe("diagnóstico sin bloquear", () => {
  it("estadosConPlazo deja en null lo que no responde a tiempo, sin esperar a git", async () => {
    const { repos } = instalacion();
    repoGit(path.join(repos, "api"));
    const repo = { id: "api", dir: "api", rol: null, ruta: path.join(repos, "api"), origenRuta: "PHASE_GATE_REPOS_PATH" as const, existe: true, error: null };

    const inicio = Date.now();
    assert.deepEqual(await estadosConPlazo([repo], 0), [null]);
    assert.ok(Date.now() - inicio < 1000, "esperó a git");
    assert.equal((await estadosConPlazo([repo]))[0]?.rama, "main");
  });

  it("con los estados calculados antes, diagnosticar no llama a git: un repo sin respuesta sale como GIT-LENTO", async () => {
    const { docs, repos } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 1, repos: [{ id: "api", dir: "api" }] });
    repoGit(path.join(repos, "api"));

    const lento = diagnosticar({ estadosDeRepos: new Map([["PROYECTO-A/api", null]]) });
    assert.equal(hallazgo(lento, "GIT-LENTO")[0]?.severidad, "info");
    assert.deepEqual(lento.proyectos[0]?.repos.map((r) => [r.esGit, r.rama]), [[false, null]]);

    const completo = await diagnosticarSinBloquear();
    assert.deepEqual(completo.proyectos[0]?.repos.map((r) => [r.esGit, r.rama]), [[true, "main"]]);
    assert.deepEqual(hallazgo(completo, "GIT-LENTO"), []);
  });
});

describe("doctor --fase N --proyecto P", () => {
  function salida(): Salida & { texto: () => string; errores: () => string } {
    const out: string[] = [];
    const err: string[] = [];
    return { out: (t) => out.push(t), err: (t) => err.push(t), texto: () => out.join("\n"), errores: () => err.join("\n") };
  }

  it("imprime de dónde sale cada ranura; tras eject fase-3/pruebas gana el bloques.md del proyecto", () => {
    const { docs } = instalacion();
    proyecto(docs, "PROYECTO-X", { version: 1, preset: "software-replica" }, ["t"]);

    const antes = salida();
    assert.deepEqual(ejecutarCli(["doctor", "--fase", "3", "--proyecto", "PROYECTO-X"], antes, false), { accion: "salir", codigo: 0 });
    assert.match(antes.texto(), /^Fase 3 · PROYECTO-X · tarea activa: t · preset software-replica \(del proyecto\)/);
    assert.match(antes.texto(), /fase-3\/pruebas +.*software-replica\.md:\d+/);
    assert.match(antes.texto(), /global\/cero-rupturas +fábrica/);

    assert.equal(ejecutarEject("fase-3/pruebas", { destino: "proyecto:PROYECTO-X", dryRun: false, fuerza: false }, salida()), 0);
    const despues = salida();
    ejecutarCli(["doctor", "--fase", "3", "--proyecto", "PROYECTO-X"], despues, false);
    assert.match(despues.texto(), /fase-3\/pruebas +.*PROYECTO-X[\\/]\.phase-gate[\\/]prompts[\\/]bloques\.md:1/);
  });

  it("--json da la procedencia como datos; sin --fase o con una fase que no existe, falla", () => {
    instalacion();
    const json = salida();
    ejecutarCli(["doctor", "--fase", "1", "--json"], json, false);
    const datos = JSON.parse(json.texto());
    assert.equal(datos.fase, 1);
    assert.ok(datos.procedencia.some((p: { ranura: string }) => p.ranura === "fase-1/verificacion"));

    assert.deepEqual(ejecutarCli(["doctor", "--proyecto", "X"], salida(), false), { accion: "salir", codigo: 2 });
    const noExiste = salida();
    assert.deepEqual(ejecutarCli(["doctor", "--fase", "9"], noExiste, false), { accion: "salir", codigo: 1 });
    assert.match(noExiste.errores(), /Fase no válida/);
    assert.equal(procedenciaDeFase(2, null).preset.nombre, "software");
  });
});

describe("phase-gate://configuracion/{proyecto} y get_orchestrator_status", () => {
  it("el recurso enseña el manifiesto efectivo, de dónde sale cada valor y los repos", async () => {
    const { docs, repos } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 1, preset: "software-tdd", reglas: { commits: "auto" }, repos: [{ id: "api", dir: "api", rol: "backend" }] });
    repoGit(path.join(repos, "api"));

    const { cliente, cerrar } = await conectar();
    try {
      const { resources } = await cliente.listResources();
      assert.ok(resources.some((r) => r.uri === "phase-gate://configuracion/PROYECTO-A"));

      const leido = await cliente.readResource({ uri: "phase-gate://configuracion/PROYECTO-A" });
      const texto = (leido.contents[0] as { text: string }).text;
      assert.equal(texto, await informeDeConfiguracion("PROYECTO-A"));
      assert.match(texto, /\| Preset \| `software-tdd` \| del proyecto \|/);
      assert.match(texto, /\| Commits \| `auto` \| del proyecto \|/);
      assert.match(texto, /\| Lotes \| sí \| del preset \|/);
      assert.match(texto, /\| `api` \| backend \| `.*api` \| PHASE_GATE_REPOS_PATH \| sí \| main · limpio \|/);
    } finally {
      await cerrar();
    }
  });

  it("get_orchestrator_status lleva la configuración y, con roots, la fuerza de cada proyecto", async () => {
    const { docs, repos } = instalacion();
    proyecto(docs, "PROYECTO-A", { version: 1, repos: [{ id: "api", dir: "api" }] });
    fs.mkdirSync(path.join(repos, "api"));

    const { ListRootsRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");
    const { pathToFileURL } = await import("node:url");
    const { cliente, cerrar } = await conectar({ roots: {} }, (c) => {
      c.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: [{ uri: pathToFileURL(path.join(repos, "api")).href }] }));
    });
    try {
      const r = await cliente.callTool({ name: "get_orchestrator_status", arguments: {} });
      const datos = r.structuredContent as Diagnostico;
      assert.equal(datos.proyectos[0]?.roots?.fuerza, "fuerte");
      assert.equal(datos.configuracion.maquina.existe, false);
      assert.match(textoDe(r), /carpeta abierta: coincidencia fuerte/);
    } finally {
      await cerrar();
    }
  });
});
