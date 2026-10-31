// Tasks: which exist, which phase each one is in, and which is each project's active one.
//
// The central idea: **the folder is the register**. Tasks are the folders that exist and the phase of each
// one is deduced from the documents inside, because each phase declares in its header what its own is
// called. There is no file that lists tasks or points to phases.
//
// Storing that information would mean having two copies of the same truth, and the stored copy would depend
// on the model remembering to report each advance. Deducing it from the disk makes it a fact: if you delete
// a document by hand because it came out wrong, the phase goes down by itself.
//
// The only thing that is stored is a pointer per project —which task is the active one—, because the disk
// cannot know that. A single global pointer would let two windows open at once overwrite each other's:
// window A would ask where it was and be answered with B's task.

import * as fs from "fs";
import * as path from "path";
import { MODULE_DIR, stateDir, stateFile } from "./config.js";
import { mensaje } from "./i18n/mensajes.js";
import { log } from "./log.js";
import { idiomaDelProyecto } from "./manifiesto.js";
import { claveDeNombre, findProjectFolder, leerTextoAcotado, requireProjectFolder, tasksRootPath } from "./paths.js";
import { separarFrontmatter } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { cabeceraDeRecibo, frontmatterDeRecibo, loteDelNombre } from "./recibos.js";
import { ENCABEZADOS_DE_PENDIENTES, FORMAS_DE_VACIO, IDIOMAS, estadoCanonico, lotesDelFrontmatter, vocabulario } from "./vocabulario.js";
import type { Idioma } from "./vocabulario.js";

// ─── Active-task pointer, per project ───────────────────────────────────────
// Shape of the file: { "proyecto-a": "login-sso", "proyecto-b": "reporte-comisiones" }
// The key is the project name in lowercase; the value, the name of the task folder.
export type Punteros = Record<string, string>;

export function leerPunteros(): Punteros {
  const archivo = stateFile();
  if (!fs.existsSync(archivo)) return {};

  try {
    const crudo = JSON.parse(fs.readFileSync(archivo, "utf-8"));
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};

    // It is filtered instead of trusted: anyone may have touched the file, and an entry with an odd shape must
    // not bring down the others.
    const punteros: Punteros = {};
    for (const [proyecto, tarea] of Object.entries(crudo)) {
      if (typeof tarea === "string" && tarea.trim()) punteros[proyecto.toLowerCase()] = tarea;
    }
    return punteros;
  } catch {
    // An unreadable file must not leave the user without service: it is ignored and the system falls back to
    // deduction, which gives a reasonable answer without needing stored state.
    return {};
  }
}

export function guardarPuntero(project: string, taskName: string): void {
  const punteros = leerPunteros(); // re-read right before writing: another window may have changed it
  punteros[project.toLowerCase()] = taskName;
  escribirPunteros(punteros);
}

// Writes to a temporary file and renames. The rename is atomic within the same file system, so a cut halfway
// through a write does not leave the file half-written: either the old one is there, or the new one. It
// matters because several windows write the same file.
//
// A minimal window remains between reading and writing in which two simultaneous processes could lose each
// other's pointer. The file is not locked on purpose: the cost of losing a pointer is a `switch_task`, and
// a badly released lock leaves the server unusable.
function escribirPunteros(punteros: Punteros): void {
  const archivo = stateFile();
  const temporal = `${archivo}.tmp`;

  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(temporal, JSON.stringify(punteros, null, 2), "utf-8");
  fs.renameSync(temporal, archivo);
}

// The previous format stored a single global active task in `active_task.json`. It can no longer be read
// —its shape changed— and keeping it only leaves garbage in the data folder, so it is deleted the first time
// this version starts.
export function limpiarEstadoViejo(): void {
  const viejos = [path.join(stateDir(), "active_task.json"), path.join(MODULE_DIR, "active_task.json")];

  for (const viejo of viejos) {
    try {
      if (fs.existsSync(viejo)) {
        fs.unlinkSync(viejo);
        log("info", mensaje("TAREA-ESTADO-VIEJO-ELIMINADO", { ruta: viejo }));
      }
    } catch {
      // Not being able to delete it does not prevent working: the old file is no longer read.
    }
  }
}

