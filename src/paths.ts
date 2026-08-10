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
export function resolveDocPath(args: any): string {
  const project = args?.project ? String(args.project) : "";
  const taskName = args?.task_name ? String(args.task_name) : "";
  const fileName = args?.file_name ? String(args.file_name) : "";

  if (project && taskName && fileName) {
    return path.join(resolveTaskFolder(project, taskName), fileName);
  }

  if (args?.file_path) {
    return path.join(requireBasePath(DOCS), String(args.file_path));
  }

  throw new Error("Debes proporcionar (project + task_name + file_name) o bien file_path.");
}
