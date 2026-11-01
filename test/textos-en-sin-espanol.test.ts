// Los textos en inglés no nombran las vistas con su nombre en español. La interfaz en inglés las llama Network,
// Board, Workshop, Lookout, Logbook y Settings, y la Documentación es "the Documentation": un «Ajustes» o un
// «Vigía» dentro de un texto en inglés es un descuido de traducción. Se lee el código fuente con el compilador
// de TypeScript: el texto literal de cada versión `en` de src/i18n/textos/ y cada valor de studio/src/i18n/en.ts.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEXTOS = path.join(RAIZ, "src", "i18n", "textos");
const EN_STUDIO = path.join(RAIZ, "studio", "src", "i18n", "en.ts");

// Los nombres en español, con y sin tilde. Distingue mayúsculas: «red» y «taller» en minúscula no son
// ambiguos en inglés, pero «Red» sí puede empezar una frase, y por eso se revisa a mano con las excepciones.
const NOMBRES = ["Ajustes", "Red", "Tablero", "Taller", "Vigía", "Vigia", "Bitácora", "Bitacora", "Documentación", "Documentacion"];
const SOLO_PALABRA = (nombre: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}_])${nombre}(?![\\p{L}\\p{N}_])`, "u");

// Lo que sí puede aparecer en un texto en inglés, y por qué. `texto` es el fragmento exacto del texto literal.
const EXCEPCIONES: { texto: string; porque: string }[] = [
  {
    texto: "<Documentación>",
    porque: "es el marcador literal que la exportación escribe en lugar de la ruta de la Documentación (src/studio/exportar.ts y privacidad.ts), igual en los dos idiomas",
  },
];

type Texto = { donde: string; texto: string };

function leer(archivo: string): ts.SourceFile {
  return ts.createSourceFile(archivo, fs.readFileSync(archivo, "utf-8"), ts.ScriptTarget.Latest, true);
}

// El texto literal bajo un nodo: las cadenas y las partes fijas de las plantillas, sin los `${…}`.
function literales(nodo: ts.Node, fuente: ts.SourceFile, salida: Texto[]): void {
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo) || ts.isTemplateHead(nodo) || ts.isTemplateMiddle(nodo) || ts.isTemplateTail(nodo)) {
    const { line } = fuente.getLineAndCharacterOfPosition(nodo.getStart());
    salida.push({ donde: `${path.relative(RAIZ, fuente.fileName)}:${line + 1}`, texto: nodo.text });
    return;
  }
  ts.forEachChild(nodo, (n) => literales(n, fuente, salida));
}

// Las versiones `en` de todos los catálogos de src/i18n/textos/.
function textosDelServidor(): Texto[] {
  const salida: Texto[] = [];
  for (const nombre of fs.readdirSync(TEXTOS).filter((n) => n.endsWith(".ts") && n !== "tipos.ts")) {
    const fuente = leer(path.join(TEXTOS, nombre));
    const visitar = (n: ts.Node): void => {
      if (ts.isPropertyAssignment(n) && n.name.getText() === "en" && ts.isObjectLiteralExpression(n.parent)) {
        literales(n.initializer, fuente, salida);
        return;
      }
      ts.forEachChild(n, visitar);
    };
    visitar(fuente);
  }
  return salida;
}

// Los valores de la interfaz en inglés del Studio. Las claves no cuentan: son ids de la interfaz.
function textosDelStudio(): Texto[] {
  const salida: Texto[] = [];
  const fuente = leer(EN_STUDIO);
  const visitar = (n: ts.Node): void => {
    if (ts.isPropertyAssignment(n)) {
      literales(n.initializer, fuente, salida);
      return;
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  return salida;
}

function hallazgos(textos: Texto[]): string[] {
  const malos: string[] = [];
  for (const { donde, texto: completo } of textos) {
    // Una excepción quita solo su fragmento: lo demás del texto se sigue revisando.
    const texto = EXCEPCIONES.reduce((resto, e) => resto.split(e.texto).join(""), completo);
    for (const nombre of NOMBRES) {
      if (SOLO_PALABRA(nombre).test(texto)) malos.push(`${donde}: «${nombre}» en «${texto}»`);
    }
  }
  return malos;
}

describe("los textos en inglés no llevan nombres de vista en español", () => {
  const servidor = textosDelServidor();
  const studio = textosDelStudio();

  it("se leen los textos de los dos catálogos (la comprobación no está vacía)", () => {
    assert.ok(servidor.length > 600, `${servidor.length} textos del servidor`);
    assert.ok(studio.length > 300, `${studio.length} textos del Studio`);
  });

  it("src/i18n/textos/: ninguna versión `en` dice Ajustes, Red, Tablero, Taller, Vigía, Bitácora ni Documentación", () => {
    assert.deepEqual(hallazgos(servidor), []);
  });

  it("studio/src/i18n/en.ts: ningún valor dice Ajustes, Red, Tablero, Taller, Vigía, Bitácora ni Documentación", () => {
    assert.deepEqual(hallazgos(studio), []);
  });

  it("la comprobación detecta un nombre en español dentro de un texto en inglés", () => {
    assert.equal(hallazgos([{ donde: "x", texto: "It is not edited from Ajustes." }]).length, 1);
    assert.equal(hallazgos([{ donde: "x", texto: "Open the Vigía view" }]).length, 1);
    assert.equal(hallazgos([{ donde: "x", texto: "Settings and the Documentation, a red flag" }]).length, 0);
  });

  it("cada excepción lleva su porqué y aparece de verdad en algún texto", () => {
    for (const e of EXCEPCIONES) {
      assert.ok(e.porque.length > 10, `la excepción «${e.texto}» no dice por qué`);
      assert.ok([...servidor, ...studio].some((t) => t.texto.includes(e.texto)), `la excepción «${e.texto}» ya no aparece en ningún texto`);
    }
  });
});