// ─── Deduced state of a task ────────────────────────────────────────────────
// The progress inside the phase that runs by batches (the 4th), deduced from files that the server writes:
// the frontmatter of the plan and the one of each receipt.
export type ProgresoDeLotes = {
  total: number | null;            // from the plan's frontmatter; null if the plan does not declare it
  cerrados: number;                // receipts with an anchor other than pending (a failed one does not count)
  actual: number | null;           // first batch without a closed receipt
  pendienteDeCommit: number | null; // batch with a receipt and a pending commit
};

export type EstadoTarea = {
  taskName: string;
  folderPath: string;
  fasesHechas: number[];
  siguienteFase: number | null;  // null = no phase with a pending document is left
  fasesConDocumento: number;     // 0 = there is nothing to deduce (no prompt declares a document)
  ultimoCambio: number | null;   // mtime of the most recent document or receipt, to sort by activity
  lotes: ProgresoDeLotes | null; // only when the next phase is the one that declares receipts
};

function esLoteCerrado(cabecera: { estado: string; ancla: string }): boolean {
  return cabecera.ancla !== "pendiente" && cabecera.estado !== "fallido";
}

// Reads only frontmatter: the plan's `lotes` and the header of each receipt. An unreadable file does not
// count; the progress is a help for the chat, not a condition.
export function progresoDeLotes(folderPath: string, plan: string | null, recibos: string): ProgresoDeLotes {
  let total: number | null = null;
  if (plan) {
    try {
      const valor = (lotesDelFrontmatter(separarFrontmatter(leerTextoAcotado(path.join(folderPath, plan))).meta) ?? "").trim();
      if (/^\d+$/.test(valor) && Number(valor) >= 1 && Number(valor) <= 99) total = Number(valor);
    } catch {
      total = null;
    }
  }

  const porLote = new Map<number, { estado: string; ancla: string }[]>();
  const subcarpeta = path.join(folderPath, recibos);
  for (const nombre of fs.existsSync(subcarpeta) ? fs.readdirSync(subcarpeta).sort() : []) {
    const lote = loteDelNombre(nombre);
    if (lote === null) continue;
    try {
      const cabecera = cabeceraDeRecibo(leerTextoAcotado(path.join(subcarpeta, nombre)), nombre);
      porLote.set(lote, [...(porLote.get(lote) ?? []), cabecera]);
    } catch {
      // a receipt that cannot be read adds nothing; doctor reports it
    }
  }

  const cerradoEl = (lote: number) => (porLote.get(lote) ?? []).some(esLoteCerrado);
  // A receipt of a batch the plan does not declare is not the "current" batch (doctor flags it as out of plan).
  const pendiente = [...porLote.entries()]
    .sort((a, b) => a[0] - b[0])
    .find(([lote, cabeceras]) => (total === null || lote <= total) && cabeceras.some((c) => c.ancla === "pendiente"));
  let actual: number | null = null;
  if (total !== null) {
    for (let lote = 1; lote <= total; lote++) {
      if (!cerradoEl(lote)) {
        actual = lote;
        break;
      }
    }
  }

  return {
    total,
    cerrados: [...porLote.keys()].filter((lote) => (total === null || lote <= total) && cerradoEl(lote)).length,
    actual,
    pendienteDeCommit: pendiente ? pendiente[0] : null,
  };
}

// The phase that declares receipts and the previous one's document (its plan).
function faseDeRecibos(phases: Map<number, PhaseFile>): { numero: number; recibos: string; plan: string | null } | null {
  const ordenadas = [...phases.entries()].sort((a, b) => a[0] - b[0]);
  const conRecibos = ordenadas.find(([, datos]) => datos.recibos);
  if (!conRecibos) return null;
  const plan = ordenadas.filter(([n, d]) => n < conRecibos[0] && d.documento).pop();
  return { numero: conRecibos[0], recibos: conRecibos[1].recibos!, plan: plan ? plan[1].documento! : null };
}

