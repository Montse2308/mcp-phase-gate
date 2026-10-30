// The Studio's static export: `mcp-phase-gate ui --export-static <dir>` writes a read-only site that works
// without a server (GitHub Pages, or any folder served as is).
//
// Without --incluir-datos-reales it ALWAYS exports the demo: it generates it in a temporary folder and never
// reads the Documentation of whoever runs it. With the flag it exports the Documentation, after asking the
// person to type `exportar` (or with --yes).
//
// How: it walks the same GET routes the frontend requests, with the same API handlers, and writes each
// response to datos/<sha256>.json (the name comes from the content: no need to encode the route into a file
// name, and a repeated response is stored once); datos/indice.json says which file and status code belong to
// each route. It copies studio/dist/, and writes config.js with the "estatico" mode and .nojekyll. This
// machine's paths are replaced by <Documentación>, <repos>, <paquete>… and, if any is still left, nothing is
// written.
//
// Deterministic: the demo has fixed dates and SHAs, it is read with the same borrowed environment it is
// generated with (TZ=UTC, without the exporting user's variables), JSON is written with sorted keys and paths
// with "/". The same version, on the same system, gives the same bytes.
//
// In both languages: datos/es/ and datos/en/, each with its own index. For the demo, each language gets its
// own demo (TIENDA… in Spanish, SHOP… in English) and the server texts in that language; with real data, the
// same Documentation with the server texts in each language. The frontend reads the set for the interface's
// language, and switching language switches data too.

import { createHash, randomBytes } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { DOCS, REPOS, configDir, raizPaquete, requireBasePath, stateDir } from "../config.js";
import type { Salida } from "../cli.js";
import type { EntornoInit } from "../init.js";
import { enIdioma, fallo, mensaje } from "../i18n/mensajes.js";
import { discoverProjects, rutaReal } from "../paths.js";
import { IDIOMAS } from "../vocabulario.js";
import type { Idioma } from "../vocabulario.js";
import { crearApi } from "./api.js";
import { borrarDemo, conEntornoDeDemo, entornoInitDeDemo, generarDemo } from "./demo.js";
import type { CarpetasDeDemo } from "./demo.js";
import type { ManejadorApi } from "./servidor.js";

export type OpcionesExport = { destino: string; datosReales: boolean; yes: boolean };
export type EntornoExport = { salida: Salida; esTerminal: boolean; preguntar: (pregunta: string) => Promise<string> };
export type Indice = { rutas: Record<string, { archivo: string; estado: number }> };

export const ARCHIVO_DEL_INDICE = "indice.json";
export const BANDA_DE_LA_DEMO = "Demo: datos de ejemplo. Todo es de solo lectura.";
export const BANDA_DE_DATOS_REALES = "Exportación de una Documentación: solo lectura.";
// The frontend sets the banner in the interface's language from this key; PG_BANDA stays in Spanish.
export type ClaveDeBanda = "estatico-demo" | "estatico-datos";

// ─── JSON with sorted keys ──────────────────────────────────────────────────
function ordenado(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenado);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((k) => [k, ordenado((valor as Record<string, unknown>)[k])])
    );
  }
  return valor;
}
export const jsonOrdenado = (valor: unknown): string => `${JSON.stringify(ordenado(valor))}\n`;

// ─── This machine's paths ───────────────────────────────────────────────────
// Each root in its three forms: as is, with "/", and with backslashes escaped (inside JSON carried as text,
// like the diff of an mcp.json). After a substituted name, separators become "/": "<repos>\tienda-api" on
// Windows and "<repos>/tienda-api" on Linux are the same thing.
export type Raiz = { ruta: string; nombre: string };

function formas(ruta: string): string[] {
  return [...new Set([ruta, ruta.replace(/\\/g, "/"), ruta.replace(/\\/g, "\\\\")])];
}

export function variantes(raices: Raiz[]): Raiz[] {
  const todas: Raiz[] = [];
  for (const { ruta, nombre } of raices) {
    if (!ruta) continue;
    const reales = [ruta];
    try {
      reales.push(rutaReal(ruta));
    } catch {
      // it may not exist: the path as configured is enough
    }
    for (const r of reales) for (const forma of formas(path.resolve(r))) todas.push({ ruta: forma, nombre });
  }
  // Longest first: the demo's temp folder before the system's temp folder.
  return todas.sort((a, b) => b.ruta.length - a.ruta.length);
}

