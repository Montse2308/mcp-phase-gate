// Las marcas de estado, en SVG propio. Cada estado tiene su FORMA, además de su color, y siempre va con su
// texto al lado: nunca se dice nada solo con color. Las marcas son decorativas (aria-hidden): el texto es
// lo que se lee.

export type Forma = "lleno" | "anillo" | "rombo" | "vacio" | "cuadro" | "triangulo" | "raya" | "discontinuo" | "cuadro-vacio" | "rombo-vacio" | "triangulo-vacio";
export type Tono = "verde" | "ambar" | "rojo" | "violeta" | "apagado" | "neutro";

export function Marca({ forma, tono, titulo }: { forma: Forma; tono: Tono; titulo?: string }) {
  return (
    <svg class={`marca marca-${forma} tono-${tono}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      {titulo ? <title>{titulo}</title> : null}
      {forma === "lleno" ? <circle cx="8" cy="8" r="6" class="relleno" /> : null}
      {forma === "anillo" ? (
        <>
          <circle cx="8" cy="8" r="6.2" class="trazo" fill="none" stroke-width="1.6" />
          <circle cx="8" cy="8" r="3" class="relleno" />
        </>
      ) : null}
      {forma === "rombo" ? <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" class="relleno" /> : null}
      {forma === "vacio" ? <circle cx="8" cy="8" r="5.6" class="trazo" fill="none" stroke-width="1.6" /> : null}
      {forma === "cuadro" ? <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" class="relleno" /> : null}
      {forma === "triangulo" ? <path d="M8 1.8 14.6 13.8H1.4Z" class="relleno" /> : null}
      {forma === "raya" ? <rect x="2" y="7" width="12" height="2.2" rx="1" class="relleno" /> : null}
      {forma === "discontinuo" ? <circle cx="8" cy="8" r="5.6" class="trazo" fill="none" stroke-width="1.6" stroke-dasharray="2.6 2.2" /> : null}
      {forma === "cuadro-vacio" ? <rect x="3" y="3" width="10" height="10" rx="1.5" class="trazo" fill="none" stroke-width="1.6" /> : null}
      {forma === "rombo-vacio" ? <path d="M8 2.3 13.7 8 8 13.7 2.3 8Z" class="trazo" fill="none" stroke-width="1.6" stroke-linejoin="round" /> : null}
      {forma === "triangulo-vacio" ? <path d="M8 2.8 13.7 13H2.3Z" class="trazo" fill="none" stroke-width="1.6" stroke-linejoin="round" /> : null}
    </svg>
  );
}
