// El motor de lotes de la Fase 4 (§6.4 del plan maestro v3): record_batch registra cada lote en un
// recibo que escribe el servidor, con su ancla verificada.
//
// Dos tiempos para toda política con git (decisión H1): primero el recibo con el commit pendiente,
// ANTES del commit, para que sobreviva a un corte del chat; después, con el hash, el ancla. Si el
// commit ya existe al registrar el lote, va todo en una llamada.
//
// El servidor solo escribe dentro de la subcarpeta de recibos de la tarea, con escritura atómica, y
// nunca en git: el commit lo hace el agente, aquí solo se lee para verificarlo.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { anclarArtefacto, anclarCommit } from "./anclas.js";
import { configuracionDe, fasesDe, reposDeLaTarea } from "./capas.js";
import { ramaActual, tieneGit } from "./git.js";
import { estaDentroReal, leerTextoAcotado, taskFolderPath } from "./paths.js";
import { separarFrontmatter } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { escribirRecibo, etiquetaDeLote, leerRecibo, loteDelNombre, nombreDeRecibo } from "./recibos.js";
import type { Ancla, EstadoLote, Recibo, TituloCondicional } from "./recibos.js";
import { resolverRepo } from "./repos.js";

// ─── La tarea y su plan ─────────────────────────────────────────────────────
export type FaseDeLotes = {
  carpetaProyecto: string;
  taskName: string;
  carpetaTarea: string;
  phases: Map<number, PhaseFile>;
  numero: number; // la fase que declara los recibos (la 4)
  recibos: string; // su subcarpeta
  documento: string | null; // su documento, el que la cierra
  plan: string; // el documento de la fase anterior (el plan técnico)
};

export function faseDeLotes(carpetaProyecto: string, taskName: string): FaseDeLotes {
  const carpetaTarea = taskFolderPath(carpetaProyecto, taskName);
  if (!fs.statSync(carpetaTarea, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`No existe la tarea "${taskName}" en ${carpetaProyecto}. Para una tarea nueva, usa start_task.`);
  }
  const phases = fasesDe(carpetaProyecto);
  const conRecibos = [...phases.entries()].sort((a, b) => a[0] - b[0]).find(([, datos]) => datos.recibos);
  if (!conRecibos) throw new Error(`Ninguna fase de ${carpetaProyecto} declara una subcarpeta de recibos (\`recibos:\` en su frontmatter): no hay lotes que registrar.`);
  const [numero, datos] = conRecibos;
  const anterior = [...phases.entries()]
    .filter(([n, d]) => n < numero && d.documento)
    .sort((a, b) => b[0] - a[0])[0];
  if (!anterior) throw new Error(`La Fase ${numero} no tiene una fase anterior con documento: no hay plan del que leer los lotes.`);
  return { carpetaProyecto, taskName, carpetaTarea, phases, numero, recibos: datos.recibos!, documento: datos.documento ?? null, plan: anterior[1].documento! };
}

// H3: el número de lotes sale SOLO del frontmatter del plan, nunca de su tabla.
export function lotesDelPlan(fase: FaseDeLotes): number {
  const ruta = path.join(fase.carpetaTarea, fase.plan);
  if (!fs.existsSync(ruta)) throw new Error(`La tarea "${fase.taskName}" todavía no tiene \`${fase.plan}\`: la Fase ${fase.numero} ejecuta los lotes de ese plan.`);
  const valor = separarFrontmatter(leerTextoAcotado(ruta)).meta.lotes;
  if (valor === undefined || valor.trim() === "") {
    throw new Error(`El plan no declara \`lotes: N\` en su frontmatter. Añádelo a \`${fase.plan}\` antes del primer recibo.`);
  }
  const n = Number(valor.trim());
  if (!/^\d+$/.test(valor.trim()) || n < 1 || n > 99) {
    throw new Error(`El frontmatter de \`${fase.plan}\` dice \`lotes: ${valor.trim()}\`, y tiene que ser un número entero de 1 a 99.`);
  }
  return n;
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
};

