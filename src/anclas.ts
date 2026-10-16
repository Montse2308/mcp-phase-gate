// Las anclas de los lotes: lo que demuestra que un lote se hizo (§6.3 del plan maestro v3).
//
// Un lote con git se ancla a su commit, y el servidor comprueba que el commit exista, que esté en la
// rama actual y qué archivos toca. Sin git, se ancla al sha256 de un artefacto (el archivo que
// cambió) o a una nota. Todo pasa por la puerta única de git (git.ts) y por la contención de rutas de
// siempre (paths.ts): el servidor solo lee.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { DOCS, requireBasePath } from "./config.js";
import { archivosDeCommit, datosDeCommit, esAncestroDeHead, ramaActual, ramasQueContienen, resolverCommit } from "./git.js";
import { esSegmentoDeGit, estaDentroReal, rutaReal, validarSegmento } from "./paths.js";
import { etiquetaDeLote } from "./recibos.js";
import type { Ancla, Recibo } from "./recibos.js";
import { resolverRepo } from "./repos.js";

type AnclaCommit = Extract<Ancla, { tipo: "commit" }>;
type AnclaSha256 = Extract<Ancla, { tipo: "sha256" }>;

const lista = (elementos: string[]): string => elementos.map((e) => `\`${e}\``).join(", ");

// ─── Commit ─────────────────────────────────────────────────────────────────
// Una ruta de la tabla Archivos tal como la escribe una persona o un modelo: con comillas de código,
// con \, con ./ delante o absoluta dentro del repo. Se compara en la forma de git: relativa y con /.
export function normalizarArchivo(declarado: string, raizRepo: string): string {
  let ruta = declarado.trim().replace(/^`+|`+$/g, "").trim().replace(/\\/g, "/");
  if (path.win32.isAbsolute(ruta) || path.posix.isAbsolute(ruta)) {
    const relativa = path.relative(raizRepo, ruta);
    if (relativa && !relativa.startsWith("..") && !path.isAbsolute(relativa)) ruta = relativa.replace(/\\/g, "/");
  }
  return ruta.replace(/^(?:\.\/)+/, "").normalize("NFC");
}

// Es un aviso, no un bloqueo (decisión H5): queda escrito en el recibo y lo audita la Fase 5.
export function compararArchivos(delCommit: string[], declarados: string[], raizRepo: string): { texto: string; coinciden: boolean } {
  const enCommit = new Set(delCommit.map((archivo) => archivo.normalize("NFC")));
  const enRecibo = new Set(declarados.map((archivo) => normalizarArchivo(archivo, raizRepo)).filter(Boolean));
  const deMas = [...enCommit].filter((archivo) => !enRecibo.has(archivo)).sort();
  const deMenos = [...enRecibo].filter((archivo) => !enCommit.has(archivo)).sort();

  if (deMas.length === 0 && deMenos.length === 0) {
    const n = enCommit.size;
    const texto =
      n === 0
        ? "El commit no toca ningún archivo y el recibo no declara ninguno."
        : n === 1
          ? "El commit toca exactamente el archivo declarado."
          : `El commit toca exactamente los ${n} archivos declarados.`;
    return { texto, coinciden: true };
  }

  const lineas: string[] = [];
  if (deMas.length) lineas.push(`En el commit y no en el recibo: ${lista(deMas)}.`);
  if (deMenos.length) lineas.push(`En el recibo y no en el commit: ${lista(deMenos)}.`);
  return { texto: lineas.join("\n"), coinciden: false };
}

export type OtroLote = { lote: number; sha: string };

