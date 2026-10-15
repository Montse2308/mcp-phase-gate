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
import { parseEnv } from "util";

// Carpeta de este módulo. Sirve para localizar el .env y el package.json de la raíz del repo.
export const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

// ─── El .env ────────────────────────────────────────────────────────────────
// El .env de la raíz del paquete (un nivel arriba de build/ o src/) deja que cada dispositivo
// defina sus rutas sin tocar el mcp.json. Se lee con un lector propio y no con dotenv ni con
// process.loadEnvFile: loadEnvFile no quita el BOM de UTF-8, y con un .env guardado con BOM la
// primera clave llegaba como "\uFEFFORQUESTADOR_DOCS_PATH" y la variable desaparecía. Y un .env
// en UTF-16 —lo que sale de PowerShell con ">"— hoy solo se adivinaba por los acentos rotos.
//
// El bloque "env" del cliente sigue ganando: solo se asignan las claves que no estén ya en el
// entorno, igual que hacía dotenv.
const clavesCargadas = new Set<string>();
let errorDeCarga: string | null = null;

export function envPorDefecto(): string {
  return path.join(MODULE_DIR, "..", ".env");
}

// Claves que vinieron del .env; las demás, del entorno. doctor usa esto para decir la fuente.
export function clavesDeEnv(): ReadonlySet<string> {
  return clavesCargadas;
}

// Error guardado de la última carga (por ejemplo, UTF-16), o null.
export function errorDeEnv(): string | null {
  return errorDeCarga;
}

// Solo para tests: borra del entorno las claves que vinieron del .env, vacía clavesDeEnv() y el
// error guardado. Sin esto, un .env cargado en un test contaminaría al siguiente.
export function reiniciarEnv(): void {
  for (const clave of clavesCargadas) delete process.env[clave];
  clavesCargadas.clear();
  errorDeCarga = null;
}

// Carga el .env. Sin argumento, el de la raíz del paquete. Se llama una vez al importar este
// módulo. Volver a llamarla sustituye lo que cargó la vez anterior.
export function cargarEnv(archivo: string = envPorDefecto()): void {
  reiniciarEnv();

  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(archivo);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return; // sin .env, todo sale del entorno
    errorDeCarga = `No se pudo leer el .env (${archivo}): ${error instanceof Error ? error.message : String(error)}`;
    return;
  }

  // UTF-16 con BOM en cualquiera de sus dos órdenes, o sin BOM pero con bytes NUL: en un .env de
  // texto en UTF-8 no hay ningún NUL, y en UTF-16 los hay en casi cada carácter.
  const conBom16 = bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
  if (conBom16 || bytes.subarray(0, 512).includes(0)) {
    errorDeCarga = `El .env está en UTF-16 y no se cargó (${archivo}). Guárdalo como UTF-8 (sin BOM).`;
    return;
  }

  const texto = bytes.toString("utf-8").replace(/^\uFEFF/, "");

  let valores: Record<string, string>;
  try {
    valores = parseEnv(texto) as Record<string, string>;
  } catch (error) {
    errorDeCarga = `No se pudo interpretar el .env (${archivo}): ${error instanceof Error ? error.message : String(error)}`;
    return;
  }

  for (const [clave, valor] of Object.entries(valores)) {
    if (process.env[clave] !== undefined) continue;
    process.env[clave] = valor;
    clavesCargadas.add(clave);
  }
}

cargarEnv();

// ─── Variables ──────────────────────────────────────────────────────────────
// Cada variable tiene un nombre lógico y dos nombres de entorno: PHASE_GATE_*, que sigue al
// nombre del paquete, y ORQUESTADOR_*, el de siempre, que queda como alias para no romper ninguna
// configuración existente. Si están las dos y dicen cosas distintas gana PHASE_GATE_*, y la
// discrepancia se avisa: doctor la muestra y el servidor la deja en el log al arrancar.
export type NombreLogico = "DOCS_PATH" | "REPOS_PATH" | "TASKS_SUBDIR" | "PROMPTS_PATH" | "STATE_PATH" | "ELICITATION";

type Nombres = { principal: string; alias: string | null; esRuta: boolean };

export const VARIABLES: Record<NombreLogico, Nombres> = {
  DOCS_PATH: { principal: "PHASE_GATE_DOCS_PATH", alias: "ORQUESTADOR_DOCS_PATH", esRuta: true },
  REPOS_PATH: { principal: "PHASE_GATE_REPOS_PATH", alias: "ORQUESTADOR_REPOS_PATH", esRuta: true },
  TASKS_SUBDIR: { principal: "PHASE_GATE_TASKS_SUBDIR", alias: "ORQUESTADOR_TASKS_SUBDIR", esRuta: false },
  PROMPTS_PATH: { principal: "PHASE_GATE_PROMPTS_PATH", alias: "ORQUESTADOR_PROMPTS_PATH", esRuta: true },
  STATE_PATH: { principal: "PHASE_GATE_STATE_PATH", alias: "ORQUESTADOR_STATE_PATH", esRuta: true },
  ELICITATION: { principal: "PHASE_GATE_ELICITATION", alias: null, esRuta: false },
};

