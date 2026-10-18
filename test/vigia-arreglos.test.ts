// Cada código que el diagnóstico puede emitir tiene su "cómo se arregla" en el Vigía (§7.7.4 del plan).
// Se leen los fuentes como texto: los códigos son cadenas literales en los archivos que arman hallazgos, y
// la tabla del frontend no se compila con los tests.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Desde la Etapa 6 los textos también tienen código (`mensaje("RUTA-FUERA")`, `fallo("LOTE-…")`, y `t("…")`, el
// atajo de diagnostico.ts): esos no
// son hallazgos y no cuentan. El texto de un hallazgo usa su mismo código, que sigue apareciendo donde se
// arma el hallazgo (`codigo: "X"`, `hallar("aviso", "X", …)`).
const CODIGO = /(?<!\b(?:mensaje|fallo|t|columnas|ErrorConCodigo)\()"([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)"/g;

function codigosDe(...archivos: string[]): Set<string> {
  const codigos = new Set<string>();
  for (const archivo of archivos) for (const m of fs.readFileSync(path.join(RAIZ, archivo), "utf-8").matchAll(CODIGO)) codigos.add(m[1]!);
  return codigos;
}

describe("Vigía: los arreglos", () => {
  it("cada código del diagnóstico tiene su arreglo, y no sobra ninguno", () => {
    const emitidos = codigosDe("src/diagnostico.ts", "src/capas.ts", "src/bloques.ts", "src/manifiesto.ts");
    const conArreglo = codigosDe("studio/src/vigia/arreglos.ts");
    assert.ok(emitidos.size >= 30, `${emitidos.size} códigos`);
    assert.deepEqual([...emitidos].filter((c) => !conArreglo.has(c)).sort(), [], "códigos sin arreglo");
    assert.deepEqual([...conArreglo].filter((c) => !emitidos.has(c)).sort(), [], "arreglos de códigos que ya no existen");
  });
});
