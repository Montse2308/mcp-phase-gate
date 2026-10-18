// `npx mcp-phase-gate eject <objetivo> --a global|proyecto:<NOMBRE>`: copia un prompt, una ranura, un
// comando o un preset a una capa propia, para editarlo ahí.
//
// El motor de bloques vuelve menos obvio qué texto recibe el modelo (riesgo E3-R6): eject es la
// salida. Copia exactamente lo que hoy está en vigor —para una ranura, su contenido EFECTIVO, con el
// preset y las reglas ya aplicados— al sitio donde editarlo gana, y dice cómo comprobarlo.
//
//   fase-3            el cuerpo de fábrica de la fase, CON sus marcadores de ranura (para que los
//                     bloques sigan aplicando)                       → <capa>/fase-3-plan-tecnico.md
//   fase-3/pruebas    el contenido efectivo de la ranura, como bloque  → <capa>/bloques.md
//   global/evidencia  igual                                            → <capa>/bloques.md
//   comando-f4        el texto efectivo de comandos/f4.md              → <capa>/comandos/f4.md
//   preset:<nombre>   el archivo completo del preset                   → <configDir>/presets/<nombre>.md

import * as fs from "fs";
import * as path from "path";

import { esCierreDeBloque, idDeAperturaDeBloque } from "./bloques.js";
import { ARCHIVO_BLOQUES, capasDe, capasDeCuerpos, carpetaPromptsDeProyecto, contenidoEfectivoDeRanura, ranurasDisponibles, rutasDeCuerpos } from "./capas.js";
import type { Capa } from "./capas.js";
import type { Salida } from "./cli.js";
import { carpetaPromptsGlobal, configDir } from "./config.js";
import { carpetaPresetsDelUsuario, describirPresets, presetsDisponibles } from "./manifiesto.js";
import { requireProjectFolder } from "./paths.js";
import { PHASE_FILE_PATTERN, discoverPhases, leerPromptNormalizado, resolveCommandFile } from "./phases.js";
import { textoGenerico } from "./prompts-mcp.js";
import { marcaDeTiempo } from "./init.js";
import { idCanonicoDeRanura } from "./vocabulario.js";

export type OpcionesEject = { destino: string | null; dryRun: boolean; fuerza: boolean };

export type Objetivo =
  | { tipo: "fase"; numero: number }
  | { tipo: "ranura"; id: string; archivo: string; ranura: string }
  | { tipo: "comando"; numero: number }
  | { tipo: "preset"; nombre: string };

// Lo que se pidió, o el error que se le dice a la persona.
export function parsearObjetivo(texto: string): Objetivo | string {
  if (/^global-rules(\.md)?$/i.test(texto)) {
    return "global-rules entero no se puede ejectar: su forma soportada son sus ranuras (global/cero-rupturas, global/evidencia, global/extra).";
  }
  // `phase-3` y `phase-3/tests` valen igual que `fase-3` y `fase-3/pruebas` (§8.2): se resuelven al id canónico.
  let m = texto.match(/^(?:fase|phase)-(\d+)$/);
  if (m) return { tipo: "fase", numero: Number(m[1]) };
  m = texto.match(/^(global|(?:fase|phase)-\d+)\/([\w-]+)$/);
  if (m) {
    const id = idCanonicoDeRanura(texto);
    const [archivo = "", ranura = ""] = id.split("/");
    return { tipo: "ranura", id, archivo, ranura };
  }
  m = texto.match(/^comando-f(\d+)$/);
  if (m) return { tipo: "comando", numero: Number(m[1]) };
  m = texto.match(/^preset:([a-z0-9][a-z0-9-]{0,39})$/);
  if (m) return { tipo: "preset", nombre: m[1]! };
  return `"${texto}" no es un objetivo válido: fase-N, fase-N/<ranura>, global/<ranura>, comando-fN o preset:<nombre>.`;
}

type Destino = { carpeta: string; proyecto: string | null; etiqueta: string };

function destinoDe(valor: string | null): Destino | string {
  if (valor === "global") {
    const carpeta = carpetaPromptsGlobal() ?? path.join(configDir(), "prompts");
    return { carpeta, proyecto: null, etiqueta: "la capa global" };
  }
  const m = valor?.match(/^proyecto:(.+)$/);
  if (m) {
    const proyecto = requireProjectFolder(m[1]!.trim());
    return { carpeta: carpetaPromptsDeProyecto(proyecto), proyecto, etiqueta: `la capa del proyecto ${proyecto}` };
  }
  return "Falta --a global o --a proyecto:<NOMBRE>: dónde copiarlo.";
}

export class ErrorDeEject extends Error {
  constructor(
    message: string,
    readonly codigo: 1 | 2
  ) {
    super(message);
  }
}

