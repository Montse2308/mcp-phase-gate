// El estado de cada lote de la Fase 4, a partir de la fila de get_batch_status. El tipo es la clase estable
// de la celda (estado-<tipo>); la palabra y el detalle salen del diccionario, en el idioma de la interfaz.

import type { FilaDeLote } from "../../../src/studio/contrato.js";
import { t } from "../i18n/idioma";

export type TipoDeSello = "sin-recibo" | "commit-pendiente" | "verificado" | "sellado" | "con-pendientes" | "rechazado" | "descartado" | "manual" | "nota" | "no-vigente";

export type Sello = {
  tipo: TipoDeSello;
  palabra: string; // el estado, dicho en una palabra
  detalle: string | null; // SHA, sha256, fecha, la nota o el motivo, separados por " · "
};

function base(fila: FilaDeLote): { tipo: "verificado" | "sellado"; palabra: string; detalle: string | null } | null {
  const sello = fila.sello;
  if (fila.ancla?.tipo === "commit") return { tipo: "verificado", palabra: t("estado.verificado"), detalle: [sello?.corto, sello?.fecha].filter(Boolean).join(" · ") || null };
  if (fila.ancla?.tipo === "sha256") return { tipo: "sellado", palabra: t("estado.sellado"), detalle: [sello?.sha256, sello?.fecha].filter(Boolean).join(" · ") || null };
  return null;
}

export function selloDe(fila: FilaDeLote): Sello {
  if (!fila.recibo) return { tipo: "sin-recibo", palabra: t("estado.sinRecibo"), detalle: null };
  if (fila.estado === "fallido") return { tipo: "rechazado", palabra: t("estado.rechazado"), detalle: fila.sello?.fecha ?? null };
  if (fila.estado === "descartado") return { tipo: "descartado", palabra: t("estado.descartado"), detalle: fila.sello?.fecha ?? null };
  if (fila.ancla?.tipo === "pendiente") return { tipo: "commit-pendiente", palabra: t("estado.commitPendiente"), detalle: null };
  const sellado = base(fila);
  if (fila.vigente === false && sellado) {
    return { tipo: "no-vigente", palabra: t("estado.noVigente"), detalle: fila.ancla?.tipo === "commit" ? t("estado.yaNoEnLaRama") : t("estado.artefactoCambio") };
  }
  if (fila.origen === "manual") return { tipo: "manual", palabra: t("estado.manual"), detalle: sellado?.detalle ?? null };
  if (sellado && fila.estado === "con pendientes") return { tipo: "con-pendientes", palabra: t("estado.conPendientes"), detalle: sellado.detalle };
  if (sellado) return sellado;
  // Un ancla nota (política sin commits, o sin git): ni verificado ni sellado. El resumen viene del servidor,
  // en el idioma de la petición ("nota: …" o "note: …").
  return { tipo: "nota", palabra: t("estado.nota"), detalle: fila.ancla?.resumen.replace(/^(?:nota|note): /, "") ?? null };
}
