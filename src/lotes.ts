// El motor de lotes de la Fase 4 (§6.4 y §6.6 del plan maestro v3): record_batch registra cada lote en
// un recibo que escribe el servidor, con su ancla verificada, y al cerrar el último genera el documento
// de la fase.
//
// Dos tiempos para toda política con git (decisión H1): primero el recibo con el commit pendiente,
// ANTES del commit, para que sobreviva a un corte del chat; después, con el hash, el ancla. Si el
// commit ya existe al registrar el lote, va todo en una llamada.
//
// El servidor solo escribe dentro de la carpeta de la tarea (sus recibos y el documento de la fase),
// con escritura atómica, y nunca en git: el commit lo hace el agente, aquí solo se lee para verificarlo.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { anclarArtefacto, anclarCommit, reverificar } from "./anclas.js";
import { configuracionDe, fasesDe, reposDeLaTarea } from "./capas.js";
import { DOCS, requireBasePath } from "./config.js";
import type { ResultadoConfirmacion } from "./confirmacion.js";
import { datosDeCommit, ramaActual, resolverCommit, sonConsecutivos, tieneGit, tienePadre } from "./git.js";
import { estaDentroReal, leerTextoAcotado, taskFolderPath } from "./paths.js";
import { separarFrontmatter } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { GENERADO_POR, celda, escribirRecibo, etiquetaDeLote, frontmatterDeRecibo, leerRecibo, loteDelNombre, nombreDeRecibo, parsearRecibo } from "./recibos.js";
import type { Ancla, EstadoLote, Recibo, TituloCondicional } from "./recibos.js";
import { resolverRepo } from "./repos.js";
import { VOCABULARIO, lotesDelFrontmatter, vocabulario } from "./vocabulario.js";
import type { Idioma } from "./vocabulario.js";

// ─── La tarea y su plan ─────────────────────────────────────────────────────
export type FaseDeLotes = {
  taskName: string;
  carpetaTarea: string;
  phases: Map<number, PhaseFile>;
  numero: number; // la fase que declara los recibos (la 4)
  titulo: string; // su título ("Ejecución")
  recibos: string; // su subcarpeta
  documento: string | null; // su documento, el que la cierra
  plan: string; // el documento de la fase anterior (el plan técnico)
  idioma: Idioma; // el del proyecto: en él se escriben los recibos y el índice (§8.2)
};

export function faseEnCarpeta(carpetaTarea: string, phases: Map<number, PhaseFile>, nombreDelProyecto = "", idioma: Idioma = "es"): FaseDeLotes {
  const taskName = path.basename(carpetaTarea);
  const conRecibos = [...phases.entries()].sort((a, b) => a[0] - b[0]).find(([, datos]) => datos.recibos);
  if (!conRecibos) throw new Error(`Ninguna fase ${nombreDelProyecto ? `de ${nombreDelProyecto} ` : ""}declara una subcarpeta de recibos (\`recibos:\` en su frontmatter): no hay lotes que registrar.`);
  const [numero, datos] = conRecibos;
  const anterior = [...phases.entries()].filter(([n, d]) => n < numero && d.documento).sort((a, b) => b[0] - a[0])[0];
  if (!anterior) throw new Error(`La Fase ${numero} no tiene una fase anterior con documento: no hay plan del que leer los lotes.`);
  return { taskName, carpetaTarea, phases, numero, titulo: datos.title, recibos: datos.recibos!, documento: datos.documento ?? null, plan: anterior[1].documento!, idioma };
}

export function faseDeLotes(carpetaProyecto: string, taskName: string): FaseDeLotes {
  const carpetaTarea = taskFolderPath(carpetaProyecto, taskName);
  if (!fs.statSync(carpetaTarea, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`No existe la tarea "${taskName}" en ${carpetaProyecto}. Para una tarea nueva, usa start_task.`);
  }
  return faseEnCarpeta(carpetaTarea, fasesDe(carpetaProyecto), carpetaProyecto);
}

function textoDelPlan(fase: FaseDeLotes): string {
  const ruta = path.join(fase.carpetaTarea, fase.plan);
  if (!fs.existsSync(ruta)) throw new Error(`La tarea "${fase.taskName}" todavía no tiene \`${fase.plan}\`: la Fase ${fase.numero} ejecuta los lotes de ese plan.`);
  return leerTextoAcotado(ruta);
}

// H3: el número de lotes sale SOLO del frontmatter del plan, nunca de su tabla.
export function lotesDelPlan(fase: FaseDeLotes): number {
  const texto = textoDelPlan(fase);
  const valor = lotesDelFrontmatter(separarFrontmatter(texto).meta);
  if (valor === undefined || valor.trim() === "") {
    // La tabla no decide el número (H3), pero sí sirve para proponérselo a la persona.
    const filas = leerTablaDeLotes(texto)?.size ?? 0;
    const sugerencia = filas ? ` Su tabla de lotes tiene ${filas} ${filas === 1 ? "fila" : "filas"}: ¿es \`lotes: ${filas}\`?` : "";
    throw new Error(`El plan no declara \`lotes: N\` en su frontmatter. Añádelo a \`${fase.plan}\` antes del primer recibo.${sugerencia}`);
  }
  const n = Number(valor.trim());
  if (!/^\d+$/.test(valor.trim()) || n < 1 || n > 99) {
    throw new Error(`El frontmatter de \`${fase.plan}\` dice \`lotes: ${valor.trim()}\`, y tiene que ser un número entero de 1 a 99.`);
  }
  return n;
}

// La tabla de lotes del plan (§3.5.1): la que empieza por `| Lote | Repo |` (o `| Batch | Repo |`), y sus
// filas `L\d\d`. Solo informa (el objetivo de un lote que se descarta, las columnas de get_batch_status):
// el número de lotes nunca sale de aquí. null si no hay tabla o no se entiende.
export type FilaDelPlan = { repo: string; objetivo: string; commitPropuesto: string };

export function leerTablaDeLotes(texto: string): Map<number, FilaDelPlan> | null {
  const lineas = separarFrontmatter(texto).cuerpo.split("\n");
  const partir = (linea: string): string[] =>
    linea.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

  const inicio = lineas.findIndex((linea) => /^\|\s*(?:Lote|Batch)\s*\|\s*Repo\s*\|/i.test(linea.trim()));
  if (inicio === -1) return null;
  const cabecera = partir(lineas[inicio]!).map((c) => c.normalize("NFC").toLowerCase());
  // La columna en el idioma de la tabla, o en el otro.
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

// ─── Los recibos que hay ────────────────────────────────────────────────────
export type ReciboEnDisco = { recibo: Recibo; nombre: string; ruta: string; mtimeMs: number };

export function carpetaDeRecibos(fase: FaseDeLotes): string {
  return path.join(fase.carpetaTarea, fase.recibos);
}

// Los recibos de la subcarpeta por lote. Un archivo que no se puede leer (binario, o de más de 1 MB) es
// un error con su nombre: no se pisa ni se salta sin decirlo.
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
      throw new Error(`No se pudo leer el recibo \`${fase.recibos}/${entrada.name}\`: ${error instanceof Error ? error.message : String(error)}`);
    }
    porLote.set(lote, [...(porLote.get(lote) ?? []), { recibo: { ...recibo, lote }, nombre: entrada.name, ruta, mtimeMs }]);
  }
  return porLote;
}

