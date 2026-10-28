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

import { fallo, mensaje } from "./i18n/mensajes.js";
import { ARCHIVO_MAQUINA, interpretarMaquina } from "./maquina.js";
import type { MaquinaConfig, RutasDeMaquina } from "./maquina.js";

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
// El error se guarda como código y datos, y se redacta al leerlo: la carga corre al importar este módulo,
// cuando todavía no hay llamada (ni idioma de llamada), y el texto tiene que salir en el idioma de quien
// lo lee.
type ErrorDeCarga = { codigo: "ENV-TXT-ILEGIBLE" | "ENV-TXT-UTF16" | "ENV-TXT-NO-INTERPRETABLE"; parametros: Record<string, string> };
let errorDeCarga: ErrorDeCarga | null = null;

export function envPorDefecto(): string {
  return path.join(MODULE_DIR, "..", ".env");
}

// Claves que vinieron del .env; las demás, del entorno. doctor usa esto para decir la fuente.
export function clavesDeEnv(): ReadonlySet<string> {
  return clavesCargadas;
}

// Error guardado de la última carga (por ejemplo, UTF-16), o null.
export function errorDeEnv(): string | null {
  return errorDeCarga ? mensaje(errorDeCarga.codigo, errorDeCarga.parametros) : null;
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
    errorDeCarga = { codigo: "ENV-TXT-ILEGIBLE", parametros: { archivo, detalle: error instanceof Error ? error.message : String(error) } };
    return;
  }

  // UTF-16 con BOM en cualquiera de sus dos órdenes, o sin BOM pero con bytes NUL: en un .env de
  // texto en UTF-8 no hay ningún NUL, y en UTF-16 los hay en casi cada carácter.
  const conBom16 = bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
  if (conBom16 || bytes.subarray(0, 512).includes(0)) {
    errorDeCarga = { codigo: "ENV-TXT-UTF16", parametros: { archivo } };
    return;
  }

  const texto = bytes.toString("utf-8").replace(/^\uFEFF/, "");

  let valores: Record<string, string>;
  try {
    valores = parseEnv(texto) as Record<string, string>;
  } catch (error) {
    errorDeCarga = { codigo: "ENV-TXT-NO-INTERPRETABLE", parametros: { archivo, detalle: error instanceof Error ? error.message : String(error) } };
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
export type NombreLogico =
  | "DOCS_PATH"
  | "REPOS_PATH"
  | "TASKS_SUBDIR"
  | "PROMPTS_PATH"
  | "STATE_PATH"
  | "CONFIG_PATH"
  | "ELICITATION"
  | "LANG";

type Nombres = { principal: string; alias: string | null; esRuta: boolean };

export const VARIABLES: Record<NombreLogico, Nombres> = {
  DOCS_PATH: { principal: "PHASE_GATE_DOCS_PATH", alias: "ORQUESTADOR_DOCS_PATH", esRuta: true },
  REPOS_PATH: { principal: "PHASE_GATE_REPOS_PATH", alias: "ORQUESTADOR_REPOS_PATH", esRuta: true },
  TASKS_SUBDIR: { principal: "PHASE_GATE_TASKS_SUBDIR", alias: "ORQUESTADOR_TASKS_SUBDIR", esRuta: false },
  PROMPTS_PATH: { principal: "PHASE_GATE_PROMPTS_PATH", alias: "ORQUESTADOR_PROMPTS_PATH", esRuta: true },
  STATE_PATH: { principal: "PHASE_GATE_STATE_PATH", alias: "ORQUESTADOR_STATE_PATH", esRuta: true },
  // Sin alias: nació con el nombre nuevo (Etapa 3), igual que ELICITATION.
  CONFIG_PATH: { principal: "PHASE_GATE_CONFIG_PATH", alias: null, esRuta: true },
  ELICITATION: { principal: "PHASE_GATE_ELICITATION", alias: null, esRuta: false },
  // Etapa 6: el idioma de los proyectos que no lo declaran ni lo dicen sus documentos, y el de los
  // mensajes cuando una llamada no resuelve proyecto (§8.3 y §8.5).
  LANG: { principal: "PHASE_GATE_LANG", alias: null, esRuta: false },
};

export const NOMBRES_LOGICOS = Object.keys(VARIABLES) as NombreLogico[];

export type FuenteVariable = "entorno" | ".env" | "machine.json" | "sin definir";
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
//   3. Para DOCS_PATH, REPOS_PATH y TASKS_SUBDIR, lo que diga `rutas` de machine.json. Gana lo de la
//      ejecución sobre lo guardado, como en git y npm. Se lee en cada llamada, y solo si el entorno no
//      define la variable.
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

  if (usada === null) {
    const clave = CLAVE_EN_MAQUINA[logica];
    const guardado = valorDeMaquina(logica);
    if (clave && guardado !== undefined && (!esRuta || guardado.trim() !== "")) {
      return { logica, valor: guardado.trim(), usada: `rutas.${clave}`, fuente: "machine.json", discrepancia: null };
    }
  }

  let discrepancia: string | null = null;
  if (usada && ignorada) {
    const comparable = (valor: string): string => {
      const recortado = valor.trim();
      return esRuta && recortado ? path.resolve(recortado) : recortado;
    };
    if (comparable(process.env[usada]!) !== comparable(process.env[ignorada]!)) {
      discrepancia = mensaje("CONFIG-VAR-DIFIERE", { ignorada, usada, clienteGana: fuenteDe(usada) !== fuenteDe(ignorada) });
    }
  } else if (esRuta && alias && usada === alias && process.env[principal] !== undefined) {
    discrepancia = mensaje("CONFIG-VAR-VACIA", { principal, alias });
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
  return alias ? mensaje("CONFIG-VAR-CON-ALIAS", { principal, alias }) : principal;
}

// Paths absolutos del entorno. Se configuran por variable de entorno (vía .env o el bloque
// "env" del mcp.json) para poder usar el MCP en distintos dispositivos sin recompilar.
//
// No tienen valor por defecto, a propósito. Un default es siempre la ruta del equipo de
// quien escribió el código: en cualquier otro dispositivo el servidor arrancaba "bien" y el
// error salía mucho después, dentro de una tool, disfrazado de "no encontré el archivo" y
// sin mencionar que lo que faltaba era configurar una variable.
//
// `apuntaA` es un getter: el texto se redacta al leerlo, en el idioma de la llamada.
export type RutaRequerida = { logica: NombreLogico; apuntaA: string };

export const DOCS: RutaRequerida = {
  logica: "DOCS_PATH",
  get apuntaA() {
    return mensaje("CONFIG-APUNTA-A-DOCS");
  },
};

export const REPOS: RutaRequerida = {
  logica: "REPOS_PATH",
  get apuntaA() {
    return mensaje("CONFIG-APUNTA-A-REPOS");
  },
};

// Se resuelve y valida en cada llamada, no una vez al arrancar. Así el servidor se queda en
// pie aunque falte configuración, las tools que no dependen de estas rutas siguen sirviendo,
// y el error llega al chat —donde está el usuario— en vez de quedarse enterrado en un log.
export function requireBasePath({ logica, apuntaA }: RutaRequerida): string {
  const { valor, usada, fuente } = leerVariable(logica);

  if (!valor || !usada) {
    // Si el .env no se pudo cargar, o machine.json no se puede leer, esa es casi seguro la causa: se dice
    // antes que nada.
    const maquina = maquinaVigente();
    throw fallo("CONFIG-FALTA-VARIABLE", {
      variable: nombrarVariable(logica),
      apuntaA,
      clave: `rutas.${CLAVE_EN_MAQUINA[logica]}`,
      delEnv: errorDeEnv(),
      delMaquina: maquina.estado === "invalido" && !maquina.deMemoria ? maquina.error : null,
    });
  }

  const ruta = path.resolve(valor);

  // Una variable definida pero incorrecta falla igual de tarde que una ausente, así que la
  // existencia se comprueba aquí. El BOM y el UTF-16 ya los resuelve cargarEnv; un .env guardado
  // en ANSI todavía rompe los acentos sin que se pueda detectar con certeza.
  // Si el valor salió de machine.json, el error nombra ese archivo y no una variable de entorno.
  const variable = fuente === "machine.json" ? `${ARCHIVO_MAQUINA} (${usada})` : usada;
  if (!fs.existsSync(ruta)) {
    throw fallo("CONFIG-RUTA-NO-EXISTE", { variable, ruta, fuente });
  }

  if (!fs.statSync(ruta).isDirectory()) {
    throw fallo("CONFIG-RUTA-ES-ARCHIVO", { variable, ruta });
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

// ─── Idioma del entorno y del sistema (§8.3, pasos 4 y 5) ───────────────────
// Viven en i18n/idioma.ts, sin dependencias: los mensajes los necesitan y este módulo escribe mensajes al
// cargarse (el .env).
export { fijarLocaleDelSistema, idiomaDeEtiqueta, idiomaDelEntorno, idiomaDelSistema } from "./i18n/idioma.js";
import { idiomaDelEntorno as idiomaDelEntornoBase, idiomaDelSistema as idiomaDelSistemaBase } from "./i18n/idioma.js";
import type { Idioma } from "./vocabulario.js";

// La raíz del paquete: la carpeta que tiene al lado build/, prompts/ y presets/. Los tests corren
// desde build-test/, que no tiene esas carpetas al lado; la apuntan al repo con fijarRaizDelPaquete
// cuando necesitan los prompts y presets de fábrica de verdad.
let raizDelPaquete = path.join(MODULE_DIR, "..");

export function raizPaquete(): string {
  return raizDelPaquete;
}

// Solo para tests. null vuelve a la raíz real.
export function fijarRaizDelPaquete(ruta: string | null): void {
  raizDelPaquete = ruta ?? path.join(MODULE_DIR, "..");
}

// El idioma de este equipo cuando no hay proyecto (§8.3, pasos 3 a 5): PHASE_GATE_LANG, después
// `idiomaPorDefecto` de machine.json y, al final, el del sistema. Como en las rutas, lo de la ejecución gana
// a lo guardado. Es lo mismo que idiomaDelEquipo (manifiesto.ts), que dice además de dónde salió; los dos
// leen machine.json con el mismo lector, y así este módulo no importa el del manifiesto, que lo importa a
// él. Un machine.json ilegible no cuenta: doctor lo dice.
export function idiomaSinProyecto(): Idioma {
  return idiomaDelEntornoBase() ?? idiomaDeMaquina() ?? idiomaDelSistemaBase();
}

// Sin idioma, el del equipo: desde la Etapa 6 la capa de fábrica sin proyecto puede ser prompts/en/.
export function defaultPromptsPath(idioma: string = idiomaSinProyecto()): string {
  return path.join(raizPaquete(), "prompts", idioma);
}

// De menor a mayor prioridad. La del usuario va al final: gana.
// Las capas que aportan cuerpos (fase-N-*.md, global-rules.md, comandos/) sin proyecto: la de
// fábrica (en el idioma del equipo, o el que se pida) y la global. Desde la Etapa 3 el ensamblado
// completo, con presets, reglas y la capa del proyecto, lo arma capasDe en capas.ts; esto queda como su
// versión sin proyecto.
export function promptsLayers(idioma: string = idiomaSinProyecto()): string[] {
  const capas = [defaultPromptsPath(idioma)];
  const global = carpetaPromptsGlobal();

  if (global) capas.push(global);

  return capas;
}

// La capa global: PHASE_GATE_PROMPTS_PATH si está definida; si no, <configDir>/prompts/ cuando
// existe. Así se puede tener una capa propia sin definir ninguna variable: basta con crear la
// carpeta (eject --a global la crea).
export function carpetaPromptsGlobal(): string | null {
  const propia = leerVariable("PROMPTS_PATH").valor;
  if (propia) return path.resolve(propia);

  const enConfig = path.join(configDir(), "prompts");
  try {
    return fs.statSync(enConfig).isDirectory() ? enConfig : null;
  } catch {
    return null;
  }
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

// ─── Configuración local ────────────────────────────────────────────────────
// La carpeta de machine.json y de los presets propios: lo que es de este equipo y no viaja con la
// Documentación. En Windows y macOS coincide con la del estado; en Linux no (estado en
// XDG_STATE_HOME, configuración en XDG_CONFIG_HOME), que es lo que espera cada sistema.
export function configDir(): string {
  const propia = leerVariable("CONFIG_PATH").valor;
  if (propia) return path.resolve(propia);

  const home = os.homedir();

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, APP_DIR_NAME);
  }

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", APP_DIR_NAME);
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  return path.join(configHome, APP_DIR_NAME);
}

// ─── machine.json ───────────────────────────────────────────────────────────
// Lo que lee este módulo de machine.json: sus `rutas` y su `idiomaPorDefecto`. El archivo entero lo valida
// maquina.ts, para que "roto" signifique lo mismo aquí, en doctor y en Ajustes; los repos y el preset los
// resuelve manifiesto.ts con la misma lectura.
//
// No hay caché por el mtime del archivo: en NTFS no cambió en el 48 % de las escrituras atómicas seguidas.
// Se lee en cada llamada. Lo único que se guarda es el último archivo válido que leyó este proceso: si el
// archivo deja de serlo, sus rutas y su idioma siguen valiendo hasta que se arregle, y se avisa una vez.
export type LecturaDeMaquina = {
  estado: "ausente" | "valido" | "invalido";
  ruta: string;
  config: MaquinaConfig | null;
  error: string | null;
};

// `deMemoria`: el archivo es inválido y `config` es el último válido que leyó este proceso.
export type MaquinaVigente = LecturaDeMaquina & { deMemoria: boolean };

export const CLAVE_EN_MAQUINA: Partial<Record<NombreLogico, keyof RutasDeMaquina>> = {
  DOCS_PATH: "documentacion",
  REPOS_PATH: "carpetaDeRepos",
  TASKS_SUBDIR: "subcarpetaTareas",
};

export function rutaDeMaquina(): string {
  return path.join(configDir(), ARCHIVO_MAQUINA);
}

// Una lectura del disco, sin memoria: lo que el archivo dice ahora.
export function leerArchivoDeMaquina(): LecturaDeMaquina {
  const ruta = rutaDeMaquina();
  let texto: string;
  try {
    texto = fs.readFileSync(ruta, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return { estado: "ausente", ruta, config: null, error: null };
    return { estado: "invalido", ruta, config: null, error: mensaje("MAQUINA-TXT-INVALIDA", { archivo: ARCHIVO_MAQUINA, ruta, error: error instanceof Error ? error.message : String(error) }) };
  }
  const leido = interpretarMaquina(texto);
  if (!leido.ok) return { estado: "invalido", ruta, config: null, error: mensaje("MAQUINA-TXT-INVALIDA", { archivo: ARCHIVO_MAQUINA, ruta, error: leido.error }) };
  return { estado: "valido", ruta, config: leido.config, error: null };
}

let ultimaValida: { ruta: string; config: MaquinaConfig } | null = null;
let ultimoAviso: string | null = null;

// Lo que vale ahora: el archivo si es válido; si está roto, el último válido que leyó este proceso (de esa
// misma ruta), con un aviso la primera vez; y si nunca hubo uno, nada.
export function maquinaVigente(): MaquinaVigente {
  const lectura = leerArchivoDeMaquina();
  if (lectura.estado === "valido") {
    ultimaValida = { ruta: lectura.ruta, config: lectura.config! };
    ultimoAviso = null;
    return { ...lectura, deMemoria: false };
  }
  if (lectura.estado === "ausente") {
    ultimaValida = null;
    ultimoAviso = null;
    return { ...lectura, deMemoria: false };
  }
  if (ultimaValida && ultimaValida.ruta === lectura.ruta) {
    if (ultimoAviso !== lectura.error) {
      ultimoAviso = lectura.error;
      console.error(`[${SERVER_NAME}] ${mensaje("CONFIG-MAQUINA-EN-MEMORIA", { error: lectura.error })}`);
    }
    return { ...lectura, config: ultimaValida.config, deMemoria: true };
  }
  return { ...lectura, deMemoria: false };
}

// Solo para tests: olvida el último machine.json válido y el aviso.
export function reiniciarMaquina(): void {
  ultimaValida = null;
  ultimoAviso = null;
}

// Lo que machine.json dice de una variable, ganen o no el entorno o el .env. Solo DOCS_PATH, REPOS_PATH y
// TASKS_SUBDIR tienen valor en machine.json.
export function valorDeMaquina(logica: NombreLogico): string | undefined {
  const clave = CLAVE_EN_MAQUINA[logica];
  return clave ? maquinaVigente().config?.rutas?.[clave] : undefined;
}

export function idiomaDeMaquina(): Idioma | null {
  return maquinaVigente().config?.idiomaPorDefecto ?? null;
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
