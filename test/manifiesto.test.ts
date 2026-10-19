// El manifiesto de cada proyecto, el machine.json de cada equipo, los presets disponibles y los JSON
// Schema publicados (§5.2 del plan maestro v3).

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { carpetaPromptsGlobal, configDir, fijarRaizDelPaquete, promptsLayers } from "../src/config.js";
import {
  copiasEnConflicto,
  esquemasPublicados,
  leerManifiesto,
  leerMaquina,
  manifiestoDe,
  maquinaDe,
  presetsDisponibles,
  rutaDeError,
  textoDeEsquema,
} from "../src/manifiesto.js";
import { carpetaTemporal, configTemporal, crearProyecto, docsTemporales, limpiarEntorno } from "./helpers.js";

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function proyectoCon(manifiesto: unknown): string {
  const docs = docsTemporales();
  crearProyecto(docs, "PROYECTO-A");
  const contenido = typeof manifiesto === "string" ? manifiesto : JSON.stringify(manifiesto, null, 2);
  fs.writeFileSync(path.join(docs, "PROYECTO-A", "phase-gate.json"), contenido, "utf-8");
  return docs;
}

function error(manifiesto: unknown): string {
  proyectoCon(manifiesto);
  const lectura = leerManifiesto("PROYECTO-A");
  assert.equal(lectura.estado, "invalido", JSON.stringify(lectura));
  return lectura.estado === "invalido" ? lectura.error : "";
}

describe("leerManifiesto", () => {
  it("sin phase-gate.json, el proyecto no tiene manifiesto", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    assert.equal(leerManifiesto("PROYECTO-A").estado, "ausente");
    assert.equal(manifiestoDe("PROYECTO-A"), null);
  });

  it("el ejemplo del plan es válido y rellena los valores por defecto", () => {
    proyectoCon({
      $schema: "https://unpkg.com/mcp-phase-gate@3/schema/project.json",
      version: 1,
      repos: [
        { id: "api", dir: "backend-api", rol: "backend" },
        { id: "web", dir: "grupo/frontend-web", rol: "frontend" },
      ],
      reglas: { commits: "agente-commitea-con-OK", verificacion: ["npm test"] },
      fase5: { prPorRepo: true },
    });

    const manifiesto = manifiestoDe("PROYECTO-A");
    assert.equal(manifiesto?.preset, "software");
    // Antes: "es" por defecto. Desde la Etapa 6, sin `idioma` el del proyecto se deduce (§8.3).
    assert.equal(manifiesto?.idioma, undefined);
    assert.deepEqual(manifiesto?.repos.map((r) => r.id), ["api", "web"]);
    assert.equal(manifiesto?.reglas.lotes, undefined, "si falta, decide el preset");
  });

  it("un JSON con BOM y en CRLF se lee igual", () => {
    proyectoCon('\uFEFF{\r\n  "version": 1\r\n}\r\n');

    assert.equal(leerManifiesto("PROYECTO-A").estado, "valido");
  });

  const invalidos: Array<[string, unknown, RegExp]> = [
    ["una clave desconocida", { version: 1, presets: "x" }, /\(raíz\): clave desconocida "presets"/],
    ["otra versión", { version: 2 }, /version: debe ser 1/],
    ["sin versión", {}, /version: falta/],
    ["un id con mayúsculas", { version: 1, repos: [{ id: "API", dir: "a" }] }, /repos\[0\]\.id: El id de un repo va en minúsculas/],
    ["un dir vacío", { version: 1, repos: [{ id: "api", dir: "" }] }, /repos\[0\]\.dir: no puede estar vacío/],
    ["un id repetido", { version: 1, repos: [{ id: "api", dir: "a" }, { id: "api", dir: "b" }] }, /repos\[1\]\.id: el id "api" está repetido/],
    ["un dir absoluto de Windows", { version: 1, repos: [{ id: "api", dir: "C:\\repos\\api" }] }, /repos\[0\]\.dir: no puede ser una ruta absoluta/],
    ["un dir absoluto de POSIX", { version: 1, repos: [{ id: "api", dir: "/srv/api" }] }, /repos\[0\]\.dir: no puede ser una ruta absoluta/],
    ["un dir con ..", { version: 1, repos: [{ id: "web", dir: "a/../../fuera" }] }, /repos\[0\]\.dir: dir "\.\." no es válido/],
    ["una política de commits que no existe", { version: 1, reglas: { commits: "siempre" } }, /reglas\.commits: debe ser "agente-commitea-con-OK" o/],
    ["un JSON roto", "{ version: 1 ", /no es un JSON válido/],
  ];

  for (const [caso, manifiesto, motivo] of invalidos) {
    it(`rechaza ${caso}, con la ruta del problema`, () => {
      const texto = error(manifiesto);
      assert.match(texto, /^phase-gate\.json de PROYECTO-A no es válido \(.*phase-gate\.json\): /);
      assert.match(texto, motivo);
    });
  }

  it("un preset que no existe es PRESET-NO-EXISTE, con la lista de los que hay", () => {
    proyectoCon({ version: 1, preset: "inventado" });

    const lectura = leerManifiesto("PROYECTO-A");
    assert.equal(lectura.estado === "invalido" && lectura.codigo, "PRESET-NO-EXISTE");
    assert.match(lectura.estado === "invalido" ? lectura.error : "", /no existe el preset "inventado". Los disponibles son: software\./);
    assert.throws(() => manifiestoDe("PROYECTO-A"), /no existe el preset "inventado"/);
  });

  it("un preset del usuario, en <configDir>/presets/, cuenta como existente", () => {
    proyectoCon({ version: 1, preset: "mio" });
    const config = configTemporal();
    fs.mkdirSync(path.join(config, "presets"));
    fs.writeFileSync(path.join(config, "presets", "mio.md"), "---\nnombre: mio\n---\n", "utf-8");

    assert.equal(leerManifiesto("PROYECTO-A").estado, "valido");
  });

  it("detecta las copias en conflicto que deja OneDrive", () => {
    const docs = proyectoCon({ version: 1 });
    fs.writeFileSync(path.join(docs, "PROYECTO-A", "phase-gate-PORTATIL.json"), "{}", "utf-8");
    fs.writeFileSync(path.join(docs, "PROYECTO-A", "otro.json"), "{}", "utf-8");

    assert.deepEqual(copiasEnConflicto("PROYECTO-A"), ["phase-gate-PORTATIL.json"]);
  });
});

