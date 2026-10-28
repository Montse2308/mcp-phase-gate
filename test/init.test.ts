// `npx mcp-phase-gate init` (§5.8.1 del plan maestro v3), sobre un HOME y un APPDATA temporales y con
// un `claude` de mentira: nunca toca la configuración real de quien corre los tests.

import { strict as assert } from "node:assert";
import { afterEach, describe, it, mock } from "node:test";
import * as fs from "node:fs";
import fsDelSistema from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ejecutarCli } from "../src/cli.js";
import type { Salida } from "../src/cli.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import { MARCA_DE_COMANDO, candadoDePush, diffDeLineas, ejecutaPhaseGate, ejecutarInit, quitarComentarios, registroEnClaude } from "../src/init.js";
import type { EntornoInit, Ejecucion, OpcionesInit } from "../src/init.js";
import { carpetaTemporal, configTemporal, crearProyecto, crearTarea, estadoTemporal, limpiarEntorno } from "./helpers.js";

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const AHORA = new Date(2026, 9, 15, 12, 30, 45);
const BAK = ".bak-20261015-123045";

type Prueba = {
  entorno: EntornoInit;
  home: string;
  appData: string;
  llamadas: string[][];
  texto: () => string;
  errores: () => string;
};

// `claude` responde con lo que diga `responder`; sin él, "no está instalado".
function entornoDePrueba(
  opciones: { plataforma?: NodeJS.Platform; responder?: (args: string[]) => Ejecucion; terminal?: boolean; respuestas?: string[] } = {}
): Prueba {
  const home = carpetaTemporal("home");
  const appData = carpetaTemporal("appdata");
  const out: string[] = [];
  const err: string[] = [];
  const llamadas: string[][] = [];
  const respuestas = [...(opciones.respuestas ?? [])];
  const salida: Salida = { out: (t) => out.push(t), err: (t) => err.push(t) };
  const entorno: EntornoInit = {
    home,
    appData,
    xdgConfig: null,
    plataforma: opciones.plataforma ?? "win32",
    salida,
    esTerminal: opciones.terminal ?? false,
    preguntar: async () => respuestas.shift() ?? "",
    ejecutar: async (comando, args) => {
      llamadas.push([comando, ...args]);
      if (!opciones.responder) throw new Error(`${comando} no está instalado o no está en el PATH.`);
      return opciones.responder(args);
    },
    ahora: () => AHORA,
  };
  return { entorno, home, appData, llamadas, texto: () => out.join("\n"), errores: () => err.join("\n") };
}

const claudeVacio = (args: string[]): Ejecucion =>
  args[0] === "--version" ? { codigo: 0, stdout: "2.1.0 (Claude Code)", stderr: "" } : args[1] === "list" ? { codigo: 0, stdout: "otro-servidor: npx -y otro-servidor - ✔ Connected\n", stderr: "" } : { codigo: 0, stdout: "", stderr: "" };

// Un clon de desarrollo de mentira: <carpeta>/package.json con ese nombre y <carpeta>/build/index.js.
function clonDe(nombre: string): string {
  const carpeta = carpetaTemporal("clon");
  fs.mkdirSync(path.join(carpeta, "build"));
  fs.writeFileSync(path.join(carpeta, "package.json"), JSON.stringify({ name: nombre }), "utf-8");
  fs.writeFileSync(path.join(carpeta, "build", "index.js"), "", "utf-8");
  return path.join(carpeta, "build", "index.js");
}

function rutas(): { docs: string; repos: string } {
  estadoTemporal();
  return { docs: carpetaTemporal("docs"), repos: carpetaTemporal("repos") };
}

function opciones(extra: Partial<OpcionesInit> & { docs: string; repos: string }): OpcionesInit {
  return { clientes: null, clave: null, comandos: false, migrate: false, preset: null, soloEsteEquipo: false, dryRun: false, yes: false, ...extra };
}

const cursorJson = (p: Prueba): string => path.join(p.home, ".cursor", "mcp.json");
const leer = (archivo: string): Record<string, any> => JSON.parse(fs.readFileSync(archivo, "utf-8"));