// Lo que haría un eject, sin escribir nada: el archivo, su texto nuevo y si sustituye a uno que ya existe.
// Lo calcula una sola función, que usan el CLI (que lo escribe o, con --dry-run, lo enseña) y el Studio
// (que lo enseña y lo aplica con su huella).
export type PlanDeEject = {
  objetivo: Objetivo;
  archivo: string;
  texto: string;
  reemplaza: boolean; // hay algo que sustituir: se deja copia
  etiqueta: string | null; // "la capa global", "la capa del proyecto X"; null para un preset
  proyecto: string | null;
};

// Escribe el plan. Si sustituye algo, lo que había queda antes en <archivo>.bak-<fecha>, que se devuelve.
export function escribirEject(plan: PlanDeEject, ahora: Date = new Date()): string | null {
  let copia: string | null = null;
  if (plan.reemplaza && fs.existsSync(plan.archivo)) {
    copia = `${plan.archivo}.bak-${marcaDeTiempo(ahora)}`;
    fs.copyFileSync(plan.archivo, copia);
  }
  fs.mkdirSync(path.dirname(plan.archivo), { recursive: true });
  fs.writeFileSync(plan.archivo, plan.texto, "utf-8");
  return copia;
}

function siExisteSinFuerza(existe: boolean, que: string, fuerza: boolean): void {
  if (existe && !fuerza) throw new ErrorDeEject(`${que} ya existe. No se toca; con --fuerza se reemplaza dejando copia.`, 1);
}

type Plan = { archivo: string; texto: string; reemplaza: boolean };

// ─── Cada objetivo ──────────────────────────────────────────────────────────
function planDeFase(numero: number, destino: Destino, fuerza: boolean): Plan {
  const [fabrica] = capasDeCuerpos(destino.proyecto);
  const entrada = discoverPhases([fabrica!.ruta]).get(numero);
  if (!entrada) throw new ErrorDeEject(`La fase ${numero} no existe en los prompts de fábrica.`, 2);

  const nombre = path.basename(entrada.file);
  const archivo = path.join(destino.carpeta, nombre);
  // Dentro de una capa gana el primer archivo de la fase por orden alfabético: uno con otro nombre
  // le ganaría o le perdería sin que se note.
  const otros = fs.existsSync(destino.carpeta)
    ? fs.readdirSync(destino.carpeta).filter((n) => n !== nombre && n.toLowerCase().endsWith(".md") && Number(n.match(PHASE_FILE_PATTERN)?.[1]) === numero)
    : [];
  if (otros.length) throw new ErrorDeEject(`En ${destino.carpeta} ya hay otro archivo de la fase ${numero} (${otros.join(", ")}): bórralo o renómbralo primero.`, 1);
  siExisteSinFuerza(fs.existsSync(archivo), archivo, fuerza);

  return { archivo, texto: leerPromptNormalizado(entrada.file), reemplaza: fs.existsSync(archivo) };
}

// Sustituye el bloque con ese id en un archivo de bloques, o lo añade al final.
function conBloque(actual: string, id: string, bloque: string): string {
  const lineas = actual.split("\n");
  // El marcador puede estar en español o en inglés, con el id o con su alias.
  const abre = lineas.findIndex((l) => idDeAperturaDeBloque(l) === id);
  if (abre !== -1) {
    const cierra = lineas.findIndex((l, i) => i > abre && esCierreDeBloque(l));
    if (cierra !== -1) {
      lineas.splice(abre, cierra - abre + 1, ...bloque.split("\n"));
      return lineas.join("\n");
    }
  }
  const base = actual.replace(/\s*$/, "");
  return base ? `${base}\n\n${bloque}\n` : `${bloque}\n`;
}

function planDeRanura(objetivo: Extract<Objetivo, { tipo: "ranura" }>, destino: Destino, fuerza: boolean): Plan {
  const capas: Capa[] = capasDe(destino.proyecto);
  const efectivo = contenidoEfectivoDeRanura(capas, objetivo.id);
  if (!efectivo) {
    const disponibles = ranurasDisponibles(capas, objetivo.archivo);
    throw new ErrorDeEject(
      disponibles.length
        ? `${objetivo.archivo} no tiene la ranura "${objetivo.ranura}". Las que tiene: ${disponibles.join(", ")}.`
        : `No existe ${objetivo.archivo === "global" ? "global-rules.md" : `la ${objetivo.archivo}`} en ninguna capa.`,
      2
    );
  }

  const archivo = path.join(destino.carpeta, ARCHIVO_BLOQUES);
  const actual = fs.existsSync(archivo) ? leerPromptNormalizado(archivo) : "";
  const yaEsta = actual.split("\n").some((l) => idDeAperturaDeBloque(l) === objetivo.id);
  siExisteSinFuerza(yaEsta, `El bloque «${objetivo.id}» de ${archivo}`, fuerza);

  const bloque = `<!-- bloque: ${objetivo.id} -->\n${efectivo.contenido}\n<!-- /bloque -->`;
  return { archivo, texto: conBloque(actual, objetivo.id, bloque), reemplaza: yaEsta };
}

