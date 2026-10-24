// La Red: una fila por proyecto, en una lista que se despliega. Plegada, cada fila dice el preset y de dónde
// sale, el git de cada repo, la tarea activa y qué sesión MCP lo tiene abierto; desplegada, añade el
// manifiesto, las reglas, el rol de cada repo y las acciones. El nombre va en un h2 que envuelve el botón que
// despliega la fila. Cada estado lleva su forma y su texto, nunca solo color. La misma estructura en los dos
// modos: solo cambian los colores.

import { useState } from "preact/hooks";

import type { ProyectoApi, ProyectosRespuesta, RepoApi } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Marca } from "../comun/marcas";
import type { Forma, Tono } from "../comun/marcas";
import { AccionesDeProyecto } from "./acciones";
import { t, tn } from "../i18n/idioma";
import { enlace } from "../rutas";

type Estado = { forma: Forma; tono: Tono; texto: string };

export function estadoDelManifiesto(p: ProyectoApi): Estado {
  if (p.manifiesto.estado === "valido") return { forma: "lleno", tono: "verde", texto: t("red.manifiestoValido") };
  if (p.manifiesto.estado === "ausente") return { forma: "vacio", tono: "apagado", texto: t("red.sinManifiesto") };
  return { forma: "rombo", tono: "rojo", texto: t("red.manifiestoInvalido") };
}

export function estadoDelRepo(r: RepoApi): Estado {
  if (!r.existe) return { forma: "rombo", tono: "rojo", texto: t("red.repoNoExiste") };
  if (r.error) return { forma: "triangulo", tono: "ambar", texto: r.error };
  if (!r.respondio) return { forma: "triangulo", tono: "ambar", texto: t("red.gitNoRespondio") };
  if (!r.esGit) return { forma: "raya", tono: "apagado", texto: t("red.sinGit") };
  const donde = r.separado ? t("red.separado", { head: r.head ?? "?" }) : t("red.rama", { rama: r.rama ?? "?" });
  const pasos = [r.adelante ? t("red.adelante", { n: r.adelante }) : null, r.atras ? t("red.atras", { n: r.atras }) : null].filter(Boolean).join(", ");
  if (r.limpio) return { forma: "lleno", tono: "verde", texto: `${donde} · ${t("red.arbolLimpio")}${pasos ? ` · ${pasos}` : ""}` };
  const total = r.cambios + r.sinSeguimiento;
  return { forma: "anillo", tono: "ambar", texto: `${donde} · ${tn("red.cambiosSinCommit", total)}${pasos ? ` · ${pasos}` : ""}` };
}

export function estadoDeLaSesion(p: ProyectoApi): Estado {
  if (p.sesiones.length) return { forma: "lleno", tono: "verde", texto: t("red.abiertoEn", { clientes: p.sesiones.map((s) => s.cliente).join(", ") }) };
  return { forma: "vacio", tono: "apagado", texto: t("red.ningunaSesion") };
}

// El origen de un preset (OrigenDelPreset de capas.ts) es un valor del contrato, en español: aquí se dice.
const ORIGENES: Record<string, "origen.tarea" | "origen.proyecto" | "origen.maquina" | "origen.defecto"> = {
  "de la tarea": "origen.tarea",
  "del proyecto": "origen.proyecto",
  "de machine.json": "origen.maquina",
  "por defecto": "origen.defecto",
};

export function origenDelPreset(origen: string): string {
  const clave = ORIGENES[origen];
  return clave ? t(clave) : origen;
}

function presetDe(p: ProyectoApi): string {
  return p.preset ? `${p.preset.nombre} · ${origenDelPreset(p.preset.origen)}` : t("red.presetSinResolver");
}

function LineaDeEstado({ estado }: { estado: Estado }) {
  return (
    <p class={`linea tono-${estado.tono}`}>
      <Marca forma={estado.forma} tono={estado.tono} /> {estado.texto}
    </p>
  );
}

// El rol de cada repo solo se dice con la fila desplegada.
function Repos({ p, abierto }: { p: ProyectoApi; abierto: boolean }) {
  if (!p.repos.length) return <p class="linea secundaria">{t("red.sinRepos")}</p>;
  return (
    <ul class="repos" aria-label={t("red.repositoriosDe", { proyecto: p.nombre })}>
      {p.repos.map((r) => {
        const e = estadoDelRepo(r);
        return (
          <li key={r.id} class={`tono-${e.tono}`}>
            <Marca forma={e.forma} tono={e.tono} /> <code>{r.id}</code>
            {abierto && r.rol ? <span class="secundaria"> ({r.rol})</span> : null} · {e.texto}
          </li>
        );
      })}
    </ul>
  );
}

