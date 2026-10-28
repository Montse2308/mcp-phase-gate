// Las escrituras del Studio (§7.6 del plan): solo acciones que ya existen en el CLI, y siempre en dos pasos.
//
//   1. plan:     { accion, argumentos } → { resumen, diff, huella }. La huella es el sha256 del plan (qué
//                archivo, qué había y qué habrá; o qué comando) más el mtimeMs de cada archivo que tocaría.
//   2. aplicar:  { accion, argumentos, huella } → el servidor RECALCULA el plan y solo escribe si la huella
//                coincide; si no, 409: "El disco cambió desde que viste el cambio. Revísalo otra vez."
//
//   equipo            <configDir>/machine.json: las rutas de este equipo, su idioma y preset por defecto y la ruta
//                     propia de cualquier repo (src/ajustes/equipo.ts)
//   proyecto          lo que cambió de un proyecto, en un solo plan: su phase-gate.json y, en machine.json, solo
//                     las claves de sus repos (src/ajustes/proyecto.ts)
//   crear-manifiesto  init --migrate para un proyecto: crea phase-gate.json (solo crea)
//   eject             mcp-phase-gate eject <objetivo> --a … (capa global, del proyecto o carpeta de presets)
//   init-cliente      mcp-phase-gate init --cliente <c>: el mcp.json de Cursor o VS Code, o `claude mcp add`
//   preset            el "preset" de <DOCS>/<P>/phase-gate.json (para retirar: lo cubre `proyecto`)
//   reglas            "reglas.lotes" o "reglas.commits" del mismo archivo (para retirar: lo cubre `proyecto`)
//
// `equipo` y `proyecto` no tienen comando de CLI, como tampoco lo tenían `preset` y `reglas`; lo que protege
// este módulo se mantiene: destinos cerrados por acción, un solo shape de validación y la huella.
//
// Cada acción calcula su plan con la MISMA función que el CLI (planDeEject, planDeArchivo, planDeClaude,
// manifiestoNuevo). Nunca escribe documentos de tareas, recibos ni nada de los repos: cada destino se
// comprueba antes de escribir, y cada acción tiene además su lista cerrada de destinos (comprobarLista): por
// archivo y, en machine.json, por clave. Una huella sirve una sola vez, y aplicar va bajo un candado del estado
// (`<stateDir>/.studio-acciones.lock`), así que dos Studios con la misma huella no aplican los dos.

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
import type { EntornoInit, QuitaDelEntorno } from "../init.js";
import { conCandado, escribirAtomico } from "../lotes.js";
import { Manifiesto, POLITICAS_COMMIT, carpetaPresetsDelUsuario, idiomaDelEquipo, idiomaDelProyecto, leerManifiesto, presetsDisponibles, rutaManifiesto, rutaMaquina } from "../manifiesto.js";
import { estaDentroReal, requireProjectFolder, rutaReal, ubicarEnTarea, validarSegmento } from "../paths.js";
import { sinRutasDelEquipo } from "./privacidad.js";

// preset y reglas se quedan mientras la interfaz las use; `proyecto` ya las cubre.
export const ACCIONES = ["preset", "reglas", "crear-manifiesto", "eject", "init-cliente", "equipo", "proyecto"] as const;
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
  preset: z.object({ proyecto: Proyecto, preset: z.string().regex(ID) }).strict(),
  reglas: z
    .object({ proyecto: Proyecto, lotes: z.boolean().optional(), commits: z.enum(POLITICAS_COMMIT).optional() })
    .strict()
    .refine((a) => a.lotes !== undefined || a.commits !== undefined, "indica `lotes` o `commits`"),
  "crear-manifiesto": z.object({ proyecto: Proyecto, preset: z.string().regex(ID).optional() }).strict(),
  eject: z.object({ objetivo: z.string().min(1).max(120), destino: z.string().min(1).max(260), fuerza: z.boolean().optional() }).strict(),
  // quitarIdioma: quita también PHASE_GATE_LANG del env del cliente (el aviso de que el env gana al idioma de machine.json).
  "init-cliente": z.object({ cliente: z.enum(CLIENTES), clave: z.string().regex(CLAVE_VALIDA).optional(), comandos: z.boolean().optional(), quitarIdioma: z.boolean().optional() }).strict(),
  equipo: ArgumentosDeEquipo,
  proyecto: ArgumentosDeProyecto,
} as const;

