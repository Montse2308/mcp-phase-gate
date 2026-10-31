// Confirmations asked of the person directly, through MCP elicitation.
//
// A flag (`force`, `crear_proyecto`) set by the model when "the user confirmed in the chat" is exactly
// what this avoids: the flag is written by whoever should not decide. With elicitation, the server asks
// the person in a form of their client, and the answer does not go through the model.
//
// If the client does not support it, or announces it but does not show it, the flags decide. A person who
// says no, or closes the form, never becomes a yes.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

import { leerVariable } from "./config.js";
import { mensaje } from "./i18n/mensajes.js";
import { log } from "./log.js";

export type Confirmacion = "confirmada" | "rechazada" | "no-disponible";

// `nota` goes with the result when there is something to tell the model (and, through it, the person):
// why nothing was asked, or what to do if the form did not appear.
export type ResultadoConfirmacion = { estado: Confirmacion; nota?: string };

// The SDK waits one minute by default for the client to answer; that is too little for a person to read
// and decide. The tests shorten it.
export const ESPERA_POR_DEFECTO_MS = 180_000;
let esperaMs = ESPERA_POR_DEFECTO_MS;

export function fijarEsperaDeConfirmacion(ms: number | null): void {
  esperaMs = ms ?? ESPERA_POR_DEFECTO_MS;
}

// What is learned about a client during the session. A client that announces elicitation and does not
// implement it, or that lets the deadline pass twice in a row (an open Cursor bug on Windows where the
// form does not appear), is not asked again: every protected write would wait three minutes for nothing.
type Sesion = { noDisponible: boolean; vencimientosSeguidos: number };
const sesiones = new WeakMap<McpServer, Sesion>();

function sesionDe(mcp: McpServer): Sesion {
  let sesion = sesiones.get(mcp);
  if (!sesion) {
    sesion = { noDisponible: false, vencimientosSeguidos: 0 };
    sesiones.set(mcp, sesion);
  }
  return sesion;
}

// The notes (CONFIRMACION-NOTA-*) are worded when returned, in the language of the call.

// Values of PHASE_GATE_ELICITATION that turn direct confirmations off.
const APAGADO = new Set(["off", "false", "0", "no"]);

export async function pedirConfirmacion(
  mcp: McpServer,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  pregunta: { mensaje: string; etiqueta: string }
): Promise<ResultadoConfirmacion> {
  // The escape hatch for a client whose implementation fails.
  if (APAGADO.has(leerVariable("ELICITATION").valor?.toLowerCase() ?? "")) return { estado: "no-disponible" };
  if (!mcp.server.getClientCapabilities()?.elicitation?.form) return { estado: "no-disponible" };

  const sesion = sesionDe(mcp);
  if (sesion.noDisponible) return { estado: "no-disponible" };

  try {
    const respuesta = await mcp.server.elicitInput(
      {
        mode: "form",
        message: pregunta.mensaje,
        requestedSchema: {
          type: "object",
          properties: {
            confirmar: {
              type: "boolean",
              title: pregunta.etiqueta,
              description: mensaje("CONFIRMACION-CASILLA"),
              default: false,
            },
          },
          required: ["confirmar"],
        },
      },
      // With the call's signal: if the client cancels the tool (by its own deadline, or because the person
      // stopped it), the question is cancelled too and nothing is written behind their back.
      { timeout: esperaMs, relatedRequestId: extra.requestId, signal: extra.signal }
    );

    sesion.vencimientosSeguidos = 0;
    return { estado: respuesta.action === "accept" && respuesta.content?.confirmar === true ? "confirmada" : "rechazada" };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);

    // A cancellation from the client says nothing about whether it shows the form: it does not count as a
    // timeout and does not change the session.
    if (extra.signal.aborted) return { estado: "rechazada", nota: mensaje("CONFIRMACION-NOTA-CANCELADA") };

    if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
      sesion.vencimientosSeguidos++;
      if (sesion.vencimientosSeguidos >= 2) {
        // From the next call force decides; THIS one fails closed. Otherwise, a person absent twice plus a
        // force set by the model would end up writing without anyone confirming.
        sesion.noDisponible = true;
        log("warning", mensaje("CONFIRMACION-LOG-VENCIDAS"));
        return { estado: "rechazada", nota: mensaje("CONFIRMACION-NOTA-SIN-RESPUESTA") };
      }
      return { estado: "rechazada", nota: mensaje("CONFIRMACION-NOTA-OFF") };
    }

    sesion.vencimientosSeguidos = 0;

    if ((error instanceof McpError && error.code === ErrorCode.MethodNotFound) || /does not support/i.test(detalle)) {
      sesion.noDisponible = true;
      log("warning", mensaje("CONFIRMACION-LOG-NO-IMPLEMENTA", { detalle }));
      return { estado: "no-disponible", nota: mensaje("CONFIRMACION-NOTA-NO-IMPLEMENTA") };
    }

    // Facing the unknown it fails closed: nothing is written and the person can repeat it.
    log("warning", mensaje("CONFIRMACION-LOG-FALLO", { detalle }));
    return { estado: "rechazada" };
  }
}
