// El servidor entero, en memoria: crearServidor() conectado a un cliente del SDK por un
// transporte en memoria, sin lanzar procesos. Los E2E (e2e.test.ts) siguen probando el binario
// por stdio; aquí se prueba lo que solo existe desde la migración a McpServer.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { PromptListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

import { z } from "zod";

import type { Diagnostico } from "../src/diagnostico.js";
import { diagnosticoShape } from "../src/schemas.js";
import { conectar } from "./cliente.js";
import { crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno, promptsTemporales } from "./helpers.js";

afterEach(limpiarEntorno);

// Las 8 de siempre más get_orchestrator_status, que llega en la Etapa 2.
const TOOLS = [
  "get_active_task",
  "get_orchestrator_status",
  "get_phase_prompt",
  "list_tasks",
  "read_central_doc",
  "read_cross_repo",
  "start_task",
  "switch_task",
  "write_central_doc",
];

describe("tools/list", () => {
  it("devuelve las 8 tools de siempre y get_orchestrator_status, cada una con sus cuatro anotaciones y openWorldHint false", async () => {
    const { cliente, cerrar } = await conectar();
    try {
      const { tools } = await cliente.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), TOOLS);

      for (const tool of tools) {
        const a = tool.annotations ?? {};
        assert.equal(typeof a.title, "string", tool.name);
        assert.equal(typeof a.readOnlyHint, "boolean", tool.name);
        assert.equal(typeof a.destructiveHint, "boolean", tool.name);
        assert.equal(typeof a.idempotentHint, "boolean", tool.name);
        assert.equal(a.openWorldHint, false, tool.name);
        assert.equal(tool.title, a.title, tool.name);
      }
    } finally {
      await cerrar();
    }
  });

  it("solo write_central_doc es destructiva, y las de lectura son de solo lectura", async () => {
    const { cliente, cerrar } = await conectar();
    try {
      const { tools } = await cliente.listTools();
      const porNombre = new Map(tools.map((t) => [t.name, t.annotations ?? {}]));

      assert.deepEqual(
        tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name),
        ["write_central_doc"]
      );
      for (const nombre of ["get_phase_prompt", "get_active_task", "list_tasks", "read_central_doc", "read_cross_repo", "get_orchestrator_status"]) {
        assert.equal(porNombre.get(nombre)?.readOnlyHint, true, nombre);
      }
      assert.equal(porNombre.get("start_task")?.idempotentHint, false);
      assert.equal(porNombre.get("switch_task")?.idempotentHint, true);
      assert.equal(porNombre.get("switch_task")?.readOnlyHint, false);
    } finally {
      await cerrar();
    }
  });

  // Las descripciones se armaban al arrancar con la lista de proyectos y se quedaban viejas.
  it("ninguna descripción nombra un proyecto, aunque existan", async () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-SECRETO");
    crearTarea(docs, "PROYECTO-SECRETO", "tarea-secreta");

    const { cliente, cerrar } = await conectar();
    try {
      const { tools } = await cliente.listTools();
      const texto = JSON.stringify(tools);
      assert.equal(texto.includes("PROYECTO-SECRETO"), false);
      assert.equal(texto.includes("tarea-secreta"), false);
    } finally {
      await cerrar();
    }
  });

  it("el JSON Schema de cada tool conserva los obligatorios y las descripciones de sus campos", async () => {
    const { cliente, cerrar } = await conectar();
    try {
      const { tools } = await cliente.listTools();
      const porNombre = new Map(tools.map((t) => [t.name, t.inputSchema]));

      assert.deepEqual([...(porNombre.get("start_task")?.required ?? [])].sort(), ["initial_context", "project", "task_name"]);
      assert.deepEqual(porNombre.get("write_central_doc")?.required, ["content"]);
      assert.deepEqual(porNombre.get("get_phase_prompt")?.required, ["phase"]);

      for (const [nombre, schema] of porNombre) {
        for (const [campo, propiedad] of Object.entries(schema.properties ?? {})) {
          assert.equal(typeof (propiedad as { description?: unknown }).description, "string", `${nombre}.${campo}`);
        }
      }
    } finally {
      await cerrar();
    }
  });
});

describe("llamadas", () => {
  it("un argumento que falta devuelve isError con el mensaje en español que nombra el campo", async () => {
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "start_task", arguments: { project: "X", initial_context: "y" } });
      assert.equal(r.isError, true);
      assert.match(JSON.stringify(r.content), /Falta `task_name`/);
    } finally {
      await cerrar();
    }
  });

  it("un Error lanzado en la tool llega como isError con su mensaje", async () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");

    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "switch_task", arguments: { project: "PROYECTO-A", task_name: "no-existe" } });
      assert.equal(r.isError, true);
      assert.match(JSON.stringify(r.content), /No existe la tarea \\"no-existe\\" en PROYECTO-A/);
    } finally {
      await cerrar();
    }
  });

  it("el servidor declara la capacidad logging", async () => {
    const { cliente, cerrar } = await conectar();
    try {
      assert.ok(cliente.getServerCapabilities()?.logging);
    } finally {
      await cerrar();
    }
  });
});

