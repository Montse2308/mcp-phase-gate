// GET /api/ajustes (Etapa «Ajustes»): lo que la vista necesita para enseñar, de cada ruta de este equipo y del
// idioma, lo que dice machine.json, lo que vale de verdad y de dónde sale; y quién lo está pisando. No escribe
// nada. Lo que no cubre, porque no lo puede ver desde aquí, queda escrito en docs/decisiones.md: los
// .cursor/mcp.json y .vscode/mcp.json de cada proyecto, los perfiles de VS Code, otros clientes y los servidores
// con otro PHASE_GATE_STATE_PATH, cuyas sesiones el Studio no ve.

import * as path from "path";

import { VARIABLES, idiomaDeMaquina, idiomaDelEntorno, idiomaDelSistema, leerVariable, maquinaVigente, valorDeMaquina } from "../config.js";
import type { NombreLogico } from "../config.js";
import { mensaje } from "../i18n/mensajes.js";
import { CLIENTES, carpetaDelCliente, ejecutaPhaseGate, leerJsonTolerante, rutasDelEnvDeEntrada } from "../init.js";
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

// Dos valores son el mismo: las rutas se comparan resueltas, y lo demás recortado.
const comparable = (campo: NombreDeCampo, valor: string): string => (campo === "documentacion" || campo === "carpetaDeRepos" ? (valor.trim() ? path.resolve(valor.trim()) : "") : valor.trim());
const igual = (campo: NombreDeCampo, a: string, b: string): boolean => comparable(campo, a) === comparable(campo, b);

function conTilde(ruta: string, home: string): string {
  const relativa = path.relative(home, ruta);
  return relativa && !relativa.startsWith("..") && !path.isAbsolute(relativa) ? `~/${relativa.split(path.sep).join("/")}` : sinRutasDelEquipo(ruta);
}

// ─── Lo que vale en este Studio ─────────────────────────────────────────────
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
      // Este mismo Studio, por su entorno o su .env, usa otro valor que machine.json.
      propioStudioPisa: delEntorno && enMaquina !== null && lectura.valor !== undefined && !igual(campo, lectura.valor, enMaquina),
      // Y un valor del entorno que machine.json no tiene: se puede guardar ahí.
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

// ─── Lo que dicen los clientes en su env ────────────────────────────────────
function variablesDeEnv(env: Record<string, unknown>, enMaquina: Map<NombreDeCampo, string | null>): EnvDeCliente[] {
  const dicho: QuitaDelEntorno = rutasDelEnvDeEntrada(env);
  const subcarpeta = typeof env.PHASE_GATE_TASKS_SUBDIR === "string" ? env.PHASE_GATE_TASKS_SUBDIR : typeof env.ORQUESTADOR_TASKS_SUBDIR === "string" ? env.ORQUESTADOR_TASKS_SUBDIR : undefined;
  const lista: [NombreDeCampo, string, string | undefined][] = [
    ["documentacion", "PHASE_GATE_DOCS_PATH", dicho.documentacion],
    ["carpetaDeRepos", "PHASE_GATE_REPOS_PATH", dicho.carpetaDeRepos],
    ["subcarpetaTareas", "PHASE_GATE_TASKS_SUBDIR", subcarpeta],
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

// Las entradas de este servidor en el JSON de un cliente: la sección dada de su archivo.
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

// Claude Code guarda sus servidores en ~/.claude.json: los de usuario y, por cada carpeta, los locales. Los de
// proyecto (.mcp.json) viven en cada proyecto y no se leen.
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

// Un servidor abierto, sea de quien sea: lo que recibió de su entorno al arrancar, que no cambia mientras vive.
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

// ─── Las variables avanzadas ────────────────────────────────────────────────
// Se muestran con su valor, su origen y cómo cambiarlas; no se editan desde Ajustes.
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
      // El proceso conserva el último archivo válido si este se rompió: lo que sigue valiendo no es lo que hay en disco.
      deMemoria: maquina.deMemoria,
      version,
    },
    campos,
    clientes: CLIENTES.map((cliente) => (cliente === "claude-code" ? clienteDeClaude(entorno, enMaquina) : clienteDeArchivo(cliente, entorno, enMaquina))),
    sesiones: ctx.sesiones().map((s) => sesionDeAjustes(s, enMaquina)),
    avanzadas: avanzadas(),
  };
}
