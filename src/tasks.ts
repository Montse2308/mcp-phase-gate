// Tareas: cuáles existen, en qué fase va cada una, y cuál es la activa de cada proyecto.
//
// La idea central: **la carpeta es el registro**. Las tareas son las carpetas que existen y la
// fase de cada una se deduce de los documentos que hay dentro, porque cada fase declara en su
// cabecera cómo se llama el suyo. No hay un archivo que liste tareas ni que apunte fases.
//
// Guardar esa información sería tener dos copias de la misma verdad, y la copia guardada
// dependería de que el modelo se acordara de reportar cada avance. Deducirla del disco la
// vuelve un hecho: si borras un documento a mano porque quedó mal, la fase baja sola.
//
// Lo único que sí se guarda es un puntero por proyecto —cuál es la tarea activa—, porque eso
// el disco no lo puede saber. Antes era un solo puntero global y dos ventanas abiertas a la
// vez se lo pisaban: la ventana A preguntaba dónde estaba y le contestaban la tarea de B.

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

// ─── Puntero de tarea activa, por proyecto ──────────────────────────────────
// Forma del archivo: { "proyecto-a": "login-sso", "proyecto-b": "reporte-comisiones" }
// La clave es el nombre del proyecto en minúsculas; el valor, el nombre de la carpeta de tarea.
export type Punteros = Record<string, string>;

export function leerPunteros(): Punteros {
  const archivo = stateFile();
  if (!fs.existsSync(archivo)) return {};

  try {
    const crudo = JSON.parse(fs.readFileSync(archivo, "utf-8"));
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return {};

    // Se filtra en vez de confiar: el archivo lo puede haber tocado cualquiera, y una entrada
    // con forma rara no debe tumbar las demás.
    const punteros: Punteros = {};
    for (const [proyecto, tarea] of Object.entries(crudo)) {
      if (typeof tarea === "string" && tarea.trim()) punteros[proyecto.toLowerCase()] = tarea;
    }
    return punteros;
  } catch {
    // Un archivo ilegible no debe dejar al usuario sin servicio: se ignora y el sistema cae
    // en la deducción, que da una respuesta razonable sin necesitar estado guardado.
    return {};
  }
}

export function guardarPuntero(project: string, taskName: string): void {
  const punteros = leerPunteros(); // se relee justo antes de escribir: otra ventana pudo cambiarlo
  punteros[project.toLowerCase()] = taskName;
  escribirPunteros(punteros);
}

// Escribe a un temporal y renombra. El renombrado es atómico dentro del mismo sistema de
// archivos, así que un corte a media escritura no deja el archivo a medias: o está el de
// antes, o está el nuevo. Importa porque ahora son varias ventanas escribiendo el mismo
// archivo, y antes cada escritura era un objeto suelto que se sobrescribía entero.
//
// Queda una ventana mínima entre leer y escribir en la que dos procesos simultáneos podrían
// perder el puntero del otro. No se bloquea el archivo a propósito: el costo de perder un
// puntero es un `switch_task`, y un lock mal soltado deja el servidor inservible.
function escribirPunteros(punteros: Punteros): void {
  const archivo = stateFile();
  const temporal = `${archivo}.tmp`;

  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(temporal, JSON.stringify(punteros, null, 2), "utf-8");
  fs.renameSync(temporal, archivo);
}

// El formato anterior guardaba una sola tarea activa global en `active_task.json`. Ya no se
// puede leer —cambió de forma— y conservarlo solo deja basura en la carpeta de datos, así
// que se borra la primera vez que arranca esta versión.
export function limpiarEstadoViejo(): void {
  const viejos = [path.join(stateDir(), "active_task.json"), path.join(MODULE_DIR, "active_task.json")];

  for (const viejo of viejos) {
    try {
      if (fs.existsSync(viejo)) {
        fs.unlinkSync(viejo);
        log("info", mensaje("TAREA-ESTADO-VIEJO-ELIMINADO", { ruta: viejo }));
      }
    } catch {
      // Que no se pueda borrar no impide trabajar: el archivo viejo ya no se lee.
    }
  }
}

