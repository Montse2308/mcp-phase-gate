// Los comandos de fase (/f1…/fN) servidos como MCP Prompts. Antes había que copiar cada comando a
// mano en la carpeta de cada cliente y de cada equipo, y las copias se desincronizaban; ahora el
// servidor los ofrece a cualquier cliente que muestre prompts, y llegan con cada versión.
//
// El texto de cada comando vive en `comandos/fN.md` dentro de una capa de prompts (los de fábrica
// en prompts/es/comandos/), y se resuelve por capas como las fases: gana la más alta que lo tenga.
// Una fase sin comando, como una fase-6 propia, recibe un texto genérico que funciona igual.
//
// El prompt NO incluye el prompt de la fase: sigue siendo orquestación ("llama a
// get_phase_prompt(N)…"). Devolver ya el texto de la fase ahorraría una llamada, pero crearía dos
// caminos para recibir el mismo prompt, y en uno la compuerta no recibiría el `project`.

import type { McpServer, RegisteredPrompt } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import { z } from "zod";

import { promptsLayers } from "./config.js";
import { log } from "./log.js";
import { discoverPhases, parsePhaseFile, resolveCommandFile } from "./phases.js";

// Todos los argumentos son opcionales: el texto de cada comando ya pide lo que falte, y así el
// prompt sirve también en clientes que parten los argumentos por espacios (un contexto largo puede
// ir pegado después del comando, como texto normal del chat).
const PROJECT = z.string().optional().describe("Proyecto en el que estás trabajando.");

export function argumentosDeFase(numero: number) {
  if (numero === 1) {
    return {
      project: PROJECT,
      task_name: z.string().optional().describe("Nombre corto de la tarea nueva."),
      contexto: z.string().optional().describe("El correo, mensaje o requerimiento completo."),
    };
  }
  if (numero === 5) {
    return {
      project: PROJECT,
      commits: z
        .string()
        .optional()
        .describe("Rango de commits a auditar. Si lo omites, se toman de los recibos de la Fase 4."),
    };
  }
  return { project: PROJECT };
}

export function tituloDePrompt(numero: number, titulo: string): string {
  return `Fase ${numero} · ${titulo}`;
}

export function descripcionDePrompt(numero: number, titulo: string): string {
  return `Arranca la Fase ${numero} (${titulo}) del flujo de mcp-phase-gate.`;
}

export function textoGenerico(numero: number, titulo: string): string {
  return [
    `Vas a iniciar la FASE ${numero} (${titulo}) del flujo del mcp-phase-gate.`,
    "",
    "Pasos:",
    "1. Si no sabes cuál es la tarea activa, llama a `get_active_task` (o pídeme project + task_name).",
    `2. Llama a \`get_phase_prompt(${numero})\` indicándole también el \`project\` en el que estoy trabajando, y asume ese rol.`,
    "3. Lee los documentos de las fases anteriores con `read_central_doc`; `get_phase_prompt` te dio sus nombres exactos.",
    "4. Sigue el prompt de la fase y guarda su documento con `write_central_doc`, con el nombre que te indicó `get_phase_prompt`.",
  ].join("\n");
}

type Argumentos = {
  project?: string | undefined;
  task_name?: string | undefined;
  commits?: string | undefined;
  contexto?: string | undefined;
};

// La sección con lo que vino como argumento. Solo aparecen las líneas de los que vinieron, y sin
// ninguno la sección no existe: así el texto queda igual que el comando escrito a mano.
function datosDeInvocacion(args: Argumentos): string | null {
  const presente = (valor: string | undefined): valor is string => typeof valor === "string" && valor.trim() !== "";
  const lineas: string[] = [];

  // project, task_name y commits son de una línea: los saltos se aplanan, para que un valor no
  // pueda abrir secciones nuevas dentro del texto. El contexto sí es multilínea por naturaleza, y
  // va tal cual: lo escribe la persona, igual que si lo pegara en el chat.
  const enUnaLinea = (valor: string): string => valor.replace(/\s+/g, " ").trim();
  if (presente(args.project)) lineas.push(`- project: ${enUnaLinea(args.project)}`);
  if (presente(args.task_name)) lineas.push(`- task_name: ${enUnaLinea(args.task_name)}`);
  if (presente(args.commits)) lineas.push(`- commits: ${enUnaLinea(args.commits)}`);
  if (presente(args.contexto)) lineas.push("- initial_context:", "", args.contexto.trim());

  return lineas.length ? ["## Datos de esta invocación", ...lineas].join("\n") : null;
}

