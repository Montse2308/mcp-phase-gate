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

import { anclarArtefacto, anclarCommit } from "./anclas.js";
import { configuracionDe, fasesDe, reposDeLaTarea } from "./capas.js";
import { DOCS, requireBasePath } from "./config.js";
import type { ResultadoConfirmacion } from "./confirmacion.js";
import { ramaActual, tieneGit } from "./git.js";
import { estaDentroReal, leerTextoAcotado, taskFolderPath } from "./paths.js";
import { separarFrontmatter } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { GENERADO_POR, celda, escribirRecibo, etiquetaDeLote, leerRecibo, loteDelNombre, nombreDeRecibo } from "./recibos.js";
import type { Ancla, EstadoLote, Recibo, TituloCondicional } from "./recibos.js";
import { resolverRepo } from "./repos.js";

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
};

export function faseEnCarpeta(carpetaTarea: string, phases: Map<number, PhaseFile>, nombreDelProyecto = ""): FaseDeLotes {
  const taskName = path.basename(carpetaTarea);
  const conRecibos = [...phases.entries()].sort((a, b) => a[0] - b[0]).find(([, datos]) => datos.recibos);
  if (!conRecibos) throw new Error(`Ninguna fase ${nombreDelProyecto ? `de ${nombreDelProyecto} ` : ""}declara una subcarpeta de recibos (\`recibos:\` en su frontmatter): no hay lotes que registrar.`);
  const [numero, datos] = conRecibos;
  const anterior = [...phases.entries()].filter(([n, d]) => n < numero && d.documento).sort((a, b) => b[0] - a[0])[0];
  if (!anterior) throw new Error(`La Fase ${numero} no tiene una fase anterior con documento: no hay plan del que leer los lotes.`);
  return { taskName, carpetaTarea, phases, numero, titulo: datos.title, recibos: datos.recibos!, documento: datos.documento ?? null, plan: anterior[1].documento! };
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
  const valor = separarFrontmatter(textoDelPlan(fase)).meta.lotes;
  if (valor === undefined || valor.trim() === "") {
    throw new Error(`El plan no declara \`lotes: N\` en su frontmatter. Añádelo a \`${fase.plan}\` antes del primer recibo.`);
  }
  const n = Number(valor.trim());
  if (!/^\d+$/.test(valor.trim()) || n < 1 || n > 99) {
    throw new Error(`El frontmatter de \`${fase.plan}\` dice \`lotes: ${valor.trim()}\`, y tiene que ser un número entero de 1 a 99.`);
  }
  return n;
}

// La tabla de lotes del plan (§3.5.1): la que empieza por `| Lote | Repo |`, y sus filas `L\d\d`. Solo
// informa (el objetivo de un lote que se descarta, las columnas de get_batch_status): el número de lotes
// nunca sale de aquí. null si no hay tabla o no se entiende.
export type FilaDelPlan = { repo: string; objetivo: string; commitPropuesto: string };