// ─── Estado deducido de una tarea ───────────────────────────────────────────
// El progreso dentro de la fase que ejecuta por lotes (la 4), deducido de archivos que escribe el
// servidor: el frontmatter del plan y el de cada recibo.
export type ProgresoDeLotes = {
  total: number | null;            // del frontmatter del plan; null si el plan no lo declara
  cerrados: number;                // recibos con ancla distinta de pendiente (un fallido no cuenta)
  actual: number | null;           // primer lote sin recibo cerrado
  pendienteDeCommit: number | null; // lote con recibo y commit pendiente
};

export type EstadoTarea = {
  taskName: string;
  folderPath: string;
  fasesHechas: number[];
  siguienteFase: number | null;  // null = ya no queda ninguna fase con documento pendiente
  fasesConDocumento: number;     // 0 = no hay nada que deducir (ningún prompt declara documento)
  ultimoCambio: number | null;   // mtime del documento o recibo más reciente, para ordenar por actividad
  lotes: ProgresoDeLotes | null; // solo cuando la fase siguiente es la que declara recibos
};

function esLoteCerrado(cabecera: { estado: string; ancla: string }): boolean {
  return cabecera.ancla !== "pendiente" && cabecera.estado !== "fallido";
}

// Lee solo frontmatter: el `lotes` del plan y la cabecera de cada recibo. Un archivo ilegible no
// cuenta; el progreso es una ayuda para el chat, no una condición.
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
      // un recibo que no se puede leer no suma; doctor lo dice
    }
  }

  const cerradoEl = (lote: number) => (porLote.get(lote) ?? []).some(esLoteCerrado);
  // Un recibo de un lote que el plan no declara no es el lote "actual" (doctor lo marca fuera de plan).
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

// La fase que declara recibos y el documento de la anterior (su plan).
function faseDeRecibos(phases: Map<number, PhaseFile>): { numero: number; recibos: string; plan: string | null } | null {
  const ordenadas = [...phases.entries()].sort((a, b) => a[0] - b[0]);
  const conRecibos = ordenadas.find(([, datos]) => datos.recibos);
  if (!conRecibos) return null;
  const plan = ordenadas.filter(([n, d]) => n < conRecibos[0] && d.documento).pop();
  return { numero: conRecibos[0], recibos: conRecibos[1].recibos!, plan: plan ? plan[1].documento! : null };
}

// Mira qué documentos existen en la carpeta y traduce eso a fases hechas y fase siguiente.
// Solo cuentan las fases que declaran documento: una fase sin documento no puede completarse
// y, si contara, dejaría la deducción atascada en ella para siempre.
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
      // Si no se puede leer la fecha, la tarea sigue contando como avanzada; solo pierde
      // precisión al ordenarla por actividad.
    }
  }

  // Los recibos también son actividad: durante la Fase 4 son lo único que cambia en días.
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
      // sin subcarpeta de recibos no hay nada que mirar
    }
  }

  // Sin ningún documento todavía, la carpeta recién creada por start_task marca la actividad.
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

// ─── Documentos congelados ──────────────────────────────────────────────────
// Un documento de fase se congela en cuanto una fase posterior está presente: reescribirlo
// después cambiaría la base sobre la que esa fase ya trabajó, sin que nada lo avise. Se puede
// reescribir con force, que el modelo solo usa con la confirmación explícita del usuario.
//
// Una fase está presente si existe su documento, o si declara recibos y su subcarpeta tiene al
// menos un .md: con varios lotes, la Fase 4 está en curso mucho antes de escribir su documento.
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

// Los nombres protegidos se comparan por su clave (claveDeNombre) y no como texto exacto. Sin
// ella un archivo nuevo esquivaba la protección: `00 - contexto inicial.md` o
// `04 - ejecución/L01 - x.md` en Windows y macOS, donde abren lo mismo que el nombre protegido, y
// en cualquier sistema un nombre en Unicode NFD, que se ve igual que el documento. En Linux, un
// nombre que solo difiere en mayúsculas de un documento protegido también pide force; no hace
// falta nunca.
const clave = claveDeNombre;

// Desde la Etapa 4, los recibos y el documento de la fase que los declara los escribe el servidor
// (record_batch). write_central_doc los rechaza siempre, también para crearlos; la escotilla de
// confirmación (elicitation o force) queda para reparar a mano un archivo dañado (decisión H4).
// Son los códigos de los dos motivos: su texto sale en el idioma de la llamada.
export const MOTIVO_RECIBO = "TAREA-MOTIVO-RECIBO";
export const MOTIVO_DOCUMENTO_DE_LOTES = "TAREA-MOTIVO-DOCUMENTO-DE-LOTES";

