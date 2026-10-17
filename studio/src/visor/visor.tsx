// El visor lateral: un documento o un recibo de la tarea, con su frontmatter como ficha y el Markdown
// saneado. Se actualiza solo si el archivo cambia (evento documento o recibo de la misma tarea).

import { useEffect, useMemo, useRef } from "preact/hooks";

import type { DocumentoRespuesta } from "../../../src/studio/contrato.js";
import { Aviso, Cargando, useRecurso } from "../comun/estado";
import { ruta } from "../datos";
import { aHtml } from "./markdown";

// El cuerpo sin el frontmatter, que ya va en la ficha.
function sinFrontmatter(texto: string): string {
  return texto.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

export function Visor({ p, t, archivo, alCerrar }: { p: string; t: string; archivo: string; alCerrar: () => void }) {
  const { datos, error, cargando } = useRecurso<DocumentoRespuesta>(
    `/api/tareas/${ruta(p, t)}/documento?archivo=${encodeURIComponent(archivo)}`,
    ["documento", "recibo"],
    (_tipo, d) => d.p === p && d.t === t
  );
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titulo.current?.focus();
  }, [archivo]);
  const html = useMemo(() => (datos ? aHtml(sinFrontmatter(datos.texto)) : ""), [datos]);
  const ficha = datos ? Object.entries(datos.frontmatter) : [];
  return (
    <aside class="visor" aria-labelledby="titulo-visor">
      <header class="visor-cabecera">
        <h2 id="titulo-visor" tabIndex={-1} ref={titulo}>
          {archivo}
        </h2>
        <button type="button" class="boton" onClick={alCerrar}>
          Cerrar el visor
        </button>
      </header>
      {error ? <Aviso error={error} /> : null}
      {cargando && !datos ? <Cargando /> : null}
      {ficha.length ? (
        <dl class="ficha" aria-label="Frontmatter">
          {ficha.map(([clave, valor]) => (
            <div key={clave}>
              <dt>{clave}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {datos ? <div class="markdown" dangerouslySetInnerHTML={{ __html: html }} /> : null}
    </aside>
  );
}
