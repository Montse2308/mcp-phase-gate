// record_batch: cada fila de sus tablas, los dos tiempos, las tres anclas y
// la carrera entre dos ventanas, con tareas y repos de git reales en carpetas temporales.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { fasesDe } from "../src/capas.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import type { ResultadoConfirmacion } from "../src/confirmacion.js";
import { bloqueDeCommits, bloqueDeCommitsConPlazo, ensamblarIndice, estadoDeLotes, leerTablaDeLotes, registrarLote, renombrarConReintentos, traducirEscritura } from "../src/lotes.js";
import type { EntradaDeLote } from "../src/lotes.js";
import { escribirRecibo, leerRecibo, nombreDeRecibo, parsearRecibo } from "../src/recibos.js";
import type { Recibo } from "../src/recibos.js";
import { conectar, textoDe } from "./cliente.js";
import { carpetaTemporal, crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

function g(dir: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Prueba", "-c", "user.email=prueba@ejemplo.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args],
    { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

const PREVIOS = ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md", "02 - Decisiones.md"];
const RECIBOS = "04 - Ejecución";

type Opciones = {
  lotes?: string | null; // el valor de `lotes:` en el plan; null, sin la clave
  repos?: { id: string; dir: string }[];
  sinGit?: string[]; // ids de los repos que no son git
  commits?: string;
  conManifiesto?: boolean;
};

function instalacion(opciones: Opciones = {}) {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  estadoTemporal();
  crearProyecto(docs, "P");
  const raizRepos = carpetaTemporal("repos");
  process.env.PHASE_GATE_REPOS_PATH = raizRepos;

  const repos = opciones.repos ?? [{ id: "api", dir: "api" }];
  if (opciones.conManifiesto !== false) {
    const manifiesto = { version: 1, repos, ...(opciones.commits ? { reglas: { commits: opciones.commits } } : {}) };
    fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify(manifiesto), "utf-8");
  }
  const dirs: Record<string, string> = {};
  for (const repo of repos) {
    const dir = path.join(raizRepos, repo.dir);
    fs.mkdirSync(dir, { recursive: true });
    dirs[repo.id] = dir;
    if (!(opciones.sinGit ?? []).includes(repo.id)) {
      g(dir, "init", "-q");
      fs.writeFileSync(path.join(dir, "inicio.txt"), "inicio\n", "utf-8");
      g(dir, "add", "inicio.txt");
      g(dir, "commit", "-q", "-m", "inicio");
    }
  }

  const tarea = crearTarea(docs, "P", "t", PREVIOS);
  const lotes = opciones.lotes === undefined ? "3" : opciones.lotes;
  fs.writeFileSync(path.join(tarea, "03 - Plan Técnico.md"), `${lotes === null ? "" : `---\nlotes: ${lotes}\n---\n\n`}# Plan\n`, "utf-8");
  return { docs, tarea, dirs, recibos: path.join(tarea, RECIBOS) };
}

// Un commit nuevo en el repo, con estos archivos.
function commitEn(dir: string, archivos: string[], mensaje = "feat(x): lote"): string {
  for (const archivo of archivos) {
    fs.mkdirSync(path.dirname(path.join(dir, archivo)), { recursive: true });
    fs.writeFileSync(path.join(dir, archivo), `${archivo} ${Math.random()}\n`, "utf-8");
    g(dir, "add", archivo);
  }
  g(dir, "commit", "-q", "-m", mensaje);
  return g(dir, "rev-parse", "HEAD");
}

const AHORA = () => new Date(2026, 10, 3, 18, 22, 41);

function contenido(lote: number, extra: Partial<EntradaDeLote> = {}): EntradaDeLote {
  return {
    lote,
    titulo: `lote ${lote}`,
    estado: "verificado",
    que_se_hizo: `Se hizo el lote ${lote}.`,
    archivos: [{ archivo: `src/l${lote}.ts`, cambio: "nuevo" }],
    verificacion: "npm test: 10 pasan.",
    ...extra,
  };
}

const registrar = (entrada: EntradaDeLote) => registrarLote("P", "t", entrada, { ahora: AHORA });
const recibosEn = (carpeta: string) => (fs.existsSync(carpeta) ? fs.readdirSync(carpeta).sort() : []);

describe("record_batch: número de lotes y orden", () => {
  it("un plan sin `lotes` es un error", async () => {
    instalacion({ lotes: null });
    await assert.rejects(registrar(contenido(1)), /El plan no declara `lotes: N` en su frontmatter\. Añádelo a `03 - Plan Técnico\.md` antes del primer recibo\./);
  });

  it("`lotes` fuera de 1…99, o no entero, es un error con el valor", async () => {
    for (const valor of ["0", "100", "2.5", "tres", "-1"]) {
      instalacion({ lotes: valor });
      await assert.rejects(registrar(contenido(1)), new RegExp(`dice \`lotes: ${valor.replace(".", "\\.")}\``), valor);
    }
  });

  it("un lote mayor que N no existe", async () => {
    instalacion({ lotes: "2" });
    await assert.rejects(registrar(contenido(3)), /El plan declara 2 lotes; L03 no existe\. Si el plan cambió, actualiza su frontmatter/);
  });

  it("sin el plan, no hay lotes", async () => {
    const { tarea } = instalacion();
    // unlinkSync: en Node 24 para Windows, rmSync no borra un nombre con acentos (ni lanza).
    fs.unlinkSync(path.join(tarea, "03 - Plan Técnico.md"));
    await assert.rejects(registrar(contenido(1)), /todavía no tiene `03 - Plan Técnico\.md`/);
  });

  it("antes de un lote hay que cerrar los anteriores: con recibo y sin commit pendiente", async () => {
    instalacion();
    await assert.rejects(registrar(contenido(2)), /Antes de L02 hay que cerrar L01: le falta el recibo\./);
    await registrar(contenido(1)); // pendiente
    await assert.rejects(registrar(contenido(2)), /Antes de L02 hay que cerrar L01: su commit sigue pendiente\./);
  });

  it("un lote fallido cuenta como cerrado para el orden", async () => {
    instalacion();
    await registrar(contenido(1, { estado: "fallido" }));
    const r = await registrar(contenido(2));
    assert.equal(r.salida.lote, "L02");
  });

  it("con la fase cerrada (existe su documento), no se registran más lotes", async () => {
    const { tarea } = instalacion();
    fs.writeFileSync(path.join(tarea, "04 - Ejecución.md"), "hecho a mano", "utf-8");
    await assert.rejects(registrar(contenido(1)), /La Fase 4 ya está cerrada \(existe `04 - Ejecución\.md`\)/);
  });
});

describe("record_batch: crear, reemplazar o anclar", () => {
  it("crear exige titulo, estado, que_se_hizo y verificacion", async () => {
    instalacion();
    await assert.rejects(registrar({ lote: 1, titulo: "x" }), /Para crear el recibo de L01 faltan `estado`, `que_se_hizo`, `verificacion`\./);
  });

  it("dos tiempos: el recibo con el commit pendiente y después el ancla, en el mismo archivo y sin tocar el contenido", async () => {
    const { recibos, dirs } = instalacion();
    const primero = await registrar(contenido(1, { titulo: "corregir cálculo: total", espera_al_usuario: [{ prueba: "abrir", esperado: "ver" }] }));
    assert.equal(primero.salida.ancla.tipo, "pendiente");
    assert.equal(primero.salida.recibo, `${RECIBOS}/L01 - corregir cálculo total.md`);
    assert.match(primero.texto, /^L01 de 3 registrado con el commit pendiente\. Cuando exista, llama de nuevo a `record_batch` con `lote: 1` y `commit`\./);
    const antes = leerRecibo(path.join(recibos, "L01 - corregir cálculo total.md"));
    assert.equal(antes.rama, "main");

    const sha = commitEn(dirs.api!, ["src/l1.ts"]);
    const segundo = await registrar({ lote: 1, commit: sha.slice(0, 7) });
    assert.match(segundo.texto, new RegExp(`^L01 de 3 registrado: verificado · commit ${sha.slice(0, 7)} en \`api\` \\(main\\)\\. Siguiente: L02\\.$`));
    assert.deepEqual(recibosEn(recibos), ["L01 - corregir cálculo total.md"]);

    const despues = leerRecibo(path.join(recibos, "L01 - corregir cálculo total.md"));
    assert.deepEqual({ ...despues, ancla: antes.ancla, verificacionDelCommit: null }, { ...antes });
    assert.equal(despues.ancla.tipo === "commit" && despues.ancla.sha, sha);
    assert.equal(despues.verificacionDelCommit, "El commit toca exactamente el archivo declarado.");
  });

  it("un solo tiempo si el commit ya existe al registrar", async () => {
    const { dirs } = instalacion();
    const sha = commitEn(dirs.api!, ["src/l1.ts"]);
    const r = await registrar(contenido(1, { commit: sha }));
    assert.equal(r.salida.ancla.tipo, "commit");
    assert.equal(r.salida.siguiente, "L02");
    assert.deepEqual(r.salida.avisos, []);
  });

  it("pendiente y llega contenido: se reemplaza, y si cambia el título se renombra el archivo", async () => {
    const { recibos } = instalacion();
    // Con acentos: en Node 24 para Windows, rmSync no borraba un nombre así y dejaba dos recibos.
    await registrar(contenido(1, { titulo: "primer cálculo" }));
    await registrar(contenido(1, { titulo: "segundo cálculo", que_se_hizo: "otra cosa" }));
    assert.deepEqual(recibosEn(recibos), ["L01 - segundo cálculo.md"]);
    assert.equal(leerRecibo(path.join(recibos, "L01 - segundo cálculo.md")).queSeHizo, "otra cosa");
  });

  it("un cambio de título solo en mayúsculas no borra el recibo", async () => {
    const { recibos } = instalacion();
    await registrar(contenido(1, { titulo: "Filtro" }));
    await registrar(contenido(1, { titulo: "filtro" }));
    const quedan = recibosEn(recibos);
    assert.equal(quedan.length, 1);
    assert.equal(quedan[0]!.toLowerCase(), "l01 - filtro.md");
    assert.equal(leerRecibo(path.join(recibos, quedan[0]!)).titulo, "filtro");
  });

  it("pendiente y no llega nada que registrar: error", async () => {
    instalacion();
    await registrar(contenido(1));
    await assert.rejects(registrar({ lote: 1 }), /ya existe con el commit pendiente: pasa `commit` para anclarlo, o el contenido completo/);
  });

  it("un recibo fallido o con nota se reemplaza (nuevo intento), y pide el contenido completo", async () => {
    instalacion({ commits: "ninguno" });
    await registrar(contenido(1, { estado: "fallido" }));
    await assert.rejects(registrar({ lote: 1, verification_note: "x" }), /no está sellado .*pasa el contenido completo/);
    const r = await registrar(contenido(1, { verification_note: "revisado a mano" }));
    assert.equal(r.salida.ancla.tipo, "nota");
    const otra = await registrar(contenido(1, { verification_note: "revisado otra vez" }));
    assert.equal(otra.salida.ancla.resumen, "nota: revisado otra vez");
  });

  it("un recibo sellado (commit o sha256) no se reescribe", async () => {
    const { dirs } = instalacion();
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    await assert.rejects(registrar(contenido(1)), /El recibo L01 está sellado con el commit `[0-9a-f]{7}` y no se reescribe\./);

    const { docs } = instalacion({ repos: [] });
    fs.writeFileSync(path.join(docs, "P", "nota.md"), "x", "utf-8");
    await registrar(contenido(1, { artifact_path: "nota.md" }));
    await assert.rejects(registrar(contenido(1, { artifact_path: "nota.md" })), /está sellado con el sha256/);
  });

  it("dos recibos del mismo lote: error con los nombres", async () => {
    const { recibos } = instalacion();
    fs.mkdirSync(recibos);
    fs.writeFileSync(path.join(recibos, "L01 - a.md"), "---\ncommit: pendiente\n---\n", "utf-8");
    fs.writeFileSync(path.join(recibos, "L01 - b.md"), "---\ncommit: pendiente\n---\n", "utf-8");
    await assert.rejects(registrar(contenido(1)), /Hay 2 recibos de L01 .*`L01 - a\.md`, `L01 - b\.md`.*Deja uno solo/);
  });
});

describe("record_batch: repo del lote", () => {
  it("el único repo de la tarea, si no se indica", async () => {
    instalacion();
    assert.match((await registrar(contenido(1))).texto, /commit pendiente/);
  });

  it("con varios repos y sin argumento: error con la lista; con argumento, ese", async () => {
    const { tarea } = instalacion({ repos: [{ id: "api", dir: "api" }, { id: "web", dir: "web" }] });
    await assert.rejects(registrar(contenido(1)), /tiene varios repos \(api, web\): indica en `repo` el de este lote/);
    const r = await registrar(contenido(1, { repo: "web" }));
    assert.equal(leerRecibo(path.join(tarea, r.salida.recibo)).repo, "web");
    await assert.rejects(registrar(contenido(1, { repo: "otro" })), /`otro` no es un repo de la tarea "t"\. Los suyos son: api, web\./);
  });

  it("los repos que elige la tarea en su contexto inicial", async () => {
    const { tarea } = instalacion({ repos: [{ id: "api", dir: "api" }, { id: "web", dir: "web" }] });
    fs.writeFileSync(path.join(tarea, "00 - Contexto Inicial.md"), "---\nrepos: web\n---\ncontexto", "utf-8");
    const r = await registrar(contenido(1));
    assert.match(r.salida.recibo, /L01/);
    assert.equal(leerRecibo(path.join(tarea, r.salida.recibo)).repo, "web");
  });

  it("sin repos (sin manifiesto, o con repos: []), el lote no tiene repo", async () => {
    const { tarea } = instalacion({ conManifiesto: false });
    const r = await registrar(contenido(1, { verification_note: "comprobado leyendo el documento" }));
    assert.equal(leerRecibo(path.join(tarea, r.salida.recibo)).repo, null);
    await assert.rejects(registrar(contenido(2, { repo: "api", verification_note: "x" })), /no tiene repos .*quita `repo`/);
  });
});

describe("record_batch: el ancla según la política", () => {
  it("con git y política distinta de ninguno: commit, o pendiente; un artefacto o una nota son un error", async () => {
    instalacion({ commits: "auto" });
    await assert.rejects(registrar(contenido(1, { verification_note: "x" })), /tiene git y la política de commits es `auto`: el ancla de este lote es su commit/);
    await assert.rejects(registrar(contenido(1, { artifact_path: "inicio.txt" })), /el ancla de este lote es su commit/);
    assert.equal((await registrar(contenido(1))).salida.ancla.tipo, "pendiente");
  });

  it("sin git: artifact_path se sella con sha256, verification_note es una nota, y sin ninguno es un error", async () => {
    const { dirs } = instalacion({ sinGit: ["api"] });
    fs.writeFileSync(path.join(dirs.api!, "informe.md"), "informe\n", "utf-8");
    await assert.rejects(registrar(contenido(1)), /Sin git, el lote necesita un ancla: `artifact_path` o `verification_note`\./);
    await assert.rejects(registrar(contenido(1, { commit: "a1b2c3d" })), /El repo `api` no tiene git: no hay commit que anclar/);
    const r = await registrar(contenido(1, { artifact_path: "informe.md" }));
    assert.equal(r.salida.ancla.tipo, "sha256");
    assert.match(r.texto, /L01 de 3 registrado: verificado · sha256 `[0-9a-f]{12}…` de `repo:api\/informe\.md`\. Siguiente: L02\./);
    assert.equal((await registrar(contenido(2, { verification_note: "revisado" }))).salida.ancla.tipo, "nota");
  });

  it("política ninguno con un repo que sí tiene git: nota o artefacto, y un commit pasado igualmente se verifica", async () => {
    const { dirs } = instalacion({ commits: "ninguno" });
    assert.equal((await registrar(contenido(1, { verification_note: "sin commit" }))).salida.ancla.tipo, "nota");
    const sha = commitEn(dirs.api!, ["src/l2.ts"]);
    assert.equal((await registrar(contenido(2, { commit: sha }))).salida.ancla.tipo, "commit");
    await assert.rejects(registrar(contenido(3, { commit: "0".repeat(40) })), /no existe en el repo `api`/);
  });

  it("un lote fallido o descartado se ancla a una nota, y un commit o un artefacto ahí es un error", async () => {
    instalacion();
    await assert.rejects(registrar(contenido(1, { estado: "fallido", commit: "a1b2c3d" })), /Un lote fallido no se commitea/);
    await assert.rejects(registrar(contenido(1, { estado: "descartado", artifact_path: "x" })), /Un lote descartado no se sella/);
    const r = await registrar(contenido(1, { estado: "fallido" }));
    assert.equal(r.salida.ancla.resumen, "nota: no aplica (lote fallido)");
    assert.match(r.texto, /^L01 de 3 registrado: fallido\. No hagas su commit: detente y pregúntale al usuario/);
  });

  it("más de un ancla en la misma llamada es un error", async () => {
    instalacion();
    await assert.rejects(registrar(contenido(1, { commit: "a1b2c3d", verification_note: "x" })), /Pasa solo una ancla: `commit`, `artifact_path` o `verification_note`\./);
  });

  it("un commit que toca otros archivos queda escrito como aviso, sin bloquear", async () => {
    const { dirs, recibos } = instalacion();
    const sha = commitEn(dirs.api!, ["src/l1.ts", "src/extra.ts"]);
    const r = await registrar(contenido(1, { commit: sha }));
    assert.deepEqual(r.salida.avisos, ["En el commit y no en el recibo: `src/extra.ts`."]);
    assert.match(r.texto, /\nAviso: el commit no toca los archivos que declara el recibo/);
    assert.equal(leerRecibo(path.join(recibos, recibosEn(recibos)[0]!)).verificacionDelCommit, "En el commit y no en el recibo: `src/extra.ts`.");
  });

  it("el mismo commit no ancla dos lotes", async () => {
    const { dirs } = instalacion();
    const sha = commitEn(dirs.api!, ["src/l1.ts"]);
    await registrar(contenido(1, { commit: sha }));
    await assert.rejects(registrar(contenido(2, { commit: sha })), /ya es el ancla de L01\. Cada lote es un commit\./);
  });
});

// Dos procesos (dos ventanas del cliente, dos servidores) que
// registran el mismo lote a la vez. Sin el candado de la tarea, los dos pasaban la comprobación y
// quedaban dos recibos del lote. Dos node de verdad, que arrancan a la vez en cada ronda.
describe("record_batch: dos procesos a la vez", () => {
  const HIJO = [
    "const [raiz, inicio, titulo] = process.argv.slice(2);",
    "const { pathToFileURL } = await import('node:url');",
    "const path = await import('node:path');",
    "const mod = (nombre) => import(pathToFileURL(path.join(raiz, 'build-test', 'src', nombre)).href);",
    "(await mod('config.js')).fijarRaizDelPaquete(raiz);",
    "const { registrarLote } = await mod('lotes.js');",
    "while (Date.now() < Number(inicio)) {}",
    "try {",
    "  await registrarLote('P', 't', { lote: 1, titulo, estado: 'verificado', que_se_hizo: 'x', verificacion: 'y', verification_note: 'z' });",
    "  console.log('OK');",
    "} catch (error) { console.log('ERROR ' + error.message); }",
  ].join("\n");

  it("nunca deja dos recibos del mismo lote, y el que pierde lo dice", async () => {
    const { recibos } = instalacion({ repos: [] });
    const script = path.join(carpetaTemporal("hijo"), "hijo.mjs");
    fs.writeFileSync(script, HIJO, "utf-8");
    const { spawn } = await import("node:child_process");
    const lanzar = (inicio: number, titulo: string) =>
      new Promise<string>((resolver) => {
        const hijo = spawn(process.execPath, [script, RAIZ, String(inicio), titulo], { env: process.env });
        let salida = "";
        hijo.stdout.on("data", (d) => (salida += d));
        hijo.on("close", () => resolver(salida.trim()));
      });

    const errores: string[] = [];
    for (let ronda = 0; ronda < 8; ronda++) {
      if (fs.existsSync(recibos)) for (const r of fs.readdirSync(recibos)) fs.unlinkSync(path.join(recibos, r));
      const inicio = Date.now() + 1500;
      const salidas = await Promise.all([lanzar(inicio, `titulo A ${ronda}`), lanzar(inicio, `titulo B ${ronda}`)]);
      const deL01 = recibosEn(recibos).filter((r) => r.startsWith("L01 - "));
      assert.equal(deL01.length, 1, `ronda ${ronda}: ${deL01.join(", ")} · ${salidas.join(" | ")}`);
      assert.ok(salidas.every((s) => s === "OK" || s.startsWith("ERROR ")), salidas.join(" | "));
      errores.push(...salidas.filter((s) => s.startsWith("ERROR ")));
      assert.equal(fs.existsSync(path.join(recibos, "..", ".record_batch.lock")), false, "el candado se suelta");
    }
    for (const error of errores) assert.match(error, /Otro proceso (modificó este recibo|está registrando un lote de esta tarea); vuelve a llamar\./);
  });

  it("un candado abandonado (un proceso que murió) no bloquea para siempre", async () => {
    const { tarea } = instalacion({ repos: [] });
    const candado = path.join(tarea, ".record_batch.lock");
    fs.writeFileSync(candado, "", "utf-8");
    await assert.rejects(registrar(contenido(1, { verification_note: "z" })), /Otro proceso está registrando un lote de esta tarea/);
    const viejo = new Date(Date.now() - 60_000);
    fs.utimesSync(candado, viejo, viejo);
    assert.equal((await registrar(contenido(1, { verification_note: "z" }))).salida.lote, "L01");
    assert.equal(fs.existsSync(candado), false);
  });
});

describe("record_batch: escritura", () => {
  it("si otro proceso modifica el recibo entre la lectura y la escritura, falla sin escribir", async () => {
    const { recibos, dirs } = instalacion();
    await registrar(contenido(1));
    const archivo = path.join(recibos, recibosEn(recibos)[0]!);
    const sha = commitEn(dirs.api!, ["src/l1.ts"]);

    await assert.rejects(
      registrarLote("P", "t", { lote: 1, commit: sha }, {
        ahora: AHORA,
        antesDeEscribir: () => {
          // Otra ventana escribe el mismo recibo mientras esta verificaba el commit.
          fs.writeFileSync(archivo, `${fs.readFileSync(archivo, "utf-8")}\notra ventana\n`, "utf-8");
          const futuro = new Date(Date.now() + 5000);
          fs.utimesSync(archivo, futuro, futuro);
        },
      }),
      /Otro proceso modificó este recibo; vuelve a llamar\./
    );
    assert.match(fs.readFileSync(archivo, "utf-8"), /otra ventana/);
    assert.equal(leerRecibo(archivo).ancla.tipo, "pendiente");
  });

  it("si otro proceso crea el recibo del mismo lote mientras tanto, también", async () => {
    const { recibos } = instalacion();
    await assert.rejects(
      registrarLote("P", "t", contenido(1), {
        antesDeEscribir: () => {
          fs.mkdirSync(recibos, { recursive: true });
          fs.writeFileSync(path.join(recibos, "L01 - de la otra ventana.md"), "---\ncommit: pendiente\n---\n", "utf-8");
        },
      }),
      /Otro proceso modificó este recibo/
    );
    assert.deepEqual(recibosEn(recibos), ["L01 - de la otra ventana.md"]);
  });

  it("no deja temporales, y el recibo es determinista: lo mismo dos veces da los mismos bytes", async () => {
    const { recibos } = instalacion();
    await registrar(contenido(1));
    const primero = fs.readFileSync(path.join(recibos, "L01 - lote 1.md"), "utf-8");
    await registrar(contenido(1));
    assert.equal(fs.readFileSync(path.join(recibos, "L01 - lote 1.md"), "utf-8"), primero);
    assert.deepEqual(recibosEn(recibos), ["L01 - lote 1.md"]);
    assert.ok(primero.endsWith("\n") && !primero.includes("\r"));
  });

  it("una subcarpeta de recibos que es una junction hacia fuera de la tarea no se usa", async () => {
    const { recibos } = instalacion();
    const fuera = carpetaTemporal("fuera");
    fs.symlinkSync(fuera, recibos, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(registrar(contenido(1)), /lleva fuera de la carpeta de la tarea/);
    assert.deepEqual(fs.readdirSync(fuera), []);
  });
});

describe("record_batch por MCP", () => {
  it("con la tarea activa, devuelve texto y structuredContent; sin tarea activa guardada, pide task_name", async () => {
    instalacion();
    const { cliente, cerrar } = await conectar();
    try {
      const sinPuntero = await cliente.callTool({ name: "record_batch", arguments: { project: "P", ...contenido(1) } });
      assert.equal(sinPuntero.isError, true);
      assert.match(textoDe(sinPuntero), /No hay tarea activa guardada en P: indica `task_name`/);

      await cliente.callTool({ name: "switch_task", arguments: { project: "P", task_name: "t" } });
      const r = await cliente.callTool({ name: "record_batch", arguments: { project: "P", ...contenido(1), desvios: null } });
      assert.equal(r.isError, undefined, textoDe(r));
      assert.match(textoDe(r), /L01 de 3 registrado con el commit pendiente/);
      assert.deepEqual(r.structuredContent, {
        recibo: `${RECIBOS}/L01 - lote 1.md`,
        lote: "L01",
        de: 3,
        estado: "verificado",
        ancla: { tipo: "pendiente", resumen: "commit pendiente" },
        avisos: [],
        siguiente: "L01",
        faseCerrada: false,
        documentoDeFase: null,
      });

      const mal = await cliente.callTool({ name: "record_batch", arguments: { project: "P", lote: 100 } });
      assert.match(textoDe(mal), /`lote` va de 1 a 99/);
    } finally {
      await cerrar();
    }
  });
});

// ─── El documento de la fase ────────────────────────────────────────────────
// Los índices de oro (test/oro/indice-*.md) se escribieron con ensamblarIndice sobre estos escenarios y
// se revisaron a mano. Si un cambio toca a propósito el formato, se regeneran con ORO_REGENERAR=1 y se
// vuelven a revisar antes del commit.
const ORO = path.join(RAIZ, "test", "oro");

function reciboDe(lote: number, de: number, cambios: Partial<Recibo>): Recibo {
  return {
    lote, de, titulo: `lote ${lote}`, repo: "api", rama: "feat/filtro", estado: "verificado",
    ancla: { tipo: "commit", repo: "api", sha: `${String(lote).repeat(7)}${"0".repeat(33)}`, corto: String(lote).repeat(7), asunto: `feat(x): lote ${lote}`, rama: "feat/filtro", verificado: `2026-11-0${lote}T10:00:00.000Z` },
    fecha: `2026-11-0${lote}`, registrado: `2026-11-0${lote}T10:00:00.000Z`, origen: "servidor",
    queSeHizo: `Lote ${lote} hecho.`, archivos: [{ archivo: `src/l${lote}.ts`, cambio: "nuevo" }],
    verificacion: `npm test: ${40 + lote} pasan, 0 fallan.\nSegunda línea que no va al índice.`,
    esperaAlUsuario: [], desvios: "", decisiones: "", condicionales: [], verificacionDelCommit: "El commit toca exactamente el archivo declarado.",
    ...cambios,
  };
}

const ESCENARIOS: Record<string, { repos: { id: string; dir: string }[]; recibos: Recibo[] }> = {
  "sin-pendientes": {
    repos: [{ id: "api", dir: "api" }],
    recibos: [
      reciboDe(1, 3, { titulo: "corregir cálculo" }),
      reciboDe(2, 3, { titulo: "filtro por categoría" }),
      reciboDe(3, 3, { titulo: "fix(rutas): C:/datos" }),
    ],
  },
  "con-pendientes": {
    repos: [{ id: "api", dir: "api" }],
    recibos: [
      reciboDe(1, 3, { titulo: "corregir cálculo", esperaAlUsuario: [{ prueba: "Abrir el reporte", esperado: "el total cuadra" }] }),
      reciboDe(2, 3, {
        titulo: "filtro por categoría",
        estado: "con pendientes",
        verificacion: "Falta la prueba con datos reales.",
        esperaAlUsuario: [{ prueba: "Filtrar | sin categoría", esperado: "12 filas\nen orden" }],
      }),
      reciboDe(3, 3, { titulo: "exportar CSV", estado: "fallido", ancla: { tipo: "nota", texto: "La suite no pasa." }, verificacion: "npm test: 3 fallan.", verificacionDelCommit: null }),
    ],
  },
  "multi-repo": {
    repos: [{ id: "api", dir: "api" }, { id: "web", dir: "web" }],
    recibos: [
      reciboDe(1, 2, { titulo: "endpoint nuevo" }),
      reciboDe(2, 2, {
        titulo: "pantalla nueva",
        repo: "web",
        rama: "feat/pantalla",
        ancla: { tipo: "commit", repo: "web", sha: `e4f5a6b${"0".repeat(33)}`, corto: "e4f5a6b", asunto: "feat(web): pantalla", rama: "feat/pantalla", verificado: "2026-11-02T10:00:00.000Z" },
      }),
    ],
  },
  "con-sha256": {
    repos: [],
    recibos: [
      reciboDe(1, 2, {
        titulo: "ajuste de prompt",
        repo: null,
        rama: null,
        ancla: { tipo: "sha256", ruta: "proyecto:ASISTENTE/prompt-sistema.md", sha256: `9c1e${"ab".repeat(30)}`, bytes: 2048, verificado: "2026-11-01T10:00:00.000Z" },
        verificacionDelCommit: null,
      }),
      reciboDe(2, 2, { titulo: "revisar respuestas", repo: null, rama: null, ancla: { tipo: "nota", texto: "Revisadas 20 respuestas a mano." }, verificacionDelCommit: null }),
    ],
  },
  "con-descartados": {
    repos: [{ id: "api", dir: "api" }, { id: "web", dir: "web" }],
    recibos: [
      reciboDe(1, 3, { titulo: "corregir cálculo" }),
      reciboDe(2, 3, { titulo: "refactor del menú", repo: "web", rama: null, estado: "descartado", ancla: { tipo: "nota", texto: "lo pidió el usuario" }, verificacion: "", verificacionDelCommit: null }),
      reciboDe(3, 3, { titulo: "Lote 3", repo: null, rama: null, estado: "descartado", ancla: { tipo: "nota", texto: "lo pidió el usuario" }, verificacion: "", verificacionDelCommit: null }),
    ],
  },
};

function tareaConRecibos(nombre: string) {
  const escenario = ESCENARIOS[nombre]!;
  const { tarea, recibos } = instalacion({ lotes: String(escenario.recibos[0]!.de), repos: escenario.repos });
  fs.mkdirSync(recibos, { recursive: true });
  for (const recibo of escenario.recibos) fs.writeFileSync(path.join(recibos, nombreDeRecibo(recibo.lote, recibo.titulo)), escribirRecibo(recibo), "utf-8");
  return tarea;
}

describe("ensamblarIndice", () => {
  for (const nombre of Object.keys(ESCENARIOS)) {
    it(`índice de oro: ${nombre}, byte a byte`, () => {
      const tarea = tareaConRecibos(nombre);
      const texto = ensamblarIndice(tarea, fasesDe("P"));
      const archivo = path.join(ORO, `indice-${nombre}.md`);
      if (process.env.ORO_REGENERAR === "1") fs.writeFileSync(archivo, texto, "utf-8");
      assert.equal(texto, fs.readFileSync(archivo, "utf-8").replace(/\r\n/g, "\n"));
    });
  }

  it("es determinista: el mismo índice ensamblado dos veces es idéntico, y no depende de la hora", () => {
    const tarea = tareaConRecibos("con-pendientes");
    const primero = ensamblarIndice(tarea, fasesDe("P"));
    assert.equal(ensamblarIndice(tarea, fasesDe("P")), primero);
    assert.ok(primero.endsWith("\n") && !primero.endsWith("\n\n") && !primero.includes("\r"));
  });

  it("la tabla de lotes del plan: repo, objetivo y commit propuesto; null si no la hay", () => {
    const plan = [
      "---", "lotes: 2", "---", "", "# Plan", "",
      "| Lote | Repo | Objetivo | Pasos | Criterio de salida | Commit propuesto | Revierte solo |",
      "|---|---|---|---|---|---|---|",
      "| L01 | `api` | corregir cálculo | M1 | npm test | `fix(calculo): total` | sí |",
      "| **L02** | web | filtro \\| categoría | M2 | ver | `feat(web): x` | sí |",
      "",
    ].join("\n");
    assert.deepEqual([...leerTablaDeLotes(plan)!], [
      [1, { repo: "api", objetivo: "corregir cálculo", commitPropuesto: "fix(calculo): total" }],
      [2, { repo: "web", objetivo: "filtro | categoría", commitPropuesto: "feat(web): x" }],
    ]);
    assert.equal(leerTablaDeLotes("# Plan sin tabla\n"), null);
  });
});

describe("record_batch: cierre de la fase", () => {
  it("al anclar el último lote se genera el índice, y la fase queda cerrada", async () => {
    const { tarea, dirs } = instalacion({ lotes: "2" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    await registrar(contenido(2));
    const r = await registrar({ lote: 2, commit: commitEn(dirs.api!, ["src/l2.ts"]) });
    assert.match(r.texto, /L02 de 2 registrado: verificado · commit [0-9a-f]{7} en `api` \(main\)\. Fase 4 cerrada: se generó `04 - Ejecución\.md`\./);
    assert.deepEqual([r.salida.faseCerrada, r.salida.documentoDeFase, r.salida.siguiente], [true, "04 - Ejecución.md", null]);
    const indice = fs.readFileSync(path.join(tarea, "04 - Ejecución.md"), "utf-8");
    assert.equal(indice, ensamblarIndice(tarea, fasesDe("P")));
    assert.match(indice, /^---\nlotes: 2\ngenerado_por: mcp-phase-gate\n---\n\n# Ejecución — t\n/);
    await assert.rejects(registrar(contenido(1)), /ya está cerrada/);
  });

  it("un lote fallido no cierra la fase solo", async () => {
    const { tarea, dirs } = instalacion({ lotes: "2" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    const r = await registrar(contenido(2, { estado: "fallido" }));
    assert.equal(r.salida.faseCerrada, false);
    assert.match(r.texto, /con `cerrar_fase` y `motivo_descarte`/);
    assert.equal(fs.existsSync(path.join(tarea, "04 - Ejecución.md")), false);
  });

  it("con lotes: 1, el recibo vive en la subcarpeta mientras está abierto y al anclarlo pasa a ser el documento", async () => {
    const { tarea, recibos, dirs } = instalacion({ lotes: "1" });
    await registrar(contenido(1, { titulo: "único cálculo" }));
    assert.equal(fs.existsSync(path.join(tarea, "04 - Ejecución.md")), false, "con el commit pendiente la fase no está cerrada");
    assert.deepEqual(recibosEn(recibos), ["L01 - único cálculo.md"]);

    const r = await registrar({ lote: 1, commit: commitEn(dirs.api!, ["src/l1.ts"]) });
    assert.match(r.texto, /Fase 4 cerrada: el recibo pasó a ser `04 - Ejecución\.md`\./);
    assert.equal(r.salida.recibo, "04 - Ejecución.md");
    assert.equal(fs.existsSync(recibos), false, "la subcarpeta vacía se borra");
    const documento = fs.readFileSync(path.join(tarea, "04 - Ejecución.md"), "utf-8");
    assert.match(documento, /^---\nlotes: 1\ngenerado_por: mcp-phase-gate\nlote: L01\nde: 1\n/);
    assert.equal(parsearRecibo(documento).ancla.tipo, "commit");
    assert.deepEqual(fs.readdirSync(tarea).sort(), [...PREVIOS, "03 - Plan Técnico.md", "04 - Ejecución.md"].sort(), "un solo archivo, sin temporales");
  });

  it("con lotes: 1 y el lote fallido, el recibo se queda en la subcarpeta", async () => {
    const { tarea, recibos } = instalacion({ lotes: "1" });
    await registrar(contenido(1, { estado: "fallido" }));
    assert.equal(fs.existsSync(path.join(tarea, "04 - Ejecución.md")), false);
    assert.equal(recibosEn(recibos).length, 1);
  });
});

describe("record_batch: cerrar_fase", () => {
  const conRespuesta = (estado: ResultadoConfirmacion["estado"], preguntas: string[] = []) => ({
    ahora: AHORA,
    confirmar: async (pregunta: { mensaje: string }) => {
      preguntas.push(pregunta.mensaje);
      return { estado };
    },
  });

  it("descarta los lotes sin recibo con el motivo, tras la confirmación, y cierra la fase", async () => {
    const { tarea, recibos, dirs } = instalacion({ lotes: "4" });
    fs.writeFileSync(path.join(tarea, "03 - Plan Técnico.md"), "---\nlotes: 4\n---\n\n| Lote | Repo | Objetivo | Commit propuesto |\n|---|---|---|---|\n| L03 | api | exportar CSV | x |\n", "utf-8");
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    await registrar(contenido(2, { commit: commitEn(dirs.api!, ["src/l2.ts"]) }));

    const preguntas: string[] = [];
    const r = await registrarLote("P", "t", { lote: 3, cerrar_fase: true, motivo_descarte: "ya no hace falta" }, conRespuesta("confirmada", preguntas));
    assert.deepEqual(preguntas, ["Cerrar la Fase 4 con L03 y L04 descartados («ya no hace falta»). ¿Confirmas?"]);
    assert.equal(r.texto, "L03 y L04 registrados como descartados. Fase 4 cerrada: se generó `04 - Ejecución.md`.");
    assert.deepEqual(recibosEn(recibos), ["L01 - lote 1.md", "L02 - lote 2.md", "L03 - exportar CSV.md", "L04 - Lote 4.md"]);
    const l03 = leerRecibo(path.join(recibos, "L03 - exportar CSV.md"));
    assert.deepEqual([l03.estado, l03.ancla, l03.repo], ["descartado", { tipo: "nota", texto: "ya no hace falta" }, "api"]);
    const indice = fs.readFileSync(path.join(tarea, "04 - Ejecución.md"), "utf-8");
    assert.match(indice, /- \*\*Estado:\*\* Fase cerrada sin pendientes · 2 lotes descartados\n/);
  });

  it("si el usuario no confirma, no se escribe nada; sin elicitation hace falta force", async () => {
    const { tarea, recibos, dirs } = instalacion({ lotes: "2" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    const cerrar = { lote: 2, cerrar_fase: true, motivo_descarte: "no da tiempo" };

    await assert.rejects(registrarLote("P", "t", cerrar, conRespuesta("rechazada")), /El usuario no confirmó el cierre de la Fase 4\. No se escribió nada\./);
    await assert.rejects(registrarLote("P", "t", cerrar, conRespuesta("no-disponible")), /lo decide el usuario: pídele confirmación explícita en el chat y vuelve a llamar con force: true/);
    await assert.rejects(registrarLote("P", "t", cerrar, { ahora: AHORA }), /force: true/, "sin función de confirmación, igual que sin elicitation");
    assert.deepEqual(recibosEn(recibos), ["L01 - lote 1.md"]);
    assert.equal(fs.existsSync(path.join(tarea, "04 - Ejecución.md")), false);

    const r = await registrarLote("P", "t", { ...cerrar, force: true }, conRespuesta("no-disponible"));
    assert.equal(r.salida.faseCerrada, true);
  });

  it("los fallidos se quedan como están y van a Validaciones pendientes; también se confirma", async () => {
    const { tarea, dirs } = instalacion({ lotes: "2" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    const preguntas: string[] = [];
    const r = await registrarLote("P", "t", { ...contenido(2, { estado: "fallido", verificacion: "npm test: 2 fallan." }), cerrar_fase: true }, conRespuesta("confirmada", preguntas));
    assert.deepEqual(preguntas, ["Cerrar la Fase 4 con L02 fallido. ¿Confirmas?"]);
    assert.equal(r.salida.faseCerrada, true);
    assert.match(fs.readFileSync(path.join(tarea, "04 - Ejecución.md"), "utf-8"), /## Validaciones pendientes\n- L02 \(fallido\): npm test: 2 fallan\.\n$/);
  });

  it("con lotes que faltan y sin motivo, o con un lote con el commit pendiente, es un error", async () => {
    instalacion({ lotes: "3" });
    await registrar(contenido(1));
    await assert.rejects(registrarLote("P", "t", { lote: 2, cerrar_fase: true, motivo_descarte: "x" }, conRespuesta("confirmada")), /No se puede cerrar la Fase 4 con L01 abierto con el commit pendiente/);
    await registrar(contenido(1, { estado: "descartado" }));
    await assert.rejects(registrarLote("P", "t", { lote: 2, cerrar_fase: true }, conRespuesta("confirmada")), /Faltan L02 y L03: para cerrar la fase sin ellos, pasa `motivo_descarte`/);
    await assert.rejects(registrarLote("P", "t", { lote: 2, motivo_descarte: "x" }, conRespuesta("confirmada")), /`motivo_descarte` solo va con `cerrar_fase: true`/);
  });

  it("con todo cerrado, cerrar_fase no pregunta nada", async () => {
    const { dirs } = instalacion({ lotes: "1" });
    const preguntas: string[] = [];
    const r = await registrarLote("P", "t", { ...contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }), cerrar_fase: true }, conRespuesta("rechazada", preguntas));
    assert.deepEqual([preguntas, r.salida.faseCerrada], [[], true]);
  });
});

// ─── El sellado y reanclar ──────────────────────────────────────────────────
describe("record_batch: reanclar", () => {
  const con = (estado: ResultadoConfirmacion["estado"], preguntas: string[] = []) => ({
    ahora: AHORA,
    confirmar: async (pregunta: { mensaje: string }) => {
      preguntas.push(pregunta.mensaje);
      return { estado };
    },
  });

  // L01 anclado a un commit que después se reescribe con --amend (lo mismo que un rebase o un squash).
  async function anclarYReescribir(lotes = "2") {
    const inst = instalacion({ lotes });
    const viejo = commitEn(inst.dirs.api!, ["src/l1.ts"]);
    await registrar(contenido(1, { titulo: "corregir cálculo", commit: viejo }));
    g(inst.dirs.api!, "commit", "-q", "--amend", "-m", "feat(x): lote, reescrito");
    return { ...inst, viejo, nuevo: g(inst.dirs.api!, "rev-parse", "HEAD") };
  }

  it("con la confirmación, cambia solo el ancla y deja el historial en Verificación del commit", async () => {
    const { recibos, viejo, nuevo } = await anclarYReescribir();
    const archivo = path.join(recibos, "L01 - corregir cálculo.md");
    const antes = leerRecibo(archivo);
    const preguntas: string[] = [];

    const r = await registrarLote("P", "t", { lote: 1, reanclar: true, commit: nuevo }, con("confirmada", preguntas));
    assert.deepEqual(preguntas, [`El recibo L01 está sellado con el commit \`${viejo.slice(0, 7)}\`. ¿Reemplazar su ancla por \`${nuevo.slice(0, 7)}\`?`]);
    assert.equal(r.texto, `L01 reanclado: \`${viejo.slice(0, 7)}\` → \`${nuevo.slice(0, 7)}\` en \`api\` (main).`);

    const despues = leerRecibo(archivo);
    assert.equal(despues.ancla.tipo === "commit" && despues.ancla.sha, nuevo);
    assert.deepEqual({ ...despues, ancla: antes.ancla, verificacionDelCommit: antes.verificacionDelCommit }, antes, "el contenido del lote no cambia");
    assert.equal(despues.verificacionDelCommit, `El commit toca exactamente el archivo declarado.\nReanclado el 2026-11-03: \`${viejo.slice(0, 7)}\` → \`${nuevo.slice(0, 7)}\``);
  });

  it("sin elicitation hace falta force; si el usuario no confirma, no se escribe nada", async () => {
    const { recibos, nuevo } = await anclarYReescribir();
    const archivo = path.join(recibos, "L01 - corregir cálculo.md");
    const antes = fs.readFileSync(archivo, "utf-8");
    const pedido = { lote: 1, reanclar: true, commit: nuevo };

    await assert.rejects(registrarLote("P", "t", pedido, con("rechazada")), /El usuario no confirmó el cambio de ancla de L01\. No se escribió nada\./);
    await assert.rejects(registrarLote("P", "t", pedido, con("no-disponible")), /lo decide el usuario: pídele confirmación explícita en el chat y vuelve a llamar con `reanclar: true` y force: true/);
    assert.equal(fs.readFileSync(archivo, "utf-8"), antes);

    const r = await registrarLote("P", "t", { ...pedido, force: true }, con("no-disponible"));
    assert.match(r.texto, /L01 reanclado/);
  });

  it("solo se reancla un recibo sellado, solo el ancla, y a un ancla distinta", async () => {
    const { nuevo, viejo } = await anclarYReescribir("3");
    await assert.rejects(registrarLote("P", "t", { lote: 1, reanclar: true, commit: nuevo, titulo: "otro" }, con("confirmada")), /`reanclar` solo cambia el ancla/);
    await assert.rejects(registrarLote("P", "t", { lote: 1, reanclar: true, verification_note: "x" }, con("confirmada")), /pasa el ancla nueva: `commit`/);
    await assert.rejects(registrarLote("P", "t", { lote: 2, reanclar: true, commit: nuevo }, con("confirmada")), /No hay recibo de L02/);
    await registrar(contenido(2));
    await assert.rejects(registrarLote("P", "t", { lote: 2, reanclar: true, commit: nuevo }, con("confirmada")), /El recibo L02 no está sellado .*no hace falta reanclar/);
    // El viejo ya no está en la rama: no se puede volver a anclar a él.
    await assert.rejects(registrarLote("P", "t", { lote: 1, reanclar: true, commit: viejo }, con("confirmada")), /existe pero no está en la rama actual/);
    await registrarLote("P", "t", { lote: 1, reanclar: true, commit: nuevo }, con("confirmada"));
    await assert.rejects(registrarLote("P", "t", { lote: 1, reanclar: true, commit: nuevo }, con("confirmada")), /ya está anclado a `[0-9a-f]{7}`: no hay nada que cambiar/);
  });

  it("si otra ventana cambia el recibo mientras se pregunta, no se escribe", async () => {
    const { recibos, nuevo } = await anclarYReescribir();
    const archivo = path.join(recibos, "L01 - corregir cálculo.md");
    await assert.rejects(
      registrarLote("P", "t", { lote: 1, reanclar: true, commit: nuevo }, {
        ...con("confirmada"),
        antesDeEscribir: () => {
          const futuro = new Date(Date.now() + 5000);
          fs.utimesSync(archivo, futuro, futuro);
        },
      }),
      /Otro proceso modificó este recibo; vuelve a llamar\./
    );
    assert.notEqual((leerRecibo(archivo).ancla as { sha: string }).sha, nuevo);
  });

  it("el rechazo de un recibo sellado sugiere reanclar", async () => {
    const { nuevo } = await anclarYReescribir();
    await assert.rejects(registrar(contenido(1, { commit: nuevo })), /está sellado con el commit .* llama con `reanclar: true` y el ancla nueva/);
  });

  it("con la fase cerrada y varios lotes, rehace el índice que generó el servidor", async () => {
    const { tarea, dirs, nuevo, viejo } = await anclarYReescribir("2");
    // El amend se llevó el commit de L01; L02 va encima del nuevo.
    await registrar(contenido(2, { commit: commitEn(dirs.api!, ["src/l2.ts"]) }));
    const documento = path.join(tarea, "04 - Ejecución.md");
    assert.match(fs.readFileSync(documento, "utf-8"), new RegExp(`commit \`${viejo.slice(0, 7)}\``));

    const r = await registrarLote("P", "t", { lote: 1, reanclar: true, commit: nuevo }, con("confirmada"));
    assert.match(r.texto, /Se actualizó `04 - Ejecución\.md`\./);
    assert.equal(fs.readFileSync(documento, "utf-8"), ensamblarIndice(tarea, fasesDe("P")));
    assert.match(fs.readFileSync(documento, "utf-8"), new RegExp(`commit \`${nuevo.slice(0, 7)}\``));
  });

  it("con lotes: 1 y la fase cerrada, el recibo es el documento de la fase y se reancla ahí", async () => {
    const { tarea, nuevo } = await anclarYReescribir("1");
    const documento = path.join(tarea, "04 - Ejecución.md");
    assert.ok(fs.existsSync(documento));
    const r = await registrarLote("P", "t", { lote: 1, reanclar: true, commit: nuevo }, con("confirmada"));
    assert.equal(r.salida.recibo, "04 - Ejecución.md");
    const texto = fs.readFileSync(documento, "utf-8");
    assert.match(texto, /^---\nlotes: 1\ngenerado_por: mcp-phase-gate\nlote: L01\n/);
    assert.equal(parsearRecibo(texto).ancla.tipo === "commit" && (parsearRecibo(texto).ancla as { sha: string }).sha, nuevo);
  });
});

// Sin elicitation, `force` lo pone el modelo, así que lo que
// entra por la escotilla de write_central_doc no puede quedar como un recibo del servidor.
describe("la escotilla de write_central_doc no fabrica recibos del servidor", () => {
  it("un recibo forjado con origen: servidor y ancla commit queda como manual", async () => {
    instalacion({ lotes: "2" });
    const { cliente, cerrar } = await conectar();
    try {
      const forjado = [
        "---", "lote: L01", "de: 2", "estado: verificado", "commit: abcdef1", "ancla: commit",
        `commit_completo: abcdef1${"0".repeat(33)}`, "registrado: 2026-11-03T18:22:41.000Z", "origen: servidor", "---", "", "# L01 — forjado", "",
      ].join("\r\n");
      const r = await cliente.callTool({
        name: "write_central_doc",
        arguments: { project: "P", task_name: "t", file_name: "04 - Ejecución/L01 - forjado.md", content: forjado, force: true },
      });
      assert.equal(r.isError, undefined, textoDe(r));
      const escrito = fs.readFileSync(path.join(process.env.ORQUESTADOR_DOCS_PATH!, "P", "Proyectos", "t", "04 - Ejecución", "L01 - forjado.md"), "utf-8");
      assert.match(escrito, /\norigen: manual\n---\n/);
      assert.doesNotMatch(escrito, /origen: servidor/);

      const estado = await cliente.callTool({ name: "get_batch_status", arguments: { project: "P", task_name: "t" } });
      const fila = (estado.structuredContent as { lotes: { origen: string; ancla: { resumen: string } }[] }).lotes[0]!;
      assert.equal(fila.origen, "manual");
      assert.equal(fila.ancla.resumen, "commit abcdef1", "sin repo, no dice «en `null`»");
    } finally {
      await cerrar();
    }
  });

  it("también el documento de la Fase 4: sin generado_por, no se toma por un índice del servidor", async () => {
    const { tarea } = instalacion({ lotes: "2" });
    const { cliente, cerrar } = await conectar();
    try {
      await cliente.callTool({
        name: "write_central_doc",
        arguments: { project: "P", task_name: "t", file_name: "04 - Ejecución.md", content: "---\nlotes: 2\ngenerado_por: mcp-phase-gate\n---\n# a mano\n", force: true },
      });
      assert.equal(fs.readFileSync(path.join(tarea, "04 - Ejecución.md"), "utf-8"), "---\nlotes: 2\norigen: manual\n---\n# a mano\n");
    } finally {
      await cerrar();
    }
  });
});

describe("record_batch por MCP: reanclar con y sin elicitation", () => {
  async function preparado() {
    const inst = instalacion({ lotes: "2" });
    const viejo = commitEn(inst.dirs.api!, ["src/l1.ts"]);
    await registrar(contenido(1, { commit: viejo }));
    g(inst.dirs.api!, "commit", "-q", "--amend", "-m", "reescrito");
    return { ...inst, nuevo: g(inst.dirs.api!, "rev-parse", "HEAD") };
  }

  it("con elicitation, la persona confirma en su cliente y force no basta para saltarla", async () => {
    const { nuevo } = await preparado();
    const preguntas: string[] = [];
    let responder: "accept" | "decline" = "decline";
    const { cliente, cerrar } = await conectar({ elicitation: {} }, (c) => {
      c.setRequestHandler(ElicitRequestSchema, async (peticion) => {
        preguntas.push(String(peticion.params.message));
        return responder === "accept" ? { action: "accept", content: { confirmar: true } } : { action: "decline" };
      });
    });
    try {
      const pedido = { project: "P", task_name: "t", lote: 1, reanclar: true, commit: nuevo, force: true };
      const rechazado = await cliente.callTool({ name: "record_batch", arguments: pedido });
      assert.equal(rechazado.isError, true);
      assert.match(textoDe(rechazado), /El usuario no confirmó el cambio de ancla de L01/);

      responder = "accept";
      const hecho = await cliente.callTool({ name: "record_batch", arguments: pedido });
      assert.equal(hecho.isError, undefined, textoDe(hecho));
      assert.match(textoDe(hecho), /L01 reanclado/);
      assert.equal(preguntas.length, 2);
      assert.match(preguntas[0]!, /^El recibo L01 está sellado con el commit `[0-9a-f]{7}`\. ¿Reemplazar su ancla por `[0-9a-f]{7}`\?$/);
    } finally {
      await cerrar();
    }
  });

  it("sin elicitation, pide force; con force, reancla", async () => {
    const { nuevo } = await preparado();
    const { cliente, cerrar } = await conectar();
    try {
      const pedido = { project: "P", task_name: "t", lote: 1, reanclar: true, commit: nuevo };
      const sinForce = await cliente.callTool({ name: "record_batch", arguments: pedido });
      assert.match(textoDe(sinForce), /vuelve a llamar con `reanclar: true` y force: true/);
      const conForce = await cliente.callTool({ name: "record_batch", arguments: { ...pedido, force: true } });
      assert.match(textoDe(conForce), /L01 reanclado/);
    } finally {
      await cerrar();
    }
  });
});

// ─── get_batch_status ───────────────────────────────────────────────────────
describe("get_batch_status", () => {
  const PLAN_CON_TABLA = [
    "---", "lotes: 3", "---", "", "# Plan", "",
    "| Lote | Repo | Objetivo | Pasos | Criterio de salida | Commit propuesto | Revierte solo |",
    "|---|---|---|---|---|---|---|",
    "| L01 | api | corregir cálculo | M1 | npm test | `fix(calculo): total` | sí |",
    "| L02 | api | filtro por categoría | M2 | npm test | `feat(filtros): categoría` | sí |",
    "| L03 | api | exportar CSV | M3 | ver | `feat(csv): exportar` | sí |",
    "",
  ].join("\n");

  it("cruza el plan con los recibos: columnas del plan, recibo, estado, ancla, origen y la siguiente acción", async () => {
    const { tarea, dirs } = instalacion();
    fs.writeFileSync(path.join(tarea, "03 - Plan Técnico.md"), PLAN_CON_TABLA, "utf-8");
    await registrar(contenido(1, { titulo: "corregir cálculo", commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    await registrar(contenido(2, { titulo: "filtro por categoría" }));

    const { texto, salida } = await estadoDeLotes("P", "t");
    assert.deepEqual([salida.declarados, salida.cerrados, salida.siguiente, salida.avisos, salida.fueraDePlan], [3, 1, "Ancla L02: falta registrar su commit.", [], []]);
    assert.deepEqual(salida.lotes[0], {
      lote: "L01",
      repo: "api",
      objetivo: "corregir cálculo",
      commitPropuesto: "fix(calculo): total",
      recibo: "04 - Ejecución/L01 - corregir cálculo.md",
      estado: "verificado",
      ancla: { tipo: "commit", resumen: salida.lotes[0]!.ancla!.resumen },
      origen: "servidor",
      vigente: null,
      problema: null,
    });
    assert.deepEqual([salida.lotes[1]!.ancla, salida.lotes[2]!.recibo, salida.lotes[2]!.objetivo], [{ tipo: "pendiente", resumen: "commit pendiente" }, null, "exportar CSV"]);
    assert.match(texto, /^Tarea «t» · plan `03 - Plan Técnico\.md` · 3 lotes declarados, 1 cerrado\.\nSiguiente: Ancla L02: falta registrar su commit\.\n/);
    assert.match(texto, /\| L03 \| api \| exportar CSV \| `feat\(csv\): exportar` \| — \| — \| — \| — \|/);
  });

  it("la siguiente acción, en orden: anclar, el fallido, implementar, y la fase cerrada", async () => {
    const { dirs } = instalacion({ lotes: "2" });
    assert.equal((await estadoDeLotes("P", "t")).salida.siguiente, "Implementa L01.");
    await registrar(contenido(1, { estado: "fallido" }));
    assert.equal((await estadoDeLotes("P", "t")).salida.siguiente, "L01 falló: reintenta o descártalo con `cerrar_fase`.");
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    assert.equal((await estadoDeLotes("P", "t")).salida.siguiente, "Implementa L02.");
    await registrar(contenido(2, { commit: commitEn(dirs.api!, ["src/l2.ts"]) }));
    const cerrada = await estadoDeLotes("P", "t");
    assert.deepEqual([cerrada.salida.siguiente, cerrada.salida.faseCerrada, cerrada.salida.cerrados], ["Todos los lotes cerrados: la Fase 4 está cerrada.", true, 2]);
  });

  it("un recibo de un lote mayor que N es RECIBO-FUERA-DE-PLAN, y uno escrito a mano sale como manual", async () => {
    const { recibos } = instalacion({ lotes: "2" });
    fs.mkdirSync(recibos, { recursive: true });
    fs.writeFileSync(path.join(recibos, "L01 - a mano.md"), "---\nlote: L01\nestado: verificado\ncommit: a1b2c3d\n---\n# L01 — a mano\n", "utf-8");
    fs.writeFileSync(path.join(recibos, "L05 - sobrante.md"), "---\nlote: L05\ncommit: pendiente\n---\n", "utf-8");
    const { texto, salida } = await estadoDeLotes("P", "t");
    assert.deepEqual(salida.fueraDePlan, [{ codigo: "RECIBO-FUERA-DE-PLAN", recibo: "04 - Ejecución/L05 - sobrante.md" }]);
    assert.equal(salida.lotes[0]!.origen, "manual");
    assert.match(texto, /- RECIBO-FUERA-DE-PLAN: `04 - Ejecución\/L05 - sobrante\.md` \(el plan declara 2 lotes\)\./);
  });

  it("si la tabla del plan no se puede leer, las columnas del plan quedan vacías y lo avisa; el número sale del frontmatter", async () => {
    const { tarea } = instalacion({ lotes: "2" });
    fs.writeFileSync(path.join(tarea, "03 - Plan Técnico.md"), "---\nlotes: 2\n---\n\n| Paso | Qué |\n|---|---|\n| L01 | x |\n", "utf-8");
    const { salida } = await estadoDeLotes("P", "t");
    assert.equal(salida.declarados, 2);
    assert.deepEqual(salida.avisos, ["No pude leer la tabla de lotes del plan."]);
    assert.deepEqual(salida.lotes.map((f) => [f.repo, f.objetivo, f.commitPropuesto]), [[null, null, null], [null, null, null]]);
  });

  it("reverificar tras un git commit --amend marca el ancla como no vigente", async () => {
    const { dirs } = instalacion({ lotes: "2" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    assert.equal((await estadoDeLotes("P", "t", { reverificar: true })).salida.lotes[0]!.vigente, true);
    assert.equal((await estadoDeLotes("P", "t")).salida.lotes[0]!.vigente, null, "sin reverificar no se comprueba");

    g(dirs.api!, "commit", "-q", "--amend", "-m", "reescrito");
    const { texto, salida } = await estadoDeLotes("P", "t", { reverificar: true });
    assert.equal(salida.lotes[0]!.vigente, false);
    assert.match(salida.lotes[0]!.problema!, /ya no está en la rama actual \(`main`\)\. ¿Rebase o squash\?/);
    assert.match(texto, /\| no: El commit `[0-9a-f]{7}` ya no está en la rama actual/);
  });

  it("con lotes: 1 y la fase cerrada, lee el recibo del documento de la fase", async () => {
    const { dirs } = instalacion({ lotes: "1" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    const { salida } = await estadoDeLotes("P", "t", { reverificar: true });
    assert.deepEqual([salida.lotes[0]!.recibo, salida.lotes[0]!.vigente, salida.faseCerrada], ["04 - Ejecución.md", true, true]);
  });

  it("por MCP: solo lectura, con structuredContent; sin plan con lotes, el error de un plan sin `lotes`", async () => {
    instalacion({ lotes: null });
    const { cliente, cerrar } = await conectar();
    try {
      await cliente.callTool({ name: "switch_task", arguments: { project: "P", task_name: "t" } });
      const sinLotes = await cliente.callTool({ name: "get_batch_status", arguments: { project: "P" } });
      assert.match(textoDe(sinLotes), /El plan no declara `lotes: N`/);
    } finally {
      await cerrar();
    }

    instalacion({ lotes: "2" });
    const otra = await conectar();
    try {
      const r = await otra.cliente.callTool({ name: "get_batch_status", arguments: { project: "P", task_name: "t" } });
      assert.equal(r.isError, undefined, textoDe(r));
      assert.equal((r.structuredContent as { siguiente: string }).siguiente, "Implementa L01.");
    } finally {
      await otra.cerrar();
    }
  });
});

// ─── Los commits verificados para la Fase 5 ─────────────────────────────────
describe("bloqueDeCommits (COMMITS DE LA FASE 4)", () => {
  const corto = (sha: string) => sha.slice(0, 7);
  const bloque = (tarea: string) => bloqueDeCommits("P", tarea, fasesDe("P"));

  it("consecutivos en la rama: el rango para auditar", async () => {
    const { tarea, dirs } = instalacion({ lotes: "2" });
    const a = commitEn(dirs.api!, ["src/l1.ts"], "fix(calculo): total");
    await registrar(contenido(1, { commit: a }));
    const b = commitEn(dirs.api!, ["src/l2.ts"], "feat(filtros): categoría");
    await registrar(contenido(2, { commit: b }));

    const texto = (await bloque(tarea))!;
    assert.equal(
      texto,
      [
        "## COMMITS DE LA FASE 4 (verificados por el servidor al entregar este prompt)",
        "",
        "### Repo `api` (rama main)",
        "| Lote | Commit | Asunto | Vigente |",
        "|---|---|---|---|",
        `| L01 | \`${corto(a)}\` | fix(calculo): total | sí |`,
        `| L02 | \`${corto(b)}\` | feat(filtros): categoría | sí |`,
        "",
        `Son consecutivos en la rama. Rango para auditar: \`git log --oneline ${corto(a)}^..${corto(b)}\` y \`git diff ${corto(a)}^ ${corto(b)}\`.`,
      ].join("\n")
    );
  });

  it("no consecutivos: un commit en medio que no es de ningún lote", async () => {
    const { tarea, dirs } = instalacion({ lotes: "2" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    commitEn(dirs.api!, ["otro.txt"], "chore: algo suelto");
    await registrar(contenido(2, { commit: commitEn(dirs.api!, ["src/l2.ts"]) }));
    assert.match((await bloque(tarea))!, /No son consecutivos: audita cada commit con `git show <sha>` \(`[0-9a-f]{7}`, `[0-9a-f]{7}`\)\./);
  });

  it("desde el primer commit del repo (sin padre)", async () => {
    const { tarea, dirs } = instalacion({ lotes: "2", sinGit: ["api"] });
    g(dirs.api!, "init", "-q");
    const a = commitEn(dirs.api!, ["src/l1.ts"]);
    await registrar(contenido(1, { commit: a }));
    const b = commitEn(dirs.api!, ["src/l2.ts"]);
    await registrar(contenido(2, { commit: b }));
    assert.match((await bloque(tarea))!, new RegExp(`desde el primer commit del repo\\. Rango para auditar: \`git log --oneline ${corto(b)}\``));
  });

  it("dos repos, cada uno con su sección, y los artefactos sellados aparte", async () => {
    const { tarea, dirs, docs } = instalacion({ lotes: "3", repos: [{ id: "api", dir: "api" }, { id: "web", dir: "web" }], commits: "agente-commitea-con-OK" });
    await registrar(contenido(1, { repo: "api", commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    await registrar(contenido(2, { repo: "web", commit: commitEn(dirs.web!, ["src/l2.ts"]) }));
    // El lote 3 es de un proyecto con un archivo sellado: un repo sin git.
    fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, repos: [{ id: "api", dir: "api" }, { id: "web", dir: "web" }, { id: "docs", dir: "docs-sin-git" }] }), "utf-8");
    fs.mkdirSync(path.join(process.env.PHASE_GATE_REPOS_PATH!, "docs-sin-git"));
    fs.writeFileSync(path.join(process.env.PHASE_GATE_REPOS_PATH!, "docs-sin-git", "guia.md"), "guía\n", "utf-8");
    await registrar(contenido(3, { repo: "docs", artifact_path: "guia.md" }));

    const texto = (await bloque(tarea))!;
    assert.match(texto, /### Repo `api` \(rama main\)\n[\s\S]*Rango para auditar: `git show [0-9a-f]{7}`\./);
    assert.match(texto, /### Repo `web` \(rama main\)/);
    assert.match(texto, /### Sin commit\n\| Lote \| Ancla \| Vigente \|\n\|---\|---\|---\|\n\| L03 \| sha256 `[0-9a-f]{8}…` de `repo:docs\/guia\.md` \| sí \|/);
    assert.doesNotMatch(texto, /Hay anclas que ya no corresponden/);
  });

  it("un ancla que ya no está en la rama dice por qué, y el bloque acaba avisando", async () => {
    const { tarea, dirs } = instalacion({ lotes: "1" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    g(dirs.api!, "commit", "-q", "--amend", "-m", "reescrito");
    const texto = (await bloque(tarea))!;
    assert.match(texto, /\| L01 \| `[0-9a-f]{7}` \| feat\(x\): lote \| no: El commit `[0-9a-f]{7}` ya no está en la rama actual/);
    assert.match(texto, /Audita cada commit vigente con `git show <sha>`\./);
    assert.ok(texto.endsWith("Hay anclas que ya no corresponden a la rama: díselo al usuario antes de auditar."));
  });

  it("los lotes descartados, fallidos o sin recibo se listan aparte", async () => {
    const { tarea, dirs } = instalacion({ lotes: "3" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    await registrar(contenido(2, { estado: "fallido", verification_note: "la suite no pasa" }));
    const texto = (await bloque(tarea))!;
    assert.match(texto, /### Lotes que no entran en la auditoría\n- L02: fallido \(«la suite no pasa»\)\.\n- L03: sin recibo\./);
  });

  it("sin recibos no hay bloque", async () => {
    const { tarea } = instalacion();
    assert.equal(await bloque(tarea), null);
  });

  it("get_phase_prompt(5) lo añade al final, y la 4 no", async () => {
    const { dirs } = instalacion({ lotes: "1" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    const { cliente, cerrar } = await conectar();
    try {
      const fase5 = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 5, project: "P", task_name: "t" } }));
      assert.match(fase5, /\n## COMMITS DE LA FASE 4 \(verificados por el servidor al entregar este prompt\)\n\n### Repo `api` \(rama main\)/);
      const fase4 = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 4, project: "P", task_name: "t" } }));
      assert.doesNotMatch(fase4, /COMMITS DE LA FASE/);
    } finally {
      await cerrar();
    }
  });
});

// ─── Pulido ─────────────────────────────────────────────────────────────────
describe("pulido: record_batch y el bloque de la Fase 5", () => {
  it("al anclar un recibo de la 2.x sin repo, vale el único repo de la tarea", async () => {
    const { recibos, dirs } = instalacion({ lotes: "2" });
    fs.mkdirSync(recibos, { recursive: true });
    fs.writeFileSync(path.join(recibos, "L01 - a mano.md"), "---\nlote: L01\nestado: verificado\ncommit: pendiente\n---\n# L01 — a mano\n", "utf-8");
    const r = await registrar({ lote: 1, commit: commitEn(dirs.api!, ["src/l1.ts"]) });
    assert.equal(r.salida.ancla.tipo, "commit");
    assert.match(r.salida.ancla.resumen, / en `api` \(main\)$/);
  });

  it("un lote con el commit pendiente se descarta con su estado y una nota, sin repetir el contenido", async () => {
    const { recibos } = instalacion({ lotes: "2" });
    await registrar(contenido(1, { que_se_hizo: "lo que se hizo" }));
    const r = await registrar({ lote: 1, estado: "descartado", verification_note: "el usuario no hará el commit" });
    assert.deepEqual([r.salida.estado, r.salida.ancla.resumen], ["descartado", "nota: el usuario no hará el commit"]);
    const recibo = leerRecibo(path.join(recibos, recibosEn(recibos)[0]!));
    assert.deepEqual([recibo.estado, recibo.queSeHizo], ["descartado", "lo que se hizo"]);
    assert.equal((await registrar(contenido(2))).salida.lote, "L02", "el siguiente ya no está bloqueado");
  });

  it("un plan sin `lotes` propone el número de filas de su tabla", async () => {
    const { tarea } = instalacion({ lotes: null });
    fs.writeFileSync(path.join(tarea, "03 - Plan Técnico.md"), "# Plan\n\n| Lote | Repo | Objetivo |\n|---|---|---|\n| L01 | api | a |\n| L02 | api | b |\n| L03 | api | c |\n", "utf-8");
    await assert.rejects(registrar(contenido(1)), /Su tabla de lotes tiene 3 filas: ¿es `lotes: 3`\?/);
  });

  it("un error de escritura sale legible y sin el temporal", () => {
    const error = traducirEscritura(Object.assign(new Error("EPERM: operation not permitted, rename 'x.tmp' -> 'y'"), { code: "EPERM" }), "L01 - lote 1.md");
    assert.equal(error.message, "No se pudo escribir `L01 - lote 1.md`: es de solo lectura o lo tiene abierto otro programa (EPERM). Quita la protección o ciérralo, y vuelve a llamar.");
    assert.doesNotMatch(error.message, /\.tmp/);
  });

  it("si no se pueden leer los recibos, el bloque de la Fase 5 lo dice en vez de desaparecer", async () => {
    const { tarea, recibos } = instalacion({ lotes: "1" });
    fs.mkdirSync(recibos, { recursive: true });
    fs.writeFileSync(path.join(recibos, "L01 - binario.md"), Buffer.from([0, 1, 2, 0, 3]));
    const texto = (await bloqueDeCommits("P", tarea, fasesDe("P")))!;
    assert.match(texto, /^## COMMITS DE LA FASE 4\n\nNo se pudieron leer los recibos: No se pudo leer el recibo `04 - Ejecución\/L01 - binario\.md`/);
  });

  it("si vence el plazo, el bloque de la Fase 5 lleva el mismo encabezado y lo dice", async () => {
    const { tarea, dirs } = instalacion({ lotes: "1" });
    await registrar(contenido(1, { commit: commitEn(dirs.api!, ["src/l1.ts"]) }));
    const texto = await bloqueDeCommitsConPlazo("P", tarea, fasesDe("P"), 1);
    assert.match(texto!, /^## COMMITS DE LA FASE 4\n\nNo se pudieron verificar a tiempo/);
  });

  it("un artefacto que no existe se nombra por su ruta relativa, no por la del equipo", async () => {
    instalacion({ sinGit: ["api"] });
    await assert.rejects(registrar(contenido(1, { artifact_path: "no-esta.md" })), (e: Error) => e.message === "El artefacto `repo:api/no-esta.md` no existe.");
  });
});

describe("la escritura atómica: el renombrado se reintenta en Windows", () => {
  const ocupado = (codigo: string): Error => Object.assign(new Error(codigo), { code: codigo });

  it("un EPERM, EACCES o EBUSY pasajero se reintenta hasta que sale", () => {
    for (const codigo of ["EPERM", "EACCES", "EBUSY"]) {
      let intentos = 0;
      renombrarConReintentos("a", "b", () => {
        intentos++;
        if (intentos < 3) throw ocupado(codigo);
      }, [1, 1, 1], true);
      assert.equal(intentos, 3, codigo);
    }
  });

  it("si sigue ocupado tras las esperas, lanza el último error; y otro error, o fuera de Windows, no se reintenta", () => {
    let intentos = 0;
    assert.throws(() => renombrarConReintentos("a", "b", () => { intentos++; throw ocupado("EPERM"); }, [1, 1], true), /EPERM/);
    assert.equal(intentos, 3, "el primero y uno por cada espera");

    intentos = 0;
    assert.throws(() => renombrarConReintentos("a", "b", () => { intentos++; throw ocupado("ENOENT"); }, [1, 1], true), /ENOENT/);
    assert.equal(intentos, 1);

    intentos = 0;
    assert.throws(() => renombrarConReintentos("a", "b", () => { intentos++; throw ocupado("EACCES"); }, [1, 1], false), /EACCES/);
    assert.equal(intentos, 1, "en macOS y Linux un EACCES es un permiso, no un lector");
  });
});
