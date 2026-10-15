import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  DOCS,
  cargarEnv,
  clavesDeEnv,
  defaultPromptsPath,
  errorDeEnv,
  leerVariable,
  promptsLayers,
  reiniciarEnv,
  requireBasePath,
  stateDir,
  stateFile,
  tasksSubdir,
} from "../src/config.js";
import { carpetaTemporal, limpiarEntorno } from "./helpers.js";

afterEach(limpiarEntorno);

describe("requireBasePath", () => {
  it("sin la variable, falla nombrando las dos y diciendo dónde definirla", () => {
    assert.throws(
      () => requireBasePath(DOCS),
      /Falta PHASE_GATE_DOCS_PATH \(o su alias ORQUESTADOR_DOCS_PATH\).*\.env/s
    );
  });

  // Solo espacios es lo mismo que no tenerla: se recorta antes de mirar.
  it("con la variable vacía o solo espacios, falla igual que sin ella", () => {
    process.env.ORQUESTADOR_DOCS_PATH = "   ";

    assert.throws(() => requireBasePath(DOCS), /Falta PHASE_GATE_DOCS_PATH/);
  });

  it("con la variable nueva, el error de una ruta inexistente nombra la variable que se usó", () => {
    const inexistente = path.join(carpetaTemporal("config"), "no-existe");
    process.env.PHASE_GATE_DOCS_PATH = inexistente;

    assert.throws(() => requireBasePath(DOCS), /^Error: PHASE_GATE_DOCS_PATH apunta a/);
  });

  it("si el .env no se pudo cargar, el error de la variable que falta lo dice", () => {
    const archivo = path.join(carpetaTemporal("env"), ".env");
    fs.writeFileSync(archivo, Buffer.from("\uFEFFPHASE_GATE_DOCS_PATH=C:\\docs\n", "utf16le"));
    cargarEnv(archivo);

    assert.throws(() => requireBasePath(DOCS), /Falta PHASE_GATE_DOCS_PATH.*UTF-16.*UTF-8 \(sin BOM\)/s);
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

describe("leerVariable", () => {
  it("sin ninguna de las dos, queda sin definir", () => {
    const lectura = leerVariable("DOCS_PATH");

    assert.equal(lectura.valor, undefined);
    assert.equal(lectura.usada, null);
    assert.equal(lectura.fuente, "sin definir");
    assert.equal(lectura.discrepancia, null);
  });

  it("solo con el alias, usa el alias", () => {
    process.env.ORQUESTADOR_REPOS_PATH = "  /repos  ";

    const lectura = leerVariable("REPOS_PATH");
    assert.equal(lectura.valor, "/repos");
    assert.equal(lectura.usada, "ORQUESTADOR_REPOS_PATH");
    assert.equal(lectura.fuente, "entorno");
  });

  it("con las dos y distintas, gana PHASE_GATE_* y la discrepancia dice cuál se ignoró", () => {
    process.env.PHASE_GATE_DOCS_PATH = "/docs-nuevo";
    process.env.ORQUESTADOR_DOCS_PATH = "/docs-viejo";

    const lectura = leerVariable("DOCS_PATH");
    assert.equal(lectura.valor, "/docs-nuevo");
    assert.equal(lectura.usada, "PHASE_GATE_DOCS_PATH");
    assert.equal(lectura.discrepancia, "ORQUESTADOR_DOCS_PATH difiere de PHASE_GATE_DOCS_PATH; se usa PHASE_GATE_DOCS_PATH.");
  });

  // Las rutas se comparan resueltas: la misma carpeta escrita de otra forma no es discrepancia.
  it("con las dos apuntando a la misma ruta escrita distinto, no hay discrepancia", () => {
    const carpeta = carpetaTemporal("config");
    process.env.PHASE_GATE_DOCS_PATH = carpeta;
    process.env.ORQUESTADOR_DOCS_PATH = `  ${path.join(carpeta, "sub", "..")}  `;

    assert.equal(leerVariable("DOCS_PATH").discrepancia, null);
  });

  // TASKS_SUBDIR vacía significa "las tareas cuelgan del proyecto", así que la principal vacía
  // también gana, y la diferencia con el alias se avisa.
  it("PHASE_GATE_TASKS_SUBDIR vacía gana al alias y se avisa la diferencia", () => {
    process.env.PHASE_GATE_TASKS_SUBDIR = "";
    process.env.ORQUESTADOR_TASKS_SUBDIR = "Proyectos";

    assert.equal(tasksSubdir(), "");
    assert.match(leerVariable("TASKS_SUBDIR").discrepancia ?? "", /se usa PHASE_GATE_TASKS_SUBDIR/);
  });

  it("ELICITATION no tiene alias", () => {
    process.env.PHASE_GATE_ELICITATION = " off ";

    const lectura = leerVariable("ELICITATION");
    assert.equal(lectura.valor, "off");
    assert.equal(lectura.usada, "PHASE_GATE_ELICITATION");
    assert.equal(lectura.discrepancia, null);
  });
});

describe("cargarEnv", () => {
  function envTemporal(contenido: string | Buffer): string {
    const archivo = path.join(carpetaTemporal("env"), ".env");
    fs.writeFileSync(archivo, contenido);
    return archivo;
  }

  it("carga las claves y la fuente de la variable pasa a ser .env", () => {
    cargarEnv(envTemporal("PHASE_GATE_DOCS_PATH=/desde-env\n"));

    const lectura = leerVariable("DOCS_PATH");
    assert.equal(lectura.valor, "/desde-env");
    assert.equal(lectura.fuente, ".env");
    assert.ok(clavesDeEnv().has("PHASE_GATE_DOCS_PATH"));
    assert.equal(errorDeEnv(), null);
  });

  // El bloque "env" del cliente gana al .env, como con dotenv.
  it("no pisa una variable que ya está en el entorno", () => {
    process.env.PHASE_GATE_DOCS_PATH = "/del-cliente";
    cargarEnv(envTemporal("PHASE_GATE_DOCS_PATH=/desde-env\nPHASE_GATE_REPOS_PATH=/repos\n"));

    assert.equal(leerVariable("DOCS_PATH").valor, "/del-cliente");
    assert.equal(leerVariable("DOCS_PATH").fuente, "entorno");
    assert.equal(leerVariable("REPOS_PATH").fuente, ".env");
    assert.ok(!clavesDeEnv().has("PHASE_GATE_DOCS_PATH"));
  });

  // Es lo que rompía process.loadEnvFile: la primera clave llegaba como "\uFEFFPHASE_GATE_…".
  it("acepta un .env en UTF-8 con BOM", () => {
    cargarEnv(envTemporal("\uFEFFPHASE_GATE_DOCS_PATH=/con-bom\n"));

    assert.equal(leerVariable("DOCS_PATH").valor, "/con-bom");
    assert.equal(errorDeEnv(), null);
  });

  it("rechaza un .env en UTF-16 con BOM, sin cargar nada y con un mensaje que lo explica", () => {
    cargarEnv(envTemporal(Buffer.from("\uFEFFPHASE_GATE_DOCS_PATH=/x\n", "utf16le")));

    assert.equal(leerVariable("DOCS_PATH").valor, undefined);
    assert.equal(clavesDeEnv().size, 0);
    assert.match(errorDeEnv() ?? "", /UTF-16.*Guárdalo como UTF-8 \(sin BOM\)/);
  });

  it("rechaza también un UTF-16 sin BOM, por sus bytes NUL", () => {
    cargarEnv(envTemporal(Buffer.from("PHASE_GATE_DOCS_PATH=/x\n", "utf16le")));

    assert.equal(leerVariable("DOCS_PATH").valor, undefined);
    assert.match(errorDeEnv() ?? "", /UTF-16/);
  });

  it("acepta comentarios, el prefijo export y rutas de Windows sin comillas", () => {
    cargarEnv(
      envTemporal(
        "# comentario\nexport PHASE_GATE_REPOS_PATH=1\nPHASE_GATE_DOCS_PATH=C:\\Users\\Ana\\DOCUMENTACIÓN\n"
      )
    );

    assert.equal(leerVariable("REPOS_PATH").valor, "1");
    assert.equal(leerVariable("DOCS_PATH").valor, "C:\\Users\\Ana\\DOCUMENTACIÓN");
  });

  // Los archivos propios llegan en CRLF desde el Bloc de notas.
  it("acepta finales de línea CRLF", () => {
    cargarEnv(envTemporal("PHASE_GATE_DOCS_PATH=/crlf\r\nPHASE_GATE_REPOS_PATH=/r\r\n"));

    assert.equal(leerVariable("DOCS_PATH").valor, "/crlf");
    assert.equal(leerVariable("REPOS_PATH").valor, "/r");
  });

  it("sin archivo no hace nada ni deja error", () => {
    cargarEnv(path.join(carpetaTemporal("env"), "no-existe.env"));

    assert.equal(clavesDeEnv().size, 0);
    assert.equal(errorDeEnv(), null);
  });

  // Volver a cargar sustituye la carga anterior: lo que vino de un .env no se queda pegado.
  it("una segunda carga quita lo que puso la primera", () => {
    cargarEnv(envTemporal("PHASE_GATE_DOCS_PATH=/primero\n"));
    cargarEnv(envTemporal("PHASE_GATE_REPOS_PATH=/segundo\n"));

    assert.equal(leerVariable("DOCS_PATH").valor, undefined);
    assert.equal(leerVariable("REPOS_PATH").valor, "/segundo");
  });

  it("reiniciarEnv borra del entorno lo que vino del .env y el error guardado", () => {
    cargarEnv(envTemporal("PHASE_GATE_DOCS_PATH=/x\n"));
    reiniciarEnv();

    assert.equal(process.env.PHASE_GATE_DOCS_PATH, undefined);
    assert.equal(clavesDeEnv().size, 0);

    cargarEnv(envTemporal(Buffer.from("\uFEFFA=1", "utf16le")));
    reiniciarEnv();
    assert.equal(errorDeEnv(), null);
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

  it("PHASE_GATE_STATE_PATH gana al alias, y se recorta y resuelve como las demás rutas", () => {
    const carpeta = carpetaTemporal("state");
    process.env.ORQUESTADOR_STATE_PATH = carpetaTemporal("otra");
    process.env.PHASE_GATE_STATE_PATH = `  ${path.join(carpeta, "sub", "..")}  `;

    assert.equal(stateDir(), carpeta);
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

// Ajustes de la auditoría de la Etapa 2: la fuente manda antes que el nombre.
describe("leerVariable cuando cada nombre llega por una vía distinta", () => {
  function envTemporal(contenido: string): string {
    const archivo = path.join(carpetaTemporal("env"), ".env");
    fs.writeFileSync(archivo, contenido);
    return archivo;
  }

  it("el alias del entorno del cliente gana a PHASE_GATE_* del .env, y la discrepancia lo explica", () => {
    process.env.ORQUESTADOR_DOCS_PATH = "/del-cliente";
    cargarEnv(envTemporal("PHASE_GATE_DOCS_PATH=/del-env\n"));

    const lectura = leerVariable("DOCS_PATH");
    assert.equal(lectura.valor, "/del-cliente");
    assert.equal(lectura.usada, "ORQUESTADOR_DOCS_PATH");
    assert.equal(lectura.fuente, "entorno");
    assert.equal(
      lectura.discrepancia,
      "PHASE_GATE_DOCS_PATH difiere de ORQUESTADOR_DOCS_PATH; se usa ORQUESTADOR_DOCS_PATH (el entorno del cliente gana al .env)."
    );
  });

  it("con los dos en el .env, gana PHASE_GATE_*", () => {
    cargarEnv(envTemporal("ORQUESTADOR_DOCS_PATH=/viejo\nPHASE_GATE_DOCS_PATH=/nuevo\n"));

    const lectura = leerVariable("DOCS_PATH");
    assert.equal(lectura.valor, "/nuevo");
    assert.equal(lectura.fuente, ".env");
    assert.match(lectura.discrepancia ?? "", /se usa PHASE_GATE_DOCS_PATH\.$/);
  });

  // Una ruta vacía no significa nada: no puede tapar un alias que apunta a una carpeta.
  it("una PHASE_GATE_DOCS_PATH vacía no tapa un alias válido", () => {
    const carpeta = carpetaTemporal("config");
    process.env.PHASE_GATE_DOCS_PATH = "  ";
    process.env.ORQUESTADOR_DOCS_PATH = carpeta;

    assert.equal(requireBasePath(DOCS), carpeta);
    assert.equal(leerVariable("DOCS_PATH").discrepancia, "PHASE_GATE_DOCS_PATH está vacía; se usa ORQUESTADOR_DOCS_PATH.");
  });
});
