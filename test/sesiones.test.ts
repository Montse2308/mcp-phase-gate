// El registro de sesiones MCP abiertas (§7.4 del plan): el servidor lo escribe al conocer las raíces y lo
// borra al salir; el Studio solo cree a las sesiones vivas y recientes, y limpia las demás sin seguir
// enlaces. Lo que se afirma entre procesos se prueba con procesos node de verdad.

import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { fijarRaizDelPaquete } from "../src/config.js";
import { crearServidor } from "../src/servidor.js";
import { CADUCIDAD_MS, carpetaDeSesiones, escribirAtomico, pidVivo, registrarSesion, sesionesAbiertas } from "../src/sesiones.js";
import type { Escritor, OpcionesDeRegistro } from "../src/sesiones.js";
import { carpetaTemporal, crearProyecto, crearSymlink, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BINARIO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "index.js");

const cerrables: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cerrar of cerrables.splice(0)) await cerrar();
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function hasta(condicion: () => boolean, ms = 5000): Promise<boolean> {
  const limite = Date.now() + ms;
  while (!condicion() && Date.now() < limite) await esperar(25);
  return condicion();
}

// Un proceso de mentira para que el registro no enganche nada al proceso de los tests.
function procesoFalso() {
  const oyentes = new Map<string, (() => void)[]>();
  const proceso = {
    on: (evento: string, oyente: () => void) => {
      oyentes.set(evento, [...(oyentes.get(evento) ?? []), oyente]);
      return proceso;
    },
    once: (evento: string, oyente: () => void) => proceso.on(evento, oyente),
    exit: (codigo?: number) => {
      salidas.push(codigo ?? 0);
    },
    stdin: { on: (evento: string, oyente: () => void) => proceso.on(`stdin:${evento}`, oyente) },
    lanzar: (evento: string) => (oyentes.get(evento) ?? []).forEach((o) => o()),
  };
  const salidas: number[] = [];
  return { proceso: proceso as unknown as NonNullable<OpcionesDeRegistro["proceso"]> & { lanzar: (e: string) => void }, salidas };
}

function instalacion() {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  estadoTemporal();
  crearProyecto(docs, "P");
  const repos = carpetaTemporal("repos");
  process.env.PHASE_GATE_REPOS_PATH = repos;
  fs.mkdirSync(path.join(repos, "api"));
  fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, repos: [{ id: "api", dir: "api" }] }), "utf-8");
  return { docs, repos, api: fs.realpathSync.native(path.join(repos, "api")) };
}

// Un servidor con el registro y un cliente con raíces, por un transporte en memoria.
async function sesionEnMemoria(raices: { actuales: string[] }, opciones: OpcionesDeRegistro = {}) {
  const servidor = crearServidor();
  const { proceso, salidas } = procesoFalso();
  const registro = registrarSesion(servidor, { proceso, ...opciones });
  const cliente = new Client({ name: "cliente-de-prueba", version: "1.0.0" }, { capabilities: { roots: { listChanged: true } } });
  cliente.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: raices.actuales.map((r) => ({ uri: pathToFileURL(r).href })) }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(b), cliente.connect(a)]);
  const cerrar = async () => {
    registro.cerrar();
    await cliente.close();
    await servidor.close();
  };
  cerrables.push(cerrar);
  return { servidor, cliente, registro, proceso, salidas, cerrar };
}

const leerArchivo = (pid: number) => JSON.parse(fs.readFileSync(path.join(carpetaDeSesiones(), `${pid}.json`), "utf-8"));