function arbol(...raices: string[]): string[] {
  const rutasVistas: string[] = [];
  const recorrer = (carpeta: string): void => {
    for (const nombre of fs.readdirSync(carpeta).sort()) {
      const ruta = path.join(carpeta, nombre);
      const info = fs.statSync(ruta);
      rutasVistas.push(`${ruta}:${info.isDirectory() ? "d" : fs.readFileSync(ruta, "utf-8")}`);
      if (info.isDirectory()) recorrer(ruta);
    }
  };
  for (const raiz of raices) recorrer(raiz);
  return rutasVistas;
}

describe("init: registrar en los clientes", () => {
  it("detecta los tres clientes y registra en cada uno con su formato", async () => {
    const r = rutas();
    const p = entornoDePrueba({ responder: claudeVacio });
    fs.mkdirSync(path.join(p.home, ".cursor"));
    fs.mkdirSync(path.join(p.appData, "Code", "User"), { recursive: true });

    assert.equal(await ejecutarInit(opciones(r), p.entorno), 0, p.errores());

    assert.deepEqual(leer(cursorJson(p)).mcpServers.pg, {
      command: "npx",
      args: ["-y", "mcp-phase-gate"],
      env: { PHASE_GATE_DOCS_PATH: r.docs, PHASE_GATE_REPOS_PATH: r.repos, PHASE_GATE_ELICITATION: "off" },
    });
    assert.deepEqual(leer(path.join(p.appData, "Code", "User", "mcp.json")).servers.pg, {
      type: "stdio",
      command: "npx",
      args: ["-y", "mcp-phase-gate"],
      env: { PHASE_GATE_DOCS_PATH: r.docs, PHASE_GATE_REPOS_PATH: r.repos },
    });
    assert.deepEqual(p.llamadas.at(-1), [
      "claude", "mcp", "add", "pg", "--scope", "user",
      "--env", `PHASE_GATE_DOCS_PATH=${r.docs}`, "--env", `PHASE_GATE_REPOS_PATH=${r.repos}`,
      "--", "npx", "-y", "mcp-phase-gate",
    ]);
    assert.ok(p.texto().includes(candadoDePush()));
    assert.match(p.texto(), /mcp-phase-gate \d+\.\d+\.\d+.* · vía /, "termina con doctor");
  });

  it("fuera de Windows, Cursor no lleva PHASE_GATE_ELICITATION", async () => {
    const r = rutas();
    const p = entornoDePrueba({ plataforma: "linux" });

    await ejecutarInit(opciones({ ...r, clientes: ["cursor"] }), p.entorno);
    assert.equal(leer(cursorJson(p)).mcpServers.pg.env.PHASE_GATE_ELICITATION, undefined);
  });

  it("fusiona con lo que ya hay, deja copia .bak, y la segunda vez dice sin cambios", async () => {
    const r = rutas();
    const p = entornoDePrueba();
    fs.mkdirSync(path.join(p.home, ".cursor"));
    fs.writeFileSync(cursorJson(p), JSON.stringify({ mcpServers: { otro: { command: "otro" } }, ajuste: true }), "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"] }), p.entorno), 0, p.errores());
    const escrito = leer(cursorJson(p));
    assert.deepEqual(Object.keys(escrito.mcpServers), ["otro", "pg"]);
    assert.equal(escrito.ajuste, true);
    assert.ok(fs.existsSync(`${cursorJson(p)}${BAK}`));

    fs.rmSync(`${cursorJson(p)}${BAK}`);
    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"] }), p.entorno), 0);
    assert.match(p.texto(), /Cursor: sin cambios/);
    assert.equal(fs.existsSync(`${cursorJson(p)}${BAK}`), false, "sin cambios no deja copia");
  });

  it("un registro que ya existe con otra clave se actualiza y conserva su clave, con diff y confirmación", async () => {
    const r = rutas();
    const p = entornoDePrueba({ plataforma: "linux" });
    fs.mkdirSync(path.join(p.home, ".cursor"));
    const original = JSON.stringify({ mcpServers: { "mcp-phase-gate": { command: "npx", args: ["-y", "mcp-phase-gate"], env: { ORQUESTADOR_DOCS_PATH: "/viejo", OTRA: "1" } } } });
    fs.writeFileSync(cursorJson(p), original, "utf-8");

    // Sin --yes ni terminal: se enseña el diff y no se aplica.
    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"] }), p.entorno), 1);
    assert.equal(fs.readFileSync(cursorJson(p), "utf-8"), original);
    assert.match(p.texto(), /ya estaba registrado como «mcp-phase-gate»; se actualiza esa entrada y se conserva su clave/);
    assert.match(p.texto(), /-     "ORQUESTADOR_DOCS_PATH": "\/viejo",/);
    assert.match(p.errores(), /no se aplicó\. Repite con --yes/);

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"], yes: true }), p.entorno), 0);
    const servidores = leer(cursorJson(p)).mcpServers;
    assert.deepEqual(Object.keys(servidores), ["mcp-phase-gate"], "no se duplica ni cambia la clave");
    assert.deepEqual(servidores["mcp-phase-gate"].env, { OTRA: "1", PHASE_GATE_DOCS_PATH: r.docs, PHASE_GATE_REPOS_PATH: r.repos });
    assert.ok(fs.existsSync(`${cursorJson(p)}${BAK}`));
  });

  it("en una terminal, la confirmación se pregunta; con --clave explícita se renombra", async () => {
    const r = rutas();
    const p = entornoDePrueba({ plataforma: "linux", terminal: true, respuestas: ["s"] });
    fs.mkdirSync(path.join(p.home, ".cursor"));
    const clon = clonDe("mcp-phase-gate");
    fs.writeFileSync(cursorJson(p), JSON.stringify({ mcpServers: { viejo: { command: "node", args: [clon] } } }), "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"], clave: "pg" }), p.entorno), 0, p.errores());
    const servidores = leer(cursorJson(p)).mcpServers;
    assert.deepEqual(Object.keys(servidores), ["pg"]);
    assert.equal(servidores.pg.args[0], clon, "conserva el comando de un clon de desarrollo");
    assert.match(p.texto(), /--clave pide renombrarlo a «pg»/);
  });

  // Hallazgo 5 de la auditoría de la Etapa 3: contener el nombre o ser un build/index.js cualquiera no
  // basta para ser mcp-phase-gate.
  it("no toma por suyo un servidor ajeno: otro build/index.js, ni un paquete cuyo nombre contiene mcp-phase-gate", async () => {
    const r = rutas();
    const p = entornoDePrueba({ plataforma: "linux" });
    fs.mkdirSync(path.join(p.home, ".cursor"));
    const ajenos = {
      fs: { command: "node", args: [clonDe("server-filesystem")] },
      visor: { command: "npx", args: ["-y", "mcp-phase-gate-viewer"] },
    };
    fs.writeFileSync(cursorJson(p), JSON.stringify({ mcpServers: ajenos }), "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"] }), p.entorno), 0, p.errores());
    const servidores = leer(cursorJson(p)).mcpServers;
    assert.deepEqual(Object.keys(servidores), ["fs", "visor", "pg"]);
    assert.deepEqual([servidores.fs, servidores.visor], [ajenos.fs, ajenos.visor], "los ajenos quedan intactos");
  });

  it("reconoce el paquete exacto, con versión, y el clon cuyo package.json es el suyo", () => {
    assert.equal(ejecutaPhaseGate({ command: "npx", args: ["-y", "mcp-phase-gate@3"] }), true);
    assert.equal(ejecutaPhaseGate({ command: "node", args: [clonDe("mcp-phase-gate")] }), true);
    assert.equal(ejecutaPhaseGate({ command: "node", args: [clonDe("otro")] }), false);
    assert.equal(registroEnClaude("pg: npx -y mcp-phase-gate - ✔ Connected\n"), "pg");
    assert.equal(registroEnClaude("visor: npx -y mcp-phase-gate-viewer - ✔ Connected\nfs: node C:/x/build/index.js - ✔ Connected\n"), null);
  });

  // Hallazgo 6: las comas finales se quitaban también dentro de las cadenas.
  it("las comas finales se quitan fuera de las cadenas, y una // en una URL no cuenta como comentario", async () => {
    const r = rutas();
    const p = entornoDePrueba({ plataforma: "linux" });
    fs.mkdirSync(path.join(p.home, ".cursor"));
    fs.writeFileSync(cursorJson(p), '{ "mcpServers": { "otro": { "command": "x", "args": ["--sep=,}", "https://a.b/c"], }, }, }', "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"] }), p.entorno), 0, p.errores());
    assert.deepEqual(leer(cursorJson(p)).mcpServers.otro.args, ["--sep=,}", "https://a.b/c"]);
    assert.equal(p.texto().includes("tiene comentarios"), false);
  });

  it("no toca un mcp.json cuya sección o cuyo env no es un objeto, ni sigue si claude mcp list falla", async () => {
    const r = rutas();
    const p = entornoDePrueba({
      plataforma: "linux",
      responder: (args) => (args[1] === "list" ? { codigo: 1, stdout: "", stderr: "sin red" } : claudeVacio(args)),
    });
    fs.mkdirSync(path.join(p.home, ".cursor"));
    for (const contenido of ['{ "mcpServers": [1, 2] }', '{ "mcpServers": { "otro": { "command": "x", "env": "A=1" } } }']) {
      fs.writeFileSync(cursorJson(p), contenido, "utf-8");
      assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"], yes: true }), p.entorno), 1);
      assert.equal(fs.readFileSync(cursorJson(p), "utf-8"), contenido);
    }

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["claude-code"] }), p.entorno), 1);
    assert.match(p.errores(), /claude mcp list falló \(sin red\); no se registra para no duplicarlo/);
    assert.equal(p.llamadas.some((l) => l[2] === "add"), false);
  });

  it("una clave que ya usa otro servidor no se pisa", async () => {
    const r = rutas();
    const p = entornoDePrueba();
    fs.mkdirSync(path.join(p.home, ".cursor"));
    const original = JSON.stringify({ mcpServers: { pg: { command: "postgres-mcp" } } });
    fs.writeFileSync(cursorJson(p), original, "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"], yes: true }), p.entorno), 1);
    assert.equal(fs.readFileSync(cursorJson(p), "utf-8"), original);
    assert.match(p.errores(), /la clave «pg» ya la usa otro servidor/);
  });

  it("lee un JSON con comentarios y comas finales; reescribirlo pide confirmación porque se pierden", async () => {
    const r = rutas();
    const p = entornoDePrueba();
    fs.mkdirSync(path.join(p.home, ".cursor"));
    const conComentarios = '{\n  // mis servidores\n  "mcpServers": {\n    "web": { "command": "x", "args": ["https://a.b/c"], },\n  },\n}\n';
    fs.writeFileSync(cursorJson(p), conComentarios, "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"] }), p.entorno), 1);
    assert.equal(fs.readFileSync(cursorJson(p), "utf-8"), conComentarios);
    assert.match(p.texto(), /tiene comentarios; al reescribirlo se perderán/);

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"], yes: true }), p.entorno), 0);
    assert.deepEqual(leer(cursorJson(p)).mcpServers.web.args, ["https://a.b/c"], "la // de una URL no es un comentario");
    assert.equal(fs.readFileSync(`${cursorJson(p)}${BAK}`, "utf-8"), conComentarios);
  });

  it("un JSON roto no se toca y se imprime el bloque para pegarlo a mano", async () => {
    const r = rutas();
    const p = entornoDePrueba();
    fs.mkdirSync(path.join(p.home, ".cursor"));
    fs.writeFileSync(cursorJson(p), "{ esto no es json", "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["cursor"], yes: true }), p.entorno), 1);
    assert.equal(fs.readFileSync(cursorJson(p), "utf-8"), "{ esto no es json");
    assert.match(p.errores(), /No se toca\. Para registrarlo a mano, añade:\n\{\n  "mcpServers": \{\n    "pg": \{/);
  });

  it("un mcp.json de VS Code vacío (0 bytes) cuenta como {}", async () => {
    const r = rutas();
    const p = entornoDePrueba();
    const archivo = path.join(p.appData, "Code", "User", "mcp.json");
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, "", "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["vscode"] }), p.entorno), 0, p.errores());
    assert.equal(leer(archivo).servers.pg.type, "stdio");
    assert.equal(fs.existsSync(`${archivo}${BAK}`), false, "un archivo vacío no necesita copia");
  });

  it("en Claude Code, un registro que ya existe no se toca: se dice cómo actualizarlo", async () => {
    const r = rutas();
    const p = entornoDePrueba({
      responder: (args) => (args[1] === "list" ? { codigo: 0, stdout: "mcp-phase-gate: npx -y mcp-phase-gate - ✔ Connected\n", stderr: "" } : claudeVacio(args)),
    });

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["claude-code"] }), p.entorno), 0);
    assert.equal(p.llamadas.some((l) => l[2] === "add"), false);
    assert.match(p.texto(), /ya está registrado como «mcp-phase-gate»; no se toca\. Para cambiar sus rutas: claude mcp remove mcp-phase-gate/);
  });

  it("sin rutas ni terminal sale con 2; en una terminal las pregunta", async () => {
    estadoTemporal();
    const p = entornoDePrueba();
    assert.equal(await ejecutarInit({ ...opciones({ docs: "", repos: "" }), docs: null, repos: null, clientes: [] }, p.entorno), 2);
    assert.match(p.errores(), /Falta la ruta de la Documentación Central: pásala con --docs/);

    const r = rutas();
    const q = entornoDePrueba({ terminal: true, respuestas: [r.docs, r.repos] });
    assert.equal(await ejecutarInit({ ...opciones(r), docs: null, repos: null, clientes: [] }, q.entorno), 0, q.errores());

    const malo = entornoDePrueba();
    assert.equal(await ejecutarInit(opciones({ docs: path.join(r.docs, "no-existe"), repos: r.repos, clientes: [] }), malo.entorno), 2);
  });
});

