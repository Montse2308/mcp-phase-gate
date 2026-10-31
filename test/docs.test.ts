// Los comandos /f1…/fN tienen una fuente, prompts/es/comandos/ (la que el servidor sirve como MCP
// Prompts y la que viaja en el paquete), y una copia versionada en .claude/commands/ para quien
// trabaja en este repo con Claude Code o con un cliente que no muestra bien los prompts. Dos
// copias del mismo texto se desincronizan en cuanto alguien edita una sola, así que este test
// obliga a que sean idénticas.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FUENTE = path.join(RAIZ, "prompts", "es", "comandos");
const COPIA = path.join(RAIZ, ".claude", "commands");
const DOCUMENTO = path.join(RAIZ, "docs", "comandos-de-fase.md");

// Los archivos propios pueden llegar en CRLF: se compara el texto, no los bytes.
function leerTexto(ruta: string): string {
  return fs.readFileSync(ruta, "utf-8").replace(/\r\n/g, "\n");
}

function comandos(carpeta: string): string[] {
  return fs
    .readdirSync(carpeta)
    .filter((nombre) => /^f\d+\.md$/.test(nombre))
    .sort();
}

describe("sincronía de los comandos de fase", () => {
  it("hay comandos que comprobar", () => {
    assert.ok(comandos(FUENTE).length > 0, `no hay f<N>.md en ${FUENTE}`);
  });

  it(".claude/commands/ tiene exactamente los mismos comandos que prompts/es/comandos/", () => {
    assert.deepEqual(comandos(COPIA), comandos(FUENTE));
  });

  for (const nombre of comandos(FUENTE)) {
    it(`.claude/commands/${nombre} es idéntico a prompts/es/comandos/${nombre}`, () => {
      const copia = path.join(COPIA, nombre);
      assert.ok(fs.existsSync(copia), `falta ${copia}`);
      assert.equal(leerTexto(copia), leerTexto(path.join(FUENTE, nombre)));
    });
  }

  // El documento ya no copia los comandos: remite a la fuente. Una copia más sería una más que
  // desincronizar.
  it("docs/comandos-de-fase.md remite a prompts/es/comandos/ y no copia ningún comando", () => {
    const documento = leerTexto(DOCUMENTO);
    assert.match(documento, /prompts\/es\/comandos/);
    // Cualquier línea con contenido de un comando delata una copia, no solo la primera. Las
    // cortas ("Pasos:") se saltan: pueden coincidir sin ser copia.
    for (const nombre of comandos(FUENTE)) {
      const lineas = leerTexto(path.join(FUENTE, nombre))
        .split("\n")
        .map((linea) => linea.trim())
        .filter((linea) => linea.length >= 30);
      for (const linea of lineas) {
        assert.equal(documento.includes(linea), false, `docs/comandos-de-fase.md copia de ${nombre}: "${linea}"`);
      }
    }
  });
});
