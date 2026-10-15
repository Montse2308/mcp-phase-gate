// Radiografía de la instalación: qué versión corre y desde dónde, de dónde salió cada variable,
// qué archivo de prompt gana en cada fase, qué proyectos hay y en qué va su tarea activa, y los
// avisos que se deducen de todo eso.
//
// Es una sola fuente para tres salidas: `npx mcp-phase-gate doctor`, la tool
// `get_orchestrator_status` y el recurso `phase-gate://estado`. Si cada una armara su propio
// diagnóstico, dirían cosas distintas justo el día en que alguien las compare para entender por
// qué algo no funciona.
//
// Solo lee. No escribe nada ni lanza por configuración incompleta: diagnosticar una instalación
// rota es precisamente para lo que existe, así que cada parte captura su propio error y lo
// convierte en un hallazgo.

import * as fs from "fs";
import * as path from "path";
import {
  DOCS,
  MODULE_DIR,
  NOMBRES_LOGICOS,
  REPOS,
  SERVER_NAME,
  SERVER_VERSION,
  TASKS_SUBDIR_POR_DEFECTO,
  errorDeEnv,
  leerVariable,
  promptsLayers,
  requireBasePath,
  stateFile,
} from "./config.js";
import type { LecturaVariable, NombreLogico, RutaRequerida } from "./config.js";
import { discoverProjects, estaDentro, findProjectFolder } from "./paths.js";
import { discoverPhases, esCarpeta, leerPromptNormalizado, resolveCommandFile, resolveGlobalRules } from "./phases.js";
import type { PhaseFile } from "./phases.js";
import { describeEstado, leerPunteros, listarTareas, tareaActiva } from "./tasks.js";

export type Severidad = "error" | "aviso" | "info";
export type Hallazgo = { severidad: Severidad; codigo: string; texto: string };
export type EstadoRuta = { ruta?: string; existe: boolean; error?: string };
export type EtiquetaCapa = "fábrica" | "propia";
export type Via = "npx" | "global" | "dependencia" | "clon";

export type Diagnostico = {
  paquete: { version: string; ruta: string; via: Via };
  node: { version: string; plataforma: NodeJS.Platform };
  variables: LecturaVariable[];
  rutas: { docs: EstadoRuta; repos: EstadoRuta };
  estado: { archivo: string; existe: boolean; punteros: number };
  capas: { ruta: string; etiqueta: EtiquetaCapa; existe: boolean }[];
  reglasGlobales: { archivo: string | null; capa: string | null; faltan: string[] };
  fases: {
    numero: number;
    titulo: string;
    archivo: string;
    capa: string;
    documento?: string;
    recibos?: string;
    comando: string | null;
  }[];
  proyectos: {
    nombre: string;
    tareas: number;
    activa: { tarea: string; origen: "puntero" | "deducida"; fase: string } | null;
  }[];
  cliente?: { nombre: string; version: string; capacidades: { elicitation: boolean; roots: boolean } };
  hallazgos: Hallazgo[];
};

// Las secciones de las reglas globales que las fases citan por su nombre. Un global-rules.md
// propio sustituye al de fábrica (no se suma), así que si le falta una, las fases citan una regla
// que no existe. Es el riesgo E1-R1, y el aviso que pedía la Etapa 1 para cuando hubiera doctor.
export const SECCIONES_GLOBALES = ["EVIDENCIA", "BASE DE CADA DECISIÓN", "PENDIENTES HEREDADOS"];

const ORDEN_SEVERIDAD: Record<Severidad, number> = { error: 0, aviso: 1, info: 2 };

