# Instalación

Cómo instalar mcp-phase-gate, registrarlo en tu cliente MCP y comprobar que funciona. Una vez registrado, dónde van tus carpetas y cómo cambiar cualquier cosa está en [Configuración](configuracion.md); lo que ve el servidor, en el navegador, en [el Studio](studio.md).

## Dos caminos y un atajo: `init`

Hay dos caminos, y llevan al mismo sitio:

- **Con `npx`** — nada que clonar ni compilar, y se actualiza solo. Es el recomendado si solo quieres usarlo.
- **Desde el código** — si vas a editar los prompts a mano o a contribuir al repo.

El código es idéntico en todos lados; lo único que cambia de un equipo a otro son **las rutas a tus carpetas**, porque el usuario del sistema y dónde tengas la documentación son distintos. Esas rutas viven en `machine.json`, un archivo de la carpeta de configuración de este equipo que leen igual el servidor de cada cliente y el Studio, así que no se repiten en la configuración de cada cliente ([ver Configuración](configuracion.md#machinejson-lo-de-cada-equipo)).

**El atajo: `init`.** Registra el servidor en los clientes que encuentre en tu equipo (Claude Code, Cursor, VS Code) y guarda tus rutas en `machine.json`:

```bash
npx mcp-phase-gate init --docs "C:\Users\TU_USUARIO\Documentos\DOCUMENTACIÓN" --repos "C:\proyectos"
```

Sin `--docs` y `--repos` usa las que ya tienen `machine.json` o el entorno, o te las pregunta. Las rutas van a `machine.json`, no al bloque `env` de cada cliente. Si ya tenías el servidor registrado, **no lo duplica ni le cambia la clave**: actualiza esa entrada, te enseña el diff y te pide confirmación (`--yes` para no preguntar), y le quita las rutas de su `env` (con `--docs` y `--repos` dados, todas; sin ellos, solo las que coinciden con `machine.json`: una distinta se queda y te lo dice). Una entrada que ya existe en Claude Code nunca se reescribe: `init` imprime los dos comandos que la rehacen sin las rutas, y los corres tú. Antes de escribir deja una copia `.bak`, no toca un `mcp.json` que no entiende (te imprime el bloque para pegarlo a mano) y con `--dry-run` solo dice lo que haría. `--cliente cursor` (o `claude-code`, `vscode`, `todos`) elige el cliente; `--comandos` copia además los `/f1`…`/f5` como archivos, y `--migrate` escribe un `phase-gate.json` (con el preset `software-replica`, para que sigan como en la 2.x) en los proyectos que no lo tienen ([ver las notas de la 3.0.0](../notas/v3.0.0.md)). Al terminar te explica cómo poner un candado a `git push`, con honestidad sobre cuál es una frontera de verdad y cuál no, y ejecuta `doctor`.

**O desde el navegador.** Registra el servidor como en el camino A de abajo, sin rutas, y ejecuta `npx mcp-phase-gate ui`: si no hay una Documentación configurada, el Studio abre **Ajustes › Este equipo** y te pregunta dónde está la tuya ([el Studio](studio.md)).

Si prefieres hacerlo a mano, los dos caminos de abajo.

## Requisitos previos

- **Node.js 22 o superior** instalado. Verifícalo con `node -v`. Es lo que declara el `package.json` y lo que prueba el CI (Linux y Windows con 22 y 24, macOS con 22); las versiones anteriores ya no tienen soporte.
- **Una carpeta para tu documentación**, disponible localmente. Si vive en una carpeta sincronizada (OneDrive, Google Drive, Dropbox, iCloud) viaja sola entre tus equipos, que es como se recomienda usarlo — pero no es obligatorio: al servidor solo le llega una ruta local y le da igual qué haya detrás.
- **Un cliente MCP**: Cursor, VS Code o Claude Code.
- **Git**, solo si vas por el camino desde el código.

## Camino A — con `npx` (recomendado)

No hay nada que instalar: `npx` descarga el paquete la primera vez y lo cachea. Todo se configura en el archivo de tu cliente MCP.

**La clave que le pongas es la que identifica al servidor y la que prefija sus tools y sus comandos**, así que puedes ponerle la que quieras. En los ejemplos va `mcp-phase-gate`, igual que el nombre del paquete y el que el servidor declara de sí mismo. Si lo registras por primera vez, una clave corta como `pg` deja los comandos más cortos (`/pg:f1` en Claude Code). **Si ya lo tienes registrado, conserva tu clave**: cambiarla cambia el nombre de todas las tools y comandos, y tendrías que volver a conceder sus permisos.

<details open>
<summary><b>Cursor</b> — <code>C:\Users\&lt;TU_USUARIO&gt;\.cursor\mcp.json</code> (créalo si no existe)</summary>

```json
{
  "mcpServers": {
    "mcp-phase-gate": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"]
    }
  }
}
```

En Windows, Cursor tiene abierto un bug en el que el formulario de confirmación no aparece: añade `"env": { "PHASE_GATE_ELICITATION": "off" }` a esa entrada (`init` lo hace por ti; [por qué](herramientas.md#documentos-protegidos)).
</details>

<details>
<summary><b>VS Code</b> — <code>C:\Users\&lt;TU_USUARIO&gt;\AppData\Roaming\Code\User\mcp.json</code></summary>

Ojo con dos diferencias: la clave de arriba es `servers`, no `mcpServers`, y hay que declarar `type`.

```json
{
  "servers": {
    "mcp-phase-gate": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"]
    }
  }
}
```
</details>

<details>
<summary><b>Claude Code</b> — de una sola línea</summary>

```bash
claude mcp add mcp-phase-gate -- npx -y mcp-phase-gate
```

O a mano, en un `.mcp.json` en la raíz del proyecto, con la misma forma que el de Cursor.
</details>

**¿Dónde van las rutas?** No en este archivo: van en `machine.json`, que leen igual el servidor de cada cliente y el Studio. Lo escribes con `init --docs … --repos …` (arriba) o en el Studio, en **Ajustes › Este equipo**. Sirve cualquier carpeta: una de OneDrive como `C:\Users\TU_USUARIO\OneDrive - TU ORGANIZACIÓN\Documentos\DOCUMENTACIÓN`, `G:\Mi unidad\Documentación`, `D:\Dropbox\Docs` o `C:\Docs` sin nube ninguna.

El idioma de las descripciones de las tools y de los mensajes que no son de un proyecto se fija ahí también, como el idioma por defecto del equipo, o con `PHASE_GATE_LANG`, que gana ([ver Idiomas](configuracion.md#idiomas)).

> **Por este camino no hay archivo `.env`.** El paquete vive dentro de `node_modules`, donde no tiene sentido dejar tu configuración, así que las rutas viven en `machine.json`. Si un cliente necesita otras rutas, pon las variables en el bloque `"env"` de ese cliente: el entorno gana a `machine.json` ([quién gana](configuracion.md#quién-gana)).

**La carpeta de Documentación y la de repos no tienen valor por defecto.** Si falta alguna en todos los sitios (el entorno, un `.env` y `machine.json`), o si apunta a una carpeta que no existe, las tools que la necesitan te lo dicen, y dónde configurarla, en vez de fallar más tarde por otro motivo.

> **¿Ya lo usabas con `ORQUESTADOR_*`?** Esos nombres siguen funcionando como alias de `PHASE_GATE_*`; no tienes que tocar nada. Si defines los dos con valores distintos gana `PHASE_GATE_*`, y `doctor` y el log del servidor te avisan.

> `npx mcp-phase-gate` escrito directamente en una terminal **parece que se cuelga**, y no está roto: es un servidor MCP esperando mensajes por stdin. Si lo que quieres es comprobar tu instalación, usa `npx mcp-phase-gate doctor` ([ver abajo](#revisar-la-instalación-doctor)).

## Camino B — desde el código

Necesario solo si vas a editar los prompts del repo directamente o a contribuir. Para *añadir* prompts propios no hace falta: eso se hace superponiendo carpetas, [ver la guía de Prompts](prompts.md#los-prompts-de-las-fases-viven-en-promptsidioma).

**1. Clona y compila.** La carpeta `build/` NO se sube al repo, así que hay que generarla en cada dispositivo:

```bash
git clone https://github.com/Montse2308/mcp-phase-gate.git
cd mcp-phase-gate
npm install
npm run build
```

**2. Dile al servidor dónde están tus carpetas**, con las rutas de ESTE equipo (no se sube al repo). Aquí no uses `init`: registra el paquete de npm con `npx`, no tu clon. Abre el Studio desde el clon, `node build/index.js ui`, y llena **Ajustes › Este equipo**, o escribe tú el `machine.json` ([su formato](configuracion.md#machinejson-lo-de-cada-equipo)). Si prefieres un archivo junto al código, también sirve un `.env`, que **gana** a `machine.json`:

```bash
copy .env.example .env
```

Averigua tu ruta real abriendo la carpeta en el explorador y copiando la ruta de la barra de direcciones. Aquí las barras invertidas van **simples**, sin comillas:

```ini
PHASE_GATE_DOCS_PATH=C:\Users\TU_USUARIO\OneDrive - TU ORGANIZACIÓN\Documentos\DOCUMENTACIÓN
PHASE_GATE_REPOS_PATH=C:\proyectos
```

> Guarda el `.env` en **UTF-8** (con o sin BOM, da igual). Si lo creas desde PowerShell con `>` sale en UTF-16: el servidor lo detecta, no lo carga y te lo dice, tanto en el error de la variable que falta como en `doctor`.

**3. Registra el servidor** igual que en el camino A, pero cambiando `command` y `args` por el `build/index.js` de tu clon, y sin rutas en el bloque `"env"` (vienen de `machine.json` o del `.env`):

```json
"command": "node",
"args": ["C:\\<DONDE_CLONASTE>\\mcp-phase-gate\\build\\index.js"]
```

En **Claude Code**, un `.mcp.json` en la raíz de este repo puede usar ruta **relativa** (`"args": ["build/index.js"]`), porque lo lanza desde esa carpeta. Es la única de las tres configuraciones que sirve igual en cualquier máquina.

> Si defines una variable en el `.env` y también en el bloque `"env"` del cliente, gana la del cliente.

## Verificar que funciona

1. Reinicia el cliente, o desactiva y vuelve a activar el servidor en su panel de MCP.
2. Debe aparecer activo con sus 13 tools listadas. En **Cursor** está en Settings → MCP; en **VS Code**, en la vista de extensiones/MCP; en **Claude Code**, con `/mcp`.
3. Pruébalo pidiendo en el chat: *"Usa la tool `get_orchestrator_status` del mcp-phase-gate"* — te devuelve la radiografía de la instalación: qué variables ve, qué prompts usa y qué proyectos encuentra.
4. O abre `npx mcp-phase-gate ui`: **Ajustes › Este equipo** enseña las rutas que usa cada cliente y avisa si el `env` de alguno pisa a `machine.json`.

## Revisar la instalación: `doctor`

Desde una terminal, con el mismo entorno que le das al cliente (si le das alguno):

```bash
npx mcp-phase-gate doctor
```

Te dice qué versión corre y desde dónde (`npx`, global, una dependencia o un clon), qué valor tiene cada variable y de dónde salió (el entorno, el `.env` o `machine.json`, y si usaste el nombre nuevo o el alias), tu configuración local (`machine.json` y los presets disponibles), qué archivo de prompt gana en cada fase, y qué proyectos hay con su tarea activa, su manifiesto, su idioma y su preset (y de dónde sale cada uno), sus reglas y sus repos con su rama. Termina con una lista de hallazgos: una ruta obligatoria que falta, un `.env` en UTF-16, un `PHASE_GATE_LANG` que no es `es` ni `en`, una ruta o un idioma que el entorno pisa en `machine.json` (`VAR-PISA-MAQUINA` y `LANG-PISA-MAQUINA`: dicen cuál gana y cómo quitarlo), un manifiesto mal escrito, una copia en conflicto que dejó OneDrive, un preset que no existe, un proyecto sin manifiesto que usa el preset por defecto sin que lo sepas, un proyecto con documentos en los dos idiomas (`IDIOMA-MIXTO`), un bloque que no encaja en ninguna ranura, un repo que no está en este equipo… Sale con código `1` si hay algún error, así que sirve también en un script. `doctor --json` da lo mismo como JSON.

En la Fase 4 revisa además los recibos: uno de un lote que el plan no declara (`RECIBO-FUERA-DE-PLAN`), los escritos a mano (`RECIBO-MANUAL`), un `04 - Ejecución.md` que ya no es el que el servidor ensamblaría con sus recibos (`INDICE-DESINCRONIZADO`) y las rutas de la Documentación de más de 240 caracteres (`RUTA-LARGA`). **`doctor --reverificar`** comprueba también contra git que el commit de cada recibo siga en su rama, y que cada artefacto sellado no haya cambiado (`ANCLA-NO-VIGENTE`): úsalo después de un rebase.

**¿De dónde sale este texto?** `doctor --fase 3 --proyecto PROYECTO-A` enseña, ranura por ranura, qué capa y qué `archivo:línea` gana en el prompt de esa fase y qué se le sumó encima. Es la respuesta a "cambié un preset y no sé si se nota".

Es la misma información que devuelve la tool `get_orchestrator_status` y el recurso `phase-gate://estado`; desde el chat, además, incluye qué cliente está conectado, qué capacidades anunció y con qué proyecto coincide la carpeta que tienes abierta.

## Cómo se organiza la Documentación

Cada tarea vive dentro de una carpeta con esta estructura fija (aquí, un proyecto en español):

```
DOCUMENTACIÓN/
├── PROYECTO-A/
│   ├── phase-gate.json                ← opcional: el manifiesto del proyecto
│   └── Proyectos/
│       └── <nombre_de_la_tarea>/
│           ├── 00 - Contexto Inicial.md   ← lo escribe start_task
│           ├── 01 - Análisis Técnico.md   ← Fase 1
│           ├── 02 - Decisiones.md         ← Fase 2
│           ├── 03 - Plan Técnico.md       ← Fase 3
│           ├── 04 - Ejecución/            ← Fase 4: un recibo por lote (los escribe el servidor)
│           │   ├── L01 - <slug>.md
│           │   └── L02 - <slug>.md
│           ├── 04 - Ejecución.md          ← Fase 4: lo genera el servidor al cerrar el último lote
│           └── 05 - Auditoría.md          ← Fase 5
├── PROYECTO-B/
│   └── Proyectos/
│       └── <nombre_de_la_tarea>/
└── PROYECTO-C/
    └── Proyectos/
        └── <nombre_de_la_tarea>/
```

`PROYECTO-A`, `PROYECTO-B` y `PROYECTO-C` son de ejemplo: tus proyectos son las carpetas que tú tengas ahí, con los nombres que tú les pongas. El nivel `Proyectos` es la subcarpeta de tareas, y su nombre también es configurable: `rutas.subcarpetaTareas` en `machine.json` o `PHASE_GATE_TASKS_SUBDIR` ([ver Configuración](configuracion.md#variables-de-entorno)). Los nombres de los documentos salen de los prompts de las fases del idioma del proyecto: un proyecto en inglés tiene `00 - Initial Context.md`, `01 - Technical Analysis.md`… `04 - Execution/` y `05 - Audit.md` ([ver la tabla](configuracion.md#idiomas)). Un proyecto nunca mezcla los dos.

**Lotes y recibos.** El plan de la Fase 3 parte el trabajo en lotes (`L01`, `L02`…): cada uno es un cambio que se revierte solo y deja la aplicación funcionando. La Fase 4 los ejecuta uno a la vez, y de cada lote quedan un **recibo** corto (qué se hizo, qué se verificó, qué espera por ti) en `04 - Ejecución/`, que escribe el servidor con `record_batch`, y un commit. Al cerrar el último lote, el servidor genera `04 - Ejecución.md`: con varios lotes es el índice de los recibos; con uno solo, el propio recibo, que se mueve ahí. Hasta entonces la fase no aparece como terminada ([cómo funciona](herramientas.md#la-fase-4-con-el-servidor-record_batch)). Al pedir la Fase 4 o la 5, el servidor añade al prompt la lista de recibos que ya existen, para retomar en otro chat sin adivinar sus nombres.

> El servidor arma esta ruta **automáticamente**. Tú (o el LLM) solo indican `project`, `task_name` y `file_name`; no hay que escribir la ruta completa a mano.

## Los comandos de fase

Se invocan en el chat escribiendo `/f1`, `/f2`, etc. **Son solo orquestación**: dicen qué
tools llamar y en qué orden. El comportamiento, la estructura del documento y su nombre de
archivo los dicta el prompt de la fase en `prompts/<idioma>/`, así que afinar una fase no obliga a
tocar su comando.

Lo que hace cada uno:

| Comando | Llama a | Documento que deja |
|---------|---------|--------------------|
| `/f1` | `start_task` + `get_phase_prompt(1)` | El de la Fase 1 |
| `/f2` | `get_phase_prompt(2)`, lee el de la Fase 1 | El de la Fase 2, después de que respondas las preguntas |
| `/f3` | `get_phase_prompt(3)`, lee los anteriores | El de la Fase 3 |
| `/f4` | `get_phase_prompt(4)`, lee el plan y `get_batch_status` | Cada lote con `record_batch`; el servidor genera el documento de la fase al anclar el último |
| `/f5` | `get_phase_prompt(5)` | El de la Fase 5: la auditoría y la descripción del PR, que además van en el chat |

Ningún comando nombra un archivo: el nombre lo declara la cabecera del prompt de cada fase
y `get_phase_prompt` se lo entrega al modelo.

`/f1` necesita project, task_name y el requerimiento completo. `/f5` acepta un rango de
commits; si no le das ninguno, audita los que lista el servidor al final del prompt de la fase
(COMMITS DE LA FASE 4). Los demás arrancan de `get_active_task`.

**Llegan solos, como MCP Prompts.** Desde la 2.2.0 el servidor ofrece cada comando como un
prompt MCP (`f1`…`f5`), con su texto en [`prompts/es/comandos/`](../../prompts/es/comandos) (y en
[`prompts/en/commands/`](../../prompts/en/commands) en inglés). No hay que
copiar nada a ninguna carpeta y se actualizan con cada versión del paquete. Todos sus
argumentos son opcionales —`project`; en `/f1` también `task_name` y `contexto`; en `/f5`,
`commits`—: lo que no pases te lo pide el propio comando, y un contexto largo puede ir pegado
después del comando como texto normal. Sin `project`, si el servidor lo deduce de la carpeta
abierta, el comando ya llega con él. Con proyecto, el texto sale del idioma y de las capas de
ese proyecto. Una fase que añadas tú (una `fase-6`) recibe su `/f6`
con un texto genérico, y un `comandos/fN.md` (`commands/fN.md` en inglés) en tu carpeta de prompts propia (o en la de un
proyecto) gana al de fábrica.

Cómo se ven en cada cliente:

| Cliente | `/f1`…`/f5` visibles | Argumentos con espacios | `@` recursos | Confirmaciones directas | Notas |
|---------|----------------------|-------------------------|--------------|-------------------------|-------|
| Claude Code | Por verificar (según su documentación: `/<clave>:f1 (MCP)`, y `/mcp__<clave>__f1` como alias) | Por verificar | Por verificar | Por verificar | |
| Cursor | Por verificar (según su documentación: en el menú de prompts MCP) | Por verificar | Por verificar | Por verificar | En Windows, `PHASE_GATE_ELICITATION=off` mientras siga abierto el bug del formulario ([ver la guía de Herramientas](herramientas.md#documentos-protegidos)) |
| VS Code | Por verificar (su documentación se contradice entre `/<clave>.f1` y `mcp.<clave>.f1`) | Por verificar | Por verificar | Por verificar | |

**Si tu cliente no los muestra cómodamente**, usa los archivos: en este repo, Claude Code ya
los lee de [`.claude/commands/`](../../.claude/commands) (idénticos a `prompts/es/comandos/`); para
usarlos en tus otros proyectos, `npx mcp-phase-gate init --comandos` los copia, en el idioma de tu equipo, a
`C:\Users\<TU_USUARIO>\.claude\commands\` o a `C:\Users\<TU_USUARIO>\.cursor\commands\`, sin
pisar los que ya tengas tuyos. Más detalle en
[`docs/comandos-de-fase.md`](../comandos-de-fase.md).
