// El frontend del Studio (§7.2 del plan): Vite + Preact, compilado a studio/dist, que viaja en el paquete.
//
// base "./": todas las rutas son relativas, así que el mismo build funciona en 127.0.0.1:<puerto>/ y
// bajo un subdirectorio (GitHub Pages sirve el sitio en /mcp-phase-gate/). assetsInlineLimit 0: nada se
// incrusta como data: (la CSP solo admite fuentes de 'self'), y sin el polyfill de modulepreload, que
// no hace falta en los navegadores de hoy.

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: raiz,
  base: "./",
  publicDir: path.join(raiz, "public"),
  plugins: [preact()],
  build: {
    outDir: path.join(raiz, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: false,
    target: "es2022",
  },
});
