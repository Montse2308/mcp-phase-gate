// El parser de bloques y su aplicación sobre las ranuras de un texto (§5.3.3 del plan maestro v3).

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import { aplicarBloques, leerBloques, omitirRanuraVacia, parsearBloques, ranurasDe } from "../src/bloques.js";
import type { Capa } from "../src/capas.js";
import { carpetaTemporal } from "./helpers.js";

const CAPA: Capa = { orden: 2, etiqueta: "preset", ruta: "preset.md" };

function bloques(texto: string) {
  return parsearBloques(texto, "preset.md", CAPA);
}

describe("parsearBloques", () => {
  it("lee identificador, modo y contenido exacto, e ignora el texto de fuera", () => {
    const { bloques: leidos, avisos } = bloques(
      [
        "---",
        "nombre: x",
        "---",
        "Texto para documentar el preset.",
        "<!-- bloque: fase-3/pruebas -->",
        "uno",
        "  dos con sangría",
        "<!-- /bloque -->",
        "<!-- bloque: global/cero-rupturas | despues -->",
        "- más",
        "<!-- /bloque -->",
        "  <!--   bloque:   fase-1/rol   |   antes   -->  ",
        "rol",
        "<!--/bloque-->",
      ].join("\n")
    );

    assert.deepEqual(avisos, []);
    assert.deepEqual(
      leidos.map((b) => [b.id, b.archivo, b.ranura, b.modo, b.contenido, b.origen.linea]),
      [
        ["fase-3/pruebas", "fase-3", "pruebas", "reemplazar", "uno\n  dos con sangría", 5],
        ["global/cero-rupturas", "global", "cero-rupturas", "despues", "- más", 9],
        ["fase-1/rol", "fase-1", "rol", "antes", "rol", 12],
      ]
    );
  });

  it("un bloque vacío tiene contenido vacío", () => {
    assert.equal(bloques("<!-- bloque: fase-2/rol -->\n<!-- /bloque -->").bloques[0]?.contenido, "");
  });

  // Detrás de un bloque bueno de tres líneas: la línea del aviso cuenta desde el principio del
  // archivo, y el bloque bueno tampoco se aplica.
  const malFormados: Array<[string, string, string]> = [
    ["sin cerrar", "<!-- bloque: fase-1/rol -->\nA\n", "preset.md:4: bloque sin cerrar"],
    ["cierre sin apertura", "A\n<!-- /bloque -->\n", "preset.md:5: cierre de bloque sin apertura"],
    [
      "anidado",
      "<!-- bloque: fase-1/rol -->\n<!-- bloque: fase-1/ejemplos -->\n<!-- /bloque -->\n<!-- /bloque -->",
      "preset.md:5: un bloque se abre dentro de otro (el de la línea 4)",
    ],
    ["con un modo que no existe", "<!-- bloque: fase-1/rol | después -->\nA\n<!-- /bloque -->", "preset.md:4: marcador de bloque mal escrito"],
    ["con un archivo que no existe", "<!-- bloque: fase/rol -->\nA\n<!-- /bloque -->", "preset.md:4: marcador de bloque mal escrito"],
    ["con texto detrás", "<!-- bloque: fase-1/rol --> y algo\nA\n<!-- /bloque -->", "preset.md:4: marcador de bloque mal escrito"],
  ];

  for (const [caso, texto, esperado] of malFormados) {
    it(`un bloque ${caso} invalida el archivo entero`, () => {
      const { bloques: leidos, avisos } = bloques(`<!-- bloque: fase-2/rol -->\nbueno\n<!-- /bloque -->\n${texto}`);

      assert.deepEqual(leidos, [], "no se aplica nada a medias");
      assert.equal(avisos.length, 1);
      assert.equal(avisos[0]?.codigo, "BLOQUE-MAL-FORMADO");
      assert.equal(avisos[0]?.texto, `${esperado}. Se ignora el archivo entero.`);
    });
  }

  it("el mismo identificador dos veces es BLOQUE-DUPLICADO y vale el primero", () => {
    const { bloques: leidos, avisos } = bloques(
      "<!-- bloque: fase-1/rol -->\nprimero\n<!-- /bloque -->\n<!-- bloque: fase-1/rol | despues -->\nsegundo\n<!-- /bloque -->"
    );

    assert.deepEqual(leidos.map((b) => b.contenido), ["primero"]);
    assert.equal(avisos[0]?.codigo, "BLOQUE-DUPLICADO");
    assert.match(avisos[0]?.texto ?? "", /preset\.md:4: el bloque «fase-1\/rol» ya aparece antes/);
  });
});

describe("leerBloques", () => {
  it("normaliza CRLF y BOM antes de parsear, y un archivo que no existe no tiene bloques", () => {
    const carpeta = carpetaTemporal("bloques");
    const archivo = path.join(carpeta, "bloques.md");
    fs.writeFileSync(archivo, "\uFEFF<!-- bloque: fase-1/rol -->\r\nuno\r\ndos\r\n<!-- /bloque -->\r\n", "utf-8");

    const { bloques: leidos, avisos } = leerBloques(archivo, CAPA);
    assert.deepEqual(avisos, []);
    assert.equal(leidos[0]?.contenido, "uno\ndos");
    assert.deepEqual(leerBloques(path.join(carpeta, "no-existe.md"), CAPA), { bloques: [], avisos: [] });
  });
});

