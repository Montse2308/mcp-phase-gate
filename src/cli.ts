// The command line of the package. Without arguments, the binary is the MCP server that a client launches;
// with arguments, it is a tool for the person who installed it.
//
// An MCP server speaks JSON-RPC on stdin and prints nothing on stdout. Run by hand in a terminal —which is
// exactly what someone who has just read `npx mcp-phase-gate` in the README does— it waits for input, with
// no sign of life, and looks broken. That is why the help and `doctor` exist: the first explains what this
// is, the second says whether it is installed correctly.

import { parseArgs } from "util";

import { SERVER_NAME, SERVER_VERSION } from "./config.js";
import { anclasNoVigentes, diagnosticar, formatearDiagnostico, formatearProcedencia, procedenciaDeFase } from "./diagnostico.js";
import type { Diagnostico } from "./diagnostico.js";
import { ejecutarEject } from "./eject.js";
import { CLAVE_VALIDA, CLIENTES } from "./init.js";
import { mensaje } from "./i18n/mensajes.js";
import type { Cliente, OpcionesInit } from "./init.js";
import type { Idioma } from "./vocabulario.js";

// The help and the terminal notice, in the language of the messages (PHASE_GATE_LANG, otherwise the system's).
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

// "servidor": whoever calls starts the MCP server. "salir": the exit code of the command.
// "init": the options already validated; init is asynchronous (it asks, it runs `claude`) and index.ts launches it.
// "doctor-reverificar": doctor with the anchors checked against git, which is asynchronous; index.ts also
// launches it, with doctorReverificando.
export type ResultadoCli =
  | { accion: "servidor" }
  | { accion: "salir"; codigo: number }
  | { accion: "init"; opciones: OpcionesInit }
  | { accion: "doctor-reverificar"; json: boolean }
  | { accion: "ui"; opciones: OpcionesUi };

// The options of `ui`, already validated. The Studio lives in src/studio/ and is loaded only for `ui`, with
// a dynamic import: the MCP server over stdio loads nothing of it (test/aislamiento.test.ts).
// With `exportar`, `ui` does not start the Studio: it writes the static site.
// `idioma`: that of the demo of `ui --demo`; without it, that of PHASE_GATE_LANG or the system's.
export type OpcionesUi = { puerto: number | null; abrir: boolean; demo: boolean; idioma?: Idioma; exportar?: { destino: string; datosReales: boolean; yes: boolean } };

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

// The diagnosis printed, and the exit code: 1 if there is any error.
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

// Which flags each subcommand accepts: an init flag passed to doctor is an error, it is not ignored.
const BANDERAS_DE: Record<string, string[]> = {
  doctor: ["json", "fase", "proyecto", "reverificar"],
  init: ["cliente", "clave", "docs", "repos", "comandos", "migrate", "preset", "idioma", "solo-este-equipo", "dry-run", "yes"],
  eject: ["a", "dry-run", "fuerza"],
  ui: ["puerto", "no-abrir", "demo", "idioma", "export-static", "incluir-datos-reales", "yes"],
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
    // stderr, not stdout: stdout is the JSON-RPC channel even if nobody is listening.
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

  // doctor --reverificar needs git, which is asynchronous: index.ts runs it (doctorReverificando).
  if (posicionales.length === 1 && subcomando === "doctor" && valores.reverificar) {
    if (valores.fase !== undefined || valores.proyecto !== undefined) return invalido(salida, mensaje("CLI-REVERIFICAR-CON-FASE"));
    return { accion: "doctor-reverificar", json: Boolean(valores.json) };
  }

  // doctor --fase N [--proyecto P]: the origin of each slot of that phase.
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
      // The export always writes both languages: --idioma makes no sense here.
      if (valores.idioma !== undefined) return invalido(salida, mensaje("CLI-IDIOMA-SOLO-CON-DEMO"));
      return { accion: "ui", opciones: { puerto: null, abrir: false, demo: false, exportar: { destino: exportar, datosReales: valores["incluir-datos-reales"] === true, yes: valores.yes === true } } };
    }
    if (valores["incluir-datos-reales"] || valores.yes) return invalido(salida, mensaje("CLI-SOLO-CON-EXPORT"));
    if (valores.idioma !== undefined && !valores.demo) return invalido(salida, mensaje("CLI-IDIOMA-SOLO-CON-DEMO"));
    if (valores.idioma !== undefined && valores.idioma !== "es" && valores.idioma !== "en") return invalido(salida, mensaje("CLI-IDIOMA-INVALIDO", { idioma: valores.idioma }));
    let puerto: number | null = null;
    if (valores.puerto !== undefined) {
      puerto = Number(valores.puerto);
      if (!/^\d+$/.test(valores.puerto) || puerto < 1 || puerto > 65535) return invalido(salida, mensaje("CLI-PUERTO-INVALIDO", { puerto: valores.puerto }));
    }
    const idioma = valores.idioma as Idioma | undefined;
    return { accion: "ui", opciones: { puerto, abrir: !valores["no-abrir"], demo: valores.demo === true, ...(idioma ? { idioma } : {}) } };
  }

  return invalido(salida);
}
