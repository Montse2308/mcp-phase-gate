// «Studio»: la apariencia de este navegador, el tema (Sistema, Claro u Oscuro) y el idioma de la interfaz. Se
// aplica al momento y no hay vista previa, porque no escribe en el disco: lo recuerda el navegador. Funciona
// igual en el sitio exportado, porque solo cambia el navegador.

import { IDIOMAS_UI, NOMBRE_DEL_IDIOMA, cambiarIdioma, t, useIdioma } from "../i18n/idioma";
import { elegirTema, useTemaElegido } from "../preferencias";

const TEMAS = [
  { valor: "sistema", texto: "ajustes.studio.temaSistema" },
  { valor: "claro", texto: "ajustes.studio.temaClaro" },
  { valor: "oscuro", texto: "ajustes.studio.temaOscuro" },
] as const;

export function PaginaStudio() {
  const tema = useTemaElegido();
  const idioma = useIdioma();
  return (
    <div class="pagina-ajustes pagina-studio">
      <h2>{t("ajustes.studio")}</h2>
      <p>{t("ajustes.studio.intro")}</p>
      <fieldset class="campo-ajuste">
        <legend>{t("ajustes.studio.tema")}</legend>
        {TEMAS.map((o) => (
          <label key={o.valor} class="opcion">
            <input type="radio" name="tema" value={o.valor} checked={tema === o.valor} onChange={() => elegirTema(o.valor)} /> {t(o.texto)}
          </label>
        ))}
      </fieldset>
      <fieldset class="campo-ajuste">
        <legend>{t("ajustes.studio.idioma")}</legend>
        {IDIOMAS_UI.map((id) => (
          <label key={id} class="opcion" lang={id}>
            <input type="radio" name="idioma-ui" value={id} checked={idioma === id} onChange={() => cambiarIdioma(id)} /> {NOMBRE_DEL_IDIOMA[id]}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
