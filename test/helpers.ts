// Utilidades para montar una Documentación Central de mentira en una carpeta temporal.
//
// Los tests trabajan sobre archivos reales en vez de simular el sistema de archivos, porque
// lo que se está probando es precisamente el comportamiento contra el disco: qué carpetas
// cuentan como proyecto, qué documentos existen y en qué orden se tocaron.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { after } from "node:test";

import { VARIABLES, reiniciarEnv } from "../src/config.js";

export const SUBDIR_POR_DEFECTO = "Proyectos";

// Todo lo que crea carpetaTemporal se borra al terminar. Antes no se borraba nada: cada
// ejecución de la suite dejaba unas 145 carpetas orq-* en la carpeta temporal del sistema.
// Cada archivo de test corre en su propio proceso, así que este hook se registra una vez por
// archivo, al importar este módulo. rmSync no sigue los enlaces: borra la junction, no su
// destino, que en estos tests es siempre otra carpeta temporal.
const temporales = new Set<string>();

after(() => {
  for (const carpeta of temporales) {
    try {
      fs.rmSync(carpeta, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // Limpiar es cortesía: un archivo bloqueado en Windows no debe tumbar la suite.
    }
  }
});

// Sobre la ruta real de la carpeta temporal, no sobre os.tmpdir() tal cual. En Windows, con un
// usuario cuyo nombre lleva espacios, os.tmpdir() devuelve el nombre corto 8.3 (NOMBRE~1) y
// realpath el largo: cualquier test que compare contra una ruta ya resuelta fallaría solo ahí.
export function carpetaTemporal(prefijo: string): string {
  const carpeta = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), `orq-${prefijo}-`));
  temporales.add(carpeta);
  return carpeta;
}

// Enlace a una carpeta. En Windows un symlink exige modo desarrollador o permisos de
// administrador; una junction no, y para lo que se prueba aquí —que la contención mire la
// ruta real— se comporta igual.
export function crearSymlink(destino: string, ruta: string): void {
  fs.symlinkSync(destino, ruta, process.platform === "win32" ? "junction" : "dir");
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
// dejarlas puestas hace que un test contamine al siguiente. Se borran los dos nombres de cada
// variable, y también lo que haya cargado un .env (y su error de UTF-16).
export function limpiarEntorno(): void {
  reiniciarEnv();
  for (const { principal, alias } of Object.values(VARIABLES)) {
    delete process.env[principal];
    if (alias) delete process.env[alias];
  }
}

// Una PHASE_GATE_* que quien corre los tests tenga en su terminal ganaría a las ORQUESTADOR_* que
// ponen los tests. Se limpia al importar, antes del primer test de cada archivo.
limpiarEntorno();
