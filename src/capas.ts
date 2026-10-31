// The prompt layers and the assembly of a phase prompt from them.
//
// From lowest to highest priority:
//   1    fábrica   <package>/prompts/<language>/          fase-N-*.md, global-rules.md, comandos/
//   2    preset    a file of blocks                        blocks only
//   2.5  reglas    rule variants of the package            blocks only
//   3    global    PHASE_GATE_PROMPTS_PATH, or otherwise <configDir>/prompts/ when it exists
//                  (the same as the factory, plus a bloques.md)
//   4    proyecto  <DOCS>/<PROJECT>/.phase-gate/prompts/   the same as 3
//
// The BODY of a phase comes from the highest layer (among 1, 3 and 4) that has its fase-N-*.md, and its
// header gives the name of the document: a block never changes it. Then each slot receives the blocks of
// the layers in ascending order, so the highest one rules, even if it is below the body's layer.

import * as fs from "fs";
import * as path from "path";

import { aplicarBloques, leerBloques, omitirRanuraVacia, ranurasDe } from "./bloques.js";
import type { Bloque, Procedencia } from "./bloques.js";
import { DOCS, IDIOMA_POR_DEFECTO, carpetaPromptsGlobal, defaultPromptsPath, idiomaDeEtiqueta, requireBasePath } from "./config.js";
import type { Hallazgo } from "./diagnostico.js";
import { fallo, mensaje } from "./i18n/mensajes.js";
import { PRESET_POR_DEFECTO, describirPresets, idiomaDelProyecto, manifiestoDe, maquinaDe, presetsDisponibles, resolverRepos } from "./manifiesto.js";
import type { Manifiesto, OrigenDelIdioma, PoliticaCommit, Preset, RepoResuelto } from "./manifiesto.js";
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
import { VOCABULARIO, esIdioma, vocabulario } from "./vocabulario.js";
import type { Idioma } from "./vocabulario.js";

export type EtiquetaCapa = "fábrica" | "preset" | "reglas" | "global" | "proyecto";
export type Capa = { orden: 1 | 2 | 2.5 | 3 | 4; etiqueta: EtiquetaCapa; ruta: string };
export type { Procedencia } from "./bloques.js";

// The blocks file of a global or project layer.
export const ARCHIVO_BLOQUES = "bloques.md";

// The sections of the global rules that are skeleton: they are not slots, no block touches them and, if a
// global-rules.md of one's own lacks them, the factory ones are re-injected. From the vocabulary.
export const SECCIONES_ESQUELETO: readonly string[] = VOCABULARIO.es.seccionesEsqueleto;

export function carpetaPromptsDeProyecto(carpetaProyecto: string): string {
  return path.join(requireBasePath(DOCS), carpetaProyecto, ".phase-gate", "prompts");
}

// ─── Effective configuration of a project ───────────────────────────────────
// Which preset and which rules a prompt is assembled with. The preset follows this precedence:
//   task frontmatter > the project's phase-gate.json > presetPorDefecto of machine.json > software
// and the rules (lotes, commits): manifest rules > preset frontmatter > factory value.
// A preset or a manifest that does not exist or is badly written is an explicit error.
export type OrigenDelPreset = "de la tarea" | "del proyecto" | "de machine.json" | "por defecto";
export type OrigenDeRegla = "del proyecto" | "del preset" | "de fábrica";
export type ReglasEfectivas = {
  lotes: boolean;
  commits: PoliticaCommit;
  origen: { lotes: OrigenDeRegla; commits: OrigenDeRegla };
};
// `redaccion`: the language the CONTENT of the task's documents is written in, if it is not the project's.
// It changes no structure, headings or names.
export type FrontmatterDeTarea = { repos: string[] | null; preset: string | null; redaccion: Idioma | null };

export type ConfiguracionProyecto = {
  carpetaProyecto: string | null;
  manifiesto: Manifiesto | null;
  idioma: Idioma;
  origenIdioma: OrigenDelIdioma;
  preset: Preset;
  origenPreset: OrigenDelPreset;
  reglas: ReglasEfectivas;
  tarea: FrontmatterDeTarea | null;
};

export const LOTES_DE_FABRICA = true;
export const COMMITS_DE_FABRICA: PoliticaCommit = "agente-commitea-con-OK";

