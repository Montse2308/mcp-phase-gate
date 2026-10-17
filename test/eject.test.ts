// `npx mcp-phase-gate eject` (§5.8.2 del plan maestro v3): cada objetivo, el rechazo sin --fuerza, y
// que lo copiado gane después.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { capasDe, contenidoEfectivoDeRanura, ensamblarFase } from "../src/capas.js";
import type { Salida } from "../src/cli.js";
import { ejecutarCli } from "../src/cli.js";
import { carpetaPromptsGlobal, fijarRaizDelPaquete } from "../src/config.js";
import { ejecutarEject, parsearObjetivo } from "../src/eject.js";
import { configTemporal, crearProyecto, docsTemporales, limpiarEntorno } from "./helpers.js";

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function salidaDePrueba(): Salida & { texto: () => string; errores: () => string } {
  const out: string[] = [];
  const err: string[] = [];
  return { out: (t) => out.push(t), err: (t) => err.push(t), texto: () => out.join("\n"), errores: () => err.join("\n") };
}

// Un proyecto con el preset software-replica, para que el contenido efectivo de una ranura no sea el
// de fábrica.
function instalacion(): { docs: string; config: string; capaProyecto: string } {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  const config = configTemporal();
  crearProyecto(docs, "PROYECTO-X");
  fs.writeFileSync(path.join(docs, "PROYECTO-X", "phase-gate.json"), JSON.stringify({ version: 1, preset: "software-replica" }), "utf-8");
  return { docs, config, capaProyecto: path.join(docs, "PROYECTO-X", ".phase-gate", "prompts") };
}

const eject = (objetivo: string, destino: string | null, extra: { dryRun?: boolean; fuerza?: boolean } = {}) => {
  const salida = salidaDePrueba();
  const codigo = ejecutarEject(objetivo, { destino, dryRun: extra.dryRun ?? false, fuerza: extra.fuerza ?? false }, salida);
  return { codigo, salida };
};

describe("parsearObjetivo", () => {
  it("reconoce los cinco objetivos y rechaza global-rules entero", () => {
    assert.deepEqual(parsearObjetivo("fase-3"), { tipo: "fase", numero: 3 });
    assert.deepEqual(parsearObjetivo("fase-3/pruebas"), { tipo: "ranura", id: "fase-3/pruebas", archivo: "fase-3", ranura: "pruebas" });
    assert.deepEqual(parsearObjetivo("global/evidencia"), { tipo: "ranura", id: "global/evidencia", archivo: "global", ranura: "evidencia" });
    assert.deepEqual(parsearObjetivo("comando-f4"), { tipo: "comando", numero: 4 });
    assert.deepEqual(parsearObjetivo("preset:ai-agent-ops"), { tipo: "preset", nombre: "ai-agent-ops" });
    assert.match(String(parsearObjetivo("global-rules")), /global-rules entero no se puede ejectar/);
    assert.match(String(parsearObjetivo("fase3")), /no es un objetivo válido/);
  });
});

