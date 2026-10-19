// El idioma de cada proyecto y el de la redacción de cada tarea (§8.3 del plan maestro v3).
//
// El idioma del sistema se fija con fijarLocaleDelSistema y no con LANG: en Windows, Intl sigue a la
// configuración regional e ignora LANG (validación V9), y así el mismo test vale en los dos sistemas.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { ensamblarFase } from "../src/capas.js";
import { fijarLocaleDelSistema, fijarRaizDelPaquete, idiomaDeEtiqueta, idiomaDelSistema } from "../src/config.js";
import { diagnosticar } from "../src/diagnostico.js";
import { enIdioma } from "../src/i18n/mensajes.js";
import { idiomaParaManifiesto, manifiestoNuevo } from "../src/init.js";
import { Manifiesto, conCacheDelIdioma, conflictoDeIdioma, documentosPorIdioma, idiomaDelEquipo, idiomaDelProyecto, leerManifiesto } from "../src/manifiesto.js";
import { textoDelPromptDeFase } from "../src/servidor.js";
import { conectar, textoDe } from "./cliente.js";
import { configTemporal, crearProyecto, crearTarea, docsTemporales, estadoTemporal, limpiarEntorno } from "./helpers.js";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ES = ["00 - Contexto Inicial.md", "01 - Análisis Técnico.md"];
const EN = ["00 - Initial Context.md", "01 - Technical Analysis.md", "02 - Decisions.md"];

afterEach(() => {
  limpiarEntorno();
  fijarLocaleDelSistema(null);
  fijarRaizDelPaquete(null);
});

function instalacion(): { docs: string; config: string } {
  fijarRaizDelPaquete(RAIZ);
  const docs = docsTemporales();
  estadoTemporal();
  const config = configTemporal();
  crearProyecto(docs, "P");
  return { docs, config };
}

function manifiesto(docs: string, contenido: Record<string, unknown>): void {
  fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, ...contenido }), "utf-8");
}

