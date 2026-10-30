// Arma la portada del sitio a partir de sitio/: una sola plantilla HTML con sus textos en inglés y en español,
// sin framework. Escribe en <carpeta>:
//   index.html     la portada en inglés
//   es/index.html  la portada en español
//   portada.css, portada.js y tema-claro.css (copiado tal cual de los tokens del Studio)
//   .nojekyll      para que Pages sirva los archivos tal cual
// Las fuentes y las capturas no las escribe: se enlazan desde demo/fuentes/ (donde las deja el export del
// Studio) y desde medios/captura-<vista>-<idioma>.<ext> (que saca capturas-studio.mjs). Lo mismo la imagen de la
// vista previa del link: la plantilla la nombra en sus etiquetas Open Graph y de Twitter, con la URL absoluta que
// esas etiquetas exigen, y capturas-studio.mjs la saca a medios/social-preview-<idioma>.png.
//
// En el <html> deja dos datos que portada.js necesita antes de pintar: data-base (dónde está la raíz del sitio)
// y data-vistas (las vistas del Studio, copiadas de studio/src/rutas.ts, para distinguir un hash de la demo de
// un ancla de la portada).
//
// Uso, después de `npm run build`:
//   node scripts/portada.mjs --salida <carpeta>

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITIO = "https://montse2308.github.io/mcp-phase-gate/";
const GUIAS = {
  en: "https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/installation.md",
  es: "https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/instalacion.md",
};
// El formato de las tres capturas de medios/. Lo mismo lo dice capturas-studio.mjs.
export const EXTENSION_DE_LAS_CAPTURAS = "webp";
// La imagen de la vista previa del link (Open Graph y Twitter) es también la que se sube como social preview del
// repo: 1200×630, una por idioma. La saca capturas-studio.mjs --portada, junto a las capturas.
export const MEDIDAS_DE_LA_IMAGEN_SOCIAL = { ancho: 1200, alto: 630 };
export const nombreDeLaImagenSocial = (idioma) => `social-preview-${idioma}.png`;
// Las claves de textos.json que usa la imagen y no la plantilla.
export const TEXTOS_SOLO_DE_LA_IMAGEN = ["social-lema"];

// Las vistas del Studio, tal como las declara studio/src/rutas.ts. La portada las necesita para saber qué hash
// es de la demo (#red) y qué hash es suyo (#fases, y cualquier ancla que gane después), y no las copia: si
// rutas.ts cambia de forma, esto falla al armar el sitio en vez de callar y mandar gente a la demo.
function vistasDelStudio() {
  const rutas = fs.readFileSync(path.join(raiz, "studio", "src", "rutas.ts"), "utf-8");
  const lista = rutas.match(/export const VISTAS: Vista\[\] = \[([^\]]+)\]/);
  const vistas = lista?.[1].match(/"([a-z]+)"/g)?.map((v) => v.replaceAll('"', ""));
  if (!vistas?.length) throw new Error("studio/src/rutas.ts ya no declara VISTAS como esperaba scripts/portada.mjs.");
  return vistas;
}

export function armarPortada(salida) {
  const textos = JSON.parse(fs.readFileSync(path.join(raiz, "sitio", "textos.json"), "utf-8"));
  const plantilla = fs.readFileSync(path.join(raiz, "sitio", "plantilla.html"), "utf-8");
  const { version } = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf-8"));

  const usadas = new Set();
  const vistas = vistasDelStudio().join(" ");
  const paginas = { en: "index.html", es: path.join("es", "index.html") };
  for (const idioma of ["en", "es"]) {
    const propios = textos[idioma];
    if (!propios) throw new Error(`sitio/textos.json no tiene el idioma ${idioma}.`);
    const enEspanol = idioma === "es";
    const base = enEspanol ? "../" : "";
    const valores = {
      ...propios,
      lang: idioma,
      idioma,
      base,
      version,
      "vistas-demo": vistas,
      "ext-captura": EXTENSION_DE_LAS_CAPTURAS,
      "url-esta": enEspanol ? `${SITIO}es/` : SITIO,
      "url-en": SITIO,
      "url-es": `${SITIO}es/`,
      "href-en": enEspanol ? "../" : "./",
      "href-es": enEspanol ? "./" : "es/",
      "aria-en": enEspanol ? "" : ' aria-current="true"',
      "aria-es": enEspanol ? ' aria-current="true"' : "",
      "url-guia": GUIAS[idioma],
      "url-imagen": `${SITIO}medios/${nombreDeLaImagenSocial(idioma)}`,
      "imagen-ancho": MEDIDAS_DE_LA_IMAGEN_SOCIAL.ancho,
      "imagen-alto": MEDIDAS_DE_LA_IMAGEN_SOCIAL.alto,
      "locale-og": enEspanol ? "es_ES" : "en_US",
      "locale-og-otro": enEspanol ? "en_US" : "es_ES",
    };
    const pagina = plantilla.replace(/\{\{([a-z0-9-]+)\}\}/g, (_, clave) => {
      if (!Object.hasOwn(valores, clave)) throw new Error(`La plantilla pide «${clave}» y sitio/textos.json no lo trae en ${idioma}.`);
      usadas.add(clave);
      return String(valores[clave]);
    });
    const destino = path.join(salida, paginas[idioma]);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, pagina, "utf-8");
  }
  // Un texto que ninguna plantilla usa es un texto que sobra, o una clave mal escrita.
  for (const idioma of ["en", "es"]) {
    for (const clave of Object.keys(textos[idioma])) {
      if (!usadas.has(clave) && !TEXTOS_SOLO_DE_LA_IMAGEN.includes(clave)) throw new Error(`sitio/textos.json trae «${clave}» (${idioma}) y la plantilla no lo usa.`);
    }
  }
  if (JSON.stringify(Object.keys(textos.en).sort()) !== JSON.stringify(Object.keys(textos.es).sort())) {
    throw new Error("sitio/textos.json: el inglés y el español no tienen las mismas claves.");
  }

  fs.copyFileSync(path.join(raiz, "sitio", "portada.css"), path.join(salida, "portada.css"));
  fs.copyFileSync(path.join(raiz, "sitio", "portada.js"), path.join(salida, "portada.js"));
  fs.copyFileSync(path.join(raiz, "studio", "src", "estilos", "tema-claro.css"), path.join(salida, "tema-claro.css"));
  fs.writeFileSync(path.join(salida, ".nojekyll"), "", "utf-8");
  return { version, archivos: ["index.html", "es/index.html", "portada.css", "portada.js", "tema-claro.css", ".nojekyll"] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { salida: { type: "string" } } });
  if (!values.salida?.trim()) throw new Error("Uso: node scripts/portada.mjs --salida <carpeta>");
  const { archivos, version } = armarPortada(path.resolve(values.salida));
  console.log(`Portada de la ${version}: ${archivos.join(", ")} en ${path.resolve(values.salida)}.`);
}
