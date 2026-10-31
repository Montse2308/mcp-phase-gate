// Path resolution inside the Central Documentation: projects, task folders and the specific file that a
// tool is going to read or write.
//
// Everything that builds a path lives here, in one place. A path error does not blow up: it writes the
// file correctly in the wrong place, and that is not found until someone looks for it. That is why,
// besides building them, it is necessary to check that they fall inside the base.

import * as fs from "fs";
import * as path from "path";
import { DOCS, REPOS, requireBasePath, tasksSubdir } from "./config.js";
import { fallo, mensaje } from "./i18n/mensajes.js";

// Checks that a path falls inside another. startsWith does not work, and it fails in both directions: with
// base "C:\PROYECTOS\TRABAJO" it lets "C:\PROYECTOS\TRABAJO_VIEJO" through, which starts the same without
// being inside; and it rejects valid paths when the base is written with other capitals. Comparing the
// relative path solves both.
export function estaDentro(base: string, ruta: string): boolean {
  const relativa = path.relative(path.resolve(base), path.resolve(ruta));
  return relativa === "" || (!relativa.startsWith("..") && !path.isAbsolute(relativa));
}

// Resolves symlinks and junctions of the nearest existing ancestor and joins the rest back. It is needed
// because the path that is going to be written almost never exists yet, and realpath only works on what
// exists. "Exists" is checked with lstat and not with existsSync: a broken link counts as existing,
// realpath fails on it and the operation is rejected. With existsSync it would be skipped, and writing
// through it would create its target, wherever that is.
export function rutaReal(ruta: string): string {
  let existente = path.resolve(ruta);
  const pendientes: string[] = [];

  while (!fs.lstatSync(existente, { throwIfNoEntry: false })) {
    const padre = path.dirname(existente);
    if (padre === existente) break; // not even the root exists: let realpath give the error
    pendientes.unshift(path.basename(existente));
    existente = padre;
  }

  return path.join(fs.realpathSync.native(existente), ...pendientes);
}

// estaDentro on real paths. Comparing the text is not enough: a symlink inside the Documentation that
// points outside has a path that "is inside" and a target that is not. The base is also resolved: a DOCS
// that is a symlink still works.
export function estaDentroReal(base: string, ruta: string): boolean {
  return estaDentro(rutaReal(base), rutaReal(ruta));
}

// Key to compare document names: two names with the same key look the same, and on Windows and macOS they
// open the same file. rutaReal only fixes the capitals of what already exists, so what does not exist yet
// is compared here. Case-insensitive on every system, so that the behavior does not depend on the machine.
export function claveDeNombre(nombre: string): string {
  return nombre.normalize("NFC").toLowerCase();
}

// A project, task or repo name is ONE path segment, portable between systems: the Documentation travels
// between machines with Windows, macOS and Linux. What is rejected is what was already dangerous
// (separators, "..") or what Windows cannot store and breaks synchronization (reserved characters, a
// trailing dot or space, CON, NUL…).
const CARACTERES_RESERVADOS = /[<>:"|?*]/;
const CARACTERES_DE_CONTROL = /[\u0000-\u001f\u007f]/;
// Windows also reserves COM and LPT with the superscripts ¹²³, and the consoles CONIN$ and CONOUT$.
// The spaces before the extension do not count: "nul .txt" is still NUL.
const NOMBRES_RESERVADOS_WINDOWS = /^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³]) *(\..*)?$/i;

export function validarSegmento(valor: string, campo: string): string {
  // The rule is named by its code and worded inside the sentence, in the same language.
  const incumple = (codigoDeRegla: string): never => {
    throw fallo("RUTA-SEGMENTO-INVALIDO", { campo, valor, regla: mensaje(codigoDeRegla, { valor }) });
  };

  if (valor.trim() === "") incumple("RUTA-REGLA-VACIO");
  if (valor === "." || valor === "..") incumple("RUTA-REGLA-PUNTOS");
  if (/[\\/]/.test(valor)) incumple("RUTA-REGLA-SEPARADOR");
  if (CARACTERES_DE_CONTROL.test(valor)) incumple("RUTA-REGLA-CONTROL");
  if (CARACTERES_RESERVADOS.test(valor)) incumple("RUTA-REGLA-RESERVADOS");
  if (/[. ]$/.test(valor)) incumple("RUTA-REGLA-FINAL");
  if (NOMBRES_RESERVADOS_WINDOWS.test(valor)) incumple("RUTA-REGLA-NOMBRE-WINDOWS");

  return valor;
}

