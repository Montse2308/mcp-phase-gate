// El idioma del entorno y del sistema, sin depender de ningún otro módulo del paquete: lo usan config.ts y
// los mensajes, y config.ts escribe mensajes al cargarse (el .env), así que esto no puede importar config.ts.

import type { Idioma } from "../vocabulario.js";

// "es", "en", "es-MX", "en_US.UTF-8"… -> "es" o "en"; cualquier otra cosa, null.
export function idiomaDeEtiqueta(valor: string): Idioma | null {
  const base = valor.trim().toLowerCase().split(/[-_.@]/)[0];
  return base === "es" || base === "en" ? base : null;
}

// PHASE_GATE_LANG, si dice "es" o "en". Otro valor no cuenta: doctor lo avisa. No tiene alias, y el .env ya
// está cargado en process.env cuando se pregunta (config.ts lo carga al importarse).
export function idiomaDelEntorno(): Idioma | null {
  return idiomaDeEtiqueta(process.env.PHASE_GATE_LANG ?? "");
}

// El idioma del sistema es el ÚLTIMO recurso: en Linux sigue a LANG y LC_ALL, que los clientes MCP no
// pasan al servidor (entorno reducido), y en Windows sigue a la configuración regional e ignora LANG
// (validación V9). Un sistema en español da "es"; cualquier otro, "en".
let sistemaFijado: string | null = null;

export function idiomaDelSistema(): Idioma {
  const locale = sistemaFijado ?? Intl.DateTimeFormat().resolvedOptions().locale;
  return idiomaDeEtiqueta(locale) === "es" ? "es" : "en";
}

// Solo para tests: el locale que diría el sistema. null vuelve al de verdad.
export function fijarLocaleDelSistema(locale: string | null): void {
  sistemaFijado = locale;
}
