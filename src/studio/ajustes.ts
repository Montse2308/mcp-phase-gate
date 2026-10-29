// GET /api/ajustes: what the view needs to show, for each path of this machine and for the language, what
// machine.json says, what really applies and where it comes from; and who is overriding it. It writes nothing.
// What it does not cover, because it cannot see it from here, is written in docs/decisiones.md: the
// .cursor/mcp.json and .vscode/mcp.json of each project, the VS Code profiles, other clients and the servers
// with another PHASE_GATE_STATE_PATH, whose sessions the Studio does not see.

import * as path from "path";

import { VARIABLES, idiomaDeMaquina, idiomaDelEntorno, idiomaDelSistema, leerVariable, maquinaVigente, valorDeMaquina } from "../config.js";
import type { NombreLogico } from "../config.js";
import { mensaje } from "../i18n/mensajes.js";
import { CLIENTES, carpetaDelCliente, ejecutaPhaseGate, leerJsonTolerante, rutasDelEnvDeEntrada, variableDeRutaEnEntrada } from "../init.js";
import type { Cliente, EntornoInit, QuitaDelEntorno } from "../init.js";
import type { SesionAbierta } from "../sesiones.js";
import type { AjustesRespuesta, AvanzadaApi, CampoAjustes, ClienteAjustes, EntradaDeCliente, EnvDeCliente, NombreDeCampo, SesionDeAjustes } from "./contrato.js";
import { sinRutasDelEquipo } from "./privacidad.js";

const CAMPOS: { campo: Exclude<NombreDeCampo, "idioma">; logica: NombreLogico }[] = [
  { campo: "documentacion", logica: "DOCS_PATH" },
  { campo: "carpetaDeRepos", logica: "REPOS_PATH" },
  { campo: "subcarpetaTareas", logica: "TASKS_SUBDIR" },
];
const NOMBRES: Record<Cliente, string> = { "claude-code": "Claude Code", cursor: "Cursor", vscode: "VS Code" };

// Two values are the same: paths are compared resolved, and anything else trimmed.
const comparable = (campo: NombreDeCampo, valor: string): string => (campo === "documentacion" || campo === "carpetaDeRepos" ? (valor.trim() ? path.resolve(valor.trim()) : "") : valor.trim());
const igual = (campo: NombreDeCampo, a: string, b: string): boolean => comparable(campo, a) === comparable(campo, b);

function conTilde(ruta: string, home: string): string {
  const relativa = path.relative(home, ruta);
  return relativa && !relativa.startsWith("..") && !path.isAbsolute(relativa) ? `~/${relativa.split(path.sep).join("/")}` : sinRutasDelEquipo(ruta);
}

// ─── What applies in this Studio ────────────────────────────────────────────
function camposDeEsteEquipo(): CampoAjustes[] {
  const campos: CampoAjustes[] = CAMPOS.map(({ campo, logica }) => {
    const lectura = leerVariable(logica);
    const enMaquina = valorDeMaquina(logica) ?? null;
    const delEntorno = lectura.fuente === "entorno" || lectura.fuente === ".env";
    return {
      campo,
      variable: VARIABLES[logica].principal,
      enMaquina,
      efectivo: lectura.valor ?? null,
      fuente: lectura.fuente,
      // This same Studio, through its environment or its .env, uses another value than machine.json.
      propioStudioPisa: delEntorno && enMaquina !== null && lectura.valor !== undefined && !igual(campo, lectura.valor, enMaquina),
      // And a value from the environment that machine.json does not have: it can be saved there.
      sinGuardar: delEntorno && enMaquina === null && lectura.valor !== undefined,
    };
  });
  const delEntorno = idiomaDelEntorno();
  const enMaquina = idiomaDeMaquina();
  campos.push({
    campo: "idioma",
    variable: VARIABLES.LANG.principal,
    enMaquina,
    efectivo: delEntorno ?? enMaquina ?? idiomaDelSistema(),
    fuente: delEntorno ? (leerVariable("LANG").fuente === ".env" ? ".env" : "entorno") : enMaquina ? "machine.json" : "sistema",
    propioStudioPisa: delEntorno !== null && enMaquina !== null && delEntorno !== enMaquina,
    sinGuardar: delEntorno !== null && enMaquina === null,
  });
  return campos;
}

