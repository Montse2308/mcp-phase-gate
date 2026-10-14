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

  it("6 · read_central_doc a través de la misma junction (S4)", async () => {
    const respuesta = await debeRechazar(
      "read_central_doc",
      () => ({ project: "PROYECTO-A", task_name: "tarea-a", file_name: "enlace/secreto.env" }),
      /Acceso denegado/
    );
    assert.doesNotMatch(respuesta.texto, /no-debe-salir/);
  });
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

describe("e2e: usos legítimos que siguen funcionando", () => {
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
