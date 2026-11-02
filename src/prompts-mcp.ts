// The phase commands (/f1…/fN) served as MCP Prompts. Copies of each command in the folder of every client
// and every machine went out of sync; served by the server, they reach any client that shows prompts and
// arrive with each version.
//
// The text of each command lives in `comandos/fN.md` inside a prompts layer (the factory ones in
// prompts/es/comandos/), and is resolved by layers like the phases: the highest one that has it wins. A
// phase without a command, such as a phase 6 of one's own, gets a generic text that works the same.
//
// The prompt does NOT include the phase prompt: it stays orchestration ("call get_phase_prompt(N)…").
// Returning the phase text right away would save a call, but it would create two ways of receiving the
// same prompt, and in one of them the gate would not receive the `project`.

import type { McpServer, RegisteredPrompt } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import { z } from "zod";

import { capasDeCuerpos, rutasDeCuerpos } from "./capas.js";
import { promptsLayers } from "./config.js";
import { idiomaDeMensajes, mensaje } from "./i18n/mensajes.js";
import { log } from "./log.js";
import { findProjectFolder } from "./paths.js";
import { proyectoPorRaices } from "./roots.js";
import { discoverPhases, parsePhaseFile, resolveCommandFile } from "./phases.js";
import type { Idioma } from "./vocabulario.js";

// All the arguments are optional: the text of each command already asks for what is missing, and so the
// prompt also works in clients that split the arguments by spaces (a long context can be pasted after the
// command, as normal chat text).
//
// The titles, descriptions, arguments and the generic text are in the language the server started with:
// the list of prompts is fixed on connecting, like the tools'.
export function argumentosDeFase(numero: number, idioma: Idioma = "es") {
  const project = z.string().optional().describe(mensaje("MCPPROMPT-ARG-PROJECT", {}, idioma));
  if (numero === 1) {
    return {
      project,
      task_name: z.string().optional().describe(mensaje("MCPPROMPT-ARG-TASK-NAME", {}, idioma)),
      contexto: z.string().optional().describe(mensaje("MCPPROMPT-ARG-CONTEXTO", {}, idioma)),
    };
  }
  if (numero === 5) {
    return {
      project,
      commits: z.string().optional().describe(mensaje("MCPPROMPT-ARG-COMMITS", {}, idioma)),
    };
  }
  return { project };
}

export function tituloDePrompt(numero: number, titulo: string, idioma: Idioma = "es"): string {
  return mensaje("MCPPROMPT-TITULO", { numero, titulo }, idioma);
}

export function descripcionDePrompt(numero: number, titulo: string, idioma: Idioma = "es"): string {
  return mensaje("MCPPROMPT-DESCRIPCION", { numero, titulo }, idioma);
}

// The command of a phase without comandos/fN.md. eject and init also write it, passing the language that
// applies to them; without it, Spanish.
export function textoGenerico(numero: number, titulo: string, idioma: Idioma = "es"): string {
  return mensaje("MCPPROMPT-GENERICO", { numero, titulo }, idioma);
}

type Argumentos = {
  project?: string | undefined;
  task_name?: string | undefined;
  commits?: string | undefined;
  contexto?: string | undefined;
};

// The section with what came as an argument. Only the lines of the ones that came appear, and with none the
// section does not exist: so the text stays the same as the hand-written command.
function datosDeInvocacion(args: Argumentos, idioma: Idioma): string | null {
  const presente = (valor: string | undefined): valor is string => typeof valor === "string" && valor.trim() !== "";
  const lineas: string[] = [];

  // project, task_name and commits are one line: the line breaks are flattened, so that a value cannot open
  // new sections inside the text. The context is multiline by nature, and goes as it is: the person writes
  // it, as if pasting it in the chat.
  const enUnaLinea = (valor: string): string => valor.replace(/\s+/g, " ").trim();
  if (presente(args.project)) lineas.push(`- project: ${enUnaLinea(args.project)}`);
  if (presente(args.task_name)) lineas.push(`- task_name: ${enUnaLinea(args.task_name)}`);
  if (presente(args.commits)) lineas.push(`- commits: ${enUnaLinea(args.commits)}`);
  if (presente(args.contexto)) lineas.push("- initial_context:", "", args.contexto.trim());

  return lineas.length ? [mensaje("MCPPROMPT-DATOS-ENCABEZADO", {}, idioma), ...lineas].join("\n") : null;
}

// The text is read on every call, like the phase prompts: editing a command does not require a restart.
export function textoDelComando(numero: number, titulo: string, args: Argumentos, capas: string[] = promptsLayers(), idioma: Idioma = "es"): string {
  const archivo = resolveCommandFile(numero, capas);

  let cuerpo: string;
  if (archivo) {
    try {
      cuerpo = parsePhaseFile(archivo).cuerpo.trim();
    } catch (error) {
      log("warning", mensaje("MCPPROMPT-LOG-COMANDO-ILEGIBLE", { archivo, error: error instanceof Error ? error.message : String(error) }));
      cuerpo = textoGenerico(numero, titulo, idioma);
    }
  } else {
    cuerpo = textoGenerico(numero, titulo, idioma);
  }

  const datos = datosDeInvocacion(args, idioma);
  return datos ? `${cuerpo}\n\n${datos}` : cuerpo;
}

// The layers a command's text comes from. The list of prompts does not depend on any project (layers
// without a project), but when one is requested with `project` the text comes from the layers of that
// project: a project can have its own comandos/f4.md. A project that does not exist, or one with a broken
// manifest, does not prevent delivering the command: the one of the layers without a project is used.
export function capasDelComando(project: string | undefined): string[] {
  if (project?.trim()) {
    try {
      const carpeta = findProjectFolder(project);
      if (carpeta) return rutasDeCuerpos(capasDeCuerpos(carpeta));
    } catch {
      // The command is delivered anyway; the real error will come from the tool that uses the project.
    }
  }
  return promptsLayers();
}

