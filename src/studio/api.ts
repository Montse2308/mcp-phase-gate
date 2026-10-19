// La API de lectura del Studio (§7.5 del plan). Cada respuesta se arma con las MISMAS funciones que usan
// las tools y `doctor`: aquí no hay lógica de dominio, solo la traducción a JSON. Donde una tool
// devolvía texto, se usa la función de datos que hay debajo (estadoDeLotes, planDeArchivo…).
//
// Los parámetros de ruta (`:p`, `:t`) y `archivo` se decodifican UNA vez y pasan por validarSegmento
// y las reglas de ruta de siempre (estaDentroReal, nada que empiece por punto, nada de .git, tampoco a
// través de un enlace o de un nombre corto 8.3). Un proyecto o una tarea que no existen dan 404; un
// parámetro que no es un nombre válido, 400. Ningún GET escribe en el disco, y los errores no llevan
// las rutas absolutas del equipo: se sustituyen por <Documentación>, <repos>, <configuración>,
// <estado> o ~.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { DOCS, REPOS, SERVER_VERSION, configDir, leerVariable, requireBasePath, stateDir } from "../config.js";
import { diagnosticarSinBloquear } from "../diagnostico.js";
import { enIdioma, mensaje } from "../i18n/mensajes.js";
import { capasDe, configuracionDe, contenidoEfectivoDeRanura, contextoInicialDe, ensamblarFase, fasesDe } from "../capas.js";
import type { Capa } from "../capas.js";
import { CLIENTES, detectarClientes, planDeArchivo, planDeClaude } from "../init.js";
import type { EntornoInit } from "../init.js";
import { datosDeCommit } from "../git.js";
import { VERIFICACIONES_A_LA_VEZ, enParalelo, estadoDeLotes, faseDeLotes, recibosDeLaTarea } from "../lotes.js";
import { conCacheDelIdioma, idiomaDelProyecto, leerManifiesto, presetsDisponibles, resolverRepos } from "../manifiesto.js";
import { discoverProjects, esSegmentoDeGit, estaDentro, leerTextoAcotado, requireProjectFolder, rutaReal, validarSegmento } from "../paths.js";
import { separarFrontmatter } from "../phases.js";
import type { PhaseFile } from "../phases.js";
import { etiquetaDeLote, parsearRecibo } from "../recibos.js";
import type { Recibo } from "../recibos.js";
import { archivoDeTarea } from "../recursos.js";
import { estadosConPlazo, resolverRepo } from "../repos.js";
import { textoDelPromptDeFase } from "../servidor.js";
import { avisoDeCompuerta, avisoDePendientes, describeEstado, detectarSalto, listarTareas, tareaActiva, tieneValidacionesPendientes } from "../tasks.js";
import type { EstadoTarea } from "../tasks.js";
import type {
  BitacoraRespuesta,
  ClientesRespuesta,
  DocumentoRespuesta,
  Estacion,
  EstadoRespuesta,
  EstadoTareaApi,
  EventoDeBitacora,
  LotesRespuesta,
  Modo,
  PlanDeClienteApi,
  PromptRespuesta,
  ProyectoApi,
  ProyectosRespuesta,
  RepoApi,
  SesionApi,
  TareaRespuesta,
  TareasRespuesta,
} from "./contrato.js";
import { ErrorDeAccion, crearAcciones } from "./acciones.js";
import { sinRutasDelEquipo } from "./privacidad.js";
import type { ManejadorApi, PeticionApi, RespuestaApi } from "./servidor.js";

export type ContextoApi = {
  modo: Modo; // "estatico" solo al exportar (exportar.ts): ningún servidor sirve en ese modo
  watcher: () => EstadoRespuesta["studio"]["watcher"];
  sesiones: () => SesionApi[];
  // Para /api/clientes: la carpeta del usuario, APPDATA y cómo se ejecuta `claude`. En los tests y en la
  // demo, uno falso: nunca la configuración real de los clientes.
  entornoInit: () => EntornoInit;
  // El SSE (L03), si lo hay.
  eventos?: (peticion: PeticionApi, res: import("http").ServerResponse) => void;
};

// ─── Errores ────────────────────────────────────────────────────────────────
export class ErrorHttp extends Error {
  constructor(
    readonly estado: number,
    message: string
  ) {
    super(message);
  }
}

export { sinRutasDelEquipo };

function mensajeDe(error: unknown): string {
  return sinRutasDelEquipo(error instanceof Error ? error.message : String(error));
}

