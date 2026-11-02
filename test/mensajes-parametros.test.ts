// Cada llamada a mensaje() o fallo() con un código fijo pasa los parámetros que pide su plantilla, ni más ni
// menos. Las plantillas reciben `any` en tiempo de compilación
// (i18n/textos/tipos.ts), así que un parámetro mal escrito compilaba y salía como "undefined" en el texto.
// Se comprueba leyendo el código fuente con el compilador de TypeScript: el tipo que declara el primer
// parámetro de la plantilla frente a las claves del objeto que se le pasa. Una llamada puede salir en
// cualquiera de los dos idiomas, así que pide lo que pidan los dos (PENDIENTES-ESTADO solo usa `estado` en
// inglés).

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.join(RAIZ, "src");
const TEXTOS = path.join(SRC, "i18n", "textos");

type Forma = { claves: Set<string>; obligatorias: Set<string> };
// null: la plantilla es un texto fijo; "?": su tipo no se puede leer aquí (no se comprueba).
type Firma = Forma[] | null | "?";

function leer(archivo: string): ts.SourceFile {
  return ts.createSourceFile(archivo, fs.readFileSync(archivo, "utf-8"), ts.ScriptTarget.Latest, true);
}

function formaDe(tipo: ts.TypeNode, alias: Map<string, ts.TypeNode>): Forma[] | "?" {
  if (ts.isParenthesizedTypeNode(tipo)) return formaDe(tipo.type, alias);
  if (ts.isTypeLiteralNode(tipo)) {
    const forma: Forma = { claves: new Set(), obligatorias: new Set() };
    for (const miembro of tipo.members) {
      if (!ts.isPropertySignature(miembro) || !miembro.name) return "?";
      const nombre = miembro.name.getText();
      forma.claves.add(nombre);
      if (!miembro.questionToken) forma.obligatorias.add(nombre);
    }
    return [forma];
  }
  if (ts.isUnionTypeNode(tipo)) {
    const formas: Forma[] = [];
    for (const t of tipo.types) {
      const f = formaDe(t, alias);
      if (f === "?") return "?";
      formas.push(...f);
    }
    return formas;
  }
  if (ts.isTypeReferenceNode(tipo) && alias.has(tipo.typeName.getText())) return formaDe(alias.get(tipo.typeName.getText())!, alias);
  // A & (B | C) es (A & B) | (A & C).
  if (ts.isIntersectionTypeNode(tipo)) {
    let formas: Forma[] = [{ claves: new Set(), obligatorias: new Set() }];
    for (const t of tipo.types) {
      const f = formaDe(t, alias);
      if (f === "?") return "?";
      formas = formas.flatMap((a) => f.map((b) => unir(a, b)));
    }
    return formas;
  }
  return "?";
}

function unir(a: Forma, b: Forma): Forma {
  return { claves: new Set([...a.claves, ...b.claves]), obligatorias: new Set([...a.obligatorias, ...b.obligatorias]) };
}

function firmaDe(valor: ts.Expression, alias: Map<string, ts.TypeNode>): Firma {
  if (!ts.isArrowFunction(valor) && !ts.isFunctionExpression(valor)) return null;
  const tipo = valor.parameters[0]?.type;
  return valor.parameters.length === 0 ? null : tipo ? formaDe(tipo, alias) : "?";
}

// La de los dos idiomas: lo que pide cualquiera de los dos.
function juntar(es: Firma, en: Firma): Firma {
  if (es === "?" || en === "?") return "?";
  if (es === null) return en;
  if (en === null) return es;
  return es.length === en.length ? es.map((f, i) => unir(f, en[i]!)) : "?";
}

// Las plantillas de todos los catálogos, por código: la firma de sus dos versiones.
function plantillas(): Map<string, Firma> {
  const firmas = new Map<string, Firma>();
  for (const nombre of fs.readdirSync(TEXTOS).filter((n) => n.endsWith(".ts") && n !== "tipos.ts")) {
    const fuente = leer(path.join(TEXTOS, nombre));
    const alias = new Map<string, ts.TypeNode>();
    fuente.forEachChild((n) => {
      if (ts.isTypeAliasDeclaration(n)) alias.set(n.name.text, n.type);
    });
    const visitar = (n: ts.Node): void => {
      if (ts.isVariableDeclaration(n) && n.name.getText().startsWith("TEXTOS_") && n.initializer) {
        let objeto: ts.Expression = n.initializer;
        while (ts.isSatisfiesExpression(objeto) || ts.isAsExpression(objeto)) objeto = objeto.expression;
        if (!ts.isObjectLiteralExpression(objeto)) return;
        for (const p of objeto.properties) {
          if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
          const codigo = ts.isStringLiteral(p.name) ? p.name.text : p.name.getText();
          const textos = p.initializer;
          const de = (idioma: string): ts.PropertyAssignment | undefined =>
            textos.properties.find((q): q is ts.PropertyAssignment => ts.isPropertyAssignment(q) && q.name.getText() === idioma);
          const es = de("es");
          const en = de("en");
          if (!es || !en) continue;
          firmas.set(codigo, juntar(firmaDe(es.initializer, alias), firmaDe(en.initializer, alias)));
        }
        return;
      }
      ts.forEachChild(n, visitar);
    };
    visitar(fuente);
  }
  return firmas;
}

