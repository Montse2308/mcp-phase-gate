// La estructura de una vista, para comprobar que el tema no la cambia: el árbol del DOM (etiquetas, atributos
// y el texto de las hojas) y el árbol de accesibilidad de <body> (roles y texto). Dos fotos de la misma vista
// en temas distintos tienen que dar lo mismo, salvo `data-tema` en <html> y `aria-pressed` del botón del tema.
//
// `compararEstructuras` es una función pura: dice dónde difieren dos fotos, y no abre ningún navegador.

import type { Page } from "@playwright/test";

// `texto` es el de un elemento sin hijos. En uno con hijos, `textos` guarda los nodos de texto sueltos en su
// orden: `textos[i]` es el que va antes de `hijos[i]`, y el último, el que va después del último hijo (así
// `<span><Marca/> {texto}</span>` guarda " " y el texto, y no solo lo que hay dentro de los hijos). Solo está
// si algún tramo no es vacío.
export type Nodo = { etiqueta: string; atributos: Record<string, string>; texto?: string; textos?: string[]; hijos: Nodo[] };
export type Foto = { arbol: Nodo; aria: string };

// Corre dentro de la página: tiene que bastarse sola, sin nada del módulo.
function arbolEnLaPagina(): Nodo {
  const nodo = (el: Element): Nodo => {
    const hijos: Nodo[] = [];
    const textos: string[] = [""];
    for (const hijo of el.childNodes) {
      if (hijo.nodeType === Node.ELEMENT_NODE) {
        hijos.push(nodo(hijo as Element));
        textos.push("");
      } else if (hijo.nodeType === Node.TEXT_NODE) {
        textos[textos.length - 1] += hijo.textContent ?? "";
      }
    }
    return {
      etiqueta: el.localName,
      atributos: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
      ...(hijos.length === 0 ? { texto: el.textContent ?? "" } : {}),
      ...(hijos.length > 0 && textos.some((x) => x !== "") ? { textos } : {}),
      hijos,
    };
  };
  return nodo(document.documentElement);
}

export async function fotografiar(page: Page): Promise<Foto> {
  return { arbol: await page.evaluate(arbolEnLaPagina), aria: await page.locator("body").ariaSnapshot() };
}

// Lo único que puede cambiar con el tema: el atributo del <html> y el estado pulsado de su botón.
const esElBotonDelTema = (n: Nodo) => n.etiqueta === "button" && /(?:^|\s)interruptor(?:\s|$)/.test(n.atributos["class"] ?? "");
const seIgnora = (n: Nodo, atributo: string) => (n.etiqueta === "html" && atributo === "data-tema") || (esElBotonDelTema(n) && atributo === "aria-pressed");

// En el árbol de accesibilidad, el botón del tema se lee «button "Tema oscuro" [pressed]»: se quita el estado.
const BOTON_DEL_TEMA = /^(\s*- button "(?:Tema oscuro|Dark theme)")(?: \[pressed(?:=mixed)?\])/;
const sinElPulsado = (linea: string) => linea.replace(BOTON_DEL_TEMA, "$1");

const comillas = (texto: string) => JSON.stringify(texto.length > 80 ? `${texto.slice(0, 80)}…` : texto);

function etiquetaDe(n: Nodo, i: number): string {
  const id = n.atributos["id"] ? `#${n.atributos["id"]}` : "";
  const clase = n.atributos["class"] ? `.${n.atributos["class"].split(/\s+/)[0]}` : "";
  return `${n.etiqueta}${id}${clase}[${i}]`;
}

function diferenciasDelArbol(a: Nodo, b: Nodo, ruta: string, fuera: string[]): void {
  if (a.etiqueta !== b.etiqueta) {
    fuera.push(`${ruta}: la etiqueta es <${a.etiqueta}> y <${b.etiqueta}>`);
    return;
  }
  const nombres = [...new Set([...Object.keys(a.atributos), ...Object.keys(b.atributos)])].sort();
  for (const nombre of nombres) {
    if (seIgnora(a, nombre) || seIgnora(b, nombre)) continue;
    const va = a.atributos[nombre];
    const vb = b.atributos[nombre];
    if (va === undefined) fuera.push(`${ruta}: el atributo ${nombre} solo está en el segundo (${comillas(vb!)})`);
    else if (vb === undefined) fuera.push(`${ruta}: el atributo ${nombre} solo está en el primero (${comillas(va)})`);
    else if (va !== vb) fuera.push(`${ruta}: el atributo ${nombre} es ${comillas(va)} y ${comillas(vb)}`);
  }
  if ((a.texto ?? null) !== (b.texto ?? null)) fuera.push(`${ruta}: el texto es ${comillas(a.texto ?? "(con hijos)")} y ${comillas(b.texto ?? "(con hijos)")}`);
  if (a.hijos.length !== b.hijos.length) fuera.push(`${ruta}: tiene ${a.hijos.length} hijos y ${b.hijos.length}`);
  else {
    // Los textos sueltos entre los hijos: con el mismo número de hijos, tramo a tramo.
    const ta = a.textos ?? a.hijos.map(() => "").concat("");
    const tb = b.textos ?? b.hijos.map(() => "").concat("");
    for (let i = 0; i < ta.length; i++) {
      if (ta[i] !== tb[i]) fuera.push(`${ruta}: el texto suelto ${i === ta.length - 1 ? "del final" : `antes del hijo ${i}`} es ${comillas(ta[i]!)} y ${comillas(tb[i]!)}`);
    }
  }
  for (let i = 0; i < Math.min(a.hijos.length, b.hijos.length); i++) {
    diferenciasDelArbol(a.hijos[i]!, b.hijos[i]!, `${ruta} > ${etiquetaDe(a.hijos[i]!, i)}`, fuera);
  }
}

function diferenciasDeAria(a: string, b: string, fuera: string[]): void {
  const la = a.split("\n").map(sinElPulsado);
  const lb = b.split("\n").map(sinElPulsado);
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) fuera.push(`aria, línea ${i + 1}: ${comillas(la[i]?.trim() ?? "(no hay)")} y ${comillas(lb[i]?.trim() ?? "(no hay)")}`);
  }
}

// Lo que no coincide entre dos fotos, una línea por diferencia; vacío si son la misma estructura.
export function compararEstructuras(a: Foto, b: Foto): string[] {
  const fuera: string[] = [];
  diferenciasDelArbol(a.arbol, b.arbol, "html", fuera);
  diferenciasDeAria(a.aria, b.aria, fuera);
  return fuera;
}
