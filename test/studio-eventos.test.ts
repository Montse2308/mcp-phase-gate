// Los eventos en vivo del Studio (§7.5.1 del plan): la agrupación de 300 ms, los tipos de evento, el
// ruido de OneDrive y el sondeo de respaldo, con un vigilante simulado; el SSE, por HTTP de verdad; y una
// prueba con fs.watch real. Cada test cierra sus eventos y sus servidores: un temporizador o un watcher
// abierto colgaría node --test.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { configDir, fijarRaizDelPaquete, stateDir, stateFile } from "../src/config.js";
import { crearEventos, esRuido, traducir, vigilarPorCarpetas } from "../src/studio/eventos.js";
import type { Eventos, Vigilante } from "../src/studio/eventos.js";
import { carpetaTemporal, crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno, promptsTemporales } from "./helpers.js";
import { studioConApi } from "./studio-ayudas.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const abiertos: Eventos[] = [];
afterEach(() => {
  for (const e of abiertos.splice(0)) e.cerrar();
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Un vigilante que solo avisa cuando el test se lo pide.
function simulado() {
  const avisos: ((ruta: string | null) => void)[] = [];
  const fallos: ((error: Error) => void)[] = [];
  const raices: string[] = [];
  const vigilar: Vigilante = (raiz, alCambiar, alFallar) => {
    raices.push(raiz);
    avisos.push(alCambiar);
    fallos.push(alFallar);
    return { cerrar: () => {} };
  };
  return { vigilar, raices, avisar: (ruta: string) => avisos.forEach((a) => a(ruta)), fallar: () => fallos.forEach((f) => f(new Error("EPERM"))) };
}

// Una conexión SSE de mentira sobre la que escribe `manejar`.
type Recibido = { tipo: string; datos: unknown };
function oyente(eventos: Eventos): { recibidos: Recibido[]; textos: string[] } {
  const textos: string[] = [];
  const recibidos: Recibido[] = [];
  const res = {
    writeHead: () => res,
    write: (t: string) => {
      textos.push(t);
      const m = t.match(/^event: (\w+)\ndata: (.*)\n\n$/);
      if (m) recibidos.push({ tipo: m[1]!, datos: JSON.parse(m[2]!) });
      return true;
    },
    on: () => res,
    end: () => {},
  };
  const req = { on: () => req };
  eventos.manejar(req as unknown as http.IncomingMessage, res as unknown as http.ServerResponse);
  return { recibidos, textos };
}

function instalacion() {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  estadoTemporal();
  crearProyecto(docs, "P");
  const tarea = crearTarea(docs, "P", "t", ["00 - Contexto Inicial.md"]);
  fs.mkdirSync(path.join(tarea, "04 - Ejecución"));
  return { docs, tarea };
}

function escribir(ruta: string, texto = `${Math.random()}`): string {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, texto, "utf-8");
  return ruta;
}

describe("eventos: agrupación y tipos", () => {
  it("los avisos de un mismo archivo se juntan durante 300 ms en un solo evento", async () => {
    const { tarea } = instalacion();
    const s = simulado();
    const eventos = crearEventos({ vigilar: s.vigilar });
    abiertos.push(eventos);
    const { recibidos } = oyente(eventos);
    const doc = escribir(path.join(tarea, "01 - Análisis Técnico.md"));
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) {
      s.avisar(doc);
      await esperar(20);
    }
    await esperar(100);
    assert.equal(recibidos.length, 0, "antes de 300 ms no sale nada");
    await esperar(250);
    assert.deepEqual(recibidos, [{ tipo: "documento", datos: { p: "P", t: "t", archivo: "01 - Análisis Técnico.md" } }]);
    assert.ok(Date.now() - t0 >= 300);
  });

  it("los siete tipos: documento, recibo, config, prompts, equipo, sesiones y punteros", async () => {
    const { docs, tarea } = instalacion();
    const global = promptsTemporales({});
    const s = simulado();
    const eventos = crearEventos({ vigilar: s.vigilar });
    abiertos.push(eventos);
    const { recibidos } = oyente(eventos);
    for (const ruta of [
      path.join(tarea, "02 - Decisiones.md"),
      path.join(tarea, "04 - Ejecución", "L02 - el segundo.md"),
      path.join(docs, "P", "phase-gate.json"),
      path.join(docs, "P", ".phase-gate", "prompts", "bloques.md"),
      path.join(global, "bloques.md"),
      path.join(configDir(), "machine.json"),
      path.join(configDir(), "presets", "mio.md"),
      path.join(stateDir(), "sesiones", "1234.json"),
      stateFile(),
    ]) {
      s.avisar(escribir(ruta));
    }
    await esperar(450);
    const vistos = recibidos.map((r) => `${r.tipo} ${JSON.stringify(r.datos)}`).sort();
    assert.deepEqual(vistos, [
      'config {"p":"P"}',
      'documento {"p":"P","t":"t","archivo":"02 - Decisiones.md"}',
      "equipo {}",
      "prompts {}",
      "punteros {}",
      'recibo {"p":"P","t":"t","lote":"L02"}',
      "sesiones {}",
    ]);
  });

  it("vigila la Documentación, la capa global, la configuración y el estado, sin una carpeta dentro de otra", () => {
    const { docs } = instalacion();
    const global = promptsTemporales({});
    const s = simulado();
    abiertos.push(crearEventos({ vigilar: s.vigilar }));
    for (const esperada of [docs, global, configDir(), stateDir()]) assert.ok(s.raices.includes(path.resolve(esperada)), esperada);
    // Con el estado dentro de la configuración (como en Windows por defecto), una sola raíz.
    limpiarEntorno();
    instalacion();
    process.env.ORQUESTADOR_STATE_PATH = path.join(configDir(), "estado");
    fs.mkdirSync(stateDir(), { recursive: true });
    const otro = simulado();
    abiertos.push(crearEventos({ vigilar: otro.vigilar }));
    assert.ok(!otro.raices.includes(path.resolve(stateDir())));
    assert.ok(otro.raices.includes(path.resolve(configDir())));
  });
});

