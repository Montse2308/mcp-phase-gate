// Saca los comentarios de los archivos del repo y los nombres de sus tests. Lo usan los scripts que revisan
// comentarios (referencias-al-plan.mjs y comentarios-en-espanol.mjs); no se corre solo.
//
// El código (.ts, .tsx, .mjs, .js) se lee con el AST de TypeScript, no con expresiones regulares: así un `//`
// dentro de una cadena, de una plantilla o de un texto JSX no cuenta como comentario. Los demás formatos se
// leen con un recorrido sencillo que respeta las cadenas.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

// Un comentario: { linea (la de su primer renglón, desde 1), texto (con sus delimitadores), lineas (el texto de
// cada renglón, ya sin delimitadores ni asteriscos de guía), desde (su posición en el texto, solo en los
// formatos que no pasan por el AST) }.
function comentario(linea, texto, desde) {
  const lineas = texto
    .replace(/^\s*(\/\/+|\/\*+|#+|<!--)/, "")
    .replace(/(\*+\/|-->)\s*$/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*\*+(?!\/)\s?/, "").trim());
  return { linea, texto, lineas, desde };
}

// ¿Este módulo es el que lanzó node? Se comparan las rutas reales: si el script se lanza por un enlace o un
// junction, process.argv[1] trae la ruta del enlace y import.meta.url la real, y una comparación directa
// daría que no.
export function esElPrincipal(url) {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync.native(process.argv[1]) === fs.realpathSync.native(fileURLToPath(url));
  } catch {
    return false;
  }
}

function lineaDe(texto, pos) {
  let n = 1;
  for (let i = texto.indexOf("\n"); i !== -1 && i < pos; i = texto.indexOf("\n", i + 1)) n++;
  return n;
}

export function comentariosDeCodigo(texto, nombre) {
  const fuente = ts.createSourceFile(nombre, texto, ts.ScriptTarget.Latest, true);
  const vistos = new Set();
  const salida = [];
  // El texto de un JSX no es código: lo que parezca un comentario ahí es parte del texto. El `>` que lo
  // precede lo lee TypeScript como el final de un nodo con un comentario `//` detrás, así que se descartan los
  // rangos que empiezan dentro de un texto JSX.
  const textosJsx = [];
  const buscarJsx = (nodo) => {
    if (nodo.kind === ts.SyntaxKind.JsxText) textosJsx.push([nodo.pos, nodo.end]);
    ts.forEachChild(nodo, buscarJsx);
  };
  buscarJsx(fuente);
  const anotar = (r) => {
    if (vistos.has(r.pos)) return;
    vistos.add(r.pos);
    if (textosJsx.some(([desde, hasta]) => r.pos >= desde && r.pos < hasta)) return;
    salida.push(comentario(fuente.getLineAndCharacterOfPosition(r.pos).line + 1, texto.slice(r.pos, r.end)));
  };
  const visitar = (nodo) => {
    // El texto de un JSX no es código: lo que parezca un comentario ahí es parte del texto.
    if (nodo.kind !== ts.SyntaxKind.JsxText) {
      for (const r of ts.getLeadingCommentRanges(texto, nodo.getFullStart()) ?? []) anotar(r);
      for (const r of ts.getTrailingCommentRanges(texto, nodo.getEnd()) ?? []) anotar(r);
    }
    for (const hijo of nodo.getChildren(fuente)) visitar(hijo);
  };
  visitar(fuente);
  // El shebang no es un comentario del autor: lo lee el sistema para saber con qué ejecutar el archivo.
  return salida.filter((c) => !c.texto.startsWith("#!")).sort((a, b) => a.linea - b.linea);
}

// CSS y JSON: /* … */ y, en JSON con comentarios, también // … hasta el fin de la línea. Respeta las cadenas y,
// en CSS, el contenido sin comillas de url(…).
export function comentariosEstiloC(texto, { deLinea }) {
  const salida = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '"' || c === "'") {
      i++;
      while (i < texto.length && texto[i] !== c && texto[i] !== "\n") i += texto[i] === "\\" ? 2 : 1;
      i++;
    } else if (!deLinea && /^url\(\s*[^"'\s)]/i.test(texto.slice(i, i + 12))) {
      i = texto.indexOf(")", i) === -1 ? texto.length : texto.indexOf(")", i) + 1;
    } else if (c === "/" && texto[i + 1] === "*") {
      const fin = texto.indexOf("*/", i + 2);
      const hasta = fin === -1 ? texto.length : fin + 2;
      salida.push(comentario(lineaDe(texto, i), texto.slice(i, hasta), i));
      i = hasta;
    } else if (deLinea && c === "/" && texto[i + 1] === "/") {
      const fin = texto.indexOf("\n", i);
      const hasta = fin === -1 ? texto.length : fin;
      salida.push(comentario(lineaDe(texto, i), texto.slice(i, hasta), i));
      i = hasta;
    } else {
      i++;
    }
  }
  return salida;
}

