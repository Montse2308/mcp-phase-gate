// Una tabla accesible que en un teléfono se apila: cada fila pasa a ser una ficha con la etiqueta de cada
// celda delante (data-etiqueta). Los roles ARIA explícitos conservan la semántica de tabla aunque el CSS
// cambie su `display`.

import type { ComponentChildren } from "preact";

export type Fila = { clave: string; celdas: ComponentChildren[] };

export function Tabla({ titulo, columnas, filas }: { titulo: string; columnas: string[]; filas: Fila[] }) {
  return (
    <div class="tabla-envoltura">
      <table class="tabla" role="table">
        <caption>{titulo}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columnas.map((c) => (
              <th key={c} scope="col" role="columnheader">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {filas.map((f) => (
            <tr key={f.clave} role="row">
              {f.celdas.map((celda, i) =>
                i === 0 ? (
                  <th key={i} scope="row" role="rowheader" data-etiqueta={columnas[i]}>
                    {celda}
                  </th>
                ) : (
                  <td key={i} role="cell" data-etiqueta={columnas[i]}>
                    {celda}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
