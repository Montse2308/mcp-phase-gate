// The `equipo` plan: edits `<configDir>/machine.json` as a whole. It is what the "Este equipo" page of
// Ajustes writes: the paths of this machine, its default language and preset, and the own path of any repo.

import { z } from "zod";

import { mensaje } from "../i18n/mensajes.js";
import { leerMaquinaParaEditar, planDeEdicion } from "./edicion-maquina.js";
import type { EdicionDeMaquina } from "./edicion-maquina.js";
import type { PlanDeAjustes } from "./plan.js";

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const Ruta = z.string().min(1).max(1024);

// Every field takes a value, or `null` to remove it. A field that is not given is not touched.
export const ArgumentosDeEquipo = z
  .object({
    rutas: z
      .object({
        documentacion: Ruta.nullable().optional(),
        carpetaDeRepos: Ruta.nullable().optional(),
        subcarpetaTareas: z.string().max(260).nullable().optional(),
      })
      .strict()
      .optional(),
    idiomaPorDefecto: z.enum(["es", "en"]).nullable().optional(),
    presetPorDefecto: z.string().regex(ID).nullable().optional(),
    repos: z.record(z.string().min(3).max(300), Ruta.nullable()).optional(),
  })
  .strict()
  .refine((a) => Object.values(a).some((valor) => valor !== undefined), "indica qué cambiar");

export type ArgumentosDeEquipo = z.infer<typeof ArgumentosDeEquipo>;

export function planDeEquipo(argumentos: ArgumentosDeEquipo): PlanDeAjustes {
  const estado = leerMaquinaParaEditar();
  if (estado.estado === "invalido") return { posible: false, motivo: mensaje("AJUSTES-MAQUINA-A-MANO", { error: estado.error }) };

  const planeada = planDeEdicion(estado, argumentos as EdicionDeMaquina);
  if (!planeada) return { posible: false, motivo: mensaje("AJUSTES-EQUIPO-IGUAL") };

  const { cambios, nuevo, deVersion1 } = planeada;
  return {
    posible: true,
    resumen: mensaje("AJUSTES-EQUIPO-RESUMEN", { cambios, nuevo, deVersion1 }),
    hecho: mensaje("AJUSTES-EQUIPO-HECHO", { cambios }),
    escrituras: [planeada.escritura],
    avisos: planeada.faltan.map(({ clave, ruta }) => mensaje("AJUSTES-RUTA-NO-EXISTE", { clave, ruta })),
  };
}
