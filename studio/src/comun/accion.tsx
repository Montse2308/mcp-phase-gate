// El ciclo de toda escritura del Studio (§7.6): "Vista previa" pide el plan (resumen, diff y huella), y
// "Aplicar" lo manda con su huella. Si el disco cambió entre las dos cosas, el servidor responde 409 y se
// dice, con un botón para volver a ver el cambio. En el sitio estático no hay escrituras.

import { useState } from "preact/hooks";

import type { AplicarRespuesta, PlanRespuesta } from "../../../src/studio/contrato.js";
import { ErrorDeApi, MODO, post } from "../datos";

export const SOLO_LECTURA = "En la demo publicada todo es de solo lectura. Pruébalo en tu equipo con npx mcp-phase-gate ui --demo.";

type Estado =
  | { tipo: "inactivo" }
  | { tipo: "pidiendo" }
  | { tipo: "plan"; plan: Extract<PlanRespuesta, { posible: true }> }
  | { tipo: "imposible"; motivo: string }
  | { tipo: "aplicando"; plan: Extract<PlanRespuesta, { posible: true }> }
  | { tipo: "hecho"; respuesta: AplicarRespuesta }
  | { tipo: "error"; mensaje: string; cambio: boolean };

export function Diff({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  return (
    <pre class="diff" aria-label={etiqueta}>
      {texto.split("\n").map((linea, i) => {
        const clase = linea.startsWith("+++") || linea.startsWith("---") ? "diff-archivo" : linea.startsWith("+ ") ? "diff-mas" : linea.startsWith("- ") ? "diff-menos" : linea.startsWith("$ ") ? "diff-comando" : "diff-igual";
        return (
          <span key={i} class={clase}>
            {linea}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}

export function Accion({ etiqueta, accion, argumentos, alAplicar, deshabilitado }: { etiqueta: string; accion: string; argumentos: unknown; alAplicar?: () => void; deshabilitado?: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  if (MODO === "estatico") {
    return (
      <p class="accion accion-solo-lectura">
        <button type="button" class="boton" disabled>
          {etiqueta}
        </button>{" "}
        <span class="secundaria">{SOLO_LECTURA}</span>
      </p>
    );
  }

  const pedirPlan = (): void => {
    setEstado({ tipo: "pidiendo" });
    post<PlanRespuesta>("/api/acciones/plan", { accion, argumentos }).then(
      (plan) => setEstado(plan.posible ? { tipo: "plan", plan } : { tipo: "imposible", motivo: plan.motivo }),
      (error: unknown) => setEstado({ tipo: "error", mensaje: error instanceof Error ? error.message : String(error), cambio: false })
    );
  };
  const aplicar = (plan: Extract<PlanRespuesta, { posible: true }>): void => {
    setEstado({ tipo: "aplicando", plan });
    post<AplicarRespuesta>("/api/acciones/aplicar", { accion, argumentos, huella: plan.huella }).then(
      (respuesta) => {
        setEstado({ tipo: "hecho", respuesta });
        alAplicar?.();
      },
      (error: unknown) => setEstado({ tipo: "error", mensaje: error instanceof Error ? error.message : String(error), cambio: error instanceof ErrorDeApi && error.estado === 409 })
    );
  };

  return (
    <div class="accion">
      {estado.tipo === "inactivo" || estado.tipo === "hecho" || estado.tipo === "imposible" || estado.tipo === "error" ? (
        <button type="button" class="boton" onClick={pedirPlan} disabled={deshabilitado}>
          {etiqueta}: vista previa
        </button>
      ) : null}
      {estado.tipo === "pidiendo" ? <p role="status">Calculando el cambio…</p> : null}
      {estado.tipo === "imposible" ? <p class="aviso" role="status">{estado.motivo}</p> : null}
      {estado.tipo === "plan" || estado.tipo === "aplicando" ? (
        <section class="vista-previa" aria-label={`Vista previa: ${etiqueta}`}>
          <p>{estado.plan.resumen}</p>
          <ul class="cambios">
            {estado.plan.cambios.map((c) => (
              <li key={c.archivo}>
                {c.tipo === "crear" ? "Crea" : c.tipo === "reemplazar" ? "Reescribe (deja copia .bak)" : "Ejecuta"} <code>{c.archivo}</code>
              </li>
            ))}
          </ul>
          <Diff texto={estado.plan.diff} etiqueta={`Cambios de ${etiqueta}`} />
          <p class="botones">
            <button type="button" class="boton boton-principal" onClick={() => aplicar(estado.plan)} disabled={estado.tipo === "aplicando"}>
              {estado.tipo === "aplicando" ? "Aplicando…" : "Aplicar"}
            </button>
            <button type="button" class="boton" onClick={() => setEstado({ tipo: "inactivo" })} disabled={estado.tipo === "aplicando"}>
              Cancelar
            </button>
          </p>
        </section>
      ) : null}
      {estado.tipo === "hecho" ? (
        <p class="aviso aviso-hecho" role="status">
          Hecho: {estado.respuesta.mensaje}
          {estado.respuesta.copias.length ? ` Copia de lo anterior: ${estado.respuesta.copias.join(", ")}.` : ""}
        </p>
      ) : null}
      {estado.tipo === "error" ? (
        <p class="aviso aviso-error" role="alert">
          {estado.mensaje}{" "}
          {estado.cambio ? (
            <button type="button" class="boton" onClick={pedirPlan}>
              Ver el cambio otra vez
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
