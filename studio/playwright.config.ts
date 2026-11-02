// Los E2E del Studio en Chromium real. No forman parte de `npm test`: se corren con
// `npm run test:e2e`, después de `npm run build` (lanzan el binario compilado). Los navegadores van dentro
// de node_modules (PLAYWRIGHT_BROWSERS_PATH=0): `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`.
// Los resultados se escriben en la carpeta temporal del sistema, no en el repo.
//
// El navegador va en español (locale es-ES): la interfaz toma el idioma de navigator.languages, y las
// pruebas de las vistas comprueban sus textos en español. Las de la interfaz en inglés (idioma.spec.ts)
// lo cambian con su propio locale o con #?lang=en.

import * as os from "node:os";
import * as path from "node:path";

import { defineConfig } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";

export default defineConfig({
  testDir: "./e2e",
  outputDir: path.join(os.tmpdir(), "mcp-phase-gate-e2e"),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    headless: true,
    locale: "es-ES",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