// ─── What the clients say in their env ──────────────────────────────────────
function variablesDeEnv(env: Record<string, unknown>, enMaquina: Map<NombreDeCampo, string | null>): EnvDeCliente[] {
  const dicho: QuitaDelEntorno = rutasDelEnvDeEntrada(env);
  const variableDeSubcarpeta = typeof env.PHASE_GATE_TASKS_SUBDIR === "string" ? "PHASE_GATE_TASKS_SUBDIR" : typeof env.ORQUESTADOR_TASKS_SUBDIR === "string" ? "ORQUESTADOR_TASKS_SUBDIR" : null;
  const subcarpeta = variableDeSubcarpeta ? (env[variableDeSubcarpeta] as string) : undefined;
  // The name the entry really uses, alias included: it is the one the person has to remove.
  const lista: [NombreDeCampo, string, string | undefined][] = [
    ["documentacion", variableDeRutaEnEntrada(env, "documentacion") ?? "PHASE_GATE_DOCS_PATH", dicho.documentacion],
    ["carpetaDeRepos", variableDeRutaEnEntrada(env, "carpetaDeRepos") ?? "PHASE_GATE_REPOS_PATH", dicho.carpetaDeRepos],
    ["subcarpetaTareas", variableDeSubcarpeta ?? "PHASE_GATE_TASKS_SUBDIR", subcarpeta],
    ["idioma", "PHASE_GATE_LANG", dicho.idioma],
  ];
  const resultado: EnvDeCliente[] = [];
  for (const [campo, variable, valor] of lista) {
    if (valor === undefined) continue;
    const guardado = enMaquina.get(campo) ?? null;
    resultado.push({ campo, variable, valor, estado: guardado === null ? "sin-valor-en-maquina" : igual(campo, valor, guardado) ? "coincide" : "pisa" });
  }
  return resultado;
}

// The entries of this server in a client's JSON: the given section of its file.
function entradasDeSeccion(seccion: unknown, ambito: EntradaDeCliente["ambito"], carpeta: string | null, enMaquina: Map<NombreDeCampo, string | null>): EntradaDeCliente[] {
  if (seccion === null || typeof seccion !== "object" || Array.isArray(seccion)) return [];
  const entradas: EntradaDeCliente[] = [];
  for (const [clave, entrada] of Object.entries(seccion as Record<string, unknown>)) {
    if (!ejecutaPhaseGate(entrada)) continue;
    const env = (entrada as { env?: unknown }).env;
    const variables = env !== null && typeof env === "object" && !Array.isArray(env) ? variablesDeEnv(env as Record<string, unknown>, enMaquina) : [];
    entradas.push({ clave, ambito, carpeta, variables });
  }
  return entradas;
}

function clienteDeArchivo(cliente: "cursor" | "vscode", entorno: EntornoInit, enMaquina: Map<NombreDeCampo, string | null>): ClienteAjustes {
  const archivo = path.join(carpetaDelCliente(cliente, entorno), "mcp.json");
  const lectura = leerJsonTolerante(archivo);
  const base = { cliente, nombre: NOMBRES[cliente], archivo: conTilde(archivo, entorno.home) };
  if (lectura.estado === "ausente" || lectura.estado === "vacio") return { ...base, lectura: "no-existe", entradas: [] };
  if (lectura.estado === "roto") return { ...base, lectura: "ilegible", entradas: [] };
  return { ...base, lectura: "leido", entradas: entradasDeSeccion(lectura.datos[cliente === "cursor" ? "mcpServers" : "servers"], "archivo", null, enMaquina) };
}