// El estado de un error que no es un ErrorHttp, por su mensaje: así las funciones de dominio no saben
// nada de HTTP.
// Desde la Etapa 6 los errores llevan su código (ErrorConCodigo) y su texto puede estar en inglés: se mira
// primero el código. El texto queda de respaldo para un error que no lo tenga.
const POR_CODIGO: [RegExp, number][] = [
  [/^(?:RUTA-PROYECTO-NO-EXISTE|RECURSO-[A-Z-]*NO-EXISTE|RECURSO-SIN-SUBCARPETA-DE-RECIBOS|EJECT-[A-Z-]*NO-EXISTE|LOTE-TAREA-NO-EXISTE)$/, 404],
  [/^(?:RUTA-FUERA-[A-Z-]+|RUTA-GIT-POR-ENLACE|RUTA-ENTRA-EN-GIT|REPOS-PATH-FUERA|REPOS-PATH-GIT-POR-ENLACE|REPOS-PATH-EN-GIT|RECURSO-FUERA-DE-TAREA)$/, 403],
  [/^(?:RUTA-SEGMENTO-INVALIDO|RUTA-NOMBRE-CON-PUNTO|RECURSO-CON-PUNTO)$/, 400],
  [/^(?:RUTA-DEMASIADO-GRANDE|RUTA-CRECIO|RUTA-BINARIO|RUTA-ES-CARPETA|RUTA-NO-ES-ARCHIVO-NORMAL|MANIFIESTO-TXT-[A-Z-]+|MAQUINA-TXT-[A-Z-]+)$/, 422],
];

function estadoDe(error: unknown): number {
  if (error instanceof ErrorHttp) return error.estado;
  const codigo = (error as { codigo?: unknown })?.codigo;
  if (typeof codigo === "string") {
    const encontrado = POR_CODIGO.find(([patron]) => patron.test(codigo));
    if (encontrado) return encontrado[1];
  }
  const texto = error instanceof Error ? error.message : String(error);
  if (/^No existe/.test(texto) || /no existe en ninguna capa/.test(texto)) return 404;
  if (/^Acceso denegado/.test(texto)) return 403;
  if (/ no es válido: /.test(texto)) return 400;
  if (/empiezan por punto/.test(texto)) return 400;
  if (/límite de lectura|parece binario|no es un archivo/.test(texto)) return 422;
  // Un phase-gate.json o un machine.json mal escritos: el proyecto existe, pero no se puede leer su configuración.
  if (/^(?:phase-gate|machine)\.json .*no es válido/.test(texto)) return 422;
  return 500;
}

// ─── Parámetros ─────────────────────────────────────────────────────────────
// Un segmento de la ruta de la API, decodificado una vez y validado.
function segmento(crudo: string, campo: string): string {
  let valor: string;
  try {
    valor = decodeURIComponent(crudo);
  } catch {
    throw new ErrorHttp(400, mensaje("STUDIO-CODIFICACION-INVALIDA", { campo }));
  }
  return nombreValido(valor, campo);
}

// Un nombre ya decodificado (los de la consulta los decodifica URLSearchParams): solo se valida.
function nombreValido(valor: string, campo: string): string {
  validarSegmento(valor, campo);
  if (valor.startsWith(".")) throw new ErrorHttp(400, mensaje("STUDIO-EMPIEZA-POR-PUNTO", { campo }));
  return valor;
}

function proyectoDe(crudo: string): string {
  return requireProjectFolder(segmento(crudo, "proyecto"));
}

function tareaDe(carpetaProyecto: string, crudo: string, phases: Map<number, PhaseFile>, yaDecodificado = false): EstadoTarea {
  const nombre = yaDecodificado ? nombreValido(crudo, "tarea") : segmento(crudo, "tarea");
  const estado = listarTareas(carpetaProyecto, phases).find((t) => t.taskName === nombre);
  if (!estado) throw new ErrorHttp(404, mensaje("STUDIO-TAREA-NO-EXISTE", { tarea: nombre, proyecto: carpetaProyecto }));
  return estado;
}

function tareaApi(estado: EstadoTarea, phases: Map<number, PhaseFile>): EstadoTareaApi {
  return {
    tarea: estado.taskName,
    fasesHechas: estado.fasesHechas,
    siguienteFase: estado.siguienteFase,
    fasesConDocumento: estado.fasesConDocumento,
    ultimoCambio: estado.ultimoCambio,
    lotes: estado.lotes,
    descripcion: describeEstado(estado, phases),
  };
}

// ─── /api/estado ────────────────────────────────────────────────────────────
async function estado(ctx: ContextoApi): Promise<EstadoRespuesta> {
  return { diagnostico: await diagnosticarSinBloquear(), studio: { version: SERVER_VERSION, modo: ctx.modo, watcher: ctx.watcher() } };
}

