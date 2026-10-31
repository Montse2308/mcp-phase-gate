// La verificación de anclas, con repos de git reales en carpetas
// temporales: commits en la rama y fuera de ella, el primero del repo, la comparación de archivos, y el
// sha256 de un artefacto con su contención.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import { anclarArtefacto, anclarCommit, compararArchivos, reverificar, sha256DeArchivo, TOPE_DE_ARTEFACTO } from "../src/anclas.js";
import { SHA, archivosDeCommit, clasificarRevParse, datosDeCommit, esAncestroDeHead, ramaActual, ramasQueContienen, resolverCommit, tieneGit } from "../src/git.js";
import type { Recibo } from "../src/recibos.js";
import { carpetaTemporal, crearProyecto, crearSymlink, docsTemporales, limpiarEntorno } from "./helpers.js";

afterEach(() => limpiarEntorno());

function g(dir: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Prueba", "-c", "user.email=prueba@ejemplo.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args],
    { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
}

function commit(repo: string, archivos: Record<string, string>, mensaje: string): string {
  for (const [nombre, contenido] of Object.entries(archivos)) {
    fs.mkdirSync(path.dirname(path.join(repo, nombre)), { recursive: true });
    fs.writeFileSync(path.join(repo, nombre), contenido, "utf-8");
    g(repo, "add", nombre);
  }
  g(repo, "commit", "-q", "-m", mensaje);
  return g(repo, "rev-parse", "HEAD");
}

// Un proyecto P con el repo `api` en <REPOS>/api: dos commits en main y uno en la rama `otra`.
function instalacion() {
  const docs = docsTemporales();
  crearProyecto(docs, "P");
  const repos = carpetaTemporal("repos");
  process.env.PHASE_GATE_REPOS_PATH = repos;
  fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, repos: [{ id: "api", dir: "api" }] }), "utf-8");
  const repo = path.join(repos, "api");
  fs.mkdirSync(repo);
  g(repo, "init", "-q");
  const primero = commit(repo, { "a.txt": "uno\n" }, "primero");
  const segundo = commit(repo, { "src/b.ts": "b\n", "src/c.ts": "c\n" }, "fix(b): segundo commit");
  g(repo, "switch", "-q", "-c", "otra");
  const enOtra = commit(repo, { "d.txt": "d\n" }, "en otra");
  g(repo, "switch", "-q", "main");
  return { docs, repos, repo, primero, segundo, enOtra };
}

function reciboCon(ancla: Recibo["ancla"]): Recibo {
  return {
    lote: 1, de: 1, titulo: "x", repo: ancla.tipo === "commit" ? ancla.repo : null, rama: null, estado: "verificado", ancla,
    fecha: "", registrado: "", origen: "servidor", queSeHizo: "", archivos: [], verificacion: "", esperaAlUsuario: [],
    desvios: "", decisiones: "", condicionales: [], verificacionDelCommit: null,
  };
}

