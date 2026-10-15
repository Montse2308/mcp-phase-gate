// Resolución de rutas dentro de la Documentación Central: proyectos, carpetas de tarea
// y el archivo concreto que una tool va a leer o escribir.
//
// Todo lo que arma una ruta vive aquí, en un solo lugar. Un error de ruta no truena: escribe
// el archivo correctamente en el sitio equivocado, y eso no se descubre hasta que alguien lo
// busca. Por eso además de armarlas hay que comprobar que caigan dentro de la base.

import * as fs from "fs";
import * as path from "path";
import { DOCS, REPOS, requireBasePath, tasksSubdir } from "./config.js";

// Comprueba que una ruta quede dentro de otra. No sirve startsWith, y falla en las dos
// direcciones: con base "C:\PROYECTOS\TRABAJO" deja pasar "C:\PROYECTOS\TRABAJO_VIEJO",
// que empieza igual sin estar dentro; y rechaza rutas válidas cuando la base viene escrita
// con otras mayúsculas. Comparar la ruta relativa resuelve ambos.
export function estaDentro(base: string, ruta: string): boolean {
  const relativa = path.relative(path.resolve(base), path.resolve(ruta));
  return relativa === "" || (!relativa.startsWith("..") && !path.isAbsolute(relativa));
}

// Resuelve symlinks y junctions del ancestro existente más cercano y vuelve a unir el resto.
// Hace falta porque la ruta que se va a escribir casi nunca existe todavía, y realpath solo
// funciona sobre lo que existe. "Existe" se mira con lstat y no con existsSync: un enlace roto
// cuenta como existente, realpath falla sobre él y la operación se rechaza. Con existsSync se
// saltaría, y escribir a través de él crearía su destino, esté donde esté.
export function rutaReal(ruta: string): string {
  let existente = path.resolve(ruta);
  const pendientes: string[] = [];

  while (!fs.lstatSync(existente, { throwIfNoEntry: false })) {
    const padre = path.dirname(existente);
    if (padre === existente) break; // ni la raíz existe: que realpath dé el error
    pendientes.unshift(path.basename(existente));
    existente = padre;
  }

  return path.join(fs.realpathSync.native(existente), ...pendientes);
}

// estaDentro sobre rutas reales. Comparar el texto no basta: un symlink dentro de la
// Documentación que apunta fuera tiene una ruta que "está dentro" y un destino que no.
// La base también se resuelve: una DOCS que es symlink sigue valiendo.
export function estaDentroReal(base: string, ruta: string): boolean {
  return estaDentro(rutaReal(base), rutaReal(ruta));
}

// Clave para comparar nombres de documento: dos nombres con la misma clave se ven iguales, y en
// Windows y macOS abren el mismo archivo. rutaReal solo corrige las mayúsculas de lo que ya
// existe, así que lo que todavía no existe se compara por aquí. Sin distinguir mayúsculas en
// todos los sistemas, para que el comportamiento no dependa del equipo.
export function claveDeNombre(nombre: string): string {
  return nombre.normalize("NFC").toLowerCase();
}

// Un nombre de proyecto, tarea o repo es UN segmento de ruta, portable entre sistemas:
// la Documentación viaja entre equipos con Windows, macOS y Linux. Lo que se rechaza es lo
// que hoy ya era peligroso (separadores, "..") o lo que Windows no puede guardar y rompe la
// sincronización (caracteres reservados, punto o espacio final, CON, NUL…).
const CARACTERES_RESERVADOS = /[<>:"|?*]/;
const CARACTERES_DE_CONTROL = /[\u0000-\u001f\u007f]/;
// Windows también reserva COM y LPT con los superíndices ¹²³, y las consolas CONIN$ y CONOUT$.
// Los espacios antes de la extensión no cuentan: "nul .txt" sigue siendo NUL.
const NOMBRES_RESERVADOS_WINDOWS = /^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³]) *(\..*)?$/i;

export function validarSegmento(valor: string, campo: string): string {
  const incumple = (regla: string): never => {
    throw new Error(
      `${campo} ${JSON.stringify(valor)} no es válido: ${regla}. Tiene que ser un solo nombre de ` +
        `carpeta o archivo, que funcione igual en Windows, macOS y Linux.`
    );
  };

  if (valor.trim() === "") incumple("está vacío");
  if (valor === "." || valor === "..") incumple(`no puede ser "${valor}"`);
  if (/[\\/]/.test(valor)) incumple("no puede llevar / ni \\");
  if (CARACTERES_DE_CONTROL.test(valor)) incumple("no puede llevar caracteres de control");
  if (CARACTERES_RESERVADOS.test(valor)) incumple('no puede llevar ninguno de < > : " | ? *');
  if (/[. ]$/.test(valor)) incumple("no puede terminar en punto ni en espacio");
  if (NOMBRES_RESERVADOS_WINDOWS.test(valor)) {
    incumple("es un nombre reservado de Windows (CON, PRN, AUX, NUL, CONIN$, CONOUT$, COM1–COM9, LPT1–LPT9)");
  }

  return valor;
}