describe("init --comandos", () => {
  it("copia los /fN con su marca, actualiza los suyos y respeta los archivos sin marca", async () => {
    fijarRaizDelPaquete(RAIZ);
    const r = rutas();
    const p = entornoDePrueba({ responder: claudeVacio });
    const carpeta = path.join(p.home, ".claude", "commands");
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, "f1.md"), "mi comando f1", "utf-8");
    fs.writeFileSync(path.join(carpeta, "f2.md"), `${MARCA_DE_COMANDO} v0.0.1 -->\nviejo\n`, "utf-8");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: ["claude-code"], comandos: true }), p.entorno), 0, p.errores());
    assert.equal(fs.readFileSync(path.join(carpeta, "f1.md"), "utf-8"), "mi comando f1");
    const f2 = fs.readFileSync(path.join(carpeta, "f2.md"), "utf-8");
    assert.ok(f2.startsWith(MARCA_DE_COMANDO) && f2.includes("FASE 2"));
    assert.ok(fs.readFileSync(path.join(carpeta, "f5.md"), "utf-8").startsWith(MARCA_DE_COMANDO));
    assert.match(p.texto(), /f1\.md es tuyo \(no lo generó init\); no se toca/);

    // La segunda vez, sin cambios; con --yes, el archivo propio se reemplaza dejando copia.
    await ejecutarInit(opciones({ ...r, clientes: ["claude-code"], comandos: true, yes: true }), p.entorno);
    assert.match(p.texto(), /\/f2 sin cambios/);
    assert.ok(fs.readFileSync(path.join(carpeta, "f1.md"), "utf-8").startsWith(MARCA_DE_COMANDO));
    assert.equal(fs.readFileSync(path.join(carpeta, `f1.md${BAK}`), "utf-8"), "mi comando f1");
  });
});

