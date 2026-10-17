// La línea de comandos del paquete. Sin argumentos, el binario es el servidor MCP que lanza el
// cliente; con argumentos, es una herramienta para la persona que lo instaló.
//
// Un servidor MCP habla JSON-RPC por stdin y no imprime nada por stdout. Ejecutado a mano en
// una terminal —que es exactamente lo que hace quien acaba de leer `npx mcp-phase-gate` en el
// README— se queda esperando entrada, sin señal de vida, y parece roto. Por eso existen la ayuda
// y `doctor`: el primero explica qué es esto, el segundo dice si está bien instalado.

import { parseArgs } from "util";

import { SERVER_NAME, SERVER_VERSION } from "./config.js";
import { anclasNoVigentes, diagnosticar, formatearDiagnostico, formatearProcedencia, procedenciaDeFase } from "./diagnostico.js";
import type { Diagnostico } from "./diagnostico.js";
import { ejecutarEject } from "./eject.js";
import { CLAVE_VALIDA, CLIENTES } from "./init.js";
import type { Cliente, OpcionesInit } from "./init.js";

export const AYUDA = `${SERVER_NAME} v${SERVER_VERSION}

Servidor MCP que parte cada requerimiento en cinco fases con compuerta y obliga a que cada
una deje su documento en una documentación central.

El servidor NO se ejecuta a mano: lo lanza tu cliente MCP. Ejecutado directamente se queda
esperando mensajes JSON-RPC por stdin, que es lo que parece que se colgó.

Uso:
  ${SERVER_NAME}                 Arranca el servidor MCP por stdio (lo hace tu cliente).
  ${SERVER_NAME} doctor          Revisa la instalación: variables, prompts, proyectos y avisos.
  ${SERVER_NAME} doctor --json   Lo mismo, como JSON.
  ${SERVER_NAME} doctor --reverificar
                                Además, comprueba que el commit de cada recibo siga en su rama y que
                                cada artefacto sellado no haya cambiado (llama a git).
  ${SERVER_NAME} doctor --fase N [--proyecto P]
                                De dónde sale cada ranura del prompt de esa fase (capa y archivo:línea).
  ${SERVER_NAME} init            Registra el servidor en tus clientes (Claude Code, Cursor, VS Code).
  ${SERVER_NAME} eject <objetivo> --a global|proyecto:<NOMBRE>
                                Copia un prompt, una ranura, un comando o un preset para editarlo.
  ${SERVER_NAME} ui              El Studio: una vista local de tus proyectos y tareas en el navegador.
  ${SERVER_NAME} --version       La versión.
  ${SERVER_NAME} --help          Esta ayuda.

init:
  --cliente claude-code|cursor|vscode|todos   Sin esto, detecta los que hay en este equipo.
  --clave <clave>        Nombre del registro nuevo (por defecto "pg"). Uno que ya existe conserva el suyo.
  --docs <ruta>          Documentación Central (si no, PHASE_GATE_DOCS_PATH, o te la pregunta).
  --repos <ruta>         Carpeta de repositorios (si no, PHASE_GATE_REPOS_PATH, o te la pregunta).
  --comandos             Copia /f1…/fN a ~/.claude/commands/ o ~/.cursor/commands/.
  --migrate              Crea phase-gate.json con "preset": "software-replica" en los proyectos sin él.
    --preset <nombre>    Otro preset para la migración.
    --solo-este-equipo   En vez de manifiestos, presetPorDefecto en el machine.json de este equipo.
  --dry-run              Dice lo que haría, sin escribir nada.
  --yes                  Confirma los cambios sobre lo que ya existe sin preguntar.

eject <objetivo>:
  fase-3                 El prompt de fábrica de la fase, con sus ranuras.
  fase-3/pruebas         El contenido efectivo de una ranura (con preset y reglas), como bloque.
  global/evidencia       Igual, para una ranura de las reglas globales.
  comando-f4             El texto del comando /f4.
  preset:<nombre>        El archivo del preset (siempre a tu carpeta de configuración).
  --a global|proyecto:<NOMBRE>   A qué capa. --dry-run lo enseña sin escribir; --fuerza reemplaza con copia.

ui:
  --puerto <n>           El puerto (en 127.0.0.1). Sin esto, uno libre.
  --no-abrir             No abre el navegador: solo imprime el enlace, que sirve una sola vez.

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
  PHASE_GATE_CONFIG_PATH    Carpeta de machine.json y de los presets propios (por defecto, la del sistema).
  PHASE_GATE_ELICITATION    "off" para que el servidor no pida confirmaciones al cliente.

Documentación: https://github.com/Montse2308/mcp-phase-gate`;

