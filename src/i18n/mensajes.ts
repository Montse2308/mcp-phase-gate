// The server's messages in both languages.
//
// Every error and every tool response, every doctor line and every text the server adds to a prompt has a
// CODE (`RUTA-FUERA`, `LOTE-FUERA-DE-PLAN`…) and a text in `es` and in `en`. The texts live in the catalogs
// of i18n/textos/, one per group of modules; here they are joined, and a test requires every code to have
// both languages and no code to be repeated.
//
// Which language a message comes out in:
//   - the blocks the server adds to a prompt (ARCHIVOS DE ESTA TAREA, the gate, the pending items,
//     CONFIGURACIÓN DEL PROYECTO, COMMITS DE LA FASE 4…), the receipts and the index: in the PROJECT's
//     language, which is always passed explicitly;
//   - the errors and responses of a tool: in the project's language if the call resolves one; if not, in
//     PHASE_GATE_LANG's; if not, in the system's. The server opens a context per call
//     (`conContextoDeMensajes`) and sets it as soon as it knows the project (`fijarIdiomaDeMensajes`), so an
//     error thrown by a module further down comes out in the right language without passing the language
//     to every function;
//   - doctor and `--help`: same rule, with no project.

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

// Kept apart so the test can say which catalog a repeated code belongs to.
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

// ─── The language of the call ───────────────────────────────────────────────
type Contexto = { idioma: Idioma | null };
const contexto = new AsyncLocalStorage<Contexto>();

export function conContextoDeMensajes<T>(funcion: () => T): T {
  return contexto.run({ idioma: null }, funcion);
}

// Called once the call's project is resolved: its errors and its response then come out in its language.
// Outside a context it does nothing.
export function fijarIdiomaDeMensajes(idioma: Idioma): void {
  const actual = contexto.getStore();
  if (actual) actual.idioma = idioma;
}

// Runs code with a fixed language (the Studio, with the interface's; a test).
export function enIdioma<T>(idioma: Idioma, funcion: () => T): T {
  return contexto.run({ idioma }, funcion);
}

export function idiomaDeMensajes(): Idioma {
  return contexto.getStore()?.idioma ?? idiomaDelEntorno() ?? idiomaDelSistema();
}

// ─── The messages ───────────────────────────────────────────────────────────
// The text of a code. With no language, the call's. A code that does not exist is a programming error: it is
// reported with the code, so it can be found, instead of handing back an empty text.
export function mensaje(codigo: string, parametros: Record<string, unknown> = {}, idioma: Idioma = idiomaDeMensajes()): string {
  const entrada = TODOS[codigo];
  if (!entrada) return `[${codigo}] ${JSON.stringify(parametros)}`;
  const plantilla = entrada[idioma];
  return typeof plantilla === "function" ? plantilla(parametros as never) : plantilla;
}

// An Error with the text of a code that also keeps the code: whoever catches it (the Studio, a test) can
// look at `codigo` instead of the text.
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