describe("eventos: machine.json", () => {
  it("cambia la Documentación en machine.json: emite equipo, vigila la carpeta nueva, deja la vieja y recibe eventos de la nueva", async () => {
    fijarRaizDelPaquete(RAIZ);
    estadoTemporal();
    const vieja = carpetaTemporal("docs-vieja");
    const nueva = carpetaTemporal("docs-nueva");
    crearProyecto(vieja, "P");
    crearProyecto(nueva, "P2");
    const tareaNueva = crearTarea(nueva, "P2", "t", ["00 - Contexto Inicial.md"]);
    const archivo = path.join(configDir(), "machine.json");
    fs.writeFileSync(archivo, JSON.stringify({ version: 2, rutas: { documentacion: vieja } }), "utf-8");

    const abiertas: string[] = [];
    const cerradas: string[] = [];
    const avisos: ((ruta: string | null) => void)[] = [];
    const vigilar: Vigilante = (raiz, alCambiar) => {
      abiertas.push(raiz);
      avisos.push(alCambiar);
      return { cerrar: () => void cerradas.push(raiz) };
    };
    const eventos = crearEventos({ vigilar });
    abiertos.push(eventos);
    const { recibidos } = oyente(eventos);
    assert.ok(abiertas.includes(path.resolve(vieja)) && !abiertas.includes(path.resolve(nueva)));
    const avisar = (ruta: string) => avisos.forEach((a) => a(ruta));

    // Cambia la Documentación en machine.json, sin reiniciar nada.
    await esperar(30);
    fs.writeFileSync(archivo, JSON.stringify({ version: 2, rutas: { documentacion: nueva } }), "utf-8");
    avisar(archivo);
    await esperar(450);
    assert.deepEqual(recibidos.map((r) => r.tipo), ["equipo"]);
    assert.ok(abiertas.includes(path.resolve(nueva)), "vigila la Documentación nueva");
    assert.deepEqual(cerradas, [path.resolve(vieja)], "y deja de vigilar la vieja");
    assert.equal(eventos.estado(), "activo");

    // Lo que pasa en la carpeta nueva llega como evento de dominio, con el nombre de su proyecto.
    recibidos.length = 0;
    avisar(escribir(path.join(tareaNueva, "01 - Análisis Técnico.md")));
    await esperar(450);
    assert.deepEqual(recibidos, [{ tipo: "documento", datos: { p: "P2", t: "t", archivo: "01 - Análisis Técnico.md" } }]);

    // Un machine.json roto no cambia las carpetas: el proceso sigue con la última válida.
    recibidos.length = 0;
    const antes = abiertas.length;
    await esperar(30);
    fs.writeFileSync(archivo, "{ roto", "utf-8");
    avisar(archivo);
    await esperar(450);
    assert.deepEqual(recibidos.map((r) => r.tipo), ["equipo"]);
    assert.equal(abiertas.length, antes, "no se abrió ninguna carpeta más");
    assert.deepEqual(cerradas, [path.resolve(vieja)], "ni se cerró otra");
  });

  it("los cambios de machine.json son del tipo equipo, y los presets y la capa global siguen siendo prompts", () => {
    instalacion();
    assert.deepEqual(traducir(path.join(configDir(), "machine.json")), { tipo: "equipo", datos: {} });
    assert.deepEqual(traducir(path.join(configDir(), "presets", "mio.md")), { tipo: "prompts", datos: {} });
    assert.deepEqual(traducir(path.join(configDir(), "prompts", "bloques.md")), { tipo: "prompts", datos: {} });
  });
});

