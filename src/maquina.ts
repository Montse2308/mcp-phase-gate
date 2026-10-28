// The shape of `<configDir>/machine.json`, the file that holds what belongs to this machine and does
// not travel with the Documentation: the path of each repo, the machine-wide paths, the default
// preset and the default language.
//
// It lives apart from manifiesto.ts because config.ts has to read it (the paths can come from here)
// and manifiesto.ts imports config.ts. The only dependencies are zod, path and the messages, so
// "broken" means the same thing for the server, doctor and Ajustes.
//
// Version 1 only had `repos`, `presetPorDefecto` and `idiomaPorDefecto`. Version 2 adds `rutas`. The
// 4.x series reads both and writes 2; the 3.x series does not read 2.

import * as path from "path";
import { z } from "zod";

import { mensaje } from "./i18n/mensajes.js";

export const ARCHIVO_MAQUINA = "machine.json";
export const VERSION_DE_MAQUINA = 2;
export const URL_ESQUEMA_MAQUINA = "https://unpkg.com/mcp-phase-gate@4/schema/machine.json";

const esAbsoluta = (ruta: string): boolean => path.win32.isAbsolute(ruta) || path.posix.isAbsolute(ruta);

// Absolute, because a relative path would be resolved against the working directory of the client,
// which is different in each one.
export const RutaAbsoluta = z
  .string()
  .min(1)
  .refine(esAbsoluta, { error: () => mensaje("MAQUINA-TXT-RUTA-ABSOLUTA") });

export const RutasDeMaquina = z
  .object({
    documentacion: RutaAbsoluta.optional(),
    carpetaDeRepos: RutaAbsoluta.optional(),
    // Empty on purpose means that the tasks hang straight from the project.
    subcarpetaTareas: z.string().optional(),
  })
  .strict();

export type RutasDeMaquina = z.output<typeof RutasDeMaquina>;

export const MaquinaConfig = z
  .object({
    $schema: z.string().optional(),
    version: z.literal([1, 2]),
    rutas: RutasDeMaquina.optional(),
    // "<PROJECT>/<repo id>" -> absolute path in THIS machine
    repos: z.record(z.string().regex(/^[^/\\]+\/[a-z0-9][a-z0-9-]{0,39}$/), RutaAbsoluta).default({}),
    presetPorDefecto: z.string().optional(), // for projects without a manifest; "software" if missing
    // For projects that declare no language and have no documents that say it.
    idiomaPorDefecto: z.enum(["es", "en"]).optional(),
  })
  .strict();

export type MaquinaConfig = z.output<typeof MaquinaConfig>;

// ─── Readable errors ────────────────────────────────────────────────────────
// "repos[1].dir", not ["repos", 1, "dir"]: it is what the person looks for in the file.
export function rutaDeError(ruta: readonly PropertyKey[]): string {
  let texto = "";
  for (const parte of ruta) texto += typeof parte === "number" ? `[${parte}]` : `${texto ? "." : ""}${String(parte)}`;
  return texto || mensaje("MANIFIESTO-TXT-RAIZ");
}

// The value that was at that path in the file: zod does not keep it in the error, and without it a
// missing field cannot be told from one that holds something else.
function valorEn(crudo: unknown, ruta: readonly PropertyKey[]): unknown {
  let actual: unknown = crudo;
  for (const parte of ruta) {
    if (actual === null || typeof actual !== "object") return undefined;
    actual = (actual as Record<PropertyKey, unknown>)[parte];
  }
  return actual;
}

function mensajeDe(issue: z.core.$ZodIssue, crudo: unknown): string {
  if ((issue.code === "invalid_type" || issue.code === "invalid_value") && valorEn(crudo, issue.path) === undefined) return mensaje("MANIFIESTO-TXT-FALTA");
  const i = issue as z.core.$ZodIssue & { keys?: string[]; values?: unknown[]; expected?: string; minimum?: number | bigint; maximum?: number | bigint; origin?: string };
  switch (i.code) {
    case "unrecognized_keys":
      return mensaje("MANIFIESTO-TXT-CLAVE-DESCONOCIDA", { claves: i.keys ?? [] });
    case "invalid_type":
      return mensaje("MANIFIESTO-TXT-TIPO", { tipo: i.expected });
    case "invalid_key":
      return mensaje("MANIFIESTO-TXT-CLAVE-MAQUINA");
    case "invalid_value":
      return mensaje("MANIFIESTO-TXT-VALOR", { valores: i.values ?? [] });
    case "too_small":
      return i.origin === "string" && Number(i.minimum) === 1 ? mensaje("MANIFIESTO-TXT-VACIO") : mensaje("MANIFIESTO-TXT-CORTO", { minimo: String(i.minimum) });
    case "too_big":
      return mensaje("MANIFIESTO-TXT-LARGO", { maximo: String(i.maximum) });
    case "invalid_format":
      return /^Invalid/.test(i.message) ? mensaje("MANIFIESTO-TXT-FORMATO") : i.message;
    default:
      return i.message;
  }
}