function TareaActiva({ p }: { p: ProyectoApi }) {
  if (!p.activa) return <p class="linea secundaria">{p.tareas ? tn("red.tareasNingunaActiva", p.tareas) : t("red.sinTareas")}</p>;
  return (
    <>
      <p class="linea">
        <strong>{p.activa.tarea}</strong>
        {p.activa.origen === "deducida" ? <span class="secundaria"> ({t("red.deducida")})</span> : null}
      </p>
      <p class="linea">{p.activa.descripcion}</p>
      <a href={enlace("tablero", p.nombre, p.activa.tarea)}>{t("red.abrirTablero")}</a>
    </>
  );
}

// La flecha del botón: gira al desplegar la fila. Es decorativa; el estado lo dice aria-expanded.
function Flecha() {
  return (
    <svg class="flecha" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

function FilaDeProyecto({ p, presets, recargar }: { p: ProyectoApi; presets: string[]; recargar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const sufijo = p.nombre.replace(/[^\w-]/g, "_");
  const titulo = `proyecto-${sufijo}`;
  const detalle = `detalle-${sufijo}`;
  return (
    <li>
      <article class="fila-proyecto" aria-labelledby={titulo}>
        <div class="fila-resumen">
          <h2 id={titulo}>
            <button type="button" class="desplegar" aria-expanded={abierto} aria-controls={detalle} onClick={() => setAbierto(!abierto)}>
              <Flecha />
              {p.nombre}
            </button>
          </h2>
          <dl class="campos">
            <div class="campo campo-preset">
              <dt>{t("red.campoPreset")}</dt>
              <dd>{presetDe(p)}</dd>
            </div>
            <div class="campo campo-repos">
              <dt>{t("red.campoRepos")}</dt>
              <dd>
                <Repos p={p} abierto={abierto} />
              </dd>
            </div>
            <div class="campo campo-tarea">
              <dt>{t("red.campoTareaActiva")}</dt>
              <dd>
                <TareaActiva p={p} />
              </dd>
            </div>
            <div class="campo campo-sesion">
              <dt>{t("red.campoSesion")}</dt>
              <dd>
                <LineaDeEstado estado={estadoDeLaSesion(p)} />
              </dd>
            </div>
          </dl>
        </div>
        <div id={detalle} class="fila-detalle" hidden={!abierto}>
          <dl class="campos">
            <div class="campo campo-manifiesto">
              <dt>{t("red.campoManifiesto")}</dt>
              <dd>
                <LineaDeEstado estado={estadoDelManifiesto(p)} />
                {p.manifiesto.error ? <p class="detalle-error">{p.manifiesto.error}</p> : null}
                {p.errorDeConfiguracion && !p.manifiesto.error ? <p class="detalle-error">{p.errorDeConfiguracion}</p> : null}
              </dd>
            </div>
            {p.reglas ? (
              <div class="campo campo-reglas">
                <dt>{t("red.campoReglas")}</dt>
                <dd>{t("red.reglas", { lotes: t(p.reglas.lotes ? "comun.si" : "comun.no"), commits: p.reglas.commits })}</dd>
              </div>
            ) : null}
          </dl>
          <AccionesDeProyecto p={p} presets={presets} alAplicar={recargar} />
        </div>
      </article>
    </li>
  );
}

export function Red() {
  const { datos, error, cargando, recargar } = useRecurso<ProyectosRespuesta>("/api/proyectos", ["sesiones", "config", "punteros", "documento", "recibo", "prompts"]);
  return (
    <section class="vista vista-red" aria-labelledby="titulo-red">
      <h1 id="titulo-red">{t("red.titulo")}</h1>
      {error ? <Aviso error={error} /> : null}
      {datos?.error ? <Aviso error={datos.error} /> : null}
      {cargando && !datos ? <Cargando /> : null}
      {datos && datos.proyectos.length === 0 && !datos.error ? <p>{t("red.vacia")}</p> : null}
      {datos && datos.proyectos.length ? (
        <ul class="proyectos" aria-label={t("red.lista")}>
          {datos.proyectos.map((p) => (
            <FilaDeProyecto key={p.nombre} p={p} presets={datos.presets} recargar={recargar} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
