// The `proyecto` plan: edits in one plan what changed in a project (the "cada proyecto" page of Ajustes).
//
//   <Documentation>/<P>/phase-gate.json   preset, idioma, reglas.lotes, reglas.commits, reglas.verificacion,
//                                         fase5.prPorRepo and repos
//   <configDir>/machine.json              only the keys "<P>/<repo>" of that project: the own path of a repo
//
// Every field takes a value, or `null` to remove it and go back to what the preset says. The result is
// validated with the same `Manifiesto` that reads the file. machine.json goes first in the list, so that if
// the second write fails the paths are repeated, but everything works.

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import { fasesDe } from "../capas.js";
import { mensaje } from "../i18n/mensajes.js";
import { POLITICAS_COMMIT, idiomaDelProyecto, leerManifiesto, presetsDisponibles, validarManifiesto } from "../manifiesto.js";
import { tasksRootPath } from "../paths.js";
import { frontmatterDeRecibo, loteDelNombre } from "../recibos.js";
import { leerMaquinaParaEditar, planDeEdicion } from "./edicion-maquina.js";
import type { EdicionDeMaquina } from "./edicion-maquina.js";
import { ErrorDeArgumentos, esObjeto, json2 } from "./plan.js";
import type { EscrituraDePlan, PlanDeAjustes } from "./plan.js";

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const RepoDeProyecto = z
  .object({
    id: z.string().min(1).max(80),
    dir: z.string().min(1).max(260),
    // Not given: the repo keeps the one it had. `null`: it loses it.
    rol: z.string().max(60).nullable().optional(),
  })
  .strict();

export const ArgumentosDeProyecto = z
  .object({
    proyecto: z.string().min(1).max(200),
    preset: z.string().regex(ID).nullable().optional(),
    idioma: z.enum(["es", "en"]).nullable().optional(),
    reglas: z
      .object({
        lotes: z.boolean().nullable().optional(),
        commits: z.enum(POLITICAS_COMMIT).nullable().optional(),
        verificacion: z.array(z.string().min(1).max(500)).max(20).nullable().optional(),
      })
      .strict()
      .optional(),
    fase5: z.object({ prPorRepo: z.boolean().nullable().optional() }).strict().optional(),
    // The whole list of repos of the project, in order. A repo's id is not renamed: to change it, it is
    // removed and added again.
    repos: z.array(RepoDeProyecto).max(50).optional(),
    // repo id -> its own path on this machine, or null to remove it. They go to machine.json.
    rutasPropias: z.record(z.string().min(1).max(80), z.string().min(1).max(1024).nullable()).optional(),
  })
  .strict()
  .refine((a) => Object.entries(a).some(([clave, valor]) => clave !== "proyecto" && valor !== undefined), "indica qué cambiar");

export type ArgumentosDeProyecto = z.infer<typeof ArgumentosDeProyecto>;

// Sets or removes `clave` in `destino`, and says it in `cambios` if it changed anything.
function fijar(destino: Record<string, unknown>, clave: string, valor: unknown, etiqueta: string, cambios: string[]): void {
  if (valor === undefined) return;
  if (valor === null) {
    if (clave in destino) {
      delete destino[clave];
      cambios.push(mensaje("AJUSTES-CAMBIO-QUITA", { clave: etiqueta }));
    }
    return;
  }
  if (JSON.stringify(destino[clave]) !== JSON.stringify(valor)) {
    destino[clave] = valor;
    cambios.push(mensaje("AJUSTES-CAMBIO-PONE", { clave: etiqueta, valor: JSON.stringify(valor) }));
  }
}

