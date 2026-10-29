// El Taller de prompts (§7.7.3 del plan): de qué capa sale cada ranura de una fase, el contenido efectivo
// frente al de fábrica (un diff por líneas), las reglas del proyecto (que se cambian en Ajustes) y "Editar",
// que lanza un eject a la capa global o a la del proyecto. "Ver prompt completo" enseña el texto exacto que recibe el modelo (el
// mismo de get_phase_prompt) con un botón para copiarlo.
//
// En inglés, cada ranura se enseña con su alias y el id canónico entre paréntesis (`phase-3/tests
// (fase-3/pruebas)`), y las capas y los modos de un bloque se dicen en inglés. Solo al enseñarlos: lo que
// se manda al servidor (el objetivo de un eject, por ejemplo) es siempre el id canónico.

import { diffLines } from "diff";
import { useState } from "preact/hooks";

import type { ProyectosRespuesta, PromptRespuesta, RanuraApi, TareasRespuesta } from "../../../src/studio/contrato.js";
import { idInglesDeRanura } from "../../../src/vocabulario.js";
import { Accion } from "../comun/accion";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { ruta } from "../datos";
import { idiomaActual, t } from "../i18n/idioma";
import { origenDelPreset } from "../red/red";
import { enlace } from "../rutas";
import type { Ruta } from "../rutas";

// El id de una ranura para enseñarlo: el canónico en español; en inglés, el alias con el canónico detrás.
export function idVisible(id: string): string {
  if (idiomaActual() === "es") return id;
  const ingles = idInglesDeRanura(id);
  return ingles === id ? id : `${ingles} (${id})`;
}

const CAPAS = {
  fábrica: "capa.fabrica",
  preset: "capa.preset",
  reglas: "capa.reglas",
  global: "capa.global",
  proyecto: "capa.proyecto",
  desconocida: "capa.desconocida",
} as const;

// La capa de una ranura (capaDeProcedencia de la API): "fábrica", "preset: <nombre>", "reglas: <variante>",
// "global", "proyecto" o "desconocida". Se traduce la etiqueta; el nombre del preset o la variante, no.
export function capaVisible(capa: string): string {
  const corte = capa.indexOf(": ");
  const etiqueta = corte === -1 ? capa : capa.slice(0, corte);
  const clave = Object.prototype.hasOwnProperty.call(CAPAS, etiqueta) ? CAPAS[etiqueta as keyof typeof CAPAS] : null;
  if (!clave) return capa;
  return corte === -1 ? t(clave) : `${t(clave)}: ${capa.slice(corte + 2)}`;
}

// Un modo aplicado ("antes (<archivo>:<línea>)", "despues (…)"): se traduce la palabra del modo.
const MODOS = { reemplazar: "bloque.reemplazar", antes: "bloque.antes", despues: "bloque.despues" } as const;
function modoVisible(modo: string): string {
  const m = modo.match(/^(reemplazar|antes|despues)\b/);
  return m ? `${t(MODOS[m[1] as keyof typeof MODOS])}${modo.slice(m[1]!.length)}` : modo;
}

function irA(p: string, fase: number, tarea: string | null): void {
  const consulta = new URLSearchParams({ fase: String(fase) });
  if (tarea) consulta.set("tarea", tarea);
  window.location.hash = `${enlace("taller", p)}?${consulta.toString()}`;
}

