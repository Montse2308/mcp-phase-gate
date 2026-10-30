// Messages of the "cli" group (see i18n/mensajes.ts): each code with its text in Spanish and in English;
// the English follows the glossary in docs/glosario.md.

import type { Catalogo } from "./tipos.js";

type Servidor = { servidor: string; version: string };

export const TEXTOS_CLI = {
  // ─── cli.ts ────────────────────────────────────────────────────────────────
  "CLI-AYUDA": {
    es: ({ servidor, version }: Servidor) => `${servidor} v${version}

Servidor MCP que parte cada requerimiento en cinco fases con compuerta y obliga a que cada
una deje su documento en una documentación central.

El servidor NO se ejecuta a mano: lo lanza tu cliente MCP. Ejecutado directamente se queda
esperando mensajes JSON-RPC por stdin, que es lo que parece que se colgó.

Uso:
  ${servidor}                 Arranca el servidor MCP por stdio (lo hace tu cliente).
  ${servidor} doctor          Revisa la instalación: variables, prompts, proyectos y avisos.
  ${servidor} doctor --json   Lo mismo, como JSON.
  ${servidor} doctor --reverificar
                                Además, comprueba que el commit de cada recibo siga en su rama y que
                                cada artefacto sellado no haya cambiado (llama a git).
  ${servidor} doctor --fase N [--proyecto P]
                                De dónde sale cada ranura del prompt de esa fase (capa y archivo:línea).
  ${servidor} init            Registra el servidor en tus clientes (Claude Code, Cursor, VS Code).
  ${servidor} eject <objetivo> --a global|proyecto:<NOMBRE>
                                Copia un prompt, una ranura, un comando o un preset para editarlo.
  ${servidor} ui              El Studio: una vista local de tus proyectos y tareas en el navegador.
  ${servidor} --version       La versión.
  ${servidor} --help          Esta ayuda.

init:
  --cliente claude-code|cursor|vscode|todos   Sin esto, detecta los que hay en este equipo.
  --clave <clave>        Nombre del registro nuevo (por defecto "pg"). Uno que ya existe conserva el suyo.
  --docs <ruta>          Documentación Central (si no, la de machine.json o PHASE_GATE_DOCS_PATH, o te la pregunta).
  --repos <ruta>         Carpeta de repositorios (si no, la de machine.json o PHASE_GATE_REPOS_PATH, o te la pregunta).
                         Las dos rutas se guardan en el machine.json de este equipo, no en el env de cada cliente:
                         a un registro que ya existe se le quitan de su env (en Claude Code, te da los comandos).
  --comandos             Copia /f1…/fN a ~/.claude/commands/ o ~/.cursor/commands/.
  --migrate              Crea phase-gate.json con "preset": "software-replica" en los proyectos sin él.
    --preset <nombre>    Otro preset para la migración.
    --idioma es|en       El de los proyectos cuyos documentos no lo dicen (si no, se pregunta).
    --solo-este-equipo   En vez de manifiestos, presetPorDefecto (e idiomaPorDefecto) en el machine.json de este equipo.
  --dry-run              Dice lo que haría, sin escribir nada.
  --yes                  Confirma los cambios sobre lo que ya existe sin preguntar.

eject <objetivo>:
  fase-3                 El prompt de fábrica de la fase, con sus ranuras.
  fase-3/pruebas         El contenido efectivo de una ranura (con preset y reglas), como bloque.
  global/evidencia       Igual, para una ranura de las reglas globales.
  comando-f4             El texto del comando /f4.
  preset:<nombre>        El archivo del preset (siempre a tu carpeta de configuración).
  --a global|proyecto:<NOMBRE>   A qué capa. --dry-run lo enseña sin escribir; --fuerza reemplaza con copia.

ui:
  --puerto <n>           El puerto (en 127.0.0.1). Sin esto, uno libre.
  --no-abrir             No abre el navegador: solo imprime el enlace, que sirve una sola vez.
  --demo                 Sobre una demo con datos de ejemplo, en una carpeta temporal: no toca tu Documentación.
  --idioma es|en         Con --demo, la demo en ese idioma (sin esto, PHASE_GATE_LANG o el del sistema).
  --export-static <dir>  No arranca nada: escribe en <dir> (nueva o vacía) un sitio estático de solo lectura con la demo.
    --incluir-datos-reales  Con tu Documentación en vez de la demo. Pide que escribas "exportar" (o --yes).

Regístralo en tu cliente (Cursor, VS Code, Claude Code) con \`${servidor} init --docs <ruta> --repos <ruta>\`, o a mano:

  {
    "mcpServers": {
      "${servidor}": {
        "command": "npx",
        "args": ["-y", "mcp-phase-gate"]
      }
    }
  }

Las rutas de este equipo viven en machine.json (rutas.documentacion, rutas.carpetaDeRepos y rutas.subcarpetaTareas),
que lee igual el servidor de cada cliente. Una variable de entorno gana a machine.json: sirve para un valor distinto
en un cliente o en una ejecución.

Variables de entorno (los nombres ORQUESTADOR_* de antes siguen valiendo como alias):
  PHASE_GATE_DOCS_PATH      Raíz de la Documentación Central. Sin ella, rutas.documentacion de machine.json.
  PHASE_GATE_REPOS_PATH     Carpeta con tus repositorios de código. Sin ella, rutas.carpetaDeRepos de machine.json.
  PHASE_GATE_TASKS_SUBDIR   Subcarpeta de tareas dentro de cada proyecto. Por defecto "Proyectos" (o rutas.subcarpetaTareas).
  PHASE_GATE_PROMPTS_PATH   Carpeta de prompts propios, que se superponen a los del paquete.
  PHASE_GATE_STATE_PATH     Dónde guardar los punteros de tarea activa.
  PHASE_GATE_CONFIG_PATH    Carpeta de machine.json y de los presets propios (por defecto, la del sistema).
  PHASE_GATE_ELICITATION    "off" para que el servidor no pida confirmaciones al cliente.
  PHASE_GATE_LANG           "es" o "en": idioma de los mensajes, y de los proyectos sin idioma propio. Gana a idiomaPorDefecto de machine.json.

Documentación: https://github.com/Montse2308/mcp-phase-gate`,
    en: ({ servidor, version }: Servidor) => `${servidor} v${version}

MCP server that splits each requirement into five gated phases and makes each one leave its
document in a central documentation folder.

The server is NOT run by hand: your MCP client launches it. Run directly, it sits waiting for
JSON-RPC messages on stdin, which is what looks like a hang.

Usage:
  ${servidor}                 Starts the MCP server over stdio (your client does this).
  ${servidor} doctor          Checks the installation: variables, prompts, projects and warnings.
  ${servidor} doctor --json   The same, as JSON.
  ${servidor} doctor --reverificar
                                Also checks that each receipt's commit is still on its branch and that
                                each sealed artifact has not changed (runs git).
  ${servidor} doctor --fase N [--proyecto P]
                                Where each slot of that phase's prompt comes from (layer and file:line).
  ${servidor} init            Registers the server in your clients (Claude Code, Cursor, VS Code).
  ${servidor} eject <target> --a global|proyecto:<NAME>
                                Copies a prompt, a slot, a command or a preset so you can edit it.
  ${servidor} ui              The Studio: a local view of your projects and tasks in the browser.
  ${servidor} --version       The version.
  ${servidor} --help          This help.

init:
  --cliente claude-code|cursor|vscode|todos   Without it, detects the ones on this machine.
  --clave <key>          Name of the new registration (default "pg"). An existing one keeps its own.
  --docs <path>          Central Documentation (otherwise the one in machine.json or PHASE_GATE_DOCS_PATH, or it asks you).
  --repos <path>         Repositories folder (otherwise the one in machine.json or PHASE_GATE_REPOS_PATH, or it asks you).
                         Both paths are saved in this machine's machine.json, not in each client's env: an
                         existing registration loses them from its env (in Claude Code, you get the commands).
  --comandos             Copies /f1…/fN to ~/.claude/commands/ or ~/.cursor/commands/.
  --migrate              Creates phase-gate.json with "preset": "software-replica" in the projects without one.
    --preset <name>      Another preset for the migration.
    --idioma es|en       The language of the projects whose documents don't tell (otherwise it asks).
    --solo-este-equipo   Instead of manifests, presetPorDefecto (and idiomaPorDefecto) in this machine's machine.json.
  --dry-run              Says what it would do, without writing anything.
  --yes                  Confirms changes to what already exists without asking.

eject <target>:
  fase-3                 The factory prompt of the phase, with its slots.
  fase-3/pruebas         The effective content of a slot (with preset and rules), as a block.
  global/evidencia       The same, for a slot of the global rules.
  comando-f4             The text of the /f4 command.
  preset:<name>          The preset file (always to your configuration folder).
  --a global|proyecto:<NAME>     Which layer. --dry-run shows it without writing; --fuerza replaces, with a copy.

ui:
  --puerto <n>           The port (on 127.0.0.1). Without it, a free one.
  --no-abrir             Does not open the browser: only prints the link, which works once.
  --demo                 On a demo with sample data, in a temporary folder: your Documentation is not touched.
  --idioma es|en         With --demo, the demo in that language (without it, PHASE_GATE_LANG or the system's).
  --export-static <dir>  Starts nothing: writes into <dir> (new or empty) a read-only static site with the demo.
    --incluir-datos-reales  With your Documentation instead of the demo. Asks you to type "exportar" (or --yes).

Register it in your client (Cursor, VS Code, Claude Code) with \`${servidor} init --docs <path> --repos <path>\`, or by hand:

  {
    "mcpServers": {
      "${servidor}": {
        "command": "npx",
        "args": ["-y", "mcp-phase-gate"]
      }
    }
  }

This machine's paths live in machine.json (rutas.documentacion, rutas.carpetaDeRepos and rutas.subcarpetaTareas),
which the server of every client reads the same way. An environment variable wins over machine.json: use it for a
different value in one client or one run.

Environment variables (the old ORQUESTADOR_* names still work as aliases):
  PHASE_GATE_DOCS_PATH      Root of the Central Documentation. Without it, rutas.documentacion of machine.json.
  PHASE_GATE_REPOS_PATH     Folder with your code repositories. Without it, rutas.carpetaDeRepos of machine.json.
  PHASE_GATE_TASKS_SUBDIR   Task subfolder inside each project. Default "Proyectos" (or rutas.subcarpetaTareas).
  PHASE_GATE_PROMPTS_PATH   Folder of your own prompts, layered over the package's.
  PHASE_GATE_STATE_PATH     Where to keep the active-task pointers.
  PHASE_GATE_CONFIG_PATH    Folder of machine.json and your own presets (default, the system's).
  PHASE_GATE_ELICITATION    "off" so the server does not ask the client for confirmations.
  PHASE_GATE_LANG           "es" or "en": language of the messages, and of projects with no language of their own. Wins over idiomaPorDefecto of machine.json.

Documentation: https://github.com/Montse2308/mcp-phase-gate`,
  },
  "CLI-AVISO-TERMINAL": {
    es: "Esperando un cliente MCP por stdin. Si querías revisar la instalación: `npx mcp-phase-gate doctor`.",
    en: "Waiting for an MCP client on stdin. If you wanted to check the installation: `npx mcp-phase-gate doctor`.",
  },
  "CLI-CLIENTE-INVALIDO": {
    es: (p: { cliente: string }) => `--cliente "${p.cliente}" no es válido: usa claude-code, cursor, vscode o todos.`,
    en: (p: { cliente: string }) => `--cliente "${p.cliente}" is not valid: use claude-code, cursor, vscode or todos.`,
  },
  "CLI-CLAVE-INVALIDA": {
    es: (p: { clave: string }) => `--clave "${p.clave}" no es válida: letras, números, guiones y guiones bajos.`,
    en: (p: { clave: string }) => `--clave "${p.clave}" is not valid: letters, digits, hyphens and underscores.`,
  },
  "CLI-SOLO-CON-MIGRATE": {
    es: "--preset, --idioma y --solo-este-equipo solo valen junto con --migrate.",
    en: "--preset, --idioma and --solo-este-equipo only work together with --migrate.",
  },
  "CLI-IDIOMA-INVALIDO": {
    es: (p: { idioma: string }) => `--idioma "${p.idioma}" no es válido: usa es o en.`,
    en: (p: { idioma: string }) => `--idioma "${p.idioma}" is not valid: use es or en.`,
  },
  "CLI-BANDERA-NO-VALE": {
    es: (p: { banderas: string[]; subcomando: string }) => `${p.banderas.map((b) => `--${b}`).join(", ")} no vale con "${p.subcomando || "(sin subcomando)"}".`,
    en: (p: { banderas: string[]; subcomando: string }) =>
      `${p.banderas.map((b) => `--${b}`).join(", ")} ${p.banderas.length === 1 ? "is" : "are"} not valid with "${p.subcomando || "(no subcommand)"}".`,
  },
  "CLI-REVERIFICAR-CON-FASE": {
    es: "--reverificar no va con --fase ni con --proyecto.",
    en: "--reverificar does not go with --fase or --proyecto.",
  },
  "CLI-FASE-NECESARIA": {
    es: "doctor --proyecto necesita --fase N, con N un número de fase (ej. --fase 3).",
    en: "doctor --proyecto needs --fase N, with N a phase number (e.g. --fase 3).",
  },
  "CLI-EXPORT-SIN-CARPETA": {
    es: "--export-static necesita una carpeta.",
    en: "--export-static needs a folder.",
  },
  "CLI-IDIOMA-SOLO-CON-DEMO": {
    es: "--idioma solo vale con --demo (con --migrate, en init).",
    en: "--idioma only works with --demo (with --migrate, in init).",
  },
  "CLI-EXPORT-INCOMPATIBLE": {
    es: "--export-static no arranca el Studio: no va con --puerto, --no-abrir ni --demo (sin --incluir-datos-reales, ya exporta la demo).",
    en: "--export-static does not start the Studio: it does not go with --puerto, --no-abrir or --demo (without --incluir-datos-reales, it already exports the demo).",
  },
  "CLI-SOLO-CON-EXPORT": {
    es: "--incluir-datos-reales y --yes solo valen con --export-static.",
    en: "--incluir-datos-reales and --yes only work with --export-static.",
  },
  "CLI-PUERTO-INVALIDO": {
    es: (p: { puerto: string }) => `--puerto "${p.puerto}" no es válido: un número de 1 a 65535.`,
    en: (p: { puerto: string }) => `--puerto "${p.puerto}" is not valid: a number from 1 to 65535.`,
  },

  // ─── init.ts ───────────────────────────────────────────────────────────────
  "INIT-NO-INSTALADO": {
    es: (p: { comando: string }) => `${p.comando} no está instalado o no está en el PATH.`,
    en: (p: { comando: string }) => `${p.comando} is not installed or is not on the PATH.`,
  },
  "INIT-CMD-INSEGURO": {
    es: (p: { comando: string }) => `no se puede lanzar ${p.comando}.cmd con seguridad: algún argumento lleva % o comillas. Ejecuta el comando a mano.`,
    en: (p: { comando: string }) => `${p.comando}.cmd cannot be launched safely: some argument contains % or quotes. Run the command by hand.`,
  },
  "INIT-JSON-NO-OBJETO": { es: "no es un objeto JSON", en: "it is not a JSON object" },
  "INIT-CONFIRMAR": {
    es: (p: { pregunta: string }) => `${p.pregunta} (s/N) `,
    en: (p: { pregunta: string }) => `${p.pregunta} (y/N) `,
  },
  "INIT-RUTA-DOCS": { es: "la Documentación Central", en: "the Central Documentation" },
  "INIT-RUTA-REPOS": { es: "la carpeta de repositorios", en: "the repositories folder" },
  "INIT-PREGUNTA-RUTA": {
    es: (p: { que: string }) => `Ruta de ${p.que}: `,
    en: (p: { que: string }) => `Path to ${p.que}: `,
  },
  "INIT-FALTA-RUTA": {
    es: (p: { que: string; bandera: string; logica: string; clave: string }) =>
      `Falta la ruta de ${p.que}: pásala con ${p.bandera} (init la guarda en machine.json, en "${p.clave}"), o define PHASE_GATE_${p.logica}.`,
    en: (p: { que: string; bandera: string; logica: string; clave: string }) =>
      `The path to ${p.que} is missing: pass it with ${p.bandera} (init saves it in machine.json, under "${p.clave}"), or set PHASE_GATE_${p.logica}.`,
  },
  "INIT-RUTA-NO-EXISTE": {
    es: (p: { que: string; ruta: string }) => `La ruta de ${p.que} no existe o no es una carpeta: ${p.ruta}`,
    en: (p: { que: string; ruta: string }) => `The path to ${p.que} does not exist or is not a folder: ${p.ruta}`,
  },
  "INIT-ARCHIVO-ROTO": {
    es: (p: { nombre: string; archivo: string; error: string | null; paraPegar: string }) =>
      `${p.nombre}: no se pudo leer ${p.archivo} (${p.error}). No se toca. Para registrarlo a mano, añade:\n` + p.paraPegar,
    en: (p: { nombre: string; archivo: string; error: string | null; paraPegar: string }) =>
      `${p.nombre}: could not read ${p.archivo} (${p.error}). It is left untouched. To register it by hand, add:\n` + p.paraPegar,
  },
  "INIT-ARCHIVO-FORMA-RARA": {
    es: (p: { nombre: string; archivo: string; seccion: string; paraPegar: string }) =>
      `${p.nombre}: en ${p.archivo}, "${p.seccion}" o el "env" de alguna entrada no es un objeto. No se toca. Para registrarlo a mano, añade:\n` + p.paraPegar,
    en: (p: { nombre: string; archivo: string; seccion: string; paraPegar: string }) =>
      `${p.nombre}: in ${p.archivo}, "${p.seccion}" or the "env" of some entry is not an object. It is left untouched. To register it by hand, add:\n` + p.paraPegar,
  },
  "INIT-CLAVE-OCUPADA": {
    es: (p: { nombre: string; clave: string; archivo: string }) => `${p.nombre}: la clave «${p.clave}» ya la usa otro servidor en ${p.archivo}. Elige otra con --clave.`,
    en: (p: { nombre: string; clave: string; archivo: string }) => `${p.nombre}: the key «${p.clave}» is already used by another server in ${p.archivo}. Choose another one with --clave.`,
  },
  "INIT-CONSERVA-CLAVE": {
    es: (p: { nombre: string; clave: string }) =>
      `${p.nombre}: ya estaba registrado como «${p.clave}»; se actualiza esa entrada y se conserva su clave (cambiarla cambiaría el nombre de las tools y los prompts, y los permisos concedidos).`,
    en: (p: { nombre: string; clave: string }) =>
      `${p.nombre}: it was already registered as «${p.clave}»; that entry is updated and its key is kept (changing it would change the name of the tools and prompts, and the permissions granted).`,
  },
  "INIT-RENOMBRA-CLAVE": {
    es: (p: { nombre: string; antes: string; clave: string }) =>
      `${p.nombre}: ya estaba registrado como «${p.antes}»; --clave pide renombrarlo a «${p.clave}». Ojo: cambia el nombre de todas las tools y prompts, y los permisos concedidos.`,
    en: (p: { nombre: string; antes: string; clave: string }) =>
      `${p.nombre}: it was already registered as «${p.antes}»; --clave asks to rename it to «${p.clave}». Careful: this changes the name of all the tools and prompts, and the permissions granted.`,
  },
  "INIT-SIN-CAMBIOS": {
    es: (p: { nombre: string; archivo: string; clave: string }) => `${p.nombre}: sin cambios (${p.archivo}, «${p.clave}»).`,
    en: (p: { nombre: string; archivo: string; clave: string }) => `${p.nombre}: no changes (${p.archivo}, «${p.clave}»).`,
  },
  "INIT-DIFF": {
    es: (p: { nombre: string; clave: string; archivo: string; diff: string | null }) => `${p.nombre}: cambios en «${p.clave}» (${p.archivo}):\n${p.diff}`,
    en: (p: { nombre: string; clave: string; archivo: string; diff: string | null }) => `${p.nombre}: changes to «${p.clave}» (${p.archivo}):\n${p.diff}`,
  },
  "INIT-COMENTARIOS": {
    es: (p: { nombre: string; archivo: string }) => `${p.nombre}: ${p.archivo} tiene comentarios; al reescribirlo se perderán (queda la copia .bak).`,
    en: (p: { nombre: string; archivo: string }) => `${p.nombre}: ${p.archivo} has comments; rewriting it will lose them (the .bak copy remains).`,
  },
  "INIT-PREGUNTA-APLICAR": {
    es: (p: { archivo: string }) => `¿Aplicar los cambios en ${p.archivo}?`,
    en: (p: { archivo: string }) => `Apply the changes to ${p.archivo}?`,
  },
  "INIT-NO-APLICADO": {
    es: (p: { nombre: string }) => `${p.nombre}: no se aplicó. Repite con --yes, o en una terminal para confirmarlo.`,
    en: (p: { nombre: string }) => `${p.nombre}: not applied. Repeat with --yes, or in a terminal to confirm it.`,
  },
  "INIT-REGISTRADO-ARCHIVO": {
    es: (p: { nombre: string; actualizado: boolean; clave: string; archivo: string; copia: string | null }) =>
      `${p.nombre}: ${p.actualizado ? "actualizado" : "registrado"} como «${p.clave}» en ${p.archivo}.${p.copia ? ` Copia: ${p.copia}` : ""}`,
    en: (p: { nombre: string; actualizado: boolean; clave: string; archivo: string; copia: string | null }) =>
      `${p.nombre}: ${p.actualizado ? "updated" : "registered"} as «${p.clave}» in ${p.archivo}.${p.copia ? ` Copy: ${p.copia}` : ""}`,
  },
  "INIT-CLAUDE-SIN-LISTA": {
    es: (p: { error: string }) => `no se pudo ejecutar claude mcp list (${p.error}).`,
    en: (p: { error: string }) => `could not run claude mcp list (${p.error}).`,
  },
  "INIT-CLAUDE-LISTA-FALLO": {
    es: (p: { stderr: string; codigo: number }) => `claude mcp list falló (${p.stderr || `código ${p.codigo}`}); no se registra para no duplicarlo.`,
    en: (p: { stderr: string; codigo: number }) => `claude mcp list failed (${p.stderr || `code ${p.codigo}`}); it is not registered, to avoid duplicating it.`,
  },
  "INIT-CLAUDE-REHACER": {
    es: (p: { ambito: string; carpeta: string | null; comandos: string[] }) =>
      `${p.ambito === "local" ? `En el ámbito local (desde la carpeta ${p.carpeta}):` : "En el ámbito user:"}\n  ${p.comandos.join("\n  ")}`,
    en: (p: { ambito: string; carpeta: string | null; comandos: string[] }) =>
      `${p.ambito === "local" ? `In the local scope (from the folder ${p.carpeta}):` : "In the user scope:"}\n  ${p.comandos.join("\n  ")}`,
  },
  "INIT-CLAUDE-EXISTENTE": {
    es: (p: { existente: string; comando: string }) =>
      `Claude Code: ya está registrado como «${p.existente}» y lleva rutas en su env; no se toca. Las rutas viven en machine.json: para dejarlo sin ellas, corre tú estos dos comandos, en este orden (si el segundo falla, el servidor queda sin registrar: vuelve a registrarlo con claude mcp add):\n${p.comando}`,
    en: (p: { existente: string; comando: string }) =>
      `Claude Code: already registered as «${p.existente}» and it carries paths in its env; it is left untouched. The paths live in machine.json: to leave it without them, run these two commands yourself, in this order (if the second fails, the server is left unregistered: register it again with claude mcp add):\n${p.comando}`,
  },
  "INIT-CLAUDE-AL-DIA": {
    es: (p: { existente: string }) => `Claude Code: ya está registrado como «${p.existente}» y su env no lleva rutas que quitar; no hay nada que cambiar.`,
    en: (p: { existente: string }) => `Claude Code: already registered as «${p.existente}» and its env carries no paths to take out; there is nothing to change.`,
  },
  "INIT-RUTA-DISTINTA": {
    es: (p: { cliente: string; clave: string; variable: string; valor: string; guardada: string }) =>
      `${p.cliente}: su env conserva ${p.variable} = ${p.valor}, que no es la de rutas.${p.clave} en machine.json (${p.guardada}). Ese cliente sigue usando la suya; si quieres que use la de machine.json, quítale ${p.variable} a mano.`,
    en: (p: { cliente: string; clave: string; variable: string; valor: string; guardada: string }) =>
      `${p.cliente}: its env keeps ${p.variable} = ${p.valor}, which is not rutas.${p.clave} in machine.json (${p.guardada}). That client keeps using its own; if you want it to use machine.json's, remove ${p.variable} by hand.`,
  },
  "INIT-CLAUDE-SE-EJECUTARIA": {
    es: (p: { comando: string }) => `Claude Code: se ejecutaría ${p.comando}`,
    en: (p: { comando: string }) => `Claude Code: would run ${p.comando}`,
  },
  "INIT-CLAUDE-ADD-FALLO": {
    es: (p: { stderr: string; codigo: number }) => `Claude Code: claude mcp add falló (${p.stderr || `código ${p.codigo}`}).`,
    en: (p: { stderr: string; codigo: number }) => `Claude Code: claude mcp add failed (${p.stderr || `code ${p.codigo}`}).`,
  },
  "INIT-CLAUDE-REGISTRADO": {
    es: (p: { clave: string }) => `Claude Code: registrado como «${p.clave}» (ámbito user).`,
    en: (p: { clave: string }) => `Claude Code: registered as «${p.clave}» (user scope).`,
  },
  "INIT-COMANDOS-SIN-CLIENTE": {
    es: "--comandos: ninguno de los clientes elegidos lee comandos de archivo (Claude Code o Cursor).",
    en: "--comandos: none of the chosen clients reads commands from files (Claude Code or Cursor).",
  },
  "INIT-COMANDO-CARPETA": {
    es: (p: { nombre: string; archivo: string }) => `${p.nombre}: ${p.archivo} es una carpeta; no se toca.`,
    en: (p: { nombre: string; archivo: string }) => `${p.nombre}: ${p.archivo} is a folder; it is left untouched.`,
  },
  "INIT-COMANDO-AJENO": {
    es: (p: { nombre: string; archivo: string }) => `${p.nombre}: ${p.archivo} es tuyo (no lo generó init); no se toca. Con --yes se reemplaza, con copia.`,
    en: (p: { nombre: string; archivo: string }) => `${p.nombre}: ${p.archivo} is yours (init did not generate it); it is left untouched. With --yes it is replaced, with a copy.`,
  },
  "INIT-COMANDO-SIN-CAMBIOS": {
    es: (p: { nombre: string; numero: number }) => `${p.nombre}: /f${p.numero} sin cambios.`,
    en: (p: { nombre: string; numero: number }) => `${p.nombre}: /f${p.numero} unchanged.`,
  },
  "INIT-COMANDO-COPIADO": {
    es: (p: { nombre: string; numero: number; nuevo: boolean; archivo: string; copia: string | null }) =>
      `${p.nombre}: /f${p.numero} ${p.nuevo ? "copiado" : "actualizado"} en ${p.archivo}.${p.copia ? ` Copia: ${p.copia}` : ""}`,
    en: (p: { nombre: string; numero: number; nuevo: boolean; archivo: string; copia: string | null }) =>
      `${p.nombre}: /f${p.numero} ${p.nuevo ? "copied" : "updated"} in ${p.archivo}.${p.copia ? ` Copy: ${p.copia}` : ""}`,
  },
  "INIT-PRESET-NO-EXISTE": {
    es: (p: { preset: string; disponibles: string }) => `No existe el preset "${p.preset}". Los disponibles son: ${p.disponibles}.`,
    en: (p: { preset: string; disponibles: string }) => `Preset "${p.preset}" does not exist. The available ones are: ${p.disponibles}.`,
  },
  "INIT-NO-SE-TOCA": {
    es: (p: { error: string }) => `${p.error} No se toca.`,
    en: (p: { error: string }) => `${p.error} It is left untouched.`,
  },
  "INIT-MAQUINA-SIN-CAMBIOS": {
    es: (p: { preset: string; idioma: string | null }) => `machine.json: presetPorDefecto ya es "${p.preset}"${p.idioma ? ` e idiomaPorDefecto "${p.idioma}"` : ""}; sin cambios.`,
    en: (p: { preset: string; idioma: string | null }) => `machine.json: presetPorDefecto is already "${p.preset}"${p.idioma ? ` and idiomaPorDefecto "${p.idioma}"` : ""}; no changes.`,
  },
  "INIT-MAQUINA-RUTAS-IGUALES": {
    es: "machine.json: las rutas de este equipo ya son esas; sin cambios.",
    en: "machine.json: this machine's paths are already those; no changes.",
  },
  "INIT-PREGUNTA-CAMBIAR-RUTAS": {
    es: (p: { cambios: string[] }) => `machine.json ya tiene otras rutas para este equipo (${p.cambios.join("; ")}). ¿Cambiarlas?`,
    en: (p: { cambios: string[] }) => `machine.json already has other paths for this machine (${p.cambios.join("; ")}). Change them?`,
  },
  "INIT-MAQUINA-RUTAS-ESCRITA": {
    es: (p: { archivo: string; copia: string | null }) => `machine.json: rutas de este equipo guardadas en ${p.archivo}. El servidor de cada cliente y el Studio las leen de ahí.${p.copia ? ` Copia: ${p.copia}` : ""}`,
    en: (p: { archivo: string; copia: string | null }) => `machine.json: this machine's paths saved in ${p.archivo}. The server of each client and the Studio read them from there.${p.copia ? ` Copy: ${p.copia}` : ""}`,
  },
  "INIT-PREGUNTA-CAMBIAR-PRESET": {
    es: (p: { actual: string; preset: string }) => `machine.json ya tiene presetPorDefecto "${p.actual}". ¿Cambiarlo a "${p.preset}"?`,
    en: (p: { actual: string; preset: string }) => `machine.json already has presetPorDefecto "${p.actual}". Change it to "${p.preset}"?`,
  },
  "INIT-MAQUINA-NO-CAMBIADA": {
    es: "machine.json: no se cambió. Repite con --yes, o en una terminal para confirmarlo.",
    en: "machine.json: not changed. Repeat with --yes, or in a terminal to confirm it.",
  },
  "INIT-MAQUINA-ESCRITA": {
    es: (p: { preset: string; archivo: string; copia: string | null }) =>
      `machine.json: presetPorDefecto "${p.preset}" en ${p.archivo}. Los proyectos sin manifiesto de este equipo lo usan.${p.copia ? ` Copia: ${p.copia}` : ""}`,
    en: (p: { preset: string; archivo: string; copia: string | null }) =>
      `machine.json: presetPorDefecto "${p.preset}" in ${p.archivo}. The projects without a manifest on this machine use it.${p.copia ? ` Copy: ${p.copia}` : ""}`,
  },
  "INIT-PREGUNTA-IDIOMA": {
    es: (p: { proyectos: string[]; delEquipo: string }) => `Idioma de ${p.proyectos.join(", ")} (es/en) [${p.delEquipo}]: `,
    en: (p: { proyectos: string[]; delEquipo: string }) => `Language of ${p.proyectos.join(", ")} (es/en) [${p.delEquipo}]: `,
  },
  "INIT-MIGRATE-CREADO": {
    es: (p: { archivo: string; preset: string; idioma: string }) => `--migrate: ${p.archivo} con "preset": "${p.preset}" e "idioma": "${p.idioma}".`,
    en: (p: { archivo: string; preset: string; idioma: string }) => `--migrate: ${p.archivo} with "preset": "${p.preset}" and "idioma": "${p.idioma}".`,
  },
  "INIT-MIGRATE-IDIOMA": {
    es: (p: { archivo: string; idioma: string; copia: string | null }) =>
      `--migrate: ${p.archivo} no declaraba idioma; ahora lleva "idioma": "${p.idioma}", el que ya usaba.${p.copia ? ` Copia: ${p.copia}` : ""}`,
    en: (p: { archivo: string; idioma: string; copia: string | null }) =>
      `--migrate: ${p.archivo} declared no language; it now has "idioma": "${p.idioma}", the one it was already using.${p.copia ? ` Copy: ${p.copia}` : ""}`,
  },
  "INIT-MIGRATE-NADA": {
    es: "--migrate: todos los proyectos ya tienen phase-gate.json con su idioma; nada que hacer.",
    en: "--migrate: all the projects already have phase-gate.json with their language; nothing to do.",
  },
  "INIT-CANDADO-DE-PUSH": {
    es: `Candado opcional para git push (init no lo instala; de menos a más firme):
  1. Claude Code: reglas deny en ~/.claude/settings.json, para las dos herramientas de terminal:
       "permissions": { "deny": ["Bash(git push *)", "PowerShell(git push *)"] }
     La de PowerShell hace falta en Windows. No son una frontera de seguridad: \`git -C . push\` las esquiva.
  2. Un hook pre-push de git que rechace el push. Más firme, aunque \`git push --no-verify\` lo salta (y el
     prompt de la Fase 4 prohíbe usarlo).
  3. La única frontera real está en el remoto: protección de ramas (en GitHub, un ruleset), o que el entorno
     del agente no tenga credenciales para hacer push.`,
    en: `Optional lock for git push (init does not install it; from weakest to firmest):
  1. Claude Code: deny rules in ~/.claude/settings.json, for both terminal tools:
       "permissions": { "deny": ["Bash(git push *)", "PowerShell(git push *)"] }
     The PowerShell one is needed on Windows. They are not a security boundary: \`git -C . push\` gets around them.
  2. A git pre-push hook that rejects the push. Firmer, although \`git push --no-verify\` skips it (and the
     Phase 4 prompt forbids using it).
  3. The only real boundary is on the remote: branch protection (on GitHub, a ruleset), or an agent
     environment without credentials to push.`,
  },
  "INIT-SIN-CLIENTES": {
    es: (p: { bloque: string }) => "No encontré ningún cliente MCP (Claude Code, Cursor ni VS Code). Para registrarlo a mano, en el mcp.json de tu cliente:\n" + p.bloque,
    en: (p: { bloque: string }) => "I found no MCP client (Claude Code, Cursor or VS Code). To register it by hand, in your client's mcp.json:\n" + p.bloque,
  },
  "INIT-DRY-RUN-FIN": {
    es: "--dry-run: no se escribió nada.",
    en: "--dry-run: nothing was written.",
  },
} satisfies Catalogo;
