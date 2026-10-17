// Genera schema/project.json y schema/machine.json a partir de los shapes zod de src/manifiesto.ts.
// Se ejecuta después de compilar:
//
//   npm run build && node scripts/generar-esquemas.mjs
//
// No se escriben a mano: un test (test/manifiesto.test.ts) exige que lo publicado coincida con lo
// que sale de aquí, así que cambiar un shape sin regenerar los esquemas deja la suite en rojo.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { esquemasPublicados, textoDeEsquema } = await import(pathToFileURL(path.join(raiz, "build", "manifiesto.js")).href);

const carpeta = path.join(raiz, "schema");
fs.mkdirSync(carpeta, { recursive: true });

for (const [nombre, esquema] of Object.entries(esquemasPublicados())) {
  const destino = path.join(carpeta, nombre);
  fs.writeFileSync(destino, textoDeEsquema(esquema), "utf-8");
  console.log(`escrito ${path.relative(raiz, destino)}`);
}