// The layers that contribute bodies (1, 3 and 4), without resolving preset or rules: what is needed to know
// which phases exist and what their documents are called. It only reads the manifest (and the names of the
// documents on disk) for the language.
export function capasDeCuerpos(carpetaProyecto: string | null): Capa[] {
  const idioma = idiomaDelProyecto(carpetaProyecto, carpetaProyecto ? manifiestoDe(carpetaProyecto) : null).idioma;
  const capas: Capa[] = [{ orden: 1, etiqueta: "fábrica", ruta: defaultPromptsPath(idioma) }];
  const global = carpetaPromptsGlobal();
  if (global) capas.push({ orden: 3, etiqueta: "global", ruta: global });
  if (carpetaProyecto) capas.push({ orden: 4, etiqueta: "proyecto", ruta: carpetaPromptsDeProyecto(carpetaProyecto) });
  return capas;
}

// The phases of a project: a project can replace a whole phase, with another document, and its tasks are
// deduced with that name. Without a project, the factory ones and the global layer.
export function fasesDe(carpetaProyecto: string | null): Map<number, PhaseFile> {
  return discoverPhases(rutasDeCuerpos(capasDeCuerpos(carpetaProyecto)));
}

export function contextoInicialDe(carpetaProyecto: string | null): string {
  return fasesDe(carpetaProyecto).get(1)?.documentoInicial || CONTEXTO_INICIAL_POR_DEFECTO;
}

// The frontmatter that start_task writes in the initial context when the task declares its repos or its
// preset. Both `repos: api, web` and `repos: [api, web]` are accepted.
export function frontmatterDeTarea(carpetaTarea: string, contextoInicial: string): FrontmatterDeTarea {
  let meta: Record<string, string> = {};
  try {
    meta = separarFrontmatter(leerTextoAcotado(path.join(carpetaTarea, contextoInicial))).meta;
  } catch {
    // Without a readable initial context, the task declares nothing: it uses the project's.
  }
  const repos =
    meta.repos === undefined
      ? null
      : meta.repos
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((id) => id.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
  const redaccion = idiomaDeEtiqueta(meta.redaccion ?? "");
  return { repos, preset: meta.preset?.trim() || null, redaccion };
}

export function configuracionDe(carpetaProyecto: string | null, carpetaTarea?: string | null): ConfiguracionProyecto {
  const manifiesto = carpetaProyecto ? manifiestoDe(carpetaProyecto) : null;
  const { idioma, origen: origenIdioma } = idiomaDelProyecto(carpetaProyecto, manifiesto);
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
    throw fallo("CAPA-TXT-PRESET-DESCONOCIDO", {
      nombre,
      origen: mensaje("CAPA-TXT-ORIGEN-PRESET", { origen: origenPreset }),
      disponibles: describirPresets(presets),
    });
  }

  const regla = <T>(delProyecto: T | undefined, delPreset: T | null, deFabrica: T): [T, OrigenDeRegla] =>
    delProyecto !== undefined ? [delProyecto, "del proyecto"] : delPreset !== null ? [delPreset, "del preset"] : [deFabrica, "de fábrica"];
  const [lotes, origenLotes] = regla(manifiesto?.reglas.lotes, preset.lotes, LOTES_DE_FABRICA);
  const [commits, origenCommits] = regla(manifiesto?.reglas.commits, preset.commits, COMMITS_DE_FABRICA);

  return {
    carpetaProyecto,
    manifiesto,
    idioma,
    origenIdioma,
    preset,
    origenPreset,
    reglas: { lotes, commits, origen: { lotes: origenLotes, commits: origenCommits } },
    tarea,
  };
}

// The block files of the package that activate the rules: the factory content is "with batches" and
// "agente-commitea-con-OK", so those two have no file.
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

// All the layers of a project (or without a project, with null: the factory, the preset of machine.json or
// `software`, its rules and the global layer). With the task folder, its frontmatter can change the preset.
export function capasDe(carpetaProyecto: string | null, carpetaTarea?: string | null): Capa[] {
  return capasConConfiguracion(configuracionDe(carpetaProyecto, carpetaTarea));
}