// Looks at which documents exist in the folder and translates that into phases done and next phase. Only
// the phases that declare a document count: a phase without a document cannot be completed and, if it
// counted, it would leave the deduction stuck on it forever.
export function estadoDeTarea(
  taskName: string,
  folderPath: string,
  phases: Map<number, PhaseFile>
): EstadoTarea {
  const conDocumento = [...phases.entries()]
    .filter(([, datos]) => datos.documento)
    .sort((a, b) => a[0] - b[0]);

  const fasesHechas: number[] = [];
  const pendientes: number[] = [];
  let ultimoCambio: number | null = null;

  for (const [numero, datos] of conDocumento) {
    const documento = path.join(folderPath, datos.documento as string);

    if (!fs.existsSync(documento)) {
      pendientes.push(numero);
      continue;
    }

    fasesHechas.push(numero);

    try {
      const mtime = fs.statSync(documento).mtimeMs;
      if (ultimoCambio === null || mtime > ultimoCambio) ultimoCambio = mtime;
    } catch {
      // If the date cannot be read, the task still counts as advanced; it only loses precision when sorting by
      // activity.
    }
  }

  // The receipts are also activity: during Phase 4 they are the only thing that changes in days.
  for (const datos of phases.values()) {
    if (!datos.recibos) continue;
    const subcarpeta = path.join(folderPath, datos.recibos);
    try {
      for (const entrada of fs.readdirSync(subcarpeta, { withFileTypes: true })) {
        if (!entrada.isFile() || !entrada.name.toLowerCase().endsWith(".md")) continue;
        const mtime = fs.statSync(path.join(subcarpeta, entrada.name)).mtimeMs;
        if (ultimoCambio === null || mtime > ultimoCambio) ultimoCambio = mtime;
      }
    } catch {
      // without a receipts subfolder there is nothing to look at
    }
  }

  // With no document yet, the folder just created by start_task marks the activity.
  if (ultimoCambio === null) {
    try {
      ultimoCambio = fs.statSync(folderPath).mtimeMs;
    } catch {
      ultimoCambio = null;
    }
  }

  const siguienteFase = pendientes.length ? (pendientes[0] as number) : null;
  const deRecibos = faseDeRecibos(phases);
  const lotes = deRecibos && siguienteFase === deRecibos.numero ? progresoDeLotes(folderPath, deRecibos.plan, deRecibos.recibos) : null;

  return {
    taskName,
    folderPath,
    fasesHechas,
    siguienteFase,
    fasesConDocumento: conDocumento.length,
    ultimoCambio,
    lotes,
  };
}

// ─── Frozen documents ───────────────────────────────────────────────────────
// A phase document is frozen as soon as a later phase is present: rewriting it afterwards would change the
// basis that phase already worked on, without anything warning. It can be rewritten with force, which the
// model only uses with the user's explicit confirmation.
//
// A phase is present if its document exists, or if it declares receipts and its subfolder has at least one
// .md: with several batches, Phase 4 is under way long before its document is written.
function presenciaDeFase(carpetaTarea: string, datos: PhaseFile): string | null {
  if (datos.documento && fs.existsSync(path.join(carpetaTarea, datos.documento))) {
    return mensaje("TAREA-PRESENCIA-DOCUMENTO", { documento: datos.documento });
  }

  if (datos.recibos) {
    const subcarpeta = path.join(carpetaTarea, datos.recibos);
    const entradas = fs.existsSync(subcarpeta) ? fs.readdirSync(subcarpeta, { withFileTypes: true }) : [];
    if (entradas.some((entrada) => entrada.isFile() && entrada.name.toLowerCase().endsWith(".md"))) {
      return mensaje("TAREA-PRESENCIA-RECIBOS", { recibos: datos.recibos });
    }
  }

  return null;
}

