// La Red: una fila por proyecto, en una lista que se despliega. Plegada, cada fila dice el preset y de dónde
// sale (con un aviso si el manifiesto es inválido o la configuración falla), el git y el rol de cada repo, la
// tarea activa y qué sesión MCP lo tiene abierto; desplegada, añade el manifiesto, las reglas y el enlace a Ajustes, donde se cambia todo eso.
// Con muchos repos, la fila plegada dice cuántos hay en cada estado y la lista completa va al detalle. El
// nombre va en un h2 que envuelve el botón que despliega la fila. Cada estado lleva su forma y su texto, nunca
// solo color. La misma estructura en los dos modos: solo cambian los colores.

import { useId, useState } from "preact/hooks";

import type { ProyectoApi, ProyectosRespuesta, RepoApi } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { IndicadorDeEstado } from "../comun/indicador";
import type { ClaveDeEstado } from "../comun/indicador";
import { t, tn } from "../i18n/idioma";
import type { ClavePlural } from "../i18n/idioma";
import { enlace } from "../rutas";

// Cada estado es una clave del indicador (que sabe su forma, su color y su insignia) y las palabras que lo dicen;
// `literal`, cuando esas palabras llevan datos que no se pueden pasar a mayúsculas.
type Estado = { estado: ClaveDeEstado; texto: string; literal?: boolean };

export function estadoDelManifiesto(p: ProyectoApi): Estado {
  if (p.manifiesto.estado === "valido") return { estado: "red-manifiesto-valido", texto: t("red.manifiestoValido") };
  if (p.manifiesto.estado === "ausente") return { estado: "red-manifiesto-ausente", texto: t("red.sinManifiesto") };
  return { estado: "red-manifiesto-invalido", texto: t("red.manifiestoInvalido"), literal: true };
}

export function estadoDelRepo(r: RepoApi): Estado {
  if (!r.existe) return { estado: "red-repo-no-existe", texto: t("red.repoNoExiste") };
  if (r.error) return { estado: "red-repo-con-error", texto: r.error, literal: true };
  if (!r.respondio) return { estado: "red-repo-con-error", texto: t("red.gitNoRespondio") };
  if (!r.esGit) return { estado: "red-repo-sin-git", texto: t("red.sinGit") };
  const donde = r.separado ? t("red.separado", { head: r.head ?? "?" }) : t("red.rama", { rama: r.rama ?? "?" });
  const pasos = [r.adelante ? t("red.adelante", { n: r.adelante }) : null, r.atras ? t("red.atras", { n: r.atras }) : null].filter(Boolean).join(", ");
  if (r.limpio) return { estado: "red-repo-limpio", texto: `${donde} · ${t("red.arbolLimpio")}${pasos ? ` · ${pasos}` : ""}` };
  const total = r.cambios + r.sinSeguimiento;
  return { estado: "red-repo-con-cambios", texto: `${donde} · ${tn("red.cambiosSinCommit", total)}${pasos ? ` · ${pasos}` : ""}` };
}