describe("sesiones: el servidor las escribe", () => {
  it("al recibir las raíces: pid, cliente, raíces, el proyecto deducido y las fechas; nada de la conversación", async () => {
    const { api } = instalacion();
    await sesionEnMemoria({ actuales: [api] }, { pid: 4242 });
    const archivo = path.join(carpetaDeSesiones(), "4242.json");
    assert.ok(await hasta(() => fs.existsSync(archivo)));
    const datos = leerArchivo(4242);
    assert.deepEqual(Object.keys(datos).sort(), ["actualizado", "cliente", "desde", "pid", "proyecto", "raices"]);
    assert.equal(datos.pid, 4242);
    assert.equal(datos.cliente, "cliente-de-prueba 1.0.0");
    assert.deepEqual(datos.raices, [api]);
    assert.equal(datos.proyecto, "P");
    assert.ok(!Number.isNaN(Date.parse(datos.desde)) && !Number.isNaN(Date.parse(datos.actualizado)));
  });

  it("un cliente sin roots también queda registrado, sin proyecto", async () => {
    instalacion();
    const servidor = crearServidor();
    const { proceso } = procesoFalso();
    const registro = registrarSesion(servidor, { pid: 4343, proceso });
    const cliente = new Client({ name: "sin-roots", version: "2" }, { capabilities: {} });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([servidor.connect(b), cliente.connect(a)]);
    cerrables.push(async () => {
      registro.cerrar();
      await cliente.close();
      await servidor.close();
    });
    assert.ok(await hasta(() => fs.existsSync(path.join(carpetaDeSesiones(), "4343.json"))));
    assert.deepEqual({ ...leerArchivo(4343), desde: "", actualizado: "" }, { pid: 4343, cliente: "sin-roots 2", raices: [], proyecto: null, desde: "", actualizado: "" });
  });

  it("como mucho una escritura por intervalo: un cambio de raíces dentro de él se escribe al acabarlo", async () => {
    const { api } = instalacion();
    const raices = { actuales: [api] };
    const llamadas: string[] = [];
    const escribir: Escritor = async (ruta, contenido) => {
      llamadas.push(JSON.parse(contenido).proyecto);
      await escribirAtomico(ruta, contenido);
    };
    const { cliente } = await sesionEnMemoria(raices, { pid: 4444, intervaloMs: 400, escribir });
    assert.ok(await hasta(() => llamadas.length === 1));
    raices.actuales = [carpetaTemporal("otra")];
    await cliente.sendRootsListChanged();
    await esperar(150);
    assert.equal(llamadas.length, 1, "dentro del intervalo no se escribe otra vez");
    assert.ok(await hasta(() => llamadas.length === 2, 1000), "se escribe al acabar el intervalo");
    assert.deepEqual(llamadas, ["P", null]);
    // La escritura es asíncrona: el archivo cambia cuando termina.
    assert.ok(await hasta(() => leerArchivo(4444).proyecto === null, 1000));
  });

  it("se refresca cada intervalo, para no caducar en una sesión larga", async () => {
    const { api } = instalacion();
    let veces = 0;
    await sesionEnMemoria({ actuales: [api] }, { pid: 4545, intervaloMs: 120, escribir: async (r, c) => { veces++; await escribirAtomico(r, c); } });
    assert.ok(await hasta(() => veces >= 3, 2000), `escrituras: ${veces}`);
  });

  it("se borra al salir: exit, SIGINT (sale con 130), SIGTERM (143) y el cierre de stdin", async () => {
    const { api } = instalacion();
    for (const [evento, codigo] of [["exit", null], ["SIGINT", 130], ["SIGTERM", 143], ["stdin:end", null]] as const) {
      const pid = 4600 + (codigo ?? 0) + evento.length;
      const { proceso, salidas } = await sesionEnMemoria({ actuales: [api] }, { pid });
      const archivo = path.join(carpetaDeSesiones(), `${pid}.json`);
      assert.ok(await hasta(() => fs.existsSync(archivo)), evento);
      proceso.lanzar(evento);
      assert.equal(fs.existsSync(archivo), false, `${evento} lo borra`);
      if (codigo !== null) assert.deepEqual(salidas, [codigo]);
    }
  });

  it("un fallo al escribir no tumba el servidor ni retrasa una respuesta", async () => {
    const { api } = instalacion();
    // Una escritura que nunca termina, y otra que falla: las tools responden igual y a tiempo.
    for (const escribir of [() => new Promise<void>(() => {}), async () => { throw new Error("EACCES"); }] as Escritor[]) {
      const { cliente, registro } = await sesionEnMemoria({ actuales: [api] }, { pid: 4700, escribir });
      assert.ok(await hasta(() => registro.escrituras() >= 1));
      const t0 = Date.now();
      const r = await cliente.callTool({ name: "list_tasks", arguments: {} });
      assert.ok(Date.now() - t0 < 2000);
      assert.equal(r.isError, undefined);
    }
    // Y con la carpeta de estado convertida en un archivo (ENOTDIR de verdad).
    const estado = carpetaTemporal("estado-roto");
    const archivo = path.join(estado, "no-es-carpeta");
    fs.writeFileSync(archivo, "x", "utf-8");
    process.env.ORQUESTADOR_STATE_PATH = archivo;
    const { cliente, registro } = await sesionEnMemoria({ actuales: [api] }, { pid: 4701 });
    assert.ok(await hasta(() => registro.escrituras() >= 1));
    await esperar(100);
    assert.equal((await cliente.callTool({ name: "list_tasks", arguments: {} })).isError, undefined);
  });
});

