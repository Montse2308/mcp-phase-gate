// Utilidades para montar una Documentación Central de mentira en una carpeta temporal.
//
// Los tests trabajan sobre archivos reales en vez de simular el sistema de archivos, porque
// lo que se está probando es precisamente el comportamiento contra el disco: qué carpetas
// cuentan como proyecto, qué documentos existen y en qué orden se tocaron.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const SUBDIR_POR_DEFECTO = "Proyectos";

export function carpetaTemporal(prefijo: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `orq-${prefijo}-`));
}

// Deja el entorno apuntando a una Documentación Central vacía y devuelve su ruta.
export function docsTemporales(subdir: string = SUBDIR_POR_DEFECTO): string {
  const docs = carpetaTemporal("docs");
  process.env.ORQUESTADOR_DOCS_PATH = docs;
  process.env.ORQUESTADOR_TASKS_SUBDIR = subdir;
  return docs;
}

// Un proyecto es una carpeta que contiene la subcarpeta de tareas.
export function crearProyecto(docs: string, nombre: string, subdir: string = SUBDIR_POR_DEFECTO): string {
  const ruta = path.join(docs, nombre, subdir);
  fs.mkdirSync(ruta, { recursive: true });
  return ruta;
}

// Crea la carpeta de una tarea con los documentos indicados dentro.
// `mtime` fija la fecha de modificación para poder probar el orden por actividad sin
// depender de que dos escrituras seguidas caigan en milisegundos distintos.
export function crearTarea(
  docs: string,
  proyecto: string,
  tarea: string,
  documentos: string[] = [],
  opciones: { subdir?: string; mtime?: Date } = {}
): string {
  const subdir = opciones.subdir ?? SUBDIR_POR_DEFECTO;
  const carpeta = path.join(docs, proyecto, subdir, tarea);
  fs.mkdirSync(carpeta, { recursive: true });

  for (const documento of documentos) {
    const archivo = path.join(carpeta, documento);
    fs.writeFileSync(archivo, `contenido de ${documento}`, "utf-8");
    if (opciones.mtime) fs.utimesSync(archivo, opciones.mtime, opciones.mtime);
  }

  if (opciones.mtime) fs.utimesSync(carpeta, opciones.mtime, opciones.mtime);

  return carpeta;
}

// Carpeta de prompts de mentira: cada entrada es el nombre del archivo y su contenido.
export function promptsTemporales(archivos: Record<string, string>): string {
  const carpeta = carpetaTemporal("prompts");
  for (const [nombre, contenido] of Object.entries(archivos)) {
    fs.writeFileSync(path.join(carpeta, nombre), contenido, "utf-8");
  }
  process.env.ORQUESTADOR_PROMPTS_PATH = carpeta;
  return carpeta;
}

// Estado local aislado, para no tocar el del usuario que corre los tests.
export function estadoTemporal(): string {
  const carpeta = carpetaTemporal("state");
  process.env.ORQUESTADOR_STATE_PATH = carpeta;
  return carpeta;
}

// Las variables de entorno son globales al proceso y los tests corren en el mismo:
// dejarlas puestas hace que un test contamine al siguiente.
export function limpiarEntorno(): void {
  delete process.env.ORQUESTADOR_DOCS_PATH;
  delete process.env.ORQUESTADOR_REPOS_PATH;
  delete process.env.ORQUESTADOR_TASKS_SUBDIR;
  delete process.env.ORQUESTADOR_PROMPTS_PATH;
  delete process.env.ORQUESTADOR_STATE_PATH;
}
