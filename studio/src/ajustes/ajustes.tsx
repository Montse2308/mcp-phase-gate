// Ajustes: el único lugar donde se edita la configuración. Un menú a la izquierda (Este equipo, cada proyecto,
// Clientes MCP, Studio y Avanzado) y, a la derecha, la página elegida. La página que tiene cambios sin aplicar
// lleva su número en el menú. Por debajo de 760 px el menú pasa a un selector de arriba, que es la misma lista.
//
// Los hashes: #/ajustes/equipo, #/ajustes/proyecto/<P>, #/ajustes/clientes, #/ajustes/studio y
// #/ajustes/avanzado. Una página que no existe cae en Este equipo.

import type { ProyectosRespuesta } from "../../../src/studio/contrato.js";
import { Aviso, useRecurso } from "../comun/estado";
import { t, tn } from "../i18n/idioma";
import { enlace } from "../rutas";
import type { Ruta } from "../rutas";
import { PaginaAvanzado } from "./avanzado";
import { useCambios } from "./borrador";
import { PaginaClientes } from "./clientes";
import { PaginaEquipo } from "./equipo";
import { PaginaProyecto } from "./proyecto";
import { PaginaStudio } from "./studio";

type Entrada = { clave: string; href: string; texto: string };

function entradasDelMenu(proyectos: string[]): Entrada[] {
  return [
    { clave: "equipo", href: enlace("ajustes", "equipo"), texto: t("ajustes.equipo") },
    ...proyectos.map((p) => ({ clave: `proyecto:${p}`, href: enlace("ajustes", "proyecto", p), texto: p })),
    { clave: "clientes", href: enlace("ajustes", "clientes"), texto: t("ajustes.clientes") },
    { clave: "studio", href: enlace("ajustes", "studio"), texto: t("ajustes.studio") },
    { clave: "avanzado", href: enlace("ajustes", "avanzado"), texto: t("ajustes.avanzado") },
  ];
}

// La clave de la página que dice la ruta.
function paginaDe(ruta: Ruta): string {
  const pagina = ruta.partes[0];
  if (pagina === "proyecto" && ruta.partes[1]) return `proyecto:${ruta.partes[1]}`;
  if (pagina === "clientes" || pagina === "studio" || pagina === "avanzado") return pagina;
  return "equipo";
}

export function Ajustes({ ruta }: { ruta: Ruta }) {
  const proyectos = useRecurso<ProyectosRespuesta>("/api/proyectos", ["equipo", "config", "documento"]);
  const cuantos = useCambios();
  const nombres = (proyectos.datos?.proyectos ?? []).map((p) => p.nombre);
  const actual = paginaDe(ruta);
  // Un proyecto que ya no está en la lista (se borró, o aún no cargó) se sigue enseñando en el menú mientras se mira.
  const entradas = entradasDelMenu(actual.startsWith("proyecto:") && !nombres.includes(actual.slice(9)) ? [...nombres, actual.slice(9)] : nombres);
  const presets = proyectos.datos?.presets ?? [];

  const cambios = (clave: string) => {
    const n = cuantos(clave);
    return n > 0 ? (
      <span class="numero-de-cambios" title={tn("ajustes.cambiosSinAplicar", n)}>
        {n}
        <span class="solo-lectura"> {tn("ajustes.cambiosSinAplicar", n)}</span>
      </span>
    ) : null;
  };

  return (
    <section class="vista vista-ajustes" aria-labelledby="titulo-ajustes">
      <h1 id="titulo-ajustes">{t("ajustes.titulo")}</h1>
      {proyectos.error ? <Aviso error={proyectos.error} /> : null}
      <div class="ajustes-cuerpo">
        <nav class="menu-ajustes" aria-label={t("ajustes.menu")}>
          <ul class="menu-lista">
            {entradas.map((e, i) => (
              <li key={e.clave}>
                {i === 1 && nombres.length ? <span class="menu-grupo secundaria">{t("ajustes.proyectos")}</span> : null}
                <a href={e.href} aria-current={e.clave === actual ? "page" : undefined}>
                  {e.texto}
                  {cambios(e.clave)}
                </a>
              </li>
            ))}
          </ul>
          <label class="menu-selector">
            <span class="solo-lectura">{t("ajustes.menuSelector")}</span>
            <select
              value={entradas.find((e) => e.clave === actual)?.href ?? entradas[0]!.href}
              onChange={(e) => {
                window.location.hash = (e.target as HTMLSelectElement).value;
              }}
            >
              {entradas.map((e) => (
                <option key={e.clave} value={e.href}>
                  {cuantos(e.clave) > 0 ? `${e.texto} (${cuantos(e.clave)})` : e.texto}
                </option>
              ))}
            </select>
          </label>
        </nav>
        <div class="ajustes-pagina">
          {actual === "equipo" ? <PaginaEquipo presets={presets} /> : null}
          {actual.startsWith("proyecto:") ? <PaginaProyecto key={actual} proyecto={actual.slice(9)} presets={presets} /> : null}
          {actual === "clientes" ? <PaginaClientes /> : null}
          {actual === "studio" ? <PaginaStudio /> : null}
          {actual === "avanzado" ? <PaginaAvanzado /> : null}
        </div>
      </div>
    </section>
  );
}
