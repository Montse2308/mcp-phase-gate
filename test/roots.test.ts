// El proyecto deducido de las raíces del cliente, con un cliente en
// memoria que anuncia (o no) la capacidad roots y responde roots/list.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { fijarRaizDelPaquete } from "../src/config.js";
import { esDemasiadoAmplia, resolverPorRaices, rutaDeRaiz } from "../src/roots.js";
import { conectar, textoDe } from "./cliente.js";
import { carpetaTemporal, crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const CONTEXTO = "00 - Contexto Inicial.md";

// PROYECTO-A declara el repo `api` en <repos>/grupo/backend-api; PROYECTO-B, el repo `web` en
// <repos>/frontend web (con un espacio). PROYECTO-C no tiene manifiesto.
function escenario() {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  const repos = carpetaTemporal("repos");
  process.env.PHASE_GATE_REPOS_PATH = repos;
  estadoTemporal();

  for (const nombre of ["PROYECTO-A", "PROYECTO-B", "PROYECTO-C"]) {
    crearProyecto(docs, nombre);
    crearTarea(docs, nombre, "tarea", [CONTEXTO]);
  }
  fs.writeFileSync(path.join(docs, "PROYECTO-A", "phase-gate.json"), JSON.stringify({ version: 1, repos: [{ id: "api", dir: "grupo/backend-api" }] }), "utf-8");
  fs.writeFileSync(path.join(docs, "PROYECTO-B", "phase-gate.json"), JSON.stringify({ version: 1, repos: [{ id: "web", dir: "frontend web" }] }), "utf-8");

  const api = path.join(repos, "grupo", "backend-api");
  const web = path.join(repos, "frontend web");
  fs.mkdirSync(path.join(api, "src"), { recursive: true });
  fs.mkdirSync(web, { recursive: true });
  return { docs, repos, api, web, grupo: path.join(repos, "grupo") };
}

const uri = (ruta: string): string => pathToFileURL(ruta).href;

// Un cliente que anuncia roots con las rutas que se le den; `raices` se puede cambiar después.
async function clienteConRaices(raices: { actuales: string[] }) {
  return conectar({ roots: { listChanged: true } }, (cliente: Client) => {
    cliente.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: raices.actuales.map((ruta) => ({ uri: uri(ruta) })) }));
  });
}

async function promptSinProyecto(cliente: Client, fase = 1): Promise<string> {
  return textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: fase } }));
}

describe("resolverPorRaices", () => {
  it("único por repo, también desde una subcarpeta, y por la carpeta del proyecto en la Documentación", () => {
    const e = escenario();

    const porRepo = resolverPorRaices([e.api]);
    assert.equal(porRepo.tipo === "unico" && porRepo.carpetaProyecto, "PROYECTO-A");
    assert.match(porRepo.tipo === "unico" ? porRepo.motivo : "", /es el repo `api` de PROYECTO-A/);

    const subcarpeta = resolverPorRaices([path.join(e.api, "src")]);
    assert.equal(subcarpeta.tipo === "unico" && subcarpeta.carpetaProyecto, "PROYECTO-A");

    const docs = resolverPorRaices([path.join(e.docs, "PROYECTO-C", "Proyectos")]);
    assert.equal(docs.tipo === "unico" && docs.carpetaProyecto, "PROYECTO-C", "un proyecto sin manifiesto se reconoce por su carpeta");
  });

  it("una coincidencia débil sola cuenta; varias débiles no; dos fuertes son ambiguas", () => {
    const e = escenario();

    const debil = resolverPorRaices([e.grupo]);
    assert.equal(debil.tipo === "unico" && debil.carpetaProyecto, "PROYECTO-A");
    assert.match(debil.tipo === "unico" ? debil.motivo : "", /contiene el repo `api`/);

    assert.deepEqual(resolverPorRaices([e.repos]), { tipo: "ninguno" }, "la carpeta de todos los repos no apunta a ninguno");
    assert.deepEqual(resolverPorRaices([e.api, e.web]), { tipo: "ambiguo", candidatos: ["PROYECTO-A", "PROYECTO-B"] });
    assert.deepEqual(resolverPorRaices([carpetaTemporal("otra")]), { tipo: "ninguno" });
    assert.deepEqual(resolverPorRaices([]), { tipo: "ninguno" });
  });

  it("una fuerte gana a una débil de otro proyecto", () => {
    const e = escenario();

    const r = resolverPorRaices([e.repos, e.web]);
    assert.equal(r.tipo === "unico" && r.carpetaProyecto, "PROYECTO-B");
  });
});