describe("init --migrate", () => {
  it("crea phase-gate.json solo donde falta, con software-replica o el preset pedido", async () => {
    fijarRaizDelPaquete(RAIZ);
    const r = rutas();
    crearProyecto(r.docs, "PROYECTO-A");
    crearProyecto(r.docs, "PROYECTO-B");
    const suyo = JSON.stringify({ version: 1, preset: "research-ops" });
    fs.writeFileSync(path.join(r.docs, "PROYECTO-A", "phase-gate.json"), suyo, "utf-8");
    // Uno inválido no se toca: lo dice doctor.
    crearProyecto(r.docs, "PROYECTO-ROTO");
    const roto = JSON.stringify({ version: 2 });
    fs.writeFileSync(path.join(r.docs, "PROYECTO-ROTO", "phase-gate.json"), roto, "utf-8");
    // Con --docs y sin PHASE_GATE_DOCS_PATH en el entorno, los documentos en inglés de un proyecto se ven.
    crearProyecto(r.docs, "PROYECTO-EN");
    crearTarea(r.docs, "PROYECTO-EN", "t", ["00 - Initial Context.md"]);
    assert.equal(process.env.PHASE_GATE_DOCS_PATH, undefined);
    const p = entornoDePrueba();

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: [], migrate: true }), p.entorno), 0, p.errores());
    // El suyo no se reemplaza: solo se le añade el idioma que ya usaba, detrás de `preset`, con copia del
    // original (hallazgo 2 de la auditoría de la Etapa 6).
    assert.equal(
      fs.readFileSync(path.join(r.docs, "PROYECTO-A", "phase-gate.json"), "utf-8"),
      `${JSON.stringify({ version: 1, preset: "research-ops", idioma: "es" }, null, 2)}\n`
    );
    assert.equal(fs.readFileSync(path.join(r.docs, "PROYECTO-A", `phase-gate.json${BAK}`), "utf-8"), suyo);
    assert.match(p.texto(), /PROYECTO-A.phase-gate\.json no declaraba idioma; ahora lleva "idioma": "es"/);
    assert.equal(fs.readFileSync(path.join(r.docs, "PROYECTO-ROTO", "phase-gate.json"), "utf-8"), roto);
    assert.equal(leer(path.join(r.docs, "PROYECTO-EN", "phase-gate.json")).idioma, "en");
    assert.equal(process.env.PHASE_GATE_DOCS_PATH, undefined, "la variable vuelve a como estaba");
    // Desde la Etapa 6 lleva también el idioma: sin documentos que lo digan, el del equipo (aquí, el de los
    // tests: PHASE_GATE_LANG=es).
    assert.deepEqual(leer(path.join(r.docs, "PROYECTO-B", "phase-gate.json")), {
      $schema: "https://unpkg.com/mcp-phase-gate@3/schema/project.json",
      version: 1,
      preset: "software-replica",
      idioma: "es",
    });

    crearProyecto(r.docs, "PROYECTO-C");
    await ejecutarInit(opciones({ ...r, clientes: [], migrate: true, preset: "software-tdd" }), p.entorno);
    assert.equal(leer(path.join(r.docs, "PROYECTO-C", "phase-gate.json")).preset, "software-tdd");

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: [], migrate: true, preset: "inventado" }), p.entorno), 2);
  });

  it("--solo-este-equipo escribe presetPorDefecto en machine.json y no toca la Documentación", async () => {
    fijarRaizDelPaquete(RAIZ);
    const r = rutas();
    crearProyecto(r.docs, "PROYECTO-A");
    const config = configTemporal();
    const p = entornoDePrueba();

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: [], migrate: true, soloEsteEquipo: true }), p.entorno), 0, p.errores());
    assert.equal(leer(path.join(config, "machine.json")).presetPorDefecto, "software-replica");
    assert.equal(fs.existsSync(path.join(r.docs, "PROYECTO-A", "phase-gate.json")), false);
    const escrito = leer(path.join(config, "machine.json"));
    assert.equal(escrito.version, 2);
    assert.equal(escrito.$schema, "https://unpkg.com/mcp-phase-gate@4/schema/machine.json");
  });

  it("--solo-este-equipo sobre un machine.json versión 1 con $schema @3 lo deja en versión 2 y @4, sin perder nada", async () => {
    fijarRaizDelPaquete(RAIZ);
    const r = rutas();
    crearProyecto(r.docs, "PROYECTO-A");
    const config = configTemporal();
    const destino = carpetaTemporal("repo");
    const archivo = path.join(config, "machine.json");
    fs.writeFileSync(archivo, JSON.stringify({ $schema: "https://unpkg.com/mcp-phase-gate@3/schema/machine.json", version: 1, repos: { "PROYECTO-A/api": destino } }), "utf-8");
    const p = entornoDePrueba();

    assert.equal(await ejecutarInit(opciones({ ...r, clientes: [], migrate: true, soloEsteEquipo: true, yes: true }), p.entorno), 0, p.errores());
    const escrito = leer(archivo);
    assert.deepEqual(Object.keys(escrito), ["$schema", "version", "repos", "presetPorDefecto"]);
    assert.equal(escrito.$schema, "https://unpkg.com/mcp-phase-gate@4/schema/machine.json");
    assert.equal(escrito.version, 2);
    assert.deepEqual(escrito.repos, { "PROYECTO-A/api": destino });
    assert.ok(fs.readdirSync(config).some((n) => n.startsWith("machine.json.bak-")), "queda la copia de la versión 1");
  });

  it("machine.json se escribe con un temporal y un renombrado, no directo: un servidor abierto no lo lee a medias", async () => {
    fijarRaizDelPaquete(RAIZ);
    const r = rutas();
    crearProyecto(r.docs, "PROYECTO-A");
    const config = configTemporal();
    const archivo = path.join(config, "machine.json");
    fs.writeFileSync(archivo, JSON.stringify({ version: 1, repos: {} }), "utf-8");
    const p = entornoDePrueba();

    const escritos: string[] = [];
    const original = fsDelSistema.writeFileSync;
    const espia = mock.method(fsDelSistema, "writeFileSync", ((...args: Parameters<typeof original>) => {
      escritos.push(String(args[0]));
      return original(...args);
    }) as typeof original);
    syncBuiltinESMExports();
    try {
      assert.equal(await ejecutarInit(opciones({ ...r, clientes: [], migrate: true, soloEsteEquipo: true, yes: true }), p.entorno), 0, p.errores());
    } finally {
      espia.mock.restore();
      syncBuiltinESMExports();
    }

    assert.ok(!escritos.includes(archivo), "no se escribió machine.json directamente");
    assert.ok(escritos.some((ruta) => path.dirname(ruta) === config && /^\.machine\.json\..+\.tmp$/.test(path.basename(ruta))), `escrituras: ${escritos.join(", ")}`);
    assert.deepEqual(fs.readdirSync(config).filter((nombre) => nombre.endsWith(".tmp")), [], "no queda ningún temporal");
    assert.equal(leer(archivo).presetPorDefecto, "software-replica");
  });
});

