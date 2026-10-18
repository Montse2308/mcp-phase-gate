// El entorno del `ui` de los E2E: nunca el HOME real. La carpeta del usuario, APPDATA y XDG_CONFIG_HOME
// apuntan a carpetas temporales, y el PATH solo lleva un `claude` de mentira (que apunta lo que se le pide
// en llamadas.txt), Node y git: el `claude` de verdad no está, así que nada puede llegar a un cliente real.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const CLAUDE_CMD = ["@echo off", '>>"%~dp0llamadas.txt" echo %*', 'if "%~1"=="--version" goto version', "exit /b 0", ":version", "echo 2.1.0 (de prueba)", "exit /b 0", ""].join("\r\n");
const CLAUDE_SH = ["#!/bin/sh", 'echo "$*" >> "$(dirname "$0")/llamadas.txt"', 'if [ "$1" = "--version" ]; then echo "2.1.0 (de prueba)"; fi', "exit 0", ""].join("\n");

export type EntornoFalso = { env: Record<string, string>; casa: string; llamadas: () => string[] };

export function entornoFalso(raiz: string): EntornoFalso {
  const casa = path.join(raiz, "casa");
  const appData = path.join(casa, "AppData", "Roaming");
  const bin = path.join(raiz, "bin");
  for (const c of [casa, appData, path.join(casa, ".config"), bin]) fs.mkdirSync(c, { recursive: true });
  fs.writeFileSync(path.join(bin, "claude.cmd"), CLAUDE_CMD, "utf-8");
  fs.writeFileSync(path.join(bin, "claude"), CLAUDE_SH, { encoding: "utf-8", mode: 0o755 });

  const git = execFileSync(process.platform === "win32" ? "where" : "which", ["git"], { encoding: "utf-8" }).split(/\r?\n/)[0]!.trim();
  const sistema = process.platform === "win32" ? [path.join(process.env.SystemRoot ?? "C:\\Windows", "System32")] : ["/usr/bin", "/bin"];
  const ruta = [bin, path.dirname(process.execPath), path.dirname(git), ...sistema].join(path.delimiter);
  const env: Record<string, string> = { HOME: casa, USERPROFILE: casa, APPDATA: appData, LOCALAPPDATA: path.join(casa, "AppData", "Local"), XDG_CONFIG_HOME: path.join(casa, ".config"), PATH: ruta };
  return {
    env,
    casa,
    llamadas: () => {
      try {
        return fs.readFileSync(path.join(bin, "llamadas.txt"), "utf-8").split(/\r?\n/).filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}

// La configuración real de los clientes de quien corre los E2E: antes y después tiene que ser la misma.
export function huellaDeLosClientesReales(): string[] {
  const casa = os.homedir();
  const appData = process.env.APPDATA ?? path.join(casa, "AppData", "Roaming");
  return [path.join(casa, ".cursor", "mcp.json"), path.join(appData, "Code", "User", "mcp.json"), path.join(casa, ".claude.json"), path.join(casa, ".claude", "commands"), path.join(casa, ".cursor", "commands")].map((ruta) => {
    const info = fs.statSync(ruta, { throwIfNoEntry: false });
    return `${ruta}|${info ? `${info.isDirectory() ? "d" : info.size}|${info.mtimeMs}` : "no existe"}`;
  });
}
