// Markdown sin XSS. Los documentos de las tareas los escribe un modelo que lee texto ajeno:
// un <script> o un <img onerror> inyectado no puede ejecutarse en una página con acciones de escritura.
// marked.parse y después DOMPurify.sanitize con USE_PROFILES html, sin style, form, input ni iframe, y sin
// el atributo style; la CSP sin 'unsafe-inline' es la segunda barrera.
//
// Después, sobre el fragmento ya saneado, para que el visor no haga ninguna petición fuera de 127.0.0.1 ni
// rompa la navegación:
//   - una imagen que no va incrustada (data:image/png, gif, jpeg o webp) se cambia por su texto alternativo
//     y su dirección, sin cargarla: una externa la bloquearía la CSP, y una relativa no existe en el Studio
//     (no sirve los archivos de la tarea), así que las dos dejarían un error en la consola;
//   - un enlace a otro sitio se abre aparte, sin enviar el Referer;
//   - un enlace a "#…" se queda sin href: la navegación del Studio va por el hash.

import DOMPurify from "dompurify";
import { marked } from "marked";

import { t } from "../i18n/idioma";

export const CONFIGURACION = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "form", "input", "iframe"],
  FORBID_ATTR: ["style"],
};

const EXTERNA = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const IMAGEN_INCRUSTADA = /^data:image\/(?:png|gif|jpeg|webp);/i;

export function aHtml(markdown: string): string {
  const crudo = marked.parse(markdown, { async: false, gfm: true });
  const fragmento = DOMPurify.sanitize(crudo, { ...CONFIGURACION, RETURN_DOM_FRAGMENT: true });
  for (const imagen of [...fragmento.querySelectorAll("img")]) {
    imagen.removeAttribute("srcset");
    const src = imagen.getAttribute("src") ?? "";
    if (!IMAGEN_INCRUSTADA.test(src)) {
      const texto = document.createElement("span");
      texto.className = "imagen-externa";
      texto.textContent = t("visor.imagen", { alt: imagen.getAttribute("alt") || t("visor.sinTexto"), src });
      imagen.replaceWith(texto);
    }
  }
  for (const enlace of [...fragmento.querySelectorAll("a")]) {
    const href = enlace.getAttribute("href") ?? "";
    if (href.startsWith("#")) enlace.removeAttribute("href");
    else if (EXTERNA.test(href)) {
      enlace.setAttribute("target", "_blank");
      enlace.setAttribute("rel", "noopener noreferrer");
    }
  }
  const contenedor = document.createElement("div");
  contenedor.append(fragmento);
  return contenedor.innerHTML;
}