// Un proyecto o una tarea que start_task va a crear tampoco puede empezar por punto: las carpetas
// con punto no son proyecto ni tarea, así que no aparecería en list_tasks y write_central_doc no
// podría escribir en ella. No va en validarSegmento porque read_central_doc también lo usa, y la
// lectura no cambia.
export function validarNombreVisible(valor: string, campo: string): string {
  if (valor.startsWith(".")) {
    throw new Error(
      `${campo} ${JSON.stringify(valor)} no es válido: no puede empezar por punto. Las carpetas ` +
        `con punto no cuentan como proyecto ni como tarea, así que no se vería después.`
    );
  }
  return valor;
}

// ─── Proyectos ──────────────────────────────────────────────────────────────
// Los proyectos no se declaran en ninguna parte: son las carpetas que existen. Antes había
// una tabla fija con los proyectos de quien escribió el código, que no restringía nada
// —cualquier nombre inventado resolvía una ruta y start_task le creaba la carpeta— porque
// solo era una tabla de alias y cada entrada coincidía con su propio nombre en mayúsculas.
//
// Es proyecto la carpeta que contenga la subcarpeta de tareas. Esa regla deja fuera sola a
// las carpetas que no son proyectos, y da de alta uno nuevo con solo crearle su subcarpeta.
// Si la subcarpeta está vacía la regla no se puede aplicar y vale cualquier carpeta.
// Las carpetas con punto nunca son proyecto: .obsidian o .git en la raíz de la Documentación.
export function discoverProjects(): Map<string, string> {
  const proyectos = new Map<string, string>(); // clave en minúsculas -> nombre real de la carpeta
  const base = requireBasePath(DOCS);
  const subdir = tasksSubdir();

  for (const entrada of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entrada.isDirectory() || entrada.name.startsWith(".")) continue;
    if (subdir && !fs.existsSync(path.join(base, entrada.name, subdir))) continue;
    proyectos.set(entrada.name.toLowerCase(), entrada.name);
  }

  return proyectos;
}

export function describeProjects(): string {
  try {
    const nombres = [...discoverProjects().values()].sort();
    return nombres.length ? nombres.join(", ") : "(ninguno todavía)";
  } catch {
    // Sin ORQUESTADOR_DOCS_PATH configurada no se pueden listar; el error real lo da la tool.
    return "(no se pudieron leer: revisa ORQUESTADOR_DOCS_PATH)";
  }
}

// Devuelve el nombre real de la carpeta, respetando mayúsculas, o null si no existe.
export function findProjectFolder(project: string): string | null {
  return discoverProjects().get(String(project).trim().toLowerCase()) ?? null;
}

export function requireProjectFolder(project: string): string {
  const carpeta = findProjectFolder(project);
  if (!carpeta) {
    throw new Error(
      `No existe el proyecto "${project}". Los proyectos disponibles son: ${describeProjects()}.`
    );
  }
  return carpeta;
}

// ─── Carpetas de tarea ──────────────────────────────────────────────────────
// La ruta de una tarea SIEMPRE se arma aquí, en un solo lugar.
// Estructura: <ORQUESTADOR_DOCS_PATH>/<PROYECTO>/<subcarpeta de tareas>/<tarea>
export function taskFolderPath(carpetaProyecto: string, taskName: string): string {
  validarSegmento(taskName, "task_name");
  return path.join(requireBasePath(DOCS), carpetaProyecto, tasksSubdir(), taskName);
}

export function resolveTaskFolder(project: string, taskName: string): string {
  return taskFolderPath(requireProjectFolder(project), taskName);
}

// Carpeta que contiene todas las tareas de un proyecto. Es la que se lista para saber qué
// tareas existen: el disco es el registro, no hay un archivo aparte que mantener en sincronía.
export function tasksRootPath(carpetaProyecto: string): string {
  return path.join(requireBasePath(DOCS), carpetaProyecto, tasksSubdir());
}

