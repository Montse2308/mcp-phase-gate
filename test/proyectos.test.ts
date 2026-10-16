// Prompts, reglas y deducción de fase por proyecto (§5.2.3 y §5.4 del plan maestro v3): qué preset y
// qué reglas gana, qué capas entran, qué dice el bloque CONFIGURACIÓN DEL PROYECTO, y cómo lo usan
// las tools.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { leerBloques } from "../src/bloques.js";
import { bloqueDeConfiguracion, capasDe, configuracionDe, contextoInicialDe, ensamblarFase, fasesDe, frontmatterDeTarea, revisarBloques } from "../src/capas.js";
import { fijarRaizDelPaquete } from "../src/config.js";
import { conectar, textoDe } from "./cliente.js";
import { carpetaTemporal, configTemporal, crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTEXTO = "00 - Contexto Inicial.md";

afterEach(() => {
  limpiarEntorno();
  fijarRaizDelPaquete(null);
});

// Una instalación con los prompts de fábrica de verdad (la raíz del paquete apunta al repo), un
// proyecto y una tarea activa.
function instalacion(manifiesto?: unknown): { docs: string; config: string; tarea: string; repos: string } {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  const repos = carpetaTemporal("repos");
  process.env.PHASE_GATE_REPOS_PATH = repos;
  estadoTemporal();
  const config = configTemporal();
  crearProyecto(docs, "PROYECTO-A");
  const tarea = crearTarea(docs, "PROYECTO-A", "tarea-a", [CONTEXTO]);
  if (manifiesto !== undefined) {
    fs.writeFileSync(path.join(docs, "PROYECTO-A", "phase-gate.json"), JSON.stringify(manifiesto), "utf-8");
  }
  return { docs, config, tarea, repos };
}

function presetDeUsuario(config: string, nombre: string, contenido: string): string {
  fs.mkdirSync(path.join(config, "presets"), { recursive: true });
  const ruta = path.join(config, "presets", `${nombre}.md`);
  fs.writeFileSync(ruta, contenido, "utf-8");
  return ruta;
}

function maquina(config: string, contenido: unknown): void {
  fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify(contenido), "utf-8");
}

describe("configuracionDe: el preset efectivo", () => {
  it("sin manifiesto ni machine.json: software, por defecto", () => {
    instalacion();
    const config = configuracionDe("PROYECTO-A");

    assert.deepEqual([config.preset.nombre, config.origenPreset, config.manifiesto], ["software", "por defecto", null]);
    assert.deepEqual([config.reglas.lotes, config.reglas.commits], [true, "agente-commitea-con-OK"]);
    assert.deepEqual(config.reglas.origen, { lotes: "del preset", commits: "del preset" });
  });

  it("tarea > proyecto > machine.json > software", () => {
    const { config, tarea } = instalacion();
    presetDeUsuario(config, "de-maquina", "---\nnombre: de-maquina\n---\n");
    presetDeUsuario(config, "del-proyecto", "---\nnombre: del-proyecto\n---\n");
    presetDeUsuario(config, "de-tarea", "---\nnombre: de-tarea\n---\n");

    maquina(config, { version: 1, presetPorDefecto: "de-maquina" });
    assert.deepEqual([configuracionDe("PROYECTO-A").preset.nombre, configuracionDe("PROYECTO-A").origenPreset], ["de-maquina", "de machine.json"]);
    assert.equal(configuracionDe(null).preset.nombre, "de-maquina", "sin proyecto también vale machine.json");

    fs.writeFileSync(path.join(path.dirname(path.dirname(tarea)), "phase-gate.json"), JSON.stringify({ version: 1, preset: "del-proyecto" }), "utf-8");
    assert.deepEqual([configuracionDe("PROYECTO-A", tarea).preset.nombre, configuracionDe("PROYECTO-A").origenPreset], ["del-proyecto", "del proyecto"]);

    fs.writeFileSync(path.join(tarea, CONTEXTO), "---\npreset: de-tarea\n---\nel requerimiento", "utf-8");
    const deTarea = configuracionDe("PROYECTO-A", tarea);
    assert.deepEqual([deTarea.preset.nombre, deTarea.origenPreset], ["de-tarea", "de la tarea"]);
  });

  it("las reglas: manifiesto > frontmatter del preset > fábrica", () => {
    const { config } = instalacion({ version: 1, preset: "mio", reglas: { commits: "auto" } });
    presetDeUsuario(config, "mio", "---\nlotes: false\ncommits: ninguno\n---\n");

    const reglas = configuracionDe("PROYECTO-A").reglas;
    assert.deepEqual([reglas.lotes, reglas.commits], [false, "auto"]);
    assert.deepEqual(reglas.origen, { lotes: "del preset", commits: "del proyecto" });
  });

  it("un preset que no existe, venga de donde venga, es un error con la lista", () => {
    const { config, tarea } = instalacion();
    maquina(config, { version: 1, presetPorDefecto: "no-existe" });
    assert.throws(() => configuracionDe("PROYECTO-A"), /No existe el preset "no-existe" \(de machine\.json\)\. Los disponibles son: .*software/);

    fs.rmSync(path.join(config, "machine.json"));
    fs.writeFileSync(path.join(tarea, CONTEXTO), "---\npreset: tampoco\n---\nx", "utf-8");
    assert.throws(() => configuracionDe("PROYECTO-A", tarea), /No existe el preset "tampoco" \(de la tarea\)/);
  });

  it("un manifiesto inválido no cae a los valores por defecto: lanza con la ruta del problema", () => {
    instalacion({ version: 1, repos: [{ id: "api", dir: "/absoluta" }] });

    assert.throws(() => configuracionDe("PROYECTO-A"), /phase-gate\.json de PROYECTO-A no es válido .*repos\[0\]\.dir/);
    assert.throws(() => fasesDe("PROYECTO-A"), /repos\[0\]\.dir/);
  });
});