// The protected names are compared by their key (claveDeNombre) and not as exact text. Without it a new file
// would dodge the protection: `00 - contexto inicial.md` or `04 - ejecución/L01 - x.md` on Windows and
// macOS, where they open the same as the protected name, and on any system a Unicode NFD name, which looks
// the same as the document. On Linux, a name that only differs in capitals from a protected document also
// asks for force; it is never needed.
const clave = claveDeNombre;

// The receipts and the document of the phase that declares them are written by the server (record_batch).
// write_central_doc always rejects them, also for creating them; the confirmation hatch (elicitation or
// force) is left for repairing a damaged file by hand. These are the codes of the two reasons: their text
// comes out in the language of the call.
export const MOTIVO_RECIBO = "TAREA-MOTIVO-RECIBO";
export const MOTIVO_DOCUMENTO_DE_LOTES = "TAREA-MOTIVO-DOCUMENTO-DE-LOTES";

// Whether the reason is one of the two about batches: it is compared with its text in both languages,
// because whoever asks received the text, not the code, and the language of the call may have changed in
// between.
export function esMotivoDeLotes(motivo: string | null): boolean {
  if (motivo === null) return false;
  return IDIOMAS.some((idioma) => [MOTIVO_RECIBO, MOTIVO_DOCUMENTO_DE_LOTES].some((codigo) => motivo === mensaje(codigo, {}, idioma)));
}

// Returns the reason for the rejection, or null if it can be written without force. `relativo` is the path
// inside the task, with "/" as separator (the one from ubicarEnTarea).
export function motivoDeProteccion(
  carpetaTarea: string,
  relativo: string,
  phases: Map<number, PhaseFile>,
  contextoInicial: string
): string | null {
  const buscado = clave(relativo);

  // Not even to create it: only start_task writes it.
  if (buscado === clave(contextoInicial)) {
    return mensaje("TAREA-MOTIVO-CONTEXTO-INICIAL");
  }

  const fases = [...phases.entries()].sort((a, b) => a[0] - b[0]);
  const propia = fases.find(
    ([, datos]) =>
      (datos.documento && clave(datos.documento) === buscado) ||
      (datos.recibos && buscado.startsWith(`${clave(datos.recibos)}/`))
  );
  if (!propia) return null; // not a phase file

  // The two batch rules go before freezing: in the receipts phase, neither its receipts nor its document are
  // written with this tool, whether they exist or not.
  const [numero, datos] = propia;
  const esDocumento = datos.documento !== undefined && clave(datos.documento) === buscado;
  if (datos.recibos) return mensaje(esDocumento ? MOTIVO_DOCUMENTO_DE_LOTES : MOTIVO_RECIBO);

  // Creating a document never overwrites anything, not even when it fills a gap. The declared name is looked
  // at and not the one that arrived, which may come in other capitals.
  if (esDocumento && !fs.existsSync(path.join(carpetaTarea, datos.documento!))) return null;

  for (const [posterior, datosPosterior] of fases) {
    if (posterior <= numero) continue;
    const presencia = presenciaDeFase(carpetaTarea, datosPosterior);
    if (presencia) {
      return mensaje("TAREA-MOTIVO-CONGELADO", { relativo, fase: posterior, presencia });
    }
  }

  return null;
}

// A short phrase for the chat. The map of phases is passed in so that the next phase can be named with its
// real title instead of a bare number. It is response text: in the language of the call.
export function describeEstado(estado: EstadoTarea, phases: Map<number, PhaseFile>): string {
  if (estado.fasesConDocumento === 0) {
    return mensaje("TAREA-ESTADO-DESCONOCIDO");
  }

  if (estado.siguienteFase === null) {
    return mensaje("TAREA-ESTADO-TERMINADA");
  }

  const titulo = phases.get(estado.siguienteFase)?.title;
  // In the batches phase, also where it is within it.
  const lotes = estado.lotes;
  let progreso = "";
  if (lotes) {
    if (lotes.total === null) progreso = mensaje("TAREA-PROGRESO-SIN-LOTES");
    else if (lotes.pendienteDeCommit !== null) progreso = mensaje("TAREA-PROGRESO-COMMIT-PENDIENTE", { lote: lotes.pendienteDeCommit, total: lotes.total });
    else if (lotes.actual !== null) progreso = mensaje("TAREA-PROGRESO-LOTE", { lote: lotes.actual, total: lotes.total });
    else progreso = mensaje("TAREA-PROGRESO-CERRADOS", { cerrados: lotes.cerrados, total: lotes.total });
  }
  const siguiente = mensaje("TAREA-VA-EN-FASE", { fase: estado.siguienteFase, titulo: titulo || null, progreso });

  return estado.fasesHechas.length
    ? mensaje("TAREA-FASES-HECHAS", { siguiente, hechas: estado.fasesHechas })
    : mensaje("TAREA-SIN-DOCUMENTOS", { siguiente });
}

