// The plans of Ajustes: what editing a configuration file would do, without writing anything. They live
// here and not in studio/ so that a CLI command can use them later; the Studio turns them into its two
// steps (a preview with a fingerprint, and applying it).

// One file to write. `antes` is what the file holds now (null: it does not exist), `despues` what it
// would hold. `copia`: keep a .bak of the previous content. `exclusiva`: create it only if it is not there.
export type EscrituraDePlan = { ruta: string; antes: string | null; despues: string; copia: boolean; exclusiva: boolean };

export type PlanDeAjustes =
  | { posible: true; resumen: string; hecho: string; escrituras: EscrituraDePlan[]; avisos: string[] }
  | { posible: false; motivo: string };

// The arguments are fine in shape but the result would not be: a repeated id, a folder with "..", a path
// that is not absolute. The Studio answers 400, before any preview.
export class ErrorDeArgumentos extends Error {}

export const json2 = (valor: unknown): string => `${JSON.stringify(valor, null, 2)}\n`;

export const esObjeto = (valor: unknown): valor is Record<string, unknown> => valor !== null && typeof valor === "object" && !Array.isArray(valor);
