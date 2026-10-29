// Las escrituras del Studio (§7.6 del plan): solo acciones que ya existen en el CLI, y siempre en dos pasos.
//
//   1. plan:     { accion, argumentos } → { resumen, diff, huella }. La huella es el sha256 del plan (qué
//                archivo, qué había y qué habrá; o qué comando) más el mtimeMs de cada archivo que tocaría.
//   2. aplicar:  { accion, argumentos, huella } → el servidor RECALCULA el plan y solo escribe si la huella
//                coincide; si no, 409: "El disco cambió desde que viste el cambio. Revísalo otra vez."
//
//   equipo            <configDir>/machine.json: this machine's paths, its default language and preset, and the own
//                     path of any repo (src/ajustes/equipo.ts)
//   proyecto          what changed in a project, in a single plan: its phase-gate.json and, in machine.json, only
//                     the keys of its repos (src/ajustes/proyecto.ts)
//   crear-manifiesto  init --migrate para un proyecto: crea phase-gate.json (solo crea)
//   eject             mcp-phase-gate eject <objetivo> --a … (capa global, del proyecto o carpeta de presets)
//   init-cliente      mcp-phase-gate init --cliente <c>: el mcp.json de Cursor o VS Code, o `claude mcp add`
//
// `equipo` and `proyecto` have no CLI command (nor did the `preset` and `reglas` actions they replaced, which
// `proyecto` covers); what this module protects stays: closed destinations per action, a single validation shape
// and the fingerprint.
//
// Cada acción calcula su plan con la MISMA función que el CLI (planDeEject, planDeArchivo, planDeClaude,
// manifiestoNuevo). Nunca escribe documentos de tareas, recibos ni nada de los repos: cada destino se
// comprueba antes de escribir. Una huella sirve una sola vez, y aplicar va bajo un candado del estado
// (`<stateDir>/.studio-acciones.lock`), así que dos Studios con la misma huella no aplican los dos.
//
// On top of that, each action has its own closed list of destinations (comprobarLista): per file and, in
// machine.json, per key.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import { ArgumentosDeEquipo, planDeEquipo } from "../ajustes/equipo.js";
import { leerMaquinaParaEditar, planDeEdicion } from "../ajustes/edicion-maquina.js";
import { ErrorDeArgumentos } from "../ajustes/plan.js";
import type { PlanDeAjustes } from "../ajustes/plan.js";
import { ArgumentosDeProyecto, planDeProyecto } from "../ajustes/proyecto.js";
import { DOCS, REPOS, carpetaPromptsGlobal, configDir, leerVariable, requireBasePath, stateDir } from "../config.js";
import { carpetaPromptsDeProyecto } from "../capas.js";
import { ErrorDeEject, planDeEject } from "../eject.js";
import { mensaje } from "../i18n/mensajes.js";
import { CLAVE_VALIDA, CLIENTES, carpetaDeComandos, carpetaDelCliente, diffDeLineas, idiomaParaManifiesto, manifiestoNuevo, marcaDeTiempo, planDeArchivo, planDeClaude, planDeComandos } from "../init.js";
import type { EntornoInit, QuitaDelEntorno, RutaDistinta } from "../init.js";
import { conCandado, escribirAtomico } from "../lotes.js";
import { carpetaPresetsDelUsuario, idiomaDelEquipo, presetsDisponibles, rutaManifiesto, rutaMaquina } from "../manifiesto.js";
import { estaDentroReal, requireProjectFolder, rutaReal, ubicarEnTarea, validarSegmento } from "../paths.js";
import { sinRutasDelEquipo } from "./privacidad.js";

export const ACCIONES = ["crear-manifiesto", "eject", "init-cliente", "equipo", "proyecto"] as const;
export type Accion = (typeof ACCIONES)[number];

// El 409 de una huella que ya no vale. Sale en el idioma de la petición; la constante es el texto en
// español, el de siempre (los tests la comparan).
export const DISCO_CAMBIADO = mensaje("STUDIO-DISCO-CAMBIADO", {}, "es");
const discoCambiado = (): string => mensaje("STUDIO-DISCO-CAMBIADO");
const CANDADO = ".studio-acciones.lock";