// ─── /api/proyectos ─────────────────────────────────────────────────────────
async function proyecto(nombre: string, sesiones: SesionApi[]): Promise<ProyectoApi> {
  const lectura = leerManifiesto(nombre);
  let errorDeConfiguracion: string | null = null;
  let preset: ProyectoApi["preset"] = null;
  let reglas: ProyectoApi["reglas"] = null;
  try {
    const config = configuracionDe(nombre);
    preset = { nombre: config.preset.nombre, origen: config.origenPreset };
    reglas = { lotes: config.reglas.lotes, commits: config.reglas.commits, origenLotes: config.reglas.origen.lotes, origenCommits: config.reglas.origen.commits };
  } catch (error) {
    errorDeConfiguracion = mensajeDe(error);
  }

  // Una vía por repo del manifiesto, con su estado de git: el mismo de repo_status (estadoDeRepo), en
  // paralelo y con plazo.
  let repos: RepoApi[] = [];
  if (lectura.estado === "valido" && lectura.manifiesto.repos.length) {
    try {
      const resueltos = resolverRepos(nombre, lectura.manifiesto.repos);
      const estados = await estadosConPlazo(resueltos);
      repos = resueltos.map((repo, i) => {
        const e = estados[i] ?? null;
        return {
          id: repo.id,
          rol: repo.rol,
          origenRuta: repo.origenRuta,
          existe: repo.existe,
          esGit: e?.esGit ?? false,
          rama: e?.rama ?? null,
          separado: e?.separado ?? false,
          head: e?.head ?? null,
          adelante: e?.adelante ?? null,
          atras: e?.atras ?? null,
          limpio: e?.limpio ?? null,
          cambios: e?.cambios ?? 0,
          sinSeguimiento: e?.sinSeguimiento ?? 0,
          respondio: e !== null,
          error: e?.error ? mensajeDe(e.error) : repo.error ? mensajeDe(repo.error) : null,
        };
      });
    } catch (error) {
      errorDeConfiguracion ??= mensajeDe(error);
    }
  }

  let tareas = 0;
  let activa: ProyectoApi["activa"] = null;
  try {
    const phases = fasesDe(nombre);
    const lista = listarTareas(nombre, phases);
    tareas = lista.length;
    const encontrada = tareaActiva(nombre, phases, lista);
    if (encontrada) {
      activa = {
        tarea: encontrada.estado.taskName,
        origen: encontrada.origen,
        descripcion: describeEstado(encontrada.estado, phases),
        siguienteFase: encontrada.estado.siguienteFase,
        lotes: encontrada.estado.lotes,
      };
    }
  } catch (error) {
    errorDeConfiguracion ??= mensajeDe(error);
  }

  return {
    nombre,
    manifiesto: { estado: lectura.estado, error: lectura.estado === "invalido" ? sinRutasDelEquipo(lectura.error) : null },
    preset,
    reglas,
    errorDeConfiguracion,
    repos,
    tareas,
    activa,
    sesiones: sesiones.filter((s) => s.proyecto !== null && s.proyecto.toLowerCase() === nombre.toLowerCase()),
  };
}

async function proyectos(ctx: ContextoApi): Promise<ProyectosRespuesta> {
  const presets = [...presetsDisponibles().keys()].sort();
  let nombres: string[];
  try {
    nombres = [...discoverProjects().values()].sort();
  } catch (error) {
    return { proyectos: [], presets, error: mensajeDe(error) };
  }
  const sesiones = ctx.sesiones();
  return { proyectos: await Promise.all(nombres.map((nombre) => proyecto(nombre, sesiones))), presets, error: null };
}

// ─── /api/proyectos/:p/tareas ───────────────────────────────────────────────
function tareas(crudo: string): TareasRespuesta {
  const carpeta = proyectoDe(crudo);
  const phases = fasesDe(carpeta);
  const lista = listarTareas(carpeta, phases);
  const activa = tareaActiva(carpeta, phases, lista);
  return {
    proyecto: carpeta,
    activa: activa ? { tarea: activa.estado.taskName, origen: activa.origen } : null,
    tareas: lista.map((t) => tareaApi(t, phases)),
  };
}

// ─── /api/tareas/:p/:t ──────────────────────────────────────────────────────
const ESTADOS_PENDIENTES = new Set(["con pendientes", "fallido", "descartado"]);