// ─── Dynamic registration ───────────────────────────────────────────────────
// The phases are discovered from files, so the prompts are too: a phase 6 that appears in a layer of one's
// own gets its /f6, and a phase that disappears loses its own. Each registerPrompt, update and remove of
// the SDK emits prompts/list_changed on its own.
type Registro = { prompt: RegisteredPrompt; titulo: string; comando: string | null };

const registros = new WeakMap<McpServer, Map<number, Registro>>();

// The language of the /fN of each server: that of its first synchronization (the one in crearServidor).
// The following ones, after each tool or when a layer changes, keep it.
const idiomas = new WeakMap<McpServer, Idioma>();

function registrar(mcp: McpServer, numero: number, titulo: string, idioma: Idioma): RegisteredPrompt {
  return mcp.registerPrompt(
    `f${numero}`,
    {
      title: tituloDePrompt(numero, titulo, idioma),
      description: descripcionDePrompt(numero, titulo, idioma),
      argsSchema: argumentosDeFase(numero, idioma),
    },
    async (args: Argumentos): Promise<GetPromptResult> => {
      // The title is taken from the current registry: it may have changed since it was registered.
      const vigente = registros.get(mcp)?.get(numero)?.titulo ?? titulo;
      // Without project, that of the open folder: the command comes from its layers and the model receives its
      // name in the invocation-data section, to pass it on to the tools.
      let datos = args;
      if (!args.project?.trim()) {
        const porRaices = await proyectoPorRaices(mcp);
        if (porRaices.tipo === "unico") datos = { ...args, project: porRaices.carpetaProyecto };
      }
      return {
        description: descripcionDePrompt(numero, vigente, idioma),
        messages: [{ role: "user", content: { type: "text", text: textoDelComando(numero, vigente, datos, capasDelComando(datos.project), idioma) } }],
      };
    }
  );
}

// Never throws: it is called after each tool, and a prompt that could not be registered must not turn the
// response of a tool that went well into an error. `idioma`, that of the /fN: without it, that of the first
// synchronization of this server (and, if this is the first, that of the messages).
export function sincronizarPrompts(mcp: McpServer, idioma?: Idioma): void {
  const delServidor = idioma ?? idiomas.get(mcp) ?? idiomaDeMensajes();
  idiomas.set(mcp, delServidor);
  try {
    const capas = promptsLayers(delServidor); // the titles of the phases, in the language of the /fN
    const fases = discoverPhases(capas);
    let actuales = registros.get(mcp);
    if (!actuales) {
      actuales = new Map();
      registros.set(mcp, actuales);
    }

    for (const [numero, registro] of [...actuales]) {
      if (!fases.has(numero)) {
        registro.prompt.remove();
        actuales.delete(numero);
      }
    }

    for (const [numero, datos] of fases) {
      const comando = resolveCommandFile(numero, capas);
      const registro = actuales.get(numero);

      if (!registro) {
        actuales.set(numero, { prompt: registrar(mcp, numero, datos.title, delServidor), titulo: datos.title, comando });
        continue;
      }

      if (registro.titulo !== datos.title || registro.comando !== comando) {
        registro.titulo = datos.title;
        registro.comando = comando;
        registro.prompt.update({
          title: tituloDePrompt(numero, datos.title, delServidor),
          description: descripcionDePrompt(numero, datos.title, delServidor),
        });
      }
    }
  } catch (error) {
    log("warning", mensaje("MCPPROMPT-LOG-SINCRONIZAR", { error: error instanceof Error ? error.message : String(error) }));
  }
}

// The `prompts` capability can only be declared before connecting. If at startup there is no phase (an
// empty or badly configured prompts folder), the first /fN to appear later would try to declare it with the
// connection open and the SDK would reject it. Registering and removing a prompt in passing leaves the
// capability declared without the list having anything.
export function asegurarCapacidadDePrompts(mcp: McpServer): void {
  if ((registros.get(mcp)?.size ?? 0) > 0) return;
  // A name that no phase can have: the phases are registered as f<number>.
  mcp.registerPrompt("phase-gate-provisional", { description: "provisional" }, async () => ({ messages: [] })).remove();
}

// ─── Watching the layers ────────────────────────────────────────────────────
// An opportunistic improvement: with fs.watch, a new command or phase shows up without waiting for the next
// call to a tool. On OneDrive and some network drives fs.watch does not notify, so what guarantees the
// result is the synchronization after each tool, not this. The watchers do not keep the process alive
// (unref) and are closed with the server.
export function vigilarCapas(mcp: McpServer, esperaMs = 300): () => void {
  const vigilantes: fs.FSWatcher[] = [];
  let temporizador: NodeJS.Timeout | null = null;

  const programar = (): void => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      temporizador = null;
      sincronizarPrompts(mcp);
    }, esperaMs);
    temporizador.unref();
  };

  for (const capa of promptsLayers()) {
    if (!fs.statSync(capa, { throwIfNoEntry: false })?.isDirectory()) continue;
    try {
      const vigilante = fs.watch(capa, { recursive: true, persistent: false }, programar);
      vigilante.on("error", () => vigilante.close());
      vigilantes.push(vigilante);
    } catch {
      // No watching in this layer: the synchronization after each tool still covers it.
    }
  }

  return () => {
    if (temporizador) clearTimeout(temporizador);
    for (const vigilante of vigilantes) vigilante.close();
  };
}
