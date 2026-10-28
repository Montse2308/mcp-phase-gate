// El registro de sesiones MCP abiertas (§7.4 del plan): para que el Studio, que es otro proceso y no ve
// las raíces de ninguna sesión, pueda decir "Claude Code tiene abierto PROYECTO-A".
//
// Cada servidor MCP por stdio deja `<stateDir>/sesiones/<pid>.json`:
//   { "pid": 1234, "cliente": "claude-code 2.1.0", "raices": [...], "proyecto": "PROYECTO-A",
//     "rutas": { "documentacion": "...", ... }, "desde": "<ISO>", "actualizado": "<ISO>" }
// Se escribe al conocer las raíces (al terminar el initialize y tras cada roots/list_changed) y se
// refresca como mucho una vez por minuto; se borra al salir (exit, SIGINT, SIGTERM y cuando el cliente
// cierra stdin). Es estado efímero y solo informativo: no guarda nada de la conversación, y escribirlo
// nunca tumba el servidor ni retrasa una respuesta (va en segundo plano, y un fallo solo se anota).
//
// Quien lo lee (el Studio) lo trata como entrada no confiable, porque lo escriben otros procesos: el
// nombre tiene que ser un entero positivo, el contenido cuadrar con un shape zod y medir poco, el pid
// seguir vivo y `actualizado` ser de hace menos de 10 minutos. Lo demás se ignora y, si se pide, se borra
// sin seguir enlaces.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

import { CLAVE_EN_MAQUINA, leerVariable, stateDir } from "./config.js";
import { mensaje } from "./i18n/mensajes.js";
import { log } from "./log.js";
import { alRecibirRaices, resolverPorRaices } from "./roots.js";

export const CARPETA_DE_SESIONES = "sesiones";
export const INTERVALO_MS = 60_000;
export const CADUCIDAD_MS = 10 * 60_000;
export const TAMANO_MAXIMO = 16 * 1024;
const MAX_RAICES = 20;
// Un tope por ruta, para que el registro siga cabiendo en TAMANO_MAXIMO.
const MAX_RUTA = 1024;
const NOMBRE = /^([1-9]\d{0,9})\.json$/;

export function carpetaDeSesiones(): string {
  return path.join(stateDir(), CARPETA_DE_SESIONES);
}

// Las rutas con las que arrancó el servidor, tal como llegaron en su entorno: las de machine.json no se
// anotan, porque cambian sin reiniciarlo. Opcional, porque las sesiones de un servidor 3.x no la llevan.
export const RutasDeSesion = z
  .object({
    documentacion: z.string().max(MAX_RUTA).optional(),
    carpetaDeRepos: z.string().max(MAX_RUTA).optional(),
    subcarpetaTareas: z.string().max(MAX_RUTA).optional(),
  })
  .strict();
export type RutasDeSesion = z.infer<typeof RutasDeSesion>;

export const SesionArchivo = z
  .object({
    pid: z.number().int().positive(),
    cliente: z.string().max(200),
    raices: z.array(z.string().max(1024)).max(MAX_RAICES),
    proyecto: z.string().max(200).nullable(),
    rutas: RutasDeSesion.optional(),
    desde: z.iso.datetime(),
    actualizado: z.iso.datetime(),
  })
  .strict();
export type SesionArchivo = z.infer<typeof SesionArchivo>;

// ─── Escribir (el servidor MCP) ─────────────────────────────────────────────
// Lo que este proceso recibió de su entorno (el bloque "env" del cliente o el .env) para sus tres rutas. Es lo
// que no cambia mientras el proceso vive, y lo que Ajustes compara con machine.json. Una ruta más larga que
// el tope no se anota.
export function rutasDelEntorno(): RutasDeSesion | undefined {
  const rutas: RutasDeSesion = {};
  for (const [logica, clave] of Object.entries(CLAVE_EN_MAQUINA) as ["DOCS_PATH" | "REPOS_PATH" | "TASKS_SUBDIR", keyof RutasDeSesion][]) {
    const { valor, fuente } = leerVariable(logica);
    if (valor === undefined || (fuente !== "entorno" && fuente !== ".env") || valor.length > MAX_RUTA) continue;
    rutas[clave] = valor;
  }
  return Object.keys(rutas).length ? rutas : undefined;
}

export type Escritor = (ruta: string, contenido: string) => Promise<void>;

// Escritura atómica: un temporal que empieza por punto (el lector no lo toma por una sesión) y un rename.
export const escribirAtomico: Escritor = async (ruta, contenido) => {
  await fs.promises.mkdir(path.dirname(ruta), { recursive: true });
  const temporal = path.join(path.dirname(ruta), `.${path.basename(ruta)}.${crypto.randomBytes(4).toString("hex")}.tmp`);
  try {
    await fs.promises.writeFile(temporal, contenido, "utf-8");
    await fs.promises.rename(temporal, ruta);
  } catch (error) {
    await fs.promises.unlink(temporal).catch(() => {});
    throw error;
  }
};