function planDeComando(numero: number, destino: Destino, fuerza: boolean): Plan {
  const rutas = rutasDeCuerpos(capasDeCuerpos(destino.proyecto));
  const fase = discoverPhases(rutas).get(numero);
  if (!fase) throw new ErrorDeEject(`La fase ${numero} no existe: no hay /f${numero} que copiar.`, 2);
  const origen = resolveCommandFile(numero, rutas);
  const texto = origen ? leerPromptNormalizado(origen) : `${textoGenerico(numero, fase.title)}\n`;

  const archivo = path.join(destino.carpeta, "comandos", `f${numero}.md`);
  siExisteSinFuerza(fs.existsSync(archivo), archivo, fuerza);
  return { archivo, texto, reemplaza: fs.existsSync(archivo) };
}

function planDePreset(nombre: string, fuerza: boolean): Plan {
  const presets = presetsDisponibles();
  const preset = presets.get(nombre);
  if (!preset) throw new ErrorDeEject(`No existe el preset "${nombre}". Los disponibles son: ${describirPresets(presets)}.`, 2);
  if (!preset.ruta) throw new ErrorDeEject(`"${nombre}" no tiene archivo: son los prompts de fábrica, sin bloques.`, 2);

  const archivo = path.join(carpetaPresetsDelUsuario(), `${nombre}.md`);
  if (path.resolve(preset.ruta) === path.resolve(archivo)) throw new ErrorDeEject(`El preset "${nombre}" ya es tuyo: está en ${archivo}.`, 1);
  siExisteSinFuerza(fs.existsSync(archivo), archivo, fuerza);
  return { archivo, texto: leerPromptNormalizado(preset.ruta), reemplaza: fs.existsSync(archivo) };
}

// El plan de un eject. Lanza ErrorDeEject (con el código de salida del CLI) si no se puede.
export function planDeEject(textoObjetivo: string, opciones: { destino: string | null; fuerza: boolean }): PlanDeEject {
  const objetivo = parsearObjetivo(textoObjetivo);
  if (typeof objetivo === "string") throw new ErrorDeEject(objetivo, 2);
  if (objetivo.tipo === "preset") return { objetivo, ...planDePreset(objetivo.nombre, opciones.fuerza), etiqueta: null, proyecto: null };

  const destino = destinoDe(opciones.destino);
  if (typeof destino === "string") throw new ErrorDeEject(destino, 2);
  const plan =
    objetivo.tipo === "fase"
      ? planDeFase(objetivo.numero, destino, opciones.fuerza)
      : objetivo.tipo === "ranura"
        ? planDeRanura(objetivo, destino, opciones.fuerza)
        : planDeComando(objetivo.numero, destino, opciones.fuerza);
  return { objetivo, ...plan, etiqueta: destino.etiqueta, proyecto: destino.proyecto };
}

// ─── eject ──────────────────────────────────────────────────────────────────
export function ejecutarEject(textoObjetivo: string, opciones: OpcionesEject, salida: Salida): number {
  let plan: PlanDeEject;
  try {
    plan = planDeEject(textoObjetivo, opciones);
  } catch (error) {
    salida.err(error instanceof Error ? error.message : String(error));
    return error instanceof ErrorDeEject ? error.codigo : 1;
  }

  try {
    if (opciones.dryRun) {
      salida.out(`[dry-run] Se escribiría ${plan.archivo}:\n${plan.texto}`);
      return 0;
    }
    const copia = escribirEject(plan);
    if (copia) salida.out(`Copia de lo anterior: ${copia}`);

    const { objetivo } = plan;
    if (objetivo.tipo === "preset") {
      salida.out(`Copiado a ${plan.archivo}. Edítalo ahí: con el mismo nombre, el tuyo gana al del paquete.`);
      return 0;
    }
    const fase = objetivo.tipo === "ranura" ? objetivo.archivo.replace("fase-", "") : String(objetivo.numero);
    const comprobar = plan.proyecto ? `doctor --fase ${fase === "global" ? 1 : fase} --proyecto ${plan.proyecto}` : `doctor --fase ${fase === "global" ? 1 : fase}`;
    salida.out(`Copiado a ${plan.archivo} (${plan.etiqueta}). Edítalo ahí; \`${comprobar}\` te mostrará que gana.`);

    if (objetivo.tipo === "ranura") {
      const ahora = contenidoEfectivoDeRanura(capasDe(plan.proyecto), objetivo.id);
      if (ahora) salida.out(`Procedencia de ${objetivo.id}: ${ahora.procedencia.contenidoDe}${ahora.procedencia.modos.length ? ` + ${ahora.procedencia.modos.join(", ")}` : ""}`);
    }
    return 0;
  } catch (error) {
    salida.err(error instanceof Error ? error.message : String(error));
    return error instanceof ErrorDeEject ? error.codigo : 1;
  }
}
