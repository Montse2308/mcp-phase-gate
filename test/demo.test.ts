// La demo del Studio: determinista entre procesos, carpetas y zonas horarias; inmune al
// entorno de quien la genera (sus PHASE_GATE_*, su GIT_DIR, su configuración de git); sin datos del equipo
// en lo que escribe; y con sus guardas: gitEnLaDemo solo escribe dentro de una carpeta marcada, borrarDemo
// solo borra una, prepararDemo reutiliza solo la de esta versión, y `ui --demo` no lee la Documentación de
// quien lo lanza. Lo que se afirma entre procesos se prueba con procesos node de verdad.

import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fijarRaizDelPaquete } from "../src/config.js";
import { MARCA_DE_DEMO, gitEnLaDemo } from "../src/git.js";
import { activarDemo, borrarDemo, carpetaDeTextos, carpetasDeDemo, entornoDeDemo, entornoInitDeDemo, generarDemo, prepararDemo, textoDeLaMarca } from "../src/studio/demo.js";
import { carpetaTemporal, crearProyecto, crearSymlink, limpiarEntorno } from "./helpers.js";
import { git, huellaDelArbol, pedir } from "./studio-ayudas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..", "..");
const CONFIG_JS = pathToFileURL(path.join(AQUI, "..", "src", "config.js")).href;
const DEMO_JS = pathToFileURL(path.join(AQUI, "..", "src", "studio", "demo.js")).href;
const INDEX_JS = pathToFileURL(path.join(AQUI, "..", "src", "index.js")).href;

// Los HEAD de los dos repos de la demo. Compararlos con constantes, y no solo entre dos generaciones, atrapa
// cualquier cosa del equipo que se cuele en un commit (la zona horaria, una configuración de git, el autor).
const HEAD_DE_ORO = { "tienda-api": "debffa2c5f0b55eb2c337d03c75f877a2328a15e", "tienda-web": "cacff76178c5fa43ad7ed46a0587232bc45b1270" };
const COMMITS = { "tienda-api": "4", "tienda-web": "2" };
// La demo en inglés: la misma historia, otros textos, otros SHA; también fijos.
const HEAD_DE_ORO_EN = { "shop-api": "46b45c1bc9351ff7db8d6e58607dd1da77eb077f", "shop-web": "8706b5ac3c2aac64f2640193eadad97977b95101" };

const cerrables: (() => void)[] = [];
afterEach(() => {
  for (const cerrar of cerrables.splice(0)) cerrar();
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function hasta(condicion: () => boolean, ms = 5000): Promise<boolean> {
  const limite = Date.now() + ms;
  while (!condicion() && Date.now() < limite) await esperar(25);
  return condicion();
}

// Todo lo que hay fuera de .git, con sus bytes y su fecha: dos demos iguales dan la misma lista.
function arbolDeLaDemo(raiz: string): string[] {
  const lineas: string[] = [];
  const recorrer = (carpeta: string, relativa: string): void => {
    for (const e of fs.readdirSync(carpeta, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name === ".git") continue;
      const ruta = path.join(carpeta, e.name);
      const info = fs.statSync(ruta);
      const rel = relativa ? `${relativa}/${e.name}` : e.name;
      if (e.isDirectory()) {
        lineas.push(`${rel}/|${info.mtimeMs}`);
        recorrer(ruta, rel);
      } else lineas.push(`${rel}|${info.size}|${info.mtimeMs}|${createHash("sha256").update(fs.readFileSync(ruta)).digest("hex")}`);
    }
  };
  lineas.push(`./|${fs.statSync(raiz).mtimeMs}`);
  recorrer(raiz, "");
  return lineas;
}

function heads(raiz: string): Record<string, string> {
  return Object.fromEntries(Object.keys(HEAD_DE_ORO).map((repo) => [repo, git(path.join(raiz, "repos", repo), "rev-parse", "HEAD")]));
}

function cuentas(raiz: string): Record<string, string> {
  return Object.fromEntries(Object.keys(COMMITS).map((repo) => [repo, git(path.join(raiz, "repos", repo), "rev-list", "--count", "HEAD")]));
}

// Un proceso node que genera la demo en `destino` con el entorno dado. Imprime, al terminar, lo que tiene
// del entorno que la demo pide prestado: tiene que ser lo mismo que tenía antes.
const SCRIPT_GENERAR = [
  "const [config, demo, raiz, destino] = process.argv.slice(2);",
  "const { fijarRaizDelPaquete } = await import(config);",
  "fijarRaizDelPaquete(raiz);",
  "const { generarDemo } = await import(demo);",
  "await generarDemo(destino, process.argv[6] ?? 'es');",
  "console.log(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PHASE_GATE_|ORQUESTADOR_|GIT_|TZ$)/i.test(k)).sort())));",
].join("\n");

function generarEnOtroProceso(destino: string, env: NodeJS.ProcessEnv, idioma: "es" | "en" = "es"): Promise<{ codigo: number | null; salida: string; error: string }> {
  const script = path.join(carpetaTemporal("script"), "generar.mjs");
  fs.writeFileSync(script, SCRIPT_GENERAR, "utf-8");
  return new Promise((resolver) => {
    const hijo = spawn(process.execPath, [script, CONFIG_JS, DEMO_JS, RAIZ, destino, idioma], { env, cwd: path.dirname(script), stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (error += d));
    hijo.on("exit", (codigo) => resolver({ codigo, salida: salida.trim(), error }));
  });
}

// El entorno de los tests sin nada que la demo pudiera leer: ninguna PHASE_GATE_*, ORQUESTADOR_* ni GIT_*.
function entornoLimpio(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PHASE_GATE_|ORQUESTADOR_|GIT_)/i.test(k)));
}

