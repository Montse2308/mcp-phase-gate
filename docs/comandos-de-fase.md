# Los comandos de fase

Los comandos `/f1`…`/f5` disparan el flujo: cada uno le dice al modelo qué tools llamar, y en
qué orden, para arrancar su fase. Su texto vive en **una sola fuente**:
[`prompts/comandos/`](../prompts/comandos), que viaja dentro del paquete de npm.

## Cómo llegan a tu cliente

**Como MCP Prompts (desde la versión 2.2.0).** El servidor ofrece cada comando como un prompt
MCP llamado `f1`, `f2`… Los clientes que muestran prompts los listan solos, sin copiar nada a
ninguna carpeta, y se actualizan con cada versión del paquete. Cómo se ven, según la
documentación de cada cliente (lo observado en cada uno queda en la tabla de clientes del
README):

| Cliente | Cómo se invocan |
|---------|-----------------|
| Claude Code | `/<clave>:f1 (MCP)` en el menú de `/`; también acepta `/mcp__<clave>__f1` |
| Cursor | En el menú de prompts MCP del chat |
| VS Code | En el menú de `/` del chat, con el nombre del servidor delante; su documentación se contradice entre `/<clave>.f1` y `mcp.<clave>.f1` |

`<clave>` es el nombre con el que registraste el servidor en tu cliente (por ejemplo
`mcp-phase-gate`). Si ya lo tienes registrado, **conserva esa clave**: cambiarla cambia el
nombre de todas las tools y prompts, y te obliga a volver a conceder los permisos.

Los argumentos son todos opcionales (`project`; en `/f1` también `task_name` y `contexto`; en
`/f5`, `commits`). Lo que no pases como argumento te lo pide el propio comando, y un contexto
largo puede ir pegado después del comando como texto normal del chat.

**Como comandos de archivo.** Para quien trabaja en este repo, o con un cliente que no muestra
bien los prompts MCP, hay una copia idéntica en [`.claude/commands/`](../.claude/commands), que
Claude Code lee al abrir el repo. Para usarlos en Cursor sin prompts MCP, copia los archivos de
`prompts/comandos/` a `~/.cursor/commands/`. Un test (`test/docs.test.ts`) obliga a que
`.claude/commands/` y `prompts/comandos/` sean idénticos.

**Comandos propios.** Un `comandos/fN.md` en tu carpeta de prompts propia
(`PHASE_GATE_PROMPTS_PATH`) gana al de fábrica, igual que los prompts de fase. Una fase sin
comando —por ejemplo, una `fase-6` que añadas tú— recibe su `/f6` con un texto genérico que
hace lo mismo: buscar la tarea activa, pedir el prompt de la fase y guardar su documento.

## Qué carga cada uno, y qué no

Los comandos son **orquestación**: qué tool llamar y en qué orden. El rol, las reglas, la
estructura del documento **y su nombre de archivo** viven en `prompts/*.md` y llegan por
`get_phase_prompt`. Por eso un comando puede quedarse igual mientras el prompt de su fase
cambia por completo. Un prompt `/fN` tampoco trae dentro el prompt de la fase: si lo trajera,
habría dos caminos para recibirlo y en uno la compuerta no sabría en qué proyecto estás.

Ningún comando nombra un archivo, a propósito. El nombre lo declara la cabecera del prompt
de cada fase y el servidor se lo entrega al modelo. Antes estaba escrito en los dos sitios y
se desincronizó de verdad: cambiaron los prompts y los comandos siguieron sin escribir los
documentos nuevos — en el equipo donde `git pull` no llega, porque los comandos no estaban en
el repo.

Tampoco nombran los proyectos: los válidos los detecta el servidor de las carpetas que
existen, y `start_task` devuelve la lista si le pasas uno que no reconoce.

La regla al editarlos: si lo que quieres cambiar es **cómo se comporta** el modelo, **qué
secciones** tiene el documento o **cómo se llama**, va en el prompt. Solo si cambia **qué
tool se llama, o en qué orden**, hay que tocar el comando: en `prompts/comandos/`, y la misma
edición en `.claude/commands/`.
