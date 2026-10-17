// El Taller de prompts (§7.7.3 del plan): de qué capa sale cada ranura de una fase, el contenido efectivo
// frente al de fábrica (un diff por líneas), las reglas del proyecto y "Editar", que lanza un eject a la
// capa global o a la del proyecto. "Ver prompt completo" enseña el texto exacto que recibe el modelo (el
// mismo de get_phase_prompt) con un botón para copiarlo.

import { diffLines } from "diff";
import { useEffect, useState } from "preact/hooks";

import type { ProyectosRespuesta, PromptRespuesta, RanuraApi, TareasRespuesta } from "../../../src/studio/contrato.js";
import { Accion } from "../comun/accion";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { ruta } from "../datos";
import { enlace } from "../rutas";
import type { Ruta } from "../rutas";

const POLITICAS = ["agente-commitea-con-OK", "agente-propone", "auto", "ninguno"];

function irA(p: string, fase: number, tarea: string | null): void {
  const consulta = new URLSearchParams({ fase: String(fase) });
  if (tarea) consulta.set("tarea", tarea);
  window.location.hash = `${enlace("taller", p)}?${consulta.toString()}`;
}

function DiffDeRanura({ ranura }: { ranura: RanuraApi }) {
  if (ranura.fabrica === null) return <p class="secundaria">Esta ranura no existe en los prompts de fábrica: todo su contenido es de {ranura.capa}.</p>;
  if (ranura.fabrica === ranura.efectivo) return <p class="secundaria">Igual que la de fábrica.</p>;
  const partes = diffLines(ranura.fabrica, ranura.efectivo);
  return (
    <pre class="diff" aria-label={`Diferencias de ${ranura.id} con la fábrica`}>
      {partes.flatMap((parte, i) =>
        parte.value
          .replace(/\n$/, "")
          .split("\n")
          .map((linea, j) => (
            <span key={`${i}-${j}`} class={parte.added ? "diff-mas" : parte.removed ? "diff-menos" : "diff-igual"}>
              {parte.added ? "+ " : parte.removed ? "- " : "  "}
              {linea}
              {"\n"}
            </span>
          ))
      )}
    </pre>
  );
}

function Reglas({ p, datos, alAplicar }: { p: string; datos: PromptRespuesta; alAplicar: () => void }) {
  const [lotes, setLotes] = useState(datos.reglas.lotes);
  const [commits, setCommits] = useState(datos.reglas.commits);
  useEffect(() => {
    setLotes(datos.reglas.lotes);
    setCommits(datos.reglas.commits);
  }, [datos.reglas.lotes, datos.reglas.commits]);
  const cambios = { ...(lotes !== datos.reglas.lotes ? { lotes } : {}), ...(commits !== datos.reglas.commits ? { commits } : {}) };
  return (
    <section class="reglas" aria-labelledby="titulo-reglas">
      <h2 id="titulo-reglas">Reglas de {p}</h2>
      <p class="secundaria">
        Preset: <strong>{datos.preset.nombre}</strong> ({datos.preset.origen})
      </p>
      <p>
        <label>
          <input type="checkbox" checked={lotes} onChange={(e) => setLotes((e.target as HTMLInputElement).checked)} /> Lotes
        </label>{" "}
        <label for="politica-commits">Política de commits</label>{" "}
        <select id="politica-commits" value={commits} onChange={(e) => setCommits((e.target as HTMLSelectElement).value)}>
          {POLITICAS.map((politica) => (
            <option key={politica} value={politica}>
              {politica}
            </option>
          ))}
        </select>
      </p>
      <Accion etiqueta="Cambiar las reglas" accion="reglas" argumentos={{ proyecto: p, ...cambios }} alAplicar={alAplicar} deshabilitado={Object.keys(cambios).length === 0} />
    </section>
  );
}

