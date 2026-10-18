// Navegación por hash (#/tablero/P/t?x=1): funciona igual servida en la raíz o bajo un subdirectorio, y
// nunca pide al servidor una ruta que no existe.

// Los hashes no se traducen (#/red, #/tablero…): un enlace sirve igual en los dos idiomas. El nombre de
// cada vista sale del diccionario (`vista.<id>`).

import { useEffect, useState } from "preact/hooks";

export type Vista = "red" | "tablero" | "taller" | "vigia" | "bitacora";
export const VISTAS: Vista[] = ["red", "tablero", "taller", "vigia", "bitacora"];

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

export function useRuta(): Ruta {
  const [ruta, setRuta] = useState(leerRuta());
  useEffect(() => {
    const cambiar = (): void => setRuta(leerRuta());
    window.addEventListener("hashchange", cambiar);
    return () => window.removeEventListener("hashchange", cambiar);
  }, []);
  return ruta;
}
