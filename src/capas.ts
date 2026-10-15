// Las capas de prompts y el ensamblado de un prompt de fase a partir de ellas.
//
// De menor a mayor prioridad:
//   1    fábrica   <paquete>/prompts/<idioma>/            fase-N-*.md, global-rules.md, comandos/
//   2    preset    un archivo de bloques                   solo bloques
//   2.5  reglas    variantes de regla del paquete          solo bloques
//   3    global    PHASE_GATE_PROMPTS_PATH, o si no, <configDir>/prompts/ cuando existe
//                  (lo mismo que la fábrica, más un bloques.md)
//   4    proyecto  <DOCS>/<PROYECTO>/.phase-gate/prompts/  lo mismo que la 3
//
// El CUERPO de una fase sale de la capa más alta (entre 1, 3 y 4) que tenga su fase-N-*.md, y su
// cabecera da el nombre del documento: un bloque nunca lo cambia. Después cada ranura recibe los
// bloques de las capas en orden ascendente, así que el de más arriba manda, aunque esté por debajo
// de la capa del cuerpo.

import * as fs from "fs";
import * as path from "path";

import { aplicarBloques, leerBloques, omitirRanuraVacia } from "./bloques.js";
import type { Bloque, Procedencia } from "./bloques.js";
import { DOCS, IDIOMA_POR_DEFECTO, carpetaPromptsGlobal, defaultPromptsPath, requireBasePath } from "./config.js";
import type { Hallazgo } from "./diagnostico.js";
import { PRESET_POR_DEFECTO, describirPresets, manifiestoDe, maquinaDe, presetsDisponibles, resolverRepos } from "./manifiesto.js";
import type { Manifiesto, PoliticaCommit, Preset, RepoResuelto } from "./manifiesto.js";
import { leerTextoAcotado } from "./paths.js";
import {
  CONTEXTO_INICIAL_POR_DEFECTO,
  GLOBAL_RULES_FILE,
  describePhaseFiles,
  discoverPhases,
  entregable,
  leerPromptNormalizado,
  parsePhaseFile,
  resolveGlobalRules,
  separarFrontmatter,
} from "./phases.js";
import type { PhaseFile } from "./phases.js";

export type EtiquetaCapa = "fábrica" | "preset" | "reglas" | "global" | "proyecto";
export type Capa = { orden: 1 | 2 | 2.5 | 3 | 4; etiqueta: EtiquetaCapa; ruta: string };
export type { Procedencia } from "./bloques.js";

// El archivo de bloques de una capa global o de proyecto.
export const ARCHIVO_BLOQUES = "bloques.md";

// Las secciones de las reglas globales que son esqueleto: no son ranuras, ningún bloque las toca y,
// si un global-rules.md propio no las tiene, se reinyectan las de fábrica.
export const SECCIONES_ESQUELETO = ["BASE DE CADA DECISIÓN", "PENDIENTES HEREDADOS"];

export function carpetaPromptsDeProyecto(carpetaProyecto: string): string {
  return path.join(requireBasePath(DOCS), carpetaProyecto, ".phase-gate", "prompts");
}

// ─── Configuración efectiva de un proyecto ──────────────────────────────────
// De qué preset y con qué reglas se ensambla un prompt. El preset sigue esta precedencia:
//   frontmatter de la tarea > phase-gate.json del proyecto > presetPorDefecto de machine.json > software
// y las reglas (lotes, commits): reglas del manifiesto > frontmatter del preset > valor de fábrica.
// Un preset o un manifiesto que no existe o está mal escrito es un error explícito (decisión F2).
export type OrigenDelPreset = "de la tarea" | "del proyecto" | "de machine.json" | "por defecto";
export type OrigenDeRegla = "del proyecto" | "del preset" | "de fábrica";
export type ReglasEfectivas = {
  lotes: boolean;
  commits: PoliticaCommit;
  origen: { lotes: OrigenDeRegla; commits: OrigenDeRegla };
};
export type FrontmatterDeTarea = { repos: string[] | null; preset: string | null };