function unicoDe(porLote: Map<number, ReciboEnDisco[]>, lote: number, fase: FaseDeLotes): ReciboEnDisco | null {
  const deEste = porLote.get(lote) ?? [];
  if (deEste.length > 1) {
    throw new Error(
      `Hay ${deEste.length} recibos de ${etiquetaDeLote(lote)} en \`${fase.recibos}/\` (${deEste.map((r) => `\`${r.nombre}\``).join(", ")}). ` +
        "Deja uno solo antes de seguir."
    );
  }
  return deEste[0] ?? null;
}

export const esSellado = (ancla: Ancla): boolean => ancla.tipo === "commit" || ancla.tipo === "sha256";

// Cerrado: con recibo y un ancla distinta de pendiente. Un fallido está cerrado para el orden, pero no
// cierra la fase.
const cerrado = (recibo: Recibo | undefined): boolean => recibo !== undefined && recibo.ancla.tipo !== "pendiente";
const cierraLaFase = (recibo: Recibo | undefined): boolean => cerrado(recibo) && recibo!.estado !== "fallido";

// ─── El documento de la fase (§6.6) ─────────────────────────────────────────
function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

function enumerar(elementos: string[]): string {
  if (elementos.length <= 1) return elementos.join("");
  return `${elementos.slice(0, -1).join(", ")} y ${elementos[elementos.length - 1]}`;
}

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

// Determinista: los mismos recibos dan los mismos bytes. La fecha de cierre es la del recibo escrito
// más tarde, no la hora del ensamblado.
export type ReciboConNombre = { recibo: Recibo; nombre: string };

// En el idioma del proyecto (§8.2): claves del frontmatter, encabezados, tablas y valores.
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

// El índice de una tarea tal como lo escribiría hoy el servidor, leyendo sus recibos.
export function ensamblarIndice(carpetaTarea: string, fases: Map<number, PhaseFile>, idioma: Idioma = "es"): string {
  const fase = faseEnCarpeta(carpetaTarea, fases, "", idioma);
  const total = lotesDelPlan(fase);
  const recibos = new Map<number, ReciboConNombre>();
  for (const [lote, deEste] of recibosDeLaTarea(fase)) if (lote <= total && deEste.length === 1) recibos.set(lote, deEste[0]!);
  return textoDelIndice(fase, total, recibos, idioma);
}

// Un documento de fase que generó el servidor (el índice, o el recibo de un solo lote): `generado_por` o
// `generated_by`.
export function generadoPorElServidor(texto: string): boolean {
  return frontmatterDeRecibo(texto).meta.generado_por === GENERADO_POR;
}

// ─── Registrar un lote ──────────────────────────────────────────────────────
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
  // Justo antes de escribir: el servidor comprueba aquí que el cliente no haya cancelado la llamada.
  antesDeEscribir?: () => void;
  // La confirmación de la persona (elicitation); sin ella, decide `force`.
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

// AAAA-MM-DD del día de quien registra, no del de UTC.
export function fechaLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

export function resumenDeAncla(ancla: Ancla, repo: string | null): string {
  switch (ancla.tipo) {
    case "commit": {
      const enRepo = ancla.repo || repo;
      return `commit ${ancla.corto}${enRepo ? ` en \`${enRepo}\`` : ""}${ancla.rama ? ` (${ancla.rama})` : ""}`;
    }
    case "sha256":
      return `sha256 \`${ancla.sha256.slice(0, 12)}…\` de \`${ancla.ruta}\``;
    case "nota": {
      const linea = ancla.texto.split("\n")[0] ?? "";
      return `nota: ${linea.length > 80 ? `${linea.slice(0, 80)}…` : linea}`;
    }
    case "pendiente":
      return "commit pendiente";
  }
}

// El modo de la tabla de §6.4: crear, reemplazar o anclar, según lo que hay y lo que llega.
function modoDe(entrada: EntradaDeLote, existente: ReciboEnDisco | null, anclas: string[]): "crear" | "reemplazar" | "anclar" {
  const etiqueta = etiquetaDeLote(entrada.lote);
  const traeContenido = CAMPOS_DE_CONTENIDO.some((campo) => entrada[campo] !== undefined);
  const exigirContenido = (modo: "crear" | "reemplazar"): "crear" | "reemplazar" => {
    const faltan = OBLIGATORIOS.filter((campo) => entrada[campo] === undefined);
    if (faltan.length) {
      const para = modo === "crear" ? `crear el recibo de ${etiqueta}` : `reemplazar el recibo de ${etiqueta}`;
      throw new Error(`Para ${para} faltan ${faltan.map((c) => `\`${c}\``).join(", ")}.`);
    }
    return modo;
  };

  if (!existente) return exigirContenido("crear");
  const { ancla } = existente.recibo;
  if (ancla.tipo === "commit" || ancla.tipo === "sha256") {
    const con = ancla.tipo === "commit" ? `el commit \`${ancla.corto}\`` : `el sha256 \`${ancla.sha256.slice(0, 12)}…\``;
    throw new Error(
      `El recibo ${etiqueta} está sellado con ${con} y no se reescribe. Si su ancla cambió (por ejemplo, un rebase o un squash ` +
        "cambió el SHA), llama con `reanclar: true` y el ancla nueva."
    );
  }
  if (ancla.tipo === "pendiente") {
    // Un lote cuyo commit no va a llegar (el usuario no lo hace, o el lote se descarta) se cierra con solo
    // su estado nuevo y, si se quiere, una nota: el contenido que ya tiene se conserva.
    const soloEstado = CAMPOS_DE_CONTENIDO.every((campo) => campo === "estado" || entrada[campo] === undefined);
    if (soloEstado && (entrada.estado === "descartado" || entrada.estado === "fallido")) return "anclar";
    if (traeContenido) return exigirContenido("reemplazar");
    if (anclas.length === 1) return "anclar";
    throw new Error(
      `El recibo de ${etiqueta} ya existe con el commit pendiente: pasa \`commit\` para anclarlo, o el contenido completo para reemplazarlo.`
    );
  }
  // fallido, o anclado a una nota: no está sellado, y lo que llega es un nuevo intento del lote.
  if (!traeContenido) {
    throw new Error(`El recibo de ${etiqueta} no está sellado (${existente.recibo.estado}, ${resumenDeAncla(ancla, null)}): para registrarlo de nuevo, pasa el contenido completo.`);
  }
  return exigirContenido("reemplazar");
}