describe("get_orchestrator_status", () => {
  it("devuelve el Markdown con las secciones del diagnóstico y structuredContent que valida contra el outputSchema", async () => {
    const docs = docsTemporales();
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");

    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "get_orchestrator_status", arguments: {} });
      assert.notEqual(r.isError, true, JSON.stringify(r.content));

      const texto = (r.content as { type: string; text: string }[])[0]!.text;
      for (const seccion of ["Variables", "Estado", "Prompts", "Proyectos", "Hallazgos"]) {
        assert.match(texto, new RegExp(`^### ${seccion}$`, "m"));
      }

      // El SDK ya la validó antes de enviarla; aquí se comprueba también del lado del cliente.
      const estructurado = z.object(diagnosticoShape).parse(r.structuredContent);
      assert.deepEqual(estructurado.proyectos.map((p) => p.nombre), ["PROYECTO-A"]);
    } finally {
      await cerrar();
    }
  });

  it("incluye el cliente conectado y sus capacidades", async () => {
    estadoTemporal();

    const { cliente, cerrar } = await conectar({ elicitation: {} });
    try {
      const r = await cliente.callTool({ name: "get_orchestrator_status", arguments: {} });
      const estructurado = z.object(diagnosticoShape).parse(r.structuredContent);
      assert.deepEqual(estructurado.cliente, {
        nombre: "cliente-de-prueba",
        version: "1.0.0",
        capacidades: { elicitation: true, roots: false },
      });
      assert.match((r.content as { text: string }[])[0]!.text, /cliente-de-prueba 1\.0\.0 · elicitation: sí · roots: no/);
    } finally {
      await cerrar();
    }
  });

  // Diagnosticar una instalación rota es justo para lo que existe: no puede fallar por eso.
  it("sin nada configurado no es un error: los VAR-FALTA van en los hallazgos", async () => {
    estadoTemporal();

    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "get_orchestrator_status", arguments: {} });
      assert.notEqual(r.isError, true);
      const estructurado = z.object(diagnosticoShape).parse(r.structuredContent);
      assert.ok(estructurado.hallazgos.some((h) => h.codigo === "VAR-FALTA"));
    } finally {
      await cerrar();
    }
  });

  it("anuncia su outputSchema en tools/list", async () => {
    const { cliente, cerrar } = await conectar();
    try {
      const { tools } = await cliente.listTools();
      const tool = tools.find((t) => t.name === "get_orchestrator_status");
      assert.equal(tool?.outputSchema?.type, "object");
      assert.ok(tool?.outputSchema?.properties?.hallazgos);
    } finally {
      await cerrar();
    }
  });
});

// Si diagnostico.ts y el outputSchema se separan, esto deja de compilar.
const _diagnosticoCuadra: z.input<z.ZodObject<typeof diagnosticoShape>> = {} as Diagnostico;
void _diagnosticoCuadra;