// Resuelve la ruta absoluta para read/write. Prioriza project+task_name+file_name;
// si no, cae al modo legacy con file_path relativo a la Documentación Central.
//
// Una ruta relativa hecha de segmentos portables. Cada segmento se valida por separado para que
// una subcarpeta legítima como "04 - Ejecución/L01 - x.md" siga valiendo.
function validarRutaRelativa(valor: string, campo: string, relativaA: string): void {
  if (path.isAbsolute(valor)) {
    throw new Error(`${campo} no puede ser una ruta absoluta ("${valor}"): es relativo a ${relativaA}.`);
  }
  for (const segmento of valor.split(/[\\/]/)) validarSegmento(segmento, campo);
}

// Los argumentos de read_central_doc y write_central_doc, ya validados por su schema.
export type ArgumentosDeDocumento = {
  project?: string | undefined;
  task_name?: string | undefined;
  file_name?: string | undefined;
  file_path?: string | undefined;
};

// Con file_name la ruta tiene que quedar dentro de la carpeta de la tarea, no solo dentro de
// la base: antes "../otra-tarea/x.md" escribía en otra tarea y la comprobación de la tool,
// que solo miraba la base, lo dejaba pasar.
//
// Con file_path aquí basta con no salir de la base (write_central_doc además exige que caiga en
// una tarea: ubicarEnTarea), pero sus segmentos también tienen que ser portables: antes creaba
// dentro de la Documentación un "CON", un "nul.md" o un flujo alterno "nota.md:secreto", que el
// Explorador y OneDrive no saben manejar.
export function resolveDocPath(args: ArgumentosDeDocumento): string {
  const { project = "", task_name: taskName = "", file_name: fileName = "", file_path: filePath = "" } = args;

  if (project && taskName && fileName) {
    const carpetaTarea = resolveTaskFolder(project, taskName);
    validarRutaRelativa(fileName, "file_name", "la carpeta de la tarea");

    const ruta = path.join(carpetaTarea, fileName);
    if (!estaDentroReal(carpetaTarea, ruta)) {
      throw new Error(`Acceso denegado: file_name "${fileName}" queda fuera de la carpeta de la tarea ${carpetaTarea}.`);
    }
    return ruta;
  }

  if (filePath) {
    const docsBase = requireBasePath(DOCS);
    validarRutaRelativa(filePath, "file_path", "la Documentación Central");

    const ruta = path.join(docsBase, filePath);
    if (!estaDentroReal(docsBase, ruta)) {
      throw new Error(`Acceso denegado: file_path queda fuera de ${docsBase}.`);
    }
    return ruta;
  }

  throw new Error("Debes proporcionar (project + task_name + file_name) o bien file_path.");
}

// ─── Ubicación dentro de una tarea ──────────────────────────────────────────
export type UbicacionEnTarea = {
  carpetaProyecto: string; // nombre real de la carpeta del proyecto
  taskName: string;
  carpetaTarea: string; // ruta absoluta (real)
  relativo: string; // ruta dentro de la tarea, con "/" como separador
};

// Segmentos de `ruta` dentro de `base`, o null si no cae dentro. Las dos ya vienen resueltas.
function segmentosDentro(base: string, ruta: string): string[] | null {
  const relativa = path.relative(base, ruta);
  if (relativa === "") return [];
  if (relativa.startsWith("..") || path.isAbsolute(relativa)) return null;
  return relativa.split(/[\\/]/);
}

// write_central_doc solo escribe dentro de la carpeta de una tarea que ya existe. Con file_path
// se podía escribir en cualquier lugar de la Documentación, incluido el phase-gate.json del
// proyecto, y con una tarea mal escrita el mkdir recursivo creaba una carpeta suelta.
//
// Se mide sobre rutas reales, como la contención: un enlace interno que lleva a una tarea vale,
// porque lo que se escribe acaba dentro de ella. La subcarpeta de tareas se compara con la que
// hay en disco y no con la variable: en Windows y macOS pueden diferir en mayúsculas, y
// discoverProjects ya da el proyecto por bueno.
//
// Devuelve null si la ruta no cae dentro de la carpeta de una tarea existente, o si algún
// segmento dentro de la tarea empieza por punto (.git, .phase-gate no son documentos).
export function ubicarEnTarea(rutaAbsoluta: string): UbicacionEnTarea | null {
  const docsReal = rutaReal(requireBasePath(DOCS));
  const segmentos = segmentosDentro(docsReal, rutaReal(rutaAbsoluta));
  if (!segmentos || segmentos.length === 0) return null;

  // El nombre que da el disco tiene que ser el del proyecto, no solo parecerse en mayúsculas.
  const [proyecto = "", ...resto] = segmentos;
  const carpetaProyecto = findProjectFolder(proyecto);
  if (carpetaProyecto !== proyecto) return null;

  const raizProyecto = path.join(docsReal, carpetaProyecto);
  const subdir = segmentosDentro(raizProyecto, rutaReal(tasksRootPath(carpetaProyecto)));
  if (!subdir || subdir.some((segmento, i) => resto[i] !== segmento)) return null;

  const [taskName, ...archivo] = resto.slice(subdir.length);
  if (!taskName || taskName.startsWith(".") || archivo.length === 0) return null;
  if (archivo.some((segmento) => segmento.startsWith("."))) return null;

  const carpetaTarea = path.join(raizProyecto, ...subdir, taskName);
  if (!fs.statSync(carpetaTarea, { throwIfNoEntry: false })?.isDirectory()) return null;

  return { carpetaProyecto, taskName, carpetaTarea, relativo: archivo.join("/") };
}

