// La API de lectura del Studio (§7.5 del plan) contra un árbol de fixtures: cada ruta, validada con su
// shape de src/studio/contrato.ts; los parámetros inválidos rechazados; un proyecto o una tarea que no
// existen, 404; ningún GET escribe en el disco, y los errores no llevan las rutas del equipo.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { fijarRaizDelPaquete } from "../src/config.js";
import { registrarLote } from "../src/lotes.js";
import {
  ClientesRespuesta,
  DocumentoRespuesta,
  EstadoRespuesta,
  LotesRespuesta,
  PromptRespuesta,
  ProyectosRespuesta,
  TareaRespuesta,
  TareasRespuesta,
} from "../src/studio/contrato.js";
import { sinRutasDelEquipo } from "../src/studio/api.js";
import { conectar, textoDe } from "./cliente.js";
import { carpetaTemporal, configTemporal, crearProyecto, crearSymlink, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";
import { entornoInitDePrueba, git, huellaDelArbol, studioConApi } from "./studio-ayudas.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const PLAN = [
  "---",
  "lotes: 2",
  "---",
  "",
  "# Plan",
  "",
  "| Lote | Repo | Objetivo | Archivos | Verificación | Commit propuesto |",
  "|---|---|---|---|---|---|",
  "| L01 | api | El primero | a.txt | test | `feat(api): primero` |",
  "| L02 | api | El segundo | b.txt | test | `feat(api): segundo` |",
  "",
].join("\n");

