// Copia los textos de la demo del Studio (test/fixtures/demo/es/ y en/) a build/studio/demo/, junto a demo.js: el
// paquete publicado no lleva test/, y `ui --demo` y `ui --export-static` los necesitan. Se copia de cero en
// cada build, para que un texto borrado no se quede en build/.
//
// Uso: node scripts/copiar-demo.mjs

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const origen = path.join(raiz, "test", "fixtures", "demo");
const destino = path.join(raiz, "build", "studio", "demo");

// unlinkSync y no rmSync: en Node 24.11 para Windows, rmSync no borra un nombre con acentos y no lanza.
function borrar(ruta) {
  const info = fs.lstatSync(ruta, { throwIfNoEntry: false });
  if (!info) return;
  if (info.isDirectory() && !info.isSymbolicLink()) {
    for (const nombre of fs.readdirSync(ruta)) borrar(path.join(ruta, nombre));
    fs.rmdirSync(ruta);
  } else fs.unlinkSync(ruta);
}

function copiar(de, a) {
  fs.mkdirSync(a, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(de, { withFileTypes: true })) {
    if (e.isDirectory()) n += copiar(path.join(de, e.name), path.join(a, e.name));
    else if (e.isFile()) {
      fs.copyFileSync(path.join(de, e.name), path.join(a, e.name));
      n++;
    }
  }
  return n;
}

borrar(destino);
console.log(`Textos de la demo: ${copiar(origen, destino)} archivos en build/studio/demo/.`);
