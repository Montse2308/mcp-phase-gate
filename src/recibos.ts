// Los recibos de lote como datos: el único lugar que los lee y los escribe.
//
// Hasta la 2.x el recibo lo redactaba el modelo con write_central_doc, siguiendo una plantilla del
// prompt. Desde la 3.0 lo escribe el servidor (record_batch) a partir de campos, y este módulo fija su
// formato: la plantilla de la Etapa 1 con más claves en el frontmatter. Las claves de la 2.x se
// conservan en su sitio, así que un recibo de la 3.0 sigue siendo legible con las reglas de entonces.
//
// Dos garantías:
//   - escribir es determinista: el mismo Recibo da siempre los mismos bytes, en LF y con un salto
//     final, y escribir lo que se leyó de un recibo escrito aquí da los mismos bytes otra vez;
//   - leer es tolerante: un recibo escrito a mano con la 2.x se lee sin lanzar, con lo que tenga.

import * as path from "path";

import { leerTextoAcotado, validarSegmento } from "./paths.js";

export type EstadoLote = "verificado" | "con pendientes" | "fallido" | "descartado";
export const ESTADOS_LOTE: readonly EstadoLote[] = ["verificado", "con pendientes", "fallido", "descartado"];

export type Ancla =
  | { tipo: "commit"; repo: string; sha: string; corto: string; asunto: string; rama: string; verificado: string }
  | { tipo: "sha256"; ruta: string; sha256: string; bytes: number; verificado: string }
  | { tipo: "nota"; texto: string }
  | { tipo: "pendiente" };

export type TituloCondicional = "Lo que sigue igual" | "Reversión" | "Aviso a alguien más" | "Deuda anotada";
export const TITULOS_CONDICIONALES: readonly TituloCondicional[] = ["Lo que sigue igual", "Reversión", "Aviso a alguien más", "Deuda anotada"];

export type Recibo = {
  lote: number;
  de: number;
  titulo: string;
  repo: string | null;
  rama: string | null;
  estado: EstadoLote;
  ancla: Ancla;
  fecha: string; // AAAA-MM-DD
  registrado: string; // ISO, fecha de la última escritura por el servidor
  origen: "servidor" | "manual"; // manual = recibo escrito a mano con la 2.x
  queSeHizo: string;
  archivos: { archivo: string; cambio: string }[];
  verificacion: string;
  esperaAlUsuario: { prueba: string; esperado: string }[];
  desvios: string;
  decisiones: string;
  condicionales: { titulo: TituloCondicional; texto: string }[];
  verificacionDelCommit: string | null; // diferencias entre el commit y la tabla Archivos
};

// Lo que el servidor pone en el frontmatter de los documentos que genera él (el índice, o el recibo
// que pasa a ser el documento de la fase con un solo lote).
export const GENERADO_POR = "mcp-phase-gate";

// ─── Nombre del recibo ──────────────────────────────────────────────────────
// "L02 - filtro por categoría.md". El slug lo hace el servidor, no el modelo: antes el prompt pedía
// "sin : / \ < > ..." y bastaba un "fix(rutas): …" copiado del commit para crear un archivo que
// Windows no guarda (ajuste A3 de la Etapa 1).
//
// 40 caracteres como mucho (validación V7): con una Documentación en una carpeta sincronizada de ruta
// larga, un slug de 60 dejaba la ruta del recibo cerca del límite de 255.
export const LARGO_MAXIMO_DEL_SLUG = 40;

export function dosDigitos(lote: number): string {
  return String(lote).padStart(2, "0");
}

export function etiquetaDeLote(lote: number): string {
  return `L${dosDigitos(lote)}`;
}

