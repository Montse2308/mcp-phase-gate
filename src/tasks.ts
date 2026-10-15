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
import { log } from "./log.js";
import { claveDeNombre, findProjectFolder, requireProjectFolder, tasksRootPath } from "./paths.js";
import type { PhaseFile } from "./phases.js";

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
        log("info", `Estado en formato anterior eliminado: ${viejo}`);
      }
    } catch {
      // Que no se pueda borrar no impide trabajar: el archivo viejo ya no se lee.
    }
  }
}

// ─── Estado deducido de una tarea ───────────────────────────────────────────
export type EstadoTarea = {
  taskName: string;
  folderPath: string;
  fasesHechas: number[];
  siguienteFase: number | null;  // null = ya no queda ninguna fase con documento pendiente
  fasesConDocumento: number;     // 0 = no hay nada que deducir (ningún prompt declara documento)
  ultimoCambio: number | null;   // mtime del documento más reciente, para ordenar por actividad
};

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

  // Sin ningún documento todavía, la carpeta recién creada por start_task marca la actividad.
  if (ultimoCambio === null) {
    try {
      ultimoCambio = fs.statSync(folderPath).mtimeMs;
    } catch {
      ultimoCambio = null;
    }
  }

  return {
    taskName,
    folderPath,
    fasesHechas,
    siguienteFase: pendientes.length ? (pendientes[0] as number) : null,
    fasesConDocumento: conDocumento.length,
    ultimoCambio,
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
    return `existe \`${datos.documento}\``;
  }

  if (datos.recibos) {
    const subcarpeta = path.join(carpetaTarea, datos.recibos);
    const entradas = fs.existsSync(subcarpeta) ? fs.readdirSync(subcarpeta, { withFileTypes: true }) : [];
    if (entradas.some((entrada) => entrada.isFile() && entrada.name.toLowerCase().endsWith(".md"))) {
      return `existen recibos en \`${datos.recibos}/\``;
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
    return "El contexto inicial está siempre protegido: es el único documento que no se puede regenerar leyendo el código.";
  }

  const fases = [...phases.entries()].sort((a, b) => a[0] - b[0]);
  const propia = fases.find(
    ([, datos]) =>
      (datos.documento && clave(datos.documento) === buscado) ||
      (datos.recibos && buscado.startsWith(`${clave(datos.recibos)}/`))
  );
  if (!propia) return null; // no es un archivo de fase

  // Crear un documento nunca pisa nada, ni siquiera cuando rellena un hueco. Se mira el nombre
  // declarado y no el que llegó, que puede venir en otras mayúsculas. Un recibo nuevo sí se
  // congela: con la Fase 5 presente, la ejecución ya se auditó.
  const [numero, datos] = propia;
  const esDocumento = datos.documento !== undefined && clave(datos.documento) === buscado;
  if (esDocumento && !fs.existsSync(path.join(carpetaTarea, datos.documento!))) return null;

  for (const [posterior, datosPosterior] of fases) {
    if (posterior <= numero) continue;
    const presencia = presenciaDeFase(carpetaTarea, datosPosterior);
    if (presencia) {
      return `\`${relativo}\` está congelado: la Fase ${posterior} ya está en curso o cerrada (${presencia}).`;
    }
  }

  return null;
}

