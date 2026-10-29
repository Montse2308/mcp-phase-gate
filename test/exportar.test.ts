// El export estático (§7.9 del plan): sin --incluir-datos-reales exporta la demo y nunca lee la
// Documentación de quien exporta; dos exports dan los mismos bytes, y una parte de ellos se compara con un
// export de oro (test/oro/export/, ORO_REGENERAR=1 lo reescribe); nada del equipo llega al sitio; los datos
// reales solo con la confirmación escrita (o --yes); una carpeta que no está vacía no se toca; y la barrera
// final no escribe nada si quedara una ruta del equipo. Que el sitio funciona servido bajo un subdirectorio
// lo prueba el E2E (studio/e2e/estatico.spec.ts); aquí, que el index.html solo usa rutas relativas.

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fijarRaizDelPaquete } from "../src/config.js";
import { ARCHIVO_DEL_INDICE, BANDA_DE_DATOS_REALES, BANDA_DE_LA_DEMO, escribirSitio, exportarEstatico, variantes } from "../src/studio/exportar.js";
import type { EntornoExport, Indice } from "../src/studio/exportar.js";
import { carpetaDeTextos } from "../src/studio/demo.js";
import { carpetaTemporal, crearProyecto, crearTarea, limpiarEntorno } from "./helpers.js";
import { huellaDelArbol } from "./studio-ayudas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..", "..");
const ORO = path.join(RAIZ, "test", "oro", "export");
const CONFIG_JS = pathToFileURL(path.join(AQUI, "..", "src", "config.js")).href;
const INDEX_JS = pathToFileURL(path.join(AQUI, "..", "src", "index.js")).href;

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

// Un frontend compilado de mentira: el de verdad (studio/dist) sale de `npm run build`, y estos tests no
// dependen de él.
function distDePrueba(): string {
  const dist = carpetaTemporal("dist");
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "index.html"), '<!doctype html><script src="./config.js"></script><script type="module" src="./assets/a.js"></script>', "utf-8");
  fs.writeFileSync(path.join(dist, "config.js"), 'window.PG_MODO = "vivo";\n', "utf-8");
  fs.writeFileSync(path.join(dist, "assets", "a.js"), "export {};\n", "utf-8");
  return dist;
}

function entorno(respuesta: string | null = null): EntornoExport & { mensajes: string[]; preguntas: string[] } {
  const mensajes: string[] = [];
  const preguntas: string[] = [];
  return {
    salida: { out: (t) => mensajes.push(t), err: (t) => mensajes.push(t) },
    esTerminal: respuesta !== null,
    preguntar: async (p) => {
      preguntas.push(p);
      return respuesta ?? "";
    },
    mensajes,
    preguntas,
  };
}

// Todo el sitio: ruta relativa, tamaño y sha256 de cada archivo.
function bytesDelSitio(raiz: string): string[] {
  return fs
    .readdirSync(raiz, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => {
      const ruta = path.join(e.parentPath, e.name);
      return `${path.relative(raiz, ruta).replace(/\\/g, "/")}|${createHash("sha256").update(fs.readFileSync(ruta)).digest("hex")}`;
    })
    .sort();
}

// Desde la Etapa 6 (§8.7), un conjunto por idioma: datos/es/ y datos/en/.
const leerIndice = (sitio: string, idioma = "es"): Indice => JSON.parse(fs.readFileSync(path.join(sitio, "datos", idioma, ARCHIVO_DEL_INDICE), "utf-8")) as Indice;
const datosDe = (sitio: string, ruta: string, idioma = "es"): string => fs.readFileSync(path.join(sitio, "datos", idioma, leerIndice(sitio, idioma).rutas[ruta]!.archivo), "utf-8");

// El export de oro, reducido: la lista de rutas y las respuestas que no dependen del sistema ni de la
// versión (/api/estado lleva la versión y la de Node; /api/clientes, la ruta de VS Code de cada sistema).
const ORO_DE: Record<string, string> = {
  "proyectos.json": "/api/proyectos",
  "tarea-cupones.json": "/api/tareas/TIENDA/cupones-de-descuento",
  "lotes-cupones.json": "/api/tareas/TIENDA/cupones-de-descuento/lotes",
  "bitacora-cupones.json": "/api/tareas/TIENDA/cupones-de-descuento/bitacora",
  "recibo-cupones-L01.json": `/api/tareas/TIENDA/cupones-de-descuento/documento?archivo=${encodeURIComponent("04 - Ejecución/L01 - Validar el cupón.md")}`,
  "prompt-tienda-4-cupones.json": "/api/prompts/TIENDA/4?tarea=cupones-de-descuento",
};

