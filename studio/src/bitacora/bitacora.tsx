// La Bitácora de una tarea: su línea de tiempo, de lo más reciente a lo más antiguo, con filtros por tipo. Cada
// evento abre su documento o su recibo en el visor y, si hay commit, enseña el asunto y el SHA corto.

import { useState } from "preact/hooks";

import type { BitacoraRespuesta, EventoDeBitacora } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Marca } from "../comun/marcas";
import type { Forma, Tono } from "../comun/marcas";
import { Selector } from "../comun/selector";
import { ruta } from "../datos";
import { fechaLegible, t } from "../i18n/idioma";
import type { Clave } from "../i18n/es";
import { enlace } from "../rutas";
import { Visor } from "../visor/visor";

type Tipo = EventoDeBitacora["tipo"];
const TIPOS: { id: Tipo; nombre: Clave; etiqueta: Clave; forma: Forma; tono: Tono }[] = [
  { id: "documento", nombre: "bitacora.documentos", etiqueta: "bitacora.documento", forma: "cuadro", tono: "neutro" },
  { id: "recibo", nombre: "bitacora.recibos", etiqueta: "bitacora.recibo", forma: "lleno", tono: "verde" },
  { id: "commit", nombre: "bitacora.commits", etiqueta: "bitacora.commit", forma: "anillo", tono: "verde" },
  { id: "reanclaje", nombre: "bitacora.reanclajes", etiqueta: "bitacora.reanclaje", forma: "triangulo", tono: "ambar" },
  { id: "fase-cerrada", nombre: "bitacora.cierres", etiqueta: "bitacora.cierre", forma: "rombo", tono: "verde" },
];

// `t` es la tarea; dentro, `tarea` o `nombre`, para no tapar a t().
export function Bitacora({ p, t: tarea }: { p: string | undefined; t: string | undefined }) {
  if (!p || !tarea) return <Selector vista="bitacora" titulo={t("vista.bitacora")} />;
  return <BitacoraDeTarea key={`${p}/${tarea}`} p={p} t={tarea} />;
}

function BitacoraDeTarea({ p, t: nombre }: { p: string; t: string }) {
  const { datos, error, cargando } = useRecurso<BitacoraRespuesta>(`/api/tareas/${ruta(p, nombre)}/bitacora`, ["documento", "recibo"], (_tipo, d) => d.p === p && d.t === nombre);
  const [visibles, setVisibles] = useState<Set<Tipo>>(new Set(TIPOS.map((x) => x.id)));
  const [abierto, setAbierto] = useState<string | null>(null);
  const eventos = (datos?.eventos ?? []).filter((e) => visibles.has(e.tipo));
  const cambiar = (tipo: Tipo, si: boolean): void =>
    setVisibles((antes) => {
      const nuevo = new Set(antes);
      if (si) nuevo.add(tipo);
      else nuevo.delete(tipo);
      return nuevo;
    });
  return (
    <div class={`tablero${abierto ? " con-visor" : ""}`}>
      <section class="vista vista-bitacora" aria-labelledby="titulo-bitacora">
        <p class="miga">
          <a href={enlace("red")}>{t("vista.red")}</a> › <a href={enlace("tablero", p, nombre)}>{p} › {nombre}</a>
        </p>
        <h1 id="titulo-bitacora">{t("bitacora.titulo", { tarea: nombre })}</h1>
        <fieldset class="filtros">
          <legend>{t("bitacora.filtros")}</legend>
          {TIPOS.map((x) => (
            <label key={x.id}>
              <input type="checkbox" checked={visibles.has(x.id)} onChange={(e) => cambiar(x.id, (e.target as HTMLInputElement).checked)} /> {t(x.nombre)}
            </label>
          ))}
        </fieldset>
        {error ? <Aviso error={error} /> : null}
        {cargando && !datos ? <Cargando /> : null}
        {datos && eventos.length === 0 ? <p class="secundaria">{t("bitacora.sinEventos")}</p> : null}
        <ol class="linea-de-tiempo" aria-label={t("bitacora.eventos")}>
          {eventos.map((e, i) => {
            const tipo = TIPOS.find((x) => x.id === e.tipo)!;
            const fecha = fechaLegible(e.fecha);
            return (
              <li key={`${e.tipo}-${e.fecha}-${i}`} class={`evento evento-${e.tipo}`}>
                <time dateTime={e.fecha} title={fecha.completa}>
                  {fecha.texto}
                </time>
                <span class={`tipo-evento tono-${tipo.tono}`}>
                  <Marca forma={tipo.forma} tono={tipo.tono} /> {t(tipo.etiqueta)}
                </span>
                <span class="evento-titulo">{e.titulo}</span>
                {e.commit ? (
                  <span class="evento-commit">
                    <code>{e.commit.corto}</code> {e.commit.asunto}
                  </span>
                ) : null}
                {e.archivo ? (
                  <button type="button" class="enlace-boton" onClick={() => setAbierto(e.archivo)}>
                    {t("bitacora.ver", { archivo: e.archivo })}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
      {abierto ? <Visor p={p} t={nombre} archivo={abierto} alCerrar={() => setAbierto(null)} /> : null}
    </div>
  );
}
