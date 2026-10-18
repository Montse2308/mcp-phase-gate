// Las marcas de estado, en SVG propio. Cada estado tiene su FORMA, además de su color, y siempre va con su
// texto al lado: nunca se dice nada solo con color. Las marcas son decorativas (aria-hidden): el texto es
// lo que se lee.

export type Forma = "lleno" | "anillo" | "rombo" | "vacio" | "cuadro" | "triangulo" | "raya";
export type Tono = "verde" | "ambar" | "rojo" | "apagado" | "neutro";

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
    </svg>
  );
}

// Una vía de tren: dos carriles y sus traviesas. Con cambios sin commit, el carril de abajo va
// discontinuo; sin git, solo las traviesas.
export function Via({ estado }: { estado: "limpia" | "cambios" | "sin-git" | "rota" }) {
  return (
    <svg class={`via-dibujo via-${estado}`} viewBox="0 0 64 16" width="64" height="16" aria-hidden="true" focusable="false">
      {[4, 14, 24, 34, 44, 54].map((x) => (
        <rect key={x} x={x} y="2" width="4" height="12" rx="1" class="traviesa" />
      ))}
      {estado !== "sin-git" ? <line x1="0" y1="5" x2="64" y2="5" class="carril" stroke-width="2" /> : null}
      {estado !== "sin-git" ? <line x1="0" y1="11" x2="64" y2="11" class="carril" stroke-width="2" stroke-dasharray={estado === "cambios" ? "5 3" : estado === "rota" ? "2 6" : undefined} /> : null}
    </svg>
  );
}

// Una locomotora: hay una tarea activa en la estación.
export function Tren() {
  return (
    <svg class="tren-dibujo" viewBox="0 0 40 20" width="40" height="20" aria-hidden="true" focusable="false">
      <rect x="2" y="5" width="26" height="9" rx="2" class="caja" />
      <rect x="22" y="1.5" width="8" height="8" rx="1" class="caja" />
      <rect x="24" y="3.5" width="4" height="3" class="ventana" />
      <path d="M30 14h6l2-4h-8Z" class="caja" />
      <circle cx="8" cy="16" r="2.6" class="rueda" />
      <circle cx="16" cy="16" r="2.6" class="rueda" />
      <circle cx="25" cy="16" r="2.6" class="rueda" />
    </svg>
  );
}

// Un farol: encendido si una sesión MCP tiene abierto el proyecto.
export function Farol({ encendido }: { encendido: boolean }) {
  return (
    <svg class={`farol-dibujo ${encendido ? "farol-encendido" : "farol-apagado"}`} viewBox="0 0 16 24" width="16" height="24" aria-hidden="true" focusable="false">
      {encendido ? <circle cx="8" cy="12" r="7" class="halo" /> : null}
      <path d="M5 4h6l1 3v9l-1 3H5l-1-3V7Z" class="cuerpo" />
      <rect x="6" y="8" width="4" height="7" rx="1" class="luz" />
      <rect x="7" y="1" width="2" height="3" class="cuerpo" />
      <rect x="5" y="19" width="6" height="3" class="cuerpo" />
    </svg>
  );
}