export async function anclarCommit(
  proyecto: string,
  repoId: string,
  sha: string,
  archivosDeclarados: string[],
  otros: OtroLote[] = [],
  ahora: () => Date = () => new Date()
): Promise<{ ancla: AnclaCommit; verificacionDelCommit: string; coinciden: boolean }> {
  const repo = resolverRepo(proyecto, repoId);
  const dir = repo.ruta!;

  const resuelto = await resolverCommit(dir, sha);
  if (!resuelto.ok) {
    if (resuelto.motivo === "formato") throw new Error("El commit tiene que ser un hash de 7 a 40 caracteres hexadecimales.");
    if (resuelto.motivo === "ambiguo") throw new Error(`El hash \`${sha}\` es ambiguo en \`${repoId}\`; usa más caracteres.`);
    throw new Error(`El commit \`${sha}\` no existe en el repo \`${repoId}\` (\`${dir}\`). ¿Se hizo en otro repositorio o todavía no se ha hecho?`);
  }
  const completo = resuelto.sha;
  const corto = completo.slice(0, 7);

  // Un commit, un lote. Un recibo manual de la 2.x puede guardar solo el hash corto.
  const repetido = otros.find((otro) => otro.sha && completo.startsWith(otro.sha.toLowerCase()));
  if (repetido) throw new Error(`El commit \`${corto}\` ya es el ancla de ${etiquetaDeLote(repetido.lote)}. Cada lote es un commit.`);

  const rama = await ramaActual(dir);
  const ancestro = await esAncestroDeHead(dir, completo);
  if (ancestro.resultado === "no") {
    const ramas = await ramasQueContienen(dir, completo);
    const donde = ramas.length ? lista(ramas) : "ninguna rama local";
    throw new Error(
      `El commit \`${corto}\` existe pero no está en la rama actual (\`${rama ?? "HEAD separado"}\`); está en: ${donde}. ` +
        "Cambia a la rama del trabajo o registra el commit correcto."
    );
  }
  if (ancestro.resultado === "error") throw new Error(`No se pudo comprobar si \`${corto}\` está en la rama actual de \`${repoId}\`: ${ancestro.salida}`);

  const datos = await datosDeCommit(dir, completo);
  const comparacion = compararArchivos(await archivosDeCommit(dir, completo), archivosDeclarados, dir);

  return {
    ancla: { tipo: "commit", repo: repoId, sha: completo, corto: datos.corto || corto, asunto: datos.asunto, rama: rama ?? "", verificado: ahora().toISOString() },
    verificacionDelCommit: comparacion.texto,
    coinciden: comparacion.coinciden,
  };
}

// ─── Artefacto (sha256) ─────────────────────────────────────────────────────
export const TOPE_DE_ARTEFACTO = 256 * 1024 * 1024;

// La ruta de un artefacto dentro de su base, con la contención de read_repo_file: relativa, cada
// segmento portable (sin "..", sin ":" de un flujo alterno, sin nombres reservados), nada de .git, ni en
// lo pedido ni en la ruta real (un enlace o un nombre corto 8.3 como GIT~1), y dentro de la base real.
export function rutaDeArtefacto(base: string, relativa: string): { ruta: string; segmentos: string[] } {
  if (path.win32.isAbsolute(relativa) || path.posix.isAbsolute(relativa)) {
    throw new Error(`\`artifact_path\` no puede ser una ruta absoluta ("${relativa}"): es relativa a la raíz del repo o del proyecto.`);
  }
  const segmentos = relativa.split(/[\\/]/);
  for (const segmento of segmentos) {
    validarSegmento(segmento, "artifact_path");
    if (esSegmentoDeGit(segmento)) throw new Error(`\`artifact_path\` no puede entrar en .git ni sellar archivos de git ("${relativa}").`);
  }
  const ruta = path.join(base, ...segmentos);
  if (!estaDentroReal(base, ruta)) throw new Error(`Acceso denegado: \`artifact_path\` "${relativa}" queda fuera de su carpeta.`);
  const real = path.relative(rutaReal(base), rutaReal(ruta));
  if (real.split(/[\\/]/).some(esSegmentoDeGit)) throw new Error(`Acceso denegado: \`artifact_path\` "${relativa}" lleva a .git a través de un enlace.`);
  return { ruta, segmentos };
}

type Conversion = "ninguna" | "crlf-a-lf" | "lf-a-crlf";

