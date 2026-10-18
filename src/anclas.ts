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
import { fallo, mensaje } from "./i18n/mensajes.js";
import { archivosDeCommit, datosDeCommit, esAncestroDeHead, ramaActual, ramasQueContienen, resolverCommit } from "./git.js";
import { esSegmentoDeGit, estaDentroReal, rutaReal, validarSegmento } from "./paths.js";
import { etiquetaDeLote } from "./recibos.js";
import type { Ancla, Recibo } from "./recibos.js";
import { resolverRepo } from "./repos.js";
import type { Idioma } from "./vocabulario.js";

type AnclaCommit = Extract<Ancla, { tipo: "commit" }>;
type AnclaSha256 = Extract<Ancla, { tipo: "sha256" }>;

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

// Es un aviso, no un bloqueo (decisión H5): queda escrito en el recibo y lo audita la Fase 5. Por eso va
// en el idioma del proyecto, el del recibo.
export function compararArchivos(delCommit: string[], declarados: string[], raizRepo: string, idioma: Idioma = "es"): { texto: string; coinciden: boolean } {
  const enCommit = new Set(delCommit.map((archivo) => archivo.normalize("NFC")));
  const enRecibo = new Set(declarados.map((archivo) => normalizarArchivo(archivo, raizRepo)).filter(Boolean));
  const deMas = [...enCommit].filter((archivo) => !enRecibo.has(archivo)).sort();
  const deMenos = [...enRecibo].filter((archivo) => !enCommit.has(archivo)).sort();

  if (deMas.length === 0 && deMenos.length === 0) {
    return { texto: mensaje("ANCLA-COINCIDE", { n: enCommit.size }, idioma), coinciden: true };
  }

  const lineas: string[] = [];
  if (deMas.length) lineas.push(mensaje("ANCLA-DE-MAS", { archivos: deMas }, idioma));
  if (deMenos.length) lineas.push(mensaje("ANCLA-DE-MENOS", { archivos: deMenos }, idioma));
  return { texto: lineas.join("\n"), coinciden: false };
}

export type OtroLote = { lote: number; sha: string };

// `idioma`: el del proyecto, en el que se escribe la comparación de archivos ("Verificación del commit").
// Los errores salen en el de la llamada.
export async function anclarCommit(
  proyecto: string,
  repoId: string,
  sha: string,
  archivosDeclarados: string[],
  otros: OtroLote[] = [],
  ahora: () => Date = () => new Date(),
  idioma: Idioma = "es"
): Promise<{ ancla: AnclaCommit; verificacionDelCommit: string; coinciden: boolean }> {
  const repo = resolverRepo(proyecto, repoId);
  const dir = repo.ruta!;

  const resuelto = await resolverCommit(dir, sha);
  if (!resuelto.ok) {
    if (resuelto.motivo === "formato") throw fallo("ANCLA-FORMATO");
    if (resuelto.motivo === "ambiguo") throw fallo("ANCLA-AMBIGUO", { sha, repo: repoId });
    throw fallo("ANCLA-NO-EXISTE", { sha, repo: repoId, dir });
  }
  const completo = resuelto.sha;
  const corto = completo.slice(0, 7);

  // Un commit, un lote. Un recibo manual de la 2.x puede guardar solo el hash corto.
  const repetido = otros.find((otro) => otro.sha && completo.startsWith(otro.sha.toLowerCase()));
  if (repetido) throw fallo("ANCLA-REPETIDO", { corto, lote: etiquetaDeLote(repetido.lote) });

  const rama = await ramaActual(dir);
  const ancestro = await esAncestroDeHead(dir, completo);
  if (ancestro.resultado === "no") {
    throw fallo("ANCLA-OTRA-RAMA", { corto, rama, ramas: await ramasQueContienen(dir, completo) });
  }
  if (ancestro.resultado === "error") throw fallo("ANCLA-NO-COMPROBADO", { corto, repo: repoId, salida: ancestro.salida });

  const datos = await datosDeCommit(dir, completo);
  const comparacion = compararArchivos(await archivosDeCommit(dir, completo), archivosDeclarados, dir, idioma);

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
    throw fallo("ANCLA-ARTEFACTO-ABSOLUTO", { ruta: relativa });
  }
  const segmentos = relativa.split(/[\\/]/);
  for (const segmento of segmentos) {
    validarSegmento(segmento, "artifact_path");
    if (esSegmentoDeGit(segmento)) throw fallo("ANCLA-ARTEFACTO-GIT", { ruta: relativa });
  }
  const ruta = path.join(base, ...segmentos);
  if (!estaDentroReal(base, ruta)) throw fallo("ANCLA-ARTEFACTO-FUERA", { ruta: relativa });
  const real = path.relative(rutaReal(base), rutaReal(ruta));
  if (real.split(/[\\/]/).some(esSegmentoDeGit)) throw fallo("ANCLA-ARTEFACTO-ENLACE-GIT", { ruta: relativa });
  return { ruta, segmentos };
}