// ─── Cómo se ejecuta el paquete ─────────────────────────────────────────────
// Solo como información, nunca como decisión: la deducción puede equivocarse (riesgo E2-R7) y
// nada depende de ella. Sirve para que quien lea el diagnóstico sepa qué copia está corriendo,
// que es la primera pregunta cuando "cambié el prompt y no se nota".
export function deducirVia(ruta: string, entorno: NodeJS.ProcessEnv = process.env): Via {
  if (/[\\/]_npx[\\/]/.test(ruta)) return "npx";

  const prefijo = entorno.npm_config_prefix?.trim();
  if (prefijo) {
    const raizGlobal =
      process.platform === "win32" ? path.join(prefijo, "node_modules") : path.join(prefijo, "lib", "node_modules");
    if (estaDentro(raizGlobal, ruta)) return "global";
  }

  if (fs.existsSync(path.join(ruta, ".git"))) return "clon";
  return "dependencia";
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function estadoLegible(archivo: string): boolean {
  try {
    const crudo: unknown = JSON.parse(fs.readFileSync(archivo, "utf-8"));
    return crudo !== null && typeof crudo === "object" && !Array.isArray(crudo);
  } catch {
    return false;
  }
}

function estadoRuta(requerida: RutaRequerida): EstadoRuta {
  try {
    return { ruta: requireBasePath(requerida), existe: true };
  } catch (error) {
    const { valor } = leerVariable(requerida.logica);
    return { ...(valor ? { ruta: path.resolve(valor) } : {}), existe: false, error: mensajeDe(error) };
  }
}

// ─── Capas y fases ──────────────────────────────────────────────────────────
// También las usa el recurso phase-gate://fases, que enseña lo mismo sin el resto del diagnóstico.
export function capasDePrompts(): Diagnostico["capas"] {
  return promptsLayers().map((ruta, i) => ({
    ruta,
    etiqueta: (i === 0 ? "fábrica" : "propia") as EtiquetaCapa,
    existe: esCarpeta(ruta),
  }));
}

// La capa de un archivo es la más alta que lo contiene.
export function capaDeArchivo(archivo: string, capas: Diagnostico["capas"]): EtiquetaCapa | null {
  let encontrada: EtiquetaCapa | null = null;
  for (const capa of capas) if (estaDentro(capa.ruta, archivo)) encontrada = capa.etiqueta;
  return encontrada;
}

export function fasesConCapa(
  capas: Diagnostico["capas"] = capasDePrompts(),
  phases: Map<number, PhaseFile> = discoverPhases(capas.map((capa) => capa.ruta))
): Diagnostico["fases"] {
  const rutasCapas = capas.map((capa) => capa.ruta);
  return [...phases.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, datos]) => ({
      numero,
      titulo: datos.title,
      archivo: datos.file,
      capa: capaDeArchivo(datos.file, capas) ?? "desconocida",
      ...(datos.documento ? { documento: datos.documento } : {}),
      ...(datos.recibos ? { recibos: datos.recibos } : {}),
      comando: resolveCommandFile(numero, rutasCapas),
    }));
}

