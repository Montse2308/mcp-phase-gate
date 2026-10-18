// El idioma de la interfaz (§8.6 del plan) y la función que dice cada texto en él. Sin librerías: dos
// diccionarios planos, Intl.PluralRules para los plurales e Intl.DateTimeFormat para las fechas.
//
// De dónde sale, por orden:
//   1. `#?lang=en` (o `lang=es`) en el enlace: se puede compartir, y la elección se recuerda;
//   2. la elección guardada en localStorage (el selector ES / EN de la barra);
//   3. el primero de navigator.languages que sea español o inglés;
//   4. inglés.
// localStorage puede fallar (ventana privada, almacenamiento bloqueado): entonces la elección solo vale para
// esta visita. `<html lang>` sigue siempre al idioma, para que un lector de pantalla pronuncie bien.
//
// Es independiente del idioma de cada proyecto: el contenido de los documentos se enseña tal como está
// escrito, y lo que dice el servidor llega en el idioma de la interfaz (datos.ts manda la cabecera).

import { useEffect, useState } from "preact/hooks";

import { en } from "./en";
import { es } from "./es";
import type { Clave } from "./es";

export type IdiomaUi = "es" | "en";
export const IDIOMAS_UI: readonly IdiomaUi[] = ["es", "en"];
// El nombre de cada idioma en sí mismo: no se traduce.
export const NOMBRE_DEL_IDIOMA: Record<IdiomaUi, string> = { es: "Español", en: "English" };

const DICCIONARIOS: Record<IdiomaUi, Record<Clave, string>> = { es, en };
const CLAVE = "pg-idioma";

function esIdiomaUi(valor: unknown): valor is IdiomaUi {
  return valor === "es" || valor === "en";
}

function guardado(): IdiomaUi | null {
  try {
    const valor = window.localStorage.getItem(CLAVE);
    return esIdiomaUi(valor) ? valor : null;
  } catch {
    return null;
  }
}

function guardar(idioma: IdiomaUi): void {
  try {
    window.localStorage.setItem(CLAVE, idioma);
  } catch {
    // sin almacenamiento, la elección dura lo que la página
  }
}

function consultaDelHash(): URLSearchParams | null {
  const hash = window.location.hash;
  const corte = hash.indexOf("?");
  return corte === -1 ? null : new URLSearchParams(hash.slice(corte + 1));
}

// `lang` del enlace: exactamente "es" o "en"; otro valor no cuenta.
function delEnlace(): IdiomaUi | null {
  const valor = consultaDelHash()?.get("lang");
  return esIdiomaUi(valor) ? valor : null;
}

// "es-MX", "en-GB"… -> "es" o "en"; el primero de la lista que sea uno de los dos.
function delNavegador(): IdiomaUi | null {
  const lista = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const etiqueta of lista) {
    const base = (etiqueta ?? "").trim().toLowerCase().split(/[-_]/)[0];
    if (esIdiomaUi(base)) return base;
  }
  return null;
}

let actual: IdiomaUi = delEnlace() ?? guardado() ?? delNavegador() ?? "en";
const suscritos = new Set<(i: IdiomaUi) => void>();

function aplicar(idioma: IdiomaUi): void {
  actual = idioma;
  document.documentElement.lang = idioma;
  for (const s of suscritos) s(idioma);
}

export function iniciarIdioma(): void {
  const delHash = delEnlace();
  if (delHash) guardar(delHash);
  aplicar(actual);
  window.addEventListener("hashchange", () => {
    const nuevo = delEnlace();
    if (!nuevo) return;
    guardar(nuevo);
    if (nuevo !== actual) aplicar(nuevo);
  });
}

// El selector de la barra. Si el enlace lleva `lang`, se reescribe (sin navegar), para que al recargar no
// vuelva el idioma de antes.
export function cambiarIdioma(nuevo: IdiomaUi): void {
  guardar(nuevo);
  const consulta = consultaDelHash();
  if (consulta?.has("lang")) {
    consulta.set("lang", nuevo);
    const hash = window.location.hash;
    window.history.replaceState(window.history.state, "", `${hash.slice(0, hash.indexOf("?"))}?${consulta.toString()}`);
  }
  if (nuevo !== actual) aplicar(nuevo);
}

