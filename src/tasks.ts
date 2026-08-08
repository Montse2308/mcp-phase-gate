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
import { tasksRootPath } from "./paths.js";
import type { PhaseFile } from "./phases.js";

// ─── Puntero de tarea activa, por proyecto ──────────────────────────────────
// Forma del archivo: { "bos": "login-sso", "crm": "reporte-comisiones" }
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
        console.error(`[orquestador] Estado en formato anterior eliminado: ${viejo}`);
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
export function listarTareas(
  carpetaProyecto: string,
  phases: Map<number, PhaseFile>
): EstadoTarea[] {
  const raiz = tasksRootPath(carpetaProyecto);

  if (!fs.existsSync(raiz)) return [];

  return fs
    .readdirSync(raiz, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
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
