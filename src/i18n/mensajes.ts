// Los mensajes del servidor en los dos idiomas (§8.5 del plan maestro v3).
//
// Cada error y cada respuesta de las tools, cada línea de doctor y cada texto que el servidor añade a un
// prompt tiene un CÓDIGO (`RUTA-FUERA`, `LOTE-FUERA-DE-PLAN`…) y un texto en `es` y en `en`. Los textos
// viven en los catálogos de i18n/textos/, uno por grupo de módulos; aquí se juntan, y un test exige que
// todo código tenga los dos idiomas y que ninguno se repita.
//
// En qué idioma sale un mensaje:
//   - los bloques que el servidor añade a un prompt (ARCHIVOS DE ESTA TAREA, la compuerta, los pendientes,
//     CONFIGURACIÓN DEL PROYECTO, COMMITS DE LA FASE 4…), los recibos y el índice: en el idioma del
//     PROYECTO, que se pasa siempre de forma explícita;
//   - los errores y las respuestas de una tool: en el del proyecto si la llamada lo resuelve; si no, en el
//     de PHASE_GATE_LANG; si no, en el del sistema. El servidor abre un contexto por llamada
//     (`conContextoDeMensajes`) y lo fija en cuanto sabe el proyecto (`fijarIdiomaDeMensajes`), así que el
//     error que lanza un módulo de abajo sale en el idioma correcto sin pasarle el idioma a cada función;
//   - doctor y `--help`: con el mismo criterio, sin proyecto.

import { AsyncLocalStorage } from "node:async_hooks";

import type { Idioma } from "../vocabulario.js";
import { idiomaDelEntorno, idiomaDelSistema } from "./idioma.js";
import { TEXTOS_AJUSTES } from "./textos/ajustes.js";
import { TEXTOS_CLI } from "./textos/cli.js";
import { TEXTOS_DIAGNOSTICO } from "./textos/diagnostico.js";
import { TEXTOS_LOTES } from "./textos/lotes.js";
import { TEXTOS_NUCLEO } from "./textos/nucleo.js";
import { TEXTOS_PROMPTS } from "./textos/prompts.js";
import { TEXTOS_SERVIDOR } from "./textos/servidor.js";
import { TEXTOS_STUDIO } from "./textos/studio.js";
import type { Catalogo } from "./textos/tipos.js";

export type { Catalogo, Plantilla } from "./textos/tipos.js";

// Los catálogos por separado, para que el test pueda decir de cuál es un código repetido.
export const CATALOGOS: Readonly<Record<string, Catalogo>> = {
  ajustes: TEXTOS_AJUSTES,
  cli: TEXTOS_CLI,
  diagnostico: TEXTOS_DIAGNOSTICO,
  lotes: TEXTOS_LOTES,
  nucleo: TEXTOS_NUCLEO,
  prompts: TEXTOS_PROMPTS,
  servidor: TEXTOS_SERVIDOR,
  studio: TEXTOS_STUDIO,
};

const TODOS: Catalogo = Object.assign({}, ...Object.values(CATALOGOS));

export function existeMensaje(codigo: string): boolean {
  return Object.prototype.hasOwnProperty.call(TODOS, codigo);
}

// ─── El idioma de la llamada ────────────────────────────────────────────────
type Contexto = { idioma: Idioma | null };
const contexto = new AsyncLocalStorage<Contexto>();

// Un contexto nuevo, sin idioma todavía: el de la llamada a una tool.
export function conContextoDeMensajes<T>(funcion: () => T): T {
  return contexto.run({ idioma: null }, funcion);
}

// El proyecto de la llamada se acaba de resolver: sus errores y su respuesta, en su idioma. Fuera de un
// contexto no hace nada.
export function fijarIdiomaDeMensajes(idioma: Idioma): void {
  const actual = contexto.getStore();
  if (actual) actual.idioma = idioma;
}

// Un trozo de código con un idioma fijo (el Studio, con el de la interfaz; un test).
export function enIdioma<T>(idioma: Idioma, funcion: () => T): T {
  return contexto.run({ idioma }, funcion);
}

export function idiomaDeMensajes(): Idioma {
  return contexto.getStore()?.idioma ?? idiomaDelEntorno() ?? idiomaDelSistema();
}

// ─── Los mensajes ───────────────────────────────────────────────────────────
// El texto de un código. Sin idioma, el de la llamada. Un código que no existe es un fallo de programación:
// se dice con el código, para encontrarlo, en vez de entregar un texto vacío.
export function mensaje(codigo: string, parametros: Record<string, unknown> = {}, idioma: Idioma = idiomaDeMensajes()): string {
  const entrada = TODOS[codigo];
  if (!entrada) return `[${codigo}] ${JSON.stringify(parametros)}`;
  const plantilla = entrada[idioma];
  return typeof plantilla === "function" ? plantilla(parametros as never) : plantilla;
}

// Un Error con el texto de un código, que guarda el código: quien lo captura (el Studio, un test) puede
// mirar `codigo` en vez del texto.
export class ErrorConCodigo extends Error {
  constructor(
    readonly codigo: string,
    texto: string
  ) {
    super(texto);
  }
}

export function fallo(codigo: string, parametros: Record<string, unknown> = {}, idioma?: Idioma): ErrorConCodigo {
  return new ErrorConCodigo(codigo, mensaje(codigo, parametros, idioma));
}