// Si el motivo es uno de los dos de lotes: se compara con su texto en los dos idiomas, porque quien
// pregunta recibió el texto, no el código, y el idioma de la llamada pudo cambiar entre medias.
export function esMotivoDeLotes(motivo: string | null): boolean {
  if (motivo === null) return false;
  return IDIOMAS.some((idioma) => [MOTIVO_RECIBO, MOTIVO_DOCUMENTO_DE_LOTES].some((codigo) => motivo === mensaje(codigo, {}, idioma)));
}

// Devuelve el motivo del rechazo, o null si se puede escribir sin force. `relativo` es la ruta
// dentro de la tarea, con "/" como separador (la de ubicarEnTarea).
export function motivoDeProteccion(
  carpetaTarea: string,
  relativo: string,
  phases: Map<number, PhaseFile>,
  contextoInicial: string
): string | null {
  const buscado = clave(relativo);

  // Ni siquiera para crearlo: solo start_task lo escribe.
  if (buscado === clave(contextoInicial)) {
    return mensaje("TAREA-MOTIVO-CONTEXTO-INICIAL");
  }

  const fases = [...phases.entries()].sort((a, b) => a[0] - b[0]);
  const propia = fases.find(
    ([, datos]) =>
      (datos.documento && clave(datos.documento) === buscado) ||
      (datos.recibos && buscado.startsWith(`${clave(datos.recibos)}/`))
  );
  if (!propia) return null; // no es un archivo de fase

  // Las dos reglas de la Etapa 4 van antes que el congelamiento: en la fase de los recibos, ni sus
  // recibos ni su documento se escriben con esta tool, existan o no.
  const [numero, datos] = propia;
  const esDocumento = datos.documento !== undefined && clave(datos.documento) === buscado;
  if (datos.recibos) return mensaje(esDocumento ? MOTIVO_DOCUMENTO_DE_LOTES : MOTIVO_RECIBO);

  // Crear un documento nunca pisa nada, ni siquiera cuando rellena un hueco. Se mira el nombre
  // declarado y no el que llegó, que puede venir en otras mayúsculas.
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

// Frase corta para el chat. Se le pasa el mapa de fases para poder nombrar la fase siguiente
// con su título real en vez de un número suelto. Es texto de respuesta: en el idioma de la llamada.
export function describeEstado(estado: EstadoTarea, phases: Map<number, PhaseFile>): string {
  if (estado.fasesConDocumento === 0) {
    return mensaje("TAREA-ESTADO-DESCONOCIDO");
  }

  if (estado.siguienteFase === null) {
    return mensaje("TAREA-ESTADO-TERMINADA");
  }

  const titulo = phases.get(estado.siguienteFase)?.title;
  // En la fase de los lotes, también por dónde va dentro de ella.
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

// ─── Listado ────────────────────────────────────────────────────────────────
// Las tareas son las carpetas que hay bajo la subcarpeta de tareas del proyecto. Se listan
// del disco, así que también aparecen las que alguien creó a mano sin pasar por start_task.
// Las carpetas con punto no son tareas: con la subcarpeta vacía, .phase-gate/ o .git/ del
// proyecto cuelgan del mismo sitio que ellas.
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
  // "puntero" es lo que el usuario eligió; "deducida" es la más reciente, cuando no hay puntero.
  // La distinción se le dice al usuario: una deducción presentada como certeza es justo el
  // error que este rediseño vino a quitar.
  origen: "puntero" | "deducida";
};

// Con puntero guardado se devuelve esa. Sin puntero —estado borrado, equipo nuevo, archivo
// corrupto— se deduce la tarea con actividad más reciente, marcada como deducción. Así perder
// el archivo de estado deja de ser un callejón sin salida.
// `tareas` es para quien ya listó las tareas del proyecto (el Studio): así no se recorren dos veces.
export function tareaActiva(
  carpetaProyecto: string,
  phases: Map<number, PhaseFile>,
  tareas: EstadoTarea[] = listarTareas(carpetaProyecto, phases)
): TareaActiva | null {
  if (tareas.length === 0) return null;

  const apuntada = leerPunteros()[carpetaProyecto.toLowerCase()];

  if (apuntada) {
    const encontrada = tareas.find((tarea) => tarea.taskName === apuntada);
    // Un puntero a una carpeta que ya no existe (renombrada o borrada) no debe dejar sin
    // respuesta: se ignora y se deduce, igual que si no hubiera puntero.
    if (encontrada) return { estado: encontrada, origen: "puntero" };
  }

  return { estado: tareas[0] as EstadoTarea, origen: "deducida" };
}

// ─── Compuerta de fase ──────────────────────────────────────────────────────
// El repo se llama `phase-gate` pero durante mucho tiempo la compuerta no existió en el
// código: se podía pedir el prompt de la Fase 4 sin ningún documento previo, y lo único que
// pasaba era que la lectura del plan fallaba con un ENOENT. A partir de ahí el comportamiento
// dependía del modelo: uno se detenía a avisar, otro se inventaba el plan que debía leer.
//
// La comprobación es una sola comparación contra la fase deducida, porque `siguienteFase` ya
// es "la primera fase cuyo documento falta". De ahí sale gratis el caso delicado: volver a una
// fase anterior para corregirla no es saltarse nada, y no se estorba.
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
  // Sin fases con documento no hay nada contra lo que comparar; y una tarea terminada no
  // tiene huecos, así que ninguna fase que se pida puede ser un salto.
  if (estado.siguienteFase === null) return null;

  // Pedir la fase que toca, o una anterior, es legítimo. Solo se mira hacia adelante.
  if (fasePedida <= estado.siguienteFase) return null;

  const faltan = [...phases.entries()]
    .filter(([numero, datos]) => numero < fasePedida && datos.documento && !estado.fasesHechas.includes(numero))
    .sort((a, b) => a[0] - b[0])
    .map(([numero, datos]) => ({ fase: numero, documento: datos.documento as string }));

  return { fasePedida, siguienteFase: estado.siguienteFase, faltan };
}

