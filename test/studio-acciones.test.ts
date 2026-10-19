// Las escrituras del Studio (§7.6 del plan): las cinco acciones con su ciclo de plan y huella, la carrera
// entre la vista previa y el "Aplicar", las huellas ajenas o reutilizadas, los argumentos hostiles, el
// manifiesto con sus claves en su orden y su copia, y que init-cliente nunca toca la configuración real de
// los clientes. Lo que se afirma entre procesos se prueba con dos procesos node de verdad.

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { configDir, fijarRaizDelPaquete, stateDir } from "../src/config.js";
import { manifiestoNuevo } from "../src/init.js";
import { DISCO_CAMBIADO } from "../src/studio/acciones.js";
import { AplicarRespuesta, PlanRespuesta } from "../src/studio/contrato.js";
import { carpetaTemporal, crearProyecto, crearTarea, docsTemporales, estadoTemporal, huellaDeConfiguracion, limpiarEntorno } from "./helpers.js";
import { entornoInitDePrueba, pedir, studioConApi } from "./studio-ayudas.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ACCIONES_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "studio", "acciones.js");

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

// La configuración real de los clientes, antes de empezar: al final se comprueba que nada la tocó. Por su
// contenido y no por su fecha: Claude Code reescribe ~/.claude.json por su cuenta mientras trabaja (contadores,
// sesiones), así que de ese archivo solo cuentan sus `mcpServers`, los globales y los de cada proyecto
// (hallazgo 8 de la auditoría de la Etapa 6).
function huellaReal(): string[] {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return [path.join(os.homedir(), ".cursor", "mcp.json"), path.join(appData, "Code", "User", "mcp.json"), path.join(os.homedir(), ".claude.json"), path.join(os.homedir(), ".config", "Code", "User", "mcp.json")].map(
    (ruta) => `${ruta}|${huellaDeConfiguracion(ruta)}`
  );
}
const REAL_ANTES = huellaReal();

// Un manifiesto escrito a mano: BOM, CRLF, sus claves en un orden propio y claves que no se tocan.
const MANIFIESTO = '\uFEFF{\r\n  "version": 1,\r\n  "repos": [{ "id": "api", "dir": "api" }],\r\n  "preset": "software",\r\n  "reglas": { "verificacion": ["npm test"] },\r\n  "fase5": {}\r\n}\r\n';

function instalacion() {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  const estado = estadoTemporal();
  const repos = carpetaTemporal("repos");
  process.env.PHASE_GATE_REPOS_PATH = repos;
  fs.mkdirSync(path.join(repos, "api"));
  crearProyecto(docs, "P");
  crearProyecto(docs, "Q");
  const tarea = crearTarea(docs, "P", "t", ["00 - Contexto Inicial.md"]);
  const manifiesto = path.join(docs, "P", "phase-gate.json");
  fs.writeFileSync(manifiesto, MANIFIESTO, "utf-8");
  return { docs, estado, repos, tarea, manifiesto };
}

async function plan(s: Awaited<ReturnType<typeof studioConApi>>, accion: string, argumentos: unknown) {
  const r = await s.post("/api/acciones/plan", { accion, argumentos });
  assert.equal(r.estado, 200, r.texto);
  return PlanRespuesta.parse(r.json);
}

async function planPosible(s: Awaited<ReturnType<typeof studioConApi>>, accion: string, argumentos: unknown) {
  const p = await plan(s, accion, argumentos);
  assert.ok(p.posible, JSON.stringify(p));
  return p as Extract<typeof p, { posible: true }>;
}

const aplicar = (s: Awaited<ReturnType<typeof studioConApi>>, accion: string, argumentos: unknown, huella: string) => s.post("/api/acciones/aplicar", { accion, argumentos, huella });

