// El índice de docs/decisiones.md se genera con scripts/indice-decisiones.mjs y tiene que enlazar cada entrada por
// su título. Un test lo comprueba para que una decisión nueva, o una renombrada, no deje el índice atrás.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type Indice = {
  conIndice(texto: string): string;
  titulosDeLasEntradas(texto: string): string[];
  anclasDe(titulos: string[]): string[];
};
const indice = (await import(pathToFileURL(path.join(RAIZ, "scripts", "indice-decisiones.mjs")).href)) as Indice;

const decisiones = fs.readFileSync(path.join(RAIZ, "docs", "decisiones.md"), "utf-8").replace(/\r\n/g, "\n");

describe("el índice de docs/decisiones.md", () => {
  it("está al día: lo que genera el script es lo que hay en el archivo", () => {
    assert.equal(indice.conIndice(decisiones), decisiones, "corre `node scripts/indice-decisiones.mjs`");
  });

  it("enlaza cada entrada por su título, en el orden del archivo", () => {
    const titulos = indice.titulosDeLasEntradas(decisiones);
    assert.ok(titulos.length > 100, `solo hay ${titulos.length} entradas`);
    const anclas = indice.anclasDe(titulos);
    const bloque = decisiones.slice(decisiones.indexOf("<!-- indice:inicio -->"), decisiones.indexOf("<!-- indice:fin -->"));
    const enlaces = [...bloque.matchAll(/^- \[(.+)\]\(#([^)]+)\)$/gm)].map((m) => ({ texto: (m[1] ?? "").replace(/\\([[\]])/g, "$1"), ancla: m[2] }));
    assert.deepEqual(
      enlaces.map((e) => e.texto),
      titulos,
    );
    assert.deepEqual(
      enlaces.map((e) => e.ancla),
      anclas,
    );
  });

  it("no repite un ancla", () => {
    const anclas = indice.anclasDe(indice.titulosDeLasEntradas(decisiones));
    assert.equal(new Set(anclas).size, anclas.length);
  });

  it("el índice no cuenta bloques de código como entradas", () => {
    const titulos = indice.titulosDeLasEntradas("## Una\n\n```md\n## VERIFICACIÓN\n```\n\n## Otra\n");
    assert.deepEqual(titulos, ["Una", "Otra"]);
  });

  it("las anclas siguen la regla de GitHub: sin signos, con guiones donde había espacios, y -1 al repetirse", () => {
    assert.deepEqual(indice.anclasDe(["2026-10-29 — La `demo/`, y más", "Igual", "Igual"]), ["2026-10-29--la-demo-y-más", "igual", "igual-1"]);
  });
});
