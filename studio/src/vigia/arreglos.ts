// Cómo se arregla cada hallazgo del diagnóstico, por su código (§7.7.4 del plan): una tabla por idioma
// (arreglos-es.ts y arreglos-en.ts, con los mismos códigos) y aquí la del idioma de la interfaz. El texto
// del hallazgo lo trae el servidor, ya en ese idioma; esta línea es la de "cómo se arregla".

import { idiomaActual, t } from "../i18n/idioma";
import { ARREGLOS_EN } from "./arreglos-en";
import { ARREGLOS_ES } from "./arreglos-es";

const TABLAS: Record<"es" | "en", Readonly<Record<string, string>>> = { es: ARREGLOS_ES, en: ARREGLOS_EN };

export function arregloDe(codigo: string): string {
  const tabla = TABLAS[idiomaActual()];
  return Object.prototype.hasOwnProperty.call(tabla, codigo) ? tabla[codigo]! : t("vigia.sinArreglo");
}
