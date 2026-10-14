// Los comandos /f1…/fN viven en dos sitios: versionados en .claude/commands/ (los que usa
// Claude Code) y copiados en docs/comandos-de-fase.md (para leerlos, o pegarlos en un cliente
// sin comandos). Dos copias del mismo texto se desincronizan en cuanto alguien edita una sola,
// así que este test obliga a que sean idénticas.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CARPETA_COMANDOS = path.join(RAIZ, ".claude", "commands");
const DOCUMENTO = path.join(RAIZ, "docs", "comandos-de-fase.md");

// Los archivos propios pueden llegar en CRLF (§1.3 del plan): se compara el texto, no los bytes.
function leerTexto(ruta: string): string {
  return fs.readFileSync(ruta, "utf-8").replace(/\r\n/g, "\n");
}

// El bloque de código que sigue a la sección "## `fN.md` — …" del documento.
function bloquesDelDocumento(): Map<string, string> {
  const bloques = new Map<string, string>();
  const seccion = /^## `(f\d+\.md)`.*\n+```[a-z]*\n([\s\S]*?)\n```$/gm;

  for (const encontrado of leerTexto(DOCUMENTO).matchAll(seccion)) {
    bloques.set(encontrado[1]!, encontrado[2]!);
  }
  return bloques;
}

function comandos(): string[] {
  return fs
    .readdirSync(CARPETA_COMANDOS)
    .filter((nombre) => /^f\d+\.md$/.test(nombre))
    .sort();
}

describe("sincronía de los comandos de fase", () => {
  it("hay comandos que comprobar", () => {
    assert.ok(comandos().length > 0, `no hay f<N>.md en ${CARPETA_COMANDOS}`);
  });

  for (const nombre of comandos()) {
    it(`.claude/commands/${nombre} es idéntico a su bloque en docs/comandos-de-fase.md`, () => {
      const bloque = bloquesDelDocumento().get(nombre);
      assert.ok(bloque !== undefined, `docs/comandos-de-fase.md no tiene la sección \`${nombre}\``);

      // El archivo termina en salto de línea; el bloque, en la línea anterior a la valla.
      const archivo = leerTexto(path.join(CARPETA_COMANDOS, nombre)).replace(/\n$/, "");
      assert.equal(bloque, archivo);
    });
  }

  it("docs/comandos-de-fase.md no documenta comandos que no existen", () => {
    assert.deepEqual([...bloquesDelDocumento().keys()].sort(), comandos());
  });
});