describe("un machine.json roto solo afecta a quien lo necesita (hallazgo 7 de la auditoría de la Etapa 3)", () => {
  it("un proyecto con manifiesto sin repos sigue funcionando; uno sin manifiesto falla explícito", async () => {
    const { docs, config } = instalacion({ version: 1, preset: "software-tdd" });
    crearProyecto(docs, "SIN-MANIFIESTO");
    crearTarea(docs, "SIN-MANIFIESTO", "t", [CONTEXTO]);
    fs.writeFileSync(path.join(config, "machine.json"), "{ roto", "utf-8");

    const { cliente, cerrar } = await conectar();
    try {
      const conManifiesto = await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 3, project: "PROYECTO-A" } });
      assert.equal(conManifiesto.isError, undefined, textoDe(conManifiesto));
      assert.ok(textoDe(conManifiesto).includes("- Preset: `software-tdd` (del proyecto)"));

      const sinManifiesto = await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 3, project: "SIN-MANIFIESTO" } });
      assert.equal(sinManifiesto.isError, true);
      assert.match(textoDe(sinManifiesto), /machine\.json no es válido/);
    } finally {
      await cerrar();
    }
  });

  it("una ruta relativa en machine.json es inválida (hallazgo 17)", () => {
    const { config } = instalacion();
    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, repos: { "PROYECTO-A/api": "relativo/x" } }), "utf-8");

    assert.throws(() => configuracionDe(null), /repos\.PROYECTO-A\/api: tiene que ser una ruta absoluta/);
  });
});

describe("get_phase_prompt sin proyecto lo dice (hallazgo 8 de la auditoría de la Etapa 3)", () => {
  it("sin project, o con uno que no existe, una nota dice qué preset se usa; con project, no hay nota", async () => {
    const { config } = instalacion();
    presetDeUsuario(config, "de-maquina", "---\nnombre: de-maquina\n---\n");
    maquina(config, { version: 1, presetPorDefecto: "de-maquina" });
    const { cliente, cerrar } = await conectar();
    try {
      const sin = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 1 } }));
      assert.match(sin, /> Nota del servidor: no se indicó `project` ni se pudo deducir de la carpeta abierta, así que este prompt usa el preset `de-maquina` \(de machine\.json\) y no lleva la configuración de ningún proyecto/);

      const noExiste = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 1, project: "NO-EXISTE" } }));
      assert.match(noExiste, /> Nota del servidor: no existe el proyecto «NO-EXISTE»/);

      const con = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 1, project: "PROYECTO-A" } }));
      assert.equal(con.includes("Nota del servidor"), false);
    } finally {
      await cerrar();
    }
  });

  it("un project vacío explícito se rechaza en start_task y switch_task (hallazgo 15)", async () => {
    instalacion();
    const { cliente, cerrar } = await conectar();
    try {
      for (const [tool, args] of [
        ["switch_task", { project: "   ", task_name: "tarea-a" }],
        ["start_task", { project: "", task_name: "x", initial_context: "y" }],
      ] as const) {
        const r = await cliente.callTool({ name: tool, arguments: args });
        assert.equal(r.isError, true, tool);
        assert.match(textoDe(r), /`project` no puede ir vacío/);
      }
    } finally {
      await cerrar();
    }
  });
});

