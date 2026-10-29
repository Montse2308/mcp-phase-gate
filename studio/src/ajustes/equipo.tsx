// «Este equipo»: lo que se guarda en machine.json. Dónde están la Documentación y los repos en esta computadora,
// la subcarpeta de las tareas, el idioma y el preset por defecto. Un solo borrador, un solo diff y un solo
// Aplicar. Antes de los campos, lo que el entorno dice distinto: primero el del propio Studio, y después el env
// de cada cliente, que se puede quitar con su vista previa.
//
// Sin Documentación configurada es lo primero que se ve al abrir el Studio: pide dónde está.

import { useMemo } from "preact/hooks";

import type { AjustesRespuesta, CampoAjustes, ClienteAjustes } from "../../../src/studio/contrato.js";
import { Accion } from "../comun/accion";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { IndicadorDeEstado } from "../comun/indicador";
import type { ClaveDeEstado } from "../comun/indicador";
import { NOMBRE_DEL_IDIOMA, t } from "../i18n/idioma";
import { useBorrador } from "./borrador";
import { Campo, NoDisponible, Pie, SIN_DATOS_REALES, SOLO_LECTURA, fuenteVisible } from "./comunes";

type DiscoEquipo = {
  documentacion: string | null;
  carpetaDeRepos: string | null;
  subcarpetaTareas: string | null;
  idiomaPorDefecto: string | null;
  presetPorDefecto: string | null;
};

const campoDe = (a: AjustesRespuesta, nombre: CampoAjustes["campo"]): CampoAjustes => a.campos.find((c) => c.campo === nombre)!;

function discoDe(a: AjustesRespuesta): DiscoEquipo {
  return {
    documentacion: campoDe(a, "documentacion").enMaquina,
    carpetaDeRepos: campoDe(a, "carpetaDeRepos").enMaquina,
    subcarpetaTareas: campoDe(a, "subcarpetaTareas").enMaquina,
    idiomaPorDefecto: campoDe(a, "idioma").enMaquina,
    presetPorDefecto: a.maquina.presetPorDefecto,
  };
}

// Lo que se manda a la acción `equipo`: solo los campos cambiados. `null` quita la clave del archivo.
export function argumentosDeEquipo(c: Partial<DiscoEquipo>): Record<string, unknown> {
  const argumentos: Record<string, unknown> = {};
  const rutas: Record<string, string | null> = {};
  for (const k of ["documentacion", "carpetaDeRepos", "subcarpetaTareas"] as const) if (k in c) rutas[k] = c[k] ?? null;
  if (Object.keys(rutas).length) argumentos.rutas = rutas;
  if ("idiomaPorDefecto" in c) argumentos.idiomaPorDefecto = c.idiomaPorDefecto || null;
  if ("presetPorDefecto" in c) argumentos.presetPorDefecto = c.presetPorDefecto || null;
  return argumentos;
}

const ESTADO_DE_ENV: Record<"pisa" | "coincide" | "sin-valor-en-maquina", { estado: ClaveDeEstado; texto: "ajustes.env.pisa" | "ajustes.env.coincide" | "ajustes.env.sinValor" }> = {
  pisa: { estado: "ajustes-env-pisa", texto: "ajustes.env.pisa" },
  coincide: { estado: "ajustes-env-coincide", texto: "ajustes.env.coincide" },
  "sin-valor-en-maquina": { estado: "ajustes-env-sin-valor", texto: "ajustes.env.sinValor" },
};

function EstadoDeMaquina({ a }: { a: AjustesRespuesta }) {
  const m = a.maquina;
  const estado: ClaveDeEstado = m.estado === "valido" ? "ajustes-maquina-valida" : m.estado === "ausente" ? "ajustes-maquina-ausente" : "ajustes-maquina-invalida";
  const texto = t(m.estado === "valido" ? "ajustes.maquina.valida" : m.estado === "ausente" ? "ajustes.maquina.ausente" : "ajustes.maquina.invalida");
  return (
    <div class="estado-de-maquina">
      <p class="linea">
        <IndicadorDeEstado estado={estado} texto={texto} />
        {m.version !== null ? <span class="secundaria"> {t("ajustes.maquina.version", { version: m.version })}</span> : null}
      </p>
      {m.error ? <p class="detalle-error">{m.error}</p> : null}
      {m.deMemoria ? (
        <p class="aviso" role="status">
          {t("ajustes.maquina.deMemoria")}
        </p>
      ) : null}
    </div>
  );
}