describe("raíces demasiado amplias", () => {
  it("la raíz de un disco y la carpeta del usuario no dan coincidencia débil", () => {
    const e = escenario();
    const raizDelDisco = path.parse(e.repos).root;

    assert.equal(esDemasiadoAmplia(raizDelDisco), true);
    assert.equal(esDemasiadoAmplia(os.homedir()), true);
    assert.equal(esDemasiadoAmplia(e.grupo), false);
    assert.deepEqual(resolverPorRaices([raizDelDisco]), { tipo: "ninguno" });
  });

  it("una coincidencia débil sirve para leer, pero no para escribir sin project", async () => {
    const e = escenario();
    const { cliente, cerrar } = await clienteConRaices({ actuales: [e.grupo] });
    try {
      const destino = { task_name: "tarea", file_name: "01 - Análisis Técnico.md" };
      const escrito = await cliente.callTool({ name: "write_central_doc", arguments: { ...destino, content: "x" } });
      assert.equal(escrito.isError, true);
      assert.match(textoDe(escrito), /solo contiene un repo de PROYECTO-A .*para escribir, indica `project`/);

      fs.writeFileSync(path.join(e.docs, "PROYECTO-A", "Proyectos", "tarea", destino.file_name), "análisis", "utf-8");
      const leido = await cliente.callTool({ name: "read_central_doc", arguments: destino });
      assert.equal(textoDe(leido), "análisis");

      const creada = await cliente.callTool({ name: "start_task", arguments: { task_name: "nueva", initial_context: "x" } });
      assert.equal(creada.isError, true);
    } finally {
      await cerrar();
    }
  });
});

describe("roots/list_changed fuera de orden", () => {
  it("una respuesta vieja que llega tarde no pisa a la nueva", async () => {
    const e = escenario();
    let llamada = 0;
    const { cliente, cerrar } = await conectar({ roots: { listChanged: true } }, (c: Client) => {
      c.setRequestHandler(ListRootsRequestSchema, async () => {
        llamada++;
        if (llamada === 2) {
          await new Promise((resolver) => setTimeout(resolver, 400)); // la vieja, lenta
          return { roots: [{ uri: uri(e.api) }] };
        }
        return { roots: [{ uri: uri(llamada === 1 ? e.api : e.web) }] };
      });
    });
    try {
      assert.match(await promptSinProyecto(cliente), /deducido de la carpeta abierta: PROYECTO-A/);
      await cliente.sendRootsListChanged(); // 2.ª petición: lenta, con las raíces viejas
      await new Promise((resolver) => setTimeout(resolver, 50));
      await cliente.sendRootsListChanged(); // 3.ª: rápida, con las nuevas
      await new Promise((resolver) => setTimeout(resolver, 700));
      assert.match(await promptSinProyecto(cliente), /deducido de la carpeta abierta: PROYECTO-B/);
    } finally {
      await cerrar();
    }
  });
});

describe("rutaDeRaiz", () => {
  it("decodifica espacios y acentos", () => {
    const carpeta = path.join(carpetaTemporal("raiz"), "mi carpeta ñ");
    fs.mkdirSync(carpeta);

    assert.equal(rutaDeRaiz(uri(carpeta)), carpeta);
    assert.ok(uri(carpeta).includes("mi%20carpeta%20%C3%B1"));
  });

  it("en Windows acepta la forma file:///c%3A/… que manda VS Code", { skip: process.platform !== "win32" }, () => {
    const carpeta = path.join(carpetaTemporal("raiz"), "con espacio");
    fs.mkdirSync(carpeta);
    const [unidad, ...resto] = carpeta.split(path.sep);
    const comoVsCode = `file:///${unidad!.toLowerCase().replace(":", "%3A")}/${resto.map(encodeURIComponent).join("/")}`;

    assert.equal(rutaDeRaiz(comoVsCode), carpeta);
  });
});