const prestado = (env: NodeJS.ProcessEnv) => JSON.stringify(Object.fromEntries(Object.entries(env).filter(([k]) => /^(PHASE_GATE_|ORQUESTADOR_|GIT_|TZ$)/i.test(k)).sort()));

describe("demo: determinista", () => {
  it("dos procesos, dos carpetas (una con espacios y acentos) y dos zonas horarias: los mismos bytes y fechas, y los HEAD de oro", async () => {
    const a = path.join(carpetaTemporal("demo"), "con espacios y acentos ñá", "demo");
    const b = path.join(carpetaTemporal("demo"), "demo");
    const envA = { ...entornoLimpio(), TZ: "America/Los_Angeles" };
    const envB = entornoLimpio();
    const [ra, rb] = await Promise.all([generarEnOtroProceso(a, envA), generarEnOtroProceso(b, envB)]);
    assert.equal(ra.codigo, 0, ra.error);
    assert.equal(rb.codigo, 0, rb.error);
    assert.equal(ra.salida, prestado(envA), "el entorno vuelve a ser el de antes");
    assert.equal(rb.salida, prestado(envB));

    const arbol = arbolDeLaDemo(a);
    assert.deepEqual(arbolDeLaDemo(b), arbol);
    assert.deepEqual([arbol.filter((l) => !l.split("|")[0]!.endsWith("/")).length, arbol.length - 1], [39, 63], "39 archivos y 24 carpetas fuera de .git");
    assert.deepEqual(heads(a), HEAD_DE_ORO);
    assert.deepEqual(heads(b), HEAD_DE_ORO);
    assert.deepEqual(cuentas(a), COMMITS);
    // Nada de la plantilla de la instalación de git (sus hooks de ejemplo, su description).
    for (const repo of Object.keys(HEAD_DE_ORO)) assert.deepEqual(["description", "hooks", "info"].filter((n) => fs.existsSync(path.join(a, "repos", repo, ".git", n))), [], repo);
    // envio-gratis va por el lote 2 de 3, con su commit pendiente: el cambio de web sigue sin commitear.
    assert.equal(git(path.join(a, "repos", "tienda-web"), "status", "--porcelain"), "M src/carrito.html");
  });

  it("la demo en inglés: dos procesos en dos zonas horarias, los mismos bytes, sus HEAD de oro, y todo en inglés", async () => {
    const a = path.join(carpetaTemporal("demo-en"), "demo");
    const b = path.join(carpetaTemporal("demo-en"), "demo");
    const [ra, rb] = await Promise.all([generarEnOtroProceso(a, { ...entornoLimpio(), TZ: "Asia/Kolkata" }, "en"), generarEnOtroProceso(b, entornoLimpio(), "en")]);
    assert.equal(ra.codigo, 0, ra.error);
    assert.equal(rb.codigo, 0, rb.error);
    assert.deepEqual(arbolDeLaDemo(b), arbolDeLaDemo(a));
    for (const [repo, sha] of Object.entries(HEAD_DE_ORO_EN)) assert.equal(git(path.join(a, "repos", repo), "rev-parse", "HEAD"), sha, repo);
    assert.equal(git(path.join(a, "repos", "shop-api"), "log", "--reverse", "--format=%s").split("\n")[0], "chore: initial state");
    // La misma historia: los mismos documentos y recibos, con los nombres ingleses y la subcarpeta Projects.
    const tareas = path.join(a, "docs", "SHOP", "Projects");
    assert.deepEqual(fs.readdirSync(tareas).sort(), ["discount-coupons", "free-shipping"]);
    assert.ok(fs.existsSync(path.join(tareas, "discount-coupons", "04 - Execution.md")));
    assert.equal(fs.readdirSync(path.join(tareas, "discount-coupons", "04 - Execution")).length, 4);
    const indice = fs.readFileSync(path.join(tareas, "discount-coupons", "04 - Execution.md"), "utf-8");
    assert.match(indice, /^---\nbatches: 4\ngenerated_by: mcp-phase-gate\n---/);
    assert.match(indice, /\| L04 \| api \| .* \| discarded \|/);
    for (const archivo of arbolDeLaDemo(a).map((l) => l.split("|")[0]!)) assert.doesNotMatch(archivo, /Proyectos|Ejecución|Contexto|Análisis/, archivo);
    assert.equal(fs.readFileSync(path.join(a, ".demo-mcp-phase-gate"), "utf-8").includes("(en)"), true);
  });

  it("un entorno hostil (otra zona horaria, otra capa de prompts, otra Documentación, GIT_DIR, un .gitconfig con hooks) no cambia nada", async () => {
    const hostil = carpetaTemporal("hostil");
    // Una fase 4 propia, con los recibos en otra carpeta: si se colara, los recibos cambiarían de sitio.
    const prompts = path.join(hostil, "prompts");
    fs.mkdirSync(prompts);
    fs.writeFileSync(path.join(prompts, "fase-4-ejecucion.md"), "---\ndocumento: 04 - Otra.md\nrecibos: Otros Recibos\n---\n\n# Otra\n", "utf-8");
    const docsAjenos = path.join(hostil, "docs");
    crearProyecto(docsAjenos, "MARCADOR", "Ajena");
    // Un repo señuelo al que apunta GIT_DIR: si se colara, los commits de la demo caerían ahí.
    const senuelo = path.join(hostil, "senuelo");
    fs.mkdirSync(senuelo);
    git(senuelo, "init", "-q");
    fs.writeFileSync(path.join(senuelo, "a.txt"), "a", "utf-8");
    git(senuelo, "add", "a.txt");
    git(senuelo, "commit", "-q", "-m", "señuelo");
    const headSenuelo = git(senuelo, "rev-parse", "HEAD");
    // Una casa con su configuración de git: otra codificación de los mensajes (cambiaría los SHA) y unos
    // hooks que dejarían una marca y harían fallar el commit.
    const casa = path.join(hostil, "casa");
    const hooks = path.join(hostil, "hooks");
    const marcaDelHook = path.join(hostil, "el-hook-se-ejecuto");
    fs.mkdirSync(hooks, { recursive: true });
    fs.writeFileSync(path.join(hooks, "pre-commit"), `#!/bin/sh\necho x > "${marcaDelHook.replace(/\\/g, "/")}"\nexit 1\n`, { encoding: "utf-8", mode: 0o755 });
    const gitconfig = `[user]\n\tname = Intruso\n\temail = intruso@example.invalid\n[i18n]\n\tcommitEncoding = ISO-8859-1\n[core]\n\thooksPath = ${hooks.replace(/\\/g, "/")}\n\tautocrlf = true\n`;
    fs.mkdirSync(path.join(casa, ".config", "git"), { recursive: true });
    fs.writeFileSync(path.join(casa, ".gitconfig"), gitconfig, "utf-8");
    fs.writeFileSync(path.join(casa, ".config", "git", "config"), gitconfig, "utf-8");
    const antes = huellaDelArbol(prompts, docsAjenos, senuelo, casa, hooks);

    const a = path.join(carpetaTemporal("demo"), "demo");
    const b = path.join(carpetaTemporal("demo"), "demo");
    const c = path.join(carpetaTemporal("demo"), "demo");
    const envA = { ...entornoLimpio(), TZ: "America/Los_Angeles" };
    // C, con los nombres de antes (ORQUESTADOR_*): sin la principal, el alias valdría.
    const envC = { ...entornoLimpio(), TZ: "Asia/Kathmandu", ORQUESTADOR_PROMPTS_PATH: prompts, ORQUESTADOR_DOCS_PATH: docsAjenos };
    const envB = {
      ...entornoLimpio(),
      TZ: "Pacific/Kiritimati",
      PHASE_GATE_PROMPTS_PATH: prompts,
      ORQUESTADOR_DOCS_PATH: docsAjenos,
      PHASE_GATE_TASKS_SUBDIR: "Ajena",
      GIT_DIR: path.join(senuelo, ".git"),
      GIT_WORK_TREE: senuelo,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "i18n.commitEncoding",
      GIT_CONFIG_VALUE_0: "ISO-8859-1",
      HOME: casa,
      USERPROFILE: casa,
      XDG_CONFIG_HOME: path.join(casa, ".config"),
    };
    const [ra, rb, rc] = await Promise.all([generarEnOtroProceso(a, envA), generarEnOtroProceso(b, envB), generarEnOtroProceso(c, envC)]);
    for (const r of [ra, rb, rc]) assert.equal(r.codigo, 0, r.error);
    assert.equal(rb.salida, prestado(envB), "el entorno hostil vuelve a quedar como estaba");
    assert.equal(rc.salida, prestado(envC));

    for (const otra of [b, c]) {
      assert.deepEqual(arbolDeLaDemo(otra), arbolDeLaDemo(a));
      assert.deepEqual(heads(otra), HEAD_DE_ORO);
      assert.deepEqual(cuentas(otra), COMMITS);
    }
    assert.equal(git(senuelo, "rev-parse", "HEAD"), headSenuelo, "el señuelo no recibió ningún commit");
    assert.equal(fs.existsSync(marcaDelHook), false, "ningún hook se ejecutó");
    assert.deepEqual(huellaDelArbol(prompts, docsAjenos, senuelo, casa, hooks), antes);
  });

  it("sin datos del equipo: ni el temporal, ni la raíz de la demo, ni el usuario, el equipo, la carpeta personal o la versión de git", async () => {
    fijarRaizDelPaquete(RAIZ);
    const raiz = path.join(carpetaTemporal("demo"), "demo");
    const envAntes = prestado(process.env);
    await generarDemo(raiz);
    assert.equal(prestado(process.env), envAntes, "el entorno del proceso vuelve a ser el de antes");

    const formas = (ruta: string) => [ruta, ruta.replace(/\\/g, "/"), ruta.replace(/\\/g, "\\\\")].map((r) => r.toLowerCase());
    const rutas = [os.tmpdir(), fs.realpathSync.native(os.tmpdir()), os.homedir(), raiz, fs.realpathSync.native(raiz)].flatMap(formas);
    // El usuario y el equipo pueden ser palabras cortas o comunes: un valor que ya está en los textos de la
    // demo no dice nada de este equipo.
    const textos = fs.readdirSync(carpetaDeTextos(), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => fs.readFileSync(path.join(e.parentPath, e.name), "utf-8")).join("\n");
    const versionDeGit = execFileSync("git", ["--version"], { encoding: "utf8" }).trim().replace(/^git version /, "");
    const nombres = [os.userInfo().username, os.hostname(), versionDeGit].filter((v) => v.length >= 3 && !textos.includes(v));
    assert.ok(nombres.includes(versionDeGit));

    let revisados = 0;
    const recorrer = (carpeta: string): void => {
      for (const e of fs.readdirSync(carpeta, { withFileTypes: true })) {
        const ruta = path.join(carpeta, e.name);
        const rel = path.relative(raiz, ruta).replace(/\\/g, "/");
        if (/(^|\/)\.git\/(objects|index$)/.test(rel)) continue;
        if (e.isDirectory()) {
          recorrer(ruta);
          continue;
        }
        const texto = fs.readFileSync(ruta, "utf-8");
        const minusculas = texto.toLowerCase();
        for (const r of rutas) assert.ok(!minusculas.includes(r), `${rel} lleva la ruta ${r}`);
        for (const n of nombres) assert.ok(!texto.includes(n), `${rel} lleva ${n}`);
        revisados++;
      }
    };
    recorrer(raiz);
    assert.ok(revisados > 39, `${revisados} archivos revisados, también los de .git`);
  });
});

