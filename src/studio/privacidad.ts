// Lo que el Studio no enseña sin necesidad: las rutas absolutas de este equipo. En los mensajes de error y
// en los nombres de archivo de las acciones se sustituyen por <Documentación>, <repos>, <configuración>,
// <estado> o ~.

import * as os from "os";

import { DOCS, REPOS, configDir, requireBasePath, stateDir } from "../config.js";
import { rutaReal } from "../paths.js";

// Las rutas del equipo que no hace falta enseñar, de la más larga a la más corta.
export function sinRutasDelEquipo(texto: string): string {
  const raices: [string, string][] = [];
  const anotar = (obtener: () => string, nombre: string): void => {
    try {
      const ruta = obtener();
      raices.push([ruta, nombre]);
      try {
        raices.push([rutaReal(ruta), nombre]);
      } catch {
        // si no existe, basta con la ruta tal cual
      }
    } catch {
      // sin esa ruta configurada no hay nada que quitar
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
