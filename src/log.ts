// The server log. It always goes to stderr, which is what clients keep in their log file, and, when a
// client is connected, also as an MCP notification (`notifications/message`), which some clients show in
// their panel. Never stdout: it is the JSON-RPC channel.
//
// It lives in its own module and not in servidor.ts because phases.ts and tasks.ts use it too, and
// servidor.ts imports them: putting it there would make a circular import.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LoggingLevel } from "@modelcontextprotocol/sdk/types.js";

import { SERVER_NAME } from "./config.js";

export const PREFIJO_LOG = `[${SERVER_NAME}]`;

// One server per process, which is what production has. If several are created (the tests), the
// notifications go to the last one created; stderr still receives everything.
let conectado: McpServer | null = null;

// Called by crearServidor. From then on, if the server is connected, every log line also goes out as a
// notification.
export function conectarLog(mcp: McpServer | null): void {
  conectado = mcp;
}

export function log(nivel: LoggingLevel, texto: string): void {
  console.error(`${PREFIJO_LOG} ${texto}`);

  // Only after initialize: before it, the client does not expect notifications, and in a terminal the
  // JSON line showed up raw on stdout at startup.
  if (!conectado?.isConnected() || !conectado.server.getClientVersion()) return;

  // The SDK drops only what is below the level the client asked for. A failure to notify cannot bring
  // down the operation being logged: it is already on stderr.
  conectado.server.sendLoggingMessage({ level: nivel, logger: SERVER_NAME, data: texto }).catch(() => {});
}
