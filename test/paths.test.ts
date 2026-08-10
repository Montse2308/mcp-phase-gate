import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as path from "node:path";
import * as fs from "node:fs";

import {
  discoverProjects,
  estaDentro,
  findProjectFolder,
  resolveDocPath,
  resolveTaskFolder,
} from "../src/paths.js";
import { crearProyecto, crearTarea, docsTemporales, limpiarEntorno } from "./helpers.js";

afterEach(limpiarEntorno);

describe("estaDentro", () => {
  it("acepta la propia base y lo que cuelga de ella", () => {
    assert.equal(estaDentro("/docs", "/docs"), true);
    assert.equal(estaDentro("/docs", "/docs/PROYECTO-A/Proyectos/tarea/01.md"), true);
  });

  // Este es el caso que dejaba pasar startsWith: "/docs/TRABAJO_VIEJO" empieza igual que
  // "/docs/TRABAJO" sin estar dentro. Es la razón por la que la comprobación usa path.relative.
  it("rechaza una carpeta hermana que comparte prefijo", () => {
    assert.equal(estaDentro("/docs/TRABAJO", "/docs/TRABAJO_VIEJO/secreto.md"), false);
  });

  it("rechaza salir con ..", () => {
    assert.equal(estaDentro("/docs", "/docs/../fuera.md"), false);
    assert.equal(estaDentro("/docs", "/otro/sitio.md"), false);
  });
});

describe("discoverProjects", () => {
  it("solo cuenta como proyecto la carpeta que tiene la subcarpeta de tareas", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    crearProyecto(docs, "PROYECTO-B");
    fs.mkdirSync(path.join(docs, "Plantillas")); // carpeta suelta, no es proyecto
    fs.writeFileSync(path.join(docs, "notas.md"), "x", "utf-8"); // archivo, tampoco

    const proyectos = discoverProjects();

    assert.deepEqual([...proyectos.values()].sort(), ["PROYECTO-A", "PROYECTO-B"]);
  });

  it("encuentra el proyecto sin importar las mayúsculas y devuelve el nombre real", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    assert.equal(findProjectFolder("proyecto-a"), "PROYECTO-A");
    assert.equal(findProjectFolder("  PrOyEcTo-A  "), "PROYECTO-A");
    assert.equal(findProjectFolder("noexiste"), null);
  });
});

describe("resolveTaskFolder", () => {
  it("arma <docs>/<PROYECTO>/<subcarpeta>/<tarea>", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    assert.equal(resolveTaskFolder("proyecto-a", "login-sso"), path.join(docs, "PROYECTO-A", "Proyectos", "login-sso"));
  });

  it("cuelga las tareas del proyecto cuando la subcarpeta está vacía", () => {
    const docs = docsTemporales("");
    fs.mkdirSync(path.join(docs, "PROYECTO-A"), { recursive: true });

    assert.equal(resolveTaskFolder("proyecto-a", "login-sso"), path.join(docs, "PROYECTO-A", "login-sso"));
  });

  it("falla nombrando los proyectos que sí existen", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    assert.throws(() => resolveTaskFolder("inventado", "x"), /No existe el proyecto "inventado".*PROYECTO-A/s);
  });
});

describe("resolveDocPath", () => {
  it("prefiere project + task_name + file_name", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    const ruta = resolveDocPath({ project: "proyecto-a", task_name: "login-sso", file_name: "02 - Decisiones.md" });

    assert.equal(ruta, path.join(docs, "PROYECTO-A", "Proyectos", "login-sso", "02 - Decisiones.md"));
  });

  it("acepta el modo legacy con file_path relativo a la Documentación", () => {
    const docs = docsTemporales();

    const ruta = resolveDocPath({ file_path: "PROYECTO-A/Proyectos/login-sso/01.md" });

    assert.equal(ruta, path.join(docs, "PROYECTO-A", "Proyectos", "login-sso", "01.md"));
  });

  it("exige una de las dos formas", () => {
    docsTemporales();

    assert.throws(() => resolveDocPath({}), /project \+ task_name \+ file_name.*file_path/s);
    assert.throws(() => resolveDocPath({ project: "proyecto-a", task_name: "x" }), /file_path/);
  });

  // resolveDocPath solo arma la ruta; quien decide si es aceptable es estaDentro. Este test
  // fija esa división: un file_name con .. produce una ruta fuera, y la comprobación la ataja.
  it("deja fuera de la base una ruta con .. , y estaDentro la rechaza", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "login-sso");

    const ruta = resolveDocPath({
      project: "proyecto-a",
      task_name: "login-sso",
      file_name: path.join("..", "..", "..", "..", "fuera.md"),
    });

    assert.equal(estaDentro(docs, ruta), false);
  });
});
