import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as path from "node:path";
import * as fs from "node:fs";

import {
  discoverProjects,
  estaDentro,
  estaDentroReal,
  findProjectFolder,
  resolveDocPath,
  resolveTaskFolder,
  rutaReal,
  validarSegmento,
} from "../src/paths.js";
import {
  carpetaTemporal,
  crearProyecto,
  crearSymlink,
  crearTarea,
  docsTemporales,
  limpiarEntorno,
} from "./helpers.js";

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

  // Antes resolveDocPath armaba la ruta con .. y era estaDentro, en la tool, quien la atajaba
  // si salía de la base. Una que salía de la tarea sin salir de la base pasaba.
  it("rechaza un file_name con .., salga o no de la base", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "login-sso");
    crearTarea(docs, "PROYECTO-A", "otra");

    const conFileName = (fileName: string) => () =>
      resolveDocPath({ project: "proyecto-a", task_name: "login-sso", file_name: fileName });

    assert.throws(conFileName(path.join("..", "..", "..", "..", "fuera.md")), /file_name/);
    assert.throws(conFileName("../otra/02 - Decisiones.md"), /file_name/);
  });

  it("rechaza un file_name absoluto", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    assert.throws(
      () => resolveDocPath({ project: "proyecto-a", task_name: "login-sso", file_name: path.join(docs, "x.md") }),
      /file_name.*absolut/s
    );
  });

  it("acepta un file_name con subcarpeta dentro de la tarea", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    const ruta = resolveDocPath({ project: "proyecto-a", task_name: "login-sso", file_name: "04 - Ejecución/L01 - x.md" });

    assert.equal(ruta, path.join(docs, "PROYECTO-A", "Proyectos", "login-sso", "04 - Ejecución", "L01 - x.md"));
  });

  it("rechaza un file_name que sale de la tarea por un enlace", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");
    const tarea = crearTarea(docs, "PROYECTO-A", "login-sso");
    const fuera = carpetaTemporal("fuera");
    crearSymlink(fuera, path.join(tarea, "enlace"));

    assert.throws(
      () => resolveDocPath({ project: "proyecto-a", task_name: "login-sso", file_name: "enlace/x.md" }),
      /Acceso denegado/
    );
  });

  it("rechaza un file_path que sale de la Documentación", () => {
    docsTemporales();

    assert.throws(() => resolveDocPath({ file_path: "../fuera.md" }), /Acceso denegado/);
  });

  it("rechaza un task_name que no es un solo segmento", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    assert.throws(() => resolveTaskFolder("proyecto-a", "../../fuera"), /task_name/);
  });
});

describe("validarSegmento", () => {
  const rechazados: Array<[string, string]> = [
    ["", "vacío"],
    ["   ", "solo espacios"],
    [".", "exactamente ."],
    ["..", "exactamente .."],
    ["a/b", "separador /"],
    ["..\\x", "separador \\"],
    ["login: sso", "carácter :"],
    ["a<b", "carácter <"],
    ["a>b", "carácter >"],
    ['a"b', 'carácter "'],
    ["a|b", "carácter |"],
    ["a?b", "carácter ?"],
    ["a*b", "carácter *"],
    ["a\u0000b", "control U+0000"],
    ["a\u001fb", "control U+001F"],
    ["a\u007fb", "control U+007F"],
    ["tarea.", "punto final"],
    ["tarea ", "espacio final"],
    ["con", "reservado CON"],
    ["NUL.txt", "reservado NUL con extensión"],
    ["Com1", "reservado COM1"],
    ["lpt9.md", "reservado LPT9 con extensión"],
    ["PRN", "reservado PRN"],
    ["aux", "reservado AUX"],
  ];

  for (const [valor, regla] of rechazados) {
    // JSON.stringify no escapa U+007F, y el título del test lo llevaría crudo.
    const visible = JSON.stringify(valor).replace(/\u007f/g, "\\u007f");
    it(`rechaza ${visible} (${regla}) y nombra el campo`, () => {
      assert.throws(() => validarSegmento(valor, "task_name"), /task_name/);
    });
  }

  it("permite espacios intermedios, acentos, ñ, guiones y paréntesis", () => {
    for (const valor of ["Exponer endpoints", "Tokens login", "Migración de Pagos (ñ)", "login-sso", "CONSOLA", "com10"]) {
      assert.equal(validarSegmento(valor, "task_name"), valor);
    }
  });
});

describe("rutaReal y estaDentroReal", () => {
  it("resuelve el ancestro existente y vuelve a unir lo que falta", () => {
    const destino = carpetaTemporal("destino");
    const base = carpetaTemporal("base");
    crearSymlink(destino, path.join(base, "enlace"));

    assert.equal(rutaReal(path.join(base, "enlace", "no", "existe.md")), path.join(destino, "no", "existe.md"));
  });

  it("rechaza lo que un enlace saca de la base", () => {
    const base = carpetaTemporal("base");
    const fuera = carpetaTemporal("fuera");
    crearSymlink(fuera, path.join(base, "enlace"));

    assert.equal(estaDentroReal(base, path.join(base, "enlace", "x.md")), false);
    assert.equal(estaDentroReal(base, path.join(base, "normal", "x.md")), true);
  });

  it("acepta una base que es enlace, comparando contra su ruta real", () => {
    const real = carpetaTemporal("real");
    const contenedor = carpetaTemporal("contenedor");
    const base = path.join(contenedor, "base-enlace");
    crearSymlink(real, base);

    assert.equal(estaDentroReal(base, path.join(base, "PROYECTO-A", "x.md")), true);
    assert.equal(estaDentroReal(base, path.join(real, "PROYECTO-A", "x.md")), true);
    assert.equal(estaDentroReal(base, path.join(contenedor, "x.md")), false);
  });
});
