# Los comandos de fase de Cursor

Copia de referencia de los cinco comandos que disparan el flujo. **No son la fuente de
verdad**: Cursor solo los lee de la carpeta del usuario, así que la copia que se ejecuta es
la de cada equipo. Este archivo existe para dos cosas: saber qué hace cada comando sin
abrir la carpeta oculta, y poder recrearlos en un dispositivo nuevo sin escribirlos de
memoria.

Van en `C:\Users\<TU_USUARIO>\.cursor\commands\f<N>.md` (un archivo por comando, el nombre
del archivo es el nombre del comando). Se invocan escribiendo `/f1`, `/f2`… en el chat.

> Si editas un comando en un equipo, la copia del otro **no** se actualiza. Mantenerlos
> sincronizados es hoy un paso manual; volverlos portables es un
> [issue pendiente](https://github.com/Montse2308/MCP_orquestador/issues).

## Qué carga cada uno, y qué no

Los comandos son **orquestación**: qué tool llamar, en qué orden, y con qué nombre guardar
el documento. El rol, las reglas y la estructura del documento viven en `prompts/*.md` y
llegan por `get_phase_prompt`. Por eso un comando puede quedarse igual mientras el prompt
de su fase cambia por completo.

La regla al editarlos: si lo que quieres cambiar es **cómo se comporta** el modelo o **qué
secciones** tiene el documento, va en el prompt. Si es **qué tool se llama** o **cómo se
llama el archivo**, va en el comando.

---

## `f1.md` — Descubrimiento

```markdown
Vas a iniciar la FASE 1 (Descubrimiento) del flujo del mcp-orquestador.

Datos de la tarea (tómalos del texto que escribí después del comando; si falta alguno, pregúntame antes de seguir):
- project: bos | crm | kanban
- task_name: nombre corto de la tarea
- initial_context: el correo / mensaje / requerimiento completo

Pasos:
1. Llama a la tool `start_task` del mcp-orquestador con project, task_name e initial_context.
2. Llama a `get_phase_prompt(1)` y asume ese rol de comportamiento.
3. Analiza el código actual de este repositorio para entender el impacto del requerimiento.
4. Usa `write_central_doc` (project + task_name + file_name = "01 - Análisis Técnico.md") para guardar el análisis técnico y funcional.

No escribas código de producción todavía.
```

## `f2.md` — Decisiones

```markdown
Vas a iniciar la FASE 2 (Decisiones) del flujo del mcp-orquestador.

Pasos:
1. Si no sabes cuál es la tarea activa, llama a `get_active_task` (o pídeme project + task_name).
2. Llama a `get_phase_prompt(2)` y asume ese rol.
3. Lee "01 - Análisis Técnico.md" con `read_central_doc`.
4. Identifica lagunas técnicas, riesgos y dependencias con el código existente.
5. Hazme la lista de preguntas críticas de decisión, explicándome las implicaciones de cada una.
6. Detente y espera mis respuestas. No escribas código aún.
7. Cuando ya te haya respondido: valida cada decisión contra el código real antes de darla por cerrada y guarda "02 - Decisiones.md" con `write_central_doc`, con la estructura que pide el prompt de la fase.

El documento de la Fase 2 es obligatorio, aunque las decisiones se hayan tomado conversando: el chat no viaja entre dispositivos, el documento sí.
```

## `f3.md` — Plan Técnico

```markdown
Vas a iniciar la FASE 3 (Plan Técnico) del flujo del mcp-orquestador.

Pasos:
1. Si no sabes la tarea activa, llama a `get_active_task` (o pídeme project + task_name).
2. Llama a `get_phase_prompt(3)` y asume ese rol.
3. Lee "01 - Análisis Técnico.md" y "02 - Decisiones.md" con `read_central_doc`.
4. Comprueba contra el código real lo que el plan va a afirmar, ANTES de escribirlo.
5. Con las decisiones ya tomadas, genera el plan de implementación paso a paso (archivos a crear/modificar), respetando "Cero Rupturas".
6. Guárdalo con `write_central_doc` como "03 - Plan Técnico.md".
7. Incluye una sección de cómo verificar rápidamente que todo funcionará.
```

## `f4.md` — Ejecución

```markdown
Vas a iniciar la FASE 4 (Ejecución) del flujo del mcp-orquestador.

Pasos:
1. Si no sabes la tarea activa, llama a `get_active_task` (o pídeme project + task_name).
2. Llama a `get_phase_prompt(4)` y asume ese rol.
3. Lee "03 - Plan Técnico.md" con `read_central_doc` y ejecútalo paso a paso, aplicando las reglas del repositorio actual.
4. Verifica ejecutando lo que se pueda ejecutar, no describiendo. Al terminar cada bloque de cambios, dime cómo verificar lo que solo yo puedo verificar antes de avanzar.
5. Al cerrar, guarda "04 - Ejecución.md" con `write_central_doc`, con la estructura que pide el prompt de la fase.

El entregable de esta fase es el código funcionando; el documento es el recibo, así que va al final y corto.
```

## `f5.md` — Auditoría / Pre-PR

```markdown
Vas a iniciar la FASE 5 (Auditoría / Pre-PR) del flujo del mcp-orquestador.

Commits a auditar: tómalos del texto que escribí después del comando (ej. "los últimos 6 commits de esta rama" o un rango). Si no especifiqué nada, pregúntame cuáles antes de seguir.

Pasos:
1. Llama a `get_phase_prompt(5)` y asume ese rol de auditor externo.
2. Inspecciona los commits indicados usando SOLO lectura (git diff / git log de solo lectura, leer archivos). Nunca hagas commits, push ni subas PRs; de eso me encargo yo.
3. Entrégame en el chat:
   - La AUDITORÍA con el formato del revisor, dejando clarísimo si hay cambios BLOQUEANTES para subir el PR.
   - La DESCRIPCIÓN del PR (título + cuerpo), contrastada contra el código real.
```
