// El Tablero de una tarea: una lista de seis tarjetas, una por documento de fase, y debajo los lotes de la
// Fase 4 en una tabla con su estado, su detalle, su ancla y su recibo. Un clic en una tarjeta o en un recibo
// abre el documento en el visor. En vivo: un documento o un recibo nuevo recarga lo suyo, y la fila de un
// lote que se sella por un evento se resalta un momento (sin animación con prefers-reduced-motion). La misma
// estructura en los dos modos: solo cambian los colores.

import { useEffect, useRef, useState } from "preact/hooks";

import type { Estacion, FilaDeLote, LotesRespuesta, TareaRespuesta } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Marca } from "../comun/marcas";
import type { Forma, Tono } from "../comun/marcas";
import { Selector } from "../comun/selector";
import { ruta } from "../datos";
import { t } from "../i18n/idioma";
import { enlace } from "../rutas";
import { Visor } from "../visor/visor";
import { selloDe } from "./sellos";
import type { TipoDeSello } from "./sellos";

// Los estados que, al aparecer en una recarga, resaltan su fila.
const ESTAMPADOS = new Set<TipoDeSello>(["verificado", "sellado", "con-pendientes", "rechazado", "descartado", "manual", "nota"]);

// Cuánto dura el resaltado de la fila nueva.
const MS_DE_RESALTADO = 4000;

function etiquetaDe(e: Estacion): string {
  return e.numero === 0 ? "00" : t("tablero.fase", { n: e.numero });
}

// El estado de una fase es un valor del contrato (TextoDeSenal), en español: aquí se dice y se le da su forma.
const FASES: Record<Estacion["texto"], { clase: string; clave: "fase.cerrada" | "fase.conPendientes" | "fase.enCurso" | "fase.hueco" | "fase.pendiente"; forma: Forma; tono: Tono }> = {
  cerrada: { clase: "fase-cerrada", clave: "fase.cerrada", forma: "lleno", tono: "verde" },
  "en curso": { clase: "fase-en-curso", clave: "fase.enCurso", forma: "anillo", tono: "ambar" },
  "con pendientes": { clase: "fase-con-pendientes", clave: "fase.conPendientes", forma: "triangulo", tono: "ambar" },
  hueco: { clase: "fase-hueco", clave: "fase.hueco", forma: "rombo", tono: "rojo" },
  pendiente: { clase: "fase-pendiente", clave: "fase.pendiente", forma: "vacio", tono: "apagado" },
};

// Los detalles que son texto (el motivo, la nota); los demás son SHA, sha256 o fechas.
const DETALLE_EN_TEXTO = new Set<TipoDeSello>(["no-vigente", "nota"]);

// Lo que está abierto en el visor y el botón que lo abrió: solo ese botón queda pulsado, aunque otro
// lleve al mismo archivo (el recibo de un lote único es también el documento de la Fase 4).
type Abierto = { archivo: string; origen: string };
type AlAbrir = (archivo: string, origen: string, boton: HTMLElement) => void;