describe("acciones: el manifiesto (preset, reglas, crear)", () => {
  it("preset: vista previa con diff y huella; al aplicar conserva las demás claves y su orden, 2 espacios, LF, y deja .bak", async () => {
    const { manifiesto } = instalacion();
    const entorno = entornoInitDePrueba();
    const s = await studioConApi({ entornoInit: () => entorno });
    const p = await planPosible(s, "preset", { proyecto: "P", preset: "ai-agent-ops" });
    assert.match(p.resumen, /ai-agent-ops/);
    assert.match(p.diff, /^- {3}"preset": "software",$/m);
    assert.match(p.diff, /^\+ {3}"preset": "ai-agent-ops",$/m);
    assert.deepEqual(p.cambios, [{ archivo: path.join("<Documentación>", "P", "phase-gate.json"), tipo: "reemplazar" }]);
    assert.ok(!fs.readFileSync(manifiesto, "utf-8").includes("ai-agent-ops"), "el plan no escribe");

    const r = await aplicar(s, "preset", { proyecto: "P", preset: "ai-agent-ops" }, p.huella);
    assert.equal(r.estado, 200, r.texto);
    const hecho = AplicarRespuesta.parse(r.json);
    const texto = fs.readFileSync(manifiesto, "utf-8");
    assert.ok(!texto.includes("\r") && !texto.startsWith("\uFEFF") && texto.endsWith("}\n"));
    assert.deepEqual(Object.keys(JSON.parse(texto)), ["version", "repos", "preset", "reglas", "fase5"]);
    assert.equal(JSON.parse(texto).preset, "ai-agent-ops");
    assert.deepEqual(JSON.parse(texto).reglas, { verificacion: ["npm test"] });
    assert.match(texto, /^ {2}"version": 1,$/m);
    // La copia: el archivo de antes, byte a byte.
    assert.equal(hecho.copias.length, 1);
    const copias = fs.readdirSync(path.dirname(manifiesto)).filter((n) => n.startsWith("phase-gate.json.bak-"));
    assert.deepEqual(copias, ["phase-gate.json.bak-20261017-090000"]);
    assert.equal(fs.readFileSync(path.join(path.dirname(manifiesto), copias[0]!), "utf-8"), MANIFIESTO);

    // La misma huella otra vez: 409. Y el mismo preset otra vez: no hay nada que hacer.
    const otra = await aplicar(s, "preset", { proyecto: "P", preset: "ai-agent-ops" }, p.huella);
    assert.equal(otra.estado, 409);
    assert.match(otra.json.error, new RegExp(DISCO_CAMBIADO.replace(/\./g, "\\.")));
    const igual = await plan(s, "preset", { proyecto: "P", preset: "ai-agent-ops" });
    assert.equal(igual.posible, false);
  });

  it("reglas: las claves nuevas van al final de reglas, las de antes se quedan donde estaban", async () => {
    const { manifiesto } = instalacion();
    const s = await studioConApi();
    const p = await planPosible(s, "reglas", { proyecto: "P", commits: "auto", lotes: false });
    assert.equal((await aplicar(s, "reglas", { proyecto: "P", commits: "auto", lotes: false }, p.huella)).estado, 200);
    const datos = JSON.parse(fs.readFileSync(manifiesto, "utf-8"));
    assert.deepEqual(Object.keys(datos.reglas), ["verificacion", "lotes", "commits"]);
    assert.deepEqual(datos.reglas, { verificacion: ["npm test"], lotes: false, commits: "auto" });
    assert.equal((await plan(s, "reglas", { proyecto: "P", commits: "auto" })).posible, false, "sin cambios no hay plan");
  });

  it("crear-manifiesto: solo crea, con el mismo texto que init --migrate; si aparece uno entre el plan y el aplicar, 409", async () => {
    const { docs } = instalacion();
    const s = await studioConApi();
    const p = await planPosible(s, "crear-manifiesto", { proyecto: "Q", preset: "software" });
    assert.deepEqual(p.cambios.map((c) => c.tipo), ["crear"]);
    assert.equal((await aplicar(s, "crear-manifiesto", { proyecto: "Q", preset: "software" }, p.huella)).estado, 200);
    assert.equal(fs.readFileSync(path.join(docs, "Q", "phase-gate.json"), "utf-8"), manifiestoNuevo("software", "es"));
    assert.equal((await plan(s, "crear-manifiesto", { proyecto: "Q" })).posible, false, "ya existe");
    assert.equal((await plan(s, "crear-manifiesto", { proyecto: "P" })).posible, false);

    // La carrera: alguien lo crea a mano después de la vista previa.
    crearProyecto(docs, "R");
    const deR = await planPosible(s, "crear-manifiesto", { proyecto: "R" });
    fs.writeFileSync(path.join(docs, "R", "phase-gate.json"), '{"version":1}', "utf-8");
    assert.equal((await aplicar(s, "crear-manifiesto", { proyecto: "R" }, deR.huella)).estado, 409);
    assert.equal(fs.readFileSync(path.join(docs, "R", "phase-gate.json"), "utf-8"), '{"version":1}', "no se pisa");
  });

  it("un manifiesto roto o ausente no se cambia desde el Studio: se dice por qué", async () => {
    const { docs } = instalacion();
    fs.writeFileSync(path.join(docs, "Q", "phase-gate.json"), "{ roto", "utf-8");
    const s = await studioConApi();
    const roto = await plan(s, "preset", { proyecto: "Q", preset: "software" });
    assert.ok(!roto.posible && /no es un JSON válido/.test(roto.motivo) && !roto.motivo.includes(docs));
    crearProyecto(docs, "S");
    const ausente = await plan(s, "reglas", { proyecto: "S", lotes: false });
    assert.ok(!ausente.posible && /no tiene phase-gate.json/.test(ausente.motivo));
  });
});