// La instalación: P con manifiesto y dos repos (api con git, web sin git); Q sin manifiesto; R con el
// manifiesto roto. P tiene cuatro tareas: en curso (Fase 4 con un lote anclado y otro pendiente), con un
// hueco (falta la Fase 2), en la Fase 2 con pendientes en la 1, y vacía.
async function instalacion() {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  const estado = estadoTemporal();
  const config = configTemporal();
  const repos = carpetaTemporal("repos");
  process.env.PHASE_GATE_REPOS_PATH = repos;
  crearProyecto(docs, "P");
  crearProyecto(docs, "Q");
  crearProyecto(docs, "R");
  fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, preset: "software", repos: [{ id: "api", dir: "api", rol: "backend" }, { id: "web", dir: "web" }] }), "utf-8");
  fs.writeFileSync(path.join(docs, "R", "phase-gate.json"), "{ roto", "utf-8");

  const api = path.join(repos, "api");
  fs.mkdirSync(api);
  fs.mkdirSync(path.join(repos, "web"));
  git(api, "init", "-q");
  fs.writeFileSync(path.join(api, "inicio.txt"), "inicio\n", "utf-8");
  git(api, "add", "inicio.txt");
  git(api, "commit", "-q", "-m", "inicio");

  const enCurso = crearTarea(docs, "P", "en-curso", ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md", "02 - Decisiones.md"]);
  fs.writeFileSync(path.join(enCurso, "03 - Plan Técnico.md"), PLAN, "utf-8");
  fs.writeFileSync(path.join(api, "a.txt"), "a\n", "utf-8");
  git(api, "add", "a.txt");
  git(api, "commit", "-q", "-m", "feat(api): primero");
  const contenido = { titulo: "El primero", estado: "verificado" as const, que_se_hizo: "Hecho.", archivos: [{ archivo: "a.txt", cambio: "nuevo" }], verificacion: "test" };
  await registrarLote("P", "en-curso", { lote: 1, repo: "api", ...contenido, commit: git(api, "rev-parse", "HEAD") });
  await registrarLote("P", "en-curso", { lote: 2, repo: "api", ...contenido, titulo: "El segundo" });

  crearTarea(docs, "P", "con-hueco", ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md", "03 - Plan Técnico.md"]);
  const conPendientes = crearTarea(docs, "P", "con-pendientes", ["00 - Contexto Inicial.md"]);
  fs.writeFileSync(path.join(conPendientes, "01 - Análisis Técnico.md"), "# Análisis\n\n## Validaciones pendientes\n\n- Falta medir el tiempo.\n", "utf-8");
  crearTarea(docs, "P", "vacia", []);
  crearTarea(docs, "Q", "una", ["00 - Contexto Inicial.md"]);
  return { docs, estado, config, repos, api, enCurso };
}

describe("API del Studio: cada ruta con su shape", () => {
  it("/api/estado: el diagnóstico y el estado del Studio", async () => {
    await instalacion();
    const s = await studioConApi();
    const r = await s.get("/api/estado");
    assert.equal(r.estado, 200);
    const datos = EstadoRespuesta.parse(r.json);
    assert.deepEqual(datos.studio.modo, "vivo");
    assert.deepEqual(datos.diagnostico.proyectos.map((p) => p.nombre).sort(), ["P", "Q", "R"]);
    assert.equal(r.cabeceras["cache-control"], "no-store");
  });

  it("/api/proyectos: manifiesto, preset, reglas, repos con su git, tarea activa y sesiones", async () => {
    await instalacion();
    const sesion = { pid: 1234, cliente: "cliente-de-prueba 1.0", proyecto: "p", desde: "2026-10-17T09:00:00.000Z", actualizado: "2026-10-17T09:00:00.000Z" };
    const s = await studioConApi({ sesiones: () => [sesion] });
    const r = await s.get("/api/proyectos");
    assert.equal(r.estado, 200);
    const datos = ProyectosRespuesta.parse(r.json);
    assert.equal(datos.error, null);
    assert.ok(datos.presets.includes("software") && datos.presets.includes("ai-agent-ops"));
    const [p, q, rr] = datos.proyectos;
    assert.equal(p!.nombre, "P");
    assert.deepEqual(p!.manifiesto, { estado: "valido", error: null });
    assert.deepEqual(p!.preset, { nombre: "software", origen: "del proyecto" });
    assert.equal(p!.repos.length, 2);
    const [api, web] = p!.repos;
    assert.equal(api!.id, "api");
    assert.equal(api!.rol, "backend");
    assert.equal(api!.esGit, true);
    assert.equal(api!.rama, "main");
    assert.equal(api!.limpio, true);
    assert.equal(api!.respondio, true);
    assert.equal(web!.esGit, false);
    assert.equal(p!.tareas, 4);
    assert.ok(p!.activa);
    assert.deepEqual(p!.sesiones, [sesion]); // la sesión es del proyecto "p": sin distinguir mayúsculas
    assert.equal(q!.manifiesto.estado, "ausente");
    assert.equal(q!.sesiones.length, 0);
    assert.equal(rr!.manifiesto.estado, "invalido");
    assert.match(rr!.manifiesto.error!, /no es un JSON válido/);
    // Ninguna ruta absoluta del equipo en la respuesta: ni la Documentación ni los repos.
    assert.ok(!r.texto.includes(JSON.stringify(path.join(os.tmpdir())).slice(1, -1)));
    assert.match(rr!.manifiesto.error!, /<Documentación>/);
  });

  it("/api/proyectos/:p/tareas: las tareas con su estado, la más reciente primero", async () => {
    await instalacion();
    const s = await studioConApi();
    const r = await s.get("/api/proyectos/P/tareas");
    assert.equal(r.estado, 200);
    const datos = TareasRespuesta.parse(r.json);
    assert.equal(datos.proyecto, "P");
    assert.deepEqual(datos.tareas.map((t) => t.tarea).sort(), ["con-hueco", "con-pendientes", "en-curso", "vacia"]);
    const enCurso = datos.tareas.find((t) => t.tarea === "en-curso")!;
    assert.equal(enCurso.siguienteFase, 4);
    assert.deepEqual(enCurso.lotes, { total: 2, cerrados: 1, actual: 2, pendienteDeCommit: 2 });
    assert.match(enCurso.descripcion, /lote 2 de 2, commit pendiente/);
    // Sin la carpeta de la tarea: una tarea se identifica por su proyecto y su nombre.
    assert.ok(!("folderPath" in enCurso));
    // Con otras mayúsculas el proyecto es el mismo.
    assert.equal((await s.get("/api/proyectos/p/tareas")).json.proyecto, "P");
  });

  it("/api/tareas/:p/:t: estaciones con su señal, recibos, compuerta y pendientes", async () => {
    await instalacion();
    const s = await studioConApi();
    const senales = async (tarea: string) => {
      const r = await s.get(`/api/tareas/P/${encodeURIComponent(tarea)}`);
      assert.equal(r.estado, 200, tarea);
      return TareaRespuesta.parse(r.json);
    };

    const enCurso = await senales("en-curso");
    assert.deepEqual(enCurso.estaciones.map((e) => `${e.numero}:${e.senal}:${e.texto}`), ["0:verde:cerrada", "1:verde:cerrada", "2:verde:cerrada", "3:verde:cerrada", "4:ambar:en curso", "5:apagado:pendiente"]);
    assert.deepEqual(enCurso.recibos, ["04 - Ejecución/L01 - El primero.md", "04 - Ejecución/L02 - El segundo.md"]);
    assert.equal(enCurso.estaciones[4]!.recibos, "04 - Ejecución");

    const hueco = await senales("con-hueco");
    assert.deepEqual(hueco.estaciones.map((e) => `${e.numero}:${e.senal}`), ["0:verde", "1:verde", "2:rojo", "3:verde", "4:apagado", "5:apagado"]);
    assert.equal(hueco.estaciones[2]!.texto, "hueco");
    assert.match(hueco.compuerta!, /COMPUERTA DE FASE/);
    assert.match(hueco.compuerta!, /falta `02 - Decisiones.md`/);

    const pendientes = await senales("con-pendientes");
    assert.deepEqual(pendientes.estaciones.map((e) => `${e.numero}:${e.senal}:${e.texto}`).slice(0, 3), ["0:verde:cerrada", "1:ambar:con pendientes", "2:apagado:pendiente"]);
    assert.match(pendientes.pendientes!, /Validaciones pendientes/);
    assert.equal(pendientes.compuerta, null);

    const vacia = await senales("vacia");
    assert.ok(vacia.estaciones.every((e) => e.senal === "apagado"));
  });

  it("/api/tareas/:p/:t/documento: el texto, el frontmatter y la fecha, también de un recibo", async () => {
    await instalacion();
    const s = await studioConApi();
    const r = await s.get(`/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("03 - Plan Técnico.md")}`);
    assert.equal(r.estado, 200);
    const datos = DocumentoRespuesta.parse(r.json);
    assert.equal(datos.archivo, "03 - Plan Técnico.md");
    assert.equal(datos.frontmatter.lotes, "2");
    assert.match(datos.texto, /\| L01 \| api \|/);

    const recibo = await s.get(`/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("04 - Ejecución/L01 - El primero.md")}`);
    assert.equal(recibo.estado, 200);
    assert.equal(DocumentoRespuesta.parse(recibo.json).frontmatter.ancla, "commit");
  });

  it("/api/tareas/:p/:t/lotes: el estado de get_batch_status, y con reverificar", async () => {
    await instalacion();
    const s = await studioConApi();
    const r = await s.get("/api/tareas/P/en-curso/lotes");
    assert.equal(r.estado, 200);
    const datos = LotesRespuesta.parse(r.json);
    assert.ok(datos.disponible);
    if (!datos.disponible) return;
    assert.equal(datos.estado.declarados, 2);
    assert.deepEqual(datos.estado.lotes.map((f) => `${f.lote}:${f.ancla?.tipo}`), ["L01:commit", "L02:pendiente"]);
    assert.equal(datos.estado.lotes[0]!.vigente, null);
    // El sello: el SHA corto y la fecha del recibo; un lote pendiente no tiene corto.
    assert.match(datos.estado.lotes[0]!.sello!.corto!, /^[0-9a-f]{7}$/);
    assert.match(datos.estado.lotes[0]!.sello!.fecha!, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(datos.estado.lotes[1]!.sello!.corto, null);
    const reverificado = LotesRespuesta.parse((await s.get("/api/tareas/P/en-curso/lotes?reverificar=1")).json);
    assert.ok(reverificado.disponible && reverificado.reverificado && reverificado.estado.lotes[0]!.vigente === true);

    // Una tarea sin plan: no hay lotes que enseñar, y se dice por qué (no es un 500).
    const sinPlan = LotesRespuesta.parse((await s.get("/api/tareas/P/vacia/lotes")).json);
    assert.equal(sinPlan.disponible, false);
    assert.ok(!sinPlan.disponible && /todavía no tiene `03 - Plan Técnico.md`/.test(sinPlan.motivo));
  });

  it("/api/prompts/:p/:fase: el mismo texto que get_phase_prompt, con capas, ranuras de fábrica y efectivas", async () => {
    const { enCurso } = await instalacion();
    void enCurso;
    const s = await studioConApi();
    const r = await s.get("/api/prompts/P/3?tarea=en-curso");
    assert.equal(r.estado, 200);
    const datos = PromptRespuesta.parse(r.json);
    assert.equal(datos.tarea, "en-curso");
    assert.deepEqual(datos.capas.map((c) => c.etiqueta), ["fábrica", "proyecto"]);
    assert.ok(datos.ranuras.some((rr) => rr.id === "fase-3/pruebas" && rr.contenidoDe === "fábrica" && rr.fabrica === rr.efectivo));
    assert.ok(datos.ranuras.some((rr) => rr.id.startsWith("global/")));
    assert.deepEqual(datos.fases.map((f) => f.numero), [1, 2, 3, 4, 5]);

    const { cliente, cerrar } = await conectar();
    try {
      const tool = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 3, project: "P", task_name: "en-curso" } }));
      assert.equal(datos.texto, tool);
      // Sin tarea, la activa, igual que la tool sin task_name.
      const sinTarea = PromptRespuesta.parse((await s.get("/api/prompts/P/5")).json);
      assert.equal(sinTarea.texto, textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 5, project: "P" } })));
    } finally {
      await cerrar();
    }
  });

  it("/api/clientes: lo que haría init --dry-run en cada cliente, sobre un HOME falso", async () => {
    await instalacion();
    const entorno = entornoInitDePrueba((args) =>
      args[0] === "--version" ? { codigo: 0, stdout: "2.1.0", stderr: "" } : { codigo: 0, stdout: "otro-servidor: npx -y otro-servidor - ✔ Connected\n", stderr: "" }
    );
    fs.mkdirSync(path.join(entorno.home, ".cursor"));
    const s = await studioConApi({ entornoInit: () => entorno });
    const r = await s.get("/api/clientes");
    assert.equal(r.estado, 200);
    const { clientes } = ClientesRespuesta.parse(r.json);
    assert.deepEqual(clientes.map((c) => `${c.cliente}:${c.detectado}:${c.estado}`), ["claude-code:true:nuevo", "cursor:true:nuevo", "vscode:false:nuevo"]);
    assert.match(clientes[0]!.comando!, /^claude mcp add pg --scope user/);
    assert.equal(clientes[1]!.archivo, "~/.cursor/mcp.json");
    assert.match(clientes[1]!.diff!, /^\+ \{/);
    // Solo leyó: claude --version y claude mcp list, nada de mcp add, y no escribió ningún mcp.json.
    assert.deepEqual(entorno.llamadas.map((l) => l.slice(1).join(" ")), ["--version", "mcp list"]);
    assert.equal(fs.existsSync(path.join(entorno.home, ".cursor", "mcp.json")), false);
    assert.notEqual(entorno.home, os.homedir());
  });
});

