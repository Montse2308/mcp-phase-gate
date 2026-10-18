// El vocabulario de contratos (§8.2 del plan maestro v3): se escribe en el idioma del proyecto y se lee
// en los dos. Y el test de contrato: cada juego de prompts de fábrica (`prompts/<idioma>/`) usa
// exactamente los encabezados, las claves y los nombres de documento de su idioma, y tiene las mismas
// ranuras con los mismos ids.

import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import { parsearBloques, ranurasDe } from "../src/bloques.js";
import type { Capa } from "../src/capas.js";
import { lotesDelPlan, leerTablaDeLotes, textoDelIndice } from "../src/lotes.js";
import type { FaseDeLotes } from "../src/lotes.js";
import { discoverPhases, quitarMarcadores, resolveCommandFile, separarFrontmatter } from "../src/phases.js";
import { cabeceraDeRecibo, comoManual, escribirRecibo, frontmatterDeRecibo, parsearRecibo } from "../src/recibos.js";
import type { Recibo } from "../src/recibos.js";
import { progresoDeLotes, tieneValidacionesPendientes } from "../src/tasks.js";
import {
  ALIAS_DE_RANURA,
  IDIOMAS,
  VOCABULARIO,
  archivoCanonico,
  idCanonicoDeRanura,
  idInglesDeRanura,
  modoCanonico,
} from "../src/vocabulario.js";
import { carpetaTemporal, limpiarEntorno } from "./helpers.js";

afterEach(() => limpiarEntorno());

function recibo(cambios: Partial<Recibo> = {}): Recibo {
  return {
    lote: 2,
    de: 4,
    titulo: "filtro por categoría",
    repo: "api",
    rama: "feat/filtro",
    estado: "verificado",
    ancla: {
      tipo: "commit",
      repo: "api",
      sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      corto: "a1b2c3d",
      asunto: "fix(filtros): incluir los productos sin categoría",
      rama: "feat/filtro",
      verificado: "2026-11-03T18:22:41.000Z",
    },
    fecha: "2026-11-03",
    registrado: "2026-11-03T18:22:41.000Z",
    origen: "servidor",
    queSeHizo: "El filtro incluye ahora los 12 productos sin categoría.",
    archivos: [{ archivo: "src/filtros.ts", cambio: "nueva rama | con null" }],
    verificacion: "npm test: 48 pasan.",
    esperaAlUsuario: [{ prueba: "Abrir la vista", esperado: "aparecen los 12" }],
    desvios: "",
    decisiones: "D7. Los nulos se agrupan. **Base:** leído en código.",
    condicionales: [
      { titulo: "Lo que sigue igual", texto: "El reporte mensual no cambia." },
      { titulo: "Reversión", texto: "Revertir el commit." },
      { titulo: "Aviso a alguien más", texto: "A soporte." },
      { titulo: "Deuda anotada", texto: "Sin índice." },
    ],
    verificacionDelCommit: "El commit toca exactamente el archivo declarado.",
    ...cambios,
  };
}

const ANCLAS: Recibo["ancla"][] = [
  { tipo: "sha256", ruta: "repo:agente/prompt.md", sha256: "9c1e04ab".padEnd(64, "0"), bytes: 1234, verificado: "2026-11-03T18:22:41.000Z" },
  { tipo: "nota", texto: "probado a mano\ncon dos líneas" },
  { tipo: "pendiente" },
];

