// La Red (§7.7.1 del plan): los proyectos como estaciones de una red ferroviaria. Cada estación enseña su
// preset y de dónde sale, el estado del manifiesto, una vía por repo con su git, el tren de la tarea
// activa y el farol de la sesión MCP que lo tiene abierto. En modo Sobrio, una tabla con lo mismo.

import type { ProyectoApi, ProyectosRespuesta, RepoApi } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Farol, Marca, Tren, Via } from "../comun/marcas";
import type { Forma, Tono } from "../comun/marcas";
import { Tabla } from "../comun/tabla";
import { AccionesDeProyecto } from "./acciones";
import { t, tn } from "../i18n/idioma";
import { useModoVisual } from "../preferencias";
import { enlace } from "../rutas";

type Estado = { forma: Forma; tono: Tono; texto: string };

export function estadoDelManifiesto(p: ProyectoApi): Estado {
  if (p.manifiesto.estado === "valido") return { forma: "lleno", tono: "verde", texto: t("red.manifiestoValido") };
  if (p.manifiesto.estado === "ausente") return { forma: "vacio", tono: "apagado", texto: t("red.sinManifiesto") };
  return { forma: "rombo", tono: "rojo", texto: t("red.manifiestoInvalido") };
}

export function estadoDelRepo(r: RepoApi): Estado & { via: "limpia" | "cambios" | "sin-git" | "rota" } {
  if (!r.existe) return { forma: "rombo", tono: "rojo", texto: t("red.repoNoExiste"), via: "rota" };
  if (r.error) return { forma: "triangulo", tono: "ambar", texto: r.error, via: "rota" };
  if (!r.respondio) return { forma: "triangulo", tono: "ambar", texto: t("red.gitNoRespondio"), via: "rota" };
  if (!r.esGit) return { forma: "raya", tono: "apagado", texto: t("red.sinGit"), via: "sin-git" };
  const donde = r.separado ? t("red.separado", { head: r.head ?? "?" }) : t("red.rama", { rama: r.rama ?? "?" });
  const pasos = [r.adelante ? t("red.adelante", { n: r.adelante }) : null, r.atras ? t("red.atras", { n: r.atras }) : null].filter(Boolean).join(", ");
  if (r.limpio) return { forma: "lleno", tono: "verde", texto: `${donde} · ${t("red.arbolLimpio")}${pasos ? ` · ${pasos}` : ""}`, via: "limpia" };
  const total = r.cambios + r.sinSeguimiento;
  return { forma: "anillo", tono: "ambar", texto: `${donde} · ${tn("red.cambiosSinCommit", total)}${pasos ? ` · ${pasos}` : ""}`, via: "cambios" };
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

function placa(p: ProyectoApi): string {
  return p.preset ? `${p.preset.nombre} · ${origenDelPreset(p.preset.origen)}` : t("red.presetSinResolver");
}

function Estacion({ p, presets, recargar }: { p: ProyectoApi; presets: string[]; recargar: () => void }) {
  const manifiesto = estadoDelManifiesto(p);
  const id = `estacion-${p.nombre.replace(/[^\w-]/g, "_")}`;
  return (
    <article class="estacion" aria-labelledby={id}>
      <header class="estacion-cabecera">
        <h2 id={id}>{p.nombre}</h2>
        <span class="placa">{placa(p)}</span>
      </header>
      <p class={`linea tono-${manifiesto.tono}`}>
        <Marca forma={manifiesto.forma} tono={manifiesto.tono} /> {manifiesto.texto}
      </p>
      {p.manifiesto.error ? <p class="detalle-error">{p.manifiesto.error}</p> : null}
      {p.errorDeConfiguracion && !p.manifiesto.error ? <p class="detalle-error">{p.errorDeConfiguracion}</p> : null}
      {p.reglas ? (
        <p class="linea secundaria">
          {t("red.reglas", { lotes: t(p.reglas.lotes ? "comun.si" : "comun.no"), commits: p.reglas.commits })}
        </p>
      ) : null}
      {p.repos.length ? (
        <ul class="vias" aria-label={t("red.repositoriosDe", { proyecto: p.nombre })}>
          {p.repos.map((r) => {
            const e = estadoDelRepo(r);
            return (
              <li key={r.id} class={`via tono-${e.tono}`}>
                <Via estado={e.via} />
                <span class="via-texto">
                  <code>{r.id}</code>
                  {r.rol ? <span class="secundaria"> ({r.rol})</span> : null} · <Marca forma={e.forma} tono={e.tono} /> {e.texto}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="linea secundaria">{t("red.sinRepos")}</p>
      )}
      {p.activa ? (
        <div class="tren">
          <Tren />
          <p>
            <span class="secundaria">{t(p.activa.origen === "deducida" ? "red.tareaActivaDeducida" : "red.tareaActiva")}</span> <strong>{p.activa.tarea}</strong>
            <br />
            {p.activa.descripcion}
          </p>
          <a class="boton" href={enlace("tablero", p.nombre, p.activa.tarea)}>
            {t("red.abrirTablero")}
          </a>
        </div>
      ) : (
        <p class="linea secundaria">{p.tareas ? tn("red.tareasNingunaActiva", p.tareas) : t("red.sinTareas")}</p>
      )}
      <p class={`farol ${p.sesiones.length ? "tono-verde" : "tono-apagado"}`}>
        <Farol encendido={p.sesiones.length > 0} />
        {p.sesiones.length ? t("red.abiertoEn", { clientes: p.sesiones.map((s) => s.cliente).join(", ") }) : t("red.ningunaSesion")}
      </p>
      <AccionesDeProyecto p={p} presets={presets} alAplicar={recargar} />
    </article>
  );
}

function TablaDeProyectos({ proyectos }: { proyectos: ProyectoApi[] }) {
  return (
    <Tabla
      titulo={t("red.tabla")}
      columnas={[t("red.colProyecto"), t("red.colPreset"), t("red.colManifiesto"), t("red.colRepos"), t("red.colTareaActiva"), t("red.colSesion")]}
      filas={proyectos.map((p) => ({
        clave: p.nombre,
        celdas: [
          p.nombre,
          placa(p),
          estadoDelManifiesto(p).texto,
          p.repos.length ? p.repos.map((r) => `${r.id}: ${estadoDelRepo(r).texto}`).join("; ") : "—",
          p.activa ? <a href={enlace("tablero", p.nombre, p.activa.tarea)}>{`${p.activa.tarea} — ${p.activa.descripcion}`}</a> : "—",
          p.sesiones.length ? p.sesiones.map((s) => s.cliente).join(", ") : "—",
        ],
      }))}
    />
  );
}

export function Red() {
  const modo = useModoVisual();
  const { datos, error, cargando, recargar } = useRecurso<ProyectosRespuesta>("/api/proyectos", ["sesiones", "config", "punteros", "documento", "recibo", "prompts"]);
  return (
    <section class="vista vista-red" aria-labelledby="titulo-red">
      <h1 id="titulo-red">{t("red.titulo")}</h1>
      {error ? <Aviso error={error} /> : null}
      {datos?.error ? <Aviso error={datos.error} /> : null}
      {cargando && !datos ? <Cargando /> : null}
      {datos && datos.proyectos.length === 0 && !datos.error ? <p>{t("red.vacia")}</p> : null}
      {datos && datos.proyectos.length ? (
        modo === "sobrio" ? (
          <TablaDeProyectos proyectos={datos.proyectos} />
        ) : (
          <div class="estaciones">
            {datos.proyectos.map((p) => (
              <Estacion key={p.nombre} p={p} presets={datos.presets} recargar={recargar} />
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
