// El indicador de estado: la forma (Marca) y el texto de cada estado, y, en los que piden atención, el texto
// dentro de una insignia. Cada estado tiene una forma propia dentro de su vista y siempre va con su texto:
// nunca se dice nada solo con color. La tabla de abajo es la única que sabe qué forma, qué color y qué
// insignia lleva cada estado; las vistas solo dicen cuál es el estado y con qué palabras.
//
// El elemento lleva la clave del estado como clase (`estado-verificado`, `fase-hueco`, `red-repo-limpio`…):
// es el gancho estable de las pruebas y de las grabaciones.

import type { ComponentChildren } from "preact";

import { Marca } from "./marcas";
import type { Forma, Tono } from "./marcas";

type Definicion = { forma: Forma; tono: Tono; insignia: boolean };

const ESTADOS = {
  // Fases de una tarea
  "fase-cerrada": { forma: "lleno", tono: "verde", insignia: false },
  "fase-en-curso": { forma: "anillo", tono: "ambar", insignia: false },
  "fase-con-pendientes": { forma: "triangulo", tono: "ambar", insignia: true },
  "fase-hueco": { forma: "rombo", tono: "rojo", insignia: true },
  "fase-pendiente": { forma: "vacio", tono: "apagado", insignia: false },
  // Lotes de la Fase 4
  "estado-verificado": { forma: "lleno", tono: "verde", insignia: false },
  "estado-sellado": { forma: "cuadro", tono: "verde", insignia: false },
  "estado-con-pendientes": { forma: "triangulo", tono: "ambar", insignia: true },
  "estado-commit-pendiente": { forma: "discontinuo", tono: "violeta", insignia: false },
  "estado-no-vigente": { forma: "triangulo-vacio", tono: "ambar", insignia: true },
  "estado-rechazado": { forma: "rombo", tono: "rojo", insignia: true },
  "estado-descartado": { forma: "raya", tono: "apagado", insignia: false },
  "estado-manual": { forma: "cuadro-vacio", tono: "apagado", insignia: false },
  "estado-nota": { forma: "vacio", tono: "apagado", insignia: false },
  "estado-sin-recibo": { forma: "rombo-vacio", tono: "apagado", insignia: false },
  // La Red: el manifiesto, el git de cada repo, la sesión y la configuración del proyecto
  "red-manifiesto-valido": { forma: "lleno", tono: "verde", insignia: false },
  "red-manifiesto-ausente": { forma: "vacio", tono: "apagado", insignia: false },
  "red-manifiesto-invalido": { forma: "rombo", tono: "rojo", insignia: true },
  "red-repo-limpio": { forma: "lleno", tono: "verde", insignia: false },
  "red-repo-con-cambios": { forma: "anillo", tono: "ambar", insignia: false },
  "red-repo-sin-git": { forma: "raya", tono: "apagado", insignia: false },
  "red-repo-no-existe": { forma: "rombo", tono: "rojo", insignia: true },
  "red-repo-con-error": { forma: "triangulo", tono: "ambar", insignia: true },
  "red-sesion-abierta": { forma: "lleno", tono: "verde", insignia: false },
  "red-sesion-ninguna": { forma: "vacio", tono: "apagado", insignia: false },
  "red-configuracion-con-error": { forma: "triangulo", tono: "ambar", insignia: true },
  // El Vigía: los hallazgos por severidad y los clientes
  "vigia-errores": { forma: "rombo", tono: "rojo", insignia: true },
  "vigia-avisos": { forma: "triangulo", tono: "ambar", insignia: true },
  "vigia-info": { forma: "vacio", tono: "apagado", insignia: false },
  "vigia-cliente-detectado": { forma: "lleno", tono: "verde", insignia: false },
  "vigia-cliente-no-detectado": { forma: "vacio", tono: "apagado", insignia: false },
} as const satisfies Record<string, Definicion>;

export type ClaveDeEstado = keyof typeof ESTADOS;

type Propiedades = {
  estado: ClaveDeEstado;
  texto: string;
  // Lo que va entre la forma y el texto del estado, dentro del mismo renglón (el nombre de un repo, su rol).
  antes?: ComponentChildren;
  // Pinta el texto con el color del estado (las fases y los lotes); sin esto solo se colorea la forma.
  enColor?: boolean;
  clase?: string;
};

export function IndicadorDeEstado({ estado, texto, antes, enColor, clase }: Propiedades) {
  const e: Definicion = ESTADOS[estado];
  return (
    <span class={`indicador ${estado} tono-${e.tono}${clase ? ` ${clase}` : ""}`}>
      <Marca forma={e.forma} tono={e.tono} /> {antes}
      <span class={e.insignia ? "insignia" : enColor ? "indicador-texto" : undefined}>{texto}</span>
    </span>
  );
}
