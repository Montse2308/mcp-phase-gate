// Confirmaciones pedidas directamente a la persona, por elicitation de MCP.
//
// Hasta ahora, reescribir un documento protegido o estrenar un proyecto dependía de una bandera
// (`force`, `crear_proyecto`) que pone el modelo cuando "el usuario lo confirmó en el chat". Es
// justo lo que se quiere evitar: la bandera la escribe quien no debe decidir. Con elicitation, el
// servidor le pregunta a la persona en un formulario de su cliente, y la respuesta no pasa por el
// modelo.
//
// Si el cliente no lo soporta, o lo anuncia pero no lo muestra, se vuelve al comportamiento
// anterior: deciden las banderas. Una persona que dice que no, o que cierra el formulario, nunca
// se convierte en un sí.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

import { leerVariable } from "./config.js";
import { mensaje } from "./i18n/mensajes.js";
import { log } from "./log.js";

export type Confirmacion = "confirmada" | "rechazada" | "no-disponible";

// `nota` acompaña al resultado cuando hay algo que decirle al modelo (y, por él, a la persona):
// por qué no se preguntó, o qué hacer si el formulario no apareció.
export type ResultadoConfirmacion = { estado: Confirmacion; nota?: string };

// El SDK espera un minuto por defecto a que el cliente responda; para que una persona lea y
// decida es poco. Los tests lo acortan.
export const ESPERA_POR_DEFECTO_MS = 180_000;
let esperaMs = ESPERA_POR_DEFECTO_MS;

export function fijarEsperaDeConfirmacion(ms: number | null): void {
  esperaMs = ms ?? ESPERA_POR_DEFECTO_MS;
}

// Lo que se aprende de un cliente durante la sesión. Un cliente que anuncia elicitation y no la
// implementa, o que dos veces seguidas deja vencer el plazo (validación V4: un bug abierto de
// Cursor en Windows en el que el formulario no aparece), no vuelve a recibir preguntas: cada
// escritura protegida esperaría tres minutos para nada.
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

// Las notas (CONFIRMACION-NOTA-*) se redactan al devolverlas, en el idioma de la llamada.

// Valores de PHASE_GATE_ELICITATION que apagan las confirmaciones directas.
const APAGADO = new Set(["off", "false", "0", "no"]);

export async function pedirConfirmacion(
  mcp: McpServer,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  pregunta: { mensaje: string; etiqueta: string }
): Promise<ResultadoConfirmacion> {
  // La escotilla para un cliente cuya implementación falle.
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
      // Con la señal de la llamada: si el cliente cancela la tool (por su propio plazo, o porque la
      // persona la detuvo), la pregunta se cancela también y no se escribe nada a sus espaldas.
      { timeout: esperaMs, relatedRequestId: extra.requestId, signal: extra.signal }
    );

    sesion.vencimientosSeguidos = 0;
    return { estado: respuesta.action === "accept" && respuesta.content?.confirmar === true ? "confirmada" : "rechazada" };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);

    // Una cancelación del cliente no dice nada de si muestra o no el formulario: no cuenta como
    // vencimiento ni cambia la sesión.
    if (extra.signal.aborted) return { estado: "rechazada", nota: mensaje("CONFIRMACION-NOTA-CANCELADA") };

    if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
      sesion.vencimientosSeguidos++;
      if (sesion.vencimientosSeguidos >= 2) {
        // Desde la siguiente llamada decide force; ESTA falla cerrada. Si no, una persona ausente
        // dos veces más un force puesto por el modelo acabarían escribiendo sin que nadie confirmara.
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

    // Ante lo desconocido se falla cerrado: no se escribe nada y la persona puede repetirlo.
    log("warning", mensaje("CONFIRMACION-LOG-FALLO", { detalle }));
    return { estado: "rechazada" };
  }
}