// Lo que dicen los env de los clientes, con la acción de quitarlo de cada uno.
function EnvDeLosClientes({ clientes, alAplicar }: { clientes: ClienteAjustes[]; alAplicar: () => void }) {
  const conEnv = clientes.filter((c) => c.entradas.some((e) => e.variables.length > 0));
  const ilegibles = clientes.filter((c) => c.lectura === "ilegible");
  return (
    <section class="env-de-clientes" aria-labelledby="titulo-env">
      <h3 id="titulo-env">{t("ajustes.env.titulo")}</h3>
      <p class="secundaria">{t("ajustes.env.nota")}</p>
      {conEnv.length === 0 ? <p>{t("ajustes.env.ninguno")}</p> : null}
      {ilegibles.map((c) => (
        <p key={c.cliente} class="aviso">
          {t("ajustes.env.archivoIlegible", { cliente: c.nombre, archivo: c.archivo })}
        </p>
      ))}
      {conEnv.map((c) => {
        const pisa = c.entradas.find((e) => e.variables.some((v) => v.estado === "pisa"));
        const idiomaPisa = c.entradas.some((e) => e.variables.some((v) => v.campo === "idioma" && v.estado === "pisa"));
        return (
          <article key={c.cliente} class="env-de-cliente" aria-label={c.nombre}>
            <h4>{c.nombre}</h4>
            <ul class="env-lista">
              {c.entradas.flatMap((e) =>
                e.variables.map((v) => (
                  <li key={`${e.ambito}-${e.clave}-${v.variable}`}>
                    <IndicadorDeEstado estado={ESTADO_DE_ENV[v.estado].estado} texto={t(ESTADO_DE_ENV[v.estado].texto, { variable: v.variable, valor: v.valor })} literal />
                    <span class="secundaria"> ({t("ajustes.env.entrada", { cliente: c.nombre, clave: e.clave })})</span>
                  </li>
                ))
              )}
            </ul>
            {pisa ? (
              <Accion
                etiqueta={t("ajustes.env.quitarDe", { cliente: c.nombre })}
                accion="init-cliente"
                argumentos={{ cliente: c.cliente, clave: pisa.clave, ...(idiomaPisa ? { quitarIdioma: true } : {}) }}
                alAplicar={alAplicar}
              />
            ) : null}
          </article>
        );
      })}
    </section>
  );
}

function Sesiones({ a }: { a: AjustesRespuesta }) {
  const conRutas = a.sesiones.filter((s) => s.variables.length > 0 || s.sinRutas);
  if (conRutas.length === 0) return null;
  return (
    <section class="env-de-clientes" aria-labelledby="titulo-sesiones">
      <h3 id="titulo-sesiones">{t("ajustes.sesiones.titulo")}</h3>
      <p class="secundaria">{t("ajustes.sesiones.nota")}</p>
      <ul class="env-lista">
        {conRutas.map((s) =>
          s.sinRutas ? (
            <li key={s.pid}>
              {t("ajustes.sesiones.de", { cliente: s.cliente })}: {t("ajustes.sesiones.sinRutas")}
            </li>
          ) : (
            s.variables.map((v) => (
              <li key={`${s.pid}-${v.variable}`}>
                <IndicadorDeEstado estado={ESTADO_DE_ENV[v.estado].estado} texto={t(ESTADO_DE_ENV[v.estado].texto, { variable: v.variable, valor: v.valor })} literal />
                <span class="secundaria"> ({t("ajustes.sesiones.de", { cliente: s.cliente })})</span>
              </li>
            ))
          )
        )}
      </ul>
    </section>
  );
}

