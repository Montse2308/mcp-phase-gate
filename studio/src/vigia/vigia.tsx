// El Vigía: el diagnóstico de doctor agrupado por severidad, con una línea de "cómo se arregla" por código. Los
// clientes MCP y las variables avanzadas se mudaron a Ajustes.
//
// Cada hallazgo se enseña por su código, con el texto del servidor (que llega en el idioma de la interfaz)
// y la línea de "cómo se arregla" del diccionario de ese idioma (arreglos.ts).

import type { EstadoRespuesta } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { IndicadorDeEstado } from "../comun/indicador";
import type { ClaveDeEstado } from "../comun/indicador";
import { t } from "../i18n/idioma";
import { enlace } from "../rutas";
import { arregloDe } from "./arreglos";

const SEVERIDADES: { id: "error" | "aviso" | "info"; titulo: "vigia.errores" | "vigia.avisos" | "vigia.info"; estado: ClaveDeEstado }[] = [
  { id: "error", titulo: "vigia.errores", estado: "vigia-errores" },
  { id: "aviso", titulo: "vigia.avisos", estado: "vigia-avisos" },
  { id: "info", titulo: "vigia.info", estado: "vigia-info" },
];

const VIGILANCIA = {
  activo: "vigia.vigilancia.activo",
  degradado: "vigia.vigilancia.degradado",
  apagado: "vigia.vigilancia.apagado",
} as const;

export function Vigia() {
  const estado = useRecurso<EstadoRespuesta>("/api/estado", ["config", "prompts", "documento", "recibo", "punteros", "equipo"]);
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
                  <h3 id={`sev-${s.id}`}>
                    <IndicadorDeEstado estado={s.estado} texto={`${t(s.titulo)} (${lista.length})`} />
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

      <p class="en-ajustes">
        {t("vigia.enAjustes")} <a href={enlace("ajustes", "clientes")}>{t("vigia.abrirAjustes")}</a>
      </p>
    </section>
  );
}
