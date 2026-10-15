// Un cliente MCP del SDK conectado a crearServidor() por un transporte en memoria. Es la forma de
// probar el servidor entero —tools, recursos, prompts, notificaciones— sin lanzar procesos.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ClientCapabilities } from "@modelcontextprotocol/sdk/types.js";

import { crearServidor } from "../src/servidor.js";

// `preparar` configura el cliente antes de conectar: por ejemplo, para que responda roots/list, que
// el servidor pide en cuanto termina el initialize.
export async function conectar(capacidades: ClientCapabilities = {}, preparar?: (cliente: Client) => void) {
  const servidor = crearServidor();
  const cliente = new Client({ name: "cliente-de-prueba", version: "1.0.0" }, { capabilities: capacidades });
  preparar?.(cliente);
  const [delCliente, delServidor] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(delServidor), cliente.connect(delCliente)]);
  return {
    servidor,
    cliente,
    cerrar: async () => {
      await cliente.close();
      await servidor.close();
    },
  };
}

// El texto de la primera parte de una respuesta de tool.
export function textoDe(resultado: object): string {
  const partes = ((resultado as { content?: unknown }).content ?? []) as { type: string; text?: string }[];
  return partes[0]?.text ?? "";
}