export const AVISO_TERMINAL =
  "Esperando un cliente MCP por stdin. Si querías revisar la instalación: `npx mcp-phase-gate doctor`.";

export type Salida = { out: (texto: string) => void; err: (texto: string) => void };

export const SALIDA_DE_PROCESO: Salida = {
  out: (texto) => process.stdout.write(`${texto}\n`),
  err: (texto) => process.stderr.write(`${texto}\n`),
};

// "servidor": quien llama arranca el servidor MCP. "salir": el código de salida del comando.
// "init": las opciones ya validadas; init es asíncrono (pregunta, ejecuta `claude`) y lo lanza index.ts.
// "doctor-reverificar": doctor con las anclas comprobadas contra git, que es asíncrono; también lo lanza
// index.ts, con doctorReverificando.
export type ResultadoCli =
  | { accion: "servidor" }
  | { accion: "salir"; codigo: number }
  | { accion: "init"; opciones: OpcionesInit }
  | { accion: "doctor-reverificar"; json: boolean }
  | { accion: "ui"; opciones: OpcionesUi };

// Las opciones de `ui`, ya validadas. El Studio vive en src/studio/ y se carga solo para `ui`, con un
// import dinámico: el servidor MCP por stdio no carga nada de él (test/aislamiento.test.ts).
export type OpcionesUi = { puerto: number | null; abrir: boolean };

export async function ejecutarUi(opciones: OpcionesUi, salida: Salida = SALIDA_DE_PROCESO): Promise<number> {
  const { lanzarStudio } = await import("./studio/servidor.js");
  return lanzarStudio(opciones, salida);
}

// El diagnóstico impreso, y el código de salida: 1 si hay algún error.
function escribirDiagnostico(diagnostico: Diagnostico, json: boolean, salida: Salida): number {
  salida.out(json ? JSON.stringify(diagnostico, null, 2) : formatearDiagnostico(diagnostico, "texto"));
  return diagnostico.hallazgos.some((h) => h.severidad === "error") ? 1 : 0;
}

export async function doctorReverificando(json: boolean, salida: Salida = SALIDA_DE_PROCESO): Promise<number> {
  return escribirDiagnostico(diagnosticar({ hallazgosExtra: await anclasNoVigentes() }), json, salida);
}

function invalido(salida: Salida, motivo?: string): ResultadoCli {
  if (motivo) salida.err(`${motivo}\n`);
  salida.err(AYUDA);
  return { accion: "salir", codigo: 2 };
}

// Qué banderas acepta cada subcomando: una bandera de init pasada a doctor es un error, no se ignora.
const BANDERAS_DE: Record<string, string[]> = {
  doctor: ["json", "fase", "proyecto", "reverificar"],
  init: ["cliente", "clave", "docs", "repos", "comandos", "migrate", "preset", "solo-este-equipo", "dry-run", "yes"],
  eject: ["a", "dry-run", "fuerza"],
  ui: ["puerto", "no-abrir"],
};

type Valores = {
  help?: boolean;
  version?: boolean;
  json?: boolean;
  cliente?: string;
  clave?: string;
  docs?: string;
  repos?: string;
  comandos?: boolean;
  migrate?: boolean;
  preset?: string;
  "solo-este-equipo"?: boolean;
  "dry-run"?: boolean;
  yes?: boolean;
  a?: string;
  fuerza?: boolean;
  fase?: string;
  proyecto?: string;
  reverificar?: boolean;
  puerto?: string;
  "no-abrir"?: boolean;
};