export const NOMBRES_LOGICOS = Object.keys(VARIABLES) as NombreLogico[];

export type FuenteVariable = "entorno" | ".env" | "sin definir";
export type LecturaVariable = {
  logica: NombreLogico;
  valor: string | undefined; // ya recortado
  usada: string | null; // nombre de entorno que ganó
  fuente: FuenteVariable;
  discrepancia: string | null; // texto del aviso si las dos existen y difieren
};

// Qué nombre gana, en este orden:
//   1. La fuente: el entorno (el bloque "env" del cliente) gana al .env, también cuando cada
//      nombre llega por una vía distinta. Si no, un .env con PHASE_GATE_X le ganaría a un bloque
//      env con ORQUESTADOR_X, y "el cliente gana al .env" dejaría de ser cierto.
//   2. Dentro de la misma fuente, PHASE_GATE_* gana a ORQUESTADOR_*.
//
// "Definida" es que exista, aunque esté vacía: TASKS_SUBDIR vacía a propósito significa que las
// tareas cuelgan directo del proyecto, y eso tiene que poder decirse también con el nombre nuevo.
// En las variables de RUTA, en cambio, vacía cuenta como ausente: una ruta vacía no significa
// nada, y no debe tapar un alias que sí apunta a una carpeta.
export function leerVariable(logica: NombreLogico): LecturaVariable {
  const { principal, alias, esRuta } = VARIABLES[logica];
  const definida = (nombre: string): boolean => {
    const valor = process.env[nombre];
    return valor !== undefined && (!esRuta || valor.trim() !== "");
  };
  const fuenteDe = (nombre: string): FuenteVariable => (clavesCargadas.has(nombre) ? ".env" : "entorno");

  const candidatos = (alias ? [principal, alias] : [principal]).filter(definida);
  // sort es estable: con la misma fuente se conserva el orden principal, alias.
  candidatos.sort((a, b) => Number(fuenteDe(a) === ".env") - Number(fuenteDe(b) === ".env"));

  const usada = candidatos[0] ?? null;
  const ignorada = candidatos[1] ?? null;
  const crudo = usada ? process.env[usada] : undefined;

  let discrepancia: string | null = null;
  if (usada && ignorada) {
    const comparable = (valor: string): string => {
      const recortado = valor.trim();
      return esRuta && recortado ? path.resolve(recortado) : recortado;
    };
    if (comparable(process.env[usada]!) !== comparable(process.env[ignorada]!)) {
      const motivo = fuenteDe(usada) !== fuenteDe(ignorada) ? " (el entorno del cliente gana al .env)" : "";
      discrepancia = `${ignorada} difiere de ${usada}; se usa ${usada}${motivo}.`;
    }
  } else if (esRuta && alias && usada === alias && process.env[principal] !== undefined) {
    discrepancia = `${principal} está vacía; se usa ${alias}.`;
  }

  return {
    logica,
    valor: crudo?.trim(),
    usada,
    fuente: usada === null ? "sin definir" : fuenteDe(usada),
    discrepancia,
  };
}

// Cómo se nombra una variable en un mensaje: la principal, y el alias entre paréntesis.
export function nombrarVariable(logica: NombreLogico): string {
  const { principal, alias } = VARIABLES[logica];
  return alias ? `${principal} (o su alias ${alias})` : principal;
}

// Paths absolutos del entorno. Se configuran por variable de entorno (vía .env o el bloque
// "env" del mcp.json) para poder usar el MCP en distintos dispositivos sin recompilar.
//
// No tienen valor por defecto, a propósito. Un default es siempre la ruta del equipo de
// quien escribió el código: en cualquier otro dispositivo el servidor arrancaba "bien" y el
// error salía mucho después, dentro de una tool, disfrazado de "no encontré el archivo" y
// sin mencionar que lo que faltaba era configurar una variable.
export type RutaRequerida = { logica: NombreLogico; apuntaA: string };

export const DOCS: RutaRequerida = {
  logica: "DOCS_PATH",
  apuntaA: "la carpeta raíz de la Documentación Central",
};

export const REPOS: RutaRequerida = {
  logica: "REPOS_PATH",
  apuntaA: "la carpeta que contiene tus repositorios de código",
};

// Se resuelve y valida en cada llamada, no una vez al arrancar. Así el servidor se queda en
// pie aunque falte configuración, las tools que no dependen de estas rutas siguen sirviendo,
// y el error llega al chat —donde está el usuario— en vez de quedarse enterrado en un log.
export function requireBasePath({ logica, apuntaA }: RutaRequerida): string {
  const { valor, usada } = leerVariable(logica);

  if (!valor || !usada) {
    // Si el .env no se pudo cargar, esa es casi seguro la causa: se dice antes que nada.
    const delEnv = errorDeCarga ? ` ${errorDeCarga}` : "";
    throw new Error(
      `Falta ${nombrarVariable(logica)}, que debe apuntar a ${apuntaA}. Defínela en el archivo ` +
        `.env de la raíz del repo, o en el bloque "env" del mcp.json de tu cliente.${delEnv}`
    );
  }

  const ruta = path.resolve(valor);

  // Una variable definida pero incorrecta falla igual de tarde que una ausente, así que la
  // existencia se comprueba aquí. El BOM y el UTF-16 ya los resuelve cargarEnv; un .env guardado
  // en ANSI todavía rompe los acentos sin que se pueda detectar con certeza.
  if (!fs.existsSync(ruta)) {
    throw new Error(
      `${usada} apunta a "${ruta}", que no existe en este equipo. Corrige la ruta en el .env. ` +
        `Si lleva acentos, revisa que el .env esté guardado en UTF-8: en otra codificación los ` +
        `acentos llegan rotos y la carpeta parece no existir.`
    );
  }

  if (!fs.statSync(ruta).isDirectory()) {
    throw new Error(`${usada} apunta a "${ruta}", que es un archivo y no una carpeta.`);
  }

  return ruta;
}

