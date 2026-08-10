# Los comandos de fase

Los cinco comandos que disparan el flujo, con su contenido completo. Se invocan escribiendo
`/f1`, `/f2`… en el chat. Este archivo existe para leerlos sin abrir la carpeta donde vivan y
para poder recrearlos en un dispositivo nuevo sin escribirlos de memoria.

**Dónde viven según el cliente:**

| Cliente | Dónde | ¿Se sincroniza con git? |
|---------|-------|-------------------------|
| Claude Code | [`.claude/commands/`](../.claude/commands) del proyecto, o `~/.claude/commands/` para usarlos desde cualquiera | **Sí** los del proyecto: son parte del repo |
| Cursor | `C:\Users\<TU_USUARIO>\.cursor\commands\f<N>.md` | No: Cursor solo los lee de la carpeta del usuario |
| VS Code | No tiene comandos de barra propios | No: se pega el contenido en el chat |

La copia de `.claude/commands/` es la que manda. Las demás son copias que hay que mantener a
mano, y **si editas una en un equipo, la del otro no se entera** — por eso conviene copiar
desde aquí en vez de editar cada una por su lado.

## Qué carga cada uno, y qué no

Los comandos son **orquestación**: qué tool llamar y en qué orden. El rol, las reglas, la
estructura del documento **y su nombre de archivo** viven en `prompts/*.md` y llegan por
`get_phase_prompt`. Por eso un comando puede quedarse igual mientras el prompt de su fase
cambia por completo.

Ningún comando nombra un archivo, a propósito. El nombre lo declara la cabecera del prompt
de cada fase y el servidor se lo entrega al modelo. Antes estaba escrito en los dos sitios y
se desincronizó de verdad: cambiaron los prompts y los comandos siguieron sin escribir los
documentos nuevos — en el equipo donde `git pull` no llega, porque los comandos no están en
el repo.

Tampoco nombran los proyectos: los válidos los detecta el servidor de las carpetas que
existen, y `start_task` devuelve la lista si le pasas uno que no reconoce.

La regla al editarlos: si lo que quieres cambiar es **cómo se comporta** el modelo, **qué
secciones** tiene el documento o **cómo se llama**, va en el prompt. Solo si cambia **qué
tool se llama, o en qué orden**, hay que tocar el comando.

---

## `f1.md` — Descubrimiento

```markdown
Vas a iniciar la FASE 1 (Descubrimiento) del flujo del mcp-phase-gate.

Datos de la tarea (tómalos del texto que escribí después del comando; si falta alguno, pregúntame antes de seguir):
- project: uno de los proyectos que ya existen. Si no lo reconoce, `start_task` te devuelve la lista; no inventes uno ni pases `crear_proyecto` salvo que yo te diga explícitamente que quiero estrenar un proyecto nuevo.
- task_name: nombre corto de la tarea
- initial_context: el correo / mensaje / requerimiento completo

Pasos:
1. Llama a la tool `start_task` del mcp-phase-gate con project, task_name e initial_context.
2. Llama a `get_phase_prompt(1)` indicándole también el `project` en el que estoy trabajando —con eso comprueba que no me esté saltando una fase— y asume ese rol de comportamiento.
3. Analiza el código actual de este repositorio para entender el impacto del requerimiento.
4. Guarda el análisis técnico y funcional con `write_central_doc`, usando el nombre de archivo exacto que te indicó `get_phase_prompt`.

No escribas código de producción todavía.
```

## `f2.md` — Decisiones

