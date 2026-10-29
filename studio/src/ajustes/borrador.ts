// El borrador de una página de Ajustes: los campos que la persona cambió y todavía no aplicó. Vive fuera de
// los componentes, así que sobrevive a un nuevo render (y a recargar los datos del disco), y el menú puede
// decir cuántos cambios tiene cada página.
//
// Por cada campo cambiado se guarda también el valor que tenía el disco cuando se tocó (`base`). Si el
// archivo cambia después y ese campo ya no vale lo que valía, el campo está en conflicto: ni se pisa en
// silencio ni se descarta, y la persona elige. Un campo vuelve a ser el del disco si se deja igual que él.
//
// Salir de la página con un borrador pide confirmación (guardarSalida), y cerrar la pestaña también.

import { useEffect, useRef, useState } from "preact/hooks";

import { t } from "../i18n/idioma";
import { leerRuta } from "../rutas";

type Borrador = { valores: Record<string, unknown>; base: Record<string, unknown> };

const borradores = new Map<string, Borrador>();
const suscritos = new Set<() => void>();

const igual = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function avisar(): void {
  for (const s of suscritos) s();
}

export function cuantosCambios(pagina: string): number {
  return Object.keys(borradores.get(pagina)?.valores ?? {}).length;
}

export function hayCambios(): boolean {
  return [...borradores.keys()].some((p) => cuantosCambios(p) > 0);
}

export function descartarTodo(): void {
  borradores.clear();
  avisar();
}

// Quien quiera saber cuántos cambios tiene cada página (el menú), y volver a pintar cuando cambien.
export function useCambios(): (pagina: string) => number {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const alCambiar = () => setVersion((v) => v + 1);
    suscritos.add(alCambiar);
    return () => {
      suscritos.delete(alCambiar);
    };
  }, []);
  return cuantosCambios;
}

export type ControlDeBorrador<T extends Record<string, unknown>> = {
  // El valor que se enseña: el del borrador si el campo cambió, y si no, el del disco.
  valor: <K extends keyof T>(campo: K) => T[K];
  // Lo que dice el disco ahora, aunque el campo esté cambiado.
  delDisco: <K extends keyof T>(campo: K) => T[K];
  cambiado: (campo: keyof T) => boolean;
  enConflicto: (campo: keyof T) => boolean;
  poner: <K extends keyof T>(campo: K, valor: T[K]) => void;
  // Descarta el cambio de un campo: vuelve a valer lo del disco.
  quitar: (campo: keyof T) => void;
  // Un campo en conflicto: me quedo con el mío, que desde ahora parte de lo que dice el disco.
  conservar: (campo: keyof T) => void;
  descartar: () => void;
  // Solo los campos cambiados.
  cambios: Partial<T>;
  cuantos: number;
  // Sube cada vez que el disco cambia mientras hay un borrador: lo usa Accion para pedir el plan otra vez.
  version: number;
  // El archivo cambió en el disco desde que se empezó a editar.
  discoCambio: boolean;
};