describe("vocabulario: recibos en los dos idiomas", () => {
  it("un recibo en inglés usa las claves, los valores y las secciones en inglés", () => {
    const texto = escribirRecibo(recibo(), { idioma: "en" });
    for (const linea of ["batch: L02", "of: 4", "branch: feat/filtro", "status: verified", "anchor: commit", "full_commit: a1b2", "subject: fix(", "recorded: 2026", "origin: server"]) {
      assert.ok(texto.includes(`\n${linea}`), `falta «${linea}»`);
    }
    for (const seccion of ["What was done", "Files", "Verification run", "Awaiting the user", "Deviations from the plan", "Decisions", "What stays the same", "Rollback", "Heads-up to someone else", "Debt noted", "Commit check"]) {
      assert.ok(texto.includes(`\n## ${seccion}\n`), `falta la sección ${seccion}`);
    }
    assert.ok(texto.includes("| File | What changed |"));
    assert.ok(texto.includes("## Deviations from the plan\nNone."));
    assert.ok(!/\n(lote|estado|rama|ancla|origen):/.test(texto), "quedó una clave en español");
  });

  it("leer un recibo en inglés da lo mismo que leerlo en español, con cada tipo de ancla y estado", () => {
    for (const ancla of [recibo().ancla, ...ANCLAS]) {
      for (const estado of ["verificado", "con pendientes", "fallido", "descartado"] as const) {
        const r = recibo({ ancla, estado, verificacionDelCommit: ancla.tipo === "commit" ? "ok" : null });
        const es = escribirRecibo(r);
        const en = escribirRecibo(r, { idioma: "en" });
        const deEs = parsearRecibo(es, "L02 - x.md");
        const deEn = parsearRecibo(en, "L02 - x.md");
        assert.deepEqual(deEn, deEs, `${ancla.tipo} · ${estado}`);
        // Y de un idioma al otro sin perder nada: inglés -> español da los bytes del español.
        assert.equal(escribirRecibo(deEn), es);
        assert.equal(escribirRecibo(deEs, { idioma: "en" }), en);
        assert.deepEqual(cabeceraDeRecibo(en, "L02 - x.md"), cabeceraDeRecibo(es, "L02 - x.md"));
      }
    }
  });

  it("como documento de la fase (un solo lote), `batches` y `generated_by`", () => {
    const texto = escribirRecibo(recibo({ lote: 1, de: 1 }), { comoDocumento: true, idioma: "en" });
    assert.ok(texto.startsWith("---\nbatches: 1\ngenerated_by: mcp-phase-gate\n"));
    assert.equal(frontmatterDeRecibo(texto).meta.generado_por, "mcp-phase-gate");
    assert.equal(frontmatterDeRecibo(texto).meta.lotes, "1");
  });

  it("la escotilla manual deja `origin: manual` en un recibo en inglés y `origen: manual` en uno en español", () => {
    const en = comoManual(escribirRecibo(recibo(), { comoDocumento: true, idioma: "en" }));
    assert.ok(en.includes("\norigin: manual\n"));
    assert.ok(!/\n(origin: server|generated_by:|origen:)/.test(en));
    const es = comoManual(escribirRecibo(recibo(), { comoDocumento: true }));
    assert.ok(es.includes("\norigen: manual\n"));
    assert.ok(!/\n(origin:|generado_por:)/.test(es));
    assert.equal(parsearRecibo(en).origen, "manual");
  });

  it("un recibo escrito a mano en inglés, con formas habituales de «nada», se lee", () => {
    const r = parsearRecibo(
      "---\nbatch: L03\nstatus: Failed\ncommit: not applicable\n---\n# L03 — retry\n\n## What was done\nNothing.\n\n## Files\nNone\n\n## Decisions\n_none_\n",
      "L03 - retry.md"
    );
    assert.equal(r.lote, 3);
    assert.equal(r.estado, "fallido");
    assert.deepEqual(r.ancla, { tipo: "nota", texto: "not applicable" });
    assert.equal(r.queSeHizo, "");
    assert.deepEqual(r.archivos, []);
    assert.equal(r.decisiones, "");
  });
});

