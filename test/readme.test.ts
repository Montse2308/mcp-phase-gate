// Los dos README son cortos y el detalle vive en cinco guías gemelas, en inglés y en español. Este test
// vigila lo que se rompe en silencio al mover texto de un sitio a otro: que cada README quepa en menos de
// 200 líneas, que los gemelos tengan la misma forma, que ningún enlace lleve a un archivo que no existe o a
// un ancla que ya no está, y que no queden rastros de lo que la v4 quitó.
//
// Los enlaces de los README son absolutos, porque en npmjs.com se ven fuera del repo y `docs/` no viaja en el
// paquete. Mientras la v4 vive en `v4/integracion`, esos enlaces dan 404 en GitHub: se comprueban contra la
// copia local, que es la que llegará a `master`.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = "https://github.com/Montse2308/mcp-phase-gate";
const SITIO = "https://montse2308.github.io/mcp-phase-gate/";

const LIMITE_DE_LINEAS = 200;
// Cada par: el de inglés y el de español, con el mismo contenido y los mismos títulos.
const GUIAS: [string, string][] = [
  ["docs/guide/installation.md", "docs/guia/instalacion.md"],
  ["docs/guide/configuration.md", "docs/guia/configuracion.md"],
  ["docs/guide/studio.md", "docs/guia/studio.md"],
  ["docs/guide/tools.md", "docs/guia/herramientas.md"],
  ["docs/guide/prompts.md", "docs/guia/prompts.md"],
];
const READMES = ["README.md", "README.es.md"];

function leer(relativa: string): string {
  return fs.readFileSync(path.join(RAIZ, relativa), "utf-8").replace(/\r\n/g, "\n");
}