export function leerTablaDeLotes(texto: string): Map<number, FilaDelPlan> | null {
  const lineas = separarFrontmatter(texto).cuerpo.split("\n");
  const partir = (linea: string): string[] =>
    linea.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

  const inicio = lineas.findIndex((linea) => /^\|\s*Lote\s*\|\s*Repo\s*\|/i.test(linea.trim()));
  if (inicio === -1) return null;
  const cabecera = partir(lineas[inicio]!).map((c) => c.normalize("NFC").toLowerCase());
  const columna = (nombre: string) => cabecera.indexOf(nombre);
  const [cRepo, cObjetivo, cCommit] = [columna("repo"), columna("objetivo"), columna("commit propuesto")];
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

function anclaEnIndice(recibo: Recibo): string {
  if (recibo.estado === "descartado") return "—";
  const ancla = recibo.ancla;
  if (ancla.tipo === "commit") return `commit \`${ancla.corto}\``;
  if (ancla.tipo === "sha256") return `sha256 \`${ancla.sha256.slice(0, 8)}…\``;
  return ancla.tipo === "nota" ? "nota" : "pendiente";
}

function primeraLinea(texto: string): string {
  return (texto.split("\n").find((linea) => linea.trim()) ?? "").trim().replace(/\.+$/, "");
}

// Determinista: los mismos recibos dan los mismos bytes. La fecha de cierre es la del recibo escrito
// más tarde, no la hora del ensamblado.
export type ReciboConNombre = { recibo: Recibo; nombre: string };

export function textoDelIndice(fase: FaseDeLotes, total: number, conNombre: Map<number, ReciboConNombre>): string {
  const lotes = [...Array(total).keys()].map((i) => i + 1);
  const recibos = new Map([...conNombre].map(([n, { recibo }]) => [n, recibo]));
  const presentes = lotes.map((n) => recibos.get(n)).filter((r): r is Recibo => r !== undefined);
  const conRepo = presentes.some((r) => r.repo);

  const ramas = new Set(presentes.filter((r) => r.ancla.tipo === "commit").map((r) => r.rama ?? ""));
  const rama = ramas.size === 0 ? "—" : ramas.size === 1 ? [...ramas][0] || "—" : "varias (ver lotes)";
  const ultimo = [...presentes].sort((a, b) => (a.registrado || a.fecha).localeCompare(b.registrado || b.fecha)).pop();

  const espera = presentes.flatMap((r) => r.esperaAlUsuario.map((fila) => ({ lote: r.lote, ...fila })));
  const abiertos = presentes.filter((r) => r.estado === "con pendientes" || r.estado === "fallido");
  const descartados = presentes.filter((r) => r.estado === "descartado").length;
  const limpio = presentes.every((r) => r.estado === "verificado" || r.estado === "descartado") && espera.length === 0;
  let estado = limpio ? "Fase cerrada sin pendientes" : "Fase cerrada con pendientes (ver abajo)";
  if (descartados) estado += ` · ${plural(descartados, "lote descartado", "lotes descartados")}`;

  const cabecera = conRepo ? "| Lote | Repo | Objetivo | Estado | Ancla | Recibo |\n|---|---|---|---|---|---|" : "| Lote | Objetivo | Estado | Ancla | Recibo |\n|---|---|---|---|---|";
  const filas = lotes.map((n) => {
    const r = recibos.get(n);
    const celdas = r
      ? [etiquetaDeLote(n), ...(conRepo ? [r.repo ?? "—"] : []), celda(r.titulo), r.estado, anclaEnIndice(r), `\`${fase.recibos}/${conNombre.get(n)!.nombre}\``]
      : [etiquetaDeLote(n), ...(conRepo ? ["—"] : []), "—", "sin recibo", "—", "—"];
    return `| ${celdas.join(" | ")} |`;
  });

  const partes = [
    `---\nlotes: ${total}\ngenerado_por: ${GENERADO_POR}\n---`,
    `# ${fase.titulo} — ${fase.taskName}`,
    `- **Plan:** \`${fase.plan}\` · **Rama:** ${rama} · **Cierre:** ${ultimo?.fecha || "—"}\n- **Estado:** ${estado}`,
    `## Lotes\n${cabecera}\n${filas.join("\n")}`,
  ];
  if (espera.length) {
    partes.push(
      `## Espera al usuario\n| Lote | Prueba | Resultado esperado |\n|---|---|---|\n${espera.map((f) => `| ${etiquetaDeLote(f.lote)} | ${celda(f.prueba)} | ${celda(f.esperado)} |`).join("\n")}`
    );
  }
  if (abiertos.length) {
    partes.push(
      `## Validaciones pendientes\n${abiertos.map((r) => `- ${etiquetaDeLote(r.lote)} (${r.estado}): ${primeraLinea(r.verificacion) || "sin verificación registrada"}.`).join("\n")}`
    );
  }
  return `${partes.join("\n\n")}\n`;
}

// El índice de una tarea tal como lo escribiría hoy el servidor, leyendo sus recibos.
export function ensamblarIndice(carpetaTarea: string, fases: Map<number, PhaseFile>): string {
  const fase = faseEnCarpeta(carpetaTarea, fases);
  const total = lotesDelPlan(fase);
  const recibos = new Map<number, ReciboConNombre>();
  for (const [lote, deEste] of recibosDeLaTarea(fase)) if (lote <= total && deEste.length === 1) recibos.set(lote, deEste[0]!);
  return textoDelIndice(fase, total, recibos);
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
    case "commit":
      return `commit ${ancla.corto} en \`${ancla.repo || repo}\`${ancla.rama ? ` (${ancla.rama})` : ""}`;
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
    throw new Error(`El recibo ${etiqueta} está sellado con ${con} y no se reescribe.`);
  }
  if (ancla.tipo === "pendiente") {
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
    return entrada.repo ?? delRecibo;
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
  fs.writeFileSync(temporal, contenido, "utf-8");
  try {
    fs.renameSync(temporal, ruta);
  } catch (error) {
    borrarArchivo(temporal);
    throw error;
  }
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
    ancla = { tipo: "nota", texto: entrada.verification_note ?? `no aplica (lote ${estado})` };
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
    ancla,
    fecha: fechaLocal(momento),
    registrado: momento.toISOString(),
    origen: "servidor",
    verificacionDelCommit,
  };
  return { recibo, nombre: nombreDeRecibo(entrada.lote, recibo.titulo), existente, avisos };
}