export function estadoDeLaSesion(p: ProyectoApi): Estado {
  if (p.sesiones.length) return { estado: "red-sesion-abierta", texto: t("red.abiertoEn", { clientes: p.sesiones.map((s) => s.cliente).join(", ") }) };
  return { estado: "red-sesion-ninguna", texto: t("red.ningunaSesion") };
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

// Lo que tiene que verse sin desplegar la fila: un manifiesto inválido, o un error de configuración.
export function alertaDelProyecto(p: ProyectoApi): Estado | null {
  if (p.manifiesto.estado === "invalido") return estadoDelManifiesto(p);
  if (p.errorDeConfiguracion) return { estado: "red-configuracion-con-error", texto: t("red.configuracionConError") };
  return null;
}

function presetDe(p: ProyectoApi): string {
  return p.preset ? `${p.preset.nombre} · ${origenDelPreset(p.preset.origen)}` : t("red.presetSinResolver");
}

function LineaDeEstado({ estado, clase }: { estado: Estado; clase?: string }) {
  return (
    <p class={`linea${clase ? ` ${clase}` : ""}`}>
      <IndicadorDeEstado estado={estado.estado} texto={estado.texto} literal={estado.literal} />
    </p>
  );
}

function Repos({ p }: { p: ProyectoApi }) {
  if (!p.repos.length) return <p class="linea secundaria">{t("red.sinRepos")}</p>;
  return (
    <ul class="repos" aria-label={t("red.repositoriosDe", { proyecto: p.nombre })}>
      {p.repos.map((r) => {
        const e = estadoDelRepo(r);
        return (
          <li key={r.id}>
            <IndicadorDeEstado
              estado={e.estado}
              texto={e.texto}
              literal={e.literal}
              antes={
                <>
                  <code>{r.id}</code>
                  {r.rol ? <span class="secundaria"> ({r.rol})</span> : null} ·{" "}
                </>
              }
            />
          </li>
        );
      })}
    </ul>
  );
}

// Con más repos que estos, la fila plegada dice cuántos hay en cada estado, y la lista va al detalle.
export const REPOS_EN_LA_FILA = 6;

// Los estados de un repo, de más grave a menos, con su texto para el resumen.
const GRUPOS_DE_REPOS: { estado: ClaveDeEstado; clave: ClavePlural }[] = [
  { estado: "red-repo-no-existe", clave: "red.reposNoExisten" },
  { estado: "red-repo-con-error", clave: "red.reposConError" },
  { estado: "red-repo-con-cambios", clave: "red.reposConCambios" },
  { estado: "red-repo-sin-git", clave: "red.reposSinGit" },
  { estado: "red-repo-limpio", clave: "red.reposLimpios" },
];

function ResumenDeRepos({ p }: { p: ProyectoApi }) {
  const estados = p.repos.map((r) => estadoDelRepo(r).estado);
  return (
    <>
      <p class="linea">{tn("red.reposTotal", p.repos.length)}</p>
      <ul class="repos" aria-label={t("red.resumenDeRepositorios", { proyecto: p.nombre })}>
        {GRUPOS_DE_REPOS.map((g) => {
          const n = estados.filter((e) => e === g.estado).length;
          return n ? (
            <li key={g.estado}>
              <IndicadorDeEstado estado={g.estado} texto={tn(g.clave, n)} />
            </li>
          ) : null;
        })}
      </ul>
    </>
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

// Las filas desplegadas se recuerdan mientras dure la pestaña: al ir a otra vista y volver, siguen abiertas.
// sessionStorage puede fallar (almacenamiento bloqueado): entonces solo se recuerdan mientras dure la página.
const CLAVE_DESPLEGADAS = "pg-red-desplegadas";

function leerDesplegadas(): Set<string> {
  try {
    const valor: unknown = JSON.parse(window.sessionStorage.getItem(CLAVE_DESPLEGADAS) ?? "[]");
    return new Set(Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

const desplegadas = leerDesplegadas();

function recordar(nombre: string, abierto: boolean): void {
  if (abierto) desplegadas.add(nombre);
  else desplegadas.delete(nombre);
  try {
    window.sessionStorage.setItem(CLAVE_DESPLEGADAS, JSON.stringify([...desplegadas]));
  } catch {
    // sin almacenamiento, el despliegue dura lo que la página
  }
}

function FilaDeProyecto({ p }: { p: ProyectoApi }) {
  const [abierto, setAbierto] = useState(() => desplegadas.has(p.nombre));
  // Con useId, dos nombres que solo difieren en espacios o acentos no comparten id.
  const id = useId();
  const titulo = `${id}-titulo`;
  const detalle = `${id}-detalle`;
  const alerta = alertaDelProyecto(p);
  const muchos = p.repos.length > REPOS_EN_LA_FILA;
  const alternar = () => {
    recordar(p.nombre, !abierto);
    setAbierto(!abierto);
  };
  return (
    <li>
      <article class="fila-proyecto" aria-labelledby={titulo}>
        <div class="fila-resumen">
          <h2 id={titulo}>
            <button type="button" class="desplegar" aria-expanded={abierto} aria-controls={detalle} onClick={alternar}>
              <Flecha />
              {p.nombre}
            </button>
          </h2>
          <dl class="campos">
            <div class="campo campo-preset">
              <dt>{t("red.campoPreset")}</dt>
              <dd>
                {presetDe(p)}
                {alerta ? <LineaDeEstado estado={alerta} clase="alerta-proyecto" /> : null}
              </dd>
            </div>
            <div class="campo campo-repos">
              <dt>{t("red.campoRepos")}</dt>
              <dd>{muchos ? <ResumenDeRepos p={p} /> : <Repos p={p} />}</dd>
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
            {muchos ? (
              <div class="campo campo-repos-todos">
                <dt>{t("red.campoRepos")}</dt>
                <dd>
                  <Repos p={p} />
                </dd>
              </div>
            ) : null}
          </dl>
          <p class="linea">
            <a href={enlace("ajustes", "proyecto", p.nombre)}>{t("ajustes.cambiarEnAjustes")}</a>
          </p>
        </div>
      </article>
    </li>
  );
}

export function Red() {
  const { datos, error, cargando } = useRecurso<ProyectosRespuesta>("/api/proyectos", ["sesiones", "config", "punteros", "documento", "recibo", "prompts", "equipo"]);
  return (
    <section class="vista vista-red" aria-labelledby="titulo-red">
      <h1 id="titulo-red">{t("red.titulo")}</h1>
      {error ? <Aviso error={error} /> : null}
      {datos?.error ? (
        <>
          <Aviso error={datos.error} />
          <p>
            <a href={enlace("ajustes", "equipo")}>{t("red.abrirAjustes")}</a>
          </p>
        </>
      ) : null}
      {cargando && !datos ? <Cargando /> : null}
      {datos && datos.proyectos.length === 0 && !datos.error ? <p>{t("red.vacia")}</p> : null}
      {datos && datos.proyectos.length ? (
        <ul class="proyectos" aria-label={t("red.lista")}>
          {datos.proyectos.map((p) => (
            <FilaDeProyecto key={p.nombre} p={p} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
