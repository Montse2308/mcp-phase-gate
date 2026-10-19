# Glosario · Glossary

Los términos fijos del flujo en los dos idiomas. Lo usan los prompts y presets en inglés, los mensajes del
servidor, el Studio y los README. Los textos de los que depende el **código** (encabezados que se buscan,
claves de frontmatter, secciones de un recibo) no están aquí sino en `src/vocabulario.ts`, que es la única
fuente y tiene su propio test de contrato.

*The fixed terms of the flow in both languages, used by the English prompts and presets, the server's
messages, the Studio and the READMEs. The strings the **code** depends on live in `src/vocabulario.ts`.*

## Términos · Terms

| Español | English | Español | English |
|---|---|---|---|
| Cero Rupturas | Zero Breakage | Compuerta | Gate |
| Lote | Batch | Recibo | Receipt |
| Ancla / anclar | Anchor / to anchor | Sello / sellado | Seal / sealed |
| Ranura | Slot | Bloque | Block |
| Capa | Layer | Base (de una decisión) | Basis |
| medido · leído en código · documentado · inferido | measured · read in code · documented · inferred | Implicación aceptada | Accepted trade-off |
| Desvíos | Deviations | Pendientes heredados | Inherited pending items |
| Validaciones pendientes | Pending validations | Espera al usuario | Awaiting the user |
| Severidad / Confianza | Severity / Confidence | Traducción para quien pidió el ticket | Plain-language summary for the requester |
| Lo que NO se toca | What must not be touched | Criterio de salida | Exit criterion |
| Preset | Preset | Manifiesto | Manifest |
| Documentación Central | Central Documentation | Contexto inicial | Initial context |
| Propuesta (nivel de código) | Proposal | Definitivo / Firma y contrato | Final / Signature and contract |
| Estado de cierre | Closing status | Nota de despliegue | Deployment note |
| fábrica (capa) | factory (layer) | Taller · Vigía · Bitácora · Red · Tablero | Workshop · Lookout · Logbook · Network · Board |

## Documentos de fábrica · Factory documents

| Fase · Phase | Español | English |
|---|---|---|
| — | `00 - Contexto Inicial.md` | `00 - Initial Context.md` |
| 1 | `01 - Análisis Técnico.md` | `01 - Technical Analysis.md` |
| 2 | `02 - Decisiones.md` | `02 - Decisions.md` |
| 3 | `03 - Plan Técnico.md` | `03 - Technical Plan.md` |
| 4 | `04 - Ejecución.md` y `04 - Ejecución/` | `04 - Execution.md` and `04 - Execution/` |
| 5 | `05 - Auditoría.md` | `05 - Audit.md` |

## Lo que no se traduce · What is never translated

- Los nombres de las tools (`start_task`, `record_batch`…) y de sus parámetros (`titulo`, `que_se_hizo`,
  `cerrar_fase`…). `crear_proyecto` acepta además el alias `create_project`.
- Los identificadores de lote `L01…L99` (la *L* vale para *lote* y para *lot*).
- Los ids de ranura (`fase-3/pruebas`). Cada uno tiene un alias en inglés (`phase-3/tests`) que el parser
  acepta y resuelve al id canónico.
- Las políticas de commits (`agente-commitea-con-OK`, `agente-propone`, `auto`, `ninguno`), los nombres de
  los presets, las claves del manifiesto (`reglas`, `fase5.prPorRepo`) y las variables de entorno.

## Alias de ranuras · Slot aliases

| Ranura | Slot alias | Ranura | Slot alias |
|---|---|---|---|
| `cero-rupturas` | `zero-breakage` | `evidencia` | `evidence` |
| `rol` | `role` | `verificacion` | `verification` |
| `ejemplos` | `examples` | `comprobaciones` | `checks` |
| `lotes` | `batches` | `pruebas` | `tests` |
| `prohibido-lotes` | `forbidden-batches` | `autoverificacion-lotes` | `self-check-batches` |
| `prohibido-commits` | `forbidden-commits` | `autoverificacion-commits` | `self-check-commits` |
| `extra`, `commits`, `pr` | (iguales · same) | | |

El archivo va como `fase-N` o `phase-N`; `global` es igual en los dos. Los modos de un bloque:
`reemplazar`/`replace`, `antes`/`before`, `despues`/`after`.
