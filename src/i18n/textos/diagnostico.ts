// Mensajes del grupo «diagnostico» (ver i18n/mensajes.ts): cada código con su texto en español y en inglés.
// El español es el texto de siempre, byte a byte; el inglés, una redacción natural con el glosario
// de docs/glosario.md.

import type { Catalogo } from "./tipos.js";

// Los valores de los enums del diagnóstico (severidades, capas, orígenes…) son canónicos, en español, y
// así van en el objeto estructurado. Solo al escribir un texto en inglés se traducen.
const VALORES_EN: Readonly<Record<string, string>> = {
  error: "error",
  aviso: "warning",
  info: "info",
  fábrica: "factory",
  propia: "own",
  desconocida: "unknown",
  puntero: "pointer",
  deducida: "deduced",
  dependencia: "dependency",
  clon: "clone",
  entorno: "environment",
  "sin definir": "not set",
  "de la tarea": "from the task",
  "del proyecto": "from the project",
  "de machine.json": "from machine.json",
  "por defecto": "default",
  paquete: "package",
  usuario: "user",
  integrado: "built-in",
  "del preset": "from the preset",
  "de fábrica": "factory",
  "de sus documentos": "from its documents",
  "de PHASE_GATE_LANG": "from PHASE_GATE_LANG",
  "del manifiesto sin idioma": "from a manifest without idioma",
  "del sistema": "from the system",
  fuerte: "strong",
  debil: "weak",
  válido: "valid",
  ausente: "absent",
};

const en = (valor: string): string => VALORES_EN[valor] ?? valor;

function enumerarEs(elementos: string[]): string {
  return elementos.length <= 1 ? elementos.join("") : `${elementos.slice(0, -1).join(", ")} y ${elementos[elementos.length - 1]}`;
}

function enumerarEn(elementos: string[]): string {
  return elementos.length <= 1 ? elementos.join("") : `${elementos.slice(0, -1).join(", ")} and ${elementos[elementos.length - 1]}`;
}

const siNoEs = (valor: boolean): string => (valor ? "sí" : "no");
const siNoEn = (valor: boolean): string => (valor ? "yes" : "no");

type PresetNoExiste = { preset: string; disponibles: string } & ({ tarea: string; proyecto: string } | { maquina: string });
type LineaConfiguracion = { manifiesto: string; preset: { nombre: string; origen: string } | null; reglas: { lotes: boolean; commits: string } | null; fuerza: string | null };
type LineaRepo = { id: string; ruta: string | null; origen: string | null; existe: boolean; esGit: boolean; rama: string | null };
type LineaMaquina = { existe: boolean; valido: boolean; overrides: number; presetPorDefecto: string | null };