describe("rutaDeError", () => {
  it("escribe la ruta como se busca en el archivo", () => {
    assert.equal(rutaDeError(["repos", 1, "dir"]), "repos[1].dir");
    assert.equal(rutaDeError([]), "(raíz)");
  });
});

describe("machine.json", () => {
  function maquina(contenido: unknown): void {
    const config = configTemporal();
    fs.writeFileSync(path.join(config, "machine.json"), typeof contenido === "string" ? contenido : JSON.stringify(contenido), "utf-8");
  }

  it("sin machine.json no hay overrides", () => {
    configTemporal();
    const lectura = leerMaquina();

    assert.equal(lectura.estado, "ausente");
    assert.equal(lectura.repos.size, 0);
  });

  it("las claves comparan el proyecto en minúsculas y las rutas se resuelven", () => {
    const destino = carpetaTemporal("repo");
    maquina({ version: 1, repos: { "PROYECTO-A/api": destino }, presetPorDefecto: "software-replica" });

    const lectura = maquinaDe();
    assert.equal(lectura.repos.get("proyecto-a/api"), destino);
    assert.equal(lectura.config?.presetPorDefecto, "software-replica");
  });

  it("dos claves que solo difieren en las mayúsculas del proyecto: MAQUINA-CLAVE-DUPLICADA y vale la primera", () => {
    const primera = carpetaTemporal("primera");
    maquina({ version: 1, repos: { "PROYECTO-A/api": primera, "proyecto-a/api": carpetaTemporal("segunda") } });

    const lectura = leerMaquina();
    assert.equal(lectura.repos.get("proyecto-a/api"), primera);
    assert.deepEqual(lectura.avisos.map((a) => a.codigo), ["MAQUINA-CLAVE-DUPLICADA"]);
  });

  it("una clave sin repo, o un JSON roto, es un machine.json inválido y maquinaDe lanza", () => {
    maquina({ version: 1, repos: { "PROYECTO-A": "C:\\x" } });
    assert.match(leerMaquina().error ?? "", /machine\.json no es válido .*repos\.PROYECTO-A: la clave no tiene la forma "<PROYECTO>\/<id del repo>"/);

    maquina("{ roto");
    assert.equal(leerMaquina().estado, "invalido");
    assert.throws(() => maquinaDe(), /no es un JSON válido/);
  });
});

