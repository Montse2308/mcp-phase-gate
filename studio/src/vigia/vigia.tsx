// El Vigía (§7.7.4 del plan): el diagnóstico de doctor agrupado por severidad, con una línea de "cómo se
// arregla" por código; un asistente de clientes con lo que haría `init` en cada uno (el comando o el diff
// de su mcp.json), que se aplica con el ciclo de huella; y las variables, de dónde salió cada una.
//
// Cada hallazgo se enseña por su código, con el texto del servidor (que llega en el idioma de la interfaz)
// y la línea de "cómo se arregla" del diccionario de ese idioma (arreglos.ts).

import { useState } from "preact/hooks";

import type { ClientesRespuesta, EstadoRespuesta, PlanDeClienteApi } from "../../../src/studio/contrato.js";
import { Accion, Diff } from "../comun/accion";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Marca } from "../comun/marcas";
import type { Forma, Tono } from "../comun/marcas";
import { Tabla } from "../comun/tabla";
import { t } from "../i18n/idioma";
import { arregloDe } from "./arreglos";

const SEVERIDADES: { id: "error" | "aviso" | "info"; titulo: "vigia.errores" | "vigia.avisos" | "vigia.info"; forma: Forma; tono: Tono }[] = [
  { id: "error", titulo: "vigia.errores", forma: "rombo", tono: "rojo" },
  { id: "aviso", titulo: "vigia.avisos", forma: "triangulo", tono: "ambar" },
  { id: "info", titulo: "vigia.info", forma: "vacio", tono: "apagado" },
];

const VIGILANCIA = {
  activo: "vigia.vigilancia.activo",
  degradado: "vigia.vigilancia.degradado",
  apagado: "vigia.vigilancia.apagado",
} as const;

// De dónde sale una variable (FuenteVariable de config.ts): "entorno", ".env" o "sin definir".
function fuenteVisible(fuente: string): string {
  if (fuente === "entorno") return t("fuente.entorno");
  if (fuente === "sin definir") return t("fuente.sinDefinir");
  return fuente;
}

function TarjetaDeCliente({ c, recargar }: { c: PlanDeClienteApi; recargar: () => void }) {
  const [comandos, setComandos] = useState(false);
  const leeComandos = c.cliente !== "vscode";
  const id = `comandos-${c.cliente}`;
  return (
    <article class="cliente" aria-labelledby={`cliente-${c.cliente}`}>
      <h3 id={`cliente-${c.cliente}`}>{c.nombre}</h3>
      <p class={`linea ${c.detectado ? "tono-verde" : "tono-apagado"}`}>
        <Marca forma={c.detectado ? "lleno" : "vacio"} tono={c.detectado ? "verde" : "apagado"} /> {t(c.detectado ? "vigia.detectado" : "vigia.noDetectado")}
      </p>
      <p>{c.mensaje}</p>
      {c.archivo ? (
        <p class="secundaria">
          {t("vigia.archivo")} <code>{c.archivo}</code>
        </p>
      ) : null}
      {c.comando ? (
        <p>
          {t("vigia.comando")} <code>{c.comando}</code>
        </p>
      ) : null}
      {c.diff ? <Diff texto={c.diff} etiqueta={t("vigia.loQueCambiaria", { cliente: c.nombre })} /> : null}
      {leeComandos ? (
        <p>
          <label for={id}>
            <input id={id} type="checkbox" checked={comandos} onChange={(e) => setComandos((e.target as HTMLInputElement).checked)} /> {t("vigia.copiarComandos")}
          </label>
        </p>
      ) : null}
      {c.estado !== "sin-rutas" ? <Accion etiqueta={t("vigia.configurar", { cliente: c.nombre })} accion="init-cliente" argumentos={{ cliente: c.cliente, ...(comandos ? { comandos: true } : {}) }} alAplicar={recargar} /> : null}
    </article>
  );
}

export function Vigia() {
  const estado = useRecurso<EstadoRespuesta>("/api/estado", ["config", "prompts", "documento", "recibo", "punteros"]);
  const clientes = useRecurso<ClientesRespuesta>("/api/clientes", []);
  const d = estado.datos?.diagnostico;
  return (
    <section class="vista vista-vigia" aria-labelledby="titulo-vigia">
      <h1 id="titulo-vigia">{t("vista.vigia")}</h1>
      {estado.error ? <Aviso error={estado.error} /> : null}
      {estado.cargando && !d ? <Cargando /> : null}
      {d && estado.datos ? (
        <>
          <p class="secundaria">
            {t("vigia.linea", { version: d.paquete.version, via: d.paquete.via, node: d.node.version, vigilancia: t(VIGILANCIA[estado.datos.studio.watcher]) })}
          </p>
          <section aria-labelledby="titulo-diagnostico">
            <h2 id="titulo-diagnostico">{t("vigia.diagnostico")}</h2>
            {d.hallazgos.length === 0 ? <p>{t("vigia.sinHallazgos")}</p> : null}
            {SEVERIDADES.map((s) => {
              const lista = d.hallazgos.filter((h) => h.severidad === s.id);
              if (!lista.length) return null;
              return (
                <section key={s.id} class={`severidad severidad-${s.id}`} aria-labelledby={`sev-${s.id}`}>
                  <h3 id={`sev-${s.id}`} class={`tono-${s.tono}`}>
                    <Marca forma={s.forma} tono={s.tono} /> {t(s.titulo)} ({lista.length})
                  </h3>
                  <ul class="hallazgos">
                    {lista.map((h, i) => (
                      <li key={`${h.codigo}-${i}`} class="hallazgo">
                        <p>
                          <code class="codigo">{h.codigo}</code> {h.texto}
                        </p>
                        <p class="arreglo">
                          <strong>{t("vigia.comoSeArregla")}</strong> {arregloDe(h.codigo)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </section>
        </>
      ) : null}

      <section aria-labelledby="titulo-clientes">
        <h2 id="titulo-clientes">{t("vigia.clientes")}</h2>
        <p class="secundaria">{t("vigia.clientesNota")}</p>
        {clientes.error ? <Aviso error={clientes.error} /> : null}
        {clientes.cargando && !clientes.datos ? <Cargando /> : null}
        <div class="clientes">
          {(clientes.datos?.clientes ?? []).map((c) => (
            <TarjetaDeCliente key={c.cliente} c={c} recargar={clientes.recargar} />
          ))}
        </div>
      </section>

      {d ? (
        <section aria-labelledby="titulo-variables">
          <h2 id="titulo-variables">{t("vigia.variables")}</h2>
          <Tabla
            titulo={t("vigia.tablaVariables")}
            columnas={[t("vigia.colVariable"), t("vigia.colUsada"), t("vigia.colValor"), t("vigia.colFuente"), t("vigia.colDiscrepancia")]}
            filas={d.variables.map((v) => ({ clave: v.logica, celdas: [v.logica, v.usada ?? "—", v.valor ?? "—", fuenteVisible(v.fuente), v.discrepancia ?? "—"] }))}
          />
        </section>
      ) : null}
    </section>
  );
}