export function slugDe(titulo: string): string {
  const limpio = titulo
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N} -]/gu, " ")
    .replace(/ {2,}/g, " ")
    .trim();

  // Por puntos de código, no por unidades de UTF-16: así un corte nunca parte un carácter.
  let caracteres = Array.from(limpio);
  if (caracteres.length > LARGO_MAXIMO_DEL_SLUG) {
    // Sin partir palabras: se corta en el último espacio de los primeros 41 caracteres (si el 41 es un
    // espacio, la palabra 40 entra entera). Una sola palabra más larga que el tope se corta a lo bruto.
    const ultimoEspacio = caracteres.slice(0, LARGO_MAXIMO_DEL_SLUG + 1).lastIndexOf(" ");
    caracteres = caracteres.slice(0, ultimoEspacio > 0 ? ultimoEspacio : LARGO_MAXIMO_DEL_SLUG);
  }

  const slug = caracteres.join("").replace(/[ .]+$/, "");
  return slug || "lote";
}

export function nombreDeRecibo(lote: number, titulo: string): string {
  if (!Number.isInteger(lote) || lote < 1 || lote > 99) {
    throw new Error(`El número de lote tiene que ser un entero de 1 a 99 (llegó ${lote}).`);
  }
  return validarSegmento(`${etiquetaDeLote(lote)} - ${slugDe(titulo)}.md`, "el nombre del recibo");
}

// El lote de un nombre de recibo ("L02 - x.md" -> 2), o null si no lo es.
export function loteDelNombre(nombre: string): number | null {
  const encontrado = nombre.match(/^L(\d{2}) - .*\.md$/i);
  const lote = encontrado ? Number(encontrado[1]) : NaN;
  return lote >= 1 && lote <= 99 ? lote : null;
}

// ─── Escritura ──────────────────────────────────────────────────────────────
const QUE_SE_HIZO = "Qué se hizo";
const ARCHIVOS = "Archivos";
const VERIFICACION = "Verificación ejecutada";
const ESPERA = "Espera al usuario";
const DESVIOS = "Desvíos del plan";
const DECISIONES = "Decisiones";
const VERIFICACION_DEL_COMMIT = "Verificación del commit";

// Lo que se escribe en una sección vacía, para que nunca quede un encabezado sin texto. Al leer, cuenta
// como vacía (junto con las otras formas habituales de decir "nada").
const VACIA: Record<string, string> = {
  [QUE_SE_HIZO]: "Nada.",
  [ARCHIVOS]: "Ninguno.",
  [VERIFICACION]: "Ninguna.",
  [ESPERA]: "Ninguna.",
  [DESVIOS]: "Ninguno.",
  [DECISIONES]: "Ninguna.",
};
const FORMAS_DE_VACIO = new Set(["", "nada", "ninguna", "ninguno", "n/a", "no aplica"]);

function sinCR(texto: string): string {
  return texto.replace(/\r\n?/g, "\n");
}

// Un valor del frontmatter es una sola línea. Los saltos y las barras se escapan, para que una nota de
// varias líneas vuelva igual al leerla.
function enUnaLinea(valor: string): string {
  return sinCR(valor.trim()).replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
}

function deUnaLinea(valor: string): string {
  return valor.replace(/\\(\\|n)/g, (_, c: string) => (c === "n" ? "\n" : "\\"));
}

