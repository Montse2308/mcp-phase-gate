// Resolución de rutas dentro de la Documentación Central: proyectos, carpetas de tarea
// y el archivo concreto que una tool va a leer o escribir.
//
// Todo lo que arma una ruta vive aquí, en un solo lugar. Un error de ruta no truena: escribe
// el archivo correctamente en el sitio equivocado, y eso no se descubre hasta que alguien lo
// busca. Por eso además de armarlas hay que comprobar que caigan dentro de la base.

import * as fs from "fs";
import * as path from "path";
import { DOCS, requireBasePath, tasksSubdir } from "./config.js";

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

// Un nombre de proyecto, tarea o repo es UN segmento de ruta, portable entre sistemas:
// la Documentación viaja entre equipos con Windows, macOS y Linux. Lo que se rechaza es lo
// que hoy ya era peligroso (separadores, "..") o lo que Windows no puede guardar y rompe la
// sincronización (caracteres reservados, punto o espacio final, CON, NUL…).
const CARACTERES_RESERVADOS = /[<>:"|?*]/;
const CARACTERES_DE_CONTROL = /[\u0000-\u001f\u007f]/;
const NOMBRES_RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

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
    incumple("es un nombre reservado de Windows (CON, PRN, AUX, NUL, COM1–COM9, LPT1–LPT9)");
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
export function discoverProjects(): Map<string, string> {
  const proyectos = new Map<string, string>(); // clave en minúsculas -> nombre real de la carpeta
  const base = requireBasePath(DOCS);
  const subdir = tasksSubdir();

  for (const entrada of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entrada.isDirectory()) continue;
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
// Con file_name la ruta tiene que quedar dentro de la carpeta de la tarea, no solo dentro de
// la base: antes "../otra-tarea/x.md" escribía en otra tarea y la comprobación de la tool,
// que solo miraba la base, lo dejaba pasar. Cada segmento se valida por separado para que
// una subcarpeta legítima como "04 - Ejecución/L01 - x.md" siga valiendo.
export function resolveDocPath(args: any): string {
  const project = args?.project ? String(args.project) : "";
  const taskName = args?.task_name ? String(args.task_name) : "";
  const fileName = args?.file_name ? String(args.file_name) : "";

  if (project && taskName && fileName) {
    const carpetaTarea = resolveTaskFolder(project, taskName);

    if (path.isAbsolute(fileName)) {
      throw new Error(
        `file_name no puede ser una ruta absoluta ("${fileName}"): es relativo a la carpeta de la tarea.`
      );
    }
    for (const segmento of fileName.split(/[\\/]/)) validarSegmento(segmento, "file_name");

    const ruta = path.join(carpetaTarea, fileName);
    if (!estaDentroReal(carpetaTarea, ruta)) {
      throw new Error(`Acceso denegado: file_name "${fileName}" queda fuera de la carpeta de la tarea ${carpetaTarea}.`);
    }
    return ruta;
  }

  if (args?.file_path) {
    const docsBase = requireBasePath(DOCS);
    const ruta = path.join(docsBase, String(args.file_path));
    if (!estaDentroReal(docsBase, ruta)) {
      throw new Error(`Acceso denegado: file_path queda fuera de ${docsBase}.`);
    }
    return ruta;
  }

  throw new Error("Debes proporcionar (project + task_name + file_name) o bien file_path.");
}
