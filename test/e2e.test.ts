// Pruebas de punta a punta: lanzan el servidor compilado por stdio y le hablan con el cliente
// del SDK, como lo haría Cursor o Claude Code. Es la superficie que ve el modelo, así que aquí
// se fijan los ataques del diagnóstico y los usos legítimos que no pueden romperse por cerrarlos.
//
// Cada caso monta su propio escenario en una carpeta temporal:
//   <raiz>/docs     la Documentación Central, con PROYECTO-A y dos tareas
//   <raiz>/fuera    lo que ningún ataque debe poder tocar
//   <raiz>/docs/PROYECTO-A/Proyectos/tarea-a/enlace  ->  <raiz>/fuera
//   <raiz>/repos    repoA con código y repoB con un .env que repoA no debe poder leer
// "No crean nada en disco" se comprueba comparando el árbol entero de <raiz> antes y después.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { carpetaTemporal, crearProyecto, crearSymlink, crearTarea } from "./helpers.js";

// Este archivo compila a build-test/test/; el servidor, a build-test/src/.
const SERVIDOR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");
const CONTEXTO_INICIAL = "00 - Contexto Inicial.md";

type Escenario = {
  raiz: string;
  docs: string;
  fuera: string;
  repos: string;
  tareaA: string;
  env: Record<string, string>;
};

function escenario(): Escenario {
  const raiz = carpetaTemporal("e2e");
  const docs = path.join(raiz, "docs");
  const fuera = path.join(raiz, "fuera");
  const repos = path.join(raiz, "repos");

  crearProyecto(docs, "PROYECTO-A");
  const tareaA = crearTarea(docs, "PROYECTO-A", "tarea-a", [CONTEXTO_INICIAL]);
  crearTarea(docs, "PROYECTO-A", "otra-tarea", [CONTEXTO_INICIAL]);
  fs.mkdirSync(fuera, { recursive: true });
  fs.writeFileSync(path.join(fuera, "secreto.env"), "CLAVE=no-debe-salir", "utf-8");
  fs.mkdirSync(path.join(repos, "repoA", "src"), { recursive: true });
  fs.writeFileSync(path.join(repos, "repoA", "src", "main.ts"), "export const hola = 1;", "utf-8");
  fs.mkdirSync(path.join(repos, "repoB"), { recursive: true });
  fs.writeFileSync(path.join(repos, "repoB", ".env"), "TOKEN=de-repo-b", "utf-8");
  crearSymlink(fuera, path.join(tareaA, "enlace"));

  return {
    raiz,
    docs,
    fuera,
    repos,
    tareaA,
    env: {
      ORQUESTADOR_DOCS_PATH: docs,
      ORQUESTADOR_REPOS_PATH: repos,
      ORQUESTADOR_TASKS_SUBDIR: "Proyectos",
      // El estado va aparte: no debe contar como "algo creado" dentro de <raiz>.
      ORQUESTADOR_STATE_PATH: carpetaTemporal("state"),
    },
  };
}

// Todas las rutas bajo `raiz`, relativas y ordenadas. No entra en los enlaces: lo que hay al
// otro lado ya está dentro de <raiz> y se recorre por su ruta real.
function arbol(raiz: string): string[] {
  const rutas: string[] = [];
  const recorrer = (carpeta: string): void => {
    for (const nombre of fs.readdirSync(carpeta)) {
      const ruta = path.join(carpeta, nombre);
      rutas.push(path.relative(raiz, ruta));
      const info = fs.lstatSync(ruta);
      if (info.isDirectory() && !info.isSymbolicLink()) recorrer(ruta);
    }
  };
  recorrer(raiz);
  return rutas.sort();
}

type Respuesta = { isError: boolean; texto: string };
type Llamar = (tool: string, args: Record<string, unknown>) => Promise<Respuesta>;

async function conServidor(env: Record<string, string>, prueba: (llamar: Llamar) => Promise<void>): Promise<void> {
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [SERVIDOR],
    env,
    stderr: "ignore",
  });
  const cliente = new Client({ name: "e2e", version: "0.0.0" });
  await cliente.connect(transporte);

  try {
    await prueba(async (tool, args) => {
      const resultado = await cliente.callTool({ name: tool, arguments: args });
      const contenido = (resultado.content ?? []) as Array<{ type: string; text?: string }>;
      return {
        isError: resultado.isError === true,
        texto: contenido.map((parte) => parte.text ?? "").join("\n"),
      };
    });
  } finally {
    await cliente.close();
  }
}

