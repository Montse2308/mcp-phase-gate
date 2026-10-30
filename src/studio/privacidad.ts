// The Studio does not show this machine's absolute paths unless it has to: in error messages and in the file
// names of actions they are replaced by <Documentación>, <repos>, <configuración>, <estado> or ~.

import * as os from "os";

import { DOCS, REPOS, configDir, requireBasePath, stateDir } from "../config.js";
import { rutaReal } from "../paths.js";

// Replaced longest first, so a root nested in another one is not left half-masked.
export function sinRutasDelEquipo(texto: string): string {
  const raices: [string, string][] = [];
  const anotar = (obtener: () => string, nombre: string): void => {
    try {
      const ruta = obtener();
      raices.push([ruta, nombre]);
      try {
        raices.push([rutaReal(ruta), nombre]);
      } catch {
        // it may not exist: the path as configured is enough
      }
    } catch {
      // not configured: nothing to mask
    }
  };
  anotar(() => requireBasePath(DOCS), "<Documentación>");
  anotar(() => requireBasePath(REPOS), "<repos>");
  anotar(() => configDir(), "<configuración>");
  anotar(() => stateDir(), "<estado>");
  anotar(() => os.homedir(), "~");
  let resultado = texto;
  for (const [ruta, nombre] of raices.sort((a, b) => b[0].length - a[0].length)) {
    if (!ruta) continue;
    const variantes = new Set([ruta, ruta.replace(/\\/g, "/")]);
    for (const variante of variantes) {
      const escapada = variante.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      resultado = resultado.replace(new RegExp(escapada, process.platform === "win32" ? "gi" : "g"), nombre);
    }
  }
  return resultado;
}
