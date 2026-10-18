// La Bitácora de una tarea (§7.7.5 del plan): su línea de tiempo, de lo más reciente a lo más antiguo, con
// filtros por tipo. Cada evento abre su documento o su recibo en el visor y, si hay commit, enseña el
// asunto y el SHA corto.

import { useState } from "preact/hooks";

import type { BitacoraRespuesta, EventoDeBitacora } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Marca } from "../comun/marcas";
import type { Forma, Tono } from "../comun/marcas";
import { Selector } from "../comun/selector";
import { ruta } from "../datos";
import { enlace } from "../rutas";
import { Visor } from "../visor/visor";

type Tipo = EventoDeBitacora["tipo"];
const TIPOS: { id: Tipo; nombre: string; etiqueta: string; forma: Forma; tono: Tono }[] = [
  { id: "documento", nombre: "Documentos", etiqueta: "Documento", forma: "cuadro", tono: "neutro" },
  { id: "recibo", nombre: "Recibos", etiqueta: "Recibo", forma: "lleno", tono: "verde" },
  { id: "commit", nombre: "Commits", etiqueta: "Commit", forma: "anillo", tono: "verde" },
  { id: "reanclaje", nombre: "Reanclajes", etiqueta: "Reanclaje", forma: "triangulo", tono: "ambar" },
  { id: "fase-cerrada", nombre: "Cierres de fase", etiqueta: "Fase cerrada", forma: "rombo", tono: "verde" },
];

// "2026-03-02 10:00" en la hora local de quien mira; un reanclaje solo trae el día.
function fechaLegible(fecha: string): string {
  if (fecha.length === 10) return fecha;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  const dos = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

export function Bitacora({ p, t }: { p: string | undefined; t: string | undefined }) {
  if (!p || !t) return <Selector vista="bitacora" titulo="Bitácora" />;
  return <BitacoraDeTarea key={`${p}/${t}`} p={p} t={t} />;
}

function BitacoraDeTarea({ p, t }: { p: string; t: string }) {
  const { datos, error, cargando } = useRecurso<BitacoraRespuesta>(`/api/tareas/${ruta(p, t)}/bitacora`, ["documento", "recibo"], (_tipo, d) => d.p === p && d.t === t);
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
          <a href={enlace("red")}>Red</a> › <a href={enlace("tablero", p, t)}>{p} › {t}</a>
        </p>
        <h1 id="titulo-bitacora">Bitácora de {t}</h1>
        <fieldset class="filtros">
          <legend>Qué enseñar</legend>
          {TIPOS.map((x) => (
            <label key={x.id}>
              <input type="checkbox" checked={visibles.has(x.id)} onChange={(e) => cambiar(x.id, (e.target as HTMLInputElement).checked)} /> {x.nombre}
            </label>
          ))}
        </fieldset>
        {error ? <Aviso error={error} /> : null}
        {cargando && !datos ? <Cargando /> : null}
        {datos && eventos.length === 0 ? <p class="secundaria">No hay eventos con esos filtros.</p> : null}
        <ol class="linea-de-tiempo" aria-label="Eventos de la tarea">
          {eventos.map((e, i) => {
            const tipo = TIPOS.find((x) => x.id === e.tipo)!;
            return (
              <li key={`${e.tipo}-${e.fecha}-${i}`} class={`evento evento-${e.tipo}`}>
                <time dateTime={e.fecha}>{fechaLegible(e.fecha)}</time>
                <span class={`tipo-evento tono-${tipo.tono}`}>
                  <Marca forma={tipo.forma} tono={tipo.tono} /> {tipo.etiqueta}
                </span>
                <span class="evento-titulo">{e.titulo}</span>
                {e.commit ? (
                  <span class="evento-commit">
                    <code>{e.commit.corto}</code> {e.commit.asunto}
                  </span>
                ) : null}
                {e.archivo ? (
                  <button type="button" class="enlace-boton" onClick={() => setAbierto(e.archivo)}>
                    Ver {e.archivo}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
      {abierto ? <Visor p={p} t={t} archivo={abierto} alCerrar={() => setAbierto(null)} /> : null}
    </div>
  );
}
