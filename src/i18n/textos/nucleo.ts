// Mensajes del grupo «nucleo» (ver i18n/mensajes.ts): cada código con su texto en español y en inglés.
// El español es el texto de siempre, byte a byte; el inglés, una redacción natural con el glosario
// de docs/glosario.md.

import type { Catalogo } from "./tipos.js";

type Detalle = { detalle: string };

// De dónde sale el idioma de un proyecto que no lo declara (OrigenDelIdioma de manifiesto.ts, sin los que
// lo declaran): el valor canónico va en español y se traduce al escribir en inglés.
const ORIGENES_EN: Readonly<Record<string, string>> = {
  "de machine.json": "from machine.json",
  "de PHASE_GATE_LANG": "from PHASE_GATE_LANG",
  "del manifiesto sin idioma": "a manifest without idioma is Spanish, as in 3.0 and 3.1",
  "del sistema": "from the system",
};

export const TEXTOS_NUCLEO = {
  // ─── config.ts ──────────────────────────────────────────────────────────────
  "ENV-TXT-ILEGIBLE": {
    es: ({ archivo, detalle }: { archivo: string; detalle: string }) => `No se pudo leer el .env (${archivo}): ${detalle}`,
    en: ({ archivo, detalle }: { archivo: string; detalle: string }) => `Could not read the .env (${archivo}): ${detalle}`,
  },
  "ENV-TXT-UTF16": {
    es: ({ archivo }: { archivo: string }) => `El .env está en UTF-16 y no se cargó (${archivo}). Guárdalo como UTF-8 (sin BOM).`,
    en: ({ archivo }: { archivo: string }) => `The .env is in UTF-16 and was not loaded (${archivo}). Save it as UTF-8 (without BOM).`,
  },
  "ENV-TXT-NO-INTERPRETABLE": {
    es: ({ archivo, detalle }: { archivo: string; detalle: string }) => `No se pudo interpretar el .env (${archivo}): ${detalle}`,
    en: ({ archivo, detalle }: { archivo: string; detalle: string }) => `Could not parse the .env (${archivo}): ${detalle}`,
  },
  "CONFIG-VAR-DIFIERE": {
    es: ({ ignorada, usada, clienteGana }: { ignorada: string; usada: string; clienteGana: boolean }) =>
      `${ignorada} difiere de ${usada}; se usa ${usada}${clienteGana ? " (el entorno del cliente gana al .env)" : ""}.`,
    en: ({ ignorada, usada, clienteGana }: { ignorada: string; usada: string; clienteGana: boolean }) =>
      `${ignorada} differs from ${usada}; ${usada} is used${clienteGana ? " (the client's environment wins over the .env)" : ""}.`,
  },
  "CONFIG-VAR-VACIA": {
    es: ({ principal, alias }: { principal: string; alias: string }) => `${principal} está vacía; se usa ${alias}.`,
    en: ({ principal, alias }: { principal: string; alias: string }) => `${principal} is empty; ${alias} is used.`,
  },
  "CONFIG-VAR-CON-ALIAS": {
    es: ({ principal, alias }: { principal: string; alias: string }) => `${principal} (o su alias ${alias})`,
    en: ({ principal, alias }: { principal: string; alias: string }) => `${principal} (or its alias ${alias})`,
  },
  "CONFIG-APUNTA-A-DOCS": {
    es: "la carpeta raíz de la Documentación Central",
    en: "the root folder of the Central Documentation",
  },
  "CONFIG-APUNTA-A-REPOS": {
    es: "la carpeta que contiene tus repositorios de código",
    en: "the folder that contains your code repositories",
  },
  "CONFIG-FALTA-VARIABLE": {
    es: ({ variable, apuntaA, clave, delEnv, delMaquina }: { variable: string; apuntaA: string; clave: string; delEnv: string | null; delMaquina: string | null }) =>
      `Falta ${variable}, que debe apuntar a ${apuntaA}. Guárdala en machine.json, en "${clave}" ` +
      "(`npx mcp-phase-gate init --docs <ruta> --repos <ruta>` la escribe ahí) o, para un solo cliente o una " +
      `ejecución, en el bloque "env" del mcp.json de ese cliente.${delMaquina ? ` ${delMaquina}` : ""}${delEnv ? ` ${delEnv}` : ""}`,
    en: ({ variable, apuntaA, clave, delEnv, delMaquina }: { variable: string; apuntaA: string; clave: string; delEnv: string | null; delMaquina: string | null }) =>
      `${variable} is missing; it must point to ${apuntaA}. Save it in machine.json, under "${clave}" ` +
      "(`npx mcp-phase-gate init --docs <path> --repos <path>` writes it there) or, for a single client or " +
      `run, in the "env" block of that client's mcp.json.${delMaquina ? ` ${delMaquina}` : ""}${delEnv ? ` ${delEnv}` : ""}`,
  },
  "CONFIG-RUTA-NO-EXISTE": {
    es: ({ variable, ruta, fuente }: { variable: string; ruta: string; fuente?: string }) =>
      fuente === "machine.json"
        ? `${variable} apunta a "${ruta}", que no existe en este equipo. Corrige la ruta en machine.json.`
        : `${variable} apunta a "${ruta}", que no existe en este equipo. Corrige la ruta en el .env. ` +
          `Si lleva acentos, revisa que el .env esté guardado en UTF-8: en otra codificación los ` +
          `acentos llegan rotos y la carpeta parece no existir.`,
    en: ({ variable, ruta, fuente }: { variable: string; ruta: string; fuente?: string }) =>
      fuente === "machine.json"
        ? `${variable} points to "${ruta}", which does not exist on this machine. Fix the path in machine.json.`
        : `${variable} points to "${ruta}", which does not exist on this machine. Fix the path in the .env. ` +
          `If it has accented characters, check that the .env is saved as UTF-8: in any other encoding the ` +
          `accents arrive broken and the folder seems not to exist.`,
  },
  "CONFIG-RUTA-ES-ARCHIVO": {
    es: ({ variable, ruta }: { variable: string; ruta: string }) => `${variable} apunta a "${ruta}", que es un archivo y no una carpeta.`,
    en: ({ variable, ruta }: { variable: string; ruta: string }) => `${variable} points to "${ruta}", which is a file, not a folder.`,
  },
  "CONFIG-MAQUINA-EN-MEMORIA": {
    es: ({ error }: { error: string }) => `machine.json dejó de ser válido: se siguen usando sus valores de la última lectura buena hasta que lo arregles. ${error}`,
    en: ({ error }: { error: string }) => `machine.json stopped being valid: the values from the last good read keep being used until you fix it. ${error}`,
  },
  // index.ts (el log al arrancar)
  "CONFIG-ARRANQUE-SIN-CONFIGURAR": {
    es: ({ detalle }: Detalle) => `SIN CONFIGURAR: ${detalle}`,
    en: ({ detalle }: Detalle) => `NOT CONFIGURED: ${detalle}`,
  },

  // ─── paths.ts ───────────────────────────────────────────────────────────────
  "RUTA-SEGMENTO-INVALIDO": {
    es: ({ campo, valor, regla }: { campo: string; valor: string; regla: string }) =>
      `${campo} ${JSON.stringify(valor)} no es válido: ${regla}. Tiene que ser un solo nombre de ` +
      `carpeta o archivo, que funcione igual en Windows, macOS y Linux.`,
    en: ({ campo, valor, regla }: { campo: string; valor: string; regla: string }) =>
      `${campo} ${JSON.stringify(valor)} is not valid: ${regla}. It has to be a single folder ` +
      `or file name that works the same on Windows, macOS and Linux.`,
  },
  "RUTA-REGLA-VACIO": { es: "está vacío", en: "it is empty" },
  "RUTA-REGLA-PUNTOS": {
    es: ({ valor }: { valor: string }) => `no puede ser "${valor}"`,
    en: ({ valor }: { valor: string }) => `it cannot be "${valor}"`,
  },
  "RUTA-REGLA-SEPARADOR": { es: "no puede llevar / ni \\", en: "it cannot contain / or \\" },
  "RUTA-REGLA-CONTROL": { es: "no puede llevar caracteres de control", en: "it cannot contain control characters" },
  "RUTA-REGLA-RESERVADOS": { es: 'no puede llevar ninguno de < > : " | ? *', en: 'it cannot contain any of < > : " | ? *' },
  "RUTA-REGLA-FINAL": { es: "no puede terminar en punto ni en espacio", en: "it cannot end with a period or a space" },
  "RUTA-REGLA-NOMBRE-WINDOWS": {
    es: "es un nombre reservado de Windows (CON, PRN, AUX, NUL, CONIN$, CONOUT$, COM1–COM9, LPT1–LPT9)",
    en: "it is a reserved Windows name (CON, PRN, AUX, NUL, CONIN$, CONOUT$, COM1–COM9, LPT1–LPT9)",
  },
  "RUTA-NOMBRE-CON-PUNTO": {
    es: ({ campo, valor }: { campo: string; valor: string }) =>
      `${campo} ${JSON.stringify(valor)} no es válido: no puede empezar por punto. Las carpetas ` +
      `con punto no cuentan como proyecto ni como tarea, así que no se vería después.`,
    en: ({ campo, valor }: { campo: string; valor: string }) =>
      `${campo} ${JSON.stringify(valor)} is not valid: it cannot start with a period. Folders ` +
      `starting with a period do not count as a project or a task, so it would not show up afterwards.`,
  },
  "RUTA-PROYECTOS-NINGUNO": { es: "(ninguno todavía)", en: "(none yet)" },
  "RUTA-PROYECTOS-ILEGIBLES": {
    es: "(no se pudieron leer: revisa PHASE_GATE_DOCS_PATH)",
    en: "(could not be read: check PHASE_GATE_DOCS_PATH)",
  },
  "RUTA-PROYECTO-NO-EXISTE": {
    es: ({ proyecto, disponibles }: { proyecto: string; disponibles: string }) =>
      `No existe el proyecto "${proyecto}". Los proyectos disponibles son: ${disponibles}.`,
    en: ({ proyecto, disponibles }: { proyecto: string; disponibles: string }) =>
      `The project "${proyecto}" does not exist. The available projects are: ${disponibles}.`,
  },
  "RUTA-RELATIVA-ABSOLUTA": {
    es: ({ campo, valor, relativaA }: { campo: string; valor: string; relativaA: string }) =>
      `${campo} no puede ser una ruta absoluta ("${valor}"): es relativo a ${relativaA}.`,
    en: ({ campo, valor, relativaA }: { campo: string; valor: string; relativaA: string }) =>
      `${campo} cannot be an absolute path ("${valor}"): it is relative to ${relativaA}.`,
  },
  "RUTA-RELATIVA-A-TAREA": { es: "la carpeta de la tarea", en: "the task folder" },
  "RUTA-RELATIVA-A-DOCS": { es: "la Documentación Central", en: "the Central Documentation" },
  "RUTA-FUERA-DE-TAREA": {
    es: ({ fileName, carpetaTarea }: { fileName: string; carpetaTarea: string }) =>
      `Acceso denegado: file_name "${fileName}" queda fuera de la carpeta de la tarea ${carpetaTarea}.`,
    en: ({ fileName, carpetaTarea }: { fileName: string; carpetaTarea: string }) =>
      `Access denied: file_name "${fileName}" falls outside the task folder ${carpetaTarea}.`,
  },
  "RUTA-FUERA-DE-DOCS": {
    es: ({ docsBase }: { docsBase: string }) => `Acceso denegado: file_path queda fuera de ${docsBase}.`,
    en: ({ docsBase }: { docsBase: string }) => `Access denied: file_path falls outside ${docsBase}.`,
  },
  "RUTA-FALTAN-ARGUMENTOS": {
    es: "Debes proporcionar (project + task_name + file_name) o bien file_path.",
    en: "You must provide either (project + task_name + file_name) or file_path.",
  },
  "RUTA-FUERA-DE-REPO": {
    es: ({ filePath, repoName }: { filePath: string; repoName: string }) =>
      `Acceso denegado: file_path "${filePath}" queda fuera del repositorio ${repoName}.`,
    en: ({ filePath, repoName }: { filePath: string; repoName: string }) =>
      `Access denied: file_path "${filePath}" falls outside the repository ${repoName}.`,
  },
  "RUTA-ENTRA-EN-GIT": {
    es: ({ filePath }: { filePath: string }) => `file_path no puede entrar en .git ni leer archivos de git ("${filePath}").`,
    en: ({ filePath }: { filePath: string }) => `file_path cannot enter .git or read git files ("${filePath}").`,
  },
  "RUTA-GIT-POR-ENLACE": {
    es: ({ filePath }: { filePath: string }) => `Acceso denegado: file_path "${filePath}" lleva a .git a través de un enlace.`,
    en: ({ filePath }: { filePath: string }) => `Access denied: file_path "${filePath}" leads to .git through a link.`,
  },
  "RUTA-ES-CARPETA": {
    es: ({ ruta }: { ruta: string }) => `${ruta} no es un archivo: es una carpeta.`,
    en: ({ ruta }: { ruta: string }) => `${ruta} is not a file: it is a folder.`,
  },
  "RUTA-NO-ES-ARCHIVO-NORMAL": {
    es: ({ ruta }: { ruta: string }) => `${ruta} no es un archivo normal: es una carpeta, un dispositivo o una tubería.`,
    en: ({ ruta }: { ruta: string }) => `${ruta} is not a regular file: it is a folder, a device or a pipe.`,
  },
  "RUTA-DEMASIADO-GRANDE": {
    es: ({ ruta, bytes, limite }: { ruta: string; bytes: number; limite: number }) =>
      `${ruta} pesa ${bytes} bytes y el límite de lectura es 1 MB (${limite} bytes).`,
    en: ({ ruta, bytes, limite }: { ruta: string; bytes: number; limite: number }) =>
      `${ruta} is ${bytes} bytes and the read limit is 1 MB (${limite} bytes).`,
  },
  "RUTA-CRECIO": {
    es: ({ ruta, limite }: { ruta: string; limite: number }) =>
      `${ruta} creció mientras se leía y pasa del límite de lectura de 1 MB (${limite} bytes).`,
    en: ({ ruta, limite }: { ruta: string; limite: number }) =>
      `${ruta} grew while it was being read and exceeds the 1 MB read limit (${limite} bytes).`,
  },
  "RUTA-BINARIO": {
    es: ({ ruta, bytes }: { ruta: string; bytes: number }) =>
      `${ruta} parece binario: tiene un byte NUL en sus primeros ${bytes} bytes. ` + `Estas tools solo leen texto.`,
    en: ({ ruta, bytes }: { ruta: string; bytes: number }) =>
      `${ruta} looks binary: it has a NUL byte in its first ${bytes} bytes. ` + `These tools only read text.`,
  },

  // ─── manifiesto.ts ──────────────────────────────────────────────────────────
  "MANIFIESTO-TXT-RAIZ": { es: "(raíz)", en: "(root)" },
  "MANIFIESTO-TXT-FALTA": { es: "falta", en: "missing" },
  "MANIFIESTO-TXT-CLAVE-DESCONOCIDA": {
    es: ({ claves }: { claves: string[] }) => `clave desconocida ${claves.map((clave) => `"${clave}"`).join(", ")}`,
    en: ({ claves }: { claves: string[] }) => `${claves.length === 1 ? "unknown key" : "unknown keys"} ${claves.map((clave) => `"${clave}"`).join(", ")}`,
  },
  "MANIFIESTO-TXT-TIPO": {
    es: ({ tipo }: { tipo: string | undefined }) => `debe ser de tipo ${tipo}`,
    en: ({ tipo }: { tipo: string | undefined }) => `must be of type ${tipo}`,
  },
  "MANIFIESTO-TXT-CLAVE-MAQUINA": {
    es: `la clave no tiene la forma "<PROYECTO>/<id del repo>" (el id, en minúsculas, números y guiones)`,
    en: `the key is not of the form "<PROJECT>/<repo id>" (the id, in lowercase letters, digits and hyphens)`,
  },
  "MANIFIESTO-TXT-VALOR": {
    es: ({ valores }: { valores: unknown[] }) => `debe ser ${valores.map((valor) => JSON.stringify(valor)).join(" o ")}`,
    en: ({ valores }: { valores: unknown[] }) => `must be ${valores.map((valor) => JSON.stringify(valor)).join(" or ")}`,
  },
  "MANIFIESTO-TXT-VACIO": { es: "no puede estar vacío", en: "cannot be empty" },
  "MANIFIESTO-TXT-CORTO": {
    es: ({ minimo }: { minimo: string }) => `es demasiado corto (mínimo ${minimo})`,
    en: ({ minimo }: { minimo: string }) => `is too short (minimum ${minimo})`,
  },
  "MANIFIESTO-TXT-LARGO": {
    es: ({ maximo }: { maximo: string }) => `es demasiado largo (máximo ${maximo})`,
    en: ({ maximo }: { maximo: string }) => `is too long (maximum ${maximo})`,
  },
  "MANIFIESTO-TXT-FORMATO": { es: "no tiene el formato esperado", en: "does not have the expected format" },
  "MANIFIESTO-TXT-ID-DE-REPO": {
    es: "El id de un repo va en minúsculas, números y guiones (ej. 'api', 'front-web').",
    en: "A repo id uses lowercase letters, digits and hyphens (e.g. 'api', 'front-web').",
  },
  "MANIFIESTO-TXT-PRESET-SOFTWARE": {
    es: "Los prompts de fábrica, sin bloques: código con o sin suite de pruebas.",
    en: "The factory prompts, with no blocks: code with or without a test suite.",
  },
  "MANIFIESTO-TXT-DIR-ABSOLUTO": {
    es: "no puede ser una ruta absoluta: es relativo a PHASE_GATE_REPOS_PATH (para otra ubicación, usa machine.json)",
    en: "cannot be an absolute path: it is relative to PHASE_GATE_REPOS_PATH (for another location, use machine.json)",
  },
  "MANIFIESTO-TXT-INVALIDO": {
    es: ({ archivo, proyecto, ruta, error }: { archivo: string; proyecto: string; ruta: string; error: string }) =>
      `${archivo} de ${proyecto} no es válido (${ruta}): ${error}`,
    en: ({ archivo, proyecto, ruta, error }: { archivo: string; proyecto: string; ruta: string; error: string }) =>
      `${archivo} of ${proyecto} is not valid (${ruta}): ${error}`,
  },
  "MANIFIESTO-TXT-JSON-INVALIDO": {
    es: ({ detalle }: Detalle) => `no es un JSON válido (${detalle}).`,
    en: ({ detalle }: Detalle) => `is not valid JSON (${detalle}).`,
  },
  "MANIFIESTO-TXT-ID-REPETIDO": {
    es: ({ i, id }: { i: number; id: string }) => `repos[${i}].id: el id "${id}" está repetido.`,
    en: ({ i, id }: { i: number; id: string }) => `repos[${i}].id: the id "${id}" is repeated.`,
  },
  "MANIFIESTO-TXT-PRESET-NO-EXISTE": {
    es: ({ preset, disponibles }: { preset: string; disponibles: string }) =>
      `preset: no existe el preset "${preset}". Los disponibles son: ${disponibles}.`,
    en: ({ preset, disponibles }: { preset: string; disponibles: string }) =>
      `preset: the preset "${preset}" does not exist. The available ones are: ${disponibles}.`,
  },
  "IDIOMA-CON-TAREAS": {
    es: ({ proyecto, idioma, archivo, tareas, otro }: { proyecto: string; idioma: string; archivo: string; tareas: string[]; otro: string }) => {
      const una = tareas.length === 1;
      const lista = tareas.map((t) => `«${t}»`).join(", ");
      return (
        `${proyecto} declara "idioma": "${idioma}" en su ${archivo}, pero ${una ? "la tarea" : "las tareas"} ${lista} ` +
        `${una ? "tiene" : "tienen"} documentos en "${otro}": la deducción ${una ? "la daría" : "las daría"} por sin documentos. ` +
        `Devuelve el manifiesto a "${otro}" o renombra esas carpetas a mano.`
      );
    },
    en: ({ proyecto, idioma, archivo, tareas, otro }: { proyecto: string; idioma: string; archivo: string; tareas: string[]; otro: string }) => {
      const una = tareas.length === 1;
      const lista = tareas.map((t) => `«${t}»`).join(", ");
      return (
        `${proyecto} declares "idioma": "${idioma}" in its ${archivo}, but ${una ? "the task" : "the tasks"} ${lista} ` +
        `${una ? "has" : "have"} documents in "${otro}": phase detection would treat ${una ? "it" : "them"} as having no documents. ` +
        `Set the manifest back to "${otro}" or rename those folders by hand.`
      );
    },
  },
  "IDIOMA-MIXTO": {
    es: ({ proyecto, es, en, idioma, archivo }: { proyecto: string; es: number; en: number; idioma: string; archivo: string }) =>
      `${proyecto} tiene documentos en los dos idiomas (${es} en "es", ${en} en "en"): ` +
      `se usa "${idioma}", el que más tiene. Fija "idioma" en su ${archivo}.`,
    en: ({ proyecto, es, en, idioma, archivo }: { proyecto: string; es: number; en: number; idioma: string; archivo: string }) =>
      `${proyecto} has documents in both languages (${es} in "es", ${en} in "en"): ` +
      `"${idioma}" is used, the one with the most. Set "idioma" in its ${archivo}.`,
  },
  "MANIFIESTO-SIN-IDIOMA": {
    es: ({ proyecto, archivo, idioma, origen }: { proyecto: string; archivo: string; idioma: string; origen: string }) =>
      `El ${archivo} de ${proyecto} no declara "idioma" y sus documentos no lo dicen: se usa "${idioma}" ` +
      `(${origen === "del manifiesto sin idioma" ? "un manifiesto sin idioma es español, como en la 3.0 y la 3.1" : origen}). ` +
      `Ese idioma puede cambiar en otro equipo. Añade "idioma" a su ${archivo}, o ejecuta \`init --migrate\`.`,
    en: ({ proyecto, archivo, idioma, origen }: { proyecto: string; archivo: string; idioma: string; origen: string }) =>
      `The ${archivo} of ${proyecto} does not declare "idioma" and its documents don't say either: "${idioma}" is used ` +
      `(${ORIGENES_EN[origen] ?? origen}). That language can change on another machine. Add "idioma" to its ${archivo}, or run \`init --migrate\`.`,
  },
  "MAQUINA-TXT-RUTA-ABSOLUTA": { es: "tiene que ser una ruta absoluta", en: "must be an absolute path" },
  "MAQUINA-TXT-INVALIDA": {
    es: ({ archivo, ruta, error }: { archivo: string; ruta: string; error: string }) => `${archivo} no es válido (${ruta}): ${error}`,
    en: ({ archivo, ruta, error }: { archivo: string; ruta: string; error: string }) => `${archivo} is not valid (${ruta}): ${error}`,
  },
  "MAQUINA-TXT-SINTAXIS": {
    es: ({ linea, columna, caracter }: { linea: number; columna: number; caracter: string | null }) =>
      `no es un JSON válido: ${caracter === null ? "el archivo termina antes de tiempo" : `carácter inesperado «${caracter}»`} (línea ${linea}, columna ${columna}).`,
    en: ({ linea, columna, caracter }: { linea: number; columna: number; caracter: string | null }) =>
      `is not valid JSON: ${caracter === null ? "the file ends too soon" : `unexpected character «${caracter}»`} (line ${linea}, column ${columna}).`,
  },
  "MAQUINA-CLAVE-DUPLICADA": {
    es: ({ ruta, clave }: { ruta: string; clave: string }) =>
      `${ruta}: la clave "${clave}" coincide con otra anterior sin distinguir mayúsculas en el proyecto; vale la primera.`,
    en: ({ ruta, clave }: { ruta: string; clave: string }) =>
      `${ruta}: the key "${clave}" matches an earlier one when the project's case is ignored; the first one applies.`,
  },

  // ─── repos.ts ───────────────────────────────────────────────────────────────
  "REPOS-SIN-REPOS": {
    es: ({ proyecto }: { proyecto: string }) =>
      `El proyecto ${proyecto} no declara repos en su phase-gate.json. Para leer cualquier carpeta de ` +
      `PHASE_GATE_REPOS_PATH, usa read_cross_repo.`,
    en: ({ proyecto }: { proyecto: string }) =>
      `The project ${proyecto} declares no repos in its phase-gate.json. To read any folder of ` +
      `PHASE_GATE_REPOS_PATH, use read_cross_repo.`,
  },
  "REPOS-NO-EXISTE": {
    es: ({ id, proyecto, ids }: { id: string; proyecto: string; ids: string[] }) =>
      `No existe el repo "${id}" en el phase-gate.json de ${proyecto}. Los repos son: ${ids.join(", ")}.`,
    en: ({ id, proyecto, ids }: { id: string; proyecto: string; ids: string[] }) =>
      `The repo "${id}" does not exist in the phase-gate.json of ${proyecto}. The repos are: ${ids.join(", ")}.`,
  },
  "REPOS-SIN-RUTA": {
    es: ({ id, error }: { id: string; error: string | null }) => `No se pudo resolver la ruta del repo "${id}": ${error}`,
    en: ({ id, error }: { id: string; error: string | null }) => `Could not resolve the path of the repo "${id}": ${error}`,
  },
  "REPOS-RUTA-NO-EXISTE": {
    es: ({ id, proyecto, ruta }: { id: string; proyecto: string; ruta: string }) =>
      `El repo "${id}" de ${proyecto} apunta a "${ruta}", que no existe en este equipo. Corrige su ` +
      `dir en phase-gate.json, o su ruta en machine.json ("${proyecto}/${id}").`,
    en: ({ id, proyecto, ruta }: { id: string; proyecto: string; ruta: string }) =>
      `The repo "${id}" of ${proyecto} points to "${ruta}", which does not exist on this machine. Fix its ` +
      `dir in phase-gate.json, or its path in machine.json ("${proyecto}/${id}").`,
  },
  "REPOS-PATH-ABSOLUTA": {
    es: ({ relativa }: { relativa: string }) => `\`path\` no puede ser una ruta absoluta ("${relativa}"): es relativa a la raíz del repo.`,
    en: ({ relativa }: { relativa: string }) => `\`path\` cannot be an absolute path ("${relativa}"): it is relative to the root of the repo.`,
  },
  "REPOS-PATH-EN-GIT": {
    es: ({ relativa }: { relativa: string }) => `\`path\` no puede entrar en .git ni leer archivos de git ("${relativa}").`,
    en: ({ relativa }: { relativa: string }) => `\`path\` cannot enter .git or read git files ("${relativa}").`,
  },
  "REPOS-PATH-FUERA": {
    es: ({ relativa }: { relativa: string }) => `Acceso denegado: \`path\` "${relativa}" queda fuera del repositorio.`,
    en: ({ relativa }: { relativa: string }) => `Access denied: \`path\` "${relativa}" falls outside the repository.`,
  },
  "REPOS-PATH-GIT-POR-ENLACE": {
    es: ({ relativa }: { relativa: string }) => `Acceso denegado: \`path\` "${relativa}" lleva a .git a través de un enlace.`,
    en: ({ relativa }: { relativa: string }) => `Access denied: \`path\` "${relativa}" leads to .git through a link.`,
  },
  "REPOS-LINEA-SIN-RUTA": {
    es: ({ nombre, error }: { nombre: string; error: string | null }) => `${nombre}: sin ruta (${error ?? "no se pudo resolver"})`,
    en: ({ nombre, error }: { nombre: string; error: string | null }) => `${nombre}: no path (${error ?? "could not be resolved"})`,
  },
  "REPOS-LINEA-NO-EXISTE": {
    es: ({ nombre, ruta }: { nombre: string; ruta: string }) => `${nombre}: \`${ruta}\` no existe en este equipo`,
    en: ({ nombre, ruta }: { nombre: string; ruta: string }) => `${nombre}: \`${ruta}\` does not exist on this machine`,
  },
  "REPOS-LINEA-NO-ES-GIT": {
    es: ({ nombre, ruta }: { nombre: string; ruta: string }) => `${nombre}: \`${ruta}\` no es un repositorio de git`,
    en: ({ nombre, ruta }: { nombre: string; ruta: string }) => `${nombre}: \`${ruta}\` is not a git repository`,
  },
  "REPOS-LINEA-SEPARADO": { es: "separado (detached)", en: "detached" },
  "REPOS-LINEA-RAMA": {
    es: ({ rama }: { rama: string | null }) => `rama ${rama}`,
    en: ({ rama }: { rama: string | null }) => `branch ${rama}`,
  },
  "REPOS-LINEA-SIN-COMMITS": { es: "sin commits", en: "no commits" },
  "REPOS-LINEA-ADELANTE": {
    es: ({ n }: { n: number }) => `${n} adelante`,
    en: ({ n }: { n: number }) => `${n} ahead`,
  },
  "REPOS-LINEA-ATRAS": {
    es: ({ n }: { n: number }) => `${n} atrás`,
    en: ({ n }: { n: number }) => `${n} behind`,
  },
  "REPOS-ARBOL-LIMPIO": { es: "árbol limpio", en: "clean tree" },
  "REPOS-CAMBIOS-SIN-COMMIT": {
    es: ({ n }: { n: number }) => `${n} ${n === 1 ? "cambio" : "cambios"} sin commit`,
    en: ({ n }: { n: number }) => `${n} uncommitted ${n === 1 ? "change" : "changes"}`,
  },
  "REPOS-LINEA-SIN-SEGUIMIENTO": {
    es: ({ n }: { n: number }) => `${n} sin seguimiento`,
    en: ({ n }: { n: number }) => `${n} untracked`,
  },
  "REPOS-COLUMNA-SIN-GIT": { es: " · sin git", en: " · no git" },
  "REPOS-COLUMNA-SEPARADO": {
    es: ({ head }: { head: string }) => `separado en \`${head}\``,
    en: ({ head }: { head: string }) => `detached at \`${head}\``,
  },
  "REPOS-COLUMNA-RAMA": {
    es: ({ rama }: { rama: string | null }) => `rama \`${rama}\``,
    en: ({ rama }: { rama: string | null }) => `branch \`${rama}\``,
  },

  // ─── roots.ts ───────────────────────────────────────────────────────────────
  "ROOTS-TXT-OYENTE-FALLO": {
    es: ({ detalle }: Detalle) => `Un oyente de las raíces falló: ${detalle}`,
    en: ({ detalle }: Detalle) => `A roots listener failed: ${detalle}`,
  },
  "ROOTS-TXT-RAIZ-DESCARTADA": {
    es: ({ uri, detalle }: { uri: string; detalle: string }) => `Se descarta la raíz ${uri}: ${detalle}`,
    en: ({ uri, detalle }: { uri: string; detalle: string }) => `The root ${uri} is discarded: ${detalle}`,
  },
  "ROOTS-TXT-SIN-RAICES": {
    es: ({ detalle }: Detalle) => `No se pudieron pedir las raíces al cliente: ${detalle}`,
    en: ({ detalle }: Detalle) => `Could not request the roots from the client: ${detalle}`,
  },
  "ROOTS-TXT-SIN-DEDUCCION": {
    es: ({ detalle }: Detalle) => `No se pudo deducir el proyecto de las raíces: ${detalle}`,
    en: ({ detalle }: Detalle) => `Could not deduce the project from the roots: ${detalle}`,
  },
  "ROOTS-TXT-MOTIVO-ES-REPO": {
    es: ({ raiz, repo, proyecto }: { raiz: string; repo: string; proyecto: string }) => `la carpeta abierta \`${raiz}\` es el repo \`${repo}\` de ${proyecto}`,
    en: ({ raiz, repo, proyecto }: { raiz: string; repo: string; proyecto: string }) => `the open folder \`${raiz}\` is the repo \`${repo}\` of ${proyecto}`,
  },
  "ROOTS-TXT-MOTIVO-CONTIENE-REPO": {
    es: ({ raiz, repo, proyecto }: { raiz: string; repo: string; proyecto: string }) =>
      `la carpeta abierta \`${raiz}\` contiene el repo \`${repo}\` de ${proyecto}`,
    en: ({ raiz, repo, proyecto }: { raiz: string; repo: string; proyecto: string }) =>
      `the open folder \`${raiz}\` contains the repo \`${repo}\` of ${proyecto}`,
  },
  "ROOTS-TXT-MOTIVO-EN-DOCS": {
    es: ({ raiz, proyecto }: { raiz: string; proyecto: string }) => `la carpeta abierta \`${raiz}\` está en la carpeta de ${proyecto} de la Documentación`,
    en: ({ raiz, proyecto }: { raiz: string; proyecto: string }) => `the open folder \`${raiz}\` is inside the folder of ${proyecto} in the Documentation`,
  },
  "ROOTS-TXT-DEDUCIDO": {
    es: ({ proyecto, motivo }: { proyecto: string; motivo: string }) => `Proyecto deducido de la carpeta abierta: ${proyecto} (${motivo}).`,
    en: ({ proyecto, motivo }: { proyecto: string; motivo: string }) => `Project deduced from the open folder: ${proyecto} (${motivo}).`,
  },
  "ROOTS-TXT-AMBIGUO": {
    es: ({ candidatos }: { candidatos: string[] }) =>
      `No sé en qué proyecto estás: la carpeta abierta coincide con varios (${candidatos.join(", ")}). Indica \`project\`.`,
    en: ({ candidatos }: { candidatos: string[] }) =>
      `I don't know which project you are in: the open folder matches several (${candidatos.join(", ")}). Specify \`project\`.`,
  },
  "ROOTS-TXT-SIN-PROYECTO": {
    es: "No sé en qué proyecto estás: indica `project`.",
    en: "I don't know which project you are in: specify `project`.",
  },

  // ─── confirmacion.ts ────────────────────────────────────────────────────────
  "CONFIRMACION-NOTA-OFF": {
    es:
      "Si tu cliente no te mostró la confirmación, regístralo con PHASE_GATE_ELICITATION=off y la confirmación " +
      "volverá a pedirse en el chat.",
    en:
      "If your client did not show you the confirmation, record that with PHASE_GATE_ELICITATION=off and the confirmation " +
      "will be asked in the chat again.",
  },
  "CONFIRMACION-NOTA-SIN-RESPUESTA": {
    es:
      "Tu cliente no respondió a dos confirmaciones seguidas, así que esta vez tampoco se escribe nada; durante el " +
      "resto de la sesión la confirmación vuelve a pedirse en el chat (con force).",
    en:
      "Your client did not answer two confirmations in a row, so nothing is written this time either; for the " +
      "rest of the session the confirmation is asked in the chat again (with force).",
  },
  "CONFIRMACION-NOTA-CANCELADA": {
    es: "El cliente canceló la llamada antes de que el usuario respondiera.",
    en: "The client cancelled the call before the user answered.",
  },
  "CONFIRMACION-NOTA-NO-IMPLEMENTA": {
    es:
      "Tu cliente anuncia confirmaciones directas pero no las implementa: durante el resto de la sesión la " +
      "confirmación vuelve a pedirse en el chat (con force).",
    en:
      "Your client announces direct confirmations but does not implement them: for the rest of the session the " +
      "confirmation is asked in the chat again (with force).",
  },
  "CONFIRMACION-CASILLA": {
    es: "Marca la casilla y acepta para confirmar.",
    en: "Tick the box and accept to confirm.",
  },
  "CONFIRMACION-LOG-VENCIDAS": {
    es: "El cliente dejó vencer dos confirmaciones seguidas; se desactivan para el resto de la sesión.",
    en: "The client let two confirmations in a row time out; they are disabled for the rest of the session.",
  },
  "CONFIRMACION-LOG-NO-IMPLEMENTA": {
    es: ({ detalle }: Detalle) => `El cliente anuncia elicitation pero no la implementa (${detalle}); se desactiva para la sesión.`,
    en: ({ detalle }: Detalle) => `The client announces elicitation but does not implement it (${detalle}); it is disabled for the session.`,
  },
  "CONFIRMACION-LOG-FALLO": {
    es: ({ detalle }: Detalle) => `La confirmación falló y se trata como un no: ${detalle}`,
    en: ({ detalle }: Detalle) => `The confirmation failed and is treated as a no: ${detalle}`,
  },

  // ─── recursos.ts ────────────────────────────────────────────────────────────
  "RECURSO-URI-MAL-CODIFICADA": {
    es: ({ nombre, valor }: { nombre: string; valor: string }) =>
      `URI mal codificada: la parte "${nombre}" (${valor}) no es una codificación porcentual válida.`,
    en: ({ nombre, valor }: { nombre: string; valor: string }) =>
      `Badly encoded URI: the part "${nombre}" (${valor}) is not a valid percent-encoding.`,
  },
  "RECURSO-CON-PUNTO": {
    es: "Los archivos y carpetas que empiezan por punto no se exponen como recursos.",
    en: "Files and folders that start with a period are not exposed as resources.",
  },
  "RECURSO-TAREA-NO-EXISTE": {
    es: ({ tarea, proyecto }: { tarea: string; proyecto: string }) => `No existe la tarea "${tarea}" en ${proyecto}.`,
    en: ({ tarea, proyecto }: { tarea: string; proyecto: string }) => `The task "${tarea}" does not exist in ${proyecto}.`,
  },
  "RECURSO-FUERA-DE-TAREA": {
    es: ({ carpetaTarea }: { carpetaTarea: string }) => `Acceso denegado: el recurso queda fuera de la carpeta de la tarea ${carpetaTarea}.`,
    en: ({ carpetaTarea }: { carpetaTarea: string }) => `Access denied: the resource falls outside the task folder ${carpetaTarea}.`,
  },
  "RECURSO-ARCHIVO-NO-EXISTE": {
    es: ({ archivo, tarea, proyecto }: { archivo: string; tarea: string; proyecto: string }) => `No existe "${archivo}" en la tarea "${tarea}" de ${proyecto}.`,
    en: ({ archivo, tarea, proyecto }: { archivo: string; tarea: string; proyecto: string }) => `"${archivo}" does not exist in the task "${tarea}" of ${proyecto}.`,
  },
  "RECURSO-SIN-SUBCARPETA-DE-RECIBOS": {
    es: "No existe ninguna fase que declare una subcarpeta de recibos.",
    en: "No phase declares a receipts subfolder.",
  },
  "RECURSO-SIN-FASES": { es: "No se encontró ningún prompt de fase.", en: "No phase prompt was found." },
  "RECURSO-TABLA-DE-FASES": {
    es: "| Fase | Título | Documento | Recibos | Capa | Archivo |",
    en: "| Phase | Title | Document | Receipts | Layer | File |",
  },
  "RECURSO-CONFIGURACION-DE": {
    es: ({ proyecto }: { proyecto: string }) => `Configuración de ${proyecto}`,
    en: ({ proyecto }: { proyecto: string }) => `Configuration of ${proyecto}`,
  },
  "RECURSO-ESTADO-TITULO": { es: "Estado de mcp-phase-gate", en: "mcp-phase-gate status" },
  "RECURSO-ESTADO-DESCRIPCION": {
    es: "Radiografía de la instalación: variables, prompts, proyectos con su tarea activa y avisos.",
    en: "An X-ray of the installation: variables, prompts, projects with their active task, and warnings.",
  },
  "RECURSO-FASES-TITULO": { es: "Fases disponibles", en: "Available phases" },
  "RECURSO-FASES-DESCRIPCION": {
    es: "Número, título, documento, subcarpeta de recibos y archivo de prompt que gana en cada fase.",
    en: "Number, title, document, receipts subfolder and winning prompt file of each phase.",
  },
  "RECURSO-CONFIGURACION-TITULO": { es: "Configuración de un proyecto", en: "Project configuration" },
  "RECURSO-CONFIGURACION-DESCRIPCION": {
    es: "El manifiesto efectivo de un proyecto, de dónde sale cada valor (preset, reglas) y el estado de sus repos en este equipo.",
    en: "The effective manifest of a project, where each value comes from (preset, rules) and the status of its repos on this machine.",
  },
  "RECURSO-RECIBO-TITULO": { es: "Recibo de lote", en: "Batch receipt" },
  "RECURSO-RECIBO-DESCRIPCION": {
    es: "Un recibo de lote de la Fase 4, en la subcarpeta que declara su prompt.",
    en: "A Phase 4 batch receipt, in the subfolder its prompt declares.",
  },
  "RECURSO-DOCUMENTO-TITULO": { es: "Documento de una tarea", en: "Task document" },
  "RECURSO-DOCUMENTO-DESCRIPCION": {
    es: "Un archivo de la carpeta de una tarea: el contexto inicial o el documento de una fase.",
    en: "A file in a task folder: the initial context or a phase document.",
  },

  // ─── sesiones.ts ────────────────────────────────────────────────────────────
  "SESION-CLIENTE-SIN-NOMBRE": { es: "cliente sin nombre", en: "unnamed client" },
  "SESION-NO-REGISTRADA": {
    es: ({ detalle }: Detalle) => `No se pudo registrar la sesión para el Studio: ${detalle}`,
    en: ({ detalle }: Detalle) => `Could not register the session for the Studio: ${detalle}`,
  },
} satisfies Catalogo;
