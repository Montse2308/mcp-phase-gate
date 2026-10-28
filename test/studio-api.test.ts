// La API de lectura del Studio (§7.5 del plan) contra un árbol de fixtures: cada ruta, validada con su
// shape de src/studio/contrato.ts; los parámetros inválidos rechazados; un proyecto o una tarea que no
// existen, 404; ningún GET escribe en el disco, y los errores no llevan las rutas del equipo.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { cargarEnv, configDir, fijarRaizDelPaquete } from "../src/config.js";
import { registrarLote } from "../src/lotes.js";
import {
  AjustesRespuesta,
  BitacoraRespuesta,
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

  it("/api/tareas/:p/:t/bitacora: documentos, recibos, commits, reanclajes y el cierre, de lo más reciente a lo más antiguo", async () => {
    const { docs, api } = await instalacion();
    // Una tarea de un lote: anclarlo cierra la fase; después se reancla a otro commit.
    const cerrada = crearTarea(docs, "P", "cerrada", ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md", "02 - Decisiones.md"]);
    fs.writeFileSync(path.join(cerrada, "03 - Plan Técnico.md"), PLAN.replace("lotes: 2", "lotes: 1"), "utf-8");
    fs.writeFileSync(path.join(api, "c.txt"), "c\n", "utf-8");
    git(api, "add", "c.txt");
    git(api, "commit", "-q", "-m", "feat(api): cerrar");
    const contenido = { titulo: "Cerrar", estado: "verificado" as const, que_se_hizo: "Hecho.", verificacion: "test" };
    await registrarLote("P", "cerrada", { lote: 1, repo: "api", ...contenido, commit: git(api, "rev-parse", "HEAD") });
    // Como tras un rebase: el commit del lote se rehace con otro SHA.
    git(api, "reset", "-q", "--soft", "HEAD~1");
    git(api, "commit", "-q", "-m", "feat(api): cerrar, otra vez");
    await registrarLote("P", "cerrada", { lote: 1, repo: "api", reanclar: true, force: true, commit: git(api, "rev-parse", "HEAD") });

    const s = await studioConApi();
    const r = await s.get("/api/tareas/P/cerrada/bitacora");
    assert.equal(r.estado, 200, r.texto);
    const { eventos } = BitacoraRespuesta.parse(r.json);
    const tipos = new Set(eventos.map((e) => e.tipo));
    assert.deepEqual([...tipos].sort(), ["commit", "documento", "fase-cerrada", "reanclaje", "recibo"]);
    const commit = eventos.find((e) => e.tipo === "commit")!;
    assert.equal(commit.commit!.asunto, "feat(api): cerrar, otra vez");
    assert.match(commit.commit!.corto, /^[0-9a-f]{7}$/);
    assert.equal(commit.archivo, "04 - Ejecución.md");
    assert.match(eventos.find((e) => e.tipo === "reanclaje")!.titulo, /L01 reanclado/);
    // Ordenados de lo más reciente a lo más antiguo.
    const momentos = eventos.map((e) => Date.parse(e.fecha.length === 10 ? `${e.fecha}T00:00:00` : e.fecha));
    assert.deepEqual(momentos, [...momentos].sort((a, b) => b - a));

    // Una tarea con un lote pendiente: su recibo sale, su commit no (no hay).
    const enCurso = BitacoraRespuesta.parse((await s.get("/api/tareas/P/en-curso/bitacora")).json);
    assert.deepEqual(enCurso.eventos.filter((e) => e.tipo === "recibo").map((e) => e.lote).sort(), ["L01", "L02"]);
    assert.deepEqual(enCurso.eventos.filter((e) => e.tipo === "commit").map((e) => e.lote), ["L01"]);
    assert.equal(enCurso.eventos.filter((e) => e.tipo === "fase-cerrada").length, 0);
    assert.equal((await s.get("/api/tareas/P/noexiste/bitacora")).estado, 404);
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

describe("API del Studio: /api/ajustes", () => {
  const maquina = (config: string, contenido: unknown): void => fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify(contenido), "utf-8");
  const campo = (r: AjustesRespuesta, nombre: string) => r.campos.find((c) => c.campo === nombre)!;
  async function pedirAjustes(contexto: Parameters<typeof studioConApi>[0] = {}): Promise<AjustesRespuesta> {
    const s = await studioConApi(contexto);
    const r = await s.get("/api/ajustes");
    assert.equal(r.estado, 200, r.texto);
    return AjustesRespuesta.parse(r.json);
  }
  const sesion = (pid: number, rutas?: object) => ({ pid, cliente: "claude-code 2.1.0", proyecto: "P", desde: "2026-10-27T10:00:00.000Z", actualizado: "2026-10-27T10:00:00.000Z", ...(rutas ? { rutas } : {}) });

  it("para cada ruta y el idioma: el valor de machine.json, el efectivo y su fuente; sin machine.json ni clientes, nada más", async () => {
    const { docs, repos } = await instalacion();
    const r = await pedirAjustes({ entornoInit: () => entornoInitDePrueba() });

    assert.deepEqual(r.maquina, { estado: "ausente", error: null, deMemoria: false, version: null });
    assert.deepEqual(r.campos.map((c) => c.campo), ["documentacion", "carpetaDeRepos", "subcarpetaTareas", "idioma"]);
    assert.deepEqual(
      r.campos.map((c) => [c.variable, c.enMaquina, c.efectivo, c.fuente, c.propioStudioPisa, c.sinGuardar]),
      [
        ["PHASE_GATE_DOCS_PATH", null, docs, "entorno", false, true],
        ["PHASE_GATE_REPOS_PATH", null, repos, "entorno", false, true],
        ["PHASE_GATE_TASKS_SUBDIR", null, "Proyectos", "entorno", false, true],
        ["PHASE_GATE_LANG", null, "es", "entorno", false, true],
      ],
      "lo del entorno de este Studio que machine.json no tiene se puede guardar ahí"
    );
    assert.deepEqual(r.clientes.map((c) => [c.cliente, c.lectura, c.entradas]), [["claude-code", "no-existe", []], ["cursor", "no-existe", []], ["vscode", "no-existe", []]]);
    assert.deepEqual(r.sesiones, []);

    // Sin entorno, la ruta sale de machine.json; sin ninguno, sin definir.
    delete process.env.ORQUESTADOR_DOCS_PATH;
    delete process.env.PHASE_GATE_REPOS_PATH;
    delete process.env.ORQUESTADOR_TASKS_SUBDIR;
    delete process.env.PHASE_GATE_LANG;
    const sin = await pedirAjustes({ entornoInit: () => entornoInitDePrueba() });
    assert.deepEqual(sin.campos.slice(0, 2).map((c) => [c.efectivo, c.fuente]), [[null, "sin definir"], [null, "sin definir"]]);
    maquina(configDir(), { version: 2, rutas: { documentacion: docs, carpetaDeRepos: repos, subcarpetaTareas: "" }, idiomaPorDefecto: "en" });
    const guardado = await pedirAjustes({ entornoInit: () => entornoInitDePrueba() });
    assert.deepEqual(
      guardado.campos.map((c) => [c.enMaquina, c.efectivo, c.fuente, c.propioStudioPisa, c.sinGuardar]),
      [[docs, docs, "machine.json", false, false], [repos, repos, "machine.json", false, false], ["", "", "machine.json", false, false], ["en", "en", "machine.json", false, false]]
    );
    assert.deepEqual([guardado.maquina.estado, guardado.maquina.version], ["valido", 2]);
  });

  it("como primer aviso, si el propio Studio usa otro valor por su entorno o su .env que el de machine.json", async () => {
    const { docs, config } = await instalacion();
    const otra = carpetaTemporal("otra-docs");
    maquina(config, { version: 2, rutas: { documentacion: otra, carpetaDeRepos: process.env.PHASE_GATE_REPOS_PATH }, idiomaPorDefecto: "en" });
    process.env.PHASE_GATE_LANG = "es";

    const r = await pedirAjustes({ entornoInit: () => entornoInitDePrueba() });
    assert.equal(campo(r, "documentacion").propioStudioPisa, true);
    assert.equal(campo(r, "documentacion").efectivo, docs, "gana el entorno");
    assert.equal(campo(r, "documentacion").enMaquina, otra);
    assert.equal(campo(r, "carpetaDeRepos").propioStudioPisa, false, "la misma ruta");
    assert.equal(campo(r, "idioma").propioStudioPisa, true, "PHASE_GATE_LANG=es contra idiomaPorDefecto=en");
    assert.equal(campo(r, "idioma").efectivo, "es");

    // La misma ruta con otra forma no es otro valor; y una ruta que viene del .env se dice como tal.
    process.env.ORQUESTADOR_DOCS_PATH = path.join(otra, "sub", "..");
    assert.equal(campo(await pedirAjustes({ entornoInit: () => entornoInitDePrueba() }), "documentacion").propioStudioPisa, false);
    delete process.env.ORQUESTADOR_DOCS_PATH;
    const archivo = path.join(carpetaTemporal("env"), ".env");
    fs.writeFileSync(archivo, `PHASE_GATE_DOCS_PATH=${docs}\nPHASE_GATE_LANG=es\n`);
    delete process.env.PHASE_GATE_LANG;
    cargarEnv(archivo);
    const delEnv = await pedirAjustes({ entornoInit: () => entornoInitDePrueba() });
    assert.deepEqual([campo(delEnv, "documentacion").fuente, campo(delEnv, "documentacion").propioStudioPisa], [".env", true]);
    assert.equal(campo(delEnv, "idioma").fuente, ".env");
  });

  it("por cliente: un env que pisa, uno que coincide y ninguno, leyendo el mcp.json de Cursor y VS Code y ~/.claude.json en sus ámbitos", async () => {
    const { docs, repos, config } = await instalacion();
    const otra = carpetaTemporal("otra-docs");
    maquina(config, { version: 2, rutas: { documentacion: docs, carpetaDeRepos: repos }, idiomaPorDefecto: "es" });
    const entorno = entornoInitDePrueba();
    const pisa = { command: "npx", args: ["-y", "mcp-phase-gate"], env: { PHASE_GATE_DOCS_PATH: otra, ORQUESTADOR_REPOS_PATH: repos, PHASE_GATE_LANG: "en", OTRA: "1" } };
    const coincide = { command: "npx", args: ["-y", "mcp-phase-gate"], env: { PHASE_GATE_DOCS_PATH: path.join(docs, "sub", ".."), PHASE_GATE_TASKS_SUBDIR: "Cosas" } };
    const ninguno = { command: "npx", args: ["-y", "mcp-phase-gate"], env: { PHASE_GATE_ELICITATION: "off" } };
    const ajena = { command: "npx", args: ["-y", "otro-servidor"], env: { PHASE_GATE_DOCS_PATH: otra } };
    fs.mkdirSync(path.join(entorno.home, ".cursor"));
    fs.writeFileSync(path.join(entorno.home, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { pg: pisa, ajena } }), "utf-8");
    fs.mkdirSync(path.join(entorno.appData!, "Code", "User"), { recursive: true });
    fs.writeFileSync(path.join(entorno.appData!, "Code", "User", "mcp.json"), `{ // con comentarios\n "servers": { "pg": ${JSON.stringify({ type: "stdio", ...ninguno })}, }, }`, "utf-8");
    fs.writeFileSync(path.join(entorno.home, ".claude.json"), JSON.stringify({ numStartups: 3, mcpServers: { pg: coincide }, projects: { "C:/trabajo/app": { mcpServers: { pg: pisa } }, "C:/otro": { mcpServers: {} } } }), "utf-8");

    const r = await pedirAjustes({ entornoInit: () => entorno });
    const [claude, cursor, vscode] = r.clientes;
    assert.deepEqual([claude!.cliente, claude!.archivo, claude!.lectura], ["claude-code", "~/.claude.json", "leido"]);
    assert.deepEqual(
      claude!.entradas.map((e) => [e.clave, e.ambito, e.carpeta, e.variables.map((v) => `${v.campo}:${v.estado}`)]),
      [
        ["pg", "usuario", null, ["documentacion:coincide", "subcarpetaTareas:sin-valor-en-maquina"]],
        ["pg", "local", "C:/trabajo/app", ["documentacion:pisa", "carpetaDeRepos:coincide", "idioma:pisa"]],
      ]
    );
    assert.deepEqual([cursor!.archivo, cursor!.lectura, cursor!.entradas.length], ["~/.cursor/mcp.json", "leido", 1], "la entrada de otro servidor no cuenta");
    assert.deepEqual(cursor!.entradas[0]!.variables.map((v) => [v.variable, v.valor, v.estado]), [["PHASE_GATE_DOCS_PATH", otra, "pisa"], ["PHASE_GATE_REPOS_PATH", repos, "coincide"], ["PHASE_GATE_LANG", "en", "pisa"]]);
    assert.deepEqual([vscode!.lectura, vscode!.entradas.map((e) => [e.clave, e.variables])], ["leido", [["pg", []]]], "un env que no habla de rutas ni de idioma no pisa nada");

    // Un archivo roto se dice, sin romper la respuesta.
    fs.writeFileSync(path.join(entorno.home, ".cursor", "mcp.json"), "{ roto", "utf-8");
    assert.equal((await pedirAjustes({ entornoInit: () => entorno })).clientes[1]!.lectura, "ilegible");
    assert.equal(fs.readFileSync(path.join(entorno.home, ".cursor", "mcp.json"), "utf-8"), "{ roto", "solo lee");
  });

  it("por sesión: cualquier cliente con un servidor abierto, con lo que recibió al arrancar; uno 3.x no dice nada", async () => {
    const { docs, repos, config } = await instalacion();
    const otra = carpetaTemporal("otra-docs");
    maquina(config, { version: 2, rutas: { documentacion: docs, carpetaDeRepos: repos } });

    const r = await pedirAjustes({
      entornoInit: () => entornoInitDePrueba(),
      sesiones: () => [sesion(11, { documentacion: otra, carpetaDeRepos: repos }), sesion(12), sesion(13, { subcarpetaTareas: "Cosas" })],
    });
    assert.deepEqual(
      r.sesiones.map((s) => [s.pid, s.sinRutas, s.variables.map((v) => `${v.campo}:${v.estado}`)]),
      [[11, false, ["documentacion:pisa", "carpetaDeRepos:coincide"]], [12, true, []], [13, false, ["subcarpetaTareas:sin-valor-en-maquina"]]]
    );
  });

  it("las variables avanzadas: valor, origen y cómo cambiarlas, sin editarlas", async () => {
    await instalacion();
    const estadoPropio = carpetaTemporal("estado-propio");
    process.env.PHASE_GATE_STATE_PATH = estadoPropio;
    process.env.PHASE_GATE_ELICITATION = "off";
    const r = await pedirAjustes({ entornoInit: () => entornoInitDePrueba() });

    assert.deepEqual(r.avanzadas.map((a) => a.variable), ["PHASE_GATE_PROMPTS_PATH", "PHASE_GATE_STATE_PATH", "PHASE_GATE_CONFIG_PATH", "PHASE_GATE_ELICITATION", "PHASE_GATE_LANG"]);
    const estado = r.avanzadas.find((a) => a.logica === "STATE_PATH")!;
    assert.deepEqual([estado.valor, estado.usada, estado.fuente], [estadoPropio, "PHASE_GATE_STATE_PATH", "entorno"]);
    assert.equal(r.avanzadas.find((a) => a.logica === "PROMPTS_PATH")!.fuente, "sin definir");
    assert.match(estado.comoCambiarla, /No se edita desde Ajustes\. Se cambia en el bloque "env" del mcp\.json de tu cliente .*: PHASE_GATE_STATE_PATH\./);
    assert.ok(r.avanzadas.every((a) => a.descripcion.length > 20));
  });

  it("con un machine.json roto: lo dice, sin las rutas del equipo; y /api/proyectos no lleva las rutas de las sesiones", async () => {
    const { config } = await instalacion();
    fs.writeFileSync(path.join(config, "machine.json"), '{\n  "version": 2,\n  "rutas": }', "utf-8");
    const r = await pedirAjustes({ entornoInit: () => entornoInitDePrueba(), sesiones: () => [sesion(21, { documentacion: "/x" })] });
    assert.equal(r.maquina.estado, "invalido");
    assert.match(r.maquina.error ?? "", /machine\.json no es válido \(<configuración>.machine\.json\): no es un JSON válido: carácter inesperado «\}» \(línea 3, columna 12\)/);
    assert.ok(!(r.maquina.error ?? "").includes(config));

    const s = await studioConApi({ entornoInit: () => entornoInitDePrueba(), sesiones: () => [sesion(21, { documentacion: "/x" })] });
    const proyectos = await s.get("/api/proyectos");
    assert.deepEqual(Object.keys(ProyectosRespuesta.parse(proyectos.json).proyectos.find((p) => p.nombre === "P")!.sesiones[0]!).sort(), ["actualizado", "cliente", "desde", "pid", "proyecto"]);
    assert.ok(!proyectos.texto.includes('"rutas"'), "las rutas de una sesión no salen por /api/proyectos");
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
      "/api/ajustes",
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