// ─── El Studio las lee ──────────────────────────────────────────────────────
function sesionValida(pid: number, actualizado = new Date().toISOString()) {
  return JSON.stringify({ pid, cliente: "claude-code 2.1.0", raices: [], proyecto: "P", desde: actualizado, actualizado });
}

describe("sesiones: el Studio las lee como entrada no confiable", () => {
  it("solo cree a las vivas y recientes; las demás las ignora y, si se le pide, las borra", () => {
    instalacion();
    const carpeta = carpetaDeSesiones();
    fs.mkdirSync(carpeta, { recursive: true });
    const vivos = new Set([111, 222, 333, 444]);
    const once = new Date(Date.now() - CADUCIDAD_MS - 60_000).toISOString();
    const futuro = new Date(Date.now() + 10 * 60_000).toISOString();
    const escribir = (nombre: string, contenido: string | Buffer) => fs.writeFileSync(path.join(carpeta, nombre), contenido);
    escribir("111.json", sesionValida(111)); // la buena
    escribir("222.json", sesionValida(222, once)); // caducada
    escribir("333.json", sesionValida(333, futuro)); // del futuro
    escribir("555.json", sesionValida(555)); // pid muerto
    escribir("444.json", sesionValida(999)); // el pid no es el del nombre
    for (const nombre of ["abc.json", "0.json", "-1.json", "0123.json", "12345678901.json", "111.json.bak", "nota.txt"]) escribir(nombre, sesionValida(111));
    escribir("666.json", "{ roto");
    escribir("667.json", JSON.stringify({ ...JSON.parse(sesionValida(667)), extra: "conversación" }));
    escribir("668.json", JSON.stringify({ ...JSON.parse(sesionValida(668)), raices: "C:\\" }));
    // Válido, pero con 20 kB de relleno: solo el tope de tamaño lo rechaza.
    escribir("669.json", `${sesionValida(669)}${" ".repeat(20_000)}`);
    vivos.add(666).add(667).add(668).add(669);

    const vistas = sesionesAbiertas({ vivo: (pid) => vivos.has(pid) });
    assert.deepEqual(vistas.map((s) => s.pid), [111]);
    assert.deepEqual(Object.keys(vistas[0]!).sort(), ["actualizado", "cliente", "desde", "pid", "proyecto"]);
    assert.ok(fs.readdirSync(carpeta).length > 1, "sin borrar: leer no toca nada");

    sesionesAbiertas({ vivo: (pid) => vivos.has(pid), borrar: true });
    assert.deepEqual(fs.readdirSync(carpeta), ["111.json"]);
  });

  it("borra sin seguir enlaces: ni el destino de un enlace ni lo que hay tras una junction; una carpeta de verdad no se toca", (t) => {
    instalacion();
    const carpeta = carpetaDeSesiones();
    fs.mkdirSync(carpeta, { recursive: true });
    const fuera = carpetaTemporal("fuera");
    fs.writeFileSync(path.join(fuera, "importante.txt"), "no se borra", "utf-8");
    crearSymlink(fuera, path.join(carpeta, "123.json")); // una junction con nombre de sesión
    fs.mkdirSync(path.join(carpeta, "456.json")); // una carpeta de verdad
    fs.writeFileSync(path.join(carpeta, "456.json", "dentro.txt"), "x", "utf-8");
    let conEnlaceDeArchivo = true;
    try {
      fs.symlinkSync(path.join(fuera, "importante.txt"), path.join(carpeta, "789.json"), "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      conEnlaceDeArchivo = false;
      t.diagnostic("sin permiso para un enlace simbólico de archivo: solo se probó la junction");
    }
    assert.deepEqual(sesionesAbiertas({ vivo: () => true, borrar: true }), []);
    assert.equal(fs.readFileSync(path.join(fuera, "importante.txt"), "utf-8"), "no se borra");
    assert.ok(fs.existsSync(path.join(carpeta, "456.json", "dentro.txt")));
    assert.ok(!fs.existsSync(path.join(carpeta, "123.json")), "la junction se quitó");
    if (conEnlaceDeArchivo) assert.ok(!fs.existsSync(path.join(carpeta, "789.json")), "el enlace se quitó");
  });

  it("un temporal de una escritura en curso no se toca; uno de hace más de un minuto, sí", () => {
    instalacion();
    const carpeta = carpetaDeSesiones();
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, ".111.json.ab12.tmp"), "{", "utf-8");
    const viejo = path.join(carpeta, ".222.json.cd34.tmp");
    fs.writeFileSync(viejo, "{", "utf-8");
    const hace = new Date(Date.now() - 120_000);
    fs.utimesSync(viejo, hace, hace);
    sesionesAbiertas({ vivo: () => true, borrar: true });
    assert.deepEqual(fs.readdirSync(carpeta), [".111.json.ab12.tmp"]);
  });

  it("pidVivo: el propio proceso está vivo, uno que terminó no, y EPERM cuenta como vivo", async () => {
    assert.equal(pidVivo(process.pid), true);
    const hijo = spawn(process.execPath, ["-e", "0"]);
    await new Promise((r) => hijo.on("exit", r));
    assert.equal(pidVivo(hijo.pid!), false);
    // El pid 4 (System) en Windows, o el 1 (init) fuera de él: de otro usuario, kill(…, 0) da EPERM.
    const ajeno = process.platform === "win32" ? 4 : 1;
    let codigo: string | undefined;
    try {
      process.kill(ajeno, 0);
    } catch (error) {
      codigo = (error as NodeJS.ErrnoException).code;
    }
    if (codigo === "EPERM") assert.equal(pidVivo(ajeno), true);
  });
});