// Un ataque cerrado: la tool devuelve error, el mensaje dice por qué y el disco no cambia.
// `preparar` monta lo que el caso necesite antes de tomar la foto del disco.
async function debeRechazar(
  tool: string,
  args: (e: Escenario) => Record<string, unknown>,
  motivo: RegExp,
  preparar?: (e: Escenario) => void
): Promise<Respuesta> {
  const e = escenario();
  preparar?.(e);
  let respuesta: Respuesta = { isError: false, texto: "" };

  await conServidor(e.env, async (llamar) => {
    const antes = arbol(e.raiz);
    respuesta = await llamar(tool, args(e));
    // Recortado: si un caso de S9 falla, la respuesta es el megabyte entero.
    assert.equal(respuesta.isError, true, `debía fallar y respondió: ${respuesta.texto.slice(0, 200)}`);
    assert.match(respuesta.texto, motivo);
    assert.deepEqual(arbol(e.raiz), antes, "el ataque cambió el disco");
  });

  return respuesta;
}

describe("e2e: ataques de rutas (S1–S4)", () => {
  it("1 · start_task con task_name \"../../fuera\" (S1)", async () => {
    await debeRechazar(
      "start_task",
      () => ({ project: "PROYECTO-A", task_name: "../../fuera", initial_context: "x" }),
      /task_name/
    );
  });

  it("2 · start_task con project \"../fuera\" y crear_proyecto (S2)", async () => {
    await debeRechazar(
      "start_task",
      () => ({ project: "../fuera", task_name: "tarea-x", initial_context: "x", crear_proyecto: true }),
      /project/
    );
  });

  it("3 · write_central_doc con file_name \"../otra-tarea/x.md\": sale de la tarea sin salir de DOCS (S3)", async () => {
    await debeRechazar(
      "write_central_doc",
      () => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: "../otra-tarea/x.md", content: "x" }),
      /file_name/
    );
  });

  it("4 · write_central_doc con file_name absoluto (S3)", async () => {
    await debeRechazar(
      "write_central_doc",
      (e) => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: path.join(e.fuera, "absoluto.md"), content: "x" }),
      /file_name/
    );
  });

  it("5 · write_central_doc a través de una junction que apunta fuera de DOCS (S4)", async () => {
    await debeRechazar(
      "write_central_doc",
      () => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: "enlace/robado.md", content: "x" }),
      /Acceso denegado/
    );
  });

  // No sale de DOCS, pero creaba dentro un "CON" que el Explorador y OneDrive no pueden manejar.
  it("write_central_doc con un file_path que Windows no puede guardar (auditoría, hallazgo 1)", async () => {
    await debeRechazar("write_central_doc", () => ({ file_path: "PROYECTO-A/CON", content: "x" }), /file_path/);
  });

  it("6 · read_central_doc a través de la misma junction (S4)", async () => {
    const respuesta = await debeRechazar(
      "read_central_doc",
      () => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: "enlace/secreto.env" }),
      /Acceso denegado/
    );
    assert.doesNotMatch(respuesta.texto, /no-debe-salir/);
  });
});

// SEG-M: write_central_doc solo escribe dentro de la carpeta de una tarea que ya existe. Lo
// del proyecto (phase-gate.json, .phase-gate/) queda para el CLI y la UI.
const SOLO_EN_TAREA = /solo escribe dentro de la carpeta de una tarea que ya existe/;

