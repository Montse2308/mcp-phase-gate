// Elegir una tarea para una vista que trabaja sobre una (el Tablero, la Bitácora).

import { useEffect, useState } from "preact/hooks";

import type { ProyectosRespuesta } from "../../../src/studio/contrato.js";
import { get, ruta } from "../datos";
import { t } from "../i18n/idioma";
import { enlace } from "../rutas";
import type { Vista } from "../rutas";
import { Aviso, useRecurso } from "./estado";

export function Selector({ vista, titulo }: { vista: Vista; titulo: string }) {
  const { datos, error } = useRecurso<ProyectosRespuesta>("/api/proyectos", ["punteros", "documento"]);
  const [tareas, setTareas] = useState<Record<string, string[]>>({});
  useEffect(() => {
    // Un proyecto con el manifiesto roto no tiene tareas que listar: su error ya sale en la Red.
    for (const p of (datos?.proyectos ?? []).filter((p) => p.manifiesto.estado !== "invalido")) {
      get<{ tareas: { tarea: string }[] }>(`/api/proyectos/${ruta(p.nombre)}/tareas`).then(
        (r) => setTareas((antes) => ({ ...antes, [p.nombre]: r.tareas.map((x) => x.tarea) })),
        () => {}
      );
    }
  }, [datos]);
  return (
    <section class="vista" aria-labelledby="titulo-selector">
      <h1 id="titulo-selector">{titulo}</h1>
      <p>{t("selector.elige")}</p>
      {error ? <Aviso error={error} /> : null}
      {(datos?.proyectos ?? []).map((p) => (
        <section key={p.nombre} class="selector-proyecto" aria-label={p.nombre}>
          <h2>{p.nombre}</h2>
          {p.manifiesto.estado === "invalido" ? <p class="secundaria">{t("selector.manifiestoInvalido")}</p> : null}
          {(tareas[p.nombre] ?? []).length ? (
            <ul>
              {(tareas[p.nombre] ?? []).map((tarea) => (
                <li key={tarea}>
                  <a href={enlace(vista, p.nombre, tarea)}>{tarea}</a>
                  {p.activa?.tarea === tarea ? <span class="secundaria">{t("selector.activa")}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p class="secundaria">{t("selector.sinTareas")}</p>
          )}
        </section>
      ))}
    </section>
  );
}