describe("init --dry-run", () => {
  it("no escribe nada: el árbol es el mismo antes y después, y claude mcp add no se ejecuta", async () => {
    fijarRaizDelPaquete(RAIZ);
    const r = rutas();
    crearProyecto(r.docs, "PROYECTO-A");
    const config = configTemporal();
    const p = entornoDePrueba({ responder: claudeVacio });
    fs.mkdirSync(path.join(p.home, ".cursor"));
    fs.writeFileSync(cursorJson(p), JSON.stringify({ mcpServers: { otro: { command: "x" } } }), "utf-8");
    fs.mkdirSync(path.join(p.appData, "Code", "User"), { recursive: true });

    const antes = arbol(p.home, p.appData, r.docs, config);
    const codigo = await ejecutarInit(opciones({ ...r, comandos: true, migrate: true, dryRun: true }), p.entorno);
    assert.equal(codigo, 0, p.errores());
    assert.deepEqual(arbol(p.home, p.appData, r.docs, config), antes);
    assert.equal(p.llamadas.some((l) => l[2] === "add"), false);
    assert.match(p.texto(), /\[dry-run\] Claude Code: se ejecutaría claude mcp add pg/);
    assert.match(p.texto(), /\[dry-run\] Cursor: registrado como «pg»/);
    assert.match(p.texto(), /--dry-run: no se escribió nada\./);
  });
});

