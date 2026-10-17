// La puerta única a git y las tools multi-repo (§5.7 del plan maestro v3), con repos reales en
// carpetas temporales: sin commits, con upstream, separado, sucio, y uno con una trampa en
// core.fsmonitor.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { fijarRaizDelPaquete } from "../src/config.js";
import { anularFiltros, traducirError } from "../src/git.js";
import { columnaDeConfiguracion, estadoDeRepo, estadoDeRepoSincrono, lineaDeEstado, parsearStatus, rutaDeArchivoDeRepo } from "../src/repos.js";
import type { RepoResuelto } from "../src/manifiesto.js";
import { repoStatusSalidaShape } from "../src/schemas.js";
import { conectar, textoDe } from "./cliente.js";
import { carpetaTemporal, configTemporal, crearProyecto, crearSymlink, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// git con identidad y rama fijas, sin firma: no depende de la configuración de quien corre los tests.
function g(dir: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Prueba", "-c", "user.email=prueba@ejemplo.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args],
    { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function repoNuevo(conCommit = true): string {
  const repo = carpetaTemporal("repo");
  g(repo, "init", "-q");
  if (conCommit) {
    fs.writeFileSync(path.join(repo, "a.txt"), "uno\n", "utf-8");
    g(repo, "add", "a.txt");
    g(repo, "commit", "-q", "-m", "primero");
  }
  return repo;
}

function resuelto(ruta: string, id = "api"): RepoResuelto {
  return { id, dir: id, rol: null, ruta, origenRuta: "machine.json", existe: fs.existsSync(ruta), error: null };
}

describe("parsearStatus", () => {
  it("lee rama, commit, adelante/atrás y cuenta cambios y sin seguimiento", () => {
    const salida = [
      "# branch.oid 0123456789abcdef0123456789abcdef01234567",
      "# branch.head feat/x",
      "# branch.upstream origin/feat/x",
      "# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 aaa bbb a.txt",
      "2 R. N... 100644 100644 100644 aaa bbb R100 b.txt\tviejo.txt",
      "u UU N... 100644 100644 100644 100644 aaa bbb ccc c.txt",
      "? nuevo.txt",
      "! ignorado.log",
    ].join("\n");

    assert.deepEqual(parsearStatus(salida), {
      rama: "feat/x",
      separado: false,
      head: "0123456",
      adelante: 2,
      atras: 1,
      limpio: false,
      cambios: 3,
      sinSeguimiento: 1,
    });
  });

  it("sin commits, separado y sin upstream", () => {
    assert.deepEqual(parsearStatus("# branch.oid (initial)\n# branch.head main\n"), {
      rama: "main",
      separado: false,
      head: null,
      adelante: null,
      atras: null,
      limpio: true,
      cambios: 0,
      sinSeguimiento: 0,
    });
    const separado = parsearStatus("# branch.oid abcdef1234567\r\n# branch.head (detached)\r\n");
    assert.deepEqual([separado.rama, separado.separado, separado.head], [null, true, "abcdef1"]);
  });
});

describe("estadoDeRepo con repos reales", () => {
  it("un repo sin commits, uno limpio y uno sucio", async () => {
    const vacio = await estadoDeRepo(resuelto(repoNuevo(false)));
    assert.deepEqual([vacio.esGit, vacio.rama, vacio.head, vacio.limpio], [true, "main", null, true]);

    const repo = repoNuevo();
    const limpio = await estadoDeRepo(resuelto(repo));
    assert.deepEqual([limpio.rama, limpio.head?.length, limpio.limpio, limpio.adelante], ["main", 7, true, null]);
    assert.match(lineaDeEstado(limpio), /^`api`: rama main · [0-9a-f]{7} · árbol limpio$/);

    fs.writeFileSync(path.join(repo, "a.txt"), "cambiado\n", "utf-8");
    fs.writeFileSync(path.join(repo, "nuevo.txt"), "x", "utf-8");
    const sucio = await estadoDeRepo(resuelto(repo));
    assert.deepEqual([sucio.limpio, sucio.cambios, sucio.sinSeguimiento], [false, 1, 1]);
    assert.match(lineaDeEstado(sucio), /· 1 cambio sin commit · 1 sin seguimiento$/);
    assert.equal(columnaDeConfiguracion(sucio), " · git · rama `main` · 2 cambios sin commit");
  });

  it("con upstream cuenta los commits de adelante, y separado lo dice", async () => {
    const remoto = carpetaTemporal("remoto");
    g(remoto, "init", "-q", "--bare");
    const repo = repoNuevo();
    g(repo, "remote", "add", "origin", remoto);
    g(repo, "push", "-q", "-u", "origin", "main");
    for (const n of [2, 3]) {
      fs.writeFileSync(path.join(repo, `${n}.txt`), String(n), "utf-8");
      g(repo, "add", `${n}.txt`);
      g(repo, "commit", "-q", "-m", `commit ${n}`);
    }

    const adelante = await estadoDeRepo(resuelto(repo));
    assert.deepEqual([adelante.adelante, adelante.atras], [2, 0]);
    assert.match(lineaDeEstado(adelante), /· 2 adelante · árbol limpio$/);

    g(repo, "checkout", "-q", "--detach");
    const separado = await estadoDeRepo(resuelto(repo));
    assert.deepEqual([separado.rama, separado.separado], [null, true]);
    assert.match(lineaDeEstado(separado), /^`api`: separado \(detached\) · [0-9a-f]{7}/);
    assert.match(columnaDeConfiguracion(separado) ?? "", /^ · git · separado en `[0-9a-f]{7}` · árbol limpio$/);
  });

  it("una carpeta sin git y una ruta que no existe", async () => {
    const sinGit = await estadoDeRepo(resuelto(carpetaTemporal("sin-git")));
    assert.deepEqual([sinGit.existe, sinGit.esGit, sinGit.error], [true, false, null]);
    assert.equal(columnaDeConfiguracion(sinGit), " · sin git");

    const noExiste = await estadoDeRepo(resuelto(path.join(carpetaTemporal("x"), "no-existe")));
    assert.deepEqual([noExiste.existe, noExiste.esGit], [false, false]);
    assert.match(lineaDeEstado(noExiste), /no existe en este equipo/);
    assert.equal(columnaDeConfiguracion(noExiste), null);
  });

  // E3-R4: git status ejecuta core.fsmonitor. El control positivo prueba que la trampa funciona en
  // este equipo; la puerta única no debe dispararla.
  it("un core.fsmonitor trampa se dispara con un git status normal y NO con la puerta única", async () => {
    const repo = repoNuevo();
    const raiz = carpetaTemporal("trampa");
    const marca = path.join(raiz, "MARCA").replace(/\\/g, "/");
    const trampa = path.join(raiz, "trampa.js").replace(/\\/g, "/");
    fs.writeFileSync(trampa, `require("fs").writeFileSync(${JSON.stringify(marca)}, "x");\n`, "utf-8");
    g(repo, "config", "core.fsmonitor", `node "${trampa}"`);

    try {
      execFileSync("git", ["status", "--porcelain=v2"], { cwd: repo, stdio: "ignore" });
    } catch {
      // Un hook que no devuelve lo que git espera puede hacer fallar el status; lo que importa es si corrió.
    }
    assert.equal(fs.existsSync(marca), true, "control: la trampa debía dispararse con un git status normal");
    fs.rmSync(marca);

    const estado = await estadoDeRepo(resuelto(repo));
    assert.equal(estado.esGit, true);
    assert.equal(fs.existsSync(marca), false, "la puerta única ejecutó core.fsmonitor");
  });
});

describe("filtros de .gitattributes (hallazgo 1 de la auditoría de la Etapa 3)", () => {
  // Un filtro clean o process de .git/config es un comando que git status ejecuta con un archivo
  // que cambió de fecha. Mismo esquema que el de fsmonitor: control positivo y después la puerta.
  for (const variable of ["clean", "process"]) {
    it(`un filtro ${variable} trampa se dispara con un git status normal y NO con la puerta única (asíncrona ni síncrona)`, async () => {
      const repo = carpetaTemporal("repo");
      g(repo, "init", "-q");
      fs.writeFileSync(path.join(repo, ".gitattributes"), "*.txt filter=trampa\n", "utf-8");
      fs.writeFileSync(path.join(repo, "a.txt"), "uno\n", "utf-8");
      g(repo, "add", ".");
      g(repo, "commit", "-q", "-m", "uno");
      const raiz = carpetaTemporal("trampa");
      const marca = path.join(raiz, "MARCA").replace(/\\/g, "/");
      const trampa = path.join(raiz, "trampa.js").replace(/\\/g, "/");
      fs.writeFileSync(trampa, `require("fs").appendFileSync(${JSON.stringify(marca)}, "x"); process.stdin.pipe(process.stdout);\n`, "utf-8");
      g(repo, "config", `filter.trampa.${variable}`, `node "${trampa}"`);
      let segundos = 0;
      const tocar = (): void => {
        const fecha = new Date(Date.now() + ++segundos * 61_000);
        fs.utimesSync(path.join(repo, "a.txt"), fecha, fecha);
      };

      tocar();
      try {
        execFileSync("git", ["status", "--porcelain=v2"], { cwd: repo, stdio: "ignore", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
      } catch {
        // process puede romper el status: lo que importa es si el filtro corrió.
      }
      assert.equal(fs.existsSync(marca), true, "control: el filtro debía dispararse con un git status normal");
      fs.rmSync(marca);

      tocar();
      const estado = await estadoDeRepo(resuelto(repo));
      tocar();
      const sincrono = estadoDeRepoSincrono(resuelto(repo));
      assert.equal(fs.existsSync(marca), false, "la puerta única ejecutó el filtro");
      assert.deepEqual([estado.esGit, estado.error, sincrono.esGit, sincrono.error], [true, null, true, null]);
    });
  }

  it("anularFiltros anula cada driver definido y falla cerrado con un nombre que no se puede escribir", () => {
    assert.deepEqual(anularFiltros("filter.lfs.clean git-lfs clean -- %f\nfilter.lfs.required true\nfilter.Mi.Filtro.process x\n", "r"), [
      "-c", "filter.lfs.clean=", "-c", "filter.lfs.smudge=", "-c", "filter.lfs.process=", "-c", "filter.lfs.required=false",
      "-c", "filter.Mi.Filtro.clean=", "-c", "filter.Mi.Filtro.smudge=", "-c", "filter.Mi.Filtro.process=", "-c", "filter.Mi.Filtro.required=false",
    ]);
    assert.deepEqual(anularFiltros("", "r"), []);
    assert.throws(() => anularFiltros("filter.a=b.clean x\n", "r"), /no se puede desactivar/);
  });
});

describe("traducirError", () => {
  it("dubious ownership explica safe.directory; ENOENT, que git no está instalado", () => {
    const dudoso = traducirError({ code: 128, message: "x" }, "fatal: detected dubious ownership in repository at 'C:/r'", "C:\\r");
    assert.equal(dudoso.motivo, "propiedad-dudosa");
    assert.match(dudoso.message, /git config --global --add safe\.directory "C:\/r"/);

    assert.equal(traducirError({ code: "ENOENT", message: "spawn git ENOENT" }, "", "x").motivo, "no-instalado");
    assert.equal(traducirError({ code: 128, message: "x" }, "fatal: not a git repository (or any of the parent directories): .git", "x").motivo, "no-es-repo");
  });
});

describe("rutaDeArchivoDeRepo", () => {
  it("nada de .git, ni en otras mayúsculas, ni sus archivos; .github sí", () => {
    const repo = repoNuevo();
    fs.mkdirSync(path.join(repo, ".github", "workflows"), { recursive: true });

    for (const malo of [".git/config", ".GIT/config", ".git", ".gitignore", ".gitmodules", "sub/.git/HEAD"]) {
      assert.throws(() => rutaDeArchivoDeRepo(repo, malo), /no puede entrar en \.git/, malo);
    }
    assert.equal(rutaDeArchivoDeRepo(repo, ".github/workflows/ci.yml"), path.join(repo, ".github", "workflows", "ci.yml"));
  });

  it("ni a través de un enlace interno que apunte a .git", () => {
    const repo = repoNuevo();
    crearSymlink(path.join(repo, ".git"), path.join(repo, "enlace"));

    assert.throws(() => rutaDeArchivoDeRepo(repo, "enlace/config"), /lleva a \.git a través de un enlace/);
  });

  it("ni fuera del repo, ni con una ruta absoluta", () => {
    const repo = repoNuevo();

    assert.throws(() => rutaDeArchivoDeRepo(repo, "../fuera.txt"), /no es válido/);
    assert.throws(() => rutaDeArchivoDeRepo(repo, path.join(repo, "a.txt")), /no puede ser una ruta absoluta/);
    assert.throws(() => rutaDeArchivoDeRepo(repo, "/etc/passwd"), /no puede ser una ruta absoluta/);
  });
});

describe("read_repo_file y repo_status", () => {
  function instalacion(manifiesto: unknown = { version: 1, repos: [{ id: "api", dir: "backend-api", rol: "backend" }] }) {
    fijarRaizDelPaquete(RAIZ);
    const docs = docsTemporales();
    const repos = carpetaTemporal("repos");
    process.env.PHASE_GATE_REPOS_PATH = repos;
    estadoTemporal();
    crearProyecto(docs, "PROYECTO-A");
    crearTarea(docs, "PROYECTO-A", "tarea", ["00 - Contexto Inicial.md"]);
    if (manifiesto) fs.writeFileSync(path.join(docs, "PROYECTO-A", "phase-gate.json"), JSON.stringify(manifiesto), "utf-8");
    return { docs, repos };
  }

  it("read_repo_file lee por id, también un repo que machine.json pone fuera de PHASE_GATE_REPOS_PATH", async () => {
    const { repos } = instalacion({ version: 1, repos: [{ id: "api", dir: "backend-api" }, { id: "web", dir: "no-importa" }] });
    fs.mkdirSync(path.join(repos, "backend-api", "src"), { recursive: true });
    fs.writeFileSync(path.join(repos, "backend-api", "src", "main.ts"), "export const api = 1;", "utf-8");
    const web = repoNuevo();
    fs.writeFileSync(path.join(configTemporal(), "machine.json"), JSON.stringify({ version: 1, repos: { "proyecto-a/web": web } }), "utf-8");

    const { cliente, cerrar } = await conectar();
    try {
      const api = await cliente.callTool({ name: "read_repo_file", arguments: { project: "PROYECTO-A", repo: "api", path: "src/main.ts" } });
      assert.equal(textoDe(api), "export const api = 1;");

      const enOtroSitio = await cliente.callTool({ name: "read_repo_file", arguments: { project: "PROYECTO-A", repo: "web", path: "a.txt" } });
      assert.equal(textoDe(enOtroSitio), "uno\n");

      const gitConfig = await cliente.callTool({ name: "read_repo_file", arguments: { project: "PROYECTO-A", repo: "web", path: ".git/config" } });
      assert.equal(gitConfig.isError, true);

      const desconocido = await cliente.callTool({ name: "read_repo_file", arguments: { project: "PROYECTO-A", repo: "movil", path: "x" } });
      assert.match(textoDe(desconocido), /No existe el repo "movil" en el phase-gate\.json de PROYECTO-A\. Los repos son: api, web\./);

      const mayusculas = await cliente.callTool({ name: "read_repo_file", arguments: { project: "PROYECTO-A", repo: "API", path: "x" } });
      assert.match(textoDe(mayusculas), /`repo` es el id de un repo/);
    } finally {
      await cerrar();
    }
  });

  it("sin repos en el manifiesto, remite a read_cross_repo", async () => {
    instalacion(null);
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "read_repo_file", arguments: { project: "PROYECTO-A", repo: "api", path: "x" } });
      assert.match(textoDe(r), /no declara repos en su phase-gate\.json\. Para leer cualquier carpeta de PHASE_GATE_REPOS_PATH, usa read_cross_repo\./);
    } finally {
      await cerrar();
    }
  });

  it("repo_status de los repos de la tarea, con structuredContent que valida contra su outputSchema", async () => {
    const { repos } = instalacion({ version: 1, repos: [{ id: "api", dir: "backend-api" }, { id: "docs", dir: "docs" }] });
    const api = repoNuevo();
    fs.renameSync(api, path.join(repos, "backend-api"));
    fs.mkdirSync(path.join(repos, "docs"));

    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "repo_status", arguments: { project: "PROYECTO-A" } });
      const texto = textoDe(r);
      assert.match(texto, /^Repos de la tarea «tarea» de PROYECTO-A:\n- `api`: rama main · [0-9a-f]{7} · árbol limpio\n- `docs`: `.*docs` no es un repositorio de git$/);

      const salida = z.object(repoStatusSalidaShape).parse(r.structuredContent);
      assert.deepEqual(salida.repos.map((repo) => [repo.id, repo.esGit]), [["api", true], ["docs", false]]);

      const uno = await cliente.callTool({ name: "repo_status", arguments: { project: "PROYECTO-A", repo: "api" } });
      assert.match(textoDe(uno), /^Repo `api` de PROYECTO-A:\n- `api`: rama main/);
    } finally {
      await cerrar();
    }
  });

  it("el bloque CONFIGURACIÓN DEL PROYECTO lleva el estado de git de cada repo", async () => {
    const { repos } = instalacion();
    fs.renameSync(repoNuevo(), path.join(repos, "backend-api"));

    const { cliente, cerrar } = await conectar();
    try {
      const texto = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 1, project: "PROYECTO-A" } }));
      assert.ok(texto.includes(`  - \`api\` (backend): \`${path.join(repos, "backend-api")}\` · git · rama \`main\` · árbol limpio`));
      assert.ok(texto.trimEnd().endsWith("Usa `read_repo_file` y `repo_status` con estos ids."));
    } finally {
      await cerrar();
    }
  });
});