// Frase corta para el chat. Se le pasa el mapa de fases para poder nombrar la fase siguiente
// con su título real en vez de un número suelto.
export function describeEstado(estado: EstadoTarea, phases: Map<number, PhaseFile>): string {
  if (estado.fasesConDocumento === 0) {
    return "fase desconocida (ningún prompt de fase declara documento, así que no hay nada que deducir)";
  }

  if (estado.siguienteFase === null) {
    return "terminada: todas las fases dejaron su documento";
  }

  const titulo = phases.get(estado.siguienteFase)?.title;
  const siguiente = titulo
    ? `va en Fase ${estado.siguienteFase} (${titulo})`
    : `va en Fase ${estado.siguienteFase}`;

  return estado.fasesHechas.length
    ? `${siguiente}; hechas: ${estado.fasesHechas.join(", ")}`
    : `${siguiente}; todavía sin documentos`;
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
export function tareaActiva(
  carpetaProyecto: string,
  phases: Map<number, PhaseFile>
): TareaActiva | null {
  const tareas = listarTareas(carpetaProyecto, phases);
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

// La tarea de la que habla una llamada a get_phase_prompt: la indicada, o la activa del proyecto.
// Sin proyecto solo se puede resolver si hay exactamente un candidato con tarea activa; con
// varios, se devuelve "ambigua" para que quien llama lo diga en vez de callar.
export function tareaDelPrompt(
  phases: Map<number, PhaseFile>,
  opciones: OpcionesDeTarea = {}
): EstadoTarea | "ambigua" | null {
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

  const estado = opciones.taskName
    ? listarTareas(carpetaProyecto, phases).find((tarea) => tarea.taskName === opciones.taskName)
    : tareaActiva(carpetaProyecto, phases)?.estado;

  return estado ?? null; // null: proyecto sin tareas, o un nombre de tarea que no existe.
}

export function avisoDeCompuerta(
  fasePedida: number,
  phases: Map<number, PhaseFile>,
  opciones: OpcionesDeTarea = {}
): string | null {
  const estado = tareaDelPrompt(phases, opciones);

  if (estado === "ambigua") {
    return (
      "> Nota: no se comprobó la compuerta de fase porque no se indicó `project` y hay varios " +
      "proyectos con tarea activa. Pasa `project` para que se compruebe."
    );
  }
  if (!estado) return null;

  const salto = detectarSalto(fasePedida, estado, phases);
  return salto ? avisoDeSalto(salto, estado.taskName, phases) : null;
}

// ─── Recibos que ya existen ─────────────────────────────────────────────────
// Ninguna tool lista una carpeta, así que al retomar la Fase 4 en otro chat, o al auditar en la
// Fase 5 sin índice, el modelo no tenía cómo saber qué recibos hay ni cómo se llaman sus slugs.
// Se los da el servidor al final del prompt de la fase que los declara y de las posteriores.
export function bloqueDeRecibos(
  fasePedida: number,
  estado: EstadoTarea,
  phases: Map<number, PhaseFile>
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

    for (const recibo of recibos) lineas.push(`- Fase ${numero}: \`${datos.recibos}/${recibo}\``);
  }

  if (lineas.length === 0) return null;

  return [
    `## RECIBOS QUE YA EXISTEN EN LA TAREA "${estado.taskName}"`,
    "",
    "Léelos con `read_central_doc` usando estas rutas tal cual:",
    ...lineas,
  ].join("\n");
}

export function avisoDeSalto(
  salto: Salto,
  taskName: string,
  phases: Map<number, PhaseFile>
): string {
  const titulo = phases.get(salto.siguienteFase)?.title;
  const vaEn = titulo ? `Fase ${salto.siguienteFase} (${titulo})` : `Fase ${salto.siguienteFase}`;

  const lista = salto.faltan.map(({ fase, documento }) => `- Fase ${fase}: falta \`${documento}\``);

  return [
    "## ATENCIÓN — COMPUERTA DE FASE",
    "",
    `Pediste la Fase ${salto.fasePedida}, pero la tarea "${taskName}" no tiene los documentos de fases anteriores:`,
    "",
    ...lista,
    "",
    `Esta tarea va en la ${vaEn}. NO hagas el trabajo de la Fase ${salto.fasePedida} sobre documentos que no existen ` +
      "ni te los inventes a partir del contexto del chat.",
    "",
    "Díselo al usuario antes de nada y pregúntale si prefiere hacer primero la fase que falta o continuar de todos " +
      "modos. Lo que sigue es el prompt de la fase que pediste: aplícalo solo después de resolver esto con el usuario.",
  ].join("\n");
}