describe("acciones: la huella", () => {
  it("si el archivo cambia entre la vista previa y el aplicar (contenido o solo la fecha), 409 y no se escribe", async () => {
    const { manifiesto } = instalacion();
    const s = await studioConApi();
    const p = await planPosible(s, "preset", { proyecto: "P", preset: "software-tdd" });
    fs.writeFileSync(manifiesto, MANIFIESTO.replace('"npm test"', '"npm run test"'), "utf-8");
    const r = await aplicar(s, "preset", { proyecto: "P", preset: "software-tdd" }, p.huella);
    assert.equal(r.estado, 409);
    assert.equal(r.json.error, DISCO_CAMBIADO);
    assert.ok(!fs.readFileSync(manifiesto, "utf-8").includes("software-tdd"));

    // Solo la fecha: el contenido es el mismo, pero la huella cubre el mtimeMs.
    const q = await planPosible(s, "preset", { proyecto: "P", preset: "software-tdd" });
    const futuro = new Date(Date.now() + 60_000);
    fs.utimesSync(manifiesto, futuro, futuro);
    assert.equal((await aplicar(s, "preset", { proyecto: "P", preset: "software-tdd" }, q.huella)).estado, 409);
  });

  it("una huella de otra acción, de otros argumentos o inventada es 409; una mal formada, 400", async () => {
    instalacion();
    const s = await studioConApi();
    const reglas = await planPosible(s, "reglas", { proyecto: "P", lotes: false });
    const preset = await planPosible(s, "preset", { proyecto: "P", preset: "software-tdd" });
    assert.equal((await aplicar(s, "preset", { proyecto: "P", preset: "software-tdd" }, reglas.huella)).estado, 409);
    assert.equal((await aplicar(s, "preset", { proyecto: "P", preset: "ai-agent-ops" }, preset.huella)).estado, 409);
    assert.equal((await aplicar(s, "preset", { proyecto: "P", preset: "software-tdd" }, "0".repeat(64))).estado, 409);
    assert.equal((await aplicar(s, "preset", { proyecto: "P", preset: "software-tdd" }, "xyz")).estado, 400);
    assert.equal((await aplicar(s, "preset", { proyecto: "P", preset: "software-tdd" }, preset.huella.toUpperCase())).estado, 400);
    // Y la buena sigue valiendo: las fallidas no la gastaron.
    assert.equal((await aplicar(s, "preset", { proyecto: "P", preset: "software-tdd" }, preset.huella)).estado, 200);
  });

  it("argumentos hostiles: acción desconocida, claves de más, __proto__, tipos raros, rutas: 400; un proyecto que no existe, 404", async () => {
    const { manifiesto } = instalacion();
    const s = await studioConApi();
    const crudo = (cuerpo: string) => pedir(s.puerto, "POST", "/api/acciones/plan", { Cookie: s.cookie, "X-Phase-Gate": "1" }, cuerpo);
    for (const cuerpo of [
      '{"accion":"borrar","argumentos":{}}',
      '{"accion":"preset"}',
      '{"accion":"preset","argumentos":{"proyecto":"P","preset":"software-tdd"},"extra":1}',
      '{"accion":"preset","argumentos":{"proyecto":"P","preset":"software-tdd","otra":1}}',
      '{"accion":"preset","argumentos":{"proyecto":"P","preset":"software-tdd","__proto__":{"admin":true}}}',
      '{"__proto__":{"accion":"preset"},"accion":"preset","argumentos":{"proyecto":"P","preset":"x"}}',
      '{"accion":"preset","argumentos":{"proyecto":1,"preset":"software-tdd"}}',
      '{"accion":"preset","argumentos":{"proyecto":"P","preset":"../../evil"}}',
      '{"accion":"preset","argumentos":{"proyecto":"../P","preset":"software-tdd"}}',
      '{"accion":"preset","argumentos":{"proyecto":"P\\\\..\\\\Q","preset":"software-tdd"}}',
      '{"accion":"preset","argumentos":{"proyecto":"con","preset":"software-tdd"}}',
      '{"accion":"preset","argumentos":["P","software-tdd"]}',
      '{"accion":"reglas","argumentos":{"proyecto":"P"}}',
      '{"accion":"reglas","argumentos":{"proyecto":"P","commits":"push-directo"}}',
      '{"accion":"init-cliente","argumentos":{"cliente":"emacs"}}',
      '{"accion":"init-cliente","argumentos":{"cliente":"cursor","clave":"a b"}}',
      '{"accion":"eject","argumentos":{"objetivo":"fase-3","destino":"global","fuerza":"si"}}',
      "[]",
      "null",
    ]) {
      const r = await crudo(cuerpo);
      assert.equal(r.estado, 400, `${cuerpo} → ${r.estado}: ${r.texto}`);
    }
    assert.equal((await crudo('{"accion":"preset","argumentos":{"proyecto":"NOEXISTE","preset":"software-tdd"}}')).estado, 404);
    assert.equal(fs.readFileSync(manifiesto, "utf-8"), MANIFIESTO, "nada cambió");
    assert.equal(({} as Record<string, unknown>).admin, undefined, "ningún prototipo contaminado");
  });

  it("dos procesos que aplican la misma huella a la vez: uno escribe, el otro recibe 409", async () => {
    const { docs, estado, repos, manifiesto } = instalacion();
    const config = configDir();
    const script = path.join(carpetaTemporal("script"), "aplicar.mjs");
    fs.writeFileSync(
      script,
      [
        `const { crearAcciones } = await import(${JSON.stringify(pathToFileURL(ACCIONES_JS).href)});`,
        `const { fijarRaizDelPaquete } = await import(${JSON.stringify(pathToFileURL(path.join(path.dirname(ACCIONES_JS), "..", "config.js")).href)});`,
        `fijarRaizDelPaquete(${JSON.stringify(RAIZ)});`,
        "const entornoInit = () => ({ home: process.cwd(), appData: null, xdgConfig: null, plataforma: process.platform, salida: { out() {}, err() {} }, esTerminal: false, preguntar: async () => '', ejecutar: async () => { throw new Error('no'); }, ahora: () => new Date() });",
        "const peticion = JSON.parse(process.argv[2]);",
        "try { await crearAcciones({ entornoInit }).aplicar(peticion); console.log('ok'); } catch (e) { console.log(String(e.estado ?? e.message)); }",
      ].join("\n"),
      "utf-8"
    );
    const env = { ...process.env, PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config, PHASE_GATE_TASKS_SUBDIR: "Proyectos" };
    const s = await studioConApi();
    const lanzar = (peticion: unknown) =>
      new Promise<string>((resolver) => {
        const hijo = spawn(process.execPath, [script, JSON.stringify(peticion)], { env, cwd: path.dirname(script), stdio: ["ignore", "pipe", "pipe"] });
        let salida = "";
        hijo.stdout.on("data", (d) => (salida += d));
        hijo.stderr.on("data", () => {});
        hijo.on("exit", () => resolver(salida.trim()));
      });
    for (const [ronda, preset] of ["software-tdd", "ai-agent-ops", "software-tdd", "research-ops", "software"].entries()) {
      const p = await planPosible(s, "preset", { proyecto: "P", preset });
      const peticion = { accion: "preset", argumentos: { proyecto: "P", preset }, huella: p.huella };
      const resultados = (await Promise.all([lanzar(peticion), lanzar(peticion)])).sort();
      assert.deepEqual(resultados, ["409", "ok"], `ronda ${ronda}: ${resultados.join(", ")}`);
      assert.equal(JSON.parse(fs.readFileSync(manifiesto, "utf-8")).preset, preset);
    }
    assert.equal(fs.existsSync(path.join(stateDir(), ".studio-acciones.lock")), false, "el candado no se queda");
  });
});

