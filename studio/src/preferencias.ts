// El tema, claro u oscuro. Sin elección guardada, el CSS sigue al del sistema (prefers-color-scheme) y el
// <html> no lleva data-tema; el botón lo cambia y la elección se recuerda en localStorage, que puede fallar
// (ventana privada, almacenamiento bloqueado): entonces solo vale para esta visita. El selector de Ajustes
// añade "Sistema", que borra la elección.

import { useEffect, useState } from "preact/hooks";

export type Tema = "claro" | "oscuro";
const CLAVE = "pg-tema";
const SISTEMA_OSCURO = "(prefers-color-scheme: dark)";

function guardado(): Tema | null {
  try {
    const valor = window.localStorage.getItem(CLAVE);
    return valor === "claro" || valor === "oscuro" ? valor : null;
  } catch {
    return null;
  }
}

function guardar(tema: Tema | null): void {
  try {
    if (tema) window.localStorage.setItem(CLAVE, tema);
    else window.localStorage.removeItem(CLAVE);
  } catch {
    // sin almacenamiento, la elección dura lo que la página
  }
}

let elegido: Tema | null = guardado();
const suscritos = new Set<() => void>();

// El tema que se está viendo: la elección, o el del sistema si no hay ninguna.
function temaActual(): Tema {
  return elegido ?? (window.matchMedia(SISTEMA_OSCURO).matches ? "oscuro" : "claro");
}

function aplicar(): void {
  if (elegido) document.documentElement.dataset.tema = elegido;
  else delete document.documentElement.dataset.tema;
  for (const s of suscritos) s();
}

export function iniciarTema(): void {
  aplicar();
  // Sin elección, un cambio del sistema repinta el botón; con ella, el CSS ya no lo sigue.
  window.matchMedia(SISTEMA_OSCURO).addEventListener("change", () => {
    for (const s of suscritos) s();
  });
}

export function cambiarTema(): void {
  elegido = temaActual() === "oscuro" ? "claro" : "oscuro";
  guardar(elegido);
  aplicar();
}

// El selector de Ajustes: "sistema" borra la elección y el CSS vuelve a seguir al del sistema.
export function elegirTema(valor: Tema | "sistema"): void {
  elegido = valor === "sistema" ? null : valor;
  guardar(elegido);
  aplicar();
}

// Lo que dice el selector de Ajustes: la elección guardada, o "sistema" si no hay ninguna.
export function useTemaElegido(): Tema | "sistema" {
  const [valor, setValor] = useState<Tema | "sistema">(() => elegido ?? "sistema");
  useEffect(() => {
    const alCambiar = () => setValor(elegido ?? "sistema");
    suscritos.add(alCambiar);
    alCambiar();
    return () => {
      suscritos.delete(alCambiar);
    };
  }, []);
  return valor;
}

// Si el tema que se ve es el oscuro: lo que dice el botón con aria-pressed.
export function useTemaOscuro(): boolean {
  const [oscuro, setOscuro] = useState(() => temaActual() === "oscuro");
  useEffect(() => {
    const alCambiar = () => setOscuro(temaActual() === "oscuro");
    suscritos.add(alCambiar);
    alCambiar();
    return () => {
      suscritos.delete(alCambiar);
    };
  }, []);
  return oscuro;
}