describe("frontmatterDeTarea", () => {
  it("lee repos en las dos formas y el preset; sin frontmatter, nada", () => {
    const carpeta = carpetaTemporal("tarea");
    const leer = (texto: string) => {
      fs.writeFileSync(path.join(carpeta, CONTEXTO), texto, "utf-8");
      return frontmatterDeTarea(carpeta, CONTEXTO);
    };

    assert.deepEqual(leer("---\nrepos: api, web\npreset: ai-agent-ops\n---\nreq"), { repos: ["api", "web"], preset: "ai-agent-ops" });
    assert.deepEqual(leer("---\r\nrepos: [api, \"web\"]\r\n---\r\nreq"), { repos: ["api", "web"], preset: null });
    assert.deepEqual(leer("solo el requerimiento"), { repos: null, preset: null });
  });
});

describe("capasDe con preset y reglas", () => {
  it("el preset va en la capa 2 y las variantes de regla en la 2.5, entre la fábrica y la global", () => {
    const { config } = instalacion({ version: 1, preset: "mio", reglas: { lotes: false, commits: "agente-propone" } });
    const preset = presetDeUsuario(config, "mio", "---\n---\n");

    assert.deepEqual(
      capasDe("PROYECTO-A").map((c) => [c.orden, c.etiqueta, path.basename(c.ruta)]),
      [
        [1, "fábrica", "es"],
        [2, "preset", path.basename(preset)],
        [2.5, "reglas", "commits-agente-propone.md"],
        [2.5, "reglas", "sin-lotes.md"],
        [4, "proyecto", "prompts"],
      ]
    );
  });

  for (const [politica, fragmento] of [
    ["agente-propone", "Política: **el agente propone el commit; el usuario lo hace.**"],
    ["auto", "Política: **el agente hace el commit en cuanto el lote pasa su verificación**, sin esperar OK."],
    ["ninguno", "Política: **sin commits por lote.**"],
  ] as const) {
    it(`commits: ${politica} cambia la sección COMMITS de la Fase 4 y nada más`, () => {
      instalacion({ version: 1, reglas: { commits: politica } });
      const base = ensamblarFase(4, null).texto;
      const { texto, avisos } = ensamblarFase(4, "PROYECTO-A", null, { incluirConfigProyecto: false });

      assert.deepEqual(avisos, []);
      assert.ok(texto.includes(fragmento));
      assert.equal(texto.includes("Política: **el agente hace el commit con el OK del usuario.**"), false);
      assert.equal(texto.includes("<!--"), false);
      const despuesDeCommits = (t: string) => t.slice(t.indexOf("\n## PROHIBIDO"));
      assert.equal(despuesDeCommits(texto), despuesDeCommits(base), "lo que sigue a COMMITS no cambia");
    });
  }

  it("lotes: false cambia LOTES en las Fases 3 y 4", () => {
    instalacion({ version: 1, reglas: { lotes: false } });

    const fase3 = ensamblarFase(3, "PROYECTO-A").texto;
    const fase4 = ensamblarFase(4, "PROYECTO-A").texto;
    assert.ok(fase3.includes("## LOTES\nEste proyecto no trabaja por lotes."));
    assert.ok(fase4.includes("El plan tiene un solo lote (`lotes: 1`)"));
    assert.ok(fase4.includes("lote: L01\nde: 1\n"));
    assert.ok(fase4.includes("- Lotes: no · Commits: agente-commitea-con-OK"));
  });
});