const escapar = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function sinRutas(texto: string, raices: Raiz[]): string {
  let resultado = texto;
  const nombres = new Set<string>();
  for (const { ruta, nombre } of raices) {
    const antes = resultado;
    resultado = resultado.replace(new RegExp(escapar(ruta), process.platform === "win32" ? "gi" : "g"), nombre);
    if (resultado !== antes) nombres.add(nombre);
  }
  for (const nombre of nombres) {
    // The tail runs up to a quote, a parenthesis or the end of the line: task and document names contain
    // spaces ("04 - Ejecución\L01 - …").
    resultado = resultado.replace(new RegExp(`${escapar(nombre)}((?:\\\\+[^\\n\\r\\t\`"'()<>|,;:*?\\\\]+)+)`, "g"), (_, cola: string) => `${nombre}${cola.replace(/\\+/g, "/")}`);
  }
  return resultado;
}

function sinRutasEnTodo(valor: unknown, raices: Raiz[]): unknown {
  if (typeof valor === "string") return sinRutas(valor, raices);
  if (Array.isArray(valor)) return valor.map((v) => sinRutasEnTodo(v, raices));
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, sinRutasEnTodo(v, raices)]));
  return valor;
}

// ─── The routes the frontend requests ───────────────────────────────────────
// Written the way studio/src writes them (each segment with encodeURIComponent, and the query likewise): the
// index is looked up by the exact route.
const seg = (...partes: (string | number)[]): string => partes.map((p) => encodeURIComponent(String(p))).join("/");

export type Respuestas = Map<string, { estado: number; json: unknown }>;
export type RespuestasPorIdioma = Record<Idioma, Respuestas>;

// With `conAjustes`, also what Ajustes shows. Not with real data: those are paths of this machine, which the name
// substitution does not recognise when they fall outside the known roots, so those pages say they are not
// available in an export.
async function recorrer(api: ManejadorApi, conAjustes: boolean): Promise<Respuestas> {
  const respuestas: Respuestas = new Map();
  const pedir = async (ruta: string): Promise<any> => {
    const corte = ruta.indexOf("?");
    const camino = corte === -1 ? ruta : ruta.slice(0, corte);
    const r = await api({ metodo: "GET", ruta: camino.slice("/api".length), consulta: new URLSearchParams(corte === -1 ? "" : ruta.slice(corte + 1)), cuerpo: undefined, req: {} as never }, {} as never);
    if (r === "manejada") throw new Error(`${ruta} no es una ruta de lectura.`);
    respuestas.set(ruta, r);
    return r.estado === 200 ? r.json : null;
  };

  await pedir("/api/estado");
  await pedir("/api/clientes");
  if (conAjustes) await pedir("/api/ajustes");
  const proyectos = await pedir("/api/proyectos");
  for (const p of proyectos?.proyectos ?? []) {
    if (conAjustes) await pedir(`/api/ajustes/proyectos/${seg(p.nombre)}`);
    const tareas = await pedir(`/api/proyectos/${seg(p.nombre)}/tareas`);
    const primera = await pedir(`/api/prompts/${seg(p.nombre, 1)}`);
    const fases: number[] = (primera?.fases ?? [{ numero: 1 }]).map((f: { numero: number }) => f.numero);
    for (const fase of fases) if (fase !== 1) await pedir(`/api/prompts/${seg(p.nombre, fase)}`);
    for (const t of tareas?.tareas ?? []) {
      const base = `/api/tareas/${seg(p.nombre, t.tarea)}`;
      const tarea = await pedir(base);
      const lotes = await pedir(`${base}/lotes`);
      await pedir(`${base}/lotes?reverificar=1`);
      await pedir(`${base}/bitacora`);
      for (const fase of fases) await pedir(`/api/prompts/${seg(p.nombre, fase)}?tarea=${encodeURIComponent(t.tarea)}`);
      const documentos = new Set<string>([
        ...(tarea?.estaciones ?? []).filter((e: { existe: boolean }) => e.existe).map((e: { documento: string }) => e.documento),
        ...(lotes?.estado?.lotes ?? []).map((l: { recibo: string | null }) => l.recibo).filter(Boolean),
      ]);
      for (const documento of documentos) await pedir(`${base}/documento?archivo=${encodeURIComponent(documento)}`);
    }
  }
  return respuestas;
}