function recibosDe(carpetaTarea: string, subcarpeta: string): string[] {
  const carpeta = path.join(carpetaTarea, subcarpeta);
  try {
    return fs
      .readdirSync(carpeta, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md") && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function textoSinFallar(ruta: string): string | null {
  try {
    return leerTextoAcotado(ruta);
  } catch {
    return null;
  }
}

function mtimeDe(ruta: string): number | null {
  try {
    return fs.statSync(ruta).mtimeMs;
  } catch {
    return null;
  }
}

// Las estaciones del tablero, con su señal (§7.7.2):
//   verde    el documento existe y no trae `## Validaciones pendientes` con contenido;
//   ámbar    existe con pendientes (la misma sección, o un recibo con pendientes, fallido o descartado,
//            como avisoDePendientes), o es la fase de los lotes con recibos y sin documento ("en curso");
//   rojo     falta y hay una fase posterior presente (detectarSalto);
//   apagado  todavía no toca.
export function estaciones(carpetaProyecto: string, estado: EstadoTarea, phases: Map<number, PhaseFile>): Estacion[] {
  const ordenadas = [...phases.entries()].filter(([, d]) => d.documento).sort((a, b) => a[0] - b[0]);
  const presente = (numero: number, datos: PhaseFile): boolean =>
    fs.existsSync(path.join(estado.folderPath, datos.documento!)) || (datos.recibos ? recibosDe(estado.folderPath, datos.recibos).length > 0 : false);
  const ultimaPresente = ordenadas.filter(([n, d]) => presente(n, d)).map(([n]) => n).pop() ?? 0;
  const huecos = new Set((detectarSalto(ultimaPresente, estado, phases)?.faltan ?? []).map((f) => f.fase));

  const lista: Estacion[] = [];
  const contexto = contextoInicialDe(carpetaProyecto);
  const rutaContexto = path.join(estado.folderPath, contexto);
  const hayContexto = fs.existsSync(rutaContexto);
  lista.push({
    numero: 0,
    titulo: mensaje("STUDIO-CONTEXTO-INICIAL"),
    documento: contexto,
    existe: hayContexto,
    senal: hayContexto ? "verde" : ultimaPresente > 0 ? "rojo" : "apagado",
    texto: hayContexto ? "cerrada" : ultimaPresente > 0 ? "hueco" : "pendiente",
    mtimeMs: hayContexto ? mtimeDe(rutaContexto) : null,
    recibos: null,
  });

  for (const [numero, datos] of ordenadas) {
    const ruta = path.join(estado.folderPath, datos.documento!);
    const existe = fs.existsSync(ruta);
    const recibos = datos.recibos ? recibosDe(estado.folderPath, datos.recibos) : [];
    let senal: Estacion["senal"];
    let texto: Estacion["texto"];
    if (existe) {
      const contenido = textoSinFallar(ruta);
      const conPendientes =
        (contenido !== null && tieneValidacionesPendientes(contenido)) ||
        (contenido !== null && datos.recibos !== undefined && ESTADOS_PENDIENTES.has((separarFrontmatter(contenido).meta.estado ?? "").trim().toLowerCase())) ||
        recibos.some((r) => {
          const texto = textoSinFallar(path.join(estado.folderPath, datos.recibos!, r));
          return texto !== null && ESTADOS_PENDIENTES.has((separarFrontmatter(texto).meta.estado ?? "").trim().toLowerCase());
        });
      [senal, texto] = conPendientes ? ["ambar", "con pendientes"] : ["verde", "cerrada"];
    } else if (recibos.length) {
      [senal, texto] = ["ambar", "en curso"];
    } else if (huecos.has(numero)) {
      [senal, texto] = ["rojo", "hueco"];
    } else {
      [senal, texto] = ["apagado", "pendiente"];
    }
    lista.push({ numero, titulo: datos.title, documento: datos.documento!, existe, senal, texto, mtimeMs: existe ? mtimeDe(ruta) : null, recibos: datos.recibos ?? null });
  }
  return lista;
}

function tarea(crudoP: string, crudoT: string): TareaRespuesta {
  const carpeta = proyectoDe(crudoP);
  const phases = fasesDe(carpeta);
  const estado = tareaDe(carpeta, crudoT, phases);
  const deRecibos = [...phases.values()].find((d) => d.recibos)?.recibos ?? null;
  // La fase que se pediría a continuación: la siguiente a la última hecha. Con un hueco, es la que
  // recibiría el aviso de la compuerta.
  const siguiente = (estado.fasesHechas.length ? Math.max(...estado.fasesHechas) : 0) + 1;
  const opciones = { project: carpeta, taskName: estado.taskName };
  return {
    proyecto: carpeta,
    estado: tareaApi(estado, phases),
    estaciones: estaciones(carpeta, estado, phases),
    recibos: deRecibos ? recibosDe(estado.folderPath, deRecibos).map((r) => `${deRecibos}/${r}`) : [],
    compuerta: phases.has(siguiente) ? avisoDeCompuerta(siguiente, phases, opciones) : null,
    pendientes: phases.has(estado.siguienteFase ?? siguiente) ? avisoDePendientes(estado.siguienteFase ?? siguiente, estado, phases) : null,
  };
}

// ─── /api/tareas/:p/:t/documento?archivo= ───────────────────────────────────
function documento(crudoP: string, crudoT: string, consulta: URLSearchParams): DocumentoRespuesta {
  const archivos = consulta.getAll("archivo");
  if (archivos.length !== 1 || !archivos[0]) throw new ErrorHttp(400, mensaje("STUDIO-FALTA-ARCHIVO"));
  const carpeta = proyectoDe(crudoP);
  const nombreTarea = segmento(crudoT, "tarea");
  // URLSearchParams ya decodificó `archivo` una vez; no se vuelve a decodificar.
  const partes = archivos[0].split("/");
  const { ruta, tarea: carpetaTarea } = archivoDeTarea(carpeta, nombreTarea, partes);
  // La regla de .git y de los nombres con punto, también sobre la ruta resuelta: un enlace o un nombre
  // corto 8.3 (GIT~1) dentro de la tarea no lleva a .git ni a un archivo oculto.
  const real = path.relative(rutaReal(carpetaTarea), rutaReal(ruta)).split(/[\\/]/);
  if (real.some((s) => s.startsWith(".") || esSegmentoDeGit(s))) throw new ErrorHttp(403, mensaje("STUDIO-ARCHIVO-OCULTO"));
  const texto = leerTextoAcotado(ruta).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return { proyecto: carpeta, tarea: nombreTarea, archivo: partes.join("/"), texto, frontmatter: separarFrontmatter(texto).meta, mtimeMs: fs.statSync(ruta).mtimeMs };
}

// ─── /api/tareas/:p/:t/lotes ────────────────────────────────────────────────
async function lotes(crudoP: string, crudoT: string, consulta: URLSearchParams): Promise<LotesRespuesta> {
  const carpeta = proyectoDe(crudoP);
  const estado = tareaDe(carpeta, crudoT, fasesDe(carpeta));
  const reverificar = consulta.get("reverificar") === "1";
  try {
    const { salida } = await estadoDeLotes(carpeta, estado.taskName, { reverificar });
    const sellos = sellosDeLaTarea(carpeta, estado.taskName);
    return {
      disponible: true,
      reverificado: reverificar,
      estado: {
        ...salida,
        lotes: salida.lotes.map((f) => ({ ...f, problema: f.problema === null ? null : sinRutasDelEquipo(f.problema), sello: f.recibo ? (sellos.get(f.recibo) ?? null) : null })),
        avisos: salida.avisos.map(sinRutasDelEquipo),
      },
    };
  } catch (error) {
    return { disponible: false, motivo: mensajeDe(error) };
  }
}

// Lo que el tablero pinta en cada sello y estadoDeLotes no da por separado: el SHA corto, los 8 primeros
// caracteres del sha256 y la fecha del recibo. Se leen con las mismas funciones del motor de lotes, por la
// ruta relativa del recibo (la que da estadoDeLotes). Con un solo lote y la fase cerrada, el recibo es el
// documento de la fase.
type Sello = { corto: string | null; sha256: string | null; fecha: string | null };

function sellosDeLaTarea(carpetaProyecto: string, taskName: string): Map<string, Sello> {
  const sellos = new Map<string, Sello>();
  const deRecibo = (recibo: Recibo): Sello => ({
    corto: recibo.ancla.tipo === "commit" ? recibo.ancla.corto : null,
    sha256: recibo.ancla.tipo === "sha256" ? recibo.ancla.sha256.slice(0, 8) : null,
    fecha: recibo.fecha || null,
  });
  try {
    const fase = faseDeLotes(carpetaProyecto, taskName);
    for (const recibos of recibosDeLaTarea(fase).values()) for (const r of recibos) sellos.set(`${fase.recibos}/${r.nombre}`, deRecibo(r.recibo));
    const documento = fase.documento ? path.join(fase.carpetaTarea, fase.documento) : null;
    if (documento && fs.existsSync(documento)) {
      try {
        sellos.set(fase.documento!, deRecibo(parsearRecibo(leerTextoAcotado(documento), fase.documento!)));
      } catch {
        // un índice de varios lotes no es un recibo: no tiene sello propio
      }
    }
  } catch {
    // sin recibos legibles, los vagones van sin detalle; estadoDeLotes ya lo dijo
  }
  return sellos;
}

// ─── /api/tareas/:p/:t/bitacora ─────────────────────────────────────────────
// La línea de tiempo de la tarea (§7.7.5), de lo más reciente a lo más antiguo:
//   documento     el mtime de cada documento que existe (creado o modificado: el disco no distingue);
//   recibo        el `registrado` del frontmatter de cada recibo (o su mtime, si es de la 2.x);
//   commit        la fecha del commit anclado (%cI), con su asunto y su SHA corto (datosDeCommit);
//   reanclaje     la fecha de cada línea "Reanclado el …" de la sección "Verificación del commit";
//   fase-cerrada  el `registrado` más reciente de los recibos, si la fase tiene su documento.
// Una escritura con confirmación (force o elicitation) no deja rastro propio en el disco —un recibo de la
// escotilla solo queda con `origen: manual`, igual que uno de la 2.x—, así que no aparece.
const REANCLADO = /^(?:Reanclado el|Re-anchored on) (\d{4}-\d{2}-\d{2}): (.*)$/;

async function bitacora(crudoP: string, crudoT: string): Promise<BitacoraRespuesta> {
  const carpeta = proyectoDe(crudoP);
  const phases = fasesDe(carpeta);
  const estado = tareaDe(carpeta, crudoT, phases);
  const eventos: EventoDeBitacora[] = [];
  const iso = (ms: number): string => new Date(ms).toISOString();

  for (const e of estaciones(carpeta, estado, phases)) {
    if (!e.existe || e.mtimeMs === null) continue;
    eventos.push({ tipo: "documento", fecha: iso(e.mtimeMs), titulo: mensaje("STUDIO-BITACORA-DOCUMENTO", { numero: e.numero, titulo: e.titulo, documento: e.documento }), archivo: e.documento, lote: null, commit: null });
  }

  let fase: ReturnType<typeof faseDeLotes> | null = null;
  try {
    fase = faseDeLotes(carpeta, estado.taskName);
  } catch {
    fase = null;
  }
  if (fase) {
    const recibos: { recibo: Recibo; relativo: string; mtimeMs: number }[] = [];
    try {
      for (const lista of recibosDeLaTarea(fase).values()) for (const r of lista) recibos.push({ recibo: r.recibo, relativo: `${fase.recibos}/${r.nombre}`, mtimeMs: r.mtimeMs });
    } catch {
      // un recibo ilegible: el resto de la bitácora sigue (doctor lo avisa)
    }
    const documento = fase.documento ? path.join(fase.carpetaTarea, fase.documento) : null;
    const cerrada = documento !== null && fs.existsSync(documento);
    if (cerrada && recibos.length === 0) {
      try {
        recibos.push({ recibo: parsearRecibo(leerTextoAcotado(documento!), fase.documento!), relativo: fase.documento!, mtimeMs: fs.statSync(documento!).mtimeMs });
      } catch {
        // con varios lotes el documento es un índice, no un recibo
      }
    }

    for (const { recibo, relativo, mtimeMs } of recibos) {
      const lote = etiquetaDeLote(recibo.lote);
      const commit = recibo.ancla.tipo === "commit" ? { corto: recibo.ancla.corto, asunto: recibo.ancla.asunto } : null;
      eventos.push({ tipo: "recibo", fecha: recibo.registrado || iso(mtimeMs), titulo: mensaje("STUDIO-BITACORA-RECIBO", { lote, titulo: recibo.titulo, estado: recibo.estado }), archivo: relativo, lote, commit });
      for (const linea of (recibo.verificacionDelCommit ?? "").split("\n")) {
        const m = linea.match(REANCLADO);
        if (m) eventos.push({ tipo: "reanclaje", fecha: m[1]!, titulo: mensaje("STUDIO-BITACORA-REANCLAJE", { lote, detalle: m[2]!.replace(/`/g, "") }), archivo: relativo, lote, commit: null });
      }
    }

    // Los commits, en paralelo y de seis en seis, con la puerta de git. Uno que ya no existe (un rebase) no
    // tiene fecha que enseñar: no sale.
    const conCommit = recibos.filter((r) => r.recibo.ancla.tipo === "commit");
    const datos = await enParalelo(conCommit, VERIFICACIONES_A_LA_VEZ, async ({ recibo }) => {
      const ancla = recibo.ancla as Extract<Recibo["ancla"], { tipo: "commit" }>;
      try {
        return await datosDeCommit(resolverRepo(carpeta, ancla.repo || recibo.repo || "").ruta!, ancla.sha);
      } catch {
        return null;
      }
    });
    conCommit.forEach(({ recibo, relativo }, i) => {
      const d = datos[i];
      if (d && d.fecha) eventos.push({ tipo: "commit", fecha: d.fecha, titulo: d.asunto, archivo: relativo, lote: etiquetaDeLote(recibo.lote), commit: { corto: d.corto, asunto: d.asunto } });
    });

    const registrados = recibos.map((r) => r.recibo.registrado).filter(Boolean).sort();
    if (cerrada && registrados.length) {
      eventos.push({ tipo: "fase-cerrada", fecha: registrados[registrados.length - 1]!, titulo: mensaje("STUDIO-BITACORA-FASE-CERRADA", { numero: fase.numero, titulo: fase.titulo, documento: fase.documento }), archivo: fase.documento, lote: null, commit: null });
    }
  }

  const momento = (fecha: string): number => Date.parse(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  eventos.sort((a, b) => momento(b.fecha) - momento(a.fecha));
  return { proyecto: carpeta, tarea: estado.taskName, eventos };
}

// ─── /api/prompts/:p/:fase?tarea= ───────────────────────────────────────────
// De qué capa sale el contenido de una ranura, dicho para la ficha del Taller: "fábrica", "preset: <nombre>",
// "reglas: <variante>", "global" o "proyecto". `contenidoDe` es "fábrica" o "<archivo>:<línea>" (en Windows
// el archivo lleva sus propios ":", así que se corta por el último).
export function capaDeProcedencia(contenidoDe: string, capas: Capa[]): string {
  if (contenidoDe === "fábrica") return "fábrica";
  const corte = contenidoDe.lastIndexOf(":");
  const archivo = path.resolve(corte > 0 ? contenidoDe.slice(0, corte) : contenidoDe);
  for (const capa of [...capas].sort((a, b) => b.orden - a.orden)) {
    if (capa.orden === 2 || capa.orden === 2.5) {
      if (path.resolve(capa.ruta) === archivo) return `${capa.etiqueta}: ${path.basename(capa.ruta, ".md")}`;
    } else if (estaDentro(capa.ruta, archivo)) {
      return capa.etiqueta;
    }
  }
  return "desconocida";
}

async function prompt(crudoP: string, crudoFase: string, consulta: URLSearchParams): Promise<PromptRespuesta> {
  const carpeta = proyectoDe(crudoP);
  if (!/^\d{1,3}$/.test(crudoFase)) throw new ErrorHttp(400, mensaje("STUDIO-FASE-NO-ES-NUMERO"));
  const fase = Number(crudoFase);
  const phases = fasesDe(carpeta);
  if (!phases.has(fase)) throw new ErrorHttp(404, mensaje("STUDIO-FASE-NO-EXISTE", { fase, proyecto: carpeta, fases: [...phases.keys()].sort((a, b) => a - b).join(", ") }));
  const crudoTarea = consulta.get("tarea");
  // Sin tarea, la activa del proyecto, como get_phase_prompt con `project` y sin `task_name`.
  const elegida = crudoTarea ? tareaDe(carpeta, crudoTarea, phases, true) : (tareaActiva(carpeta, phases)?.estado ?? null);
  const carpetaTarea = elegida?.folderPath ?? null;

  // El texto exacto que recibe el modelo: get_phase_prompt habla en el idioma del proyecto, no en el de la
  // interfaz del Studio, así que se ensambla en ese (como hace la tool al resolver el proyecto).
  const opcionesDelPrompt = { project: carpeta, task_name: crudoTarea ? elegida!.taskName : undefined, carpetaProyecto: carpeta, deducido: null };
  const texto = await enIdioma(idiomaDelProyecto(carpeta).idioma, () => textoDelPromptDeFase(fase, opcionesDelPrompt));
  const capas = capasDe(carpeta, carpetaTarea);
  const ensamblado = ensamblarFase(fase, carpeta, carpetaTarea);
  const fabrica: Capa[] = capas.filter((c) => c.orden === 1);
  const config = configuracionDe(carpeta, carpetaTarea);
  return {
    proyecto: carpeta,
    fase,
    tarea: elegida?.taskName ?? null,
    texto,
    capas: capas.map((c) => ({ orden: c.orden, etiqueta: c.etiqueta, ruta: c.ruta, existe: fs.existsSync(c.ruta) })),
    ranuras: ensamblado.procedencia.map((p) => ({
      id: p.ranura,
      contenidoDe: p.contenidoDe,
      capa: capaDeProcedencia(p.contenidoDe, capas),
      modos: p.modos,
      efectivo: contenidoEfectivoDeRanura(capas, p.ranura)?.contenido ?? "",
      fabrica: contenidoEfectivoDeRanura(fabrica, p.ranura)?.contenido ?? null,
    })),
    avisos: ensamblado.avisos,
    preset: { nombre: config.preset.nombre, origen: config.origenPreset },
    reglas: { lotes: config.reglas.lotes, commits: config.reglas.commits },
    fases: [...phases.entries()].sort((a, b) => a[0] - b[0]).map(([numero, d]) => ({ numero, titulo: d.title })),
  };
}

// ─── /api/clientes ──────────────────────────────────────────────────────────
// Lo que haría `init --dry-run` en cada cliente, con la misma función que init (planDeArchivo y
// planDeClaude). No escribe nada; para Claude Code ejecuta `claude --version` y `claude mcp list`.
function conTilde(ruta: string, home: string): string {
  const relativa = path.relative(home, ruta);
  return relativa && !relativa.startsWith("..") && !path.isAbsolute(relativa) ? `~/${relativa.split(path.sep).join("/")}` : ruta;
}

const NOMBRES: Record<(typeof CLIENTES)[number], string> = { "claude-code": "Claude Code", cursor: "Cursor", vscode: "VS Code" };

export async function planesDeClientes(entorno: EntornoInit): Promise<PlanDeClienteApi[]> {
  const docs = leerVariable("DOCS_PATH").valor;
  const repos = leerVariable("REPOS_PATH").valor;
  const existe = (ruta: string | undefined): ruta is string => Boolean(ruta) && (fs.statSync(path.resolve(ruta!), { throwIfNoEntry: false })?.isDirectory() ?? false);
  const detectados = await detectarClientes(entorno);
  const rutas = existe(docs) && existe(repos) ? { docs: path.resolve(docs), repos: path.resolve(repos) } : null;

  const planes: PlanDeClienteApi[] = [];
  for (const cliente of CLIENTES) {
    const base = { cliente, nombre: NOMBRES[cliente], detectado: detectados.includes(cliente) };
    if (!rutas) {
      planes.push({ ...base, estado: "sin-rutas", archivo: null, comando: null, diff: null, mensaje: mensaje("STUDIO-SIN-RUTAS") });
      continue;
    }
    if (cliente === "claude-code") {
      const plan = await planDeClaude(rutas, null, entorno);
      const texto =
        plan.estado === "sin-lista"
          ? mensaje("STUDIO-CLIENTE-SIN-LISTA", { detalle: sinRutasDelEquipo(plan.mensaje) })
          : plan.estado === "existente"
            ? mensaje("STUDIO-CLIENTE-EXISTENTE", { clave: plan.existente })
            : mensaje("STUDIO-CLIENTE-CLAUDE-NUEVO", { clave: plan.clave });
      planes.push({ ...base, estado: plan.estado, archivo: null, comando: plan.estado === "sin-lista" ? null : plan.comando, diff: null, mensaje: texto });
      continue;
    }
    const plan = planDeArchivo(cliente, rutas, null, entorno);
    const archivo = conTilde(plan.archivo, entorno.home);
    let texto: string;
    let diff: string | null = null;
    switch (plan.estado) {
      case "roto":
        texto = mensaje("STUDIO-CLIENTE-ROTO", { archivo });
        break;
      case "forma-rara":
        texto = mensaje("STUDIO-CLIENTE-FORMA-RARA", { archivo, seccion: plan.seccion });
        break;
      case "clave-ocupada":
        texto = mensaje("STUDIO-CLIENTE-CLAVE-OCUPADA", { clave: plan.clave, archivo });
        break;
      case "sin-cambios":
        texto = mensaje("STUDIO-CLIENTE-SIN-CAMBIOS", { clave: plan.claveFinal });
        break;
      default:
        diff = plan.diff ?? plan.entrada.split("\n").map((linea) => `+ ${linea}`).join("\n");
        texto =
          mensaje(plan.estado === "nuevo" ? "STUDIO-CLIENTE-NUEVO" : "STUDIO-CLIENTE-ACTUALIZA", { clave: plan.claveFinal }) +
          (plan.comentarios ? mensaje("STUDIO-CLIENTE-COMENTARIOS") : "");
    }
    planes.push({ ...base, estado: plan.estado, archivo, comando: null, diff, mensaje: texto });
  }
  return planes;
}

// ─── El enrutado ────────────────────────────────────────────────────────────
type Ruta = { patron: RegExp; atender: (m: RegExpMatchArray, p: PeticionApi) => Promise<unknown> | unknown };

export function crearApi(ctx: ContextoApi): ManejadorApi {
  const rutas: Ruta[] = [
    { patron: /^\/estado$/, atender: () => estado(ctx) },
    { patron: /^\/proyectos$/, atender: () => proyectos(ctx) },
    { patron: /^\/proyectos\/([^/]+)\/tareas$/, atender: (m) => tareas(m[1]!) },
    { patron: /^\/tareas\/([^/]+)\/([^/]+)$/, atender: (m) => tarea(m[1]!, m[2]!) },
    { patron: /^\/tareas\/([^/]+)\/([^/]+)\/documento$/, atender: (m, p) => documento(m[1]!, m[2]!, p.consulta) },
    { patron: /^\/tareas\/([^/]+)\/([^/]+)\/lotes$/, atender: (m, p) => lotes(m[1]!, m[2]!, p.consulta) },
    { patron: /^\/tareas\/([^/]+)\/([^/]+)\/bitacora$/, atender: (m) => bitacora(m[1]!, m[2]!) },
    { patron: /^\/prompts\/([^/]+)\/([^/]+)$/, atender: (m, p) => prompt(m[1]!, m[2]!, p.consulta) },
    { patron: /^\/clientes$/, atender: async (): Promise<ClientesRespuesta> => ({ clientes: await planesDeClientes(ctx.entornoInit()) }) },
  ];

  const acciones = crearAcciones({ entornoInit: ctx.entornoInit });
  return async (peticion, res): Promise<RespuestaApi | "manejada"> => {
    if (peticion.ruta === "/eventos" && peticion.metodo === "GET" && ctx.eventos) {
      ctx.eventos(peticion, res);
      return "manejada";
    }
    // Las dos únicas escrituras: el plan con su huella, y aplicarlo (§7.6).
    if (peticion.ruta === "/acciones/plan" || peticion.ruta === "/acciones/aplicar") {
      if (peticion.metodo !== "POST") return { estado: 405, json: { error: mensaje("STUDIO-SOLO-POST") } };
      try {
        return { estado: 200, json: peticion.ruta === "/acciones/plan" ? await acciones.plan(peticion.cuerpo) : await acciones.aplicar(peticion.cuerpo) };
      } catch (error) {
        const codigo = error instanceof ErrorDeAccion ? error.estado : estadoDe(error);
        return { estado: codigo, json: { error: codigo === 500 && !(error instanceof ErrorDeAccion) ? mensaje("STUDIO-ERROR-INTERNO", { detalle: mensajeDe(error) }) : mensajeDe(error) } };
      }
    }
    for (const { patron, atender } of rutas) {
      const m = peticion.ruta.match(patron);
      if (!m) continue;
      if (peticion.metodo !== "GET") return { estado: 405, json: { error: mensaje("STUDIO-SOLO-GET") } };
      // Una lectura recuenta los documentos por idioma una vez por proyecto. Las acciones y el SSE, no: escriben
      // o viven más que una petición.
      try {
        return { estado: 200, json: await conCacheDelIdioma(() => atender(m, peticion)) };
      } catch (error) {
        const codigo = estadoDe(error);
        return { estado: codigo, json: { error: codigo === 500 ? mensaje("STUDIO-ERROR-INTERNO", { detalle: mensajeDe(error) }) : mensajeDe(error) } };
      }
    }
    return { estado: 404, json: { error: mensaje("STUDIO-RUTA-NO-EXISTE") } };
  };
}

// El entorno de init de este proceso, sin terminal: para /api/clientes en vivo.
export function entornoInitDelProceso(ejecutar: EntornoInit["ejecutar"]): EntornoInit {
  return {
    home: os.homedir(),
    appData: process.env.APPDATA ?? null,
    xdgConfig: process.env.XDG_CONFIG_HOME ?? null,
    plataforma: process.platform,
    salida: { out: () => {}, err: () => {} },
    esTerminal: false,
    preguntar: async () => "",
    ejecutar,
    ahora: () => new Date(),
  };
}

