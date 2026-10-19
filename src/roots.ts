// El proyecto deducido de la carpeta que el cliente tiene abierta (MCP Roots).
//
// Hasta ahora, sin `project` el servidor solo podía adivinar con el único puntero guardado, y con
// dos proyectos en marcha no podía. El cliente sí sabe qué carpeta está abierta: la anuncia como
// "raíz" (roots/list). Si esa carpeta es un repo de un proyecto, o está dentro de su carpeta de la
// Documentación, el proyecto queda deducido.
//
// Las raíces se piden al terminar el initialize y otra vez cuando el cliente avisa de que cambiaron.
// Un cliente que no declaró la capacidad `roots` no recibe la petición: el SDK no lo comprueba
// (salvo con enforceStrictCapabilities), y la petición volvería con error. Sin raíces todo funciona
// como antes: `project` explícito, y el puntero para la compuerta.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RootsListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import * as os from "os";
import * as path from "path";
import { fileURLToPath } from "url";

import { DOCS, requireBasePath } from "./config.js";
import { fallo, mensaje } from "./i18n/mensajes.js";
import { log } from "./log.js";
import { leerMaquina, manifiestoDe, resolverRepos } from "./manifiesto.js";
import { discoverProjects, estaDentroReal, rutaReal } from "./paths.js";

export type ResolucionProyecto =
  | { tipo: "unico"; carpetaProyecto: string; motivo: string; fuerza: "fuerte" | "debil" }
  | { tipo: "ambiguo"; candidatos: string[] }
  | { tipo: "ninguno" };

export const ESPERA_DE_RAICES_MS = 5000;

// `oyentes`: quien quiere saber las raíces en cuanto llegan (el registro de sesiones, src/sesiones.ts).
type Estado = { raices: string[]; pendiente: Promise<void> | null; oyentes: ((raices: string[]) => void)[] };
const estados = new WeakMap<McpServer, Estado>();

function estadoDe(mcp: McpServer): Estado {
  let estado = estados.get(mcp);
  if (!estado) {
    estado = { raices: [], pendiente: null, oyentes: [] };
    estados.set(mcp, estado);
  }
  return estado;
}

// Avisa cada vez que se conocen las raíces de la sesión: al terminar el initialize (vacías si el
// cliente no declara `roots`) y tras cada roots/list_changed. Un oyente que lanza no afecta a nadie.
export function alRecibirRaices(mcp: McpServer, oyente: (raices: string[]) => void): void {
  estadoDe(mcp).oyentes.push(oyente);
}

function avisar(estado: Estado): void {
  for (const oyente of estado.oyentes) {
    try {
      oyente([...estado.raices]);
    } catch (error) {
      log("warning", mensaje("ROOTS-TXT-OYENTE-FALLO", { detalle: error instanceof Error ? error.message : String(error) }));
    }
  }
}

// Una URI file:// a su ruta real. fileURLToPath resuelve igual file:///C:/…, file:///c:/… y
// file:///c%3A/… (la forma que manda VS Code), decodifica %20 y %C3%B1, y en Windows convierte
// file://servidor/recurso en \\servidor\recurso. Nunca se manipula la URI como texto.
export function rutaDeRaiz(uri: string): string {
  return rutaReal(fileURLToPath(uri));
}

export function iniciarRoots(mcp: McpServer): void {
  const estado = estadoDe(mcp);

  // Solo cuenta la respuesta de la última petición: una anterior que llega tarde, después de un
  // roots/list_changed, traería raíces viejas (hallazgo 4 de la auditoría de la Etapa 3).
  let ultima = 0;
  const pedir = (): void => {
    if (!mcp.server.getClientCapabilities()?.roots) {
      avisar(estado);
      return;
    }
    const esta = ++ultima;
    const peticion = mcp.server
      .listRoots(undefined, { timeout: ESPERA_DE_RAICES_MS })
      .then(({ roots }) => {
        if (esta !== ultima) return;
        estado.raices = roots.flatMap((raiz) => {
          try {
            return [rutaDeRaiz(raiz.uri)];
          } catch (error) {
            log("warning", mensaje("ROOTS-TXT-RAIZ-DESCARTADA", { uri: raiz.uri, detalle: error instanceof Error ? error.message : String(error) }));
            return [];
          }
        });
        avisar(estado);
      })
      .catch((error: unknown) => {
        log("warning", mensaje("ROOTS-TXT-SIN-RAICES", { detalle: error instanceof Error ? error.message : String(error) }));
        if (esta === ultima) {
          estado.raices = [];
          avisar(estado);
        }
      });
    estado.pendiente = peticion;
  };

  const alInicializar = mcp.server.oninitialized;
  mcp.server.oninitialized = () => {
    alInicializar?.();
    pedir();
  };
  mcp.server.setNotificationHandler(RootsListChangedNotificationSchema, async () => pedir());
}