export type ContextoDeLote = {
  ahora?: () => Date;
  // Justo antes de escribir: el servidor comprueba aquí que el cliente no haya cancelado la llamada.
  antesDeEscribir?: () => void;
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
// no acaba en .md, así que nadie lo toma por un recibo.
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

export async function registrarLote(carpetaProyecto: string, taskName: string, entrada: EntradaDeLote, contexto: ContextoDeLote = {}): Promise<ResultadoDeLote> {
  const ahora = contexto.ahora ?? (() => new Date());
  const fase = faseDeLotes(carpetaProyecto, taskName);
  const etiqueta = etiquetaDeLote(entrada.lote);

  // Con el documento de la fase escrito, la fase está cerrada; con una fase posterior, también.
  for (const [numero, datos] of [...fase.phases.entries()].sort((a, b) => a[0] - b[0])) {
    if (numero >= fase.numero && datos.documento && fs.existsSync(path.join(fase.carpetaTarea, datos.documento))) {
      throw new Error(`La Fase ${fase.numero} ya está cerrada (existe \`${datos.documento}\`): no se registran más lotes.`);
    }
  }

  const total = lotesDelPlan(fase);
  if (entrada.lote > total) {
    throw new Error(
      `El plan declara ${total} ${total === 1 ? "lote" : "lotes"}; ${etiqueta} no existe. Si el plan cambió, actualiza su frontmatter: el plan ya está ` +
        "congelado, así que hará falta la confirmación del usuario, y el cambio va como decisión en los Desvíos del recibo."
    );
  }

  const porLote = recibosDeLaTarea(fase);
  // Orden: todos los anteriores tienen recibo con ancla (un fallido o un descartado cuenta como cerrado).
  for (let anterior = 1; anterior < entrada.lote; anterior++) {
    const suyo = unicoDe(porLote, anterior, fase);
    if (!suyo) throw new Error(`Antes de ${etiqueta} hay que cerrar ${etiquetaDeLote(anterior)}: le falta el recibo.`);
    if (suyo.recibo.ancla.tipo === "pendiente") throw new Error(`Antes de ${etiqueta} hay que cerrar ${etiquetaDeLote(anterior)}: su commit sigue pendiente.`);
  }

  const existente = unicoDe(porLote, entrada.lote, fase);
  const anclas = (["commit", "artifact_path", "verification_note"] as const).filter((campo) => entrada[campo] !== undefined);
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

  // ─── Escritura ───
  const carpeta = carpetaDeRecibos(fase);
  const nombre = nombreDeRecibo(entrada.lote, recibo.titulo);
  const ruta = path.join(carpeta, nombre);
  const tipoDeCarpeta = fs.lstatSync(carpeta, { throwIfNoEntry: false });
  if (tipoDeCarpeta && !fs.statSync(carpeta).isDirectory()) throw new Error(`\`${fase.recibos}\` existe en la tarea y no es una carpeta.`);
  if (!estaDentroReal(fase.carpetaTarea, ruta)) throw new Error(`Acceso denegado: \`${fase.recibos}/\` lleva fuera de la carpeta de la tarea.`);

  contexto.antesDeEscribir?.();

  // Otro proceso pudo escribir mientras se verificaba el ancla (dos ventanas registrando el mismo lote).
  if (existente) {
    if (fs.statSync(existente.ruta, { throwIfNoEntry: false })?.mtimeMs !== existente.mtimeMs) throw new Error(OTRO_PROCESO);
  } else if ((recibosDeLaTarea(fase).get(entrada.lote) ?? []).length > 0) {
    throw new Error(OTRO_PROCESO);
  }

  fs.mkdirSync(carpeta, { recursive: true });
  escribirAtomico(ruta, escribirRecibo(recibo));
  // Si cambió el título, el archivo cambia de nombre. En Windows y macOS un cambio solo de mayúsculas es
  // el mismo archivo, que el renombrado ya reemplazó: borrarlo borraría el nuevo.
  if (existente && existente.nombre !== nombre && fs.existsSync(existente.ruta) && !mismoArchivo(existente.ruta, ruta)) borrarArchivo(existente.ruta);

  // ─── Respuesta ───
  const relativo = `${fase.recibos}/${nombre}`;
  const siguiente = siguienteLote(recibosDeLaTarea(fase), total);
  const cabecera = `${etiqueta} de ${total} registrado`;
  let texto: string;
  if (ancla.tipo === "pendiente") {
    texto = `${cabecera} con el commit pendiente. Cuando exista, llama de nuevo a \`record_batch\` con \`lote: ${entrada.lote}\` y \`commit\`.`;
  } else if (estado === "fallido") {
    texto = `${cabecera}: fallido. No hagas su commit: detente y pregúntale al usuario si se reintenta o se descarta.`;
  } else {
    texto = `${cabecera}: ${estado} · ${resumenDeAncla(ancla, repo)}. ${siguiente ? `Siguiente: ${etiquetaDeLote(siguiente)}.` : "No quedan lotes por registrar."}`;
  }
  if (avisos.length) texto += `\nAviso: el commit no toca los archivos que declara el recibo (queda escrito en "Verificación del commit"):\n${avisos.join("\n")}`;

  return {
    texto,
    salida: {
      recibo: relativo,
      lote: etiqueta,
      de: total,
      estado,
      ancla: { tipo: ancla.tipo, resumen: resumenDeAncla(ancla, repo) },
      avisos,
      siguiente: siguiente ? etiquetaDeLote(siguiente) : null,
      faseCerrada: false,
      documentoDeFase: null,
    },
    archivoNuevo: !existente || existente.nombre !== nombre,
  };
}

// El primer lote sin recibo cerrado (ancla distinta de pendiente), o null si no queda ninguno.
export function siguienteLote(porLote: Map<number, ReciboEnDisco[]>, total: number): number | null {
  for (let lote = 1; lote <= total; lote++) {
    const recibos = porLote.get(lote) ?? [];
    if (recibos.length === 0 || recibos.some((r) => r.recibo.ancla.tipo === "pendiente")) return lote;
  }
  return null;
}
