// Las escrituras del Studio (§7.6 del plan): solo acciones que ya existen en el CLI, y siempre en dos pasos.
//
//   1. plan:     { accion, argumentos } → { resumen, diff, huella }. La huella es el sha256 del plan (qué
//                archivo, qué había y qué habrá; o qué comando) más el mtimeMs de cada archivo que tocaría.
//   2. aplicar:  { accion, argumentos, huella } → el servidor RECALCULA el plan y solo escribe si la huella
//                coincide; si no, 409: "El disco cambió desde que viste el cambio. Revísalo otra vez."
//
//   preset            el "preset" de <DOCS>/<P>/phase-gate.json
//   reglas            "reglas.lotes" o "reglas.commits" del mismo archivo
//   crear-manifiesto  init --migrate para un proyecto: crea phase-gate.json (solo crea)
//   eject             mcp-phase-gate eject <objetivo> --a … (capa global, del proyecto o carpeta de presets)
//   init-cliente      mcp-phase-gate init --cliente <c>: el mcp.json de Cursor o VS Code, o `claude mcp add`
//
// Cada acción calcula su plan con la MISMA función que el CLI (planDeEject, planDeArchivo, planDeClaude,
// manifiestoNuevo). Nunca escribe documentos de tareas, recibos ni nada de los repos: cada destino se
// comprueba antes de escribir. Una huella sirve una sola vez, y aplicar va bajo un candado del estado
// (`<stateDir>/.studio-acciones.lock`), así que dos Studios con la misma huella no aplican los dos.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import { DOCS, REPOS, carpetaPromptsGlobal, configDir, leerVariable, requireBasePath, stateDir } from "../config.js";
import { carpetaPromptsDeProyecto } from "../capas.js";
import { ErrorDeEject, planDeEject } from "../eject.js";
import { CLAVE_VALIDA, CLIENTES, diffDeLineas, manifiestoNuevo, marcaDeTiempo, planDeArchivo, planDeClaude } from "../init.js";
import type { EntornoInit } from "../init.js";
import { conCandado, escribirAtomico } from "../lotes.js";
import { Manifiesto, POLITICAS_COMMIT, carpetaPresetsDelUsuario, leerManifiesto, presetsDisponibles, rutaManifiesto } from "../manifiesto.js";
import { estaDentroReal, requireProjectFolder, rutaReal, ubicarEnTarea, validarSegmento } from "../paths.js";
import { sinRutasDelEquipo } from "./privacidad.js";

export const ACCIONES = ["preset", "reglas", "crear-manifiesto", "eject", "init-cliente"] as const;
export type Accion = (typeof ACCIONES)[number];

export const DISCO_CAMBIADO = "El disco cambió desde que viste el cambio. Revísalo otra vez.";
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
  "init-cliente": z.object({ cliente: z.enum(CLIENTES), clave: z.string().regex(CLAVE_VALIDA).optional() }).strict(),
} as const;

export const PeticionDePlan = z.object({ accion: z.enum(ACCIONES), argumentos: z.unknown() }).strict();
export const PeticionDeAplicar = z.object({ accion: z.enum(ACCIONES), argumentos: z.unknown(), huella: z.string().regex(/^[0-9a-f]{64}$/) }).strict();

export class ErrorDeAccion extends Error {
  constructor(
    readonly estado: 400 | 404 | 409 | 500,
    message: string
  ) {
    super(message);
  }
}

