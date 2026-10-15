// Los recursos phase-gate://, por el protocolo: qué se lista, qué se lee y qué se rechaza. Los
// rechazos son los mismos ataques de ruta que ya cierra read_central_doc, ahora con la
// codificación porcentual de un URI de por medio.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ResourceListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

import { LIMITE_LECTURA_BYTES } from "../src/paths.js";
import { guardarPuntero } from "../src/tasks.js";
import { conectar } from "./cliente.js";
import { carpetaTemporal, crearProyecto, crearSymlink, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

afterEach(limpiarEntorno);

const PROMPTS_DEL_REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts", "es");
const CONTEXTO = "00 - Contexto Inicial.md";
const ANALISIS = "01 - Análisis Técnico.md";
const RECIBOS = "04 - Ejecución";

// PROYECTO-A con dos tareas: "Tokens login" (la activa, con documentos y un recibo) y "otra".
function escenario(): { docs: string; activa: string; otra: string } {
  const docs = docsTemporales();
  estadoTemporal();
  process.env.PHASE_GATE_PROMPTS_PATH = PROMPTS_DEL_REPO;

  crearProyecto(docs, "PROYECTO-A");
  const activa = crearTarea(docs, "PROYECTO-A", "Tokens login", [CONTEXTO, ANALISIS]);
  const otra = crearTarea(docs, "PROYECTO-A", "otra", [CONTEXTO]);
  fs.mkdirSync(path.join(activa, RECIBOS));
  fs.writeFileSync(path.join(activa, RECIBOS, "L01 - filtro.md"), "recibo del lote 1", "utf-8");
  guardarPuntero("PROYECTO-A", "Tokens login");

  return { docs, activa, otra };
}

const URI_ANALISIS = "phase-gate://tareas/PROYECTO-A/Tokens%20login/01%20-%20An%C3%A1lisis%20T%C3%A9cnico.md";
const URI_RECIBO = "phase-gate://tareas/PROYECTO-A/Tokens%20login/recibos/L01%20-%20filtro.md";

// Lo que responde el servidor a una lectura que debe fallar: el mensaje del error.
async function errorAlLeer(leer: () => Promise<unknown>): Promise<string> {
  try {
    await leer();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  assert.fail("la lectura debía fallar");
}

describe("resources/list", () => {
  it("lista estado, fases y los documentos existentes de la tarea activa, y nada de las demás", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const { resources } = await cliente.listResources();
      const uris = resources.map((r) => r.uri);

      assert.ok(uris.includes("phase-gate://estado"));
      assert.ok(uris.includes("phase-gate://fases"));
      assert.ok(uris.includes("phase-gate://tareas/PROYECTO-A/Tokens%20login/00%20-%20Contexto%20Inicial.md"));
      assert.ok(uris.includes(URI_ANALISIS));
      assert.ok(uris.includes(URI_RECIBO));
      assert.equal(uris.some((uri) => uri.includes("/otra/")), false);
      // 02 - Decisiones.md no existe todavía: no se lista.
      assert.equal(uris.some((uri) => uri.includes("Decisiones")), false);
    } finally {
      await cerrar();
    }
  });

  it("cada documento listado lleva audiencia y fecha de modificación", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const { resources } = await cliente.listResources();
      const analisis = resources.find((r) => r.uri === URI_ANALISIS);

      assert.equal(analisis?.mimeType, "text/markdown");
      assert.deepEqual(analisis?.annotations?.audience, ["assistant", "user"]);
      assert.ok(!Number.isNaN(Date.parse(analisis?.annotations?.lastModified ?? "")));
    } finally {
      await cerrar();
    }
  });

  it("sin Documentación configurada, lista solo los dos recursos fijos y no falla", async () => {
    estadoTemporal();
    const { cliente, cerrar } = await conectar();
    try {
      const { resources } = await cliente.listResources();
      assert.deepEqual(resources.map((r) => r.uri).sort(), ["phase-gate://estado", "phase-gate://fases"]);
    } finally {
      await cerrar();
    }
  });

  it("anuncia las dos plantillas", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const { resourceTemplates } = await cliente.listResourceTemplates();
      assert.deepEqual(resourceTemplates.map((t) => t.uriTemplate).sort(), [
        "phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo}",
        "phase-gate://tareas/{proyecto}/{tarea}/{documento}",
      ]);
    } finally {
      await cerrar();
    }
  });
});

