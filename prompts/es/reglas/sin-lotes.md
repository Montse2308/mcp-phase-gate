Variante de la regla `lotes: false`. La activa `reglas.lotes` del phase-gate.json del proyecto, o
el frontmatter del preset. El texto fuera de los bloques no llega al modelo.

<!-- bloque: fase-3/lotes -->
Este proyecto no trabaja por lotes. El plan no lleva tabla de lotes, pero sí el frontmatter
`lotes: 1`, para que la Fase 4 sepa que tiene un solo lote:

```markdown
---
lotes: 1
---
```

El criterio de salida y el commit propuesto van una sola vez, al final del plan.
<!-- /bloque -->

<!-- bloque: fase-3/prohibido-lotes -->
- Escribir el plan sin el frontmatter `lotes: 1`.
<!-- /bloque -->

<!-- bloque: fase-3/autoverificacion-lotes -->
12. ¿El documento empieza con el frontmatter `lotes: 1`?
<!-- /bloque -->

<!-- bloque: fase-4/lotes | despues -->
El plan tiene un solo lote (`lotes: 1`). Sigue el mismo ciclo una sola vez; al anclarlo, el
servidor convierte su recibo en el documento de la fase.
<!-- /bloque -->