type Conversion = "ninguna" | "crlf-a-lf" | "lf-a-crlf";

// Convierte los finales de línea de un trozo, con el estado del trozo anterior (un \r al final de un
// trozo puede ir seguido de un \n al principio del siguiente). Sobre Buffer, buscando con indexOf: byte a
// byte en JavaScript, 128 MB costaban más de 2 s por conversión (hallazgo 8 de la auditoría de la Etapa 4).
const CR = Buffer.from([0x0d]);
const CRLF = Buffer.from([0x0d, 0x0a]);
const VACIO = Buffer.alloc(0);

function convertidor(conversion: Conversion): { trozo: (b: Buffer) => Buffer; fin: () => Buffer } {
  if (conversion === "ninguna") return { trozo: (b) => b, fin: () => VACIO };
  if (conversion === "crlf-a-lf") {
    let crPendiente = false;
    return {
      trozo: (b) => {
        let entrada = crPendiente ? Buffer.concat([CR, b]) : b;
        crPendiente = entrada.length > 0 && entrada[entrada.length - 1] === 0x0d;
        if (crPendiente) entrada = entrada.subarray(0, entrada.length - 1);
        const partes: Buffer[] = [];
        let desde = 0;
        for (let i = entrada.indexOf(CRLF, desde); i !== -1; i = entrada.indexOf(CRLF, desde)) {
          partes.push(entrada.subarray(desde, i));
          desde = i + 1; // se salta el \r y se queda el \n
        }
        partes.push(entrada.subarray(desde));
        return Buffer.concat(partes);
      },
      fin: () => (crPendiente ? CR : VACIO),
    };
  }
  let anterior = -1;
  return {
    trozo: (b) => {
      const partes: Buffer[] = [];
      let desde = 0;
      for (let i = b.indexOf(0x0a, 0); i !== -1; i = b.indexOf(0x0a, i + 1)) {
        const previo = i > 0 ? b[i - 1] : anterior;
        if (previo !== 0x0d) {
          partes.push(b.subarray(desde, i), CR);
          desde = i;
        }
      }
      partes.push(b.subarray(desde));
      if (b.length) anterior = b[b.length - 1]!;
      return Buffer.concat(partes);
    },
    fin: () => VACIO,
  };
}

// La misma heurística que git (y que leerTextoAcotado): un byte NUL en los primeros 8000 es binario. Los
// finales de línea solo se normalizan en texto: en un binario, quitar un 0x0D es un cambio de verdad.
async function pareceTexto(ruta: string): Promise<boolean> {
  const descriptor = fs.openSync(ruta, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const muestra = Buffer.alloc(8000);
    const leidos = fs.readSync(descriptor, muestra, 0, muestra.length, 0);
    return !muestra.subarray(0, leidos).includes(0);
  } finally {
    fs.closeSync(descriptor);
  }
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
    if (error?.code === "ENOENT") throw fallo("ANCLA-ARTEFACTO-NO-EXISTE", { ruta: mostrar });
    if (error?.code === "EISDIR") throw fallo("ANCLA-ARTEFACTO-CARPETA", { ruta: mostrar });
    throw error;
  }

  const stream = fs.createReadStream(ruta, { fd: descriptor, autoClose: true });
  try {
    const info = fs.fstatSync(descriptor);
    if (!info.isFile()) throw fallo("ANCLA-ARTEFACTO-NO-NORMAL", { ruta: mostrar });
    if (info.size > TOPE_DE_ARTEFACTO) throw fallo("ANCLA-ARTEFACTO-TOPE", { bytes: info.size });

    const hash = crypto.createHash("sha256");
    const convertir = convertidor(conversion);
    let bytes = 0;
    for await (const trozo of stream as AsyncIterable<Buffer>) {
      bytes += trozo.length;
      if (bytes > TOPE_DE_ARTEFACTO) throw fallo("ANCLA-ARTEFACTO-TOPE", { bytes });
      hash.update(convertir.trozo(trozo));
    }
    hash.update(convertir.fin());
    return { sha256: hash.digest("hex"), bytes };
  } finally {
    stream.destroy();
  }
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
// `sha`: el commit completo, cuando el ancla es un commit y sigue vigente (el bloque de la Fase 5 lo usa
// sin volver a preguntárselo a git).
// `idioma`: el del texto; sin él, el de la llamada (get_batch_status, doctor). El bloque de la Fase 5 pasa
// el del proyecto. Un error de git o del disco sale con su propio texto, en el de la llamada.
export async function reverificar(proyecto: string, recibo: Recibo, idioma?: Idioma): Promise<{ vigente: boolean; texto: string; sha?: string }> {
  const ancla = recibo.ancla;
  try {
    if (ancla.tipo === "commit") return await reverificarCommit(proyecto, recibo, ancla, idioma);
    if (ancla.tipo === "sha256") return await reverificarArtefacto(proyecto, ancla, idioma);
  } catch (error) {
    return { vigente: false, texto: error instanceof Error ? error.message : String(error) };
  }
  return { vigente: true, texto: mensaje("ANCLA-SIN-NADA-QUE-COMPROBAR", {}, idioma) };
}