describe("resources/read", () => {
  it("lee un documento con espacios y acentos en el URI", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const { contents } = await cliente.readResource({ uri: URI_ANALISIS });
      assert.equal((contents[0] as { text: string }).text, `contenido de ${ANALISIS}`);
      assert.equal(contents[0]!.mimeType, "text/markdown");
    } finally {
      await cerrar();
    }
  });

  it("lee un documento de una tarea que no es la activa, por plantilla", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const { contents } = await cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/otra/00%20-%20Contexto%20Inicial.md" });
      assert.equal((contents[0] as { text: string }).text, `contenido de ${CONTEXTO}`);
    } finally {
      await cerrar();
    }
  });

  it("lee un recibo de la subcarpeta que declara la Fase 4", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const { contents } = await cliente.readResource({ uri: URI_RECIBO });
      assert.equal((contents[0] as { text: string }).text, "recibo del lote 1");
    } finally {
      await cerrar();
    }
  });

  it("lee el estado y la tabla de fases", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const estado = await cliente.readResource({ uri: "phase-gate://estado" });
      assert.match((estado.contents[0] as { text: string }).text, /^### Variables$/m);

      const fases = await cliente.readResource({ uri: "phase-gate://fases" });
      assert.match((fases.contents[0] as { text: string }).text, /^\| 4 \| Ejecución \| `04 - Ejecución\.md` \| `04 - Ejecución\/` \|/m);
    } finally {
      await cerrar();
    }
  });

  it("rechaza %2E%2E, que la normalización del URI deja sin plantilla que encaje", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      await errorAlLeer(() => cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/%2E%2E" }));
      await errorAlLeer(() => cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/%2E%2E/x.md" }));
    } finally {
      await cerrar();
    }
  });

  it("rechaza un %2F decodificado a / en el documento y en la tarea", async () => {
    const { docs } = escenario();
    fs.writeFileSync(path.join(docs, "fuera.md"), "no debe salir", "utf-8");
    const { cliente, cerrar } = await conectar();
    try {
      const enDocumento = await errorAlLeer(() =>
        cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/..%2F..%2F..%2Ffuera.md" })
      );
      assert.match(enDocumento, /no puede llevar \/ ni \\/);

      const enTarea = await errorAlLeer(() =>
        cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/..%2F..%2F/fuera.md" })
      );
      assert.match(enTarea, /no puede llevar \/ ni \\/);
    } finally {
      await cerrar();
    }
  });

  it("rechaza archivos con punto inicial", async () => {
    const { activa } = escenario();
    fs.writeFileSync(path.join(activa, ".oculto.md"), "secreto", "utf-8");
    const { cliente, cerrar } = await conectar();
    try {
      const mensaje = await errorAlLeer(() =>
        cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/.oculto.md" })
      );
      assert.match(mensaje, /empiezan por punto/);
    } finally {
      await cerrar();
    }
  });

  it("rechaza un archivo de más de 1 MB", async () => {
    const { activa } = escenario();
    fs.writeFileSync(path.join(activa, "grande.md"), "x".repeat(LIMITE_LECTURA_BYTES + 1), "utf-8");
    const { cliente, cerrar } = await conectar();
    try {
      const mensaje = await errorAlLeer(() =>
        cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/grande.md" })
      );
      assert.match(mensaje, /límite de lectura es 1 MB/);
    } finally {
      await cerrar();
    }
  });

  it("rechaza una codificación porcentual inválida", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const mensaje = await errorAlLeer(() =>
        cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/mal%E0%A4%A.md" })
      );
      assert.match(mensaje, /URI mal codificada/);
    } finally {
      await cerrar();
    }
  });

  it("un documento o un proyecto que no existen dicen cuál falta", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      assert.match(
        await errorAlLeer(() => cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/no-existe.md" })),
        /No existe "no-existe\.md"/
      );
      assert.match(
        await errorAlLeer(() => cliente.readResource({ uri: "phase-gate://tareas/NADA/x/y.md" })),
        /No existe el proyecto "NADA"/
      );
    } finally {
      await cerrar();
    }
  });
});