export type OpcionesDeRegistro = {
  pid?: number;
  ahora?: () => Date;
  intervaloMs?: number;
  escribir?: Escritor;
  // Las rutas del entorno del servidor; sin ellas, las del proceso.
  rutas?: RutasDeSesion | undefined;
  // El proceso al que se enganchan la salida y las señales; los tests pasan uno falso.
  proceso?: Pick<NodeJS.Process, "on" | "once" | "exit"> & { stdin?: { on: (evento: string, oyente: () => void) => unknown } };
};

export type RegistroDeSesion = { escrituras: () => number; borrar: () => void; cerrar: () => void };

export function registrarSesion(mcp: McpServer, opciones: OpcionesDeRegistro = {}): RegistroDeSesion {
  const pid = opciones.pid ?? process.pid;
  const ahora = opciones.ahora ?? (() => new Date());
  const intervalo = opciones.intervaloMs ?? INTERVALO_MS;
  const escribir = opciones.escribir ?? escribirAtomico;
  const proceso = opciones.proceso ?? process;
  // Se leen al arrancar: lo que vino del entorno no cambia mientras el proceso vive.
  const rutas = "rutas" in opciones ? opciones.rutas : rutasDelEntorno();
  // La ruta se fija al arrancar: si el estado cambiara de sitio, el archivo que se borra es el escrito.
  let ruta: string | null = null;
  let datos: SesionArchivo | null = null;
  let ultima = 0;
  let pendiente: NodeJS.Timeout | null = null;
  let escrituras = 0;
  let avisado = false;
  let cerrado = false;

  const nombreDelCliente = (): string => {
    const version = mcp.server.getClientVersion();
    return (version ? `${version.name} ${version.version}` : mensaje("SESION-CLIENTE-SIN-NOMBRE")).slice(0, 200);
  };

  const volcar = (): void => {
    pendiente = null;
    if (cerrado || !datos) return;
    ultima = Date.now();
    // El cliente, al escribir: si las raíces llegaron antes de conocerlo, el siguiente refresco lo pone.
    datos = { ...datos, cliente: nombreDelCliente(), actualizado: ahora().toISOString() };
    escrituras++;
    try {
      ruta ??= path.join(carpetaDeSesiones(), `${pid}.json`);
    } catch (error) {
      if (!avisado) log("warning", mensaje("SESION-NO-REGISTRADA", { detalle: error instanceof Error ? error.message : String(error) }));
      avisado = true;
      return;
    }
    escribir(ruta, `${JSON.stringify(datos, null, 2)}\n`).catch((error: unknown) => {
      // Una vez: el servidor sigue igual, y el Studio solo dejará de ver esta sesión.
      if (!avisado) log("warning", mensaje("SESION-NO-REGISTRADA", { detalle: error instanceof Error ? error.message : String(error) }));
      avisado = true;
    });
  };

  // Como mucho una escritura por intervalo; un cambio dentro del intervalo se escribe al acabarlo.
  const programar = (): void => {
    if (cerrado || pendiente) return;
    const espera = ultima + intervalo - Date.now();
    if (espera <= 0) {
      volcar();
      return;
    }
    pendiente = setTimeout(volcar, espera);
    pendiente.unref();
  };

  alRecibirRaices(mcp, (raices) => {
    let proyecto: string | null = null;
    try {
      const resolucion = resolverPorRaices(raices);
      proyecto = resolucion.tipo === "unico" ? resolucion.carpetaProyecto : null;
    } catch {
      proyecto = null; // sin Documentación configurada no hay proyecto que deducir
    }
    const cliente = nombreDelCliente();
    const momento = ahora().toISOString();
    datos = {
      pid,
      cliente,
      raices: raices.slice(0, MAX_RAICES).map((r) => r.slice(0, 1024)),
      proyecto: proyecto ? proyecto.slice(0, 200) : null,
      ...(rutas ? { rutas } : {}),
      desde: datos?.desde ?? momento,
      actualizado: momento,
    };
    programar();
  });

  // Refresco: sin él, una sesión larga parecería caducada a los 10 minutos.
  const refresco = setInterval(() => {
    if (datos) programar();
  }, intervalo);
  refresco.unref();

  const borrar = (): void => {
    if (!ruta) return;
    try {
      fs.unlinkSync(ruta);
    } catch {
      // ya no estaba, o no se puede: el Studio lo limpiará por pid
    }
  };
  const cerrar = (): void => {
    cerrado = true;
    clearInterval(refresco);
    if (pendiente) clearTimeout(pendiente);
    borrar();
  };

  proceso.on("exit", cerrar);
  // Con un oyente de SIGINT o SIGTERM, Node ya no sale solo: se sale con el código de la señal.
  proceso.once("SIGINT", () => {
    cerrar();
    proceso.exit(130);
  });
  proceso.once("SIGTERM", () => {
    cerrar();
    proceso.exit(143);
  });
  proceso.stdin?.on("end", cerrar);

  return { escrituras: () => escrituras, borrar, cerrar };
}

