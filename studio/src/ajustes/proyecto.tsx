// La página de un proyecto: lo que se guarda en su phase-gate.json (preset, idioma, lotes, política de commits,
// comandos de verificación, un PR por repo y la lista de repos) y, en machine.json, la ruta propia de cada repo
// en esta computadora. Es la única página con dos archivos: la vista previa muestra los dos diffs, cada uno con
// lo que es («viaja con la Documentación», «solo esta computadora»), y un solo Aplicar.
//
// Sin phase-gate.json, la página ofrece crearlo.

import { useEffect, useState } from "preact/hooks";
import type { Dispatch, StateUpdater } from "preact/hooks";

import type { AjustesDeProyecto } from "../../../src/studio/contrato.js";
import { Accion } from "../comun/accion";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { Tabla } from "../comun/tabla";
import { ruta } from "../datos";
import { NOMBRE_DEL_IDIOMA, t } from "../i18n/idioma";
import { origenDelPreset } from "../red/red";
import { useBorrador } from "./borrador";
import type { ControlDeBorrador } from "./borrador";
import { Campo, NoDisponible, Pie, SIN_DATOS_REALES, SOLO_LECTURA } from "./comunes";

// Las políticas de commits son identificadores: no se traducen.
const POLITICAS = ["agente-commitea-con-OK", "agente-propone", "auto", "ninguno"];
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

type Repo = { id: string; dir: string; rol: string };
type DiscoProyecto = {
  preset: string | null;
  idioma: string | null;
  lotes: boolean | null;
  commits: string | null;
  verificacion: string[] | null;
  prPorRepo: boolean | null;
  repos: Repo[];
  rutasPropias: Record<string, string>;
};

function discoDe(d: AjustesDeProyecto): DiscoProyecto | null {
  const a = d.archivo;
  if (!a) return null;
  return { preset: a.preset, idioma: a.idioma, lotes: a.lotes, commits: a.commits, verificacion: a.verificacion, prPorRepo: a.prPorRepo, repos: a.repos.map((r) => ({ id: r.id, dir: r.dir, rol: r.rol ?? "" })), rutasPropias: d.rutasPropias };
}

// Lo que se manda a la acción `proyecto`: solo lo cambiado. `null` quita la clave y vuelve a lo que dice el
// preset. Las rutas propias de un repo que se quita se quitan de machine.json si la persona lo pide.
export function argumentosDeProyecto(proyecto: string, c: Partial<DiscoProyecto>, d: DiscoProyecto, quitarRutas: boolean): Record<string, unknown> {
  const argumentos: Record<string, unknown> = { proyecto };
  if ("preset" in c) argumentos.preset = c.preset ?? null;
  if ("idioma" in c) argumentos.idioma = c.idioma ?? null;
  const reglas: Record<string, unknown> = {};
  if ("lotes" in c) reglas.lotes = c.lotes ?? null;
  if ("commits" in c) reglas.commits = c.commits ?? null;
  if ("verificacion" in c) reglas.verificacion = c.verificacion ?? null;
  if (Object.keys(reglas).length) argumentos.reglas = reglas;
  if ("prPorRepo" in c) argumentos.fase5 = { prPorRepo: c.prPorRepo ?? null };
  const repos = c.repos ?? d.repos;
  if (c.repos) argumentos.repos = c.repos.map((r) => ({ id: r.id, dir: r.dir, rol: r.rol.trim() === "" ? null : r.rol }));

  const antes = d.rutasPropias;
  const despues = c.rutasPropias ?? antes;
  const ids = new Set(repos.map((r) => r.id));
  const propias: Record<string, string | null> = {};
  for (const id of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
    if (!ids.has(id)) {
      if (antes[id] !== undefined && quitarRutas) propias[id] = null;
      continue;
    }
    const nuevo = despues[id];
    if (nuevo === undefined || nuevo === "") {
      if (antes[id] !== undefined) propias[id] = null;
    } else if (nuevo !== antes[id]) propias[id] = nuevo;
  }
  if (Object.keys(propias).length) argumentos.rutasPropias = propias;
  return argumentos;
}

const triEstado = (v: boolean | null): string => (v === null ? "" : v ? "si" : "no");
const deTriEstado = (s: string): boolean | null => (s === "" ? null : s === "si");