// El aviso va al principio del prompt, no en un campo aparte, porque lo tiene que leer el
// modelo como parte de sus instrucciones. Avisa y entrega igual: bloquear estorbaría el día
// que haga falta saltarse una fase a propósito, y hoy no hay dato de cuántas veces pasa.
// Resuelve de qué tarea se está hablando y devuelve el aviso, o null si no hay nada que decir.
//
// Quién hace este trabajo es la decisión de diseño de la compuerta: lo hace el servidor, no el
// modelo. El puntero por proyecto ya está guardado aquí, así que pedírselo al modelo sería
// trabajo de más y una vía de fricción — si no lograra deducirlo acabaría preguntándoselo al
// usuario en cada fase, y escribir "/f4" para que te contesten "¿en qué tarea estamos?" es peor
// que no tener compuerta.
//
// `project` y `taskName` son solo anulación manual, para comprobar contra una tarea distinta de
// la activa. Sin ellos se usa el puntero; y cuando de verdad no se puede saber se dice en voz
// alta, en vez de callar como si todo estuviera en orden.
export type OpcionesDeTarea = { project?: string; taskName?: string };

// Las fases con las que se deduce una tarea dependen de su proyecto (un proyecto puede sustituir
// una fase con otro documento). Quien llama pasa un mapa fijo o la función que da las de cada
// proyecto, porque aquí el proyecto se resuelve dentro.
export type FasesPorProyecto = Map<number, PhaseFile> | ((carpetaProyecto: string) => Map<number, PhaseFile>);

function fasesPara(phases: FasesPorProyecto, carpetaProyecto: string): Map<number, PhaseFile> {
  return typeof phases === "function" ? phases(carpetaProyecto) : phases;
}

export type TareaResuelta = { estado: EstadoTarea; carpetaProyecto: string; phases: Map<number, PhaseFile> };

// La tarea de la que habla una llamada a get_phase_prompt: la indicada, o la activa del proyecto.
// Sin proyecto solo se puede resolver si hay exactamente un candidato con tarea activa; con
// varios, se devuelve "ambigua" para que quien llama lo diga en vez de callar.
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

    if (conPuntero.length === 0) return null; // Nada empezado: no hay nada que comprobar.
    if (conPuntero.length > 1) return "ambigua";

    const encontrada = findProjectFolder(conPuntero[0] as string);
    if (!encontrada) return null; // Puntero de un proyecto que ya no existe: se ignora.
    carpetaProyecto = encontrada;
  }

  const deEste = fasesPara(phases, carpetaProyecto);
  const estado = opciones.taskName
    ? listarTareas(carpetaProyecto, deEste).find((tarea) => tarea.taskName === opciones.taskName)
    : tareaActiva(carpetaProyecto, deEste)?.estado;

  // null: proyecto sin tareas, o un nombre de tarea que no existe.
  return estado ? { estado, carpetaProyecto, phases: deEste } : null;
}