const TEXTO = [
  "## ROL",
  "<!-- ranura: rol -->",
  "Eres X.",
  "<!-- /ranura -->",
  "",
  "## VERIFICACIÓN",
  "<!-- ranura: verificacion -->",
  "Ejecuta.",
  "<!-- /ranura -->",
].join("\n");

function aplicar(texto: string, ...definiciones: string[]) {
  const { bloques: leidos } = bloques(definiciones.join("\n"));
  return aplicarBloques(texto, "fase-1", leidos, () => "fábrica");
}

describe("aplicarBloques", () => {
  it("sin bloques, el texto queda idéntico", () => {
    assert.equal(aplicar(TEXTO).texto, TEXTO);
  });

  it("reemplazar sustituye el contenido de la ranura y conserva los marcadores", () => {
    const { texto } = aplicar(TEXTO, "<!-- bloque: fase-1/rol -->", "Eres Y.", "Y sabes Z.", "<!-- /bloque -->");

    assert.equal(texto, TEXTO.replace("Eres X.", "Eres Y.\nY sabes Z."));
  });

  it("antes y despues suman separados por una línea en blanco", () => {
    const { texto } = aplicar(
      TEXTO,
      "<!-- bloque: fase-1/verificacion | antes -->",
      "Primero mide.",
      "",
      "<!-- /bloque -->",
      "<!-- bloque: fase-1/rol | despues -->",
      "",
      "Y además Z.",
      "<!-- /bloque -->"
    );

    assert.ok(texto.includes("<!-- ranura: rol -->\nEres X.\n\nY además Z.\n<!-- /ranura -->"));
    assert.ok(texto.includes("<!-- ranura: verificacion -->\nPrimero mide.\n\nEjecuta.\n<!-- /ranura -->"));
  });

  it("los bloques se aplican en el orden en que llegan: un despues seguido de un reemplazar deja solo el segundo", () => {
    const { bloques: deUnaCapa } = bloques("<!-- bloque: fase-1/rol | despues -->\nañadido\n<!-- /bloque -->");
    const { bloques: deOtra } = parsearBloques("<!-- bloque: fase-1/rol -->\nsolo este\n<!-- /bloque -->", "bloques.md", {
      orden: 4,
      etiqueta: "proyecto",
      ruta: "x",
    });

    const { texto, procedencia } = aplicarBloques(TEXTO, "fase-1", [...deUnaCapa, ...deOtra], () => "fábrica");
    assert.ok(texto.includes("<!-- ranura: rol -->\nsolo este\n<!-- /ranura -->"));
    assert.deepEqual(procedencia[0], { ranura: "fase-1/rol", contenidoDe: "bloques.md:1", modos: [] });
  });

  it("la procedencia dice de dónde sale cada ranura y qué modos se aplicaron", () => {
    const { procedencia } = aplicar(TEXTO, "<!-- bloque: fase-1/verificacion | despues -->", "más", "<!-- /bloque -->");

    assert.deepEqual(procedencia, [
      { ranura: "fase-1/rol", contenidoDe: "fábrica", modos: [] },
      { ranura: "fase-1/verificacion", contenidoDe: "fábrica", modos: ["despues (preset.md:1)"] },
    ]);
  });

  it("un bloque de una ranura que no existe es huérfano; uno de otro archivo no se toca", () => {
    const { texto, huerfanos } = aplicar(
      TEXTO,
      "<!-- bloque: fase-1/verificaion -->",
      "x",
      "<!-- /bloque -->",
      "<!-- bloque: fase-3/pruebas -->",
      "y",
      "<!-- /bloque -->"
    );

    assert.equal(texto, TEXTO);
    assert.deepEqual(huerfanos.map((b) => b.id), ["fase-1/verificaion"]);
  });
});

describe("ranurasDe y omitirRanuraVacia", () => {
  it("encuentra las ranuras con sus marcadores", () => {
    assert.deepEqual(
      ranurasDe(TEXTO).map((r) => [r.nombre, r.apertura, r.cierre]),
      [
        ["rol", 1, 3],
        ["verificacion", 6, 8],
      ]
    );
  });

  it("quita una ranura vacía junto con su encabezado, y deja una con contenido", () => {
    const vacia = "## A\ntexto\n\n## REGLAS ADICIONALES\n<!-- ranura: extra -->\n<!-- /ranura -->\n";
    const llena = "## A\ntexto\n\n## REGLAS ADICIONALES\n<!-- ranura: extra -->\n- una regla\n<!-- /ranura -->\n";

    assert.equal(omitirRanuraVacia(vacia, "extra"), "## A\ntexto\n\n");
    assert.equal(omitirRanuraVacia(llena, "extra"), llena);
    assert.equal(omitirRanuraVacia("sin ranura", "extra"), "sin ranura");
  });
});
