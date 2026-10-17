// El semáforo de una estación (§7.7.2): una cabeza de señal con su lámpara. Cada señal tiene su forma
// (círculo lleno, círculo con anillo, rombo, círculo vacío) y siempre va con su texto.

import type { Senal as TipoSenal } from "../../../src/studio/contrato.js";

export function Senal({ senal }: { senal: TipoSenal }) {
  return (
    <svg class={`senal senal-${senal}`} viewBox="0 0 28 40" width="28" height="40" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="24" height="30" rx="7" class="senal-caja" />
      <rect x="12" y="32" width="4" height="7" class="senal-poste" />
      {senal === "verde" ? <circle cx="14" cy="17" r="7" class="senal-luz" /> : null}
      {senal === "ambar" ? (
        <>
          <circle cx="14" cy="17" r="8" class="senal-aro" fill="none" stroke-width="2" />
          <circle cx="14" cy="17" r="4" class="senal-luz" />
        </>
      ) : null}
      {senal === "rojo" ? <path d="M14 8 23 17 14 26 5 17Z" class="senal-luz" /> : null}
      {senal === "apagado" ? <circle cx="14" cy="17" r="6.5" class="senal-aro" fill="none" stroke-width="2" /> : null}
    </svg>
  );
}