function archivosDeSrc(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) return ruta === TEXTOS ? [] : archivosDeSrc(ruta);
    return e.name.endsWith(".ts") ? [ruta] : [];
  });
}

type Llamada = { donde: string; codigo: string; claves: Set<string> | null; conObjeto: boolean };

// mensaje("CODIGO", { … }) y fallo("CODIGO", { … }) con el código escrito tal cual. `claves` null: el objeto
// lleva un spread, y no se puede saber qué claves tiene.
function llamadas(): Llamada[] {
  const todas: Llamada[] = [];
  for (const archivo of archivosDeSrc(SRC)) {
    const fuente = leer(archivo);
    const visitar = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ["mensaje", "fallo"].includes(n.expression.text)) {
        const [primero, segundo] = n.arguments;
        if (primero && (ts.isStringLiteral(primero) || ts.isNoSubstitutionTemplateLiteral(primero))) {
          const { line } = fuente.getLineAndCharacterOfPosition(n.getStart());
          const donde = `${path.relative(RAIZ, archivo)}:${line + 1}`;
          if (!segundo) {
            todas.push({ donde, codigo: primero.text, claves: new Set(), conObjeto: false });
          } else if (ts.isObjectLiteralExpression(segundo)) {
            const claves = new Set<string>();
            let conSpread = false;
            for (const p of segundo.properties) {
              if (ts.isSpreadAssignment(p)) conSpread = true;
              else if (p.name) claves.add(ts.isStringLiteral(p.name) ? p.name.text : p.name.getText());
            }
            todas.push({ donde, codigo: primero.text, claves: conSpread ? null : claves, conObjeto: true });
          }
        }
      }
      ts.forEachChild(n, visitar);
    };
    visitar(fuente);
  }
  return todas;
}

describe("los parámetros de cada mensaje", () => {
  const firmas = plantillas();
  const todas = llamadas();

  it("se leen las plantillas y las llamadas (la comprobación no está vacía)", () => {
    assert.ok(firmas.size > 600, `${firmas.size} plantillas`);
    assert.ok(todas.length > 400, `${todas.length} llamadas`);
    const sinLeer = [...firmas.entries()].filter(([, f]) => f === "?").map(([c]) => c);
    assert.deepEqual(sinLeer, [], "plantillas cuyo tipo de parámetros no se puede leer");
  });

  it("cada llamada con un código fijo usa un código que existe", () => {
    assert.deepEqual(todas.filter((l) => !firmas.has(l.codigo)).map((l) => `${l.donde} ${l.codigo}`), []);
  });

  it("cada llamada pasa las claves obligatorias de su plantilla y ninguna que no declare", () => {
    const malas: string[] = [];
    for (const l of todas) {
      const firma = firmas.get(l.codigo);
      if (firma === undefined || firma === "?" || l.claves === null) continue;
      if (firma === null) {
        if (l.claves.size) malas.push(`${l.donde} ${l.codigo}: es un texto fijo y recibe ${[...l.claves].join(", ")}`);
        continue;
      }
      const vale = firma.some((f) => [...f.obligatorias].every((c) => l.claves!.has(c)) && [...l.claves!].every((c) => f.claves.has(c)));
      if (!vale) {
        const f = firma[0]!;
        const faltan = [...f.obligatorias].filter((c) => !l.claves!.has(c));
        const sobran = [...l.claves].filter((c) => !firma.some((g) => g.claves.has(c)));
        malas.push(`${l.donde} ${l.codigo}:${faltan.length ? ` faltan ${faltan.join(", ")}` : ""}${sobran.length ? ` sobran ${sobran.join(", ")}` : ""}`);
      }
    }
    assert.deepEqual(malas, []);
  });
});