describe("idioma del proyecto: los cinco pasos, en orden", () => {
  it("1. el `idioma` del manifiesto gana a todo lo demás", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "t", ES);
    manifiesto(docs, { idioma: "en" });
    process.env.PHASE_GATE_LANG = "es";
    assert.deepEqual(
      (({ idioma, origen }) => ({ idioma, origen }))(idiomaDelProyecto("P")),
      { idioma: "en", origen: "del proyecto" }
    );
  });

  it("2. sin manifiesto, los documentos en disco ganan al equipo y al sistema (E6-R1)", () => {
    const { docs, config } = instalacion();
    crearTarea(docs, "P", "vieja", ES);
    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, idiomaPorDefecto: "en" }));
    process.env.PHASE_GATE_LANG = "en";
    fijarLocaleDelSistema("en-US");
    const r = idiomaDelProyecto("P");
    assert.equal(r.idioma, "es");
    assert.equal(r.origen, "de sus documentos");
    assert.deepEqual(r.enDisco.es, { documentos: 2, tareas: ["vieja"] });
  });

  it("2. un manifiesto sin `idioma` también deduce del disco", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "t", EN);
    manifiesto(docs, { preset: "software" });
    process.env.PHASE_GATE_LANG = "es";
    assert.equal(idiomaDelProyecto("P").idioma, "en");
  });

  it("3. sin documentos, `idiomaPorDefecto` de machine.json", () => {
    const { config } = instalacion();
    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, idiomaPorDefecto: "en" }));
    process.env.PHASE_GATE_LANG = "es";
    assert.deepEqual((({ idioma, origen }) => ({ idioma, origen }))(idiomaDelProyecto("P")), { idioma: "en", origen: "de machine.json" });
  });

  it("4. después, PHASE_GATE_LANG (también con región: en-GB, es_MX.UTF-8)", () => {
    instalacion();
    process.env.PHASE_GATE_LANG = "en-GB";
    assert.deepEqual((({ idioma, origen }) => ({ idioma, origen }))(idiomaDelProyecto("P")), { idioma: "en", origen: "de PHASE_GATE_LANG" });
    process.env.PHASE_GATE_LANG = "es_MX.UTF-8";
    assert.equal(idiomaDelProyecto("P").idioma, "es");
    // Un valor que no es ninguno de los dos no cuenta: pasa al sistema.
    process.env.PHASE_GATE_LANG = "fr";
    fijarLocaleDelSistema("es-ES");
    assert.deepEqual((({ idioma, origen }) => ({ idioma, origen }))(idiomaDelProyecto("P")), { idioma: "es", origen: "del sistema" });
  });

  it("5. por último, el sistema: «es» si su locale empieza por es; cualquier otro, «en»", () => {
    instalacion();
    delete process.env.PHASE_GATE_LANG;
    for (const [locale, idioma] of [["es-MX", "es"], ["es", "es"], ["en-US", "en"], ["fr-FR", "en"], ["pt-BR", "en"]] as const) {
      fijarLocaleDelSistema(locale);
      assert.equal(idiomaDelSistema(), idioma, locale);
      assert.equal(idiomaDelProyecto("P").idioma, idioma, locale);
      assert.equal(idiomaDelEquipo().origen, "del sistema");
    }
    assert.equal(idiomaDeEtiqueta(" EN_us.UTF-8 "), "en");
    assert.equal(idiomaDeEtiqueta(""), null);
  });

  it("sin proyecto, los pasos del equipo (3 a 5)", () => {
    instalacion();
    process.env.PHASE_GATE_LANG = "en";
    assert.equal(idiomaDelProyecto(null).idioma, "en");
  });

  // Hallazgo 2 de la auditoría de la Etapa 6: un manifiesto de la 3.0 o la 3.1 no lleva `idioma` (su esquema
  // daba "es" por defecto). Sin documentos, no pasa al idioma del sistema, que en un Linux sin LANG es inglés.
  it("5. un manifiesto sin `idioma` ni documentos es español aunque el sistema esté en inglés", () => {
    const { docs, config } = instalacion();
    manifiesto(docs, { preset: "software" });
    delete process.env.PHASE_GATE_LANG;
    fijarLocaleDelSistema("en-US");
    const r = idiomaDelProyecto("P");
    assert.deepEqual([r.idioma, r.origen, r.sinIdiomaDeclarado], ["es", "del manifiesto sin idioma", true]);

    // Lo que alguien fijó a propósito sí cuenta: PHASE_GATE_LANG y machine.json, en ese orden inverso.
    process.env.PHASE_GATE_LANG = "en";
    assert.deepEqual((({ idioma, origen }) => ({ idioma, origen }))(idiomaDelProyecto("P")), { idioma: "en", origen: "de PHASE_GATE_LANG" });
    delete process.env.PHASE_GATE_LANG;
    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, idiomaPorDefecto: "en" }));
    assert.equal(idiomaDelProyecto("P").origen, "de machine.json");

    // Sin manifiesto, el sistema (E6-D5); y quien pasa el manifiesto ya leído obtiene lo mismo.
    fs.rmSync(path.join(config, "machine.json"));
    assert.equal(idiomaDelProyecto("P", { version: 1, preset: "software", repos: [], reglas: {}, fase5: {} }).origen, "del manifiesto sin idioma");
    assert.deepEqual([idiomaDelProyecto("P", null).idioma, idiomaDelProyecto("P", null).origen], ["en", "del sistema"]);
  });
});

