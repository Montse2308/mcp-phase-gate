// La estructura de la página: la barra con las seis vistas, el botón del tema y el selector
// ES / EN, la banda de la demo y la vista que toca según el hash. Al cambiar de idioma se vuelve a pintar
// todo sin recargar, y cada vista vuelve a pedir sus datos en el idioma nuevo (useRecurso).

import { Ajustes } from "./ajustes/ajustes";
import { guardarSalida } from "./ajustes/borrador";
import { Bitacora } from "./bitacora/bitacora";
import { MODO, ayudaDeLaBanda, enlaceDeLaPortada, get, hashEnElIdioma, textoDeLaBanda } from "./datos";
import { IDIOMAS_UI, NOMBRE_DEL_IDIOMA, cambiarIdioma, idiomaActual, t, useIdioma } from "./i18n/idioma";
import type { IdiomaUi } from "./i18n/idioma";
import { cambiarTema, useTemaOscuro } from "./preferencias";
import { Red } from "./red/red";
import { VISTAS, enlace, leerRuta, referenciaDe, useRuta } from "./rutas";
import { Tablero } from "./tablero/tablero";
import { Taller } from "./taller/taller";
import { Vigia } from "./vigia/vigia";
import type { Ruta } from "./rutas";
import { useEffect } from "preact/hooks";

function Pendiente({ nombre }: { nombre: string }) {
  return (
    <section class="vista" aria-labelledby="titulo-pendiente">
      <h1 id="titulo-pendiente">{nombre}</h1>
      <p>{t("app.pendiente")}</p>
    </section>
  );
}

function Vista({ ruta }: { ruta: Ruta }) {
  switch (ruta.vista) {
    case "red":
      return <Red />;
    case "tablero":
      return <Tablero p={ruta.partes[0]} t={ruta.partes[1]} />;
    case "taller":
      return <Taller ruta={ruta} />;
    case "vigia":
      return <Vigia />;
    case "bitacora":
      return <Bitacora p={ruta.partes[0]} t={ruta.partes[1]} />;
    case "ajustes":
      return <Ajustes ruta={ruta} />;
    default:
      return <Pendiente nombre={t(`vista.${ruta.vista as string}` as "vista.red")} />;
  }
}

// En la demo estática, los nombres de proyecto y de tarea son otros en cada idioma: la ruta pasa a la
// equivalente (o a la Red) a la vez que el idioma. Se reescribe el hash sin añadir una entrada al historial, y el
// idioma cambia en el mismo instante: así no se pinta la ruta vieja con el diccionario nuevo.
function elegirIdioma(nuevo: IdiomaUi): void {
  const de = idiomaActual();
  if (MODO !== "estatico" || nuevo === de) {
    cambiarIdioma(nuevo);
    return;
  }
  const irA = (hash: string | null): void => {
    if (hash !== null && hash !== window.location.hash) {
      window.history.replaceState(window.history.state, "", hash);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
    cambiarIdioma(nuevo);
  };
  hashEnElIdioma(leerRuta(), de, nuevo).then(irA, () => irA(null));
}

// ES / EN: dos botones de verdad, con aria-pressed, en un grupo con nombre. Cada uno lleva el nombre del
// idioma en ese idioma (title y lang), para que se lea bien sea cual sea el de la página.
function SelectorDeIdioma() {
  const idioma = useIdioma();
  return (
    <div class="idiomas" role="group" aria-label={t("idioma.grupo")}>
      {IDIOMAS_UI.map((id) => (
        <button key={id} type="button" class="idioma" lang={id} title={NOMBRE_DEL_IDIOMA[id]} aria-pressed={idioma === id} onClick={() => elegirIdioma(id)}>
          {id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// Sin Documentación configurada, abrir el Studio sin elegir una vista lleva a Ajustes, a decir dónde está: una
// Red vacía no le sirve a nadie. Solo al abrir y solo con el Studio en vivo: en la demo y en el sitio exportado
// siempre hay datos.
function useAjustesSiNoHayDocumentacion(): void {
  useEffect(() => {
    if (MODO !== "vivo" || !["", "#", "#/"].includes(window.location.hash.split("?")[0]!)) return;
    get<{ proyectos: unknown[]; error: string | null }>("/api/proyectos").then(
      (r) => {
        if (r.error !== null && r.proyectos.length === 0 && ["", "#", "#/"].includes(window.location.hash.split("?")[0]!)) window.location.replace(enlace("ajustes", "equipo"));
      },
      () => {}
    );
  }, []);
}

// El título de la pestaña: la vista y, si los hay, el proyecto y la tarea («Tablero · TIENDA · envio-gratis ·
// Studio»), en el idioma de la interfaz.
function tituloDe(ruta: Ruta): string {
  const { proyecto, tarea } = referenciaDe(ruta);
  return [t(`vista.${ruta.vista}`), proyecto, tarea, "Studio"].filter(Boolean).join(" · ");
}

export function App() {
  const ruta = useRuta();
  useEffect(guardarSalida, []);
  useAjustesSiNoHayDocumentacion();
  const oscuro = useTemaOscuro();
  const idioma = useIdioma(); // al cambiar, se vuelve a pintar todo con el diccionario nuevo
  useEffect(() => {
    document.title = tituloDe(ruta);
  }, [ruta, idioma]);
  return (
    <>
      <a class="saltar" href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById("contenido")?.focus(); }}>
        {t("app.saltar")}
      </a>
      {MODO !== "vivo" ? (
        <aside class="banda-demo" aria-label={t("banda.etiqueta")} title={ayudaDeLaBanda()}>
          {textoDeLaBanda()}
          {enlaceDeLaPortada() ? (
            <>
              {" "}
              <a href={enlaceDeLaPortada()!}>{t("banda.queEs")}</a>
            </>
          ) : null}
        </aside>
      ) : null}
      <header class="barra">
        <p class="marca-studio">
          <span class="marca-nombre">mcp-phase-gate</span> <span class="marca-studio-texto">Studio</span>
        </p>
        <nav aria-label={t("app.vistas")}>
          <ul>
            {VISTAS.map((v) => (
              <li key={v}>
                <a href={`#/${v}`} aria-current={ruta.vista === v ? "page" : undefined}>
                  {t(`vista.${v}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div class="preferencias">
          <button type="button" class="interruptor" aria-pressed={oscuro} onClick={cambiarTema}>
            {t("tema.oscuro")}
          </button>
          <SelectorDeIdioma />
        </div>
      </header>
      <main id="contenido" tabIndex={-1}>
        <Vista ruta={ruta} />
      </main>
    </>
  );
}