// El recibo de un lote que se cierra sin hacerse (cerrar_fase), con el objetivo que le dio el plan.
function reciboDescartado(lote: number, total: number, motivo: string, fila: FilaDelPlan | undefined, ids: string[], momento: Date): Recibo {
  const repo = fila && ids.includes(fila.repo) ? fila.repo : null;
  return {
    lote,
    de: total,
    titulo: fila?.objetivo || `Lote ${lote}`,
    repo,
    rama: null,
    estado: "descartado",
    ancla: { tipo: "nota", texto: motivo },
    fecha: fechaLocal(momento),
    registrado: momento.toISOString(),
    origen: "servidor",
    queSeHizo: "No se hizo: se descartó al cerrar la fase.",
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

  // Con el documento de la fase escrito, la fase está cerrada; con una fase posterior, también.
  for (const [numero, datos] of [...fase.phases.entries()].sort((a, b) => a[0] - b[0])) {
    if (numero >= fase.numero && datos.documento && fs.existsSync(path.join(fase.carpetaTarea, datos.documento))) {
      throw new Error(`La Fase ${fase.numero} ya está cerrada (existe \`${datos.documento}\`): no se registran más lotes.`);
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
        const recibo = reciboDescartado(lote, total, entrada.motivo_descarte!, tabla.get(lote), ids, ahora());
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

  // Otro proceso pudo escribir mientras se verificaba el ancla (dos ventanas registrando el mismo lote).
  const ahoraEnDisco = recibosDeLaTarea(fase);
  if (preparado?.existente) {
    if (fs.statSync(preparado.existente.ruta, { throwIfNoEntry: false })?.mtimeMs !== preparado.existente.mtimeMs) throw new Error(OTRO_PROCESO);
  }
  for (const lote of [...(preparado && !preparado.existente ? [entrada.lote] : []), ...descartes.map((r) => r.lote)]) {
    if ((ahoraEnDisco.get(lote) ?? []).length > 0) throw new Error(OTRO_PROCESO);
  }

  fs.mkdirSync(carpeta, { recursive: true });
  let archivoNuevo = descartes.length > 0;
  if (preparado) {
    const ruta = path.join(carpeta, preparado.nombre);
    escribirAtomico(ruta, escribirRecibo(preparado.recibo));
    // Si cambió el título, el archivo cambia de nombre. En Windows y macOS un cambio solo de mayúsculas es
    // el mismo archivo, que el renombrado ya reemplazó: borrarlo borraría el nuevo.
    const viejo = preparado.existente;
    if (viejo && viejo.nombre !== preparado.nombre && fs.existsSync(viejo.ruta) && !mismoArchivo(viejo.ruta, ruta)) borrarArchivo(viejo.ruta);
    archivoNuevo ||= !viejo || viejo.nombre !== preparado.nombre;
  }
  for (const recibo of descartes) escribirAtomico(rutaDe(recibo.lote, recibo.titulo), escribirRecibo(recibo));

  // ─── Cierre: todos los lotes con ancla, y ninguno fallido; o cerrar_fase ───
  const lotes = [...Array(total).keys()].map((i) => i + 1);
  const cierra = fase.documento !== null && (entrada.cerrar_fase === true ? lotes.every((n) => cerrado(finales.get(n))) : lotes.every((n) => cierraLaFase(finales.get(n))));
  let documentoDeFase: string | null = null;
  if (cierra) {
    const destino = path.join(fase.carpetaTarea, fase.documento!);
    comprobarDentro(fase, destino);
    if (total === 1) {
      // H2: con un solo lote, su recibo se mueve y pasa a ser el documento de la fase.
      escribirAtomico(destino, escribirRecibo(finales.get(1)!, { comoDocumento: true }));
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

// El primer lote sin recibo cerrado (ancla distinta de pendiente), o null si no queda ninguno.
export function siguienteLote(recibos: Map<number, Recibo | ReciboEnDisco[]>, total: number): number | null {
  for (let lote = 1; lote <= total; lote++) {
    const valor = recibos.get(lote);
    const deEste = valor === undefined ? [] : Array.isArray(valor) ? valor.map((r) => r.recibo) : [valor];
    if (deEste.length === 0 || deEste.some((r) => r.ancla.tipo === "pendiente")) return lote;
  }
  return null;
}
