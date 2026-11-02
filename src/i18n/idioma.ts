// The language of the environment and of the system, with no dependency on any other module of the package:
// config.ts and the messages use it, and config.ts writes messages while it loads (the .env), so this cannot
// import config.ts.

import type { Idioma } from "../vocabulario.js";

// "es", "en", "es-MX", "en_US.UTF-8"… -> "es" or "en"; anything else, null.
export function idiomaDeEtiqueta(valor: string): Idioma | null {
  const base = valor.trim().toLowerCase().split(/[-_.@]/)[0];
  return base === "es" || base === "en" ? base : null;
}

// PHASE_GATE_LANG, if it says "es" or "en". Any other value does not count: doctor warns about it
// (LANG-INVALIDO). It has no alias, and the .env is already loaded into process.env by the time this is
// asked (config.ts loads it when imported).
export function idiomaDelEntorno(): Idioma | null {
  return idiomaDeEtiqueta(process.env.PHASE_GATE_LANG ?? "");
}

// The system language is the LAST resort: on Linux it follows LANG and LC_ALL, which MCP clients do not
// pass on to the server (reduced environment), and on Windows it follows the regional settings and ignores
// LANG. A Spanish system gives "es"; any other, "en".
let sistemaFijado: string | null = null;

export function idiomaDelSistema(): Idioma {
  const locale = sistemaFijado ?? Intl.DateTimeFormat().resolvedOptions().locale;
  return idiomaDeEtiqueta(locale) === "es" ? "es" : "en";
}

// Tests only: the locale the system would report. null goes back to the real one.
export function fijarLocaleDelSistema(locale: string | null): void {
  sistemaFijado = locale;
}