describe("piezas de init", () => {
  it("quitarComentarios respeta las cadenas y quita las comas finales", () => {
    assert.deepEqual(JSON.parse(quitarComentarios('{ "u": "http://x//y", /* a */ "b": [1, 2,], // c\n }')), { u: "http://x//y", b: [1, 2] });
  });

  it("diffDeLineas marca lo que sale y lo que entra", () => {
    assert.equal(diffDeLineas("a\nb\nc", "a\nB\nc"), "  a\n- b\n+ B\n  c");
  });

  it("ejecutarCli valida las banderas de init", () => {
    const salida: Salida = { out: () => {}, err: () => {} };
    assert.deepEqual(ejecutarCli(["init", "--cliente", "emacs"], salida, false), { accion: "salir", codigo: 2 });
    assert.deepEqual(ejecutarCli(["init", "--preset", "software-tdd"], salida, false), { accion: "salir", codigo: 2 });
    assert.deepEqual(ejecutarCli(["init", "--clave", "con espacio"], salida, false), { accion: "salir", codigo: 2 });

    const r = ejecutarCli(["init", "--cliente", "todos", "--dry-run", "--migrate", "--preset", "x", "-y"], salida, false);
    assert.equal(r.accion, "init");
    if (r.accion === "init") {
      assert.deepEqual(r.opciones.clientes, ["claude-code", "cursor", "vscode"]);
      assert.deepEqual([r.opciones.dryRun, r.opciones.migrate, r.opciones.preset, r.opciones.yes], [true, true, "x", true]);
    }
  });
});