```markdown
Vas a iniciar la FASE 2 (Decisiones) del flujo del mcp-phase-gate.

Pasos:
1. Si no sabes cuál es la tarea activa, llama a `get_active_task` (o pídeme project + task_name).
2. Llama a `get_phase_prompt(2)` indicándole también el `project` en el que estoy trabajando —con eso comprueba que no me esté saltando una fase— y asume ese rol.
3. Lee el documento de la Fase 1 con `read_central_doc`; `get_phase_prompt` te dio su nombre exacto.
4. Identifica lagunas técnicas, riesgos y dependencias con el código existente.
5. Hazme la lista de preguntas críticas de decisión, explicándome las implicaciones de cada una.
6. Detente y espera mis respuestas. No escribas código aún.
7. Cuando ya te haya respondido: valida cada decisión contra el código real antes de darla por cerrada y guarda el documento de la fase con `write_central_doc`, con el nombre que te indicó `get_phase_prompt` y la estructura que pide el prompt.

El documento de la Fase 2 es obligatorio, aunque las decisiones se hayan tomado conversando: el chat no viaja entre dispositivos, el documento sí.
```

## `f3.md` — Plan Técnico

```markdown
Vas a iniciar la FASE 3 (Plan Técnico) del flujo del mcp-phase-gate.

Pasos:
1. Si no sabes la tarea activa, llama a `get_active_task` (o pídeme project + task_name).
2. Llama a `get_phase_prompt(3)` indicándole también el `project` en el que estoy trabajando —con eso comprueba que no me esté saltando una fase— y asume ese rol.
3. Lee los documentos de las fases anteriores con `read_central_doc`; `get_phase_prompt` te dio sus nombres exactos.
4. Comprueba contra el código real lo que el plan va a afirmar, ANTES de escribirlo.
5. Con las decisiones ya tomadas, genera el plan de implementación paso a paso (archivos a crear/modificar), respetando "Cero Rupturas".
6. Guárdalo con `write_central_doc`, con el nombre que te indicó `get_phase_prompt`.
7. Incluye una sección de cómo verificar rápidamente que todo funcionará.
```

## `f4.md` — Ejecución

```markdown
Vas a iniciar la FASE 4 (Ejecución) del flujo del mcp-phase-gate.

Pasos:
1. Si no sabes la tarea activa, llama a `get_active_task` (o pídeme project + task_name).
2. Llama a `get_phase_prompt(4)` indicándole también el `project` en el que estoy trabajando —con eso comprueba que no me esté saltando una fase— y asume ese rol.
3. Lee el plan técnico de la Fase 3 con `read_central_doc` —`get_phase_prompt` te dio su nombre exacto— y ejecútalo paso a paso, aplicando las reglas del repositorio actual.
4. Verifica ejecutando lo que se pueda ejecutar, no describiendo. Al terminar cada bloque de cambios, dime cómo verificar lo que solo yo puedo verificar antes de avanzar.
5. Al cerrar, guarda el documento de la fase con `write_central_doc`, con el nombre que te indicó `get_phase_prompt` y la estructura que pide el prompt.

El entregable de esta fase es el código funcionando; el documento es el recibo, así que va al final y corto.
```

## `f5.md` — Auditoría / Pre-PR

```markdown
Vas a iniciar la FASE 5 (Auditoría / Pre-PR) del flujo del mcp-phase-gate.

Commits a auditar: tómalos del texto que escribí después del comando (ej. "los últimos 6 commits de esta rama" o un rango). Si no especifiqué nada, pregúntame cuáles antes de seguir.

Pasos:
1. Si no sabes la tarea activa, llama a `get_active_task` (o pídeme project + task_name): la auditoría se guarda en su carpeta.
2. Llama a `get_phase_prompt(5)` indicándole también el `project` en el que estoy trabajando —con eso comprueba que no me esté saltando una fase— y asume ese rol de auditor externo.
3. Inspecciona los commits indicados usando SOLO lectura (git diff / git log de solo lectura, leer archivos). Nunca hagas commits, push ni subas PRs; de eso me encargo yo.
4. Entrégame en el chat:
   - La AUDITORÍA con el formato del revisor, dejando clarísimo si hay cambios BLOQUEANTES para subir el PR.
   - La DESCRIPCIÓN del PR (título + cuerpo), contrastada contra el código real.
5. Guarda el documento de la fase con `write_central_doc`, con el nombre que te indicó `get_phase_prompt`: lleva la auditoría y la descripción del PR tal cual me las entregaste.
```