// How many receipts of the project cite a repo by its id (src/recibos.ts saves the id in each one).
export function recibosQueCitan(proyecto: string, id: string): number {
  let raiz: string;
  let subcarpeta: string | null;
  try {
    raiz = tasksRootPath(proyecto);
    subcarpeta = [...fasesDe(proyecto).values()].find((d) => d.recibos)?.recibos ?? null;
  } catch {
    return 0;
  }
  if (!subcarpeta) return 0;
  let tareas: fs.Dirent[];
  try {
    tareas = fs.readdirSync(raiz, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith("."));
  } catch {
    return 0;
  }
  let citados = 0;
  for (const tarea of tareas) {
    const carpeta = path.join(raiz, tarea.name, subcarpeta);
    let nombres: string[];
    try {
      nombres = fs.readdirSync(carpeta);
    } catch {
      continue;
    }
    for (const nombre of nombres) {
      if (loteDelNombre(nombre) === null) continue;
      try {
        if (frontmatterDeRecibo(fs.readFileSync(path.join(carpeta, nombre), "utf-8")).meta.repo === id) citados++;
      } catch {
        // a receipt that cannot be read does not count
      }
    }
  }
  return citados;
}

const claveDeMaquina = (clave: string): string => {
  const corte = clave.indexOf("/");
  return `${clave.slice(0, corte).toLowerCase()}${clave.slice(corte)}`;
};