function repoDelLote(entrada: EntradaDeLote, existente: ReciboEnDisco | null, modo: string, ids: string[], fase: FaseDeLotes): string | null {
  if (modo === "anclar") {
    const delRecibo = existente!.recibo.repo;
    if (entrada.repo && delRecibo && entrada.repo !== delRecibo) {
      throw new Error(`El recibo de ${etiquetaDeLote(entrada.lote)} es del repo \`${delRecibo}\`, no de \`${entrada.repo}\`.`);
    }
    // Un recibo de la 2.x puede no decir su repo: entonces vale la regla de siempre (el indicado, o el
    // único de la tarea), en vez de tomarlo por un lote sin repositorio.
    if (delRecibo) return delRecibo;
  }
  if (entrada.repo) {
    if (!ids.includes(entrada.repo)) {
      throw new Error(
        ids.length
          ? `\`${entrada.repo}\` no es un repo de la tarea "${fase.taskName}". Los suyos son: ${ids.join(", ")}.`
          : `La tarea "${fase.taskName}" no tiene repos (el proyecto no los declara en phase-gate.json): quita \`repo\`.`
      );
    }
    return entrada.repo;
  }
  if (ids.length > 1) throw new Error(`La tarea "${fase.taskName}" tiene varios repos (${ids.join(", ")}): indica en \`repo\` el de este lote.`);
  return ids[0] ?? null;
}

// Escritura atómica: un temporal en la misma carpeta y un renombrado. El temporal empieza por punto y
// no acaba en .md, así que nadie lo toma por un recibo ni por un documento.
export function escribirAtomico(ruta: string, contenido: string): void {
  const temporal = path.join(path.dirname(ruta), `.${path.basename(ruta)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporal, contenido, "utf-8");
    fs.renameSync(temporal, ruta);
  } catch (error) {
    borrarArchivo(temporal);
    throw traducirEscritura(error, path.basename(ruta));
  }
}

// Un fallo de escritura dicho para una persona: el archivo y qué hacer, sin la ruta del temporal.
export function traducirEscritura(error: unknown, nombre: string): Error {
  const codigo = (error as { code?: string })?.code;
  if (codigo === "EPERM" || codigo === "EACCES" || codigo === "EBUSY") {
    return new Error(`No se pudo escribir \`${nombre}\`: es de solo lectura o lo tiene abierto otro programa (${codigo}). Quita la protección o ciérralo, y vuelve a llamar.`);
  }
  if (codigo === "ENOSPC") return new Error(`No se pudo escribir \`${nombre}\`: no queda espacio en el disco.`);
  return error instanceof Error ? error : new Error(String(error));
}