describe("variantes de regla publicadas", () => {
  const carpeta = path.join(RAIZ, "prompts", "es", "reglas");
  for (const archivo of fs.readdirSync(carpeta).filter((nombre) => nombre.endsWith(".md")).sort()) {
    it(`reglas/${archivo} está bien formada y todos sus bloques encajan en una ranura de fábrica`, () => {
      const fabrica = { orden: 1 as const, etiqueta: "fábrica" as const, ruta: path.join(RAIZ, "prompts", "es") };
      const variante = { orden: 2.5 as const, etiqueta: "reglas" as const, ruta: path.join(carpeta, archivo) };

      assert.deepEqual(revisarBloques([fabrica, variante]), []);
      assert.ok(leerBloques(variante.ruta, variante).bloques.length > 0, "no tiene ningún bloque");
    });
  }
});

describe("fasesDe y contextoInicialDe", () => {
  it("un proyecto que sustituye una fase con otro documento se deduce con ese nombre", () => {
    const { docs } = instalacion();
    const capa = path.join(docs, "PROYECTO-A", ".phase-gate", "prompts");
    fs.mkdirSync(capa, { recursive: true });
    fs.writeFileSync(path.join(capa, "fase-2-mia.md"), "---\ndocumento: 02 - Mis decisiones.md\n---\n# Mías\n", "utf-8");

    assert.equal(fasesDe("PROYECTO-A").get(2)?.documento, "02 - Mis decisiones.md");
    assert.equal(fasesDe(null).get(2)?.documento, "02 - Decisiones.md");
    assert.equal(contextoInicialDe("PROYECTO-A"), CONTEXTO);
  });
});

describe("bloqueDeConfiguracion", () => {
  it("sin manifiesto lo dice, sin repos ni verificación", () => {
    instalacion();
    assert.equal(
      bloqueDeConfiguracion(configuracionDe("PROYECTO-A")),
      [
        "## CONFIGURACIÓN DEL PROYECTO",
        "",
        "- Preset: `software` (por defecto; este proyecto no tiene phase-gate.json) · Idioma: es",
        "- Lotes: sí · Commits: agente-commitea-con-OK",
      ].join("\n")
    );
  });

  it("con manifiesto: repos de la tarea con su ruta, verificación y PR por repo", () => {
    const { tarea, repos, config } = instalacion({
      version: 1,
      repos: [
        { id: "api", dir: "backend-api", rol: "backend" },
        { id: "web", dir: "frontend-web" },
        { id: "docs", dir: "docs" },
      ],
      reglas: { verificacion: ["npm test", "npm run lint"] },
      fase5: { prPorRepo: true },
    });
    fs.mkdirSync(path.join(repos, "backend-api"));
    const enOtroSitio = carpetaTemporal("web");
    maquina(config, { version: 1, repos: { "proyecto-a/web": enOtroSitio } });
    fs.writeFileSync(path.join(tarea, CONTEXTO), "---\nrepos: api, web\n---\nreq", "utf-8");

    assert.equal(
      bloqueDeConfiguracion(configuracionDe("PROYECTO-A", tarea)),
      [
        "## CONFIGURACIÓN DEL PROYECTO (la declara phase-gate.json)",
        "",
        "- Preset: `software` (del proyecto) · Idioma: es",
        "- Lotes: sí · Commits: agente-commitea-con-OK",
        "- Repositorios de esta tarea:",
        `  - \`api\` (backend): \`${path.join(repos, "backend-api")}\``,
        `  - \`web\`: \`${enOtroSitio}\``,
        "- Comandos de verificación del proyecto: `npm test`, `npm run lint`",
        "- Una descripción de PR por repositorio (fase5.prPorRepo).",
        "",
        "Usa `read_repo_file` y `repo_status` con estos ids.",
      ].join("\n")
    );
  });

  it("un repo que no está en este equipo lo dice", () => {
    const { repos } = instalacion({ version: 1, repos: [{ id: "api", dir: "no-esta" }] });

    assert.ok(bloqueDeConfiguracion(configuracionDe("PROYECTO-A")).includes(`\`${path.join(repos, "no-esta")}\` · no existe en este equipo`));
  });
});

