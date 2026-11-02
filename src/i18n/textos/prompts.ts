// Messages of the "prompts" group (see i18n/mensajes.ts): each code with its text in Spanish and in English;
// the English follows the glossary in docs/glosario.md.

import { VOCABULARIO } from "../../vocabulario.js";
import type { Catalogo } from "./tipos.js";

// The origins of a preset (OrigenDelPreset in capas.ts) as they are told to a person in English.
// In Spanish, the canonical value as it is.
const ORIGEN_DEL_PRESET_EN: Record<string, string> = {
  "de la tarea": "from the task",
  "del proyecto": "from the project",
  "de machine.json": "from machine.json",
  "por defecto": "default",
};

export const TEXTOS_PROMPTS = {
  // ─── capas.ts ─────────────────────────────────────────────────────────────
  "CAPA-TXT-ORIGEN-PRESET": {
    es: (p: { origen: string }) => p.origen,
    en: (p: { origen: string }) => ORIGEN_DEL_PRESET_EN[p.origen] ?? p.origen,
  },
  "CAPA-TXT-ORIGEN-SIN-MANIFIESTO": {
    es: "por defecto; este proyecto no tiene phase-gate.json",
    en: "default; this project has no phase-gate.json",
  },
  "CAPA-TXT-PRESET-DESCONOCIDO": {
    es: (p: { nombre: string; origen: string; disponibles: string }) =>
      `No existe el preset "${p.nombre}" (${p.origen}). Los disponibles son: ${p.disponibles}.`,
    en: (p: { nombre: string; origen: string; disponibles: string }) =>
      `There is no preset "${p.nombre}" (${p.origen}). Available presets: ${p.disponibles}.`,
  },
  "CAPA-TXT-CONFIG-PRESET": {
    es: (p: { nombre: string; origen: string; idioma: string }) => `- Preset: \`${p.nombre}\` (${p.origen}) · Idioma: ${p.idioma}`,
    en: (p: { nombre: string; origen: string; idioma: string }) => `- Preset: \`${p.nombre}\` (${p.origen}) · Language: ${p.idioma}`,
  },
  "CAPA-TXT-CONFIG-LOTES": {
    es: (p: { lotes: boolean; commits: string }) => `- Lotes: ${p.lotes ? "sí" : "no"} · Commits: ${p.commits}`,
    en: (p: { lotes: boolean; commits: string }) => `- Batches: ${p.lotes ? "yes" : "no"} · Commits: ${p.commits}`,
  },
  "CAPA-TXT-CONFIG-REPOS": {
    es: "- Repositorios de esta tarea:",
    en: "- Repositories of this task:",
  },
  "CAPA-TXT-CONFIG-SIN-RUTA": {
    es: (p: { error: string | null }) => `sin ruta (${p.error ?? "no se pudo resolver"})`,
    en: (p: { error: string | null }) => `no path (${p.error ?? "could not be resolved"})`,
  },
  "CAPA-TXT-CONFIG-REPO-NO-EXISTE": {
    es: " · no existe en este equipo",
    en: " · does not exist on this machine",
  },
  "CAPA-TXT-CONFIG-VERIFICACION": {
    es: (p: { comandos: string }) => `- Comandos de verificación del proyecto: ${p.comandos}`,
    en: (p: { comandos: string }) => `- Project verification commands: ${p.comandos}`,
  },
  "CAPA-TXT-CONFIG-PR-POR-REPO": {
    es: "- Una descripción de PR por repositorio (fase5.prPorRepo).",
    en: "- One PR description per repository (fase5.prPorRepo).",
  },
  "CAPA-TXT-CONFIG-USA-IDS": {
    es: "Usa `read_repo_file` y `repo_status` con estos ids.",
    en: "Use `read_repo_file` and `repo_status` with these ids.",
  },
  "BLOQUE-HUERFANO": {
    es: (p: { id: string; archivo: string; linea: number }) =>
      `El bloque «${p.id}» de ${p.archivo}:${p.linea} no encaja en ninguna ranura y se ignoró.`,
    en: (p: { id: string; archivo: string; linea: number }) =>
      `Block «${p.id}» from ${p.archivo}:${p.linea} fits no slot and was ignored.`,
  },
  "CAPA-TXT-NOTA-HUERFANO": {
    es: (p: { id: string; archivo: string; linea: number }) =>
      `> Nota del servidor: el bloque «${p.id}» de ${p.archivo}:${p.linea} no encaja en ninguna ranura y se ignoró.`,
    en: (p: { id: string; archivo: string; linea: number }) =>
      `> Server note: block «${p.id}» from ${p.archivo}:${p.linea} fits no slot and was ignored.`,
  },
  // For a finding that was not built here (so without its data): the text it carries, with the note in front.
  "CAPA-TXT-NOTA-DEL-SERVIDOR": {
    es: (p: { texto: string }) => `> Nota del servidor: ${p.texto.replace(/^El bloque/, "el bloque")}`,
    en: (p: { texto: string }) => `> Server note: ${p.texto}`,
  },
  "CAPA-TXT-FASE-NO-VALIDA": {
    es: (p: { lista: string }) => `Fase no válida. Las fases disponibles son: ${p.lista}.`,
    en: (p: { lista: string }) => `Invalid phase. Available phases: ${p.lista}.`,
  },
  "CAPA-TXT-SIN-PROMPTS": {
    es: (p: { rutas: string }) =>
      `No se encontró ningún prompt de fase en ${p.rutas}. Verifica que la carpeta 'prompts/es' exista junto al build.`,
    en: (p: { rutas: string }) =>
      `No phase prompt was found in ${p.rutas}. Check that the 'prompts/es' folder exists next to the build.`,
  },
  "GLOBAL-REINYECTADO": {
    es: (p: { archivo: string; titulos: string[] }) =>
      `Tu global-rules.md (${p.archivo}) sustituye al de fábrica y no tiene ` +
      `${p.titulos.map((titulo) => `"## ${titulo}"`).join(" ni ")}: se añaden al final las de fábrica. ` +
      "La forma recomendada de cambiar las reglas globales es un bloques.md con `global/cero-rupturas`, " +
      "`global/evidencia` o `global/extra`.",
    en: (p: { archivo: string; titulos: string[] }) =>
      `Your global-rules.md (${p.archivo}) replaces the factory one and does not have ` +
      `${p.titulos.map((titulo) => `"## ${titulo}"`).join(" or ")}: the factory ones are appended at the end. ` +
      "The recommended way to change the global rules is a bloques.md with `global/cero-rupturas`, " +
      "`global/evidencia` or `global/extra`.",
  },

  // ─── bloques.ts ───────────────────────────────────────────────────────────
  // With `error`, the file could not be read; otherwise `motivo` says what is wrong on line `linea`.
  "BLOQUE-MAL-FORMADO": {
    es: (p: { archivo: string; linea?: number; motivo?: string; error?: string }) =>
      p.error !== undefined
        ? `${p.archivo}: no se pudo leer (${p.error}).`
        : `${p.archivo}:${p.linea}: ${p.motivo}. Se ignora el archivo entero.`,
    en: (p: { archivo: string; linea?: number; motivo?: string; error?: string }) =>
      p.error !== undefined
        ? `${p.archivo}: could not be read (${p.error}).`
        : `${p.archivo}:${p.linea}: ${p.motivo}. The whole file is ignored.`,
  },
  "BLOQUE-TXT-ANIDADO": {
    es: (p: { linea: number }) => `un bloque se abre dentro de otro (el de la línea ${p.linea})`,
    en: (p: { linea: number }) => `a block opens inside another one (the one on line ${p.linea})`,
  },
  "BLOQUE-TXT-CIERRE-SUELTO": {
    es: "cierre de bloque sin apertura",
    en: "block close without an opening",
  },
  "BLOQUE-TXT-MARCADOR-MAL-ESCRITO": {
    es: "marcador de bloque mal escrito",
    en: "badly written block marker",
  },
  "BLOQUE-TXT-SIN-CERRAR": {
    es: "bloque sin cerrar",
    en: "block not closed",
  },
  "BLOQUE-DUPLICADO": {
    es: (p: { archivo: string; linea: number; id: string }) =>
      `${p.archivo}:${p.linea}: el bloque «${p.id}» ya aparece antes en el archivo; vale el primero.`,
    en: (p: { archivo: string; linea: number; id: string }) =>
      `${p.archivo}:${p.linea}: block «${p.id}» already appears earlier in the file; the first one counts.`,
  },

  // ─── phases.ts ────────────────────────────────────────────────────────────
  "FASE-TXT-MARCADOR-NO-RECONOCIDO": {
    es: (p: { archivo: string }) => `${p.archivo} tiene un marcador de ranura que no se reconoce: llega tal cual al modelo.`,
    en: (p: { archivo: string }) => `${p.archivo} has a slot marker that is not recognized: it reaches the model as is.`,
  },
  "FASE-TXT-RECIBOS-CON-PUNTO": {
    es: "no puede empezar por punto.",
    en: "it cannot start with a dot.",
  },
  "FASE-TXT-RECIBOS-IGNORADO": {
    es: (p: { archivo: string; motivo: string }) => `Se ignora el frontmatter recibos de ${p.archivo}: ${p.motivo}`,
    en: (p: { archivo: string; motivo: string }) => `The recibos frontmatter of ${p.archivo} is ignored: ${p.motivo}`,
  },
  "FASE-TXT-RECIBOS-CHOCAN": {
    es: (p: { archivo: string; recibos: string }) =>
      `Se ignora el frontmatter recibos de ${p.archivo}: ` + `"${p.recibos}" es el nombre de un documento de fase.`,
    en: (p: { archivo: string; recibos: string }) =>
      `The recibos frontmatter of ${p.archivo} is ignored: ` + `"${p.recibos}" is the name of a phase document.`,
  },
  // The ARCHIVOS DE ESTA TAREA block, in the project's language.
  "FASE-TXT-DOCUMENTO-PREVIO": {
    es: (p: { numero: number; documento: string; recibos: string | null }) =>
      `- Fase ${p.numero}: \`${p.documento}\`${p.recibos ? ` (recibos de lote en \`${p.recibos}/\`)` : ""}`,
    en: (p: { numero: number; documento: string; recibos: string | null }) =>
      `- Phase ${p.numero}: \`${p.documento}\`${p.recibos ? ` (batch receipts in \`${p.recibos}/\`)` : ""}`,
  },
  "FASE-TXT-LEE-PREVIOS": {
    es: "Documentos de las fases anteriores, léelos con `read_central_doc`:",
    en: "Documents of the previous phases; read them with `read_central_doc`:",
  },
  "FASE-TXT-DOCUMENTO-DE-LOTES": {
    es: (p: { documento: string }) =>
      `El documento de esta fase se llama exactamente \`${p.documento}\`. Lo genera \`record_batch\` al ` +
      "cerrar el último lote: no lo escribas con `write_central_doc`.",
    en: (p: { documento: string }) =>
      `This phase's document is named exactly \`${p.documento}\`. \`record_batch\` generates it when ` +
      "the last batch is closed: do not write it with `write_central_doc`.",
  },
  "FASE-TXT-RECIBOS-DE-LOTE": {
    es: (p: { recibos: string }) =>
      `Los recibos de lote van en la subcarpeta \`${p.recibos}/\`, uno por lote: ` +
      `\`${p.recibos}/L01 - <slug>.md\`. Los escribe \`record_batch\`, también con un solo lote ` +
      "mientras está abierto.",
    en: (p: { recibos: string }) =>
      `Batch receipts go in the \`${p.recibos}/\` subfolder, one per batch: ` +
      `\`${p.recibos}/L01 - <slug>.md\`. \`record_batch\` writes them, also with a single batch ` +
      "while it is open.",
  },
  "FASE-TXT-DOCUMENTO-PROPIO": {
    es: (p: { documento: string }) =>
      `El documento de esta fase se llama exactamente \`${p.documento}\`. Guárdalo con ` +
      "`write_central_doc` en la carpeta de la tarea activa, con ese nombre y sin cambiarlo.",
    en: (p: { documento: string }) =>
      `This phase's document is named exactly \`${p.documento}\`. Save it with ` +
      "`write_central_doc` in the active task's folder, with that name and without changing it.",
  },
  "FASE-TXT-SIN-DOCUMENTO": {
    es: "Esta fase no deja documento en la Documentación Central: su salida va en el chat.",
    en: "This phase leaves no document in the Central Documentation: its output goes in the chat.",
  },

  // ─── tasks.ts ─────────────────────────────────────────────────────────────
  "TAREA-ESTADO-VIEJO-ELIMINADO": {
    es: (p: { ruta: string }) => `Estado en formato anterior eliminado: ${p.ruta}`,
    en: (p: { ruta: string }) => `State in the previous format deleted: ${p.ruta}`,
  },
  "TAREA-PRESENCIA-DOCUMENTO": {
    es: (p: { documento: string }) => `existe \`${p.documento}\``,
    en: (p: { documento: string }) => `\`${p.documento}\` exists`,
  },
  "TAREA-PRESENCIA-RECIBOS": {
    es: (p: { recibos: string }) => `existen recibos en \`${p.recibos}/\``,
    en: (p: { recibos: string }) => `receipts exist in \`${p.recibos}/\``,
  },
  "TAREA-MOTIVO-CONTEXTO-INICIAL": {
    es: "El contexto inicial está siempre protegido: es el único documento que no se puede regenerar leyendo el código.",
    en: "The initial context is always protected: it is the only document that cannot be regenerated by reading the code.",
  },
  "TAREA-MOTIVO-RECIBO": {
    es: "Los recibos los escribe `record_batch`.",
    en: "Receipts are written by `record_batch`.",
  },
  "TAREA-MOTIVO-DOCUMENTO-DE-LOTES": {
    es: "Este documento lo genera `record_batch` al cerrar el último lote.",
    en: "This document is generated by `record_batch` when the last batch is closed.",
  },
  "TAREA-MOTIVO-CONGELADO": {
    es: (p: { relativo: string; fase: number; presencia: string }) =>
      `\`${p.relativo}\` está congelado: la Fase ${p.fase} ya está en curso o cerrada (${p.presencia}).`,
    en: (p: { relativo: string; fase: number; presencia: string }) =>
      `\`${p.relativo}\` is frozen: Phase ${p.fase} is already in progress or closed (${p.presencia}).`,
  },
  // describeEstado: the short chat sentence about a task's phase.
  "TAREA-ESTADO-DESCONOCIDO": {
    es: "fase desconocida (ningún prompt de fase declara documento, así que no hay nada que deducir)",
    en: "unknown phase (no phase prompt declares a document, so there is nothing to deduce)",
  },
  "TAREA-ESTADO-TERMINADA": {
    es: "terminada: todas las fases dejaron su documento",
    en: "finished: every phase left its document",
  },
  "TAREA-PROGRESO-SIN-LOTES": {
    es: "; el plan no declara lotes",
    en: "; the plan declares no batches",
  },
  "TAREA-PROGRESO-COMMIT-PENDIENTE": {
    es: (p: { lote: number; total: number }) => `, lote ${p.lote} de ${p.total}, commit pendiente`,
    en: (p: { lote: number; total: number }) => `, batch ${p.lote} of ${p.total}, pending commit`,
  },
  "TAREA-PROGRESO-LOTE": {
    es: (p: { lote: number; total: number }) => `, lote ${p.lote} de ${p.total}`,
    en: (p: { lote: number; total: number }) => `, batch ${p.lote} of ${p.total}`,
  },
  "TAREA-PROGRESO-CERRADOS": {
    es: (p: { cerrados: number; total: number }) => `, ${p.cerrados} de ${p.total} lotes cerrados`,
    en: (p: { cerrados: number; total: number }) => `, ${p.cerrados} of ${p.total} ${p.total === 1 ? "batch" : "batches"} closed`,
  },
  // `progreso` starts with ", " or "; " (or is empty): with no title, it goes in parentheses without that start.
  "TAREA-VA-EN-FASE": {
    es: (p: { fase: number; titulo: string | null; progreso: string }) =>
      p.titulo
        ? `va en Fase ${p.fase} (${p.titulo}${p.progreso})`
        : `va en Fase ${p.fase}${p.progreso ? ` (${p.progreso.replace(/^[,;] /, "")})` : ""}`,
    en: (p: { fase: number; titulo: string | null; progreso: string }) =>
      p.titulo
        ? `in Phase ${p.fase} (${p.titulo}${p.progreso})`
        : `in Phase ${p.fase}${p.progreso ? ` (${p.progreso.replace(/^[,;] /, "")})` : ""}`,
  },
  "TAREA-FASES-HECHAS": {
    es: (p: { siguiente: string; hechas: number[] }) => `${p.siguiente}; hechas: ${p.hechas.join(", ")}`,
    en: (p: { siguiente: string; hechas: number[] }) => `${p.siguiente}; done: ${p.hechas.join(", ")}`,
  },
  "TAREA-SIN-DOCUMENTOS": {
    es: (p: { siguiente: string }) => `${p.siguiente}; todavía sin documentos`,
    en: (p: { siguiente: string }) => `${p.siguiente}; no documents yet`,
  },
  // The gate, at the start of the prompt (in the project's language).
  "COMPUERTA-AMBIGUA": {
    es:
      "> Nota: no se comprobó la compuerta de fase porque no se indicó `project` y hay varios " +
      "proyectos con tarea activa. Pasa `project` para que se compruebe.",
    en:
      "> Note: the phase gate was not checked because `project` was not given and several " +
      "projects have an active task. Pass `project` so it is checked.",
  },
  "COMPUERTA-PEDISTE": {
    es: (p: { fase: number; tarea: string }) =>
      `Pediste la Fase ${p.fase}, pero la tarea "${p.tarea}" no tiene los documentos de fases anteriores:`,
    en: (p: { fase: number; tarea: string }) =>
      `You asked for Phase ${p.fase}, but task "${p.tarea}" does not have the documents of earlier phases:`,
  },
  "COMPUERTA-FALTA": {
    es: (p: { fase: number; documento: string }) => `- Fase ${p.fase}: falta \`${p.documento}\``,
    en: (p: { fase: number; documento: string }) => `- Phase ${p.fase}: \`${p.documento}\` is missing`,
  },
  "COMPUERTA-VA-EN": {
    es: (p: { fase: number; titulo: string | null; pedida: number }) =>
      `Esta tarea va en la ${p.titulo ? `Fase ${p.fase} (${p.titulo})` : `Fase ${p.fase}`}. ` +
      `NO hagas el trabajo de la Fase ${p.pedida} sobre documentos que no existen ` +
      "ni te los inventes a partir del contexto del chat.",
    en: (p: { fase: number; titulo: string | null; pedida: number }) =>
      `This task is in ${p.titulo ? `Phase ${p.fase} (${p.titulo})` : `Phase ${p.fase}`}. ` +
      `Do NOT do the work of Phase ${p.pedida} on documents that do not exist, ` +
      "and do not make them up from the chat context.",
  },
  "COMPUERTA-PREGUNTA": {
    es:
      "Díselo al usuario antes de nada y pregúntale si prefiere hacer primero la fase que falta o continuar de todos " +
      "modos. Lo que sigue es el prompt de la fase que pediste: aplícalo solo después de resolver esto con el usuario.",
    en:
      "Tell the user before anything else and ask whether they prefer to do the missing phase first or continue " +
      "anyway. What follows is the prompt of the phase you asked for: apply it only after resolving this with the user.",
  },
  // RECIBOS QUE YA EXISTEN, at the end of the prompt (in the project's language).
  "TAREA-RECIBOS-LEELOS": {
    es: "Léelos con `read_central_doc` usando estas rutas tal cual:",
    en: "Read them with `read_central_doc` using these paths exactly as they are:",
  },
  "TAREA-RECIBO-EXISTENTE": {
    es: (p: { fase: number; ruta: string }) => `- Fase ${p.fase}: \`${p.ruta}\``,
    en: (p: { fase: number; ruta: string }) => `- Phase ${p.fase}: \`${p.ruta}\``,
  },
  // PENDIENTES HEREDADOS (detected by the server), in the project's language. `valor` is the status as the
  // receipt carries it; `estado`, the canonical one.
  "PENDIENTES-SECCION": {
    es: (p: { documento: string; encabezado: string }) => `- \`${p.documento}\` tiene una sección \`${p.encabezado}\`.`,
    en: (p: { documento: string; encabezado: string }) => `- \`${p.documento}\` has a \`${p.encabezado}\` section.`,
  },
  "PENDIENTES-ESTADO": {
    es: (p: { relativo: string; valor: string }) => `- \`${p.relativo}\`: estado \`${p.valor}\`.`,
    en: (p: { relativo: string; valor: string; estado: keyof typeof VOCABULARIO.en.recibo.estados }) =>
      `- \`${p.relativo}\`: status \`${VOCABULARIO.en.recibo.estados[p.estado] ?? p.valor}\`.`,
  },
  "PENDIENTES-NOMBRALOS": {
    es: (p: { seccion: string }) => `Nómbraselos al usuario antes de empezar (ver ${p.seccion} en las reglas globales).`,
    en: (p: { seccion: string }) => `Name them to the user before starting (see ${p.seccion} in the global rules).`,
  },

  // ─── eject.ts ─────────────────────────────────────────────────────────────
  "EJECT-GLOBAL-RULES": {
    es: "global-rules entero no se puede ejectar: su forma soportada son sus ranuras (global/cero-rupturas, global/evidencia, global/extra).",
    en: "global-rules cannot be ejected whole: the supported way is its slots (global/cero-rupturas, global/evidencia, global/extra).",
  },
  "EJECT-OBJETIVO-INVALIDO": {
    es: (p: { texto: string }) => `"${p.texto}" no es un objetivo válido: fase-N, fase-N/<ranura>, global/<ranura>, comando-fN o preset:<nombre>.`,
    en: (p: { texto: string }) => `"${p.texto}" is not a valid target: fase-N, fase-N/<slot>, global/<slot>, comando-fN or preset:<name>.`,
  },
  "EJECT-ETIQUETA-GLOBAL": {
    es: "la capa global",
    en: "the global layer",
  },
  "EJECT-ETIQUETA-PROYECTO": {
    es: (p: { proyecto: string }) => `la capa del proyecto ${p.proyecto}`,
    en: (p: { proyecto: string }) => `the layer of project ${p.proyecto}`,
  },
  "EJECT-FALTA-DESTINO": {
    es: "Falta --a global o --a proyecto:<NOMBRE>: dónde copiarlo.",
    en: "Missing --a global or --a proyecto:<NAME>: where to copy it.",
  },
  "EJECT-YA-EXISTE": {
    es: (p: { que: string }) => `${p.que} ya existe. No se toca; con --fuerza se reemplaza dejando copia.`,
    en: (p: { que: string }) => `${p.que} already exists. It is left untouched; with --fuerza it is replaced, keeping a copy.`,
  },
  "EJECT-BLOQUE-DE": {
    es: (p: { id: string; archivo: string }) => `El bloque «${p.id}» de ${p.archivo}`,
    en: (p: { id: string; archivo: string }) => `Block «${p.id}» in ${p.archivo}`,
  },
  "EJECT-FASE-NO-EXISTE": {
    es: (p: { numero: number }) => `La fase ${p.numero} no existe en los prompts de fábrica.`,
    en: (p: { numero: number }) => `Phase ${p.numero} does not exist in the factory prompts.`,
  },
  "EJECT-OTRO-ARCHIVO-DE-FASE": {
    es: (p: { carpeta: string; numero: number; otros: string[] }) =>
      `En ${p.carpeta} ya hay otro archivo de la fase ${p.numero} (${p.otros.join(", ")}): bórralo o renómbralo primero.`,
    en: (p: { carpeta: string; numero: number; otros: string[] }) =>
      `${p.carpeta} already has another file for phase ${p.numero} (${p.otros.join(", ")}): delete or rename it first.`,
  },
  "EJECT-RANURA-NO-EXISTE": {
    es: (p: { archivo: string; ranura: string; disponibles: string[] }) =>
      `${p.archivo} no tiene la ranura "${p.ranura}". Las que tiene: ${p.disponibles.join(", ")}.`,
    en: (p: { archivo: string; ranura: string; disponibles: string[] }) =>
      `${p.archivo} has no slot "${p.ranura}". Its slots: ${p.disponibles.join(", ")}.`,
  },
  "EJECT-ARCHIVO-NO-EXISTE": {
    es: (p: { archivo: string }) => `No existe ${p.archivo === "global" ? "global-rules.md" : `la ${p.archivo}`} en ninguna capa.`,
    en: (p: { archivo: string }) => `${p.archivo === "global" ? "global-rules.md" : p.archivo} does not exist in any layer.`,
  },
  "EJECT-COMANDO-SIN-FASE": {
    es: (p: { numero: number }) => `La fase ${p.numero} no existe: no hay /f${p.numero} que copiar.`,
    en: (p: { numero: number }) => `Phase ${p.numero} does not exist: there is no /f${p.numero} to copy.`,
  },
  "EJECT-PRESET-NO-EXISTE": {
    es: (p: { nombre: string; disponibles: string }) => `No existe el preset "${p.nombre}". Los disponibles son: ${p.disponibles}.`,
    en: (p: { nombre: string; disponibles: string }) => `There is no preset "${p.nombre}". Available presets: ${p.disponibles}.`,
  },
  "EJECT-PRESET-SIN-ARCHIVO": {
    es: (p: { nombre: string }) => `"${p.nombre}" no tiene archivo: son los prompts de fábrica, sin bloques.`,
    en: (p: { nombre: string }) => `"${p.nombre}" has no file: it is the factory prompts, without blocks.`,
  },
  "EJECT-PRESET-YA-ES-TUYO": {
    es: (p: { nombre: string; archivo: string }) => `El preset "${p.nombre}" ya es tuyo: está en ${p.archivo}.`,
    en: (p: { nombre: string; archivo: string }) => `Preset "${p.nombre}" is already yours: it is in ${p.archivo}.`,
  },
  "EJECT-DRY-RUN": {
    es: (p: { archivo: string; texto: string }) => `[dry-run] Se escribiría ${p.archivo}:\n${p.texto}`,
    en: (p: { archivo: string; texto: string }) => `[dry-run] Would write ${p.archivo}:\n${p.texto}`,
  },
  "EJECT-COPIA-DE-LO-ANTERIOR": {
    es: (p: { copia: string }) => `Copia de lo anterior: ${p.copia}`,
    en: (p: { copia: string }) => `Copy of the previous version: ${p.copia}`,
  },
  "EJECT-COPIADO-PRESET": {
    es: (p: { archivo: string }) => `Copiado a ${p.archivo}. Edítalo ahí: con el mismo nombre, el tuyo gana al del paquete.`,
    en: (p: { archivo: string }) => `Copied to ${p.archivo}. Edit it there: with the same name, yours wins over the package's.`,
  },
  "EJECT-COPIADO": {
    es: (p: { archivo: string; etiqueta: string | null; comprobar: string }) =>
      `Copiado a ${p.archivo} (${p.etiqueta}). Edítalo ahí; \`${p.comprobar}\` te mostrará que gana.`,
    en: (p: { archivo: string; etiqueta: string | null; comprobar: string }) =>
      `Copied to ${p.archivo} (${p.etiqueta}). Edit it there; \`${p.comprobar}\` will show you that it wins.`,
  },
  // `contenidoDe` is "fábrica" or "file:line"; `modos`, those of the blocks that add to it, already joined.
  "EJECT-PROCEDENCIA": {
    es: (p: { id: string; contenidoDe: string; modos: string[] }) =>
      `Procedencia de ${p.id}: ${p.contenidoDe}${p.modos.length ? ` + ${p.modos.join(", ")}` : ""}`,
    en: (p: { id: string; contenidoDe: string; modos: string[] }) =>
      `Origin of ${p.id}: ${p.contenidoDe === "fábrica" ? "factory" : p.contenidoDe}${p.modos.length ? ` + ${p.modos.join(", ")}` : ""}`,
  },
} satisfies Catalogo;
