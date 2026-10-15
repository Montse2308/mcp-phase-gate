// La línea de comandos del paquete. Sin argumentos, el binario es el servidor MCP que lanza el
// cliente; con argumentos, es una herramienta para la persona que lo instaló.
//
// Un servidor MCP habla JSON-RPC por stdin y no imprime nada por stdout. Ejecutado a mano en
// una terminal —que es exactamente lo que hace quien acaba de leer `npx mcp-phase-gate` en el
// README— se queda esperando entrada, sin señal de vida, y parece roto. Por eso existen la ayuda
// y `doctor`: el primero explica qué es esto, el segundo dice si está bien instalado.

import { parseArgs } from "util";

import { SERVER_NAME, SERVER_VERSION } from "./config.js";
import { diagnosticar, formatearDiagnostico } from "./diagnostico.js";

export const AYUDA = `${SERVER_NAME} v${SERVER_VERSION}

Servidor MCP que parte cada requerimiento en cinco fases con compuerta y obliga a que cada
una deje su documento en una documentación central.

El servidor NO se ejecuta a mano: lo lanza tu cliente MCP. Ejecutado directamente se queda
esperando mensajes JSON-RPC por stdin, que es lo que parece que se colgó.

Uso:
  ${SERVER_NAME}                 Arranca el servidor MCP por stdio (lo hace tu cliente).
  ${SERVER_NAME} doctor          Revisa la instalación: variables, prompts, proyectos y avisos.
  ${SERVER_NAME} doctor --json   Lo mismo, como JSON.
  ${SERVER_NAME} --version       La versión.
  ${SERVER_NAME} --help          Esta ayuda.

Regístralo en tu cliente (Cursor, VS Code, Claude Code) así:

  {
    "mcpServers": {
      "${SERVER_NAME}": {
        "command": "npx",
        "args": ["-y", "mcp-phase-gate"],
        "env": {
          "PHASE_GATE_DOCS_PATH": "<tu carpeta de documentación>",
          "PHASE_GATE_REPOS_PATH": "<tu carpeta de repositorios>"
        }
      }
    }
  }

Variables de entorno (los nombres ORQUESTADOR_* de antes siguen valiendo como alias):
  PHASE_GATE_DOCS_PATH      Obligatoria. Raíz de la Documentación Central.
  PHASE_GATE_REPOS_PATH     Obligatoria. Carpeta con tus repositorios de código.
  PHASE_GATE_TASKS_SUBDIR   Subcarpeta de tareas dentro de cada proyecto. Por defecto "Proyectos".
  PHASE_GATE_PROMPTS_PATH   Carpeta de prompts propios, que se superponen a los del paquete.
  PHASE_GATE_STATE_PATH     Dónde guardar los punteros de tarea activa.
  PHASE_GATE_ELICITATION    "off" para que el servidor no pida confirmaciones al cliente.

Documentación: https://github.com/Montse2308/mcp-phase-gate`;

export const AVISO_TERMINAL =
  "Esperando un cliente MCP por stdin. Si querías revisar la instalación: `npx mcp-phase-gate doctor`.";

export type Salida = { out: (texto: string) => void; err: (texto: string) => void };

const SALIDA_DE_PROCESO: Salida = {
  out: (texto) => process.stdout.write(`${texto}\n`),
  err: (texto) => process.stderr.write(`${texto}\n`),
};

// "servidor": quien llama arranca el servidor MCP. Un número: el código de salida del comando.
export type ResultadoCli = { accion: "servidor" } | { accion: "salir"; codigo: number };

function invalido(salida: Salida): ResultadoCli {
  salida.err(AYUDA);
  return { accion: "salir", codigo: 2 };
}

export function ejecutarCli(
  argv: string[],
  salida: Salida = SALIDA_DE_PROCESO,
  esTerminal: boolean = Boolean(process.stdin.isTTY)
): ResultadoCli {
  if (argv.length === 0) {
    // stderr, no stdout: stdout es el canal del JSON-RPC aunque nadie esté escuchando.
    if (esTerminal) salida.err(AVISO_TERMINAL);
    return { accion: "servidor" };
  }

  let valores: { help?: boolean; version?: boolean; json?: boolean };
  let posicionales: string[];
  try {
    ({ values: valores, positionals: posicionales } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        json: { type: "boolean" },
      },
    }));
  } catch {
    return invalido(salida);
  }

  if (valores.help) {
    salida.out(AYUDA);
    return { accion: "salir", codigo: 0 };
  }

  if (valores.version) {
    salida.out(SERVER_VERSION);
    return { accion: "salir", codigo: 0 };
  }

  if (posicionales.length === 1 && posicionales[0] === "doctor") {
    const diagnostico = diagnosticar();
    salida.out(valores.json ? JSON.stringify(diagnostico, null, 2) : formatearDiagnostico(diagnostico, "texto"));
    return { accion: "salir", codigo: diagnostico.hallazgos.some((h) => h.severidad === "error") ? 1 : 0 };
  }

  return invalido(salida);
}