describe("export estático de la demo", () => {
  it("dos exports, los mismos bytes; con la Documentación de quien exporta configurada, no la lee", async () => {
    fijarRaizDelPaquete(RAIZ);
    // Una Documentación y unos repos de quien exporta, con un proyecto que no puede aparecer.
    const docs = carpetaTemporal("docs");
    crearTarea(docs, "MARCADOR", "secreta", ["00 - Contexto Inicial.md"]);
    process.env.PHASE_GATE_DOCS_PATH = docs;
    process.env.PHASE_GATE_REPOS_PATH = carpetaTemporal("repos");
    process.env.PHASE_GATE_TASKS_SUBDIR = "Proyectos";
    const antes = huellaDelArbol(docs);
    const dist = distDePrueba();
    const [a, b] = [path.join(carpetaTemporal("sitio"), "sitio"), path.join(carpetaTemporal("sitio"), "sitio")];
    for (const destino of [a, b]) {
      const e = entorno();
      assert.equal(await exportarEstatico({ destino, datosReales: false, yes: false }, e, dist), 0, e.mensajes.join("\n"));
      assert.match(e.mensajes.join("\n"), /de la demo\.$/);
    }
    assert.deepEqual(bytesDelSitio(b), bytesDelSitio(a));
    assert.equal(process.env.PHASE_GATE_DOCS_PATH, docs, "el entorno de quien exporta vuelve a quedar como estaba");
    assert.deepEqual(huellaDelArbol(docs), antes);

    // El sitio: el frontend, config.js con el modo estático (en vez del de dist), .nojekyll y los datos.
    assert.equal(
      fs.readFileSync(path.join(a, "config.js"), "utf-8"),
      `window.PG_MODO = "estatico";\nwindow.PG_BANDA = ${JSON.stringify(BANDA_DE_LA_DEMO)};\nwindow.PG_BANDA_CLAVE = "estatico-demo";\n`
    );
    assert.deepEqual(fs.readdirSync(path.join(a, "datos")).sort(), ["en", "es"]);
    assert.equal(fs.readFileSync(path.join(a, ".nojekyll"), "utf-8"), "");
    assert.ok(fs.existsSync(path.join(a, "assets", "a.js")));
    const indice = leerIndice(a);
    for (const idioma of ["es", "en"]) {
      for (const [ruta, { archivo, estado }] of Object.entries(leerIndice(a, idioma).rutas)) {
        assert.equal(estado, 200, ruta);
        assert.ok(fs.existsSync(path.join(a, "datos", idioma, archivo)), `${idioma}: ${ruta} → ${archivo}`);
      }
      for (const archivo of fs.readdirSync(path.join(a, "datos", idioma))) assert.ok(!fs.readFileSync(path.join(a, "datos", idioma, archivo), "utf-8").includes("MARCADOR"), archivo);
      assert.equal(JSON.parse(datosDe(a, "/api/estado", idioma)).studio.modo, "estatico");
    }
    const proyectos = JSON.parse(datosDe(a, "/api/proyectos")) as { proyectos: { nombre: string }[] };
    assert.deepEqual(proyectos.proyectos.map((p) => p.nombre), ["ASISTENTE", "INVESTIGACION", "TIENDA"]);
    // En inglés, la demo inglesa, con los textos del servidor en inglés.
    const delIngles = JSON.parse(datosDe(a, "/api/proyectos", "en")) as { proyectos: { nombre: string }[] };
    assert.deepEqual(delIngles.proyectos.map((p) => p.nombre), ["ASSISTANT", "RESEARCH", "SHOP"]);
    assert.match(datosDe(a, "/api/tareas/SHOP/free-shipping", "en"), /pending commit|Phase 4/);
    assert.match(datosDe(a, "/api/prompts/SHOP/4?tarea=discount-coupons", "en"), /## FILES OF THIS TASK \(exact names\)/);
    assert.match(datosDe(a, "/api/prompts/SHOP/4?tarea=discount-coupons", "en"), /<repos>\/shop-api`/);

    // Contra el export de oro reducido. El de español es el de la Etapa 5, sin tocar: la demo en español no
    // cambió. El de inglés es nuevo (test/oro/export/en/), con la lista de rutas y los proyectos.
    const rutas = `${Object.keys(indice.rutas).join("\n")}\n`;
    const rutasEn = `${Object.keys(leerIndice(a, "en").rutas).join("\n")}\n`;
    if (process.env.ORO_REGENERAR === "1") {
      fs.mkdirSync(path.join(ORO, "en"), { recursive: true });
      fs.writeFileSync(path.join(ORO, "rutas.txt"), rutas, "utf-8");
      for (const [archivo, ruta] of Object.entries(ORO_DE)) fs.writeFileSync(path.join(ORO, archivo), datosDe(a, ruta), "utf-8");
      fs.writeFileSync(path.join(ORO, "en", "rutas.txt"), rutasEn, "utf-8");
      fs.writeFileSync(path.join(ORO, "en", "proyectos.json"), datosDe(a, "/api/proyectos", "en"), "utf-8");
    }
    assert.equal(rutas, fs.readFileSync(path.join(ORO, "rutas.txt"), "utf-8").replace(/\r\n/g, "\n"), "las rutas exportadas");
    assert.equal(rutasEn, fs.readFileSync(path.join(ORO, "en", "rutas.txt"), "utf-8").replace(/\r\n/g, "\n"), "las rutas exportadas en inglés");
    assert.equal(datosDe(a, "/api/proyectos", "en"), fs.readFileSync(path.join(ORO, "en", "proyectos.json"), "utf-8").replace(/\r\n/g, "\n"));
    for (const [archivo, ruta] of Object.entries(ORO_DE)) {
      assert.equal(datosDe(a, ruta), fs.readFileSync(path.join(ORO, archivo), "utf-8").replace(/\r\n/g, "\n"), `${ruta} frente a test/oro/export/${archivo}`);
    }

    // Sin datos del equipo: ni el temporal, ni el paquete, ni la carpeta personal, ni el usuario o el equipo.
    const formas = (ruta: string) => [ruta, ruta.replace(/\\/g, "/"), ruta.replace(/\\/g, "\\\\")].map((r) => r.toLowerCase());
    const rutasDelEquipo = [os.tmpdir(), fs.realpathSync.native(os.tmpdir()), os.homedir(), RAIZ, fs.realpathSync.native(RAIZ)].flatMap(formas);
    const textos = fs.readdirSync(path.dirname(carpetaDeTextos()), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => fs.readFileSync(path.join(e.parentPath, e.name), "utf-8")).join("\n");
    const nombres = [os.userInfo().username, os.hostname()].filter((v) => v.length >= 3 && !textos.includes(v));
    for (const e of fs.readdirSync(a, { recursive: true, withFileTypes: true }).filter((x) => x.isFile())) {
      const texto = fs.readFileSync(path.join(e.parentPath, e.name), "utf-8");
      for (const r of rutasDelEquipo) assert.ok(!texto.toLowerCase().includes(r), `${e.name} lleva ${r}`);
      for (const n of nombres) assert.ok(!texto.includes(n), `${e.name} lleva ${n}`);
    }
    // Las rutas de la demo, sustituidas y con "/": lo mismo en Windows que en Linux.
    assert.match(datosDe(a, "/api/prompts/TIENDA/4?tarea=cupones-de-descuento"), /<repos>\/tienda-api`/);
    assert.match(datosDe(a, "/api/estado"), /"archivo":"<estado>\/active-tasks\.json"/);

    // Ajustes sale en la demo, en los dos idiomas, con las rutas de este equipo sustituidas.
    for (const [idioma, proyecto] of [["es", "TIENDA"], ["en", "SHOP"]] as const) {
      const equipo = JSON.parse(datosDe(a, "/api/ajustes", idioma)) as { campos: { campo: string; efectivo: string | null }[]; avanzadas: unknown[] };
      assert.equal(equipo.campos.find((c) => c.campo === "documentacion")!.efectivo, "<Documentación>", idioma);
      assert.equal(equipo.avanzadas.length, 5, idioma);
      const delProyecto = JSON.parse(datosDe(a, `/api/ajustes/proyectos/${proyecto}`, idioma)) as { manifiesto: { estado: string }; archivo: { repos: unknown[] } | null };
      assert.equal(delProyecto.manifiesto.estado, "valido", idioma);
      assert.ok(delProyecto.archivo!.repos.length > 0, idioma);
    }
  });

  it("el index.html del frontend compilado solo usa rutas relativas: el sitio vale bajo un subdirectorio", () => {
    const index = path.join(RAIZ, "studio", "index.html");
    const absolutas = [...fs.readFileSync(index, "utf-8").matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]!).filter((u) => /^(?:\/|(?!data:)[a-z]+:)/i.test(u) && u !== "/config.js");
    assert.deepEqual(absolutas, []);
    // /config.js se escribe absoluto en studio/index.html para que Vite lo trate como de public/; el build lo
    // deja relativo (base "./").
    const vite = fs.readFileSync(path.join(RAIZ, "studio", "vite.config.ts"), "utf-8");
    assert.match(vite, /base:\s*"\.\/"/);
  });

  it("una carpeta que ya existe y no está vacía (o un archivo) no se toca", async () => {
    fijarRaizDelPaquete(RAIZ);
    const llena = carpetaTemporal("sitio");
    fs.writeFileSync(path.join(llena, "mio.txt"), "mío", "utf-8");
    const archivo = path.join(carpetaTemporal("sitio"), "un-archivo");
    fs.writeFileSync(archivo, "x", "utf-8");
    const antes = [huellaDelArbol(llena), fs.statSync(archivo).mtimeMs];
    for (const destino of [llena, archivo]) {
      const e = entorno();
      assert.equal(await exportarEstatico({ destino, datosReales: false, yes: true }, e, distDePrueba()), 1);
      assert.match(e.mensajes.join("\n"), /no es una carpeta vacía/);
    }
    assert.deepEqual(fs.readdirSync(path.dirname(archivo)), ["un-archivo"], "nada al lado");
    assert.deepEqual([huellaDelArbol(llena), fs.statSync(archivo).mtimeMs], antes);
    assert.equal(fs.readFileSync(archivo, "utf-8"), "x");
  });

  it("la barrera final: si quedara una ruta del equipo en lo que se publica, no se escribe nada", () => {
    const raiz = carpetaTemporal("equipo");
    const destino = path.join(carpetaTemporal("sitio"), "sitio");
    const unaRespuesta = () => new Map([["/api/estado", { estado: 200, json: { ruta: path.join(raiz, "docs") } }]]);
    // Basta con que la ruta esté en uno de los dos idiomas.
    const respuestas = { es: new Map(), en: unaRespuesta() };
    const identidad = (valor: unknown) => valor;
    assert.throws(() => escribirSitio(destino, respuestas, variantes([{ ruta: raiz, nombre: "<x>" }]), "estatico-demo", distDePrueba(), identidad), /rutas de este equipo/);
    assert.equal(fs.existsSync(destino), false);
    assert.deepEqual(fs.readdirSync(path.dirname(destino)), [], "ni la carpeta de al lado");
    // Con la normalización de verdad, la misma respuesta se escribe sustituida.
    escribirSitio(destino, { es: unaRespuesta(), en: unaRespuesta() }, variantes([{ ruta: raiz, nombre: "<x>" }]), "estatico-demo", distDePrueba());
    assert.equal(datosDe(destino, "/api/estado"), '{"ruta":"<x>/docs"}\n');
    assert.equal(datosDe(destino, "/api/estado", "en"), '{"ruta":"<x>/docs"}\n');
  });
});