describe("configDir y la capa global", () => {
  it("PHASE_GATE_CONFIG_PATH manda", () => {
    const config = configTemporal();
    assert.equal(configDir(), config);
  });

  it("sin la variable, la carpeta del sistema", () => {
    delete process.env.PHASE_GATE_CONFIG_PATH;
    const esperada =
      process.platform === "win32"
        ? path.join(process.env.APPDATA!, "mcp-phase-gate")
        : process.platform === "darwin"
          ? path.join(process.env.HOME!, "Library", "Application Support", "mcp-phase-gate")
          : path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME!, ".config"), "mcp-phase-gate");

    assert.equal(configDir(), esperada);
  });

  it("<configDir>/prompts/ es la capa global si existe y PHASE_GATE_PROMPTS_PATH no está definida", () => {
    const config = configTemporal();
    assert.equal(carpetaPromptsGlobal(), null);

    fs.mkdirSync(path.join(config, "prompts"));
    assert.equal(carpetaPromptsGlobal(), path.join(config, "prompts"));
    assert.equal(promptsLayers().at(-1), path.join(config, "prompts"));

    const propia = carpetaTemporal("propia");
    process.env.ORQUESTADOR_PROMPTS_PATH = propia;
    assert.equal(carpetaPromptsGlobal(), propia, "la variable gana a la carpeta de configuración");
  });
});

describe("presetsDisponibles", () => {
  it("software existe siempre; el del usuario gana al del paquete con el mismo nombre", () => {
    const raiz = carpetaTemporal("paquete");
    fs.mkdirSync(path.join(raiz, "presets", "es"), { recursive: true });
    fs.writeFileSync(path.join(raiz, "presets", "es", "uno.md"), "---\ndescripcion: del paquete\nlotes: false\ncommits: ninguno\n---\n", "utf-8");
    fs.writeFileSync(path.join(raiz, "presets", "es", "No Vale.md"), "", "utf-8");
    fijarRaizDelPaquete(raiz);

    const config = configTemporal();
    fs.mkdirSync(path.join(config, "presets"));
    fs.writeFileSync(path.join(config, "presets", "dos.md"), "---\ndescripcion: mío\ncommits: inventada\n---\n", "utf-8");

    let presets = presetsDisponibles();
    assert.deepEqual([...presets.keys()].sort(), ["dos", "software", "uno"]);
    assert.deepEqual(
      [presets.get("uno")?.origen, presets.get("uno")?.lotes, presets.get("uno")?.commits, presets.get("uno")?.descripcion],
      ["paquete", false, "ninguno", "del paquete"]
    );
    assert.equal(presets.get("dos")?.commits, null, "una política que no existe no se inventa");
    assert.equal(presets.get("software")?.origen, "integrado");

    fs.writeFileSync(path.join(config, "presets", "uno.md"), "---\ndescripcion: mi versión\n---\n", "utf-8");
    presets = presetsDisponibles();
    assert.deepEqual([presets.get("uno")?.origen, presets.get("uno")?.descripcion], ["usuario", "mi versión"]);
  });
});

describe("schema/*.json", () => {
  for (const [nombre, esquema] of Object.entries(esquemasPublicados())) {
    it(`schema/${nombre} coincide con lo que se genera de los shapes zod`, () => {
      const publicado = fs.readFileSync(path.join(RAIZ, "schema", nombre), "utf-8").replace(/\r\n/g, "\n");
      assert.equal(publicado, textoDeEsquema(esquema), "regenera con: npm run build && node scripts/generar-esquemas.mjs");
    });
  }
});