describe("acciones: eject", () => {
  it("una fase a la capa global y una ranura a la del proyecto, con vista previa; con fuerza deja .bak", async () => {
    const { docs } = instalacion();
    const s = await studioConApi();
    const fase = await planPosible(s, "eject", { objetivo: "fase-3", destino: "global" });
    assert.deepEqual(fase.cambios.map((c) => c.tipo), ["crear"]);
    assert.equal((await aplicar(s, "eject", { objetivo: "fase-3", destino: "global" }, fase.huella)).estado, 200);
    const archivo = path.join(configDir(), "prompts", "fase-3-plan-tecnico.md");
    assert.ok(fs.existsSync(archivo));
    assert.equal((await plan(s, "eject", { objetivo: "fase-3", destino: "global" })).posible, false, "ya existe, sin fuerza");

    const ranura = await planPosible(s, "eject", { objetivo: "fase-3/pruebas", destino: "proyecto:P" });
    assert.equal((await aplicar(s, "eject", { objetivo: "fase-3/pruebas", destino: "proyecto:P" }, ranura.huella)).estado, 200);
    const bloques = path.join(docs, "P", ".phase-gate", "prompts", "bloques.md");
    assert.match(fs.readFileSync(bloques, "utf-8"), /<!-- bloque: fase-3\/pruebas -->/);

    const fuerza = await planPosible(s, "eject", { objetivo: "fase-3/pruebas", destino: "proyecto:P", fuerza: true });
    assert.equal((await aplicar(s, "eject", { objetivo: "fase-3/pruebas", destino: "proyecto:P", fuerza: true }, fuerza.huella)).estado, 200);
    assert.equal(fs.readdirSync(path.dirname(bloques)).filter((n) => n.startsWith("bloques.md.bak-")).length, 1);
  });

  it("un objetivo o un destino que no valen se dicen en el plan; nunca escribe en una tarea ni en los repos", async () => {
    const { tarea, repos } = instalacion();
    const s = await studioConApi();
    for (const argumentos of [
      { objetivo: "global-rules", destino: "global" },
      { objetivo: "fase-99", destino: "global" },
      { objetivo: "fase-3/no-existe", destino: "global" },
      { objetivo: "fase-3", destino: "otra-cosa" },
    ]) {
      assert.equal((await plan(s, "eject", argumentos)).posible, false, JSON.stringify(argumentos));
    }
    assert.equal((await s.post("/api/acciones/plan", { accion: "eject", argumentos: { objetivo: "fase-3", destino: "proyecto:NOEXISTE" } })).estado, 404);

    // La capa global apuntando dentro de una tarea, o dentro de los repos: el Studio no escribe ahí.
    for (const carpeta of [path.join(tarea, "capa"), path.join(repos, "api", "capa")]) {
      process.env.PHASE_GATE_PROMPTS_PATH = carpeta;
      const r = await plan(s, "eject", { objetivo: "fase-3", destino: "global" });
      assert.ok(!r.posible && /nunca escribe/.test(r.motivo), JSON.stringify(r));
      assert.equal(fs.existsSync(carpeta), false);
    }
  });
});