// ─── Writing the site ───────────────────────────────────────────────────────
function copiar(de: string, a: string): void {
  fs.mkdirSync(a, { recursive: true });
  for (const e of fs.readdirSync(de, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
    if (e.isDirectory()) copiar(path.join(de, e.name), path.join(a, e.name));
    else if (e.isFile()) fs.copyFileSync(path.join(de, e.name), path.join(a, e.name));
  }
}

// Deletes a tree this process just wrote (unlinkSync: on Node 24.11 for Windows, rmSync does not delete a
// name with accents and does not throw).
function borrarArbol(ruta: string): void {
  const info = fs.lstatSync(ruta, { throwIfNoEntry: false });
  if (!info) return;
  if (info.isDirectory() && !info.isSymbolicLink()) {
    for (const nombre of fs.readdirSync(ruta)) borrarArbol(path.join(ruta, nombre));
    fs.rmdirSync(ruta);
  } else fs.unlinkSync(ruta);
}

// `normalizar` is only replaced in the tests, to check that the final barrier works on its own.
export function escribirSitio(
  destino: string,
  porIdioma: RespuestasPorIdioma,
  raices: Raiz[],
  banda: ClaveDeBanda,
  dist: string,
  normalizar: (valor: unknown, raices: Raiz[]) => unknown = sinRutasEnTodo
): { rutas: number; archivos: number } {
  if (!fs.existsSync(path.join(dist, "index.html"))) throw fallo("STUDIO-EXPORT-SIN-FRONTEND", { dist });
  const conjuntos = IDIOMAS.map((idioma) => {
    const indice: Indice = { rutas: {} };
    const archivos = new Map<string, string>();
    for (const [ruta, { estado, json }] of porIdioma[idioma]) {
      const texto = jsonOrdenado(normalizar(json, raices));
      const archivo = `${createHash("sha256").update(texto).digest("hex").slice(0, 20)}.json`;
      archivos.set(archivo, texto);
      indice.rutas[ruta] = { archivo, estado };
    }
    return { idioma, textoDelIndice: jsonOrdenado(indice), archivos, rutas: porIdioma[idioma].size };
  });
  const textoDeBanda = banda === "estatico-demo" ? BANDA_DE_LA_DEMO : BANDA_DE_DATOS_REALES;
  const configJs = `window.PG_MODO = "estatico";\nwindow.PG_BANDA = ${JSON.stringify(textoDeBanda)};\nwindow.PG_BANDA_CLAVE = ${JSON.stringify(banda)};\n`;

  // The last barrier: if a path of this machine is left in anything about to be published, nothing is written.
  const minusculas = process.platform === "win32";
  const todo = [configJs, ...conjuntos.flatMap((c) => [c.textoDelIndice, ...c.archivos.values()])].join("\n");
  const buscado = minusculas ? todo.toLowerCase() : todo;
  for (const { ruta } of raices) {
    if (buscado.includes(minusculas ? ruta.toLowerCase() : ruta)) throw fallo("STUDIO-EXPORT-CON-RUTAS");
  }

  // Written alongside under another name and renamed when done: an interrupted export leaves no half-built site.
  const temporal = `${destino}.${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    copiar(dist, temporal);
    fs.writeFileSync(path.join(temporal, "config.js"), configJs, "utf-8");
    fs.writeFileSync(path.join(temporal, ".nojekyll"), "", "utf-8");
    for (const { idioma, textoDelIndice, archivos } of conjuntos) {
      const carpeta = path.join(temporal, "datos", idioma);
      fs.mkdirSync(carpeta, { recursive: true });
      fs.writeFileSync(path.join(carpeta, ARCHIVO_DEL_INDICE), textoDelIndice, "utf-8");
      for (const [archivo, texto] of [...archivos].sort(([a], [b]) => (a < b ? -1 : 1))) fs.writeFileSync(path.join(carpeta, archivo), texto, "utf-8");
    }
    if (fs.existsSync(destino)) fs.rmdirSync(destino); // empty: checked beforehand
    fs.renameSync(temporal, destino);
  } catch (error) {
    borrarArbol(temporal);
    throw error;
  }
  return { rutas: conjuntos.reduce((n, c) => n + c.rutas, 0), archivos: conjuntos.reduce((n, c) => n + c.archivos.size, 0) };
}

// ─── The command ────────────────────────────────────────────────────────────
// The roots that get replaced: the demo's (or the configured ones, with real data), the package, the user's
// folder and the system temp directory.
function raicesDe(demos: CarpetasDeDemo[], casaFalsa: string): Raiz[] {
  const comunes: Raiz[] = [
    { ruta: raizPaquete(), nombre: "<paquete>" },
    { ruta: casaFalsa, nombre: "~" },
    { ruta: os.homedir(), nombre: "~" },
    { ruta: os.tmpdir(), nombre: "<temporal>" },
  ];
  if (demos.length) {
    return variantes([
      ...demos.flatMap((demo) => [
        { ruta: demo.docs, nombre: "<Documentación>" },
        { ruta: demo.repos, nombre: "<repos>" },
        { ruta: demo.config, nombre: "<configuración>" },
        { ruta: demo.estado, nombre: "<estado>" },
        { ruta: demo.casa, nombre: "~" },
        { ruta: demo.raiz, nombre: "<demo>" },
      ]),
      ...comunes,
    ]);
  }
  const configuradas: Raiz[] = [];
  const anotar = (obtener: () => string, nombre: string): void => {
    try {
      configuradas.push({ ruta: obtener(), nombre });
    } catch {
      // not configured: nothing to mask
    }
  };
  anotar(() => requireBasePath(DOCS), "<Documentación>");
  anotar(() => requireBasePath(REPOS), "<repos>");
  anotar(() => configDir(), "<configuración>");
  anotar(() => stateDir(), "<estado>");
  return variantes([...configuradas, ...comunes]);
}

// /api/clientes, in the export, over an empty home: never the clients' real configuration, and without
// running `claude`.
function entornoInitVacio(casa: string): EntornoInit {
  return {
    home: casa,
    appData: path.join(casa, "AppData", "Roaming"),
    xdgConfig: path.join(casa, ".config"),
    plataforma: process.platform,
    salida: { out: () => {}, err: () => {} },
    esTerminal: false,
    preguntar: async () => "",
    ejecutar: async (comando) => {
      throw new Error(`en el export no se ejecuta \`${comando}\``);
    },
    ahora: () => new Date(),
  };
}