describe("vocabulario: índice, plan y pendientes", () => {
  const fase = (idioma: "es" | "en"): FaseDeLotes => ({
    taskName: "cupones",
    carpetaTarea: "",
    phases: new Map(),
    numero: 4,
    titulo: idioma === "en" ? "Execution" : "Ejecución",
    recibos: idioma === "en" ? "04 - Execution" : "04 - Ejecución",
    documento: null,
    plan: idioma === "en" ? "03 - Technical Plan.md" : "03 - Plan Técnico.md",
    idioma,
  });

  it("el índice en inglés usa sus claves, encabezados y valores; en español no cambia", () => {
    const recibos = new Map([
      [1, { recibo: recibo({ lote: 1, estado: "con pendientes" }), nombre: "L01 - a.md" }],
      [2, { recibo: recibo({ lote: 2, estado: "descartado", ancla: { tipo: "nota", texto: "no" } }), nombre: "L02 - b.md" }],
    ]);
    const en = textoDelIndice(fase("en"), 3, recibos);
    assert.ok(en.startsWith("---\nbatches: 3\ngenerated_by: mcp-phase-gate\n---\n\n# Execution — cupones\n"));
    for (const trozo of ["**Branch:** feat/filtro", "**Closed:** 2026-11-03", "**Status:** Phase closed with pending items (see below) · 1 batch discarded", "## Batches\n| Batch | Repo | Goal | Status | Anchor | Receipt |", "| L03 | — | — | no receipt | — | — |", "## Awaiting the user\n| Batch | Test | Expected result |", "## Pending validations\n- L01 (with pending items): npm test: 48 pasan."]) {
      assert.ok(en.includes(trozo), `falta «${trozo}»`);
    }
    const es = textoDelIndice(fase("es"), 3, recibos);
    assert.ok(es.includes("**Estado:** Fase cerrada con pendientes (ver abajo) · 1 lote descartado"));
    assert.ok(es.includes("## Lotes\n| Lote | Repo | Objetivo | Estado | Ancla | Recibo |"));
    // El índice también es un documento con pendientes para la fase siguiente, en los dos idiomas.
    assert.ok(tieneValidacionesPendientes(en));
    assert.ok(tieneValidacionesPendientes(es));
  });

  it("la tabla de lotes del plan se lee en los dos idiomas", () => {
    const en = leerTablaDeLotes(
      "---\nbatches: 2\n---\n# Plan\n\n| Batch | Repo | Goal | Steps | Exit criterion | Proposed commit | Reverts alone |\n|---|---|---|---|---|---|---|\n| L01 | `api` | add the coupon | … | … | `feat(api): coupon` | yes |\n| **L02** | web | show it | … | … | `feat(web): coupon` | yes |\n"
    );
    assert.deepEqual(en?.get(1), { repo: "api", objetivo: "add the coupon", commitPropuesto: "feat(api): coupon" });
    assert.equal(en?.get(2)?.objetivo, "show it");
    const es = leerTablaDeLotes("| Lote | Repo | Objetivo | Commit propuesto |\n|---|---|---|---|\n| L01 | api | x | `a` |\n");
    assert.deepEqual(es?.get(1), { repo: "api", objetivo: "x", commitPropuesto: "a" });
  });

  it("`batches: N` en el frontmatter del plan cuenta igual que `lotes: N`", () => {
    const carpeta = carpetaTemporal("plan-en");
    fs.writeFileSync(path.join(carpeta, "03 - Technical Plan.md"), "---\nbatches: 3\n---\n# Plan\n");
    assert.equal(lotesDelPlan({ ...fase("en"), carpetaTarea: carpeta }), 3);
    assert.equal(progresoDeLotes(carpeta, "03 - Technical Plan.md", "04 - Execution").total, 3);
  });

  it("«## Pending validations» con contenido es un pendiente; con «None.» o «Nothing pending», no", () => {
    assert.ok(tieneValidacionesPendientes("# A\n\n## Pending validations\n- measure the p95\n"));
    assert.ok(tieneValidacionesPendientes("# A\n\n## pending Validations\n- x\n"));
    for (const vacia of ["None.", "- _None_", "Nothing pending", "No pending items.", "Phase closed with no pending items"]) {
      assert.ok(!tieneValidacionesPendientes(`# A\n\n## Pending validations\n${vacia}\n\n## Next\nx\n`), vacia);
    }
  });
});