describe("eject", () => {
  it("fase-3 --a global copia el cuerpo de fábrica con sus ranuras a <configDir>/prompts, que pasa a ser la capa global", () => {
    const { config } = instalacion();
    const { codigo, salida } = eject("fase-3", "global");

    const archivo = path.join(config, "prompts", "fase-3-plan-tecnico.md");
    assert.equal(codigo, 0, salida.errores());
    assert.equal(fs.readFileSync(archivo, "utf-8"), fs.readFileSync(path.join(RAIZ, "prompts", "es", "fase-3-plan-tecnico.md"), "utf-8").replace(/\r\n/g, "\n"));
    assert.ok(fs.readFileSync(archivo, "utf-8").includes("<!-- ranura: pruebas -->"));
    assert.equal(carpetaPromptsGlobal(), path.join(config, "prompts"));
    assert.match(salida.texto(), /Edítalo ahí; `doctor --fase 3` te mostrará que gana/);
  });

  it("fase-3/pruebas --a proyecto:X copia el contenido efectivo (con el preset) y después gana bloques.md del proyecto", () => {
    const { capaProyecto } = instalacion();
    const antes = contenidoEfectivoDeRanura(capasDe("PROYECTO-X"), "fase-3/pruebas")!;
    assert.match(antes.contenido, /réplica/, "con software-replica el contenido efectivo es el de la réplica");

    const { codigo, salida } = eject("fase-3/pruebas", "proyecto:proyecto-x");
    assert.equal(codigo, 0, salida.errores());
    const bloques = fs.readFileSync(path.join(capaProyecto, "bloques.md"), "utf-8");
    assert.equal(bloques, `<!-- bloque: fase-3/pruebas -->\n${antes.contenido}\n<!-- /bloque -->\n`);

    const procedencia = ensamblarFase(3, "PROYECTO-X").procedencia.find((p) => p.ranura === "fase-3/pruebas");
    assert.match(procedencia?.contenidoDe ?? "", /PROYECTO-X[\\/]\.phase-gate[\\/]prompts[\\/]bloques\.md:1$/);
    assert.match(salida.texto(), /`doctor --fase 3 --proyecto PROYECTO-X` te mostrará que gana/);
    assert.match(salida.texto(), /Procedencia de fase-3\/pruebas: .*bloques\.md:1/);
  });

  it("global/evidencia se añade al bloques.md que ya hay, sin tocar sus otros bloques", () => {
    const { capaProyecto } = instalacion();
    fs.mkdirSync(capaProyecto, { recursive: true });
    fs.writeFileSync(path.join(capaProyecto, "bloques.md"), "<!-- bloque: fase-1/rol -->\nMi rol.\n<!-- /bloque -->\n", "utf-8");

    assert.equal(eject("global/evidencia", "proyecto:PROYECTO-X").codigo, 0);
    const bloques = fs.readFileSync(path.join(capaProyecto, "bloques.md"), "utf-8");
    assert.ok(bloques.startsWith("<!-- bloque: fase-1/rol -->\nMi rol.\n<!-- /bloque -->\n\n<!-- bloque: global/evidencia -->\nToda afirmación"));
    assert.deepEqual(fs.readdirSync(capaProyecto).filter((n) => n.includes(".bak-")), [], "añadir un bloque no deja copia");
  });

  it("sin --fuerza rechaza lo que ya existe; con --fuerza lo reemplaza dejando copia, sin duplicar el bloque", () => {
    const { capaProyecto } = instalacion();
    eject("fase-3/pruebas", "proyecto:PROYECTO-X");
    const bloques = path.join(capaProyecto, "bloques.md");
    fs.writeFileSync(bloques, fs.readFileSync(bloques, "utf-8").replace(/réplica/g, "RÉPLICA EDITADA"), "utf-8");
    const editado = fs.readFileSync(bloques, "utf-8");

    const rechazo = eject("fase-3/pruebas", "proyecto:PROYECTO-X");
    assert.equal(rechazo.codigo, 1);
    assert.match(rechazo.salida.errores(), /ya existe\. No se toca; con --fuerza se reemplaza dejando copia/);
    assert.equal(fs.readFileSync(bloques, "utf-8"), editado);

    assert.equal(eject("fase-3/pruebas", "proyecto:PROYECTO-X", { fuerza: true }).codigo, 0);
    const final = fs.readFileSync(bloques, "utf-8");
    assert.equal(final.match(/<!-- bloque: fase-3\/pruebas -->/g)?.length, 1);
    assert.match(final, /RÉPLICA EDITADA/, "el contenido efectivo ya incluía la edición del proyecto");
    assert.equal(fs.readdirSync(capaProyecto).filter((n) => n.startsWith("bloques.md.bak-")).length, 1);
  });

  it("comando-f4 y preset:<nombre>", () => {
    const { config, capaProyecto } = instalacion();

    assert.equal(eject("comando-f4", "proyecto:PROYECTO-X").codigo, 0);
    assert.equal(fs.readFileSync(path.join(capaProyecto, "comandos", "f4.md"), "utf-8"), fs.readFileSync(path.join(RAIZ, "prompts", "es", "comandos", "f4.md"), "utf-8").replace(/\r\n/g, "\n"));

    assert.equal(eject("preset:software-tdd", null).codigo, 0, "un preset va siempre a la carpeta de configuración");
    assert.equal(fs.readFileSync(path.join(config, "presets", "software-tdd.md"), "utf-8"), fs.readFileSync(path.join(RAIZ, "presets", "es", "software-tdd.md"), "utf-8").replace(/\r\n/g, "\n"));
    assert.equal(eject("preset:software-tdd", null).codigo, 1, "ya es tuyo");
    assert.match(eject("preset:software", null).salida.errores(), /no tiene archivo/);
  });

  it("errores de argumentos: sin --a, una ranura que no existe, un proyecto que no existe", () => {
    instalacion();

    assert.equal(eject("fase-3/pruebas", null).codigo, 2);
    const ranura = eject("fase-3/prueba", "global");
    assert.equal(ranura.codigo, 2);
    assert.match(ranura.salida.errores(), /fase-3 no tiene la ranura "prueba"\. Las que tiene: rol, comprobaciones, lotes, pruebas, prohibido-lotes, ejemplos, autoverificacion-lotes\./);
    assert.match(eject("fase-3", "proyecto:NO-EXISTE").salida.errores(), /No existe el proyecto "NO-EXISTE"/);
    assert.equal(eject("global-rules", "global").codigo, 2);
  });

  it("--dry-run no escribe nada", () => {
    const { docs, config } = instalacion();
    const { codigo, salida } = eject("fase-3/pruebas", "proyecto:PROYECTO-X", { dryRun: true });

    assert.equal(codigo, 0);
    assert.match(salida.texto(), /^\[dry-run\] Se escribiría .*bloques\.md:\n<!-- bloque: fase-3\/pruebas -->/);
    assert.equal(fs.existsSync(path.join(docs, "PROYECTO-X", ".phase-gate")), false);
    assert.deepEqual(fs.readdirSync(config), []);
  });

  it("el CLI lo lanza con su objetivo y sus banderas", () => {
    instalacion();
    const salida = salidaDePrueba();

    assert.deepEqual(ejecutarCli(["eject", "comando-f1", "--a", "global", "--dry-run"], salida, false), { accion: "salir", codigo: 0 });
    assert.deepEqual(ejecutarCli(["eject"], salidaDePrueba(), false), { accion: "salir", codigo: 2 });
    assert.deepEqual(ejecutarCli(["eject", "fase-1", "--yes"], salidaDePrueba(), false), { accion: "salir", codigo: 2 });
  });
});