export const TEXTOS_DIAGNOSTICO = {
  // ─── diagnostico.ts: los hallazgos ─────────────────────────────────────────
  "MANIFIESTO-CONFLICTO": {
    es: (p: { proyecto: string; copias: string[] }) =>
      `En la carpeta de ${p.proyecto} hay ${p.copias.map((c) => `"${c}"`).join(", ")}, que parece${p.copias.length === 1 ? "" : "n"} una copia en ` +
      "conflicto de phase-gate.json (OneDrive la deja al editar en dos equipos). Solo se lee phase-gate.json: compáralas y borra la que sobre.",
    en: (p: { proyecto: string; copias: string[] }) =>
      `The folder of ${p.proyecto} has ${p.copias.map((c) => `"${c}"`).join(", ")}, which look${p.copias.length === 1 ? "s" : ""} like a conflicted ` +
      "copy of phase-gate.json (OneDrive leaves one when it is edited on two machines). Only phase-gate.json is read: compare them and delete the one you don't need.",
  },
  "PRESET-NO-EXISTE": {
    es: (p: PresetNoExiste) =>
      "tarea" in p
        ? `La tarea "${p.tarea}" de ${p.proyecto} declara el preset "${p.preset}", que no existe. Los disponibles son: ${p.disponibles}.`
        : `El presetPorDefecto de ${p.maquina} es "${p.preset}", que no existe. Los disponibles son: ${p.disponibles}.`,
    en: (p: PresetNoExiste) =>
      "tarea" in p
        ? `Task "${p.tarea}" of ${p.proyecto} declares preset "${p.preset}", which does not exist. The available ones are: ${p.disponibles}.`
        : `The presetPorDefecto of ${p.maquina} is "${p.preset}", which does not exist. The available ones are: ${p.disponibles}.`,
  },
  "PRESET-IMPLICITO": {
    es: (p: { proyecto: string; tareas: number }) =>
      `${p.proyecto} no tiene phase-gate.json ni hay presetPorDefecto en machine.json: ${p.tareas === 1 ? "su tarea usa" : `sus ${p.tareas} tareas usan`} ` +
      "el preset `software`. Si se crearon con el flujo de la réplica (el de antes de la 3.0), consérvalo con `init --migrate` o con " +
      "\"presetPorDefecto\": \"software-replica\" en machine.json.",
    en: (p: { proyecto: string; tareas: number }) =>
      `${p.proyecto} has no phase-gate.json and machine.json has no presetPorDefecto: ${p.tareas === 1 ? "its task uses" : `its ${p.tareas} tasks use`} ` +
      "the `software` preset. If they were created with the replica flow (the one before 3.0), keep it with `init --migrate` or with " +
      "\"presetPorDefecto\": \"software-replica\" in machine.json.",
  },
  "REPO-NO-EXISTE": {
    es: (p: { repo: string; proyecto: string; ruta: string; origen: string | null }) =>
      `El repo \`${p.repo}\` de ${p.proyecto} apunta a "${p.ruta}" (${p.origen}), que no existe en este equipo.`,
    en: (p: { repo: string; proyecto: string; ruta: string; origen: string | null }) =>
      `Repo \`${p.repo}\` of ${p.proyecto} points to "${p.ruta}" (${p.origen}), which does not exist on this machine.`,
  },
  "GIT-LENTO": {
    es: (p: { segundos: number }) => `git no respondió en ${p.segundos} s en algún repo; su rama no se muestra. repo_status lo intenta sin ese plazo.`,
    en: (p: { segundos: number }) => `git did not answer within ${p.segundos} s in some repo; its branch is not shown. repo_status tries without that time limit.`,
  },
  "GIT-NO-INSTALADO": {
    es: (p: { error: string }) => `${p.error} repo_status y el estado de los repos no estarán disponibles.`,
    en: (p: { error: string }) => `${p.error} repo_status and the state of the repos will not be available.`,
  },
  "RECIBO-ILEGIBLE": {
    es: (p: { quien: string; error: string }) => `${p.quien}: ${p.error}`,
    en: (p: { quien: string; error: string }) => `${p.quien}: ${p.error}`,
  },
  "RECIBO-FUERA-DE-PLAN": {
    es: (p: { quien: string; archivo: string; total: number }) => `${p.quien}: \`${p.archivo}\` es de un lote que el plan no declara (declara ${p.total}).`,
    en: (p: { quien: string; archivo: string; total: number }) => `${p.quien}: \`${p.archivo}\` belongs to a batch the plan does not declare (it declares ${p.total}).`,
  },
  "RECIBO-MANUAL": {
    es: (p: { quien: string; lotes: string[] }) =>
      `${p.quien}: ${p.lotes.length === 1 ? `el recibo de ${p.lotes[0]} se escribió` : `los recibos de ${enumerarEs(p.lotes)} se escribieron`} a mano ` +
      "(sin `origen: servidor`). record_batch los lee igual y get_batch_status los marca como manuales.",
    en: (p: { quien: string; lotes: string[] }) =>
      `${p.quien}: ${p.lotes.length === 1 ? `the receipt of ${p.lotes[0]} was` : `the receipts of ${enumerarEn(p.lotes)} were`} written by hand ` +
      "(without `origin: server`). record_batch reads them all the same and get_batch_status marks them as manual.",
  },
  "INDICE-DESINCRONIZADO": {
    es: (p: { quien: string; documento: string }) =>
      `${p.quien}: \`${p.documento}\` no coincide con lo que el servidor ensamblaría hoy con sus recibos (¿se cambió a mano, después del cierre, ` +
      "el título, el estado, el ancla o lo que espera al usuario de algún recibo, o el propio índice?).",
    en: (p: { quien: string; documento: string }) =>
      `${p.quien}: \`${p.documento}\` does not match what the server would assemble today from its receipts (was the title, the status, the anchor ` +
      "or what awaits the user in some receipt, or the index itself, changed by hand after the closing?).",
  },
  "ANCLA-NO-VIGENTE": {
    es: (p: { quien: string; lote: string; texto: string }) => `${p.quien}, ${p.lote}: ${p.texto}`,
    en: (p: { quien: string; lote: string; texto: string }) => `${p.quien}, ${p.lote}: ${p.texto}`,
  },
  "LANG-INVALIDO": {
    es: (p: { valor: string; sistema: string }) =>
      `PHASE_GATE_LANG vale ${JSON.stringify(p.valor)}, que no es "es" ni "en" (también valen es-MX o en_US.UTF-8): ` +
      `se ignora y se usa el idioma del sistema, "${p.sistema}".`,
    en: (p: { valor: string; sistema: string }) =>
      `PHASE_GATE_LANG is ${JSON.stringify(p.valor)}, which is neither "es" nor "en" (es-MX or en_US.UTF-8 also work): ` +
      `it is ignored and the system language, "${p.sistema}", is used.`,
  },
  "VAR-FALTA": {
    es: "Falta una variable obligatoria.",
    en: "A required variable is missing.",
  },
  "ESTADO-ILEGIBLE": {
    es: (p: { archivo: string }) =>
      `${p.archivo} no es un JSON con la forma esperada: se ignora y la tarea activa de cada proyecto se deduce. ` + `Un switch_task lo vuelve a escribir.`,
    en: (p: { archivo: string }) =>
      `${p.archivo} is not JSON with the expected shape: it is ignored and the active task of each project is deduced. A switch_task writes it again.`,
  },
  "CAPA-NO-ES-CARPETA": {
    es: (p: { variable: string | null; ruta: string }) => `${p.variable} apunta a "${p.ruta}", que no es una carpeta: se usan solo los prompts de fábrica.`,
    en: (p: { variable: string | null; ruta: string }) => `${p.variable} points to "${p.ruta}", which is not a folder: only the factory prompts are used.`,
  },
  "CAPA-NO-EXISTE": {
    es: (p: { variable: string | null; ruta: string }) => `${p.variable} apunta a "${p.ruta}", que no existe: se usan solo los prompts de fábrica.`,
    en: (p: { variable: string | null; ruta: string }) => `${p.variable} points to "${p.ruta}", which does not exist: only the factory prompts are used.`,
  },
  "GLOBAL-SIN-BASE": {
    es: (p: { archivo: string; secciones: string[] }) =>
      `Tu global-rules.md (${p.archivo}) sustituye al de fábrica y no tiene ` +
      `${p.secciones.map((seccion) => `"## ${seccion}"`).join(", ")}. Las fases citan esas secciones: ` +
      `cópialas desde el de fábrica.`,
    en: (p: { archivo: string; secciones: string[] }) =>
      `Your global-rules.md (${p.archivo}) replaces the factory one and does not have ` +
      `${p.secciones.map((seccion) => `"## ${seccion}"`).join(", ")}. The phases cite those sections: copy them from the factory one.`,
  },
  "PROMPTS-ILEGIBLES": {
    es: (p: { error: string }) => `No se pudieron leer las carpetas de prompts: ${p.error}`,
    en: (p: { error: string }) => `Could not read the prompt folders: ${p.error}`,
  },
  "FASE-SIN-DOC": {
    es: (p: { fase: number; titulo: string }) => `La Fase ${p.fase} (${p.titulo}) no declara \`documento\` en su cabecera: no se puede deducir su avance.`,
    en: (p: { fase: number; titulo: string }) =>
      `Phase ${p.fase} (${p.titulo}) does not declare \`documento\` (\`document\`) in its header: its progress cannot be deduced.`,
  },
  "FASE-SIN-COMANDO": {
    es: (p: { fase: number; titulo: string }) =>
      `La Fase ${p.fase} (${p.titulo}) no tiene \`comandos/f${p.fase}.md\` en ninguna capa de ` + `prompts: su comando /f${p.fase} usa el texto genérico.`,
    en: (p: { fase: number; titulo: string }) =>
      `Phase ${p.fase} (${p.titulo}) has no \`comandos/f${p.fase}.md\` (or \`commands/f${p.fase}.md\`) in any prompt layer: its /f${p.fase} ` +
      "command uses the generic text.",
  },
  "MAQUINA-INVALIDA": {
    es: (p: { error: string }) =>
      `${p.error} Mientras no se corrija, fallan los prompts de los proyectos sin manifiesto (y sin proyecto), que necesitan su presetPorDefecto, y todo lo que resuelve repos.`,
    en: (p: { error: string }) =>
      `${p.error} Until it is fixed, the prompts of projects without a manifest (and without a project), which need its presetPorDefecto, fail, and so does everything that resolves repos.`,
  },
  "PRESETS-ILEGIBLES": {
    es: (p: { error: string }) => `No se pudieron leer los presets: ${p.error}`,
    en: (p: { error: string }) => `Could not read the presets: ${p.error}`,
  },
  "ROOTS-AMBIGUO": {
    es: (p: { candidatos: string[] }) =>
      `Las carpetas abiertas en el cliente coinciden con varios proyectos (${p.candidatos.join(", ")}): ` +
      "las tools no pueden deducir el proyecto e indican que se pase `project`.",
    en: (p: { candidatos: string[] }) =>
      `The folders open in the client match several projects (${p.candidatos.join(", ")}): ` +
      "the tools cannot deduce the project and ask for `project` to be passed.",
  },
  "RUTA-LARGA": {
    es: (p: { cuenta: number; largo: number; masLarga: string; tope: number | null }) =>
      `${p.cuenta} ${p.cuenta === 1 ? "ruta" : "rutas"} de la Documentación ${p.cuenta === 1 ? "pasa" : "pasan"} de ${p.largo} caracteres; ` +
      `la más larga (${p.masLarga.length}): \`${p.masLarga}\`. Cerca de 255 o 260, OneDrive y muchas herramientas de Windows ` +
      `dejan de abrir el archivo: acorta el nombre del proyecto, de la tarea o de la carpeta de la Documentación.` +
      (p.tope !== null ? ` (Se revisaron las primeras ${p.tope} entradas.)` : ""),
    en: (p: { cuenta: number; largo: number; masLarga: string; tope: number | null }) =>
      `${p.cuenta} ${p.cuenta === 1 ? "path" : "paths"} in the Documentation ${p.cuenta === 1 ? "is" : "are"} longer than ${p.largo} characters; ` +
      `the longest (${p.masLarga.length}): \`${p.masLarga}\`. Around 255 or 260, OneDrive and many Windows tools ` +
      `can no longer open the file: shorten the name of the project, of the task or of the Documentation folder.` +
      (p.tope !== null ? ` (Only the first ${p.tope} entries were checked.)` : ""),
  },
  "PUNTERO-HUERFANO": {
    es: (p: { proyecto: string } | { carpeta: string; tarea: string }) =>
      "proyecto" in p
        ? `Hay un puntero guardado para el proyecto "${p.proyecto}", que ya no existe.`
        : `El puntero de ${p.carpeta} apunta a la tarea "${p.tarea}", que ya no existe: se toma la más reciente.`,
    en: (p: { proyecto: string } | { carpeta: string; tarea: string }) =>
      "proyecto" in p
        ? `There is a saved pointer for project "${p.proyecto}", which no longer exists.`
        : `The pointer of ${p.carpeta} points to task "${p.tarea}", which no longer exists: the most recent one is used.`,
  },
  "DOCS-ILEGIBLE": {
    es: (p: { error: string }) => `No se pudo leer la Documentación Central: ${p.error}`,
    en: (p: { error: string }) => `Could not read the Central Documentation: ${p.error}`,
  },

  // ─── diagnostico.ts: el informe de doctor (texto y Markdown) ──────────────
  // Un valor canónico de un enum (severidad, capa, origen…) tal como se enseña.
  "DOCTOR-VALOR": {
    es: (p: { valor: string }) => p.valor,
    en: (p: { valor: string }) => en(p.valor),
  },
  "DOCTOR-SI-NO": {
    es: (p: { valor: boolean }) => siNoEs(p.valor),
    en: (p: { valor: boolean }) => siNoEn(p.valor),
  },
  "DOCTOR-RAMA-SEPARADA": {
    es: (p: { head: string | null }) => `(separado en ${p.head})`,
    en: (p: { head: string | null }) => `(detached at ${p.head})`,
  },
  "DOCTOR-CABECERA": {
    es: (p: { servidor: string; version: string; via: string }) => `${p.servidor} ${p.version} · vía ${p.via}`,
    en: (p: { servidor: string; version: string; via: string }) => `${p.servidor} ${p.version} · via ${en(p.via)}`,
  },
  "DOCTOR-SIN-DEFINIR": { es: "sin definir", en: "not set" },
  "DOCTOR-SIN-DEFINIR-ESTADO": {
    es: (p: { carpeta: string }) => `sin definir → ${p.carpeta}`,
    en: (p: { carpeta: string }) => `not set → ${p.carpeta}`,
  },
  "DOCTOR-ORIGEN-POR-DEFECTO": { es: "(por defecto)", en: "(default)" },
  "DOCTOR-SUBDIR-VACIA": { es: "(vacía: las tareas cuelgan del proyecto)", en: "(empty: the tasks hang directly from the project)" },
  "DOCTOR-ORIGEN-VARIABLE": {
    es: (p: { usada: string; fuente: string }) => `${p.usada} · ${p.fuente}`,
    en: (p: { usada: string; fuente: string }) => `${p.usada} · ${en(p.fuente)}`,
  },
  "DOCTOR-LINEA-CLIENTE": {
    es: (p: { nombre: string; version: string; elicitation: boolean; roots: boolean }) =>
      `${p.nombre} ${p.version} · elicitation: ${siNoEs(p.elicitation)} · ` + `roots: ${siNoEs(p.roots)}`,
    en: (p: { nombre: string; version: string; elicitation: boolean; roots: boolean }) =>
      `${p.nombre} ${p.version} · elicitation: ${siNoEn(p.elicitation)} · roots: ${siNoEn(p.roots)}`,
  },
  "DOCTOR-SIN-DOCUMENTO": { es: "sin documento", en: "no document" },
  "DOCTOR-LINEA-PROYECTO": {
    es: (p: { tareas: number; activa: { tarea: string; origen: string; fase: string } | null }) => {
      const tareas = `${p.tareas} ${p.tareas === 1 ? "tarea" : "tareas"}`;
      return p.activa ? `${tareas} · activa: ${p.activa.tarea} (${p.activa.origen}) · ${p.activa.fase}` : tareas;
    },
    en: (p: { tareas: number; activa: { tarea: string; origen: string; fase: string } | null }) => {
      const tareas = `${p.tareas} ${p.tareas === 1 ? "task" : "tasks"}`;
      return p.activa ? `${tareas} · active: ${p.activa.tarea} (${en(p.activa.origen)}) · ${p.activa.fase}` : tareas;
    },
  },
  "DOCTOR-LINEA-CONFIGURACION": {
    es: (p: LineaConfiguracion) => {
      const manifiesto = p.manifiesto.startsWith("inválido") ? "manifiesto inválido" : `manifiesto ${p.manifiesto}`;
      const preset = p.preset ? `preset ${p.preset.nombre} (${p.preset.origen})` : "preset sin resolver";
      const reglas = p.reglas ? ` · lotes ${siNoEs(p.reglas.lotes)} · commits ${p.reglas.commits}` : "";
      const raiz = p.fuerza ? ` · carpeta abierta: coincidencia ${p.fuerza}` : "";
      return `${manifiesto} · ${preset}${reglas}${raiz}`;
    },
    en: (p: LineaConfiguracion) => {
      const manifiesto = p.manifiesto.startsWith("inválido") ? "invalid manifest" : p.manifiesto === "ausente" ? "no manifest" : `${en(p.manifiesto)} manifest`;
      const preset = p.preset ? `preset ${p.preset.nombre} (${en(p.preset.origen)})` : "preset unresolved";
      const reglas = p.reglas ? ` · batches ${siNoEn(p.reglas.lotes)} · commits ${p.reglas.commits}` : "";
      const raiz = p.fuerza ? ` · open folder: ${en(p.fuerza)} match` : "";
      return `${manifiesto} · ${preset}${reglas}${raiz}`;
    },
  },
  "DOCTOR-LINEA-REPO": {
    es: (p: LineaRepo) => {
      if (!p.ruta) return `${p.id}: sin ruta`;
      const estado = !p.existe ? "no existe" : p.esGit ? `git · ${p.rama ?? "sin rama"}` : "sin git";
      return `${p.id}: ${p.ruta} (${p.origen}) · ${estado}`;
    },
    en: (p: LineaRepo) => {
      if (!p.ruta) return `${p.id}: no path`;
      const estado = !p.existe ? "does not exist" : p.esGit ? `git · ${p.rama ?? "no branch"}` : "no git";
      return `${p.id}: ${p.ruta} (${p.origen}) · ${estado}`;
    },
  },
  "DOCTOR-LINEA-MAQUINA": {
    es: (p: LineaMaquina) => {
      if (!p.existe) return "todavía no existe";
      if (!p.valido) return "inválido (ver hallazgos)";
      const preset = p.presetPorDefecto ? ` · presetPorDefecto ${p.presetPorDefecto}` : "";
      return `válido · ${p.overrides} ${p.overrides === 1 ? "override" : "overrides"} de repo${preset}`;
    },
    en: (p: LineaMaquina) => {
      if (!p.existe) return "does not exist yet";
      if (!p.valido) return "invalid (see findings)";
      const preset = p.presetPorDefecto ? ` · presetPorDefecto ${p.presetPorDefecto}` : "";
      return `valid · ${p.overrides} repo ${p.overrides === 1 ? "override" : "overrides"}${preset}`;
    },
  },
  "DOCTOR-ETIQUETA-PAQUETE": { es: "Paquete", en: "Package" },
  "DOCTOR-ETIQUETA-CLIENTE": { es: "Cliente", en: "Client" },
  "DOCTOR-ETIQUETA-CARPETA": { es: "Carpeta", en: "Folder" },
  "DOCTOR-TITULO-VARIABLES": { es: "Variables", en: "Variables" },
  "DOCTOR-TITULO-ESTADO": { es: "Estado", en: "State" },
  "DOCTOR-TITULO-CONFIGURACION": { es: "Configuración", en: "Configuration" },
  "DOCTOR-TITULO-PROMPTS": { es: "Prompts", en: "Prompts" },
  "DOCTOR-TITULO-PROMPTS-PRIORIDAD": { es: "Prompts (de menor a mayor prioridad)", en: "Prompts (from lowest to highest priority)" },
  "DOCTOR-CAPAS-PRIORIDAD": { es: "Capas, de menor a mayor prioridad:", en: "Layers, from lowest to highest priority:" },
  "DOCTOR-TITULO-PROYECTOS": { es: "Proyectos", en: "Projects" },
  "DOCTOR-TITULO-HALLAZGOS": { es: "Hallazgos", en: "Findings" },
  "DOCTOR-PUNTEROS": {
    es: (p: { n: number }) => `${p.n} ${p.n === 1 ? "puntero" : "punteros"}`,
    en: (p: { n: number }) => `${p.n} ${p.n === 1 ? "pointer" : "pointers"}`,
  },
  "DOCTOR-NO-EXISTE-TODAVIA": { es: "todavía no existe", en: "does not exist yet" },
  "DOCTOR-NINGUNO": { es: "ninguno", en: "none" },
  "DOCTOR-NINGUNO-PUNTO": { es: "Ninguno.", en: "None." },
  "DOCTOR-NO-EXISTE-MARCA": { es: "(no existe)", en: "(does not exist)" },
  "DOCTOR-TEXTO-REGLAS-GLOBALES": {
    es: (p: { hay: boolean; capa: string | null; faltan: string[] }) =>
      p.hay ? `reglas globales  ← ${p.capa ?? "desconocida"}${p.faltan.length ? `  (le faltan: ${p.faltan.join(", ")})` : ""}` : "reglas globales  (ninguna)",
    en: (p: { hay: boolean; capa: string | null; faltan: string[] }) =>
      p.hay ? `global rules  ← ${en(p.capa ?? "desconocida")}${p.faltan.length ? `  (missing: ${p.faltan.join(", ")})` : ""}` : "global rules  (none)",
  },
  "DOCTOR-MD-REGLAS-GLOBALES": {
    es: (p: { archivo: string | null; capa: string | null; faltan: string[] }) =>
      p.archivo
        ? `Reglas globales: ${p.archivo} (${p.capa ?? "desconocida"})${p.faltan.length ? ` · le faltan: ${p.faltan.join(", ")}` : ""}`
        : "Reglas globales: ninguna",
    en: (p: { archivo: string | null; capa: string | null; faltan: string[] }) =>
      p.archivo ? `Global rules: ${p.archivo} (${en(p.capa ?? "desconocida")})${p.faltan.length ? ` · missing: ${p.faltan.join(", ")}` : ""}` : "Global rules: none",
  },
  "DOCTOR-FASE": {
    es: (p: { numero: number; titulo: string }) => `Fase ${p.numero} ${p.titulo}`,
    en: (p: { numero: number; titulo: string }) => `Phase ${p.numero} ${p.titulo}`,
  },
  "DOCTOR-COMANDO-GENERICO": {
    es: (p: { numero: number }) => `/f${p.numero} (texto genérico)`,
    en: (p: { numero: number }) => `/f${p.numero} (generic text)`,
  },
  "DOCTOR-PROYECTOS-SIN-DOCS-TEXTO": { es: "(no se pueden listar sin DOCS_PATH)", en: "(they cannot be listed without DOCS_PATH)" },
  "DOCTOR-PROYECTOS-NINGUNO-TEXTO": { es: "(ninguno todavía)", en: "(none yet)" },
  "DOCTOR-PROYECTOS-SIN-DOCS-MD": { es: "No se pueden listar sin `DOCS_PATH`.", en: "They cannot be listed without `DOCS_PATH`." },
  "DOCTOR-PROYECTOS-NINGUNO-MD": { es: "Ninguno todavía.", en: "None yet." },
  // Las cabeceras de las tablas Markdown, separadas por "|" (una barra no puede ir en una cabecera).
  "DOCTOR-TABLA-VARIABLES": { es: "Variable||Valor|Nombre usado · fuente", en: "Variable||Value|Name used · source" },
  "DOCTOR-TABLA-CAPAS": { es: "Capa|Ruta|Existe", en: "Layer|Path|Exists" },
  "DOCTOR-TABLA-FASES": { es: "Fase|Título|Capa|Documento|Recibos|Comando|Archivo", en: "Phase|Title|Layer|Document|Receipts|Command|File" },
  "DOCTOR-TABLA-PROYECTOS": { es: "Proyecto|Tareas|Tarea activa|Fase|Configuración|Repos", en: "Project|Tasks|Active task|Phase|Configuration|Repos" },
  "DOCTOR-TABLA-HALLAZGOS": { es: "Severidad|Código|Detalle", en: "Severity|Code|Detail" },

  // ─── diagnostico.ts: la procedencia de una fase (doctor --fase) ───────────
  "DOCTOR-PROCEDENCIA-CABECERA": {
    es: (p: { fase: number; proyecto: string | null; tarea: string | null; preset: string; origen: string }) => {
      const donde = p.proyecto ? ` · ${p.proyecto}${p.tarea ? ` · tarea activa: ${p.tarea}` : ""}` : " · sin proyecto";
      return `Fase ${p.fase}${donde} · preset ${p.preset} (${p.origen})`;
    },
    en: (p: { fase: number; proyecto: string | null; tarea: string | null; preset: string; origen: string }) => {
      const donde = p.proyecto ? ` · ${p.proyecto}${p.tarea ? ` · active task: ${p.tarea}` : ""}` : " · no project";
      return `Phase ${p.fase}${donde} · preset ${p.preset} (${en(p.origen)})`;
    },
  },
  "DOCTOR-PROCEDENCIA-RANURA": { es: "Ranura", en: "Slot" },
  "DOCTOR-PROCEDENCIA-GANA": { es: "Gana", en: "Wins" },
  "DOCTOR-PROCEDENCIA-AVISOS": { es: "Avisos", en: "Warnings" },

  // ─── diagnostico.ts: la configuración de un proyecto (phase-gate://configuracion) ───
  "DOCTOR-CONFIG-TITULO": {
    es: (p: { proyecto: string }) => `### Configuración de ${p.proyecto}`,
    en: (p: { proyecto: string }) => `### Configuration of ${p.proyecto}`,
  },
  "DOCTOR-CONFIG-MANIFIESTO": {
    es: (p: { ruta: string; estado: "valido" | "ausente" | "invalido"; error: string }) =>
      `- **Manifiesto:** ${p.ruta} · ${p.estado === "valido" ? "válido" : p.estado === "ausente" ? "no existe" : `inválido: ${p.error}`}`,
    en: (p: { ruta: string; estado: "valido" | "ausente" | "invalido"; error: string }) =>
      `- **Manifest:** ${p.ruta} · ${p.estado === "valido" ? "valid" : p.estado === "ausente" ? "does not exist" : `invalid: ${p.error}`}`,
  },
  "DOCTOR-CONFIG-SIN-RESOLVER": {
    es: (p: { error: string }) => `No se pudo resolver la configuración: ${p.error}`,
    en: (p: { error: string }) => `Could not resolve the configuration: ${p.error}`,
  },
  "DOCTOR-TABLA-CONFIG": { es: "Valor|Efectivo|De dónde sale", en: "Value|Effective|Where it comes from" },
  "DOCTOR-CONFIG-FILAS": { es: "Preset|Idioma|Lotes|Commits|Verificación|PR por repo", en: "Preset|Language|Batches|Commits|Verification|PR per repo" },
  "DOCTOR-SIN-RESPUESTA": {
    es: (p: { segundos: number }) => `sin respuesta en ${p.segundos} s`,
    en: (p: { segundos: number }) => `no answer within ${p.segundos} s`,
  },
  "DOCTOR-GIT-ESTADO": {
    es: (p: { rama: string | null; separado: boolean; limpio: boolean }) => `${p.separado ? "separado" : p.rama} · ${p.limpio ? "limpio" : "con cambios"}`,
    en: (p: { rama: string | null; separado: boolean; limpio: boolean }) => `${p.separado ? "detached" : p.rama} · ${p.limpio ? "clean" : "with changes"}`,
  },
  "DOCTOR-SIN-GIT": { es: "sin git", en: "no git" },
  "DOCTOR-TABLA-REPOS": { es: "Id|Rol|Ruta en este equipo|Origen de la ruta|Existe|Git", en: "Id|Role|Path on this machine|Path origin|Exists|Git" },
  "DOCTOR-CONFIG-SIN-REPOS": { es: "El proyecto no declara repos.", en: "The project declares no repos." },
} satisfies Catalogo;