describe("Roots en el servidor", () => {
  it("sin la capacidad roots no se piden las raíces y sin project las tools lo piden", async () => {
    escenario();
    let pedidas = 0;
    const original = Server.prototype.listRoots;
    Server.prototype.listRoots = function (...args) {
      pedidas++;
      return original.apply(this, args);
    };
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "switch_task", arguments: { task_name: "tarea" } });
      assert.equal(r.isError, true);
      assert.match(textoDe(r), /No sé en qué proyecto estás: indica `project`\./);
      assert.equal(pedidas, 0);
      assert.equal((await promptSinProyecto(cliente)).includes("Proyecto deducido"), false);
    } finally {
      Server.prototype.listRoots = original;
      await cerrar();
    }
  });

  it("get_phase_prompt sin project usa el proyecto de la carpeta abierta, y lo dice", async () => {
    const e = escenario();
    const { cliente, cerrar } = await clienteConRaices({ actuales: [e.api] });
    try {
      const texto = await promptSinProyecto(cliente, 3);
      assert.match(texto, /^> Proyecto deducido de la carpeta abierta: PROYECTO-A \(la carpeta abierta `.*backend-api` es el repo `api` de PROYECTO-A\)\./);
      assert.ok(texto.includes("## CONFIGURACIÓN DEL PROYECTO (la declara phase-gate.json)"));
      assert.ok(texto.includes("## ATENCIÓN — COMPUERTA DE FASE"), "la compuerta se comprueba con el proyecto deducido");
    } finally {
      await cerrar();
    }
  });

  it("start_task, switch_task, write_central_doc y read_central_doc sin project", async () => {
    const e = escenario();
    const { cliente, cerrar } = await clienteConRaices({ actuales: [path.join(e.docs, "PROYECTO-B")] });
    try {
      const creada = await cliente.callTool({ name: "start_task", arguments: { task_name: "nueva", initial_context: "req" } });
      assert.equal(creada.isError, undefined, textoDe(creada));
      assert.match(textoDe(creada), /Proyecto deducido de la carpeta abierta: PROYECTO-B/);
      assert.ok(fs.existsSync(path.join(e.docs, "PROYECTO-B", "Proyectos", "nueva", CONTEXTO)));

      const cambio = await cliente.callTool({ name: "switch_task", arguments: { task_name: "tarea" } });
      assert.match(textoDe(cambio), /^Tarea activa de PROYECTO-B: tarea\./);

      const destino = { task_name: "tarea", file_name: "01 - Análisis Técnico.md" };
      const escrito = await cliente.callTool({ name: "write_central_doc", arguments: { ...destino, content: "análisis" } });
      assert.match(textoDe(escrito), /Proyecto deducido de la carpeta abierta: PROYECTO-B/);

      const leido = await cliente.callTool({ name: "read_central_doc", arguments: destino });
      assert.equal(textoDe(leido), "análisis", "el documento llega solo, sin la línea de la deducción");
      assert.match(((leido.content as { text: string }[])[1]?.text ?? ""), /Proyecto deducido/);
    } finally {
      await cerrar();
    }
  });

  it("estrenar un proyecto exige project aunque haya raíces", async () => {
    const e = escenario();
    const { cliente, cerrar } = await clienteConRaices({ actuales: [e.api] });
    try {
      const r = await cliente.callTool({ name: "start_task", arguments: { task_name: "x", initial_context: "y", crear_proyecto: true } });
      assert.equal(r.isError, true);
      assert.match(textoDe(r), /Para estrenar un proyecto, indica su nombre en `project`/);
    } finally {
      await cerrar();
    }
  });

  it("con raíces ambiguas, el error lista los candidatos", async () => {
    const e = escenario();
    const { cliente, cerrar } = await clienteConRaices({ actuales: [e.api, e.web] });
    try {
      const r = await cliente.callTool({ name: "switch_task", arguments: { task_name: "tarea" } });
      assert.equal(r.isError, true);
      assert.match(textoDe(r), /coincide con varios \(PROYECTO-A, PROYECTO-B\)\. Indica `project`\./);
    } finally {
      await cerrar();
    }
  });

  it("roots/list_changed vuelve a pedir las raíces", async () => {
    const e = escenario();
    const raices = { actuales: [e.api] };
    const { cliente, cerrar } = await clienteConRaices(raices);
    try {
      assert.match(await promptSinProyecto(cliente), /deducido de la carpeta abierta: PROYECTO-A/);

      raices.actuales = [e.web];
      await cliente.sendRootsListChanged();
      assert.match(await promptSinProyecto(cliente), /deducido de la carpeta abierta: PROYECTO-B/);
    } finally {
      await cerrar();
    }
  });

  it("/fN sin project lleva el proyecto deducido en los datos de la invocación", async () => {
    const e = escenario();
    const { cliente, cerrar } = await clienteConRaices({ actuales: [e.api] });
    try {
      const r = await cliente.getPrompt({ name: "f2", arguments: {} });
      assert.match((r.messages[0]?.content as { text: string }).text, /## Datos de esta invocación\n- project: PROYECTO-A$/);
    } finally {
      await cerrar();
    }
  });
});
