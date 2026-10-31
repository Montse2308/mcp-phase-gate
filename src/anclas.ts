// The anchors of the batches: what proves that a batch was done.
//
// A batch with git is anchored to its commit, and the server checks that the commit exists, that it is on
// the current branch and which files it touches. Without git, it is anchored to the sha256 of an artifact
// (the file that changed) or to a note. Everything goes through git's single door (git.ts) and the usual
// path containment (paths.ts): the server only reads.

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
// A path of the Archivos table as a person or a model writes it: with code quotes, with \, with ./ in
// front, or absolute inside the repo. It is compared in git's form: relative and with /.
export function normalizarArchivo(declarado: string, raizRepo: string): string {
  let ruta = declarado.trim().replace(/^`+|`+$/g, "").trim().replace(/\\/g, "/");
  if (path.win32.isAbsolute(ruta) || path.posix.isAbsolute(ruta)) {
    const relativa = path.relative(raizRepo, ruta);
    if (relativa && !relativa.startsWith("..") && !path.isAbsolute(relativa)) ruta = relativa.replace(/\\/g, "/");
  }
  return ruta.replace(/^(?:\.\/)+/, "").normalize("NFC");
}

// It is a warning, not a block: it is written in the receipt and Phase 5 audits it. That is why it goes in
// the project's language, the receipt's.
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

// `idioma`: the project's, in which the comparison of files is written ("Verificación del commit"). The
// errors come out in the call's.
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

  // One commit, one batch. A manual receipt from 2.x may store only the short hash.
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

// ─── Artifact (sha256) ──────────────────────────────────────────────────────
export const TOPE_DE_ARTEFACTO = 256 * 1024 * 1024;

// The path of an artifact inside its base, with the containment of read_repo_file: relative, every segment
// portable (no "..", no ":" of an alternate stream, no reserved names), nothing of .git, neither in what was
// asked for nor in the real path (a link or a short 8.3 name such as GIT~1), and inside the real base.
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

// Converts the line endings of a chunk, with the state of the previous chunk (a \r at the end of a chunk can
// be followed by a \n at the start of the next). On a Buffer, searching with indexOf: byte by byte in
// JavaScript, 128 MB cost more than 2 s per conversion.
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
          desde = i + 1; // skips the \r and keeps the \n
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

// The same heuristic as git (and as leerTextoAcotado): a NUL byte in the first 8000 means binary. Line
// endings are only normalized in text: in a binary, removing a 0x0D is a real change.
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

// The sha256 as a stream, from the same descriptor that was checked: type and size come from the open file,
// not from a separate stat. A file that grows while it is read and passes the cap is rejected all the same.
// `mostrar` is how it is named in the messages (repo:api/docs/x.md): the absolute path tells the model
// nothing and shows the machine's.
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

// The base of an artifact: the real root of the repo, or the project's folder in the Documentation.
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

// ─── Re-verifying ───────────────────────────────────────────────────────────
// For get_batch_status and Phase 5: is the anchor still valid today?
// `sha`: the full commit, when the anchor is a commit and is still valid (the Phase 5 block uses it without
// asking git again).
// `idioma`: that of the text; without it, that of the call (get_batch_status, doctor). The Phase 5 block
// passes the project's. A git or disk error comes out with its own text, in the call's.
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

  // The hash is of the bytes, and a text file in a repo with core.autocrlf has other bytes on Windows than on
  // Linux or macOS. It is tried in both directions, and only with text.
  const cambio = { vigente: false, texto: mensaje("ANCLA-ARTEFACTO-CAMBIO", { ruta: ancla.ruta, antes: ancla.sha256.slice(0, 12), ahora: actual.sha256.slice(0, 12) }, idioma) };
  if (!(await pareceTexto(ruta))) return cambio;
  for (const conversion of ["crlf-a-lf", "lf-a-crlf"] as const) {
    if ((await sha256DeArchivo(ruta, conversion)).sha256 === ancla.sha256) {
      return { vigente: true, texto: mensaje("ANCLA-ARTEFACTO-FINALES-DE-LINEA", { ruta: ancla.ruta }, idioma) };
    }
  }
  return cambio;
}
