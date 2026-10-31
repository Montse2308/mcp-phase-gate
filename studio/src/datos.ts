// El acceso a la API del Studio. Todas las rutas son relativas a la página ("./api/…"), así que el mismo
// build funciona en 127.0.0.1:<puerto>/ y bajo un subdirectorio.
//
// El modo lo fija config.js antes de cargar la aplicación: "vivo" (`ui`), "demo" (`ui --demo`) o
// "estatico" (el sitio exportado, sin servidor).
//
// Toda petición a la API lleva el idioma de la interfaz en X-Phase-Gate-Lang: el servidor responde en él
// (describeEstado, los hallazgos, los resúmenes de las acciones, los errores). Es una cabecera propia en un
// fetch del mismo origen: no pide preflight ni toca la seguridad del Studio.

import { carpetaDeDatos, idiomaActual, t } from "./i18n/idioma";
import type { IdiomaUi } from "./i18n/idioma";
import { conReferencia, hashDe, referenciaDe } from "./rutas";
import type { Ruta } from "./rutas";

declare global {
  interface Window {
    PG_MODO?: "vivo" | "demo" | "estatico";
    // La banda tal como la escribe quien sirve la página (en español).
    PG_BANDA?: string;
    // `ui --demo`: la carpeta de la demo, para decir la banda en el idioma de la interfaz.
    PG_DEMO_RAIZ?: string;
    // El sitio exportado: qué banda es, para decirla en el idioma de la interfaz (si el export la declara).
    PG_BANDA_CLAVE?: "estatico-demo" | "estatico-datos";
  }
}

export type ModoApp = "vivo" | "demo" | "estatico";
export const MODO: ModoApp = window.PG_MODO ?? "vivo";
// El texto de la banda de la demo, en el idioma de la interfaz: con la carpeta de `ui --demo` o la clave del
// export, el del diccionario; si no, el que mandó quien sirve la página; si no, uno genérico. La carpeta de
// `ui --demo` no va en el texto (a 390 px ocupaba la banda entera): va en el título de la banda.
export function textoDeLaBanda(): string {
  if (window.PG_DEMO_RAIZ) return t("banda.demo");
  if (window.PG_BANDA_CLAVE === "estatico-demo") return t("banda.estaticoDemo");
  if (window.PG_BANDA_CLAVE === "estatico-datos") return t("banda.estaticoDatos");
  return window.PG_BANDA ?? t("banda.demo");
}

// Lo que dice la banda al pasar el puntero: en `ui --demo`, dónde está la demo.
export function ayudaDeLaBanda(): string | undefined {
  return window.PG_DEMO_RAIZ ? t("banda.demoEn", { raiz: window.PG_DEMO_RAIZ }) : undefined;
}

// La portada del sitio, con su URL absoluta: cualquier `ui --export-static` sin datos reales muestra la misma banda,
// y en otro sitio un enlace relativo se rompería. La exportación de datos propios no es una demo: no lleva el enlace.
export function enlaceDeLaPortada(): string | null {
  if (window.PG_BANDA_CLAVE === "estatico-datos") return null;
  return idiomaActual() === "es" ? "https://montse2308.github.io/mcp-phase-gate/es/" : "https://montse2308.github.io/mcp-phase-gate/";
}

export class ErrorDeApi extends Error {
  constructor(
    readonly estado: number,
    message: string
  ) {
    super(message);
  }
}

async function respuesta<T>(r: Response): Promise<T> {
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const texto = cuerpo && typeof cuerpo === "object" && "error" in cuerpo ? String((cuerpo as { error: unknown }).error) : t("error.estado", { estado: r.status });
    throw new ErrorDeApi(r.status, r.status === 401 ? t("error.sesion") : texto);
  }
  return cuerpo as T;
}

export async function get<T>(ruta: string): Promise<T> {
  if (MODO === "estatico") return getEstatico<T>(ruta);
  return respuesta<T>(await fetch(`.${ruta}`, { credentials: "same-origin", headers: { Accept: "application/json", "X-Phase-Gate-Lang": idiomaActual() } }));
}

// En el sitio exportado (`ui --export-static`) no hay API: datos/indice.json dice, para cada ruta exacta que
// pide el frontend, en qué archivo de datos/ está su respuesta y con qué código. Rutas relativas a la página,
// así que funciona igual bajo un subdirectorio (GitHub Pages). La carpeta depende del idioma de la interfaz
// (carpetaDeDatos): datos/es/ o datos/en/.
type Indice = { rutas: Record<string, { archivo: string; estado: number }> };
const indices = new Map<string, Promise<Indice["rutas"]>>();