describe("resolverCommit y las consultas de git de los lotes", () => {
  it("resuelve un SHA de 40 y uno de 7, y devuelve siempre el completo", async () => {
    const { repo, segundo } = instalacion();
    assert.deepEqual(await resolverCommit(repo, segundo), { ok: true, sha: segundo });
    assert.deepEqual(await resolverCommit(repo, segundo.slice(0, 7).toUpperCase()), { ok: true, sha: segundo });
  });

  // Antes de llamar a git: con una carpeta que no existe, git fallaría con "no existe o no es una
  // carpeta". Que la respuesta sea "formato" prueba que git no llegó a ejecutarse.
  it("HEAD, --help, una rama, un prefijo de 4 y un hash de 41 se rechazan antes de llamar a git", async () => {
    const noExiste = path.join(carpetaTemporal("nada"), "no-existe");
    for (const malo of ["HEAD", "--help", "main", "a1b2", "a1b2c3", "g1b2c3d", `${"a".repeat(41)}`, "a1b2c3d^{tree}", "a1b2c3d..HEAD", " a1b2c3d", ""]) {
      assert.deepEqual(await resolverCommit(noExiste, malo), { ok: false, motivo: "formato" }, JSON.stringify(malo));
      assert.equal(SHA.test(malo), false, malo);
    }
    await assert.rejects(resolverCommit(noExiste, "a1b2c3d"), /no existe o no es una carpeta/, "control: con un hash válido sí se llama a git");
  });

  it("un hash que no existe, o el de un blob, es no-existe", async () => {
    const { repo } = instalacion();
    assert.deepEqual(await resolverCommit(repo, "0".repeat(40)), { ok: false, motivo: "no-existe" });
    const blob = g(repo, "rev-parse", "HEAD:a.txt");
    assert.deepEqual(await resolverCommit(repo, blob), { ok: false, motivo: "no-existe" });
  });

  // Con --quiet, un hash ambiguo no debe salir como inexistente. Para
  // tener uno de verdad hacen falta miles de commits: fast-import los crea en menos de un segundo, y con
  // fecha y autor fijos los SHA son siempre los mismos, así que la colisión de 7 caracteres también.
  it("un prefijo de 7 que comparten dos commits es ambiguo, y anclarCommit lo dice", async () => {
    const { repo } = instalacion();
    let flujo = "";
    for (let i = 1; i <= 30000; i++) {
      flujo += `commit refs/heads/muchos\nmark :${i}\ncommitter Prueba <p@e.com> 1700000000 +0000\ndata ${String(i).length + 1}\nc${i}\n${i > 1 ? `from :${i - 1}\n` : ""}\n`;
    }
    execFileSync("git", ["fast-import", "--quiet"], { cwd: repo, input: flujo, stdio: ["pipe", "ignore", "pipe"] });
    const vistos = new Map<string, string>();
    let prefijo: string | null = null;
    const todos = execFileSync("git", ["rev-list", "muchos"], { cwd: repo, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    for (const sha of todos.trim().split("\n")) {
      const p = sha.slice(0, 7);
      if (vistos.has(p)) {
        prefijo = p;
        break;
      }
      vistos.set(p, sha);
    }
    assert.ok(prefijo, "con 30 000 commits fijos tiene que haber una colisión de 7");
    assert.deepEqual(await resolverCommit(repo, prefijo), { ok: false, motivo: "ambiguo" });
    await assert.rejects(anclarCommit("P", "api", prefijo, []), new RegExp(`El hash \`${prefijo}\` es ambiguo en \`api\`; usa más caracteres\\.`));
    assert.equal((await resolverCommit(repo, vistos.get(prefijo)!)).ok, true, "con los 40 caracteres, no");
  });

  it("clasificarRevParse: ambiguo, inexistente y no es un repo", () => {
    assert.deepEqual(clasificarRevParse("r", 128, "", "error: short object ID 6de81f4 is ambiguous\nhint: …"), { ok: false, motivo: "ambiguo" });
    assert.deepEqual(clasificarRevParse("r", 128, "", "fatal: Needed a single revision"), { ok: false, motivo: "no-existe" });
    assert.deepEqual(clasificarRevParse("r", 128, "", "error: x^{commit}: expected commit type, but the object dereferences to tree type"), { ok: false, motivo: "no-existe" });
    assert.throws(() => clasificarRevParse("r", 128, "", "fatal: not a git repository (or any of the parent directories): .git"), /no es un repositorio de git/);
  });

  it("merge-base distingue la rama actual de otra, y las ramas que contienen un commit", async () => {
    const { repo, primero, enOtra } = instalacion();
    assert.equal((await esAncestroDeHead(repo, primero)).resultado, "si");
    assert.equal((await esAncestroDeHead(repo, enOtra)).resultado, "no");
    assert.equal((await esAncestroDeHead(repo, "0".repeat(40))).resultado, "error");
    assert.deepEqual(await ramasQueContienen(repo, enOtra), ["otra"]);
    assert.equal(await ramaActual(repo), "main");
    assert.equal(await tieneGit(repo), true);
    assert.equal(await tieneGit(carpetaTemporal("sin-git")), false);
  });

  it("datos y archivos de un commit, también del primero del repo (--root) y con acentos", async () => {
    const { repo, primero, segundo } = instalacion();
    const datos = await datosDeCommit(repo, segundo);
    assert.deepEqual([datos.sha, datos.corto, datos.asunto], [segundo, segundo.slice(0, 7), "fix(b): segundo commit"]);
    assert.match(datos.fecha, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(await archivosDeCommit(repo, primero), ["a.txt"]);
    assert.deepEqual((await archivosDeCommit(repo, segundo)).sort(), ["src/b.ts", "src/c.ts"]);
    const conAcento = commit(repo, { "docs/configuración año.md": "x\n" }, "acentos");
    assert.deepEqual(await archivosDeCommit(repo, conAcento), ["docs/configuración año.md"]);
    g(repo, "checkout", "-q", "--detach");
    assert.equal(await ramaActual(repo), null);
  });

  // Cada consulta nueva pasa por la puerta única. Control positivo
  // primero: la trampa se dispara con un git status normal.
  it("ninguna consulta de los lotes ejecuta un core.fsmonitor trampa (control positivo incluido)", async () => {
    const { repo, segundo, enOtra } = instalacion();
    const raiz = carpetaTemporal("trampa");
    const marca = path.join(raiz, "MARCA").replace(/\\/g, "/");
    const trampa = path.join(raiz, "trampa.js").replace(/\\/g, "/");
    fs.writeFileSync(trampa, `require("fs").writeFileSync(${JSON.stringify(marca)}, "x");\n`, "utf-8");
    g(repo, "config", "core.fsmonitor", `node "${trampa}"`);

    try {
      execFileSync("git", ["status", "--porcelain=v2"], { cwd: repo, stdio: "ignore" });
    } catch {
      // lo que importa es si corrió
    }
    assert.equal(fs.existsSync(marca), true, "control: la trampa debía dispararse con un git status normal");
    fs.rmSync(marca);

    await resolverCommit(repo, segundo);
    await esAncestroDeHead(repo, segundo);
    await ramasQueContienen(repo, enOtra);
    await datosDeCommit(repo, segundo);
    await archivosDeCommit(repo, segundo);
    await ramaActual(repo);
    await tieneGit(repo);
    assert.equal(fs.existsSync(marca), false, "una consulta de los lotes ejecutó core.fsmonitor");
  });

  // `git show` verifica la firma de un commit firmado si log.showSignature está activo, y para eso
  // ejecuta gpg.program, que también puede venir en .git/config. Control positivo con un commit con una
  // firma falsa: git show normal la dispara; datosDeCommit, no.
  it("datosDeCommit no ejecuta gpg.program aunque log.showSignature esté activo (control positivo incluido)", async () => {
    const { repo } = instalacion();
    const crudo = g(repo, "cat-file", "commit", "HEAD");
    const firma = "gpgsig -----BEGIN PGP SIGNATURE-----\n \n iQEzBAABCAAdFiEE\n -----END PGP SIGNATURE-----\n";
    const firmado = execFileSync("git", ["hash-object", "-t", "commit", "-w", "--stdin"], {
      cwd: repo,
      input: `${crudo.replace(/(committer [^\n]*\n)/, `$1${firma}`)}\n`,
      encoding: "utf8",
    }).trim();

    const raiz = carpetaTemporal("trampa");
    const marca = path.join(raiz, "MARCA");
    const programa = path.join(raiz, process.platform === "win32" ? "trampa.cmd" : "trampa.sh");
    fs.writeFileSync(programa, process.platform === "win32" ? `@echo x> "${marca}"\r\n@exit /b 1\r\n` : `#!/bin/sh\necho x > "${marca}"\nexit 1\n`, { mode: 0o755 });
    g(repo, "config", "gpg.program", programa.replace(/\\/g, "/"));
    g(repo, "config", "log.showSignature", "true");

    execFileSync("git", ["show", "-s", "--format=%H", firmado], { cwd: repo, stdio: "ignore" });
    assert.equal(fs.existsSync(marca), true, "control: git show normal debía ejecutar gpg.program");
    fs.rmSync(marca);

    assert.equal((await datosDeCommit(repo, firmado)).sha, firmado);
    assert.equal(fs.existsSync(marca), false, "datosDeCommit ejecutó gpg.program");
  });
});

describe("anclarCommit", () => {
  it("ancla un commit de la rama actual y compara sus archivos con los declarados", async () => {
    const { repo, segundo } = instalacion();
    const ahora = () => new Date("2026-11-03T18:22:41.000Z");
    const r = await anclarCommit("P", "api", segundo.slice(0, 7), ["`src/b.ts`", "./src\\c.ts"], [], ahora);
    assert.deepEqual(r.ancla, { tipo: "commit", repo: "api", sha: segundo, corto: segundo.slice(0, 7), asunto: "fix(b): segundo commit", rama: "main", verificado: "2026-11-03T18:22:41.000Z" });
    assert.equal(r.verificacionDelCommit, "El commit toca exactamente los 2 archivos declarados.");
    assert.equal(r.coinciden, true);
    // Una ruta absoluta dentro del repo también vale.
    assert.equal((await anclarCommit("P", "api", segundo, [path.join(repo, "src", "b.ts"), "src/c.ts"])).coinciden, true);
  });

  it("el primer commit del repo también se ancla (--root)", async () => {
    const { primero } = instalacion();
    const r = await anclarCommit("P", "api", primero, ["a.txt"]);
    assert.equal(r.verificacionDelCommit, "El commit toca exactamente el archivo declarado.");
  });

  it("archivos de más y de menos quedan escritos, sin bloquear", async () => {
    const { segundo } = instalacion();
    const r = await anclarCommit("P", "api", segundo, ["src/b.ts", "src/z.ts"]);
    assert.equal(r.coinciden, false);
    assert.equal(r.verificacionDelCommit, "En el commit y no en el recibo: `src/c.ts`.\nEn el recibo y no en el commit: `src/z.ts`.");
  });

  it("rechaza el formato, un commit que no existe y uno de otra rama, con las ramas en el mensaje", async () => {
    const { repo, enOtra } = instalacion();
    await assert.rejects(anclarCommit("P", "api", "HEAD", []), /hash de 7 a 40 caracteres hexadecimales/);
    await assert.rejects(anclarCommit("P", "api", "deadbee", []), (e: Error) => e.message.includes("El commit `deadbee` no existe en el repo `api`") && e.message.includes(repo));
    await assert.rejects(anclarCommit("P", "api", enOtra, []), new RegExp(`El commit \`${enOtra.slice(0, 7)}\` existe pero no está en la rama actual \\(\`main\`\\); está en: \`otra\``));
  });

  it("un commit, un lote: el mismo SHA en otro recibo de la tarea es un error, también si ese guarda el corto", async () => {
    const { segundo } = instalacion();
    await assert.rejects(anclarCommit("P", "api", segundo, [], [{ lote: 1, sha: segundo }]), /ya es el ancla de L01\. Cada lote es un commit\./);
    await assert.rejects(anclarCommit("P", "api", segundo, [], [{ lote: 3, sha: segundo.slice(0, 7).toUpperCase() }]), /ya es el ancla de L03/);
  });

  it("compararArchivos sin archivos", () => {
    assert.equal(compararArchivos([], [], "C:/r").texto, "El commit no toca ningún archivo y el recibo no declara ninguno.");
  });
});

describe("anclarArtefacto y sha256", () => {
  it("el sha256 en streaming es el de los bytes, igual que sha256sum", async () => {
    const carpeta = carpetaTemporal("sha");
    const ruta = path.join(carpeta, "x.bin");
    const contenido = crypto.randomBytes(3 * 65536 + 17); // varios trozos del stream
    fs.writeFileSync(ruta, contenido);
    const esperado = crypto.createHash("sha256").update(contenido).digest("hex");
    assert.deepEqual(await sha256DeArchivo(ruta), { sha256: esperado, bytes: contenido.length });

    let deSha256sum: string | null = null;
    try {
      deSha256sum = execFileSync("sha256sum", [ruta.replace(/\\/g, "/")], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split(" ")[0]!.replace(/^\\/, "");
    } catch {
      // sha256sum no está en el PATH de este equipo: basta la comparación con crypto
    }
    if (deSha256sum) assert.equal(deSha256sum, esperado);
  });

  it("guarda la ruta como repo:<id>/… o proyecto:…, siempre con /", async () => {
    const { docs, repo } = instalacion();
    fs.mkdirSync(path.join(repo, "docs"));
    fs.writeFileSync(path.join(repo, "docs", "guía.md"), "hola\n", "utf-8");
    fs.mkdirSync(path.join(docs, "P", "ASISTENTE"));
    fs.writeFileSync(path.join(docs, "P", "ASISTENTE", "prompt-sistema.md"), "prompt\n", "utf-8");

    const enRepo = await anclarArtefacto("P", "api", "docs\\guía.md", () => new Date("2026-01-01T00:00:00.000Z"));
    assert.deepEqual(enRepo, { tipo: "sha256", ruta: "repo:api/docs/guía.md", sha256: crypto.createHash("sha256").update("hola\n").digest("hex"), bytes: 5, verificado: "2026-01-01T00:00:00.000Z" });
    assert.equal((await anclarArtefacto("P", null, "ASISTENTE/prompt-sistema.md")).ruta, "proyecto:ASISTENTE/prompt-sistema.md");
  });

  it("contención: ni absoluta, ni UNC, ni .., ni un flujo alterno, ni reservados, ni carpetas", async () => {
    const { repo } = instalacion();
    fs.writeFileSync(path.join(repo, "a.txt"), "uno\n", "utf-8");
    const casos: [string, RegExp][] = [
      [path.join(repo, "a.txt"), /no puede ser una ruta absoluta/],
      ["/etc/passwd", /no puede ser una ruta absoluta/],
      ["\\\\servidor\\recurso\\a.txt", /no puede ser una ruta absoluta/],
      ["../fuera.txt", /no es válido/],
      ["src/../../fuera.txt", /no es válido/],
      ["a.txt::$DATA", /no es válido/],
      ["a.txt:secreto", /no es válido/],
      ["NUL", /no es válido/],
      ["src", /solo se sellan archivos/],
      ["no-existe.txt", /no existe/],
    ];
    for (const [ruta, error] of casos) await assert.rejects(anclarArtefacto("P", "api", ruta), error, ruta);
  });

  it("nada de .git, ni en otras mayúsculas, ni a través de un enlace", async () => {
    const { repo } = instalacion();
    for (const malo of [".git/config", ".GIT/config", ".git/HEAD", ".gitignore", "sub/.git/x"]) {
      await assert.rejects(anclarArtefacto("P", "api", malo), /no puede entrar en \.git/, malo);
    }
    crearSymlink(path.join(repo, ".git"), path.join(repo, "enlace"));
    await assert.rejects(anclarArtefacto("P", "api", "enlace/config"), /lleva a \.git a través de un enlace/);
  });

  it("ni con el nombre corto 8.3 de .git (GIT~1), si el volumen los genera", async (t) => {
    const { repo } = instalacion();
    if (!fs.existsSync(path.join(repo, "GIT~1", "config"))) {
      t.skip("este volumen no genera nombres cortos 8.3");
      return;
    }
    await assert.rejects(anclarArtefacto("P", "api", "GIT~1/config"), /lleva a \.git a través de un enlace/);
  });

  it("ni fuera de la base a través de una junction", async () => {
    const { repo } = instalacion();
    const fuera = carpetaTemporal("fuera");
    fs.writeFileSync(path.join(fuera, "secreto.txt"), "x", "utf-8");
    crearSymlink(fuera, path.join(repo, "salida"));
    await assert.rejects(anclarArtefacto("P", "api", "salida/secreto.txt"), /queda fuera de su carpeta/);
  });

  it("rechaza un artefacto de 256 MB + 1 sin leerlo, y acepta uno de 256 MB justos", async () => {
    const { repo } = instalacion();
    const grande = path.join(repo, "grande.bin");
    fs.closeSync(fs.openSync(grande, "w"));
    fs.truncateSync(grande, TOPE_DE_ARTEFACTO + 1);
    const inicio = Date.now();
    await assert.rejects(anclarArtefacto("P", "api", "grande.bin"), /pesa 256\.0 MB \(268435457 bytes\); el máximo para sellarlo es 256 MB/);
    assert.ok(Date.now() - inicio < 2000, "se rechaza por el tamaño, sin leer el archivo");
    fs.truncateSync(grande, TOPE_DE_ARTEFACTO);
    assert.equal((await anclarArtefacto("P", "api", "grande.bin")).bytes, TOPE_DE_ARTEFACTO);
    fs.rmSync(grande);
  });
});

describe("reverificar", () => {
  it("un commit sigue vigente en la rama; tras un --amend, el original ya no", async () => {
    const { repo, segundo } = instalacion();
    const { ancla } = await anclarCommit("P", "api", segundo, ["src/b.ts", "src/c.ts"]);
    assert.equal((await reverificar("P", reciboCon(ancla))).vigente, true);

    g(repo, "commit", "-q", "--amend", "-m", "fix(b): segundo commit, reescrito");
    const despues = await reverificar("P", reciboCon(ancla));
    assert.equal(despues.vigente, false);
    assert.match(despues.texto, /ya no está en la rama actual \(`main`\)\. ¿Rebase o squash\? Vuelve a anclar el lote\./);
  });

  it("un artefacto que cambió solo en los finales de línea se reconoce, en las dos direcciones", async () => {
    const { repo } = instalacion();
    const ruta = path.join(repo, "prompt.md");
    for (const [sellado, despues] of [["uno\ndos\n", "uno\r\ndos\r\n"], ["uno\r\ndos\r\n", "uno\ndos\n"]] as const) {
      fs.writeFileSync(ruta, sellado, "utf-8");
      const ancla = await anclarArtefacto("P", "api", "prompt.md");
      assert.deepEqual(await reverificar("P", reciboCon(ancla)), { vigente: true, texto: "El artefacto `repo:api/prompt.md` no cambió." });

      fs.writeFileSync(ruta, despues, "utf-8");
      assert.deepEqual(await reverificar("P", reciboCon(ancla)), { vigente: true, texto: "El artefacto `repo:api/prompt.md` es idéntico salvo finales de línea." });

      fs.writeFileSync(ruta, "uno\ntres\n", "utf-8");
      const cambio = await reverificar("P", reciboCon(ancla));
      assert.equal(cambio.vigente, false);
      assert.match(cambio.texto, /cambió desde que se selló/);
    }
  });

  // En un binario, quitar un 0x0D es un cambio de verdad.
  it("en un binario, un cambio de finales de línea no cuenta como vigente", async () => {
    const { repo } = instalacion();
    const ruta = path.join(repo, "bin.dat");
    fs.writeFileSync(ruta, Buffer.from([0x00, 0x01, 0x0d, 0x0a, 0x02, 0x03]));
    const ancla = await anclarArtefacto("P", "api", "bin.dat");
    fs.writeFileSync(ruta, Buffer.from([0x00, 0x01, 0x0a, 0x02, 0x03]));
    const r = await reverificar("P", reciboCon(ancla));
    assert.equal(r.vigente, false);
    assert.match(r.texto, /cambió desde que se selló/);
  });

  it("la conversión de finales de línea es exacta aunque un \\r\\n caiga entre dos trozos del stream", async () => {
    const carpeta = carpetaTemporal("trozos");
    const ruta = path.join(carpeta, "x.txt");
    // El stream lee de 64 KiB en 64 KiB: el \r queda al final de un trozo y el \n al principio del siguiente.
    const texto = `${"a".repeat(65535)}\r\n${"b\r\nc\n".repeat(30000)}\r`;
    fs.writeFileSync(ruta, texto, "latin1");
    const hash = (s: string) => crypto.createHash("sha256").update(Buffer.from(s, "latin1")).digest("hex");
    assert.equal((await sha256DeArchivo(ruta, "crlf-a-lf")).sha256, hash(texto.replace(/\r\n/g, "\n")));
    assert.equal((await sha256DeArchivo(ruta, "lf-a-crlf")).sha256, hash(texto.replace(/\r?\n/g, "\r\n")));
  });

  it("un artefacto que ya no existe, o un commit sin repo, no están vigentes; una nota no tiene nada que comprobar", async () => {
    const { repo } = instalacion();
    fs.writeFileSync(path.join(repo, "x.md"), "x", "utf-8");
    const ancla = await anclarArtefacto("P", "api", "x.md");
    fs.rmSync(path.join(repo, "x.md"));
    assert.match((await reverificar("P", reciboCon(ancla))).texto, /no existe/);
    assert.deepEqual(await reverificar("P", reciboCon({ tipo: "nota", texto: "x" })), { vigente: true, texto: "Sin nada que comprobar." });
  });
});
