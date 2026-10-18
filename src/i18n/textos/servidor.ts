// Mensajes del grupo «servidor» (ver i18n/mensajes.ts): cada código con su texto en español y en inglés.
// El español es el texto de siempre, byte a byte; el inglés, una redacción natural con el glosario
// de docs/glosario.md.

import type { Catalogo } from "./tipos.js";

// Lo que se espera de cada tipo, dicho como se le diría al modelo para que corrija la llamada (schemas.ts).
// El único número es `phase`, de ahí el ejemplo.
const TIPOS_ES: Record<string, string> = {
  string: "un texto",
  number: "un número, por ejemplo 3",
  int: "un número entero, por ejemplo 3",
  boolean: "true o false",
  object: "un objeto",
  array: "una lista",
};

const TIPOS_EN: Record<string, string> = {
  string: "a string",
  number: "a number, for example 3",
  int: "an integer, for example 3",
  boolean: "true or false",
  object: "an object",
  array: "a list",
};

// El origen de un preset (OrigenDelPreset de capas.ts), dicho en inglés.
const ORIGEN_DEL_PRESET_EN: Record<string, string> = {
  "de la tarea": "from the task",
  "del proyecto": "from the project",
  "de machine.json": "from machine.json",
  "por defecto": "default",
};

const conNota = (nota: string | null | undefined): string => (nota ? ` ${nota}` : "");
const conDeducido = (deducido: string | null | undefined): string => (deducido ? `\n${deducido}` : "");