// Las raíces de la sesión, ya como rutas reales. Si hay una petición en curso, se espera: así una
// tool llamada justo después del initialize ve las raíces que el cliente ya mandó.
export async function raicesActuales(mcp: McpServer): Promise<string[]> {
  const estado = estadoDe(mcp);
  if (estado.pendiente) await estado.pendiente;
  return [...estado.raices];
}

// El motivo se guarda como código y datos: se redacta al entregarlo, en el idioma de ese momento (la
// deducción corre antes de saber el proyecto, y su línea sale cuando ya se sabe).
type Motivo = { codigo: string; parametros: Record<string, string> };
type Coincidencia = { proyecto: string; fuerza: "fuerte" | "debil"; motivo: Motivo };

// El motivo de cada resolución "unico" que da resolverPorRaices, para volver a redactarlo en lineaDeDeduccion.
const motivos = new WeakMap<object, Motivo>();

// La raíz de un disco o la carpeta del usuario "contienen" los repos de cualquier proyecto: abrirlas no
// dice nada de en qué proyecto se trabaja, así que no dan coincidencia débil (hallazgo 3 de la
// auditoría de la Etapa 3).
export function esDemasiadoAmplia(raiz: string): boolean {
  const resuelta = path.resolve(raiz);
  if (path.dirname(resuelta) === resuelta) return true;
  try {
    return path.relative(rutaReal(os.homedir()), resuelta) === "";
  } catch {
    return false;
  }
}

function coincidencias(raices: string[]): Coincidencia[] {
  if (raices.length === 0) return [];
  const docs = requireBasePath(DOCS);
  let maquina = leerMaquina();
  if (maquina.estado === "invalido") maquina = { ...maquina, repos: new Map() };

  const encontradas: Coincidencia[] = [];
  for (const proyecto of [...discoverProjects().values()].sort()) {
    let repos: { id: string; ruta: string }[] = [];
    try {
      const manifiesto = manifiestoDe(proyecto);
      repos = resolverRepos(proyecto, manifiesto?.repos ?? [], maquina).flatMap((repo) => (repo.ruta && repo.existe ? [{ id: repo.id, ruta: repo.ruta }] : []));
    } catch {
      // Un manifiesto roto no impide reconocer la carpeta de la Documentación; doctor lo avisa.
    }
    const carpeta = path.join(docs, proyecto);

    for (const raiz of raices) {
      const dentro = (base: string, ruta: string): boolean => {
        try {
          return estaDentroReal(base, ruta);
        } catch {
          return false;
        }
      };
      for (const repo of repos) {
        if (dentro(repo.ruta, raiz)) {
          encontradas.push({ proyecto, fuerza: "fuerte", motivo: { codigo: "ROOTS-TXT-MOTIVO-ES-REPO", parametros: { raiz, repo: repo.id, proyecto } } });
        } else if (!esDemasiadoAmplia(raiz) && dentro(raiz, repo.ruta)) {
          encontradas.push({ proyecto, fuerza: "debil", motivo: { codigo: "ROOTS-TXT-MOTIVO-CONTIENE-REPO", parametros: { raiz, repo: repo.id, proyecto } } });
        }
      }
      if (dentro(carpeta, raiz)) {
        encontradas.push({ proyecto, fuerza: "fuerte", motivo: { codigo: "ROOTS-TXT-MOTIVO-EN-DOCS", parametros: { raiz, proyecto } } });
      }
    }
  }
  return encontradas;
}

