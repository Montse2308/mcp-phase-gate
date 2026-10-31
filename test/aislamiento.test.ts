// El servidor MCP por stdio no carga nada del Studio. Se comprueba sobre el código
// compilado, siguiendo los imports estáticos de verdad —leídos con el analizador de TypeScript, no con
// una expresión regular— desde index.js: cada archivo alcanzado, y cada paquete que importa. El
// despacho de `ui` es un import() dinámico, que no se sigue: es justo lo que no carga el servidor.
//
// Se recorre build-test/src, la misma fuente compilada en cada `npm test`; build/ puede estar viejo
// (lo compila `npm run build`) y daría por bueno lo de antes.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import { isBuiltin } from "node:module";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const STUDIO = path.join(SRC, "studio");

// Los paquetes que puede cargar el servidor: sus dos dependencias de runtime.
const PAQUETES_PERMITIDOS = new Set(["@modelcontextprotocol/sdk", "zod"]);

type Imports = { estaticos: string[]; dinamicos: string[] };

function importsDe(archivo: string): Imports {
  const fuente = ts.createSourceFile(archivo, fs.readFileSync(archivo, "utf-8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const estaticos: string[] = [];
  const dinamicos: string[] = [];
  for (const sentencia of fuente.statements) {
    if ((ts.isImportDeclaration(sentencia) || ts.isExportDeclaration(sentencia)) && sentencia.moduleSpecifier && ts.isStringLiteral(sentencia.moduleSpecifier)) {
      estaticos.push(sentencia.moduleSpecifier.text);
    }
  }
  const visitar = (nodo: ts.Node): void => {
    if (ts.isCallExpression(nodo) && nodo.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argumento] = nodo.arguments;
      dinamicos.push(argumento && ts.isStringLiteral(argumento) ? argumento.text : "<expresión>");
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return { estaticos, dinamicos };
}

function paqueteDe(especificador: string): string {
  const partes = especificador.split("/");
  return especificador.startsWith("@") ? partes.slice(0, 2).join("/") : partes[0]!;
}

// Todo lo que alcanza un archivo por imports estáticos: los archivos propios (rutas absolutas) y los
// paquetes. Un import relativo que no resuelve a un archivo es un error del test, no se ignora.
function alcanzados(inicio: string): { archivos: Set<string>; paquetes: Set<string> } {
  const archivos = new Set<string>();
  const paquetes = new Set<string>();
  const pendientes = [inicio];
  while (pendientes.length) {
    const archivo = pendientes.pop()!;
    if (archivos.has(archivo)) continue;
    archivos.add(archivo);
    for (const especificador of importsDe(archivo).estaticos) {
      if (especificador.startsWith(".")) {
        const destino = path.resolve(path.dirname(archivo), especificador);
        assert.ok(fs.statSync(destino, { throwIfNoEntry: false })?.isFile(), `${archivo} importa ${especificador}, que no existe`);
        pendientes.push(destino);
      } else if (!isBuiltin(especificador)) {
        paquetes.add(paqueteDe(especificador));
      }
    }
  }
  return { archivos, paquetes };
}

const dentroDeStudio = (archivo: string): boolean => {
  const relativa = path.relative(STUDIO, archivo);
  return relativa === "" || (!relativa.startsWith("..") && !path.isAbsolute(relativa));
};

describe("aislamiento del servidor MCP", () => {
  it("desde index.js, ningún import estático llega a studio/ ni a un paquete que no sea el SDK o zod", () => {
    const { archivos, paquetes } = alcanzados(path.join(SRC, "index.js"));
    assert.ok(archivos.size > 15, `se recorrieron ${archivos.size} archivos`);
    assert.ok(archivos.has(path.join(SRC, "servidor.js")) && archivos.has(path.join(SRC, "cli.js")));
    const deStudio = [...archivos].filter(dentroDeStudio);
    assert.deepEqual(deStudio, [], `el servidor MCP carga archivos del Studio: ${deStudio.join(", ")}`);
    const ajenos = [...paquetes].filter((p) => !PAQUETES_PERMITIDOS.has(p));
    assert.deepEqual(ajenos, [], `el servidor MCP carga paquetes que no son de runtime: ${ajenos.join(", ")}`);
  });

  it("ningún archivo de src/ fuera de studio/ importa studio/ de forma estática", () => {
    const todos = fs.readdirSync(SRC, { recursive: true, encoding: "utf-8" }).filter((n) => n.endsWith(".js")).map((n) => path.join(SRC, n));
    for (const archivo of todos.filter((a) => !dentroDeStudio(a))) {
      for (const especificador of importsDe(archivo).estaticos) {
        if (!especificador.startsWith(".")) continue;
        assert.ok(!dentroDeStudio(path.resolve(path.dirname(archivo), especificador)), `${path.relative(SRC, archivo)} importa ${especificador}`);
      }
    }
  });

  // Control positivo: el mismo recorrido, desde un archivo del Studio, sí lo encuentra; y el despacho de
  // `ui` existe, como import dinámico en cli.js.
  it("control positivo: el recorrido sí ve studio/, y cli.js lo carga solo con import()", () => {
    const servidor = path.join(STUDIO, "servidor.js");
    assert.ok([...alcanzados(servidor).archivos].some(dentroDeStudio));
    const { estaticos, dinamicos } = importsDe(path.join(SRC, "cli.js"));
    assert.ok(dinamicos.includes("./studio/servidor.js"), `import() en cli.js: ${dinamicos.join(", ")}`);
    assert.ok(!estaticos.some((e) => e.includes("studio")));
  });
});
