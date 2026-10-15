// La única puerta a git, y de solo lectura.
//
// El servidor nunca escribe en git (principio 3 del plan): los commits los hace el agente con su
// terminal. Pero hasta leer tiene efectos si no se tiene cuidado: `git status` puede reescribir el
// índice y tomar index.lock (y estorbar a un commit que el agente esté haciendo a la vez), y si el
// repo configura core.fsmonitor, git EJECUTA ese comando. Un repo clonado de cualquier sitio podría
// traerlo. Por eso toda llamada pasa por aquí, con:
//   - `-c core.fsmonitor=false` delante de todo;
//   - GIT_OPTIONAL_LOCKS=0, para que status no tome locks opcionales;
//   - GIT_TERMINAL_PROMPT=0, para que nada se quede esperando una contraseña;
//   - LC_ALL=C, para que los mensajes de error no dependan del idioma del equipo;
//   - execFile, sin shell, con argumentos que son constantes del código: ningún texto que venga del
//     modelo llega a la línea de comandos de git.

import { execFile } from "child_process";
import * as fs from "fs";

export const ESPERA_DE_GIT_MS = 10_000;
const SALIDA_MAXIMA = 1_048_576;

export type MotivoDeError = "no-instalado" | "no-es-repo" | "propiedad-dudosa" | "tiempo" | "otro";

export class ErrorDeGit extends Error {
  constructor(
    message: string,
    readonly motivo: MotivoDeError
  ) {
    super(message);
  }
}

// El error de git dicho para una persona, con lo que tiene que hacer.
export type FalloDeEjecucion = { code?: string | number | null | undefined; killed?: boolean | undefined; message: string };

export function traducirError(error: FalloDeEjecucion, stderr: string, dir: string): ErrorDeGit {
  if (error.code === "ENOENT") return new ErrorDeGit("git no está instalado o no está en el PATH de este equipo.", "no-instalado");
  if (error.killed) return new ErrorDeGit(`git no respondió en ${ESPERA_DE_GIT_MS / 1000} s en ${dir}.`, "tiempo");
  if (/dubious ownership/i.test(stderr)) {
    return new ErrorDeGit(
      `git se niega a leer ${dir} porque la carpeta es de otro usuario ("dubious ownership"). Si confías en ella, ` +
        `márcala como segura con: git config --global --add safe.directory "${dir.replace(/\\/g, "/")}"`,
      "propiedad-dudosa"
    );
  }
  if (/not a git repository/i.test(stderr)) return new ErrorDeGit(`${dir} no es un repositorio de git.`, "no-es-repo");
  return new ErrorDeGit(`git falló en ${dir}: ${stderr.trim() || error.message}`, "otro");
}

export function git(dir: string, args: readonly string[]): Promise<string> {
  // Con un cwd que no existe, execFile da ENOENT y se confundiría con "git no está instalado".
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    return Promise.reject(new ErrorDeGit(`${dir} no existe o no es una carpeta.`, "otro"));
  }

  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-c", "core.fsmonitor=false", ...args],
      {
        cwd: dir,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
        timeout: ESPERA_DE_GIT_MS,
        maxBuffer: SALIDA_MAXIMA,
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) reject(traducirError(error, stderr, dir));
        else resolve(stdout);
      }
    );
  });
}
