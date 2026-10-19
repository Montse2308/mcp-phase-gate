// La estructura de la página: la barra con las cinco vistas, el interruptor Cabina / Sobrio y el selector
// ES / EN, la banda de la demo y la vista que toca según el hash. Al cambiar de idioma se vuelve a pintar
// todo sin recargar, y cada vista vuelve a pedir sus datos en el idioma nuevo (useRecurso).

import { Bitacora } from "./bitacora/bitacora";
import { MODO, textoDeLaBanda } from "./datos";
import { IDIOMAS_UI, NOMBRE_DEL_IDIOMA, cambiarIdioma, t, useIdioma } from "./i18n/idioma";
import { cambiarModoVisual, useModoVisual } from "./preferencias";
import { Red } from "./red/red";
import { VISTAS, useRuta } from "./rutas";
import { Tablero } from "./tablero/tablero";
import { Taller } from "./taller/taller";
import { Vigia } from "./vigia/vigia";
import type { Ruta } from "./rutas";

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
    default:
      return <Pendiente nombre={t(`vista.${ruta.vista as string}` as "vista.red")} />;
  }
}

// ES / EN: dos botones de verdad, con aria-pressed, en un grupo con nombre. Cada uno lleva el nombre del
// idioma en ese idioma (title y lang), para que se lea bien sea cual sea el de la página.
function SelectorDeIdioma() {
  const idioma = useIdioma();
  return (
    <div class="idiomas" role="group" aria-label={t("idioma.grupo")}>
      {IDIOMAS_UI.map((id) => (
        <button key={id} type="button" class="idioma" lang={id} title={NOMBRE_DEL_IDIOMA[id]} aria-pressed={idioma === id} onClick={() => cambiarIdioma(id)}>
          {id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const ruta = useRuta();
  const modo = useModoVisual();
  useIdioma(); // al cambiar, se vuelve a pintar todo con el diccionario nuevo
  return (
    <>
      <a class="saltar" href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById("contenido")?.focus(); }}>
        {t("app.saltar")}
      </a>
      {MODO !== "vivo" ? (
        <p class="banda-demo" role="note">
          {textoDeLaBanda()}
        </p>
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
          <button type="button" class="interruptor" aria-pressed={modo === "sobrio"} onClick={cambiarModoVisual}>
            {t("modo.boton", { modo: t(modo === "sobrio" ? "modo.sobrio" : "modo.cabina") })}
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
