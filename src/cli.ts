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
import { mensaje } from "./i18n/mensajes.js";
import type { Cliente, OpcionesInit } from "./init.js";

// La ayuda y el aviso de la terminal, en el idioma de los mensajes (PHASE_GATE_LANG, si no el del sistema).
export function ayuda(): string {
  return mensaje("CLI-AYUDA", { servidor: SERVER_NAME, version: SERVER_VERSION });
}

export function avisoTerminal(): string {
  return mensaje("CLI-AVISO-TERMINAL");
}

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
// Con `exportar`, `ui` no arranca el Studio: escribe el sitio estático (§7.9 del plan).
export type OpcionesUi = { puerto: number | null; abrir: boolean; demo: boolean; exportar?: { destino: string; datosReales: boolean; yes: boolean } };

export async function ejecutarUi(opciones: OpcionesUi, salida: Salida = SALIDA_DE_PROCESO): Promise<number> {
  if (opciones.exportar) {
    const { exportarEstatico } = await import("./studio/exportar.js");
    const { entornoDelProceso } = await import("./init.js");
    const { esTerminal, preguntar } = entornoDelProceso(salida);
    return exportarEstatico(opciones.exportar, { salida, esTerminal, preguntar });
  }
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
  salida.err(ayuda());
  return { accion: "salir", codigo: 2 };
}

// Qué banderas acepta cada subcomando: una bandera de init pasada a doctor es un error, no se ignora.
const BANDERAS_DE: Record<string, string[]> = {
  doctor: ["json", "fase", "proyecto", "reverificar"],
  init: ["cliente", "clave", "docs", "repos", "comandos", "migrate", "preset", "idioma", "solo-este-equipo", "dry-run", "yes"],
  eject: ["a", "dry-run", "fuerza"],
  ui: ["puerto", "no-abrir", "demo", "export-static", "incluir-datos-reales", "yes"],
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
  idioma?: string;
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
  demo?: boolean;
  "export-static"?: string;
  "incluir-datos-reales"?: boolean;
};

function opcionesDeInit(valores: Valores): OpcionesInit | string {
  let clientes: Cliente[] | null = null;
  if (valores.cliente !== undefined) {
    if (valores.cliente === "todos") clientes = [...CLIENTES];
    else if ((CLIENTES as readonly string[]).includes(valores.cliente)) clientes = [valores.cliente as Cliente];
    else return mensaje("CLI-CLIENTE-INVALIDO", { cliente: valores.cliente });
  }
  if (valores.clave !== undefined && !CLAVE_VALIDA.test(valores.clave)) {
    return mensaje("CLI-CLAVE-INVALIDA", { clave: valores.clave });
  }
  if ((valores.preset !== undefined || valores.idioma !== undefined || valores["solo-este-equipo"]) && !valores.migrate) {
    return mensaje("CLI-SOLO-CON-MIGRATE");
  }
  if (valores.idioma !== undefined && valores.idioma !== "es" && valores.idioma !== "en") {
    return mensaje("CLI-IDIOMA-INVALIDO", { idioma: valores.idioma });
  }
  return {
    clientes,
    clave: valores.clave ?? null,
    docs: valores.docs ?? null,
    repos: valores.repos ?? null,
    comandos: Boolean(valores.comandos),
    migrate: Boolean(valores.migrate),
    preset: valores.preset ?? null,
    idioma: (valores.idioma as "es" | "en" | undefined) ?? null,
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
    if (esTerminal) salida.err(avisoTerminal());
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
        idioma: { type: "string" },
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
        demo: { type: "boolean" },
        "export-static": { type: "string" },
        "incluir-datos-reales": { type: "boolean" },
      },
    }));
  } catch (error) {
    return invalido(salida, error instanceof Error ? error.message : undefined);
  }

  const subcomando = posicionales[0] ?? "";
  const permitidas = BANDERAS_DE[subcomando] ?? [];
  const sobrantes = Object.keys(valores).filter((bandera) => !["help", "version"].includes(bandera) && !permitidas.includes(bandera));
  if (sobrantes.length) return invalido(salida, mensaje("CLI-BANDERA-NO-VALE", { banderas: sobrantes, subcomando }));

  if (valores.help) {
    salida.out(ayuda());
    return { accion: "salir", codigo: 0 };
  }

  if (valores.version) {
    salida.out(SERVER_VERSION);
    return { accion: "salir", codigo: 0 };
  }

  // doctor --reverificar necesita git, que es asíncrono: lo ejecuta index.ts (doctorReverificando).
  if (posicionales.length === 1 && subcomando === "doctor" && valores.reverificar) {
    if (valores.fase !== undefined || valores.proyecto !== undefined) return invalido(salida, mensaje("CLI-REVERIFICAR-CON-FASE"));
    return { accion: "doctor-reverificar", json: Boolean(valores.json) };
  }

  // doctor --fase N [--proyecto P]: la procedencia de cada ranura de esa fase.
  if (posicionales.length === 1 && subcomando === "doctor" && (valores.fase !== undefined || valores.proyecto !== undefined)) {
    const fase = Number(valores.fase);
    if (valores.fase === undefined || !Number.isInteger(fase) || fase < 1) return invalido(salida, mensaje("CLI-FASE-NECESARIA"));
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
    const exportar = valores["export-static"];
    if (exportar !== undefined) {
      if (!exportar.trim()) return invalido(salida, mensaje("CLI-EXPORT-SIN-CARPETA"));
      if (valores.puerto !== undefined || valores["no-abrir"] || valores.demo) return invalido(salida, mensaje("CLI-EXPORT-INCOMPATIBLE"));
      return { accion: "ui", opciones: { puerto: null, abrir: false, demo: false, exportar: { destino: exportar, datosReales: valores["incluir-datos-reales"] === true, yes: valores.yes === true } } };
    }
    if (valores["incluir-datos-reales"] || valores.yes) return invalido(salida, mensaje("CLI-SOLO-CON-EXPORT"));
    let puerto: number | null = null;
    if (valores.puerto !== undefined) {
      puerto = Number(valores.puerto);
      if (!/^\d+$/.test(valores.puerto) || puerto < 1 || puerto > 65535) return invalido(salida, mensaje("CLI-PUERTO-INVALIDO", { puerto: valores.puerto }));
    }
    return { accion: "ui", opciones: { puerto, abrir: !valores["no-abrir"], demo: valores.demo === true } };
  }

  return invalido(salida);
}
