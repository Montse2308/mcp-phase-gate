// Los mensajes del servidor en los dos idiomas (§8.5 del plan maestro v3): todo código tiene su texto en
// español y en inglés, ningún código se repite, todo código que usa el código fuente existe, y el idioma
// sale de donde dice el plan (el proyecto de la llamada, PHASE_GATE_LANG, el sistema).

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { fijarLocaleDelSistema, fijarRaizDelPaquete } from "../src/config.js";
import { CATALOGOS, conContextoDeMensajes, enIdioma, existeMensaje, fijarIdiomaDeMensajes, idiomaDeMensajes, mensaje } from "../src/i18n/mensajes.js";
import { conectar, textoDe } from "./cliente.js";
import { crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

afterEach(() => {
  limpiarEntorno();
  fijarLocaleDelSistema(null);
  fijarRaizDelPaquete(null);
});

function archivosDe(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivosDe(path.join(carpeta, e.name)) : e.name.endsWith(".ts") ? [path.join(carpeta, e.name)] : []));
}

describe("catálogo de mensajes", () => {
  it("todo código tiene texto en español y en inglés, del mismo tipo, y no se repite entre catálogos", () => {
    const vistos = new Map<string, string>();
    let total = 0;
    for (const [nombre, catalogo] of Object.entries(CATALOGOS)) {
      for (const [codigo, textos] of Object.entries(catalogo)) {
        total++;
        assert.ok(!vistos.has(codigo), `${codigo} está en ${vistos.get(codigo)} y en ${nombre}`);
        vistos.set(codigo, nombre);
        assert.match(codigo, /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/, `${nombre}: código mal formado «${codigo}»`);
        for (const idioma of ["es", "en"] as const) {
          const texto = textos[idioma];
          assert.ok(typeof texto === "function" || (typeof texto === "string" && texto.trim() !== ""), `${codigo}: falta el texto en ${idioma}`);
        }
        assert.equal(typeof textos.es, typeof textos.en, `${codigo}: un idioma es texto fijo y el otro, función`);
        if (typeof textos.es === "function") assert.equal(textos.es.length, textos.en.length, `${codigo}: los dos idiomas reciben los mismos parámetros`);
      }
    }
    assert.ok(total >= 200, `${total} códigos`);
  });

  it("un texto fijo en inglés no es el mismo que en español (salvo los que no tienen palabras)", () => {
    // Palabras que se escriben igual en los dos idiomas.
    const MISMA_PALABRA = new Set(["Variables", "Prompts"]);
    const iguales: string[] = [];
    for (const catalogo of Object.values(CATALOGOS)) {
      for (const [codigo, { es, en }] of Object.entries(catalogo)) {
        if (typeof es === "string" && es === en && /[a-záéíóúñ]{4,}/i.test(es) && !MISMA_PALABRA.has(es)) iguales.push(codigo);
      }
    }
    assert.deepEqual(iguales, []);
  });

  it("todo código que el código fuente pide con mensaje() o fallo() existe", () => {
    const pedidos = new Set<string>();
    for (const archivo of archivosDe(path.join(RAIZ, "src"))) {
      // mensaje(), fallo() y los atajos locales que solo fijan el idioma (t, texto, descripcion).
      for (const m of fs.readFileSync(archivo, "utf-8").matchAll(/\b(?:mensaje|fallo|t|texto|descripcion|columnas|ErrorConCodigo)\(\s*"([A-Z][A-Z0-9-]+)"/g)) pedidos.add(m[1]!);
    }
    assert.ok(pedidos.size >= 150, `${pedidos.size} códigos pedidos`);
    assert.deepEqual([...pedidos].filter((c) => !existeMensaje(c)).sort(), []);
  });

  it("un código que no existe se dice con su nombre, no con un texto vacío", () => {
    assert.equal(mensaje("NO-EXISTE-NUNCA", { a: 1 }), '[NO-EXISTE-NUNCA] {"a":1}');
  });
});

describe("el idioma de los mensajes", () => {
  it("fuera de una llamada: PHASE_GATE_LANG y, si no, el sistema", () => {
    process.env.PHASE_GATE_LANG = "en";
    assert.equal(idiomaDeMensajes(), "en");
    delete process.env.PHASE_GATE_LANG;
    fijarLocaleDelSistema("es-MX");
    assert.equal(idiomaDeMensajes(), "es");
    fijarLocaleDelSistema("de-DE");
    assert.equal(idiomaDeMensajes(), "en");
  });

  it("dentro de una llamada, el del proyecto en cuanto se fija, también en lo que espera (async)", async () => {
    process.env.PHASE_GATE_LANG = "es";
    await conContextoDeMensajes(async () => {
      assert.equal(idiomaDeMensajes(), "es");
      fijarIdiomaDeMensajes("en");
      await new Promise((r) => setTimeout(r, 5));
      assert.equal(idiomaDeMensajes(), "en");
    });
    assert.equal(idiomaDeMensajes(), "es", "al salir de la llamada vuelve al del entorno");
    assert.equal(enIdioma("en", () => idiomaDeMensajes()), "en");
  });
});

describe("las tools en los dos idiomas", () => {
  function instalacion(): string {
    fijarRaizDelPaquete(RAIZ);
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "P");
    return docs;
  }

  it("PHASE_GATE_LANG cambia títulos y descripciones de las tools y de sus parámetros; los nombres no cambian", async () => {
    instalacion();
    const lista = async (idioma: string) => {
      process.env.PHASE_GATE_LANG = idioma;
      const { cliente, cerrar } = await conectar();
      try {
        return (await cliente.listTools()).tools;
      } finally {
        await cerrar();
      }
    };
    const es = await lista("es");
    const en = await lista("en");
    assert.deepEqual(en.map((t) => t.name), es.map((t) => t.name));
    for (const [i, tool] of en.entries()) {
      assert.notEqual(tool.description, es[i]!.description, `${tool.name}: la descripción no cambió`);
      assert.notEqual(tool.title, es[i]!.title, `${tool.name}: el título no cambió`);
      const propiedades = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      const delEs = (es[i]!.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      assert.deepEqual(Object.keys(propiedades), Object.keys(delEs), `${tool.name}: mismos parámetros`);
      for (const [nombre, p] of Object.entries(propiedades)) {
        if (p.description) assert.notEqual(p.description, delEs[nombre]!.description, `${tool.name}.${nombre}`);
      }
    }
    const start = en.find((t) => t.name === "start_task")!;
    assert.ok("create_project" in (start.inputSchema.properties ?? {}), "create_project es un parámetro");
  });

  it("un error sin proyecto sale en el idioma de PHASE_GATE_LANG", async () => {
    instalacion();
    for (const [idioma, patron] of [["es", /No existe el proyecto/], ["en", /does not exist|doesn't exist|No project/i]] as const) {
      process.env.PHASE_GATE_LANG = idioma;
      const { cliente, cerrar } = await conectar();
      try {
        const r = await cliente.callTool({ name: "switch_task", arguments: { project: "NINGUNO", task_name: "t" } });
        assert.equal(r.isError, true);
        assert.match(textoDe(r), patron, textoDe(r));
      } finally {
        await cerrar();
      }
    }
  });

  it("con un proyecto en inglés, sus errores salen en inglés aunque PHASE_GATE_LANG diga es", async () => {
    const docs = instalacion();
    crearTarea(docs, "P", "t", ["00 - Initial Context.md"]);
    fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, idioma: "en" }));
    process.env.PHASE_GATE_LANG = "es";
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "switch_task", arguments: { project: "P", task_name: "no-existe" } });
      assert.equal(r.isError, true);
      assert.doesNotMatch(textoDe(r), /No existe la tarea/);
      assert.match(textoDe(r), /no-existe/);
    } finally {
      await cerrar();
    }
  });

  it("create_project vale como alias de crear_proyecto", async () => {
    const docs = instalacion();
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "start_task", arguments: { project: "NUEVO", task_name: "t", initial_context: "x", create_project: true } });
      assert.equal(r.isError, undefined, textoDe(r));
      assert.ok(fs.existsSync(path.join(docs, "NUEVO", "Proyectos", "t")));
      const doble = await cliente.callTool({ name: "start_task", arguments: { project: "OTRO", task_name: "t", initial_context: "x", create_project: true, crear_proyecto: false } });
      assert.equal(doble.isError, true, "los dos con valores distintos es un error");
    } finally {
      await cerrar();
    }
  });
});

describe("record_batch con valores en inglés", () => {
  it("`estado` y los títulos de `condicionales` en inglés se normalizan a los canónicos", async () => {
    const { normalizarEntradaDeLote } = await import("../src/servidor.js");
    const enIngles = { lote: 1, estado: "with pending items", condicionales: [{ titulo: "Debt noted", texto: "x" }, { titulo: "Reversión", texto: "y" }] };
    const entrada = normalizarEntradaDeLote(enIngles);
    assert.equal(entrada.estado, "con pendientes");
    assert.deepEqual(entrada.condicionales?.map((c) => c.titulo), ["Deuda anotada", "Reversión"]);
    const sinEstado: { lote: number; estado?: string } = { lote: 1 };
    assert.equal(normalizarEntradaDeLote(sinEstado).estado, undefined);
  });
});