// A project or a task that start_task is going to create cannot start with a dot either: folders with a
// dot are neither project nor task, so it would not show up in list_tasks and write_central_doc could not
// write in it. It does not go in validarSegmento because read_central_doc uses it too, and reading does
// not change.
export function validarNombreVisible(valor: string, campo: string): string {
  if (valor.startsWith(".")) {
    throw fallo("RUTA-NOMBRE-CON-PUNTO", { campo, valor });
  }
  return valor;
}

// ─── Projects ───────────────────────────────────────────────────────────────
// The projects are not declared anywhere: they are the folders that exist. A fixed table of aliases would
// restrict nothing —any made-up name would resolve a path and start_task would create its folder— so there
// is none.
//
// A project is a folder that contains the tasks subfolder. That rule leaves out by itself the folders that
// are not projects, and registers a new one just by creating its subfolder. If the subfolder is empty the
// rule cannot be applied and any folder is valid.
// Folders with a dot are never a project: .obsidian or .git at the root of the Documentation.
// `base` is for whoever walks a Documentation other than the environment's: init --docs --migrate.
export function discoverProjects(base: string = requireBasePath(DOCS)): Map<string, string> {
  const proyectos = new Map<string, string>(); // lowercase key -> real name of the folder
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
    return nombres.length ? nombres.join(", ") : mensaje("RUTA-PROYECTOS-NINGUNO");
  } catch {
    // Without DOCS_PATH configured they cannot be listed; the real error comes from the tool.
    return mensaje("RUTA-PROYECTOS-ILEGIBLES");
  }
}

// Returns the real name of the folder, respecting capitals, or null if it does not exist.
export function findProjectFolder(project: string): string | null {
  return discoverProjects().get(String(project).trim().toLowerCase()) ?? null;
}

export function requireProjectFolder(project: string): string {
  const carpeta = findProjectFolder(project);
  if (!carpeta) {
    throw fallo("RUTA-PROYECTO-NO-EXISTE", { proyecto: project, disponibles: describeProjects() });
  }
  return carpeta;
}

// ─── Task folders ───────────────────────────────────────────────────────────
// The path of a task is ALWAYS built here, in one place.
// Structure: <PHASE_GATE_DOCS_PATH>/<PROJECT>/<tasks subfolder>/<task>
export function taskFolderPath(carpetaProyecto: string, taskName: string): string {
  validarSegmento(taskName, "task_name");
  return path.join(requireBasePath(DOCS), carpetaProyecto, tasksSubdir(), taskName);
}

export function resolveTaskFolder(project: string, taskName: string): string {
  return taskFolderPath(requireProjectFolder(project), taskName);
}

// Folder that contains all the tasks of a project. It is the one that is listed to know which tasks exist:
// the disk is the register, there is no separate file to keep in sync.
export function tasksRootPath(carpetaProyecto: string): string {
  return path.join(requireBasePath(DOCS), carpetaProyecto, tasksSubdir());
}

// A relative path made of portable segments. Each segment is validated separately so that a legitimate
// subfolder such as "04 - Ejecución/L01 - x.md" still works.
// `relativaA` is the code of the message that names the reference folder.
function validarRutaRelativa(valor: string, campo: string, relativaA: "RUTA-RELATIVA-A-TAREA" | "RUTA-RELATIVA-A-DOCS"): void {
  if (path.isAbsolute(valor)) {
    throw fallo("RUTA-RELATIVA-ABSOLUTA", { campo, valor, relativaA: mensaje(relativaA) });
  }
  for (const segmento of valor.split(/[\\/]/)) validarSegmento(segmento, campo);
}

