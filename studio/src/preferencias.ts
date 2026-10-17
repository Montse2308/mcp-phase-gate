// Cabina o Sobrio: se recuerda en localStorage y se comparte con #?sobrio=1 (o sobrio=0). localStorage
// puede fallar (ventana privada, almacenamiento bloqueado): entonces solo vale para esta visita.

import { useEffect, useState } from "preact/hooks";

export type ModoVisual = "cabina" | "sobrio";
const CLAVE = "pg-modo";

function guardado(): ModoVisual | null {
  try {
    const valor = window.localStorage.getItem(CLAVE);
    return valor === "sobrio" || valor === "cabina" ? valor : null;
  } catch {
    return null;
  }
}

function guardar(modo: ModoVisual): void {
  try {
    window.localStorage.setItem(CLAVE, modo);
  } catch {
    // sin almacenamiento, el modo dura lo que la página
  }
}

function delEnlace(): ModoVisual | null {
  const hash = window.location.hash;
  const corte = hash.indexOf("?");
  if (corte === -1) return null;
  const valor = new URLSearchParams(hash.slice(corte + 1)).get("sobrio");
  return valor === "1" ? "sobrio" : valor === "0" ? "cabina" : null;
}

let actual: ModoVisual = delEnlace() ?? guardado() ?? "cabina";
const suscritos = new Set<(m: ModoVisual) => void>();

function aplicar(modo: ModoVisual): void {
  actual = modo;
  document.documentElement.dataset.modo = modo;
  for (const s of suscritos) s(modo);
}

export function iniciarModoVisual(): void {
  const delHash = delEnlace();
  if (delHash) guardar(delHash);
  aplicar(actual);
  window.addEventListener("hashchange", () => {
    const nuevo = delEnlace();
    if (nuevo && nuevo !== actual) {
      guardar(nuevo);
      aplicar(nuevo);
    }
  });
}

export function cambiarModoVisual(): void {
  const nuevo: ModoVisual = actual === "cabina" ? "sobrio" : "cabina";
  guardar(nuevo);
  aplicar(nuevo);
}

export function useModoVisual(): ModoVisual {
  const [modo, setModo] = useState(actual);
  useEffect(() => {
    suscritos.add(setModo);
    return () => {
      suscritos.delete(setModo);
    };
  }, []);
  return modo;
}