// La lista de repos: una fila por repo, con su carpeta, su rol y su ruta propia en esta computadora, y un
// formulario para agregar uno. Lo que se cambia va al borrador; nada se escribe hasta Aplicar.
function EditorDeRepos({ b, quitarRutas, ponerQuitarRutas }: { b: ControlDeBorrador<DiscoProyecto>; quitarRutas: boolean; ponerQuitarRutas: Dispatch<StateUpdater<boolean>> }) {
  const repos = b.valor("repos");
  const rutas = b.valor("rutasPropias");
  const original = b.delDisco("repos");
  const rutasOriginales = b.delDisco("rutasPropias");
  const [nuevo, setNuevo] = useState({ id: "", dir: "", rol: "", ruta: "" });
  const [problema, setProblema] = useState<string | null>(null);

  const cambiarRepo = (id: string, parcial: Partial<Repo>): void => b.poner("repos", repos.map((r) => (r.id === id ? { ...r, ...parcial } : r)));
  const cambiarRuta = (id: string, valor: string): void => {
    const siguiente = { ...rutas };
    if (valor.trim() === "") delete siguiente[id];
    else siguiente[id] = valor;
    b.poner("rutasPropias", siguiente);
  };
  const quitados = original.filter((r) => !repos.some((x) => x.id === r.id));
  const quitadosConRuta = quitados.filter((r) => rutasOriginales[r.id] !== undefined);

  const agregar = (): void => {
    const id = nuevo.id.trim();
    const dir = nuevo.dir.trim();
    if (!ID.test(id)) return setProblema(t("ajustes.repos.idInvalido"));
    if (repos.some((r) => r.id === id)) return setProblema(t("ajustes.repos.idRepetido"));
    if (dir === "") return setProblema(t("ajustes.repos.faltaCarpeta"));
    setProblema(null);
    b.poner("repos", [...repos, { id, dir, rol: nuevo.rol.trim() }]);
    if (nuevo.ruta.trim() !== "") b.poner("rutasPropias", { ...rutas, [id]: nuevo.ruta.trim() });
    setNuevo({ id: "", dir: "", rol: "", ruta: "" });
  };

  return (
    <>
      {repos.length === 0 ? (
        <p class="secundaria">{t("red.sinRepos")}</p>
      ) : (
        <Tabla
          titulo={t("ajustes.repos.tabla")}
          columnas={[t("ajustes.repos.colId"), t("ajustes.repos.colCarpeta"), t("ajustes.repos.colRol"), t("ajustes.repos.colRuta"), t("ajustes.repos.colAcciones")]}
          filas={repos.map((r) => ({
            clave: r.id,
            celdas: [
              <code>{r.id}</code>,
              <input type="text" value={r.dir} disabled={SOLO_LECTURA} aria-label={t("ajustes.repos.carpetaDe", { id: r.id })} onInput={(e) => cambiarRepo(r.id, { dir: (e.target as HTMLInputElement).value })} />,
              <input type="text" value={r.rol} disabled={SOLO_LECTURA} aria-label={t("ajustes.repos.rolDe", { id: r.id })} onInput={(e) => cambiarRepo(r.id, { rol: (e.target as HTMLInputElement).value })} />,
              <input type="text" value={rutas[r.id] ?? ""} disabled={SOLO_LECTURA} aria-label={t("ajustes.repos.rutaDe", { id: r.id })} onInput={(e) => cambiarRuta(r.id, (e.target as HTMLInputElement).value)} />,
              <button type="button" class="boton" disabled={SOLO_LECTURA} onClick={() => b.poner("repos", repos.filter((x) => x.id !== r.id))}>
                {t("ajustes.repos.quitar", { id: r.id })}
              </button>,
            ],
          }))}
        />
      )}
      {quitadosConRuta.length ? (
        <p>
          <label>
            <input type="checkbox" checked={quitarRutas} onChange={(e) => ponerQuitarRutas((e.target as HTMLInputElement).checked)} /> {t("ajustes.repos.quitarRuta")}
          </label>
        </p>
      ) : null}
      {SOLO_LECTURA ? null : (
        <fieldset class="agregar-repo">
          <legend>{t("ajustes.repos.agregar")}</legend>
          <p>
            <label>
              {t("ajustes.repos.nuevoId")} <input type="text" value={nuevo.id} onInput={(e) => setNuevo({ ...nuevo, id: (e.target as HTMLInputElement).value })} />
            </label>
          </p>
          <p>
            <label>
              {t("ajustes.repos.nuevaCarpeta")} <input type="text" value={nuevo.dir} onInput={(e) => setNuevo({ ...nuevo, dir: (e.target as HTMLInputElement).value })} />
            </label>
          </p>
          <p>
            <label>
              {t("ajustes.repos.nuevoRol")} <input type="text" value={nuevo.rol} onInput={(e) => setNuevo({ ...nuevo, rol: (e.target as HTMLInputElement).value })} />
            </label>
          </p>
          <p>
            <label>
              {t("ajustes.repos.nuevaRuta")} <input type="text" class="entrada-ancha" value={nuevo.ruta} onInput={(e) => setNuevo({ ...nuevo, ruta: (e.target as HTMLInputElement).value })} />
            </label>
          </p>
          {problema ? (
            <p class="aviso aviso-error" role="alert">
              {problema}
            </p>
          ) : null}
          <button type="button" class="boton" onClick={agregar}>
            {t("ajustes.repos.agregarALaLista")}
          </button>
        </fieldset>
      )}
    </>
  );
}