// ─── Repos ──────────────────────────────────────────────────────────────────
// Ruta de un archivo dentro de UN repo. Antes la comprobación miraba la carpeta de repos
// entera, y desde repoA "../repoB/.env" pasaba: estaba dentro de la carpeta de repos. El repo
// se resuelve a su ruta real para que un repo que es un enlace a otra unidad siga valiendo.
export function resolveRepoPath(repoName: string, filePath: string): string {
  validarSegmento(repoName, "repo_name");

  const repo = path.join(requireBasePath(REPOS), repoName);
  const repoReal = rutaReal(repo);
  const ruta = path.join(repo, filePath);

  if (!estaDentroReal(repoReal, ruta)) {
    throw new Error(`Acceso denegado: file_path "${filePath}" queda fuera del repositorio ${repoName}.`);
  }
  return ruta;
}

// ─── Lectura acotada ────────────────────────────────────────────────────────
// Lo que leen las tools va entero al contexto del modelo. Un volcado de varios megas o un
// binario no le sirven de nada y se comen la conversación, así que se cortan antes de leer.
export const LIMITE_LECTURA_BYTES = 1_048_576;

// La misma heurística que usa git para decidir si un archivo es binario.
const BYTES_PARA_DETECTAR_BINARIO = 8000;

// Se lee del descriptor y no de la ruta: tipo, tamaño y contenido salen del mismo archivo
// abierto. Con statSync seguido de readFileSync, un archivo que crecía entre las dos llamadas
// se leía entero, sin tope. Y nunca se piden más de LIMITE + 1 bytes, que es lo justo para
// saber si se pasa. O_NONBLOCK, que no existe en Windows, evita que abrir un FIFO se quede
// esperando a que alguien escriba en él.
//
// Riesgo aceptado: la contención se comprueba sobre la ruta real y aquí se abre la ruta tal
// cual, así que cambiar un enlace justo entre las dos cosas abriría otro destino. Cerrarlo
// exige abrir sin seguir enlaces componente a componente, que Node no ofrece de forma portable.
export function leerTextoAcotado(ruta: string): string {
  let descriptor: number;
  try {
    descriptor = fs.openSync(ruta, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  } catch (error: any) {
    if (error?.code === "EISDIR") throw new Error(`${ruta} no es un archivo: es una carpeta.`);
    throw error;
  }

  try {
    const info = fs.fstatSync(descriptor);
    if (!info.isFile()) {
      throw new Error(`${ruta} no es un archivo normal: es una carpeta, un dispositivo o una tubería.`);
    }
    if (info.size > LIMITE_LECTURA_BYTES) {
      throw new Error(
        `${ruta} pesa ${info.size} bytes y el límite de lectura es 1 MB (${LIMITE_LECTURA_BYTES} bytes).`
      );
    }

    const buffer = Buffer.alloc(LIMITE_LECTURA_BYTES + 1);
    let leidos = 0;
    while (leidos < buffer.length) {
      const bytes = fs.readSync(descriptor, buffer, leidos, buffer.length - leidos, null);
      if (bytes === 0) break;
      leidos += bytes;
    }
    if (leidos > LIMITE_LECTURA_BYTES) {
      throw new Error(
        `${ruta} creció mientras se leía y pasa del límite de lectura de 1 MB (${LIMITE_LECTURA_BYTES} bytes).`
      );
    }

    const contenido = buffer.subarray(0, leidos);
    if (contenido.subarray(0, BYTES_PARA_DETECTAR_BINARIO).includes(0)) {
      throw new Error(
        `${ruta} parece binario: tiene un byte NUL en sus primeros ${BYTES_PARA_DETECTAR_BINARIO} bytes. ` +
          `Estas tools solo leen texto.`
      );
    }

    return contenido.toString("utf-8");
  } finally {
    fs.closeSync(descriptor);
  }
}
