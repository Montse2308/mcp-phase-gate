// «Clientes MCP»: una tarjeta por cliente con lo que haría `init` en él (el comando o el diff de su mcp.json),
// que se aplica con el ciclo de huella. Cada tarjeta tiene su propia vista previa: cada cliente es un archivo
// distinto, y no se mezclan.

import { useState } from "preact/hooks";

import type { ClientesRespuesta, PlanDeClienteApi } from "../../../src/studio/contrato.js";
import { Accion, Diff } from "../comun/accion";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { IndicadorDeEstado } from "../comun/indicador";
import { t } from "../i18n/idioma";
import { NoDisponible, SIN_DATOS_REALES } from "./comunes";

function TarjetaDeCliente({ c, recargar }: { c: PlanDeClienteApi; recargar: () => void }) {
  const [comandos, setComandos] = useState(false);
  const leeComandos = c.cliente !== "vscode";
  const id = `comandos-${c.cliente}`;
  return (
    <article class="cliente" aria-labelledby={`cliente-${c.cliente}`}>
      <h3 id={`cliente-${c.cliente}`}>{c.nombre}</h3>
      <p class="linea">
        <IndicadorDeEstado estado={c.detectado ? "ajustes-cliente-detectado" : "ajustes-cliente-no-detectado"} texto={t(c.detectado ? "ajustes.cliente.detectado" : "ajustes.cliente.noDetectado")} />
      </p>
      <p>{c.mensaje}</p>
      {c.archivo ? (
        <p class="secundaria">
          {t("ajustes.cliente.archivo")} <code>{c.archivo}</code>
        </p>
      ) : null}
      {c.comando ? (
        <p>
          {t("ajustes.cliente.comando")} <code>{c.comando}</code>
        </p>
      ) : null}
      {c.diff ? <Diff texto={c.diff} etiqueta={t("ajustes.cliente.loQueCambiaria", { cliente: c.nombre })} /> : null}
      {leeComandos ? (
        <p>
          <label for={id}>
            <input id={id} type="checkbox" checked={comandos} onChange={(e) => setComandos((e.target as HTMLInputElement).checked)} /> {t("ajustes.cliente.copiarComandos")}
          </label>
        </p>
      ) : null}
      {c.estado !== "sin-rutas" ? <Accion etiqueta={t("ajustes.cliente.configurar", { cliente: c.nombre })} accion="init-cliente" argumentos={{ cliente: c.cliente, ...(comandos ? { comandos: true } : {}) }} alAplicar={recargar} /> : null}
    </article>
  );
}

export function PaginaClientes() {
  const clientes = useRecurso<ClientesRespuesta>(SIN_DATOS_REALES ? null : "/api/clientes", ["equipo"]);
  return (
    <div class="pagina-ajustes pagina-clientes">
      <h2>{t("ajustes.clientes")}</h2>
      <p class="secundaria">{t("ajustes.clientesNota")}</p>
      {SIN_DATOS_REALES ? <NoDisponible /> : null}
      {clientes.error ? <Aviso error={clientes.error} /> : null}
      {clientes.cargando && !clientes.datos && !SIN_DATOS_REALES ? <Cargando /> : null}
      <div class="clientes">
        {(clientes.datos?.clientes ?? []).map((c) => (
          <TarjetaDeCliente key={c.cliente} c={c} recargar={clientes.recargar} />
        ))}
      </div>
    </div>
  );
}