describe("eventos: el ruido de OneDrive", () => {
  it("desktop.ini, Thumbs.db, ~$*, *.tmp y los archivos con punto de una tarea no son eventos", async () => {
    const { tarea } = instalacion();
    const s = simulado();
    const eventos = crearEventos({ vigilar: s.vigilar });
    abiertos.push(eventos);
    const { recibidos } = oyente(eventos);
    for (const nombre of ["desktop.ini", "Thumbs.db", "~$cambios.docx", "nota.tmp", ".01 - Análisis Técnico.md.1234.abcd.tmp", ".record_batch.lock", "DESKTOP.INI"]) {
      s.avisar(escribir(path.join(tarea, nombre)));
    }
    await esperar(450);
    assert.deepEqual(recibidos, []);
    assert.ok(esRuido("C:/x/~$a.md") && esRuido("/x/Thumbs.db") && !esRuido("/x/02 - Decisiones.md"));
  });

  it("un aviso sin cambio de fecha ni tamaño no cuenta; un cambio de verdad, sí", async () => {
    const { tarea } = instalacion();
    // Un documento de antes de arrancar: OneDrive avisa al sincronizarlo, sin tocarlo.
    const viejo = escribir(path.join(tarea, "01 - Análisis Técnico.md"), "antes");
    const ayer = new Date(Date.now() - 86_400_000);
    fs.utimesSync(viejo, ayer, ayer);
    const s = simulado();
    const eventos = crearEventos({ vigilar: s.vigilar });
    abiertos.push(eventos);
    const { recibidos } = oyente(eventos);
    s.avisar(viejo);
    await esperar(400);
    assert.equal(recibidos.length, 0, "un archivo de antes de arrancar que no cambió");

    fs.writeFileSync(viejo, "después, con otro tamaño", "utf-8");
    s.avisar(viejo);
    await esperar(400);
    assert.equal(recibidos.length, 1);
    s.avisar(viejo); // otra vez, sin cambios
    await esperar(400);
    assert.equal(recibidos.length, 1, "el mismo estado no se avisa dos veces");
    fs.unlinkSync(viejo); // borrarlo sí es un cambio
    s.avisar(viejo);
    await esperar(400);
    assert.equal(recibidos.length, 2);
  });

  it("traducir: fuera de la Documentación, en una carpeta con punto o sin tarea no hay evento", () => {
    const { docs } = instalacion();
    assert.equal(traducir(path.join(docs, ".obsidian", "x.md")), null);
    assert.equal(traducir(path.join(docs, "P", "Proyectos", ".oculta", "x.md")), null);
    assert.equal(traducir(path.join(docs, "P", "otra", "x.md")), null);
    assert.equal(traducir(path.join(docs, "P")), null);
    assert.equal(traducir(path.join(path.dirname(docs), "fuera.md")), null);
  });
});