describe("e2e: write_central_doc solo escribe dentro de una tarea (SEG-M)", () => {
  it("rechaza phase-gate.json del proyecto por file_path", async () => {
    await debeRechazar("write_central_doc", () => ({ file_path: "PROYECTO-A/phase-gate.json", content: "{}" }), SOLO_EN_TAREA);
  });

  it("rechaza un archivo en la raíz de la Documentación por file_path", async () => {
    await debeRechazar("write_central_doc", () => ({ file_path: "nota.md", content: "x" }), SOLO_EN_TAREA);
  });

  // Antes el mkdir recursivo creaba la carpeta y la tarea aparecía sin contexto inicial.
  it("rechaza una tarea que no existe sin crear su carpeta", async () => {
    let docs = "";
    await debeRechazar(
      "write_central_doc",
      () => ({ project: "PROYECTO-A", task_name: "no-existe", file_name: "01 - Análisis Técnico.md", content: "x" }),
      SOLO_EN_TAREA,
      (e) => {
        docs = e.docs;
      }
    );
    assert.equal(fs.existsSync(path.join(docs, "PROYECTO-A", "Proyectos", "no-existe")), false);

    await debeRechazar(
      "write_central_doc",
      () => ({ file_path: "PROYECTO-A/Proyectos/no-existe/01 - Análisis Técnico.md", content: "x" }),
      SOLO_EN_TAREA
    );
  });

  it("rechaza una carpeta con punto dentro de una tarea", async () => {
    await debeRechazar(
      "write_central_doc",
      () => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: ".phase-gate/estado.json", content: "{}" }),
      SOLO_EN_TAREA
    );
  });

  // Lo crearía una carpeta que list_tasks no ve y en la que write_central_doc no escribe.
  it("start_task rechaza un task_name que empieza por punto (E1-D1)", async () => {
    await debeRechazar(
      "start_task",
      () => ({ project: "PROYECTO-A", task_name: ".oculta", initial_context: "x" }),
      /task_name.*empezar por punto/s
    );
  });

  it("start_task rechaza estrenar un project que empieza por punto (E1-D1)", async () => {
    await debeRechazar(
      "start_task",
      () => ({ project: ".oculto", task_name: "tarea-x", initial_context: "x", crear_proyecto: true }),
      /project.*empezar por punto/s
    );
  });

  it("con la subcarpeta vacía, .phase-gate/ y .obsidian/ no aparecen en list_tasks", async () => {
    const e = escenario();
    fs.mkdirSync(path.join(e.docs, "PROYECTO-A", ".phase-gate"));
    fs.mkdirSync(path.join(e.docs, ".obsidian"));

    await conServidor({ ...e.env, ORQUESTADOR_TASKS_SUBDIR: "" }, async (llamar) => {
      const r = await llamar("list_tasks", {});
      assert.equal(r.isError, false, r.texto);
      assert.match(r.texto, /PROYECTO-A \(1\)/);
      assert.doesNotMatch(r.texto, /\.phase-gate/);
      assert.doesNotMatch(r.texto, /\.obsidian/);
    });
  });
});

// R4: las fases se declaran como en los prompts publicados y, en la 4, con la subcarpeta de
// recibos que llega en L07. Sin prompts al lado del servidor de build-test no habría fases.
function conFases(e: Escenario, documentos: string[]): void {
  const prompts = carpetaTemporal("prompts");
  const cabeceras: Array<[string, string]> = [
    ["fase-1-descubrimiento.md", "documento: 01 - Análisis Técnico.md\ndocumento_inicial: 00 - Contexto Inicial.md"],
    ["fase-2-decisiones.md", "documento: 02 - Decisiones.md"],
    ["fase-3-plan-tecnico.md", "documento: 03 - Plan Técnico.md"],
    ["fase-4-ejecucion.md", "documento: 04 - Ejecución.md\nrecibos: 04 - Ejecución"],
    ["fase-5-auditoria-pr.md", "documento: 05 - Auditoría.md"],
  ];
  for (const [archivo, cabecera] of cabeceras) {
    fs.writeFileSync(path.join(prompts, archivo), `---\n${cabecera}\n---\n\n# Fase\n`, "utf-8");
  }
  e.env.ORQUESTADOR_PROMPTS_PATH = prompts;

  for (const documento of documentos) {
    fs.writeFileSync(path.join(e.tareaA, documento), `original de ${documento}`, "utf-8");
  }
}

const D01 = "01 - Análisis Técnico.md";
const D02 = "02 - Decisiones.md";
const D03 = "03 - Plan Técnico.md";