export function PaginaEquipo({ presets }: { presets: string[] }) {
  const ajustes = useRecurso<AjustesRespuesta>(SIN_DATOS_REALES ? null : "/api/ajustes", ["equipo", "config", "sesiones"]);
  const datos = ajustes.datos;
  const disco = useMemo(() => (datos ? discoDe(datos) : null), [datos]);
  const b = useBorrador<DiscoEquipo>("equipo", disco);
  const primeraVez = datos !== null && campoDe(datos, "documentacion").efectivo === null;

  const rutaDeTexto = (nombre: "documentacion" | "carpetaDeRepos", etiqueta: string) => {
    const c = campoDe(datos!, nombre);
    const valor = b.valor(nombre);
    return (
      <Campo
        nombre={nombre}
        etiqueta={etiqueta}
        borrador={b}
        ayuda={
          <>
            <p class="secundaria">{c.efectivo !== null ? t("ajustes.ahoraSeUsa", { valor: c.efectivo, fuente: fuenteVisible(c.fuente) }) : t("ajustes.ahoraNada")}</p>
            {c.sinGuardar && !b.cambiado(nombre) && !SOLO_LECTURA ? (
              <p class="aviso">
                {t("ajustes.sinGuardar", { efectivo: c.efectivo ?? "" })}{" "}
                <button type="button" class="boton" onClick={() => b.poner(nombre, c.efectivo)}>
                  {t("ajustes.guardarEnMaquina")}
                </button>
              </p>
            ) : null}
            {valor !== null && !SOLO_LECTURA ? (
              <p>
                <button type="button" class="boton" onClick={() => b.poner(nombre, null)}>
                  {t("ajustes.quitarDeMaquina")}
                </button>
              </p>
            ) : null}
          </>
        }
      >
        {(id) => (
          <input id={id} type="text" class="entrada-ancha" value={valor ?? ""} disabled={SOLO_LECTURA} autoFocus={nombre === "documentacion" && primeraVez} onInput={(e) => b.poner(nombre, (e.target as HTMLInputElement).value.trim() === "" ? null : (e.target as HTMLInputElement).value)} />
        )}
      </Campo>
    );
  };

  const subcarpeta = datos ? campoDe(datos, "subcarpetaTareas") : null;
  const idioma = datos ? campoDe(datos, "idioma") : null;

  return (
    <div class="pagina-ajustes pagina-equipo">
      <h2>{t(primeraVez ? "ajustes.equipo.primeraVez" : "ajustes.equipo")}</h2>
      <p>{t(primeraVez ? "ajustes.equipo.primeraVezTexto" : "ajustes.equipo.intro")}</p>
      {SIN_DATOS_REALES ? <NoDisponible /> : null}
      {ajustes.error ? <Aviso error={ajustes.error} /> : null}
      {ajustes.cargando && !datos && !SIN_DATOS_REALES ? <Cargando /> : null}
      {datos && disco ? (
        <>
          <EstadoDeMaquina a={datos} />
          {datos.campos
            .filter((c) => c.propioStudioPisa)
            .map((c) => (
              <p key={c.campo} class="aviso propio-studio-pisa" role="status">
                {t("ajustes.propioStudioPisa", { efectivo: c.efectivo ?? "", fuente: fuenteVisible(c.fuente), enMaquina: c.enMaquina ?? "" })}
              </p>
            ))}
          <form class="formulario-ajustes" onSubmit={(e) => e.preventDefault()}>
            {rutaDeTexto("documentacion", t("ajustes.campo.documentacion"))}
            {rutaDeTexto("carpetaDeRepos", t("ajustes.campo.carpetaDeRepos"))}
            <Campo
              nombre="subcarpetaTareas"
              etiqueta={t("ajustes.campo.subcarpetaTareas")}
              borrador={b}
              ayuda={
                <>
                  <p class="secundaria">{subcarpeta!.fuente === "por defecto" ? t("ajustes.ahoraPorDefecto", { valor: subcarpeta!.efectivo ?? "" }) : subcarpeta!.efectivo !== null ? t("ajustes.ahoraSeUsa", { valor: subcarpeta!.efectivo || "∅", fuente: fuenteVisible(subcarpeta!.fuente) }) : t("ajustes.ahoraNada")}</p>
                  <p>
                    <label>
                      <input type="checkbox" checked={b.valor("subcarpetaTareas") === ""} disabled={SOLO_LECTURA} onChange={(e) => b.poner("subcarpetaTareas", (e.target as HTMLInputElement).checked ? "" : null)} /> {t("ajustes.campo.sinSubcarpeta")}
                    </label>
                  </p>
                </>
              }
            >
              {(id) => <input id={id} type="text" class="entrada-ancha" value={b.valor("subcarpetaTareas") ?? ""} disabled={SOLO_LECTURA || b.valor("subcarpetaTareas") === ""} onInput={(e) => b.poner("subcarpetaTareas", (e.target as HTMLInputElement).value === "" ? null : (e.target as HTMLInputElement).value)} />}
            </Campo>
            <Campo
              nombre="idiomaPorDefecto"
              etiqueta={t("ajustes.campo.idiomaPorDefecto")}
              borrador={b}
              ayuda={<p class="secundaria">{t("ajustes.ahoraSeUsa", { valor: NOMBRE_DEL_IDIOMA[idioma!.efectivo === "en" ? "en" : "es"], fuente: fuenteVisible(idioma!.fuente) })}</p>}
            >
              {(id) => (
                <select id={id} value={b.valor("idiomaPorDefecto") ?? ""} disabled={SOLO_LECTURA} onChange={(e) => b.poner("idiomaPorDefecto", (e.target as HTMLSelectElement).value || null)}>
                  <option value="">{t("ajustes.sinElegir")}</option>
                  <option value="es">{NOMBRE_DEL_IDIOMA.es}</option>
                  <option value="en">{NOMBRE_DEL_IDIOMA.en}</option>
                </select>
              )}
            </Campo>
            <Campo nombre="presetPorDefecto" etiqueta={t("ajustes.campo.presetPorDefecto")} borrador={b}>
              {(id) => (
                <select id={id} value={b.valor("presetPorDefecto") ?? ""} disabled={SOLO_LECTURA} onChange={(e) => b.poner("presetPorDefecto", (e.target as HTMLSelectElement).value || null)}>
                  <option value="">{t("ajustes.sinElegir")}</option>
                  {presets.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
          </form>
          <Pie borrador={b} accion="equipo" argumentos={argumentosDeEquipo(b.cambios)} sinCambios={b.cuantos === 0} alAplicar={ajustes.recargar} />
          <EnvDeLosClientes clientes={datos.clientes} alAplicar={ajustes.recargar} />
          <Sesiones a={datos} />
        </>
      ) : null}
    </div>
  );
}