function argumentosDe<A extends Accion>(accion: A, crudo: unknown): z.infer<(typeof ARGUMENTOS)[A]> {
  const leido = (ARGUMENTOS[accion] as z.ZodType).safeParse(crudo);
  if (!leido.success) throw new ErrorDeAccion(400, `Argumentos de «${accion}» no válidos: ${leido.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ")}.`);
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
type PlanInterno = { accion: Accion; resumen: string; escrituras: Escritura[]; comandos: Comando[]; hecho: string };
type Plan = { posible: true; interno: PlanInterno } | { posible: false; motivo: string };

export type ContextoDeAcciones = {
  entornoInit: () => EntornoInit;
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
  if (lectura.estado === "ausente") return { motivo: `${proyecto} no tiene phase-gate.json: créalo primero con «Crear phase-gate.json».` };
  if (lectura.estado === "invalido") return { motivo: `${sinRutasDelEquipo(lectura.error)} Arréglalo a mano antes de cambiarlo desde el Studio.` };
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
  const presets = presetsDisponibles((m.objeto.idioma as string | undefined) ?? "es");
  if (!presets.has(a.preset)) return { posible: false, motivo: `No existe el preset "${a.preset}". Los disponibles son: ${[...presets.keys()].sort().join(", ")}.` };
  if (m.objeto.preset === a.preset) return { posible: false, motivo: `${proyecto} ya usa el preset "${a.preset}".` };
  // Asignar sobre la clave que ya existe la deja en su sitio; si no estaba, va al final.
  m.objeto.preset = a.preset;
  const despues = json2(m.objeto);
  const error = validarManifiesto(despues);
  if (error) return { posible: false, motivo: `El phase-gate.json resultante no sería válido: ${error}.` };
  return {
    posible: true,
    interno: { accion: "preset", resumen: `El preset de ${proyecto} pasa a ser "${a.preset}".`, escrituras: [{ ruta: m.ruta, antes: m.crudo, despues, copia: true, exclusiva: false }], comandos: [], hecho: `${proyecto} usa ahora el preset "${a.preset}".` },
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
    cambios.push(`lotes: ${a.lotes ? "sí" : "no"}`);
  }
  if (a.commits !== undefined && reglas.commits !== a.commits) {
    reglas.commits = a.commits;
    cambios.push(`commits: ${a.commits}`);
  }
  if (!cambios.length) return { posible: false, motivo: `Las reglas de ${proyecto} ya son esas: no hay nada que cambiar.` };
  m.objeto.reglas = reglas;
  const despues = json2(m.objeto);
  const error = validarManifiesto(despues);
  if (error) return { posible: false, motivo: `El phase-gate.json resultante no sería válido: ${error}.` };
  return {
    posible: true,
    interno: { accion: "reglas", resumen: `Reglas de ${proyecto}: ${cambios.join(", ")}.`, escrituras: [{ ruta: m.ruta, antes: m.crudo, despues, copia: true, exclusiva: false }], comandos: [], hecho: `Reglas de ${proyecto} cambiadas: ${cambios.join(", ")}.` },
  };
}

function planDeCrear(a: z.infer<(typeof ARGUMENTOS)["crear-manifiesto"]>): Plan {
  const proyecto = proyectoDe(a.proyecto);
  const preset = a.preset ?? "software-replica"; // el mismo valor por defecto que init --migrate
  if (!presetsDisponibles().has(preset)) return { posible: false, motivo: `No existe el preset "${preset}".` };
  const ruta = rutaManifiesto(proyecto);
  if (fs.existsSync(ruta)) return { posible: false, motivo: `${proyecto} ya tiene phase-gate.json: «Crear» solo crea, nunca sobrescribe.` };
  return {
    posible: true,
    interno: { accion: "crear-manifiesto", resumen: `Crear el phase-gate.json de ${proyecto} con el preset "${preset}".`, escrituras: [{ ruta, antes: null, despues: manifiestoNuevo(preset), copia: false, exclusiva: true }], comandos: [], hecho: `Creado el phase-gate.json de ${proyecto}.` },
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
  if (!destinoPermitido(plan.archivo, plan.proyecto)) return { posible: false, motivo: "Ese destino no es una capa de prompts ni la carpeta de presets: el Studio no escribe ahí." };
  const antes = leerCrudo(plan.archivo);
  return {
    posible: true,
    interno: {
      accion: "eject",
      resumen: `Copiar ${a.objetivo} a ${plan.etiqueta ?? "tu carpeta de presets"}${plan.reemplaza ? ", reemplazando lo que hay (queda copia)" : ""}.`,
      escrituras: [{ ruta: plan.archivo, antes, despues: plan.texto, copia: plan.reemplaza, exclusiva: false }],
      comandos: [],
      hecho: `Copiado a ${plan.archivo}. Edítalo ahí.`,
    },
  };
}

function rutasDeInit(): { docs: string; repos: string } | null {
  const docs = leerVariable("DOCS_PATH").valor;
  const repos = leerVariable("REPOS_PATH").valor;
  const carpeta = (ruta: string | undefined): string | null => (ruta && fs.statSync(path.resolve(ruta), { throwIfNoEntry: false })?.isDirectory() ? path.resolve(ruta) : null);
  const d = carpeta(docs);
  const r = carpeta(repos);
  return d && r ? { docs: d, repos: r } : null;
}

async function planDeInit(a: z.infer<(typeof ARGUMENTOS)["init-cliente"]>, ctx: ContextoDeAcciones): Promise<Plan> {
  const rutas = rutasDeInit();
  if (!rutas) return { posible: false, motivo: "Faltan PHASE_GATE_DOCS_PATH y PHASE_GATE_REPOS_PATH (o no existen): init no sabría qué rutas registrar." };
  const entorno = ctx.entornoInit();
  if (a.cliente === "claude-code") {
    const plan = await planDeClaude(rutas, a.clave ?? null, entorno);
    if (plan.estado === "sin-lista") return { posible: false, motivo: `Claude Code: ${sinRutasDelEquipo(plan.mensaje)}` };
    if (plan.estado === "existente") return { posible: false, motivo: `Claude Code ya lo tiene registrado como «${plan.existente}»; init no lo toca. Para cambiarlo: ${plan.comando}` };
    return {
      posible: true,
      interno: { accion: "init-cliente", resumen: `Registrar el servidor en Claude Code como «${plan.clave}» (ámbito user).`, escrituras: [], comandos: [{ comando: "claude", args: plan.args, mostrar: plan.comando }], hecho: `Registrado en Claude Code como «${plan.clave}».` },
    };
  }
  const plan = planDeArchivo(a.cliente, rutas, a.clave ?? null, entorno);
  if (plan.estado === "roto") return { posible: false, motivo: `${plan.nombre}: no se pudo leer su mcp.json (${plan.error ?? "?"}); no se toca.` };
  if (plan.estado === "forma-rara") return { posible: false, motivo: `${plan.nombre}: en su mcp.json, "${plan.seccion}" o el "env" de alguna entrada no es un objeto; no se toca.` };
  if (plan.estado === "clave-ocupada") return { posible: false, motivo: `${plan.nombre}: la clave «${plan.clave}» ya la usa otro servidor.` };
  if (plan.estado === "sin-cambios") return { posible: false, motivo: `${plan.nombre}: sin cambios, ya está registrado como «${plan.claveFinal}».` };
  const antes = leerCrudo(plan.archivo);
  return {
    posible: true,
    interno: {
      accion: "init-cliente",
      resumen: `${plan.estado === "nuevo" ? "Registrar" : "Actualizar"} el servidor en ${plan.nombre} como «${plan.claveFinal}»${plan.comentarios ? " (el archivo tiene comentarios: se perderán, queda la copia)" : ""}.`,
      escrituras: [{ ruta: plan.archivo, antes, despues: plan.texto, copia: antes !== null && antes.length > 0, exclusiva: false }],
      comandos: [],
      hecho: `${plan.nombre}: ${plan.estado === "nuevo" ? "registrado" : "actualizado"} como «${plan.claveFinal}».`,
    },
  };
}

async function planificar(accion: Accion, crudo: unknown, ctx: ContextoDeAcciones): Promise<Plan> {
  switch (accion) {
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

export function huellaDe(plan: PlanInterno): string {
  const datos = {
    accion: plan.accion,
    resumen: plan.resumen,
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
  | { posible: true; resumen: string; diff: string; huella: string; cambios: { archivo: string; tipo: "crear" | "reemplazar" | "comando" }[] }
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
  if (enTarea) throw new ErrorDeAccion(409, "Esa acción escribiría dentro de una tarea: el Studio nunca escribe documentos ni recibos.");
  try {
    if (estaDentroReal(requireBasePath(REPOS), ruta)) throw new ErrorDeAccion(409, "Esa acción escribiría dentro de la carpeta de repos: el Studio nunca escribe en los repositorios.");
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
      if (!esManifiesto && !enCapaDeProyecto) throw new ErrorDeAccion(409, "En la Documentación, el Studio solo escribe el phase-gate.json y la capa de prompts de un proyecto.");
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
    if (!peticion.success) throw new ErrorDeAccion(400, "La petición tiene que ser { accion, argumentos }, con una de: preset, reglas, crear-manifiesto, eject, init-cliente.");
    const calculado = await planificar(peticion.data.accion, peticion.data.argumentos, ctx);
    if (!calculado.posible) return calculado;
    const { interno } = calculado;
    try {
      for (const e of interno.escrituras) comprobarDestino(e.ruta);
    } catch (error) {
      if (error instanceof ErrorDeAccion) return { posible: false, motivo: error.message };
      throw error;
    }
    return {
      posible: true,
      resumen: interno.resumen,
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
    if (!peticion.success) throw new ErrorDeAccion(400, "La petición tiene que ser { accion, argumentos, huella }, con la huella del plan.");
    const { accion, argumentos, huella } = peticion.data;
    fs.mkdirSync(stateDir(), { recursive: true });
    return conCandado(
      stateDir(),
      async () => {
        const calculado = await planificar(accion, argumentos, ctx);
        if (!calculado.posible) throw new ErrorDeAccion(409, `${DISCO_CAMBIADO} ${calculado.motivo}`);
        const { interno } = calculado;
        if (usadas.has(huella) || huellaDe(interno) !== huella) throw new ErrorDeAccion(409, DISCO_CAMBIADO);
        for (const e of interno.escrituras) comprobarDestino(e.ruta);
        usadas.add(huella);

        const entorno = ctx.entornoInit();
        const archivos: string[] = [];
        const copias: string[] = [];
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
              if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ErrorDeAccion(409, DISCO_CAMBIADO);
              throw error;
            }
          } else {
            escribirAtomico(e.ruta, e.despues);
          }
          archivos.push(mostrar(e.ruta, ctx));
        }
        for (const c of interno.comandos) {
          const r = await entorno.ejecutar(c.comando, c.args);
          if (r.codigo !== 0) throw new ErrorDeAccion(500, `${c.mostrar} falló: ${sinRutasDelEquipo(r.stderr.trim() || `código ${r.codigo}`)}`);
          archivos.push(c.mostrar);
        }
        return { hecho: true as const, mensaje: sinRutasDelEquipo(interno.hecho), archivos, copias };
      },
      { nombre: CANDADO, ocupado: "Otro Studio está aplicando un cambio; vuelve a intentarlo." }
    );
  };

  return { plan, aplicar };
}