// Claude Code keeps its servers in ~/.claude.json: the user ones and, per folder, the local ones. The project
// ones (.mcp.json) live in each project and are not read.
function clienteDeClaude(entorno: EntornoInit, enMaquina: Map<NombreDeCampo, string | null>): ClienteAjustes {
  const archivo = path.join(entorno.home, ".claude.json");
  const lectura = leerJsonTolerante(archivo);
  const base = { cliente: "claude-code" as const, nombre: NOMBRES["claude-code"], archivo: conTilde(archivo, entorno.home) };
  if (lectura.estado === "ausente" || lectura.estado === "vacio") return { ...base, lectura: "no-existe", entradas: [] };
  if (lectura.estado === "roto") return { ...base, lectura: "ilegible", entradas: [] };
  const entradas = entradasDeSeccion(lectura.datos.mcpServers, "usuario", null, enMaquina);
  const proyectos = lectura.datos.projects;
  if (proyectos !== null && typeof proyectos === "object" && !Array.isArray(proyectos)) {
    for (const [carpeta, datos] of Object.entries(proyectos as Record<string, unknown>)) {
      const locales = datos !== null && typeof datos === "object" ? (datos as { mcpServers?: unknown }).mcpServers : undefined;
      entradas.push(...entradasDeSeccion(locales, "local", carpeta, enMaquina));
    }
  }
  return { ...base, lectura: "leido", entradas };
}

// An open server, whoever's it is: what it received from its environment at start, which does not change while it lives.
function sesionDeAjustes(sesion: SesionAbierta, enMaquina: Map<NombreDeCampo, string | null>): SesionDeAjustes {
  const rutas = sesion.rutas ?? {};
  const variables: EnvDeCliente[] = [];
  for (const [campo, variable] of [["documentacion", "PHASE_GATE_DOCS_PATH"], ["carpetaDeRepos", "PHASE_GATE_REPOS_PATH"], ["subcarpetaTareas", "PHASE_GATE_TASKS_SUBDIR"]] as const) {
    const valor = rutas[campo];
    if (valor === undefined) continue;
    const guardado = enMaquina.get(campo) ?? null;
    variables.push({ campo, variable, valor, estado: guardado === null ? "sin-valor-en-maquina" : igual(campo, valor, guardado) ? "coincide" : "pisa" });
  }
  return { pid: sesion.pid, cliente: sesion.cliente, proyecto: sesion.proyecto, sinRutas: sesion.rutas === undefined, variables };
}

// ─── The advanced variables ─────────────────────────────────────────────────
// They are shown with their value, their origin and how to change them; they are not edited from Ajustes.
const AVANZADAS: NombreLogico[] = ["PROMPTS_PATH", "STATE_PATH", "CONFIG_PATH", "ELICITATION", "LANG"];

function avanzadas(): AvanzadaApi[] {
  return AVANZADAS.map((logica) => {
    const lectura = leerVariable(logica);
    return {
      logica,
      variable: VARIABLES[logica].principal,
      descripcion: mensaje(`AJUSTES-AVANZADA-${logica.replace(/_/g, "-")}`),
      valor: lectura.valor ?? null,
      usada: lectura.usada,
      fuente: lectura.fuente,
      comoCambiarla: mensaje("AJUSTES-AVANZADA-COMO-CAMBIARLA", { variable: VARIABLES[logica].principal }),
    };
  });
}

export function ajustesDeEsteEquipo(ctx: { entornoInit: () => EntornoInit; sesiones: () => SesionAbierta[] }): AjustesRespuesta {
  const entorno = ctx.entornoInit();
  const maquina = maquinaVigente();
  const campos = camposDeEsteEquipo();
  const enMaquina = new Map<NombreDeCampo, string | null>(campos.map((c) => [c.campo, c.enMaquina]));
  const version = maquina.config?.version ?? null;

  return {
    maquina: {
      estado: maquina.estado,
      error: maquina.error === null ? null : sinRutasDelEquipo(maquina.error),
      // The process keeps the last valid file if this one broke: what still applies is not what is on disk.
      deMemoria: maquina.deMemoria,
      version,
    },
    campos,
    clientes: CLIENTES.map((cliente) => (cliente === "claude-code" ? clienteDeClaude(entorno, enMaquina) : clienteDeArchivo(cliente, entorno, enMaquina))),
    sesiones: ctx.sesiones().map((s) => sesionDeAjustes(s, enMaquina)),
    avanzadas: avanzadas(),
  };
}