// Las líneas de un archivo fuera de sus bloques de código, que es donde un `#` no abre un título.
function fueraDeCodigo(texto: string): string[] {
  let cerca = false;
  return texto.split("\n").filter((linea) => {
    if (/^\s*```/.test(linea)) {
      cerca = !cerca;
      return false;
    }
    return !cerca;
  });
}

function titulos(texto: string): { nivel: number; texto: string }[] {
  return fueraDeCodigo(texto)
    .map((linea) => /^(#{1,6}) (.*)$/.exec(linea))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ nivel: (m[1] ?? "").length, texto: (m[2] ?? "").trim() }));
}

// Cada título con las líneas de su sección, hasta el título siguiente. Las de un bloque de código se
// conservan, para contarlas; lo que parece un título dentro de uno no lo es.
function seccionesDe(texto: string): { nivel: number; titulo: string; cuerpo: string[] }[] {
  const secciones: { nivel: number; titulo: string; cuerpo: string[] }[] = [];
  let cerca = false;
  for (const linea of texto.split("\n")) {
    if (/^\s*```/.test(linea)) cerca = !cerca;
    const m = cerca || /^\s*```/.test(linea) ? null : /^(#{1,6}) (.*)$/.exec(linea);
    if (m) secciones.push({ nivel: (m[1] ?? "").length, titulo: (m[2] ?? "").trim(), cuerpo: [] });
    else secciones[secciones.length - 1]?.cuerpo.push(linea);
  }
  return secciones;
}

// El ancla que GitHub le da a un título: minúsculas, sin signos ni emoji, y un guion por espacio.
function ancla(titulo: string): string {
  return titulo
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function anclasDe(texto: string): Set<string> {
  const vistas = new Map<string, number>();
  const anclas = new Set<string>();
  for (const { texto: t } of titulos(texto)) {
    const base = ancla(t);
    const n = vistas.get(base) ?? 0;
    vistas.set(base, n + 1);
    anclas.add(n === 0 ? base : `${base}-${n}`);
  }
  return anclas;
}

type Enlace = { destino: string; texto: string };

// Los enlaces de Markdown y los de HTML (`href` y `src`), sin los de dentro de un bloque de código.
function enlacesDe(texto: string): Enlace[] {
  const sinCodigo = fueraDeCodigo(texto).join("\n").replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
  const enlaces: Enlace[] = [];
  for (const m of sinCodigo.matchAll(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) enlaces.push({ texto: m[1] ?? "", destino: m[2] ?? "" });
  for (const m of sinCodigo.matchAll(/(?:href|src)="([^"]+)"/g)) enlaces.push({ texto: m[0], destino: m[1] ?? "" });
  return enlaces;
}

// Los nombres que genera la publicación del sitio: scripts/medios.mjs y scripts/portada.mjs. Se leen de los
// scripts, y no se copian aquí, para que un nombre que cambia allí rompa este test en vez de dejar un enlace roto.
async function nombresDeMedios(): Promise<Set<string>> {
  const medios = fs.readFileSync(path.join(RAIZ, "scripts", "medios.mjs"), "utf-8");
  const capturas = fs.readFileSync(path.join(RAIZ, "scripts", "capturas-studio.mjs"), "utf-8");
  const portada = (await import(pathToFileURL(path.join(RAIZ, "scripts", "portada.mjs")).href)) as { EXTENSION_DE_LAS_CAPTURAS: string };
  const nombres = new Set<string>(["medios.json"]);
  for (const idioma of ["en", "es"]) {
    for (const plantilla of ["demo-${idioma}.gif", "demo-${idioma}.mp4", "poster-${idioma}.png"]) {
      assert.ok(medios.includes(plantilla), `scripts/medios.mjs ya no genera ${plantilla}`);
      nombres.add(plantilla.replace("${idioma}", idioma));
    }
    for (const vista of ["red", "tablero", "ajustes"]) {
      assert.match(capturas, new RegExp(`\\b${vista}:`), `scripts/capturas-studio.mjs ya no saca la captura de ${vista}`);
      nombres.add(`captura-${vista}-${idioma}.${portada.EXTENSION_DE_LAS_CAPTURAS}`);
    }
  }
  return nombres;
}

function existe(relativa: string): boolean {
  return fs.existsSync(path.join(RAIZ, relativa));
}

describe("los README y las guías", () => {
  describe("el tamaño y la forma", () => {
    for (const readme of READMES) {
      it(`${readme} tiene menos de ${LIMITE_DE_LINEAS} líneas`, () => {
        const lineas = leer(readme).replace(/\n$/, "").split("\n").length;
        assert.ok(lineas < LIMITE_DE_LINEAS, `${readme} tiene ${lineas} líneas`);
      });
    }

    // Gemelos: la misma lista de títulos en el mismo orden. Los textos se traducen, así que se compara lo que no
    // cambia con el idioma: el nivel de cada título, lo que va entre comillas invertidas, y la huella de su
    // sección (cuántos bloques de código, filas de tabla, viñetas y enlaces trae). Con eso, dos títulos vecinos
    // que se cambian de sitio, aunque ninguno lleve comillas, dejan de coincidir.
    function forma(texto: string): string[] {
      return seccionesDe(texto).map(({ nivel, titulo, cuerpo }) => {
        const codigo = (titulo.match(/`[^`]+`/g) ?? []).join(" ").replace(/<[^>]+>/g, "<>");
        const bloques = cuerpo.filter((l) => /^\s*```/.test(l)).length / 2;
        const filas = cuerpo.filter((l) => /^\|/.test(l)).length;
        const vinietas = cuerpo.filter((l) => /^\s*(?:[-*]|\d+\.) /.test(l)).length;
        const enlaces = enlacesDe(cuerpo.join("\n")).length;
        return `${nivel}:${codigo}:b${bloques}:f${filas}:v${vinietas}:e${enlaces}`;
      });
    }
    function mismaForma(en: string, es: string): void {
      const a = titulos(leer(en));
      const b = titulos(leer(es));
      assert.equal(a.length, b.length, `${en} tiene ${a.length} títulos y ${es} tiene ${b.length}:\n${a.map((x) => x.texto).join("\n")}\n---\n${b.map((x) => x.texto).join("\n")}`);
      assert.deepEqual(forma(leer(en)), forma(leer(es)), `${en} y ${es} no tienen los mismos títulos en el mismo orden`);
    }
    it("los dos README tienen los mismos títulos en el mismo orden", () => {
      mismaForma("README.md", "README.es.md");
    });
    for (const [en, es] of GUIAS) {
      it(`${en} y ${es} tienen los mismos títulos en el mismo orden`, () => {
        mismaForma(en, es);
      });
    }
    it("docs/phase-commands.md es el gemelo en inglés de docs/comandos-de-fase.md", () => {
      mismaForma("docs/phase-commands.md", "docs/comandos-de-fase.md");
    });
  });

  describe("los enlaces", () => {
    // Un README se ve también en npmjs.com, donde un enlace relativo no lleva a ningún sitio.
    for (const readme of READMES) {
      it(`cada enlace de ${readme} es absoluto, y apunta a un archivo que existe o a un nombre que genera el sitio`, async () => {
        const texto = leer(readme);
        const propias = anclasDe(texto);
        const nombres = await nombresDeMedios();
        const malos: string[] = [];
        for (const { destino } of enlacesDe(texto)) {
          if (destino.startsWith("#")) {
            if (!propias.has(destino.slice(1))) malos.push(`${destino}: no hay un título con esa ancla en ${readme}`);
            continue;
          }
          if (/^mailto:/.test(destino)) continue;
          if (!/^https:\/\//.test(destino)) {
            malos.push(`${destino}: no es absoluto`);
            continue;
          }
          const [sinAncla = "", anclaDestino] = destino.split("#");
          if (sinAncla.startsWith(`${REPO}/blob/master/`) || sinAncla.startsWith(`${REPO}/tree/master/`)) {
            const relativa = decodeURIComponent(sinAncla.replace(/^.*?\/(?:blob|tree)\/master\//, ""));
            if (!existe(relativa)) {
              malos.push(`${destino}: ${relativa} no existe`);
            } else if (anclaDestino && /\.md$/.test(relativa) && !anclasDe(leer(relativa)).has(anclaDestino)) {
              malos.push(`${destino}: ${relativa} no tiene un título con la ancla #${anclaDestino}`);
            }
          } else if (sinAncla.startsWith(SITIO)) {
            const ruta = sinAncla.slice(SITIO.length);
            if (ruta.startsWith("medios/")) {
              if (!nombres.has(ruta.slice("medios/".length))) malos.push(`${destino}: ${ruta} no es un nombre que genere el sitio`);
            } else if (!["", "es/", "demo/", "demo/es/"].includes(ruta)) {
              malos.push(`${destino}: ${ruta} no es una página del sitio`);
            }
          }
          // Los demás (npm, shields.io, las actions, los issues): no son del repo ni del sitio.
        }
        assert.deepEqual(malos, []);
      });
    }

    // Las guías y CONTRIBUTING.md solo se leen en GitHub o en el clon, así que sus enlaces son relativos.
    for (const archivo of [...GUIAS.flat(), "CONTRIBUTING.md", "docs/phase-commands.md", "docs/comandos-de-fase.md"]) {
      it(`cada enlace de ${archivo} lleva a un archivo y a un ancla que existen`, async () => {
        const texto = leer(archivo);
        const nombres = await nombresDeMedios();
        const propias = anclasDe(texto);
        const malos: string[] = [];
        for (const { destino } of enlacesDe(texto)) {
          if (/^mailto:/.test(destino)) continue;
          if (destino.startsWith("#")) {
            if (!propias.has(destino.slice(1))) malos.push(`${destino}: no hay un título con esa ancla en ${archivo}`);
            continue;
          }
          if (/^https:\/\//.test(destino)) {
            if (destino.startsWith(SITIO + "medios/")) {
              const nombre = destino.slice((SITIO + "medios/").length);
              if (!nombres.has(nombre)) malos.push(`${destino}: ${nombre} no es un nombre que genere el sitio`);
            }
            continue;
          }
          const [sinAncla = "", anclaDestino] = destino.split("#");
          const relativa = path.posix.normalize(path.posix.join(path.posix.dirname(archivo), sinAncla));
          if (!existe(relativa)) {
            malos.push(`${destino}: ${relativa} no existe`);
          } else if (anclaDestino && /\.md$/.test(relativa) && !anclasDe(leer(relativa)).has(anclaDestino)) {
            malos.push(`${destino}: ${relativa} no tiene un título con la ancla #${anclaDestino}`);
          }
        }
        assert.deepEqual(malos, []);
      });
    }
  });

  describe("lo que la v4 quitó", () => {
    // La búsqueda es de las formas exactas, para no marcar «plain» o «losing track», que son inglés normal.
    const PROHIBIDO: [string, RegExp][] = [
      ["Cockpit", /\bCockpit\b/],
      ["**Plain**", /\*\*Plain\*\*/],
      ["Cabina", /\bCabina\b/],
      ["Sobrio", /\bSobrio\b/],
      ["station", /\bstations?\b/],
      ["wagon", /\bwagons?\b/],
      ["vagón", /\bvag[oó]n(?:es)?\b/],
    ];
    for (const archivo of [...READMES, ...GUIAS.flat(), "CONTRIBUTING.md"]) {
      it(`${archivo} no usa los modos ni la metáfora de la vía`, () => {
        const texto = leer(archivo);
        for (const [nombre, patron] of PROHIBIDO) assert.ok(!patron.test(texto), `${archivo} todavía dice ${nombre}`);
      });
    }

    // Los README ya no enseñan rutas en el bloque `env`: viven en machine.json, y `init` no las escribe allí.
    for (const readme of READMES) {
      it(`${readme} no tiene un bloque env con PHASE_GATE_DOCS_PATH`, () => {
        const bloques = [...leer(readme).matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
        for (const bloque of bloques) {
          assert.ok(!(/"env"\s*:/.test(bloque) && /PHASE_GATE_DOCS_PATH/.test(bloque)), `${readme} tiene un bloque env con PHASE_GATE_DOCS_PATH`);
        }
      });
    }

    // En las guías hay un solo sitio donde las rutas sí van en el `env` de un cliente: registrar el servidor
    // más de una vez, con una Documentación distinta en cada registro. Ahí el entorno gana a machine.json, y
    // es justo lo que se enseña. En cualquier otra sección sería enseñar lo que `init` ya no escribe.
    const VARIAS_CARPETAS = ["more-than-one-documentation-folder-optional", "varias-carpetas-de-documentación-opcional"];
    for (const archivo of [...GUIAS.flat(), "CONTRIBUTING.md"]) {
      it(`${archivo} solo pone rutas en un bloque env en la sección de varias carpetas de Documentación`, () => {
        const sitios: string[] = [];
        for (const { titulo, cuerpo } of seccionesDe(leer(archivo))) {
          const bloques = [...cuerpo.join("\n").matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1] ?? "");
          if (bloques.some((b) => /"env"\s*:/.test(b) && /PHASE_GATE_DOCS_PATH/.test(b))) sitios.push(ancla(titulo));
        }
        assert.deepEqual(
          sitios.filter((s) => !VARIAS_CARPETAS.includes(s)),
          [],
          `${archivo} enseña rutas en un bloque env fuera de la sección de varias carpetas`,
        );
      });
    }
  });
});