describe("API del Studio: parámetros, errores y lo que no se hace", () => {
  it("un proyecto, una tarea, un documento o una fase que no existen son 404, no 500", async () => {
    await instalacion();
    const s = await studioConApi();
    for (const ruta of [
      "/api/proyectos/NOEXISTE/tareas",
      "/api/tareas/NOEXISTE/x",
      "/api/tareas/P/noexiste",
      "/api/tareas/P/noexiste/lotes",
      `/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("09 - Nada.md")}`,
      "/api/prompts/P/9",
      "/api/prompts/P/3?tarea=noexiste",
      "/api/no-existe",
      // %252e%252e se decodifica UNA vez: es el nombre literal "%2e%2e", que no existe.
      "/api/tareas/P/%252e%252e",
    ]) {
      const r = await s.get(ruta);
      assert.equal(r.estado, 404, `${ruta}: ${r.texto}`);
      assert.equal(typeof r.json.error, "string");
    }
  });

  it("parámetros que no son un nombre válido son 400: separadores, .., punto inicial, reservados, NUL, mala codificación", async () => {
    await instalacion();
    const s = await studioConApi();
    for (const ruta of [
      "/api/proyectos/%2e%2e/tareas",
      "/api/proyectos/..%2fP/tareas",
      "/api/proyectos/P%5c..%5cQ/tareas",
      "/api/tareas/P/%2e%2e%2fcon-hueco",
      "/api/tareas/P/.oculta",
      "/api/tareas/P/con",
      "/api/tareas/P/x%00y",
      "/api/tareas/P/%zz",
      "/api/tareas/P/a%3Ab",
      "/api/tareas/P/en-curso/documento",
      "/api/tareas/P/en-curso/documento?archivo=",
      `/api/tareas/P/en-curso/documento?archivo=a&archivo=b`,
      `/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("../con-hueco/01 - Análisis Técnico.md")}`,
      `/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("..\\con-hueco\\01 - Análisis Técnico.md")}`,
      `/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("/etc/passwd")}`,
      `/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("C:\\Windows\\win.ini")}`,
      `/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("03 - Plan Técnico.md::$DATA")}`,
      `/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent(".git/config")}`,
      "/api/prompts/P/tres",
      "/api/prompts/P/-1",
    ]) {
      const r = await s.get(ruta);
      // 400 exacto: lo rechaza la validación, no el "no existe" que vendría después.
      assert.equal(r.estado, 400, `${ruta} → ${r.estado}: ${r.texto}`);
    }
  });

  it("documento: sin BOM y en LF, aunque el archivo venga del Bloc de notas", async () => {
    const { enCurso } = await instalacion();
    fs.writeFileSync(path.join(enCurso, "notas.md"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("---\r\nestado: x\r\n---\r\n# Notas\r\n", "utf-8")]));
    const s = await studioConApi();
    const r = await s.get("/api/tareas/P/en-curso/documento?archivo=notas.md");
    assert.equal(r.estado, 200);
    assert.equal(r.json.texto, "---\nestado: x\n---\n# Notas\n");
    assert.equal(r.json.frontmatter.estado, "x");
  });

  it("un nombre con % se decodifica una sola vez", async () => {
    const { enCurso } = await instalacion();
    fs.writeFileSync(path.join(enCurso, "avance 100%.md"), "# Avance\n", "utf-8");
    const s = await studioConApi();
    const r = await s.get(`/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("avance 100%.md")}`);
    assert.equal(r.estado, 200, r.texto);
    assert.equal(r.json.archivo, "avance 100%.md");
  });

  it("documento: una junction o un nombre corto 8.3 dentro de la tarea no llevan fuera ni a .git", async (t) => {
    const { enCurso, docs } = await instalacion();
    const fuera = carpetaTemporal("fuera");
    fs.writeFileSync(path.join(fuera, "secreto.md"), "SECRETO", "utf-8");
    crearSymlink(fuera, path.join(enCurso, "enlace-afuera"));
    fs.mkdirSync(path.join(enCurso, ".git"));
    fs.writeFileSync(path.join(enCurso, ".git", "config"), "SECRETO", "utf-8");
    crearSymlink(path.join(enCurso, ".git"), path.join(enCurso, "enlace-a-git"));
    const s = await studioConApi();
    for (const archivo of ["enlace-afuera/secreto.md", "enlace-a-git/config"]) {
      const r = await s.get(`/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent(archivo)}`);
      assert.equal(r.estado, 403, `${archivo}: ${r.texto}`);
      assert.doesNotMatch(r.texto, /SECRETO/);
      assert.ok(!r.texto.includes(docs), "el error no lleva la ruta de la Documentación");
    }
    if (fs.existsSync(path.join(enCurso, "GIT~1", "config"))) {
      const r = await s.get(`/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("GIT~1/config")}`);
      assert.equal(r.estado, 403);
      assert.doesNotMatch(r.texto, /SECRETO/);
    } else {
      t.diagnostic("este volumen no genera nombres cortos 8.3");
    }
  });

  it("documento: más de 1 MB o binario es 422, con un mensaje sin rutas del equipo", async () => {
    const { enCurso, docs } = await instalacion();
    fs.writeFileSync(path.join(enCurso, "grande.md"), "x".repeat(1_048_577), "utf-8");
    fs.writeFileSync(path.join(enCurso, "binario.md"), Buffer.from([0x61, 0, 0x62]));
    const s = await studioConApi();
    for (const archivo of ["grande.md", "binario.md"]) {
      const r = await s.get(`/api/tareas/P/en-curso/documento?archivo=${archivo}`);
      assert.equal(r.estado, 422, archivo);
      assert.ok(!r.texto.includes(docs) && !r.texto.includes(docs.replace(/\\/g, "\\\\")), r.texto);
      assert.match(r.json.error, /<Documentación>/);
    }
  });

  it("un proyecto con el manifiesto roto es 422, no 500", async () => {
    const { docs } = await instalacion();
    const s = await studioConApi();
    const r = await s.get("/api/proyectos/R/tareas");
    assert.equal(r.estado, 422, r.texto);
    assert.match(r.json.error, /no es un JSON válido/);
    assert.ok(!r.texto.includes(docs));
  });

  it("solo GET: un POST con todo en regla a una ruta de lectura es 405", async () => {
    await instalacion();
    const s = await studioConApi();
    const r = await s.post("/api/proyectos", {});
    assert.equal(r.estado, 405);
  });

  it("ningún GET escribe en el disco: la Documentación, los repos, el estado y la configuración no cambian", async () => {
    const { docs, estado, config, repos } = await instalacion();
    const entorno = entornoInitDePrueba((args) => (args[0] === "--version" ? { codigo: 0, stdout: "2", stderr: "" } : { codigo: 0, stdout: "", stderr: "" }));
    const s = await studioConApi({ entornoInit: () => entorno });
    const antes = huellaDelArbol(docs, estado, config, repos, entorno.home, entorno.appData!);
    for (const ruta of [
      "/api/estado",
      "/api/proyectos",
      "/api/proyectos/P/tareas",
      "/api/tareas/P/en-curso",
      "/api/tareas/P/con-hueco",
      `/api/tareas/P/en-curso/documento?archivo=${encodeURIComponent("03 - Plan Técnico.md")}`,
      "/api/tareas/P/en-curso/lotes",
      "/api/tareas/P/en-curso/lotes?reverificar=1",
      "/api/prompts/P/4?tarea=en-curso",
      "/api/prompts/Q/1",
      "/api/clientes",
      "/api/proyectos/R/tareas",
    ]) {
      await s.get(ruta);
    }
    assert.deepEqual(huellaDelArbol(docs, estado, config, repos, entorno.home, entorno.appData!), antes);
  });

  it("sinRutasDelEquipo sustituye la Documentación, los repos, la configuración, el estado y la carpeta del usuario", async () => {
    const { docs, repos, config, estado } = await instalacion();
    const texto = `${path.join(docs, "P")} · ${path.join(repos, "api")} · ${config} · ${estado} · ${path.join(os.homedir(), "x")} · ${docs.replace(/\\/g, "/")}/y`;
    const limpio = sinRutasDelEquipo(texto);
    assert.equal(limpio, `${path.join("<Documentación>", "P")} · ${path.join("<repos>", "api")} · <configuración> · <estado> · ${path.join("~", "x")} · <Documentación>/y`);
  });
});