// ─── Listing ────────────────────────────────────────────────────────────────
// Tasks are the folders under the project's tasks subfolder. They are listed from the disk, so the ones
// someone created by hand without going through start_task also show up. Folders with a dot are not tasks:
// with an empty subfolder, the project's .phase-gate/ or .git/ hang from the same place as they do.
export function listarTareas(
  carpetaProyecto: string,
  phases: Map<number, PhaseFile>
): EstadoTarea[] {
  const raiz = tasksRootPath(carpetaProyecto);

  if (!fs.existsSync(raiz)) return [];

  return fs
    .readdirSync(raiz, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory() && !entrada.name.startsWith("."))
    .map((entrada) => estadoDeTarea(entrada.name, path.join(raiz, entrada.name), phases))
    .sort((a, b) => (b.ultimoCambio ?? 0) - (a.ultimoCambio ?? 0));
}

// ─── Tarea activa ───────────────────────────────────────────────────────────
export type TareaActiva = {
  estado: EstadoTarea;
  // "puntero" is what the user chose; "deducida" is the most recent one, when there is no pointer. The
  // distinction is told to the user: a deduction presented as certainty is exactly the error to avoid.
  origen: "puntero" | "deducida";
};

// With a stored pointer, that one is returned. Without a pointer —state deleted, new machine, corrupt file—
// the task with the most recent activity is deduced, marked as a deduction. That way losing the state file
// is no longer a dead end.
// `tareas` is for whoever already listed the project's tasks (the Studio): so they are not walked twice.
export function tareaActiva(
  carpetaProyecto: string,
  phases: Map<number, PhaseFile>,
  tareas: EstadoTarea[] = listarTareas(carpetaProyecto, phases)
): TareaActiva | null {
  if (tareas.length === 0) return null;

  const apuntada = leerPunteros()[carpetaProyecto.toLowerCase()];

  if (apuntada) {
    const encontrada = tareas.find((tarea) => tarea.taskName === apuntada);
    // A pointer to a folder that no longer exists (renamed or deleted) must not leave without an answer: it is
    // ignored and deduced, as if there were no pointer.
    if (encontrada) return { estado: encontrada, origen: "puntero" };
  }

  return { estado: tareas[0] as EstadoTarea, origen: "deducida" };
}

// ─── Phase gate ─────────────────────────────────────────────────────────────
// Without it, the Phase 4 prompt could be requested with no earlier document: reading the plan failed with
// ENOENT, and what happened next depended on the model (one stopped to warn, another invented the plan).
//
// The check is a single comparison against the deduced phase, because `siguienteFase` already is "the first
// phase whose document is missing". The delicate case comes out for free: going back to an earlier phase to
// fix it is not skipping anything, and it is not hindered.
export type Salto = {
  fasePedida: number;
  siguienteFase: number;
  faltan: { fase: number; documento: string }[];
};

export function detectarSalto(
  fasePedida: number,
  estado: EstadoTarea,
  phases: Map<number, PhaseFile>
): Salto | null {
  // Without phases with a document there is nothing to compare against; and a finished task has no gaps, so
  // no phase that is requested can be a skip.
  if (estado.siguienteFase === null) return null;

  // Asking for the phase that is due, or an earlier one, is legitimate. Only forward is looked at.
  if (fasePedida <= estado.siguienteFase) return null;

  const faltan = [...phases.entries()]
    .filter(([numero, datos]) => numero < fasePedida && datos.documento && !estado.fasesHechas.includes(numero))
    .sort((a, b) => a[0] - b[0])
    .map(([numero, datos]) => ({ fase: numero, documento: datos.documento as string }));

  return { fasePedida, siguienteFase: estado.siguienteFase, faltan };
}

