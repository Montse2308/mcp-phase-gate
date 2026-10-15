---
nombre: ai-agent-ops
descripcion: Mantenimiento de agentes de IA, prompts de sistema, skills, flujos de automatización y servidores MCP.
lotes: true
commits: agente-commitea-con-OK
---

Preset de mcp-phase-gate para el mantenimiento de un agente de IA: su evidencia es el bloque exacto
de prompt, configuración, tool o flujo, más el transcript real; su verificación, una batería de casos
de oro, borde y adversariales; y su cierre, una auditoría de regresión de comportamiento con el
registro de versión. El texto fuera de los bloques no llega al modelo.

<!-- bloque: global/cero-rupturas | despues -->
- En un agente, "romper" también es cambiar su comportamiento fuera del alcance: el formato
  de sus respuestas, su tono, las tools que puede usar, sus límites de seguridad y lo que
  promete a sus usuarios. Esas restricciones globales del agente no se tocan salvo que la
  tarea sea justamente cambiarlas, y entonces se dice.
<!-- /bloque -->

<!-- bloque: global/evidencia -->
Toda afirmación se ancla en algo que otra persona pueda abrir y comprobar:
- el `archivo:línea` o el bloque exacto del prompt, la configuración, la skill, la tool o el
  flujo que la sostiene; y
- para el comportamiento del agente, un **transcript o log real** con su fecha, el modelo y su
  versión, y el entorno en que corrió.

Un comportamiento que no está en un transcript no se afirma: se pone a prueba.
Cuando este flujo dice `archivo:línea`, se refiere a esta unidad de evidencia.
<!-- /bloque -->

<!-- bloque: fase-1/verificacion -->
Si una hipótesis sobre el comportamiento del agente se puede comprobar, **compruébala ahora**:
reprodúcela con una corrida controlada o un dry-run, con la entrada exacta, y guarda el
transcript con fecha, modelo y entorno. Para comparar con cómo se comportaba antes, recupera
la versión anterior del prompt o de la configuración con `git show` o desde su registro de
versiones. Una conducta descrita de memoria no es un diagnóstico.
<!-- /bloque -->

<!-- bloque: fase-2/verificacion -->
Antes de dar por buena una decisión, comprueba: qué otras partes del agente dependen del
bloque que se tocaría (otras instrucciones, skills, tools, flujos que lo llaman), qué casos de
uso reales lo atraviesan, y si la decisión choca con alguna restricción global del agente.
<!-- /bloque -->

<!-- bloque: fase-3/comprobaciones -->
Antes de escribir el primer paso, comprueba lo que el plan da por hecho: que el bloque de
prompt o de configuración que vas a cambiar sea el que de verdad se carga (y no una copia sin
usar), qué otras instrucciones lo contradicen o lo refuerzan, qué tools y permisos tiene el
agente hoy, y qué casos de uso reales pasan por ahí.
<!-- /bloque -->

<!-- bloque: fase-3/pruebas -->
La verificación de un agente es una **batería de casos**, definida aquí antes de tocar nada:

| # | Tipo | Entrada | Salida esperada | Restricción que vigila |
|---|---|---|---|---|

- **De oro:** los casos de uso reales que tienen que seguir funcionando igual.
- **Borde:** entradas raras pero legítimas.
- **Adversariales:** intentos de sacar al agente de sus restricciones (formato, tono, tools
  permitidas, seguridad).

Cada lote dice qué casos de la batería prueba. El criterio de salida es la tabla
`Entrada | Salida antes | Salida después` sin regresiones en los casos de oro y con las
restricciones globales intactas en todos.
<!-- /bloque -->

<!-- bloque: fase-4/verificacion -->
Corre la batería del plan (o el dry-run, si correr de verdad tiene efectos) **antes y después**
del cambio, con la misma entrada, el mismo modelo y la misma configuración salvo lo que el lote
cambia. Guarda los transcripts con fecha, modelo y entorno.
<!-- /bloque -->

<!-- bloque: fase-4/pruebas -->
El recibo de cada lote lleva la tabla `# | Entrada | Salida antes | Salida después | Veredicto`
de los casos que corrió, con el veredicto en una palabra (igual, mejor, regresión), y una
línea por restricción global comprobada. Una regresión en un caso de oro deja el lote
`fallido`. Si un caso no se pudo correr de verdad y se simuló, dilo en esa fila.
<!-- /bloque -->

<!-- bloque: fase-5/pr | antes -->
**Este preset entrega primero una auditoría de regresión de comportamiento**, y después, solo
si los cambios viven en un repositorio con PR, la descripción del PR con el contrato de abajo.

La auditoría de regresión va así:
1. **Veredicto** en la primera línea: sin regresiones, o cuántas y en qué casos.
2. **Tabla de la batería completa**: `# | Tipo | Entrada | Antes | Después | Veredicto`.
3. **Restricciones globales**: una línea por restricción, con su evidencia.
4. **Registro de versión**: qué prompt, configuración, skill o flujo cambió; versión anterior
   y nueva (hash, fecha o etiqueta); y en dos frases qué cambia para quien usa el agente.

Si no hay repositorio ni PR, la entrega termina aquí y el documento de la fase lleva la
auditoría y el registro de versión.
<!-- /bloque -->
