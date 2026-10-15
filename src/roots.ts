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
import * as path from "path";
import { fileURLToPath } from "url";

import { DOCS, requireBasePath } from "./config.js";
import { log } from "./log.js";
import { leerMaquina, manifiestoDe, resolverRepos } from "./manifiesto.js";
import { discoverProjects, estaDentroReal, rutaReal } from "./paths.js";

export type ResolucionProyecto =
  | { tipo: "unico"; carpetaProyecto: string; motivo: string }
  | { tipo: "ambiguo"; candidatos: string[] }
  | { tipo: "ninguno" };

export const ESPERA_DE_RAICES_MS = 5000;

type Estado = { raices: string[]; pendiente: Promise<void> | null };
const estados = new WeakMap<McpServer, Estado>();

function estadoDe(mcp: McpServer): Estado {
  let estado = estados.get(mcp);
  if (!estado) {
    estado = { raices: [], pendiente: null };
    estados.set(mcp, estado);
  }
  return estado;
}

// Una URI file:// a su ruta real. fileURLToPath resuelve igual file:///C:/…, file:///c:/… y
// file:///c%3A/… (la forma que manda VS Code), decodifica %20 y %C3%B1, y en Windows convierte
// file://servidor/recurso en \\servidor\recurso. Nunca se manipula la URI como texto.
export function rutaDeRaiz(uri: string): string {
  return rutaReal(fileURLToPath(uri));
}

export function iniciarRoots(mcp: McpServer): void {
  const estado = estadoDe(mcp);

  const pedir = (): void => {
    if (!mcp.server.getClientCapabilities()?.roots) return;
    const peticion = mcp.server
      .listRoots(undefined, { timeout: ESPERA_DE_RAICES_MS })
      .then(({ roots }) => {
        estado.raices = roots.flatMap((raiz) => {
          try {
            return [rutaDeRaiz(raiz.uri)];
          } catch (error) {
            log("warning", `Se descarta la raíz ${raiz.uri}: ${error instanceof Error ? error.message : String(error)}`);
            return [];
          }
        });
      })
      .catch((error: unknown) => {
        log("warning", `No se pudieron pedir las raíces al cliente: ${error instanceof Error ? error.message : String(error)}`);
        estado.raices = [];
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

type Coincidencia = { proyecto: string; fuerza: "fuerte" | "debil"; motivo: string };

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
          encontradas.push({ proyecto, fuerza: "fuerte", motivo: `la carpeta abierta \`${raiz}\` es el repo \`${repo.id}\` de ${proyecto}` });
        } else if (dentro(raiz, repo.ruta)) {
          encontradas.push({ proyecto, fuerza: "debil", motivo: `la carpeta abierta \`${raiz}\` contiene el repo \`${repo.id}\` de ${proyecto}` });
        }
      }
      if (dentro(carpeta, raiz)) {
        encontradas.push({ proyecto, fuerza: "fuerte", motivo: `la carpeta abierta \`${raiz}\` está en la carpeta de ${proyecto} de la Documentación` });
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

  const motivoDe = (proyecto: string, fuerza: Coincidencia["fuerza"]): string =>
    encontradas.find((c) => c.proyecto === proyecto && c.fuerza === fuerza)!.motivo;

  if (fuertes.length === 1) return { tipo: "unico", carpetaProyecto: fuertes[0]!, motivo: motivoDe(fuertes[0]!, "fuerte") };
  if (fuertes.length > 1) return { tipo: "ambiguo", candidatos: fuertes };
  if (debiles.length === 1) return { tipo: "unico", carpetaProyecto: debiles[0]!, motivo: motivoDe(debiles[0]!, "debil") };
  // Varias débiles (una carpeta que contiene repos de varios proyectos) no apuntan a ninguno.
  return { tipo: "ninguno" };
}

export async function proyectoPorRaices(mcp: McpServer): Promise<ResolucionProyecto> {
  try {
    return resolverPorRaices(await raicesActuales(mcp));
  } catch (error) {
    // Sin Documentación configurada no hay nada que cruzar; el error real lo da la tool.
    log("warning", `No se pudo deducir el proyecto de las raíces: ${error instanceof Error ? error.message : String(error)}`);
    return { tipo: "ninguno" };
  }
}

// ─── Resolución del proyecto en una tool ────────────────────────────────────
// El orden: el `project` que se indique; si no, el que deducen las raíces. (La compuerta y el aviso
// de pendientes usan además el único puntero, como antes: eso lo hacen ellos.) `deducido` lleva la
// línea que la respuesta añade para que se vea de dónde salió.
export type ProyectoResuelto = { carpetaProyecto: string; deducido: string | null };

export function lineaDeDeduccion(resolucion: Extract<ResolucionProyecto, { tipo: "unico" }>): string {
  return `Proyecto deducido de la carpeta abierta: ${resolucion.carpetaProyecto} (${resolucion.motivo}).`;
}

export function errorSinProyecto(resolucion: ResolucionProyecto): Error {
  if (resolucion.tipo === "ambiguo") {
    return new Error(
      `No sé en qué proyecto estás: la carpeta abierta coincide con varios (${resolucion.candidatos.join(", ")}). Indica \`project\`.`
    );
  }
  return new Error("No sé en qué proyecto estás: indica `project`.");
}