function opcionesDeInit(valores: Valores): OpcionesInit | string {
  let clientes: Cliente[] | null = null;
  if (valores.cliente !== undefined) {
    if (valores.cliente === "todos") clientes = [...CLIENTES];
    else if ((CLIENTES as readonly string[]).includes(valores.cliente)) clientes = [valores.cliente as Cliente];
    else return `--cliente "${valores.cliente}" no es válido: usa claude-code, cursor, vscode o todos.`;
  }
  if (valores.clave !== undefined && !CLAVE_VALIDA.test(valores.clave)) {
    return `--clave "${valores.clave}" no es válida: letras, números, guiones y guiones bajos.`;
  }
  if ((valores.preset !== undefined || valores["solo-este-equipo"]) && !valores.migrate) {
    return "--preset y --solo-este-equipo solo valen junto con --migrate.";
  }
  return {
    clientes,
    clave: valores.clave ?? null,
    docs: valores.docs ?? null,
    repos: valores.repos ?? null,
    comandos: Boolean(valores.comandos),
    migrate: Boolean(valores.migrate),
    preset: valores.preset ?? null,
    soloEsteEquipo: Boolean(valores["solo-este-equipo"]),
    dryRun: Boolean(valores["dry-run"]),
    yes: Boolean(valores.yes),
  };
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

  let valores: Valores;
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
        cliente: { type: "string" },
        clave: { type: "string" },
        docs: { type: "string" },
        repos: { type: "string" },
        comandos: { type: "boolean" },
        migrate: { type: "boolean" },
        preset: { type: "string" },
        "solo-este-equipo": { type: "boolean" },
        "dry-run": { type: "boolean" },
        yes: { type: "boolean", short: "y" },
        a: { type: "string" },
        fase: { type: "string" },
        proyecto: { type: "string" },
        fuerza: { type: "boolean" },
        reverificar: { type: "boolean" },
        puerto: { type: "string" },
        "no-abrir": { type: "boolean" },
      },
    }));
  } catch (error) {
    return invalido(salida, error instanceof Error ? error.message : undefined);
  }

  const subcomando = posicionales[0] ?? "";
  const permitidas = BANDERAS_DE[subcomando] ?? [];
  const sobrantes = Object.keys(valores).filter((bandera) => !["help", "version"].includes(bandera) && !permitidas.includes(bandera));
  if (sobrantes.length) return invalido(salida, `${sobrantes.map((b) => `--${b}`).join(", ")} no vale con "${subcomando || "(sin subcomando)"}".`);

  if (valores.help) {
    salida.out(AYUDA);
    return { accion: "salir", codigo: 0 };
  }

  if (valores.version) {
    salida.out(SERVER_VERSION);
    return { accion: "salir", codigo: 0 };
  }

  // doctor --reverificar necesita git, que es asíncrono: lo ejecuta index.ts (doctorReverificando).
  if (posicionales.length === 1 && subcomando === "doctor" && valores.reverificar) {
    if (valores.fase !== undefined || valores.proyecto !== undefined) return invalido(salida, "--reverificar no va con --fase ni con --proyecto.");
    return { accion: "doctor-reverificar", json: Boolean(valores.json) };
  }

  // doctor --fase N [--proyecto P]: la procedencia de cada ranura de esa fase.
  if (posicionales.length === 1 && subcomando === "doctor" && (valores.fase !== undefined || valores.proyecto !== undefined)) {
    const fase = Number(valores.fase);
    if (valores.fase === undefined || !Number.isInteger(fase) || fase < 1) return invalido(salida, "doctor --proyecto necesita --fase N, con N un número de fase (ej. --fase 3).");
    try {
      const informe = procedenciaDeFase(fase, valores.proyecto ?? null);
      salida.out(valores.json ? JSON.stringify(informe, null, 2) : formatearProcedencia(informe));
      return { accion: "salir", codigo: 0 };
    } catch (error) {
      salida.err(error instanceof Error ? error.message : String(error));
      return { accion: "salir", codigo: 1 };
    }
  }

  if (posicionales.length === 1 && subcomando === "doctor") {
    return { accion: "salir", codigo: escribirDiagnostico(diagnosticar(), Boolean(valores.json), salida) };
  }

  if (posicionales.length === 2 && subcomando === "eject") {
    const codigo = ejecutarEject(posicionales[1]!, { destino: valores.a ?? null, dryRun: Boolean(valores["dry-run"]), fuerza: Boolean(valores.fuerza) }, salida);
    return { accion: "salir", codigo };
  }

  if (posicionales.length === 1 && subcomando === "init") {
    const opciones = opcionesDeInit(valores);
    return typeof opciones === "string" ? invalido(salida, opciones) : { accion: "init", opciones };
  }

  if (posicionales.length === 1 && subcomando === "ui") {
    let puerto: number | null = null;
    if (valores.puerto !== undefined) {
      puerto = Number(valores.puerto);
      if (!/^\d+$/.test(valores.puerto) || puerto < 1 || puerto > 65535) return invalido(salida, `--puerto "${valores.puerto}" no es válido: un número de 1 a 65535.`);
    }
    return { accion: "ui", opciones: { puerto, abrir: !valores["no-abrir"] } };
  }

  return invalido(salida);
}