describe("e2e: documentos congelados (R4)", () => {
  it("rechaza reescribir 01 cuando existe 02 y lo acepta con force: true", async () => {
    const e = escenario();
    conFases(e, [D01, D02]);
    const destino = { project: "PROYECTO-A", task_name: "tarea-a", file_name: D01 };

    await conServidor(e.env, async (llamar) => {
      const rechazo = await llamar("write_central_doc", { ...destino, content: "nuevo" });
      assert.equal(rechazo.isError, true, rechazo.texto);
      assert.match(rechazo.texto, /congelado: la Fase 2.*force: true/s);
      assert.equal(fs.readFileSync(path.join(e.tareaA, D01), "utf-8"), `original de ${D01}`);

      const forzado = await llamar("write_central_doc", { ...destino, content: "nuevo", force: true });
      assert.equal(forzado.isError, false, forzado.texto);
      assert.match(forzado.texto, /\(sobrescrito con force\)/);
      assert.equal(fs.readFileSync(path.join(e.tareaA, D01), "utf-8"), "nuevo");
    });
  });

  it("el contexto inicial no se reescribe sin force", async () => {
    await debeRechazar(
      "write_central_doc",
      () => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: CONTEXTO_INICIAL, content: "pisado" }),
      /contexto inicial está siempre protegido/,
      (e) => conFases(e, [])
    );
  });

  // Cuestionamiento B de la auditoría de la Etapa 1: al retomar, el modelo no tenía cómo
  // descubrir los recibos; ahora los nombra el servidor.
  it("get_phase_prompt nombra los recibos que ya existen en la tarea", async () => {
    const e = escenario();
    conFases(e, [D01, D02, D03]);
    fs.mkdirSync(path.join(e.tareaA, "04 - Ejecución"));
    fs.writeFileSync(path.join(e.tareaA, "04 - Ejecución", "L01 - rutas.md"), "recibo", "utf-8");

    await conServidor(e.env, async (llamar) => {
      const fase4 = await llamar("get_phase_prompt", { phase: 4, project: "PROYECTO-A", task_name: "tarea-a" });
      assert.equal(fase4.isError, false, fase4.texto);
      assert.match(fase4.texto, /RECIBOS QUE YA EXISTEN EN LA TAREA "tarea-a"[\s\S]*`04 - Ejecución\/L01 - rutas\.md`/);

      const fase3 = await llamar("get_phase_prompt", { phase: 3, project: "PROYECTO-A", task_name: "tarea-a" });
      assert.equal(fase3.texto.includes("RECIBOS QUE YA EXISTEN"), false);
    });
  });

  // Hallazgo 13 de la auditoría de la Etapa 1: force también crea el contexto cuando falta.
  it("crear el contexto con force responde 'creado', no 'sobrescrito'", async () => {
    const e = escenario();
    conFases(e, []);
    fs.rmSync(path.join(e.tareaA, CONTEXTO_INICIAL));
    const destino = { project: "PROYECTO-A", task_name: "tarea-a", file_name: "00 - contexto inicial.md", content: "nuevo" };

    await conServidor(e.env, async (llamar) => {
      const rechazo = await llamar("write_central_doc", destino);
      assert.equal(rechazo.isError, true, rechazo.texto);
      assert.match(rechazo.texto, /contexto inicial está siempre protegido/);

      const creado = await llamar("write_central_doc", { ...destino, file_name: CONTEXTO_INICIAL, force: true });
      assert.equal(creado.isError, false, creado.texto);
      assert.match(creado.texto, /\(creado con force\)/);
    });
  });

  it("escribe un recibo en la subcarpeta, y el recibo congela el plan", async () => {
    const e = escenario();
    conFases(e, [D01, D02, D03]);

    await conServidor(e.env, async (llamar) => {
      const recibo = await llamar("write_central_doc", { project: "PROYECTO-A", task_name: "tarea-a", file_name: "04 - Ejecución/L01 - rutas.md", content: "recibo" });
      assert.equal(recibo.isError, false, recibo.texto);
      assert.equal(fs.readFileSync(path.join(e.tareaA, "04 - Ejecución", "L01 - rutas.md"), "utf-8"), "recibo");

      const plan = await llamar("write_central_doc", { project: "PROYECTO-A", task_name: "tarea-a", file_name: D03, content: "otro plan" });
      assert.equal(plan.isError, true, plan.texto);
      assert.match(plan.texto, /congelado: la Fase 4/);
    });
  });

  // En Windows y macOS otro uso de mayúsculas abre el mismo archivo: no puede esquivar R4.
  it(
    "cambiar las mayúsculas del nombre no esquiva el congelamiento",
    { skip: process.platform === "linux" },
    async () => {
      await debeRechazar(
        "write_central_doc",
        () => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: "01 - análisis técnico.md", content: "pisado" }),
        /congelado/,
        (e) => conFases(e, [D01, D02])
      );
    }
  );
});

