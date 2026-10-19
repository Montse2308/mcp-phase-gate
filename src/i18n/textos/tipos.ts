// La forma de un catálogo de mensajes: cada código con su texto en los dos idiomas. Un texto fijo es una
// cadena; uno con datos, una función de sus parámetros. Los dos idiomas reciben los mismos parámetros.

import type { Idioma } from "../../vocabulario.js";

// `any` a propósito: cada plantilla declara sus parámetros en su firma, y `mensaje()` los pasa tal cual.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Plantilla = string | ((p: any) => string);

export type Catalogo = Record<string, Record<Idioma, Plantilla>>;