// La coincidencia más fuerte de cada proyecto con estas raíces: lo que enseña el diagnóstico.
export function fuerzaPorProyecto(raices: string[]): Map<string, "fuerte" | "debil"> {
  const fuerzas = new Map<string, "fuerte" | "debil">();
  for (const { proyecto, fuerza } of coincidencias(raices)) {
    if (fuerza === "fuerte" || !fuerzas.has(proyecto)) fuerzas.set(proyecto, fuerza);
  }
  return fuerzas;
}

// El cruce de las raíces con los proyectos:
//   - la raíz es un repo del proyecto o está dentro de él: fuerte;
//   - la raíz está dentro de <DOCS>/<PROYECTO>: fuerte;
//   - un repo del proyecto está dentro de la raíz (se abrió la carpeta que contiene varios): débil.
// Un solo proyecto con coincidencia fuerte, o ninguno fuerte y uno solo débil, es "unico"; varios
// fuertes, "ambiguo"; lo demás (también varios débiles), "ninguno".
export function resolverPorRaices(raices: string[]): ResolucionProyecto {
  const encontradas = coincidencias(raices);
  const fuertes = [...new Set(encontradas.filter((c) => c.fuerza === "fuerte").map((c) => c.proyecto))];
  const debiles = [...new Set(encontradas.filter((c) => c.fuerza === "debil").map((c) => c.proyecto))];

  const unico = (proyecto: string, fuerza: Coincidencia["fuerza"]): ResolucionProyecto => {
    const motivo = encontradas.find((c) => c.proyecto === proyecto && c.fuerza === fuerza)!.motivo;
    const resolucion: ResolucionProyecto = { tipo: "unico", carpetaProyecto: proyecto, motivo: mensaje(motivo.codigo, motivo.parametros), fuerza };
    motivos.set(resolucion, motivo);
    return resolucion;
  };

  if (fuertes.length === 1) return unico(fuertes[0]!, "fuerte");
  if (fuertes.length > 1) return { tipo: "ambiguo", candidatos: fuertes };
  if (debiles.length === 1) return unico(debiles[0]!, "debil");
  // Varias débiles (una carpeta que contiene repos de varios proyectos) no apuntan a ninguno.
  return { tipo: "ninguno" };
}

export async function proyectoPorRaices(mcp: McpServer): Promise<ResolucionProyecto> {
  try {
    return resolverPorRaices(await raicesActuales(mcp));
  } catch (error) {
    // Sin Documentación configurada no hay nada que cruzar; el error real lo da la tool.
    log("warning", mensaje("ROOTS-TXT-SIN-DEDUCCION", { detalle: error instanceof Error ? error.message : String(error) }));
    return { tipo: "ninguno" };
  }
}

// ─── Resolución del proyecto en una tool ────────────────────────────────────
// El orden: el `project` que se indique; si no, el que deducen las raíces. (La compuerta y el aviso
// de pendientes usan además el único puntero, como antes: eso lo hacen ellos.) `deducido` lleva la
// línea que la respuesta añade para que se vea de dónde salió.
export type ProyectoResuelto = { carpetaProyecto: string; deducido: string | null };

export function lineaDeDeduccion(resolucion: Extract<ResolucionProyecto, { tipo: "unico" }>): string {
  // El motivo, otra vez en el idioma de ahora: al deducirlo todavía no se sabía el del proyecto.
  const motivo = motivos.get(resolucion);
  return mensaje("ROOTS-TXT-DEDUCIDO", {
    proyecto: resolucion.carpetaProyecto,
    motivo: motivo ? mensaje(motivo.codigo, motivo.parametros) : resolucion.motivo,
  });
}

export function errorSinProyecto(resolucion: ResolucionProyecto): Error {
  if (resolucion.tipo === "ambiguo") {
    return fallo("ROOTS-TXT-AMBIGUO", { candidatos: resolucion.candidatos });
  }
  return fallo("ROOTS-TXT-SIN-PROYECTO");
}
