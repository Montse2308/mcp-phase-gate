// Ningún test lee la configuración real de quien corre la suite: aunque borre PHASE_GATE_CONFIG_PATH,
// configDir() cae en una carpeta falsa dentro de la carpeta temporal.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";

import { configDir, stateDir } from "../src/config.js";
import { limpiarEntorno } from "./helpers.js";

afterEach(() => limpiarEntorno());

const temporal = (): string => fs.realpathSync.native(os.tmpdir());

function dentroDeLaTemporal(ruta: string): boolean {
  const relativa = path.relative(temporal(), ruta);
  return relativa !== "" && !relativa.startsWith("..") && !path.isAbsolute(relativa);
}

describe("el aislamiento de la configuración de los tests", () => {
  it("sin PHASE_GATE_CONFIG_PATH, configDir() resuelve dentro de la carpeta temporal", () => {
    delete process.env.PHASE_GATE_CONFIG_PATH;
    assert.ok(dentroDeLaTemporal(configDir()), `${configDir()} no está dentro de ${temporal()}`);
  });

  it("sin PHASE_GATE_STATE_PATH, stateDir() también", () => {
    assert.ok(dentroDeLaTemporal(stateDir()), `${stateDir()} no está dentro de ${temporal()}`);
  });

  it("la carpeta personal, APPDATA y XDG_CONFIG_HOME apuntan a carpetas que existen en la temporal", () => {
    for (const variable of ["HOME", "USERPROFILE", "APPDATA", "XDG_CONFIG_HOME"] as const) {
      const valor = process.env[variable];
      assert.ok(valor, `${variable} no está fijada`);
      assert.ok(dentroDeLaTemporal(fs.realpathSync.native(valor)), `${variable} (${valor}) no está dentro de ${temporal()}`);
    }
    assert.ok(dentroDeLaTemporal(fs.realpathSync.native(os.homedir())), `os.homedir() (${os.homedir()}) no está dentro de ${temporal()}`);
  });

  it("cada limpiarEntorno da carpetas nuevas y vacías", () => {
    const antes = process.env.APPDATA;
    limpiarEntorno();
    assert.notEqual(process.env.APPDATA, antes);
    assert.deepEqual(fs.readdirSync(process.env.APPDATA!), []);
  });
});