describe("acciones: init-cliente, sobre un HOME falso", () => {
  it("Cursor: registra con vista previa; la segunda vez no hay nada que hacer; sobre un mcp.json con otro servidor deja .bak", async () => {
    instalacion();
    const entorno = entornoInitDePrueba();
    assert.notEqual(entorno.home, os.homedir());
    const s = await studioConApi({ entornoInit: () => entorno });
    const p = await planPosible(s, "init-cliente", { cliente: "cursor" });
    assert.deepEqual(p.cambios, [{ archivo: "~/.cursor/mcp.json", tipo: "crear" }]);
    assert.equal((await aplicar(s, "init-cliente", { cliente: "cursor" }, p.huella)).estado, 200);
    const archivo = path.join(entorno.home, ".cursor", "mcp.json");
    assert.ok(JSON.parse(fs.readFileSync(archivo, "utf-8")).mcpServers.pg);
    assert.equal((await plan(s, "init-cliente", { cliente: "cursor" })).posible, false);

    const otro = entornoInitDePrueba();
    fs.mkdirSync(path.join(otro.home, ".cursor"));
    fs.writeFileSync(path.join(otro.home, ".cursor", "mcp.json"), '{ "mcpServers": { "otro": { "command": "otro" } } }', "utf-8");
    const s2 = await studioConApi({ entornoInit: () => otro });
    const q = await planPosible(s2, "init-cliente", { cliente: "cursor" });
    assert.equal((await aplicar(s2, "init-cliente", { cliente: "cursor" }, q.huella)).estado, 200);
    const datos = JSON.parse(fs.readFileSync(path.join(otro.home, ".cursor", "mcp.json"), "utf-8"));
    assert.deepEqual(Object.keys(datos.mcpServers), ["otro", "pg"]);
    assert.equal(fs.readdirSync(path.join(otro.home, ".cursor")).filter((n) => n.startsWith("mcp.json.bak-")).length, 1);
  });

  it("con comandos: los /fN que copiaría init --comandos, sin pisar uno que no generó init; VS Code no los lee", async () => {
    instalacion();
    const entorno = entornoInitDePrueba();
    const propio = path.join(entorno.home, ".cursor", "commands", "f3.md");
    fs.mkdirSync(path.dirname(propio), { recursive: true });
    fs.writeFileSync(propio, "mi /f3", "utf-8");
    const s = await studioConApi({ entornoInit: () => entorno });
    const p = await planPosible(s, "init-cliente", { cliente: "cursor", comandos: true });
    assert.deepEqual(
      p.cambios.map((c) => c.archivo),
      ["~/.cursor/mcp.json", "~/.cursor/commands/f1.md", "~/.cursor/commands/f2.md", "~/.cursor/commands/f4.md", "~/.cursor/commands/f5.md"]
    );
    assert.match(p.resumen, /\/f3 ya existen y no los generó init: no se tocan/);
    assert.equal((await aplicar(s, "init-cliente", { cliente: "cursor", comandos: true }, p.huella)).estado, 200);
    assert.equal(fs.readFileSync(propio, "utf-8"), "mi /f3");
    assert.match(fs.readFileSync(path.join(entorno.home, ".cursor", "commands", "f4.md"), "utf-8"), /^<!-- generado por mcp-phase-gate init/);
    const vscode = await plan(s, "init-cliente", { cliente: "vscode", comandos: true });
    assert.ok(vscode.posible && /VS Code no lee los comandos de fase/.test(vscode.resumen));
  });

  it("Claude Code: el comando se enseña y, al aplicar, se ejecuta con el claude de mentira; si falla, se dice", async () => {
    instalacion();
    let falla = false;
    const entorno = entornoInitDePrueba((args) => (args[0] === "mcp" && args[1] === "list" ? { codigo: 0, stdout: "", stderr: "" } : { codigo: falla ? 1 : 0, stdout: "", stderr: falla ? "sin permiso" : "" }));
    const s = await studioConApi({ entornoInit: () => entorno });
    const p = await planPosible(s, "init-cliente", { cliente: "claude-code" });
    assert.deepEqual(p.cambios.map((c) => c.tipo), ["comando"]);
    assert.match(p.diff, /^\$ claude mcp add pg --scope user/m);
    assert.equal((await aplicar(s, "init-cliente", { cliente: "claude-code" }, p.huella)).estado, 200);
    assert.ok(entorno.llamadas.some((l) => l[1] === "mcp" && l[2] === "add"));
    // Un plan que solo ejecuta un comando no cambia ningún archivo: la huella sirve una vez, o la misma
    // vista previa ejecutaría `claude mcp add` dos veces.
    assert.equal((await aplicar(s, "init-cliente", { cliente: "claude-code" }, p.huella)).estado, 409);
    assert.equal(entorno.llamadas.filter((l) => l[1] === "mcp" && l[2] === "add").length, 1);
    falla = true;
    const q = await planPosible(s, "init-cliente", { cliente: "claude-code", clave: "otra" });
    const r = await aplicar(s, "init-cliente", { cliente: "claude-code", clave: "otra" }, q.huella);
    assert.equal(r.estado, 500);
    assert.match(r.json.error, /sin permiso/);
  });
});