// ─── El diagnóstico ─────────────────────────────────────────────────────────
export function diagnosticar(opciones: { cliente?: Diagnostico["cliente"] } = {}): Diagnostico {
  const hallazgos: Hallazgo[] = [];
  const hallar = (severidad: Severidad, codigo: string, texto: string): void => {
    hallazgos.push({ severidad, codigo, texto });
  };

  const rutaPaquete = path.resolve(MODULE_DIR, "..");

  // Variables y rutas obligatorias.
  const variables = NOMBRES_LOGICOS.map((logica) => leerVariable(logica));
  for (const { discrepancia } of variables) {
    if (discrepancia) hallar("aviso", "VAR-DISCREPA", discrepancia);
  }

  const delEnv = errorDeEnv();
  if (delEnv) hallar("error", /UTF-16/.test(delEnv) ? "ENV-UTF16" : "ENV-ILEGIBLE", delEnv);

  const rutas = { docs: estadoRuta(DOCS), repos: estadoRuta(REPOS) };
  for (const estado of [rutas.docs, rutas.repos]) {
    if (!estado.existe) hallar("error", "VAR-FALTA", estado.error ?? "Falta una variable obligatoria.");
  }

  // Estado local.
  const archivoEstado = stateFile();
  let punteros: Record<string, string> = {};
  try {
    punteros = leerPunteros();
  } catch {
    // leerPunteros ya tolera un archivo ilegible; esto solo cubre una carpeta inaccesible.
  }
  const estado = { archivo: archivoEstado, existe: fs.existsSync(archivoEstado), punteros: Object.keys(punteros).length };

  // leerPunteros calla un archivo corrupto (para no dejar sin servicio), y doctor lo contaba como
  // "0 punteros". Aquí se dice: la tarea activa de cada proyecto se está deduciendo.
  if (estado.existe && !estadoLegible(archivoEstado)) {
    hallar(
      "aviso",
      "ESTADO-ILEGIBLE",
      `${archivoEstado} no es un JSON con la forma esperada: se ignora y la tarea activa de cada proyecto se deduce. ` +
        `Un switch_task lo vuelve a escribir.`
    );
  }

  // Capas de prompts.
  const capas = capasDePrompts();
  const rutasCapas = capas.map((capa) => capa.ruta);

  for (const capa of capas) {
    if (capa.etiqueta === "propia" && !capa.existe) {
      const { usada } = leerVariable("PROMPTS_PATH");
      if (fs.existsSync(capa.ruta)) {
        hallar(
          "aviso",
          "CAPA-NO-ES-CARPETA",
          `${usada} apunta a "${capa.ruta}", que no es una carpeta: se usan solo los prompts de fábrica.`
        );
      } else {
        hallar(
          "aviso",
          "CAPA-NO-EXISTE",
          `${usada} apunta a "${capa.ruta}", que no existe: se usan solo los prompts de fábrica.`
        );
      }
    }
  }

  const capaDe = (archivo: string): EtiquetaCapa | null => capaDeArchivo(archivo, capas);

  // Reglas globales.
  const archivoGlobales = resolveGlobalRules(rutasCapas);
  const capaGlobales = archivoGlobales ? capaDe(archivoGlobales) : null;
  let faltan: string[] = [];
  if (archivoGlobales) {
    try {
      const lineas = new Set(leerPromptNormalizado(archivoGlobales).split("\n").map((linea) => linea.trimEnd().normalize("NFC")));
      faltan = SECCIONES_GLOBALES.filter((seccion) => !lineas.has(`## ${seccion}`));
    } catch {
      faltan = [...SECCIONES_GLOBALES];
    }
  }
  if (archivoGlobales && capaGlobales !== "fábrica" && faltan.length) {
    hallar(
      "aviso",
      "GLOBAL-SIN-BASE",
      `Tu global-rules.md (${archivoGlobales}) sustituye al de fábrica y no tiene ` +
        `${faltan.map((seccion) => `"## ${seccion}"`).join(", ")}. Las fases citan esas secciones: ` +
        `cópialas desde el de fábrica.`
    );
  }

  // Fases.
  // discoverPhases ya salta las capas que no son carpeta; esto cubre lo que quede (una carpeta
  // sin permiso de lectura, por ejemplo). El diagnóstico no lanza nunca: lo convierte en hallazgo.
  let phases = new Map<number, PhaseFile>();
  try {
    phases = discoverPhases(rutasCapas);
  } catch (error) {
    hallar("error", "PROMPTS-ILEGIBLES", `No se pudieron leer las carpetas de prompts: ${mensajeDe(error)}`);
  }
  const fases = fasesConCapa(capas, phases);

  for (const fase of fases) {
    if (!fase.documento) {
      hallar(
        "aviso",
        "FASE-SIN-DOC",
        `La Fase ${fase.numero} (${fase.titulo}) no declara \`documento\` en su cabecera: no se puede deducir su avance.`
      );
    }
    if (!fase.comando) {
      hallar(
        "info",
        "FASE-SIN-COMANDO",
        `La Fase ${fase.numero} (${fase.titulo}) no tiene \`comandos/f${fase.numero}.md\` en ninguna capa de ` +
          `prompts: su comando /f${fase.numero} usa el texto genérico.`
      );
    }
  }

  // Proyectos y punteros. Sin DOCS_PATH no hay nada que listar, y eso ya es un VAR-FALTA.
  const proyectos: Diagnostico["proyectos"] = [];
  if (rutas.docs.existe) {
    try {
      for (const nombre of [...discoverProjects().values()].sort()) {
        const tareas = listarTareas(nombre, phases);
        const activa = tareaActiva(nombre, phases);
        proyectos.push({
          nombre,
          tareas: tareas.length,
          activa: activa
            ? { tarea: activa.estado.taskName, origen: activa.origen, fase: describeEstado(activa.estado, phases) }
            : null,
        });
      }

      for (const [clave, tarea] of Object.entries(punteros)) {
        const carpeta = findProjectFolder(clave);
        if (!carpeta) {
          hallar("info", "PUNTERO-HUERFANO", `Hay un puntero guardado para el proyecto "${clave}", que ya no existe.`);
        } else if (!listarTareas(carpeta, phases).some((t) => t.taskName === tarea)) {
          hallar(
            "info",
            "PUNTERO-HUERFANO",
            `El puntero de ${carpeta} apunta a la tarea "${tarea}", que ya no existe: se toma la más reciente.`
          );
        }
      }
    } catch (error) {
      hallar("error", "DOCS-ILEGIBLE", `No se pudo leer la Documentación Central: ${mensajeDe(error)}`);
    }
  }

  hallazgos.sort((a, b) => ORDEN_SEVERIDAD[a.severidad] - ORDEN_SEVERIDAD[b.severidad]);

  return {
    paquete: { version: SERVER_VERSION, ruta: rutaPaquete, via: deducirVia(rutaPaquete) },
    node: { version: process.version, plataforma: process.platform },
    variables,
    rutas,
    estado,
    capas,
    reglasGlobales: { archivo: archivoGlobales, capa: capaGlobales, faltan },
    fases,
    proyectos,
    ...(opciones.cliente ? { cliente: opciones.cliente } : {}),
    hallazgos,
  };
}

