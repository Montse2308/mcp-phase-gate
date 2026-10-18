#!/usr/bin/env node
// El shebang es lo que vuelve ejecutable este archivo como `bin` del paquete. Sin él,
// `npx mcp-phase-gate` falla en Linux y macOS: el sistema no sabe con qué interpretarlo.
//
// El punto de entrada: con argumentos, la línea de comandos (cli.ts); sin ellos, el servidor MCP
// (servidor.ts) conectado por stdio. Aquí no se define ninguna tool.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { DOCS, NOMBRES_LOGICOS, REPOS, SERVER_NAME, errorDeEnv, leerVariable, requireBasePath } from "./config.js";
import { SALIDA_DE_PROCESO, doctorReverificando, ejecutarCli, ejecutarUi } from "./cli.js";
import { ejecutarInit, entornoDelProceso } from "./init.js";
import { log } from "./log.js";
import { crearServidor } from "./servidor.js";
import { registrarSesion } from "./sesiones.js";
import { limpiarEstadoViejo } from "./tasks.js";

// Deja en el log el estado de cada ruta al arrancar. No aborta: el servidor sigue en pie y
// el error real se entrega al llamar la tool. Esto es solo para que, cuando alguien acabe
// abriendo el log, el motivo ya esté ahí escrito.
function reportarRutas(): void {
  for (const requerida of [DOCS, REPOS]) {
    try {
      const ruta = requireBasePath(requerida);
      log("info", `${leerVariable(requerida.logica).usada} = ${ruta}`);
    } catch (error) {
      log("error", `SIN CONFIGURAR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Las dos variables de un mismo nombre lógico, con valores distintos: se avisa una vez.
  for (const logica of NOMBRES_LOGICOS) {
    const { discrepancia } = leerVariable(logica);
    if (discrepancia) log("warning", discrepancia);
  }

  const delEnv = errorDeEnv();
  if (delEnv) log("error", delEnv);
}

async function main() {
  // Con argumentos, el binario es la herramienta de la persona (ayuda, versión, doctor); sin
  // ellos, el servidor que lanza el cliente. exitCode y no exit(): exit cortaría la salida de
  // doctor a medio escribir cuando stdout es una tubería.
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

  // El registro de sesiones solo lo lleva el servidor por stdio: es el que lanza un cliente de verdad.
  const mcp = crearServidor();
  registrarSesion(mcp);
  await mcp.connect(new StdioServerTransport());
  log("info", `${SERVER_NAME} MCP server running on stdio`);
}

main().catch((error) => {
  log("error", `Server error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