// The warning goes at the start of the prompt, not in a separate field, because the model has to read it as
// part of its instructions. It warns and delivers anyway: blocking would get in the way the day a phase has
// to be skipped on purpose, and there is no data today on how often that happens. It resolves which task is
// being talked about and returns the warning, or null if there is nothing to say.
//
// Who does this work is the gate's design decision: the server does it, not the model. The per-project
// pointer is already stored here, so asking the model for it would be extra work and a source of friction —
// if it could not deduce it, it would end up asking the user in every phase, and typing "/f4" to be answered
// "which task are we on?" is worse than having no gate.
//
// `project` and `taskName` are only a manual override, to check against a task other than the active one.
// Without them the pointer is used; and when it truly cannot be known, it is said out loud, instead of
// staying silent as if everything were in order.
export type OpcionesDeTarea = { project?: string; taskName?: string };

// The phases a task is deduced with depend on its project (a project can replace a phase with another
// document). The caller passes a fixed map or the function that gives those of each project, because here
// the project is resolved inside.
export type FasesPorProyecto = Map<number, PhaseFile> | ((carpetaProyecto: string) => Map<number, PhaseFile>);

function fasesPara(phases: FasesPorProyecto, carpetaProyecto: string): Map<number, PhaseFile> {
  return typeof phases === "function" ? phases(carpetaProyecto) : phases;
}

export type TareaResuelta = { estado: EstadoTarea; carpetaProyecto: string; phases: Map<number, PhaseFile> };

// The task a get_phase_prompt call talks about: the one indicated, or the project's active one. Without a
// project it can only be resolved if there is exactly one candidate with an active task; with several,
// "ambigua" is returned so that the caller says so instead of staying silent.
export function tareaDelPrompt(phases: FasesPorProyecto, opciones: OpcionesDeTarea = {}): EstadoTarea | "ambigua" | null {
  const resuelta = resolverTareaDelPrompt(phases, opciones);
  return resuelta === "ambigua" || resuelta === null ? resuelta : resuelta.estado;
}

export function resolverTareaDelPrompt(phases: FasesPorProyecto, opciones: OpcionesDeTarea = {}): TareaResuelta | "ambigua" | null {
  let carpetaProyecto: string;

  if (opciones.project) {
    carpetaProyecto = requireProjectFolder(opciones.project);
  } else {
    const conPuntero = Object.keys(leerPunteros());

    if (conPuntero.length === 0) return null; // Nothing started: there is nothing to check.
    if (conPuntero.length > 1) return "ambigua";

    const encontrada = findProjectFolder(conPuntero[0] as string);
    if (!encontrada) return null; // Pointer of a project that no longer exists: it is ignored.
    carpetaProyecto = encontrada;
  }

  const deEste = fasesPara(phases, carpetaProyecto);
  const estado = opciones.taskName
    ? listarTareas(carpetaProyecto, deEste).find((tarea) => tarea.taskName === opciones.taskName)
    : tareaActiva(carpetaProyecto, deEste)?.estado;

  // null: a project without tasks, or a task name that does not exist.
  return estado ? { estado, carpetaProyecto, phases: deEste } : null;
}

export function avisoDeCompuerta(fasePedida: number, phases: FasesPorProyecto, opciones: OpcionesDeTarea = {}): string | null {
  const resuelta = resolverTareaDelPrompt(phases, opciones);

  // Without a project there is no project language: the note comes out in the call's.
  if (resuelta === "ambigua") return mensaje("COMPUERTA-AMBIGUA");
  if (!resuelta) return null;

  const salto = detectarSalto(fasePedida, resuelta.estado, resuelta.phases);
  if (!salto) return null;
  // The warning goes inside the prompt: in the project's language.
  const idioma = idiomaDelProyecto(resuelta.carpetaProyecto).idioma;
  return avisoDeSalto(salto, resuelta.estado.taskName, resuelta.phases, idioma);
}