// ─── Formato ────────────────────────────────────────────────────────────────
// Texto para la terminal (doctor) y Markdown para el chat (la tool y el recurso). Las dos salen
// del mismo objeto y tienen las mismas secciones, en el mismo orden.

type FilaVariable = { nombre: NombreLogico; marca: string; valor: string; origen: string };

function filasDeVariables(d: Diagnostico): FilaVariable[] {
  return d.variables.map((lectura) => {
    const origen = lectura.usada ? `${lectura.usada} · ${lectura.fuente}` : "";
    const nombre = lectura.logica;

    if (nombre === "DOCS_PATH" || nombre === "REPOS_PATH") {
      const ruta = nombre === "DOCS_PATH" ? d.rutas.docs : d.rutas.repos;
      return { nombre, marca: ruta.existe ? "✓" : "✗", valor: ruta.ruta ?? "sin definir", origen };
    }

    if (lectura.valor === undefined || (lectura.valor === "" && nombre !== "TASKS_SUBDIR")) {
      if (nombre === "TASKS_SUBDIR") return { nombre, marca: "·", valor: TASKS_SUBDIR_POR_DEFECTO, origen: "(por defecto)" };
      if (nombre === "STATE_PATH") return { nombre, marca: "·", valor: `sin definir → ${path.dirname(d.estado.archivo)}`, origen };
      return { nombre, marca: "·", valor: "sin definir", origen };
    }

    if (nombre === "PROMPTS_PATH") {
      const propia = d.capas.find((capa) => capa.etiqueta === "propia");
      const existe = propia?.existe ?? false;
      return { nombre, marca: existe ? "✓" : "✗", valor: propia?.ruta ?? lectura.valor, origen };
    }

    if (nombre === "TASKS_SUBDIR" && lectura.valor === "") {
      return { nombre, marca: "·", valor: "(vacía: las tareas cuelgan del proyecto)", origen };
    }

    const valor = nombre === "STATE_PATH" ? path.dirname(d.estado.archivo) : lectura.valor;
    return { nombre, marca: "·", valor, origen };
  });
}

function lineaDeCliente(cliente: NonNullable<Diagnostico["cliente"]>): string {
  const si = (valor: boolean): string => (valor ? "sí" : "no");
  return (
    `${cliente.nombre} ${cliente.version} · elicitation: ${si(cliente.capacidades.elicitation)} · ` +
    `roots: ${si(cliente.capacidades.roots)}`
  );
}

