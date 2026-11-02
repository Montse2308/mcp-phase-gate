import { strict as assert } from "node:assert";
import { afterEach, describe, it, mock } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  DOCS,
  REPOS,
  cargarEnv,
  conMaquinaDeLaLlamada,
  configDir,
  clavesDeEnv,
  defaultPromptsPath,
  errorDeEnv,
  idiomaSinProyecto,
  leerVariable,
  maquinaVigente,
  promptsLayers,
  reiniciarEnv,
  requireBasePath,
  stateDir,
  stateFile,
  tasksSubdir,
  valorDeMaquina,
} from "../src/config.js";
import { carpetaTemporal, configTemporal, limpiarEntorno } from "./helpers.js";

afterEach(limpiarEntorno);

describe("requireBasePath", () => {
  it("sin la variable, falla nombrando las dos y diciendo dónde definirla: machine.json, o el bloque env de un cliente", () => {
    assert.throws(
      () => requireBasePath(DOCS),
      /Falta PHASE_GATE_DOCS_PATH \(o su alias ORQUESTADOR_DOCS_PATH\).*machine\.json.*"rutas\.documentacion".*bloque "env"/s
    );
    assert.throws(() => requireBasePath(REPOS), /"rutas\.carpetaDeRepos"/);
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

// La fuente manda antes que el nombre.
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

// Las rutas también salen de machine.json: entorno, .env, machine.json y nada, en ese orden.
describe("rutas desde machine.json", () => {
  function maquina(contenido: unknown): string {
    const archivo = path.join(configDir(), "machine.json");
    fs.writeFileSync(archivo, typeof contenido === "string" ? contenido : JSON.stringify(contenido), "utf-8");
    return archivo;
  }

  it("sin entorno ni .env, DOCS_PATH, REPOS_PATH y TASKS_SUBDIR salen de machine.json", () => {
    const docs = carpetaTemporal("docs");
    const repos = carpetaTemporal("repos");
    maquina({ version: 2, rutas: { documentacion: docs, carpetaDeRepos: repos, subcarpetaTareas: "Tareas" } });

    assert.deepEqual(
      (["DOCS_PATH", "REPOS_PATH", "TASKS_SUBDIR"] as const).map((logica) => {
        const { valor, usada, fuente, discrepancia } = leerVariable(logica);
        return { valor, usada, fuente, discrepancia };
      }),
      [
        { valor: docs, usada: "rutas.documentacion", fuente: "machine.json", discrepancia: null },
        { valor: repos, usada: "rutas.carpetaDeRepos", fuente: "machine.json", discrepancia: null },
        { valor: "Tareas", usada: "rutas.subcarpetaTareas", fuente: "machine.json", discrepancia: null },
      ]
    );
    assert.equal(requireBasePath(DOCS), docs);
    assert.equal(requireBasePath(REPOS), repos);
    assert.equal(tasksSubdir(), "Tareas");
  });

  it("dentro de una llamada se lee una sola vez, aunque cambie en medio; la llamada siguiente ve el cambio", () => {
    const primera = carpetaTemporal("primera");
    const segunda = carpetaTemporal("segunda");
    maquina({ version: 2, rutas: { documentacion: primera } });

    const dentro = conMaquinaDeLaLlamada(() => {
      const antes = requireBasePath(DOCS);
      maquina({ version: 2, rutas: { documentacion: segunda } });
      return [antes, requireBasePath(DOCS), leerVariable("DOCS_PATH").valor];
    });
    assert.deepEqual(dentro, [primera, primera, primera], "una llamada no mezcla dos versiones del archivo");
    assert.equal(requireBasePath(DOCS), segunda, "fuera de la llamada, y en la siguiente, se lee el disco");
    assert.equal(conMaquinaDeLaLlamada(() => requireBasePath(DOCS)), segunda);
  });

  it("el entorno gana a machine.json, y el .env también, cada uno por su lado", () => {
    const deMaquina = carpetaTemporal("maquina");
    const delEnv = carpetaTemporal("entorno");
    const delDotEnv = carpetaTemporal("dotenv");
    maquina({ version: 2, rutas: { documentacion: deMaquina, carpetaDeRepos: deMaquina } });

    process.env.PHASE_GATE_DOCS_PATH = delEnv;
    const archivo = path.join(carpetaTemporal("env"), ".env");
    fs.writeFileSync(archivo, `PHASE_GATE_REPOS_PATH=${delDotEnv}\n`);
    cargarEnv(archivo);

    assert.deepEqual([leerVariable("DOCS_PATH").valor, leerVariable("DOCS_PATH").fuente], [delEnv, "entorno"]);
    assert.deepEqual([leerVariable("REPOS_PATH").valor, leerVariable("REPOS_PATH").fuente], [delDotEnv, ".env"]);
    assert.equal(valorDeMaquina("DOCS_PATH"), deMaquina, "lo que dice machine.json se puede leer aunque no gane");
  });

  it("sin ninguna fuente, nada: la variable queda sin definir y TASKS_SUBDIR es Proyectos", () => {
    maquina({ version: 2, presetPorDefecto: "software" });

    assert.equal(leerVariable("DOCS_PATH").fuente, "sin definir");
    assert.equal(valorDeMaquina("DOCS_PATH"), undefined);
    assert.equal(tasksSubdir(), "Proyectos");
    assert.throws(() => requireBasePath(DOCS), /Falta PHASE_GATE_DOCS_PATH.*machine\.json.*"rutas\.documentacion"/s);
  });

  it("subcarpetaTareas vacía vale: las tareas cuelgan del proyecto", () => {
    maquina({ version: 2, rutas: { subcarpetaTareas: "" } });

    assert.equal(leerVariable("TASKS_SUBDIR").fuente, "machine.json");
    assert.equal(tasksSubdir(), "");
  });

  it("una ruta de machine.json que no existe, o que es un archivo, lo dice nombrando machine.json y no una variable de entorno", () => {
    const inexistente = path.join(carpetaTemporal("config"), "no-existe");
    maquina({ version: 2, rutas: { documentacion: inexistente } });
    assert.throws(() => requireBasePath(DOCS), (error: Error) => {
      assert.match(error.message, /^machine\.json \(rutas\.documentacion\) apunta a/);
      assert.ok(error.message.includes(inexistente));
      assert.match(error.message, /Corrige la ruta en machine\.json\.$/);
      assert.doesNotMatch(error.message, /PHASE_GATE_DOCS_PATH|\.env/);
      return true;
    });

    const archivo = path.join(carpetaTemporal("config"), "docs.txt");
    fs.writeFileSync(archivo, "x", "utf-8");
    maquina({ version: 2, rutas: { carpetaDeRepos: archivo } });
    assert.throws(() => requireBasePath(REPOS), /^Error: machine\.json \(rutas\.carpetaDeRepos\) apunta a ".*docs\.txt", que es un archivo y no una carpeta\./);
  });

  it("cambia el archivo en disco y la llamada siguiente lo nota, sin reiniciar", () => {
    const una = carpetaTemporal("una");
    const otra = carpetaTemporal("otra");
    maquina({ version: 2, rutas: { documentacion: una } });
    assert.equal(requireBasePath(DOCS), una);

    maquina({ version: 2, rutas: { documentacion: otra } });
    assert.equal(requireBasePath(DOCS), otra);

    fs.rmSync(path.join(configDir(), "machine.json"));
    assert.throws(() => requireBasePath(DOCS), /Falta PHASE_GATE_DOCS_PATH/);
  });

  describe("cuando machine.json se rompe", () => {
    it("con un error de sintaxis y sin un archivo válido antes, sus rutas no cuentan y el error dice la línea y la columna", () => {
      const docs = carpetaTemporal("docs");
      maquina(`{\n  "version": 2,\n  "rutas": { "documentacion": ${JSON.stringify(docs)} },\n  }`);

      assert.equal(leerVariable("DOCS_PATH").fuente, "sin definir");
      assert.throws(() => requireBasePath(DOCS), (error: Error) => {
        assert.match(error.message, /Falta PHASE_GATE_DOCS_PATH/);
        assert.match(error.message, /machine\.json no es válido \(.*machine\.json\): no es un JSON válido: carácter inesperado «\}» \(línea 4, columna 3\)/);
        return true;
      });
    });

    it("con un error de forma, nombra el campo", () => {
      maquina({ version: 2, rutas: { documentacion: "relativa" } });

      assert.throws(() => requireBasePath(DOCS), /machine\.json no es válido .*rutas\.documentacion: tiene que ser una ruta absoluta/);
    });

    it("si antes era válido, el proceso conserva el último válido, avisa una sola vez y se recupera al arreglarlo", () => {
      const docs = carpetaTemporal("docs");
      const aviso = mock.method(console, "error", () => {});
      try {
        maquina({ version: 2, rutas: { documentacion: docs }, idiomaPorDefecto: "en" });
        assert.equal(requireBasePath(DOCS), docs);

        maquina("{ roto");
        assert.equal(requireBasePath(DOCS), docs, "las rutas siguen valiendo");
        assert.equal(leerVariable("DOCS_PATH").fuente, "machine.json");
        delete process.env.PHASE_GATE_LANG; // la suite la fija en es, y entonces ganaría a machine.json
        assert.equal(idiomaSinProyecto(), "en", "y el idioma también");
        assert.equal(maquinaVigente().deMemoria, true);
        assert.equal(aviso.mock.callCount(), 1, "el aviso sale una vez por error, no una vez por lectura");
        assert.match(String(aviso.mock.calls[0]!.arguments[0]), /machine\.json dejó de ser válido.*última lectura buena.*carácter inesperado/s);

        const otra = carpetaTemporal("otra");
        maquina({ version: 2, rutas: { documentacion: otra } });
        assert.equal(requireBasePath(DOCS), otra);
        assert.equal(maquinaVigente().deMemoria, false);
      } finally {
        aviso.mock.restore();
      }
    });

    it("el último válido es de una carpeta de configuración: otra carpeta, otro archivo roto, no lo hereda", () => {
      const docs = carpetaTemporal("docs");
      maquina({ version: 2, rutas: { documentacion: docs } });
      assert.equal(requireBasePath(DOCS), docs);

      configTemporal();
      maquina("{ roto");
      assert.throws(() => requireBasePath(DOCS), /Falta PHASE_GATE_DOCS_PATH/);
    });
  });
});