export function Taller({ ruta: r }: { ruta: Ruta }) {
  const proyectos = useRecurso<ProyectosRespuesta>("/api/proyectos", ["config"]);
  const validos = (proyectos.datos?.proyectos ?? []).filter((p) => p.manifiesto.estado !== "invalido");
  const p = r.partes[0] ?? validos[0]?.nombre ?? null;
  const fase = Number(r.consulta.get("fase") ?? "1") || 1;
  const tarea = r.consulta.get("tarea");
  const tareas = useRecurso<TareasRespuesta>(p ? `/api/proyectos/${ruta(p)}/tareas` : null, ["documento", "punteros"]);
  const prompt = useRecurso<PromptRespuesta>(p ? `/api/prompts/${ruta(p, fase)}${tarea ? `?tarea=${encodeURIComponent(tarea)}` : ""}` : null, ["prompts", "config", "documento"], (_t, d) => !d.p || d.p === p);
  const [elegida, setElegida] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const datos = prompt.datos;
  const ranura = datos?.ranuras.find((x) => x.id === elegida) ?? null;

  return (
    <section class="vista vista-taller" aria-labelledby="titulo-taller">
      <h1 id="titulo-taller">Taller de prompts</h1>
      {proyectos.error ? <Aviso error={proyectos.error} /> : null}
      <form class="selectores" onSubmit={(e) => e.preventDefault()}>
        <label for="taller-proyecto">Proyecto</label>
        <select id="taller-proyecto" value={p ?? ""} onChange={(e) => irA((e.target as HTMLSelectElement).value, fase, null)}>
          {validos.map((x) => (
            <option key={x.nombre} value={x.nombre}>
              {x.nombre}
            </option>
          ))}
        </select>
        <label for="taller-tarea">Tarea</label>
        <select id="taller-tarea" value={tarea ?? ""} onChange={(e) => p && irA(p, fase, (e.target as HTMLSelectElement).value || null)}>
          <option value="">La activa (o ninguna)</option>
          {(tareas.datos?.tareas ?? []).map((t) => (
            <option key={t.tarea} value={t.tarea}>
              {t.tarea}
            </option>
          ))}
        </select>
        <label for="taller-fase">Fase</label>
        <select id="taller-fase" value={String(fase)} onChange={(e) => p && irA(p, Number((e.target as HTMLSelectElement).value), tarea)}>
          {(datos?.fases ?? [{ numero: fase, titulo: "" }]).map((f) => (
            <option key={f.numero} value={String(f.numero)}>
              {`${f.numero}${f.titulo ? ` · ${f.titulo}` : ""}`}
            </option>
          ))}
        </select>
      </form>
      {prompt.error ? <Aviso error={prompt.error} /> : null}
      {prompt.cargando && !datos ? <Cargando /> : null}
      {datos && p ? (
        <>
          {datos.avisos.length ? (
            <ul class="avisos" aria-label="Avisos del ensamblado">
              {datos.avisos.map((a, i) => (
                <li key={i} class="aviso">
                  <strong>{a.codigo}</strong>: {a.texto}
                </li>
              ))}
            </ul>
          ) : null}
          <div class="taller">
            <section class="capas" aria-labelledby="titulo-capas">
              <h2 id="titulo-capas">Capas</h2>
              <ol>
                {datos.capas.map((c) => (
                  <li key={`${c.orden}-${c.ruta}`}>
                    <strong>{c.etiqueta}</strong> <span class="secundaria">{c.existe ? "existe" : "no existe"}</span>
                    <br />
                    <code>{c.ruta}</code>
                  </li>
                ))}
              </ol>
            </section>
            <section class="ranuras" aria-labelledby="titulo-ranuras">
              <h2 id="titulo-ranuras">
                Ranuras de la Fase {fase} <span class="secundaria">({datos.ranuras.length}, con las globales)</span>
              </h2>
              <ul aria-label="Ranuras">
                {datos.ranuras.map((x) => (
                  <li key={x.id}>
                    <button type="button" class="ranura-boton" aria-pressed={elegida === x.id} onClick={() => setElegida(x.id)}>
                      <code>{x.id}</code> <span class={`ficha-origen origen-${x.capa === "fábrica" ? "fabrica" : "propio"}`}>{x.capa}</span>
                      {x.modos.length ? <span class="secundaria"> {x.modos.join(", ")}</span> : null}
                    </button>
                    {x.contenidoDe !== "fábrica" ? <span class="secundaria procedencia">{x.contenidoDe}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>
          {ranura ? (
            <section class="detalle-ranura" aria-labelledby="titulo-ranura">
              <h2 id="titulo-ranura">{ranura.id}</h2>
              <p class="secundaria">
                Contenido de {ranura.capa}
                {ranura.contenidoDe !== "fábrica" ? ` (${ranura.contenidoDe})` : ""}, frente al de fábrica:
              </p>
              <DiffDeRanura ranura={ranura} />
              <Accion etiqueta={`Editar ${ranura.id} en la capa del proyecto`} accion="eject" argumentos={{ objetivo: ranura.id, destino: `proyecto:${p}` }} alAplicar={prompt.recargar} />
              <Accion etiqueta={`Editar ${ranura.id} en la capa global`} accion="eject" argumentos={{ objetivo: ranura.id, destino: "global" }} alAplicar={prompt.recargar} />
            </section>
          ) : null}
          <section class="fase-entera" aria-labelledby="titulo-fase-entera">
            <h2 id="titulo-fase-entera">La Fase {fase} entera</h2>
            <Accion etiqueta={`Editar la Fase ${fase} en la capa del proyecto`} accion="eject" argumentos={{ objetivo: `fase-${fase}`, destino: `proyecto:${p}` }} alAplicar={prompt.recargar} />
            <details class="prompt-completo">
              <summary>Ver prompt completo</summary>
              <button
                type="button"
                class="boton"
                onClick={() =>
                  navigator.clipboard.writeText(datos.texto).then(
                    () => setCopiado(true),
                    () => setCopiado(false)
                  )
                }
              >
                {copiado ? "Copiado" : "Copiar"}
              </button>
              <pre class="texto-prompt" aria-label="Prompt completo">
                {datos.texto}
              </pre>
            </details>
          </section>
          <Reglas p={p} datos={datos} alAplicar={prompt.recargar} />
        </>
      ) : null}
    </section>
  );
}