export function errorDeZod(error: z.ZodError, crudo: unknown): string {
  return error.issues.map((issue) => `${rutaDeError(issue.path)}: ${mensajeDe(issue, crudo)}`).join("; ");
}

// ─── Syntax errors with line and column ─────────────────────────────────────
// JSON.parse does not say where it failed in a way that is the same on every Node: some messages carry
// a position and some only echo a piece of the text. This is a strict JSON scanner that only finds the
// offset of the first character that does not belong.
const BLANCOS = new Set([" ", "\t", "\n", "\r"]);

export function posicionDeErrorJson(texto: string): number | null {
  let i = 0;
  const saltar = (): void => {
    while (i < texto.length && BLANCOS.has(texto[i]!)) i++;
  };
  const literal = (palabra: string): boolean => {
    if (!texto.startsWith(palabra, i)) return false;
    i += palabra.length;
    return true;
  };
  const cadena = (): boolean => {
    i++; // the opening quote
    while (i < texto.length) {
      const c = texto[i]!;
      if (c === '"') {
        i++;
        return true;
      }
      if (c < " ") return false;
      if (c === "\\") {
        const e = texto[i + 1];
        if (e === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(texto.slice(i + 2, i + 6))) return false;
          i += 6;
          continue;
        }
        if (e === undefined || !'"\\/bfnrt'.includes(e)) {
          i++;
          return false;
        }
        i += 2;
        continue;
      }
      i++;
    }
    return false;
  };
  const numero = (): boolean => {
    const encontrado = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(texto.slice(i));
    if (!encontrado) return false;
    i += encontrado[0].length;
    return true;
  };
  const valor = (profundidad: number): boolean => {
    saltar();
    const c = texto[i];
    if (profundidad > 200) return false;
    if (c === "{") {
      i++;
      saltar();
      if (texto[i] === "}") {
        i++;
        return true;
      }
      for (;;) {
        saltar();
        if (texto[i] !== '"' || !cadena()) return false;
        saltar();
        if (texto[i] !== ":") return false;
        i++;
        if (!valor(profundidad + 1)) return false;
        saltar();
        if (texto[i] === ",") {
          i++;
          continue;
        }
        if (texto[i] === "}") {
          i++;
          return true;
        }
        return false;
      }
    }
    if (c === "[") {
      i++;
      saltar();
      if (texto[i] === "]") {
        i++;
        return true;
      }
      for (;;) {
        if (!valor(profundidad + 1)) return false;
        saltar();
        if (texto[i] === ",") {
          i++;
          continue;
        }
        if (texto[i] === "]") {
          i++;
          return true;
        }
        return false;
      }
    }
    if (c === '"') return cadena();
    if (c === "t") return literal("true");
    if (c === "f") return literal("false");
    if (c === "n") return literal("null");
    return numero();
  };
  if (!valor(0)) return i;
  saltar();
  return i < texto.length ? i : null;
}

// Line and column, both from 1, of an offset in the text.
export function lineaYColumna(texto: string, posicion: number): { linea: number; columna: number } {
  const antes = texto.slice(0, posicion);
  const linea = antes.split("\n").length;
  return { linea, columna: posicion - (antes.lastIndexOf("\n") + 1) + 1 };
}

// ─── Reading ────────────────────────────────────────────────────────────────
// A pure function of the text: whoever reads the file (the server, doctor, Ajustes) gets the same answer.
export type InterpretacionDeMaquina = { ok: true; config: MaquinaConfig; crudo: Record<string, unknown> } | { ok: false; error: string };

export function interpretarMaquina(texto: string): InterpretacionDeMaquina {
  const limpio = texto.replace(/^﻿/, "");
  let crudo: unknown;
  try {
    crudo = JSON.parse(limpio);
  } catch (error) {
    const posicion = posicionDeErrorJson(limpio) ?? Number(/position (\d+)/.exec(error instanceof Error ? error.message : "")?.[1] ?? 0);
    const { linea, columna } = lineaYColumna(limpio, posicion);
    const caracter = posicion < limpio.length ? limpio[posicion]! : null;
    return { ok: false, error: mensaje("MAQUINA-TXT-SINTAXIS", { linea, columna, caracter: caracter === null ? null : caracter.trim() === "" ? JSON.stringify(caracter).slice(1, -1) : caracter }) };
  }
  const leido = MaquinaConfig.safeParse(crudo);
  if (!leido.success) return { ok: false, error: `${errorDeZod(leido.error, crudo)}.` };
  return { ok: true, config: leido.data, crudo: crudo as Record<string, unknown> };
}