export async function exportarEstatico(opciones: OpcionesExport, entorno: EntornoExport, dist: string = path.join(raizPaquete(), "studio", "dist")): Promise<number> {
  const { salida } = entorno;
  const destino = path.resolve(opciones.destino);
  const info = fs.statSync(destino, { throwIfNoEntry: false });
  if (info && (!info.isDirectory() || fs.readdirSync(destino).length)) {
    salida.err(mensaje("STUDIO-EXPORT-CARPETA-OCUPADA", { destino }));
    return 1;
  }

  if (opciones.datosReales) {
    let proyectos: number;
    try {
      proyectos = discoverProjects().size;
    } catch (error) {
      salida.err(mensaje("STUDIO-EXPORT-SIN-DOCUMENTACION", { error: error instanceof Error ? error.message : String(error) }));
      return 1;
    }
    const aviso = mensaje("STUDIO-EXPORT-AVISO", { proyectos });
    if (!opciones.yes) {
      if (!entorno.esTerminal) {
        salida.err(mensaje("STUDIO-EXPORT-SIN-CONFIRMAR", { aviso }));
        return 1;
      }
      // The word in either language: "exportar" or "export".
      const respuesta = (await entorno.preguntar(mensaje("STUDIO-EXPORT-PREGUNTA", { aviso }))).trim();
      if (respuesta !== "exportar" && respuesta !== "export") {
        salida.err(mensaje("STUDIO-EXPORT-NADA"));
        return 1;
      }
    }
  }

  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-phase-gate-export-"));
  const casa = path.join(trabajo, "casa");
  fs.mkdirSync(casa);
  const demos: CarpetasDeDemo[] = [];
  try {
    const porIdioma = {} as RespuestasPorIdioma;
    for (const idioma of IDIOMAS) {
      // The server's texts (statuses, warnings, the assembled prompt…), in the language of the data set.
      if (opciones.datosReales) {
        porIdioma[idioma] = await enIdioma(idioma, () => recorrer(crearApi({ modo: "estatico", watcher: () => "apagado", sesiones: () => [], entornoInit: () => entornoInitVacio(casa) }), false));
      } else {
        // That language's demo, never the exporting user's Documentation: it is generated here and read with
        // its borrowed environment.
        const c = await generarDemo(path.join(trabajo, `demo-${idioma}`), idioma);
        demos.push(c);
        porIdioma[idioma] = await enIdioma(idioma, () =>
          conEntornoDeDemo(c, () => recorrer(crearApi({ modo: "estatico", watcher: () => "apagado", sesiones: () => [], entornoInit: () => entornoInitDeDemo(c) }), true), { PHASE_GATE_LANG: idioma })
        );
      }
    }
    const { rutas, archivos } = escribirSitio(destino, porIdioma, raicesDe(demos, casa), opciones.datosReales ? "estatico-datos" : "estatico-demo", dist);
    salida.out(mensaje("STUDIO-EXPORT-HECHO", { destino, rutas, archivos, demo: !opciones.datosReales }));
    return 0;
  } catch (error) {
    salida.err(mensaje("STUDIO-EXPORT-FALLO", { error: error instanceof Error ? error.message : String(error) }));
    return 1;
  } finally {
    for (const demo of demos) borrarDemo(demo.raiz);
    borrarArbol(trabajo);
  }
}
