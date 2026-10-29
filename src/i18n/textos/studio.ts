// Mensajes del grupo «studio» (ver i18n/mensajes.ts): lo que la API del Studio dice por su cuenta (sus
// errores, los títulos de la Bitácora, el asistente de clientes y las acciones con huella). El español es el
// texto de siempre, byte a byte; el inglés, una redacción natural con el glosario de docs/glosario.md.
//
// Salen en el idioma de la interfaz: el frontend lo manda en cada petición (X-Phase-Gate-Lang) y el
// servidor atiende la petición dentro de `enIdioma` (studio/servidor.ts). Los identificadores no se
// traducen: nombres de presets, claves del manifiesto (`lotes`, `commits`), ids de lote y de ranura.

import type { EstadoLote } from "../../recibos.js";
import { VOCABULARIO } from "../../vocabulario.js";
import type { Catalogo } from "./tipos.js";

// El nombre de un parámetro de la API ("proyecto", "tarea"), dicho en inglés.
const CAMPO_EN: Record<string, string> = { proyecto: "project", tarea: "task" };
const campoEn = (campo: string): string => CAMPO_EN[campo] ?? campo;

// El estado canónico de un recibo, tal como se dice en inglés.
const estadoEn = (estado: string): string => VOCABULARIO.en.recibo.estados[estado as EstadoLote] ?? estado;

const faseEs = (numero: number): string => (numero === 0 ? "00" : `Fase ${numero}`);
const faseEn = (numero: number): string => (numero === 0 ? "00" : `Phase ${numero}`);

