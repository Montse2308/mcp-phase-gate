// Mensajes del grupo «lotes» (ver i18n/mensajes.ts): cada código con su texto en español y en inglés.
// El español es el texto de siempre, byte a byte; el inglés, una redacción natural con el glosario
// de docs/glosario.md.

import type { EstadoLote } from "../../recibos.js";
import { VOCABULARIO } from "../../vocabulario.js";
import type { Catalogo } from "./tipos.js";

// ─── Piezas comunes ─────────────────────────────────────────────────────────
// "L01, L02 y L03" / "L01, L02 and L03".
function enumerar(elementos: string[], y: string): string {
  if (elementos.length <= 1) return elementos.join("");
  return `${elementos.slice(0, -1).join(", ")} ${y} ${elementos[elementos.length - 1]}`;
}
const enumerarEs = (elementos: string[]): string => enumerar(elementos, "y");
const enumerarEn = (elementos: string[]): string => enumerar(elementos, "and");

const plural = (n: number, singular: string, varios: string): string => `${n} ${n === 1 ? singular : varios}`;
const lista = (elementos: string[]): string => elementos.map((e) => `\`${e}\``).join(", ");

// El estado canónico de un lote, tal como se dice en un texto en inglés.
const estadoEn = (estado: string): string => VOCABULARIO.en.recibo.estados[estado as EstadoLote] ?? estado;

// Un ancla sellada en una frase: `{ tipo: "commit", valor: corto }` o `{ tipo: "sha256", valor: primeros 12 }`.
type Sellada = { tipo: "commit" | "sha256"; valor: string };
const selladaEs = (a: Sellada): string => (a.tipo === "commit" ? `el commit \`${a.valor}\`` : `el sha256 \`${a.valor}…\``);
const selladaEn = (a: Sellada): string => (a.tipo === "commit" ? `commit \`${a.valor}\`` : `sha256 \`${a.valor}…\``);

