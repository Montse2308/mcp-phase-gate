// El ciclo de toda escritura del Studio: "Vista previa" pide el plan (resumen, diff y huella), y
// "Aplicar" lo manda con su huella. Si el disco cambió entre las dos cosas, el servidor responde 409 y se
// dice, con un botón para volver a ver el cambio. En el sitio estático no hay escrituras.
//
// Al cambiar el idioma de la interfaz, una vista previa abierta se cierra: su resumen estaba en el idioma de
// antes. La huella no depende del idioma, así que un plan visto en uno se puede aplicar en el otro. Lo mismo
// pasa si cambian los argumentos: el plan visto ya no es el de lo que se va a aplicar.
//
// Un plan con varios archivos enseña un diff por archivo (con su rótulo, si la vista lo da) y sus avisos: lo
// que el plan advierte y no impide. Con `version`, un plan abierto vuelve a pedirse cuando esa cuenta sube (el
// archivo cambió en el disco mientras la vista previa estaba abierta).

import { useEffect, useRef, useState } from "preact/hooks";

import type { AplicarRespuesta, PlanRespuesta } from "../../../src/studio/contrato.js";
import { ErrorDeApi, MODO, post } from "../datos";
import { t, useIdioma } from "../i18n/idioma";

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

// El diff de un plan, partido por archivo: cada uno empieza con `--- archivo` o `+++ archivo (nuevo)`, y cada
// comando va solo, como `$ comando`.
export function diffPorArchivo(texto: string): { archivo: string; texto: string }[] {
  const partes: { archivo: string; lineas: string[] }[] = [];
  for (const linea of texto.split("\n")) {
    if (linea.startsWith("--- ") || linea.startsWith("+++ ")) partes.push({ archivo: linea.slice(4).replace(/ \(nuevo\)$/, ""), lineas: [linea] });
    else if (linea.startsWith("$ ") || partes.length === 0) partes.push({ archivo: "", lineas: [linea] });
    else partes[partes.length - 1]!.lineas.push(linea);
  }
  return partes.map((p) => ({ archivo: p.archivo, texto: p.lineas.join("\n") }));
}

type PropiedadesDeAccion = {
  etiqueta: string;
  accion: string;
  argumentos: unknown;
  alAplicar?: () => void;
  deshabilitado?: boolean;
  version?: number;
  // Una línea que dice qué es cada archivo del diff ("viaja con la Documentación"), o null si no dice nada.
  rotulo?: (archivo: string) => string | null;
};

export function Accion({ etiqueta, accion, argumentos, alAplicar, deshabilitado, version, rotulo }: PropiedadesDeAccion) {
  const [estado, setEstado] = useState<Estado>({ tipo: "inactivo" });
  const idioma = useIdioma();
  const idiomaDelEstado = useRef(idioma);
  useEffect(() => {
    if (idiomaDelEstado.current === idioma) return;
    idiomaDelEstado.current = idioma;
    setEstado({ tipo: "inactivo" });
  }, [idioma]);
  // Con otros argumentos, el plan visto no es el de lo que se aplicaría: se cierra. Un "Hecho" se queda.
  const clave = JSON.stringify(argumentos);
  const claveVista = useRef(clave);
  useEffect(() => {
    if (claveVista.current === clave) return;
    claveVista.current = clave;
    setEstado((e) => (e.tipo === "plan" || e.tipo === "imposible" || e.tipo === "error" ? { tipo: "inactivo" } : e));
  }, [clave]);
  // Un plan abierto vuelve a pedirse cuando sube la versión de lo que hay en el disco. Un 409 ya dicho no: se
  // queda hasta que la persona pida verlo otra vez.
  const versionVista = useRef(version);
  const volverAPedir = useRef<() => void>(() => {});
  useEffect(() => {
    if (versionVista.current === version) return;
    versionVista.current = version;
    if (estado.tipo === "plan") volverAPedir.current();
  }, [version]);

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

  volverAPedir.current = pedirPlan;
  if (MODO === "estatico") {
    return (
      <p class="accion accion-solo-lectura">
        <button type="button" class="boton" disabled>
          {etiqueta}
        </button>{" "}
        <span class="secundaria">{t("estatico.soloLectura")}</span>
      </p>
    );
  }

  return (
    <div class="accion">
      {estado.tipo === "inactivo" || estado.tipo === "hecho" || estado.tipo === "imposible" || estado.tipo === "error" ? (
        <button type="button" class="boton" onClick={pedirPlan} disabled={deshabilitado}>
          {t("accion.vistaPrevia", { etiqueta })}
        </button>
      ) : null}
      {estado.tipo === "pidiendo" ? <p role="status">{t("accion.calculando")}</p> : null}
      {estado.tipo === "imposible" ? <p class="aviso" role="status">{estado.motivo}</p> : null}
      {estado.tipo === "plan" || estado.tipo === "aplicando" ? (
        <section class="vista-previa" aria-label={t("accion.region", { etiqueta })}>
          <p>{estado.plan.resumen}</p>
          <ul class="cambios">
            {estado.plan.cambios.map((c) => (
              <li key={c.archivo}>
                {t(c.tipo === "crear" ? "accion.crea" : c.tipo === "reemplazar" ? "accion.reescribe" : "accion.ejecuta")} <code>{c.archivo}</code>
              </li>
            ))}
          </ul>
          {estado.plan.avisos.length ? (
            <ul class="avisos-del-plan" aria-label={t("accion.avisos")}>
              {estado.plan.avisos.map((a, i) => (
                <li key={i} class="aviso">
                  {a}
                </li>
              ))}
            </ul>
          ) : null}
          {diffPorArchivo(estado.plan.diff).length > 1 ? (
            diffPorArchivo(estado.plan.diff).map((parte, i) => (
              <div key={i} class="diff-de-archivo">
                {rotulo?.(parte.archivo) ? <p class="secundaria rotulo-diff">{rotulo(parte.archivo)}</p> : null}
                <Diff texto={parte.texto} etiqueta={parte.archivo ? t("accion.cambiosDeEn", { etiqueta, archivo: parte.archivo }) : t("accion.cambiosDe", { etiqueta })} />
              </div>
            ))
          ) : (
            <Diff texto={estado.plan.diff} etiqueta={t("accion.cambiosDe", { etiqueta })} />
          )}
          <p class="botones">
            <button type="button" class="boton boton-principal" onClick={() => aplicar(estado.plan)} disabled={estado.tipo === "aplicando"}>
              {t(estado.tipo === "aplicando" ? "accion.aplicando" : "accion.aplicar")}
            </button>
            <button type="button" class="boton" onClick={() => setEstado({ tipo: "inactivo" })} disabled={estado.tipo === "aplicando"}>
              {t("accion.cancelar")}
            </button>
          </p>
        </section>
      ) : null}
      {estado.tipo === "hecho" ? (
        <p class="aviso aviso-hecho" role="status">
          {t("accion.hecho", { mensaje: estado.respuesta.mensaje })}
          {estado.respuesta.copias.length ? t("accion.copias", { copias: estado.respuesta.copias.join(", ") }) : ""}
        </p>
      ) : null}
      {estado.tipo === "error" ? (
        <p class="aviso aviso-error" role="alert">
          {estado.mensaje}{" "}
          {estado.cambio ? (
            <button type="button" class="boton" onClick={pedirPlan}>
              {t("accion.verOtraVez")}
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