describe("get_phase_prompt por proyecto", () => {
  it("con project añade CONFIGURACIÓN DEL PROYECTO al final; sin project, no", async () => {
    instalacion();
    const { cliente, cerrar } = await conectar();
    try {
      const con = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 3, project: "PROYECTO-A" } }));
      const sin = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 3 } }));

      assert.ok(con.trimEnd().endsWith("- Lotes: sí · Commits: agente-commitea-con-OK"));
      assert.ok(con.indexOf("## ARCHIVOS DE ESTA TAREA") < con.indexOf("## CONFIGURACIÓN DEL PROYECTO"));
      assert.equal(sin.includes("CONFIGURACIÓN DEL PROYECTO"), false);
    } finally {
      await cerrar();
    }
  });

  it("un proyecto sin manifiesto con un presetPorDefecto sin bloques recibe los mismos prompts", async () => {
    const { config } = instalacion();
    const { cliente, cerrar } = await conectar();
    try {
      const antes: string[] = [];
      for (const phase of [1, 2, 3, 4, 5]) antes.push(textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase, project: "PROYECTO-A" } })));

      presetDeUsuario(config, "vacio", "---\nnombre: vacio\nlotes: true\ncommits: agente-commitea-con-OK\n---\nSin bloques.\n");
      maquina(config, { version: 1, presetPorDefecto: "vacio" });
      for (const phase of [1, 2, 3, 4, 5]) {
        const despues = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase, project: "PROYECTO-A" } }));
        const sinConfig = (t: string) => t.slice(0, t.indexOf("## CONFIGURACIÓN DEL PROYECTO"));
        assert.equal(sinConfig(despues), sinConfig(antes[phase - 1]!), `fase ${phase}`);
        assert.ok(despues.includes("- Preset: `vacio` (de machine.json)"));
      }
    } finally {
      await cerrar();
    }
  });

  it("antepone una nota por cada bloque huérfano de la fase que entrega", async () => {
    const { docs } = instalacion();
    const capa = path.join(docs, "PROYECTO-A", ".phase-gate", "prompts");
    fs.mkdirSync(capa, { recursive: true });
    fs.writeFileSync(path.join(capa, "bloques.md"), "<!-- bloque: fase-3/verificaion -->\nx\n<!-- /bloque -->\n", "utf-8");

    const { cliente, cerrar } = await conectar();
    try {
      const texto = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 3, project: "PROYECTO-A" } }));
      assert.match(texto, /\n\n> Nota del servidor: el bloque «fase-3\/verificaion» de .*bloques\.md:1 no encaja en ninguna ranura y se ignoró\.\n\n## REGLA GLOBAL/);

      const otra = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 2, project: "PROYECTO-A" } }));
      assert.equal(otra.includes("Nota del servidor"), false);
    } finally {
      await cerrar();
    }
  });

  it("un manifiesto inválido es un error, no el prompt de fábrica", async () => {
    instalacion({ version: 1, preset: "no-existe" });
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 1, project: "PROYECTO-A" } });
      assert.equal(r.isError, true);
      assert.match(textoDe(r), /no existe el preset "no-existe"/);
    } finally {
      await cerrar();
    }
  });

  it("el preset que declara la tarea activa se usa en sus prompts", async () => {
    const { config, tarea } = instalacion();
    presetDeUsuario(config, "de-tarea", "<!-- bloque: fase-1/rol -->\nEres de la tarea.\n<!-- /bloque -->\n");
    fs.writeFileSync(path.join(tarea, CONTEXTO), "---\npreset: de-tarea\n---\nreq", "utf-8");

    const { cliente, cerrar } = await conectar();
    try {
      const texto = textoDe(await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 1, project: "PROYECTO-A" } }));
      assert.ok(texto.includes("Eres de la tarea."));
      assert.ok(texto.includes("- Preset: `de-tarea` (de la tarea)"));
    } finally {
      await cerrar();
    }
  });
});