// El texto se lee en cada llamada, como los prompts de fase: editar un comando no exige reiniciar.
export function textoDelComando(numero: number, titulo: string, args: Argumentos, capas: string[] = promptsLayers()): string {
  const archivo = resolveCommandFile(numero, capas);

  let cuerpo: string;
  if (archivo) {
    try {
      cuerpo = parsePhaseFile(archivo).cuerpo.trim();
    } catch (error) {
      log("warning", `No se pudo leer ${archivo}; se usa el texto genérico: ${error instanceof Error ? error.message : String(error)}`);
      cuerpo = textoGenerico(numero, titulo);
    }
  } else {
    cuerpo = textoGenerico(numero, titulo);
  }

  const datos = datosDeInvocacion(args);
  return datos ? `${cuerpo}\n\n${datos}` : cuerpo;
}

// ─── Registro dinámico ──────────────────────────────────────────────────────
// Las fases se descubren de los archivos, así que los prompts también: una fase-6 que aparece en
// una capa propia gana su /f6, y una fase que desaparece pierde el suyo. Cada registerPrompt,
// update y remove del SDK emite prompts/list_changed por su cuenta.
type Registro = { prompt: RegisteredPrompt; titulo: string; comando: string | null };

const registros = new WeakMap<McpServer, Map<number, Registro>>();

function registrar(mcp: McpServer, numero: number, titulo: string): RegisteredPrompt {
  return mcp.registerPrompt(
    `f${numero}`,
    {
      title: tituloDePrompt(numero, titulo),
      description: descripcionDePrompt(numero, titulo),
      argsSchema: argumentosDeFase(numero),
    },
    async (args: Argumentos): Promise<GetPromptResult> => {
      // El título se toma del registro vigente: puede haber cambiado desde que se registró.
      const vigente = registros.get(mcp)?.get(numero)?.titulo ?? titulo;
      return {
        description: descripcionDePrompt(numero, vigente),
        messages: [{ role: "user", content: { type: "text", text: textoDelComando(numero, vigente, args) } }],
      };
    }
  );
}

// Nunca lanza: se llama tras cada tool, y un prompt que no se pudo registrar no debe convertir en
// error la respuesta de una tool que salió bien.
export function sincronizarPrompts(mcp: McpServer): void {
  try {
    const capas = promptsLayers();
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
        actuales.set(numero, { prompt: registrar(mcp, numero, datos.title), titulo: datos.title, comando });
        continue;
      }

      if (registro.titulo !== datos.title || registro.comando !== comando) {
        registro.titulo = datos.title;
        registro.comando = comando;
        registro.prompt.update({
          title: tituloDePrompt(numero, datos.title),
          description: descripcionDePrompt(numero, datos.title),
        });
      }
    }
  } catch (error) {
    log("warning", `No se pudieron sincronizar los prompts /fN: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// La capacidad `prompts` solo se puede declarar antes de conectar. Si al arrancar no hay ninguna
// fase (una carpeta de prompts vacía o mal configurada), el primer /fN que apareciera después
// intentaría declararla con la conexión abierta y el SDK lo rechazaría. Registrar y quitar un
// prompt de paso deja la capacidad declarada sin que la lista tenga nada.
export function asegurarCapacidadDePrompts(mcp: McpServer): void {
  if ((registros.get(mcp)?.size ?? 0) > 0) return;
  // Un nombre que ninguna fase puede tener: las fases se registran como f<número>.
  mcp.registerPrompt("phase-gate-provisional", { description: "provisional" }, async () => ({ messages: [] })).remove();
}

// ─── Vigilancia de las capas ────────────────────────────────────────────────
// Mejora oportunista: con fs.watch, un comando o una fase nueva aparece sin esperar a la siguiente
// llamada a una tool. En OneDrive y en algunas unidades de red fs.watch no avisa, y por eso lo que
// garantiza el resultado es la sincronización tras cada tool, no esto. Los vigilantes no mantienen
// vivo el proceso (unref) y se cierran con el servidor.
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
      // Sin vigilancia en esta capa: la sincronización tras cada tool sigue cubriéndola.
    }
  }

  return () => {
    if (temporizador) clearTimeout(temporizador);
    for (const vigilante of vigilantes) vigilante.close();
  };
}