// ─── The PROJECT CONFIGURATION block ────────────────────────────────────────
// Data, not prose: what the manifest, machine.json and the task declare, at the end of each phase prompt
// when the project is known. The git state of each repo is added by whoever knows it (`estado`).
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
  // In the project's language: it is a block of the prompt. The values (preset, commit policy, ids) are not
  // translated; the origins and the yes/no, only when written here.
  const idioma = config.idioma;
  const v = vocabulario(idioma);
  const m = config.manifiesto;
  const origen =
    config.origenPreset === "por defecto"
      ? mensaje("CAPA-TXT-ORIGEN-SIN-MANIFIESTO", {}, idioma)
      : mensaje("CAPA-TXT-ORIGEN-PRESET", { origen: config.origenPreset }, idioma);
  const lineas = [
    `## ${m ? v.encabezados.configuracionDelManifiesto : v.encabezados.configuracionDelProyecto}`,
    "",
    mensaje("CAPA-TXT-CONFIG-PRESET", { nombre: config.preset.nombre, origen, idioma: config.idioma }, idioma),
    mensaje("CAPA-TXT-CONFIG-LOTES", { lotes: config.reglas.lotes, commits: config.reglas.commits }, idioma),
  ];

  if (repos.length) {
    lineas.push(mensaje("CAPA-TXT-CONFIG-REPOS", {}, idioma));
    for (const repo of repos) {
      const rol = repo.rol ? ` (${repo.rol})` : "";
      const donde = repo.ruta ? `\`${repo.ruta}\`` : mensaje("CAPA-TXT-CONFIG-SIN-RUTA", { error: repo.error ?? null }, idioma);
      const extra = repo.ruta && !repo.existe ? mensaje("CAPA-TXT-CONFIG-REPO-NO-EXISTE", {}, idioma) : (estado(repo) ?? "");
      lineas.push(`  - \`${repo.id}\`${rol}: ${donde}${extra}`);
    }
  }
  if (m?.reglas.verificacion?.length) {
    lineas.push(mensaje("CAPA-TXT-CONFIG-VERIFICACION", { comandos: m.reglas.verificacion.map((c) => `\`${c}\``).join(", ") }, idioma));
  }
  if (m?.fase5.prPorRepo) lineas.push(mensaje("CAPA-TXT-CONFIG-PR-POR-REPO", {}, idioma));
  if (repos.length) lineas.push("", mensaje("CAPA-TXT-CONFIG-USA-IDS", {}, idioma));

  return lineas.join("\n");
}

// The layers that can contribute bodies (phases, global rules, commands), from lowest to highest.
export function rutasDeCuerpos(capas: Capa[]): string[] {
  return capas.filter((capa) => capa.orden === 1 || capa.orden === 3 || capa.orden === 4).map((capa) => capa.ruta);
}

// For whoever still passes a list of folders (loadPhasePrompt with explicit layers, the tests): the first
// is the factory one and the rest, global.
export function capasDesdeRutas(rutas: string[]): Capa[] {
  return rutas.map((ruta, i): Capa => (i === 0 ? { orden: 1, etiqueta: "fábrica", ruta } : { orden: 3, etiqueta: "global", ruta }));
}

function capaDelArchivo(archivo: string, capas: Capa[]): Capa | null {
  const carpeta = path.resolve(path.dirname(archivo));
  return [...capas].reverse().find((capa) => path.resolve(capa.ruta) === carpeta) ?? null;
}

// All the blocks that the layers contribute, in the order they are applied: by ascending layer and, within
// a layer, in the file's order.
export function bloquesDe(capas: Capa[]): { bloques: Bloque[]; avisos: Hallazgo[] } {
  const bloques: Bloque[] = [];
  const avisos: Hallazgo[] = [];
  for (const capa of [...capas].sort((a, b) => a.orden - b.orden)) {
    if (capa.orden === 1) continue; // the factory brings no blocks: its slots are already the default content
    const archivo = capa.orden === 2 || capa.orden === 2.5 ? capa.ruta : path.join(capa.ruta, ARCHIVO_BLOQUES);
    const leidos = leerBloques(archivo, capa);
    bloques.push(...leidos.bloques);
    avisos.push(...leidos.avisos);
  }
  return { bloques, avisos };
}