export type ConfiguracionProyecto = {
  carpetaProyecto: string | null;
  manifiesto: Manifiesto | null;
  idioma: string;
  preset: Preset;
  origenPreset: OrigenDelPreset;
  reglas: ReglasEfectivas;
  tarea: FrontmatterDeTarea | null;
};

export const LOTES_DE_FABRICA = true;
export const COMMITS_DE_FABRICA: PoliticaCommit = "agente-commitea-con-OK";

// Las capas que aportan cuerpos (1, 3 y 4), sin resolver preset ni reglas: lo que hace falta para
// saber qué fases hay y cómo se llaman sus documentos. Solo lee el manifiesto por el idioma.
export function capasDeCuerpos(carpetaProyecto: string | null): Capa[] {
  const idioma = (carpetaProyecto ? manifiestoDe(carpetaProyecto)?.idioma : null) ?? IDIOMA_POR_DEFECTO;
  const capas: Capa[] = [{ orden: 1, etiqueta: "fábrica", ruta: defaultPromptsPath(idioma) }];
  const global = carpetaPromptsGlobal();
  if (global) capas.push({ orden: 3, etiqueta: "global", ruta: global });
  if (carpetaProyecto) capas.push({ orden: 4, etiqueta: "proyecto", ruta: carpetaPromptsDeProyecto(carpetaProyecto) });
  return capas;
}

// Las fases de un proyecto: un proyecto puede sustituir una fase entera, con otro documento, y sus
// tareas se deducen con ese nombre. Sin proyecto, las de fábrica y la capa global.
export function fasesDe(carpetaProyecto: string | null): Map<number, PhaseFile> {
  return discoverPhases(rutasDeCuerpos(capasDeCuerpos(carpetaProyecto)));
}

export function contextoInicialDe(carpetaProyecto: string | null): string {
  return fasesDe(carpetaProyecto).get(1)?.documentoInicial || CONTEXTO_INICIAL_POR_DEFECTO;
}