describe("eventos: el sondeo de respaldo", () => {
  it("con el watcher callado, el sondeo ve el cambio de una tarea activa, lo emite y marca el watcher degradado", async () => {
    const { tarea } = instalacion();
    const doc = escribir(path.join(tarea, "01 - Análisis Técnico.md"), "uno");
    const s = simulado(); // nunca avisa
    const eventos = crearEventos({ vigilar: s.vigilar, sondeoMs: 100 });
    abiertos.push(eventos);
    const { recibidos } = oyente(eventos);
    await esperar(250);
    assert.equal(eventos.estado(), "activo");
    assert.equal(recibidos.length, 0, "sin cambios, el sondeo no emite nada");
    fs.writeFileSync(doc, "dos, más largo", "utf-8");
    fs.writeFileSync(path.join(tarea, "04 - Ejecución", "L01 - x.md"), "x", "utf-8");
    await esperar(300);
    // El recibo es nuevo: el sondeo lo ve al recalcular; el documento cambiado, en la primera vuelta.
    assert.deepEqual(recibidos[0], { tipo: "documento", datos: { p: "P", t: "t", archivo: "01 - Análisis Técnico.md" } });
    assert.equal(eventos.estado(), "degradado");
  });

  it("si el watcher ya avisó, el sondeo no lo repite ni marca degradado", async () => {
    const { tarea } = instalacion();
    const doc = escribir(path.join(tarea, "01 - Análisis Técnico.md"), "uno");
    const s = simulado();
    const eventos = crearEventos({ vigilar: s.vigilar, sondeoMs: 400 });
    abiertos.push(eventos);
    const { recibidos } = oyente(eventos);
    fs.writeFileSync(doc, "dos, más largo", "utf-8");
    s.avisar(doc);
    await esperar(900);
    assert.equal(recibidos.length, 1);
    assert.equal(eventos.estado(), "activo");
  });

  it("un watcher que falla deja el estado en degradado; sin ninguno, apagado", () => {
    instalacion();
    const s = simulado();
    const eventos = crearEventos({ vigilar: s.vigilar });
    abiertos.push(eventos);
    assert.equal(eventos.estado(), "activo");
    s.fallar();
    assert.equal(eventos.estado(), "apagado");
    const roto: Vigilante = () => {
      throw new Error("ERR_FEATURE_UNAVAILABLE_ON_PLATFORM");
    };
    const sinNinguno = crearEventos({ vigilar: roto });
    abiertos.push(sinNinguno);
    assert.equal(sinNinguno.estado(), "apagado");
  });
});

// ─── SSE por HTTP ───────────────────────────────────────────────────────────
function conectarSse(puerto: number, cookie: string | null): Promise<{ estado: number; leer: () => string; cerrar: () => void }> {
  return new Promise((resolver, rechazar) => {
    const req = http.get({ host: "127.0.0.1", port: puerto, path: "/api/eventos", headers: cookie ? { Cookie: cookie } : {} }, (res) => {
      let texto = "";
      res.setEncoding("utf-8");
      res.on("data", (d) => (texto += d));
      res.on("error", () => {});
      resolver({ estado: res.statusCode ?? 0, leer: () => texto, cerrar: () => req.destroy() });
    });
    req.on("error", rechazar);
  });
}

describe("eventos: SSE", () => {
  it("con la sesión, el navegador recibe los eventos y el latido; sin ella, 401", async () => {
    instalacion();
    const eventos = crearEventos({ vigilar: simulado().vigilar, latidoMs: 80 });
    abiertos.push(eventos);
    const s = await studioConApi({ eventos: (p, res) => eventos.manejar(p.req, res) });
    assert.equal((await conectarSse(s.puerto, null)).estado, 401);
    const sse = await conectarSse(s.puerto, s.cookie);
    assert.equal(sse.estado, 200);
    eventos.emitir({ tipo: "config", datos: { p: "P" } });
    await esperar(200);
    assert.match(sse.leer(), /^: conectado\n\n/);
    assert.match(sse.leer(), /event: config\ndata: \{"p":"P"\}\n\n/);
    assert.match(sse.leer(), /: latido\n\n/);
    sse.cerrar();
  });

  it("tiene un tope de conexiones: la de más es 503, y al cerrar una queda sitio", async () => {
    instalacion();
    const eventos = crearEventos({ vigilar: simulado().vigilar, maxConexiones: 2 });
    abiertos.push(eventos);
    const s = await studioConApi({ eventos: (p, res) => eventos.manejar(p.req, res) });
    const a = await conectarSse(s.puerto, s.cookie);
    const b = await conectarSse(s.puerto, s.cookie);
    assert.equal(eventos.conexiones(), 2);
    const c = await conectarSse(s.puerto, s.cookie);
    assert.equal(c.estado, 503);
    a.cerrar();
    await esperar(100);
    assert.equal(eventos.conexiones(), 1);
    const d = await conectarSse(s.puerto, s.cookie);
    assert.equal(d.estado, 200);
    b.cerrar();
    d.cerrar();
  });
});

