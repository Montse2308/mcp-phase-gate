// «Avanzado»: las variables que no se editan desde Ajustes (las carpetas de prompts, estado y config, las
// preguntas de confirmación y el idioma del servidor), con su valor, de dónde sale y cómo cambiarlas.

import type { AjustesRespuesta } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Tabla } from "../comun/tabla";
import { t } from "../i18n/idioma";
import { NoDisponible, SIN_DATOS_REALES, fuenteVisible } from "./comunes";

// El nombre de una variable solo puede partirse después de un guion bajo, nunca a media palabra.
function conCortes(nombre: string) {
  return nombre.split("_").map((parte, i, partes) => (
    <>
      {parte}
      {i < partes.length - 1 ? (
        <>
          _<wbr />
        </>
      ) : null}
    </>
  ));
}

// Un texto que nombra variables (PHASE_GATE_…): cada nombre se puede partir solo tras un guion bajo.
function conNombresCortables(texto: string) {
  return texto.split(/(PHASE_GATE_[A-Z0-9_]*[A-Z0-9])/).map((parte, i) => (i % 2 === 1 ? conCortes(parte) : parte));
}

export function PaginaAvanzado() {
  const ajustes = useRecurso<AjustesRespuesta>(SIN_DATOS_REALES ? null : "/api/ajustes", ["equipo", "config"]);
  const sin = t("ajustes.avanzado.sinValor");
  return (
    <div class="pagina-ajustes pagina-avanzado">
      <h2>{t("ajustes.avanzado")}</h2>
      <p>{t("ajustes.avanzado.intro")}</p>
      {SIN_DATOS_REALES ? <NoDisponible /> : null}
      {ajustes.error ? <Aviso error={ajustes.error} /> : null}
      {ajustes.cargando && !ajustes.datos && !SIN_DATOS_REALES ? <Cargando /> : null}
      {ajustes.datos ? (
        <Tabla
          titulo={t("ajustes.avanzado.tabla")}
          columnas={[t("ajustes.avanzado.colVariable"), t("ajustes.avanzado.colUsada"), t("ajustes.avanzado.colValor"), t("ajustes.avanzado.colFuente"), t("ajustes.avanzado.colComoCambiarla")]}
          filas={ajustes.datos.avanzadas.map((v) => ({
            clave: v.logica,
            celdas: [
              <>
                <code>{conCortes(v.variable)}</code>
                <br />
                <span class="secundaria">{v.descripcion}</span>
              </>,
              v.usada ? conCortes(v.usada) : "—",
              v.valor ?? sin,
              fuenteVisible(v.fuente),
              conNombresCortables(v.comoCambiarla),
            ],
          }))}
        />
      ) : null}
    </div>
  );
}