// Las dos tools de lectura comparten los límites: cada caso de S9 se prueba en ambas.
type Lector = {
  tool: string;
  ruta: (e: Escenario, nombre: string) => string;
  args: (nombre: string) => Record<string, unknown>;
};

const LECTORES: Lector[] = [
  {
    tool: "read_central_doc",
    ruta: (e, nombre) => path.join(e.tareaA, nombre),
    args: (nombre) => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: nombre }),
  },
  {
    tool: "read_cross_repo",
    ruta: (e, nombre) => path.join(e.repos, "repoA", nombre),
    args: (nombre) => ({ repo_name: "repoA", file_path: nombre }),
  },
];

const UN_MB = 1_048_576;

describe("e2e: lecturas acotadas a su repo y a su tamaño (S5, S9)", () => {
  it("read_cross_repo con repo_name \"repoA\" y file_path \"../repoB/.env\" (S5)", async () => {
    const respuesta = await debeRechazar(
      "read_cross_repo",
      () => ({ repo_name: "repoA", file_path: "../repoB/.env" }),
      /Acceso denegado/
    );
    assert.doesNotMatch(respuesta.texto, /de-repo-b/);
  });

  for (const lector of LECTORES) {
    it(`${lector.tool} rechaza un archivo de más de 1 MB (S9)`, async () => {
      await debeRechazar(lector.tool, () => lector.args("grande.md"), /límite/, (e) =>
        fs.writeFileSync(lector.ruta(e, "grande.md"), Buffer.alloc(UN_MB + 1, "a"))
      );
    });

    it(`${lector.tool} rechaza un archivo con byte NUL (S9)`, async () => {
      const respuesta = await debeRechazar(lector.tool, () => lector.args("binario.md"), /parece binario/, (e) =>
        fs.writeFileSync(lector.ruta(e, "binario.md"), Buffer.from("cabecera\u0000contenido-binario", "utf-8"))
      );
      assert.doesNotMatch(respuesta.texto, /contenido-binario/);
    });
  }
});

// Los mensajes se comprueban por subcadena —el campo entre comillas invertidas— y no enteros:
// en la Etapa 2 el SDK antepone su propio prefijo. Sin las comillas, "phase" casaría con el
// nombre de la tool, que ya va en el prefijo de todo error.
describe("e2e: argumentos validados antes de usarlos (S6)", () => {
  it("start_task sin task_name nombra el campo y no crea la tarea \"undefined\"", async () => {
    let docs = "";
    await debeRechazar(
      "start_task",
      () => ({ project: "PROYECTO-A", initial_context: "x" }),
      /`task_name`/,
      (e) => {
        docs = e.docs;
      }
    );
    assert.equal(fs.existsSync(path.join(docs, "PROYECTO-A", "Proyectos", "undefined")), false);
  });

  it("get_phase_prompt rechaza phase: \"abc\" nombrando el campo", async () => {
    await debeRechazar("get_phase_prompt", () => ({ phase: "abc" }), /`phase`/);
  });

  it("write_central_doc sin content no escribe \"undefined\"", async () => {
    await debeRechazar(
      "write_central_doc",
      () => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: "01 - Análisis Técnico.md" }),
      /`content`/
    );
  });

  // Se rechaza en vez de convertirlo: es raro, el modelo lo corrige al primer intento, y
  // convertirlo complicaría el JSON Schema que la Etapa 2 genera desde los shapes.
  it("get_phase_prompt rechaza un número en texto (phase: \"3\") diciendo qué espera", async () => {
    await debeRechazar("get_phase_prompt", () => ({ phase: "3" }), /`phase` debe ser un número, por ejemplo 3/);
  });

  // zod lo reporta como too_big y el mensaje salía en inglés.
  it("get_phase_prompt con un número enorme responde en español nombrando el campo", async () => {
    await debeRechazar("get_phase_prompt", () => ({ phase: 1e20 }), /`phase` es demasiado grande/);
  });

  it("un tipo equivocado también nombra el campo", async () => {
    await debeRechazar("read_cross_repo", () => ({ repo_name: 7, file_path: "src/main.ts" }), /`repo_name`/);
  });
});

