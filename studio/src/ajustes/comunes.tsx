// Lo que comparten las páginas de Ajustes: el campo con su marca de «Cambiado, sin aplicar» o de conflicto, el
// pie con su Aplicar y su Descartar (un solo plan por página), y de dónde sale un valor. En el sitio exportado,
// Ajustes se ve pero no se edita; con datos reales exportados, lo que enseña rutas no está.

import type { ComponentChildren } from "preact";
import { useId } from "preact/hooks";

import { Accion } from "../comun/accion";
import { IndicadorDeEstado } from "../comun/indicador";
import { MODO } from "../datos";
import { t } from "../i18n/idioma";
import type { ControlDeBorrador } from "./borrador";

export const SOLO_LECTURA = MODO === "estatico";

// El sitio exportado con una Documentación de verdad: las páginas que enseñan rutas dicen que no están.
export const SIN_DATOS_REALES = MODO === "estatico" && window.PG_BANDA_CLAVE === "estatico-datos";

export function NoDisponible() {
  return (
    <p class="aviso" role="status">
      {t("ajustes.noDisponible")}
    </p>
  );
}

// De dónde sale un valor (FuenteVariable de config.ts, y «sistema» para el idioma).
export function fuenteVisible(fuente: string): string {
  if (fuente === "entorno") return t("fuente.entorno");
  if (fuente === ".env") return t("fuente.envFile");
  if (fuente === "machine.json") return t("fuente.maquina");
  if (fuente === "sistema") return t("fuente.sistema");
  if (fuente === "sin definir") return t("fuente.sinDefinir");
  return fuente;
}

// Un valor del borrador o del disco, dicho para una persona.
export function legible(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return t("ajustes.conflictoVacio");
  if (typeof valor === "boolean") return t(valor ? "comun.si" : "comun.no");
  if (Array.isArray(valor)) return valor.length ? valor.map((v) => (v !== null && typeof v === "object" && "id" in v ? String((v as { id: unknown }).id) : String(v))).join(", ") : t("ajustes.conflictoVacio");
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

// Qué es cada archivo del diff: lo que viaja con la Documentación y lo que es solo de esta computadora.
export function rotuloDeArchivo(archivo: string): string | null {
  if (archivo.endsWith("machine.json")) return t("ajustes.soloEstaComputadora");
  if (archivo.endsWith("phase-gate.json")) return t("ajustes.viajaConLaDocumentacion");
  return null;
}

type PropiedadesDeCampo<T extends Record<string, unknown>> = {
  nombre: keyof T & string;
  etiqueta: string;
  borrador: ControlDeBorrador<T>;
  // Un campo que son varios controles (los repos) lleva su etiqueta como leyenda de un grupo, y no de un control.
  grupo?: boolean;
  ayuda?: ComponentChildren;
  children: ComponentChildren | ((id: string) => ComponentChildren);
};

export function Campo<T extends Record<string, unknown>>({ nombre, etiqueta, borrador, grupo, ayuda, children }: PropiedadesDeCampo<T>) {
  const id = useId();
  const cambiado = borrador.cambiado(nombre);
  const conflicto = borrador.enConflicto(nombre);
  const control = typeof children === "function" ? children(id) : children;
  const marcas = (
    <>
      {cambiado ? (
        <p class="linea">
          <IndicadorDeEstado estado="ajustes-cambiado" texto={t("ajustes.cambiado")} />
        </p>
      ) : null}
      {conflicto ? (
        <div class="conflicto" role="group" aria-label={t("ajustes.conflicto")}>
          <p class="linea">
            <IndicadorDeEstado estado="ajustes-conflicto" texto={t("ajustes.conflicto")} /> {t("ajustes.conflictoTexto", { valor: legible(borrador.delDisco(nombre)) })}
          </p>
          <p class="botones">
            <button type="button" class="boton" onClick={() => borrador.conservar(nombre)}>
              {t("ajustes.quedarmeConElMio")}
            </button>
            <button type="button" class="boton" onClick={() => borrador.quitar(nombre)}>
              {t("ajustes.usarElDelDisco")}
            </button>
          </p>
        </div>
      ) : null}
    </>
  );
  if (grupo) {
    return (
      <fieldset class={`campo-ajuste${cambiado ? " campo-cambiado" : ""}`} data-campo={nombre}>
        <legend>{etiqueta}</legend>
        {control}
        {ayuda}
        {marcas}
      </fieldset>
    );
  }
  return (
    <div class={`campo-ajuste${cambiado ? " campo-cambiado" : ""}`} data-campo={nombre}>
      <label for={id}>{etiqueta}</label>
      {control}
      {ayuda}
      {marcas}
    </div>
  );
}

// El pie de una página: un solo Aplicar (con su vista previa, un diff por archivo) y un solo Descartar.
export function Pie<T extends Record<string, unknown>>({ borrador, accion, argumentos, sinCambios, alAplicar }: { borrador: ControlDeBorrador<T>; accion: string; argumentos: unknown; sinCambios: boolean; alAplicar: () => void }) {
  return (
    <div class="pie-ajustes">
      {borrador.discoCambio ? (
        <p class="aviso" role="status">
          {t("ajustes.discoCambio")}
        </p>
      ) : null}
      <Accion
        etiqueta={t("ajustes.guardar")}
        accion={accion}
        argumentos={argumentos}
        alAplicar={() => {
          borrador.descartar();
          alAplicar();
        }}
        deshabilitado={sinCambios}
        version={borrador.version}
        rotulo={rotuloDeArchivo}
      />
      {borrador.cuantos > 0 && !SOLO_LECTURA ? (
        <p>
          <button type="button" class="boton" onClick={borrador.descartar}>
            {t("ajustes.descartar")}
          </button>
        </p>
      ) : null}
    </div>
  );
}