// ─── Receipts that already exist ────────────────────────────────────────────
// No tool lists a folder, so when resuming Phase 4 in another chat, or when auditing in Phase 5 without an
// index, the model had no way to know which receipts there are or what their slugs are. The server gives
// them at the end of the prompt of the phase that declares them and of the later ones, in the project's
// language.
export function bloqueDeRecibos(
  fasePedida: number,
  estado: EstadoTarea,
  phases: Map<number, PhaseFile>,
  idioma: Idioma = "es"
): string | null {
  const lineas: string[] = [];

  for (const [numero, datos] of [...phases.entries()].sort((a, b) => a[0] - b[0])) {
    if (!datos.recibos || numero > fasePedida) continue;

    const subcarpeta = path.join(estado.folderPath, datos.recibos);
    if (!fs.existsSync(subcarpeta)) continue;

    const recibos = fs
      .readdirSync(subcarpeta, { withFileTypes: true })
      .filter((entrada) => entrada.isFile() && entrada.name.toLowerCase().endsWith(".md"))
      .map((entrada) => entrada.name)
      .sort();

    for (const recibo of recibos) lineas.push(mensaje("TAREA-RECIBO-EXISTENTE", { fase: numero, ruta: `${datos.recibos}/${recibo}` }, idioma));
  }

  if (lineas.length === 0) return null;

  return [
    `## ${vocabulario(idioma).encabezados.recibosQueExisten(estado.taskName)}`,
    "",
    mensaje("TAREA-RECIBOS-LEELOS", {}, idioma),
    ...lineas,
  ].join("\n");
}

// ─── Inherited pending items ────────────────────────────────────────────────
// A server reinforcement of the global rule PENDIENTES HEREDADOS: if the previous phase left something
// unchecked, the next one's prompt arrives with a warning that names it. It reads headings and frontmatter
// of documents that the prompt already requires writing; it stores no state and does not change the phase
// deduction. If the model did not write the section, the warning does not come out and everything goes on
// as before.
//
// A stored `Estado:` field was rejected on purpose (#39): it would make the gate depend on something the
// model wrote. This neither blocks nor changes the phase: it only points.

// What is written out of habit in a section that has nothing, in both languages: it is not a pending item.
const SECCION_VACIA = FORMAS_DE_VACIO;

// "## Validaciones pendientes" or "## Pending validations", case-insensitive.
const ENCABEZADOS_BUSCADOS = new Set(ENCABEZADOS_DE_PENDIENTES.map((titulo) => `## ${titulo}`.normalize("NFC").toLowerCase()));