describe("eventos: con fs.watch de verdad", () => {
  it("un documento nuevo en una tarea llega como evento", async (t) => {
    const { tarea } = instalacion();
    let eventos: Eventos;
    try {
      eventos = crearEventos();
    } catch (error) {
      t.skip(`fs.watch recursivo no está disponible: ${String(error)}`);
      return;
    }
    abiertos.push(eventos);
    if (eventos.estado() === "apagado") {
      t.skip("fs.watch recursivo no está disponible en este sistema");
      return;
    }
    const { recibidos } = oyente(eventos);
    await esperar(200);
    escribir(path.join(tarea, "02 - Decisiones.md"), "# Decisiones\n");
    const limite = Date.now() + 5000;
    while (!recibidos.length && Date.now() < limite) await esperar(50);
    assert.deepEqual(recibidos[0], { tipo: "documento", datos: { p: "P", t: "t", archivo: "02 - Decisiones.md" } });
  });

  it("un phase-gate.json reemplazado con un rename sigue avisando después: el siguiente cambio también llega", async (t) => {
    const { docs } = instalacion();
    const manifiesto = escribir(path.join(docs, "P", "phase-gate.json"), '{"version":1}\n');
    let eventos: Eventos;
    try {
      eventos = crearEventos();
    } catch (error) {
      t.skip(`fs.watch no está disponible: ${String(error)}`);
      return;
    }
    abiertos.push(eventos);
    if (eventos.estado() === "apagado") {
      t.skip("fs.watch no está disponible en este sistema");
      return;
    }
    const { recibidos } = oyente(eventos);
    const deConfig = () => recibidos.filter((r) => r.tipo === "config").length;
    const hasta = async (n: number) => {
      const limite = Date.now() + 5000;
      while (deConfig() < n && Date.now() < limite) await esperar(50);
      assert.equal(deConfig(), n);
    };
    await esperar(200);
    // Como la escritura atómica: un temporal que se renombra encima.
    escribir(`${manifiesto}.tmp`, '{"version":1,"preset":"software"}\n');
    fs.renameSync(`${manifiesto}.tmp`, manifiesto);
    await hasta(1);
    await esperar(400);
    escribir(manifiesto, '{"version":1,"preset":"software-tdd"}\n');
    await hasta(2);
  });
});

describe("eventos: el vigilante por carpetas (el de Linux)", () => {
  const avisosDe = (raiz: string) => {
    const rutas: string[] = [];
    const vigilante = vigilarPorCarpetas(raiz, (r) => void (r !== null && rutas.push(r)), () => {});
    return { rutas, cerrar: vigilante.cerrar };
  };
  const hasta = async (rutas: string[], ruta: string, desde = 0) => {
    const limite = Date.now() + 5000;
    while (!rutas.slice(desde).includes(ruta) && Date.now() < limite) await esperar(50);
    assert.ok(rutas.slice(desde).includes(ruta), `no avisó de ${ruta}: ${rutas.join(", ")}`);
  };

  it("un archivo reemplazado con un rename se sigue viendo, porque se vigila la carpeta y no el archivo", async () => {
    const raiz = carpetaTemporal("vigilante");
    const archivo = escribir(path.join(raiz, "P", "phase-gate.json"), "1");
    const v = avisosDe(raiz);
    try {
      await esperar(100);
      escribir(`${archivo}.tmp`, "2");
      fs.renameSync(`${archivo}.tmp`, archivo);
      await hasta(v.rutas, archivo);
      await esperar(200);
      const antes = v.rutas.length;
      escribir(archivo, "3");
      await hasta(v.rutas, archivo, antes);
    } finally {
      v.cerrar();
    }
  });

  it("una carpeta nueva se vigila, y avisa de lo que ya traía", async () => {
    const raiz = carpetaTemporal("vigilante");
    const v = avisosDe(raiz);
    try {
      await esperar(100);
      const dentro = escribir(path.join(raiz, "OTRO", "Proyectos", "una", "00 - Contexto Inicial.md"), "# Una\n");
      await hasta(v.rutas, dentro);
      await esperar(200);
      const antes = v.rutas.length;
      const despues = escribir(path.join(raiz, "OTRO", "Proyectos", "una", "01 - Descubrimiento.md"), "# Dos\n");
      await hasta(v.rutas, despues, antes);
    } finally {
      v.cerrar();
    }
  });
});