describe("demo: gitEnLaDemo, la única escritura en git", () => {
  const cuando = { fecha: "2026-03-02T10:00:00.000Z", nombre: "Demo", correo: "demo@example.invalid" };

  function carpetaMarcada(): { raiz: string; repo: string } {
    const raiz = carpetaTemporal("demo");
    fs.writeFileSync(path.join(raiz, MARCA_DE_DEMO), textoDeLaMarca(), "utf-8");
    const repo = path.join(raiz, "repos", "r");
    fs.mkdirSync(repo, { recursive: true });
    return { raiz, repo };
  }

  it("sin la marca, fuera de la raíz, en la raíz misma o saliendo con ..: no ejecuta nada", () => {
    const sinMarca = carpetaTemporal("demo");
    fs.mkdirSync(path.join(sinMarca, "r"));
    assert.throws(() => gitEnLaDemo(sinMarca, path.join(sinMarca, "r"), ["init", "-q"], cuando), /no es una carpeta de demo/);
    assert.equal(fs.existsSync(path.join(sinMarca, "r", ".git")), false);

    const { raiz } = carpetaMarcada();
    const fuera = carpetaTemporal("fuera");
    assert.throws(() => gitEnLaDemo(raiz, fuera, ["init", "-q"], cuando), /no está dentro/);
    assert.throws(() => gitEnLaDemo(raiz, raiz, ["init", "-q"], cuando), /no está dentro/);
    assert.throws(() => gitEnLaDemo(raiz, `${raiz}${path.sep}repos${path.sep}..${path.sep}..${path.sep}${path.basename(fuera)}`, ["init", "-q"], cuando), /no está dentro/);
    assert.equal(fs.existsSync(path.join(fuera, ".git")), false);
    assert.equal(fs.existsSync(path.join(raiz, ".git")), false);
  });

  it("init sin plantilla; un hook pre-commit en .git/hooks no se ejecuta (con git a secas, sí)", () => {
    const { raiz, repo } = carpetaMarcada();
    gitEnLaDemo(raiz, repo, ["init", "-q", "--template="], cuando);
    assert.equal(fs.existsSync(path.join(repo, ".git", "hooks")), false, "nada de la plantilla de la instalación de git");
    const marcaDelHook = path.join(raiz, "..", `${path.basename(raiz)}-hook`);
    fs.mkdirSync(path.join(repo, ".git", "hooks"));
    fs.writeFileSync(path.join(repo, ".git", "hooks", "pre-commit"), `#!/bin/sh\necho x > "${marcaDelHook.replace(/\\/g, "/")}"\nexit 1\n`, { encoding: "utf-8", mode: 0o755 });
    cerrables.push(() => fs.rmSync(marcaDelHook, { force: true }));
    fs.writeFileSync(path.join(repo, "a.txt"), "a\n", "utf-8");
    gitEnLaDemo(raiz, repo, ["add", "a.txt"], cuando);
    gitEnLaDemo(raiz, repo, ["commit", "-q", "-m", "a"], cuando);
    assert.equal(fs.existsSync(marcaDelHook), false, "el hook no se ejecutó");
    // Las fechas se comparan como instantes y no como texto: la misma fecha la escribe git distinta según
    // su versión (%aI y %cI pueden decir Z o +00:00 para el mismo instante).
    const [autor = "", fechaAutor = "", committer = "", fechaCommitter = ""] = git(repo, "log", "--format=%an <%ae>|%aI|%cn <%ce>|%cI", "-1").split("|");
    assert.equal(autor, "Demo <demo@example.invalid>");
    assert.equal(committer, "Demo <demo@example.invalid>");
    assert.equal(Date.parse(fechaAutor), Date.parse("2026-03-02T10:00:00.000Z"));
    assert.equal(Date.parse(fechaCommitter), Date.parse("2026-03-02T10:00:00.000Z"));

    // Control: el mismo hook, con git a secas (sin la configuración de quien corre los tests), sí corre y
    // tumba el commit.
    const vacia = path.join(carpetaTemporal("gitconfig"), "vacia");
    fs.writeFileSync(vacia, "", "utf-8");
    fs.writeFileSync(path.join(repo, "b.txt"), "b\n", "utf-8");
    const env = { ...entornoLimpio(), GIT_CONFIG_GLOBAL: vacia, GIT_CONFIG_NOSYSTEM: "1" };
    execFileSync("git", ["add", "b.txt"], { cwd: repo, env, stdio: "ignore" });
    assert.throws(() => execFileSync("git", ["-c", "user.name=x", "-c", "user.email=x@example.invalid", "commit", "-q", "-m", "b"], { cwd: repo, env, stdio: "ignore" }));
    assert.equal(fs.existsSync(marcaDelHook), true, "con git a secas el hook sí se ejecuta");
  });

  it("un GIT_DIR heredado no desvía el commit a otro repo", () => {
    const { raiz, repo } = carpetaMarcada();
    const senuelo = carpetaTemporal("senuelo");
    git(senuelo, "init", "-q");
    fs.writeFileSync(path.join(senuelo, "s.txt"), "s", "utf-8");
    git(senuelo, "add", "s.txt");
    git(senuelo, "commit", "-q", "-m", "señuelo");
    const headSenuelo = git(senuelo, "rev-parse", "HEAD");
    process.env.GIT_DIR = path.join(senuelo, ".git");
    process.env.GIT_WORK_TREE = senuelo;
    cerrables.push(() => {
      delete process.env.GIT_DIR;
      delete process.env.GIT_WORK_TREE;
    });
    gitEnLaDemo(raiz, repo, ["init", "-q", "--template="], cuando);
    fs.writeFileSync(path.join(repo, "a.txt"), "a\n", "utf-8");
    gitEnLaDemo(raiz, repo, ["add", "a.txt"], cuando);
    gitEnLaDemo(raiz, repo, ["commit", "-q", "-m", "a"], cuando);
    const head = gitEnLaDemo(raiz, repo, ["rev-parse", "HEAD"], cuando).trim();
    delete process.env.GIT_DIR;
    delete process.env.GIT_WORK_TREE;
    assert.equal(git(senuelo, "rev-parse", "HEAD"), headSenuelo);
    assert.equal(git(repo, "rev-parse", "HEAD"), head);
    assert.equal(git(repo, "log", "--format=%s", "-1"), "a");
  });
});