// unlinkSync y no rmSync: en Node 24.11 para Windows, rmSync no borra un archivo con un nombre que no
// es ASCII ("L01 - corregir cálculo.md") y tampoco lanza (medido). unlink sí.
export function borrarArchivo(ruta: string): void {
  try {
    fs.unlinkSync(ruta);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const OTRO_PROCESO = "Otro proceso modificó este recibo; vuelve a llamar.";

// ─── El candado de la tarea ─────────────────────────────────────────────────
// Un archivo creado en exclusiva (`wx`: falla si ya existe, también en Windows) en la carpeta de la tarea.
// Empieza por punto y no acaba en .md, así que no es documento, recibo ni algo que write_central_doc pueda
// escribir. Si un proceso murió con el candado puesto, a los 30 s se da por abandonado.
export const CANDADO = ".record_batch.lock";
export const ESPERA_DEL_CANDADO_MS = 3000;
export const CANDADO_ABANDONADO_MS = 30_000;

// `opciones` es para otro candado con el mismo mecanismo (el de las acciones del Studio): su nombre y el
// mensaje si sigue ocupado.
export async function conCandado<T>(carpetaTarea: string, seccion: () => T | Promise<T>, opciones: { nombre?: string; ocupado?: string } = {}): Promise<T> {
  const ruta = path.join(carpetaTarea, opciones.nombre ?? CANDADO);
  const limite = Date.now() + ESPERA_DEL_CANDADO_MS;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(ruta, "wx"));
      break;
    } catch (error: any) {
      // En Windows, abrir un archivo que otro proceso está borrando da EPERM y no EEXIST (medido): también
      // es "ocupado".
      if (!["EEXIST", "EPERM", "EACCES", "EBUSY"].includes(error?.code)) throw error;
      const edad = Date.now() - (fs.statSync(ruta, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
      if (edad > CANDADO_ABANDONADO_MS) {
        borrarArchivo(ruta);
        continue;
      }
      if (Date.now() > limite) throw new Error(opciones.ocupado ?? "Otro proceso está registrando un lote de esta tarea; vuelve a llamar.");
      await new Promise((resolver) => setTimeout(resolver, 20 + Math.floor(Math.random() * 30)));
    }
  }
  // await: si la sección es asíncrona, el candado se suelta cuando termina, no cuando empieza.
  try {
    return await seccion();
  } finally {
    borrarArchivo(ruta);
  }
}

// En bigint: el identificador de un archivo en NTFS es de 64 bits y como number pierde los últimos
// dígitos, así que dos archivos vecinos parecerían el mismo (medido).
function mismoArchivo(a: string, b: string): boolean {
  const ia = fs.statSync(a, { throwIfNoEntry: false, bigint: true });
  const ib = fs.statSync(b, { throwIfNoEntry: false, bigint: true });
  return Boolean(ia && ib && ia.ino === ib.ino && ia.dev === ib.dev);
}

// Todo lo que escribe record_batch cae dentro de la Documentación y de la carpeta de la tarea, sobre
// rutas reales: una subcarpeta de recibos que sea un enlace hacia fuera no se usa.
function comprobarDentro(fase: FaseDeLotes, ruta: string): void {
  if (!estaDentroReal(requireBasePath(DOCS), ruta) || !estaDentroReal(fase.carpetaTarea, ruta)) {
    throw new Error(`Acceso denegado: \`${path.relative(fase.carpetaTarea, ruta)}\` lleva fuera de la carpeta de la tarea.`);
  }
}

type Preparado = { recibo: Recibo; nombre: string; existente: ReciboEnDisco | null; avisos: string[] };

// Todo lo que decide el registro de un lote, sin escribir nada: el modo, el repo, el ancla verificada y
// el recibo que quedaría.
async function prepararLote(
  carpetaProyecto: string,
  fase: FaseDeLotes,
  total: number,
  porLote: Map<number, ReciboEnDisco[]>,
  entrada: EntradaDeLote,
  ahora: () => Date
): Promise<Preparado> {
  const etiqueta = etiquetaDeLote(entrada.lote);
  // Orden: todos los anteriores tienen recibo con ancla (un fallido o un descartado cuenta como cerrado).
  for (let anterior = 1; anterior < entrada.lote; anterior++) {
    const suyo = unicoDe(porLote, anterior, fase);
    if (!suyo) throw new Error(`Antes de ${etiqueta} hay que cerrar ${etiquetaDeLote(anterior)}: le falta el recibo.`);
    if (suyo.recibo.ancla.tipo === "pendiente") throw new Error(`Antes de ${etiqueta} hay que cerrar ${etiquetaDeLote(anterior)}: su commit sigue pendiente.`);
  }

  const existente = unicoDe(porLote, entrada.lote, fase);
  const anclas = ANCLAS.filter((campo) => entrada[campo] !== undefined);
  if (anclas.length > 1) throw new Error("Pasa solo una ancla: `commit`, `artifact_path` o `verification_note`.");
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
  // Los commits que ya anclan otros lotes de la tarea: un commit, un lote.
  const otrosLotes = [...porLote.entries()].flatMap(([lote, recibos]) =>
    lote === entrada.lote ? [] : recibos.flatMap((r) => (r.recibo.ancla.tipo === "commit" ? [{ lote, sha: r.recibo.ancla.sha }] : []))
  );

  // ─── El ancla, según el estado del lote y la política (tabla de §6.4) ───
  let ancla: Ancla;
  let verificacionDelCommit: string | null = null;
  const avisos: string[] = [];
  const conCommit = async (): Promise<Ancla> => {
    const anclado = await anclarCommit(carpetaProyecto, repo!, entrada.commit!, declarados, otrosLotes, ahora);
    verificacionDelCommit = anclado.verificacionDelCommit;
    if (!anclado.coinciden) avisos.push(anclado.verificacionDelCommit);
    return anclado.ancla;
  };

  if (estado === "fallido" || estado === "descartado") {
    if (entrada.commit !== undefined) throw new Error(`Un lote ${estado} no se commitea: registra lo que pasó con \`verification_note\`, sin \`commit\`.`);
    if (entrada.artifact_path !== undefined) throw new Error(`Un lote ${estado} no se sella: registra lo que pasó con \`verification_note\`.`);
    ancla = { tipo: "nota", texto: entrada.verification_note ?? vocabulario(fase.idioma).recibo.notaPorDefecto(vocabulario(fase.idioma).recibo.estados[estado]) };
  } else if (conGit) {
    if (entrada.artifact_path !== undefined || entrada.verification_note !== undefined) {
      throw new Error(
        `El repo \`${repo}\` tiene git y la política de commits es \`${politica}\`: el ancla de este lote es su commit. ` +
          "Pasa `commit` cuando exista, o nada para dejarlo pendiente."
      );
    }
    ancla = entrada.commit !== undefined ? await conCommit() : { tipo: "pendiente" };
  } else if (entrada.commit !== undefined) {
    if (!repoConGit) {
      throw new Error(
        `${repo ? `El repo \`${repo}\` no tiene git` : "Este lote no tiene repositorio"}: no hay commit que anclar. Pasa \`artifact_path\` o \`verification_note\`.`
      );
    }
    ancla = await conCommit(); // política ninguno, pero el repo tiene git: se verifica igual
  } else if (entrada.artifact_path !== undefined) {
    ancla = await anclarArtefacto(carpetaProyecto, repo, entrada.artifact_path, ahora);
  } else if (entrada.verification_note !== undefined) {
    ancla = { tipo: "nota", texto: entrada.verification_note };
  } else {
    throw new Error("Sin git, el lote necesita un ancla: `artifact_path` o `verification_note`.");
  }

  // ─── El recibo ───
  const momento = ahora();
  let rama: string | null = ancla.tipo === "commit" ? ancla.rama || null : null;
  if (ancla.tipo === "pendiente" && dirDelRepo) {
    try {
      rama = await ramaActual(dirDelRepo);
    } catch {
      rama = null; // la rama es informativa; el ancla la vuelve a leer
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

// El recibo de un lote que se cierra sin hacerse (cerrar_fase), con el objetivo que le dio el plan.
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

  if (entrada.motivo_descarte !== undefined && entrada.cerrar_fase !== true) throw new Error("`motivo_descarte` solo va con `cerrar_fase: true`.");
  if (entrada.reanclar === true) return reanclarLote(carpetaProyecto, fase, entrada, contexto, ahora);

  // Con el documento de la fase escrito, la fase está cerrada; con una fase posterior, también.
  for (const [numero, datos] of [...fase.phases.entries()].sort((a, b) => a[0] - b[0])) {
    if (numero >= fase.numero && datos.documento && fs.existsSync(path.join(fase.carpetaTarea, datos.documento))) {
      throw new Error(
        `La Fase ${fase.numero} ya está cerrada (existe \`${datos.documento}\`): no se registran más lotes. Para cambiar el ancla de un ` +
          "lote (tras un rebase o un squash), usa `reanclar: true`."
      );
    }
  }

  const total = lotesDelPlan(fase);
  if (entrada.lote > total) {
    throw new Error(
      `El plan declara ${plural(total, "lote", "lotes")}; ${etiqueta} no existe. Si el plan cambió, actualiza su frontmatter: el plan ya está ` +
        "congelado, así que hará falta la confirmación del usuario, y el cambio va como decisión en los Desvíos del recibo."
    );
  }

  const porLote = recibosDeLaTarea(fase);
  // Con cerrar_fase, una llamada sin contenido ni ancla solo cierra: no registra el lote.
  const preparado = entrada.cerrar_fase === true && !traeAlgo(entrada) ? null : await prepararLote(carpetaProyecto, fase, total, porLote, entrada, ahora);

  // Cómo quedan los lotes después de esta llamada, con el nombre de su archivo.
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
      } else if (suyos.length > 1 && entrada.cerrar_fase) unicoDe(porLote, lote, fase); // lanza con los nombres
    }
  }

  // ─── cerrar_fase: descartar lo que falta, con la confirmación de la persona ───
  const descartes: Recibo[] = [];
  if (entrada.cerrar_fase === true) {
    const conPendiente = [...finales.values()].filter((r) => r.ancla.tipo === "pendiente").map((r) => etiquetaDeLote(r.lote));
    if (conPendiente.length) {
      throw new Error(`No se puede cerrar la Fase ${fase.numero} con ${enumerar(conPendiente)} abierto con el commit pendiente: ánclalo con \`commit\`, o regístralo como descartado.`);
    }
    const faltan: number[] = [];
    for (let lote = 1; lote <= total; lote++) if (!finales.has(lote)) faltan.push(lote);
    if (faltan.length && entrada.motivo_descarte === undefined) {
      throw new Error(`Faltan ${enumerar(faltan.map(etiquetaDeLote))}: para cerrar la fase sin ${faltan.length === 1 ? "él" : "ellos"}, pasa \`motivo_descarte\` (lo decide el usuario).`);
    }
    const fallidos = [...finales.values()].filter((r) => r.estado === "fallido").map((r) => etiquetaDeLote(r.lote));

    if (faltan.length || fallidos.length) {
      const partes: string[] = [];
      if (faltan.length) partes.push(`${enumerar(faltan.map(etiquetaDeLote))} ${faltan.length === 1 ? "descartado" : "descartados"} («${entrada.motivo_descarte}»)`);
      if (fallidos.length) partes.push(`${enumerar(fallidos)} ${fallidos.length === 1 ? "fallido" : "fallidos"}`);
      const confirmacion = contexto.confirmar ? await contexto.confirmar({ mensaje: `Cerrar la Fase ${fase.numero} con ${partes.join(" y ")}. ¿Confirmas?`, etiqueta: `Cerrar la Fase ${fase.numero}` }) : { estado: "no-disponible" as const };
      const nota = confirmacion.nota ? ` ${confirmacion.nota}` : "";
      if (confirmacion.estado === "rechazada") throw new Error(`El usuario no confirmó el cierre de la Fase ${fase.numero}. No se escribió nada.${nota}`);
      if (confirmacion.estado === "no-disponible" && entrada.force !== true) {
        throw new Error(
          `Cerrar la Fase ${fase.numero} con ${partes.join(" y ")} lo decide el usuario: pídele confirmación explícita en el chat y vuelve a llamar con force: true.${nota}`
        );
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

  // ─── Escritura ───
  const carpeta = carpetaDeRecibos(fase);
  const tipoDeCarpeta = fs.lstatSync(carpeta, { throwIfNoEntry: false });
  if (tipoDeCarpeta && !fs.statSync(carpeta).isDirectory()) throw new Error(`\`${fase.recibos}\` existe en la tarea y no es una carpeta.`);
  const rutaDe = (lote: number, titulo: string): string => path.join(carpeta, nombreDeRecibo(lote, titulo));
  if (preparado) comprobarDentro(fase, path.join(carpeta, preparado.nombre));
  for (const recibo of descartes) comprobarDentro(fase, rutaDe(recibo.lote, recibo.titulo));

  contexto.antesDeEscribir?.();

  // Con el candado de la tarea: comprobar y escribir es una sola sección, sin esperas en medio, y solo un
  // proceso la recorre a la vez. Sin él, dos procesos que llegaban juntos pasaban los dos la comprobación.
  const lotes = [...Array(total).keys()].map((i) => i + 1);
  const cierra = fase.documento !== null && (entrada.cerrar_fase === true ? lotes.every((n) => cerrado(finales.get(n))) : lotes.every((n) => cierraLaFase(finales.get(n))));
  const { archivoNuevo, documentoDeFase } = await conCandado(fase.carpetaTarea, () => {
  // Otro proceso pudo escribir mientras se verificaba el ancla (dos ventanas registrando el mismo lote).
  const ahoraEnDisco = recibosDeLaTarea(fase);
  if (preparado?.existente) {
    if (fs.statSync(preparado.existente.ruta, { throwIfNoEntry: false })?.mtimeMs !== preparado.existente.mtimeMs) throw new Error(OTRO_PROCESO);
  }
  for (const lote of [...(preparado && !preparado.existente ? [entrada.lote] : []), ...descartes.map((r) => r.lote)]) {
    if ((ahoraEnDisco.get(lote) ?? []).length > 0) throw new Error(OTRO_PROCESO);
  }
  if (fase.documento && fs.existsSync(path.join(fase.carpetaTarea, fase.documento))) throw new Error(OTRO_PROCESO);

  fs.mkdirSync(carpeta, { recursive: true });
  let archivoNuevo = descartes.length > 0;
  if (preparado) {
    const ruta = path.join(carpeta, preparado.nombre);
    escribirAtomico(ruta, escribirRecibo(preparado.recibo, { idioma: fase.idioma }));
    // Si cambió el título, el archivo cambia de nombre. En Windows y macOS un cambio solo de mayúsculas es
    // el mismo archivo, que el renombrado ya reemplazó: borrarlo borraría el nuevo.
    const viejo = preparado.existente;
    if (viejo && viejo.nombre !== preparado.nombre && fs.existsSync(viejo.ruta) && !mismoArchivo(viejo.ruta, ruta)) borrarArchivo(viejo.ruta);
    archivoNuevo ||= !viejo || viejo.nombre !== preparado.nombre;
  }
  for (const recibo of descartes) escribirAtomico(rutaDe(recibo.lote, recibo.titulo), escribirRecibo(recibo, { idioma: fase.idioma }));

  // ─── Cierre: todos los lotes con ancla, y ninguno fallido; o cerrar_fase ───
  let documentoDeFase: string | null = null;
  if (cierra) {
    const destino = path.join(fase.carpetaTarea, fase.documento!);
    comprobarDentro(fase, destino);
    if (total === 1) {
      // H2: con un solo lote, su recibo se mueve y pasa a ser el documento de la fase.
      escribirAtomico(destino, escribirRecibo(finales.get(1)!, { comoDocumento: true, idioma: fase.idioma }));
      borrarArchivo(path.join(carpeta, nombres.get(1)!));
      try {
        fs.rmdirSync(carpeta); // solo si quedó vacía
      } catch {
        // con otros archivos dentro, la subcarpeta se queda
      }
    } else {
      escribirAtomico(destino, textoDelIndice(fase, total, new Map(lotes.map((n) => [n, { recibo: finales.get(n)!, nombre: nombres.get(n)! }]))));
    }
    documentoDeFase = fase.documento;
    archivoNuevo = true;
  }
  return { archivoNuevo, documentoDeFase };
  });

  // ─── Respuesta ───
  const registrado = preparado?.recibo ?? null;
  const reciboRelativo = documentoDeFase && total === 1 ? documentoDeFase : registrado ? `${fase.recibos}/${preparado!.nombre}` : "";
  const siguiente = cierra ? null : siguienteLote(finales, total);
  const cierre = documentoDeFase
    ? total === 1
      ? `Fase ${fase.numero} cerrada: el recibo pasó a ser \`${documentoDeFase}\`.`
      : `Fase ${fase.numero} cerrada: se generó \`${documentoDeFase}\`.`
    : null;
  const descartadosTexto = descartes.length ? `${enumerar(descartes.map((r) => etiquetaDeLote(r.lote)))} ${descartes.length === 1 ? "registrado como descartado" : "registrados como descartados"}.` : null;

  let texto: string;
  if (!registrado) {
    texto = [descartadosTexto, cierre ?? "No se cerró la fase."].filter(Boolean).join(" ");
  } else {
    const cabecera = `${etiqueta} de ${total} registrado`;
    if (registrado.ancla.tipo === "pendiente") {
      texto = `${cabecera} con el commit pendiente. Cuando exista, llama de nuevo a \`record_batch\` con \`lote: ${entrada.lote}\` y \`commit\`.`;
    } else if (registrado.estado === "fallido" && !cierre) {
      texto = `${cabecera}: fallido. No hagas su commit: detente y pregúntale al usuario si se reintenta o se descarta (con \`cerrar_fase\` y \`motivo_descarte\`).`;
    } else {
      const despues = cierre ?? (siguiente ? `Siguiente: ${etiquetaDeLote(siguiente)}.` : "No quedan lotes por registrar.");
      texto = [`${cabecera}: ${registrado.estado} · ${resumenDeAncla(registrado.ancla, registrado.repo)}.`, descartadosTexto, despues].filter(Boolean).join(" ");
    }
    if (preparado!.avisos.length) {
      texto += `\nAviso: el commit no toca los archivos que declara el recibo (queda escrito en "Verificación del commit"):\n${preparado!.avisos.join("\n")}`;
    }
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

// ─── Reanclar un recibo sellado (§6.5) ──────────────────────────────────────
// El caso típico: un rebase o un squash cambió el SHA y el recibo apunta a un commit que ya no está en la
// rama. Solo cambia el ancla; el contenido del lote no se toca. Con la fase ya cerrada también vale: con
// un solo lote el recibo es el documento de la fase, y con varios se rehace el índice que generó el
// servidor.
const etiquetaDeAncla = (ancla: Ancla): string =>
  ancla.tipo === "commit" ? ancla.corto : ancla.tipo === "sha256" ? `sha256 ${ancla.sha256.slice(0, 12)}…` : ancla.tipo;

async function reanclarLote(carpetaProyecto: string, fase: FaseDeLotes, entrada: EntradaDeLote, contexto: ContextoDeLote, ahora: () => Date): Promise<ResultadoDeLote> {
  const etiqueta = etiquetaDeLote(entrada.lote);
  if (CAMPOS_DE_CONTENIDO.some((campo) => entrada[campo] !== undefined)) {
    throw new Error("`reanclar` solo cambia el ancla: no pases contenido (titulo, estado, que_se_hizo…).");
  }
  if (entrada.cerrar_fase === true) throw new Error("`reanclar` y `cerrar_fase` no van en la misma llamada.");
  if (entrada.verification_note !== undefined || ANCLAS.filter((campo) => entrada[campo] !== undefined).length !== 1) {
    throw new Error("Para reanclar, pasa el ancla nueva: `commit` (el SHA de después del rebase o del squash) o `artifact_path`.");
  }

  const total = lotesDelPlan(fase);
  if (entrada.lote > total) throw new Error(`El plan declara ${plural(total, "lote", "lotes")}; ${etiqueta} no existe.`);

  // El recibo está en la subcarpeta, o (con un solo lote y la fase cerrada) es el documento de la fase.
  const documento = fase.documento ? path.join(fase.carpetaTarea, fase.documento) : null;
  const hayDocumento = documento !== null && fs.existsSync(documento);
  const porLote = recibosDeLaTarea(fase);
  let existente = unicoDe(porLote, entrada.lote, fase);
  let esElDocumento = false;
  if (!existente && total === 1 && hayDocumento) {
    existente = { recibo: { ...parsearRecibo(leerTextoAcotado(documento), fase.documento!), lote: 1 }, nombre: fase.documento!, ruta: documento, mtimeMs: fs.statSync(documento).mtimeMs };
    esElDocumento = true;
  }
  if (!existente) throw new Error(`No hay recibo de ${etiqueta}: no hay ningún ancla que cambiar.`);
  const viejo = existente.recibo.ancla;
  if (viejo.tipo !== "commit" && viejo.tipo !== "sha256") {
    throw new Error(`El recibo ${etiqueta} no está sellado (${resumenDeAncla(viejo, existente.recibo.repo)}): no hace falta reanclar; regístralo con record_batch como siempre.`);
  }
  if (entrada.repo && existente.recibo.repo && entrada.repo !== existente.recibo.repo) {
    throw new Error(`El recibo de ${etiqueta} es del repo \`${existente.recibo.repo}\`, no de \`${entrada.repo}\`.`);
  }
  const repo = entrada.repo ?? existente.recibo.repo ?? (viejo.tipo === "commit" ? viejo.repo || null : null);

  let nueva: Ancla;
  let comparacion: string | null = null;
  const avisos: string[] = [];
  if (entrada.commit !== undefined) {
    if (!repo) throw new Error("Este lote no tiene repositorio: no hay commit que anclar. Pasa `artifact_path`.");
    const otros = [...porLote.entries()].flatMap(([lote, recibos]) =>
      lote === entrada.lote ? [] : recibos.flatMap((r) => (r.recibo.ancla.tipo === "commit" ? [{ lote, sha: r.recibo.ancla.sha }] : []))
    );
    const anclado = await anclarCommit(carpetaProyecto, repo, entrada.commit, existente.recibo.archivos.map((fila) => fila.archivo), otros, ahora);
    nueva = anclado.ancla;
    comparacion = anclado.verificacionDelCommit;
    if (!anclado.coinciden) avisos.push(anclado.verificacionDelCommit);
  } else {
    nueva = await anclarArtefacto(carpetaProyecto, repo, entrada.artifact_path!, ahora);
  }
  const igual =
    (viejo.tipo === "commit" && nueva.tipo === "commit" && viejo.sha === nueva.sha) ||
    (viejo.tipo === "sha256" && nueva.tipo === "sha256" && viejo.sha256 === nueva.sha256 && viejo.ruta === nueva.ruta);
  if (igual) throw new Error(`El recibo ${etiqueta} ya está anclado a \`${etiquetaDeAncla(nueva)}\`: no hay nada que cambiar.`);

  // La persona confirma; sin elicitation, decide force (Etapa 1).
  const comoEra = viejo.tipo === "commit" ? `el commit \`${viejo.corto}\`` : `el sha256 \`${viejo.sha256.slice(0, 12)}…\``;
  const comoQueda = nueva.tipo === "commit" ? `\`${nueva.corto}\`` : `el sha256 \`${(nueva as Extract<Ancla, { tipo: "sha256" }>).sha256.slice(0, 12)}…\``;
  const confirmacion = contexto.confirmar
    ? await contexto.confirmar({ mensaje: `El recibo ${etiqueta} está sellado con ${comoEra}. ¿Reemplazar su ancla por ${comoQueda}?`, etiqueta: `Reanclar ${etiqueta}` })
    : { estado: "no-disponible" as const };
  const nota = confirmacion.nota ? ` ${confirmacion.nota}` : "";
  if (confirmacion.estado === "rechazada") throw new Error(`El usuario no confirmó el cambio de ancla de ${etiqueta}. No se escribió nada.${nota}`);
  if (confirmacion.estado === "no-disponible" && entrada.force !== true) {
    throw new Error(
      `Cambiar el ancla de un recibo sellado lo decide el usuario: pídele confirmación explícita en el chat y vuelve a llamar con ` +
        `\`reanclar: true\` y force: true.${nota}`
    );
  }

  // Solo el ancla cambia; "Verificación del commit" dice la comparación del commit nuevo y guarda el
  // historial de reanclajes, con una línea más.
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
    if (fs.statSync(existente.ruta, { throwIfNoEntry: false })?.mtimeMs !== existente.mtimeMs) throw new Error(OTRO_PROCESO);
    escribirAtomico(existente.ruta, escribirRecibo(recibo, { comoDocumento: esElDocumento, idioma: fase.idioma }));

    // Con la fase cerrada y varios lotes, el índice que generó el servidor se rehace con el ancla nueva. Uno
    // escrito a mano (una tarea de la 2.x) no se toca: doctor lo marcará como desincronizado.
    if (!esElDocumento && hayDocumento && total > 1 && generadoPorElServidor(leerTextoAcotado(documento))) {
      const conNombre = new Map<number, ReciboConNombre>();
      for (const [lote, recibos] of recibosDeLaTarea(fase)) if (lote <= total && recibos.length === 1) conNombre.set(lote, recibos[0]!);
      comprobarDentro(fase, documento);
      escribirAtomico(documento, textoDelIndice(fase, total, conNombre));
      return true;
    }
    return false;
  });

  const donde = nueva.tipo === "commit" ? ` en \`${nueva.repo}\`${nueva.rama ? ` (${nueva.rama})` : ""}` : ` de \`${(nueva as Extract<Ancla, { tipo: "sha256" }>).ruta}\``;
  let texto = `${etiqueta} reanclado: \`${etiquetaDeAncla(viejo)}\` → \`${etiquetaDeAncla(nueva)}\`${donde}.${indiceRehecho ? ` Se actualizó \`${fase.documento}\`.` : ""}`;
  if (avisos.length) texto += `\nAviso: el commit no toca los archivos que declara el recibo (queda escrito en "Verificación del commit"):\n${avisos.join("\n")}`;
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

// Hasta `limite` tareas a la vez, conservando el orden de los resultados. Cada consulta de git lanza dos
// procesos (la de los filtros y la de verdad): sin tope, 99 lotes serían cientos de procesos juntos.
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

// ─── get_batch_status (§6.8) ────────────────────────────────────────────────
// Solo lee: cruza el plan (su frontmatter y su tabla) con los recibos y dice qué toca. Con `reverificar`,
// repite la verificación de cada ancla contra git y el disco.
export type FilaDeEstado = {
  lote: string;
  repo: string | null; // del plan
  objetivo: string | null; // del plan
  commitPropuesto: string | null; // del plan
  recibo: string | null;
  estado: string | null;
  ancla: { tipo: string; resumen: string } | null;
  origen: "servidor" | "manual" | null;
  vigente: boolean | null; // solo con reverificar
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

export const NO_PUDE_LEER_LA_TABLA = "No pude leer la tabla de lotes del plan.";

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
  if (!tabla) avisos.push(NO_PUDE_LEER_LA_TABLA);

  // Con un solo lote y la fase cerrada, el recibo es el documento de la fase.
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
    if (recibos.length > 1) avisos.push(`Hay ${recibos.length} recibos de ${etiquetaDeLote(lote)}: ${recibos.map((r) => `\`${relativo(r)}\``).join(", ")}. Deja uno solo.`);
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

  // Un recibo de un lote que el plan no declara (§6.8): se dice, no se usa.
  const fueraDePlan = [...porLote.entries()]
    .filter(([lote]) => lote > total)
    .sort((a, b) => a[0] - b[0])
    .flatMap(([, recibos]) => recibos.map((r) => ({ codigo: "RECIBO-FUERA-DE-PLAN" as const, recibo: relativo(r) })));

  const cerradosLotes = filas.filter((f) => f.ancla && f.ancla.tipo !== "pendiente" && f.estado !== "fallido");
  const pendiente = filas.find((f) => f.ancla?.tipo === "pendiente");
  const fallido = filas.find((f) => f.estado === "fallido");
  const sinRecibo = filas.find((f) => !f.recibo);
  const siguiente = pendiente
    ? `Ancla ${pendiente.lote}: falta registrar su commit.`
    : fallido && !faseCerrada
      ? `${fallido.lote} falló: reintenta o descártalo con \`cerrar_fase\`.`
      : sinRecibo && !faseCerrada
        ? `Implementa ${sinRecibo.lote}.`
        : faseCerrada
          ? `Todos los lotes cerrados: la Fase ${fase.numero} está cerrada.`
          : `Todos los lotes tienen recibo, pero falta \`${fase.documento}\`: llama a \`record_batch\` con \`cerrar_fase: true\` para generarlo.`;

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

function textoDeEstado(e: EstadoDeLotes, comprobar: boolean): string {
  const cabecera = ["Lote", "Repo", "Objetivo", "Commit propuesto", "Recibo", "Estado", "Ancla", "Origen", ...(comprobar ? ["Vigente"] : [])];
  const raya = (v: string | null): string => (v ? celda(v) : "—");
  const filas = e.lotes.map((f) =>
    [
      f.lote,
      raya(f.repo),
      raya(f.objetivo),
      f.commitPropuesto ? `\`${celda(f.commitPropuesto)}\`` : "—",
      f.recibo ? `\`${f.recibo}\`` : "—",
      raya(f.estado),
      f.ancla ? celda(f.ancla.resumen) : "—",
      raya(f.origen),
      ...(comprobar ? [f.vigente === null ? "—" : f.vigente ? "sí" : `no: ${celda(f.problema ?? "")}`] : []),
    ].join(" | ")
  );
  const lineas = [
    `Tarea «${e.tarea}» · plan \`${e.plan}\` · ${plural(e.declarados, "lote declarado", "lotes declarados")}, ${e.cerrados} ${e.cerrados === 1 ? "cerrado" : "cerrados"}.`,
    `Siguiente: ${e.siguiente}`,
    "",
    `| ${cabecera.join(" | ")} |`,
    `|${cabecera.map(() => "---").join("|")}|`,
    ...filas.map((f) => `| ${f} |`),
  ];
  if (e.fueraDePlan.length) {
    lineas.push("", "Recibos fuera del plan:", ...e.fueraDePlan.map((f) => `- ${f.codigo}: \`${f.recibo}\` (el plan declara ${plural(e.declarados, "lote", "lotes")}).`));
  }
  if (e.avisos.length) lineas.push("", "Avisos:", ...e.avisos.map((a) => `- ${a}`));
  return lineas.join("\n");
}

// ─── Los commits de la Fase 4, para el auditor de la Fase 5 (§6.8) ──────────
// Al entregar el prompt de la fase siguiente a la de los lotes, el servidor verifica cada ancla y le da
// al auditor los commits por repo, si son consecutivos y el rango exacto para auditarlos. El auditor ya
// no los reconstruye de los recibos.
export const PLAZO_DE_COMMITS_MS = 15_000;

export async function bloqueDeCommits(carpetaProyecto: string, carpetaTarea: string, phases: Map<number, PhaseFile>): Promise<string | null> {
  let fase: FaseDeLotes;
  let total: number;
  try {
    fase = faseEnCarpeta(carpetaTarea, phases);
    total = lotesDelPlan(fase);
  } catch {
    return null; // sin fase de lotes o sin plan con lotes no hay nada que listar
  }
  let porLote: Map<number, ReciboEnDisco[]>;
  try {
    porLote = recibosDeLaTarea(fase);
  } catch (error) {
    // Sin el bloque, la regla 1 de la Fase 5 manda a preguntar: que se sepa por qué.
    return `## COMMITS DE LA FASE ${fase.numero}\n\nNo se pudieron leer los recibos: ${error instanceof Error ? error.message : String(error)} Arréglalo (o usa \`get_batch_status\`) antes de auditar.`;
  }
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
    if (!recibo) fuera.push(`- ${etiqueta}: sin recibo.`);
    else if (recibo.estado === "descartado" || recibo.estado === "fallido") {
      const motivo = recibo.ancla.tipo === "nota" ? ` («${recibo.ancla.texto.replace(/\s+/g, " ").trim()}»)` : "";
      fuera.push(`- ${etiqueta}: ${recibo.estado}${motivo}.`);
    } else if (recibo.ancla.tipo === "pendiente") fuera.push(`- ${etiqueta}: el commit sigue pendiente.`);
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
    // Varios a la vez, con tope: con 40 lotes, uno detrás de otro se comía casi todo el plazo (hallazgo 7
    // de la auditoría de la Etapa 4). reverificar ya devuelve el SHA completo: no se resuelve dos veces.
    const resultados = await enParalelo(recibos, VERIFICACIONES_A_LA_VEZ, async (recibo) => {
      const ancla = recibo.ancla as Extract<Ancla, { tipo: "commit" }>;
      const comprobacion = await reverificar(carpetaProyecto, recibo);
      let asunto = ancla.asunto;
      if (!asunto && dir && comprobacion.vigente) {
        try {
          asunto = (await datosDeCommit(dir, comprobacion.sha ?? ancla.sha)).asunto; // un recibo manual de la 2.x no lo guarda
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
        `| ${etiquetaDeLote(recibo.lote)} | \`${ancla.corto || ancla.sha.slice(0, 7)}\` | ${celda(asunto) || "—"} | ${comprobacion.vigente ? "sí" : `no: ${celda(comprobacion.texto)}`} |`
    );

    const lineas = [`### Repo \`${repo}\`${rama ? ` (rama ${rama})` : ""}`, "| Lote | Commit | Asunto | Vigente |", "|---|---|---|---|", ...filas, ""];
    const cortos = recibos.map((r) => (r.ancla as Extract<Ancla, { tipo: "commit" }>).corto);
    if (dir && vigentes.length === recibos.length) {
      const primero = cortos[0]!;
      const ultimo = cortos[cortos.length - 1]!;
      if (recibos.length === 1) lineas.push(`Rango para auditar: \`git show ${primero}\`.`);
      else if (await sonConsecutivos(dir, vigentes)) {
        lineas.push(
          (await tienePadre(dir, vigentes[0]!))
            ? `Son consecutivos en la rama. Rango para auditar: \`git log --oneline ${primero}^..${ultimo}\` y \`git diff ${primero}^ ${ultimo}\`.`
            : `Son consecutivos en la rama, desde el primer commit del repo. Rango para auditar: \`git log --oneline ${ultimo}\` y \`git log -p --reverse ${ultimo}\`.`
        );
      } else {
        lineas.push(`No son consecutivos: audita cada commit con \`git show <sha>\` (${cortos.map((c) => `\`${c}\``).join(", ")}).`);
      }
    } else {
      lineas.push("Audita cada commit vigente con `git show <sha>`.");
    }
    secciones.push(lineas.join("\n"));
  }

  if (sinCommit.length) {
    const filas = await enParalelo(sinCommit, VERIFICACIONES_A_LA_VEZ, async (recibo) => {
      const ancla = recibo.ancla;
      if (ancla.tipo === "sha256") {
        const comprobacion = await reverificar(carpetaProyecto, recibo);
        if (!comprobacion.vigente) hayNoVigentes = true;
        return `| ${etiquetaDeLote(recibo.lote)} | sha256 \`${ancla.sha256.slice(0, 8)}…\` de \`${ancla.ruta}\` | ${comprobacion.vigente ? "sí" : `no: ${celda(comprobacion.texto)}`} |`;
      }
      return `| ${etiquetaDeLote(recibo.lote)} | nota: ${ancla.tipo === "nota" ? celda(ancla.texto) : ""} | no aplica |`;
    });
    secciones.push(["### Sin commit", "| Lote | Ancla | Vigente |", "|---|---|---|", ...filas].join("\n"));
  }
  if (fuera.length) secciones.push(["### Lotes que no entran en la auditoría", ...fuera].join("\n"));
  if (hayNoVigentes) secciones.push("Hay anclas que ya no corresponden a la rama: díselo al usuario antes de auditar.");

  return [`## COMMITS DE LA FASE ${fase.numero} (verificados por el servidor al entregar este prompt)`, ...secciones].join("\n\n");
}

// El bloque con un plazo: si git no responde, el prompt se entrega igual y lo dice, con el mismo encabezado.
export async function bloqueDeCommitsConPlazo(carpetaProyecto: string, carpetaTarea: string, phases: Map<number, PhaseFile>, plazoMs = PLAZO_DE_COMMITS_MS): Promise<string | null> {
  let numero: number | string = "anterior";
  try {
    numero = faseEnCarpeta(carpetaTarea, phases).numero;
  } catch {
    // sin fase de lotes, bloqueDeCommits devuelve null enseguida
  }
  let temporizador: NodeJS.Timeout | undefined;
  const vencido = new Promise<string>((resolver) => {
    temporizador = setTimeout(
      () => resolver(`## COMMITS DE LA FASE ${numero}\n\nNo se pudieron verificar a tiempo (${plazoMs / 1000} s). Usa \`get_batch_status\` con \`reverificar\` antes de auditar.`),
      plazoMs
    );
    temporizador.unref();
  });
  try {
    return await Promise.race([bloqueDeCommits(carpetaProyecto, carpetaTarea, phases), vencido]);
  } finally {
    clearTimeout(temporizador);
  }
}

// El primer lote sin recibo cerrado (ancla distinta de pendiente), o null si no queda ninguno.
export function siguienteLote(recibos: Map<number, Recibo | ReciboEnDisco[]>, total: number): number | null {
  for (let lote = 1; lote <= total; lote++) {
    const valor = recibos.get(lote);
    const deEste = valor === undefined ? [] : Array.isArray(valor) ? valor.map((r) => r.recibo) : [valor];
    if (deEste.length === 0 || deEste.some((r) => r.ancla.tipo === "pendiente")) return lote;
  }
  return null;
}