async function reverificarCommit(proyecto: string, recibo: Recibo, ancla: AnclaCommit, idioma?: Idioma): Promise<{ vigente: boolean; texto: string; sha?: string }> {
  const repoId = ancla.repo || recibo.repo;
  if (!repoId) return { vigente: false, texto: mensaje("ANCLA-RECIBO-SIN-REPO", {}, idioma) };
  const dir = resolverRepo(proyecto, repoId).ruta!;
  const corto = ancla.corto || ancla.sha.slice(0, 7);

  const resuelto = await resolverCommit(dir, ancla.sha);
  if (!resuelto.ok) return { vigente: false, texto: mensaje("ANCLA-YA-NO-EXISTE", { corto, repo: repoId }, idioma) };

  const rama = await ramaActual(dir);
  const ancestro = await esAncestroDeHead(dir, resuelto.sha);
  if (ancestro.resultado === "si") return { vigente: true, texto: mensaje("ANCLA-SIGUE-EN-LA-RAMA", { corto, rama }, idioma), sha: resuelto.sha };
  if (ancestro.resultado === "error") return { vigente: false, texto: mensaje("ANCLA-NO-SE-PUDO-COMPROBAR", { corto, salida: ancestro.salida }, idioma) };
  return { vigente: false, texto: mensaje("ANCLA-FUERA-DE-LA-RAMA", { corto, rama }, idioma) };
}

async function reverificarArtefacto(proyecto: string, ancla: AnclaSha256, idioma?: Idioma): Promise<{ vigente: boolean; texto: string }> {
  const partes = partirRutaDeArtefacto(ancla.ruta);
  if (!partes) return { vigente: false, texto: mensaje("ANCLA-RUTA-ILEGIBLE", { ruta: ancla.ruta }, idioma) };
  const { ruta } = rutaDeArtefacto(baseDeArtefacto(proyecto, partes.repo), partes.relativa);

  const actual = await sha256DeArchivo(ruta, "ninguna", ancla.ruta);
  if (actual.sha256 === ancla.sha256) return { vigente: true, texto: mensaje("ANCLA-ARTEFACTO-SIN-CAMBIOS", { ruta: ancla.ruta }, idioma) };

  // El hash es de los bytes, y un archivo de texto en un repo con core.autocrlf tiene otros bytes en
  // Windows que en Linux o macOS (§6.1). Se prueba en las dos direcciones, y solo con texto.
  const cambio = { vigente: false, texto: mensaje("ANCLA-ARTEFACTO-CAMBIO", { ruta: ancla.ruta, antes: ancla.sha256.slice(0, 12), ahora: actual.sha256.slice(0, 12) }, idioma) };
  if (!(await pareceTexto(ruta))) return cambio;
  for (const conversion of ["crlf-a-lf", "lf-a-crlf"] as const) {
    if ((await sha256DeArchivo(ruta, conversion)).sha256 === ancla.sha256) {
      return { vigente: true, texto: mensaje("ANCLA-ARTEFACTO-FINALES-DE-LINEA", { ruta: ancla.ruta }, idioma) };
    }
  }
  return cambio;
}