// ─── Lo que llega ───────────────────────────────────────────────────────────
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const Proyecto = z.string().min(1).max(200);
const ARGUMENTOS = {
  "crear-manifiesto": z.object({ proyecto: Proyecto, preset: z.string().regex(ID).optional() }).strict(),
  eject: z.object({ objetivo: z.string().min(1).max(120), destino: z.string().min(1).max(260), fuerza: z.boolean().optional() }).strict(),
  // quitarIdioma: also removes PHASE_GATE_LANG from the client's env (the warning that the env wins over machine.json's language).
  "init-cliente": z.object({ cliente: z.enum(CLIENTES), clave: z.string().regex(CLAVE_VALIDA).optional(), comandos: z.boolean().optional(), quitarIdioma: z.boolean().optional() }).strict(),
  equipo: ArgumentosDeEquipo,
  proyecto: ArgumentosDeProyecto,
} as const;

export const PeticionDePlan = z.object({ accion: z.enum(ACCIONES), argumentos: z.unknown() }).strict();
export const PeticionDeAplicar = z.object({ accion: z.enum(ACCIONES), argumentos: z.unknown(), huella: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

export class ErrorDeAccion extends Error {
  // `extra` is added to the body of the error response: with several files, which ones were written.
  constructor(
    readonly estado: 400 | 404 | 409 | 500,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

function argumentosDe<A extends Accion>(accion: A, crudo: unknown): z.infer<(typeof ARGUMENTOS)[A]> {
  const leido = (ARGUMENTOS[accion] as z.ZodType).safeParse(crudo);
  if (!leido.success) throw new ErrorDeAccion(400, mensaje("STUDIO-ARGUMENTOS-INVALIDOS", { accion, problemas: leido.error.issues.map((i) => ({ ruta: i.path.join("."), mensaje: i.message })) }));
  return leido.data as z.infer<(typeof ARGUMENTOS)[A]>;
}

function proyectoDe(nombre: string): string {
  validarSegmento(nombre, "proyecto");
  try {
    return requireProjectFolder(nombre);
  } catch (error) {
    throw new ErrorDeAccion(404, error instanceof Error ? error.message : String(error));
  }
}

// ─── El plan ────────────────────────────────────────────────────────────────
type Escritura = { ruta: string; antes: string | null; despues: string; copia: boolean; exclusiva: boolean };
type Comando = { comando: string; args: string[]; mostrar: string };
// `proyecto` and `cliente` are the ones the action named: its list of destinations depends on them.
type PlanInterno = { accion: Accion; resumen: string; escrituras: Escritura[]; comandos: Comando[]; hecho: string; avisos?: string[]; proyecto?: string; cliente?: (typeof CLIENTES)[number] };
type Plan = { posible: true; interno: PlanInterno } | { posible: false; motivo: string };

export type ContextoDeAcciones = {
  entornoInit: () => EntornoInit;
  // Whoever writes each file; the tests swap it so that a write fails. Without it, the atomic one.
  escribir?: (ruta: string, contenido: string) => void;
};

const leerCrudo = (ruta: string): string | null => {
  try {
    return fs.readFileSync(ruta, "utf-8");
  } catch {
    return null;
  }
};
const sinBom = (texto: string): string => texto.replace(/^\uFEFF/, "");

function planDeCrear(a: z.infer<(typeof ARGUMENTOS)["crear-manifiesto"]>): Plan {
  const proyecto = proyectoDe(a.proyecto);
  const preset = a.preset ?? "software-replica"; // el mismo valor por defecto que init --migrate
  // Con el idioma de sus documentos o, si no dicen nada, el del equipo: como init --migrate (§8.3).
  const idioma = idiomaParaManifiesto(proyecto, idiomaDelEquipo().idioma);
  if (!presetsDisponibles(idioma).has(preset)) return { posible: false, motivo: mensaje("STUDIO-PRESET-NO-EXISTE", { preset, disponibles: null }) };
  const ruta = rutaManifiesto(proyecto);
  if (fs.existsSync(ruta)) return { posible: false, motivo: mensaje("STUDIO-YA-TIENE-MANIFIESTO", { proyecto }) };
  return {
    posible: true,
    interno: { accion: "crear-manifiesto", proyecto, resumen: mensaje("STUDIO-CREAR-RESUMEN", { proyecto, preset }), escrituras: [{ ruta, antes: null, despues: manifiestoNuevo(preset, idioma), copia: false, exclusiva: true }], comandos: [], hecho: mensaje("STUDIO-CREAR-HECHO", { proyecto }) },
  };
}

// Un eject solo escribe en una capa de prompts (la global o la de un proyecto) o en la carpeta de presets.
function destinoPermitido(ruta: string, proyecto: string | null): boolean {
  const bases = [carpetaPromptsGlobal() ?? path.join(configDir(), "prompts"), carpetaPresetsDelUsuario()];
  if (proyecto) bases.push(carpetaPromptsDeProyecto(proyecto));
  return bases.some((base) => {
    try {
      return estaDentroReal(base, ruta);
    } catch {
      return false;
    }
  });
}

function planDeEjectAccion(a: z.infer<(typeof ARGUMENTOS)["eject"]>): Plan {
  let plan;
  try {
    plan = planDeEject(a.objetivo, { destino: a.destino, fuerza: a.fuerza === true });
  } catch (error) {
    if (error instanceof ErrorDeEject) return { posible: false, motivo: sinRutasDelEquipo(error.message) };
    throw new ErrorDeAccion(404, sinRutasDelEquipo(error instanceof Error ? error.message : String(error)));
  }
  if (!destinoPermitido(plan.archivo, plan.proyecto)) return { posible: false, motivo: mensaje("STUDIO-DESTINO-NO-ES-CAPA") };
  const antes = leerCrudo(plan.archivo);
  return {
    posible: true,
    interno: {
      accion: "eject",
      ...(plan.proyecto ? { proyecto: plan.proyecto } : {}),
      resumen: mensaje("STUDIO-EJECT-RESUMEN", { objetivo: a.objetivo, etiqueta: plan.etiqueta, reemplaza: plan.reemplaza }),
      escrituras: [{ ruta: plan.archivo, antes, despues: plan.texto, copia: plan.reemplaza, exclusiva: false }],
      comandos: [],
      hecho: mensaje("STUDIO-EJECT-HECHO", { archivo: plan.archivo }),
    },
  };
}

// The paths this Studio works with now (the environment, the .env or machine.json), the ones that exist.
function rutasEfectivas(): QuitaDelEntorno {
  const carpeta = (ruta: string | undefined): string | undefined => (ruta && fs.statSync(path.resolve(ruta), { throwIfNoEntry: false })?.isDirectory() ? path.resolve(ruta) : undefined);
  const documentacion = carpeta(leerVariable("DOCS_PATH").valor);
  const carpetaDeRepos = carpeta(leerVariable("REPOS_PATH").valor);
  return { ...(documentacion ? { documentacion } : {}), ...(carpetaDeRepos ? { carpetaDeRepos } : {}) };
}

// El registro en el cliente y, con `comandos`, los /fN que copiaría `init --comandos` (solo Claude Code y
// Cursor los leen de archivo). Un /fN que no generó init es de la persona: no se pisa (el CLI pide --yes).
async function planDeInit(a: z.infer<(typeof ARGUMENTOS)["init-cliente"]>, ctx: ContextoDeAcciones): Promise<Plan> {
  const entorno = ctx.entornoInit();
  const opciones = { quitarIdioma: a.quitarIdioma === true };
  const resumen: string[] = [];
  const hecho: string[] = [];
  const motivos: string[] = [];
  const escrituras: Escritura[] = [];
  const comandos: Comando[] = [];
  let escrituraDelCliente: Escritura | null = null;
  let quita: QuitaDelEntorno = {};
  // The paths the entry keeps because they are not machine.json's: that client keeps its own, and it is said.
  let distintas: RutaDistinta[] = [];
  let nombreDelCliente = "Claude Code";
  let esNueva = false;

  if (a.cliente === "claude-code") {
    const plan = await planDeClaude(a.clave ?? null, entorno, opciones);
    if (plan.estado === "sin-lista") motivos.push(`Claude Code: ${sinRutasDelEquipo(plan.mensaje)}`);
    else if (plan.estado === "existente") {
      motivos.push(mensaje("STUDIO-INIT-CLAUDE-EXISTENTE", { clave: plan.existente, comando: plan.comando }));
      quita = plan.quita;
      distintas = plan.distintas;
    } else {
      esNueva = true;
      resumen.push(mensaje("STUDIO-INIT-CLAUDE-RESUMEN", { clave: plan.clave }));
      comandos.push({ comando: "claude", args: plan.args, mostrar: plan.comando });
      hecho.push(mensaje("STUDIO-INIT-CLAUDE-HECHO", { clave: plan.clave }));
    }
  } else {
    const plan = planDeArchivo(a.cliente, a.clave ?? null, entorno, opciones);
    nombreDelCliente = plan.nombre;
    if (plan.estado === "sin-cambios" || plan.estado === "nuevo" || plan.estado === "actualiza") distintas = plan.distintas;
    if (plan.estado === "roto") motivos.push(mensaje("STUDIO-INIT-ROTO", { cliente: plan.nombre, error: plan.error ?? "?" }));
    else if (plan.estado === "forma-rara") motivos.push(mensaje("STUDIO-INIT-FORMA-RARA", { cliente: plan.nombre, seccion: plan.seccion }));
    else if (plan.estado === "clave-ocupada") motivos.push(mensaje("STUDIO-INIT-CLAVE-OCUPADA", { cliente: plan.nombre, clave: plan.clave }));
    else if (plan.estado === "sin-cambios") motivos.push(mensaje("STUDIO-INIT-SIN-CAMBIOS", { cliente: plan.nombre, clave: plan.claveFinal }));
    else {
      const antes = leerCrudo(plan.archivo);
      esNueva = plan.estado === "nuevo";
      quita = plan.quita;
      resumen.push(mensaje("STUDIO-INIT-RESUMEN", { nuevo: plan.estado === "nuevo", cliente: plan.nombre, clave: plan.claveFinal, comentarios: plan.comentarios }));
      const quitadas = [
        ...(plan.quita.documentacion ? ["PHASE_GATE_DOCS_PATH"] : []),
        ...(plan.quita.carpetaDeRepos ? ["PHASE_GATE_REPOS_PATH"] : []),
        ...(plan.quita.idioma ? ["PHASE_GATE_LANG"] : []),
      ];
      if (quitadas.length) resumen.push(mensaje("STUDIO-INIT-QUITA-DEL-ENV", { cliente: plan.nombre, quita: quitadas }));
      escrituraDelCliente = { ruta: plan.archivo, antes, despues: plan.texto, copia: antes !== null && antes.length > 0, exclusiva: false };
      hecho.push(mensaje("STUDIO-INIT-HECHO", { nuevo: plan.estado === "nuevo", cliente: plan.nombre, clave: plan.claveFinal }));
    }
  }

  // The paths the client carried in its env, or the Studio's own, move to machine.json if they are not there
  // yet: that way nothing stops working when they are taken out. Only the missing ones; machine.json goes first.
  const avisos: string[] = distintas.map((distinta) => mensaje("INIT-RUTA-DISTINTA", { cliente: nombreDelCliente, ...distinta }));
  const maquina = leerMaquinaParaEditar();
  const guardadas = maquina.estado === "valido" && maquina.objeto.rutas !== null && typeof maquina.objeto.rutas === "object" ? (maquina.objeto.rutas as Record<string, unknown>) : {};
  const efectivas = rutasEfectivas();
  const agregar: { documentacion?: string; carpetaDeRepos?: string } = {};
  for (const clave of ["documentacion", "carpetaDeRepos"] as const) {
    const candidata = quita[clave] ?? efectivas[clave];
    if (candidata && guardadas[clave] === undefined) agregar[clave] = candidata;
  }
  const hayRuta = (clave: "documentacion" | "carpetaDeRepos"): boolean => guardadas[clave] !== undefined || agregar[clave] !== undefined;
  if (esNueva && !(hayRuta("documentacion") && hayRuta("carpetaDeRepos"))) return { posible: false, motivo: mensaje("STUDIO-SIN-RUTAS") };
  if (Object.keys(agregar).length) {
    if (maquina.estado === "invalido") return { posible: false, motivo: sinRutasDelEquipo(mensaje("AJUSTES-MAQUINA-A-MANO", { error: maquina.error })) };
    let planeada;
    try {
      planeada = planDeEdicion(maquina, { rutas: agregar });
    } catch (error) {
      if (error instanceof ErrorDeArgumentos) throw new ErrorDeAccion(400, sinRutasDelEquipo(error.message));
      throw error;
    }
    if (planeada) {
      escrituras.push(planeada.escritura);
      resumen.unshift(mensaje("STUDIO-INIT-RUTAS-EN-MAQUINA", { cambios: planeada.cambios }));
      avisos.push(...planeada.faltan.map(({ clave, ruta }) => mensaje("AJUSTES-RUTA-NO-EXISTE", { clave, ruta })));
    }
  }
  if (escrituraDelCliente) escrituras.push(escrituraDelCliente);

  if (a.comandos) {
    if (a.cliente === "vscode") motivos.push(mensaje("STUDIO-INIT-VSCODE-SIN-COMANDOS"));
    else {
      const planeados = planDeComandos(a.cliente, entorno);
      const copiar = planeados.filter((c) => c.estado === "nuevo" || c.estado === "actualiza");
      const ajenos = planeados.filter((c) => c.estado === "ajeno" || c.estado === "carpeta");
      for (const c of copiar) escrituras.push({ ruta: c.archivo, antes: leerCrudo(c.archivo), despues: c.texto, copia: false, exclusiva: false });
      if (copiar.length) {
        resumen.push(mensaje("STUDIO-INIT-COPIAR-COMANDOS", { comandos: copiar.map((c) => `/f${c.numero}`).join(", "), carpeta: mostrar(carpetaDeComandos(a.cliente, entorno), ctx) }));
        hecho.push(mensaje("STUDIO-INIT-COMANDOS-COPIADOS", { comandos: copiar.map((c) => `/f${c.numero}`).join(", ") }));
      }
      if (ajenos.length) resumen.push(mensaje("STUDIO-INIT-COMANDOS-AJENOS", { comandos: ajenos.map((c) => `/f${c.numero}`).join(", ") }));
      if (!copiar.length && !ajenos.length) motivos.push(mensaje("STUDIO-INIT-COMANDOS-AL-DIA"));
    }
  }

  if (!escrituras.length && !comandos.length) return { posible: false, motivo: [...motivos, ...avisos].join(" ") };
  return { posible: true, interno: { accion: "init-cliente", cliente: a.cliente, resumen: [...resumen, ...motivos].join(" "), escrituras, comandos, hecho: hecho.join(" "), avisos } };
}

// What src/ajustes/ computes, in this module's internal shape. machine.json goes first in the list: if the
// second write fails, the paths end up repeated, but everything works. An argument that would produce a file
// that cannot be read is a 400, before the preview.
function planDeAjustes(accion: "equipo" | "proyecto", proyecto: string | null, calcular: () => PlanDeAjustes): Plan {
  let plan: PlanDeAjustes;
  try {
    plan = calcular();
  } catch (error) {
    if (error instanceof ErrorDeArgumentos) throw new ErrorDeAccion(400, sinRutasDelEquipo(error.message));
    throw error;
  }
  if (!plan.posible) return { posible: false, motivo: sinRutasDelEquipo(plan.motivo) };
  return {
    posible: true,
    interno: { accion, ...(proyecto ? { proyecto } : {}), resumen: plan.resumen, escrituras: plan.escrituras, comandos: [], hecho: plan.hecho, avisos: plan.avisos },
  };
}

async function planificar(accion: Accion, crudo: unknown, ctx: ContextoDeAcciones): Promise<Plan> {
  switch (accion) {
    case "equipo":
      return planDeAjustes("equipo", null, () => planDeEquipo(argumentosDe("equipo", crudo)));
    case "proyecto": {
      const { proyecto: nombre, ...cambios } = argumentosDe("proyecto", crudo);
      const proyecto = proyectoDe(nombre);
      return planDeAjustes("proyecto", proyecto, () => planDeProyecto(proyecto, cambios));
    }
    case "crear-manifiesto":
      return planDeCrear(argumentosDe("crear-manifiesto", crudo));
    case "eject":
      return planDeEjectAccion(argumentosDe("eject", crudo));
    case "init-cliente":
      return planDeInit(argumentosDe("init-cliente", crudo), ctx);
  }
}

// ─── La huella ──────────────────────────────────────────────────────────────
function mtimeDe(ruta: string): number | "no-existe" {
  try {
    return fs.statSync(ruta).mtimeMs;
  } catch {
    return "no-existe";
  }
}

// Sin el resumen: es texto en el idioma de la petición, y un plan visto en un idioma se puede aplicar en el
// otro. Lo que cambia el disco (archivos, contenidos, mtime y comandos) es lo que cuenta.
export function huellaDe(plan: PlanInterno): string {
  const datos = {
    accion: plan.accion,
    escrituras: plan.escrituras.map((e) => ({ ruta: e.ruta, antes: e.antes, despues: e.despues, copia: e.copia, exclusiva: e.exclusiva, mtimeMs: mtimeDe(e.ruta) })),
    comandos: plan.comandos,
  };
  return crypto.createHash("sha256").update(JSON.stringify(datos)).digest("hex");
}

// ─── Lo que se enseña ───────────────────────────────────────────────────────
function mostrar(ruta: string, ctx: ContextoDeAcciones): string {
  const home = ctx.entornoInit().home;
  const relativa = path.relative(home, ruta);
  if (relativa && !relativa.startsWith("..") && !path.isAbsolute(relativa)) return `~/${relativa.split(path.sep).join("/")}`;
  return sinRutasDelEquipo(ruta);
}

function diffDe(plan: PlanInterno, ctx: ContextoDeAcciones): string {
  const partes: string[] = [];
  for (const e of plan.escrituras) {
    const nombre = mostrar(e.ruta, ctx);
    partes.push(e.antes === null ? `+++ ${nombre} (nuevo)` : `--- ${nombre}`);
    partes.push(e.antes === null ? e.despues.replace(/\n$/, "").split("\n").map((l) => `+ ${l}`).join("\n") : diffDeLineas(sinBom(e.antes).replace(/\r\n/g, "\n").replace(/\n$/, ""), e.despues.replace(/\n$/, "")));
  }
  for (const c of plan.comandos) partes.push(`$ ${c.mostrar}`);
  return partes.join("\n");
}

export type RespuestaDePlan =
  | { posible: true; resumen: string; avisos: string[]; diff: string; huella: string; cambios: { archivo: string; tipo: "crear" | "reemplazar" | "comando" }[] }
  | { posible: false; motivo: string };

export type RespuestaDeAplicar = { hecho: true; mensaje: string; archivos: string[]; copias: string[] };

// ─── Las dos rutas ──────────────────────────────────────────────────────────
// Nunca se escribe en una tarea (sus documentos ni sus recibos) ni dentro de los repos: se comprueba sobre
// la ruta real de cada destino, sea la acción que sea.
function comprobarDestino(ruta: string): void {
  let enTarea = false;
  try {
    enTarea = ubicarEnTarea(ruta) !== null;
  } catch {
    enTarea = false;
  }
  if (enTarea) throw new ErrorDeAccion(409, mensaje("STUDIO-DESTINO-EN-TAREA"));
  try {
    if (estaDentroReal(requireBasePath(REPOS), ruta)) throw new ErrorDeAccion(409, mensaje("STUDIO-DESTINO-EN-REPOS"));
  } catch (error) {
    if (error instanceof ErrorDeAccion) throw error;
  }
  // En la Documentación, solo el phase-gate.json de un proyecto o su capa de prompts (.phase-gate/prompts).
  // Sobre las rutas reales: un enlace no lleva a otro sitio, y vale aunque la carpeta aún no exista.
  let docs: string | null = null;
  try {
    docs = rutaReal(requireBasePath(DOCS));
  } catch {
    docs = null;
  }
  if (docs) {
    const relativa = path.relative(docs, rutaReal(ruta));
    if (relativa && !relativa.startsWith("..") && !path.isAbsolute(relativa)) {
      const partes = relativa.split(/[\\/]/);
      const esManifiesto = partes.length === 2 && partes[1] === "phase-gate.json";
      const enCapaDeProyecto = partes.length >= 4 && partes[1] === ".phase-gate" && partes[2] === "prompts";
      if (!esManifiesto && !enCapaDeProyecto) throw new ErrorDeAccion(409, mensaje("STUDIO-DESTINO-EN-DOCS"));
    }
  }
}

// ─── The closed list of each action ─────────────────────────────────────────
// On top of what comprobarDestino forbids (it only forbids: outside the Documentation it admits any path),
// each action has the destinations it can write. Three actions share machine.json, so there the list goes by
// keys: what changes between what there was and what there will be.
const CLAVES_DE_ESTRUCTURA = new Set(["$schema", "version"]);
const mismaRuta = (a: string, b: string): boolean => {
  try {
    return rutaReal(a) === rutaReal(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
};
const proyectoDeClave = (clave: string): string => clave.slice(0, Math.max(clave.indexOf("/"), 0)).toLowerCase();

// The keys of machine.json that change, at the root and inside `repos` and `rutas`.
function clavesTocadas(e: Escritura): { raiz: string[]; repos: string[]; rutasNuevas: string[]; rutasCambiadas: string[] } | null {
  const leer = (texto: string | null): Record<string, unknown> | null => {
    if (texto === null) return {};
    try {
      const datos: unknown = JSON.parse(sinBom(texto));
      return datos !== null && typeof datos === "object" && !Array.isArray(datos) ? (datos as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const antes = leer(e.antes);
  const despues = leer(e.despues);
  if (!antes || !despues) return null;
  const distintas = (a: Record<string, unknown>, b: Record<string, unknown>): string[] =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  const hijo = (o: Record<string, unknown>, k: string): Record<string, unknown> => (o[k] !== null && typeof o[k] === "object" && !Array.isArray(o[k]) ? (o[k] as Record<string, unknown>) : {});
  const rutasAntes = hijo(antes, "rutas");
  const rutasDespues = hijo(despues, "rutas");
  const rutas = distintas(rutasAntes, rutasDespues);
  return {
    raiz: distintas(antes, despues).filter((k) => !CLAVES_DE_ESTRUCTURA.has(k)),
    repos: distintas(hijo(antes, "repos"), hijo(despues, "repos")),
    rutasNuevas: rutas.filter((k) => rutasAntes[k] === undefined),
    rutasCambiadas: rutas.filter((k) => rutasAntes[k] !== undefined),
  };
}

export function comprobarLista(plan: PlanInterno, e: Escritura, ctx: ContextoDeAcciones): void {
  const noEscribe = (): never => {
    throw new ErrorDeAccion(409, mensaje("AJUSTES-DESTINO-NO-PERMITIDO", { accion: plan.accion, archivo: mostrar(e.ruta, ctx) }));
  };
  const claveNoPermitida = (clave: string): never => {
    throw new ErrorDeAccion(409, mensaje("AJUSTES-CLAVE-NO-PERMITIDA", { accion: plan.accion, clave }));
  };
  const esMaquina = mismaRuta(e.ruta, rutaMaquina());
  const esManifiestoDelProyecto = (): boolean => plan.proyecto !== undefined && mismaRuta(e.ruta, rutaManifiesto(plan.proyecto));

  switch (plan.accion) {
    case "equipo": {
      if (!esMaquina) return noEscribe();
      const tocadas = clavesTocadas(e);
      if (!tocadas) return noEscribe();
      for (const clave of tocadas.raiz) if (!["rutas", "idiomaPorDefecto", "presetPorDefecto", "repos"].includes(clave)) claveNoPermitida(clave);
      return;
    }
    case "proyecto": {
      if (esManifiestoDelProyecto()) return;
      if (!esMaquina || plan.proyecto === undefined) return noEscribe();
      const tocadas = clavesTocadas(e);
      if (!tocadas) return noEscribe();
      for (const clave of tocadas.raiz) if (clave !== "repos") claveNoPermitida(clave);
      for (const clave of tocadas.repos) if (proyectoDeClave(clave) !== plan.proyecto.toLowerCase()) claveNoPermitida(`repos.${clave}`);
      return;
    }
    case "crear-manifiesto":
      if (!esManifiestoDelProyecto()) noEscribe();
      return;
    case "eject":
      if (!destinoPermitido(e.ruta, plan.proyecto ?? null)) noEscribe();
      return;
    case "init-cliente": {
      const entorno = ctx.entornoInit();
      const cliente = plan.cliente;
      if (esMaquina) {
        const tocadas = clavesTocadas(e);
        if (!tocadas) return noEscribe();
        for (const clave of tocadas.raiz) if (clave !== "rutas") claveNoPermitida(clave);
        // Only the paths that are missing: one that already has a value is not changed from here.
        for (const clave of tocadas.rutasCambiadas) claveNoPermitida(`rutas.${clave}`);
        if (tocadas.repos.length) claveNoPermitida("repos");
        return;
      }
      if (cliente === undefined) return noEscribe();
      if (cliente !== "claude-code" && mismaRuta(e.ruta, path.join(carpetaDelCliente(cliente, entorno), "mcp.json"))) return;
      if (cliente !== "vscode" && estaDentroReal(carpetaDeComandos(cliente, entorno), e.ruta)) return;
      return noEscribe();
    }
  }
}

export type Acciones = {
  plan: (cuerpo: unknown) => Promise<RespuestaDePlan>;
  aplicar: (cuerpo: unknown) => Promise<RespuestaDeAplicar>;
};

export function crearAcciones(ctx: ContextoDeAcciones): Acciones {
  const usadas = new Set<string>();

  const plan = async (cuerpo: unknown): Promise<RespuestaDePlan> => {
    const peticion = PeticionDePlan.safeParse(cuerpo);
    if (!peticion.success) throw new ErrorDeAccion(400, mensaje("STUDIO-PETICION-DE-PLAN"));
    const calculado = await planificar(peticion.data.accion, peticion.data.argumentos, ctx);
    if (!calculado.posible) return calculado;
    const { interno } = calculado;
    try {
      for (const e of interno.escrituras) {
        comprobarDestino(e.ruta);
        comprobarLista(interno, e, ctx);
      }
    } catch (error) {
      if (error instanceof ErrorDeAccion) return { posible: false, motivo: error.message };
      throw error;
    }
    return {
      posible: true,
      resumen: interno.resumen,
      avisos: interno.avisos ?? [],
      diff: diffDe(interno, ctx),
      huella: huellaDe(interno),
      cambios: [
        ...interno.escrituras.map((e) => ({ archivo: mostrar(e.ruta, ctx), tipo: e.antes === null ? ("crear" as const) : ("reemplazar" as const) })),
        ...interno.comandos.map((c) => ({ archivo: c.mostrar, tipo: "comando" as const })),
      ],
    };
  };

  const aplicar = async (cuerpo: unknown): Promise<RespuestaDeAplicar> => {
    const peticion = PeticionDeAplicar.safeParse(cuerpo);
    if (!peticion.success) throw new ErrorDeAccion(400, mensaje("STUDIO-PETICION-DE-APLICAR"));
    const { accion, argumentos, huella } = peticion.data;
    fs.mkdirSync(stateDir(), { recursive: true });
    return conCandado(
      stateDir(),
      async () => {
        const calculado = await planificar(accion, argumentos, ctx);
        if (!calculado.posible) throw new ErrorDeAccion(409, `${discoCambiado()} ${calculado.motivo}`);
        const { interno } = calculado;
        if (usadas.has(huella) || huellaDe(interno) !== huella) throw new ErrorDeAccion(409, discoCambiado());
        for (const e of interno.escrituras) {
          comprobarDestino(e.ruta);
          comprobarLista(interno, e, ctx);
        }
        usadas.add(huella);

        const entorno = ctx.entornoInit();
        const escribir = ctx.escribir ?? escribirAtomico;
        const archivos: string[] = [];
        const copias: string[] = [];
        // With several steps (machine.json and another file, or a file and a command), a failure halfway says what
        // was written and where the copies are; with a single one, the usual error.
        const variosPasos = interno.escrituras.length + interno.comandos.length > 1;
        try {
          for (const e of interno.escrituras) {
            if (e.copia && fs.existsSync(e.ruta)) {
              const copia = `${e.ruta}.bak-${marcaDeTiempo(entorno.ahora())}`;
              fs.copyFileSync(e.ruta, copia);
              copias.push(mostrar(copia, ctx));
            }
            fs.mkdirSync(path.dirname(e.ruta), { recursive: true });
            if (e.exclusiva) {
              try {
                fs.writeFileSync(e.ruta, e.despues, { encoding: "utf-8", flag: "wx" });
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ErrorDeAccion(409, discoCambiado());
                throw error;
              }
            } else {
              escribir(e.ruta, e.despues);
            }
            archivos.push(mostrar(e.ruta, ctx));
          }
          for (const c of interno.comandos) {
            const r = await entorno.ejecutar(c.comando, c.args);
            if (r.codigo !== 0) throw new ErrorDeAccion(500, mensaje("STUDIO-COMANDO-FALLO", { comando: c.mostrar, detalle: r.stderr.trim() ? sinRutasDelEquipo(r.stderr.trim()) : null, codigo: r.codigo }));
            archivos.push(c.mostrar);
          }
        } catch (error) {
          if (!variosPasos || (archivos.length === 0 && copias.length === 0)) throw error;
          const detalle = error instanceof Error ? error.message : String(error);
          throw new ErrorDeAccion(500, mensaje("AJUSTES-APLICAR-PARCIAL", { detalle: sinRutasDelEquipo(detalle), escritos: archivos, copias }), { escritos: archivos, copias });
        }
        return { hecho: true as const, mensaje: sinRutasDelEquipo(interno.hecho), archivos, copias };
      },
      { nombre: CANDADO, ocupado: mensaje("STUDIO-CANDADO-OCUPADO") }
    );
  };

  return { plan, aplicar };
}