// El frontmatter que start_task escribe en el contexto inicial cuando la tarea declara sus repos o
// su preset. Se acepta `repos: api, web` y también `repos: [api, web]`.
export function frontmatterDeTarea(carpetaTarea: string, contextoInicial: string): FrontmatterDeTarea {
  let meta: Record<string, string> = {};
  try {
    meta = separarFrontmatter(leerTextoAcotado(path.join(carpetaTarea, contextoInicial))).meta;
  } catch {
    // Sin contexto inicial legible, la tarea no declara nada: usa lo del proyecto.
  }
  const repos =
    meta.repos === undefined
      ? null
      : meta.repos
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((id) => id.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
  return { repos, preset: meta.preset?.trim() || null };
}

export function configuracionDe(carpetaProyecto: string | null, carpetaTarea?: string | null): ConfiguracionProyecto {
  const manifiesto = carpetaProyecto ? manifiestoDe(carpetaProyecto) : null;
  const idioma = manifiesto?.idioma ?? IDIOMA_POR_DEFECTO;
  const tarea = carpetaProyecto && carpetaTarea ? frontmatterDeTarea(carpetaTarea, contextoInicialDe(carpetaProyecto)) : null;

  let nombre: string;
  let origenPreset: OrigenDelPreset;
  if (tarea?.preset) {
    nombre = tarea.preset;
    origenPreset = "de la tarea";
  } else if (manifiesto) {
    nombre = manifiesto.preset;
    origenPreset = "del proyecto";
  } else {
    const porDefecto = maquinaDe().config?.presetPorDefecto;
    nombre = porDefecto ?? PRESET_POR_DEFECTO;
    origenPreset = porDefecto ? "de machine.json" : "por defecto";
  }

  const presets = presetsDisponibles(idioma);
  const preset = presets.get(nombre);
  if (!preset) {
    throw new Error(`No existe el preset "${nombre}" (${origenPreset}). Los disponibles son: ${describirPresets(presets)}.`);
  }

  const regla = <T>(delProyecto: T | undefined, delPreset: T | null, deFabrica: T): [T, OrigenDeRegla] =>
    delProyecto !== undefined ? [delProyecto, "del proyecto"] : delPreset !== null ? [delPreset, "del preset"] : [deFabrica, "de fábrica"];
  const [lotes, origenLotes] = regla(manifiesto?.reglas.lotes, preset.lotes, LOTES_DE_FABRICA);
  const [commits, origenCommits] = regla(manifiesto?.reglas.commits, preset.commits, COMMITS_DE_FABRICA);

  return {
    carpetaProyecto,
    manifiesto,
    idioma,
    preset,
    origenPreset,
    reglas: { lotes, commits, origen: { lotes: origenLotes, commits: origenCommits } },
    tarea,
  };
}

// Los archivos de bloques del paquete que activan las reglas: el contenido de fábrica es
// "con lotes" y "agente-commitea-con-OK", así que esas dos no tienen archivo.
export function variantesDeRegla(reglas: ReglasEfectivas, idioma: string = IDIOMA_POR_DEFECTO): string[] {
  const carpeta = path.join(defaultPromptsPath(idioma), "reglas");
  const variantes: string[] = [];
  if (reglas.commits !== COMMITS_DE_FABRICA) variantes.push(path.join(carpeta, `commits-${reglas.commits}.md`));
  if (!reglas.lotes) variantes.push(path.join(carpeta, "sin-lotes.md"));
  return variantes;
}

function capasConConfiguracion(config: ConfiguracionProyecto): Capa[] {
  const [fabrica, ...resto] = capasDeCuerpos(config.carpetaProyecto);
  const capas: Capa[] = [fabrica!];
  if (config.preset.ruta) capas.push({ orden: 2, etiqueta: "preset", ruta: config.preset.ruta });
  for (const ruta of variantesDeRegla(config.reglas, config.idioma)) capas.push({ orden: 2.5, etiqueta: "reglas", ruta });
  return [...capas, ...resto];
}

// Todas las capas de un proyecto (o sin proyecto, con null: la fábrica, el preset de machine.json o
// `software`, sus reglas y la capa global). Con la carpeta de la tarea, su frontmatter puede
// cambiar el preset.
export function capasDe(carpetaProyecto: string | null, carpetaTarea?: string | null): Capa[] {
  return capasConConfiguracion(configuracionDe(carpetaProyecto, carpetaTarea));
}

// ─── El bloque CONFIGURACIÓN DEL PROYECTO ───────────────────────────────────
// Dato, no prosa: lo que declara el manifiesto, machine.json y la tarea, al final de cada prompt de
// fase cuando se sabe el proyecto. El estado de git de cada repo lo añade quien lo sepa (`estado`).
export function reposDeLaTarea(config: ConfiguracionProyecto): RepoResuelto[] {
  if (!config.carpetaProyecto || !config.manifiesto) return [];
  const declarados = config.manifiesto.repos;
  const elegidos = config.tarea?.repos ? declarados.filter((repo) => config.tarea!.repos!.includes(repo.id)) : declarados;
  return resolverRepos(config.carpetaProyecto, elegidos);
}

export function bloqueDeConfiguracion(
  config: ConfiguracionProyecto,
  repos: RepoResuelto[] = reposDeLaTarea(config),
  estado: (repo: RepoResuelto) => string | null = () => null
): string {
  const m = config.manifiesto;
  const origen = config.origenPreset === "por defecto" ? "por defecto; este proyecto no tiene phase-gate.json" : config.origenPreset;
  const lineas = [
    m ? "## CONFIGURACIÓN DEL PROYECTO (la declara phase-gate.json)" : "## CONFIGURACIÓN DEL PROYECTO",
    "",
    `- Preset: \`${config.preset.nombre}\` (${origen}) · Idioma: ${config.idioma}`,
    `- Lotes: ${config.reglas.lotes ? "sí" : "no"} · Commits: ${config.reglas.commits}`,
  ];

  if (repos.length) {
    lineas.push("- Repositorios de esta tarea:");
    for (const repo of repos) {
      const rol = repo.rol ? ` (${repo.rol})` : "";
      const donde = repo.ruta ? `\`${repo.ruta}\`` : `sin ruta (${repo.error ?? "no se pudo resolver"})`;
      const extra = repo.ruta && !repo.existe ? " · no existe en este equipo" : (estado(repo) ?? "");
      lineas.push(`  - \`${repo.id}\`${rol}: ${donde}${extra}`);
    }
  }
  if (m?.reglas.verificacion?.length) {
    lineas.push(`- Comandos de verificación del proyecto: ${m.reglas.verificacion.map((c) => `\`${c}\``).join(", ")}`);
  }
  if (m?.fase5.prPorRepo) lineas.push("- Una descripción de PR por repositorio (fase5.prPorRepo).");
  if (repos.length) lineas.push("", "Usa `read_repo_file` y `repo_status` con estos ids.");

  return lineas.join("\n");
}

// Las capas que pueden aportar cuerpos (fases, reglas globales, comandos), de menor a mayor.
export function rutasDeCuerpos(capas: Capa[]): string[] {
  return capas.filter((capa) => capa.orden === 1 || capa.orden === 3 || capa.orden === 4).map((capa) => capa.ruta);
}

// Para quien todavía pasa una lista de carpetas (loadPhasePrompt con capas explícitas, los tests):
// la primera es la de fábrica y las demás, globales.
export function capasDesdeRutas(rutas: string[]): Capa[] {
  return rutas.map((ruta, i): Capa => (i === 0 ? { orden: 1, etiqueta: "fábrica", ruta } : { orden: 3, etiqueta: "global", ruta }));
}

function capaDelArchivo(archivo: string, capas: Capa[]): Capa | null {
  const carpeta = path.resolve(path.dirname(archivo));
  return [...capas].reverse().find((capa) => path.resolve(capa.ruta) === carpeta) ?? null;
}

// Todos los bloques que aportan las capas, en el orden en que se aplican: por capa ascendente y,
// dentro de una capa, en el orden del archivo.
export function bloquesDe(capas: Capa[]): { bloques: Bloque[]; avisos: Hallazgo[] } {
  const bloques: Bloque[] = [];
  const avisos: Hallazgo[] = [];
  for (const capa of [...capas].sort((a, b) => a.orden - b.orden)) {
    if (capa.orden === 1) continue; // la fábrica no trae bloques: sus ranuras ya son el contenido por defecto
    const archivo = capa.orden === 2 || capa.orden === 2.5 ? capa.ruta : path.join(capa.ruta, ARCHIVO_BLOQUES);
    const leidos = leerBloques(archivo, capa);
    bloques.push(...leidos.bloques);
    avisos.push(...leidos.avisos);
  }
  return { bloques, avisos };
}

function avisoDeHuerfano(bloque: Bloque): Hallazgo {
  return {
    severidad: "aviso",
    codigo: "BLOQUE-HUERFANO",
    texto: `El bloque «${bloque.id}» de ${bloque.origen.archivo}:${bloque.origen.linea} no encaja en ninguna ranura y se ignoró.`,
  };
}

// La línea que get_phase_prompt antepone por cada bloque huérfano de la fase que entrega.
export function notaDeHuerfano(aviso: Hallazgo): string {
  return `> Nota del servidor: ${aviso.texto.replace(/^El bloque/, "el bloque")}`;
}

// Cómo se dice de dónde sale el contenido por defecto de una ranura: "fábrica", o el archivo y la
// línea del marcador si el cuerpo es de una capa propia.
function origenPorDefecto(archivo: string, capa: Capa | null, desplazamiento: number): (linea: number) => string {
  return (linea) => (capa?.etiqueta === "fábrica" ? "fábrica" : `${archivo}:${linea + desplazamiento}`);
}

// Las líneas de cabecera que separarFrontmatter quitó: para que el archivo:línea de una ranura
// apunte a la línea real del archivo.
function lineasDeCabecera(archivo: string): number {
  try {
    const completo = leerPromptNormalizado(archivo);
    return completo.split("\n").length - parsePhaseFile(archivo).cuerpo.split("\n").length;
  } catch {
    return 0;
  }
}

// Una sección "## X" de un texto: desde su encabezado hasta el siguiente "## " o el final.
function seccion(texto: string, titulo: string): string | null {
  const lineas = texto.split("\n");
  const inicio = lineas.findIndex((linea) => linea.trimEnd().normalize("NFC") === `## ${titulo}`);
  if (inicio === -1) return null;
  const resto = lineas.slice(inicio + 1);
  const fin = resto.findIndex((linea) => linea.startsWith("## "));
  return [lineas[inicio]!, ...(fin === -1 ? resto : resto.slice(0, fin))].join("\n").trimEnd();
}

export function tieneSeccion(texto: string, titulo: string): boolean {
  return texto.split("\n").some((linea) => linea.trimEnd().normalize("NFC") === `## ${titulo}`);
}

export type ReglasGlobalesEnsambladas = {
  texto: string | null; // null si ninguna capa tiene global-rules.md
  archivo: string | null;
  procedencia: Procedencia[];
  huerfanos: Bloque[];
  reinyectadas: string[]; // secciones esqueleto que se añadieron desde la de fábrica
};

// Las reglas globales con sus bloques aplicados, sin la ranura `extra` si quedó vacía, y con las
// secciones esqueleto de fábrica añadidas al final si el archivo que gana no las tiene.
export function ensamblarReglasGlobales(capas: Capa[], bloques: Bloque[]): ReglasGlobalesEnsambladas {
  const archivo = resolveGlobalRules(rutasDeCuerpos(capas));
  if (!archivo) return { texto: null, archivo: null, procedencia: [], huerfanos: [], reinyectadas: [] };

  const capa = capaDelArchivo(archivo, capas);
  const aplicado = aplicarBloques(leerPromptNormalizado(archivo), "global", bloques, origenPorDefecto(archivo, capa, 0));
  let texto = entregable(omitirRanuraVacia(aplicado.texto, "extra"), archivo);

  const reinyectadas: string[] = [];
  const fabrica = capas.find((c) => c.orden === 1);
  const deFabrica = fabrica ? path.join(fabrica.ruta, GLOBAL_RULES_FILE) : null;
  if (capa?.orden !== 1 && deFabrica && fs.existsSync(deFabrica)) {
    const original = leerPromptNormalizado(deFabrica);
    for (const titulo of SECCIONES_ESQUELETO) {
      const deEllas = seccion(original, titulo);
      if (deEllas && !tieneSeccion(texto, titulo)) {
        texto = `${texto}\n\n${deEllas}`;
        reinyectadas.push(titulo);
      }
    }
  }

  return { texto, archivo, procedencia: aplicado.procedencia, huerfanos: aplicado.huerfanos, reinyectadas };
}

export type PromptEnsamblado = { texto: string; procedencia: Procedencia[]; avisos: Hallazgo[] };
export type OpcionesDeEnsamblado = { incluirConfigProyecto?: boolean };

// El ensamblado con una lista de capas concreta. Lanza si la fase no existe en ninguna.
export function ensamblarConCapas(fase: number, capas: Capa[], _opciones: OpcionesDeEnsamblado = {}): PromptEnsamblado {
  const rutas = rutasDeCuerpos(capas);
  const phases: Map<number, PhaseFile> = discoverPhases(rutas);
  const entrada = phases.get(fase);

  if (!entrada) {
    const lista = [...phases.keys()].sort((a, b) => a - b).join(", ");
    throw new Error(
      lista
        ? `Fase no válida. Las fases disponibles son: ${lista}.`
        : `No se encontró ningún prompt de fase en ${rutas.join(", ")}. Verifica que la carpeta 'prompts/es' exista junto al build.`
    );
  }

  const { bloques, avisos } = bloquesDe(capas);
  const partes: string[] = [];

  const globales = ensamblarReglasGlobales(capas, bloques);
  if (globales.texto) partes.push(globales.texto);

  const capaCuerpo = capaDelArchivo(entrada.file, capas);
  const cuerpo = aplicarBloques(
    parsePhaseFile(entrada.file).cuerpo,
    `fase-${fase}`,
    bloques,
    origenPorDefecto(entrada.file, capaCuerpo, lineasDeCabecera(entrada.file))
  );
  partes.push(entregable(cuerpo.texto, entrada.file));

  const archivos = describePhaseFiles(phases, fase);
  if (archivos) partes.push(archivos);

  // Huérfanos de lo que se entrega: los de las reglas globales y los de esta fase.
  for (const bloque of [...globales.huerfanos, ...cuerpo.huerfanos]) avisos.push(avisoDeHuerfano(bloque));

  if (globales.reinyectadas.length) {
    avisos.push({
      severidad: "aviso",
      codigo: "GLOBAL-REINYECTADO",
      texto: textoDeReinyeccion(globales.archivo!, globales.reinyectadas),
    });
  }

  return { texto: partes.join("\n\n"), procedencia: [...globales.procedencia, ...cuerpo.procedencia], avisos };
}

export function textoDeReinyeccion(archivo: string, reinyectadas: string[]): string {
  return (
    `Tu global-rules.md (${archivo}) sustituye al de fábrica y no tiene ` +
    `${reinyectadas.map((titulo) => `"## ${titulo}"`).join(" ni ")}: se añaden al final las de fábrica. ` +
    "La forma recomendada de cambiar las reglas globales es un bloques.md con `global/cero-rupturas`, " +
    "`global/evidencia` o `global/extra`."
  );
}

// El prompt de una fase tal como lo recibe el modelo en un proyecto (o sin proyecto, con null). Con
// proyecto, termina con el bloque CONFIGURACIÓN DEL PROYECTO, salvo con incluirConfigProyecto:
// false (la prueba de oro compara con la 2.2.0, que no lo tenía). `estadoDeRepo` lo pone quien
// pueda preguntarle a git.
export function ensamblarFase(
  fase: number,
  carpetaProyecto: string | null,
  carpetaTarea?: string | null,
  opciones: OpcionesDeEnsamblado & { estadoDeRepo?: (repo: RepoResuelto) => string | null } = {}
): PromptEnsamblado {
  const config = configuracionDe(carpetaProyecto, carpetaTarea);
  const ensamblado = ensamblarConCapas(fase, capasConConfiguracion(config), opciones);
  if (!carpetaProyecto || opciones.incluirConfigProyecto === false) return ensamblado;
  return { ...ensamblado, texto: `${ensamblado.texto}\n\n${bloqueDeConfiguracion(config, reposDeLaTarea(config), opciones.estadoDeRepo)}` };
}

// Los bloques que no encajan en ningún sitio, mirando todas las fases a la vez: lo que lista doctor.
// Un bloque huérfano para una fase puede no serlo para otra, así que se mira cada bloque contra el
// cuerpo de SU archivo; y uno de una fase que no existe es huérfano siempre.
export function revisarBloques(capas: Capa[]): Hallazgo[] {
  const { bloques, avisos } = bloquesDe(capas);
  const phases = discoverPhases(rutasDeCuerpos(capas));
  const huerfanos: Bloque[] = [];

  const globales = ensamblarReglasGlobales(capas, bloques);
  huerfanos.push(...(globales.archivo ? globales.huerfanos : bloques.filter((b) => b.archivo === "global")));

  for (const bloque of bloques) {
    if (bloque.archivo === "global") continue;
    const numero = Number(bloque.archivo.slice("fase-".length));
    if (!phases.has(numero)) huerfanos.push(bloque);
  }
  for (const [numero, datos] of phases) {
    try {
      huerfanos.push(...aplicarBloques(parsePhaseFile(datos.file).cuerpo, `fase-${numero}`, bloques, () => "").huerfanos);
    } catch {
      // Un cuerpo ilegible lo avisa quien lo entrega; aquí solo se buscan bloques sueltos.
    }
  }

  return [...avisos, ...huerfanos.map(avisoDeHuerfano)];
}