// ─── El Studio de verdad ────────────────────────────────────────────────────
describe("sesiones: el Studio (ui) limpia al arrancar, y un GET no borra nada", () => {
  it("una huérfana de antes de arrancar desaparece; una que aparece después sigue ahí tras GET /api/proyectos", async () => {
    const { docs, repos } = instalacion();
    const carpeta = carpetaDeSesiones();
    fs.mkdirSync(carpeta, { recursive: true });
    const caducada = (pid: number) => sesionValida(pid, new Date(Date.now() - CADUCIDAD_MS - 60_000).toISOString());
    fs.writeFileSync(path.join(carpeta, "1001.json"), caducada(1001), "utf-8");
    const env = { ...process.env, PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: process.env.ORQUESTADOR_STATE_PATH, PHASE_GATE_CONFIG_PATH: process.env.PHASE_GATE_CONFIG_PATH };
    const ui = spawn(process.execPath, [BINARIO, "ui", "--no-abrir"], { env, stdio: ["ignore", "pipe", "pipe"] });
    cerrables.push(() => {
      if (ui.exitCode === null) ui.kill("SIGKILL");
    });
    let salida = "";
    ui.stdout!.on("data", (d) => (salida += d));
    ui.stderr!.on("data", () => {});
    assert.ok(await hasta(() => /token=/.test(salida), 10_000), salida);
    const url = new URL(salida.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)![0]);
    assert.equal(fs.existsSync(path.join(carpeta, "1001.json")), false, "la de antes se borró al arrancar");

    fs.writeFileSync(path.join(carpeta, "1002.json"), caducada(1002), "utf-8");
    const { pedir } = await import("./studio-ayudas.js");
    const canje = await pedir(Number(url.port), "GET", `/?token=${url.searchParams.get("token")}`);
    const cookie = String(canje.cabeceras["set-cookie"]![0]).split(";")[0]!;
    const r = await pedir(Number(url.port), "GET", "/api/proyectos", { Cookie: cookie });
    assert.equal(r.estado, 200);
    assert.ok(fs.existsSync(path.join(carpeta, "1002.json")), "el GET no la borró");
  });
});