describe("export estático con datos reales", () => {
  function documentacion() {
    fijarRaizDelPaquete(RAIZ);
    const docs = carpetaTemporal("docs");
    const tarea = crearTarea(docs, "REAL", "tarea-real", []);
    fs.writeFileSync(path.join(tarea, "00 - Contexto Inicial.md"), `# Contexto\n\nEl código está en ${path.join(docs, "otra")}.\n`, "utf-8");
    process.env.PHASE_GATE_DOCS_PATH = docs;
    process.env.PHASE_GATE_REPOS_PATH = carpetaTemporal("repos");
    process.env.PHASE_GATE_TASKS_SUBDIR = "Proyectos";
    process.env.PHASE_GATE_STATE_PATH = carpetaTemporal("estado");
    return docs;
  }

  it("sin --yes y sin terminal no exporta; en la terminal, solo si se escribe exportar", async () => {
    documentacion();
    const dist = distDePrueba();
    const destino = path.join(carpetaTemporal("sitio"), "sitio");
    const sinTerminal = entorno();
    assert.equal(await exportarEstatico({ destino, datosReales: true, yes: false }, sinTerminal, dist), 1);
    assert.match(sinTerminal.mensajes.join("\n"), /Vas a publicar los documentos de 1 proyecto, con todo su contenido[\s\S]*hace falta confirmarlo[\s\S]*No se exportó nada/);
    for (const respuesta of ["", "si", "s", "Exportar", "exportar ya"]) {
      const e = entorno(respuesta);
      assert.equal(await exportarEstatico({ destino, datosReales: true, yes: false }, e, dist), 1, respuesta);
      assert.match(e.preguntas[0]!, /Escribe exportar para seguir/);
    }
    assert.equal(fs.existsSync(destino), false);
    assert.deepEqual(fs.readdirSync(path.dirname(destino)), []);
  });

  it("escribiendo exportar (o con --yes), exporta la Documentación con sus rutas sustituidas", async () => {
    const docs = documentacion();
    const dist = distDePrueba();
    for (const [e, yes] of [[entorno("  exportar  "), false], [entorno(), true]] as const) {
      const destino = path.join(carpetaTemporal("sitio"), "sitio");
      assert.equal(await exportarEstatico({ destino, datosReales: true, yes }, e, dist), 0, e.mensajes.join("\n"));
      assert.match(e.mensajes.join("\n"), /archivos de datos\.$/);
      assert.equal(fs.readFileSync(path.join(destino, "config.js"), "utf-8"), `window.PG_MODO = "estatico";\nwindow.PG_BANDA = ${JSON.stringify(BANDA_DE_DATOS_REALES)};\nwindow.PG_BANDA_CLAVE = "estatico-datos";\n`);
      assert.deepEqual((JSON.parse(datosDe(destino, "/api/proyectos")) as { proyectos: { nombre: string }[] }).proyectos.map((p) => p.nombre), ["REAL"]);
      // Lo que enseña rutas de este equipo (Ajustes) no se exporta: la página dice que no está disponible.
      for (const idioma of ["es", "en"]) {
        assert.deepEqual(Object.keys(leerIndice(destino, idioma).rutas).filter((r) => r.startsWith("/api/ajustes")), [], idioma);
      }
      const contexto = JSON.parse(datosDe(destino, `/api/tareas/REAL/tarea-real/documento?archivo=${encodeURIComponent("00 - Contexto Inicial.md")}`)) as { texto: string };
      assert.match(contexto.texto, /El código está en <Documentación>\/otra\./);
      for (const idioma of ["es", "en"]) {
        assert.ok(!fs.readdirSync(path.join(destino, "datos", idioma)).some((n) => fs.readFileSync(path.join(destino, "datos", idioma, n), "utf-8").toLowerCase().includes(docs.toLowerCase().replace(/\\/g, "\\\\"))));
      }
      // La misma Documentación en los dos conjuntos, con los textos del servidor en cada idioma.
      assert.deepEqual((JSON.parse(datosDe(destino, "/api/proyectos", "en")) as { proyectos: { nombre: string }[] }).proyectos.map((p) => p.nombre), ["REAL"]);
    }
  });
});