function DiffDeRanura({ ranura }: { ranura: RanuraApi }) {
  if (ranura.fabrica === null) return <p class="secundaria">{t("taller.sinFabrica", { capa: capaVisible(ranura.capa) })}</p>;
  if (ranura.fabrica === ranura.efectivo) return <p class="secundaria">{t("taller.igualQueFabrica")}</p>;
  const partes = diffLines(ranura.fabrica, ranura.efectivo);
  return (
    <pre class="diff" aria-label={t("taller.diferencias", { ranura: idVisible(ranura.id) })}>
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

// Las reglas del proyecto, para leerlas: se cambian en Ajustes.
function Reglas({ p, datos }: { p: string; datos: PromptRespuesta }) {
  return (
    <section class="reglas" aria-labelledby="titulo-reglas">
      <h2 id="titulo-reglas">{t("taller.reglasDe", { proyecto: p })}</h2>
      <p class="secundaria">
        {t("taller.preset")} <strong>{datos.preset.nombre}</strong> ({origenDelPreset(datos.preset.origen)})
      </p>
      <p>
        {t("red.reglas", { lotes: t(datos.reglas.lotes ? "comun.si" : "comun.no"), commits: datos.reglas.commits })} · <a href={enlace("ajustes", "proyecto", p)}>{t("ajustes.cambiarEnAjustes")}</a>
      </p>
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
  const prompt = useRecurso<PromptRespuesta>(p ? `/api/prompts/${ruta(p, fase)}${tarea ? `?tarea=${encodeURIComponent(tarea)}` : ""}` : null, ["prompts", "config", "documento", "equipo"], (_t, d) => !d.p || d.p === p);
  const [elegida, setElegida] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const datos = prompt.datos;
  const ranura = datos?.ranuras.find((x) => x.id === elegida) ?? null;

  return (
    <section class="vista vista-taller" aria-labelledby="titulo-taller">
      <h1 id="titulo-taller">{t("taller.titulo")}</h1>
      {proyectos.error ? <Aviso error={proyectos.error} /> : null}
      <form class="selectores" onSubmit={(e) => e.preventDefault()}>
        <label for="taller-proyecto">{t("taller.proyecto")}</label>
        <select id="taller-proyecto" value={p ?? ""} onChange={(e) => irA((e.target as HTMLSelectElement).value, fase, null)}>
          {validos.map((x) => (
            <option key={x.nombre} value={x.nombre}>
              {x.nombre}
            </option>
          ))}
        </select>
        <label for="taller-tarea">{t("taller.tarea")}</label>
        <select id="taller-tarea" value={tarea ?? ""} onChange={(e) => p && irA(p, fase, (e.target as HTMLSelectElement).value || null)}>
          <option value="">{t("taller.laActiva")}</option>
          {(tareas.datos?.tareas ?? []).map((x) => (
            <option key={x.tarea} value={x.tarea}>
              {x.tarea}
            </option>
          ))}
        </select>
        <label for="taller-fase">{t("taller.fase")}</label>
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
            <ul class="avisos" aria-label={t("taller.avisos")}>
              {datos.avisos.map((a, i) => (
                <li key={i} class="aviso">
                  <strong>{a.codigo}</strong>: {a.texto}
                </li>
              ))}
            </ul>
          ) : null}
          <div class="taller">
            <section class="capas" aria-labelledby="titulo-capas">
              <h2 id="titulo-capas">{t("taller.capas")}</h2>
              <ol>
                {datos.capas.map((c) => (
                  <li key={`${c.orden}-${c.ruta}`}>
                    <strong>{capaVisible(c.etiqueta)}</strong> <span class="secundaria">{t(c.existe ? "taller.existe" : "taller.noExiste")}</span>
                    <br />
                    <code>{c.ruta}</code>
                  </li>
                ))}
              </ol>
            </section>
            <section class="ranuras" aria-labelledby="titulo-ranuras">
              <h2 id="titulo-ranuras">
                {t("taller.ranurasDe", { fase })} <span class="secundaria">{t("taller.cuentaRanuras", { n: datos.ranuras.length })}</span>
              </h2>
              <ul aria-label={t("taller.ranuras")}>
                {datos.ranuras.map((x) => (
                  <li key={x.id}>
                    <button type="button" class="ranura-boton" aria-pressed={elegida === x.id} onClick={() => setElegida(x.id)}>
                      <code>{idVisible(x.id)}</code> <span class={`ficha-origen origen-${x.capa === "fábrica" ? "fabrica" : "propio"}`}>{capaVisible(x.capa)}</span>
                      {x.modos.length ? <span class="secundaria"> {x.modos.map(modoVisible).join(", ")}</span> : null}
                    </button>
                    {x.contenidoDe !== "fábrica" ? <span class="secundaria procedencia">{x.contenidoDe}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>
          {ranura ? (
            <section class="detalle-ranura" aria-labelledby="titulo-ranura">
              <h2 id="titulo-ranura">{idVisible(ranura.id)}</h2>
              <p class="secundaria">{t("taller.contenidoDe", { capa: capaVisible(ranura.capa), procedencia: ranura.contenidoDe !== "fábrica" ? ` (${ranura.contenidoDe})` : "" })}</p>
              <DiffDeRanura ranura={ranura} />
              <Accion etiqueta={t("taller.editarEnProyecto", { ranura: idVisible(ranura.id) })} accion="eject" argumentos={{ objetivo: ranura.id, destino: `proyecto:${p}` }} alAplicar={prompt.recargar} />
              <Accion etiqueta={t("taller.editarEnGlobal", { ranura: idVisible(ranura.id) })} accion="eject" argumentos={{ objetivo: ranura.id, destino: "global" }} alAplicar={prompt.recargar} />
            </section>
          ) : null}
          <section class="fase-entera" aria-labelledby="titulo-fase-entera">
            <h2 id="titulo-fase-entera">{t("taller.faseEntera", { fase })}</h2>
            <Accion etiqueta={t("taller.editarFase", { fase })} accion="eject" argumentos={{ objetivo: `fase-${fase}`, destino: `proyecto:${p}` }} alAplicar={prompt.recargar} />
            <details class="prompt-completo">
              <summary>{t("taller.verPrompt")}</summary>
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
                {t(copiado ? "taller.copiado" : "taller.copiar")}
              </button>
              <pre class="texto-prompt" aria-label={t("taller.promptCompleto")}>
                {datos.texto}
              </pre>
            </details>
          </section>
          <Reglas p={p} datos={datos} />
        </>
      ) : null}
    </section>
  );
}
