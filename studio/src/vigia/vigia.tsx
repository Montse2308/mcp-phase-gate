// El Vigía (§7.7.4 del plan): el diagnóstico de doctor agrupado por severidad, con una línea de "cómo se
// arregla" por código; un asistente de clientes con lo que haría `init` en cada uno (el comando o el diff
// de su mcp.json), que se aplica con el ciclo de huella; y las variables, de dónde salió cada una.

import { useState } from "preact/hooks";

import type { ClientesRespuesta, EstadoRespuesta, PlanDeClienteApi } from "../../../src/studio/contrato.js";
import { Accion, Diff } from "../comun/accion";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Marca } from "../comun/marcas";
import type { Forma, Tono } from "../comun/marcas";
import { Tabla } from "../comun/tabla";
import { ARREGLOS, SIN_ARREGLO } from "./arreglos";

const SEVERIDADES: { id: "error" | "aviso" | "info"; titulo: string; forma: Forma; tono: Tono }[] = [
  { id: "error", titulo: "Errores", forma: "rombo", tono: "rojo" },
  { id: "aviso", titulo: "Avisos", forma: "triangulo", tono: "ambar" },
  { id: "info", titulo: "Información", forma: "vacio", tono: "apagado" },
];

const VIGILANCIA: Record<string, string> = {
  activo: "activa: los cambios del disco llegan al momento",
  degradado: "degradada: el sondeo de respaldo vio cambios que el watcher no avisó (¿OneDrive?)",
  apagado: "apagada: sin vigilancia, recarga a mano",
};

function TarjetaDeCliente({ c, recargar }: { c: PlanDeClienteApi; recargar: () => void }) {
  const [comandos, setComandos] = useState(false);
  const leeComandos = c.cliente !== "vscode";
  const id = `comandos-${c.cliente}`;
  return (
    <article class="cliente" aria-labelledby={`cliente-${c.cliente}`}>
      <h3 id={`cliente-${c.cliente}`}>{c.nombre}</h3>
      <p class={`linea ${c.detectado ? "tono-verde" : "tono-apagado"}`}>
        <Marca forma={c.detectado ? "lleno" : "vacio"} tono={c.detectado ? "verde" : "apagado"} /> {c.detectado ? "detectado en este equipo" : "no detectado"}
      </p>
      <p>{c.mensaje}</p>
      {c.archivo ? (
        <p class="secundaria">
          Archivo: <code>{c.archivo}</code>
        </p>
      ) : null}
      {c.comando ? (
        <p>
          Comando: <code>{c.comando}</code>
        </p>
      ) : null}
      {c.diff ? <Diff texto={c.diff} etiqueta={`Lo que cambiaría en ${c.nombre}`} /> : null}
      {leeComandos ? (
        <p>
          <label for={id}>
            <input id={id} type="checkbox" checked={comandos} onChange={(e) => setComandos((e.target as HTMLInputElement).checked)} /> Copiar también los comandos de fase (/f1…/fN)
          </label>
        </p>
      ) : null}
      {c.estado !== "sin-rutas" ? <Accion etiqueta={`Configurar ${c.nombre}`} accion="init-cliente" argumentos={{ cliente: c.cliente, ...(comandos ? { comandos: true } : {}) }} alAplicar={recargar} /> : null}
    </article>
  );
}

export function Vigia() {
  const estado = useRecurso<EstadoRespuesta>("/api/estado", ["config", "prompts", "documento", "recibo", "punteros"]);
  const clientes = useRecurso<ClientesRespuesta>("/api/clientes", []);
  const d = estado.datos?.diagnostico;
  return (
    <section class="vista vista-vigia" aria-labelledby="titulo-vigia">
      <h1 id="titulo-vigia">Vigía</h1>
      {estado.error ? <Aviso error={estado.error} /> : null}
      {estado.cargando && !d ? <Cargando /> : null}
      {d && estado.datos ? (
        <>
          <p class="secundaria">
            mcp-phase-gate {d.paquete.version} ({d.paquete.via}) · Node {d.node.version} · Vigilancia {VIGILANCIA[estado.datos.studio.watcher]}
          </p>
          <section aria-labelledby="titulo-diagnostico">
            <h2 id="titulo-diagnostico">Diagnóstico</h2>
            {d.hallazgos.length === 0 ? <p>Sin hallazgos: todo en orden.</p> : null}
            {SEVERIDADES.map((s) => {
              const lista = d.hallazgos.filter((h) => h.severidad === s.id);
              if (!lista.length) return null;
              return (
                <section key={s.id} class={`severidad severidad-${s.id}`} aria-labelledby={`sev-${s.id}`}>
                  <h3 id={`sev-${s.id}`} class={`tono-${s.tono}`}>
                    <Marca forma={s.forma} tono={s.tono} /> {s.titulo} ({lista.length})
                  </h3>
                  <ul class="hallazgos">
                    {lista.map((h, i) => (
                      <li key={`${h.codigo}-${i}`} class="hallazgo">
                        <p>
                          <code class="codigo">{h.codigo}</code> {h.texto}
                        </p>
                        <p class="arreglo">
                          <strong>Cómo se arregla:</strong> {ARREGLOS[h.codigo] ?? SIN_ARREGLO}
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
        <h2 id="titulo-clientes">Clientes MCP</h2>
        <p class="secundaria">Lo que haría `mcp-phase-gate init` en cada uno. Nada se escribe sin la vista previa y su "Aplicar".</p>
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
          <h2 id="titulo-variables">Variables</h2>
          <Tabla
            titulo="Variables de entorno"
            columnas={["Variable", "Nombre usado", "Valor", "De dónde sale", "Discrepancia"]}
            filas={d.variables.map((v) => ({ clave: v.logica, celdas: [v.logica, v.usada ?? "—", v.valor ?? "—", v.fuente, v.discrepancia ?? "—"] }))}
          />
        </section>
      ) : null}
    </section>
  );
}
