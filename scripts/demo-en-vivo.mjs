// Un `ui --demo` de verdad, en una carpeta propia, para los scripts que graban o fotografían el Studio
// (grabar-studio.mjs y capturas-studio.mjs). Nunca lee la Documentación de quien lo corre: las cuatro
// PHASE_GATE_* apuntan a carpetas vacías y el temporal del sistema es uno nuevo, que es donde la demo se genera.
//
// La banda de la demo dice dónde está, y esa ruta sale en lo que se grabe: en la CI de Pages es /tmp/…, pero en
// un equipo puede llevar el nombre de quien graba. Se avisa; MEDIOS_TEMPORAL permite elegir otra base.

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

export async function lanzarDemoEnVivo({ raiz, idioma }) {
  const base = fs.realpathSync.native(process.env.MEDIOS_TEMPORAL ?? os.tmpdir());
  if (base.toLowerCase().includes(os.userInfo().username.toLowerCase())) {
    console.warn(`Aviso: la ruta de la demo (${base}) lleva el nombre del usuario y saldrá en la banda: no publiques estos medios.`);
  }
  const trabajo = fs.mkdtempSync(path.join(base, "mcp-phase-gate-medios-"));
  const temporal = path.join(trabajo, "tmp");
  const vacias = Object.fromEntries(["DOCS", "REPOS", "STATE", "CONFIG"].map((n) => [`PHASE_GATE_${n}_PATH`, path.join(trabajo, n.toLowerCase())]));
  for (const carpeta of [temporal, ...Object.values(vacias)]) fs.mkdirSync(carpeta, { recursive: true });
  const limpio = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PHASE_GATE_|ORQUESTADOR_|GIT_)/i.test(k)));
  const hijo = spawn(process.execPath, [path.join(raiz, "build", "index.js"), "ui", "--demo", "--no-abrir", "--idioma", idioma], {
    env: { ...limpio, ...vacias, PHASE_GATE_LANG: idioma, TEMP: temporal, TMP: temporal, TMPDIR: temporal },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const enlace = await new Promise((resolver, rechazar) => {
    let texto = "";
    const plazo = setTimeout(() => rechazar(new Error(`ui --demo no imprimió su enlace: ${texto}`)), 120_000);
    const leer = (d) => {
      texto += d.toString("utf-8");
      const m = texto.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);
      if (m) {
        clearTimeout(plazo);
        resolver(new URL(m[0]));
      }
    };
    hijo.stdout.on("data", leer);
    hijo.stderr.on("data", leer);
    hijo.on("exit", (codigo) => rechazar(new Error(`ui --demo terminó con ${codigo}: ${texto}`)));
  });
  // El token es de un solo uso: se canjea aquí una vez y cada contexto del navegador recibe la cookie.
  const canje = await fetch(enlace, { redirect: "manual" });
  const [nombre, valor] = (canje.headers.get("set-cookie") ?? "").split(";")[0].split("=");
  const sufijo = idioma === "es" ? "" : `-${idioma}`;
  const raizDeLaDemo = path.join(temporal, process.getuid ? `mcp-phase-gate-demo${sufijo}-${process.getuid()}` : `mcp-phase-gate-demo${sufijo}`);

  return {
    origen: enlace.origin,
    cookie: { name: nombre, value: valor },
    raizDeLaDemo,
    async detener() {
      hijo.kill();
      await new Promise((r) => (hijo.exitCode !== null ? r() : hijo.on("exit", r)));
      try {
        const { borrarDemo } = await import(pathToFileURL(path.join(raiz, "build", "studio", "demo.js")).href);
        if (fs.existsSync(raizDeLaDemo)) borrarDemo(raizDeLaDemo);
      } catch {
        // la demo vive en el temporal de este trabajo: se borra con él
      }
      fs.rmSync(trabajo, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