// Una celda de tabla: `|` como `\|` y los saltos de línea como <br>. La usa también el índice.
export function celda(texto: string): string {
  return sinCR(texto).trim().replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function tabla(cabecera: [string, string], filas: [string, string][], vacia: string): string {
  if (filas.length === 0) return vacia;
  return [`| ${cabecera[0]} | ${cabecera[1]} |`, "|---|---|", ...filas.map(([a, b]) => `| ${celda(a)} | ${celda(b)} |`)].join("\n");
}

// Una línea que empieza como un encabezado se sangra un espacio: dentro de una sección es texto, y al
// leer cortaría la sección en dos.
function texto(contenido: string, vacia: string): string {
  const limpio = sinCR(contenido).trim();
  if (!limpio) return vacia;
  return limpio
    .split("\n")
    .map((linea) => (/^#{1,2} /.test(linea) ? ` ${linea}` : linea))
    .join("\n");
}

function valorDeCommit(ancla: Ancla): string {
  if (ancla.tipo === "commit") return ancla.corto;
  if (ancla.tipo === "pendiente") return "pendiente";
  return "no aplica";
}

export function escribirRecibo(r: Recibo, opciones: { comoDocumento?: boolean } = {}): string {
  const fm: [string, string][] = [];
  // Con un solo lote, el recibo pasa a ser el documento de la fase y lo dice su frontmatter.
  if (opciones.comoDocumento) fm.push(["lotes", String(r.de)], ["generado_por", GENERADO_POR]);
  fm.push(
    ["lote", etiquetaDeLote(r.lote)],
    ["de", String(r.de)],
    ["repo", r.repo ?? "—"],
    ["rama", r.rama ?? "—"],
    ["estado", r.estado],
    ["commit", valorDeCommit(r.ancla)],
    ["fecha", r.fecha],
    ["ancla", r.ancla.tipo]
  );
  if (r.ancla.tipo === "commit") fm.push(["commit_completo", r.ancla.sha], ["asunto", enUnaLinea(r.ancla.asunto)]);
  if (r.ancla.tipo === "sha256") fm.push(["artefacto", enUnaLinea(r.ancla.ruta)], ["sha256", r.ancla.sha256], ["bytes", String(r.ancla.bytes)]);
  if (r.ancla.tipo === "nota") fm.push(["nota", enUnaLinea(r.ancla.texto)]);
  fm.push(["registrado", r.registrado], ["origen", r.origen]);

  const secciones: [string, string][] = [
    [QUE_SE_HIZO, texto(r.queSeHizo, VACIA[QUE_SE_HIZO]!)],
    [ARCHIVOS, tabla(["Archivo", "Qué cambió"], r.archivos.map((f) => [f.archivo, f.cambio]), VACIA[ARCHIVOS]!)],
    [VERIFICACION, texto(r.verificacion, VACIA[VERIFICACION]!)],
    [ESPERA, tabla(["Prueba", "Resultado esperado"], r.esperaAlUsuario.map((f) => [f.prueba, f.esperado]), VACIA[ESPERA]!)],
    [DESVIOS, texto(r.desvios, VACIA[DESVIOS]!)],
    [DECISIONES, texto(r.decisiones, VACIA[DECISIONES]!)],
  ];

  // Las condicionales solo si traen texto, siempre en el orden de la plantilla.
  const condicionales = [...r.condicionales]
    .filter((c) => sinCR(c.texto).trim())
    .sort((a, b) => TITULOS_CONDICIONALES.indexOf(a.titulo) - TITULOS_CONDICIONALES.indexOf(b.titulo));
  for (const c of condicionales) secciones.push([c.titulo, texto(c.texto, "")]);

  if (r.ancla.tipo === "commit" && r.verificacionDelCommit !== null && sinCR(r.verificacionDelCommit).trim()) {
    secciones.push([VERIFICACION_DEL_COMMIT, texto(r.verificacionDelCommit, "")]);
  }

  const titulo = r.titulo.replace(/\s+/g, " ").trim();
  return [
    "---",
    ...fm.map(([clave, valor]) => `${clave}: ${valor}`),
    "---",
    "",
    `# ${etiquetaDeLote(r.lote)} — ${titulo}`,
    "",
    secciones.map(([encabezado, cuerpo]) => `## ${encabezado}\n${cuerpo}`).join("\n\n"),
    "",
  ].join("\n");
}

// ─── Lectura ────────────────────────────────────────────────────────────────
const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;

// El frontmatter "clave: valor" de un recibo, sin tocar comillas: un asunto de commit puede empezar
// por una. Normaliza el BOM y los finales de línea antes (§1.3).
export function frontmatterDeRecibo(contenido: string): { meta: Record<string, string>; cuerpo: string } {
  const crudo = sinCR(contenido.replace(/^\uFEFF/, ""));
  const encontrado = crudo.match(FRONTMATTER);
  if (!encontrado) return { meta: {}, cuerpo: crudo };
  const meta: Record<string, string> = {};
  for (const linea of (encontrado[1] ?? "").split("\n")) {
    const corte = linea.indexOf(":");
    if (corte === -1) continue;
    meta[linea.slice(0, corte).trim()] = linea.slice(corte + 1).trim();
  }
  return { meta, cuerpo: crudo.slice(encontrado[0].length) };
}

const SECCIONES_CONOCIDAS = new Map<string, string>(
  [QUE_SE_HIZO, ARCHIVOS, VERIFICACION, ESPERA, DESVIOS, DECISIONES, VERIFICACION_DEL_COMMIT, ...TITULOS_CONDICIONALES].map((t) => [
    t.normalize("NFC").toLowerCase(),
    t,
  ])
);

// Las secciones "## X" conocidas, con su texto. Un "## " que no es de la plantilla se queda dentro de la
// sección en la que aparece: nunca se pierde ni hace fallar la lectura.
function secciones(cuerpo: string): { h1: string | null; mapa: Map<string, string> } {
  const mapa = new Map<string, string>();
  let h1: string | null = null;
  let actual: string | null = null;
  let lineas: string[] = [];
  const cerrar = () => {
    if (actual !== null) mapa.set(actual, lineas.join("\n").trim());
  };

  for (const linea of cuerpo.split("\n")) {
    if (h1 === null && actual === null && linea.startsWith("# ")) {
      h1 = linea.slice(2).trim();
      continue;
    }
    const conocida = linea.startsWith("## ") ? SECCIONES_CONOCIDAS.get(linea.slice(3).trim().normalize("NFC").toLowerCase()) : undefined;
    if (conocida) {
      cerrar();
      actual = conocida;
      lineas = [];
    } else if (actual !== null) {
      lineas.push(linea);
    }
  }
  cerrar();
  return { h1, mapa };
}

function esVacia(texto: string): boolean {
  return FORMAS_DE_VACIO.has(texto.replace(/[_*`]/g, "").trim().replace(/[.…]+$/, "").trim().toLowerCase());
}

function textoDe(mapa: Map<string, string>, titulo: string): string {
  const contenido = mapa.get(titulo) ?? "";
  return esVacia(contenido) ? "" : contenido;
}

// Las celdas de una fila de tabla, partiendo por los `|` que no van escapados.
function celdas(linea: string): string[] {
  const interior = linea.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return interior.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n"));
}

function filasDeTabla(contenido: string): [string, string][] {
  const filas = contenido.split("\n").filter((linea) => linea.trim().startsWith("|"));
  return filas
    .slice(1) // la cabecera
    .filter((linea) => !/^\|?\s*:?-{3,}/.test(linea.trim()))
    .map((linea) => {
      const [a = "", b = ""] = celdas(linea);
      return [a, b];
    });
}

const ES_HASH = /^[0-9a-f]{7,40}$/i;

function estadoDe(valor: string | undefined): EstadoLote {
  const limpio = (valor ?? "").trim().toLowerCase();
  // Un estado que no se reconoce no se da por bueno: queda con pendientes.
  return (ESTADOS_LOTE as readonly string[]).includes(limpio) ? (limpio as EstadoLote) : "con pendientes";
}

function nulo(valor: string | undefined): string | null {
  const limpio = (valor ?? "").trim();
  return limpio === "" || limpio === "—" || limpio === "-" ? null : limpio;
}

function anclaDe(meta: Record<string, string>, repo: string | null, rama: string | null, verificado: string): Ancla {
  const commit = (meta.commit ?? "").trim();
  switch ((meta.ancla ?? "").trim()) {
    case "commit":
      return {
        tipo: "commit",
        repo: repo ?? "",
        sha: (meta.commit_completo ?? commit).trim(),
        corto: commit,
        asunto: deUnaLinea(meta.asunto ?? ""),
        rama: rama ?? "",
        verificado,
      };
    case "sha256":
      return { tipo: "sha256", ruta: deUnaLinea(meta.artefacto ?? ""), sha256: (meta.sha256 ?? "").trim(), bytes: Number(meta.bytes) || 0, verificado };
    case "nota":
      return { tipo: "nota", texto: deUnaLinea(meta.nota ?? "") };
    case "pendiente":
      return { tipo: "pendiente" };
  }

  // Un recibo de la 2.x no tiene `ancla`: se deduce de `commit`. Un hash queda como commit sin
  // verificar (verificado vacío); `no aplica`, como nota.
  if (ES_HASH.test(commit)) return { tipo: "commit", repo: repo ?? "", sha: commit, corto: commit.slice(0, 7), asunto: "", rama: rama ?? "", verificado: "" };
  if (commit.toLowerCase() === "no aplica") return { tipo: "nota", texto: "no aplica" };
  return { tipo: "pendiente" };
}

// Un recibo a partir de su texto. `nombre` es el del archivo: da el lote y el título cuando el
// frontmatter o el encabezado no los traen.
export function parsearRecibo(contenido: string, nombre: string = ""): Recibo {
  const { meta, cuerpo } = frontmatterDeRecibo(contenido);
  const { h1, mapa } = secciones(cuerpo);

  const deMeta = Number((meta.lote ?? "").replace(/^L/i, ""));
  const lote = Number.isInteger(deMeta) && deMeta > 0 ? deMeta : (loteDelNombre(nombre) ?? 0);
  const delNombre = nombre.replace(/^L\d{2} - /i, "").replace(/\.md$/i, "");
  const titulo = (h1 ?? "").replace(/^L\d+\s*[—–:-]\s*/i, "").trim() || delNombre;

  const repo = nulo(meta.repo);
  const rama = nulo(meta.rama);
  const origen = (meta.origen ?? "").trim() === "servidor" ? "servidor" : "manual";
  const registrado = (meta.registrado ?? "").trim();

  const condicionales: Recibo["condicionales"] = [];
  for (const titulo of TITULOS_CONDICIONALES) {
    const textoCondicional = mapa.get(titulo);
    if (textoCondicional) condicionales.push({ titulo, texto: textoCondicional });
  }

  return {
    lote,
    de: Number(meta.de) || 0,
    titulo,
    repo,
    rama,
    estado: estadoDe(meta.estado),
    // Lo que verificó el servidor, lo verificó al escribirlo; un recibo manual no se verificó nunca.
    ancla: anclaDe(meta, repo, rama, origen === "servidor" ? registrado : ""),
    fecha: (meta.fecha ?? "").trim(),
    registrado,
    origen,
    queSeHizo: textoDe(mapa, QUE_SE_HIZO),
    archivos: esVacia(mapa.get(ARCHIVOS) ?? "") ? [] : filasDeTabla(mapa.get(ARCHIVOS) ?? "").map(([archivo, cambio]) => ({ archivo, cambio })),
    verificacion: textoDe(mapa, VERIFICACION),
    esperaAlUsuario: esVacia(mapa.get(ESPERA) ?? "") ? [] : filasDeTabla(mapa.get(ESPERA) ?? "").map(([prueba, esperado]) => ({ prueba, esperado })),
    desvios: textoDe(mapa, DESVIOS),
    decisiones: textoDe(mapa, DECISIONES),
    condicionales,
    verificacionDelCommit: mapa.has(VERIFICACION_DEL_COMMIT) ? (mapa.get(VERIFICACION_DEL_COMMIT) ?? "") : null,
  };
}

export function leerRecibo(ruta: string): Recibo {
  return parsearRecibo(leerTextoAcotado(ruta), path.basename(ruta));
}