function archivosDeFase(fase: Diagnostico["fases"][number]): string {
  if (!fase.documento) return "sin documento";
  return fase.recibos ? `${fase.documento} + ${fase.recibos}/` : fase.documento;
}

function lineaDeProyecto(proyecto: Diagnostico["proyectos"][number]): string {
  const tareas = `${proyecto.tareas} ${proyecto.tareas === 1 ? "tarea" : "tareas"}`;
  if (!proyecto.activa) return tareas;
  return `${tareas} · activa: ${proyecto.activa.tarea} (${proyecto.activa.origen}) · ${proyecto.activa.fase}`;
}

function formatearTexto(d: Diagnostico): string {
  const lineas: string[] = [];
  const columna = (texto: string, ancho: number): string => texto.padEnd(ancho);

  lineas.push(`${SERVER_NAME} ${d.paquete.version} · vía ${d.paquete.via}`);
  lineas.push(`${columna("Paquete", 13)}${d.paquete.ruta}`);
  lineas.push(`${columna("Node", 13)}${d.node.version} · ${d.node.plataforma}`);
  if (d.cliente) lineas.push(`${columna("Cliente", 13)}${lineaDeCliente(d.cliente)}`);

  lineas.push("", "Variables");
  const filas = filasDeVariables(d);
  const anchoNombre = Math.max(...filas.map((fila) => fila.nombre.length)) + 2;
  const anchoValor = Math.max(...filas.map((fila) => fila.valor.length)) + 4;
  for (const fila of filas) {
    const resto = fila.origen ? `${columna(fila.valor, anchoValor)}${fila.origen}` : fila.valor;
    lineas.push(`  ${columna(fila.nombre, anchoNombre)}${fila.marca} ${resto}`.trimEnd());
  }

  const punteros = `${d.estado.punteros} ${d.estado.punteros === 1 ? "puntero" : "punteros"}`;
  lineas.push("", `${columna("Estado", 15)}${d.estado.archivo} · ${d.estado.existe ? punteros : "todavía no existe"}`);

  lineas.push("", "Prompts (de menor a mayor prioridad)");
  for (const capa of d.capas) {
    lineas.push(`  ${columna(capa.etiqueta, 13)}${capa.ruta}${capa.existe ? "" : "  (no existe)"}`);
  }
  if (d.reglasGlobales.archivo) {
    const faltan = d.reglasGlobales.faltan.length ? `  (le faltan: ${d.reglasGlobales.faltan.join(", ")})` : "";
    lineas.push(`  reglas globales  ← ${d.reglasGlobales.capa ?? "desconocida"}${faltan}`);
  } else {
    lineas.push("  reglas globales  (ninguna)");
  }
  const anchoFase = Math.max(0, ...d.fases.map((fase) => `Fase ${fase.numero} ${fase.titulo}`.length)) + 3;
  for (const fase of d.fases) {
    const comando = fase.comando ? ` · /f${fase.numero}` : ` · /f${fase.numero} (texto genérico)`;
    lineas.push(
      `  ${columna(`Fase ${fase.numero} ${fase.titulo}`, anchoFase)}← ${columna(fase.capa, 9)}· ${archivosDeFase(fase)}${comando}`
    );
  }

  lineas.push("", "Proyectos");
  if (!d.rutas.docs.existe) {
    lineas.push("  (no se pueden listar sin DOCS_PATH)");
  } else if (d.proyectos.length === 0) {
    lineas.push("  (ninguno todavía)");
  } else {
    const anchoProyecto = Math.max(...d.proyectos.map((p) => p.nombre.length)) + 3;
    for (const proyecto of d.proyectos) lineas.push(`  ${columna(proyecto.nombre, anchoProyecto)}${lineaDeProyecto(proyecto)}`);
  }

  lineas.push("", "Hallazgos");
  if (d.hallazgos.length === 0) {
    lineas.push("  ninguno");
  } else {
    const anchoCodigo = Math.max(...d.hallazgos.map((h) => h.codigo.length)) + 2;
    for (const h of d.hallazgos) lineas.push(`  ${columna(h.severidad, 7)}${columna(h.codigo, anchoCodigo)}${h.texto}`);
  }

  return lineas.join("\n");
}

