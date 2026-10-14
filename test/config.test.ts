import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  DOCS,
  defaultPromptsPath,
  promptsLayers,
  requireBasePath,
  stateDir,
  stateFile,
  tasksSubdir,
} from "../src/config.js";
import { carpetaTemporal, limpiarEntorno } from "./helpers.js";

afterEach(limpiarEntorno);

describe("requireBasePath", () => {
  it("sin la variable, falla nombrándola y diciendo dónde definirla", () => {
    delete process.env.ORQUESTADOR_DOCS_PATH;

    assert.throws(() => requireBasePath(DOCS), /Falta la variable ORQUESTADOR_DOCS_PATH.*\.env/s);
  });

  // Solo espacios es lo mismo que no tenerla: se recorta antes de mirar.
  it("con la variable vacía o solo espacios, falla igual que sin ella", () => {
    process.env.ORQUESTADOR_DOCS_PATH = "   ";

    assert.throws(() => requireBasePath(DOCS), /Falta la variable ORQUESTADOR_DOCS_PATH/);
  });

  it("con una ruta que no existe, falla diciendo cuál y avisando del encoding", () => {
    const inexistente = path.join(carpetaTemporal("config"), "no-existe");
    process.env.ORQUESTADOR_DOCS_PATH = inexistente;

    assert.throws(() => requireBasePath(DOCS), (error: Error) => {
      assert.ok(error.message.includes(inexistente), error.message);
      assert.match(error.message, /no existe en este equipo.*UTF-8/s);
      return true;
    });
  });

  it("con una ruta que es un archivo, falla diciendo que no es una carpeta", () => {
    const archivo = path.join(carpetaTemporal("config"), "docs.txt");
    fs.writeFileSync(archivo, "x", "utf-8");
    process.env.ORQUESTADOR_DOCS_PATH = archivo;

    assert.throws(() => requireBasePath(DOCS), /es un archivo y no una carpeta/);
  });

  it("con una carpeta que existe, devuelve su ruta absoluta sin los espacios de alrededor", () => {
    const carpeta = carpetaTemporal("config");
    process.env.ORQUESTADOR_DOCS_PATH = `  ${carpeta}  `;

    assert.equal(requireBasePath(DOCS), carpeta);
  });
});

describe("tasksSubdir", () => {
  it("sin definir es \"Proyectos\"", () => {
    delete process.env.ORQUESTADOR_TASKS_SUBDIR;

    assert.equal(tasksSubdir(), "Proyectos");
  });

  // Vacía a propósito significa que las tareas cuelgan directo del proyecto.
  it("vacía es \"\"", () => {
    process.env.ORQUESTADOR_TASKS_SUBDIR = "";

    assert.equal(tasksSubdir(), "");
  });

  it("solo con espacios también es \"\"", () => {
    process.env.ORQUESTADOR_TASKS_SUBDIR = "   ";

    assert.equal(tasksSubdir(), "");
  });
});

describe("stateDir y stateFile", () => {
  it("ORQUESTADOR_STATE_PATH sobrescribe la carpeta de estado", () => {
    const carpeta = carpetaTemporal("state");
    process.env.ORQUESTADOR_STATE_PATH = carpeta;

    assert.equal(stateDir(), carpeta);
    assert.equal(stateFile(), path.join(carpeta, "active-tasks.json"));
  });

  // El nombre singular active_task.json fue el formato anterior y ya no se lee.
  it("stateFile termina en active-tasks.json también sin la variable", () => {
    delete process.env.ORQUESTADOR_STATE_PATH;

    assert.equal(path.basename(stateFile()), "active-tasks.json");
    assert.equal(path.basename(stateDir()), "mcp-phase-gate");
  });

  it("en Linux respeta XDG_STATE_HOME", { skip: process.platform !== "linux" }, () => {
    const anterior = process.env.XDG_STATE_HOME;
    const carpeta = carpetaTemporal("xdg");

    try {
      delete process.env.ORQUESTADOR_STATE_PATH;
      process.env.XDG_STATE_HOME = carpeta;

      assert.equal(stateDir(), path.join(carpeta, "mcp-phase-gate"));
    } finally {
      // No es una variable del orquestador, así que limpiarEntorno no la toca.
      if (anterior === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = anterior;
    }
  });
});

describe("promptsLayers", () => {
  it("sin carpeta propia solo están los prompts del paquete", () => {
    delete process.env.ORQUESTADOR_PROMPTS_PATH;

    assert.deepEqual(promptsLayers(), [defaultPromptsPath()]);
  });

  // De menor a mayor prioridad: la propia va al final, y por eso gana.
  it("con carpeta propia, va después de la del paquete y como ruta absoluta", () => {
    const propia = carpetaTemporal("prompts");
    process.env.ORQUESTADOR_PROMPTS_PATH = `  ${propia}  `;

    assert.deepEqual(promptsLayers(), [defaultPromptsPath(), propia]);
  });
});