export function avisoDeCompuerta(fasePedida: number, phases: FasesPorProyecto, opciones: OpcionesDeTarea = {}): string | null {
  const resuelta = resolverTareaDelPrompt(phases, opciones);

  // Sin un proyecto no hay idioma de proyecto: la nota sale en el de la llamada.
  if (resuelta === "ambigua") return mensaje("COMPUERTA-AMBIGUA");
  if (!resuelta) return null;

  const salto = detectarSalto(fasePedida, resuelta.estado, resuelta.phases);
  if (!salto) return null;
  // El aviso va dentro del prompt: en el idioma del proyecto.
  const idioma = idiomaDelProyecto(resuelta.carpetaProyecto).idioma;
  return avisoDeSalto(salto, resuelta.estado.taskName, resuelta.phases, idioma);
}

// ─── Recibos que ya existen ─────────────────────────────────────────────────
// Ninguna tool lista una carpeta, así que al retomar la Fase 4 en otro chat, o al auditar en la
// Fase 5 sin índice, el modelo no tenía cómo saber qué recibos hay ni cómo se llaman sus slugs.
// Se los da el servidor al final del prompt de la fase que los declara y de las posteriores, en el
// idioma del proyecto.
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

// ─── Pendientes heredados ───────────────────────────────────────────────────
// Refuerzo del servidor para la regla global PENDIENTES HEREDADOS (#39): si la fase anterior dejó
// algo sin comprobar, el prompt de la siguiente llega con un aviso que lo nombra. Lee encabezados
// y frontmatter de documentos que el prompt ya obliga a escribir; no guarda estado ni cambia la
// deducción de fase. Si el modelo no escribió la sección, el aviso no sale y todo sigue igual.
//
// No contradice el rechazo de la #39 a un campo `Estado:`: aquello era hacer depender la
// compuerta de algo escrito por el modelo. Esto no bloquea ni cambia la fase: solo señala.

// Lo que se escribe por costumbre en una sección que no tiene nada, en los dos idiomas: no es un pendiente.
const SECCION_VACIA = FORMAS_DE_VACIO;

// "## Validaciones pendientes" o "## Pending validations", sin distinguir mayúsculas (§8.2).
const ENCABEZADOS_BUSCADOS = new Set(ENCABEZADOS_DE_PENDIENTES.map((titulo) => `## ${titulo}`.normalize("NFC").toLowerCase()));

// La sección reducida a su texto: sin viñetas ni numeración, sin énfasis de Markdown (_ * `),
// sin puntos suspensivos ni punto final, en una línea y en minúsculas. Así "- Ninguna.",
// "_Ninguna._" o "Ninguna..." cuentan igual que "Ninguna".
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

// La sección es el texto entre su encabezado y el siguiente "## " (o el final). Devuelve true si
// existe y tiene algo que no sea una forma de decir "ninguna".
export function tieneValidacionesPendientes(texto: string): boolean {
  const lineas = separarFrontmatter(texto).cuerpo.split("\n");
  // El encabezado se compara sin distinguir mayúsculas: "## Validaciones Pendientes" también vale, y en
  // inglés, "## Pending validations".
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
    return null; // un documento ilegible no es un pendiente: el aviso es una ayuda, no un control
  }
}

// En el idioma del proyecto (`idioma`): el aviso va dentro del prompt.
export function avisoDePendientes(
  fasePedida: number,
  estado: EstadoTarea,
  phases: Map<number, PhaseFile>,
  idioma: Idioma = "es"
): string | null {
  const v = vocabulario(idioma);
  const ordenadas = [...phases.entries()].sort((a, b) => a[0] - b[0]);
  const lineas: string[] = [];

  // La fase anterior es la de mayor número, por debajo de la pedida, cuyo documento existe.
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

  // Los recibos de lote de las fases anteriores que quedaron con pendientes, fallidos o
  // descartados. Con un solo lote, el recibo es el documento de la fase y se mira también.
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

// En el idioma del proyecto (`idioma`): el aviso va al principio del prompt.
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
