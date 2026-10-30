// The shape of a message catalog: each code with its text in both languages. A fixed text is a string; one
// with data is a function of its parameters. Both languages receive the same parameters.

import type { Idioma } from "../../vocabulario.js";

// `any` on purpose: each template declares its parameters in its own signature, and `mensaje()` passes them
// as they are.
export type Plantilla = string | ((p: any) => string);

export type Catalogo = Record<string, Record<Idioma, Plantilla>>;