describe("vocabulario: marcadores, alias y prompts", () => {
  const capa: Capa = { orden: 3, etiqueta: "global", ruta: "x" };

  it("un bloque en inglés, con alias y modo, se resuelve al id y al modo canónicos", () => {
    const { bloques, avisos } = parsearBloques(
      "<!-- block: phase-3/tests | after -->\nmore tests\n<!-- /block -->\n<!-- block: global/zero-breakage -->\nx\n<!-- /block -->\n<!-- bloque: fase-4/lotes | antes -->\ny\n<!-- /bloque -->",
      "presets/en/x.md",
      capa
    );
    assert.deepEqual(avisos, []);
    assert.deepEqual(
      bloques.map((b) => [b.id, b.modo]),
      [
        ["fase-3/pruebas", "despues"],
        ["global/cero-rupturas", "reemplazar"],
        ["fase-4/lotes", "antes"],
      ]
    );
  });

  it("un marcador de bloque mal escrito en inglés invalida el archivo, como en español", () => {
    const { bloques, avisos } = parsearBloques("<!-- block: phase-3/tests | luego -->\nx\n<!-- /block -->", "x.md", capa);
    assert.deepEqual(bloques, []);
    assert.equal(avisos[0]?.codigo, "BLOQUE-MAL-FORMADO");
  });

  it("las ranuras `<!-- slot: tests -->` se leen con su id canónico y sus marcadores no llegan al modelo", () => {
    const texto = "## X\n<!-- slot: tests -->\na\n<!-- /slot -->\n<!-- ranura: rol -->\nb\n<!-- /ranura -->";
    assert.deepEqual(ranurasDe(texto).map((r) => r.nombre), ["pruebas", "rol"]);
    assert.equal(quitarMarcadores(texto), "## X\na\nb\n");
  });

  it("cada alias resuelve a un id canónico y vuelve: phase-N/<alias> <-> fase-N/<ranura>", () => {
    assert.equal(idCanonicoDeRanura("phase-3/tests"), "fase-3/pruebas");
    assert.equal(idCanonicoDeRanura("global/evidence"), "global/evidencia");
    assert.equal(idCanonicoDeRanura("fase-5/pr"), "fase-5/pr");
    assert.equal(idInglesDeRanura("fase-4/autoverificacion-commits"), "phase-4/self-check-commits");
    assert.equal(archivoCanonico("Phase-2"), "fase-2");
    assert.equal(modoCanonico("after"), "despues");
    assert.equal(modoCanonico(undefined), "reemplazar");
    assert.equal(modoCanonico("luego"), null);
    // Un alias por ranura y sin dos ranuras con el mismo alias.
    assert.equal(new Set(Object.values(ALIAS_DE_RANURA)).size, Object.keys(ALIAS_DE_RANURA).length);
  });

  it("un juego de prompts en inglés declara sus documentos y sus comandos con las claves inglesas", () => {
    const carpeta = carpetaTemporal("prompts-en");
    fs.writeFileSync(path.join(carpeta, "phase-1-discovery.md"), "---\ndocument: 01 - Technical Analysis.md\ninitial_document: 00 - Initial Context.md\n---\n# Discovery\n");
    fs.writeFileSync(path.join(carpeta, "phase-4-execution.md"), "---\ndocument: 04 - Execution.md\nreceipts: 04 - Execution\n---\n# Execution\n");
    fs.mkdirSync(path.join(carpeta, "commands"));
    fs.writeFileSync(path.join(carpeta, "commands", "f4.md"), "Start phase 4.\n");
    const fases = discoverPhases([carpeta]);
    assert.equal(fases.get(1)?.documento, "01 - Technical Analysis.md");
    assert.equal(fases.get(1)?.documentoInicial, "00 - Initial Context.md");
    assert.equal(fases.get(4)?.recibos, "04 - Execution");
    assert.equal(resolveCommandFile(4, [carpeta]), path.join(carpeta, "commands", "f4.md"));
  });
});

// ─── Test de contrato sobre los prompts de fábrica ──────────────────────────
// Corre sobre cada idioma que tenga carpeta en prompts/: desde que exista prompts/en (L04), también la suya.
const PROMPTS = path.join(process.cwd(), "prompts");
const idiomasPublicados = IDIOMAS.filter((idioma) => fs.existsSync(path.join(PROMPTS, idioma)));

