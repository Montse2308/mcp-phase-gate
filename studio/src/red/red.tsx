// La Red (§7.7.1 del plan): los proyectos como estaciones de una red ferroviaria. Cada estación enseña su
// preset y de dónde sale, el estado del manifiesto, una vía por repo con su git, el tren de la tarea
// activa y el farol de la sesión MCP que lo tiene abierto. En modo Sobrio, una tabla con lo mismo.

import type { ProyectoApi, ProyectosRespuesta, RepoApi } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Farol, Marca, Tren, Via } from "../comun/marcas";
import type { Forma, Tono } from "../comun/marcas";
import { Tabla } from "../comun/tabla";
import { useModoVisual } from "../preferencias";
import { enlace } from "../rutas";

type Estado = { forma: Forma; tono: Tono; texto: string };

export function estadoDelManifiesto(p: ProyectoApi): Estado {
  if (p.manifiesto.estado === "valido") return { forma: "lleno", tono: "verde", texto: "phase-gate.json válido" };
  if (p.manifiesto.estado === "ausente") return { forma: "vacio", tono: "apagado", texto: "sin phase-gate.json" };
  return { forma: "rombo", tono: "rojo", texto: "phase-gate.json inválido" };
}

export function estadoDelRepo(r: RepoApi): Estado & { via: "limpia" | "cambios" | "sin-git" | "rota" } {
  if (!r.existe) return { forma: "rombo", tono: "rojo", texto: "no existe en este equipo", via: "rota" };
  if (r.error) return { forma: "triangulo", tono: "ambar", texto: r.error, via: "rota" };
  if (!r.respondio) return { forma: "triangulo", tono: "ambar", texto: "git no respondió a tiempo", via: "rota" };
  if (!r.esGit) return { forma: "raya", tono: "apagado", texto: "sin git", via: "sin-git" };
  const donde = r.separado ? `separado en ${r.head ?? "?"}` : `rama ${r.rama ?? "?"}`;
  const pasos = [r.adelante ? `${r.adelante} adelante` : null, r.atras ? `${r.atras} atrás` : null].filter(Boolean).join(", ");
  if (r.limpio) return { forma: "lleno", tono: "verde", texto: `${donde} · árbol limpio${pasos ? ` · ${pasos}` : ""}`, via: "limpia" };
  const total = r.cambios + r.sinSeguimiento;
  return { forma: "anillo", tono: "ambar", texto: `${donde} · ${total} ${total === 1 ? "cambio" : "cambios"} sin commit${pasos ? ` · ${pasos}` : ""}`, via: "cambios" };
}

function placa(p: ProyectoApi): string {
  return p.preset ? `${p.preset.nombre} · ${p.preset.origen}` : "preset sin resolver";
}

function Estacion({ p }: { p: ProyectoApi }) {
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
          Lotes: {p.reglas.lotes ? "sí" : "no"} · Commits: {p.reglas.commits}
        </p>
      ) : null}
      {p.repos.length ? (
        <ul class="vias" aria-label={`Repositorios de ${p.nombre}`}>
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
        <p class="linea secundaria">Sin repos declarados.</p>
      )}
      {p.activa ? (
        <div class="tren">
          <Tren />
          <p>
            <span class="secundaria">Tarea activa{p.activa.origen === "deducida" ? " (deducida, la más reciente)" : ""}:</span> <strong>{p.activa.tarea}</strong>
            <br />
            {p.activa.descripcion}
          </p>
          <a class="boton" href={enlace("tablero", p.nombre, p.activa.tarea)}>
            Abrir tablero
          </a>
        </div>
      ) : (
        <p class="linea secundaria">{p.tareas ? `${p.tareas} tareas, ninguna activa.` : "Sin tareas todavía."}</p>
      )}
      <p class={`farol ${p.sesiones.length ? "tono-verde" : "tono-apagado"}`}>
        <Farol encendido={p.sesiones.length > 0} />
        {p.sesiones.length ? `Abierto en ${p.sesiones.map((s) => s.cliente).join(", ")}` : "Ninguna sesión MCP lo tiene abierto"}
      </p>
    </article>
  );
}

function TablaDeProyectos({ proyectos }: { proyectos: ProyectoApi[] }) {
  return (
    <Tabla
      titulo="Proyectos de la Documentación"
      columnas={["Proyecto", "Preset", "Manifiesto", "Repos", "Tarea activa", "Sesión MCP"]}
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
  const { datos, error, cargando } = useRecurso<ProyectosRespuesta>("/api/proyectos", ["sesiones", "config", "punteros", "documento", "recibo", "prompts"]);
  return (
    <section class="vista vista-red" aria-labelledby="titulo-red">
      <h1 id="titulo-red">Red de proyectos</h1>
      {error ? <Aviso error={error} /> : null}
      {datos?.error ? <Aviso error={datos.error} /> : null}
      {cargando && !datos ? <Cargando /> : null}
      {datos && datos.proyectos.length === 0 && !datos.error ? <p>No hay proyectos en la Documentación todavía.</p> : null}
      {datos && datos.proyectos.length ? (
        modo === "sobrio" ? (
          <TablaDeProyectos proyectos={datos.proyectos} />
        ) : (
          <div class="estaciones">
            {datos.proyectos.map((p) => (
              <Estacion key={p.nombre} p={p} />
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
