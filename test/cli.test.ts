// La línea de comandos: ayuda, versión y doctor. Las pruebas unitarias llaman a ejecutarCli con
// una salida de mentira; las de proceso lanzan el binario compilado, porque el código de salida y
// lo que llega a stdout y stderr es justo lo que ve quien lo ejecuta en su terminal.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { AVISO_TERMINAL, ejecutarCli } from "../src/cli.js";
import type { Salida } from "../src/cli.js";
import { SERVER_VERSION } from "../src/config.js";
import { carpetaTemporal, limpiarEntorno } from "./helpers.js";

afterEach(limpiarEntorno);

// Este archivo compila a build-test/test/; el binario, a build-test/src/.
const BINARIO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");
const PROMPTS_DEL_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts", "es");

function salidaDePrueba(): Salida & { textoOut: () => string; textoErr: () => string } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out: (texto) => out.push(texto),
    err: (texto) => err.push(texto),
    textoOut: () => out.join("\n"),
    textoErr: () => err.join("\n"),
  };
}

// Una instalación correcta para el binario. El entorno del proceso ya viene limpio (helpers lo
// limpia al importarse), así que solo llegan estas variables y las del sistema.
function entornoCorrecto(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PHASE_GATE_DOCS_PATH: carpetaTemporal("docs"),
    PHASE_GATE_REPOS_PATH: carpetaTemporal("repos"),
    PHASE_GATE_PROMPTS_PATH: PROMPTS_DEL_REPO,
    PHASE_GATE_STATE_PATH: carpetaTemporal("state"),
  };
}

function lanzar(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [BINARIO, ...args], { env, encoding: "utf-8", input: "" });
}

describe("ejecutarCli", () => {
  it("sin argumentos arranca el servidor y no escribe nada si stdin no es una terminal", () => {
    const salida = salidaDePrueba();

    assert.deepEqual(ejecutarCli([], salida, false), { accion: "servidor" });
    assert.equal(salida.textoOut(), "");
    assert.equal(salida.textoErr(), "");
  });

  // Quien lo ejecuta a mano ve un cursor parpadeando; una línea en stderr le dice qué pasa.
  it("sin argumentos y en una terminal, avisa por stderr y nunca por stdout", () => {
    const salida = salidaDePrueba();

    assert.deepEqual(ejecutarCli([], salida, true), { accion: "servidor" });
    assert.equal(salida.textoOut(), "");
    assert.equal(salida.textoErr(), AVISO_TERMINAL);
  });

  it("--help y -h imprimen la ayuda, con doctor y las variables PHASE_GATE_*", () => {
    for (const bandera of ["--help", "-h"]) {
      const salida = salidaDePrueba();

      assert.deepEqual(ejecutarCli([bandera], salida, false), { accion: "salir", codigo: 0 });
      assert.match(salida.textoOut(), /doctor/);
      assert.match(salida.textoOut(), /PHASE_GATE_DOCS_PATH/);
      assert.match(salida.textoOut(), /ORQUESTADOR_\* de antes siguen valiendo/);
    }
  });

  it("--version y -v imprimen la versión", () => {
    for (const bandera of ["--version", "-v"]) {
      const salida = salidaDePrueba();

      assert.deepEqual(ejecutarCli([bandera], salida, false), { accion: "salir", codigo: 0 });
      assert.equal(salida.textoOut(), SERVER_VERSION);
    }
  });

  it("un subcomando, una bandera o un argumento de más desconocidos salen con 2 y la ayuda en stderr", () => {
    // `init` existe desde la Etapa 3: el subcomando desconocido es otro.
    for (const argv of [["inventado"], ["--json"], ["doctor", "extra"], ["doctor", "--verbose"], ["doctor", "--yes"], ["init", "--json"]]) {
      const salida = salidaDePrueba();

      assert.deepEqual(ejecutarCli(argv, salida, false), { accion: "salir", codigo: 2 }, argv.join(" "));
      assert.equal(salida.textoOut(), "");
      assert.match(salida.textoErr(), /Uso:/);
    }
  });

  it("doctor sin DOCS_PATH sale con 1", () => {
    process.env.PHASE_GATE_STATE_PATH = carpetaTemporal("state");
    const salida = salidaDePrueba();

    assert.deepEqual(ejecutarCli(["doctor"], salida, false), { accion: "salir", codigo: 1 });
    assert.match(salida.textoOut(), /VAR-FALTA/);
  });
});

describe("el binario", () => {
  it("doctor sale con 0 en una instalación correcta", () => {
    const resultado = lanzar(["doctor"], entornoCorrecto());

    assert.equal(resultado.status, 0, resultado.stderr);
    assert.match(resultado.stdout, /^mcp-phase-gate .+ · vía /);
    assert.match(resultado.stdout, /^Hallazgos$/m);
  });

  it("doctor sale con 1 sin DOCS_PATH", () => {
    const env = entornoCorrecto();
    delete env.PHASE_GATE_DOCS_PATH;

    const resultado = lanzar(["doctor"], env);
    assert.equal(resultado.status, 1);
    assert.match(resultado.stdout, /error +VAR-FALTA/);
  });

  it("doctor --json produce JSON válido con el diagnóstico", () => {
    const env = entornoCorrecto();
    const resultado = lanzar(["doctor", "--json"], env);

    assert.equal(resultado.status, 0, resultado.stderr);
    const diagnostico = JSON.parse(resultado.stdout);
    assert.equal(diagnostico.rutas.docs.ruta, env.PHASE_GATE_DOCS_PATH);
    assert.ok(Array.isArray(diagnostico.hallazgos));
    assert.equal(diagnostico.paquete.version, SERVER_VERSION);
  });

  it("un subcomando desconocido sale con 2", () => {
    const resultado = lanzar(["desconocido"], entornoCorrecto());

    assert.equal(resultado.status, 2);
    assert.equal(resultado.stdout, "");
    assert.match(resultado.stderr, /Uso:/);
  });
});

// Ajuste de la auditoría de la Etapa 2: antes del initialize no sale nada por stdout.
describe("el servidor al arrancar", () => {
  it("sin cliente que envíe initialize, no escribe nada en stdout", () => {
    const resultado = lanzar([], entornoCorrecto());

    assert.equal(resultado.stdout, "");
    assert.match(resultado.stderr, /\[mcp-phase-gate\]/);
  });
});
