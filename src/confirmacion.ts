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

const NOTA_OFF =
  "Si tu cliente no te mostró la confirmación, regístralo con PHASE_GATE_ELICITATION=off y la confirmación " +
  "volverá a pedirse en el chat.";

const NOTA_SIN_RESPUESTA =
  "Tu cliente no respondió a dos confirmaciones seguidas: durante el resto de la sesión la confirmación vuelve " +
  "a pedirse en el chat (con force).";

const NOTA_NO_IMPLEMENTA =
  "Tu cliente anuncia confirmaciones directas pero no las implementa: durante el resto de la sesión la " +
  "confirmación vuelve a pedirse en el chat (con force).";

export async function pedirConfirmacion(
  mcp: McpServer,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  pregunta: { mensaje: string; etiqueta: string }
): Promise<ResultadoConfirmacion> {
  // La escotilla para un cliente cuya implementación falle.
  if (leerVariable("ELICITATION").valor?.toLowerCase() === "off") return { estado: "no-disponible" };
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
              description: "Marca la casilla y acepta para confirmar.",
              default: false,
            },
          },
          required: ["confirmar"],
        },
      },
      { timeout: esperaMs, relatedRequestId: extra.requestId }
    );

    sesion.vencimientosSeguidos = 0;
    return { estado: respuesta.action === "accept" && respuesta.content?.confirmar === true ? "confirmada" : "rechazada" };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);

    if (error instanceof McpError && error.code === ErrorCode.RequestTimeout) {
      sesion.vencimientosSeguidos++;
      if (sesion.vencimientosSeguidos >= 2) {
        sesion.noDisponible = true;
        log("warning", "El cliente dejó vencer dos confirmaciones seguidas; se desactivan para el resto de la sesión.");
        return { estado: "no-disponible", nota: NOTA_SIN_RESPUESTA };
      }
      return { estado: "rechazada", nota: NOTA_OFF };
    }

    sesion.vencimientosSeguidos = 0;

    if ((error instanceof McpError && error.code === ErrorCode.MethodNotFound) || /does not support/i.test(mensaje)) {
      sesion.noDisponible = true;
      log("warning", `El cliente anuncia elicitation pero no la implementa (${mensaje}); se desactiva para la sesión.`);
      return { estado: "no-disponible", nota: NOTA_NO_IMPLEMENTA };
    }

    // Ante lo desconocido se falla cerrado: no se escribe nada y la persona puede repetirlo.
    log("warning", `La confirmación falló y se trata como un no: ${mensaje}`);
    return { estado: "rechazada" };
  }
}
