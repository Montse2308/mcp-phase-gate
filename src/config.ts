// Configuración del servidor: rutas del entorno, ubicación del estado e identidad.
//
// Todo lo que sale del entorno se lee en cada llamada, no una vez al importar el módulo.
// Es lo que ya hacía `requireBasePath` y aquí se extiende al resto: un valor capturado al
// arrancar obliga a reiniciar el cliente para cambiarlo, y vuelve imposible probar una
// función con otra configuración sin recargar el módulo entero.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Carpeta de este módulo. Sirve para localizar el .env y el package.json de la raíz del repo.
export const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// Carga el archivo .env de la raíz del repo (un nivel arriba de build/ o src/).
// Así cada dispositivo define sus propias rutas sin tocar el mcp.json.
// quiet: true evita que dotenv v17 imprima su banner en stdout, que es el canal del JSON-RPC.
dotenv.config({ path: path.join(MODULE_DIR, "..", ".env"), quiet: true });

// Paths absolutos del entorno. Se configuran por variable de entorno (vía .env o el bloque
// "env" del mcp.json) para poder usar el MCP en distintos dispositivos sin recompilar.
//
// No tienen valor por defecto, a propósito. Un default es siempre la ruta del equipo de
// quien escribió el código: en cualquier otro dispositivo el servidor arrancaba "bien" y el
// error salía mucho después, dentro de una tool, disfrazado de "no encontré el archivo" y
// sin mencionar que lo que faltaba era configurar una variable.
export type RutaRequerida = { variable: string; apuntaA: string };

export const DOCS: RutaRequerida = {
  variable: "ORQUESTADOR_DOCS_PATH",
  apuntaA: "la carpeta raíz de la Documentación Central",
};

export const REPOS: RutaRequerida = {
  variable: "ORQUESTADOR_REPOS_PATH",
  apuntaA: "la carpeta que contiene tus repositorios de código",
};

// Se resuelve y valida en cada llamada, no una vez al arrancar. Así el servidor se queda en
// pie aunque falte configuración, las tools que no dependen de estas rutas siguen sirviendo,
// y el error llega al chat —donde está el usuario— en vez de quedarse enterrado en un log.
export function requireBasePath({ variable, apuntaA }: RutaRequerida): string {
  const valor = process.env[variable]?.trim();

  if (!valor) {
    throw new Error(
      `Falta la variable ${variable}, que debe apuntar a ${apuntaA}. Defínela en el archivo ` +
        `.env de la raíz del repo, o en el bloque "env" del mcp.json de tu cliente.`
    );
  }

  const ruta = path.resolve(valor);

  // Una variable definida pero incorrecta falla igual de tarde que una ausente, así que la
  // existencia se comprueba aquí. El caso del encoding ya mordió una vez y no es adivinable.
  if (!fs.existsSync(ruta)) {
    throw new Error(
      `${variable} apunta a "${ruta}", que no existe en este equipo. Corrige la ruta en el .env. ` +
        `Si lleva acentos, revisa que el .env esté guardado en UTF-8 sin BOM: en UTF-16 los ` +
        `acentos llegan rotos y la carpeta parece no existir.`
    );
  }

  if (!fs.statSync(ruta).isDirectory()) {
    throw new Error(`${variable} apunta a "${ruta}", que es un archivo y no una carpeta.`);
  }

  return ruta;
}

// Subcarpeta donde viven las tareas dentro de cada proyecto (ej. PROYECTO-A/Proyectos/<tarea>).
// Es una convención de organización, no una ruta de dispositivo, pero vive en el entorno
// para no tener que introducir un archivo de configuración por una sola cadena.
// Vacía a propósito significa que las tareas cuelgan directo del proyecto.
export function tasksSubdir(): string {
  return process.env.ORQUESTADOR_TASKS_SUBDIR?.trim() ?? "Proyectos";
}

// Carpeta con los prompts de las fases, en archivos .md sueltos.
// Vivir fuera del código permite afinar el texto de una fase sin recompilar:
// se edita el .md y la siguiente llamada a get_phase_prompt ya trae la versión nueva.
// Configurable para que alguien más pueda apuntar a su propio juego de prompts sin forkear.
export function promptsPath(): string {
  return process.env.ORQUESTADOR_PROMPTS_PATH || path.join(MODULE_DIR, "..", "prompts");
}

// ─── Estado local ───────────────────────────────────────────────────────────
// El estado vive en la carpeta de datos del usuario, NO junto al build. `build/` es una
// carpeta generada: borrarla para recompilar desde cero se llevaba el estado por delante.
// Además, esta ubicación es la única que funciona cuando el servidor se ejecuta desde un
// paquete instalado, sin repo alrededor.
export const APP_DIR_NAME = "mcp-orquestador";

export function stateDir(): string {
  if (process.env.ORQUESTADOR_STATE_PATH) {
    return process.env.ORQUESTADOR_STATE_PATH;
  }

  const home = os.homedir();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, APP_DIR_NAME);
  }

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_DIR_NAME);
  }

  const stateHome = process.env.XDG_STATE_HOME || path.join(home, ".local", "state");
  return path.join(stateHome, APP_DIR_NAME);
}

// El nombre es plural porque el archivo guarda un puntero por proyecto, no una sola tarea.
// El singular `active_task.json` fue el formato anterior y ya no se lee: ver `limpiarEstadoViejo`.
export function stateFile(): string {
  return path.join(stateDir(), "active-tasks.json");
}

// ─── Identidad del servidor ─────────────────────────────────────────────────
// Es lo que el cliente muestra en su panel de MCP. Se llamaba "cursor-mcp-orchestrator",
// que era doblemente equivocado: el servidor habla MCP estándar y funciona igual en VS Code
// o Claude Code, donde leer "cursor-" desorienta; y "orchestrator" no dice qué orquesta.
// "phase-gate" es el término de ingeniería de procesos para avanzar por fases sin poder
// saltarse la anterior, que es exactamente lo que hace este flujo.
//
// Ojo: esto es metadato. Quien identifica al servidor y da el prefijo a las tools es la clave
// del archivo de configuración del cliente, así que renombrar aquí no rompe ningún registro.
export const SERVER_NAME = "phase-gate";

// La versión sale del package.json para no tener el mismo número en dos sitios.
export const SERVER_VERSION = ((): string => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(MODULE_DIR, "..", "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();