// `proyecto` is the folder of the project, already resolved by the caller.
export function planDeProyecto(proyecto: string, a: Omit<ArgumentosDeProyecto, "proyecto">): PlanDeAjustes {
  const lectura = leerManifiesto(proyecto);
  if (lectura.estado === "ausente") return { posible: false, motivo: mensaje("STUDIO-SIN-MANIFIESTO", { proyecto }) };
  if (lectura.estado === "invalido") return { posible: false, motivo: mensaje("STUDIO-MANIFIESTO-A-MANO", { error: lectura.error }) };

  const crudo = fs.readFileSync(lectura.ruta, "utf-8");
  const original = JSON.parse(crudo.replace(/^﻿/, "")) as Record<string, unknown>;
  const objeto = structuredClone(original);
  const cambiosDelManifiesto: string[] = [];

  fijar(objeto, "preset", a.preset, "preset", cambiosDelManifiesto);
  fijar(objeto, "idioma", a.idioma, "idioma", cambiosDelManifiesto);
  for (const [nombre, campos] of [["reglas", a.reglas], ["fase5", a.fase5]] as const) {
    if (!campos) continue;
    const contenedor: Record<string, unknown> = esObjeto(objeto[nombre]) ? { ...objeto[nombre] } : {};
    for (const [clave, valor] of Object.entries(campos)) fijar(contenedor, clave, valor, `${nombre}.${clave}`, cambiosDelManifiesto);
    if (Object.keys(contenedor).length || nombre in objeto) objeto[nombre] = contenedor;
  }

  const antesDeRepos = (Array.isArray(objeto.repos) ? objeto.repos : []).filter(esObjeto);
  const quitados: string[] = [];
  if (a.repos) {
    const previos = new Map(antesDeRepos.map((r) => [String(r.id), r]));
    const nuevos = a.repos.map((r) => {
      const entrada: Record<string, unknown> = { id: r.id, dir: r.dir };
      const rol = r.rol === undefined ? previos.get(r.id)?.rol : r.rol;
      if (rol !== undefined && rol !== null) entrada.rol = rol;
      return entrada;
    });
    for (const r of nuevos) {
      const previo = previos.get(String(r.id));
      if (!previo) cambiosDelManifiesto.push(mensaje("AJUSTES-PROYECTO-REPO-AGREGA", { id: r.id, dir: r.dir }));
      else if (JSON.stringify(previo) !== JSON.stringify(r)) cambiosDelManifiesto.push(mensaje("AJUSTES-PROYECTO-REPO-CAMBIA", { id: r.id }));
    }
    const ids = new Set(nuevos.map((r) => String(r.id)));
    for (const id of previos.keys()) {
      if (ids.has(id)) continue;
      quitados.push(id);
      cambiosDelManifiesto.push(mensaje("AJUSTES-PROYECTO-REPO-QUITA", { id }));
    }
    const mismoOrden = nuevos.filter((r) => previos.has(String(r.id))).map((r) => r.id).join("\n") === antesDeRepos.filter((r) => ids.has(String(r.id))).map((r) => r.id).join("\n");
    if (!mismoOrden) cambiosDelManifiesto.push(mensaje("AJUSTES-PROYECTO-REPOS-ORDEN"));
    if (nuevos.length || "repos" in objeto) objeto.repos = nuevos;
  }

  const validado = validarManifiesto(objeto);
  if (!validado.ok) throw new ErrorDeArgumentos(mensaje("STUDIO-MANIFIESTO-NO-VALDRIA", { error: validado.error.replace(/\.$/, "") }));
  const manifiesto = validado.manifiesto;
  const presets = presetsDisponibles(idiomaDelProyecto(proyecto, manifiesto).idioma);
  if (cambiosDelManifiesto.length && !presets.has(manifiesto.preset)) {
    return { posible: false, motivo: mensaje("STUDIO-PRESET-NO-EXISTE", { preset: manifiesto.preset, disponibles: [...presets.keys()].sort() }) };
  }

  // machine.json: the own paths of the repos of this project.
  const propias = Object.entries(a.rutasPropias ?? {});
  let escrituraDeMaquina: EscrituraDePlan | null = null;
  const cambiosDeMaquina: string[] = [];
  const avisos: string[] = [];
  const maquina = leerMaquinaParaEditar();
  if (propias.length) {
    if (maquina.estado === "invalido") return { posible: false, motivo: mensaje("AJUSTES-MAQUINA-A-MANO", { error: maquina.error }) };
    const idsDelProyecto = new Set(manifiesto.repos.map((r) => r.id));
    const edicion: EdicionDeMaquina = { repos: {} };
    for (const [id, valor] of propias) {
      if (valor !== null && !idsDelProyecto.has(id)) throw new ErrorDeArgumentos(mensaje("AJUSTES-PROYECTO-RUTA-PROPIA-SIN-REPO", { id }));
      edicion.repos![`${proyecto}/${id}`] = valor;
    }
    const planeada = planDeEdicion(maquina, edicion);
    if (planeada) {
      escrituraDeMaquina = planeada.escritura;
      cambiosDeMaquina.push(...planeada.cambios);
      avisos.push(...planeada.faltan.map(({ clave, ruta }) => mensaje("AJUSTES-RUTA-NO-EXISTE", { clave, ruta })));
    }
  }

  // What a removed repo leaves behind: receipts that cite it, and its own path in machine.json.
  const clavesDeMaquina = maquina.estado === "valido" && esObjeto(maquina.objeto.repos) ? Object.keys(maquina.objeto.repos) : [];
  for (const id of quitados) {
    const recibos = recibosQueCitan(proyecto, id);
    if (recibos > 0) avisos.push(mensaje("AJUSTES-PROYECTO-REPO-CON-RECIBOS", { id, recibos }));
    const clave = claveDeMaquina(`${proyecto}/${id}`);
    const sigue = clavesDeMaquina.find((k) => claveDeMaquina(k) === clave);
    if (sigue && a.rutasPropias?.[id] !== null) avisos.push(mensaje("AJUSTES-PROYECTO-REPO-CON-CLAVE", { id, clave: sigue }));
  }

  const despues = json2(objeto);
  const cambiaElManifiesto = cambiosDelManifiesto.length > 0;
  if (!cambiaElManifiesto && !escrituraDeMaquina) return { posible: false, motivo: mensaje("AJUSTES-PROYECTO-IGUAL", { proyecto }) };

  const escrituras: EscrituraDePlan[] = [];
  if (escrituraDeMaquina) escrituras.push(escrituraDeMaquina);
  if (cambiaElManifiesto) escrituras.push({ ruta: lectura.ruta, antes: crudo, despues, copia: true, exclusiva: false });
  const cambios = [...cambiosDeMaquina, ...cambiosDelManifiesto];
  const archivos = [...(escrituraDeMaquina ? ["machine.json"] : []), ...(cambiaElManifiesto ? ["phase-gate.json"] : [])];
  return { posible: true, resumen: mensaje("AJUSTES-PROYECTO-RESUMEN", { proyecto, cambios, archivos }), hecho: mensaje("AJUSTES-PROYECTO-HECHO", { proyecto, cambios }), escrituras, avisos };
}
