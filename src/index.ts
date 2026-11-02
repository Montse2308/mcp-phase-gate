#!/usr/bin/env node
// The shebang is what makes this file executable as the package's `bin`. Without it, `npx mcp-phase-gate`
// fails on Linux and macOS: the system does not know what to run it with.
//
// The entry point: with arguments, the command line (cli.ts); without them, the MCP server (servidor.ts)
// connected over stdio. No tool is defined here.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { DOCS, NOMBRES_LOGICOS, REPOS, SERVER_NAME, errorDeEnv, leerVariable, requireBasePath } from "./config.js";
import { SALIDA_DE_PROCESO, doctorReverificando, ejecutarCli, ejecutarUi } from "./cli.js";
import { mensaje } from "./i18n/mensajes.js";
import { ejecutarInit, entornoDelProceso } from "./init.js";
import { log } from "./log.js";
import { crearServidor } from "./servidor.js";
import { registrarSesion } from "./sesiones.js";
import { limpiarEstadoViejo } from "./tasks.js";

// Logs the state of each path at startup. It does not abort: the server stays up and the real error is
// returned when the tool is called. This is only so that, when someone ends up opening the log, the
// reason is already written there.
function reportarRutas(): void {
  for (const requerida of [DOCS, REPOS]) {
    try {
      const ruta = requireBasePath(requerida);
      log("info", `${leerVariable(requerida.logica).usada} = ${ruta}`);
    } catch (error) {
      log("error", mensaje("CONFIG-ARRANQUE-SIN-CONFIGURAR", { detalle: error instanceof Error ? error.message : String(error) }));
    }
  }

  for (const logica of NOMBRES_LOGICOS) {
    const { discrepancia } = leerVariable(logica);
    if (discrepancia) log("warning", discrepancia);
  }

  const delEnv = errorDeEnv();
  if (delEnv) log("error", delEnv);
}

async function main() {
  // With arguments, the binary is the person's tool (help, version, doctor); without them, the server a
  // client launches. exitCode and not exit(): exit would cut doctor's output short when stdout is a pipe.
  const resultado = ejecutarCli(process.argv.slice(2));
  if (resultado.accion === "salir") {
    process.exitCode = resultado.codigo;
    return;
  }
  if (resultado.accion === "init") {
    process.exitCode = await ejecutarInit(resultado.opciones, entornoDelProceso(SALIDA_DE_PROCESO));
    return;
  }
  if (resultado.accion === "doctor-reverificar") {
    process.exitCode = await doctorReverificando(resultado.json, SALIDA_DE_PROCESO);
    return;
  }
  if (resultado.accion === "ui") {
    process.exitCode = await ejecutarUi(resultado.opciones, SALIDA_DE_PROCESO);
    return;
  }

  limpiarEstadoViejo();
  reportarRutas();

  // Only the server over stdio keeps the session registry: it is the one a real client launches.
  const mcp = crearServidor();
  registrarSesion(mcp);
  await mcp.connect(new StdioServerTransport());
  log("info", `${SERVER_NAME} MCP server running on stdio`);
}

main().catch((error) => {
  log("error", `Server error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