// Con `creado`, el archivo ya existe: la sección se queda para que se lea el «Hecho», y el resto de la página pasa
// a editarlo.
function CrearManifiesto({ proyecto, presets, creado, alAplicar }: { proyecto: string; presets: string[]; creado: boolean; alAplicar: () => void }) {
  const [preset, setPreset] = useState("software-replica");
  return (
    <section class="crear-manifiesto" aria-label={t("ajustes.proyecto.crear")}>
      {creado ? null : (
        <>
          <p>{t("ajustes.proyecto.sinManifiesto")}</p>
          <p>
            <label>
              {t("ajustes.proyecto.presetNuevo")}{" "}
              <select value={preset} disabled={SOLO_LECTURA} onChange={(e) => setPreset((e.target as HTMLSelectElement).value)}>
                {presets.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </p>
        </>
      )}
      <Accion etiqueta={t("ajustes.proyecto.crear")} accion="crear-manifiesto" argumentos={{ proyecto, preset }} alAplicar={alAplicar} deshabilitado={creado} />
    </section>
  );
}

export function PaginaProyecto({ proyecto, presets }: { proyecto: string; presets: string[] }) {
  const recurso = useRecurso<AjustesDeProyecto>(SIN_DATOS_REALES ? null : `/api/ajustes/proyectos/${ruta(proyecto)}`, ["config", "equipo"], (_t, d) => !d.p || d.p === proyecto);
  const datos = recurso.datos;
  const disco = datos ? discoDe(datos) : null;
  const b = useBorrador<DiscoProyecto>(`proyecto:${proyecto}`, disco);
  const [quitarRutas, ponerQuitarRutas] = useState(true);
  // Un proyecto que estaba sin phase-gate.json y ya lo tiene: la sección de crearlo se queda (con su «Hecho»).
  const [seCreo, setSeCreo] = useState(false);
  useEffect(() => {
    if (datos?.manifiesto.estado === "ausente") setSeCreo(true);
  }, [datos]);
  const efectivo = datos?.efectivo ?? null;

  return (
    <div class="pagina-ajustes pagina-proyecto">
      <h2>{t("ajustes.proyecto.titulo", { proyecto })}</h2>
      <p>{t("ajustes.proyecto.intro")}</p>
      {SIN_DATOS_REALES ? <NoDisponible /> : null}
      {recurso.error ? <Aviso error={recurso.error} /> : null}
      {recurso.cargando && !datos && !SIN_DATOS_REALES ? <Cargando /> : null}
      {datos?.manifiesto.estado === "ausente" || (seCreo && datos?.manifiesto.estado === "valido") ? <CrearManifiesto proyecto={proyecto} presets={presets} creado={datos.manifiesto.estado === "valido"} alAplicar={recurso.recargar} /> : null}
      {datos?.manifiesto.estado === "invalido" ? (
        <>
          <p class="aviso aviso-error" role="alert">
            {t("ajustes.proyecto.invalido")}
          </p>
          {datos.manifiesto.error ? <p class="detalle-error">{datos.manifiesto.error}</p> : null}
        </>
      ) : null}
      {datos && disco ? (
        <>
          <form class="formulario-ajustes" onSubmit={(e) => e.preventDefault()}>
            <Campo nombre="preset" etiqueta={t("ajustes.campo.preset")} borrador={b} ayuda={efectivo ? <p class="secundaria">{t("ajustes.ahoraSeUsa", { valor: efectivo.preset, fuente: origenDelPreset(efectivo.origenDelPreset) })}</p> : null}>
              {(id) => (
                <select id={id} value={b.valor("preset") ?? ""} disabled={SOLO_LECTURA} onChange={(e) => b.poner("preset", (e.target as HTMLSelectElement).value || null)}>
                  <option value="">{t("ajustes.sinElegir")}</option>
                  {presets.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo nombre="idioma" etiqueta={t("ajustes.campo.idioma")} borrador={b}>
              {(id) => (
                <select id={id} value={b.valor("idioma") ?? ""} disabled={SOLO_LECTURA} onChange={(e) => b.poner("idioma", (e.target as HTMLSelectElement).value || null)}>
                  <option value="">{t("ajustes.sinElegir")}</option>
                  <option value="es">{NOMBRE_DEL_IDIOMA.es}</option>
                  <option value="en">{NOMBRE_DEL_IDIOMA.en}</option>
                </select>
              )}
            </Campo>
            <Campo nombre="lotes" etiqueta={t("ajustes.campo.lotes")} borrador={b}>
              {(id) => (
                <select id={id} value={triEstado(b.valor("lotes"))} disabled={SOLO_LECTURA} onChange={(e) => b.poner("lotes", deTriEstado((e.target as HTMLSelectElement).value))}>
                  <option value="">{efectivo ? t("ajustes.loDecideElPreset", { valor: t(efectivo.lotes ? "comun.si" : "comun.no") }) : t("ajustes.sinElegir")}</option>
                  <option value="si">{t("ajustes.lotes.si")}</option>
                  <option value="no">{t("ajustes.lotes.no")}</option>
                </select>
              )}
            </Campo>
            <Campo nombre="commits" etiqueta={t("ajustes.campo.commits")} borrador={b}>
              {(id) => (
                <select id={id} value={b.valor("commits") ?? ""} disabled={SOLO_LECTURA} onChange={(e) => b.poner("commits", (e.target as HTMLSelectElement).value || null)}>
                  <option value="">{efectivo ? t("ajustes.loDecideElPreset", { valor: efectivo.commits }) : t("ajustes.sinElegir")}</option>
                  {POLITICAS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <Campo nombre="verificacion" etiqueta={t("ajustes.campo.verificacion")} borrador={b}>
              {(id) => (
                <textarea
                  id={id}
                  rows={3}
                  class="entrada-ancha"
                  disabled={SOLO_LECTURA}
                  value={(b.valor("verificacion") ?? []).join("\n")}
                  onInput={(e) => {
                    const lineas = (e.target as HTMLTextAreaElement).value.split("\n").map((l) => l.trim()).filter(Boolean);
                    b.poner("verificacion", lineas.length ? lineas : null);
                  }}
                />
              )}
            </Campo>
            <Campo nombre="prPorRepo" etiqueta={t("ajustes.campo.prPorRepo")} borrador={b}>
              {(id) => (
                <select id={id} value={triEstado(b.valor("prPorRepo"))} disabled={SOLO_LECTURA} onChange={(e) => b.poner("prPorRepo", deTriEstado((e.target as HTMLSelectElement).value))}>
                  <option value="">{t("ajustes.sinElegir")}</option>
                  <option value="si">{t("ajustes.prPorRepo.si")}</option>
                  <option value="no">{t("ajustes.prPorRepo.no")}</option>
                </select>
              )}
            </Campo>
            <Campo nombre="repos" etiqueta={t("ajustes.campo.repos")} borrador={b} grupo>
              <EditorDeRepos b={b} quitarRutas={quitarRutas} ponerQuitarRutas={ponerQuitarRutas} />
            </Campo>
            {b.cambiado("rutasPropias") ? (
              <Campo nombre="rutasPropias" etiqueta={t("ajustes.repos.colRuta")} borrador={b} grupo>
                <span />
              </Campo>
            ) : null}
          </form>
          <Pie
            borrador={b}
            accion="proyecto"
            argumentos={argumentosDeProyecto(proyecto, b.cambios, disco, quitarRutas)}
            sinCambios={Object.keys(argumentosDeProyecto(proyecto, b.cambios, disco, quitarRutas)).length <= 1}
            alAplicar={recurso.recargar}
          />
        </>
      ) : null}
    </div>
  );
}
