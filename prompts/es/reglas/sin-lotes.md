Variante de la regla `lotes: false`. La activa `reglas.lotes` del phase-gate.json del proyecto, o
el frontmatter del preset. El texto fuera de los bloques no llega al modelo.

<!-- bloque: fase-3/lotes -->
Este proyecto no trabaja por lotes. El plan no lleva tabla de lotes, pero sí el frontmatter
`lotes: 1`, para que la Fase 4 sepa que su recibo es el documento de la fase:

```markdown
---
lotes: 1
---
```

Con esta regla, lo que este prompt dice en PROHIBIDO y en AUTOVERIFICACIÓN sobre la tabla de lotes
no aplica: basta el frontmatter. El criterio de salida y el commit propuesto van una sola vez, al
final del plan.
<!-- /bloque -->

<!-- bloque: fase-4/lotes -->
El plan tiene un solo lote (`lotes: 1`): ejecútalo entero, en el orden del plan, y deja como
documento de la fase un único recibo con la plantilla de abajo, con el nombre exacto que se indica
al final de este prompt y sin crear subcarpeta. Haz el corte de commit una sola vez, al final (ver
COMMITS).

**Salvo si el lote queda `fallido` o `descartado`:** entonces su recibo va en la subcarpeta de
recibos, como `L01 - <slug>.md`, y el documento de la fase no se escribe, porque su existencia
daría la fase por cerrada.

```markdown
---
lote: L01
de: 1
repo: <repo>
rama: <rama>
estado: verificado | con pendientes | fallido | descartado
commit: pendiente | <hash corto> | no aplica
fecha: <AAAA-MM-DD>
---

# L01 — <objetivo>

## Qué se hizo
Una o dos frases, con el número que importe.

## Archivos
| Archivo | Qué cambió |
|---|---|

Sin copiar código: para eso está el diff. La excepción es el fragmento que quedó distinto de
lo que decía el plan.

## Verificación ejecutada
Lo que corriste, con su resultado en números. Si no corriste nada, dilo.

## Espera al usuario
| Prueba | Resultado esperado |
|---|---|

"Ninguna." si no hay. Nunca las des por hechas.

## Desvíos del plan
Lo que no salió como decía el plan, en sus tres formas (método que no servía, decisión nueva,
número equivocado). "Ninguno." si no hubo.

## Decisiones
Las `D<n>` nuevas de este lote, con su **Base**. "Ninguna." si no hubo.
```
<!-- /bloque -->