describe("notificaciones y autocompletado", () => {
  it("start_task, switch_task y un archivo nuevo emiten resources/list_changed; reescribir no", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    let avisos = 0;
    cliente.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
      avisos++;
    });
    const esperar = () => new Promise((resolver) => setImmediate(resolver));

    try {
      await cliente.callTool({
        name: "start_task",
        arguments: { project: "PROYECTO-A", task_name: "nueva", initial_context: "x" },
      });
      await esperar();
      assert.equal(avisos, 1, "start_task");

      await cliente.callTool({ name: "switch_task", arguments: { project: "PROYECTO-A", task_name: "Tokens login" } });
      await esperar();
      assert.equal(avisos, 2, "switch_task");

      const escribir = { project: "PROYECTO-A", task_name: "Tokens login", file_name: "02 - Decisiones.md", content: "v1" };
      await cliente.callTool({ name: "write_central_doc", arguments: escribir });
      await esperar();
      assert.equal(avisos, 3, "archivo nuevo");

      await cliente.callTool({ name: "write_central_doc", arguments: { ...escribir, content: "v2" } });
      await esperar();
      assert.equal(avisos, 3, "reescribir no cambia la lista");
    } finally {
      await cerrar();
    }
  });

  it("autocompleta proyecto, tarea y documento", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      const ref = { type: "ref/resource" as const, uri: "phase-gate://tareas/{proyecto}/{tarea}/{documento}" };

      const proyectos = await cliente.complete({ ref, argument: { name: "proyecto", value: "proy" } });
      assert.deepEqual(proyectos.completion.values, ["PROYECTO-A"]);

      const tareas = await cliente.complete({
        ref,
        argument: { name: "tarea", value: "" },
        context: { arguments: { proyecto: "PROYECTO-A" } },
      });
      assert.deepEqual([...tareas.completion.values].sort(), ["Tokens login", "otra"]);

      const documentos = await cliente.complete({
        ref,
        argument: { name: "documento", value: "01" },
        context: { arguments: { proyecto: "PROYECTO-A", tarea: "Tokens login" } },
      });
      assert.deepEqual(documentos.completion.values, [ANALISIS]);
    } finally {
      await cerrar();
    }
  });
});

// Ajustes de la auditoría de la Etapa 2: el listado no enseña lo que está fuera de la tarea, y los
// errores llegan con un código que dice qué pasó.
describe("recursos: contención del listado y códigos de error", () => {
  it("una subcarpeta de recibos que es un enlace hacia fuera no se lista ni se autocompleta", async () => {
    const { docs } = escenario();
    const fuera = carpetaTemporal("fuera");
    fs.writeFileSync(path.join(fuera, "secreto.md"), "no debe verse", "utf-8");
    const enlazada = crearTarea(docs, "PROYECTO-A", "enlazada", [CONTEXTO]);
    crearSymlink(fuera, path.join(enlazada, RECIBOS));
    guardarPuntero("PROYECTO-A", "enlazada");

    const { cliente, cerrar } = await conectar();
    try {
      const { resources } = await cliente.listResources();
      assert.equal(resources.some((r) => r.uri.includes("secreto")), false);

      const recibos = await cliente.complete({
        ref: { type: "ref/resource", uri: "phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo}" },
        argument: { name: "recibo", value: "" },
        context: { arguments: { proyecto: "PROYECTO-A", tarea: "enlazada" } },
      });
      assert.deepEqual(recibos.completion.values, []);
    } finally {
      await cerrar();
    }
  });

  async function codigoAlLeer(leerRecurso: () => Promise<unknown>): Promise<number | undefined> {
    try {
      await leerRecurso();
    } catch (error) {
      return (error as { code?: number }).code;
    }
    assert.fail("la lectura debía fallar");
  }

  it("un documento que no existe es -32002, y un URI inválido es -32602", async () => {
    escenario();
    const { cliente, cerrar } = await conectar();
    try {
      assert.equal(
        await codigoAlLeer(() => cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/no-existe.md" })),
        -32002
      );
      assert.equal(await codigoAlLeer(() => cliente.readResource({ uri: "phase-gate://tareas/NADA/x/y.md" })), -32002);
      assert.equal(
        await codigoAlLeer(() => cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/a%2Fb.md" })),
        -32602
      );
      assert.equal(
        await codigoAlLeer(() => cliente.readResource({ uri: "phase-gate://tareas/PROYECTO-A/Tokens%20login/.oculto.md" })),
        -32602
      );
    } finally {
      await cerrar();
    }
  });
});