// Convierte los finales de línea de un trozo, con el estado del trozo anterior (un \r al final de un
// trozo puede ir seguido de un \n al principio del siguiente).
function convertidor(conversion: Conversion): { trozo: (b: Buffer) => Buffer; fin: () => Buffer } {
  if (conversion === "ninguna") return { trozo: (b) => b, fin: () => Buffer.alloc(0) };
  let anterior = -1;
  if (conversion === "crlf-a-lf") {
    let crPendiente = false;
    return {
      trozo: (b) => {
        const salida: number[] = [];
        for (const byte of b) {
          if (crPendiente) {
            crPendiente = false;
            if (byte !== 0x0a) salida.push(0x0d);
          }
          if (byte === 0x0d) crPendiente = true;
          else salida.push(byte);
        }
        return Buffer.from(salida);
      },
      fin: () => (crPendiente ? Buffer.from([0x0d]) : Buffer.alloc(0)),
    };
  }
  return {
    trozo: (b) => {
      const salida: number[] = [];
      for (const byte of b) {
        if (byte === 0x0a && anterior !== 0x0d) salida.push(0x0d);
        salida.push(byte);
        anterior = byte;
      }
      return Buffer.from(salida);
    },
    fin: () => Buffer.alloc(0),
  };
}

// El sha256 en streaming, del mismo descriptor que se comprobó: tipo y tamaño salen del archivo abierto,
// no de un stat aparte. Un archivo que crece mientras se lee y pasa del tope se rechaza igual.
// `mostrar` es como se nombra en los mensajes (repo:api/docs/x.md): la ruta absoluta no le dice nada al
// modelo y enseña la del equipo.
export async function sha256DeArchivo(ruta: string, conversion: Conversion = "ninguna", mostrar: string = ruta): Promise<{ sha256: string; bytes: number }> {
  let descriptor: number;
  try {
    descriptor = fs.openSync(ruta, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  } catch (error: any) {
    if (error?.code === "ENOENT") throw new Error(`El artefacto \`${mostrar}\` no existe.`);
    if (error?.code === "EISDIR") throw new Error(`\`${mostrar}\` es una carpeta: solo se sellan archivos.`);
    throw error;
  }

  const stream = fs.createReadStream(ruta, { fd: descriptor, autoClose: true });
  try {
    const info = fs.fstatSync(descriptor);
    if (!info.isFile()) throw new Error(`\`${mostrar}\` no es un archivo normal: solo se sellan archivos.`);
    if (info.size > TOPE_DE_ARTEFACTO) throw new Error(textoDeTope(info.size));

    const hash = crypto.createHash("sha256");
    const convertir = convertidor(conversion);
    let bytes = 0;
    for await (const trozo of stream as AsyncIterable<Buffer>) {
      bytes += trozo.length;
      if (bytes > TOPE_DE_ARTEFACTO) throw new Error(textoDeTope(bytes));
      hash.update(convertir.trozo(trozo));
    }
    hash.update(convertir.fin());
    return { sha256: hash.digest("hex"), bytes };
  } finally {
    stream.destroy();
  }
}

function textoDeTope(bytes: number): string {
  return `El artefacto pesa ${(bytes / 1_048_576).toFixed(1)} MB (${bytes} bytes); el máximo para sellarlo es 256 MB.`;
}

// La base de un artefacto: la raíz real del repo, o la carpeta del proyecto en la Documentación.
function baseDeArtefacto(proyecto: string, repoId: string | null): string {
  return repoId ? rutaReal(resolverRepo(proyecto, repoId).ruta!) : path.join(requireBasePath(DOCS), proyecto);
}

export async function anclarArtefacto(proyecto: string, repoId: string | null, ruta: string, ahora: () => Date = () => new Date()): Promise<AnclaSha256> {
  const { ruta: absoluta, segmentos } = rutaDeArtefacto(baseDeArtefacto(proyecto, repoId), ruta);
  const relativa = segmentos.join("/");
  const guardada = repoId ? `repo:${repoId}/${relativa}` : `proyecto:${relativa}`;
  const { sha256, bytes } = await sha256DeArchivo(absoluta, "ninguna", guardada);
  return { tipo: "sha256", ruta: guardada, sha256, bytes, verificado: ahora().toISOString() };
}

// "repo:api/docs/x.md" -> { repo: "api", relativa: "docs/x.md" }; "proyecto:ASISTENTE/p.md" -> { repo: null, … }
export function partirRutaDeArtefacto(guardada: string): { repo: string | null; relativa: string } | null {
  const enRepo = guardada.match(/^repo:([a-z0-9][a-z0-9-]{0,39})\/(.+)$/);
  if (enRepo) return { repo: enRepo[1]!, relativa: enRepo[2]! };
  const enProyecto = guardada.match(/^proyecto:(.+)$/);
  return enProyecto ? { repo: null, relativa: enProyecto[1]! } : null;
}

// ─── Reverificar ────────────────────────────────────────────────────────────
// Para get_batch_status y la Fase 5: ¿el ancla sigue valiendo hoy?
export async function reverificar(proyecto: string, recibo: Recibo): Promise<{ vigente: boolean; texto: string }> {
  const ancla = recibo.ancla;
  try {
    if (ancla.tipo === "commit") return await reverificarCommit(proyecto, recibo, ancla);
    if (ancla.tipo === "sha256") return await reverificarArtefacto(proyecto, ancla);
  } catch (error) {
    return { vigente: false, texto: error instanceof Error ? error.message : String(error) };
  }
  return { vigente: true, texto: "Sin nada que comprobar." };
}

async function reverificarCommit(proyecto: string, recibo: Recibo, ancla: AnclaCommit): Promise<{ vigente: boolean; texto: string }> {
  const repoId = ancla.repo || recibo.repo;
  if (!repoId) return { vigente: false, texto: "El recibo no dice en qué repo está su commit." };
  const dir = resolverRepo(proyecto, repoId).ruta!;
  const corto = ancla.corto || ancla.sha.slice(0, 7);

  const resuelto = await resolverCommit(dir, ancla.sha);
  if (!resuelto.ok) return { vigente: false, texto: `El commit \`${corto}\` ya no existe en \`${repoId}\`. Vuelve a anclar el lote.` };

  const rama = await ramaActual(dir);
  const ancestro = await esAncestroDeHead(dir, resuelto.sha);
  if (ancestro.resultado === "si") return { vigente: true, texto: `El commit \`${corto}\` sigue en la rama actual (\`${rama ?? "HEAD separado"}\`).` };
  if (ancestro.resultado === "error") return { vigente: false, texto: `No se pudo comprobar \`${corto}\`: ${ancestro.salida}` };
  return {
    vigente: false,
    texto: `El commit \`${corto}\` ya no está en la rama actual (\`${rama ?? "HEAD separado"}\`). ¿Rebase o squash? Vuelve a anclar el lote.`,
  };
}

async function reverificarArtefacto(proyecto: string, ancla: AnclaSha256): Promise<{ vigente: boolean; texto: string }> {
  const partes = partirRutaDeArtefacto(ancla.ruta);
  if (!partes) return { vigente: false, texto: `No se entiende la ruta del artefacto («${ancla.ruta}»).` };
  const { ruta } = rutaDeArtefacto(baseDeArtefacto(proyecto, partes.repo), partes.relativa);

  const actual = await sha256DeArchivo(ruta, "ninguna", ancla.ruta);
  if (actual.sha256 === ancla.sha256) return { vigente: true, texto: `El artefacto \`${ancla.ruta}\` no cambió.` };

  // El hash es de los bytes, y un archivo de texto en un repo con core.autocrlf tiene otros bytes en
  // Windows que en Linux o macOS (§6.1). Se prueba en las dos direcciones.
  for (const conversion of ["crlf-a-lf", "lf-a-crlf"] as const) {
    if ((await sha256DeArchivo(ruta, conversion)).sha256 === ancla.sha256) {
      return { vigente: true, texto: `El artefacto \`${ancla.ruta}\` es idéntico salvo finales de línea.` };
    }
  }
  return { vigente: false, texto: `El artefacto \`${ancla.ruta}\` cambió desde que se selló (sha256 \`${ancla.sha256.slice(0, 12)}…\`, ahora \`${actual.sha256.slice(0, 12)}…\`).` };
}