export const TEXTOS_SERVIDOR = {
  // ─── servidor.ts: respuestas y errores de las tools ─────────────────────────
  "SERVIDOR-ESCRIBIR-COINCIDENCIA-DEBIL": {
    es: (p: { carpetaProyecto: string; motivo: string }) =>
      `La carpeta abierta solo contiene un repo de ${p.carpetaProyecto} (${p.motivo}): para escribir, indica \`project\`.`,
    en: (p: { carpetaProyecto: string; motivo: string }) =>
      `The open folder only contains a repo of ${p.carpetaProyecto} (${p.motivo}): to write, pass \`project\`.`,
  },
  "SERVIDOR-NOTA-SIN-PROYECTO": {
    es: (p: { pedido: string | null; preset: string; origen: string | null }) => {
      const porQue = typeof p.pedido === "string" ? `no existe el proyecto «${p.pedido}»` : "no se indicó `project` ni se pudo deducir de la carpeta abierta";
      return `> Nota del servidor: ${porQue}, así que este prompt usa el preset \`${p.preset}\` (${p.origen ?? "por defecto"}) y no lleva la configuración de ningún proyecto. Pasa \`project\` para recibir la de tu proyecto.`;
    },
    en: (p: { pedido: string | null; preset: string; origen: string | null }) => {
      const porQue = typeof p.pedido === "string" ? `project "${p.pedido}" does not exist` : "no `project` was given and it could not be deduced from the open folder";
      const origen = p.origen === null ? "default" : (ORIGEN_DEL_PRESET_EN[p.origen] ?? p.origen);
      return `> Server note: ${porQue}, so this prompt uses the preset \`${p.preset}\` (${origen}) and carries no project's configuration. Pass \`project\` to get your project's.`;
    },
  },
  "SERVIDOR-CANCELADA": {
    es: "El cliente canceló la llamada antes de escribir. No se escribió nada.",
    en: "The client cancelled the call before writing. Nothing was written.",
  },
  "SERVIDOR-LISTADO-CONFIG-ILEGIBLE": {
    es: (p: { carpetaProyecto: string; error: string }) => `${p.carpetaProyecto}: no se pudo leer su configuración. ${p.error}`,
    en: (p: { carpetaProyecto: string; error: string }) => `${p.carpetaProyecto}: its configuration could not be read. ${p.error}`,
  },
  "SERVIDOR-COMPUERTA-FALLO": {
    es: (p: { error: string }) => `No se pudo comprobar la compuerta: ${p.error}`,
    en: (p: { error: string }) => `The phase gate could not be checked: ${p.error}`,
  },
  "TOOL-ACCESO-DENEGADO-TAREA": {
    es: (p: { docsBase: string }) => `Acceso denegado: la carpeta de la tarea queda fuera de ${p.docsBase}.`,
    en: (p: { docsBase: string }) => `Access denied: the task folder falls outside ${p.docsBase}.`,
  },
  "TOOL-ACCESO-DENEGADO-RUTA": {
    es: (p: { docsBase: string }) => `Acceso denegado: la ruta queda fuera de ${p.docsBase}.`,
    en: (p: { docsBase: string }) => `Access denied: the path falls outside ${p.docsBase}.`,
  },
  // start_task
  "TOOL-START-SIN-REPOS-DECLARADOS": {
    es: (p: { carpetaProyecto: string }) =>
      `El proyecto ${p.carpetaProyecto} no declara repos en su phase-gate.json, así que la tarea no puede elegir ` +
      `entre ellos. Quita \`repos\`, o decláralos primero en el manifiesto.`,
    en: (p: { carpetaProyecto: string }) =>
      `Project ${p.carpetaProyecto} declares no repos in its phase-gate.json, so the task cannot choose ` +
      `among them. Remove \`repos\`, or declare them in the manifest first.`,
  },
  "TOOL-START-REPOS-DESCONOCIDOS": {
    es: (p: { desconocidos: string[]; carpetaProyecto: string; validos: string[] }) =>
      `${p.desconocidos.map((id) => `"${id}"`).join(", ")} no ${p.desconocidos.length === 1 ? "es un repo" : "son repos"} ` +
      `del phase-gate.json de ${p.carpetaProyecto}. Los válidos son: ${p.validos.join(", ")}.`,
    en: (p: { desconocidos: string[]; carpetaProyecto: string; validos: string[] }) =>
      `${p.desconocidos.map((id) => `"${id}"`).join(", ")} ${p.desconocidos.length === 1 ? "is not a repo" : "are not repos"} ` +
      `in the phase-gate.json of ${p.carpetaProyecto}. The valid ones are: ${p.validos.join(", ")}.`,
  },
  "TOOL-START-PRESET-NO-EXISTE": {
    es: (p: { preset: string; disponibles: string }) => `No existe el preset "${p.preset}". Los disponibles son: ${p.disponibles}.`,
    en: (p: { preset: string; disponibles: string }) => `Preset "${p.preset}" does not exist. The available ones are: ${p.disponibles}.`,
  },
  "TOOL-START-CREAR-SIN-NOMBRE": {
    es: "Para estrenar un proyecto, indica su nombre en `project`.",
    en: "To create a new project, give its name in `project`.",
  },
  "TOOL-START-ALIAS-DISCREPA": {
    es: "`crear_proyecto` y `create_project` son el mismo parámetro y llegaron con valores distintos: pasa solo uno.",
    en: "`crear_proyecto` and `create_project` are the same parameter and came with different values: pass only one.",
  },
  "TOOL-START-PROYECTO-NO-EXISTE": {
    es: (p: { proyecto: string; disponibles: string; mayusculas: string }) =>
      `No existe el proyecto "${p.proyecto}". Los proyectos disponibles son: ${p.disponibles}. ` +
      `Si el usuario te confirmó que quiere estrenar el proyecto "${p.mayusculas}", ` +
      `vuelve a llamar a start_task con crear_proyecto: true.`,
    en: (p: { proyecto: string; disponibles: string; mayusculas: string }) =>
      `Project "${p.proyecto}" does not exist. The available projects are: ${p.disponibles}. ` +
      `If the user confirmed they want to create the new project "${p.mayusculas}", ` +
      `call start_task again with create_project: true.`,
  },
  "TOOL-START-CONFIRMAR": {
    es: (p: { carpetaProyecto: string; ruta: string }) => `¿Estrenar el proyecto «${p.carpetaProyecto}»? Se creará la carpeta \`${p.ruta}\`.`,
    en: (p: { carpetaProyecto: string; ruta: string }) => `Create the new project "${p.carpetaProyecto}"? The folder \`${p.ruta}\` will be created.`,
  },
  "TOOL-START-CONFIRMAR-ETIQUETA": {
    es: (p: { carpetaProyecto: string }) => `Crear el proyecto ${p.carpetaProyecto}`,
    en: (p: { carpetaProyecto: string }) => `Create project ${p.carpetaProyecto}`,
  },
  "TOOL-START-RECHAZADO": {
    es: (p: { nota?: string | undefined }) => `El usuario no confirmó el proyecto nuevo. No se creó nada.${conNota(p.nota)}`,
    en: (p: { nota?: string | undefined }) => `The user did not confirm the new project. Nothing was created.${conNota(p.nota)}`,
  },
  "TOOL-START-TAREA-YA-EXISTE": {
    es: (p: { taskName: string; carpetaProyecto: string; carpetaTarea: string }) =>
      `La tarea "${p.taskName}" ya existe en ${p.carpetaProyecto} y start_task reescribiría su ` +
      `contexto inicial. Si quieres retomarla, usa switch_task. Si de verdad quieres ` +
      `empezar de cero, borra o renombra la carpeta primero: ${p.carpetaTarea}`,
    en: (p: { taskName: string; carpetaProyecto: string; carpetaTarea: string }) =>
      `Task "${p.taskName}" already exists in ${p.carpetaProyecto} and start_task would rewrite its ` +
      `initial context. To resume it, use switch_task. If you really want to ` +
      `start over, delete or rename the folder first: ${p.carpetaTarea}`,
  },
  "TOOL-START-OK": {
    es: (p: { taskName: string; contextoInicial: string; carpetaProyecto: string; estrenado: boolean; deducido: string | null }) =>
      `Tarea '${p.taskName}' inicializada correctamente. Archivo guardado en: ${p.contextoInicial}\n` +
      `Tarea activa de ${p.carpetaProyecto}: ${p.taskName}.${p.estrenado ? `\nProyecto "${p.carpetaProyecto}" estrenado.` : ""}${conDeducido(p.deducido)}`,
    en: (p: { taskName: string; contextoInicial: string; carpetaProyecto: string; estrenado: boolean; deducido: string | null }) =>
      `Task '${p.taskName}' initialized. File saved at: ${p.contextoInicial}\n` +
      `Active task of ${p.carpetaProyecto}: ${p.taskName}.${p.estrenado ? `\nProject "${p.carpetaProyecto}" created.` : ""}${conDeducido(p.deducido)}`,
  },
  // get_active_task y list_tasks
  "TOOL-ACTIVA-SIN-PROYECTOS": {
    es: "No hay ningún proyecto en la Documentación Central todavía.",
    en: "There are no projects in the Central Documentation yet.",
  },
  "TOOL-ACTIVA-SIN-TAREAS": {
    es: (p: { carpetaProyecto: string }) => `${p.carpetaProyecto}: sin tareas todavía.`,
    en: (p: { carpetaProyecto: string }) => `${p.carpetaProyecto}: no tasks yet.`,
  },
  "TOOL-ACTIVA-BLOQUE": {
    es: (p: { carpetaProyecto: string; taskName: string; deducida: boolean; fase: string; carpeta: string }) =>
      `${p.carpetaProyecto}: ${p.taskName}${p.deducida ? " (deducida por ser la más reciente: no había puntero guardado, confírmalo antes de escribir)" : ""}\n` +
      `  Fase: ${p.fase}\n` +
      `  Carpeta: ${p.carpeta}`,
    en: (p: { carpetaProyecto: string; taskName: string; deducida: boolean; fase: string; carpeta: string }) =>
      `${p.carpetaProyecto}: ${p.taskName}${p.deducida ? " (deduced as the most recent one: there was no saved pointer, confirm it before writing)" : ""}\n` +
      `  Phase: ${p.fase}\n` +
      `  Folder: ${p.carpeta}`,
  },
  "TOOL-ACTIVA-PUNTEROS": {
    es: (p: { archivo: string }) => `Punteros guardados en: ${p.archivo}`,
    en: (p: { archivo: string }) => `Pointers saved in: ${p.archivo}`,
  },
  "TOOL-LISTAR-SIN-TAREAS": {
    es: (p: { carpetaProyecto: string }) => `${p.carpetaProyecto}: sin tareas.`,
    en: (p: { carpetaProyecto: string }) => `${p.carpetaProyecto}: no tasks.`,
  },
  "TOOL-LISTAR-MARCA-ACTIVA": {
    es: " [activa]",
    en: " [active]",
  },
  "TOOL-LISTAR-BLOQUE": {
    es: (p: { carpetaProyecto: string; total: number; lineas: string }) => `${p.carpetaProyecto} (${p.total}), de la más reciente a la más antigua:\n${p.lineas}`,
    en: (p: { carpetaProyecto: string; total: number; lineas: string }) => `${p.carpetaProyecto} (${p.total}), newest to oldest:\n${p.lineas}`,
  },
  "TOOL-LISTAR-SIN-PROYECTOS": {
    es: "No hay proyectos todavía.",
    en: "There are no projects yet.",
  },
  // switch_task
  "TOOL-CAMBIAR-NO-EXISTE": {
    es: (p: { taskName: string; carpetaProyecto: string; disponibles: string[] }) =>
      `No existe la tarea "${p.taskName}" en ${p.carpetaProyecto}. Las que hay son: ${p.disponibles.length ? p.disponibles.map((t) => `"${t}"`).join(", ") : "(ninguna)"}. ` +
      `Si es una tarea nueva, créala con start_task.`,
    en: (p: { taskName: string; carpetaProyecto: string; disponibles: string[] }) =>
      `Task "${p.taskName}" does not exist in ${p.carpetaProyecto}. The existing ones are: ${p.disponibles.length ? p.disponibles.map((t) => `"${t}"`).join(", ") : "(none)"}. ` +
      `If it is a new task, create it with start_task.`,
  },
  "TOOL-CAMBIAR-OK": {
    es: (p: { carpetaProyecto: string; taskName: string; fase: string; carpeta: string; deducido: string | null }) =>
      `Tarea activa de ${p.carpetaProyecto}: ${p.taskName}.\nFase: ${p.fase}\n` + `Carpeta: ${p.carpeta}${conDeducido(p.deducido)}`,
    en: (p: { carpetaProyecto: string; taskName: string; fase: string; carpeta: string; deducido: string | null }) =>
      `Active task of ${p.carpetaProyecto}: ${p.taskName}.\nPhase: ${p.fase}\n` + `Folder: ${p.carpeta}${conDeducido(p.deducido)}`,
  },
  // write_central_doc
  "TOOL-ESCRIBIR-FUERA-DE-TAREA": {
    es:
      "write_central_doc solo escribe dentro de la carpeta de una tarea que ya existe " +
      "(<DOCS>/<PROYECTO>/<subcarpeta de tareas>/<tarea>/). Los archivos del proyecto, como " +
      "phase-gate.json, no se escriben con esta tool. Para una tarea nueva, usa start_task.",
    en:
      "write_central_doc only writes inside the folder of a task that already exists " +
      "(<DOCS>/<PROJECT>/<tasks subfolder>/<task>/). Project files, such as " +
      "phase-gate.json, are not written with this tool. For a new task, use start_task.",
  },
  "TOOL-ESCRIBIR-CONFIRMAR-LOTES": {
    es: (p: { archivo: string; taskName: string; existia: boolean }) =>
      `\`${p.archivo}\` de la tarea «${p.taskName}» lo escribe record_batch. ¿${p.existia ? "Reescribirlo" : "Crearlo"} a mano de todos modos, para reparar un archivo dañado?`,
    en: (p: { archivo: string; taskName: string; existia: boolean }) =>
      `\`${p.archivo}\` of task "${p.taskName}" is written by record_batch. ${p.existia ? "Rewrite" : "Create"} it by hand anyway, to repair a damaged file?`,
  },
  "TOOL-ESCRIBIR-CONFIRMAR-PROTEGIDO": {
    es: (p: { archivo: string; taskName: string; motivo: string; existia: boolean }) =>
      `\`${p.archivo}\` de la tarea «${p.taskName}» está protegido: ${p.motivo}. ` + (p.existia ? "¿Reescribirlo?" : "¿Crearlo?"),
    en: (p: { archivo: string; taskName: string; motivo: string; existia: boolean }) =>
      `\`${p.archivo}\` of task "${p.taskName}" is protected: ${p.motivo}. ` + (p.existia ? "Rewrite it?" : "Create it?"),
  },
  "TOOL-ESCRIBIR-CONFIRMAR-ETIQUETA": {
    es: (p: { archivo: string; existia: boolean }) => `${p.existia ? "Reescribir" : "Crear"} ${p.archivo}`,
    en: (p: { archivo: string; existia: boolean }) => `${p.existia ? "Rewrite" : "Create"} ${p.archivo}`,
  },
  "TOOL-ESCRIBIR-RECHAZADO": {
    es: (p: { archivo: string; existia: boolean; nota?: string | undefined }) =>
      `El usuario no confirmó ${p.existia ? "la reescritura" : "la escritura"} de \`${p.archivo}\`. No se escribió nada.${conNota(p.nota)}`,
    en: (p: { archivo: string; existia: boolean; nota?: string | undefined }) =>
      `The user did not confirm ${p.existia ? "rewriting" : "writing"} \`${p.archivo}\`. Nothing was written.${conNota(p.nota)}`,
  },
  "TOOL-ESCRIBIR-PIDE-FORCE-LOTES": {
    es: (p: { motivo: string; nota?: string | undefined }) =>
      `${p.motivo} Usa record_batch. Solo para reparar a mano un archivo dañado, pídele al usuario confirmación ` +
      `explícita y vuelve a llamar con force: true.${conNota(p.nota)}`,
    en: (p: { motivo: string; nota?: string | undefined }) =>
      `${p.motivo} Use record_batch. Only to repair a damaged file by hand, ask the user for explicit ` +
      `confirmation and call again with force: true.${conNota(p.nota)}`,
  },
  "TOOL-ESCRIBIR-PIDE-FORCE": {
    es: (p: { motivo: string; nota?: string | undefined }) =>
      `${p.motivo} Si de verdad hay que reescribirlo, pídele al usuario confirmación explícita ` + `y vuelve a llamar con force: true.${conNota(p.nota)}`,
    en: (p: { motivo: string; nota?: string | undefined }) =>
      `${p.motivo} If it really has to be rewritten, ask the user for explicit confirmation ` + `and call again with force: true.${conNota(p.nota)}`,
  },
  "TOOL-ESCRIBIR-SUFIJO": {
    es: (p: { confirmada: boolean; existia: boolean }) =>
      p.confirmada
        ? p.existia
          ? " (reescrito con confirmación del usuario)"
          : " (creado con confirmación del usuario)"
        : p.existia
          ? " (sobrescrito con force)"
          : " (creado con force)",
    en: (p: { confirmada: boolean; existia: boolean }) =>
      p.confirmada
        ? p.existia
          ? " (rewritten with the user's confirmation)"
          : " (created with the user's confirmation)"
        : p.existia
          ? " (overwritten with force)"
          : " (created with force)",
  },
  "TOOL-ESCRIBIR-SUFIJO-MANUAL": {
    es: "\nEscrito a mano con confirmación; get_batch_status lo marcará como manual.",
    en: "\nWritten by hand with confirmation; get_batch_status will mark it as manual.",
  },
  "TOOL-ESCRIBIR-OK": {
    es: (p: { ruta: string; sufijo: string; deducido: string | null }) => `Archivo escrito exitosamente en ${p.ruta}${p.sufijo}${conDeducido(p.deducido)}`,
    en: (p: { ruta: string; sufijo: string; deducido: string | null }) => `File written successfully to ${p.ruta}${p.sufijo}${conDeducido(p.deducido)}`,
  },
  // record_batch y get_batch_status
  "TOOL-LOTE-SIN-TAREA-ACTIVA": {
    es: (p: { carpetaProyecto: string }) => `No hay tarea activa guardada en ${p.carpetaProyecto}: indica \`task_name\` (o actívala con switch_task).`,
    en: (p: { carpetaProyecto: string }) => `There is no saved active task in ${p.carpetaProyecto}: pass \`task_name\` (or activate one with switch_task).`,
  },
  "TOOL-ESTADO-LOTES-SIN-TAREAS": {
    es: (p: { carpetaProyecto: string }) => `${p.carpetaProyecto} no tiene tareas todavía.`,
    en: (p: { carpetaProyecto: string }) => `${p.carpetaProyecto} has no tasks yet.`,
  },
  "TOOL-ESTADO-LOTES-DEDUCIDA": {
    es: (p: { taskName: string }) => `(Tarea «${p.taskName}» deducida por ser la más reciente: no había tarea activa guardada.)`,
    en: (p: { taskName: string }) => `(Task "${p.taskName}" deduced as the most recent one: there was no saved active task.)`,
  },
  // repo_status
  "TOOL-REPOS-TITULO-REPO": {
    es: (p: { repo: string; carpetaProyecto: string }) => `Repo \`${p.repo}\` de ${p.carpetaProyecto}:`,
    en: (p: { repo: string; carpetaProyecto: string }) => `Repo \`${p.repo}\` of ${p.carpetaProyecto}:`,
  },
  "TOOL-REPOS-SIN-REPOS": {
    es: (p: { carpetaProyecto: string }) => `El proyecto ${p.carpetaProyecto} no declara repos en su phase-gate.json.`,
    en: (p: { carpetaProyecto: string }) => `Project ${p.carpetaProyecto} declares no repos in its phase-gate.json.`,
  },
  "TOOL-REPOS-TITULO-TAREA": {
    es: (p: { taskName: string; carpetaProyecto: string }) => `Repos de la tarea «${p.taskName}» de ${p.carpetaProyecto}:`,
    en: (p: { taskName: string; carpetaProyecto: string }) => `Repos of task "${p.taskName}" of ${p.carpetaProyecto}:`,
  },
  "TOOL-REPOS-TITULO-PROYECTO": {
    es: (p: { carpetaProyecto: string }) => `Repos de ${p.carpetaProyecto}:`,
    en: (p: { carpetaProyecto: string }) => `Repos of ${p.carpetaProyecto}:`,
  },

  // ─── servidor.ts: títulos y descripciones de las tools ──────────────────────
  "DESC-TOOL-START-TASK-TITULO": { es: "Iniciar tarea", en: "Start task" },
  "DESC-TOOL-START-TASK": {
    es:
      "Inicia una tarea NUEVA creando su carpeta en la Documentación Central y guardando el contexto inicial. " +
      "Para volver a una tarea que ya existe usa 'switch_task': start_task reescribiría su contexto inicial.",
    en:
      "Starts a NEW task by creating its folder in the Central Documentation and saving the initial context. " +
      "To return to a task that already exists use 'switch_task': start_task would rewrite its initial context.",
  },
  "DESC-TOOL-GET-PHASE-PROMPT-TITULO": { es: "Prompt de fase", en: "Phase prompt" },
  "DESC-TOOL-GET-PHASE-PROMPT": {
    es:
      "Obtiene el prompt maestro de comportamiento de una fase. Comprueba además que no te estés saltando una " +
      "fase: si faltan documentos anteriores, el prompt llega con un aviso al principio.",
    en:
      "Gets the master behaviour prompt of a phase. It also checks that you are not skipping a " +
      "phase: if earlier documents are missing, the prompt arrives with a warning at the top.",
  },
  "DESC-TOOL-GET-ACTIVE-TASK-TITULO": { es: "Tarea activa", en: "Active task" },
  "DESC-TOOL-GET-ACTIVE-TASK": {
    es:
      "Devuelve la tarea activa y en qué fase va, deducida de los documentos que ya tiene. Úsalo al iniciar un " +
      "chat nuevo o si perdiste el contexto. Sin 'project' devuelve la activa de CADA proyecto.",
    en:
      "Returns the active task and which phase it is in, deduced from the documents it already has. Use it when starting a " +
      "new chat or if you lost the context. Without 'project' it returns the active task of EACH project.",
  },
  "DESC-TOOL-LIST-TASKS-TITULO": { es: "Listar tareas", en: "List tasks" },
  "DESC-TOOL-LIST-TASKS": {
    es:
      "Lista las tareas que existen y la fase en la que va cada una. Úsalo para retomar una tarea vieja o para " +
      "saber qué hay pendiente.",
    en: "Lists the existing tasks and the phase each one is in. Use it to resume an old task or to see what is pending.",
  },
  "DESC-TOOL-SWITCH-TASK-TITULO": { es: "Cambiar de tarea activa", en: "Switch active task" },
  "DESC-TOOL-SWITCH-TASK": {
    es:
      "Cambia cuál es la tarea activa de un proyecto, sin tocar ningún archivo. Es la forma correcta de " +
      "retomar una tarea que ya existe.",
    en: "Changes which task is active in a project, without touching any file. It is the right way to resume a task that already exists.",
  },
  "DESC-TOOL-READ-CENTRAL-DOC-TITULO": { es: "Leer documento", en: "Read document" },
  "DESC-TOOL-READ-CENTRAL-DOC": {
    es:
      "Lee un archivo de la Documentación Central. RECOMENDADO: pasa 'project' + 'task_name' + 'file_name' y el " +
      "servidor arma la ruta correcta automáticamente (<PROYECTO>/<subcarpeta de tareas>/<tarea>/<archivo>). " +
      "Alternativamente puedes pasar 'file_path' relativo a la Documentación Central.",
    en:
      "Reads a file from the Central Documentation. RECOMMENDED: pass 'project' + 'task_name' + 'file_name' and the " +
      "server builds the correct path automatically (<PROJECT>/<tasks subfolder>/<task>/<file>). " +
      "Alternatively you can pass 'file_path' relative to the Central Documentation.",
  },
  "DESC-TOOL-WRITE-CENTRAL-DOC-TITULO": { es: "Escribir documento", en: "Write document" },
  "DESC-TOOL-WRITE-CENTRAL-DOC": {
    es:
      "Escribe o sobrescribe un archivo en la Documentación Central. RECOMENDADO: pasa 'project' + 'task_name' + " +
      "'file_name' y el servidor arma la ruta correcta automáticamente " +
      "(<PROYECTO>/<subcarpeta de tareas>/<tarea>/<archivo>). Alternativamente puedes pasar 'file_path' relativo " +
      "a la Documentación Central.",
    en:
      "Writes or overwrites a file in the Central Documentation. RECOMMENDED: pass 'project' + 'task_name' + " +
      "'file_name' and the server builds the correct path automatically " +
      "(<PROJECT>/<tasks subfolder>/<task>/<file>). Alternatively you can pass 'file_path' relative " +
      "to the Central Documentation.",
  },
  "DESC-TOOL-RECORD-BATCH-TITULO": { es: "Registrar lote", en: "Record batch" },
  "DESC-TOOL-RECORD-BATCH": {
    es:
      "Registra un lote de la Fase 4 en su recibo, que escribe el servidor. Se llama dos veces por lote cuando hay " +
      "git: ANTES del commit, con el contenido (titulo, estado, que_se_hizo, archivos, verificacion…), y el lote " +
      "queda con el commit pendiente; DESPUÉS del commit, con `lote` y `commit`, para anclarlo. El servidor comprueba " +
      "que el commit exista, esté en la rama actual y qué archivos toca. Sin git, una sola llamada con " +
      "`artifact_path` (se sella con su sha256) o `verification_note`. Nunca escribas recibos con write_central_doc.",
    en:
      "Records a Phase 4 batch in its receipt, which the server writes. With git it is called twice per batch: " +
      "BEFORE the commit, with the content (titulo, estado, que_se_hizo, archivos, verificacion…), and the batch " +
      "is left with its commit pending; AFTER the commit, with `lote` and `commit`, to anchor it. The server checks " +
      "that the commit exists, that it is on the current branch and which files it touches. Without git, a single call with " +
      "`artifact_path` (sealed with its sha256) or `verification_note`. Never write receipts with write_central_doc.",
  },
  "DESC-TOOL-GET-BATCH-STATUS-TITULO": { es: "Estado de los lotes", en: "Batch status" },
  "DESC-TOOL-GET-BATCH-STATUS": {
    es:
      "Cruza el plan de la Fase 3 con los recibos de la Fase 4: qué lote toca, cuál espera su commit, qué ancla tiene " +
      "cada uno y de dónde salió el recibo (servidor o a mano). Con `reverificar`, comprueba que cada commit siga en la " +
      "rama actual y que cada artefacto sellado no haya cambiado. Solo lee.",
    en:
      "Cross-checks the Phase 3 plan with the Phase 4 receipts: which batch is next, which one awaits its commit, which anchor " +
      "each one has and where its receipt came from (server or by hand). With `reverificar`, it checks that each commit is still on " +
      "the current branch and that each sealed artifact has not changed. Read-only.",
  },
  "DESC-TOOL-GET-ORCHESTRATOR-STATUS-TITULO": { es: "Estado de la instalación", en: "Installation status" },
  "DESC-TOOL-GET-ORCHESTRATOR-STATUS": {
    es:
      "Radiografía de la instalación: versión y ruta del paquete, variables y de dónde salió cada una, qué " +
      "archivo de prompt gana en cada fase, configuración (machine.json y presets), proyectos con su tarea activa, " +
      "manifiesto, preset, reglas y repos, y avisos. Úsala cuando algo no se comporte como esperas.",
    en:
      "X-ray of the installation: package version and path, variables and where each one came from, which " +
      "prompt file wins in each phase, configuration (machine.json and presets), projects with their active task, " +
      "manifest, preset, rules and repos, and warnings. Use it when something does not behave as you expect.",
  },
  "DESC-TOOL-READ-CROSS-REPO-TITULO": { es: "Leer archivo de repositorio", en: "Read repository file" },
  "DESC-TOOL-READ-CROSS-REPO": {
    es:
      "Lee un archivo de cualquier carpeta dentro de PHASE_GATE_REPOS_PATH. Si el proyecto declara repos en " +
      "phase-gate.json, usa read_repo_file.",
    en: "Reads a file from any folder inside PHASE_GATE_REPOS_PATH. If the project declares repos in phase-gate.json, use read_repo_file.",
  },
  "DESC-TOOL-READ-REPO-FILE-TITULO": { es: "Leer archivo de un repo del proyecto", en: "Read a file from a project repo" },
  "DESC-TOOL-READ-REPO-FILE": {
    es:
      "Lee un archivo de uno de los repos que declara el phase-gate.json del proyecto, por su id, esté donde esté " +
      "en este equipo. No lee nada de .git.",
    en:
      "Reads a file from one of the repos declared in the project's phase-gate.json, by its id, wherever it is " +
      "on this machine. It reads nothing from .git.",
  },
  "DESC-TOOL-REPO-STATUS-TITULO": { es: "Estado de git de los repos", en: "Git status of the repos" },
  "DESC-TOOL-REPO-STATUS": {
    es:
      "Rama, commit, adelante/atrás de su upstream y si el árbol está limpio, de un repo del proyecto o de todos los " +
      "de la tarea activa. Solo lee: no toma locks ni ejecuta comandos del repo (core.fsmonitor, filtros de .gitattributes).",
    en:
      "Branch, commit, ahead/behind its upstream and whether the tree is clean, for one project repo or for all " +
      "of the active task's repos. Read-only: it takes no locks and runs no repo commands (core.fsmonitor, .gitattributes filters).",
  },

  // ─── schemas.ts: mensajes de validación de los argumentos ───────────────────
  "TOOL-ARG-FALTA": {
    es: (p: { campo: string }) => `Falta \`${p.campo}\`.`,
    en: (p: { campo: string }) => `\`${p.campo}\` is missing.`,
  },
  "TOOL-ARG-TIPO": {
    es: (p: { campo: string; esperado: string }) => `\`${p.campo}\` debe ser ${TIPOS_ES[p.esperado] ?? p.esperado}.`,
    en: (p: { campo: string; esperado: string }) => `\`${p.campo}\` must be ${TIPOS_EN[p.esperado] ?? p.esperado}.`,
  },
  "TOOL-ARG-DEMASIADO-GRANDE": {
    es: (p: { campo: string }) => `\`${p.campo}\` es demasiado grande.`,
    en: (p: { campo: string }) => `\`${p.campo}\` is too large.`,
  },
  "TOOL-ARG-NO-VALIDO": {
    es: (p: { campo: string }) => `\`${p.campo}\` no es válido.`,
    en: (p: { campo: string }) => `\`${p.campo}\` is not valid.`,
  },
  "TOOL-ARG-NO-VACIO": {
    es: (p: { campo: string }) => `\`${p.campo}\` no puede ir vacío.`,
    en: (p: { campo: string }) => `\`${p.campo}\` cannot be empty.`,
  },
  "TOOL-ARG-PROJECT-VACIO": {
    es: "`project` no puede ir vacío: omítelo para deducirlo de la carpeta abierta.",
    en: "`project` cannot be empty: omit it to deduce it from the open folder.",
  },
  "TOOL-ARG-REDACCION": {
    es: '`redaccion` debe ser "es" o "en".',
    en: '`redaccion` must be "es" or "en".',
  },
  "TOOL-ARG-REPO-ID": {
    es: "`repo` es el id de un repo: minúsculas, números y guiones (ej. 'api').",
    en: "`repo` is a repo id: lowercase letters, digits and hyphens (e.g. 'api').",
  },
  "TOOL-ARG-TITULO-CONDICIONAL": {
    es: (p: { titulos: string }) => `\`titulo\` es uno de: ${p.titulos}.`,
    en: (p: { titulos: string }) => `\`titulo\` is one of: ${p.titulos}.`,
  },
  "TOOL-ARG-LOTE-RANGO": {
    es: "`lote` va de 1 a 99.",
    en: "`lote` goes from 1 to 99.",
  },
  "TOOL-ARG-MAX-CARACTERES": {
    es: (p: { campo: string; max: number }) => `\`${p.campo}\` no puede pasar de ${p.max} caracteres.`,
    en: (p: { campo: string; max: number }) => `\`${p.campo}\` cannot be longer than ${p.max} characters.`,
  },
  "TOOL-ARG-MAX-FILAS": {
    es: (p: { campo: string; max: number }) => `\`${p.campo}\` no puede tener más de ${p.max} filas.`,
    en: (p: { campo: string; max: number }) => `\`${p.campo}\` cannot have more than ${p.max} rows.`,
  },
  "TOOL-ARG-MAX-SECCIONES": {
    es: (p: { campo: string; max: number }) => `\`${p.campo}\` no puede tener más de ${p.max} secciones.`,
    en: (p: { campo: string; max: number }) => `\`${p.campo}\` cannot have more than ${p.max} sections.`,
  },
  "TOOL-ARG-ESTADO": {
    es: "`estado` es verificado, con pendientes, fallido o descartado (en inglés: verified, with pending items, failed, discarded).",
    en: "`estado` is one of: verified, with pending items, failed, discarded (or their Spanish names: verificado, con pendientes, fallido, descartado).",
  },

  // ─── schemas.ts: descripciones de los parámetros ────────────────────────────
  "DESC-ARG-PROYECTO": {
    es:
      "Proyecto: el nombre de una carpeta de proyecto de la Documentación Central. Si no existe, la " +
      "tool te devuelve los que hay. También los listan `list_tasks`, `get_orchestrator_status` y el recurso " +
      "`phase-gate://estado`.",
    en:
      "Project: the name of a project folder in the Central Documentation. If it does not exist, the " +
      "tool returns the existing ones. They are also listed by `list_tasks`, `get_orchestrator_status` and the " +
      "`phase-gate://estado` resource.",
  },
  "DESC-ARG-DEDUCIBLE": {
    es: " Si lo omites, se deduce de la carpeta que tienes abierta, si tu cliente la anuncia; si no se puede, la tool te lo pide.",
    en: " If you omit it, it is deduced from the folder you have open, if your client announces it; if that is not possible, the tool asks you for it.",
  },
  "DESC-ARG-QUE-ESCRIBE": {
    es: " Si lo omites, se deduce de la carpeta que tienes abierta, si tu cliente la anuncia y la coincidencia es firme; si no, la tool te lo pide.",
    en: " If you omit it, it is deduced from the folder you have open, if your client announces it and the match is strong; if not, the tool asks you for it.",
  },
  "DESC-ARG-FASE": {
    es:
      "Número de fase. Con los prompts de fábrica son 1 a 5; `get_orchestrator_status` y el recurso " +
      "`phase-gate://fases` listan las disponibles con su título y documento.",
    en:
      "Phase number. With the factory prompts they are 1 to 5; `get_orchestrator_status` and the " +
      "`phase-gate://fases` resource list the available ones with their title and document.",
  },
  "DESC-ARG-TAREA": {
    es: "Nombre de la carpeta de la tarea.",
    en: "Name of the task folder.",
  },
  "DESC-ARG-ARCHIVO": {
    es: "Nombre (o ruta relativa) del archivo dentro de la carpeta de la tarea (ej. '01 - Análisis Técnico.md').",
    en: "Name (or relative path) of the file inside the task folder (e.g. '01 - Technical Analysis.md').",
  },
  "DESC-ARG-START-TASK-NAME": {
    es: "Nombre de la tarea (creará una carpeta con este nombre).",
    en: "Task name (a folder with this name will be created).",
  },
  "DESC-ARG-START-INITIAL-CONTEXT": {
    es: "El contexto, correo o requerimiento inicial completo.",
    en: "The full initial context, email or requirement.",
  },
  "DESC-ARG-START-CREAR-PROYECTO": {
    es:
      "Solo para ESTRENAR un proyecto que todavía no existe. Déjalo sin poner salvo que el usuario te haya " +
      "dicho explícitamente que quiere crear un proyecto nuevo: sirve para que un nombre mal escrito no cree " +
      "una carpeta suelta en la Documentación.",
    en:
      "Only to CREATE a project that does not exist yet. Leave it unset unless the user explicitly told you " +
      "they want to create a new project: it keeps a misspelled name from creating a stray folder in the " +
      "Documentation. `create_project` is the same parameter in English.",
  },
  "DESC-ARG-START-CREATE-PROJECT": {
    es:
      "Alias en inglés de `crear_proyecto`: lo mismo, con las mismas reglas (solo para ESTRENAR un proyecto que el " +
      "usuario te pidió crear). Si pasas los dos, tienen que coincidir.",
    en:
      "English alias of `crear_proyecto`: only to CREATE a project that does not exist yet, when the user explicitly " +
      "asked for a new project. If you pass both, they must match.",
  },
  "DESC-ARG-START-REPOS": {
    es:
      "Solo si la tarea toca algunos de los repos que declara el phase-gate.json del proyecto, no todos: sus ids " +
      "(ej. ['api', 'web']). Sin esto, la tarea usa todos. Un id que no existe devuelve los válidos.",
    en:
      "Only if the task touches some of the repos declared in the project's phase-gate.json, not all of them: their ids " +
      "(e.g. ['api', 'web']). Without this, the task uses all of them. An id that does not exist returns the valid ones.",
  },
  "DESC-ARG-START-PRESET": {
    es:
      "Solo si esta tarea usa un preset distinto del de su proyecto (ej. 'ai-agent-ops' para el mantenimiento de " +
      "un agente). Si no existe, la tool devuelve los disponibles.",
    en:
      "Only if this task uses a preset different from its project's (e.g. 'ai-agent-ops' for the maintenance of " +
      "an agent). If it does not exist, the tool returns the available ones.",
  },
  "DESC-ARG-START-REDACCION": {
    es:
      "Solo si el contenido de los documentos de esta tarea se escribe en otro idioma que el del proyecto ('es' o " +
      "'en'). No cambia la estructura: los nombres de los documentos, los encabezados y las claves siguen siendo los " +
      "del idioma del proyecto.",
    en:
      "Only if the content of this task's documents is written in a language other than the project's ('es' or " +
      "'en'). It does not change the structure: document names, headings and keys stay those of the " +
      "project's language.",
  },
  "DESC-ARG-PROMPT-PROJECT": {
    es:
      "Proyecto: el nombre de una carpeta de proyecto de la Documentación Central. Pásalo siempre que lo sepas " +
      "—lo sabes por el repositorio que tienes abierto—: con él, el prompt sale con el preset, las reglas y la " +
      "configuración de ese proyecto, y se comprueba que no te saltas una fase (con su tarea activa). Si lo " +
      "omites, se deduce de la carpeta abierta si tu cliente la anuncia. Si no se puede deducir, o el proyecto no " +
      "existe, el prompt llega igual pero sin la configuración de ningún proyecto, y una nota al principio lo dice.",
    en:
      "Project: the name of a project folder in the Central Documentation. Always pass it when you know it " +
      "—you know it from the repository you have open—: with it, the prompt comes with that project's preset, rules " +
      "and configuration, and it is checked that you are not skipping a phase (against its active task). If you " +
      "omit it, it is deduced from the open folder if your client announces it. If it cannot be deduced, or the project does " +
      "not exist, the prompt still arrives but without any project's configuration, and a note at the top says so.",
  },
  "DESC-ARG-PROMPT-TASK-NAME": {
    es: "Solo si quieres comprobar contra una tarea distinta de la activa del proyecto. Normalmente se omite.",
    en: "Only if you want to check against a task other than the project's active one. Normally omitted.",
  },
  "DESC-ARG-ACTIVA-SUFIJO": {
    es: " Si lo omites, se devuelve la tarea activa de cada proyecto.",
    en: " If you omit it, the active task of each project is returned.",
  },
  "DESC-ARG-LISTAR-SUFIJO": {
    es: " Si lo omites, se listan todos.",
    en: " If you omit it, all of them are listed.",
  },
  "DESC-ARG-CAMBIAR-TASK-NAME": {
    es: "Nombre de la carpeta de la tarea a activar. Si no existe, la tool te devuelve las que sí.",
    en: "Name of the folder of the task to activate. If it does not exist, the tool returns the ones that do.",
  },
  "DESC-ARG-LEER-SUFIJO": {
    es: " Úsalo junto con task_name y file_name.",
    en: " Use it together with task_name and file_name.",
  },
  "DESC-ARG-LEER-FILE-PATH": {
    es:
      "ALTERNATIVA: ruta relativa dentro de la Documentación Central (ej. " +
      "'PROYECTO-A/Proyectos/tarea/01 - Análisis Técnico.md'). Solo si no usas project+task_name.",
    en:
      "ALTERNATIVE: relative path inside the Central Documentation (e.g. " +
      "'PROJECT-A/Proyectos/task/01 - Technical Analysis.md'). Only if you do not use project+task_name.",
  },
  "DESC-ARG-ESCRIBIR-FILE-PATH": {
    es:
      "ALTERNATIVA: ruta relativa dentro de la Documentación Central, que tiene que caer dentro de la carpeta " +
      "de una tarea que ya existe (ej. 'PROYECTO-A/Proyectos/tarea/01 - Análisis Técnico.md'). Los archivos " +
      "del proyecto no se escriben con esta tool. Solo si no usas project+task_name.",
    en:
      "ALTERNATIVE: relative path inside the Central Documentation, which must fall inside the folder " +
      "of a task that already exists (e.g. 'PROJECT-A/Proyectos/task/01 - Technical Analysis.md'). Project files " +
      "are not written with this tool. Only if you do not use project+task_name.",
  },
  "DESC-ARG-ESCRIBIR-CONTENT": {
    es: "Contenido a escribir.",
    en: "Content to write.",
  },
  "DESC-ARG-ESCRIBIR-FORCE": {
    es:
      "Permite reescribir un documento congelado o el contexto inicial. Solo se usa si tu cliente no puede " +
      "pedirle la confirmación al usuario directamente. Nunca lo pongas sin que el usuario lo haya confirmado en el chat.",
    en:
      "Allows rewriting a frozen document or the initial context. Only used if your client cannot " +
      "ask the user for confirmation directly. Never set it unless the user confirmed it in the chat.",
  },
  "DESC-ARG-CROSS-REPO-NAME": {
    es: "Nombre del repositorio (ej. 'repo-a', 'repo-b').",
    en: "Repository name (e.g. 'repo-a', 'repo-b').",
  },
  "DESC-ARG-CROSS-FILE-PATH": {
    es: "Ruta relativa del archivo dentro del repositorio (ej. 'src/main.ts').",
    en: "Relative path of the file inside the repository (e.g. 'src/main.ts').",
  },
  "DESC-ARG-REPO": {
    es:
      "Id del repo, tal como lo declara el phase-gate.json del proyecto (ej. 'api'). Los de la tarea salen en el " +
      "bloque CONFIGURACIÓN DEL PROYECTO de get_phase_prompt.",
    en:
      "Repo id, as declared in the project's phase-gate.json (e.g. 'api'). The task's repos appear in the " +
      "PROJECT CONFIGURATION block of get_phase_prompt.",
  },
  "DESC-ARG-REPO-FILE-PATH": {
    es: "Ruta relativa del archivo dentro del repo (ej. 'src/main.ts'). No puede entrar en .git.",
    en: "Relative path of the file inside the repo (e.g. 'src/main.ts'). It cannot go into .git.",
  },
  "DESC-ARG-REPO-STATUS-SUFIJO": {
    es: " Si lo omites, se devuelven los repos de la tarea activa.",
    en: " If you omit it, the active task's repos are returned.",
  },
  "DESC-ARG-LOTE-TASK-NAME": {
    es: "Nombre de la carpeta de la tarea. Si lo omites, la tarea activa del proyecto.",
    en: "Name of the task folder. If you omit it, the project's active task.",
  },
  "DESC-ARG-LOTE": {
    es: "Número del lote, el de la tabla de lotes del plan (L02 es 2).",
    en: "Batch number, the one in the plan's batch table (L02 is 2).",
  },
  "DESC-ARG-LOTE-TITULO": {
    es: "El objetivo del lote, en una frase. Da el nombre del recibo.",
    en: "The batch goal, in one sentence. It gives the receipt its name.",
  },
  "DESC-ARG-LOTE-REPO-SUFIJO": {
    es: " Si la tarea tiene un solo repo, se omite.",
    en: " If the task has a single repo, omit it.",
  },
  "DESC-ARG-LOTE-ESTADO": {
    es: "Cómo quedó el lote tras su verificación.",
    en: "How the batch ended up after its verification.",
  },
  "DESC-ARG-LOTE-QUE-SE-HIZO": {
    es: "Una o dos frases, con el número que importe.",
    en: "One or two sentences, with the number that matters.",
  },
  "DESC-ARG-LOTE-ARCHIVOS": {
    es: "Los archivos del lote, relativos a la raíz del repo, y qué cambió en cada uno. El servidor los compara con los del commit.",
    en: "The batch's files, relative to the repo root, and what changed in each one. The server compares them with the commit's.",
  },
  "DESC-ARG-LOTE-VERIFICACION": {
    es: "Lo que ejecutaste para verificar el lote, con su resultado en números.",
    en: "What you ran to verify the batch, with its result in numbers.",
  },
  "DESC-ARG-LOTE-ESPERA": {
    es: "Las pruebas que solo puede hacer el usuario, con su resultado esperado.",
    en: "The tests only the user can run, with their expected result.",
  },
  "DESC-ARG-LOTE-DESVIOS": {
    es: "Lo que no salió como decía el plan. Vacío si no hubo.",
    en: "What did not go as the plan said. Empty if nothing.",
  },
  "DESC-ARG-LOTE-DECISIONES": {
    es: "Las decisiones D<n> nuevas de este lote, cada una con su Base. Vacío si no hubo.",
    en: "The new D<n> decisions of this batch, each with its Basis. Empty if none.",
  },
  "DESC-ARG-LOTE-CONDICIONALES": {
    es: "Las secciones condicionales del recibo que apliquen (Lo que sigue igual, Reversión, Aviso a alguien más, Deuda anotada).",
    en:
      "The receipt's conditional sections that apply; `titulo` is one of Lo que sigue igual, Reversión, Aviso a alguien más, " +
      "Deuda anotada (what stays the same, rollback, heads-up to someone else, debt noted).",
  },
  "DESC-ARG-LOTE-COMMIT": {
    es: "El hash del commit del lote (de 7 a 40 caracteres hexadecimales), cuando exista. Sin él, el lote queda con el commit pendiente.",
    en: "The hash of the batch's commit (7 to 40 hexadecimal characters), once it exists. Without it, the batch is left with its commit pending.",
  },
  "DESC-ARG-LOTE-ARTIFACT": {
    es: "Sin git: el archivo que cambió, relativo a la raíz del repo del lote o, sin repo, a la carpeta del proyecto. El servidor lo sella con su sha256.",
    en: "Without git: the file that changed, relative to the root of the batch's repo or, without a repo, to the project folder. The server seals it with its sha256.",
  },
  "DESC-ARG-LOTE-NOTE": {
    es: "Sin git y sin archivo que sellar, o en un lote fallido o descartado: qué se comprobó o qué pasó.",
    en: "Without git and without a file to seal, or in a failed or discarded batch: what was checked or what happened.",
  },
  "DESC-ARG-LOTE-CERRAR": {
    es:
      "Solo si el usuario decidió cerrar la Fase 4 sin hacer los lotes que faltan, o con lotes fallidos. Los que no tienen " +
      "recibo quedan descartados con `motivo_descarte`. Pide confirmación al usuario. Al anclar el último lote, la fase se " +
      "cierra sola: no hace falta.",
    en:
      "Only if the user decided to close Phase 4 without doing the remaining batches, or with failed batches. Those without " +
      "a receipt are discarded with `motivo_descarte`. Ask the user for confirmation. When the last batch is anchored, the phase " +
      "closes by itself: this is not needed.",
  },
  "DESC-ARG-LOTE-MOTIVO": {
    es: "Con `cerrar_fase`: por qué se descartan los lotes que faltan, dicho por el usuario.",
    en: "With `cerrar_fase`: why the remaining batches are discarded, as the user put it.",
  },
  "DESC-ARG-LOTE-REANCLAR": {
    es:
      "Solo para cambiar el ancla de un recibo sellado, por ejemplo cuando un rebase o un squash cambió el SHA: con `lote` " +
      "y el `commit` nuevo (o `artifact_path`). El contenido del lote no cambia. Pide confirmación al usuario.",
    en:
      "Only to change the anchor of a sealed receipt, for example when a rebase or a squash changed the SHA: with `lote` " +
      "and the new `commit` (or `artifact_path`). The batch content does not change. Ask the user for confirmation.",
  },
  "DESC-ARG-LOTE-FORCE": {
    es:
      "Solo si tu cliente no puede pedirle la confirmación al usuario directamente y el usuario la dio en el chat. " +
      "Nunca lo pongas sin esa confirmación.",
    en:
      "Only if your client cannot ask the user for confirmation directly and the user gave it in the chat. " +
      "Never set it without that confirmation.",
  },
  "DESC-ARG-REVERIFICAR": {
    es: "Repite la verificación de cada ancla: que su commit siga en la rama actual (tras un rebase o un squash) y que el sha256 de cada artefacto siga igual.",
    en: "Repeats the check of each anchor: that its commit is still on the current branch (after a rebase or a squash) and that each artifact's sha256 is unchanged.",
  },

  // ─── prompts-mcp.ts: los /fN ────────────────────────────────────────────────
  "MCPPROMPT-ARG-PROJECT": {
    es: "Proyecto en el que estás trabajando.",
    en: "Project you are working on.",
  },
  "MCPPROMPT-ARG-TASK-NAME": {
    es: "Nombre corto de la tarea nueva.",
    en: "Short name of the new task.",
  },
  "MCPPROMPT-ARG-CONTEXTO": {
    es: "El correo, mensaje o requerimiento completo.",
    en: "The full email, message or requirement.",
  },
  "MCPPROMPT-ARG-COMMITS": {
    es: "Rango de commits a auditar. Si lo omites, se toman de los recibos de la Fase 4.",
    en: "Range of commits to audit. If you omit it, they are taken from the Phase 4 receipts.",
  },
  "MCPPROMPT-TITULO": {
    es: (p: { numero: number; titulo: string }) => `Fase ${p.numero} · ${p.titulo}`,
    en: (p: { numero: number; titulo: string }) => `Phase ${p.numero} · ${p.titulo}`,
  },
  "MCPPROMPT-DESCRIPCION": {
    es: (p: { numero: number; titulo: string }) => `Arranca la Fase ${p.numero} (${p.titulo}) del flujo de mcp-phase-gate.`,
    en: (p: { numero: number; titulo: string }) => `Starts Phase ${p.numero} (${p.titulo}) of the mcp-phase-gate flow.`,
  },
  "MCPPROMPT-GENERICO": {
    es: (p: { numero: number; titulo: string }) =>
      [
        `Vas a iniciar la FASE ${p.numero} (${p.titulo}) del flujo del mcp-phase-gate.`,
        "",
        "Pasos:",
        "1. Si no sabes cuál es la tarea activa, llama a `get_active_task` (o pídeme project + task_name).",
        `2. Llama a \`get_phase_prompt(${p.numero})\` indicándole también el \`project\` en el que estoy trabajando, y asume ese rol.`,
        "3. Lee los documentos de las fases anteriores con `read_central_doc`; `get_phase_prompt` te dio sus nombres exactos.",
        "4. Sigue el prompt de la fase y guarda su documento con `write_central_doc`, con el nombre que te indicó `get_phase_prompt`.",
      ].join("\n"),
    en: (p: { numero: number; titulo: string }) =>
      [
        `You are about to start PHASE ${p.numero} (${p.titulo}) of the mcp-phase-gate flow.`,
        "",
        "Steps:",
        "1. If you don't know which task is active, call `get_active_task` (or ask me for project + task_name).",
        `2. Call \`get_phase_prompt(${p.numero})\`, also passing the \`project\` I am working on, and take on that role.`,
        "3. Read the documents of the previous phases with `read_central_doc`; `get_phase_prompt` gave you their exact names.",
        "4. Follow the phase prompt and save its document with `write_central_doc`, under the name `get_phase_prompt` gave you.",
      ].join("\n"),
  },
  "MCPPROMPT-DATOS-ENCABEZADO": {
    es: "## Datos de esta invocación",
    en: "## Data for this invocation",
  },
  "MCPPROMPT-LOG-COMANDO-ILEGIBLE": {
    es: (p: { archivo: string; error: string }) => `No se pudo leer ${p.archivo}; se usa el texto genérico: ${p.error}`,
    en: (p: { archivo: string; error: string }) => `Could not read ${p.archivo}; the generic text is used instead: ${p.error}`,
  },
  "MCPPROMPT-LOG-SINCRONIZAR": {
    es: (p: { error: string }) => `No se pudieron sincronizar los prompts /fN: ${p.error}`,
    en: (p: { error: string }) => `The /fN prompts could not be synchronized: ${p.error}`,
  },
} satisfies Catalogo;