// Una celda de tabla Markdown: sin saltos de línea y con las barras escapadas.
function celda(texto: string): string {
  return texto.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function codigo(texto: string): string {
  return texto ? `\`${celda(texto)}\`` : "";
}

function tabla(encabezados: string[], filas: string[][]): string[] {
  return [
    `| ${encabezados.join(" | ")} |`,
    `|${encabezados.map(() => "---").join("|")}|`,
    ...filas.map((fila) => `| ${fila.join(" | ")} |`),
  ];
}

function formatearMarkdown(d: Diagnostico): string {
  const lineas: string[] = [];

  lineas.push(`### ${SERVER_NAME} ${d.paquete.version} · vía ${d.paquete.via}`, "");
  lineas.push(`- **Paquete:** ${codigo(d.paquete.ruta)}`);
  lineas.push(`- **Node:** ${d.node.version} · ${d.node.plataforma}`);
  if (d.cliente) lineas.push(`- **Cliente:** ${celda(lineaDeCliente(d.cliente))}`);

  lineas.push("", "### Variables", "");
  lineas.push(
    ...tabla(
      ["Variable", "", "Valor", "Nombre usado · fuente"],
      filasDeVariables(d).map((fila) => [fila.nombre, fila.marca, codigo(fila.valor), celda(fila.origen)])
    )
  );

  const punteros = `${d.estado.punteros} ${d.estado.punteros === 1 ? "puntero" : "punteros"}`;
  lineas.push("", "### Estado", "", `${codigo(d.estado.archivo)} · ${d.estado.existe ? punteros : "todavía no existe"}`);

  lineas.push("", "### Prompts", "", "Capas, de menor a mayor prioridad:", "");
  lineas.push(
    ...tabla(
      ["Capa", "Ruta", "Existe"],
      d.capas.map((capa) => [capa.etiqueta, codigo(capa.ruta), capa.existe ? "sí" : "no"])
    )
  );
  const faltan = d.reglasGlobales.faltan.length ? ` · le faltan: ${d.reglasGlobales.faltan.join(", ")}` : "";
  lineas.push(
    "",
    d.reglasGlobales.archivo
      ? `Reglas globales: ${codigo(d.reglasGlobales.archivo)} (${d.reglasGlobales.capa ?? "desconocida"})${faltan}`
      : "Reglas globales: ninguna",
    ""
  );
  lineas.push(
    ...tabla(
      ["Fase", "Título", "Capa", "Documento", "Recibos", "Comando", "Archivo"],
      d.fases.map((fase) => [
        String(fase.numero),
        celda(fase.titulo),
        fase.capa,
        codigo(fase.documento ?? ""),
        codigo(fase.recibos ? `${fase.recibos}/` : ""),
        fase.comando ? `/f${fase.numero}` : `/f${fase.numero} (texto genérico)`,
        codigo(fase.archivo),
      ])
    )
  );

  lineas.push("", "### Proyectos", "");
  if (!d.rutas.docs.existe) {
    lineas.push("No se pueden listar sin `DOCS_PATH`.");
  } else if (d.proyectos.length === 0) {
    lineas.push("Ninguno todavía.");
  } else {
    lineas.push(
      ...tabla(
        ["Proyecto", "Tareas", "Tarea activa", "Fase"],
        d.proyectos.map((p) => [
          celda(p.nombre),
          String(p.tareas),
          p.activa ? `${celda(p.activa.tarea)} (${p.activa.origen})` : "",
          p.activa ? celda(p.activa.fase) : "",
        ])
      )
    );
  }

  lineas.push("", "### Hallazgos", "");
  if (d.hallazgos.length === 0) {
    lineas.push("Ninguno.");
  } else {
    lineas.push(...tabla(["Severidad", "Código", "Detalle"], d.hallazgos.map((h) => [h.severidad, h.codigo, celda(h.texto)])));
  }

  return lineas.join("\n");
}

export function formatearDiagnostico(d: Diagnostico, formato: "texto" | "markdown"): string {
  return formato === "texto" ? formatearTexto(d) : formatearMarkdown(d);
}
