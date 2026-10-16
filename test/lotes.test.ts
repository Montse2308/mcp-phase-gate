// record_batch (§6.4 del plan maestro v3): cada fila de sus tablas, los dos tiempos, las tres anclas y
// la carrera entre dos ventanas, con tareas y repos de git reales en carpetas temporales.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { fijarRaizDelPaquete } from "../src/config.js";
import { registrarLote } from "../src/lotes.js";
import type { EntradaDeLote } from "../src/lotes.js";
import { leerRecibo } from "../src/recibos.js";
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
  it("un plan sin `lotes` es un error (H3)", async () => {
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