// El archivo de cada fase entra en el nombre accesible de su tarjeta y el visor lo muestra; si el documento
// no existe (no hay visor que abrir), se ve también en la tarjeta.
function Fases({ estaciones, alAbrir, abierto }: { estaciones: Estacion[]; alAbrir: AlAbrir; abierto: Abierto | null }) {
  return (
    <ol class="fases" aria-label={t("tablero.fases")}>
      {estaciones.map((e) => {
        const fase = FASES[e.texto];
        const origen = `fase-${e.numero}`;
        return (
          <li key={e.numero} class={`fase ${fase.clase}`}>
            <button type="button" class="fase-boton" disabled={!e.existe} aria-pressed={abierto?.origen === origen} onClick={(ev) => alAbrir(e.documento, origen, ev.currentTarget)}>
              <span class="fase-numero">{etiquetaDe(e)}</span>
              <span class="fase-titulo">{e.titulo}</span>
              <span class={`fase-estado tono-${fase.tono}`}>
                <Marca forma={fase.forma} tono={fase.tono} /> {t(fase.clave)}
              </span>
              <span class={e.existe ? "solo-lectura" : "fase-archivo"}>{e.documento}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function TablaDeLotes({ filas, nuevos, alAbrir, abierto }: { filas: FilaDeLote[]; nuevos: Set<string>; alAbrir: AlAbrir; abierto: Abierto | null }) {
  const columnas = [t("tablero.colLote"), t("tablero.colObjetivo"), t("tablero.colRepo"), t("tablero.colEstado"), t("tablero.colDetalle"), t("tablero.colAncla"), t("tablero.colRecibo")];
  return (
    <div class="tabla-envoltura">
      <table class="tabla tabla-lotes" role="table">
        <caption>{t("tablero.lotesDeLaFase")}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columnas.map((c) => (
              <th key={c} scope="col" role="columnheader">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {filas.map((f) => {
            const sello = selloDe(f);
            const origen = `lote-${f.lote}`;
            return (
              <tr key={f.lote} role="row" class={nuevos.has(f.lote) ? "estado-nuevo" : undefined}>
                <th scope="row" role="rowheader" data-etiqueta={columnas[0]}>
                  {f.lote}
                </th>
                <td role="cell" data-etiqueta={columnas[1]}>
                  {f.objetivo ?? "—"}
                </td>
                <td role="cell" data-etiqueta={columnas[2]}>
                  {f.repo ?? "—"}
                </td>
                <td role="cell" data-etiqueta={columnas[3]}>
                  <span class={`estado estado-${sello.tipo}`}>{sello.palabra}</span>
                </td>
                <td role="cell" class="celda-larga" data-etiqueta={columnas[4]}>
                  {sello.detalle
                    ? sello.detalle.split(" · ").map((parte, i) => (
                        <span key={i} class={DETALLE_EN_TEXTO.has(sello.tipo) ? "estado-detalle estado-detalle-texto" : "estado-detalle"}>
                          {parte}
                        </span>
                      ))
                    : "—"}
                </td>
                <td role="cell" class="celda-larga" data-etiqueta={columnas[5]}>
                  {f.ancla?.resumen ?? "—"}
                </td>
                <td role="cell" class="celda-larga" data-etiqueta={columnas[6]}>
                  <button type="button" class="enlace-boton" disabled={!f.recibo} aria-pressed={abierto?.origen === origen} onClick={(ev) => f.recibo && alAbrir(f.recibo, origen, ev.currentTarget)}>
                    {f.recibo ?? "—"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// `t` es la tarea (así se llama en la ruta); dentro se dice `tarea` o `nombre`, para no tapar a t().
export function Tablero({ p, t: tarea }: { p: string | undefined; t: string | undefined }) {
  if (!p || !tarea) return <Selector vista="tablero" titulo={t("vista.tablero")} />;
  return <TableroDeTarea key={`${p}/${tarea}`} p={p} t={tarea} />;
}

function TableroDeTarea({ p, t: nombre }: { p: string; t: string }) {
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const [reverificar, setReverificar] = useState(false);

  // Al cerrar el visor (con su botón o con Escape), el foco vuelve al botón que lo abrió.
  const boton = useRef<HTMLElement | null>(null);
  const abrir: AlAbrir = (archivo, origen, desde) => {
    boton.current = desde;
    setAbierto({ archivo, origen });
  };
  const cerrar = () => {
    setAbierto(null);
    if (boton.current?.isConnected) boton.current.focus();
  };
  // Escape se escucha en el propio Tablero (el foco está en el visor o en el botón que lo abrió), no con un
  // efecto, que se registra después de pintar y perdería una tecla pulsada justo al abrir.
  const alPulsar = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && abierto) cerrar();
  };
  const deEsta = (_tipo: string, d: Record<string, string>): boolean => !d.p || (d.p === p && (!d.t || d.t === nombre));
  const tarea = useRecurso<TareaRespuesta>(`/api/tareas/${ruta(p, nombre)}`, ["documento", "recibo", "config", "prompts"], deEsta);
  const lotes = useRecurso<LotesRespuesta>(`/api/tareas/${ruta(p, nombre)}/lotes${reverificar ? "?reverificar=1" : ""}`, ["documento", "recibo", "config"], deEsta);

  // El estado que aparece en una recarga (por un evento), y no estaba, resalta su fila un momento.
  const anteriores = useRef<Map<string, TipoDeSello> | null>(null);
  const [nuevos, setNuevos] = useState<Set<string>>(new Set());
  const plazo = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const datos = lotes.datos;
    if (!datos?.disponible) return;
    const ahora = new Map(datos.estado.lotes.map((f) => [f.lote, selloDe(f).tipo] as const));
    const previos = anteriores.current;
    anteriores.current = ahora;
    if (!previos) return;
    const aparecidos = [...ahora].filter(([lote, tipo]) => ESTAMPADOS.has(tipo) && previos.get(lote) !== tipo).map(([lote]) => lote);
    if (!aparecidos.length) return; // otra recarga del mismo estado no apaga el resaltado en curso
    setNuevos((antes) => new Set([...antes, ...aparecidos]));
    clearTimeout(plazo.current);
    plazo.current = setTimeout(() => setNuevos(new Set()), MS_DE_RESALTADO);
  }, [lotes.datos]);
  useEffect(() => () => clearTimeout(plazo.current), []);

  const datos = tarea.datos;
  const filas = lotes.datos?.disponible ? lotes.datos.estado.lotes : [];
  return (
    <div class={`tablero${abierto ? " con-visor" : ""}`} onKeyDown={alPulsar}>
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
            <Fases estaciones={datos.estaciones} alAbrir={abrir} abierto={abierto} />
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
              <TablaDeLotes filas={filas} nuevos={nuevos} alAbrir={abrir} abierto={abierto} />
            </>
          ) : null}
        </section>
      </section>
      {abierto ? <Visor p={p} t={nombre} archivo={abierto.archivo} alCerrar={cerrar} /> : null}
    </div>
  );
}