function ranurasDeLaCarpeta(carpeta: string): string[] {
  const ids: string[] = [];
  for (const archivo of fs.readdirSync(carpeta).sort()) {
    if (!archivo.endsWith(".md")) continue;
    const texto = fs.readFileSync(path.join(carpeta, archivo), "utf-8").replace(/\r\n/g, "\n");
    const prefijo = archivo === "global-rules.md" ? "global" : `fase-${archivo.match(/^(?:fase|phase)-(\d+)-/)?.[1]}`;
    for (const r of ranurasDe(separarFrontmatter(texto).cuerpo)) ids.push(`${prefijo}/${r.nombre}`);
  }
  return ids.sort();
}

describe("contrato del vocabulario con los prompts de fábrica", () => {
  it("hay al menos el juego en español", () => {
    assert.ok(idiomasPublicados.includes("es"));
  });

  for (const idioma of idiomasPublicados) {
    const v = VOCABULARIO[idioma];
    const carpeta = path.join(PROMPTS, idioma);

    it(`${idioma}: las reglas globales tienen las secciones que el código busca, con su texto exacto`, () => {
      const lineas = fs.readFileSync(path.join(carpeta, "global-rules.md"), "utf-8").replace(/\r\n/g, "\n").split("\n");
      for (const titulo of [v.encabezados.base, v.encabezados.pendientesHeredados, v.encabezados.reglasAdicionales]) {
        assert.equal(lineas.filter((l) => l === `## ${titulo}`).length, 1, `falta "## ${titulo}"`);
      }
      assert.deepEqual(v.seccionesEsqueleto, [v.encabezados.base, v.encabezados.pendientesHeredados]);
      assert.ok(lineas.join("\n").includes(`\`## ${v.encabezados.validacionesPendientes}\``));
    });

    it(`${idioma}: cada fase declara los nombres de documento del vocabulario, con las claves de su idioma`, () => {
      const fases = discoverPhases([carpeta]);
      assert.deepEqual([...fases.keys()].sort(), [1, 2, 3, 4, 5]);
      assert.equal(fases.get(1)?.documentoInicial, v.documentos.contextoInicial);
      assert.deepEqual([1, 2, 3, 4, 5].map((n) => fases.get(n)?.documento), v.documentos.deFase);
      assert.equal(fases.get(4)?.recibos, v.documentos.deFase[3]!.replace(/\.md$/, ""));
      for (const archivo of fs.readdirSync(carpeta).filter((a) => /^(fase|phase)-\d/.test(a))) {
        const { meta } = separarFrontmatter(fs.readFileSync(path.join(carpeta, archivo), "utf-8"));
        for (const clave of Object.keys(meta)) {
          assert.ok((Object.values(v.frontmatterPrompt) as string[]).includes(clave), `${archivo}: la clave "${clave}" no es de ${idioma}`);
        }
      }
    });

    it(`${idioma}: la Fase 3 pide el frontmatter de lotes y la tabla de lotes con la cabecera del vocabulario`, () => {
      const fase3 = fs.readdirSync(carpeta).find((a) => /^(fase|phase)-3-/.test(a))!;
      const texto = fs.readFileSync(path.join(carpeta, fase3), "utf-8");
      assert.ok(texto.includes(`${v.plan.claveLotes}: `), `falta "${v.plan.claveLotes}: N"`);
      assert.ok(texto.includes(`| ${v.plan.cabeceraTablaLotes.join(" | ")} |`), "falta la cabecera exacta de la tabla de lotes");
    });

    it(`${idioma}: los comandos viven en su carpeta del vocabulario`, () => {
      for (const n of [1, 2, 3, 4, 5]) assert.ok(fs.existsSync(path.join(carpeta, v.carpetaComandos, `f${n}.md`)), `falta ${v.carpetaComandos}/f${n}.md`);
    });

    it(`${idioma}: las mismas ranuras, con los mismos ids canónicos, que el español`, () => {
      assert.deepEqual(ranurasDeLaCarpeta(carpeta), ranurasDeLaCarpeta(path.join(PROMPTS, "es")));
      assert.equal(ranurasDeLaCarpeta(carpeta).length, 27);
    });
  }
});