describe("start_task con repos y preset", () => {
  const MANIFIESTO = { version: 1, repos: [{ id: "api", dir: "a" }, { id: "web", dir: "w" }] };

  async function iniciar(argumentos: Record<string, unknown>) {
    const { cliente, cerrar } = await conectar();
    try {
      return await cliente.callTool({ name: "start_task", arguments: { project: "PROYECTO-A", task_name: "nueva", initial_context: "el req", ...argumentos } });
    } finally {
      await cerrar();
    }
  }

  it("escribe el frontmatter con los repos y el preset elegidos", async () => {
    const { docs } = instalacion(MANIFIESTO);
    const r = await iniciar({ repos: ["web", "api", "web"], preset: "software" });

    assert.equal(r.isError, undefined, textoDe(r));
    assert.equal(
      fs.readFileSync(path.join(docs, "PROYECTO-A", "Proyectos", "nueva", CONTEXTO), "utf-8"),
      "---\nrepos: web, api\npreset: software\n---\nel req"
    );
  });

  it("sin repos ni preset, el contexto inicial queda tal cual", async () => {
    const { docs } = instalacion(MANIFIESTO);
    await iniciar({ repos: null, preset: null });

    assert.equal(fs.readFileSync(path.join(docs, "PROYECTO-A", "Proyectos", "nueva", CONTEXTO), "utf-8"), "el req");
  });

  for (const [caso, manifiesto, argumentos, motivo] of [
    ["un repo que no está en el manifiesto", MANIFIESTO, { repos: ["api", "movil"] }, /"movil" no es un repo del phase-gate\.json de PROYECTO-A\. Los válidos son: api, web\./],
    ["repos en un proyecto sin repos declarados", undefined, { repos: ["api"] }, /no declara repos en su phase-gate\.json/],
    ["un preset que no existe", MANIFIESTO, { preset: "inventado" }, /No existe el preset "inventado"\. Los disponibles son: .*software/],
  ] as const) {
    it(`rechaza ${caso} sin crear nada`, async () => {
      const { docs } = instalacion(manifiesto);
      const r = await iniciar(argumentos);

      assert.equal(r.isError, true);
      assert.match(textoDe(r), motivo);
      assert.equal(fs.existsSync(path.join(docs, "PROYECTO-A", "Proyectos", "nueva")), false);
    });
  }
});

describe("tools con las fases de su proyecto", () => {
  it("write_central_doc protege el documento que declara la fase del proyecto", async () => {
    const { docs, tarea } = instalacion();
    const capa = path.join(docs, "PROYECTO-A", ".phase-gate", "prompts");
    fs.mkdirSync(capa, { recursive: true });
    fs.writeFileSync(path.join(capa, "fase-1-mia.md"), "---\ndocumento: 01 - Mío.md\ndocumento_inicial: 00 - Contexto Inicial.md\n---\n# Mía\n", "utf-8");
    fs.writeFileSync(path.join(tarea, "01 - Mío.md"), "análisis", "utf-8");
    fs.writeFileSync(path.join(tarea, "02 - Decisiones.md"), "decisiones", "utf-8");

    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({
        name: "write_central_doc",
        arguments: { project: "PROYECTO-A", task_name: "tarea-a", file_name: "01 - Mío.md", content: "otro" },
      });
      assert.equal(r.isError, true);
      assert.match(textoDe(r), /`01 - Mío\.md` está congelado/);
    } finally {
      await cerrar();
    }
  });

  it("list_tasks sin proyecto lista los demás aunque uno tenga el manifiesto roto; con ese proyecto, es un error", async () => {
    const { docs } = instalacion("{ roto");
    crearProyecto(docs, "PROYECTO-B");
    crearTarea(docs, "PROYECTO-B", "tarea-b", [CONTEXTO]);

    const { cliente, cerrar } = await conectar();
    try {
      const todos = textoDe(await cliente.callTool({ name: "list_tasks", arguments: {} }));
      assert.match(todos, /PROYECTO-A: no se pudo leer su configuración\. phase-gate\.json de PROYECTO-A no es válido/);
      assert.match(todos, /PROYECTO-B \(1\)/);

      const uno = await cliente.callTool({ name: "list_tasks", arguments: { project: "PROYECTO-A" } });
      assert.equal(uno.isError, true);
    } finally {
      await cerrar();
    }
  });

  it("prompts/get con project toma el comandos/fN.md del proyecto", async () => {
    const { docs } = instalacion();
    const capa = path.join(docs, "PROYECTO-A", ".phase-gate", "prompts", "comandos");
    fs.mkdirSync(capa, { recursive: true });
    fs.writeFileSync(path.join(capa, "f4.md"), "Mi comando de la Fase 4.", "utf-8");

    const { cliente, cerrar } = await conectar();
    try {
      const conProyecto = await cliente.getPrompt({ name: "f4", arguments: { project: "PROYECTO-A" } });
      const sinProyecto = await cliente.getPrompt({ name: "f4", arguments: {} });
      const texto = (r: typeof conProyecto) => (r.messages[0]?.content as { text: string }).text;

      assert.ok(texto(conProyecto).startsWith("Mi comando de la Fase 4."));
      assert.equal(texto(sinProyecto).includes("Mi comando"), false);
    } finally {
      await cerrar();
    }
  });
});