describe("la huella de la configuración real de los clientes", () => {
  it("de ~/.claude.json solo cuentan sus mcpServers: lo que Claude Code reescribe solo no la cambia", () => {
    const archivo = path.join(carpetaTemporal("casa"), ".claude.json");
    const escribir = (datos: unknown): void => fs.writeFileSync(archivo, JSON.stringify(datos), "utf-8");
    escribir({ numStartups: 1, mcpServers: { a: { command: "x" } }, projects: { "C:/p": { mcpServers: {}, historial: [1] } } });
    const antes = huellaDeConfiguracion(archivo);
    escribir({ numStartups: 2, tipsHistory: { t: 3 }, mcpServers: { a: { command: "x" } }, projects: { "C:/p": { mcpServers: {}, historial: [1, 2] } } });
    assert.equal(huellaDeConfiguracion(archivo), antes);
    escribir({ numStartups: 2, mcpServers: { a: { command: "x" } }, projects: { "C:/p": { mcpServers: { nuevo: { command: "y" } } } } });
    assert.notEqual(huellaDeConfiguracion(archivo), antes, "claude mcp add (alcance local) sí la cambia");

    // Cualquier otro archivo, por su contenido entero.
    const cursor = path.join(path.dirname(archivo), "mcp.json");
    fs.writeFileSync(cursor, "{}", "utf-8");
    const vacia = huellaDeConfiguracion(cursor);
    fs.writeFileSync(cursor, '{"mcpServers":{}}', "utf-8");
    assert.notEqual(huellaDeConfiguracion(cursor), vacia);
    assert.equal(huellaDeConfiguracion(path.join(path.dirname(archivo), "no-existe.json")), "no existe");
  });
});

after(() => {
  // init-cliente corre siempre con un HOME y un APPDATA falsos: la configuración real no cambió.
  assert.deepEqual(huellaReal(), REAL_ANTES);
});