describe("idioma del proyecto: conflictos", () => {
  it("IDIOMA-MIXTO: documentos de los dos idiomas sin idioma declarado; gana el que más tiene", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "a", ES);
    crearTarea(docs, "P", "b", EN);
    const r = idiomaDelProyecto("P");
    assert.equal(r.idioma, "en");
    const conflicto = conflictoDeIdioma("P", r);
    assert.equal(conflicto?.codigo, "IDIOMA-MIXTO");
    assert.equal(conflicto?.severidad, "error");
    assert.match(conflicto!.texto, /2 en "es", 3 en "en"/);
  });

  it("a la par, el español (el de todos los proyectos de la 2.x)", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "a", ["00 - Contexto Inicial.md"]);
    crearTarea(docs, "P", "b", ["00 - Initial Context.md"]);
    assert.equal(idiomaDelProyecto("P").idioma, "es");
  });

  it("IDIOMA-CON-TAREAS: el manifiesto dice un idioma y hay tareas en el otro; doctor lo da como error", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "vieja", ES);
    manifiesto(docs, { idioma: "en" });
    const conflicto = conflictoDeIdioma("P");
    assert.equal(conflicto?.codigo, "IDIOMA-CON-TAREAS");
    assert.match(conflicto!.texto, /«vieja»/);
    const hallazgos = diagnosticar().hallazgos.filter((h) => h.codigo.startsWith("IDIOMA-"));
    assert.deepEqual(hallazgos.map((h) => [h.codigo, h.severidad]), [["IDIOMA-CON-TAREAS", "error"]]);
  });

  // El texto sale en el idioma del proyecto (aquí, "en"): la llamada lo resolvió (§8.5).
  it("IDIOMA-CON-TAREAS: get_phase_prompt se niega con el mismo texto, en el idioma del proyecto", async () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "vieja", ES);
    manifiesto(docs, { idioma: "en" });
    await assert.rejects(textoDelPromptDeFase(2, { project: "P", carpetaProyecto: "P", deducido: null }), /IDIOMA-CON-TAREAS/);
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "get_phase_prompt", arguments: { phase: 2, project: "P" } });
      assert.equal(r.isError, true);
      assert.match(textoDe(r), /the task «vieja» has documents in "es".*\(IDIOMA-CON-TAREAS\)$/);
    } finally {
      await cerrar();
    }
  });

  it("MANIFIESTO-SIN-IDIOMA: aviso solo si ni el manifiesto ni los documentos dicen el idioma", () => {
    const { docs } = instalacion();
    manifiesto(docs, { preset: "software" });
    delete process.env.PHASE_GATE_LANG;
    fijarLocaleDelSistema("en-US");
    const conflicto = conflictoDeIdioma("P");
    assert.deepEqual([conflicto?.codigo, conflicto?.severidad], ["MANIFIESTO-SIN-IDIOMA", "aviso"]);
    // Fuera de una llamada, el texto sale en el idioma del entorno: aquí, el del sistema, inglés.
    assert.match(conflicto!.texto, /does not declare "idioma".*"es" is used \(a manifest without idioma is Spanish, as in 3\.0 and 3\.1\).*init --migrate/);
    assert.match(enIdioma("es", () => conflictoDeIdioma("P"))!.texto, /no declara "idioma".*se usa "es" \(un manifiesto sin idioma es español, como en la 3\.0 y la 3\.1\).*init --migrate/);
    const hallazgos = diagnosticar().hallazgos.filter((h) => h.codigo === "MANIFIESTO-SIN-IDIOMA");
    assert.equal(hallazgos.length, 1);

    // Con el idioma declarado, sin manifiesto o con documentos que lo dicen, no hay aviso. (Los documentos van
    // al final: en Node 24 para Windows, rmSync no borra un nombre con acentos.)
    manifiesto(docs, { preset: "software", idioma: "en" });
    assert.equal(conflictoDeIdioma("P"), null);
    fs.rmSync(path.join(docs, "P", "phase-gate.json"));
    assert.equal(conflictoDeIdioma("P"), null);
    manifiesto(docs, { preset: "software" });
    crearTarea(docs, "P", "t", ES);
    assert.equal(conflictoDeIdioma("P"), null);
  });

  // Hallazgo 12 de la auditoría de la Etapa 6: el recuento no depende del sistema de archivos.
  it("el recuento compara en NFC y sin mayúsculas, igual en todos los sistemas", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "minusculas", ["01 - technical analysis.md", "02 - DECISIONS.md"]);
    crearTarea(docs, "P", "nfd", ["01 - Análisis Técnico.md".normalize("NFD")]);
    crearTarea(docs, "P", "ajenos", ["notas.md", "01 - Analisis Tecnico.md"]);
    const cuenta = documentosPorIdioma("P");
    assert.deepEqual(cuenta.en, { documentos: 2, tareas: ["minusculas"] });
    assert.deepEqual(cuenta.es, { documentos: 1, tareas: ["nfd"] });
  });

  // Hallazgo 3 de la auditoría de la Etapa 6: dentro de una llamada, cada proyecto se cuenta una vez.
  it("la caché del recuento vale dentro de una llamada (conCacheDelIdioma) y no fuera", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "a", ["00 - Initial Context.md"]);
    conCacheDelIdioma(() => {
      assert.equal(documentosPorIdioma("P").en.documentos, 1);
      crearTarea(docs, "P", "b", EN);
      assert.equal(documentosPorIdioma("P").en.documentos, 1, "la misma llamada no vuelve a contar");
      // Lo que devuelve es una copia: tocarla no cambia lo guardado.
      documentosPorIdioma("P").en.tareas.push("x");
      assert.deepEqual(documentosPorIdioma("P").en.tareas, ["a"]);
      // Una llamada anidada usa la de fuera.
      assert.equal(conCacheDelIdioma(() => documentosPorIdioma("P").en.documentos), 1);
    });
    assert.equal(documentosPorIdioma("P").en.documentos, 4, "fuera de la llamada, el disco de ahora");
    assert.equal(conCacheDelIdioma(() => documentosPorIdioma("P").en.documentos), 4, "una llamada nueva cuenta otra vez");
  });

  // Hallazgo 4 de la auditoría de la Etapa 6: antes solo se negaba get_phase_prompt.
  it("IDIOMA-CON-TAREAS: start_task, record_batch, get_batch_status y write_central_doc de un documento de fase también se niegan; list_tasks avisa", async () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "vieja", ES);
    manifiesto(docs, { idioma: "en" });
    const { cliente, cerrar } = await conectar();
    try {
      const negada = async (name: string, args: Record<string, unknown>): Promise<void> => {
        const r = await cliente.callTool({ name, arguments: { project: "P", ...args } });
        assert.equal(r.isError, true, name);
        assert.match(textoDe(r), /\(IDIOMA-CON-TAREAS\)$/, name);
      };
      await negada("start_task", { task_name: "nueva", initial_context: "x" });
      assert.equal(fs.existsSync(path.join(docs, "P", "Proyectos", "nueva")), false, "no mezcla nombres de dos idiomas");
      await negada("record_batch", { task_name: "vieja", lote: 1, estado: "verified", que_se_hizo: "x" });
      await negada("get_batch_status", { task_name: "vieja" });
      await negada("write_central_doc", { task_name: "vieja", file_name: "02 - Decisions.md", content: "x" });
      await negada("write_central_doc", { task_name: "vieja", file_name: "02 - decisiones.md", content: "x" });

      // Un archivo que no es un documento de fase sí se escribe: la escotilla para arreglar a mano sigue.
      const notas = await cliente.callTool({ name: "write_central_doc", arguments: { project: "P", task_name: "vieja", file_name: "notas.md", content: "x" } });
      assert.equal(notas.isError, undefined, textoDe(notas));

      const lista = await cliente.callTool({ name: "list_tasks", arguments: { project: "P" } });
      assert.equal(lista.isError, undefined);
      assert.match(textoDe(lista), /^P declares "idioma": "en".*\(IDIOMA-CON-TAREAS\)\n\n/s);
    } finally {
      await cerrar();
    }
  });

  it("sin conflicto: documentos de un solo idioma, el mismo que el declarado", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "t", ES);
    manifiesto(docs, { idioma: "es" });
    assert.equal(conflictoDeIdioma("P"), null);
    assert.deepEqual(documentosPorIdioma("P").en, { documentos: 0, tareas: [] });
  });
});

