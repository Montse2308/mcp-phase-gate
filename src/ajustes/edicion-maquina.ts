// Editing machine.json: what the `equipo`, `proyecto` and `init-cliente` plans have in common. The file is
// edited as an object, so the order of its keys is kept (JSON.parse keeps it); a key that is new goes at
// the end. Everything written is version 2, with the $schema of this series.

import * as fs from "fs";

import { leerArchivoDeMaquina } from "../config.js";
import { mensaje } from "../i18n/mensajes.js";
import { URL_ESQUEMA_MAQUINA, VERSION_DE_MAQUINA, interpretarMaquina } from "../maquina.js";
import type { RutasDeMaquina } from "../maquina.js";
import { ErrorDeArgumentos, esObjeto, json2 } from "./plan.js";
import type { EscrituraDePlan } from "./plan.js";

// `null` removes the key, `undefined` leaves it alone.
export type EdicionDeMaquina = {
  rutas?: { [K in keyof RutasDeMaquina]?: string | null | undefined } | undefined;
  idiomaPorDefecto?: "es" | "en" | null | undefined;
  presetPorDefecto?: string | null | undefined;
  // "<PROJECT>/<repo id>" -> its own path on this machine
  repos?: Record<string, string | null> | undefined;
};

export type MaquinaParaEditar =
  | { estado: "ausente"; ruta: string; crudo: null; objeto: null }
  | { estado: "valido"; ruta: string; crudo: string; objeto: Record<string, unknown> }
  | { estado: "invalido"; ruta: string; error: string };

export function leerMaquinaParaEditar(): MaquinaParaEditar {
  const lectura = leerArchivoDeMaquina();
  if (lectura.estado === "ausente") return { estado: "ausente", ruta: lectura.ruta, crudo: null, objeto: null };
  if (lectura.estado === "invalido") return { estado: "invalido", ruta: lectura.ruta, error: lectura.error! };
  const crudo = fs.readFileSync(lectura.ruta, "utf-8");
  return { estado: "valido", ruta: lectura.ruta, crudo, objeto: JSON.parse(crudo.replace(/^﻿/, "")) as Record<string, unknown> };
}

// "proyecto-a/api" and "PROYECTO-A/api" are the same key: the project is compared without case.
const claveNormalizada = (clave: string): string => {
  const corte = clave.indexOf("/");
  return corte < 0 ? clave : `${clave.slice(0, corte).toLowerCase()}${clave.slice(corte)}`;
};

type Resultado = { objeto: Record<string, unknown>; cambios: string[] };

// Applies the edit on a copy. `cambios` says, one line each, what really changed.
export function aplicarEdicion(base: Record<string, unknown> | null, edicion: EdicionDeMaquina): Resultado {
  const objeto: Record<string, unknown> = base ? structuredClone(base) : { $schema: URL_ESQUEMA_MAQUINA, version: VERSION_DE_MAQUINA };
  const cambios: string[] = [];
  const pone = (clave: string, valor: string): void => void cambios.push(mensaje("AJUSTES-CAMBIO-PONE", { clave, valor }));
  const quita = (clave: string): void => void cambios.push(mensaje("AJUSTES-CAMBIO-QUITA", { clave }));

  if (edicion.rutas) {
    const rutas: Record<string, unknown> = esObjeto(objeto.rutas) ? { ...objeto.rutas } : {};
    for (const [clave, valor] of Object.entries(edicion.rutas)) {
      if (valor === undefined) continue;
      if (valor === null) {
        if (clave in rutas) {
          delete rutas[clave];
          quita(`rutas.${clave}`);
        }
      } else if (rutas[clave] !== valor) {
        rutas[clave] = valor;
        pone(`rutas.${clave}`, JSON.stringify(valor));
      }
    }
    if (Object.keys(rutas).length) objeto.rutas = rutas;
    else delete objeto.rutas;
  }

  for (const clave of ["idiomaPorDefecto", "presetPorDefecto"] as const) {
    const valor = edicion[clave];
    if (valor === undefined) continue;
    if (valor === null) {
      if (clave in objeto) {
        delete objeto[clave];
        quita(clave);
      }
    } else if (objeto[clave] !== valor) {
      objeto[clave] = valor;
      pone(clave, JSON.stringify(valor));
    }
  }

  if (edicion.repos) {
    const repos: Record<string, unknown> = esObjeto(objeto.repos) ? { ...objeto.repos } : {};
    for (const [clave, valor] of Object.entries(edicion.repos)) {
      const normalizada = claveNormalizada(clave);
      const existentes = Object.keys(repos).filter((k) => claveNormalizada(k) === normalizada);
      if (valor === null) {
        for (const k of existentes) {
          delete repos[k];
          quita(`repos.${k}`);
        }
        continue;
      }
      const destino = existentes[0] ?? clave;
      if (repos[destino] !== valor) {
        repos[destino] = valor;
        pone(`repos.${destino}`, JSON.stringify(valor));
      }
    }
    // Version 1 files always carried `repos`; an empty one that was not there is not added.
    if (Object.keys(repos).length || "repos" in objeto) objeto.repos = repos;
  }

  return { objeto, cambios };
}

// The version and the $schema of this series: a file written by the 3.x, or by an older 4.x, is left in
// version 2 and @4. The $schema goes first, wherever it was.
export function conVersionActual(objeto: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _anterior, ...resto } = objeto;
  return { $schema: URL_ESQUEMA_MAQUINA, ...resto, version: VERSION_DE_MAQUINA };
}

export type EdicionPlaneada = {
  escritura: EscrituraDePlan;
  cambios: string[];
  nuevo: boolean;
  deVersion1: boolean;
  // The folders that are being saved and are not there on this machine.
  faltan: { clave: string; ruta: string }[];
};

// The write of machine.json for an edit, or null when it would change nothing. The file has to be valid
// (or not exist): the caller checks that before. A result that would not be valid is a bad argument.
export function planDeEdicion(estado: Exclude<MaquinaParaEditar, { estado: "invalido" }>, edicion: EdicionDeMaquina): EdicionPlaneada | null {
  const { objeto, cambios } = aplicarEdicion(estado.objeto, edicion);
  if (cambios.length === 0) return null;
  const despues = json2(conVersionActual(objeto));
  const leido = interpretarMaquina(despues);
  if (!leido.ok) throw new ErrorDeArgumentos(mensaje("AJUSTES-MAQUINA-NO-VALDRIA", { error: leido.error }));

  const faltan: { clave: string; ruta: string }[] = [];
  const mirar = (clave: string, ruta: string | null | undefined): void => {
    if (ruta && !(fs.statSync(ruta, { throwIfNoEntry: false })?.isDirectory() ?? false)) faltan.push({ clave, ruta });
  };
  mirar("rutas.documentacion", edicion.rutas?.documentacion);
  mirar("rutas.carpetaDeRepos", edicion.rutas?.carpetaDeRepos);
  for (const [clave, ruta] of Object.entries(edicion.repos ?? {})) mirar(`repos.${clave}`, ruta);

  return {
    escritura: { ruta: estado.ruta, antes: estado.crudo, despues, copia: estado.crudo !== null && estado.crudo.length > 0, exclusiva: estado.crudo === null },
    cambios,
    nuevo: estado.estado === "ausente",
    deVersion1: estado.objeto?.version === 1,
    faltan,
  };
}
