// El export estático del Studio (§7.9 del plan): `mcp-phase-gate ui --export-static <dir>` escribe un sitio
// que funciona sin servidor (GitHub Pages, o cualquier carpeta servida tal cual), en solo lectura.
//
// Sin --incluir-datos-reales exporta SIEMPRE la demo: la genera en una carpeta temporal y no lee la
// Documentación de quien lo lanza. Con la bandera exporta la Documentación, después de pedir que se escriba
// `exportar` (o con --yes). Cumple R6.
//
// Cómo: recorre las mismas rutas GET que pide el frontend (§7.5), con los mismos manejadores de la API, y
// escribe cada respuesta en datos/<sha256>.json (el nombre sale del contenido: no hay que codificar la ruta
// en un nombre de archivo, y una respuesta repetida se guarda una vez); datos/indice.json dice qué archivo
// y qué código corresponden a cada ruta. Copia studio/dist/, escribe config.js con el modo "estatico" y
// .nojekyll. Las rutas de este equipo se sustituyen por <Documentación>, <repos>, <paquete>… y, si aun así
// quedara alguna, no se escribe nada.
//
// Determinista: la demo tiene fechas y SHA fijos, se lee con el mismo entorno prestado con que se genera
// (TZ=UTC, sin las variables de quien exporta), los JSON van con las claves ordenadas y las rutas con "/".
// La misma versión, en el mismo sistema, da los mismos bytes.
//
// En los dos idiomas (§8.7): datos/es/ y datos/en/, cada uno con su índice. De la demo, cada idioma con su
// demo (TIENDA… en español, SHOP… en inglés) y los textos del servidor en ese idioma; con datos reales, la
// misma Documentación con los textos del servidor en cada idioma. El frontend lee el conjunto del idioma de
// la interfaz, y al cambiar de idioma cambia también de datos.

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
// La banda en el idioma de la interfaz la pone el frontend con esta clave; PG_BANDA queda en español.
export type ClaveDeBanda = "estatico-demo" | "estatico-datos";

// ─── JSON con las claves ordenadas ──────────────────────────────────────────
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

// ─── Las rutas de este equipo ───────────────────────────────────────────────
// Cada raíz, en sus tres formas: tal cual, con "/" y con las barras invertidas escapadas (dentro de un JSON
// que va como texto, como el diff de un mcp.json). Detrás de un nombre sustituido, los separadores pasan a
// "/": "<repos>\tienda-api" en Windows y "<repos>/tienda-api" en Linux son lo mismo.
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
      // si no existe, basta con la ruta tal cual
    }
    for (const r of reales) for (const forma of formas(path.resolve(r))) todas.push({ ruta: forma, nombre });
  }
  // De la más larga a la más corta: el temporal de la demo antes que el temporal del sistema.
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
    // La cola sigue hasta una comilla, un paréntesis o el final de la línea: los nombres de las tareas y de
    // los documentos llevan espacios ("04 - Ejecución\L01 - …").
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

// ─── Las rutas que pide el frontend ─────────────────────────────────────────
// Escritas como las escribe studio/src (cada segmento con encodeURIComponent, y la consulta igual): el
// índice se busca por la ruta exacta.
const seg = (...partes: (string | number)[]): string => partes.map((p) => encodeURIComponent(String(p))).join("/");

export type Respuestas = Map<string, { estado: number; json: unknown }>;
export type RespuestasPorIdioma = Record<Idioma, Respuestas>;

// Con `conAjustes`, también lo que enseña Ajustes. Con datos reales no: son rutas de este equipo, que el
// sustituidor de nombres no reconoce si caen fuera de las raíces conocidas, así que esas páginas dicen que no
// están disponibles en una exportación.
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

// ─── Escribir el sitio ──────────────────────────────────────────────────────
function copiar(de: string, a: string): void {
  fs.mkdirSync(a, { recursive: true });
  for (const e of fs.readdirSync(de, { withFileTypes: true }).sort((x, y) => (x.name < y.name ? -1 : 1))) {
    if (e.isDirectory()) copiar(path.join(de, e.name), path.join(a, e.name));
    else if (e.isFile()) fs.copyFileSync(path.join(de, e.name), path.join(a, e.name));
  }
}

