// The project deduced from the folder the client has open (MCP Roots).
//
// Without `project`, the server could only guess from the single stored pointer, and with two projects
// going it could not. The client does know which folder is open: it announces it as a "root" (roots/list).
// If that folder is a repo of a project, or is inside its folder in the Documentation, the project is deduced.
//
// The roots are requested when initialize ends and again when the client reports that they changed. A
// client that did not declare the `roots` capability does not get the request: the SDK does not check it
// (except with enforceStrictCapabilities), and the request would come back with an error. Without roots
// everything works without this module: an explicit `project`, and the pointer for the gate.

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

// `oyentes`: whoever wants the roots as soon as they arrive (the session registry, src/sesiones.ts).
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

// Notifies every time the roots of the session are known: when initialize ends (empty if the client does
// not declare `roots`) and after each roots/list_changed. A listener that throws affects no one.
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

// A file:// URI to its real path. fileURLToPath resolves file:///C:/…, file:///c:/… and file:///c%3A/…
// (the form VS Code sends) the same way, decodes %20 and %C3%B1, and on Windows turns file://server/share
// into \\server\share. The URI is never manipulated as text.
export function rutaDeRaiz(uri: string): string {
  return rutaReal(fileURLToPath(uri));
}

export function iniciarRoots(mcp: McpServer): void {
  const estado = estadoDe(mcp);

  // Only the answer to the latest request counts: an earlier one arriving late, after a roots/list_changed,
  // would bring old roots.
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

// The roots of the session, already as real paths. If a request is in progress, it is awaited: so a tool
// called right after initialize sees the roots the client already sent.
export async function raicesActuales(mcp: McpServer): Promise<string[]> {
  const estado = estadoDe(mcp);
  if (estado.pendiente) await estado.pendiente;
  return [...estado.raices];
}

// The reason is stored as a code and data: it is worded when delivered, in the language of that moment (the
// deduction runs before the project is known, and its line comes out when it already is).
type Motivo = { codigo: string; parametros: Record<string, string> };
type Coincidencia = { proyecto: string; fuerza: "fuerte" | "debil"; motivo: Motivo };

// The reason of each "unico" resolution that resolverPorRaices gives, to word it again in lineaDeDeduccion.
const motivos = new WeakMap<object, Motivo>();

// The root of a disk or the user's folder "contain" the repos of any project: opening them says nothing
// about which project is being worked on, so they give no weak match.
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
      // A broken manifest does not prevent recognizing the Documentation folder; doctor reports it.
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

// The strongest match of each project with these roots: what the diagnosis shows.
export function fuerzaPorProyecto(raices: string[]): Map<string, "fuerte" | "debil"> {
  const fuerzas = new Map<string, "fuerte" | "debil">();
  for (const { proyecto, fuerza } of coincidencias(raices)) {
    if (fuerza === "fuerte" || !fuerzas.has(proyecto)) fuerzas.set(proyecto, fuerza);
  }
  return fuerzas;
}

// How the roots cross with the projects:
//   - the root is a repo of the project or is inside one: strong;
//   - the root is inside <DOCS>/<PROJECT>: strong;
//   - a repo of the project is inside the root (the folder that contains several was opened): weak.
// A single project with a strong match, or none strong and a single weak one, is "unico"; several strong,
// "ambiguo"; anything else (several weak ones too), "ninguno".
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
  // Several weak ones (a folder that contains repos of several projects) point to none.
  return { tipo: "ninguno" };
}

export async function proyectoPorRaices(mcp: McpServer): Promise<ResolucionProyecto> {
  try {
    return resolverPorRaices(await raicesActuales(mcp));
  } catch (error) {
    // Without Documentation configured there is nothing to cross; the real error comes from the tool.
    log("warning", mensaje("ROOTS-TXT-SIN-DEDUCCION", { detalle: error instanceof Error ? error.message : String(error) }));
    return { tipo: "ninguno" };
  }
}

// ─── Resolving the project in a tool ────────────────────────────────────────
// The order: the `project` that is given; if not, the one the roots deduce. (The gate and the pending-items
// notice also use the single pointer: they do that themselves.) `deducido` carries the line that the
// response adds so that it shows where it came from.
export type ProyectoResuelto = { carpetaProyecto: string; deducido: string | null };

export function lineaDeDeduccion(resolucion: Extract<ResolucionProyecto, { tipo: "unico" }>): string {
  // The reason, again in the language of now: when it was deduced the project's was not known yet.
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
