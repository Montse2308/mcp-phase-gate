// Los eventos en vivo: una sola conexión SSE para toda la página, y cada vista se suscribe a los tipos que
// le importan. EventSource se reconecta solo; al reconectar se avisa "reconexion" para recargar la vista
// entera, porque mientras estuvo caída pudo cambiar cualquier cosa. En el sitio estático no hay SSE.
//
// El SSE no lleva el idioma de la interfaz: sus eventos solo dicen qué cambió (tipo, proyecto, tarea), sin
// textos; lo que se enseña lo trae después la recarga, que sí lo lleva (datos.ts).

import { useEffect, useRef } from "preact/hooks";

import { MODO } from "./datos";

export type TipoDeEvento = "documento" | "recibo" | "config" | "prompts" | "sesiones" | "punteros" | "reconexion";
type Oyente = (tipo: TipoDeEvento, datos: Record<string, string>) => void;

const oyentes = new Set<Oyente>();
let fuente: EventSource | null = null;

const TIPOS: TipoDeEvento[] = ["documento", "recibo", "config", "prompts", "sesiones", "punteros"];

function abrir(): void {
  if (fuente || MODO === "estatico" || typeof EventSource === "undefined") return;
  fuente = new EventSource("./api/eventos");
  let caida = false;
  fuente.onerror = () => {
    caida = true;
  };
  fuente.onopen = () => {
    if (caida) for (const o of oyentes) o("reconexion", {});
    caida = false;
  };
  for (const tipo of TIPOS) {
    fuente.addEventListener(tipo, (evento) => {
      let datos: Record<string, string> = {};
      try {
        datos = JSON.parse((evento as MessageEvent<string>).data) as Record<string, string>;
      } catch {
        datos = {};
      }
      for (const o of oyentes) o(tipo, datos);
    });
  }
}

// Llama a `alLlegar` con los eventos de esos tipos (y con "reconexion"), agrupados: varios seguidos en
// 250 ms se juntan en una sola llamada, con el último.
export function useEventos(tipos: TipoDeEvento[], alLlegar: (tipo: TipoDeEvento, datos: Record<string, string>) => void): void {
  const ultimo = useRef(alLlegar);
  ultimo.current = alLlegar;
  const clave = tipos.join(",");
  useEffect(() => {
    abrir();
    let espera: number | undefined;
    const oyente: Oyente = (tipo, datos) => {
      if (tipo !== "reconexion" && !tipos.includes(tipo)) return;
      window.clearTimeout(espera);
      espera = window.setTimeout(() => ultimo.current(tipo, datos), 250);
    };
    oyentes.add(oyente);
    return () => {
      window.clearTimeout(espera);
      oyentes.delete(oyente);
    };
  }, [clave]);
}