// The data of each orphan warning, so that notaDeHuerfano can write it again in the project's language: the
// text of the warning goes in the call's.
type DatosDeHuerfano = { id: string; archivo: string; linea: number };
const DATOS_DE_HUERFANO = new WeakMap<Hallazgo, DatosDeHuerfano>();

function avisoDeHuerfano(bloque: Bloque): Hallazgo {
  const datos: DatosDeHuerfano = { id: bloque.id, archivo: bloque.origen.archivo, linea: bloque.origen.linea };
  const aviso: Hallazgo = {
    severidad: "aviso",
    codigo: "BLOQUE-HUERFANO",
    texto: mensaje("BLOQUE-HUERFANO", datos),
  };
  DATOS_DE_HUERFANO.set(aviso, datos);
  return aviso;
}

// The line that get_phase_prompt prepends for each orphan block of the phase it delivers, in the project's
// language. A warning that did not come from here (without its data) is cited with the text it carries.
// With something that is not a language (the index of a `.map(notaDeHuerfano)`), in Spanish.
export function notaDeHuerfano(aviso: Hallazgo, idioma: Idioma = "es"): string {
  const enIdioma: Idioma = esIdioma(idioma) ? idioma : "es";
  const datos = DATOS_DE_HUERFANO.get(aviso);
  return datos ? mensaje("CAPA-TXT-NOTA-HUERFANO", datos, enIdioma) : mensaje("CAPA-TXT-NOTA-DEL-SERVIDOR", { texto: aviso.texto }, enIdioma);
}

// How to say where the default content of a slot comes from: "fábrica", or the file and the line of the
// marker if the body belongs to a layer of one's own.
function origenPorDefecto(archivo: string, capa: Capa | null, desplazamiento: number): (linea: number) => string {
  return (linea) => (capa?.etiqueta === "fábrica" ? "fábrica" : `${archivo}:${linea + desplazamiento}`);
}

// The header lines that separarFrontmatter removed: so that the file:line of a slot points to the real line
// of the file.
function lineasDeCabecera(archivo: string): number {
  try {
    const completo = leerPromptNormalizado(archivo);
    return completo.split("\n").length - parsePhaseFile(archivo).cuerpo.split("\n").length;
  } catch {
    return 0;
  }
}

// A "## X" section of a text: from its heading to the next "## " or the end.
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
  texto: string | null; // null if no layer has global-rules.md
  archivo: string | null;
  procedencia: Procedencia[];
  huerfanos: Bloque[];
  reinyectadas: string[]; // skeleton sections that were added from the factory one
};

// The global rules with their blocks applied, without the `extra` slot if it stayed empty, and with the
// factory skeleton sections added at the end if the file that wins lacks them.
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
    // Each section, in the factory's language; and a file of one's own that has it in the other language
    // already has it.
    for (const [i, titulo] of SECCIONES_ESQUELETO.entries()) {
      const titulos = [titulo, VOCABULARIO.en.seccionesEsqueleto[i]!];
      const deFabricaEn = titulos.find((t) => seccion(original, t) !== null);
      const deEllas = deFabricaEn ? seccion(original, deFabricaEn) : null;
      if (deEllas && !titulos.some((t) => tieneSeccion(texto, t))) {
        texto = `${texto}\n\n${deEllas}`;
        reinyectadas.push(deFabricaEn!);
      }
    }
  }

  return { texto, archivo, procedencia: aplicado.procedencia, huerfanos: aplicado.huerfanos, reinyectadas };
}

export type PromptEnsamblado = { texto: string; procedencia: Procedencia[]; avisos: Hallazgo[] };
// `idioma`: the project's, in which the blocks the server adds are written (ARCHIVOS DE ESTA TAREA).
// Without it, Spanish.
export type OpcionesDeEnsamblado = { incluirConfigProyecto?: boolean; idioma?: Idioma };