// La carpeta prompts/ del repo: el servidor compilado en build-test/ no tiene una al lado.
const PROMPTS_DEL_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts");

describe("e2e: usos legítimos que siguen funcionando", () => {
  it("las tools de fase y de tarea aceptan sus argumentos de siempre", async () => {
    const e = escenario();
    await conServidor({ ...e.env, ORQUESTADOR_PROMPTS_PATH: PROMPTS_DEL_REPO }, async (llamar) => {
      const llamadas: Array<[string, Record<string, unknown>]> = [
        ["get_phase_prompt", { phase: 1 }],
        ["get_phase_prompt", { phase: 2, project: "PROYECTO-A", task_name: "tarea-a" }],
        ["get_active_task", {}],
        ["get_active_task", { project: "PROYECTO-A" }],
        ["list_tasks", {}],
        ["list_tasks", { project: "proyecto-a" }],
        ["switch_task", { project: "PROYECTO-A", task_name: "tarea-a" }],
      ];

      for (const [tool, args] of llamadas) {
        const r = await llamar(tool, args);
        assert.equal(r.isError, false, `${tool} ${JSON.stringify(args)}: ${r.texto.slice(0, 200)}`);
      }
    });
  });

  // §3.8 pedía comprobarlo por el servidor y no solo con loadPhasePrompt (hallazgo 11 de la
  // auditoría de la Etapa 1): es lo que de verdad le llega al modelo.
  it("get_phase_prompt entrega las cinco fases sin marcadores, en LF y con las reglas globales", async () => {
    const e = escenario();
    await conServidor({ ...e.env, ORQUESTADOR_PROMPTS_PATH: PROMPTS_DEL_REPO }, async (llamar) => {
      for (const phase of [1, 2, 3, 4, 5]) {
        const r = await llamar("get_phase_prompt", { phase });
        assert.equal(r.isError, false, `fase ${phase}: ${r.texto.slice(0, 200)}`);
        assert.equal(r.texto.includes("<!--"), false, `fase ${phase} entrega un comentario HTML`);
        assert.equal(r.texto.includes("\r"), false, `fase ${phase} entrega CRLF`);
        for (const encabezado of ["## BASE DE CADA DECISIÓN", "## PENDIENTES HEREDADOS"]) {
          assert.ok(r.texto.includes(`\n${encabezado}\n`), `fase ${phase}: falta ${encabezado}`);
        }
      }

      const fase4 = await llamar("get_phase_prompt", { phase: 4 });
      assert.match(fase4.texto, /Los recibos de lote van en la subcarpeta `04 - Ejecución\/`/);
    });
  });

  // Algunos clientes con modelos en modo estricto mandan null en todo campo opcional.
  it("null en un campo opcional cuenta como ausente: project: null responde igual que sin project", async () => {
    const e = escenario();
    await conServidor({ ...e.env, ORQUESTADOR_PROMPTS_PATH: PROMPTS_DEL_REPO }, async (llamar) => {
      const pares: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
        ["get_active_task", { project: null }, {}],
        ["list_tasks", { project: null }, {}],
        ["get_phase_prompt", { phase: 1, project: null, task_name: null }, { phase: 1 }],
      ];

      for (const [tool, conNull, sinCampo] of pares) {
        const a = await llamar(tool, conNull);
        const b = await llamar(tool, sinCampo);
        assert.equal(a.isError, false, `${tool} con null: ${a.texto.slice(0, 200)}`);
        assert.equal(a.texto, b.texto, tool);
      }
    });
  });

  it("una lectura normal funciona en las dos tools de lectura", async () => {
    const e = escenario();
    for (const lector of LECTORES) fs.writeFileSync(lector.ruta(e, "normal.md"), `leído por ${lector.tool}`, "utf-8");

    await conServidor(e.env, async (llamar) => {
      for (const lector of LECTORES) {
        const leido = await llamar(lector.tool, lector.args("normal.md"));
        assert.equal(leido.isError, false, leido.texto);
        assert.equal(leido.texto, `leído por ${lector.tool}`);
      }

      const codigo = await llamar("read_cross_repo", { repo_name: "repoA", file_path: "src/main.ts" });
      assert.equal(codigo.isError, false, codigo.texto);
      assert.equal(codigo.texto, "export const hola = 1;");
    });
  });

  it("start_task acepta espacios, acentos, ñ y paréntesis en el nombre", async () => {
    const e = escenario();
    await conServidor(e.env, async (llamar) => {
      for (const nombre of ["Exponer endpoints", "Tokens login", "Migración de Pagos (ñ)"]) {
        const r = await llamar("start_task", { project: "PROYECTO-A", task_name: nombre, initial_context: `contexto de ${nombre}` });
        assert.equal(r.isError, false, r.texto);
        const archivo = path.join(e.docs, "PROYECTO-A", "Proyectos", nombre, CONTEXTO_INICIAL);
        assert.equal(fs.readFileSync(archivo, "utf-8"), `contexto de ${nombre}`);
      }
    });
  });

  it("file_name con subcarpeta: \"04 - Ejecución/L01 - x.md\"", async () => {
    const e = escenario();
    await conServidor(e.env, async (llamar) => {
      const destino = { project: "PROYECTO-A", task_name: "tarea-a", file_name: "04 - Ejecución/L01 - x.md" };

      const escrito = await llamar("write_central_doc", { ...destino, content: "recibo L01" });
      assert.equal(escrito.isError, false, escrito.texto);
      assert.equal(fs.readFileSync(path.join(e.tareaA, "04 - Ejecución", "L01 - x.md"), "utf-8"), "recibo L01");

      const leido = await llamar("read_central_doc", destino);
      assert.equal(leido.isError, false, leido.texto);
      assert.equal(leido.texto, "recibo L01");
    });
  });

  it("file_path a un documento de una tarea que existe sigue valiendo", async () => {
    const e = escenario();
    await conServidor(e.env, async (llamar) => {
      const escrito = await llamar("write_central_doc", { file_path: "PROYECTO-A/Proyectos/tarea-a/01 - Análisis Técnico.md", content: "análisis" });
      assert.equal(escrito.isError, false, escrito.texto);
      assert.equal(fs.readFileSync(path.join(e.tareaA, "01 - Análisis Técnico.md"), "utf-8"), "análisis");
    });
  });

  it("un symlink interno de la Documentación sigue valiendo con file_path", async () => {
    const e = escenario();
    crearSymlink(e.tareaA, path.join(e.docs, "compartido"));

    await conServidor(e.env, async (llamar) => {
      const escrito = await llamar("write_central_doc", { file_path: "compartido/nota.md", content: "nota" });
      assert.equal(escrito.isError, false, escrito.texto);
      assert.equal(fs.readFileSync(path.join(e.tareaA, "nota.md"), "utf-8"), "nota");

      const leido = await llamar("read_central_doc", { file_path: "compartido/nota.md" });
      assert.equal(leido.isError, false, leido.texto);
      assert.equal(leido.texto, "nota");
    });
  });

  it("una raíz DOCS que es symlink sigue valiendo", async () => {
    const e = escenario();
    const docsEnlace = path.join(e.raiz, "docs-enlace");
    crearSymlink(e.docs, docsEnlace);

    await conServidor({ ...e.env, ORQUESTADOR_DOCS_PATH: docsEnlace }, async (llamar) => {
      const creada = await llamar("start_task", { project: "PROYECTO-A", task_name: "tarea-nueva", initial_context: "x" });
      assert.equal(creada.isError, false, creada.texto);

      const destino = { project: "PROYECTO-A", task_name: "tarea-nueva", file_name: "01 - Análisis Técnico.md" };
      const escrito = await llamar("write_central_doc", { ...destino, content: "análisis" });
      assert.equal(escrito.isError, false, escrito.texto);

      const leido = await llamar("read_central_doc", destino);
      assert.equal(leido.isError, false, leido.texto);
      assert.equal(leido.texto, "análisis");
      assert.ok(fs.existsSync(path.join(e.docs, "PROYECTO-A", "Proyectos", "tarea-nueva", "01 - Análisis Técnico.md")));
    });
  });
});
