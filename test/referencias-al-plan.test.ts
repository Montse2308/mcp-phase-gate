// El bucle que lee el valor de cada clave $comentario no tiene otra red: la CI corre el script sobre el
// árbol versionado, que ya está limpio. Este test le pasa un JSON en memoria. El signo de sección cuenta
// cuando va literal, cuando va como escape unicode y cuando va entre comillas escapadas. Una clave distinta
// no cuenta: el JSON no admite comentarios y esa clave no es la que el script revisa.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Este archivo compila a build-test/test/; la raíz del repo está dos niveles arriba.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

type Hallazgo = { ruta: string; linea: number; donde: string; regla: string; renglon: string };
type Script = { hallazgosDe(ruta: string, texto: string): Hallazgo[] };
const { hallazgosDe } = (await import(pathToFileURL(path.join(RAIZ, "scripts", "referencias-al-plan.mjs")).href)) as Script;

const RUTA = "test/fixtures/demo/es/demo.json";

function porSeccion(texto: string): Hallazgo[] {
  return hallazgosDe(RUTA, texto).filter((h) => h.regla === "§");
}

describe("hallazgosDe y el valor de $comentario", () => {
  it("cuenta el signo de sección literal, el escape unicode y la cita entre comillas, y no una clave nota", () => {
    const casos = [
      '{\n  "$comentario": "Hay un § suelto."\n}\n',
      '{\n  "$comentario": "Hay un \\u00a7 suelto."\n}\n',
      '{\n  "$comentario": "Cita \\"§7.8\\"."\n}\n',
    ];
    for (const texto of casos) {
      const hallados = porSeccion(texto);
      assert.equal(hallados.length, 1);
      const hallado = hallados[0];
      assert.ok(hallado);
      assert.equal(hallado.ruta, RUTA);
      assert.equal(hallado.linea, 2);
      assert.equal(hallado.donde, "$comentario");
      assert.match(hallado.renglon, /§/);
    }

    const nota = '{\n  "nota": "Hay un §, un \\u00a7 y una cita \\"§7.8\\"."\n}\n';
    assert.deepEqual(hallazgosDe(RUTA, nota), []);

    const junto = '{\n  "$comentario": "Hay un § suelto.",\n  "nota": "Hay un § que no cuenta."\n}\n';
    const enLasDos = hallazgosDe(RUTA, junto);
    assert.equal(enLasDos.length, 1);
    assert.equal(enLasDos[0]?.donde, "$comentario");
    assert.equal(enLasDos[0]?.linea, 2);
  });
});