async function getEstatico<T>(ruta: string, idioma: IdiomaUi = idiomaActual()): Promise<T> {
  const carpeta = carpetaDeDatos(idioma);
  let indice = indices.get(carpeta);
  if (!indice) {
    indice = fetch(`${carpeta}indice.json`).then(async (r) => {
      if (!r.ok) throw new ErrorDeApi(r.status, t("estatico.indice"));
      return ((await r.json()) as Indice).rutas;
    });
    indices.set(carpeta, indice);
  }
  let rutas: Indice["rutas"];
  try {
    rutas = await indice;
  } catch (error) {
    indices.delete(carpeta); // para que se pueda reintentar
    throw error;
  }
  const entrada = Object.prototype.hasOwnProperty.call(rutas, ruta) ? rutas[ruta] : undefined;
  if (!entrada) throw new ErrorDeApi(404, t("estatico.fueraDelExport"));
  const r = await fetch(`${carpeta}${entrada.archivo}`);
  if (!r.ok) throw new ErrorDeApi(r.status, t("estatico.fueraDelExport"));
  const cuerpo = (await r.json()) as unknown;
  if (entrada.estado !== 200) {
    throw new ErrorDeApi(entrada.estado, cuerpo && typeof cuerpo === "object" && "error" in cuerpo ? String((cuerpo as { error: unknown }).error) : t("error.estado", { estado: entrada.estado }));
  }
  return cuerpo as T;
}

// En la demo estática, los nombres de los proyectos y de las tareas cambian con el idioma (TIENDA ↔ SHOP,
// envio-gratis ↔ free-shipping): son dos demos con la misma historia, y el índice de cada una lista sus proyectos
// y sus tareas en el mismo orden. Un nombre que ya está en el otro conjunto (el export de una Documentación, igual
// en los dos idiomas) se queda como está.
function equivalente(nombre: string, aqui: string[], alli: string[]): string | null {
  if (alli.includes(nombre)) return nombre;
  const i = aqui.indexOf(nombre);
  return i !== -1 && aqui.length === alli.length ? alli[i]! : null;
}

// El hash de la ruta `r` al pasar del idioma `de` al idioma `a`: la misma ruta con el proyecto y la tarea en su
// nombre equivalente, o la Red si alguno no lo tiene. Una ruta sin proyecto ni tarea queda como está.
export async function hashEnElIdioma(r: Ruta, de: IdiomaUi, a: IdiomaUi): Promise<string> {
  const ref = referenciaDe(r);
  if (ref.proyecto === null) return hashDe(r);
  const consulta = new URLSearchParams();
  if (r.consulta.has("lang")) consulta.set("lang", a);
  const aLaRed = hashDe({ vista: "red", partes: [], consulta });
  const proyectos = async (idioma: IdiomaUi) => (await getEstatico<{ proyectos: { nombre: string }[] }>("/api/proyectos", idioma)).proyectos.map((p) => p.nombre);
  const tareas = async (idioma: IdiomaUi, proyecto: string) => (await getEstatico<{ tareas: { tarea: string }[] }>(`/api/proyectos/${ruta(proyecto)}/tareas`, idioma)).tareas.map((x) => x.tarea);

  const proyecto = equivalente(ref.proyecto, await proyectos(de), await proyectos(a));
  if (proyecto === null) return aLaRed;
  let tarea = ref.tarea;
  if (tarea !== null) {
    tarea = equivalente(tarea, await tareas(de, ref.proyecto), await tareas(a, proyecto));
    if (tarea === null) return aLaRed;
  }
  const nueva = conReferencia(r, { proyecto, tarea });
  if (nueva.consulta.has("lang")) nueva.consulta.set("lang", a);
  return hashDe(nueva);
}

// Toda escritura lleva X-Phase-Gate: 1. El servidor la exige, y obliga a un preflight que nunca concede. Y,
// como toda petición, el idioma de la interfaz.
export async function post<T>(ruta: string, cuerpo: unknown): Promise<T> {
  return respuesta<T>(
    await fetch(`.${ruta}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Phase-Gate": "1", "X-Phase-Gate-Lang": idiomaActual() },
      body: JSON.stringify(cuerpo),
    })
  );
}

// Los segmentos de una ruta de la API, codificados una vez.
export function ruta(...partes: (string | number)[]): string {
  return partes.map((p) => encodeURIComponent(String(p))).join("/");
}