describe("demo: borrar, preparar y activar", () => {
  it("borrarDemo: sin la marca no borra nada; con ella, nombres con acentos y objetos de git de solo lectura, sin seguir enlaces", () => {
    const sinMarca = carpetaTemporal("demo");
    fs.writeFileSync(path.join(sinMarca, "a.md"), "a", "utf-8");
    const antes = huellaDelArbol(sinMarca);
    assert.throws(() => borrarDemo(sinMarca), /no es una carpeta de demo/);
    assert.deepEqual(huellaDelArbol(sinMarca), antes);

    const raiz = path.join(carpetaTemporal("demo"), "demo");
    fs.mkdirSync(path.join(raiz, "docs"), { recursive: true });
    fs.writeFileSync(path.join(raiz, MARCA_DE_DEMO), textoDeLaMarca(), "utf-8");
    fs.writeFileSync(path.join(raiz, "docs", "01 - Análisis Técnico.md"), "á", "utf-8");
    const repo = path.join(raiz, "repos", "r");
    fs.mkdirSync(repo, { recursive: true });
    const cuando = { fecha: "2026-03-02T10:00:00.000Z", nombre: "Demo", correo: "demo@example.invalid" };
    gitEnLaDemo(raiz, repo, ["init", "-q", "--template="], cuando);
    fs.writeFileSync(path.join(repo, "a.txt"), "a\n", "utf-8");
    gitEnLaDemo(raiz, repo, ["add", "a.txt"], cuando);
    gitEnLaDemo(raiz, repo, ["commit", "-q", "-m", "a"], cuando);
    // El auto-mantenimiento de git puede dejar un maintenance.lock efímero en objects/: se elige un
    // objeto de verdad (los bloqueos de git acaban en .lock) para no chmod un archivo que ya se fue.
    const objeto = fs.readdirSync(path.join(repo, ".git", "objects"), { recursive: true, withFileTypes: true }).find((e) => e.isFile() && !e.name.endsWith(".lock"))!;
    fs.chmodSync(path.join(objeto.parentPath, objeto.name), 0o444);
    // Un enlace dentro de la demo a una carpeta de fuera: se quita el enlace, no lo que hay detrás.
    const fuera = carpetaTemporal("fuera");
    fs.writeFileSync(path.join(fuera, "mio.txt"), "mío", "utf-8");
    crearSymlink(fuera, path.join(raiz, "enlace"));

    borrarDemo(raiz);
    assert.equal(fs.existsSync(raiz), false);
    assert.equal(fs.readFileSync(path.join(fuera, "mio.txt"), "utf-8"), "mío");
  });

  it("prepararDemo: genera, reutiliza la de esta versión, regenera la de otra y no toca una carpeta sin marca", async () => {
    fijarRaizDelPaquete(RAIZ);
    const padre = carpetaTemporal("demo");
    const raiz = path.join(padre, "mcp-phase-gate-demo");
    const primera = await prepararDemo("es", raiz);
    assert.deepEqual(primera, { carpetas: carpetasDeDemo(raiz), reutilizada: false });
    assert.deepEqual(heads(raiz), HEAD_DE_ORO);
    assert.deepEqual(fs.readdirSync(padre), ["mcp-phase-gate-demo"], "no queda la carpeta de al lado");

    // Lo que se deje dentro sigue ahí si se reutiliza, y desaparece si se regenera.
    const testigo = path.join(raiz, "docs", "testigo.txt");
    fs.writeFileSync(testigo, "t", "utf-8");
    assert.equal((await prepararDemo("es", raiz)).reutilizada, true);
    assert.ok(fs.existsSync(testigo));

    fs.writeFileSync(path.join(raiz, MARCA_DE_DEMO), textoDeLaMarca().replace(/ \d+\.\d+\.\d+\S*\./, " 0.0.1."), "utf-8");
    assert.notEqual(fs.readFileSync(path.join(raiz, MARCA_DE_DEMO), "utf-8"), textoDeLaMarca());
    assert.equal((await prepararDemo("es", raiz)).reutilizada, false);
    assert.equal(fs.existsSync(testigo), false);
    assert.equal(fs.readFileSync(path.join(raiz, MARCA_DE_DEMO), "utf-8"), textoDeLaMarca());
    assert.deepEqual(fs.readdirSync(padre), ["mcp-phase-gate-demo"]);

    const ajena = path.join(carpetaTemporal("ajena"), "mcp-phase-gate-demo");
    fs.mkdirSync(path.join(ajena, "docs"), { recursive: true });
    fs.writeFileSync(path.join(ajena, "docs", "mio.md"), "mío", "utf-8");
    const antes = huellaDelArbol(path.dirname(ajena));
    await assert.rejects(prepararDemo("es", ajena), /no es una carpeta de demo/);
    assert.deepEqual(huellaDelArbol(path.dirname(ajena)), antes);
  });

  it("activarDemo: fuera las PHASE_GATE_* (salvo PHASE_GATE_LANG), ORQUESTADOR_* y GIT_* de quien lanza, dentro las de la demo; init en la casa de la demo, sin ejecutar nada", async () => {
    const c = carpetasDeDemo(carpetaTemporal("demo"));
    process.env.PHASE_GATE_DOCS_PATH = "ajena";
    process.env.PHASE_GATE_PROMPTS_PATH = "ajena";
    process.env.ORQUESTADOR_REPOS_PATH = "ajena";
    process.env.orquestador_minusculas = "ajena";
    process.env.GIT_DIR = "ajena";
    cerrables.push(() => {
      delete process.env.orquestador_minusculas;
      delete process.env.GIT_DIR;
    });
    activarDemo(c);
    const quedan = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PHASE_GATE_|ORQUESTADOR_|GIT_)/i.test(k)));
    // PHASE_GATE_LANG se queda (los tests la fijan en "es"): es el idioma de los mensajes, no una ruta.
    assert.deepEqual(quedan, { ...entornoDeDemo(c), PHASE_GATE_LANG: "es" });

    const init = entornoInitDeDemo(c);
    assert.equal(init.home, c.casa);
    for (const ruta of [init.appData!, init.xdgConfig!]) assert.ok(!path.relative(c.casa, ruta).startsWith(".."), ruta);
    await assert.rejects(init.ejecutar("claude", ["mcp", "list"]), /en la demo no se ejecuta `claude`/);
  });
});