export const PeticionDePlan = z.object({ accion: z.enum(ACCIONES), argumentos: z.unknown() }).strict();
export const PeticionDeAplicar = z.object({ accion: z.enum(ACCIONES), argumentos: z.unknown(), huella: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

export class ErrorDeAccion extends Error {
  // `extra` se suma al cuerpo de la respuesta de error: con varios archivos, cuáles quedaron escritos.
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
// `proyecto` y `cliente` son los que la acción dijo: de ellos depende su lista de destinos.
type PlanInterno = { accion: Accion; resumen: string; escrituras: Escritura[]; comandos: Comando[]; hecho: string; avisos?: string[]; proyecto?: string; cliente?: (typeof CLIENTES)[number] };
type Plan = { posible: true; interno: PlanInterno } | { posible: false; motivo: string };

export type ContextoDeAcciones = {
  entornoInit: () => EntornoInit;
  // Quien escribe cada archivo; los tests lo cambian para que una escritura falle. Sin él, la atómica.
  escribir?: (ruta: string, contenido: string) => void;
};

const json2 = (valor: unknown): string => `${JSON.stringify(valor, null, 2)}\n`;
const leerCrudo = (ruta: string): string | null => {
  try {
    return fs.readFileSync(ruta, "utf-8");
  } catch {
    return null;
  }
};
const sinBom = (texto: string): string => texto.replace(/^\uFEFF/, "");

// El manifiesto de un proyecto, como objeto, conservando el orden de sus claves (JSON.parse lo conserva).
function manifiestoComoObjeto(proyecto: string): { ruta: string; crudo: string; objeto: Record<string, unknown> } | { motivo: string } {
  const lectura = leerManifiesto(proyecto);
  if (lectura.estado === "ausente") return { motivo: mensaje("STUDIO-SIN-MANIFIESTO", { proyecto }) };
  if (lectura.estado === "invalido") return { motivo: mensaje("STUDIO-MANIFIESTO-A-MANO", { error: sinRutasDelEquipo(lectura.error) }) };
  const crudo = leerCrudo(lectura.ruta) ?? "";
  return { ruta: lectura.ruta, crudo, objeto: JSON.parse(sinBom(crudo)) as Record<string, unknown> };
}

// El manifiesto después del cambio tiene que seguir siendo válido, con el mismo shape que lo lee.
function validarManifiesto(texto: string): string | null {
  const leido = Manifiesto.safeParse(JSON.parse(texto));
  return leido.success ? null : leido.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

function planDePreset(a: z.infer<(typeof ARGUMENTOS)["preset"]>): Plan {
  const proyecto = proyectoDe(a.proyecto);
  const m = manifiestoComoObjeto(proyecto);
  if ("motivo" in m) return { posible: false, motivo: m.motivo };
  const presets = presetsDisponibles(idiomaDelProyecto(proyecto).idioma);
  if (!presets.has(a.preset)) return { posible: false, motivo: mensaje("STUDIO-PRESET-NO-EXISTE", { preset: a.preset, disponibles: [...presets.keys()].sort() }) };
  if (m.objeto.preset === a.preset) return { posible: false, motivo: mensaje("STUDIO-PRESET-YA-EN-USO", { proyecto, preset: a.preset }) };
  // Asignar sobre la clave que ya existe la deja en su sitio; si no estaba, va al final.
  m.objeto.preset = a.preset;
  const despues = json2(m.objeto);
  const error = validarManifiesto(despues);
  if (error) return { posible: false, motivo: mensaje("STUDIO-MANIFIESTO-NO-VALDRIA", { error }) };
  return {
    posible: true,
    interno: { accion: "preset", proyecto, resumen: mensaje("STUDIO-PRESET-RESUMEN", { proyecto, preset: a.preset }), escrituras: [{ ruta: m.ruta, antes: m.crudo, despues, copia: true, exclusiva: false }], comandos: [], hecho: mensaje("STUDIO-PRESET-HECHO", { proyecto, preset: a.preset }) },
  };
}

function planDeReglas(a: z.infer<(typeof ARGUMENTOS)["reglas"]>): Plan {
  const proyecto = proyectoDe(a.proyecto);
  const m = manifiestoComoObjeto(proyecto);
  if ("motivo" in m) return { posible: false, motivo: m.motivo };
  const reglas = (m.objeto.reglas && typeof m.objeto.reglas === "object" ? m.objeto.reglas : {}) as Record<string, unknown>;
  const cambios: string[] = [];
  if (a.lotes !== undefined && reglas.lotes !== a.lotes) {
    reglas.lotes = a.lotes;
    cambios.push(mensaje("STUDIO-REGLA-LOTES", { lotes: a.lotes }));
  }
  if (a.commits !== undefined && reglas.commits !== a.commits) {
    reglas.commits = a.commits;
    cambios.push(`commits: ${a.commits}`);
  }
  if (!cambios.length) return { posible: false, motivo: mensaje("STUDIO-REGLAS-IGUALES", { proyecto }) };
  m.objeto.reglas = reglas;
  const despues = json2(m.objeto);
  const error = validarManifiesto(despues);
  if (error) return { posible: false, motivo: mensaje("STUDIO-MANIFIESTO-NO-VALDRIA", { error }) };
  return {
    posible: true,
    interno: { accion: "reglas", proyecto, resumen: mensaje("STUDIO-REGLAS-RESUMEN", { proyecto, cambios: cambios.join(", ") }), escrituras: [{ ruta: m.ruta, antes: m.crudo, despues, copia: true, exclusiva: false }], comandos: [], hecho: mensaje("STUDIO-REGLAS-HECHO", { proyecto, cambios: cambios.join(", ") }) },
  };
}

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

// Las rutas con las que trabaja este Studio ahora (el entorno, el .env o machine.json), las que existen.
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
  let esNueva = false;

  if (a.cliente === "claude-code") {
    const plan = await planDeClaude(a.clave ?? null, entorno, opciones);
    if (plan.estado === "sin-lista") motivos.push(`Claude Code: ${sinRutasDelEquipo(plan.mensaje)}`);
    else if (plan.estado === "existente") {
      motivos.push(mensaje("STUDIO-INIT-CLAUDE-EXISTENTE", { clave: plan.existente, comando: plan.comando }));
      quita = plan.quita;
    } else {
      esNueva = true;
      resumen.push(mensaje("STUDIO-INIT-CLAUDE-RESUMEN", { clave: plan.clave }));
      comandos.push({ comando: "claude", args: plan.args, mostrar: plan.comando });
      hecho.push(mensaje("STUDIO-INIT-CLAUDE-HECHO", { clave: plan.clave }));
    }
  } else {
    const plan = planDeArchivo(a.cliente, a.clave ?? null, entorno, opciones);
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

  // Las rutas que el cliente llevaba en su env, o las del propio Studio, pasan a machine.json si aún no están
  // ahí: así nada deja de funcionar al quitárselas. Solo las que faltan; machine.json va primero.
  const avisos: string[] = [];
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

  if (!escrituras.length && !comandos.length) return { posible: false, motivo: motivos.join(" ") };
  return { posible: true, interno: { accion: "init-cliente", cliente: a.cliente, resumen: [...resumen, ...motivos].join(" "), escrituras, comandos, hecho: hecho.join(" "), avisos } };
}

// Lo que calcula src/ajustes/, en la forma interna de este módulo. machine.json va primero en la lista: si falla
// la segunda escritura, las rutas quedan repetidas, pero todo funciona. Un argumento que daría un archivo
// que no se puede leer es un 400, antes de la vista previa.
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
    case "preset":
      return planDePreset(argumentosDe("preset", crudo));
    case "reglas":
      return planDeReglas(argumentosDe("reglas", crudo));
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

// ─── La lista cerrada de cada acción ────────────────────────────────────────
// Además de lo que comprobarDestino prohíbe (que solo prohíbe: fuera de la Documentación admite cualquier
// ruta), cada acción tiene los destinos que puede escribir. Tres acciones comparten machine.json, así que ahí
// la lista va por claves: lo que cambia entre lo que había y lo que habrá.
const CLAVES_DE_ESTRUCTURA = new Set(["$schema", "version"]);
const mismaRuta = (a: string, b: string): boolean => {
  try {
    return rutaReal(a) === rutaReal(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
};
const proyectoDeClave = (clave: string): string => clave.slice(0, Math.max(clave.indexOf("/"), 0)).toLowerCase();

// Las claves de machine.json que cambian, de la raíz y dentro de `repos` y `rutas`.
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
    case "preset":
    case "reglas":
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
        // Solo las rutas que faltan: una que ya tiene valor no se cambia desde aquí.
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
        // Con varios pasos (machine.json y otro archivo, o un archivo y un comando), un fallo a medias dice qué
        // quedó escrito y dónde están las copias; con uno solo, el error de siempre.
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
