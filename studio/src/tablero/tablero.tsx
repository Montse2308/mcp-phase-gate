// El Tablero de una tarea (§7.7.2 del plan): una vía con una estación por documento, cada una con su
// semáforo, y la fase de los lotes desplegada en vagones con su sello. Un clic abre el documento o el
// recibo en el visor. En vivo: un documento o un recibo nuevo recarga lo suyo, y un sello que aparece por
// un evento cae una sola vez (sin animación con prefers-reduced-motion).

import { useEffect, useRef, useState } from "preact/hooks";

import type { Estacion, FilaDeLote, LotesRespuesta, TareaRespuesta } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Selector } from "../comun/selector";
import { Tabla } from "../comun/tabla";
import { ruta } from "../datos";
import { t } from "../i18n/idioma";
import { useModoVisual } from "../preferencias";
import { enlace } from "../rutas";
import { Visor } from "../visor/visor";
import { Senal } from "./senal";
import { selloDe } from "./sellos";
import type { Sello, TipoDeSello } from "./sellos";

const ESTAMPADOS = new Set<TipoDeSello>(["verificado", "sellado", "pendientes", "rechazado", "anulado", "manual", "nota"]);

function etiquetaDe(e: Estacion): string {
  return e.numero === 0 ? "00" : t("tablero.fase", { n: e.numero });
}

// La señal de una estación es un valor del contrato (TextoDeSenal), en español: aquí se dice.
const SENALES: Record<Estacion["texto"], "senal.cerrada" | "senal.conPendientes" | "senal.enCurso" | "senal.hueco" | "senal.pendiente"> = {
  cerrada: "senal.cerrada",
  "con pendientes": "senal.conPendientes",
  "en curso": "senal.enCurso",
  hueco: "senal.hueco",
  pendiente: "senal.pendiente",
};

function textoDeSenal(e: Estacion): string {
  return t(SENALES[e.texto]);
}

function SelloVisible({ sello, nuevo }: { sello: Sello; nuevo: boolean }) {
  if (!sello.palabra) return <span class="sello sello-vacio">{t("sello.sinRecibo")}</span>;
  return (
    <span class={`sello sello-${sello.tipo}${nuevo ? " sello-nuevo" : ""}`}>
      {sello.marco ? <img class="sello-marco" src={`./sellos/${sello.marco}.svg`} alt="" width="120" height="60" /> : null}
      {sello.tipo === "agrietado" ? <img class="sello-grieta" src="./sellos/grieta.svg" alt="" width="120" height="60" /> : null}
      <span class="sello-palabra">{sello.palabra}</span>
      {sello.banda ? <span class="sello-banda">{sello.banda}</span> : null}
      {sello.detalle
        ? sello.detalle.split(" · ").map((parte) => (
            <span key={parte} class="sello-detalle">
              {parte}
            </span>
          ))
        : null}
    </span>
  );
}