// ─── Leer (el Studio) ───────────────────────────────────────────────────────
// ¿Sigue vivo el proceso? kill(pid, 0) no manda ninguna señal: solo comprueba. EPERM es que existe y es
// de otro usuario: vivo. Un pid reutilizado por otro programa también da "vivo"; para eso está la
// caducidad de 10 minutos.
export function pidVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "EPERM";
  }
}

export type SesionAbierta = { pid: number; cliente: string; proyecto: string | null; rutas?: RutasDeSesion; desde: string; actualizado: string };

export type OpcionesDeLectura = { ahora?: () => number; vivo?: (pid: number) => boolean; borrar?: boolean };

// Borra una entrada sin seguir enlaces: unlink quita el enlace o el archivo; una junction de Windows se
// quita con rmdir (no recursivo: nunca toca su destino). Una carpeta de verdad no se borra.
function borrarEntrada(ruta: string): void {
  try {
    const info = fs.lstatSync(ruta);
    if (info.isDirectory() && !info.isSymbolicLink()) return;
    try {
      fs.unlinkSync(ruta);
    } catch (error) {
      if (info.isSymbolicLink() && ["EPERM", "EISDIR"].includes((error as NodeJS.ErrnoException)?.code ?? "")) fs.rmdirSync(ruta);
      else throw error;
    }
  } catch {
    // otro proceso ya la quitó, o no se puede: se intentará la próxima vez
  }
}

function leerSesion(ruta: string, pid: number): SesionArchivo | null {
  let descriptor: number;
  try {
    descriptor = fs.openSync(ruta, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  } catch {
    return null;
  }
  try {
    const info = fs.fstatSync(descriptor);
    if (!info.isFile() || info.size > TAMANO_MAXIMO) return null;
    const buffer = Buffer.alloc(TAMANO_MAXIMO + 1);
    const leidos = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    if (leidos > TAMANO_MAXIMO) return null;
    const crudo: unknown = JSON.parse(buffer.subarray(0, leidos).toString("utf-8"));
    const leido = SesionArchivo.safeParse(crudo);
    return leido.success && leido.data.pid === pid ? leido.data : null;
  } catch {
    return null;
  } finally {
    fs.closeSync(descriptor);
  }
}

// Un temporal de una escritura en curso no se toca; uno de hace más de un minuto es de un proceso que
// murió escribiendo.
const TEMPORAL = /^\.[1-9]\d{0,9}\.json\.[0-9a-f]+\.tmp$/;

export function sesionesAbiertas(opciones: OpcionesDeLectura = {}): SesionAbierta[] {
  const ahora = opciones.ahora ?? Date.now;
  const vivo = opciones.vivo ?? pidVivo;
  const carpeta = carpetaDeSesiones();
  let entradas: fs.Dirent[];
  try {
    entradas = fs.readdirSync(carpeta, { withFileTypes: true });
  } catch {
    return [];
  }

  const abiertas: SesionAbierta[] = [];
  for (const entrada of entradas.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const ruta = path.join(carpeta, entrada.name);
    const descartar = (): void => {
      if (opciones.borrar) borrarEntrada(ruta);
    };
    if (TEMPORAL.test(entrada.name)) {
      const edad = ahora() - (fs.lstatSync(ruta, { throwIfNoEntry: false })?.mtimeMs ?? ahora());
      if (edad > INTERVALO_MS) descartar();
      continue;
    }
    const nombre = entrada.name.match(NOMBRE);
    let info: fs.Stats | undefined;
    try {
      info = fs.lstatSync(ruta);
    } catch {
      continue;
    }
    if (!nombre || !info.isFile() || info.size > TAMANO_MAXIMO) {
      descartar();
      continue;
    }
    const pid = Number(nombre[1]);
    const sesion = leerSesion(ruta, pid);
    const edad = sesion ? ahora() - Date.parse(sesion.actualizado) : Infinity;
    // Una fecha en el futuro (más de un minuto) tampoco vale: no se puede saber cuándo caduca.
    if (!sesion || edad > CADUCIDAD_MS || edad < -INTERVALO_MS || !vivo(pid)) {
      descartar();
      continue;
    }
    abiertas.push({ pid, cliente: sesion.cliente, proyecto: sesion.proyecto, ...(sesion.rutas ? { rutas: sesion.rutas } : {}), desde: sesion.desde, actualizado: sesion.actualizado });
  }
  return abiertas;
}