describe("idioma: manifiesto, init y redacción", () => {
  it("el manifiesto acepta es y en, y nada más", () => {
    assert.equal(Manifiesto.safeParse({ version: 1, idioma: "en" }).success, true);
    assert.equal(Manifiesto.safeParse({ version: 1 }).success, true);
    assert.equal(Manifiesto.safeParse({ version: 1, idioma: "fr" }).success, false);
    const { docs } = instalacion();
    manifiesto(docs, { idioma: "fr" });
    const lectura = leerManifiesto("P");
    assert.equal(lectura.estado, "invalido");
  });

  it("un manifiesto nuevo lleva el idioma de los documentos del proyecto, nunca el del sistema", () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "t", ES);
    assert.equal(idiomaParaManifiesto("P", "en"), "es");
    crearProyecto(docs, "VACIO");
    assert.equal(idiomaParaManifiesto("VACIO", "en"), "en");
    assert.equal(manifiestoNuevo("software", "en"), `{\n  "$schema": "https://unpkg.com/mcp-phase-gate@3/schema/project.json",\n  "version": 1,\n  "preset": "software",\n  "idioma": "en"\n}\n`);
  });

  it("start_task con `redaccion` la deja en el frontmatter; el prompt solo gana una línea, en el idioma del proyecto", async () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "otra", ES);
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "start_task", arguments: { project: "P", task_name: "en-ingles", initial_context: "Add a coupon field.", redaccion: "en" } });
      assert.equal(r.isError, undefined, textoDe(r));
    } finally {
      await cerrar();
    }
    const contexto = fs.readFileSync(path.join(docs, "P", "Proyectos", "en-ingles", "00 - Contexto Inicial.md"), "utf-8");
    assert.equal(contexto, "---\nredaccion: en\n---\nAdd a coupon field.");

    const sin = ensamblarFase(2, "P", path.join(docs, "P", "Proyectos", "otra")).texto;
    const con = ensamblarFase(2, "P", path.join(docs, "P", "Proyectos", "en-ingles")).texto;
    assert.equal(con, `${sin}\n\nEscribe el contenido de los documentos de esta tarea en inglés. Los encabezados, nombres de archivo y claves se mantienen como están.`);
  });

  it("`redaccion` igual al idioma del proyecto no añade nada; un valor que no es es ni en se rechaza", async () => {
    const { docs } = instalacion();
    crearTarea(docs, "P", "a", ES);
    fs.writeFileSync(path.join(docs, "P", "Proyectos", "a", "00 - Contexto Inicial.md"), "---\nredaccion: es\n---\nx");
    crearTarea(docs, "P", "b", ES);
    assert.equal(ensamblarFase(2, "P", path.join(docs, "P", "Proyectos", "a")).texto, ensamblarFase(2, "P", path.join(docs, "P", "Proyectos", "b")).texto);
    const { cliente, cerrar } = await conectar();
    try {
      const r = await cliente.callTool({ name: "start_task", arguments: { project: "P", task_name: "x", initial_context: "y", redaccion: "fr" } });
      assert.equal(r.isError, true);
      assert.match(textoDe(r), /redaccion/);
    } finally {
      await cerrar();
    }
  });
});