// Subcarpeta donde viven las tareas dentro de cada proyecto (ej. PROYECTO-A/Proyectos/<tarea>).
// Es una convención de organización, no una ruta de dispositivo, pero vive en el entorno
// para no tener que introducir un archivo de configuración por una sola cadena.
// Vacía a propósito significa que las tareas cuelgan directo del proyecto.
export const TASKS_SUBDIR_POR_DEFECTO = "Proyectos";

export function tasksSubdir(): string {
  return leerVariable("TASKS_SUBDIR").valor ?? TASKS_SUBDIR_POR_DEFECTO;
}

// ─── Prompts, en capas ──────────────────────────────────────────────────────
// Los prompts de las fases viven en archivos .md sueltos. Vivir fuera del código permite
// afinar el texto de una fase sin recompilar: se edita el .md y la siguiente llamada a
// get_phase_prompt ya trae la versión nueva.
//
// Se cargan en CAPAS, no por reemplazo: primero los del paquete y encima, si existe, la
// carpeta que declare el usuario. La última capa que declare una fase es la que queda.
//
// Antes `PROMPTS_PATH` sustituía la carpeta entera, y eso solo funcionaba con un
// clon del repo alrededor, donde editar `prompts/` es lo natural. Instalado desde npm los de
// fábrica caen dentro de node_modules, donde editarlos no sirve porque la siguiente
// instalación se los lleva. Reemplazar obligaba entonces a copiar las cinco fases para
// cambiar una: te quedas con copias congeladas que ya no reciben mejoras y, si se te olvida
// copiar una, esa fase simplemente deja de existir sin que nada te avise.
//
// Los de fábrica viven en una subcarpeta por idioma (prompts/es/), para que la versión en inglés
// llegue al lado sin mover nada. Las capas propias no cambian: una carpeta de prompts del usuario
// sigue teniendo sus fase-N-*.md en la raíz.
export const IDIOMA_POR_DEFECTO = "es";

export function defaultPromptsPath(idioma: string = IDIOMA_POR_DEFECTO): string {
  return path.join(MODULE_DIR, "..", "prompts", idioma);
}

// De menor a mayor prioridad. La del usuario va al final: gana.
export function promptsLayers(): string[] {
  const capas = [defaultPromptsPath()];
  const propia = leerVariable("PROMPTS_PATH").valor;

  if (propia) capas.push(path.resolve(propia));

  return capas;
}

// ─── Estado local ───────────────────────────────────────────────────────────
// El estado vive en la carpeta de datos del usuario, NO junto al build. `build/` es una
// carpeta generada: borrarla para recompilar desde cero se llevaba el estado por delante.
// Además, esta ubicación es la única que funciona cuando el servidor se ejecuta desde un
// paquete instalado, sin repo alrededor.
// Sigue al nombre del paquete: esta ruta aparece escrita en el README, así que dejarla con el
// nombre viejo obligaba a explicar por qué la carpeta se llama distinto que todo lo demás.
// El precio de renombrarla es que los punteros guardados con el nombre anterior dejan de verse.
// No se migran: el puntero se recalcula solo con un `switch_task`, y arrastrar código de
// migración para un dato que cuesta un comando en recuperarse es más caro que el problema.
export const APP_DIR_NAME = "mcp-phase-gate";

// La variable se recorta y se resuelve, como las demás rutas: antes se usaba tal cual, y un
// espacio pegado al final del valor creaba otra carpeta de estado.
export function stateDir(): string {
  const propia = leerVariable("STATE_PATH").valor;
  if (propia) return path.resolve(propia);

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
// Lleva el prefijo "mcp-" para ser exactamente el nombre del paquete en npm y el del repo:
// tres nombres iguales en vez de tres parecidos, que es lo que obligaba a recordar cuál era
// cuál. Redundante dentro de un servidor MCP, sí, pero el paquete lo necesita para que se
// encuentre buscando "mcp" y ganó la igualdad.
//
// Ojo: esto es metadato. Quien identifica al servidor y da el prefijo a las tools es la clave
// del archivo de configuración del cliente, así que renombrar aquí no rompe ningún registro.
export const SERVER_NAME = "mcp-phase-gate";

// La versión sale del package.json para no tener el mismo número en dos sitios.
export const SERVER_VERSION = ((): string => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(MODULE_DIR, "..", "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();
