// El acceso a la API del Studio. Todas las rutas son relativas a la página ("./api/…"), así que el mismo
// build funciona en 127.0.0.1:<puerto>/ y bajo un subdirectorio.
//
// El modo lo fija config.js antes de cargar la aplicación: "vivo" (`ui`), "demo" (`ui --demo`) o
// "estatico" (el sitio exportado, sin servidor).

declare global {
  interface Window {
    PG_MODO?: "vivo" | "demo" | "estatico";
    PG_BANDA?: string;
  }
}

export type ModoApp = "vivo" | "demo" | "estatico";
export const MODO: ModoApp = window.PG_MODO ?? "vivo";
// El texto de la banda de la demo, si lo hay.
export const BANDA: string | null = window.PG_BANDA ?? null;

export class ErrorDeApi extends Error {
  constructor(
    readonly estado: number,
    message: string
  ) {
    super(message);
  }
}

async function respuesta<T>(r: Response): Promise<T> {
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const texto = cuerpo && typeof cuerpo === "object" && "error" in cuerpo ? String((cuerpo as { error: unknown }).error) : `Error ${r.status}`;
    throw new ErrorDeApi(r.status, r.status === 401 ? "Falta la sesión: abre el enlace que imprimió `mcp-phase-gate ui`." : texto);
  }
  return cuerpo as T;
}

export async function get<T>(ruta: string): Promise<T> {
  return respuesta<T>(await fetch(`.${ruta}`, { credentials: "same-origin", headers: { Accept: "application/json" } }));
}

// Toda escritura lleva X-Phase-Gate: 1. El servidor la exige, y obliga a un preflight que nunca concede.
export async function post<T>(ruta: string, cuerpo: unknown): Promise<T> {
  return respuesta<T>(
    await fetch(`.${ruta}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Phase-Gate": "1" },
      body: JSON.stringify(cuerpo),
    })
  );
}

// Los segmentos de una ruta de la API, codificados una vez.
export function ruta(...partes: (string | number)[]): string {
  return partes.map((p) => encodeURIComponent(String(p))).join("/");
}
