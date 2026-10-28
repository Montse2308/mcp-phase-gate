// Mensajes del grupo «ajustes» (ver i18n/mensajes.ts): los planes que editan machine.json y phase-gate.json
// desde src/ajustes/. Cada código con su texto en español y en inglés.

import type { Catalogo } from "./tipos.js";

export const TEXTOS_AJUSTES = {
  // ─── ajustes/maquina.ts ───
  "AJUSTES-MAQUINA-A-MANO": {
    es: (p: { error: string }) => `${p.error} Arréglalo a mano antes de cambiarlo desde el Studio.`,
    en: (p: { error: string }) => `${p.error} Fix it by hand before changing it from the Studio.`,
  },
  "AJUSTES-MAQUINA-NO-VALDRIA": {
    es: (p: { error: string }) => `El machine.json resultante no sería válido: ${p.error}`,
    en: (p: { error: string }) => `The resulting machine.json would not be valid: ${p.error}`,
  },
  "AJUSTES-CAMBIO-PONE": {
    es: (p: { clave: string; valor: string }) => `${p.clave} = ${p.valor}`,
    en: (p: { clave: string; valor: string }) => `${p.clave} = ${p.valor}`,
  },
  "AJUSTES-CAMBIO-QUITA": {
    es: (p: { clave: string }) => `quita ${p.clave}`,
    en: (p: { clave: string }) => `removes ${p.clave}`,
  },
  "AJUSTES-RUTA-NO-EXISTE": {
    es: (p: { clave: string; ruta: string }) => `${p.clave} apunta a «${p.ruta}», que no existe en este equipo o no es una carpeta. Se puede guardar igual.`,
    en: (p: { clave: string; ruta: string }) => `${p.clave} points to "${p.ruta}", which does not exist on this machine or is not a folder. It can be saved anyway.`,
  },

  // ─── ajustes/equipo.ts ───
  "AJUSTES-EQUIPO-IGUAL": {
    es: "Eso ya es lo que dice machine.json: no hay nada que cambiar.",
    en: "That is already what machine.json says: there is nothing to change.",
  },
  "AJUSTES-EQUIPO-RESUMEN": {
    es: (p: { cambios: string[]; nuevo: boolean; deVersion1: boolean }) =>
      `En machine.json: ${p.cambios.join("; ")}.${p.nuevo ? " Se crea el archivo." : ""}${p.deVersion1 ? " Pasa de la versión 1 a la 2." : ""}`,
    en: (p: { cambios: string[]; nuevo: boolean; deVersion1: boolean }) =>
      `In machine.json: ${p.cambios.join("; ")}.${p.nuevo ? " The file is created." : ""}${p.deVersion1 ? " It moves from version 1 to version 2." : ""}`,
  },
  "AJUSTES-EQUIPO-HECHO": {
    es: (p: { cambios: string[] }) => `machine.json actualizado: ${p.cambios.join("; ")}.`,
    en: (p: { cambios: string[] }) => `machine.json updated: ${p.cambios.join("; ")}.`,
  },

  // ─── ajustes/proyecto.ts ───
  "AJUSTES-PROYECTO-IGUAL": {
    es: (p: { proyecto: string }) => `${p.proyecto} ya está así: no hay nada que cambiar.`,
    en: (p: { proyecto: string }) => `${p.proyecto} is already like that: there is nothing to change.`,
  },
  "AJUSTES-PROYECTO-RESUMEN": {
    es: (p: { proyecto: string; cambios: string[]; archivos: string[] }) => `En ${p.proyecto} (${p.archivos.join(" y ")}): ${p.cambios.join("; ")}.`,
    en: (p: { proyecto: string; cambios: string[]; archivos: string[] }) => `In ${p.proyecto} (${p.archivos.join(" and ")}): ${p.cambios.join("; ")}.`,
  },
  "AJUSTES-PROYECTO-HECHO": {
    es: (p: { proyecto: string; cambios: string[] }) => `${p.proyecto} actualizado: ${p.cambios.join("; ")}.`,
    en: (p: { proyecto: string; cambios: string[] }) => `${p.proyecto} updated: ${p.cambios.join("; ")}.`,
  },
  "AJUSTES-PROYECTO-REPO-AGREGA": {
    es: (p: { id: string; dir: string }) => `agrega el repo «${p.id}» (${p.dir})`,
    en: (p: { id: string; dir: string }) => `adds the repo "${p.id}" (${p.dir})`,
  },
  "AJUSTES-PROYECTO-REPO-QUITA": {
    es: (p: { id: string }) => `quita el repo «${p.id}»`,
    en: (p: { id: string }) => `removes the repo "${p.id}"`,
  },
  "AJUSTES-PROYECTO-REPO-CAMBIA": {
    es: (p: { id: string }) => `cambia el repo «${p.id}»`,
    en: (p: { id: string }) => `changes the repo "${p.id}"`,
  },
  "AJUSTES-PROYECTO-REPOS-ORDEN": { es: "cambia el orden de los repos", en: "changes the order of the repos" },
  "AJUSTES-PROYECTO-RUTA-PROPIA-SIN-REPO": {
    es: (p: { id: string }) => `rutasPropias.${p.id}: ese id no está en la lista de repos del proyecto.`,
    en: (p: { id: string }) => `rutasPropias.${p.id}: that id is not in the project's list of repos.`,
  },
  "AJUSTES-PROYECTO-REPO-CON-RECIBOS": {
    es: (p: { id: string; recibos: number }) =>
      `Quitas el repo «${p.id}», pero ${p.recibos === 1 ? "un recibo lo cita" : `${p.recibos} recibos lo citan`}: el id de un repo no se renombra, y ${p.recibos === 1 ? "ese recibo" : "esos recibos"} quedará apuntando a un repo que el proyecto ya no declara.`,
    en: (p: { id: string; recibos: number }) =>
      `You are removing the repo "${p.id}", but ${p.recibos === 1 ? "a receipt cites it" : `${p.recibos} receipts cite it`}: a repo's id is not renamed, and ${p.recibos === 1 ? "that receipt" : "those receipts"} will point to a repo the project no longer declares.`,
  },
  "AJUSTES-PROYECTO-REPO-CON-CLAVE": {
    es: (p: { id: string; clave: string }) => `El repo «${p.id}» sale del proyecto, pero machine.json conserva su ruta propia («${p.clave}»): pásala a null para quitarla también.`,
    en: (p: { id: string; clave: string }) => `The repo "${p.id}" leaves the project, but machine.json keeps its own path ("${p.clave}"): set it to null to remove it too.`,
  },

  // ─── studio/acciones.ts: el orden y los destinos de varios archivos ───
  "AJUSTES-APLICAR-PARCIAL": {
    es: (p: { detalle: string; escritos: string[]; copias: string[] }) =>
      `No se pudo terminar: ${p.detalle} ` +
      (p.escritos.length ? `Ya quedó escrito: ${p.escritos.join(", ")}.` : "No quedó escrito ningún archivo.") +
      (p.copias.length ? ` Sus copias: ${p.copias.join(", ")}.` : ""),
    en: (p: { detalle: string; escritos: string[]; copias: string[] }) =>
      `It could not be finished: ${p.detalle} ` +
      (p.escritos.length ? `Already written: ${p.escritos.join(", ")}.` : "No file was written.") +
      (p.copias.length ? ` Their backups: ${p.copias.join(", ")}.` : ""),
  },
  "AJUSTES-DESTINO-NO-PERMITIDO": {
    es: (p: { accion: string; archivo: string }) => `La acción «${p.accion}» no escribe en ${p.archivo}.`,
    en: (p: { accion: string; archivo: string }) => `The "${p.accion}" action does not write to ${p.archivo}.`,
  },
  "AJUSTES-CLAVE-NO-PERMITIDA": {
    es: (p: { accion: string; clave: string }) => `La acción «${p.accion}» no escribe la clave «${p.clave}» de machine.json.`,
    en: (p: { accion: string; clave: string }) => `The "${p.accion}" action does not write the key "${p.clave}" of machine.json.`,
  },
} satisfies Catalogo;