export const TEXTOS_STUDIO = {
  // ─── El filtro de seguridad de studio/servidor.ts ───
  // Antes de que la petición diga su idioma: salen en el del proceso (PHASE_GATE_LANG o el del sistema). El
  // filtro no lee la cabecera de idioma (hallazgo 9 de la auditoría de la Etapa 6).
  "STUDIO-FILTRO-CUERPO-GRANDE": {
    es: (p: { kb: number }) => `El cuerpo pasa de ${p.kb} kB.`,
    en: (p: { kb: number }) => `The body is larger than ${p.kb} kB.`,
  },
  "STUDIO-FILTRO-CUERPO-ILEGIBLE": { es: "El cuerpo no se pudo leer.", en: "The body could not be read." },
  "STUDIO-FILTRO-HOST": {
    es: "Host no permitido: el Studio solo atiende en 127.0.0.1 y localhost, con su puerto.",
    en: "Host not allowed: the Studio only answers on 127.0.0.1 and localhost, with its port.",
  },
  "STUDIO-FILTRO-ORIGEN": { es: "Origen no permitido.", en: "Origin not allowed." },
  "STUDIO-FILTRO-MAL-FORMADA": { es: "Petición mal formada.", en: "Malformed request." },
  "STUDIO-FILTRO-ENLACE-USADO": {
    es: "Este enlace no vale o ya se usó. Vuelve a lanzar `mcp-phase-gate ui` y abre el enlace nuevo.",
    en: "This link is not valid or was already used. Run `mcp-phase-gate ui` again and open the new link.",
  },
  "STUDIO-FILTRO-SIN-SESION": {
    es: "Falta la sesión: abre el enlace que imprimió `mcp-phase-gate ui`.",
    en: "There is no session: open the link that `mcp-phase-gate ui` printed.",
  },
  "STUDIO-FILTRO-SIN-CABECERA": { es: "Falta la cabecera X-Phase-Gate.", en: "The X-Phase-Gate header is missing." },
  "STUDIO-FILTRO-METODO": { es: "Método no permitido.", en: "Method not allowed." },
  "STUDIO-FILTRO-INTERNO": { es: "Error interno del Studio.", en: "Internal Studio error." },
  "STUDIO-EVENTOS-LLENO": {
    es: (p: { maximo: number }) => `Hay ${p.maximo} conexiones de eventos abiertas: cierra alguna pestaña del Studio.`,
    en: (p: { maximo: number }) => `There are ${p.maximo} event connections open: close some Studio tab.`,
  },

  // ─── `mcp-phase-gate ui` en la terminal: en el idioma de --idioma, o en el del proceso ───
  "UI-DEMO-GENERADA": {
    es: (p: { raiz: string }) => `Demo generada en ${p.raiz}.`,
    en: (p: { raiz: string }) => `Demo generated in ${p.raiz}.`,
  },
  "UI-DEMO-FALLO": {
    es: (p: { detalle: string }) => `No se pudo preparar la demo: ${p.detalle}`,
    en: (p: { detalle: string }) => `Could not prepare the demo: ${p.detalle}`,
  },
  "UI-PUERTO-OCUPADO": {
    es: (p: { puerto: number }) => `El puerto ${p.puerto} ya está en uso: elige otro con --puerto, o déjalo libre.`,
    en: (p: { puerto: number }) => `Port ${p.puerto} is already in use: pick another one with --puerto, or free it.`,
  },
  "UI-NO-ARRANCA": {
    es: (p: { detalle: string }) => `No se pudo arrancar el Studio: ${p.detalle}`,
    en: (p: { detalle: string }) => `Could not start the Studio: ${p.detalle}`,
  },
  "UI-EN-MARCHA": {
    es: (p: { url: string }) => `Studio de mcp-phase-gate en ${p.url}`,
    en: (p: { url: string }) => `mcp-phase-gate Studio at ${p.url}`,
  },
  "UI-ENLACE-UNA-VEZ": {
    es: "El enlace sirve una sola vez: ábrelo en tu navegador. Ctrl+C para cerrar.",
    en: "The link works only once: open it in your browser. Ctrl+C to close.",
  },
  "UI-SIN-NAVEGADOR": { es: "No se pudo abrir el navegador: copia el enlace.", en: "Could not open the browser: copy the link." },

  "STUDIO-MANIFIESTO-NO-VALDRIA": {
    es: (p: { error: string }) => `El phase-gate.json resultante no sería válido: ${p.error}.`,
    en: (p: { error: string }) => `The resulting phase-gate.json would not be valid: ${p.error}.`,
  },

  // ─── studio/demo.ts ───
  "DEMO-NO-VACIA": {
    es: (p: { destino: string }) => `${p.destino} no está vacía: la demo se genera en una carpeta nueva.`,
    en: (p: { destino: string }) => `${p.destino} is not empty: the demo is generated in a new folder.`,
  },
  "DEMO-NO-ES-DEMO": {
    es: (p: { raiz: string }) => `${p.raiz} no es una carpeta de demo: no se borra.`,
    en: (p: { raiz: string }) => `${p.raiz} is not a demo folder: it is not deleted.`,
  },

  // ─── studio/servidor.ts y el enrutado de studio/api.ts ───
  "STUDIO-JSON-INVALIDO": { es: "El cuerpo no es un JSON válido.", en: "The body is not valid JSON." },
  "STUDIO-RUTA-NO-EXISTE": { es: "No existe esa ruta de la API.", en: "That API route does not exist." },
  "STUDIO-ERROR-INTERNO-DEL-STUDIO": { es: "Error interno del Studio.", en: "Internal Studio error." },
  "STUDIO-SOLO-POST": { es: "Esta ruta solo admite POST.", en: "This route only accepts POST." },
  "STUDIO-SOLO-GET": { es: "Esta ruta solo admite GET.", en: "This route only accepts GET." },
  "STUDIO-ERROR-INTERNO": {
    es: (p: { detalle: string }) => `Error interno: ${p.detalle}`,
    en: (p: { detalle: string }) => `Internal error: ${p.detalle}`,
  },

  // ─── studio/api.ts: parámetros ───
  "STUDIO-CODIFICACION-INVALIDA": {
    es: (p: { campo: string }) => `${p.campo} no es una codificación porcentual válida.`,
    en: (p: { campo: string }) => `${campoEn(p.campo)} is not valid percent-encoding.`,
  },
  "STUDIO-EMPIEZA-POR-PUNTO": {
    es: (p: { campo: string }) => `${p.campo} no puede empezar por punto.`,
    en: (p: { campo: string }) => `${campoEn(p.campo)} cannot start with a dot.`,
  },
  "STUDIO-TAREA-NO-EXISTE": {
    es: (p: { tarea: string; proyecto: string }) => `No existe la tarea "${p.tarea}" en ${p.proyecto}.`,
    en: (p: { tarea: string; proyecto: string }) => `Task "${p.tarea}" does not exist in ${p.proyecto}.`,
  },
  "STUDIO-FALTA-ARCHIVO": { es: "Falta `archivo` (uno solo).", en: "Missing `archivo` (exactly one)." },
  "STUDIO-ARCHIVO-OCULTO": {
    es: "Acceso denegado: ese archivo lleva a .git o a un archivo oculto.",
    en: "Access denied: that file leads to .git or to a hidden file.",
  },
  "STUDIO-FASE-NO-ES-NUMERO": { es: "La fase es un número (ej. 3).", en: "The phase is a number (e.g. 3)." },
  "STUDIO-FASE-NO-EXISTE": {
    es: (p: { fase: number; proyecto: string; fases: string }) => `No existe la Fase ${p.fase} en ${p.proyecto}. Las fases son: ${p.fases}.`,
    en: (p: { fase: number; proyecto: string; fases: string }) => `Phase ${p.fase} does not exist in ${p.proyecto}. The phases are: ${p.fases}.`,
  },

  // ─── studio/api.ts: el tablero y la Bitácora ───
  "STUDIO-CONTEXTO-INICIAL": { es: "Contexto inicial", en: "Initial context" },
  "STUDIO-BITACORA-DOCUMENTO": {
    es: (p: { numero: number; titulo: string; documento: string }) => `${faseEs(p.numero)} · ${p.titulo}: ${p.documento}`,
    en: (p: { numero: number; titulo: string; documento: string }) => `${faseEn(p.numero)} · ${p.titulo}: ${p.documento}`,
  },
  "STUDIO-BITACORA-RECIBO": {
    es: (p: { lote: string; titulo: string; estado: string }) => `${p.lote} · ${p.titulo}: ${p.estado}`,
    en: (p: { lote: string; titulo: string; estado: string }) => `${p.lote} · ${p.titulo}: ${estadoEn(p.estado)}`,
  },
  "STUDIO-BITACORA-REANCLAJE": {
    es: (p: { lote: string; detalle: string }) => `${p.lote} reanclado: ${p.detalle}`,
    en: (p: { lote: string; detalle: string }) => `${p.lote} re-anchored: ${p.detalle}`,
  },
  "STUDIO-BITACORA-FASE-CERRADA": {
    es: (p: { numero: number; titulo: string; documento: string }) => `Fase ${p.numero} (${p.titulo}) cerrada: ${p.documento}`,
    en: (p: { numero: number; titulo: string; documento: string }) => `Phase ${p.numero} (${p.titulo}) closed: ${p.documento}`,
  },

  // ─── studio/api.ts: el asistente de clientes del Vigía ───
  "STUDIO-SIN-RUTAS": {
    es: "Faltan la Documentación y la carpeta de repos (o no existen): ni machine.json ni el entorno las dicen, y el servidor no sabría dónde buscar.",
    en: "The Documentation and the repos folder are missing (or do not exist): neither machine.json nor the environment gives them, and the server would not know where to look.",
  },
  "STUDIO-INIT-RUTAS-EN-MAQUINA": {
    es: (p: { cambios: string[] }) => `Las rutas pasan a machine.json (${p.cambios.join("; ")}), para que el servidor de cada cliente y el Studio las lean de ahí.`,
    en: (p: { cambios: string[] }) => `The paths move to machine.json (${p.cambios.join("; ")}), so that the server of each client and the Studio read them from there.`,
  },
  "STUDIO-INIT-QUITA-DEL-ENV": {
    es: (p: { cliente: string; quita: string[] }) => `${p.cliente}: quita de su env ${p.quita.join(", ")}.`,
    en: (p: { cliente: string; quita: string[] }) => `${p.cliente}: removes ${p.quita.join(", ")} from its env.`,
  },
  "STUDIO-CLIENTE-SIN-LISTA": {
    es: (p: { detalle: string }) => `No se puede saber si ya está registrado: ${p.detalle}`,
    en: (p: { detalle: string }) => `Cannot tell whether it is already registered: ${p.detalle}`,
  },
  "STUDIO-CLIENTE-EXISTENTE": {
    es: (p: { clave: string; conRutas: boolean }) =>
      p.conRutas
        ? `Ya está registrado como «${p.clave}» y lleva rutas en su env: init no lo toca. Los comandos para dejarlo sin ellas los corres tú.`
        : `Ya está registrado como «${p.clave}» y no lleva rutas en su env; init no lo toca.`,
    en: (p: { clave: string; conRutas: boolean }) =>
      p.conRutas
        ? `Already registered as "${p.clave}" and it carries paths in its env: init leaves it alone. You run the commands that leave it without them.`
        : `Already registered as "${p.clave}" and it carries no paths in its env; init leaves it alone.`,
  },
  "STUDIO-CLIENTE-CLAUDE-NUEVO": {
    es: (p: { clave: string }) => `Se registraría como «${p.clave}» (ámbito user).`,
    en: (p: { clave: string }) => `It would be registered as "${p.clave}" (user scope).`,
  },
  "STUDIO-CLIENTE-ROTO": {
    es: (p: { archivo: string }) => `No se pudo leer ${p.archivo}: no se toca.`,
    en: (p: { archivo: string }) => `Could not read ${p.archivo}: it is left alone.`,
  },
  "STUDIO-CLIENTE-FORMA-RARA": {
    es: (p: { archivo: string; seccion: string }) => `En ${p.archivo}, "${p.seccion}" o el "env" de alguna entrada no es un objeto: no se toca.`,
    en: (p: { archivo: string; seccion: string }) => `In ${p.archivo}, "${p.seccion}" or the "env" of some entry is not an object: it is left alone.`,
  },
  "STUDIO-CLIENTE-CLAVE-OCUPADA": {
    es: (p: { clave: string; archivo: string }) => `La clave «${p.clave}» ya la usa otro servidor en ${p.archivo}.`,
    en: (p: { clave: string; archivo: string }) => `The key "${p.clave}" is already used by another server in ${p.archivo}.`,
  },
  "STUDIO-CLIENTE-SIN-CAMBIOS": {
    es: (p: { clave: string }) => `Sin cambios: ya está registrado como «${p.clave}».`,
    en: (p: { clave: string }) => `No changes: already registered as "${p.clave}".`,
  },
  "STUDIO-CLIENTE-NUEVO": {
    es: (p: { clave: string }) => `Se registraría como «${p.clave}».`,
    en: (p: { clave: string }) => `It would be registered as "${p.clave}".`,
  },
  "STUDIO-CLIENTE-ACTUALIZA": {
    es: (p: { clave: string }) => `Se actualizaría la entrada «${p.clave}».`,
    en: (p: { clave: string }) => `The entry "${p.clave}" would be updated.`,
  },
  "STUDIO-CLIENTE-COMENTARIOS": {
    es: " El archivo tiene comentarios: al reescribirlo se perderán (queda la copia .bak).",
    en: " The file has comments: rewriting it will lose them (a .bak copy is kept).",
  },

  // ─── studio/acciones.ts: las peticiones ───
  "STUDIO-DISCO-CAMBIADO": {
    es: "El disco cambió desde que viste el cambio. Revísalo otra vez.",
    en: "The disk changed since you saw the change. Review it again.",
  },
  "STUDIO-PETICION-DE-PLAN": {
    es: "La petición tiene que ser { accion, argumentos }, con una de: crear-manifiesto, eject, init-cliente, equipo, proyecto.",
    en: "The request must be { accion, argumentos }, with one of: crear-manifiesto, eject, init-cliente, equipo, proyecto.",
  },
  "STUDIO-PETICION-DE-APLICAR": {
    es: "La petición tiene que ser { accion, argumentos, huella }, con la huella del plan.",
    en: "The request must be { accion, argumentos, huella }, with the plan's fingerprint.",
  },
  "STUDIO-ARGUMENTOS-INVALIDOS": {
    es: (p: { accion: string; problemas: { ruta: string; mensaje: string }[] }) =>
      `Argumentos de «${p.accion}» no válidos: ${p.problemas.map((i) => `${i.ruta || "(raíz)"}: ${i.mensaje}`).join("; ")}.`,
    en: (p: { accion: string; problemas: { ruta: string; mensaje: string }[] }) =>
      `Invalid arguments for "${p.accion}": ${p.problemas.map((i) => `${i.ruta || "(root)"}: ${i.mensaje}`).join("; ")}.`,
  },
  "STUDIO-CANDADO-OCUPADO": {
    es: "Otro Studio está aplicando un cambio; vuelve a intentarlo.",
    en: "Another Studio is applying a change; try again.",
  },
  "STUDIO-COMANDO-FALLO": {
    es: (p: { comando: string; detalle: string | null; codigo: number }) => `${p.comando} falló: ${p.detalle ?? `código ${p.codigo}`}`,
    en: (p: { comando: string; detalle: string | null; codigo: number }) => `${p.comando} failed: ${p.detalle ?? `exit code ${p.codigo}`}`,
  },

  // ─── studio/acciones.ts: dónde nunca se escribe ───
  "STUDIO-DESTINO-EN-TAREA": {
    es: "Esa acción escribiría dentro de una tarea: el Studio nunca escribe documentos ni recibos.",
    en: "That action would write inside a task: the Studio never writes documents or receipts.",
  },
  "STUDIO-DESTINO-EN-REPOS": {
    es: "Esa acción escribiría dentro de la carpeta de repos: el Studio nunca escribe en los repositorios.",
    en: "That action would write inside the repos folder: the Studio never writes in the repositories.",
  },
  "STUDIO-DESTINO-EN-DOCS": {
    es: "En la Documentación, el Studio solo escribe el phase-gate.json y la capa de prompts de un proyecto.",
    en: "In the Documentation, the Studio only writes a project's phase-gate.json and its prompts layer.",
  },
  "STUDIO-DESTINO-NO-ES-CAPA": {
    es: "Ese destino no es una capa de prompts ni la carpeta de presets: el Studio no escribe ahí.",
    en: "That destination is neither a prompts layer nor the presets folder: the Studio does not write there.",
  },

  // ─── studio/acciones.ts: el manifiesto (crear) ───
  "STUDIO-SIN-MANIFIESTO": {
    es: (p: { proyecto: string }) => `${p.proyecto} no tiene phase-gate.json: créalo primero con «Crear phase-gate.json».`,
    en: (p: { proyecto: string }) => `${p.proyecto} has no phase-gate.json: create it first with "Create phase-gate.json".`,
  },
  "STUDIO-MANIFIESTO-A-MANO": {
    es: (p: { error: string }) => `${p.error} Arréglalo a mano antes de cambiarlo desde el Studio.`,
    en: (p: { error: string }) => `${p.error} Fix it by hand before changing it from the Studio.`,
  },
  "STUDIO-MANIFIESTO-RESULTANTE": {
    es: (p: { error: string }) => `El phase-gate.json resultante no sería válido: ${p.error}.`,
    en: (p: { error: string }) => `The resulting phase-gate.json would not be valid: ${p.error}.`,
  },
  "STUDIO-PRESET-NO-EXISTE": {
    es: (p: { preset: string; disponibles: string[] | null }) => `No existe el preset "${p.preset}".${p.disponibles ? ` Los disponibles son: ${p.disponibles.join(", ")}.` : ""}`,
    en: (p: { preset: string; disponibles: string[] | null }) => `The preset "${p.preset}" does not exist.${p.disponibles ? ` The available ones are: ${p.disponibles.join(", ")}.` : ""}`,
  },
  "STUDIO-YA-TIENE-MANIFIESTO": {
    es: (p: { proyecto: string }) => `${p.proyecto} ya tiene phase-gate.json: «Crear» solo crea, nunca sobrescribe.`,
    en: (p: { proyecto: string }) => `${p.proyecto} already has a phase-gate.json: "Create" only creates, it never overwrites.`,
  },
  "STUDIO-CREAR-RESUMEN": {
    es: (p: { proyecto: string; preset: string }) => `Crear el phase-gate.json de ${p.proyecto} con el preset "${p.preset}".`,
    en: (p: { proyecto: string; preset: string }) => `Create the phase-gate.json of ${p.proyecto} with the preset "${p.preset}".`,
  },
  "STUDIO-CREAR-HECHO": {
    es: (p: { proyecto: string }) => `Creado el phase-gate.json de ${p.proyecto}.`,
    en: (p: { proyecto: string }) => `Created the phase-gate.json of ${p.proyecto}.`,
  },

  // ─── studio/acciones.ts: eject ───
  "STUDIO-EJECT-RESUMEN": {
    es: (p: { objetivo: string; etiqueta: string | null; reemplaza: boolean }) =>
      `Copiar ${p.objetivo} a ${p.etiqueta ?? "tu carpeta de presets"}${p.reemplaza ? ", reemplazando lo que hay (queda copia)" : ""}.`,
    en: (p: { objetivo: string; etiqueta: string | null; reemplaza: boolean }) =>
      `Copy ${p.objetivo} to ${p.etiqueta ?? "your presets folder"}${p.reemplaza ? ", replacing what is there (a copy is kept)" : ""}.`,
  },
  "STUDIO-EJECT-HECHO": {
    es: (p: { archivo: string }) => `Copiado a ${p.archivo}. Edítalo ahí.`,
    en: (p: { archivo: string }) => `Copied to ${p.archivo}. Edit it there.`,
  },

  // ─── studio/acciones.ts: init en un cliente ───
  "STUDIO-INIT-CLAUDE-EXISTENTE": {
    es: (p: { clave: string; comando: string | null }) =>
      p.comando
        ? `Claude Code ya lo tiene registrado como «${p.clave}» y lleva rutas en su env; init no lo toca. Para dejarlo sin ellas, corre tú estos dos comandos, en este orden (si el segundo falla, queda sin registrar):\n${p.comando}`
        : `Claude Code ya lo tiene registrado como «${p.clave}» y su env no lleva rutas que quitar; no hay nada que cambiar.`,
    en: (p: { clave: string; comando: string | null }) =>
      p.comando
        ? `Claude Code already has it registered as "${p.clave}" and it carries paths in its env; init leaves it alone. To leave it without them, run these two commands yourself, in this order (if the second fails, it is left unregistered):\n${p.comando}`
        : `Claude Code already has it registered as "${p.clave}" and its env carries no paths to take out; there is nothing to change.`,
  },
  "STUDIO-INIT-CLAUDE-RESUMEN": {
    es: (p: { clave: string }) => `Registrar el servidor en Claude Code como «${p.clave}» (ámbito user).`,
    en: (p: { clave: string }) => `Register the server in Claude Code as "${p.clave}" (user scope).`,
  },
  "STUDIO-INIT-CLAUDE-HECHO": {
    es: (p: { clave: string }) => `Registrado en Claude Code como «${p.clave}».`,
    en: (p: { clave: string }) => `Registered in Claude Code as "${p.clave}".`,
  },
  "STUDIO-INIT-ROTO": {
    es: (p: { cliente: string; error: string }) => `${p.cliente}: no se pudo leer su mcp.json (${p.error}); no se toca.`,
    en: (p: { cliente: string; error: string }) => `${p.cliente}: could not read its mcp.json (${p.error}); it is left alone.`,
  },
  "STUDIO-INIT-FORMA-RARA": {
    es: (p: { cliente: string; seccion: string }) => `${p.cliente}: en su mcp.json, "${p.seccion}" o el "env" de alguna entrada no es un objeto; no se toca.`,
    en: (p: { cliente: string; seccion: string }) => `${p.cliente}: in its mcp.json, "${p.seccion}" or the "env" of some entry is not an object; it is left alone.`,
  },
  "STUDIO-INIT-CLAVE-OCUPADA": {
    es: (p: { cliente: string; clave: string }) => `${p.cliente}: la clave «${p.clave}» ya la usa otro servidor.`,
    en: (p: { cliente: string; clave: string }) => `${p.cliente}: the key "${p.clave}" is already used by another server.`,
  },
  "STUDIO-INIT-SIN-CAMBIOS": {
    es: (p: { cliente: string; clave: string }) => `${p.cliente}: sin cambios, ya está registrado como «${p.clave}».`,
    en: (p: { cliente: string; clave: string }) => `${p.cliente}: no changes, already registered as "${p.clave}".`,
  },
  "STUDIO-INIT-RESUMEN": {
    es: (p: { nuevo: boolean; cliente: string; clave: string; comentarios: boolean }) =>
      `${p.nuevo ? "Registrar" : "Actualizar"} el servidor en ${p.cliente} como «${p.clave}»${p.comentarios ? " (el archivo tiene comentarios: se perderán, queda la copia)" : ""}.`,
    en: (p: { nuevo: boolean; cliente: string; clave: string; comentarios: boolean }) =>
      `${p.nuevo ? "Register" : "Update"} the server in ${p.cliente} as "${p.clave}"${p.comentarios ? " (the file has comments: they will be lost, a copy is kept)" : ""}.`,
  },
  "STUDIO-INIT-HECHO": {
    es: (p: { nuevo: boolean; cliente: string; clave: string }) => `${p.cliente}: ${p.nuevo ? "registrado" : "actualizado"} como «${p.clave}».`,
    en: (p: { nuevo: boolean; cliente: string; clave: string }) => `${p.cliente}: ${p.nuevo ? "registered" : "updated"} as "${p.clave}".`,
  },
  "STUDIO-INIT-VSCODE-SIN-COMANDOS": {
    es: "VS Code no lee los comandos de fase de archivo: usa los MCP Prompts /f1…/fN del servidor.",
    en: "VS Code does not read phase commands from files: use the server's MCP Prompts /f1…/fN.",
  },
  "STUDIO-INIT-COPIAR-COMANDOS": {
    es: (p: { comandos: string; carpeta: string }) => `Copiar ${p.comandos} a ${p.carpeta}.`,
    en: (p: { comandos: string; carpeta: string }) => `Copy ${p.comandos} to ${p.carpeta}.`,
  },
  "STUDIO-INIT-COMANDOS-COPIADOS": {
    es: (p: { comandos: string }) => `Comandos copiados: ${p.comandos}.`,
    en: (p: { comandos: string }) => `Commands copied: ${p.comandos}.`,
  },
  "STUDIO-INIT-COMANDOS-AJENOS": {
    es: (p: { comandos: string }) => `${p.comandos} ya existen y no los generó init: no se tocan.`,
    en: (p: { comandos: string }) => `${p.comandos} already exist and were not generated by init: they are left alone.`,
  },
  "STUDIO-INIT-COMANDOS-AL-DIA": { es: "Los comandos de fase ya están al día.", en: "The phase commands are already up to date." },

  // ─── exportar.ts (ui --export-static) ──────────────────────────────────────
  "STUDIO-EXPORT-SIN-FRONTEND": {
    es: (p: { dist: string }) => `No está el frontend compilado (${p.dist}): ejecuta npm run build.`,
    en: (p: { dist: string }) => `The compiled frontend is missing (${p.dist}): run npm run build.`,
  },
  "STUDIO-EXPORT-CON-RUTAS": {
    es: "El export llevaría rutas de este equipo: no se escribe nada.",
    en: "The export would contain paths from this computer: nothing is written.",
  },
  "STUDIO-EXPORT-CARPETA-OCUPADA": {
    es: (p: { destino: string }) => `${p.destino} ya existe y no es una carpeta vacía: el export se escribe en una carpeta nueva.`,
    en: (p: { destino: string }) => `${p.destino} already exists and is not an empty folder: the export is written to a new folder.`,
  },
  "STUDIO-EXPORT-SIN-DOCUMENTACION": {
    es: (p: { error: string }) => `No se puede exportar la Documentación: ${p.error}`,
    en: (p: { error: string }) => `The Documentation cannot be exported: ${p.error}`,
  },
  "STUDIO-EXPORT-AVISO": {
    es: (p: { proyectos: number }) =>
      `Vas a publicar los documentos de ${p.proyectos} ${p.proyectos === 1 ? "proyecto" : "proyectos"}, con todo su contenido (las rutas de este equipo se sustituyen por <Documentación>, <repos>, ~…). ¿Seguro?`,
    en: (p: { proyectos: number }) =>
      `You are about to publish the documents of ${p.proyectos} ${p.proyectos === 1 ? "project" : "projects"}, with all their content (this computer's paths are replaced by <Documentación>, <repos>, ~…). Are you sure?`,
  },
  "STUDIO-EXPORT-SIN-CONFIRMAR": {
    es: (p: { aviso: string }) => `${p.aviso}\nPara exportar datos reales hace falta confirmarlo: escribe exportar en una terminal, o pasa --yes. No se exportó nada.`,
    en: (p: { aviso: string }) => `${p.aviso}\nExporting real data needs a confirmation: type export in a terminal, or pass --yes. Nothing was exported.`,
  },
  "STUDIO-EXPORT-PREGUNTA": {
    es: (p: { aviso: string }) => `${p.aviso} Escribe exportar para seguir: `,
    en: (p: { aviso: string }) => `${p.aviso} Type export to continue: `,
  },
  "STUDIO-EXPORT-NADA": { es: "No se exportó nada.", en: "Nothing was exported." },
  "STUDIO-EXPORT-HECHO": {
    es: (p: { destino: string; rutas: number; archivos: number; demo: boolean }) =>
      `Exportado en ${p.destino}: ${p.rutas} rutas de la API en ${p.archivos} archivos de datos${p.demo ? ", de la demo" : ""}.`,
    en: (p: { destino: string; rutas: number; archivos: number; demo: boolean }) =>
      `Exported to ${p.destino}: ${p.rutas} API routes in ${p.archivos} data files${p.demo ? ", from the demo" : ""}.`,
  },
  "STUDIO-EXPORT-FALLO": {
    es: (p: { error: string }) => `No se pudo exportar: ${p.error}`,
    en: (p: { error: string }) => `The export failed: ${p.error}`,
  },
} satisfies Catalogo;