describe("export estático: el despacho de la CLI, en un proceso de verdad", () => {
  function lanzar(args: string[], env: NodeJS.ProcessEnv): Promise<{ codigo: number | null; salida: string }> {
    const script = path.join(carpetaTemporal("script"), "ui.mjs");
    fs.writeFileSync(script, [`const { fijarRaizDelPaquete } = await import(${JSON.stringify(CONFIG_JS)});`, `fijarRaizDelPaquete(${JSON.stringify(RAIZ)});`, `await import(${JSON.stringify(INDEX_JS)});`].join("\n"), "utf-8");
    return new Promise((resolver) => {
      const hijo = spawn(process.execPath, [script, ...args], { env, cwd: path.dirname(script), stdio: ["ignore", "pipe", "pipe"] });
      let salida = "";
      hijo.stdout.on("data", (d) => (salida += d));
      hijo.stderr.on("data", (d) => (salida += d));
      hijo.on("exit", (codigo) => resolver({ codigo, salida }));
    });
  }

  it("ui --export-static llega al export: con datos reales y sin terminal pide confirmación y no escribe; una carpeta llena se rechaza", async () => {
    const docs = carpetaTemporal("docs");
    crearProyecto(docs, "REAL");
    const env = { ...process.env, PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: carpetaTemporal("repos"), PHASE_GATE_STATE_PATH: carpetaTemporal("estado"), PHASE_GATE_CONFIG_PATH: carpetaTemporal("config") };
    const destino = path.join(carpetaTemporal("sitio"), "sitio");
    const real = await lanzar(["ui", "--export-static", destino, "--incluir-datos-reales"], env);
    assert.equal(real.codigo, 1, real.salida);
    assert.match(real.salida, /hace falta confirmarlo/);
    assert.equal(fs.existsSync(destino), false);
    const llena = carpetaTemporal("sitio");
    fs.writeFileSync(path.join(llena, "mio.txt"), "mío", "utf-8");
    const r = await lanzar(["ui", "--export-static", llena], env);
    assert.equal(r.codigo, 1, r.salida);
    assert.match(r.salida, /no es una carpeta vacía/);
    assert.deepEqual(fs.readdirSync(llena), ["mio.txt"]);
  });
});