// The arguments of read_central_doc and write_central_doc, already validated by their schema.
export type ArgumentosDeDocumento = {
  project?: string | undefined;
  task_name?: string | undefined;
  file_name?: string | undefined;
  file_path?: string | undefined;
};

// Resolves the absolute path for read/write. It prioritizes project+task_name+file_name; otherwise it falls
// back to the legacy mode, with file_path relative to the Central Documentation.
//
// With file_name the path has to stay inside the task's folder, not just inside the base: otherwise
// "../otra-tarea/x.md" would write in another task, and a check that only looked at the base would let it
// through.
//
// With file_path it is enough here not to leave the base (write_central_doc also demands that it fall in a
// task: ubicarEnTarea), but its segments also have to be portable: otherwise a "CON", a "nul.md" or an
// alternate stream "nota.md:secreto" would be created inside the Documentation, which Explorer and
// OneDrive cannot handle.
export function resolveDocPath(args: ArgumentosDeDocumento): string {
  const { project = "", task_name: taskName = "", file_name: fileName = "", file_path: filePath = "" } = args;

  if (project && taskName && fileName) {
    const carpetaTarea = resolveTaskFolder(project, taskName);
    validarRutaRelativa(fileName, "file_name", "RUTA-RELATIVA-A-TAREA");

    const ruta = path.join(carpetaTarea, fileName);
    if (!estaDentroReal(carpetaTarea, ruta)) {
      throw fallo("RUTA-FUERA-DE-TAREA", { fileName, carpetaTarea });
    }
    return ruta;
  }

  if (filePath) {
    const docsBase = requireBasePath(DOCS);
    validarRutaRelativa(filePath, "file_path", "RUTA-RELATIVA-A-DOCS");

    const ruta = path.join(docsBase, filePath);
    if (!estaDentroReal(docsBase, ruta)) {
      throw fallo("RUTA-FUERA-DE-DOCS", { docsBase });
    }
    return ruta;
  }

  throw fallo("RUTA-FALTAN-ARGUMENTOS");
}

// ─── Location inside a task ─────────────────────────────────────────────────
export type UbicacionEnTarea = {
  carpetaProyecto: string; // real name of the project folder
  taskName: string;
  carpetaTarea: string; // absolute (real) path
  relativo: string; // path inside the task, with "/" as separator
};

// Segments of `ruta` inside `base`, or null if it does not fall inside. Both come already resolved.
function segmentosDentro(base: string, ruta: string): string[] | null {
  const relativa = path.relative(base, ruta);
  if (relativa === "") return [];
  if (relativa.startsWith("..") || path.isAbsolute(relativa)) return null;
  return relativa.split(/[\\/]/);
}