export function useBorrador<T extends Record<string, unknown>>(pagina: string, disco: T | null): ControlDeBorrador<T> {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const alCambiar = () => setVersion((v) => v + 1);
    suscritos.add(alCambiar);
    return () => {
      suscritos.delete(alCambiar);
    };
  }, []);

  const borrador = borradores.get(pagina);
  const valores = borrador?.valores ?? {};
  const base = borrador?.base ?? {};

  // Cuántas veces cambió el disco con un borrador abierto, y cómo estaba cuando se empezó a editar.
  const textoDelDisco = JSON.stringify(disco);
  const ultimoTexto = useRef(textoDelDisco);
  const inicial = useRef<{ pagina: string; texto: string } | null>(null);
  const [version, setVersionDelDisco] = useState(0);
  if (Object.keys(valores).length === 0) inicial.current = null;
  else if (inicial.current === null || inicial.current.pagina !== pagina) inicial.current = { pagina, texto: textoDelDisco };
  useEffect(() => {
    if (ultimoTexto.current === textoDelDisco) return;
    ultimoTexto.current = textoDelDisco;
    if (cuantosCambios(pagina) > 0) setVersionDelDisco((v) => v + 1);
  }, [textoDelDisco]);

  const delDisco = <K extends keyof T>(campo: K): T[K] => (disco as T)[campo];
  const entrada = (): Borrador => {
    let b = borradores.get(pagina);
    if (!b) {
      b = { valores: {}, base: {} };
      borradores.set(pagina, b);
    }
    return b;
  };
  const limpiarSiVacio = (): void => {
    if (cuantosCambios(pagina) === 0) borradores.delete(pagina);
  };

  return {
    valor: (campo) => (campo in valores ? (valores[campo as string] as T[typeof campo]) : disco ? delDisco(campo) : (undefined as T[typeof campo])),
    delDisco: (campo) => (disco ? delDisco(campo) : (undefined as T[typeof campo])),
    cambiado: (campo) => (campo as string) in valores,
    enConflicto: (campo) => (campo as string) in valores && disco !== null && !igual(base[campo as string], delDisco(campo)),
    poner: (campo, valor) => {
      if (!disco) return;
      const b = entrada();
      if (igual(valor, delDisco(campo))) {
        delete b.valores[campo as string];
        delete b.base[campo as string];
        limpiarSiVacio();
      } else {
        if (!((campo as string) in b.valores)) b.base[campo as string] = delDisco(campo);
        b.valores[campo as string] = valor;
      }
      avisar();
    },
    quitar: (campo) => {
      const b = borradores.get(pagina);
      if (!b) return;
      delete b.valores[campo as string];
      delete b.base[campo as string];
      limpiarSiVacio();
      avisar();
    },
    conservar: (campo) => {
      const b = borradores.get(pagina);
      if (!b || !disco) return;
      b.base[campo as string] = delDisco(campo);
      avisar();
    },
    descartar: () => {
      borradores.delete(pagina);
      avisar();
    },
    cambios: { ...valores } as Partial<T>,
    cuantos: Object.keys(valores).length,
    version,
    discoCambio: Object.keys(valores).length > 0 && inicial.current !== null && inicial.current.texto !== textoDelDisco,
  };
}

// ─── Salir con un borrador ──────────────────────────────────────────────────
// La página de Ajustes de un hash: "equipo", "proyecto/P"… Fuera de Ajustes, ninguna.
function paginaDelHash(hash: string): string | null {
  const ruta = leerRuta(hash);
  if (ruta.vista !== "ajustes") return null;
  return ruta.partes.slice(0, ruta.partes[0] === "proyecto" ? 2 : 1).join("/") || "equipo";
}

// Pide confirmación al irse de la página que tiene un borrador (un enlace del menú, de la barra, atrás) y al
// cerrar o recargar la pestaña. Si la persona no confirma, el hash vuelve a donde estaba.
export function guardarSalida(): () => void {
  let hashActual = window.location.hash;
  const alCambiarElHash = (): void => {
    const anterior = hashActual;
    const nuevo = window.location.hash;
    hashActual = nuevo;
    if (paginaDelHash(anterior) === paginaDelHash(nuevo)) return;
    const pagina = paginaDelHash(anterior);
    if (pagina === null || cuantosCambios(pagina === "equipo" ? "equipo" : `proyecto:${pagina.split("/")[1] ?? ""}`) === 0) return;
    if (window.confirm(t("ajustes.salirConCambios"))) {
      descartarTodo();
      return;
    }
    hashActual = anterior;
    window.location.hash = anterior;
  };
  const alCerrar = (e: BeforeUnloadEvent): void => {
    if (!hayCambios()) return;
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("hashchange", alCambiarElHash);
  window.addEventListener("beforeunload", alCerrar);
  return () => {
    window.removeEventListener("hashchange", alCambiarElHash);
    window.removeEventListener("beforeunload", alCerrar);
  };
}