// Borra un árbol que acaba de escribir este proceso (unlinkSync: en Node 24.11 para Windows, rmSync no borra
// un nombre con acentos y no lanza).
function borrarArbol(ruta: string): void {
  const info = fs.lstatSync(ruta, { throwIfNoEntry: false });
  if (!info) return;
  if (info.isDirectory() && !info.isSymbolicLink()) {
    for (const nombre of fs.readdirSync(ruta)) borrarArbol(path.join(ruta, nombre));
    fs.rmdirSync(ruta);
  } else fs.unlinkSync(ruta);
}

// `normalizar` solo se cambia en los tests, para comprobar que la barrera final funciona por sí sola.
export function escribirSitio(
  destino: string,
  porIdioma: RespuestasPorIdioma,
  raices: Raiz[],
  banda: ClaveDeBanda,
  dist: string,
  normalizar: (valor: unknown, raices: Raiz[]) => unknown = sinRutasEnTodo
): { rutas: number; archivos: number } {
  if (!fs.existsSync(path.join(dist, "index.html"))) throw fallo("STUDIO-EXPORT-SIN-FRONTEND", { dist });
  // Por idioma: datos/<idioma>/indice.json y los archivos de sus respuestas.
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

  // La última barrera: si quedara una ruta de este equipo en algo que se va a publicar, no se escribe nada.
  const minusculas = process.platform === "win32";
  const todo = [configJs, ...conjuntos.flatMap((c) => [c.textoDelIndice, ...c.archivos.values()])].join("\n");
  const buscado = minusculas ? todo.toLowerCase() : todo;
  for (const { ruta } of raices) {
    if (buscado.includes(minusculas ? ruta.toLowerCase() : ruta)) throw fallo("STUDIO-EXPORT-CON-RUTAS");
  }

  // Al lado y con otro nombre; se renombra al terminar: un export cortado no deja un sitio a medias.
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
    if (fs.existsSync(destino)) fs.rmdirSync(destino); // vacía: se comprobó antes
    fs.renameSync(temporal, destino);
  } catch (error) {
    borrarArbol(temporal);
    throw error;
  }
  return { rutas: conjuntos.reduce((n, c) => n + c.rutas, 0), archivos: conjuntos.reduce((n, c) => n + c.archivos.size, 0) };
}

// ─── El comando ─────────────────────────────────────────────────────────────
// Las raíces que se sustituyen: las de la demo (o las configuradas, con datos reales), el paquete, la carpeta
// del usuario y el temporal del sistema.
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
      // sin esa ruta configurada no hay nada que quitar
    }
  };
  anotar(() => requireBasePath(DOCS), "<Documentación>");
  anotar(() => requireBasePath(REPOS), "<repos>");
  anotar(() => configDir(), "<configuración>");
  anotar(() => stateDir(), "<estado>");
  return variantes([...configuradas, ...comunes]);
}

// /api/clientes, en el export, sobre una casa vacía: nunca la configuración real de los clientes, y sin
// ejecutar `claude`.
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
      // La palabra en cualquiera de los dos idiomas: "exportar" o "export".
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
      // Los textos del servidor (estados, avisos, el prompt ensamblado…), en el idioma del conjunto.
      if (opciones.datosReales) {
        porIdioma[idioma] = await enIdioma(idioma, () => recorrer(crearApi({ modo: "estatico", watcher: () => "apagado", sesiones: () => [], entornoInit: () => entornoInitVacio(casa) }), false));
      } else {
        // La demo de ese idioma, nunca la Documentación de quien exporta: se genera aquí y se lee con su
        // entorno prestado.
        const c = await generarDemo(path.join(trabajo, `demo-${idioma}`), idioma);
        demos.push(c);
        porIdioma[idioma] = await enIdioma(idioma, () =>
          conEntornoDeDemo(c, () => recorrer(crearApi({ modo: "estatico", watcher: () => "apagado", sesiones: () => [], entornoInit: () => entornoInitDeDemo(c) }), true))
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
