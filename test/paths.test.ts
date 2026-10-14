import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as path from "node:path";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";

import {
  LIMITE_LECTURA_BYTES,
  discoverProjects,
  estaDentro,
  estaDentroReal,
  findProjectFolder,
  leerTextoAcotado,
  resolveDocPath,
  resolveRepoPath,
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

  it("rechaza un file_path con ..", () => {
    docsTemporales();

    assert.throws(() => resolveDocPath({ file_path: "../fuera.md" }), /file_path/);
    assert.throws(() => resolveDocPath({ file_path: "PROYECTO-A/../PROYECTO-B/x.md" }), /file_path/);
  });

  // file_path no sale de la base, pero creaba dentro de ella nombres que Windows, el
  // Explorador y OneDrive no pueden manejar: CON, nul.md, un flujo alterno "nota.md:secreto"…
  it("rechaza en file_path los segmentos que Windows no puede guardar", () => {
    docsTemporales();

    for (const filePath of ["PROYECTO-A/CON/x.md", "PROYECTO-A/nul.md", "a/nota.md:secreto", "C:x.md", "PROYECTO-A/tarea./x.md"]) {
      assert.throws(() => resolveDocPath({ file_path: filePath }), /file_path/, `debía rechazar ${filePath}`);
    }
  });

  it("rechaza un file_path absoluto", () => {
    const docs = docsTemporales();

    assert.throws(() => resolveDocPath({ file_path: path.join(docs, "x.md") }), /file_path.*absolut/s);
  });

  it("rechaza un file_path que sale de la Documentación por un enlace", () => {
    const docs = docsTemporales();
    crearSymlink(carpetaTemporal("fuera"), path.join(docs, "enlace"));

    assert.throws(() => resolveDocPath({ file_path: "enlace/x.md" }), /Acceso denegado/);
  });

  it("rechaza un task_name que no es un solo segmento", () => {
    const docs = docsTemporales();
    crearProyecto(docs, "PROYECTO-A");

    assert.throws(() => resolveTaskFolder("proyecto-a", "../../fuera"), /task_name/);
  });
});

// Carpeta de repos de mentira con repoA (código) y repoB (un .env que repoA no debe ver).
function reposTemporales(): string {
  const repos = carpetaTemporal("repos");
  fs.mkdirSync(path.join(repos, "repoA", "src"), { recursive: true });
  fs.writeFileSync(path.join(repos, "repoA", "src", "main.ts"), "x", "utf-8");
  fs.mkdirSync(path.join(repos, "repoB"), { recursive: true });
  fs.writeFileSync(path.join(repos, "repoB", ".env"), "TOKEN=x", "utf-8");
  process.env.ORQUESTADOR_REPOS_PATH = repos;
  return repos;
}

describe("resolveRepoPath", () => {
  it("arma <repos>/<repo>/<archivo>", () => {
    const repos = reposTemporales();

    assert.equal(resolveRepoPath("repoA", "src/main.ts"), path.join(repos, "repoA", "src", "main.ts"));
  });

  it("rechaza un repo_name que no es un solo segmento", () => {
    reposTemporales();

    for (const repo of ["..", "../repoB", "repoA/src", ""]) {
      assert.throws(() => resolveRepoPath(repo, "x.md"), /repo_name/, `debía rechazar ${JSON.stringify(repo)}`);
    }
  });

  // Antes la comprobación miraba solo la carpeta de repos: salir a un repo vecino pasaba.
  it("rechaza un file_path que sale a otro repo", () => {
    reposTemporales();

    assert.throws(() => resolveRepoPath("repoA", "../repoB/.env"), /Acceso denegado/);
  });

  it("rechaza un file_path que sale del repo por un enlace", () => {
    const repos = reposTemporales();
    crearSymlink(path.join(repos, "repoB"), path.join(repos, "repoA", "enlace"));

    assert.throws(() => resolveRepoPath("repoA", "enlace/.env"), /Acceso denegado/);
  });

  it("acepta un repo que es un enlace a otra carpeta", () => {
    const repos = reposTemporales();
    const real = carpetaTemporal("repo-real");
    fs.writeFileSync(path.join(real, "README.md"), "x", "utf-8");
    crearSymlink(real, path.join(repos, "repoC"));

    assert.equal(resolveRepoPath("repoC", "README.md"), path.join(repos, "repoC", "README.md"));
  });
});