// The section reduced to its text: without bullets or numbering, without Markdown emphasis (_ * `), without
// ellipsis or final period, on one line and in lowercase. So "- Ninguna.", "_Ninguna._" or "Ninguna..."
// count the same as "Ninguna".
function textoDeSeccion(seccion: string): string {
  return seccion
    .split("\n")
    .map((linea) => linea.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""))
    .join(" ")
    .replace(/[_*`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:\.+|…)$/, "")
    .trim()
    .toLowerCase();
}

const ESTADOS_PENDIENTES = new Set(["con pendientes", "fallido", "descartado"]);

// The section is the text between its heading and the next "## " (or the end). Returns true if it exists and
// has something other than a way of saying "none".
export function tieneValidacionesPendientes(texto: string): boolean {
  const lineas = separarFrontmatter(texto).cuerpo.split("\n");
  // The heading is compared case-insensitively: "## Validaciones Pendientes" also works, and in English,
  // "## Pending validations".
  const inicio = lineas.findIndex((linea) => ENCABEZADOS_BUSCADOS.has(linea.trimEnd().normalize("NFC").toLowerCase()));
  if (inicio === -1) return false;

  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((linea) => linea.startsWith("## "));
  const seccion = (fin === -1 ? resto : resto.slice(0, fin)).join("\n");

  return !SECCION_VACIA.has(textoDeSeccion(seccion));
}

function leerSinFallar(ruta: string): string | null {
  try {
    return leerTextoAcotado(ruta);
  } catch {
    return null; // an unreadable document is not a pending item: the warning is a help, not a control
  }
}

// In the project's language (`idioma`): the warning goes inside the prompt.
export function avisoDePendientes(
  fasePedida: number,
  estado: EstadoTarea,
  phases: Map<number, PhaseFile>,
  idioma: Idioma = "es"
): string | null {
  const v = vocabulario(idioma);
  const ordenadas = [...phases.entries()].sort((a, b) => a[0] - b[0]);
  const lineas: string[] = [];

  // The previous phase is the one with the highest number, below the requested one, whose document exists.
  const anterior = ordenadas
    .filter(([numero, datos]) => numero < fasePedida && datos.documento)
    .reverse()
    .find(([, datos]) => fs.existsSync(path.join(estado.folderPath, datos.documento!)));

  if (anterior) {
    const documento = anterior[1].documento!;
    const texto = leerSinFallar(path.join(estado.folderPath, documento));
    if (texto !== null && tieneValidacionesPendientes(texto)) {
      lineas.push(mensaje("PENDIENTES-SECCION", { documento, encabezado: `## ${v.encabezados.validacionesPendientes}` }, idioma));
    }
  }

  // The batch receipts of the previous phases that were left with pending items, failed or discarded. With a
  // single batch, the receipt is the phase's document and it is looked at too.
  for (const [numero, datos] of ordenadas) {
    if (numero >= fasePedida || !datos.recibos) continue;

    const candidatos: string[] = [];
    if (datos.documento) candidatos.push(datos.documento);
    const subcarpeta = path.join(estado.folderPath, datos.recibos);
    if (fs.existsSync(subcarpeta)) {
      for (const entrada of fs.readdirSync(subcarpeta, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entrada.isFile() && entrada.name.toLowerCase().endsWith(".md")) candidatos.push(`${datos.recibos}/${entrada.name}`);
      }
    }

    for (const relativo of candidatos) {
      const ruta = path.join(estado.folderPath, ...relativo.split("/"));
      if (!fs.existsSync(ruta)) continue;
      const texto = leerSinFallar(ruta);
      const valor = texto === null ? "" : (frontmatterDeRecibo(texto).meta.estado ?? "").trim().toLowerCase();
      const canonico = estadoCanonico(valor);
      if (ESTADOS_PENDIENTES.has(canonico ?? "")) lineas.push(mensaje("PENDIENTES-ESTADO", { relativo, valor, estado: canonico }, idioma));
    }
  }

  if (lineas.length === 0) return null;

  return [
    `## ${v.encabezados.pendientesDetectados}`,
    "",
    ...lineas,
    "",
    mensaje("PENDIENTES-NOMBRALOS", { seccion: v.encabezados.pendientesHeredados }, idioma),
  ].join("\n");
}

// In the project's language (`idioma`): the warning goes at the start of the prompt.
export function avisoDeSalto(
  salto: Salto,
  taskName: string,
  phases: Map<number, PhaseFile>,
  idioma: Idioma = "es"
): string {
  const titulo = phases.get(salto.siguienteFase)?.title || null;

  const lista = salto.faltan.map(({ fase, documento }) => mensaje("COMPUERTA-FALTA", { fase, documento }, idioma));

  return [
    `## ${vocabulario(idioma).encabezados.compuerta}`,
    "",
    mensaje("COMPUERTA-PEDISTE", { fase: salto.fasePedida, tarea: taskName }, idioma),
    "",
    ...lista,
    "",
    mensaje("COMPUERTA-VA-EN", { fase: salto.siguienteFase, titulo, pedida: salto.fasePedida }, idioma),
    "",
    mensaje("COMPUERTA-PREGUNTA", {}, idioma),
  ].join("\n");
}
