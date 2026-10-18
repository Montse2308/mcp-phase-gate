// El sello de cada vagón de la Fase 4 (§7.7.2 del plan), a partir de la fila de get_batch_status. Una sola
// función para los dos modos: Cabina pinta el sello; Sobrio, el texto.

import type { FilaDeLote } from "../../../src/studio/contrato.js";

export type TipoDeSello = "vacio" | "en-via" | "verificado" | "sellado" | "pendientes" | "rechazado" | "anulado" | "manual" | "nota" | "agrietado";

export type Sello = {
  tipo: TipoDeSello;
  palabra: string | null; // lo que dice el sello (null: sin sello)
  detalle: string | null; // SHA, sha256, fecha o la nota
  sobrio: string; // el texto del modo Sobrio
  marco: string | null; // el SVG del sello, en public/sellos/
  banda: string | null; // la banda ámbar de "con pendientes"
};

function base(fila: FilaDeLote): { palabra: string; detalle: string | null; sobrio: string; marco: string } | null {
  const sello = fila.sello;
  if (fila.ancla?.tipo === "commit") {
    const corto = sello?.corto ?? "";
    return { palabra: "VERIFICADO", detalle: [corto, sello?.fecha].filter(Boolean).join(" · ") || null, sobrio: `verificado · ${corto}`, marco: "verificado" };
  }
  if (fila.ancla?.tipo === "sha256") {
    const hash = sello?.sha256 ?? "";
    return { palabra: "SELLADO", detalle: [hash, sello?.fecha].filter(Boolean).join(" · ") || null, sobrio: `sha256 · ${hash}`, marco: "sellado" };
  }
  return null;
}

export function selloDe(fila: FilaDeLote): Sello {
  const vacio = { banda: null };
  if (!fila.recibo) return { tipo: "vacio", palabra: null, detalle: null, sobrio: "—", marco: null, ...vacio };
  if (fila.estado === "fallido") return { tipo: "rechazado", palabra: "RECHAZADO", detalle: fila.sello?.fecha ?? null, sobrio: "fallido", marco: "rechazado", ...vacio };
  if (fila.estado === "descartado") return { tipo: "anulado", palabra: "ANULADO", detalle: fila.sello?.fecha ?? null, sobrio: "descartado", marco: "anulado", ...vacio };
  if (fila.ancla?.tipo === "pendiente") return { tipo: "en-via", palabra: "EN VÍA", detalle: "commit pendiente", sobrio: "pendiente", marco: null, ...vacio };
  const sellado = base(fila);
  if (fila.vigente === false && sellado) {
    return {
      tipo: "agrietado",
      palabra: sellado.palabra,
      detalle: fila.ancla?.tipo === "commit" ? "ya no está en la rama" : "el artefacto cambió",
      sobrio: "no vigente",
      marco: sellado.marco,
      ...vacio,
    };
  }
  if (fila.origen === "manual") return { tipo: "manual", palabra: "MANUAL", detalle: sellado?.detalle ?? null, sobrio: "manual", marco: "manual", ...vacio };
  if (sellado && fila.estado === "con pendientes") return { tipo: "pendientes", palabra: sellado.palabra, detalle: sellado.detalle, sobrio: "con pendientes", marco: sellado.marco, banda: "CON PENDIENTES" };
  if (sellado) return { tipo: sellado.marco as TipoDeSello, palabra: sellado.palabra, detalle: sellado.detalle, sobrio: sellado.sobrio, marco: sellado.marco, ...vacio };
  // Un ancla nota (política sin commits, o sin git): ni verificado ni sellado.
  return { tipo: "nota", palabra: "NOTA", detalle: fila.ancla?.resumen.replace(/^nota: /, "") ?? null, sobrio: "nota", marco: "manual", ...vacio };
}
