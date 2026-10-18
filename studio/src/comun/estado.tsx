// Cargar un recurso de la API y recargarlo con los eventos que le importan, y también al cambiar el idioma
// de la interfaz: lo que dice el servidor llega en el idioma de la petición.

import { useCallback, useEffect, useState } from "preact/hooks";

import { get } from "../datos";
import { t, useIdioma } from "../i18n/idioma";
import { useEventos } from "../eventos";
import type { TipoDeEvento } from "../eventos";

export type Carga<T> = { datos: T | null; error: string | null; cargando: boolean; recargar: () => void };

export function useRecurso<T>(ruta: string | null, eventos: TipoDeEvento[] = [], filtro?: (tipo: TipoDeEvento, datos: Record<string, string>) => boolean): Carga<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const idioma = useIdioma();
  const recargar = useCallback(() => {
    if (!ruta) return;
    setCargando(true);
    get<T>(ruta).then(
      (d) => {
        setDatos(d);
        setError(null);
        setCargando(false);
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setCargando(false);
      }
    );
  }, [ruta, idioma]);
  // Con otra ruta, lo de antes ya no vale; con otro idioma, se deja hasta que llegue lo nuevo.
  useEffect(() => {
    setDatos(null);
  }, [ruta]);
  useEffect(() => {
    recargar();
  }, [recargar]);
  useEventos(eventos, (tipo, d) => {
    if (tipo === "reconexion" || !filtro || filtro(tipo, d)) recargar();
  });
  return { datos, error, cargando, recargar };
}

export function Aviso({ error }: { error: string }) {
  return (
    <p class="aviso aviso-error" role="alert">
      {error}
    </p>
  );
}

export function Cargando() {
  return (
    <p class="cargando" role="status">
      {t("comun.cargando")}
    </p>
  );
}