export function idiomaActual(): IdiomaUi {
  return actual;
}

export function useIdioma(): IdiomaUi {
  const [idioma, setIdioma] = useState(actual);
  useEffect(() => {
    suscritos.add(setIdioma);
    // Pudo cambiar entre el render y la suscripción.
    if (idioma !== actual) setIdioma(actual);
    return () => {
      suscritos.delete(setIdioma);
    };
  }, []);
  return idioma;
}

// ─── Los textos ─────────────────────────────────────────────────────────────
export type Parametros = Record<string, string | number>;

function rellenar(texto: string, parametros?: Parametros): string {
  if (!parametros) return texto;
  return texto.replace(/\{(\w+)\}/g, (hueco, nombre: string) => (Object.prototype.hasOwnProperty.call(parametros, nombre) ? String(parametros[nombre]) : hueco));
}

// El texto de una clave en el idioma de la interfaz, con sus huecos llenos.
export function t(clave: Clave, parametros?: Parametros): string {
  return rellenar(DICCIONARIOS[actual][clave] ?? es[clave], parametros);
}

// Las claves con plural: las que tienen su forma `.other`.
type BaseDePlural<K> = K extends `${infer Base}.other` ? Base : never;
export type ClavePlural = BaseDePlural<Clave>;

const reglasDePlural = new Map<IdiomaUi, Intl.PluralRules>();

// El texto de `n` cosas: la forma que diga Intl.PluralRules en el idioma de la interfaz (`.one`, `.other`…),
// o `.other` si el diccionario no tiene esa. `{n}` se llena solo.
export function tn(base: ClavePlural, n: number, parametros?: Parametros): string {
  let reglas = reglasDePlural.get(actual);
  if (!reglas) {
    reglas = new Intl.PluralRules(actual);
    reglasDePlural.set(actual, reglas);
  }
  const forma = `${base}.${reglas.select(n)}`;
  const clave = (Object.prototype.hasOwnProperty.call(es, forma) ? forma : `${base}.other`) as Clave;
  return t(clave, { n, ...parametros });
}

// ─── Las fechas ─────────────────────────────────────────────────────────────
// Una fecha para la interfaz: `texto` en la forma corta de siempre, "2026-03-02 10:00" en la hora local de
// quien mira (un día suelto, "2026-03-02", queda igual), y `completa`, la fecha dicha en el idioma de la
// interfaz ("lunes, 2 de marzo de 2026, 10:00" / "Monday, March 2, 2026 at 10:00 AM"), para el title.
export function fechaLegible(fecha: string): { texto: string; completa: string } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const dia = new Date(`${fecha}T00:00:00Z`);
    if (Number.isNaN(dia.getTime())) return { texto: fecha, completa: fecha };
    return { texto: fecha, completa: new Intl.DateTimeFormat(actual, { dateStyle: "full", timeZone: "UTC" }).format(dia) };
  }
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return { texto: fecha, completa: fecha };
  const partes = new Intl.DateTimeFormat(actual, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const parte = (tipo: Intl.DateTimeFormatPartTypes): string => partes.find((p) => p.type === tipo)?.value ?? "";
  return {
    texto: `${parte("year")}-${parte("month")}-${parte("day")} ${parte("hour")}:${parte("minute")}`,
    completa: new Intl.DateTimeFormat(actual, { dateStyle: "full", timeStyle: "short" }).format(d),
  };
}

// ─── El sitio estático ──────────────────────────────────────────────────────
// La carpeta de los datos exportados para un idioma. Hoy el export escribe un solo conjunto en datos/; cuando
// escriba datos/es y datos/en (lote L08), esta función devolverá `./datos/${idioma}/` y el cambio de idioma
// cambiará también de demo.
export function carpetaDeDatos(_idioma: IdiomaUi): string {
  return "./datos/";
}