function Via({ estaciones, alAbrir, abierto }: { estaciones: Estacion[]; alAbrir: (archivo: string) => void; abierto: string | null }) {
  return (
    <ol class="via-tablero" aria-label={t("tablero.estaciones")}>
      {estaciones.map((e) => (
        <li key={e.numero} class={`estacion-via senal-${e.senal}`}>
          <button type="button" class="estacion-boton" disabled={!e.existe} aria-pressed={abierto === e.documento} onClick={() => alAbrir(e.documento)}>
            <Senal senal={e.senal} />
            <span class="estacion-texto">
              <span class="estacion-numero">{etiquetaDe(e)}</span>
              <span class="estacion-titulo">{e.titulo}</span>
              <span class="estacion-estado">{textoDeSenal(e)}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Vagones({ filas, nuevos, alAbrir, abierto }: { filas: FilaDeLote[]; nuevos: Set<string>; alAbrir: (archivo: string) => void; abierto: string | null }) {
  return (
    <ol class="vagones" aria-label={t("tablero.lotesDeLaFase")}>
      {filas.map((f) => {
        const sello = selloDe(f);
        return (
          <li key={f.lote} class={`vagon vagon-${sello.tipo}`}>
            <button type="button" class="vagon-boton" disabled={!f.recibo} aria-pressed={f.recibo !== null && abierto === f.recibo} onClick={() => f.recibo && alAbrir(f.recibo)}>
              <span class="vagon-lote">{f.lote}</span>
              {f.objetivo ? <span class="vagon-objetivo">{f.objetivo}</span> : null}
              <SelloVisible sello={sello} nuevo={nuevos.has(f.lote)} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// `t` es la tarea (así se llama en la ruta); dentro se dice `tarea` o `nombre`, para no tapar a t().
export function Tablero({ p, t: tarea }: { p: string | undefined; t: string | undefined }) {
  if (!p || !tarea) return <Selector vista="tablero" titulo={t("vista.tablero")} />;
  return <TableroDeTarea key={`${p}/${tarea}`} p={p} t={tarea} />;
}

function TableroDeTarea({ p, t: nombre }: { p: string; t: string }) {
  const modo = useModoVisual();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [reverificar, setReverificar] = useState(false);
  const deEsta = (_tipo: string, d: Record<string, string>): boolean => !d.p || (d.p === p && (!d.t || d.t === nombre));
  const tarea = useRecurso<TareaRespuesta>(`/api/tareas/${ruta(p, nombre)}`, ["documento", "recibo", "config", "prompts"], deEsta);
  const lotes = useRecurso<LotesRespuesta>(`/api/tareas/${ruta(p, nombre)}/lotes${reverificar ? "?reverificar=1" : ""}`, ["documento", "recibo", "config"], deEsta);

  // Un sello que aparece en una recarga (por un evento), y no estaba, cae una vez.
  const anteriores = useRef<Map<string, TipoDeSello> | null>(null);
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  useEffect(() => {
    const datos = lotes.datos;
    if (!datos?.disponible) return;
    const ahora = new Map(datos.estado.lotes.map((f) => [f.lote, selloDe(f).tipo] as const));
    if (anteriores.current) {
      const aparecidos = [...ahora].filter(([lote, tipo]) => ESTAMPADOS.has(tipo) && anteriores.current!.get(lote) !== tipo).map(([lote]) => lote);
      setNuevos(new Set(aparecidos));
    }
    anteriores.current = ahora;
  }, [lotes.datos]);

  const datos = tarea.datos;
  const filas = lotes.datos?.disponible ? lotes.datos.estado.lotes : [];
  return (
    <div class={`tablero${abierto ? " con-visor" : ""}`}>
      <section class="vista vista-tablero" aria-labelledby="titulo-tablero">
        <p class="miga">
          <a href={enlace("red")}>{t("vista.red")}</a> › {p}
        </p>
        <h1 id="titulo-tablero">{nombre}</h1>
        {tarea.error ? <Aviso error={tarea.error} /> : null}
        {tarea.cargando && !datos ? <Cargando /> : null}
        {datos ? (
          <>
            <p class="descripcion">{datos.estado.descripcion}</p>
            {datos.compuerta ? (
              <p class="aviso" role="note">
                {t("tablero.hueco")}
              </p>
            ) : null}
            {datos.pendientes ? (
              <p class="aviso" role="note">
                {t("tablero.pendientes")}
              </p>
            ) : null}
            {modo === "sobrio" ? (
              <Tabla
                titulo={t("tablero.tablaEstaciones")}
                columnas={[t("tablero.colEstacion"), t("tablero.colDocumento"), t("tablero.colSenal")]}
                filas={datos.estaciones.map((e) => ({
                  clave: String(e.numero),
                  celdas: [
                    `${etiquetaDe(e)} · ${e.titulo}`,
                    e.existe ? (
                      <button type="button" class="enlace-boton" onClick={() => setAbierto(e.documento)}>
                        {e.documento}
                      </button>
                    ) : (
                      e.documento
                    ),
                    textoDeSenal(e),
                  ],
                }))}
              />
            ) : (
              <Via estaciones={datos.estaciones} alAbrir={setAbierto} abierto={abierto} />
            )}
          </>
        ) : null}

        <section class="lotes" aria-labelledby="titulo-lotes">
          <h2 id="titulo-lotes">{t("tablero.lotes")}</h2>
          {lotes.datos && !lotes.datos.disponible ? <p class="secundaria">{lotes.datos.motivo}</p> : null}
          {lotes.datos?.disponible ? (
            <>
              <p class="secundaria">
                {t("tablero.resumenLotes", { cerrados: lotes.datos.estado.cerrados, declarados: lotes.datos.estado.declarados, siguiente: lotes.datos.estado.siguiente ?? "" })}
              </p>
              <button type="button" class="boton" onClick={() => (reverificar ? lotes.recargar() : setReverificar(true))} disabled={lotes.cargando}>
                {t(lotes.cargando ? "tablero.reverificando" : "tablero.reverificar")}
              </button>
              {lotes.datos.reverificado ? <span class="secundaria"> {t("tablero.reverificado")}</span> : null}
              {modo === "sobrio" ? (
                <Tabla
                  titulo={t("tablero.lotesDeLaFase")}
                  columnas={[t("tablero.colLote"), t("tablero.colObjetivo"), t("tablero.colRepo"), t("tablero.colSello"), t("tablero.colAncla"), t("tablero.colRecibo")]}
                  filas={filas.map((f) => ({
                    clave: f.lote,
                    celdas: [
                      f.lote,
                      f.objetivo ?? "—",
                      f.repo ?? "—",
                      selloDe(f).sobrio,
                      f.ancla?.resumen ?? "—",
                      f.recibo ? (
                        <button type="button" class="enlace-boton" onClick={() => setAbierto(f.recibo)}>
                          {f.recibo}
                        </button>
                      ) : (
                        "—"
                      ),
                    ],
                  }))}
                />
              ) : (
                <Vagones filas={filas} nuevos={nuevos} alAbrir={setAbierto} abierto={abierto} />
              )}
            </>
          ) : null}
        </section>
      </section>
      {abierto ? <Visor p={p} t={nombre} archivo={abierto} alCerrar={() => setAbierto(null)} /> : null}
    </div>
  );
}
