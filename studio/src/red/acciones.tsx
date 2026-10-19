// Las acciones de una estación de la Red (§7.7.1): cambiar el preset del proyecto, o crear su
// phase-gate.json si no tiene. Las dos con el ciclo de huella.

import { useState } from "preact/hooks";

import type { ProyectoApi } from "../../../src/studio/contrato.js";
import { Accion } from "../comun/accion";
import { t } from "../i18n/idioma";

export function AccionesDeProyecto({ p, presets, alAplicar }: { p: ProyectoApi; presets: string[]; alAplicar: () => void }) {
  const [preset, setPreset] = useState(p.manifiesto.estado === "ausente" ? "software-replica" : (p.preset?.nombre ?? "software"));
  if (p.manifiesto.estado === "invalido") return null;
  const id = `preset-${p.nombre.replace(/[^\w-]/g, "_")}`;
  const crear = p.manifiesto.estado === "ausente";
  return (
    <div class="acciones-proyecto">
      <label for={id}>{t(crear ? "red.presetNuevo" : "red.preset")}</label>{" "}
      <select id={id} value={preset} onChange={(e) => setPreset((e.target as HTMLSelectElement).value)}>
        {presets.map((nombre) => (
          <option key={nombre} value={nombre}>
            {nombre}
          </option>
        ))}
      </select>
      {crear ? (
        <Accion etiqueta={t("red.crearManifiesto")} accion="crear-manifiesto" argumentos={{ proyecto: p.nombre, preset }} alAplicar={alAplicar} />
      ) : (
        <Accion etiqueta={t("red.cambiarPreset")} accion="preset" argumentos={{ proyecto: p.nombre, preset }} alAplicar={alAplicar} deshabilitado={preset === p.preset?.nombre} />
      )}
    </div>
  );
}