// write_central_doc only writes inside the folder of a task that already exists. With file_path one could
// write anywhere in the Documentation, including the project's phase-gate.json, and with a misspelled task
// the recursive mkdir created a loose folder.
//
// It is measured on real paths, like containment: an internal link that leads to a task is fine, because
// what is written ends up inside it. The tasks subfolder is compared with the one on disk and not with the
// variable: on Windows and macOS they can differ in capitals, and discoverProjects already takes the
// project as good.
//
// Returns null if the path does not fall inside the folder of an existing task, or if any segment inside
// the task starts with a dot (.git, .phase-gate are not documents).
export function ubicarEnTarea(rutaAbsoluta: string): UbicacionEnTarea | null {
  const docsReal = rutaReal(requireBasePath(DOCS));
  const segmentos = segmentosDentro(docsReal, rutaReal(rutaAbsoluta));
  if (!segmentos || segmentos.length === 0) return null;

  // The name the disk gives has to be the project's, not just look like it in capitals.
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
// Path of a file inside ONE repo. The check has to look at that repo and not at the whole repos folder:
// from repoA, "../repoB/.env" would pass, since it is inside the repos folder. The repo is resolved to its
// real path so that a repo that is a link to another drive still works.
//
// It does not enter .git either, with the same rule as read_repo_file: config can carry the token of the
// remote's URL.
export function resolveRepoPath(repoName: string, filePath: string): string {
  validarSegmento(repoName, "repo_name");

  const repo = path.join(requireBasePath(REPOS), repoName);
  const repoReal = rutaReal(repo);
  const ruta = path.join(repo, filePath);

  if (!estaDentroReal(repoReal, ruta)) {
    throw fallo("RUTA-FUERA-DE-REPO", { filePath, repoName });
  }
  if (filePath.split(/[\\/]/).some(esSegmentoDeGit)) {
    throw fallo("RUTA-ENTRA-EN-GIT", { filePath });
  }
  if (path.relative(repoReal, rutaReal(ruta)).split(/[\\/]/).some(esSegmentoDeGit)) {
    throw fallo("RUTA-GIT-POR-ENLACE", { filePath });
  }
  return ruta;
}

// No .git: neither the folder (config can carry credentials in a URL, and hooks/ is code), nor a .git file
// (the pointer of a worktree or a submodule). Every segment that is `.git` or starts with `.git` is
// rejected, case-insensitively (on Windows and macOS `.GIT` opens the same). The exception is `.github`,
// which cannot be .git and holds the CI workflows. Accepted consequence: .gitignore, .gitattributes and
// .gitmodules are not read with read_repo_file or read_cross_repo either. The already resolved path is
// checked the same way, so a short 8.3 name (GIT~1) or an internal link does not lead to .git.
export function esSegmentoDeGit(segmento: string): boolean {
  const nombre = segmento.toLowerCase();
  return nombre.startsWith(".git") && nombre !== ".github";
}

// ─── Bounded reading ────────────────────────────────────────────────────────
// What the tools read goes whole into the model's context. A dump of several megabytes or a binary is of
// no use to it and eats the conversation, so they are cut before reading.
export const LIMITE_LECTURA_BYTES = 1_048_576;

// The same heuristic git uses to decide whether a file is binary.
const BYTES_PARA_DETECTAR_BINARIO = 8000;

// It is read from the descriptor and not from the path: type, size and content come from the same open
// file. With statSync followed by readFileSync, a file that grew between the two calls was read whole,
// without a cap. And never more than LIMITE + 1 bytes are requested, which is just enough to know whether
// it goes over. O_NONBLOCK, which does not exist on Windows, keeps opening a FIFO from waiting for someone
// to write into it.
//
// Accepted risk: containment is checked on the real path and here the path is opened as it is, so swapping
// a link right between the two would open another target. Closing it requires opening without following
// links component by component, which Node does not offer in a portable way.
export function leerTextoAcotado(ruta: string): string {
  let descriptor: number;
  try {
    descriptor = fs.openSync(ruta, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  } catch (error: any) {
    if (error?.code === "EISDIR") throw fallo("RUTA-ES-CARPETA", { ruta });
    throw error;
  }

  try {
    const info = fs.fstatSync(descriptor);
    if (!info.isFile()) {
      throw fallo("RUTA-NO-ES-ARCHIVO-NORMAL", { ruta });
    }
    if (info.size > LIMITE_LECTURA_BYTES) {
      throw fallo("RUTA-DEMASIADO-GRANDE", { ruta, bytes: info.size, limite: LIMITE_LECTURA_BYTES });
    }

    const buffer = Buffer.alloc(LIMITE_LECTURA_BYTES + 1);
    let leidos = 0;
    while (leidos < buffer.length) {
      const bytes = fs.readSync(descriptor, buffer, leidos, buffer.length - leidos, null);
      if (bytes === 0) break;
      leidos += bytes;
    }
    if (leidos > LIMITE_LECTURA_BYTES) {
      throw fallo("RUTA-CRECIO", { ruta, limite: LIMITE_LECTURA_BYTES });
    }

    const contenido = buffer.subarray(0, leidos);
    if (contenido.subarray(0, BYTES_PARA_DETECTAR_BINARIO).includes(0)) {
      throw fallo("RUTA-BINARIO", { ruta, bytes: BYTES_PARA_DETECTAR_BINARIO });
    }

    return contenido.toString("utf-8");
  } finally {
    fs.closeSync(descriptor);
  }
}
