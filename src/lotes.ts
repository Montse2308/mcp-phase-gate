// The batch engine of Phase 4: record_batch records each batch in a receipt that the server writes, with its
// verified anchor, and when it closes the last one it generates the phase's document.
//
// Two steps for every policy with git: first the receipt with the pending commit, BEFORE the commit, so that
// it survives a chat cut-off; then, with the hash, the anchor. If the commit already exists when the batch
// is recorded, everything goes in one call.
//
// The server only writes inside the task's folder (its receipts and the phase's document), with atomic
// writes, and never in git: the commit is made by the agent, here it is only read to verify it.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { anclarArtefacto, anclarCommit, reverificar } from "./anclas.js";
import { configuracionDe, fasesDe, reposDeLaTarea } from "./capas.js";
import { DOCS, requireBasePath } from "./config.js";
import type { ResultadoConfirmacion } from "./confirmacion.js";
import { datosDeCommit, ramaActual, sonConsecutivos, tieneGit, tienePadre } from "./git.js";
import { fallo, idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";
import { estaDentroReal, leerTextoAcotado, taskFolderPath } from "./paths.js";
import { separarFrontmatter } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { GENERADO_POR, celda, escribirRecibo, etiquetaDeLote, frontmatterDeRecibo, leerRecibo, loteDelNombre, nombreDeRecibo, parsearRecibo } from "./recibos.js";
import type { Ancla, EstadoLote, Recibo, TituloCondicional } from "./recibos.js";
import { idiomaDelProyecto } from "./manifiesto.js";
import { resolverRepo } from "./repos.js";
import { VOCABULARIO, lotesDelFrontmatter, vocabulario } from "./vocabulario.js";
import type { Idioma } from "./vocabulario.js";

// ─── The task and its plan ──────────────────────────────────────────────────
export type FaseDeLotes = {
  taskName: string;
  carpetaTarea: string;
  phases: Map<number, PhaseFile>;
  numero: number; // the phase that declares the receipts (the 4th)
  titulo: string; // its title ("Ejecución")
  recibos: string; // its subfolder
  documento: string | null; // its document, the one that closes it
  plan: string; // the document of the previous phase (the technical plan)
  idioma: Idioma; // the project's: the receipts and the index are written in it
};

export function faseEnCarpeta(carpetaTarea: string, phases: Map<number, PhaseFile>, nombreDelProyecto = "", idioma: Idioma = "es"): FaseDeLotes {
  const taskName = path.basename(carpetaTarea);
  const conRecibos = [...phases.entries()].sort((a, b) => a[0] - b[0]).find(([, datos]) => datos.recibos);
  if (!conRecibos) throw fallo("LOTE-SIN-FASE-DE-RECIBOS", { proyecto: nombreDelProyecto });
  const [numero, datos] = conRecibos;
  const anterior = [...phases.entries()].filter(([n, d]) => n < numero && d.documento).sort((a, b) => b[0] - a[0])[0];
  if (!anterior) throw fallo("LOTE-SIN-PLAN-ANTERIOR", { numero });
  return { taskName, carpetaTarea, phases, numero, titulo: datos.title, recibos: datos.recibos!, documento: datos.documento ?? null, plan: anterior[1].documento!, idioma };
}

export function faseDeLotes(carpetaProyecto: string, taskName: string): FaseDeLotes {
  const carpetaTarea = taskFolderPath(carpetaProyecto, taskName);
  if (!fs.statSync(carpetaTarea, { throwIfNoEntry: false })?.isDirectory()) {
    throw fallo("LOTE-TAREA-NO-EXISTE", { tarea: taskName, proyecto: carpetaProyecto });
  }
  return faseEnCarpeta(carpetaTarea, fasesDe(carpetaProyecto), carpetaProyecto, idiomaDelProyecto(carpetaProyecto).idioma);
}

function textoDelPlan(fase: FaseDeLotes): string {
  const ruta = path.join(fase.carpetaTarea, fase.plan);
  if (!fs.existsSync(ruta)) throw fallo("LOTE-PLAN-NO-EXISTE", { tarea: fase.taskName, plan: fase.plan, numero: fase.numero });
  return leerTextoAcotado(ruta);
}

// The number of batches comes ONLY from the plan's frontmatter, never from its table.
export function lotesDelPlan(fase: FaseDeLotes): number {
  const texto = textoDelPlan(fase);
  const valor = lotesDelFrontmatter(separarFrontmatter(texto).meta);
  if (valor === undefined || valor.trim() === "") {
    // The table does not decide the number, but it does serve to propose it to the person.
    throw fallo("LOTE-PLAN-SIN-LOTES", { plan: fase.plan, filas: leerTablaDeLotes(texto)?.size ?? 0 });
  }
  const n = Number(valor.trim());
  if (!/^\d+$/.test(valor.trim()) || n < 1 || n > 99) {
    throw fallo("LOTE-PLAN-LOTES-INVALIDO", { plan: fase.plan, valor: valor.trim() });
  }
  return n;
}

// The plan's table of batches: the one that starts with `| Lote | Repo |` (or `| Batch | Repo |`), and its
// `L\d\d` rows. It only informs (the goal of a batch that is discarded, the columns of get_batch_status):
// the number of batches never comes from here. null if there is no table or it is not understood.
export type FilaDelPlan = { repo: string; objetivo: string; commitPropuesto: string };

export function leerTablaDeLotes(texto: string): Map<number, FilaDelPlan> | null {
  const lineas = separarFrontmatter(texto).cuerpo.split("\n");
  const partir = (linea: string): string[] =>
    linea.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

  const inicio = lineas.findIndex((linea) => /^\|\s*(?:Lote|Batch)\s*\|\s*Repo\s*\|/i.test(linea.trim()));
  if (inicio === -1) return null;
  const cabecera = partir(lineas[inicio]!).map((c) => c.normalize("NFC").toLowerCase());
  // The column in the table's language, or in the other one.
  const columna = (de: "columnaObjetivo" | "columnaCommit" | null): number =>
    de === null ? cabecera.indexOf("repo") : Math.max(cabecera.indexOf(VOCABULARIO.es.plan[de]), cabecera.indexOf(VOCABULARIO.en.plan[de]));
  const [cRepo, cObjetivo, cCommit] = [columna(null), columna("columnaObjetivo"), columna("columnaCommit")];
  if (cObjetivo === -1) return null;

  const filas = new Map<number, FilaDelPlan>();
  for (const linea of lineas.slice(inicio + 1)) {
    if (!linea.trim().startsWith("|")) break;
    const celdas = partir(linea);
    const lote = (celdas[0] ?? "").replace(/\*/g, "").match(/^L(\d{2})$/i);
    if (!lote) continue;
    filas.set(Number(lote[1]), {
      repo: cRepo === -1 ? "" : (celdas[cRepo] ?? "").replace(/`/g, ""),
      objetivo: (celdas[cObjetivo] ?? "").trim(),
      commitPropuesto: cCommit === -1 ? "" : (celdas[cCommit] ?? "").replace(/^`|`$/g, ""),
    });
  }
  return filas.size ? filas : null;
}

// ─── The receipts that exist ────────────────────────────────────────────────
export type ReciboEnDisco = { recibo: Recibo; nombre: string; ruta: string; mtimeMs: number };

export function carpetaDeRecibos(fase: FaseDeLotes): string {
  return path.join(fase.carpetaTarea, fase.recibos);
}

// The receipts of the per-batch subfolder. A file that cannot be read (binary, or over 1 MB) is an error with
// its name: it is neither overwritten nor skipped without saying so.
export function recibosDeLaTarea(fase: FaseDeLotes): Map<number, ReciboEnDisco[]> {
  const carpeta = carpetaDeRecibos(fase);
  const porLote = new Map<number, ReciboEnDisco[]>();
  if (!fs.statSync(carpeta, { throwIfNoEntry: false })?.isDirectory()) return porLote;

  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entrada.isFile()) continue;
    const lote = loteDelNombre(entrada.name);
    if (lote === null) continue;
    const ruta = path.join(carpeta, entrada.name);
    const mtimeMs = fs.statSync(ruta).mtimeMs;
    let recibo: Recibo;
    try {
      recibo = leerRecibo(ruta);
    } catch (error) {
      throw fallo("LOTE-RECIBO-ILEGIBLE", { ruta: `${fase.recibos}/${entrada.name}`, error: error instanceof Error ? error.message : String(error) });
    }
    porLote.set(lote, [...(porLote.get(lote) ?? []), { recibo: { ...recibo, lote }, nombre: entrada.name, ruta, mtimeMs }]);
  }
  return porLote;
}

function unicoDe(porLote: Map<number, ReciboEnDisco[]>, lote: number, fase: FaseDeLotes): ReciboEnDisco | null {
  const deEste = porLote.get(lote) ?? [];
  if (deEste.length > 1) {
    throw fallo("LOTE-RECIBOS-DUPLICADOS", { lote: etiquetaDeLote(lote), carpeta: fase.recibos, nombres: deEste.map((r) => r.nombre) });
  }
  return deEste[0] ?? null;
}

export const esSellado = (ancla: Ancla): boolean => ancla.tipo === "commit" || ancla.tipo === "sha256";

// Closed: with a receipt and an anchor other than pending. A failed one is closed for the order, but does not
// close the phase.
const cerrado = (recibo: Recibo | undefined): boolean => recibo !== undefined && recibo.ancla.tipo !== "pendiente";
const cierraLaFase = (recibo: Recibo | undefined): boolean => cerrado(recibo) && recibo!.estado !== "fallido";

// ─── The phase's document ───────────────────────────────────────────────────
function anclaEnIndice(recibo: Recibo, idioma: Idioma): string {
  if (recibo.estado === "descartado") return "—";
  const ancla = recibo.ancla;
  if (ancla.tipo === "commit") return `commit \`${ancla.corto}\``;
  if (ancla.tipo === "sha256") return `sha256 \`${ancla.sha256.slice(0, 8)}…\``;
  return ancla.tipo === "nota" ? vocabulario(idioma).indice.anclaNota : vocabulario(idioma).indice.anclaPendiente;
}

function primeraLinea(texto: string): string {
  return (texto.split("\n").find((linea) => linea.trim()) ?? "").trim().replace(/\.+$/, "");
}

// Deterministic: the same receipts give the same bytes. The closing date is that of the receipt written
// last, not the time of the assembly.
export type ReciboConNombre = { recibo: Recibo; nombre: string };

// In the project's language: frontmatter keys, headings, tables and values.
export function textoDelIndice(fase: FaseDeLotes, total: number, conNombre: Map<number, ReciboConNombre>, idioma: Idioma = fase.idioma): string {
  const v = vocabulario(idioma);
  const i = v.indice;
  const lotes = [...Array(total).keys()].map((n) => n + 1);
  const recibos = new Map([...conNombre].map(([n, { recibo }]) => [n, recibo]));
  const presentes = lotes.map((n) => recibos.get(n)).filter((r): r is Recibo => r !== undefined);
  const conRepo = presentes.some((r) => r.repo);

  const ramas = new Set(presentes.filter((r) => r.ancla.tipo === "commit").map((r) => r.rama ?? ""));
  const rama = ramas.size === 0 ? "—" : ramas.size === 1 ? [...ramas][0] || "—" : i.variasRamas;
  const ultimo = [...presentes].sort((a, b) => (a.registrado || a.fecha).localeCompare(b.registrado || b.fecha)).pop();

  const espera = presentes.flatMap((r) => r.esperaAlUsuario.map((fila) => ({ lote: r.lote, ...fila })));
  const abiertos = presentes.filter((r) => r.estado === "con pendientes" || r.estado === "fallido");
  const descartados = presentes.filter((r) => r.estado === "descartado").length;
  const limpio = presentes.every((r) => r.estado === "verificado" || r.estado === "descartado") && espera.length === 0;
  let estado = limpio ? i.cerradaSinPendientes : i.cerradaConPendientes;
  if (descartados) estado += ` · ${i.descartados(descartados)}`;

  const columnas = conRepo ? i.tablaLotes : i.tablaLotesSinRepo;
  const cabecera = `| ${columnas.join(" | ")} |\n|${columnas.map(() => "---").join("|")}|`;
  const filas = lotes.map((n) => {
    const r = recibos.get(n);
    const celdas = r
      ? [etiquetaDeLote(n), ...(conRepo ? [r.repo ?? "—"] : []), celda(r.titulo), v.recibo.estados[r.estado], anclaEnIndice(r, idioma), `\`${fase.recibos}/${conNombre.get(n)!.nombre}\``]
      : [etiquetaDeLote(n), ...(conRepo ? ["—"] : []), "—", i.sinRecibo, "—", "—"];
    return `| ${celdas.join(" | ")} |`;
  });

  const k = v.recibo.claves;
  const partes = [
    `---\n${k.lotes}: ${total}\n${k.generado_por}: ${GENERADO_POR}\n---`,
    `# ${fase.titulo} — ${fase.taskName}`,
    `- **${i.plan}:** \`${fase.plan}\` · **${i.rama}:** ${rama} · **${i.cierre}:** ${ultimo?.fecha || "—"}\n- **${i.estado}:** ${estado}`,
    `## ${i.lotes}\n${cabecera}\n${filas.join("\n")}`,
  ];
  if (espera.length) {
    const columnasEspera = i.tablaEspera;
    partes.push(
      `## ${i.esperaAlUsuario}\n| ${columnasEspera.join(" | ")} |\n|---|---|---|\n${espera.map((f) => `| ${etiquetaDeLote(f.lote)} | ${celda(f.prueba)} | ${celda(f.esperado)} |`).join("\n")}`
    );
  }
  if (abiertos.length) {
    partes.push(
      `## ${v.encabezados.validacionesPendientes}\n${abiertos.map((r) => `- ${etiquetaDeLote(r.lote)} (${v.recibo.estados[r.estado]}): ${primeraLinea(r.verificacion) || i.sinVerificacion}.`).join("\n")}`
    );
  }
  return `${partes.join("\n\n")}\n`;
}

// The index of a task as the server would write it today, reading its receipts.
export function ensamblarIndice(carpetaTarea: string, fases: Map<number, PhaseFile>, idioma: Idioma = "es"): string {
  const fase = faseEnCarpeta(carpetaTarea, fases, "", idioma);
  const total = lotesDelPlan(fase);
  const recibos = new Map<number, ReciboConNombre>();
  for (const [lote, deEste] of recibosDeLaTarea(fase)) if (lote <= total && deEste.length === 1) recibos.set(lote, deEste[0]!);
  return textoDelIndice(fase, total, recibos, idioma);
}

// A phase document that the server generated (the index, or the receipt of a single batch): `generado_por` or
// `generated_by`.
export function generadoPorElServidor(texto: string): boolean {
  return frontmatterDeRecibo(texto).meta.generado_por === GENERADO_POR;
}

// ─── Recording a batch ──────────────────────────────────────────────────────
export type EntradaDeLote = {
  lote: number;
  titulo?: string | undefined;
  repo?: string | undefined;
  estado?: EstadoLote | undefined;
  que_se_hizo?: string | undefined;
  archivos?: { archivo: string; cambio: string }[] | undefined;
  verificacion?: string | undefined;
  espera_al_usuario?: { prueba: string; esperado: string }[] | undefined;
  desvios?: string | undefined;
  decisiones?: string | undefined;
  condicionales?: { titulo: TituloCondicional; texto: string }[] | undefined;
  commit?: string | undefined;
  artifact_path?: string | undefined;
  verification_note?: string | undefined;
  cerrar_fase?: boolean | undefined;
  motivo_descarte?: string | undefined;
  reanclar?: boolean | undefined;
  force?: boolean | undefined;
};

export type ContextoDeLote = {
  ahora?: () => Date;
  // Right before writing: the server checks here that the client has not cancelled the call.
  antesDeEscribir?: () => void;
  // The person's confirmation (elicitation); without it, `force` decides.
  confirmar?: (pregunta: { mensaje: string; etiqueta: string }) => Promise<ResultadoConfirmacion>;
};

export type SalidaDeLote = {
  recibo: string;
  lote: string;
  de: number;
  estado: string;
  ancla: { tipo: string; resumen: string };
  avisos: string[];
  siguiente: string | null;
  faseCerrada: boolean;
  documentoDeFase: string | null;
};

export type ResultadoDeLote = { texto: string; salida: SalidaDeLote; archivoNuevo: boolean };

const CAMPOS_DE_CONTENIDO = ["titulo", "estado", "que_se_hizo", "archivos", "verificacion", "espera_al_usuario", "desvios", "decisiones", "condicionales"] as const;
const OBLIGATORIOS = ["titulo", "estado", "que_se_hizo", "verificacion"] as const;
const ANCLAS = ["commit", "artifact_path", "verification_note"] as const;

// YYYY-MM-DD of the day of whoever records, not UTC's.
export function fechaLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

// In the call's language: it goes in the responses of record_batch and get_batch_status.
export function resumenDeAncla(ancla: Ancla, repo: string | null): string {
  switch (ancla.tipo) {
    case "commit":
      return mensaje("LOTE-RESUMEN-COMMIT", { corto: ancla.corto, repo: ancla.repo || repo, rama: ancla.rama });
    case "sha256":
      return mensaje("LOTE-RESUMEN-SHA256", { sha: ancla.sha256.slice(0, 12), ruta: ancla.ruta });
    case "nota": {
      const linea = ancla.texto.split("\n")[0] ?? "";
      return mensaje("LOTE-RESUMEN-NOTA", { texto: linea.length > 80 ? `${linea.slice(0, 80)}…` : linea });
    }
    case "pendiente":
      return mensaje("LOTE-RESUMEN-PENDIENTE");
  }
}

// A sealed anchor, for the messages that name it.
const sellada = (ancla: Extract<Ancla, { tipo: "commit" | "sha256" }>): { tipo: "commit" | "sha256"; valor: string } =>
  ancla.tipo === "commit" ? { tipo: "commit", valor: ancla.corto } : { tipo: "sha256", valor: ancla.sha256.slice(0, 12) };

// The mode: create, replace or anchor, depending on what is there and what arrives.
function modoDe(entrada: EntradaDeLote, existente: ReciboEnDisco | null, anclas: string[]): "crear" | "reemplazar" | "anclar" {
  const etiqueta = etiquetaDeLote(entrada.lote);
  const traeContenido = CAMPOS_DE_CONTENIDO.some((campo) => entrada[campo] !== undefined);
  const exigirContenido = (modo: "crear" | "reemplazar"): "crear" | "reemplazar" => {
    const faltan = OBLIGATORIOS.filter((campo) => entrada[campo] === undefined);
    if (faltan.length) throw fallo("LOTE-FALTAN-CAMPOS", { modo, lote: etiqueta, faltan });
    return modo;
  };

  if (!existente) return exigirContenido("crear");
  const { ancla } = existente.recibo;
  if (ancla.tipo === "commit" || ancla.tipo === "sha256") throw fallo("LOTE-RECIBO-SELLADO", { lote: etiqueta, ancla: sellada(ancla) });
  if (ancla.tipo === "pendiente") {
    // A batch whose commit is not going to arrive (the user does not make it, or the batch is discarded) is
    // closed with just its new state and, if wanted, a note: the content it already has is kept.
    const soloEstado = CAMPOS_DE_CONTENIDO.every((campo) => campo === "estado" || entrada[campo] === undefined);
    if (soloEstado && (entrada.estado === "descartado" || entrada.estado === "fallido")) return "anclar";
    if (traeContenido) return exigirContenido("reemplazar");
    if (anclas.length === 1) return "anclar";
    throw fallo("LOTE-PENDIENTE-SIN-ANCLA", { lote: etiqueta });
  }
  // failed, or anchored to a note: it is not sealed, and what arrives is a new attempt at the batch.
  if (!traeContenido) {
    throw fallo("LOTE-NO-SELLADO-SIN-CONTENIDO", { lote: etiqueta, estado: existente.recibo.estado, resumen: resumenDeAncla(ancla, null) });
  }
  return exigirContenido("reemplazar");
}

function repoDelLote(entrada: EntradaDeLote, existente: ReciboEnDisco | null, modo: string, ids: string[], fase: FaseDeLotes): string | null {
  if (modo === "anclar") {
    const delRecibo = existente!.recibo.repo;
    if (entrada.repo && delRecibo && entrada.repo !== delRecibo) {
      throw fallo("LOTE-REPO-DISTINTO", { lote: etiquetaDeLote(entrada.lote), delRecibo, repo: entrada.repo });
    }
    // A 2.x receipt may not say its repo: then the usual rule applies (the one indicated, or the task's only
    // one), instead of taking it for a batch without a repository.
    if (delRecibo) return delRecibo;
  }
  if (entrada.repo) {
    if (!ids.includes(entrada.repo)) {
      throw ids.length
        ? fallo("LOTE-REPO-NO-ES-DE-LA-TAREA", { repo: entrada.repo, tarea: fase.taskName, ids })
        : fallo("LOTE-TAREA-SIN-REPOS", { tarea: fase.taskName });
    }
    return entrada.repo;
  }
  if (ids.length > 1) throw fallo("LOTE-VARIOS-REPOS", { tarea: fase.taskName, ids });
  return ids[0] ?? null;
}

// Atomic write: a temporary in the same folder and a rename. The temporary starts with a dot and does not end
// in .md, so nobody takes it for a receipt or a document.
export function escribirAtomico(ruta: string, contenido: string): void {
  const temporal = path.join(path.dirname(ruta), `.${path.basename(ruta)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporal, contenido, "utf-8");
    renombrarConReintentos(temporal, ruta);
  } catch (error) {
    borrarArchivo(temporal);
    throw traducirEscritura(error, path.basename(ruta));
  }
}

// On Windows a rename over a file that another process has open, even only to read it, fails with EPERM (or
// EACCES, EBUSY) for as long as that read lasts. machine.json is read by every open server and by the Studio, so
// that moment happens: it is retried for about a second before giving up. Elsewhere the first try is the answer.
const ESPERAS_DEL_RENOMBRADO_MS = [5, 10, 20, 40, 80, 160, 320, 400];
const ESPERA = new Int32Array(new SharedArrayBuffer(4));

export function renombrarConReintentos(origen: string, destino: string, renombrar: (de: string, a: string) => void = fs.renameSync, esperas: readonly number[] = ESPERAS_DEL_RENOMBRADO_MS, enWindows: boolean = process.platform === "win32"): void {
  for (let intento = 0; ; intento++) {
    try {
      renombrar(origen, destino);
      return;
    } catch (error) {
      const codigo = (error as NodeJS.ErrnoException)?.code;
      const pasajero = enWindows && (codigo === "EPERM" || codigo === "EACCES" || codigo === "EBUSY");
      if (!pasajero || intento >= esperas.length) throw error;
      Atomics.wait(ESPERA, 0, 0, esperas[intento]);
    }
  }
}

// A write failure put for a person: the file and what to do, without the temporary's path.
export function traducirEscritura(error: unknown, nombre: string): Error {
  const codigo = (error as { code?: string })?.code;
  if (codigo === "EPERM" || codigo === "EACCES" || codigo === "EBUSY") {
    return fallo("LOTE-ESCRITURA-PROTEGIDA", { nombre, codigo });
  }
  if (codigo === "ENOSPC") return fallo("LOTE-ESCRITURA-SIN-ESPACIO", { nombre });
  return error instanceof Error ? error : new Error(String(error));
}

// unlinkSync and not rmSync: on Node 24.11 for Windows, rmSync does not delete a file with a non-ASCII name
// ("L01 - corregir cálculo.md") and does not throw either (measured). unlink does.
export function borrarArchivo(ruta: string): void {
  try {
    fs.unlinkSync(ruta);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
}

// ─── The task lock ──────────────────────────────────────────────────────────
// A file created exclusively (`wx`: fails if it already exists, also on Windows) in the task's folder. It
// starts with a dot and does not end in .md, so it is not a document, a receipt or something that
// write_central_doc can write. If a process died with the lock held, after 30 s it is taken as abandoned.
export const CANDADO = ".record_batch.lock";
export const ESPERA_DEL_CANDADO_MS = 3000;
export const CANDADO_ABANDONADO_MS = 30_000;

// `opciones` is for another lock with the same mechanism (the Studio actions'): its name and the message if
// it is still busy.
export async function conCandado<T>(carpetaTarea: string, seccion: () => T | Promise<T>, opciones: { nombre?: string; ocupado?: string } = {}): Promise<T> {
  const ruta = path.join(carpetaTarea, opciones.nombre ?? CANDADO);
  const limite = Date.now() + ESPERA_DEL_CANDADO_MS;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(ruta, "wx"));
      break;
    } catch (error: any) {
      // On Windows, opening a file that another process is deleting gives EPERM and not EEXIST (measured): it also
      // means "busy".
      if (!["EEXIST", "EPERM", "EACCES", "EBUSY"].includes(error?.code)) throw error;
      const edad = Date.now() - (fs.statSync(ruta, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (edad > CANDADO_ABANDONADO_MS) {
        borrarArchivo(ruta);
        continue;
      }
      if (Date.now() > limite) throw opciones.ocupado !== undefined ? new Error(opciones.ocupado) : fallo("LOTE-CANDADO-OCUPADO");
      await new Promise((resolver) => setTimeout(resolver, 20 + Math.floor(Math.random() * 30)));
    }
  }
  // await: if the section is asynchronous, the lock is released when it ends, not when it starts.
  try {
    return await seccion();
  } finally {
    borrarArchivo(ruta);
  }
}

// As bigint: the identifier of a file on NTFS is 64 bits and as a number it loses the last digits, so two
// neighboring files would look like the same one (measured).
function mismoArchivo(a: string, b: string): boolean {
  const ia = fs.statSync(a, { throwIfNoEntry: false, bigint: true });
  const ib = fs.statSync(b, { throwIfNoEntry: false, bigint: true });
  return Boolean(ia && ib && ia.ino === ib.ino && ia.dev === ib.dev);
}

// Everything that record_batch writes falls inside the Documentation and the task's folder, on real paths: a
// receipts subfolder that is a link pointing outside is not used.
function comprobarDentro(fase: FaseDeLotes, ruta: string): void {
  if (!estaDentroReal(requireBasePath(DOCS), ruta) || !estaDentroReal(fase.carpetaTarea, ruta)) {
    throw fallo("LOTE-FUERA-DE-LA-TAREA", { ruta: path.relative(fase.carpetaTarea, ruta) });
  }
}

type Preparado = { recibo: Recibo; nombre: string; existente: ReciboEnDisco | null; avisos: string[] };

// Everything that the recording of a batch decides, without writing anything: the mode, the repo, the
// verified anchor and the receipt that would remain.
async function prepararLote(
  carpetaProyecto: string,
  fase: FaseDeLotes,
  total: number,
  porLote: Map<number, ReciboEnDisco[]>,
  entrada: EntradaDeLote,
  ahora: () => Date
): Promise<Preparado> {
  const etiqueta = etiquetaDeLote(entrada.lote);
  // Order: all the previous ones have a receipt with an anchor (a failed or discarded one counts as closed).
  for (let anterior = 1; anterior < entrada.lote; anterior++) {
    const suyo = unicoDe(porLote, anterior, fase);
    if (!suyo) throw fallo("LOTE-ANTERIOR-SIN-RECIBO", { lote: etiqueta, anterior: etiquetaDeLote(anterior) });
    if (suyo.recibo.ancla.tipo === "pendiente") throw fallo("LOTE-ANTERIOR-PENDIENTE", { lote: etiqueta, anterior: etiquetaDeLote(anterior) });
  }

  const existente = unicoDe(porLote, entrada.lote, fase);
  const anclas = ANCLAS.filter((campo) => entrada[campo] !== undefined);
  if (anclas.length > 1) throw fallo("LOTE-VARIAS-ANCLAS");
  const modo = modoDe(entrada, existente, anclas);

  const config = configuracionDe(carpetaProyecto, fase.carpetaTarea);
  const ids = reposDeLaTarea(config).map((repo) => repo.id);
  const repo = repoDelLote(entrada, existente, modo, ids, fase);
  const politica = config.reglas.commits;
  const dirDelRepo = repo ? resolverRepo(carpetaProyecto, repo).ruta! : null;
  const repoConGit = dirDelRepo ? await tieneGit(dirDelRepo) : false;
  const conGit = repoConGit && politica !== "ninguno";

  const estado: EstadoLote = entrada.estado ?? existente!.recibo.estado;
  const declarados = (modo === "anclar" ? existente!.recibo.archivos : (entrada.archivos ?? [])).map((fila) => fila.archivo);
  // The commits that already anchor other batches of the task: one commit, one batch.
  const otrosLotes = [...porLote.entries()].flatMap(([lote, recibos]) =>
    lote === entrada.lote ? [] : recibos.flatMap((r) => (r.recibo.ancla.tipo === "commit" ? [{ lote, sha: r.recibo.ancla.sha }] : []))
  );

  // ─── The anchor, depending on the batch's state and the policy ───
  let ancla: Ancla;
  let verificacionDelCommit: string | null = null;
  const avisos: string[] = [];
  const conCommit = async (): Promise<Ancla> => {
    // The file comparison is written in the receipt: in the project's language.
    const anclado = await anclarCommit(carpetaProyecto, repo!, entrada.commit!, declarados, otrosLotes, ahora, fase.idioma);
    verificacionDelCommit = anclado.verificacionDelCommit;
    if (!anclado.coinciden) avisos.push(anclado.verificacionDelCommit);
    return anclado.ancla;
  };

  if (estado === "fallido" || estado === "descartado") {
    if (entrada.commit !== undefined) throw fallo("LOTE-CERRADO-SIN-COMMIT", { estado });
    if (entrada.artifact_path !== undefined) throw fallo("LOTE-CERRADO-SIN-SELLO", { estado });
    ancla = { tipo: "nota", texto: entrada.verification_note ?? vocabulario(fase.idioma).recibo.notaPorDefecto(vocabulario(fase.idioma).recibo.estados[estado]) };
  } else if (conGit) {
    if (entrada.artifact_path !== undefined || entrada.verification_note !== undefined) {
      throw fallo("LOTE-ANCLA-ES-COMMIT", { repo, politica });
    }
    ancla = entrada.commit !== undefined ? await conCommit() : { tipo: "pendiente" };
  } else if (entrada.commit !== undefined) {
    if (!repoConGit) {
      throw fallo("LOTE-SIN-GIT-PARA-COMMIT", { repo });
    }
    ancla = await conCommit(); // policy ninguno, but the repo has git: it is verified anyway
  } else if (entrada.artifact_path !== undefined) {
    ancla = await anclarArtefacto(carpetaProyecto, repo, entrada.artifact_path, ahora);
  } else if (entrada.verification_note !== undefined) {
    ancla = { tipo: "nota", texto: entrada.verification_note };
  } else {
    throw fallo("LOTE-SIN-ANCLA");
  }

  // ─── The receipt ───
  const momento = ahora();
  let rama: string | null = ancla.tipo === "commit" ? ancla.rama || null : null;
  if (ancla.tipo === "pendiente" && dirDelRepo) {
    try {
      rama = await ramaActual(dirDelRepo);
    } catch {
      rama = null; // the branch is informative; the anchor reads it again
    }
  }

  const base: Recibo =
    modo === "anclar"
      ? existente!.recibo
      : {
          lote: entrada.lote,
          de: total,
          titulo: entrada.titulo!,
          repo,
          rama: null,
          estado,
          ancla,
          fecha: "",
          registrado: "",
          origen: "servidor",
          queSeHizo: entrada.que_se_hizo!,
          archivos: entrada.archivos ?? [],
          verificacion: entrada.verificacion!,
          esperaAlUsuario: entrada.espera_al_usuario ?? [],
          desvios: entrada.desvios ?? "",
          decisiones: entrada.decisiones ?? "",
          condicionales: entrada.condicionales ?? [],
          verificacionDelCommit: null,
        };
  const recibo: Recibo = {
    ...base,
    lote: entrada.lote,
    de: total,
    repo,
    rama,
    estado,
    ancla,
    fecha: fechaLocal(momento),
    registrado: momento.toISOString(),
    origen: "servidor",
    verificacionDelCommit,
  };
  return { recibo, nombre: nombreDeRecibo(entrada.lote, recibo.titulo), existente, avisos };
}

// The receipt of a batch that is closed without being done (cerrar_fase), with the goal the plan gave it.
function reciboDescartado(lote: number, total: number, motivo: string, fila: FilaDelPlan | undefined, ids: string[], momento: Date, idioma: Idioma): Recibo {
  const repo = fila && ids.includes(fila.repo) ? fila.repo : null;
  return {
    lote,
    de: total,
    titulo: fila?.objetivo || vocabulario(idioma).recibo.tituloPorDefecto(lote),
    repo,
    rama: null,
    estado: "descartado",
    ancla: { tipo: "nota", texto: motivo },
    fecha: fechaLocal(momento),
    registrado: momento.toISOString(),
    origen: "servidor",
    queSeHizo: vocabulario(idioma).recibo.descartadoAlCerrar,
    archivos: [],
    verificacion: "",
    esperaAlUsuario: [],
    desvios: "",
    decisiones: "",
    condicionales: [],
    verificacionDelCommit: null,
  };
}

const traeAlgo = (entrada: EntradaDeLote): boolean =>
  CAMPOS_DE_CONTENIDO.some((campo) => entrada[campo] !== undefined) || ANCLAS.some((campo) => entrada[campo] !== undefined);

export async function registrarLote(carpetaProyecto: string, taskName: string, entrada: EntradaDeLote, contexto: ContextoDeLote = {}): Promise<ResultadoDeLote> {
  const ahora = contexto.ahora ?? (() => new Date());
  const fase = faseDeLotes(carpetaProyecto, taskName);
  const etiqueta = etiquetaDeLote(entrada.lote);

  if (entrada.motivo_descarte !== undefined && entrada.cerrar_fase !== true) throw fallo("LOTE-MOTIVO-SIN-CERRAR");
  if (entrada.reanclar === true) return reanclarLote(carpetaProyecto, fase, entrada, contexto, ahora);

  // With the phase's document written, the phase is closed; with a later phase, also.
  for (const [numero, datos] of [...fase.phases.entries()].sort((a, b) => a[0] - b[0])) {
    if (numero >= fase.numero && datos.documento && fs.existsSync(path.join(fase.carpetaTarea, datos.documento))) {
      throw fallo("LOTE-FASE-CERRADA", { numero: fase.numero, documento: datos.documento });
    }
  }

  const total = lotesDelPlan(fase);
  if (entrada.lote > total) {
    throw fallo("LOTE-NO-EXISTE-EN-PLAN", { total, lote: etiqueta });
  }

  const porLote = recibosDeLaTarea(fase);
  // With cerrar_fase, a call without content or anchor only closes: it does not record the batch.
  const preparado = entrada.cerrar_fase === true && !traeAlgo(entrada) ? null : await prepararLote(carpetaProyecto, fase, total, porLote, entrada, ahora);

  // How the batches stand after this call, with the name of their file.
  const finales = new Map<number, Recibo>();
  const nombres = new Map<number, string>();
  for (let lote = 1; lote <= total; lote++) {
    if (preparado && lote === entrada.lote) {
      finales.set(lote, preparado.recibo);
      nombres.set(lote, preparado.nombre);
    } else {
      const suyos = porLote.get(lote) ?? [];
      if (suyos.length === 1) {
        finales.set(lote, suyos[0]!.recibo);
        nombres.set(lote, suyos[0]!.nombre);
      } else if (suyos.length > 1 && entrada.cerrar_fase) unicoDe(porLote, lote, fase); // throws with the names
    }
  }

  // ─── cerrar_fase: discard what is missing, with the person's confirmation ───
  const descartes: Recibo[] = [];
  if (entrada.cerrar_fase === true) {
    const conPendiente = [...finales.values()].filter((r) => r.ancla.tipo === "pendiente").map((r) => etiquetaDeLote(r.lote));
    if (conPendiente.length) {
      throw fallo("LOTE-CIERRE-CON-PENDIENTE", { numero: fase.numero, lotes: conPendiente });
    }
    const faltan: number[] = [];
    for (let lote = 1; lote <= total; lote++) if (!finales.has(lote)) faltan.push(lote);
    if (faltan.length && entrada.motivo_descarte === undefined) {
      throw fallo("LOTE-CIERRE-FALTAN", { lotes: faltan.map(etiquetaDeLote) });
    }
    const fallidos = [...finales.values()].filter((r) => r.estado === "fallido").map((r) => etiquetaDeLote(r.lote));

    if (faltan.length || fallidos.length) {
      const resumen = mensaje("LOTE-CIERRE-RESUMEN", { faltan: faltan.map(etiquetaDeLote), motivo: entrada.motivo_descarte, fallidos });
      const confirmacion = contexto.confirmar
        ? await contexto.confirmar({ mensaje: mensaje("LOTE-CIERRE-PREGUNTA", { numero: fase.numero, resumen }), etiqueta: mensaje("LOTE-CIERRE-ETIQUETA", { numero: fase.numero }) })
        : { estado: "no-disponible" as const };
      const nota = confirmacion.nota ? ` ${confirmacion.nota}` : "";
      if (confirmacion.estado === "rechazada") throw fallo("LOTE-CIERRE-RECHAZADO", { numero: fase.numero, nota });
      if (confirmacion.estado === "no-disponible" && entrada.force !== true) {
        throw fallo("LOTE-CIERRE-SIN-CONFIRMACION", { numero: fase.numero, resumen, nota });
      }
      const tabla = leerTablaDeLotes(textoDelPlan(fase)) ?? new Map<number, FilaDelPlan>();
      const ids = reposDeLaTarea(configuracionDe(carpetaProyecto, fase.carpetaTarea)).map((repo) => repo.id);
      for (const lote of faltan) {
        const recibo = reciboDescartado(lote, total, entrada.motivo_descarte!, tabla.get(lote), ids, ahora(), fase.idioma);
        descartes.push(recibo);
        finales.set(lote, recibo);
        nombres.set(lote, nombreDeRecibo(lote, recibo.titulo));
      }
    }
  }

  // ─── Writing ───
  const carpeta = carpetaDeRecibos(fase);
  const tipoDeCarpeta = fs.lstatSync(carpeta, { throwIfNoEntry: false });
  if (tipoDeCarpeta && !fs.statSync(carpeta).isDirectory()) throw fallo("LOTE-CARPETA-NO-ES-CARPETA", { carpeta: fase.recibos });
  const rutaDe = (lote: number, titulo: string): string => path.join(carpeta, nombreDeRecibo(lote, titulo));
  if (preparado) comprobarDentro(fase, path.join(carpeta, preparado.nombre));
  for (const recibo of descartes) comprobarDentro(fase, rutaDe(recibo.lote, recibo.titulo));

  contexto.antesDeEscribir?.();

  // With the task lock: checking and writing is a single section, without waits in between, and only one
  // process goes through it at a time. Without it, two processes that arrived together both passed the check.
  const lotes = [...Array(total).keys()].map((i) => i + 1);
  const cierra = fase.documento !== null && (entrada.cerrar_fase === true ? lotes.every((n) => cerrado(finales.get(n))) : lotes.every((n) => cierraLaFase(finales.get(n))));
  const { archivoNuevo, documentoDeFase } = await conCandado(fase.carpetaTarea, () => {
  // Another process may have written while the anchor was being verified (two windows recording the same batch).
  const ahoraEnDisco = recibosDeLaTarea(fase);
  if (preparado?.existente) {
    if (fs.statSync(preparado.existente.ruta, { throwIfNoEntry: false })?.mtimeMs !== preparado.existente.mtimeMs) throw fallo("LOTE-OTRO-PROCESO");
  }
  for (const lote of [...(preparado && !preparado.existente ? [entrada.lote] : []), ...descartes.map((r) => r.lote)]) {
    if ((ahoraEnDisco.get(lote) ?? []).length > 0) throw fallo("LOTE-OTRO-PROCESO");
  }
  if (fase.documento && fs.existsSync(path.join(fase.carpetaTarea, fase.documento))) throw fallo("LOTE-OTRO-PROCESO");

  fs.mkdirSync(carpeta, { recursive: true });
  let archivoNuevo = descartes.length > 0;
  if (preparado) {
    const ruta = path.join(carpeta, preparado.nombre);
    escribirAtomico(ruta, escribirRecibo(preparado.recibo, { idioma: fase.idioma }));
    // If the title changed, the file changes its name. On Windows and macOS a change only in capitals is the same
    // file, which the rename already replaced: deleting it would delete the new one.
    const viejo = preparado.existente;
    if (viejo && viejo.nombre !== preparado.nombre && fs.existsSync(viejo.ruta) && !mismoArchivo(viejo.ruta, ruta)) borrarArchivo(viejo.ruta);
    archivoNuevo ||= !viejo || viejo.nombre !== preparado.nombre;
  }
  for (const recibo of descartes) escribirAtomico(rutaDe(recibo.lote, recibo.titulo), escribirRecibo(recibo, { idioma: fase.idioma }));

  // ─── Closing: every batch with an anchor, and none failed; or cerrar_fase ───
  let documentoDeFase: string | null = null;
  if (cierra) {
    const destino = path.join(fase.carpetaTarea, fase.documento!);
    comprobarDentro(fase, destino);
    if (total === 1) {
      // With a single batch, its receipt moves and becomes the phase's document.
      escribirAtomico(destino, escribirRecibo(finales.get(1)!, { comoDocumento: true, idioma: fase.idioma }));
      borrarArchivo(path.join(carpeta, nombres.get(1)!));
      try {
        fs.rmdirSync(carpeta); // only if it ended up empty
      } catch {
        // with other files inside, the subfolder stays
      }
    } else {
      escribirAtomico(destino, textoDelIndice(fase, total, new Map(lotes.map((n) => [n, { recibo: finales.get(n)!, nombre: nombres.get(n)! }]))));
    }
    documentoDeFase = fase.documento;
    archivoNuevo = true;
  }
  return { archivoNuevo, documentoDeFase };
  });

  // ─── Response ───
  const registrado = preparado?.recibo ?? null;
  const reciboRelativo = documentoDeFase && total === 1 ? documentoDeFase : registrado ? `${fase.recibos}/${preparado!.nombre}` : "";
  const siguiente = cierra ? null : siguienteLote(finales, total);
  const cierre = documentoDeFase
    ? mensaje(total === 1 ? "LOTE-FASE-CERRADA-MOVIDO" : "LOTE-FASE-CERRADA-GENERADO", { numero: fase.numero, documento: documentoDeFase })
    : null;
  const descartadosTexto = descartes.length ? mensaje("LOTE-DESCARTADOS-REGISTRADOS", { lotes: descartes.map((r) => etiquetaDeLote(r.lote)) }) : null;

  let texto: string;
  if (!registrado) {
    texto = [descartadosTexto, cierre ?? mensaje("LOTE-FASE-NO-CERRADA")].filter(Boolean).join(" ");
  } else {
    if (registrado.ancla.tipo === "pendiente") {
      texto = mensaje("LOTE-REGISTRADO-PENDIENTE", { lote: etiqueta, total, numero: entrada.lote });
    } else if (registrado.estado === "fallido" && !cierre) {
      texto = mensaje("LOTE-REGISTRADO-FALLIDO", { lote: etiqueta, total });
    } else {
      const despues = cierre ?? (siguiente ? mensaje("LOTE-SIGUIENTE", { lote: etiquetaDeLote(siguiente) }) : mensaje("LOTE-NINGUNO-POR-REGISTRAR"));
      const linea = mensaje("LOTE-REGISTRADO", { lote: etiqueta, total, estado: registrado.estado, resumen: resumenDeAncla(registrado.ancla, registrado.repo) });
      texto = [linea, descartadosTexto, despues].filter(Boolean).join(" ");
    }
    if (preparado!.avisos.length) texto += `\n${mensaje("LOTE-AVISO-ARCHIVOS", { avisos: preparado!.avisos })}`;
  }

  return {
    texto,
    salida: {
      recibo: reciboRelativo,
      lote: etiqueta,
      de: total,
      estado: registrado?.estado ?? finales.get(entrada.lote)?.estado ?? "",
      ancla: registrado
        ? { tipo: registrado.ancla.tipo, resumen: resumenDeAncla(registrado.ancla, registrado.repo) }
        : { tipo: finales.get(entrada.lote)?.ancla.tipo ?? "", resumen: finales.get(entrada.lote) ? resumenDeAncla(finales.get(entrada.lote)!.ancla, null) : "" },
      avisos: preparado?.avisos ?? [],
      siguiente: siguiente ? etiquetaDeLote(siguiente) : null,
      faseCerrada: documentoDeFase !== null,
      documentoDeFase,
    },
    archivoNuevo,
  };
}

// ─── Re-anchoring a sealed receipt ──────────────────────────────────────────
// The typical case: a rebase or a squash changed the SHA and the receipt points at a commit that is no
// longer on the branch. Only the anchor changes; the content of the batch is not touched. It also works with
// the phase already closed: with a single batch the receipt is the phase's document, and with several the
// index that the server generated is redone.
const etiquetaDeAncla = (ancla: Ancla): string =>
  ancla.tipo === "commit" ? ancla.corto : ancla.tipo === "sha256" ? `sha256 ${ancla.sha256.slice(0, 12)}…` : ancla.tipo;

async function reanclarLote(carpetaProyecto: string, fase: FaseDeLotes, entrada: EntradaDeLote, contexto: ContextoDeLote, ahora: () => Date): Promise<ResultadoDeLote> {
  const etiqueta = etiquetaDeLote(entrada.lote);
  if (CAMPOS_DE_CONTENIDO.some((campo) => entrada[campo] !== undefined)) {
    throw fallo("LOTE-REANCLAR-CON-CONTENIDO");
  }
  if (entrada.cerrar_fase === true) throw fallo("LOTE-REANCLAR-Y-CERRAR");
  if (entrada.verification_note !== undefined || ANCLAS.filter((campo) => entrada[campo] !== undefined).length !== 1) {
    throw fallo("LOTE-REANCLAR-SIN-ANCLA");
  }

  const total = lotesDelPlan(fase);
  if (entrada.lote > total) throw fallo("LOTE-NO-EXISTE-EN-PLAN-CORTO", { total, lote: etiqueta });

  // The receipt is in the subfolder, or (with a single batch and the phase closed) it is the phase's document.
  const documento = fase.documento ? path.join(fase.carpetaTarea, fase.documento) : null;
  const hayDocumento = documento !== null && fs.existsSync(documento);
  const porLote = recibosDeLaTarea(fase);
  let existente = unicoDe(porLote, entrada.lote, fase);
  let esElDocumento = false;
  if (!existente && total === 1 && hayDocumento) {
    existente = { recibo: { ...parsearRecibo(leerTextoAcotado(documento), fase.documento!), lote: 1 }, nombre: fase.documento!, ruta: documento, mtimeMs: fs.statSync(documento).mtimeMs };
    esElDocumento = true;
  }
  if (!existente) throw fallo("LOTE-REANCLAR-SIN-RECIBO", { lote: etiqueta });
  const viejo = existente.recibo.ancla;
  if (viejo.tipo !== "commit" && viejo.tipo !== "sha256") {
    throw fallo("LOTE-REANCLAR-NO-SELLADO", { lote: etiqueta, resumen: resumenDeAncla(viejo, existente.recibo.repo) });
  }
  if (entrada.repo && existente.recibo.repo && entrada.repo !== existente.recibo.repo) {
    throw fallo("LOTE-REPO-DISTINTO", { lote: etiqueta, delRecibo: existente.recibo.repo, repo: entrada.repo });
  }
  const repo = entrada.repo ?? existente.recibo.repo ?? (viejo.tipo === "commit" ? viejo.repo || null : null);

  let nueva: Ancla;
  let comparacion: string | null = null;
  const avisos: string[] = [];
  if (entrada.commit !== undefined) {
    if (!repo) throw fallo("LOTE-REANCLAR-SIN-REPO");
    const otros = [...porLote.entries()].flatMap(([lote, recibos]) =>
      lote === entrada.lote ? [] : recibos.flatMap((r) => (r.recibo.ancla.tipo === "commit" ? [{ lote, sha: r.recibo.ancla.sha }] : []))
    );
    const anclado = await anclarCommit(carpetaProyecto, repo, entrada.commit, existente.recibo.archivos.map((fila) => fila.archivo), otros, ahora, fase.idioma);
    nueva = anclado.ancla;
    comparacion = anclado.verificacionDelCommit;
    if (!anclado.coinciden) avisos.push(anclado.verificacionDelCommit);
  } else {
    nueva = await anclarArtefacto(carpetaProyecto, repo, entrada.artifact_path!, ahora);
  }
  const igual =
    (viejo.tipo === "commit" && nueva.tipo === "commit" && viejo.sha === nueva.sha) ||
    (viejo.tipo === "sha256" && nueva.tipo === "sha256" && viejo.sha256 === nueva.sha256 && viejo.ruta === nueva.ruta);
  if (igual) throw fallo("LOTE-REANCLAR-IGUAL", { lote: etiqueta, ancla: etiquetaDeAncla(nueva) });

  // The person confirms; without elicitation, force decides.
  const pregunta = mensaje("LOTE-REANCLAR-PREGUNTA", { lote: etiqueta, era: sellada(viejo), queda: sellada(nueva as Extract<Ancla, { tipo: "commit" | "sha256" }>) });
  const confirmacion = contexto.confirmar
    ? await contexto.confirmar({ mensaje: pregunta, etiqueta: mensaje("LOTE-REANCLAR-ETIQUETA", { lote: etiqueta }) })
    : { estado: "no-disponible" as const };
  const nota = confirmacion.nota ? ` ${confirmacion.nota}` : "";
  if (confirmacion.estado === "rechazada") throw fallo("LOTE-REANCLAR-RECHAZADO", { lote: etiqueta, nota });
  if (confirmacion.estado === "no-disponible" && entrada.force !== true) throw fallo("LOTE-REANCLAR-SIN-CONFIRMACION", { nota });

  // Only the anchor changes; "Verificación del commit" says the comparison of the new commit and keeps the
  // history of re-anchorings, with one more line.
  const momento = ahora();
  const linea = `${vocabulario(fase.idioma).recibo.reanclado}${fechaLocal(momento)}: \`${etiquetaDeAncla(viejo)}\` → \`${etiquetaDeAncla(nueva)}\``;
  const historial = (existente.recibo.verificacionDelCommit ?? "").split("\n").filter((l) => l.startsWith(VOCABULARIO.es.recibo.reanclado) || l.startsWith(VOCABULARIO.en.recibo.reanclado));
  const recibo: Recibo = {
    ...existente.recibo,
    repo,
    rama: nueva.tipo === "commit" ? nueva.rama || null : existente.recibo.rama,
    ancla: nueva,
    fecha: fechaLocal(momento),
    registrado: momento.toISOString(),
    origen: "servidor",
    verificacionDelCommit: nueva.tipo === "commit" ? [comparacion, ...historial, linea].join("\n") : null,
  };

  comprobarDentro(fase, existente.ruta);
  contexto.antesDeEscribir?.();
  const indiceRehecho = await conCandado(fase.carpetaTarea, () => {
    if (fs.statSync(existente.ruta, { throwIfNoEntry: false })?.mtimeMs !== existente.mtimeMs) throw fallo("LOTE-OTRO-PROCESO");
    escribirAtomico(existente.ruta, escribirRecibo(recibo, { comoDocumento: esElDocumento, idioma: fase.idioma }));

    // With the phase closed and several batches, the index that the server generated is redone with the new
    // anchor. One written by hand (a 2.x task) is not touched: doctor will flag it as out of sync.
    if (!esElDocumento && hayDocumento && total > 1 && generadoPorElServidor(leerTextoAcotado(documento))) {
      const conNombre = new Map<number, ReciboConNombre>();
      for (const [lote, recibos] of recibosDeLaTarea(fase)) if (lote <= total && recibos.length === 1) conNombre.set(lote, recibos[0]!);
      comprobarDentro(fase, documento);
      escribirAtomico(documento, textoDelIndice(fase, total, conNombre));
      return true;
    }
    return false;
  });

  const donde = nueva.tipo === "commit" ? { repo: nueva.repo, rama: nueva.rama } : { ruta: (nueva as Extract<Ancla, { tipo: "sha256" }>).ruta };
  let texto = mensaje("LOTE-REANCLADO", { lote: etiqueta, viejo: etiquetaDeAncla(viejo), nueva: etiquetaDeAncla(nueva), donde, documento: indiceRehecho ? fase.documento : null });
  if (avisos.length) texto += `\n${mensaje("LOTE-AVISO-ARCHIVOS", { avisos })}`;
  return {
    texto,
    salida: {
      recibo: esElDocumento ? fase.documento! : `${fase.recibos}/${existente.nombre}`,
      lote: etiqueta,
      de: total,
      estado: recibo.estado,
      ancla: { tipo: nueva.tipo, resumen: resumenDeAncla(nueva, repo) },
      avisos,
      siguiente: hayDocumento ? null : (() => {
        const n = siguienteLote(recibosDeLaTarea(fase), total);
        return n ? etiquetaDeLote(n) : null;
      })(),
      faseCerrada: hayDocumento,
      documentoDeFase: hayDocumento ? fase.documento : null,
    },
    archivoNuevo: false,
  };
}

// Up to `limite` tasks at a time, keeping the order of the results. Each git query launches two processes
// (the filters' and the real one): without a cap, 99 batches would be hundreds of processes at once.
export const VERIFICACIONES_A_LA_VEZ = 6;

export async function enParalelo<T, R>(elementos: readonly T[], limite: number, tarea: (elemento: T) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(elementos.length);
  let siguiente = 0;
  const trabajador = async (): Promise<void> => {
    while (siguiente < elementos.length) {
      const i = siguiente++;
      resultados[i] = await tarea(elementos[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, elementos.length) }, trabajador));
  return resultados;
}

// ─── get_batch_status ───────────────────────────────────────────────────────
// It only reads: it crosses the plan (its frontmatter and its table) with the receipts and says what is
// next. With `reverificar`, it repeats the verification of each anchor against git and the disk.
export type FilaDeEstado = {
  lote: string;
  repo: string | null; // from the plan
  objetivo: string | null; // from the plan
  commitPropuesto: string | null; // from the plan
  recibo: string | null;
  estado: string | null;
  ancla: { tipo: string; resumen: string } | null;
  origen: "servidor" | "manual" | null;
  vigente: boolean | null; // only with reverificar
  problema: string | null;
};

export type EstadoDeLotes = {
  tarea: string;
  plan: string;
  declarados: number;
  cerrados: number;
  siguiente: string;
  faseCerrada: boolean;
  lotes: FilaDeEstado[];
  fueraDePlan: { codigo: "RECIBO-FUERA-DE-PLAN"; recibo: string }[];
  avisos: string[];
};

export async function estadoDeLotes(carpetaProyecto: string, taskName: string, opciones: { reverificar?: boolean } = {}): Promise<{ texto: string; salida: EstadoDeLotes }> {
  const { reverificar: comprobar = false } = opciones;
  const fase = faseDeLotes(carpetaProyecto, taskName);
  const total = lotesDelPlan(fase);
  const avisos: string[] = [];

  let tabla: Map<number, FilaDelPlan> | null = null;
  try {
    tabla = leerTablaDeLotes(textoDelPlan(fase));
  } catch {
    tabla = null;
  }
  if (!tabla) avisos.push(mensaje("LOTE-TABLA-ILEGIBLE"));

  // With a single batch and the phase closed, the receipt is the phase's document.
  const porLote = recibosDeLaTarea(fase);
  const documento = fase.documento ? path.join(fase.carpetaTarea, fase.documento) : null;
  const faseCerrada = documento !== null && fs.existsSync(documento);
  if (total === 1 && faseCerrada && !(porLote.get(1) ?? []).length) {
    porLote.set(1, [{ recibo: { ...parsearRecibo(leerTextoAcotado(documento!), fase.documento!), lote: 1 }, nombre: fase.documento!, ruta: documento!, mtimeMs: 0 }]);
  }
  const relativo = (r: ReciboEnDisco): string => (r.ruta === documento ? fase.documento! : `${fase.recibos}/${r.nombre}`);

  const numerosDeLote = [...Array(total).keys()].map((i) => i + 1);
  const comprobaciones = comprobar
    ? await enParalelo(numerosDeLote, VERIFICACIONES_A_LA_VEZ, async (lote) => {
        const r = (porLote.get(lote) ?? [])[0];
        return r ? reverificar(carpetaProyecto, r.recibo) : null;
      })
    : [];
  const filas: FilaDeEstado[] = [];
  for (let lote = 1; lote <= total; lote++) {
    const delPlan = tabla?.get(lote);
    const recibos = porLote.get(lote) ?? [];
    if (recibos.length > 1) avisos.push(mensaje("LOTE-ESTADO-DUPLICADOS", { lote: etiquetaDeLote(lote), recibos: recibos.map(relativo) }));
    const r = recibos[0];
    const resultado = comprobaciones[lote - 1] ?? null;
    const vigente: boolean | null = resultado ? resultado.vigente : null;
    const problema: string | null = resultado && !resultado.vigente ? resultado.texto : null;
    filas.push({
      lote: etiquetaDeLote(lote),
      repo: delPlan?.repo || null,
      objetivo: delPlan?.objetivo || null,
      commitPropuesto: delPlan?.commitPropuesto || null,
      recibo: r ? relativo(r) : null,
      estado: r ? r.recibo.estado : null,
      ancla: r ? { tipo: r.recibo.ancla.tipo, resumen: resumenDeAncla(r.recibo.ancla, r.recibo.repo) } : null,
      origen: r ? r.recibo.origen : null,
      vigente,
      problema,
    });
  }

  // A receipt of a batch that the plan does not declare: it is said, it is not used.
  const fueraDePlan = [...porLote.entries()]
    .filter(([lote]) => lote > total)
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, recibos]) => recibos.map((r) => ({ codigo: "RECIBO-FUERA-DE-PLAN" as const, recibo: relativo(r) })));

  const cerradosLotes = filas.filter((f) => f.ancla && f.ancla.tipo !== "pendiente" && f.estado !== "fallido");
  const pendiente = filas.find((f) => f.ancla?.tipo === "pendiente");
  const fallido = filas.find((f) => f.estado === "fallido");
  const sinRecibo = filas.find((f) => !f.recibo);
  const siguiente = pendiente
    ? mensaje("LOTE-SIGUIENTE-ANCLAR", { lote: pendiente.lote })
    : fallido && !faseCerrada
      ? mensaje("LOTE-SIGUIENTE-FALLIDO", { lote: fallido.lote })
      : sinRecibo && !faseCerrada
        ? mensaje("LOTE-SIGUIENTE-IMPLEMENTAR", { lote: sinRecibo.lote })
        : faseCerrada
          ? mensaje("LOTE-SIGUIENTE-FASE-CERRADA", { numero: fase.numero })
          : mensaje("LOTE-SIGUIENTE-CERRAR-FASE", { documento: fase.documento });

  const salida: EstadoDeLotes = {
    tarea: fase.taskName,
    plan: fase.plan,
    declarados: total,
    cerrados: cerradosLotes.length,
    siguiente,
    faseCerrada,
    lotes: filas,
    fueraDePlan,
    avisos,
  };
  return { texto: textoDeEstado(salida, comprobar), salida };
}

// In the call's language. The state and the origin of each batch, which the structured output gives with
// their canonical value, are shown in that language.
function textoDeEstado(e: EstadoDeLotes, comprobar: boolean): string {
  const v = vocabulario(idiomaDeMensajes()).recibo;
  const cabecera = mensaje("LOTE-ESTADO-COLUMNAS").split("|").slice(0, comprobar ? 9 : 8);
  const raya = (valor: string | null): string => (valor ? celda(valor) : "—");
  const filas = e.lotes.map((f) =>
    [
      f.lote,
      raya(f.repo),
      raya(f.objetivo),
      f.commitPropuesto ? `\`${celda(f.commitPropuesto)}\`` : "—",
      f.recibo ? `\`${f.recibo}\`` : "—",
      raya(f.estado === null ? null : (v.estados[f.estado as EstadoLote] ?? f.estado)),
      f.ancla ? celda(f.ancla.resumen) : "—",
      raya(f.origen === null ? null : v.origen[f.origen]),
      ...(comprobar ? [f.vigente === null ? "—" : f.vigente ? mensaje("LOTE-VIGENTE-SI") : mensaje("LOTE-VIGENTE-NO", { problema: celda(f.problema ?? "") })] : []),
    ].join(" | ")
  );
  const lineas = [
    mensaje("LOTE-ESTADO-RESUMEN", { tarea: e.tarea, plan: e.plan, declarados: e.declarados, cerrados: e.cerrados }),
    mensaje("LOTE-ESTADO-SIGUIENTE", { siguiente: e.siguiente }),
    "",
    `| ${cabecera.join(" | ")} |`,
    `|${cabecera.map(() => "---").join("|")}|`,
    ...filas.map((f) => `| ${f} |`),
  ];
  if (e.fueraDePlan.length) {
    lineas.push(
      "",
      mensaje("LOTE-ESTADO-FUERA-TITULO"),
      ...e.fueraDePlan.map((f) => mensaje("LOTE-ESTADO-FUERA", { codigo: f.codigo, recibo: f.recibo, declarados: e.declarados }))
    );
  }
  if (e.avisos.length) lineas.push("", mensaje("LOTE-ESTADO-AVISOS-TITULO"), ...e.avisos.map((a) => `- ${a}`));
  return lineas.join("\n");
}

// ─── The commits of Phase 4, for the Phase 5 auditor ────────────────────────
// When delivering the prompt of the phase after the batches one, the server verifies each anchor and gives
// the auditor the commits per repo, whether they are consecutive and the exact range to audit them. The
// auditor no longer rebuilds them from the receipts.
//
// It is prompt prose: it goes in the project's language (`fase.idioma`), with the vocabulary's headings.
export const PLAZO_DE_COMMITS_MS = 15_000;

export async function bloqueDeCommits(carpetaProyecto: string, carpetaTarea: string, phases: Map<number, PhaseFile>): Promise<string | null> {
  let fase: FaseDeLotes;
  let total: number;
  try {
    fase = faseEnCarpeta(carpetaTarea, phases, carpetaProyecto, idiomaDelProyecto(carpetaProyecto).idioma);
    total = lotesDelPlan(fase);
  } catch {
    return null; // without a batches phase or without a plan with batches there is nothing to list
  }
  let porLote: Map<number, ReciboEnDisco[]>;
  try {
    porLote = recibosDeLaTarea(fase);
  } catch (error) {
    // Without the block, rule 1 of Phase 5 sends to ask: let it be known why.
    const motivo = mensaje("LOTE-COMMITS-RECIBOS-ILEGIBLES", { error: error instanceof Error ? error.message : String(error) }, fase.idioma);
    return `## ${vocabulario(fase.idioma).encabezados.commitsDeLaFase(fase.numero)}\n\n${motivo}`;
  }
  const idioma = fase.idioma;
  const documento = fase.documento ? path.join(fase.carpetaTarea, fase.documento) : null;
  if (total === 1 && documento && fs.existsSync(documento) && !(porLote.get(1) ?? []).length) {
    porLote.set(1, [{ recibo: { ...parsearRecibo(leerTextoAcotado(documento), fase.documento!), lote: 1 }, nombre: fase.documento!, ruta: documento, mtimeMs: 0 }]);
  }
  if (porLote.size === 0) return null;

  const fuera: string[] = [];
  const porRepo = new Map<string, Recibo[]>();
  const sinCommit: Recibo[] = [];
  for (let lote = 1; lote <= total; lote++) {
    const recibo = (porLote.get(lote) ?? [])[0]?.recibo;
    const etiqueta = etiquetaDeLote(lote);
    if (!recibo) fuera.push(mensaje("LOTE-COMMITS-SIN-RECIBO", { lote: etiqueta }, idioma));
    else if (recibo.estado === "descartado" || recibo.estado === "fallido") {
      const motivo = recibo.ancla.tipo === "nota" ? recibo.ancla.texto.replace(/\s+/g, " ").trim() : null;
      fuera.push(mensaje("LOTE-COMMITS-CERRADO", { lote: etiqueta, estado: recibo.estado, motivo }, idioma));
    } else if (recibo.ancla.tipo === "pendiente") fuera.push(mensaje("LOTE-COMMITS-PENDIENTE", { lote: etiqueta }, idioma));
    else if (recibo.ancla.tipo === "commit") {
      const repo = recibo.ancla.repo || recibo.repo || "";
      porRepo.set(repo, [...(porRepo.get(repo) ?? []), recibo]);
    } else sinCommit.push(recibo);
  }

  const secciones: string[] = [];
  let hayNoVigentes = false;
  for (const [repo, recibos] of porRepo) {
    let dir: string | null = null;
    let rama: string | null = null;
    try {
      dir = resolverRepo(carpetaProyecto, repo).ruta!;
      rama = await ramaActual(dir);
    } catch {
      dir = null;
    }
    // Several at a time, with a cap: with 40 batches, one after another took almost the whole deadline.
    // reverificar already returns the full SHA: it is not resolved twice.
    const resultados = await enParalelo(recibos, VERIFICACIONES_A_LA_VEZ, async (recibo) => {
      const ancla = recibo.ancla as Extract<Ancla, { tipo: "commit" }>;
      const comprobacion = await reverificar(carpetaProyecto, recibo, idioma);
      let asunto = ancla.asunto;
      if (!asunto && dir && comprobacion.vigente) {
        try {
          asunto = (await datosDeCommit(dir, comprobacion.sha ?? ancla.sha)).asunto; // a manual 2.x receipt does not store it
        } catch {
          asunto = "";
        }
      }
      return { recibo, ancla, comprobacion, asunto };
    });
    const vigentes = resultados.flatMap(({ comprobacion }) => (comprobacion.vigente && comprobacion.sha ? [comprobacion.sha] : []));
    if (resultados.some(({ comprobacion }) => !comprobacion.vigente)) hayNoVigentes = true;
    const filas = resultados.map(
      ({ recibo, ancla, comprobacion, asunto }) =>
        `| ${etiquetaDeLote(recibo.lote)} | \`${ancla.corto || ancla.sha.slice(0, 7)}\` | ${celda(asunto) || "—"} | ${vigenteEn(comprobacion, idioma)} |`
    );

    const lineas = [mensaje("LOTE-COMMITS-REPO", { repo, rama }, idioma), mensaje("LOTE-COMMITS-CABECERA", {}, idioma), "|---|---|---|---|", ...filas, ""];
    const cortos = recibos.map((r) => (r.ancla as Extract<Ancla, { tipo: "commit" }>).corto);
    if (dir && vigentes.length === recibos.length) {
      const primero = cortos[0]!;
      const ultimo = cortos[cortos.length - 1]!;
      if (recibos.length === 1) lineas.push(mensaje("LOTE-COMMITS-RANGO-UNO", { primero }, idioma));
      else if (await sonConsecutivos(dir, vigentes)) {
        lineas.push(
          (await tienePadre(dir, vigentes[0]!))
            ? mensaje("LOTE-COMMITS-CONSECUTIVOS", { primero, ultimo }, idioma)
            : mensaje("LOTE-COMMITS-CONSECUTIVOS-DESDE-RAIZ", { ultimo }, idioma)
        );
      } else {
        lineas.push(mensaje("LOTE-COMMITS-NO-CONSECUTIVOS", { cortos }, idioma));
      }
    } else {
      lineas.push(mensaje("LOTE-COMMITS-AUDITA-CADA", {}, idioma));
    }
    secciones.push(lineas.join("\n"));
  }

  if (sinCommit.length) {
    const filas = await enParalelo(sinCommit, VERIFICACIONES_A_LA_VEZ, async (recibo) => {
      const ancla = recibo.ancla;
      if (ancla.tipo === "sha256") {
        const comprobacion = await reverificar(carpetaProyecto, recibo, idioma);
        if (!comprobacion.vigente) hayNoVigentes = true;
        return `| ${etiquetaDeLote(recibo.lote)} | ${mensaje("LOTE-RESUMEN-SHA256", { sha: ancla.sha256.slice(0, 8), ruta: ancla.ruta }, idioma)} | ${vigenteEn(comprobacion, idioma)} |`;
      }
      const nota = mensaje("LOTE-RESUMEN-NOTA", { texto: ancla.tipo === "nota" ? celda(ancla.texto) : "" }, idioma);
      return `| ${etiquetaDeLote(recibo.lote)} | ${nota} | ${vocabulario(idioma).recibo.noAplica} |`;
    });
    secciones.push([mensaje("LOTE-COMMITS-SIN-COMMIT-TITULO", {}, idioma), mensaje("LOTE-COMMITS-SIN-COMMIT-CABECERA", {}, idioma), "|---|---|---|", ...filas].join("\n"));
  }
  if (fuera.length) secciones.push([mensaje("LOTE-COMMITS-FUERA-TITULO", {}, idioma), ...fuera].join("\n"));
  if (hayNoVigentes) secciones.push(mensaje("LOTE-COMMITS-NO-VIGENTES", {}, idioma));

  return [`## ${vocabulario(idioma).encabezados.commitsVerificados(fase.numero)}`, ...secciones].join("\n\n");
}

// The "Vigente" cell of the block: yes, or no with the reason.
function vigenteEn(comprobacion: { vigente: boolean; texto: string }, idioma: Idioma): string {
  return comprobacion.vigente ? mensaje("LOTE-VIGENTE-SI", {}, idioma) : mensaje("LOTE-VIGENTE-NO", { problema: celda(comprobacion.texto) }, idioma);
}

// The block with a deadline: if git does not answer, the prompt is delivered anyway and says so, with the same heading.
export async function bloqueDeCommitsConPlazo(carpetaProyecto: string, carpetaTarea: string, phases: Map<number, PhaseFile>, plazoMs = PLAZO_DE_COMMITS_MS): Promise<string | null> {
  let numero: number | null = null;
  try {
    numero = faseEnCarpeta(carpetaTarea, phases).numero;
  } catch {
    // without a batches phase, bloqueDeCommits returns null right away
  }
  let idioma: Idioma = "es";
  try {
    idioma = idiomaDelProyecto(carpetaProyecto).idioma;
  } catch {
    // with a manifest that cannot be read, bloqueDeCommits also returns null right away
  }
  const encabezado = numero === null ? mensaje("LOTE-COMMITS-FASE-ANTERIOR", {}, idioma) : vocabulario(idioma).encabezados.commitsDeLaFase(numero);
  let temporizador: NodeJS.Timeout | undefined;
  const vencido = new Promise<string>((resolver) => {
    temporizador = setTimeout(() => resolver(`## ${encabezado}\n\n${mensaje("LOTE-COMMITS-PLAZO", { segundos: plazoMs / 1000 }, idioma)}`), plazoMs);
    temporizador.unref();
  });
  try {
    return await Promise.race([bloqueDeCommits(carpetaProyecto, carpetaTarea, phases), vencido]);
  } finally {
    clearTimeout(temporizador);
  }
}

// The first batch without a closed receipt (anchor other than pending), or null if none is left.
export function siguienteLote(recibos: Map<number, Recibo | ReciboEnDisco[]>, total: number): number | null {
  for (let lote = 1; lote <= total; lote++) {
    const valor = recibos.get(lote);
    const deEste = valor === undefined ? [] : Array.isArray(valor) ? valor.map((r) => r.recibo) : [valor];
    if (deEste.length === 0 || deEste.some((r) => r.ancla.tipo === "pendiente")) return lote;
  }
  return null;
}
