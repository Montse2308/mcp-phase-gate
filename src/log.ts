// El log del servidor. Va siempre a stderr, que es lo que guardan los clientes en su archivo de
// log, y además, cuando hay un cliente conectado, como notificación MCP (`notifications/message`),
// que algunos clientes muestran en su panel. stdout nunca: es el canal del JSON-RPC.
//
// Vive en su propio módulo y no en servidor.ts porque lo usan también phases.ts y tasks.ts, que
// servidor.ts importa: ponerlo ahí haría un import circular.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LoggingLevel } from "@modelcontextprotocol/sdk/types.js";

import { SERVER_NAME } from "./config.js";

export const PREFIJO_LOG = `[${SERVER_NAME}]`;

// Un solo servidor por proceso, que es lo que hay en producción. Si se crean varios (los tests),
// las notificaciones van al último que se creó; stderr sigue recibiendo todo.
let conectado: McpServer | null = null;

// Lo llama crearServidor. Desde ese momento, si el servidor está conectado, cada línea del log
// también sale como notificación.
export function conectarLog(mcp: McpServer | null): void {
  conectado = mcp;
}

export function log(nivel: LoggingLevel, texto: string): void {
  console.error(`${PREFIJO_LOG} ${texto}`);

  // Solo después del initialize: antes, el cliente no espera notificaciones, y en una terminal la
  // línea JSON aparecía cruda en stdout al arrancar.
  if (!conectado?.isConnected() || !conectado.server.getClientVersion()) return;

  // El SDK descarta solo lo que esté por debajo del nivel que pidió el cliente. Un fallo al
  // notificar no puede tumbar la operación que estaba registrando: ya quedó en stderr.
  conectado.server.sendLoggingMessage({ level: nivel, logger: SERVER_NAME, data: texto }).catch(() => {});
}