// The assembly with a specific list of layers. It throws if the phase does not exist in any.
export function ensamblarConCapas(fase: number, capas: Capa[], opciones: OpcionesDeEnsamblado = {}): PromptEnsamblado {
  const rutas = rutasDeCuerpos(capas);
  const phases: Map<number, PhaseFile> = discoverPhases(rutas);
  const entrada = phases.get(fase);

  if (!entrada) {
    const lista = [...phases.keys()].sort((a, b) => a - b).join(", ");
    throw lista ? fallo("CAPA-TXT-FASE-NO-VALIDA", { lista }) : fallo("CAPA-TXT-SIN-PROMPTS", { rutas: rutas.join(", ") });
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

  const archivos = describePhaseFiles(phases, fase, opciones.idioma ?? "es");
  if (archivos) partes.push(archivos);

  // Orphans of what is delivered: those of the global rules and those of this phase.
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
  return mensaje("GLOBAL-REINYECTADO", { archivo, titulos: reinyectadas });
}

// The prompt of a phase as the model receives it in a project (or without a project, with null). With a
// project, it ends with the PROJECT CONFIGURATION block, except with incluirConfigProyecto: false (the
// golden test compares with 2.2.0, which did not have it). `estadoDeRepo` is supplied by whoever can ask git.
export function ensamblarFase(
  fase: number,
  carpetaProyecto: string | null,
  carpetaTarea?: string | null,
  opciones: OpcionesDeEnsamblado & { estadoDeRepo?: (repo: RepoResuelto) => string | null } = {}
): PromptEnsamblado {
  const config = configuracionDe(carpetaProyecto, carpetaTarea);
  const ensamblado = ensamblarConCapas(fase, capasConConfiguracion(config), { ...opciones, idioma: config.idioma });
  // A task written in another language than its project's says so at the end, in the project's.
  const redaccion = config.tarea?.redaccion && config.tarea.redaccion !== config.idioma ? vocabulario(config.idioma).lineaDeRedaccion[config.tarea.redaccion] : null;
  const conRedaccion = (texto: string): string => (redaccion ? `${texto}\n\n${redaccion}` : texto);
  if (!carpetaProyecto || opciones.incluirConfigProyecto === false) return { ...ensamblado, texto: conRedaccion(ensamblado.texto) };
  return { ...ensamblado, texto: conRedaccion(`${ensamblado.texto}\n\n${bloqueDeConfiguracion(config, reposDeLaTarea(config), opciones.estadoDeRepo)}`) };
}

// The text with its slots (markers included) of a file: "global" or "fase-N", the body that wins in those
// layers. null if it does not exist.
function cuerpoDe(capas: Capa[], archivo: string): string | null {
  const rutas = rutasDeCuerpos(capas);
  if (archivo === "global") {
    const reglas = resolveGlobalRules(rutas);
    return reglas ? leerPromptNormalizado(reglas) : null;
  }
  const entrada = discoverPhases(rutas).get(Number(archivo.slice("fase-".length)));
  return entrada ? parsePhaseFile(entrada.file).cuerpo : null;
}

// The slots that a file has in these layers, in order. Empty if the file does not exist.
export function ranurasDisponibles(capas: Capa[], archivo: string): string[] {
  const texto = cuerpoDe(capas, archivo);
  return texto === null ? [] : ranurasDe(texto).map((ranura) => ranura.nombre);
}

// The content of a slot as it reaches the model with these layers: that of the winning body with all the
// blocks applied. It is what `eject fase-3/pruebas` copies. null if it does not exist.
export function contenidoEfectivoDeRanura(capas: Capa[], id: string): { contenido: string; procedencia: Procedencia } | null {
  const [archivo = "", ranura = ""] = id.split("/");
  const texto = cuerpoDe(capas, archivo);
  if (texto === null) return null;
  const aplicado = aplicarBloques(texto, archivo, bloquesDe(capas).bloques, () => "");
  const encontrada = ranurasDe(aplicado.texto).find((r) => r.nombre === ranura);
  if (!encontrada) return null;
  return {
    contenido: aplicado.texto.split("\n").slice(encontrada.apertura + 1, encontrada.cierre).join("\n"),
    procedencia: aplicado.procedencia.find((p) => p.ranura === id)!,
  };
}

// The blocks that fit nowhere, looking at all the phases at once: what doctor lists. A block that is an
// orphan for one phase may not be for another, so each block is looked at against the body of ITS file; and
// one of a phase that does not exist is always an orphan.
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
      // An unreadable body is reported by whoever delivers it; here only loose blocks are looked for.
    }
  }

  return [...avisos, ...huerfanos.map(avisoDeHuerfano)];
}