describe("idioma sin proyecto: el del equipo", () => {
  it("la capa de fábrica, las fases y los presets sin proyecto siguen al equipo (machine.json, PHASE_GATE_LANG)", async () => {
    const { config } = instalacion();
    const { promptsLayers } = await import("../src/config.js");
    const { fasesDe } = await import("../src/capas.js");
    const { carpetaPresetsDelPaquete } = await import("../src/manifiesto.js");
    process.env.PHASE_GATE_LANG = "en";
    assert.ok(promptsLayers()[0]!.endsWith(path.join("prompts", "en")));
    assert.equal(fasesDe(null).get(1)?.documento, "01 - Technical Analysis.md");
    assert.ok(carpetaPresetsDelPaquete().endsWith(path.join("presets", "en")));
    fs.writeFileSync(path.join(config, "machine.json"), JSON.stringify({ version: 1, idiomaPorDefecto: "es" }));
    assert.ok(promptsLayers()[0]!.endsWith(path.join("prompts", "es")), "machine.json gana a PHASE_GATE_LANG");
  });

  it("los /fN de un servidor en inglés salen con los títulos de las fases en inglés", async () => {
    instalacion();
    process.env.PHASE_GATE_LANG = "en";
    const { cliente, cerrar } = await conectar();
    try {
      const { prompts } = await cliente.listPrompts();
      assert.match(prompts.find((p) => p.name === "f1")?.title ?? "", /Discovery/);
    } finally {
      await cerrar();
    }
  });
});

describe("doctor con los prompts de fábrica en inglés", () => {
  it("las reglas globales en inglés tienen sus secciones: ni faltan ni hay avisos GLOBAL-*", async () => {
    instalacion();
    process.env.PHASE_GATE_LANG = "en";
    const d = diagnosticar();
    assert.ok(d.capas[0]!.ruta.endsWith(path.join("prompts", "en")));
    assert.deepEqual(d.reglasGlobales.faltan, []);
    assert.deepEqual(d.hallazgos.filter((h) => h.codigo.startsWith("GLOBAL-")), []);
  });

  it("a un global-rules.md propio en inglés le faltan las secciones con su nombre inglés", async () => {
    const { config } = instalacion();
    process.env.PHASE_GATE_LANG = "en";
    fs.mkdirSync(path.join(config, "prompts"), { recursive: true });
    fs.writeFileSync(path.join(config, "prompts", "global-rules.md"), "## EVIDENCE\nx\n\n## BASIS OF EACH DECISION\ny\n");
    assert.deepEqual(diagnosticar().reglasGlobales.faltan, ["INHERITED PENDING ITEMS"]);
  });
});

describe("doctor --fase en inglés", () => {
  it("cada ranura con su alias y el id canónico entre paréntesis; fábrica y los modos, traducidos", async () => {
    const { docs } = instalacion();
    fs.writeFileSync(path.join(docs, "P", "phase-gate.json"), JSON.stringify({ version: 1, idioma: "en", preset: "ai-agent-ops" }));
    process.env.PHASE_GATE_LANG = "en";
    const { formatearProcedencia, procedenciaDeFase } = await import("../src/diagnostico.js");
    const texto = formatearProcedencia(procedenciaDeFase(3, "P"));
    assert.match(texto, /phase-3\/tests \(fase-3\/pruebas\)\s+\S*presets.en.ai-agent-ops\.md:\d+/);
    assert.match(texto, /global\/zero-breakage \(global\/cero-rupturas\)\s+factory  \+ after \(/);
    assert.match(texto, /global\/extra\s+factory/);
    process.env.PHASE_GATE_LANG = "es";
    assert.match(formatearProcedencia(procedenciaDeFase(3, "P")), /fase-3\/pruebas\s+\S*ai-agent-ops\.md:\d+/);
  });
});