describe("demo: ui --demo, un proceso de verdad", () => {
  it("genera la demo en el temporal, sirve el modo demo con su banda y no lee la Documentación de quien lo lanza; la segunda vez la reutiliza", async () => {
    const temporal = carpetaTemporal("tmp");
    const casa = carpetaTemporal("casa");
    const docs = carpetaTemporal("docs");
    crearProyecto(docs, "MARCADOR");
    const env: NodeJS.ProcessEnv = {
      ...entornoLimpio(),
      TEMP: temporal,
      TMP: temporal,
      TMPDIR: temporal,
      HOME: casa,
      USERPROFILE: casa,
      APPDATA: path.join(casa, "AppData", "Roaming"),
      LOCALAPPDATA: path.join(casa, "AppData", "Local"),
      XDG_CONFIG_HOME: path.join(casa, ".config"),
      PHASE_GATE_DOCS_PATH: docs,
      PHASE_GATE_REPOS_PATH: carpetaTemporal("repos"),
      PHASE_GATE_STATE_PATH: carpetaTemporal("estado"),
      PHASE_GATE_CONFIG_PATH: carpetaTemporal("config"),
      // La demo y los mensajes en español, sin depender del idioma del sistema (en una CI de Linux, inglés).
      PHASE_GATE_LANG: "es",
    };
    const marcadores = [env.PHASE_GATE_DOCS_PATH!, env.PHASE_GATE_REPOS_PATH!, env.PHASE_GATE_STATE_PATH!, env.PHASE_GATE_CONFIG_PATH!];
    const antes = huellaDelArbol(...marcadores);
    const script = path.join(carpetaTemporal("script"), "ui.mjs");
    fs.writeFileSync(script, [`const { fijarRaizDelPaquete } = await import(${JSON.stringify(CONFIG_JS)});`, `fijarRaizDelPaquete(${JSON.stringify(RAIZ)});`, `await import(${JSON.stringify(INDEX_JS)});`].join("\n"), "utf-8");
    const raizDemo = path.join(temporal, process.getuid ? `mcp-phase-gate-demo-${process.getuid()}` : "mcp-phase-gate-demo");

    const lanzar = async (): Promise<{ hijo: ChildProcess; salida: () => string; puerto: number; cookie: string }> => {
      const hijo = spawn(process.execPath, [script, "ui", "--demo", "--no-abrir"], { env, cwd: path.dirname(script), stdio: ["ignore", "pipe", "pipe"] });
      cerrables.push(() => {
        if (hijo.exitCode === null) hijo.kill("SIGKILL");
      });
      let salida = "";
      hijo.stdout!.on("data", (d) => (salida += d));
      hijo.stderr!.on("data", (d) => (salida += d));
      assert.ok(await hasta(() => /token=/.test(salida), 30_000), salida);
      const url = new URL(salida.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)![0]);
      const canje = await pedir(Number(url.port), "GET", `/?token=${url.searchParams.get("token")}`);
      assert.equal(canje.estado, 303);
      return { hijo, salida: () => salida, puerto: Number(url.port), cookie: String(canje.cabeceras["set-cookie"]![0]).split(";")[0]! };
    };
    const cerrar = async (hijo: ChildProcess) => {
      hijo.kill();
      assert.ok(await hasta(() => hijo.exitCode !== null || hijo.signalCode !== null, 10_000), "el proceso se cerró");
    };

    const uno = await lanzar();
    assert.ok(uno.salida().includes(`Demo generada en ${raizDemo}.`), uno.salida());
    const config = await pedir(uno.puerto, "GET", "/config.js", { Cookie: uno.cookie });
    assert.equal(config.estado, 200);
    assert.ok(config.texto.includes('window.PG_MODO = "demo";'));
    assert.ok(config.texto.includes(`window.PG_BANDA = ${JSON.stringify(`Demo: datos de ejemplo en ${raizDemo}`)};`), config.texto);
    const estado = await pedir(uno.puerto, "GET", "/api/estado", { Cookie: uno.cookie });
    assert.equal(estado.estado, 200);
    assert.equal(estado.json.studio.modo, "demo");
    const proyectos = await pedir(uno.puerto, "GET", "/api/proyectos", { Cookie: uno.cookie });
    assert.equal(proyectos.estado, 200);
    assert.deepEqual(proyectos.json.proyectos.map((p: { nombre: string }) => p.nombre).sort(), ["ASISTENTE", "INVESTIGACION", "TIENDA"]);
    await cerrar(uno.hijo);
    assert.deepEqual(heads(raizDemo), HEAD_DE_ORO);

    const dos = await lanzar();
    assert.ok(!dos.salida().includes("Demo generada"), dos.salida());
    const otra = await pedir(dos.puerto, "GET", "/api/proyectos", { Cookie: dos.cookie });
    assert.deepEqual(otra.json.proyectos.map((p: { nombre: string }) => p.nombre).sort(), ["ASISTENTE", "INVESTIGACION", "TIENDA"]);
    await cerrar(dos.hijo);

    assert.deepEqual(huellaDelArbol(...marcadores), antes, "la Documentación, los repos, el estado y la configuración de quien lo lanza, intactos");
    assert.deepEqual(fs.readdirSync(temporal).filter((n) => n.startsWith("mcp-phase-gate-demo")), [path.basename(raizDemo)]);
  });
});