describe("MCP Prompts /fN", () => {
  const PROMPTS_DEL_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts");
  const comandoDelRepo = (numero: number): string =>
    fs.readFileSync(path.join(PROMPTS_DEL_REPO, "comandos", `f${numero}.md`), "utf-8").replace(/\r\n/g, "\n").trim();
  const esperar = () => new Promise((resolver) => setImmediate(resolver));

  function textoDelPrompt(resultado: { messages: { content: unknown }[] }): string {
    return (resultado.messages[0]!.content as { type: string; text: string }).text;
  }

  it("prompts/list devuelve f1…f5 con su título de fase", async () => {
    estadoTemporal();
    process.env.PHASE_GATE_PROMPTS_PATH = PROMPTS_DEL_REPO;

    const { cliente, cerrar } = await conectar();
    try {
      const { prompts } = await cliente.listPrompts();
      assert.deepEqual(prompts.map((p) => p.name), ["f1", "f2", "f3", "f4", "f5"]);
      assert.equal(prompts.find((p) => p.name === "f4")?.title, "Fase 4 · Ejecución");
      assert.equal(prompts.find((p) => p.name === "f4")?.description, "Arranca la Fase 4 (Ejecución) del flujo de mcp-phase-gate.");
      assert.deepEqual(prompts.find((p) => p.name === "f1")?.arguments?.map((a) => [a.name, a.required ?? false]), [
        ["project", false],
        ["task_name", false],
        ["contexto", false],
      ]);
      assert.deepEqual(prompts.find((p) => p.name === "f5")?.arguments?.map((a) => a.name), ["project", "commits"]);
    } finally {
      await cerrar();
    }
  });

  it("prompts/get de f1 con argumentos devuelve el comando y los Datos de esta invocación", async () => {
    estadoTemporal();
    process.env.PHASE_GATE_PROMPTS_PATH = PROMPTS_DEL_REPO;

    const { cliente, cerrar } = await conectar();
    try {
      const resultado = await cliente.getPrompt({
        name: "f1",
        arguments: { project: "PROYECTO-A", task_name: "login", contexto: "El correo\ncon dos líneas" },
      });
      assert.equal(resultado.messages.length, 1);
      assert.equal(resultado.messages[0]!.role, "user");
      assert.equal(
        textoDelPrompt(resultado),
        `${comandoDelRepo(1)}\n\n## Datos de esta invocación\n- project: PROYECTO-A\n- task_name: login\n- initial_context:\n\nEl correo\ncon dos líneas`
      );
    } finally {
      await cerrar();
    }
  });

  it("sin argumentos, el prompt es el comando tal cual, sin la sección de datos", async () => {
    estadoTemporal();
    process.env.PHASE_GATE_PROMPTS_PATH = PROMPTS_DEL_REPO;

    const { cliente, cerrar } = await conectar();
    try {
      assert.equal(textoDelPrompt(await cliente.getPrompt({ name: "f3" })), comandoDelRepo(3));
      const f5 = textoDelPrompt(await cliente.getPrompt({ name: "f5", arguments: { commits: "abc123..def456" } }));
      assert.ok(f5.endsWith("## Datos de esta invocación\n- commits: abc123..def456"), f5);
    } finally {
      await cerrar();
    }
  });

  it("una fase-6 en una capa propia aparece, con texto genérico, y emite prompts/list_changed; al quitarla desaparece", async () => {
    estadoTemporal();
    const capa = promptsTemporales({ "fase-1-uno.md": "---\ndocumento: 01.md\n---\n# Uno\n" });

    const { cliente, cerrar } = await conectar();
    let avisos = 0;
    cliente.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
      avisos++;
    });

    try {
      assert.deepEqual((await cliente.listPrompts()).prompts.map((p) => p.name), ["f1"]);

      fs.writeFileSync(path.join(capa, "fase-6-extra.md"), "---\ndocumento: 06.md\n---\n# Extra\n", "utf-8");
      await cliente.callTool({ name: "get_orchestrator_status", arguments: {} });
      await esperar();

      assert.ok(avisos >= 1, "debía emitir prompts/list_changed");
      const { prompts } = await cliente.listPrompts();
      assert.deepEqual(prompts.map((p) => p.name), ["f1", "f6"]);
      assert.equal(prompts.find((p) => p.name === "f6")?.title, "Fase 6 · Extra");

      const f6 = textoDelPrompt(await cliente.getPrompt({ name: "f6", arguments: { project: "PROYECTO-A" } }));
      assert.match(f6, /^Vas a iniciar la FASE 6 \(Extra\) del flujo del mcp-phase-gate\./);
      assert.match(f6, /get_phase_prompt\(6\)/);
      assert.ok(f6.endsWith("## Datos de esta invocación\n- project: PROYECTO-A"));

      fs.rmSync(path.join(capa, "fase-6-extra.md"));
      await cliente.callTool({ name: "get_orchestrator_status", arguments: {} });
      assert.deepEqual((await cliente.listPrompts()).prompts.map((p) => p.name), ["f1"]);
    } finally {
      await cerrar();
    }
  });

  it("un comandos/fN.md propio gana al texto genérico, y cambiar el título de la fase actualiza el prompt", async () => {
    estadoTemporal();
    const capa = promptsTemporales({ "fase-1-uno.md": "---\ndocumento: 01.md\n---\n# Uno\n" });
    fs.mkdirSync(path.join(capa, "comandos"));
    fs.writeFileSync(path.join(capa, "comandos", "f1.md"), "---\nnota: se quita\n---\nMi comando propio\r\n", "utf-8");

    const { cliente, cerrar } = await conectar();
    try {
      assert.equal(textoDelPrompt(await cliente.getPrompt({ name: "f1" })), "Mi comando propio");

      fs.writeFileSync(path.join(capa, "fase-1-uno.md"), "---\ndocumento: 01.md\n---\n# Uno renombrada\n", "utf-8");
      await cliente.callTool({ name: "list_tasks", arguments: {} });
      assert.equal((await cliente.listPrompts()).prompts[0]?.title, "Fase 1 · Uno renombrada");
    } finally {
      await cerrar();
    }
  });

  // La capacidad prompts solo se puede declarar antes de conectar.
  it("sin ninguna fase al arrancar, una que aparece después se registra sin error", async () => {
    estadoTemporal();
    const capa = promptsTemporales({});

    const { cliente, cerrar } = await conectar();
    try {
      assert.ok(cliente.getServerCapabilities()?.prompts);
      assert.deepEqual((await cliente.listPrompts()).prompts, []);

      fs.writeFileSync(path.join(capa, "fase-1-uno.md"), "# Uno\n", "utf-8");
      await cliente.callTool({ name: "list_tasks", arguments: {} });
      assert.deepEqual((await cliente.listPrompts()).prompts.map((p) => p.name), ["f1"]);
    } finally {
      await cerrar();
    }
  });
});