// YAML, .gitignore, CODEOWNERS, .env.example y las cintas de VHS: un # al principio de la línea o después de un
// espacio, fuera de las comillas, abre un comentario hasta el fin de la línea. Una comilla solo abre una cadena
// al principio de un valor (así el apóstrofo de «don't» no esconde el # que venga después).
export function comentariosDeAlmohadilla(texto) {
  const salida = [];
  let desdeDelRenglon = 0;
  texto.split("\n").forEach((renglon, idx) => {
    const inicio = desdeDelRenglon;
    desdeDelRenglon += renglon.length + 1;
    let comilla = null;
    for (let i = 0; i < renglon.length; i++) {
      const c = renglon[i];
      if (comilla) {
        if (c === "\\" && comilla === '"') i++;
        else if (c === comilla) comilla = null;
      } else if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:(=]/.test(renglon[i - 1]))) {
        comilla = c;
      } else if (c === "#" && (i === 0 || /\s/.test(renglon[i - 1]))) {
        salida.push(comentario(idx + 1, renglon.slice(i), inicio + i));
        break;
      }
    }
  });
  return salida;
}

export function comentariosHtml(texto) {
  return [...texto.matchAll(/<!--[\s\S]*?-->/g)].map((m) => comentario(lineaDe(texto, m.index), m[0], m.index));
}

const ESTILO_DE_ALMOHADILLA = new Set([".gitignore", ".gitattributes", "CODEOWNERS", ".env.example"]);
const EXTENSIONES_DE_CODIGO = [".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js"];

// Los comentarios de un archivo según su tipo, o null si ese tipo no tiene comentarios que revisar.
export function comentariosDe(ruta, texto) {
  const ext = path.posix.extname(ruta);
  const nombre = path.posix.basename(ruta);
  if (EXTENSIONES_DE_CODIGO.includes(ext)) return comentariosDeCodigo(texto, ruta);
  if (ext === ".css") return comentariosEstiloC(texto, { deLinea: false });
  if ([".json", ".jsonc"].includes(ext)) return comentariosEstiloC(texto, { deLinea: true });
  if ([".yml", ".yaml", ".tape"].includes(ext) || ESTILO_DE_ALMOHADILLA.has(nombre)) return comentariosDeAlmohadilla(texto);
  if (ext === ".html") return comentariosHtml(texto);
  return null;
}

// El texto sin sus comentarios, para los formatos que no pasan por el AST (CSS, HTML y los de almohadilla), o
// null si el tipo no es uno de ellos. Sirve para comparar dos versiones de un archivo: quedan solo los
// renglones con contenido, sin espacios al final.
export function sinComentarios(ruta, texto) {
  const ext = path.posix.extname(ruta);
  const nombre = path.posix.basename(ruta);
  let comentarios;
  if (ext === ".css") comentarios = comentariosEstiloC(texto, { deLinea: false });
  else if (ext === ".html") comentarios = comentariosHtml(texto);
  else if ([".yml", ".yaml", ".tape"].includes(ext) || ESTILO_DE_ALMOHADILLA.has(nombre)) comentarios = comentariosDeAlmohadilla(texto);
  else return null;
  let salida = "";
  let desde = 0;
  for (const c of comentarios) {
    salida += texto.slice(desde, c.desde);
    desde = c.desde + c.texto.length;
    // Un comentario entre dos espacios («:root /* t */ {») no deja dos: queda el que ya había.
    while (/[ \t]$/.test(salida) && /[ \t]/.test(texto[desde] ?? "")) desde++;
  }
  salida += texto.slice(desde);
  return salida
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l !== "")
    .join("\n");
}

// it, test, describe y suite, con sus variantes (.only, .skip…), y los subtests de node:test, que cuelgan del
// contexto del test (`t.test`, `ctx.it`). Un `.test` de otro objeto (`patron.test("texto")`) no cuenta.
const LLAMADA_DE_TEST = /^(?:it|test|describe|suite)(?:\.(?:only|skip|todo|describe|step|serial|parallel|fixme|fail|slow))*$|^(?:t|ctx|context)\.(?:test|it|describe|suite)(?:\.(?:only|skip|todo))*$/;
// it.each(tabla)("nombre", …): el nombre va en la segunda llamada.
const LLAMADA_CON_TABLA = /^(?:it|test|describe|suite)(?:\.[a-z]+)*\.(?:each|for)$/;

// Los nombres de los tests: el primer argumento (con sus comillas) de it(…), test(…), describe(…) y sus
// variantes. Acepta una cadena, una plantilla o varias cadenas unidas con `+`.
export function nombresDeTests(texto, nombre) {
  if (!EXTENSIONES_DE_CODIGO.includes(path.posix.extname(nombre))) return [];
  const fuente = ts.createSourceFile(nombre, texto, ts.ScriptTarget.Latest, true);
  const salida = [];
  const esNombre = (n) => ts.isStringLiteralLike(n) || ts.isTemplateExpression(n) || (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken);
  const visitar = (nodo) => {
    if (ts.isCallExpression(nodo)) {
      const llamada = nodo.expression.getText(fuente);
      const conTabla = ts.isCallExpression(nodo.expression) && LLAMADA_CON_TABLA.test(nodo.expression.expression.getText(fuente));
      if (conTabla || LLAMADA_DE_TEST.test(llamada)) {
        const [primero] = nodo.arguments;
        if (primero && esNombre(primero)) {
          salida.push({ linea: fuente.getLineAndCharacterOfPosition(primero.getStart(fuente)).line + 1, texto: primero.getText(fuente) });
        }
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return salida;
}