// ─── Con procesos de verdad ─────────────────────────────────────────────────
// Como un cliente de verdad: initialize, se espera la respuesta, y después initialized.
function lanzarServidor(env: NodeJS.ProcessEnv): ChildProcess {
  const hijo = spawn(process.execPath, [BINARIO], { env, stdio: ["pipe", "pipe", "pipe"] });
  let salida = "";
  let enviado = false;
  hijo.stdout!.on("data", (d) => {
    salida += d;
    if (!enviado && salida.includes('"id":1')) {
      enviado = true;
      hijo.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    }
  });
  hijo.stderr!.on("data", () => {});
  hijo.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "proceso-de-prueba", version: "1" } } })}\n`);
  cerrables.push(() => {
    if (hijo.exitCode === null) hijo.kill("SIGKILL");
  });
  return hijo;
}

describe("sesiones: dos servidores MCP de verdad", () => {
  it("cada uno deja la suya; uno que muere de golpe deja un huérfano que el Studio descarta y borra; cerrar stdin borra la del otro", async () => {
    const { docs, repos } = instalacion();
    const estado = process.env.ORQUESTADOR_STATE_PATH!;
    const env = { ...process.env, PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: process.env.PHASE_GATE_CONFIG_PATH };
    const a = lanzarServidor(env);
    const b = lanzarServidor(env);
    const deA = path.join(carpetaDeSesiones(), `${a.pid}.json`);
    const deB = path.join(carpetaDeSesiones(), `${b.pid}.json`);
    assert.ok(await hasta(() => fs.existsSync(deA) && fs.existsSync(deB), 10_000), "los dos archivos");
    assert.deepEqual(sesionesAbiertas().map((s) => s.pid).sort(), [a.pid, b.pid].sort());
    assert.equal(sesionesAbiertas()[0]!.cliente, "proceso-de-prueba 1");

    // A muere sin poder limpiar (SIGKILL; en Windows, TerminateProcess).
    a.kill("SIGKILL");
    await new Promise((r) => a.on("exit", r));
    assert.ok(fs.existsSync(deA), "el huérfano sigue en el disco");
    assert.deepEqual(sesionesAbiertas({ borrar: true }).map((s) => s.pid), [b.pid]);
    assert.equal(fs.existsSync(deA), false, "y el Studio lo borró");

    // B: el cliente cierra stdin, el servidor sale y se lleva su archivo.
    b.stdin!.end();
    await new Promise((r) => b.on("exit", r));
    assert.equal(fs.existsSync(deB), false);
  });
});