export const TEXTOS_LOTES = {
  // ─── lotes.ts: la fase y el plan ───
  "LOTE-SIN-FASE-DE-RECIBOS": {
    es: (p: { proyecto: string }) =>
      `Ninguna fase ${p.proyecto ? `de ${p.proyecto} ` : ""}declara una subcarpeta de recibos (\`recibos:\` en su frontmatter): no hay lotes que registrar.`,
    en: (p: { proyecto: string }) =>
      `No phase ${p.proyecto ? `of ${p.proyecto} ` : ""}declares a receipts subfolder (\`recibos:\` or \`receipts:\` in its frontmatter): there are no batches to record.`,
  },
  "LOTE-SIN-PLAN-ANTERIOR": {
    es: (p: { numero: number }) => `La Fase ${p.numero} no tiene una fase anterior con documento: no hay plan del que leer los lotes.`,
    en: (p: { numero: number }) => `Phase ${p.numero} has no previous phase with a document: there is no plan to read the batches from.`,
  },
  "LOTE-TAREA-NO-EXISTE": {
    es: (p: { tarea: string; proyecto: string }) => `No existe la tarea "${p.tarea}" en ${p.proyecto}. Para una tarea nueva, usa start_task.`,
    en: (p: { tarea: string; proyecto: string }) => `Task "${p.tarea}" does not exist in ${p.proyecto}. For a new task, use start_task.`,
  },
  "LOTE-PLAN-NO-EXISTE": {
    es: (p: { tarea: string; plan: string; numero: number }) => `La tarea "${p.tarea}" todavía no tiene \`${p.plan}\`: la Fase ${p.numero} ejecuta los lotes de ese plan.`,
    en: (p: { tarea: string; plan: string; numero: number }) => `Task "${p.tarea}" does not have \`${p.plan}\` yet: Phase ${p.numero} executes the batches of that plan.`,
  },
  "LOTE-PLAN-SIN-LOTES": {
    es: (p: { plan: string; filas: number }) =>
      `El plan no declara \`lotes: N\` en su frontmatter. Añádelo a \`${p.plan}\` antes del primer recibo.` +
      (p.filas ? ` Su tabla de lotes tiene ${p.filas} ${p.filas === 1 ? "fila" : "filas"}: ¿es \`lotes: ${p.filas}\`?` : ""),
    en: (p: { plan: string; filas: number }) =>
      `The plan does not declare \`batches: N\` (or \`lotes: N\`) in its frontmatter. Add it to \`${p.plan}\` before the first receipt.` +
      (p.filas ? ` Its batch table has ${p.filas} ${p.filas === 1 ? "row" : "rows"}: is it \`batches: ${p.filas}\`?` : ""),
  },
  "LOTE-PLAN-LOTES-INVALIDO": {
    es: (p: { plan: string; valor: string }) => `El frontmatter de \`${p.plan}\` dice \`lotes: ${p.valor}\`, y tiene que ser un número entero de 1 a 99.`,
    en: (p: { plan: string; valor: string }) => `The frontmatter of \`${p.plan}\` declares \`${p.valor}\` batches, and it must be a whole number from 1 to 99.`,
  },

  // ─── lotes.ts: los recibos que hay ───
  "LOTE-RECIBO-ILEGIBLE": {
    es: (p: { ruta: string; error: string }) => `No se pudo leer el recibo \`${p.ruta}\`: ${p.error}`,
    en: (p: { ruta: string; error: string }) => `Could not read receipt \`${p.ruta}\`: ${p.error}`,
  },
  "LOTE-RECIBOS-DUPLICADOS": {
    es: (p: { lote: string; carpeta: string; nombres: string[] }) =>
      `Hay ${p.nombres.length} recibos de ${p.lote} en \`${p.carpeta}/\` (${lista(p.nombres)}). Deja uno solo antes de seguir.`,
    en: (p: { lote: string; carpeta: string; nombres: string[] }) =>
      `There are ${p.nombres.length} receipts for ${p.lote} in \`${p.carpeta}/\` (${lista(p.nombres)}). Keep only one before continuing.`,
  },

  // ─── lotes.ts: el resumen de un ancla (respuestas de las tools) ───
  "LOTE-RESUMEN-COMMIT": {
    es: (p: { corto: string; repo: string | null; rama: string | null }) => `commit ${p.corto}${p.repo ? ` en \`${p.repo}\`` : ""}${p.rama ? ` (${p.rama})` : ""}`,
    en: (p: { corto: string; repo: string | null; rama: string | null }) => `commit ${p.corto}${p.repo ? ` in \`${p.repo}\`` : ""}${p.rama ? ` (${p.rama})` : ""}`,
  },
  "LOTE-RESUMEN-SHA256": {
    es: (p: { sha: string; ruta: string }) => `sha256 \`${p.sha}…\` de \`${p.ruta}\``,
    en: (p: { sha: string; ruta: string }) => `sha256 \`${p.sha}…\` of \`${p.ruta}\``,
  },
  "LOTE-RESUMEN-NOTA": {
    es: (p: { texto: string }) => `nota: ${p.texto}`,
    en: (p: { texto: string }) => `note: ${p.texto}`,
  },
  "LOTE-RESUMEN-PENDIENTE": { es: "commit pendiente", en: "pending commit" },

  // ─── lotes.ts: registrar un lote ───
  "LOTE-FALTAN-CAMPOS": {
    es: (p: { modo: "crear" | "reemplazar"; lote: string; faltan: string[] }) =>
      `Para ${p.modo === "crear" ? `crear el recibo de ${p.lote}` : `reemplazar el recibo de ${p.lote}`} faltan ${lista(p.faltan)}.`,
    en: (p: { modo: "crear" | "reemplazar"; lote: string; faltan: string[] }) =>
      `Missing ${lista(p.faltan)} to ${p.modo === "crear" ? "create" : "replace"} the receipt for ${p.lote}.`,
  },
  "LOTE-RECIBO-SELLADO": {
    es: (p: { lote: string; ancla: Sellada }) =>
      `El recibo ${p.lote} está sellado con ${selladaEs(p.ancla)} y no se reescribe. Si su ancla cambió (por ejemplo, un rebase o un squash ` +
      "cambió el SHA), llama con `reanclar: true` y el ancla nueva.",
    en: (p: { lote: string; ancla: Sellada }) =>
      `Receipt ${p.lote} is sealed with ${selladaEn(p.ancla)} and is not rewritten. If its anchor changed (for example, a rebase or a squash ` +
      "changed the SHA), call with `reanclar: true` and the new anchor.",
  },
  "LOTE-PENDIENTE-SIN-ANCLA": {
    es: (p: { lote: string }) => `El recibo de ${p.lote} ya existe con el commit pendiente: pasa \`commit\` para anclarlo, o el contenido completo para reemplazarlo.`,
    en: (p: { lote: string }) => `The receipt for ${p.lote} already exists with a pending commit: pass \`commit\` to anchor it, or the full content to replace it.`,
  },
  "LOTE-NO-SELLADO-SIN-CONTENIDO": {
    es: (p: { lote: string; estado: string; resumen: string }) =>
      `El recibo de ${p.lote} no está sellado (${p.estado}, ${p.resumen}): para registrarlo de nuevo, pasa el contenido completo.`,
    en: (p: { lote: string; estado: string; resumen: string }) =>
      `The receipt for ${p.lote} is not sealed (${estadoEn(p.estado)}, ${p.resumen}): to record it again, pass the full content.`,
  },
  "LOTE-REPO-DISTINTO": {
    es: (p: { lote: string; delRecibo: string; repo: string }) => `El recibo de ${p.lote} es del repo \`${p.delRecibo}\`, no de \`${p.repo}\`.`,
    en: (p: { lote: string; delRecibo: string; repo: string }) => `The receipt for ${p.lote} belongs to repo \`${p.delRecibo}\`, not to \`${p.repo}\`.`,
  },
  "LOTE-REPO-NO-ES-DE-LA-TAREA": {
    es: (p: { repo: string; tarea: string; ids: string[] }) => `\`${p.repo}\` no es un repo de la tarea "${p.tarea}". Los suyos son: ${p.ids.join(", ")}.`,
    en: (p: { repo: string; tarea: string; ids: string[] }) => `\`${p.repo}\` is not a repo of task "${p.tarea}". Its repos are: ${p.ids.join(", ")}.`,
  },
  "LOTE-TAREA-SIN-REPOS": {
    es: (p: { tarea: string }) => `La tarea "${p.tarea}" no tiene repos (el proyecto no los declara en phase-gate.json): quita \`repo\`.`,
    en: (p: { tarea: string }) => `Task "${p.tarea}" has no repos (the project does not declare any in phase-gate.json): remove \`repo\`.`,
  },
  "LOTE-VARIOS-REPOS": {
    es: (p: { tarea: string; ids: string[] }) => `La tarea "${p.tarea}" tiene varios repos (${p.ids.join(", ")}): indica en \`repo\` el de este lote.`,
    en: (p: { tarea: string; ids: string[] }) => `Task "${p.tarea}" has several repos (${p.ids.join(", ")}): set \`repo\` to the one for this batch.`,
  },
  "LOTE-ESCRITURA-PROTEGIDA": {
    es: (p: { nombre: string; codigo: string }) =>
      `No se pudo escribir \`${p.nombre}\`: es de solo lectura o lo tiene abierto otro programa (${p.codigo}). Quita la protección o ciérralo, y vuelve a llamar.`,
    en: (p: { nombre: string; codigo: string }) =>
      `Could not write \`${p.nombre}\`: it is read-only or another program has it open (${p.codigo}). Remove the protection or close it, and call again.`,
  },
  "LOTE-ESCRITURA-SIN-ESPACIO": {
    es: (p: { nombre: string }) => `No se pudo escribir \`${p.nombre}\`: no queda espacio en el disco.`,
    en: (p: { nombre: string }) => `Could not write \`${p.nombre}\`: there is no space left on the disk.`,
  },
  "LOTE-OTRO-PROCESO": { es: "Otro proceso modificó este recibo; vuelve a llamar.", en: "Another process modified this receipt; call again." },
  "LOTE-CANDADO-OCUPADO": {
    es: "Otro proceso está registrando un lote de esta tarea; vuelve a llamar.",
    en: "Another process is recording a batch of this task; call again.",
  },
  "LOTE-FUERA-DE-LA-TAREA": {
    es: (p: { ruta: string }) => `Acceso denegado: \`${p.ruta}\` lleva fuera de la carpeta de la tarea.`,
    en: (p: { ruta: string }) => `Access denied: \`${p.ruta}\` leads outside the task folder.`,
  },
  "LOTE-ANTERIOR-SIN-RECIBO": {
    es: (p: { lote: string; anterior: string }) => `Antes de ${p.lote} hay que cerrar ${p.anterior}: le falta el recibo.`,
    en: (p: { lote: string; anterior: string }) => `Before ${p.lote}, ${p.anterior} has to be closed: it has no receipt.`,
  },
  "LOTE-ANTERIOR-PENDIENTE": {
    es: (p: { lote: string; anterior: string }) => `Antes de ${p.lote} hay que cerrar ${p.anterior}: su commit sigue pendiente.`,
    en: (p: { lote: string; anterior: string }) => `Before ${p.lote}, ${p.anterior} has to be closed: its commit is still pending.`,
  },
  "LOTE-VARIAS-ANCLAS": {
    es: "Pasa solo una ancla: `commit`, `artifact_path` o `verification_note`.",
    en: "Pass only one anchor: `commit`, `artifact_path` or `verification_note`.",
  },
  "LOTE-CERRADO-SIN-COMMIT": {
    es: (p: { estado: string }) => `Un lote ${p.estado} no se commitea: registra lo que pasó con \`verification_note\`, sin \`commit\`.`,
    en: (p: { estado: string }) => `A ${estadoEn(p.estado)} batch is not committed: record what happened with \`verification_note\`, without \`commit\`.`,
  },
  "LOTE-CERRADO-SIN-SELLO": {
    es: (p: { estado: string }) => `Un lote ${p.estado} no se sella: registra lo que pasó con \`verification_note\`.`,
    en: (p: { estado: string }) => `A ${estadoEn(p.estado)} batch is not sealed: record what happened with \`verification_note\`.`,
  },
  "LOTE-ANCLA-ES-COMMIT": {
    es: (p: { repo: string; politica: string }) =>
      `El repo \`${p.repo}\` tiene git y la política de commits es \`${p.politica}\`: el ancla de este lote es su commit. ` +
      "Pasa `commit` cuando exista, o nada para dejarlo pendiente.",
    en: (p: { repo: string; politica: string }) =>
      `Repo \`${p.repo}\` has git and the commit policy is \`${p.politica}\`: this batch's anchor is its commit. ` +
      "Pass `commit` once it exists, or nothing to leave it pending.",
  },
  "LOTE-SIN-GIT-PARA-COMMIT": {
    es: (p: { repo: string | null }) =>
      `${p.repo ? `El repo \`${p.repo}\` no tiene git` : "Este lote no tiene repositorio"}: no hay commit que anclar. Pasa \`artifact_path\` o \`verification_note\`.`,
    en: (p: { repo: string | null }) =>
      `${p.repo ? `Repo \`${p.repo}\` has no git` : "This batch has no repository"}: there is no commit to anchor. Pass \`artifact_path\` or \`verification_note\`.`,
  },
  "LOTE-SIN-ANCLA": {
    es: "Sin git, el lote necesita un ancla: `artifact_path` o `verification_note`.",
    en: "Without git, the batch needs an anchor: `artifact_path` or `verification_note`.",
  },
  "LOTE-MOTIVO-SIN-CERRAR": { es: "`motivo_descarte` solo va con `cerrar_fase: true`.", en: "`motivo_descarte` only goes with `cerrar_fase: true`." },
  "LOTE-FASE-CERRADA": {
    es: (p: { numero: number; documento: string }) =>
      `La Fase ${p.numero} ya está cerrada (existe \`${p.documento}\`): no se registran más lotes. Para cambiar el ancla de un ` +
      "lote (tras un rebase o un squash), usa `reanclar: true`.",
    en: (p: { numero: number; documento: string }) =>
      `Phase ${p.numero} is already closed (\`${p.documento}\` exists): no more batches are recorded. To change the anchor of a ` +
      "batch (after a rebase or a squash), use `reanclar: true`.",
  },
  "LOTE-NO-EXISTE-EN-PLAN": {
    es: (p: { total: number; lote: string }) =>
      `El plan declara ${plural(p.total, "lote", "lotes")}; ${p.lote} no existe. Si el plan cambió, actualiza su frontmatter: el plan ya está ` +
      "congelado, así que hará falta la confirmación del usuario, y el cambio va como decisión en los Desvíos del recibo.",
    en: (p: { total: number; lote: string }) =>
      `The plan declares ${plural(p.total, "batch", "batches")}; ${p.lote} does not exist. If the plan changed, update its frontmatter: the plan is already ` +
      "frozen, so the user's confirmation will be needed, and the change goes as a decision in the receipt's Deviations.",
  },
  "LOTE-NO-EXISTE-EN-PLAN-CORTO": {
    es: (p: { total: number; lote: string }) => `El plan declara ${plural(p.total, "lote", "lotes")}; ${p.lote} no existe.`,
    en: (p: { total: number; lote: string }) => `The plan declares ${plural(p.total, "batch", "batches")}; ${p.lote} does not exist.`,
  },

  // ─── lotes.ts: cerrar_fase ───
  "LOTE-CIERRE-CON-PENDIENTE": {
    es: (p: { numero: number; lotes: string[] }) =>
      `No se puede cerrar la Fase ${p.numero} con ${enumerarEs(p.lotes)} abierto con el commit pendiente: ánclalo con \`commit\`, o regístralo como descartado.`,
    en: (p: { numero: number; lotes: string[] }) => {
      const uno = p.lotes.length === 1;
      return (
        `Phase ${p.numero} cannot be closed with ${enumerarEn(p.lotes)} open with a pending commit: anchor ${uno ? "it" : "them"} with \`commit\`, ` +
        `or record ${uno ? "it" : "them"} as discarded.`
      );
    },
  },
  "LOTE-CIERRE-FALTAN": {
    es: (p: { lotes: string[] }) =>
      `Faltan ${enumerarEs(p.lotes)}: para cerrar la fase sin ${p.lotes.length === 1 ? "él" : "ellos"}, pasa \`motivo_descarte\` (lo decide el usuario).`,
    en: (p: { lotes: string[] }) =>
      `${enumerarEn(p.lotes)} ${p.lotes.length === 1 ? "is" : "are"} missing: to close the phase without ${p.lotes.length === 1 ? "it" : "them"}, pass \`motivo_descarte\` (the user decides).`,
  },
  // Lo que deja el cierre: los lotes que se descartan (con su motivo) y los fallidos.
  "LOTE-CIERRE-RESUMEN": {
    es: (p: { faltan: string[]; motivo: string; fallidos: string[] }) => {
      const partes: string[] = [];
      if (p.faltan.length) partes.push(`${enumerarEs(p.faltan)} ${p.faltan.length === 1 ? "descartado" : "descartados"} («${p.motivo}»)`);
      if (p.fallidos.length) partes.push(`${enumerarEs(p.fallidos)} ${p.fallidos.length === 1 ? "fallido" : "fallidos"}`);
      return partes.join(" y ");
    },
    en: (p: { faltan: string[]; motivo: string; fallidos: string[] }) => {
      const partes: string[] = [];
      if (p.faltan.length) partes.push(`${enumerarEn(p.faltan)} discarded ("${p.motivo}")`);
      if (p.fallidos.length) partes.push(`${enumerarEn(p.fallidos)} failed`);
      return partes.join(" and ");
    },
  },
  "LOTE-CIERRE-PREGUNTA": {
    es: (p: { numero: number; resumen: string }) => `Cerrar la Fase ${p.numero} con ${p.resumen}. ¿Confirmas?`,
    en: (p: { numero: number; resumen: string }) => `Close Phase ${p.numero} with ${p.resumen}. Do you confirm?`,
  },
  "LOTE-CIERRE-ETIQUETA": {
    es: (p: { numero: number }) => `Cerrar la Fase ${p.numero}`,
    en: (p: { numero: number }) => `Close Phase ${p.numero}`,
  },
  "LOTE-CIERRE-RECHAZADO": {
    es: (p: { numero: number; nota: string }) => `El usuario no confirmó el cierre de la Fase ${p.numero}. No se escribió nada.${p.nota}`,
    en: (p: { numero: number; nota: string }) => `The user did not confirm closing Phase ${p.numero}. Nothing was written.${p.nota}`,
  },
  "LOTE-CIERRE-SIN-CONFIRMACION": {
    es: (p: { numero: number; resumen: string; nota: string }) =>
      `Cerrar la Fase ${p.numero} con ${p.resumen} lo decide el usuario: pídele confirmación explícita en el chat y vuelve a llamar con force: true.${p.nota}`,
    en: (p: { numero: number; resumen: string; nota: string }) =>
      `Closing Phase ${p.numero} with ${p.resumen} is the user's decision: ask them for explicit confirmation in the chat and call again with force: true.${p.nota}`,
  },
  "LOTE-CARPETA-NO-ES-CARPETA": {
    es: (p: { carpeta: string }) => `\`${p.carpeta}\` existe en la tarea y no es una carpeta.`,
    en: (p: { carpeta: string }) => `\`${p.carpeta}\` exists in the task and is not a folder.`,
  },

  // ─── lotes.ts: la respuesta de record_batch ───
  "LOTE-FASE-CERRADA-MOVIDO": {
    es: (p: { numero: number; documento: string }) => `Fase ${p.numero} cerrada: el recibo pasó a ser \`${p.documento}\`.`,
    en: (p: { numero: number; documento: string }) => `Phase ${p.numero} closed: the receipt became \`${p.documento}\`.`,
  },
  "LOTE-FASE-CERRADA-GENERADO": {
    es: (p: { numero: number; documento: string }) => `Fase ${p.numero} cerrada: se generó \`${p.documento}\`.`,
    en: (p: { numero: number; documento: string }) => `Phase ${p.numero} closed: \`${p.documento}\` was generated.`,
  },
  "LOTE-DESCARTADOS-REGISTRADOS": {
    es: (p: { lotes: string[] }) => `${enumerarEs(p.lotes)} ${p.lotes.length === 1 ? "registrado como descartado" : "registrados como descartados"}.`,
    en: (p: { lotes: string[] }) => `${enumerarEn(p.lotes)} recorded as discarded.`,
  },
  "LOTE-FASE-NO-CERRADA": { es: "No se cerró la fase.", en: "The phase was not closed." },
  "LOTE-REGISTRADO-PENDIENTE": {
    es: (p: { lote: string; total: number; numero: number }) =>
      `${p.lote} de ${p.total} registrado con el commit pendiente. Cuando exista, llama de nuevo a \`record_batch\` con \`lote: ${p.numero}\` y \`commit\`.`,
    en: (p: { lote: string; total: number; numero: number }) =>
      `${p.lote} of ${p.total} recorded with a pending commit. Once it exists, call \`record_batch\` again with \`lote: ${p.numero}\` and \`commit\`.`,
  },
  "LOTE-REGISTRADO-FALLIDO": {
    es: (p: { lote: string; total: number }) =>
      `${p.lote} de ${p.total} registrado: fallido. No hagas su commit: detente y pregúntale al usuario si se reintenta o se descarta (con \`cerrar_fase\` y \`motivo_descarte\`).`,
    en: (p: { lote: string; total: number }) =>
      `${p.lote} of ${p.total} recorded: failed. Do not make its commit: stop and ask the user whether to retry it or discard it (with \`cerrar_fase\` and \`motivo_descarte\`).`,
  },
  "LOTE-REGISTRADO": {
    es: (p: { lote: string; total: number; estado: string; resumen: string }) => `${p.lote} de ${p.total} registrado: ${p.estado} · ${p.resumen}.`,
    en: (p: { lote: string; total: number; estado: string; resumen: string }) => `${p.lote} of ${p.total} recorded: ${estadoEn(p.estado)} · ${p.resumen}.`,
  },
  "LOTE-SIGUIENTE": {
    es: (p: { lote: string }) => `Siguiente: ${p.lote}.`,
    en: (p: { lote: string }) => `Next: ${p.lote}.`,
  },
  "LOTE-NINGUNO-POR-REGISTRAR": { es: "No quedan lotes por registrar.", en: "No batches left to record." },
  "LOTE-AVISO-ARCHIVOS": {
    es: (p: { avisos: string[] }) =>
      `Aviso: el commit no toca los archivos que declara el recibo (queda escrito en "Verificación del commit"):\n${p.avisos.join("\n")}`,
    en: (p: { avisos: string[] }) =>
      `Warning: the commit does not touch the files the receipt declares (it is recorded in "Commit check"):\n${p.avisos.join("\n")}`,
  },

  // ─── lotes.ts: reanclar ───
  "LOTE-REANCLAR-CON-CONTENIDO": {
    es: "`reanclar` solo cambia el ancla: no pases contenido (titulo, estado, que_se_hizo…).",
    en: "`reanclar` only changes the anchor: do not pass content (titulo, estado, que_se_hizo…).",
  },
  "LOTE-REANCLAR-Y-CERRAR": { es: "`reanclar` y `cerrar_fase` no van en la misma llamada.", en: "`reanclar` and `cerrar_fase` do not go in the same call." },
  "LOTE-REANCLAR-SIN-ANCLA": {
    es: "Para reanclar, pasa el ancla nueva: `commit` (el SHA de después del rebase o del squash) o `artifact_path`.",
    en: "To re-anchor, pass the new anchor: `commit` (the SHA after the rebase or the squash) or `artifact_path`.",
  },
  "LOTE-REANCLAR-SIN-RECIBO": {
    es: (p: { lote: string }) => `No hay recibo de ${p.lote}: no hay ningún ancla que cambiar.`,
    en: (p: { lote: string }) => `There is no receipt for ${p.lote}: there is no anchor to change.`,
  },
  "LOTE-REANCLAR-NO-SELLADO": {
    es: (p: { lote: string; resumen: string }) => `El recibo ${p.lote} no está sellado (${p.resumen}): no hace falta reanclar; regístralo con record_batch como siempre.`,
    en: (p: { lote: string; resumen: string }) => `Receipt ${p.lote} is not sealed (${p.resumen}): there is no need to re-anchor; record it with record_batch as usual.`,
  },
  "LOTE-REANCLAR-SIN-REPO": {
    es: "Este lote no tiene repositorio: no hay commit que anclar. Pasa `artifact_path`.",
    en: "This batch has no repository: there is no commit to anchor. Pass `artifact_path`.",
  },
  "LOTE-REANCLAR-IGUAL": {
    es: (p: { lote: string; ancla: string }) => `El recibo ${p.lote} ya está anclado a \`${p.ancla}\`: no hay nada que cambiar.`,
    en: (p: { lote: string; ancla: string }) => `Receipt ${p.lote} is already anchored to \`${p.ancla}\`: there is nothing to change.`,
  },
  "LOTE-REANCLAR-PREGUNTA": {
    es: (p: { lote: string; era: Sellada; queda: Sellada }) =>
      `El recibo ${p.lote} está sellado con ${selladaEs(p.era)}. ¿Reemplazar su ancla por ${p.queda.tipo === "commit" ? `\`${p.queda.valor}\`` : selladaEs(p.queda)}?`,
    en: (p: { lote: string; era: Sellada; queda: Sellada }) =>
      `Receipt ${p.lote} is sealed with ${selladaEn(p.era)}. Replace its anchor with ${p.queda.tipo === "commit" ? `\`${p.queda.valor}\`` : selladaEn(p.queda)}?`,
  },
  "LOTE-REANCLAR-ETIQUETA": {
    es: (p: { lote: string }) => `Reanclar ${p.lote}`,
    en: (p: { lote: string }) => `Re-anchor ${p.lote}`,
  },
  "LOTE-REANCLAR-RECHAZADO": {
    es: (p: { lote: string; nota: string }) => `El usuario no confirmó el cambio de ancla de ${p.lote}. No se escribió nada.${p.nota}`,
    en: (p: { lote: string; nota: string }) => `The user did not confirm the anchor change for ${p.lote}. Nothing was written.${p.nota}`,
  },
  "LOTE-REANCLAR-SIN-CONFIRMACION": {
    es: (p: { nota: string }) =>
      "Cambiar el ancla de un recibo sellado lo decide el usuario: pídele confirmación explícita en el chat y vuelve a llamar con " +
      `\`reanclar: true\` y force: true.${p.nota}`,
    en: (p: { nota: string }) =>
      "Changing the anchor of a sealed receipt is the user's decision: ask them for explicit confirmation in the chat and call again with " +
      `\`reanclar: true\` and force: true.${p.nota}`,
  },
  // `donde`: el repo y la rama del commit nuevo, o la ruta del artefacto.
  "LOTE-REANCLADO": {
    es: (p: { lote: string; viejo: string; nueva: string; donde: { repo: string; rama: string } | { ruta: string }; documento: string | null }) =>
      `${p.lote} reanclado: \`${p.viejo}\` → \`${p.nueva}\`` +
      ("ruta" in p.donde ? ` de \`${p.donde.ruta}\`` : ` en \`${p.donde.repo}\`${p.donde.rama ? ` (${p.donde.rama})` : ""}`) +
      `.${p.documento ? ` Se actualizó \`${p.documento}\`.` : ""}`,
    en: (p: { lote: string; viejo: string; nueva: string; donde: { repo: string; rama: string } | { ruta: string }; documento: string | null }) =>
      `${p.lote} re-anchored: \`${p.viejo}\` → \`${p.nueva}\`` +
      ("ruta" in p.donde ? ` of \`${p.donde.ruta}\`` : ` in \`${p.donde.repo}\`${p.donde.rama ? ` (${p.donde.rama})` : ""}`) +
      `.${p.documento ? ` \`${p.documento}\` was updated.` : ""}`,
  },

  // ─── lotes.ts: get_batch_status ───
  "LOTE-TABLA-ILEGIBLE": { es: "No pude leer la tabla de lotes del plan.", en: "I could not read the plan's batch table." },
  "LOTE-ESTADO-DUPLICADOS": {
    es: (p: { lote: string; recibos: string[] }) => `Hay ${p.recibos.length} recibos de ${p.lote}: ${lista(p.recibos)}. Deja uno solo.`,
    en: (p: { lote: string; recibos: string[] }) => `There are ${p.recibos.length} receipts for ${p.lote}: ${lista(p.recibos)}. Keep only one.`,
  },
  "LOTE-SIGUIENTE-ANCLAR": {
    es: (p: { lote: string }) => `Ancla ${p.lote}: falta registrar su commit.`,
    en: (p: { lote: string }) => `Anchor ${p.lote}: its commit has not been recorded yet.`,
  },
  "LOTE-SIGUIENTE-FALLIDO": {
    es: (p: { lote: string }) => `${p.lote} falló: reintenta o descártalo con \`cerrar_fase\`.`,
    en: (p: { lote: string }) => `${p.lote} failed: retry it or discard it with \`cerrar_fase\`.`,
  },
  "LOTE-SIGUIENTE-IMPLEMENTAR": {
    es: (p: { lote: string }) => `Implementa ${p.lote}.`,
    en: (p: { lote: string }) => `Implement ${p.lote}.`,
  },
  "LOTE-SIGUIENTE-FASE-CERRADA": {
    es: (p: { numero: number }) => `Todos los lotes cerrados: la Fase ${p.numero} está cerrada.`,
    en: (p: { numero: number }) => `All batches closed: Phase ${p.numero} is closed.`,
  },
  "LOTE-SIGUIENTE-CERRAR-FASE": {
    es: (p: { documento: string | null }) =>
      `Todos los lotes tienen recibo, pero falta \`${p.documento}\`: llama a \`record_batch\` con \`cerrar_fase: true\` para generarlo.`,
    en: (p: { documento: string | null }) =>
      `All batches have a receipt, but \`${p.documento}\` is missing: call \`record_batch\` with \`cerrar_fase: true\` to generate it.`,
  },
  // Las columnas de la tabla de get_batch_status, separadas por "|" (la última solo con reverificar).
  "LOTE-ESTADO-COLUMNAS": {
    es: "Lote|Repo|Objetivo|Commit propuesto|Recibo|Estado|Ancla|Origen|Vigente",
    en: "Batch|Repo|Goal|Proposed commit|Receipt|Status|Anchor|Origin|Valid",
  },
  "LOTE-VIGENTE-SI": { es: "sí", en: "yes" },
  "LOTE-VIGENTE-NO": {
    es: (p: { problema: string }) => `no: ${p.problema}`,
    en: (p: { problema: string }) => `no: ${p.problema}`,
  },
  "LOTE-ESTADO-RESUMEN": {
    es: (p: { tarea: string; plan: string; declarados: number; cerrados: number }) =>
      `Tarea «${p.tarea}» · plan \`${p.plan}\` · ${plural(p.declarados, "lote declarado", "lotes declarados")}, ${p.cerrados} ${p.cerrados === 1 ? "cerrado" : "cerrados"}.`,
    en: (p: { tarea: string; plan: string; declarados: number; cerrados: number }) =>
      `Task "${p.tarea}" · plan \`${p.plan}\` · ${plural(p.declarados, "batch declared", "batches declared")}, ${p.cerrados} closed.`,
  },
  "LOTE-ESTADO-SIGUIENTE": {
    es: (p: { siguiente: string }) => `Siguiente: ${p.siguiente}`,
    en: (p: { siguiente: string }) => `Next: ${p.siguiente}`,
  },
  "LOTE-ESTADO-FUERA-TITULO": { es: "Recibos fuera del plan:", en: "Receipts outside the plan:" },
  "LOTE-ESTADO-FUERA": {
    es: (p: { codigo: string; recibo: string; declarados: number }) => `- ${p.codigo}: \`${p.recibo}\` (el plan declara ${plural(p.declarados, "lote", "lotes")}).`,
    en: (p: { codigo: string; recibo: string; declarados: number }) => `- ${p.codigo}: \`${p.recibo}\` (the plan declares ${plural(p.declarados, "batch", "batches")}).`,
  },
  "LOTE-ESTADO-AVISOS-TITULO": { es: "Avisos:", en: "Warnings:" },

  // ─── lotes.ts: el bloque de commits del prompt de la Fase 5 (idioma del proyecto) ───
  "LOTE-COMMITS-RECIBOS-ILEGIBLES": {
    es: (p: { error: string }) => `No se pudieron leer los recibos: ${p.error} Arréglalo (o usa \`get_batch_status\`) antes de auditar.`,
    en: (p: { error: string }) => `The receipts could not be read: ${p.error} Fix it (or use \`get_batch_status\`) before auditing.`,
  },
  "LOTE-COMMITS-SIN-RECIBO": {
    es: (p: { lote: string }) => `- ${p.lote}: sin recibo.`,
    en: (p: { lote: string }) => `- ${p.lote}: no receipt.`,
  },
  // `motivo`: la nota del lote, o null si su ancla no es una nota.
  "LOTE-COMMITS-CERRADO": {
    es: (p: { lote: string; estado: string; motivo: string | null }) => `- ${p.lote}: ${p.estado}${p.motivo !== null ? ` («${p.motivo}»)` : ""}.`,
    en: (p: { lote: string; estado: string; motivo: string | null }) => `- ${p.lote}: ${estadoEn(p.estado)}${p.motivo !== null ? ` ("${p.motivo}")` : ""}.`,
  },
  "LOTE-COMMITS-PENDIENTE": {
    es: (p: { lote: string }) => `- ${p.lote}: el commit sigue pendiente.`,
    en: (p: { lote: string }) => `- ${p.lote}: the commit is still pending.`,
  },
  "LOTE-COMMITS-REPO": {
    es: (p: { repo: string; rama: string | null }) => `### Repo \`${p.repo}\`${p.rama ? ` (rama ${p.rama})` : ""}`,
    en: (p: { repo: string; rama: string | null }) => `### Repo \`${p.repo}\`${p.rama ? ` (branch ${p.rama})` : ""}`,
  },
  "LOTE-COMMITS-CABECERA": { es: "| Lote | Commit | Asunto | Vigente |", en: "| Batch | Commit | Subject | Valid |" },
  "LOTE-COMMITS-RANGO-UNO": {
    es: (p: { primero: string }) => `Rango para auditar: \`git show ${p.primero}\`.`,
    en: (p: { primero: string }) => `Range to audit: \`git show ${p.primero}\`.`,
  },
  "LOTE-COMMITS-CONSECUTIVOS": {
    es: (p: { primero: string; ultimo: string }) =>
      `Son consecutivos en la rama. Rango para auditar: \`git log --oneline ${p.primero}^..${p.ultimo}\` y \`git diff ${p.primero}^ ${p.ultimo}\`.`,
    en: (p: { primero: string; ultimo: string }) =>
      `They are consecutive on the branch. Range to audit: \`git log --oneline ${p.primero}^..${p.ultimo}\` and \`git diff ${p.primero}^ ${p.ultimo}\`.`,
  },
  "LOTE-COMMITS-CONSECUTIVOS-DESDE-RAIZ": {
    es: (p: { ultimo: string }) =>
      `Son consecutivos en la rama, desde el primer commit del repo. Rango para auditar: \`git log --oneline ${p.ultimo}\` y \`git log -p --reverse ${p.ultimo}\`.`,
    en: (p: { ultimo: string }) =>
      `They are consecutive on the branch, starting from the repo's first commit. Range to audit: \`git log --oneline ${p.ultimo}\` and \`git log -p --reverse ${p.ultimo}\`.`,
  },
  "LOTE-COMMITS-NO-CONSECUTIVOS": {
    es: (p: { cortos: string[] }) => `No son consecutivos: audita cada commit con \`git show <sha>\` (${lista(p.cortos)}).`,
    en: (p: { cortos: string[] }) => `They are not consecutive: audit each commit with \`git show <sha>\` (${lista(p.cortos)}).`,
  },
  "LOTE-COMMITS-AUDITA-CADA": { es: "Audita cada commit vigente con `git show <sha>`.", en: "Audit each valid commit with `git show <sha>`." },
  "LOTE-COMMITS-SIN-COMMIT-TITULO": { es: "### Sin commit", en: "### Without a commit" },
  "LOTE-COMMITS-SIN-COMMIT-CABECERA": { es: "| Lote | Ancla | Vigente |", en: "| Batch | Anchor | Valid |" },
  "LOTE-COMMITS-FUERA-TITULO": { es: "### Lotes que no entran en la auditoría", en: "### Batches left out of the audit" },
  "LOTE-COMMITS-NO-VIGENTES": {
    es: "Hay anclas que ya no corresponden a la rama: díselo al usuario antes de auditar.",
    en: "Some anchors no longer match the branch: tell the user before auditing.",
  },
  "LOTE-COMMITS-PLAZO": {
    es: (p: { segundos: number }) => `No se pudieron verificar a tiempo (${p.segundos} s). Usa \`get_batch_status\` con \`reverificar\` antes de auditar.`,
    en: (p: { segundos: number }) => `They could not be verified in time (${p.segundos} s). Use \`get_batch_status\` with \`reverificar\` before auditing.`,
  },
  // El encabezado del bloque cuando no se sabe el número de la fase de los lotes.
  "LOTE-COMMITS-FASE-ANTERIOR": { es: "COMMITS DE LA FASE anterior", en: "PREVIOUS PHASE COMMITS" },

  // ─── anclas.ts: el commit ───
  "ANCLA-COINCIDE": {
    es: (p: { n: number }) =>
      p.n === 0
        ? "El commit no toca ningún archivo y el recibo no declara ninguno."
        : p.n === 1
          ? "El commit toca exactamente el archivo declarado."
          : `El commit toca exactamente los ${p.n} archivos declarados.`,
    en: (p: { n: number }) =>
      p.n === 0
        ? "The commit touches no file and the receipt declares none."
        : p.n === 1
          ? "The commit touches exactly the declared file."
          : `The commit touches exactly the ${p.n} declared files.`,
  },
  "ANCLA-DE-MAS": {
    es: (p: { archivos: string[] }) => `En el commit y no en el recibo: ${lista(p.archivos)}.`,
    en: (p: { archivos: string[] }) => `In the commit and not in the receipt: ${lista(p.archivos)}.`,
  },
  "ANCLA-DE-MENOS": {
    es: (p: { archivos: string[] }) => `En el recibo y no en el commit: ${lista(p.archivos)}.`,
    en: (p: { archivos: string[] }) => `In the receipt and not in the commit: ${lista(p.archivos)}.`,
  },
  "ANCLA-FORMATO": {
    es: "El commit tiene que ser un hash de 7 a 40 caracteres hexadecimales.",
    en: "The commit must be a hash of 7 to 40 hexadecimal characters.",
  },
  "ANCLA-AMBIGUO": {
    es: (p: { sha: string; repo: string }) => `El hash \`${p.sha}\` es ambiguo en \`${p.repo}\`; usa más caracteres.`,
    en: (p: { sha: string; repo: string }) => `Hash \`${p.sha}\` is ambiguous in \`${p.repo}\`; use more characters.`,
  },
  "ANCLA-NO-EXISTE": {
    es: (p: { sha: string; repo: string; dir: string }) =>
      `El commit \`${p.sha}\` no existe en el repo \`${p.repo}\` (\`${p.dir}\`). ¿Se hizo en otro repositorio o todavía no se ha hecho?`,
    en: (p: { sha: string; repo: string; dir: string }) =>
      `Commit \`${p.sha}\` does not exist in repo \`${p.repo}\` (\`${p.dir}\`). Was it made in another repository, or has it not been made yet?`,
  },
  "ANCLA-REPETIDO": {
    es: (p: { corto: string; lote: string }) => `El commit \`${p.corto}\` ya es el ancla de ${p.lote}. Cada lote es un commit.`,
    en: (p: { corto: string; lote: string }) => `Commit \`${p.corto}\` is already the anchor of ${p.lote}. Each batch is one commit.`,
  },
  "ANCLA-OTRA-RAMA": {
    es: (p: { corto: string; rama: string | null; ramas: string[] }) =>
      `El commit \`${p.corto}\` existe pero no está en la rama actual (\`${p.rama ?? "HEAD separado"}\`); está en: ${p.ramas.length ? lista(p.ramas) : "ninguna rama local"}. ` +
      "Cambia a la rama del trabajo o registra el commit correcto.",
    en: (p: { corto: string; rama: string | null; ramas: string[] }) =>
      `Commit \`${p.corto}\` exists but is not on the current branch (\`${p.rama ?? "detached HEAD"}\`); it is on: ${p.ramas.length ? lista(p.ramas) : "no local branch"}. ` +
      "Switch to the work branch or record the correct commit.",
  },
  "ANCLA-NO-COMPROBADO": {
    es: (p: { corto: string; repo: string; salida: string }) => `No se pudo comprobar si \`${p.corto}\` está en la rama actual de \`${p.repo}\`: ${p.salida}`,
    en: (p: { corto: string; repo: string; salida: string }) => `Could not check whether \`${p.corto}\` is on the current branch of \`${p.repo}\`: ${p.salida}`,
  },

  // ─── anclas.ts: el artefacto ───
  "ANCLA-ARTEFACTO-ABSOLUTO": {
    es: (p: { ruta: string }) => `\`artifact_path\` no puede ser una ruta absoluta ("${p.ruta}"): es relativa a la raíz del repo o del proyecto.`,
    en: (p: { ruta: string }) => `\`artifact_path\` cannot be an absolute path ("${p.ruta}"): it is relative to the root of the repo or of the project.`,
  },
  "ANCLA-ARTEFACTO-GIT": {
    es: (p: { ruta: string }) => `\`artifact_path\` no puede entrar en .git ni sellar archivos de git ("${p.ruta}").`,
    en: (p: { ruta: string }) => `\`artifact_path\` cannot go into .git or seal git files ("${p.ruta}").`,
  },
  "ANCLA-ARTEFACTO-FUERA": {
    es: (p: { ruta: string }) => `Acceso denegado: \`artifact_path\` "${p.ruta}" queda fuera de su carpeta.`,
    en: (p: { ruta: string }) => `Access denied: \`artifact_path\` "${p.ruta}" falls outside its folder.`,
  },
  "ANCLA-ARTEFACTO-ENLACE-GIT": {
    es: (p: { ruta: string }) => `Acceso denegado: \`artifact_path\` "${p.ruta}" lleva a .git a través de un enlace.`,
    en: (p: { ruta: string }) => `Access denied: \`artifact_path\` "${p.ruta}" leads into .git through a link.`,
  },
  "ANCLA-ARTEFACTO-NO-EXISTE": {
    es: (p: { ruta: string }) => `El artefacto \`${p.ruta}\` no existe.`,
    en: (p: { ruta: string }) => `Artifact \`${p.ruta}\` does not exist.`,
  },
  "ANCLA-ARTEFACTO-CARPETA": {
    es: (p: { ruta: string }) => `\`${p.ruta}\` es una carpeta: solo se sellan archivos.`,
    en: (p: { ruta: string }) => `\`${p.ruta}\` is a folder: only files are sealed.`,
  },
  "ANCLA-ARTEFACTO-NO-NORMAL": {
    es: (p: { ruta: string }) => `\`${p.ruta}\` no es un archivo normal: solo se sellan archivos.`,
    en: (p: { ruta: string }) => `\`${p.ruta}\` is not a regular file: only files are sealed.`,
  },
  "ANCLA-ARTEFACTO-TOPE": {
    es: (p: { bytes: number }) => `El artefacto pesa ${(p.bytes / 1_048_576).toFixed(1)} MB (${p.bytes} bytes); el máximo para sellarlo es 256 MB.`,
    en: (p: { bytes: number }) => `The artifact is ${(p.bytes / 1_048_576).toFixed(1)} MB (${p.bytes} bytes); the maximum for sealing it is 256 MB.`,
  },

  // ─── anclas.ts: reverificar ───
  "ANCLA-SIN-NADA-QUE-COMPROBAR": { es: "Sin nada que comprobar.", en: "Nothing to check." },
  "ANCLA-RECIBO-SIN-REPO": { es: "El recibo no dice en qué repo está su commit.", en: "The receipt does not say which repo its commit is in." },
  "ANCLA-YA-NO-EXISTE": {
    es: (p: { corto: string; repo: string }) => `El commit \`${p.corto}\` ya no existe en \`${p.repo}\`. Vuelve a anclar el lote.`,
    en: (p: { corto: string; repo: string }) => `Commit \`${p.corto}\` no longer exists in \`${p.repo}\`. Re-anchor the batch.`,
  },
  "ANCLA-SIGUE-EN-LA-RAMA": {
    es: (p: { corto: string; rama: string | null }) => `El commit \`${p.corto}\` sigue en la rama actual (\`${p.rama ?? "HEAD separado"}\`).`,
    en: (p: { corto: string; rama: string | null }) => `Commit \`${p.corto}\` is still on the current branch (\`${p.rama ?? "detached HEAD"}\`).`,
  },
  "ANCLA-NO-SE-PUDO-COMPROBAR": {
    es: (p: { corto: string; salida: string }) => `No se pudo comprobar \`${p.corto}\`: ${p.salida}`,
    en: (p: { corto: string; salida: string }) => `Could not check \`${p.corto}\`: ${p.salida}`,
  },
  "ANCLA-FUERA-DE-LA-RAMA": {
    es: (p: { corto: string; rama: string | null }) =>
      `El commit \`${p.corto}\` ya no está en la rama actual (\`${p.rama ?? "HEAD separado"}\`). ¿Rebase o squash? Vuelve a anclar el lote.`,
    en: (p: { corto: string; rama: string | null }) =>
      `Commit \`${p.corto}\` is no longer on the current branch (\`${p.rama ?? "detached HEAD"}\`). A rebase or a squash? Re-anchor the batch.`,
  },
  "ANCLA-RUTA-ILEGIBLE": {
    es: (p: { ruta: string }) => `No se entiende la ruta del artefacto («${p.ruta}»).`,
    en: (p: { ruta: string }) => `The artifact path cannot be understood ("${p.ruta}").`,
  },
  "ANCLA-ARTEFACTO-SIN-CAMBIOS": {
    es: (p: { ruta: string }) => `El artefacto \`${p.ruta}\` no cambió.`,
    en: (p: { ruta: string }) => `Artifact \`${p.ruta}\` has not changed.`,
  },
  "ANCLA-ARTEFACTO-CAMBIO": {
    es: (p: { ruta: string; antes: string; ahora: string }) => `El artefacto \`${p.ruta}\` cambió desde que se selló (sha256 \`${p.antes}…\`, ahora \`${p.ahora}…\`).`,
    en: (p: { ruta: string; antes: string; ahora: string }) => `Artifact \`${p.ruta}\` changed since it was sealed (sha256 \`${p.antes}…\`, now \`${p.ahora}…\`).`,
  },
  "ANCLA-ARTEFACTO-FINALES-DE-LINEA": {
    es: (p: { ruta: string }) => `El artefacto \`${p.ruta}\` es idéntico salvo finales de línea.`,
    en: (p: { ruta: string }) => `Artifact \`${p.ruta}\` is identical except for line endings.`,
  },

  // ─── recibos.ts ───
  "RECIBOS-LOTE-FUERA-DE-RANGO": {
    es: (p: { lote: unknown }) => `El número de lote tiene que ser un entero de 1 a 99 (llegó ${p.lote}).`,
    en: (p: { lote: unknown }) => `The batch number must be a whole number from 1 to 99 (got ${p.lote}).`,
  },
  // Cómo se nombra el campo en el error de validarSegmento (paths.ts).
  "RECIBOS-CAMPO-NOMBRE": { es: "el nombre del recibo", en: "the receipt name" },

  // ─── git.ts ───
  "GITX-NO-INSTALADO": { es: "git no está instalado o no está en el PATH de este equipo.", en: "git is not installed or is not in this computer's PATH." },
  "GITX-TIEMPO": {
    es: (p: { segundos: number; dir: string }) => `git no respondió en ${p.segundos} s en ${p.dir}.`,
    en: (p: { segundos: number; dir: string }) => `git did not respond within ${p.segundos} s in ${p.dir}.`,
  },
  "GITX-PROPIEDAD-DUDOSA": {
    es: (p: { dir: string; seguro: string }) =>
      `git se niega a leer ${p.dir} porque la carpeta es de otro usuario ("dubious ownership"). Si confías en ella, ` +
      `márcala como segura con: git config --global --add safe.directory "${p.seguro}"`,
    en: (p: { dir: string; seguro: string }) =>
      `git refuses to read ${p.dir} because the folder belongs to another user ("dubious ownership"). If you trust it, ` +
      `mark it as safe with: git config --global --add safe.directory "${p.seguro}"`,
  },
  "GITX-NO-ES-REPO": {
    es: (p: { dir: string }) => `${p.dir} no es un repositorio de git.`,
    en: (p: { dir: string }) => `${p.dir} is not a git repository.`,
  },
  "GITX-FALLO": {
    es: (p: { dir: string; detalle: string }) => `git falló en ${p.dir}: ${p.detalle}`,
    en: (p: { dir: string; detalle: string }) => `git failed in ${p.dir}: ${p.detalle}`,
  },
  "GITX-FILTRO-RARO": {
    es: (p: { dir: string; nombre: string }) => `${p.dir} define un filtro de git con un nombre raro ("${p.nombre}") que no se puede desactivar; no se consulta.`,
    en: (p: { dir: string; nombre: string }) => `${p.dir} defines a git filter with an unusual name ("${p.nombre}") that cannot be disabled; it is not queried.`,
  },
  "GITX-NO-ES-CARPETA": {
    es: (p: { dir: string }) => `${p.dir} no existe o no es una carpeta.`,
    en: (p: { dir: string }) => `${p.dir} does not exist or is not a folder.`,
  },
  "GITX-DEMO-NO-MARCADA": {
    es: (p: { raiz: string }) => `${p.raiz} no es una carpeta de demo: no se escribe en git fuera de una.`,
    en: (p: { raiz: string }) => `${p.raiz} is not a demo folder: git is not written to outside one.`,
  },
  "GITX-DEMO-FUERA": {
    es: (p: { dir: string }) => `${p.dir} no está dentro de la carpeta de la demo.`,
    en: (p: { dir: string }) => `${p.dir} is not inside the demo folder.`,
  },
} satisfies Catalogo;
