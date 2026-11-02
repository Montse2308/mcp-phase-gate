// Navegación por hash (#/tablero/P/t?x=1, #/ajustes/proyecto/P): funciona igual servida en la raíz o bajo un subdirectorio, y
// nunca pide al servidor una ruta que no existe.

// Los hashes no se traducen (#/red, #/tablero…): un enlace sirve igual en los dos idiomas. El nombre de
// cada vista sale del diccionario (`vista.<id>`).

import { useEffect, useMemo, useState } from "preact/hooks";

export type Vista = "red" | "tablero" | "taller" | "vigia" | "bitacora" | "ajustes";
export const VISTAS: Vista[] = ["red", "tablero", "taller", "vigia", "bitacora", "ajustes"];

export type Ruta = { vista: Vista; partes: string[]; consulta: URLSearchParams };

export function leerRuta(hash: string = window.location.hash): Ruta {
  const sinAlmohadilla = hash.replace(/^#/, "");
  const corte = sinAlmohadilla.indexOf("?");
  const camino = corte === -1 ? sinAlmohadilla : sinAlmohadilla.slice(0, corte);
  const consulta = new URLSearchParams(corte === -1 ? "" : sinAlmohadilla.slice(corte + 1));
  const [primera = "", ...resto] = camino.split("/").filter(Boolean);
  const vista = VISTAS.find((v) => v === primera) ?? "red";
  const partes = resto.map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  return { vista, partes, consulta };
}

export function enlace(vista: Vista, ...partes: string[]): string {
  return `#/${[vista, ...partes.map((p) => encodeURIComponent(p))].join("/")}`;
}

// El hash de una ruta, con su consulta.
export function hashDe(r: Ruta): string {
  const consulta = r.consulta.toString();
  return `${enlace(r.vista, ...r.partes)}${consulta ? `?${consulta}` : ""}`;
}

// El proyecto y la tarea que nombra una ruta. El Tablero y la Bitácora los llevan en el camino; el Taller, el
// proyecto en el camino y la tarea en la consulta (?tarea=); Ajustes, el proyecto detrás de «proyecto».
export type Referencia = { proyecto: string | null; tarea: string | null };

export function referenciaDe(r: Ruta): Referencia {
  switch (r.vista) {
    case "tablero":
    case "bitacora":
      return { proyecto: r.partes[0] ?? null, tarea: r.partes[1] ?? null };
    case "taller":
      return { proyecto: r.partes[0] ?? null, tarea: r.consulta.get("tarea") };
    case "ajustes":
      return { proyecto: r.partes[0] === "proyecto" ? (r.partes[1] ?? null) : null, tarea: null };
    default:
      return { proyecto: null, tarea: null };
  }
}

// La misma ruta con otro proyecto y otra tarea, en los mismos sitios.
export function conReferencia(r: Ruta, ref: Referencia): Ruta {
  const partes = [...r.partes];
  const consulta = new URLSearchParams(r.consulta);
  switch (r.vista) {
    case "tablero":
    case "bitacora":
      if (ref.proyecto !== null && partes.length > 0) partes[0] = ref.proyecto;
      if (ref.tarea !== null && partes.length > 1) partes[1] = ref.tarea;
      break;
    case "taller":
      if (ref.proyecto !== null && partes.length > 0) partes[0] = ref.proyecto;
      if (ref.tarea !== null && consulta.has("tarea")) consulta.set("tarea", ref.tarea);
      break;
    case "ajustes":
      if (ref.proyecto !== null && partes[0] === "proyecto" && partes.length > 1) partes[1] = ref.proyecto;
      break;
  }
  return { vista: r.vista, partes, consulta };
}

export function useRuta(): Ruta {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const cambiar = (): void => setHash(window.location.hash);
    window.addEventListener("hashchange", cambiar);
    // El efecto corre después del primer render: un hashchange de ese hueco no se oyó, así que se relee.
    // Si el hash no cambió, no se vuelve a pintar.
    cambiar();
    return () => window.removeEventListener("hashchange", cambiar);
  }, []);
  return useMemo(() => leerRuta(hash), [hash]);
}
