// La estructura de la página: la barra con las cinco vistas y el interruptor Cabina / Sobrio, la banda
// de la demo y la vista que toca según el hash.

import { BANDA, MODO } from "./datos";
import { cambiarModoVisual, useModoVisual } from "./preferencias";
import { Red } from "./red/red";
import { VISTAS, useRuta } from "./rutas";
import { Tablero } from "./tablero/tablero";
import type { Ruta } from "./rutas";

function Pendiente({ nombre }: { nombre: string }) {
  return (
    <section class="vista" aria-labelledby="titulo-pendiente">
      <h1 id="titulo-pendiente">{nombre}</h1>
      <p>Esta vista todavía no está en este build.</p>
    </section>
  );
}

function Vista({ ruta }: { ruta: Ruta }) {
  switch (ruta.vista) {
    case "red":
      return <Red />;
    case "tablero":
      return <Tablero p={ruta.partes[0]} t={ruta.partes[1]} />;
    default:
      return <Pendiente nombre={VISTAS.find((v) => v.id === ruta.vista)!.nombre} />;
  }
}

export function App() {
  const ruta = useRuta();
  const modo = useModoVisual();
  return (
    <>
      <a class="saltar" href="#contenido" onClick={(e) => { e.preventDefault(); document.getElementById("contenido")?.focus(); }}>
        Saltar al contenido
      </a>
      {MODO !== "vivo" ? (
        <p class="banda-demo" role="note">
          {BANDA ?? "Demo: datos de ejemplo."}
        </p>
      ) : null}
      <header class="barra">
        <p class="marca-studio">
          <span class="marca-nombre">mcp-phase-gate</span> <span class="marca-studio-texto">Studio</span>
        </p>
        <nav aria-label="Vistas">
          <ul>
            {VISTAS.map((v) => (
              <li key={v.id}>
                <a href={`#/${v.id}`} aria-current={ruta.vista === v.id ? "page" : undefined}>
                  {v.nombre}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <button type="button" class="interruptor" aria-pressed={modo === "sobrio"} onClick={cambiarModoVisual}>
          Modo: {modo === "sobrio" ? "Sobrio" : "Cabina"}
        </button>
      </header>
      <main id="contenido" tabIndex={-1}>
        <Vista ruta={ruta} />
      </main>
    </>
  );
}
