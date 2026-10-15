---
nombre: research-ops
descripcion: Investigación técnica y operaciones; el entregable es un informe o un runbook, no código.
lotes: true
commits: ninguno
---

Preset de mcp-phase-gate para investigación técnica y operaciones. No hay commits por lote
(`commits: ninguno`), pero los lotes siguen ordenando el trabajo y dejando recibos. El texto fuera de
los bloques no llega al modelo.

<!-- bloque: global/evidencia -->
Toda afirmación se ancla en algo que otra persona pueda abrir y comprobar:
- una fuente con su URL o referencia, su fecha y, si aplica, su versión; o
- la salida real de algo que ejecutaste, con el comando exacto, el entorno y cuándo se corrió.

Una fuente sin fecha vale como `inferido`. Cuando este flujo dice `archivo:línea`, se refiere
a esta unidad de evidencia.
<!-- /bloque -->

<!-- bloque: fase-1/verificacion -->
Si una afirmación se puede comprobar ejecutando algo (un comando, una consulta, un experimento
pequeño), **ejecútalo ahora** y guarda la salida con el comando exacto. Si depende de una
fuente externa, cítala con URL y fecha, y busca una segunda fuente independiente cuando la
conclusión dependa de ella.
<!-- /bloque -->

<!-- bloque: fase-3/pruebas -->
El criterio de salida de cada lote es **reproducibilidad**: los comandos o pasos exactos, el
entorno y los datos de entrada con los que otra persona obtendría el mismo resultado. Un
resultado que no se puede reproducir con lo escrito no se da por bueno.
<!-- /bloque -->

<!-- bloque: fase-4/verificacion -->
Ejecuta los pasos del lote tal como están escritos, guarda cada salida con el comando y la
fecha, y anota cualquier diferencia de entorno respecto a lo planeado.
<!-- /bloque -->

<!-- bloque: fase-5/pr -->
La entrega de esta fase es un **informe** (o un runbook, si la tarea era operativa), no una
descripción de PR:

1. **Conclusión** en la primera línea, con su número si lo hay.
2. **Hallazgos**, cada uno con su evidencia (fuente con URL y fecha, o comando con su salida).
3. **Cómo reproducirlo**: comandos, entorno y datos.
4. **Lo que no se pudo confirmar**, con qué lo confirmaría.
5. **Recomendación**, marcada como tal.

Va dentro de un único bloque de cuatro backticks etiquetado `markdown`, para copiarlo en crudo.
<!-- /bloque -->