describe("leerTextoAcotado", () => {
  it("el límite es 1 MB y un archivo de exactamente ese tamaño se lee", () => {
    const archivo = path.join(carpetaTemporal("lectura"), "justo.md");
    fs.writeFileSync(archivo, Buffer.alloc(LIMITE_LECTURA_BYTES, "a"));

    assert.equal(LIMITE_LECTURA_BYTES, 1_048_576);
    assert.equal(leerTextoAcotado(archivo).length, LIMITE_LECTURA_BYTES);
  });

  it("rechaza un byte por encima del límite", () => {
    const archivo = path.join(carpetaTemporal("lectura"), "grande.md");
    fs.writeFileSync(archivo, Buffer.alloc(LIMITE_LECTURA_BYTES + 1, "a"));

    assert.throws(() => leerTextoAcotado(archivo), /límite/);
  });

  it("rechaza un byte NUL dentro de los primeros 8000 bytes", () => {
    const archivo = path.join(carpetaTemporal("lectura"), "binario.md");
    const contenido = Buffer.alloc(8000, "a");
    contenido[7999] = 0;
    fs.writeFileSync(archivo, contenido);

    assert.throws(() => leerTextoAcotado(archivo), /parece binario/);
  });

  // Es la misma heurística que usa git: solo se miran los primeros 8000 bytes.
  it("no mira más allá de los primeros 8000 bytes", () => {
    const archivo = path.join(carpetaTemporal("lectura"), "tardio.md");
    const contenido = Buffer.alloc(8001, "a");
    contenido[8000] = 0;
    fs.writeFileSync(archivo, contenido);

    assert.equal(leerTextoAcotado(archivo).length, 8001);
  });

  it("devuelve el texto en UTF-8", () => {
    const archivo = path.join(carpetaTemporal("lectura"), "acentos.md");
    fs.writeFileSync(archivo, "Migración de Pagos (ñ)", "utf-8");

    assert.equal(leerTextoAcotado(archivo), "Migración de Pagos (ñ)");
  });

  it("rechaza una carpeta", () => {
    assert.throws(() => leerTextoAcotado(carpetaTemporal("lectura")), /no es un archivo/);
  });

  // Un FIFO dice pesar 0 bytes y leerlo se bloquea hasta que alguien escribe: la tool se
  // quedaba colgada. Solo existen en Linux y macOS.
  it("rechaza un FIFO sin quedarse bloqueada", { skip: process.platform === "win32" }, () => {
    const fifo = path.join(carpetaTemporal("lectura"), "tuberia");
    execFileSync("mkfifo", [fifo]);

    assert.throws(() => leerTextoAcotado(fifo), /no es un archivo/);
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
    // Windows también reserva los superíndices ¹²³ en COM y LPT, y las consolas CONIN$ y
    // CONOUT$; y no cuenta los espacios que haya antes de la extensión.
    ["COM¹", "reservado COM¹"],
    ["lpt³.txt", "reservado LPT³ con extensión"],
    ["CONIN$", "reservado CONIN$"],
    ["conout$.log", "reservado CONOUT$ con extensión"],
    ["nul .txt", "reservado NUL con espacio antes de la extensión"],
  ];

  for (const [valor, regla] of rechazados) {
    // JSON.stringify no escapa U+007F, y el título del test lo llevaría crudo.
    const visible = JSON.stringify(valor).replace(/\u007f/g, "\\u007f");
    it(`rechaza ${visible} (${regla}) y nombra el campo`, () => {
      assert.throws(() => validarSegmento(valor, "task_name"), /task_name/);
    });
  }

  it("permite espacios intermedios, acentos, ñ, guiones y paréntesis", () => {
    for (const valor of ["Exponer endpoints", "Tokens login", "Migración de Pagos (ñ)", "login-sso", "CONSOLA", "com10", "conin", "nul-pagos.md"]) {
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
