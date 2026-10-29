# Configuración

Todo lo que se puede configurar, y dónde vive cada ajuste. Para instalar y registrar el servidor primero, mira [Instalación](instalacion.md).

## Primero, Ajustes

La forma más fácil de cambiar cualquier cosa es el Studio. Ejecuta `npx mcp-phase-gate ui` y abre **Ajustes**: un menú a la izquierda con una página para cada cosa de abajo, y en cada una el cambio que haces se enseña como un diff antes de escribir nada.

| Página | Qué editas | Qué escribe |
|---|---|---|
| Este equipo | La carpeta de Documentación, la de repos, la subcarpeta de tareas, el idioma por defecto del equipo y el preset por defecto de los proyectos sin manifiesto | `machine.json` |
| Cada proyecto | Su preset, idioma, lotes, política de commits, comandos de verificación, un PR por repo y sus repos (id, carpeta, rol y, si en este equipo viven en otro sitio, su ruta propia) | el `phase-gate.json` del proyecto y las claves `<PROYECTO>/<repo>` de `machine.json` |
| Clientes MCP | Conectar o actualizar Cursor, VS Code y Claude Code | la configuración de cada cliente |
| Studio | El tema (Sistema, Claro u Oscuro) y el idioma de la interfaz | nada: se aplica en este navegador |
| Avanzado | Las variables de entorno avanzadas: su valor, de dónde sale y cómo cambiarlas. Se muestran, no se editan | nada |

Cada página guarda un borrador: cambias varios campos, ves **un diff por archivo** y pulsas **Aplicar** (o **Descartar**) una sola vez. No se escribe nada sin esa vista previa, y Aplicar solo escribe si el archivo no cambió en el disco desde que lo viste; si cambió, te enseña el conflicto en vez de pisarlo ([más en la guía del Studio](studio.md)).

Los archivos y las variables de abajo son lo que edita Ajustes: también puedes escribirlos a mano.

## Quién gana

Una sola regla en todas partes: **lo que es de una ejecución gana a lo guardado.** Para las tres rutas de este equipo (la carpeta de Documentación, la de repos y la subcarpeta de tareas), por este orden:

1. El entorno del proceso: el bloque `"env"` del cliente que lanzó el servidor, o tu terminal para `doctor` y `ui`.
2. Un `.env` en la raíz del paquete, que solo existe si lo ejecutas desde el código.
3. `machine.json`.
4. Nada: las tools que la necesitan dicen qué falta y dónde configurarlo.

El idioma sigue la misma regla: `PHASE_GATE_LANG` gana a `idiomaPorDefecto` de `machine.json` ([ver Idiomas](#idiomas)).

Es a propósito: deja que un cliente use otra Documentación (Cursor con la del trabajo, Claude Code con una personal), o que pruebes algo una sola vez sin editar el archivo. El precio es que **un `env` viejo sigue ganando aunque cambies Ajustes**, así que las herramientas te lo dicen:

- **Ajustes › Este equipo** avisa cuando un valor distinto sale del entorno o del `.env` del propio Studio, del `env` de un cliente (Cursor y VS Code, leídos de su `mcp.json` global; Claude Code, de `~/.claude.json`) o de un servidor abierto. Cada aviso ofrece quitarlo, con vista previa; en Claude Code te da el comando para copiar.
- **`doctor`** avisa del mismo choque, `VAR-PISA-MAQUINA` para una ruta y `LANG-PISA-MAQUINA` para el idioma, y dice cuál gana y cómo quitarlo.
- **`init`** ya no escribe rutas en el `env`.

Lo que ninguna de las tres ve: los `.cursor/mcp.json` y `.vscode/mcp.json` de cada proyecto, los perfiles de VS Code, otros clientes, el ámbito de proyecto de Claude Code (su `.mcp.json`) y los servidores con otro `PHASE_GATE_STATE_PATH`, cuyas sesiones el Studio no ve. Un servidor abierto conserva lo que recibió en su entorno al arrancar: para que use valores nuevos desde ahí, reinicia ese cliente.

## `machine.json`, lo de cada equipo

Lo que solo vale en esta máquina vive aparte, en `%APPDATA%\mcp-phase-gate\machine.json` (macOS: `~/Library/Application Support/mcp-phase-gate/`; Linux: `~/.config/mcp-phase-gate/`; o la carpeta de `PHASE_GATE_CONFIG_PATH`). Lo escribe **Ajustes › Este equipo**; también puedes escribirlo a mano:

```json
{
  "$schema": "https://unpkg.com/mcp-phase-gate@4/schema/machine.json",
  "version": 2,
  "rutas": {
    "documentacion": "C:\\Users\\TU_USUARIO\\OneDrive - TU ORGANIZACIÓN\\Documentos\\DOCUMENTACIÓN",
    "carpetaDeRepos": "C:\\proyectos",
    "subcarpetaTareas": "Proyectos"
  },
  "repos": { "PROYECTO-A/api": "D:\\trabajo\\backend-api" },
  "presetPorDefecto": "software-replica",
  "idiomaPorDefecto": "es"
}
```

- `rutas.documentacion` y `rutas.carpetaDeRepos` son rutas absolutas: la Documentación Central, y la carpeta donde están tus repositorios de código. `rutas.subcarpetaTareas` es la subcarpeta de tareas; puede ir vacía, y entonces las tareas cuelgan directo del proyecto.
- `repos` dice dónde está un repo concreto **en este equipo**, aunque esté fuera de la carpeta de repos. La clave es `"<PROYECTO>/<id>"`, con el proyecto sin distinguir mayúsculas.
- `presetPorDefecto` es el preset de tus proyectos **sin manifiesto**: la forma de conservar tu flujo de siempre sin escribir un manifiesto en cada proyecto.
- `idiomaPorDefecto` es el idioma de los proyectos que no declaran uno ni tienen documentos de los que deducirlo, y el de los mensajes que no son de un proyecto (`PHASE_GATE_LANG` le gana).

El archivo es estricto: una clave desconocida, también dentro de `rutas`, es un error que dice su ruta, y `rutas` en un archivo versión 1 es un error que pide `"version": 2`. La versión 2 es la que escribe la 4.0. También lee la versión 1, la que escribía la 3.x, y al reescribirla como versión 2 deja una copia `.bak` de la vieja. **La 3.x no lee la versión 2**: [volver atrás](../notas/v4.0.0.md#volver-a-la-3x) son dos pasos.

Se lee en cada llamada, así que un cambio en Ajustes vale en la llamada siguiente, sin reiniciar. Si se rompe, un proceso abierto conserva el último archivo válido que leyó y avisa una vez; si nunca hubo uno válido, sus rutas no cuentan y el error dice dónde: la línea y la columna de un error de sintaxis, el campo de un error de forma, o la ruta que no existe. `doctor` lo muestra primero.

## Configuración por proyecto

Todo esto es **opcional**: un proyecto sin configuración funciona con los valores por defecto. Pero desde la 3.0 cada proyecto puede declarar con qué preset trabaja, qué repositorios toca y con qué reglas, y desde la 3.2, su idioma. En el Studio, cada proyecto tiene su propia página en **Ajustes**.

### `phase-gate.json`, el manifiesto del proyecto

Vive en la carpeta del proyecto, `<DOCS>/<PROYECTO>/phase-gate.json`, así que viaja con la Documentación a todos tus equipos:

```json
{
  "$schema": "https://unpkg.com/mcp-phase-gate@3/schema/project.json",
  "version": 1,
  "idioma": "es",
  "preset": "multi-repo-feature",
  "repos": [
    { "id": "api", "dir": "backend-api", "rol": "backend" },
    { "id": "web", "dir": "frontend-web", "rol": "frontend" }
  ],
  "reglas": { "commits": "agente-commitea-con-OK", "verificacion": ["npm test"] },
  "fase5": { "prPorRepo": true }
}
```

| Campo | Qué es |
|-------|--------|
| `idioma` | `es` o `en`: el idioma del proyecto ([ver Idiomas](#idiomas)). Sin él, se deduce de los documentos que ya hay en disco y, después, del equipo. |
| `preset` | El preset del proyecto ([ver la tabla](#presets)). Por defecto, `software`. |
| `repos` | Los repositorios del proyecto: un `id` corto, su `dir` **relativo a `PHASE_GATE_REPOS_PATH`** (nunca absoluto ni con `..`: el manifiesto viaja entre equipos) y un `rol` opcional. |
| `reglas.lotes` | `false` si el proyecto no trabaja por lotes: un solo lote, cuyo recibo pasa a ser el documento de la Fase 4 al anclarlo. Si falta, decide el preset. |
| `reglas.commits` | La política de commits de la Fase 4 ([ver abajo](#la-política-de-commits)). Si falta, decide el preset. |
| `reglas.verificacion` | Los comandos con los que se verifica el proyecto; llegan a cada prompt. |
| `fase5.prPorRepo` | Una descripción de PR por repositorio. |

Con el `$schema`, tu editor te autocompleta y te marca los errores. **Un manifiesto mal escrito no se ignora**: las tools que dependen del proyecto devuelven el error con la ruta exacta del problema (`repos[1].dir: no puede ser una ruta absoluta…`) y `doctor` lo marca. Caer en silencio a los valores por defecto cambiaría todas las instrucciones sin que lo notes. Lo escribes tú, o **Ajustes** (o `init --migrate`); la IA no puede (`write_central_doc` no escribe fuera de las tareas).

### Presets

Un preset cambia el contenido de unas pocas secciones de los prompts; las fases, la compuerta y los documentos son siempre los mismos. Cada uno viene en los dos idiomas (`presets/es/`, `presets/en/`), con las mismas ranuras.

| Preset | Para qué |
|--------|----------|
| `software` | **Por defecto.** Código con o sin suite de pruebas: si hay suite, el plan la usa como criterio de salida de cada lote; si no, lo que sí se puede ejecutar. |
| `software-replica` | El flujo de la 2.x: código sin suite y con una réplica de datos de solo lectura, donde comparar antes y después ocupa el lugar de las pruebas. Reproduce los prompts de la 2.2.0 byte a byte (lo comprueba una prueba). |
| `software-tdd` | Código con suite y pruebas primero: cada lote empieza por una prueba que falla, y la ejecución sigue rojo, verde, suite completa. |
| `multi-repo-feature` | Un requerimiento que cambia varios repositorios: contratos entre ellos, orden de despliegue y un PR por repo. |
| `ai-agent-ops` | El mantenimiento de un agente de IA, un prompt de sistema, una skill o un servidor MCP: evidencia con transcripts, una batería de casos de oro, borde y adversariales, y una auditoría de regresión de comportamiento con registro de versión. |
| `research-ops` | Investigación técnica u operaciones: el entregable es un informe o un runbook, y no hay commits por lote. |

Un preset es **un solo archivo** de bloques ([ver la guía de Prompts](prompts.md#bloques-cambiar-una-sección-sin-copiar-el-prompt)). Los tuyos van en la carpeta `presets/` junto a `machine.json`, y con el mismo nombre ganan a los del paquete.

**El preset de un proyecto sale, por este orden**, del de la tarea (si declara uno), del `phase-gate.json`, del `presetPorDefecto` de `machine.json`, o es `software`. Cada prompt lo dice al final, con su origen.

### Una tarea con sus repos o su propio preset

`start_task` acepta `repos` (los ids de los repos que toca esa tarea; sin él, todos los del proyecto) y `preset` (por ejemplo, `ai-agent-ops` para una tarea de mantenimiento de un agente dentro de un proyecto general). Se validan antes de crear nada y quedan en la cabecera del contexto inicial:

```markdown
---
repos: api, web
preset: ai-agent-ops
---
<el requerimiento>
```

Cambiarlos después exige reescribir el contexto inicial, que está protegido: es a propósito, cambiar de repos a mitad de una tarea es una decisión.

### La política de commits

`reglas.commits` (o el preset) elige cómo se versiona cada lote en la Fase 4:

| Política | Qué hace la IA |
|----------|----------------|
| `agente-commitea-con-OK` | **Por defecto.** Te enseña los archivos y el mensaje, y hace el commit solo con tu OK. |
| `agente-propone` | Te deja los `git add` y el `git commit` listos para copiar; el commit lo haces tú, le das el hash y lo ancla. |
| `auto` | Hace el commit en cuanto el lote pasa su verificación, sin esperar, y lo ancla. |
| `ninguno` | Sin commits por lote: cada lote se ancla a un archivo (sha256) o a una nota, y se detiene al cerrar cada uno para que revises. |

En todas: `git add` archivo por archivo (nunca `-A`, `.` ni una carpeta), nunca `--no-verify` ni `--amend`, y comprueba la rama antes del primer commit. Con git, cada commit queda anclado a su lote y comprobado por el servidor ([ver la guía de Herramientas](herramientas.md#la-fase-4-con-el-servidor-record_batch)). **Y nunca hace `push` ni abre el PR, en ninguna política: eso no es configurable.**

### El bloque CONFIGURACIÓN DEL PROYECTO

Cuando el servidor sabe el proyecto, cada prompt de fase termina con lo que declara su configuración, como dato (en el idioma del proyecto; en inglés, `PROJECT CONFIGURATION`):

```
## CONFIGURACIÓN DEL PROYECTO (la declara phase-gate.json)

- Preset: `multi-repo-feature` (del proyecto) · Idioma: es
- Lotes: sí · Commits: agente-commitea-con-OK
- Repositorios de esta tarea:
  - `api` (backend): `D:\trabajo\backend-api` · git · rama `feat/x` · árbol limpio
  - `web` (frontend): `D:\repos\frontend-web` · git · rama `feat/x` · 2 cambios sin commit
- Comandos de verificación del proyecto: `npm test`
- Una descripción de PR por repositorio (fase5.prPorRepo).

Usa `read_repo_file` y `repo_status` con estos ids.
```

Sin manifiesto, la línea del preset dice `(por defecto; este proyecto no tiene phase-gate.json)`. El estado de git se omite si tarda más de 3 segundos.

## Idiomas

Los prompts, los comandos, las variantes de regla y los presets vienen en español y en inglés (`prompts/es/`, `prompts/en/`, `presets/es/`, `presets/en/`). Hay dos cosas distintas que tienen idioma:

| Qué | Dónde se declara | Qué decide |
|---|---|---|
| **El idioma del proyecto** | `"idioma": "es"` o `"en"` en su `phase-gate.json` | Qué prompts y presets de fábrica usa, los nombres de los documentos y el idioma en que escribe el servidor: los recibos, el índice y los bloques que añade a un prompt |
| **El idioma de redacción de una tarea** | `redaccion` en `start_task` (`"es"` o `"en"`), que queda en la cabecera del contexto inicial | Solo el idioma en que la IA escribe el **contenido** de los documentos. El prompt gana una línea al final; nombres, encabezados y claves se quedan como están |

**Cómo se resuelve el idioma de un proyecto**, por este orden:

1. `idioma` en su `phase-gate.json`.
2. **Los documentos que ya tiene en disco**: las tareas con `01 - Análisis Técnico.md` son en español; las que tienen `01 - Technical Analysis.md`, en inglés. Si hay de los dos, el que más documentos tenga (un empate es español), y `doctor` avisa con `IDIOMA-MIXTO`.
3. `PHASE_GATE_LANG` (`es` o `en`; también valen `es-MX` o `en_US.UTF-8`): el entorno siempre gana.
4. `idiomaPorDefecto` en el `machine.json` de este equipo (**Ajustes › Este equipo**).
5. El idioma del sistema: `es` si su locale empieza por `es`; si no, `en`. Salvo si el proyecto tiene un `phase-gate.json` sin `idioma`, como los que escribían la 3.0 y la 3.1: ese proyecto es español.

El disco va antes que el equipo a propósito: los proyectos de la 2.x no tienen manifiesto y están en español, y abrir uno en un equipo configurado en inglés no puede dejar sus tareas como si no tuvieran ninguna fase hecha. `doctor` enseña de dónde sale el idioma de cada proyecto. `init --migrate` escribe `idioma` en los manifiestos que crea (el de los documentos del proyecto si los tiene, y si no, `--idioma` o lo que contestes a su pregunta) y lo añade, con copia, a los que ya existían sin él; mientras falte, `doctor` avisa con `MANIFIESTO-SIN-IDIOMA`. Sin proyecto, manda el idioma del equipo (`PHASE_GATE_LANG`, después el idioma por defecto de `machine.json` y por último el del sistema): si trabajas en español en un equipo en inglés, pon el idioma por defecto en español en **Ajustes › Este equipo**.

| Fase | Proyecto en español | Proyecto en inglés |
|---|---|---|
| — | `00 - Contexto Inicial.md` | `00 - Initial Context.md` |
| 1 | `01 - Análisis Técnico.md` | `01 - Technical Analysis.md` |
| 2 | `02 - Decisiones.md` | `02 - Decisions.md` |
| 3 | `03 - Plan Técnico.md` | `03 - Technical Plan.md` |
| 4 | `04 - Ejecución.md` y `04 - Ejecución/` | `04 - Execution.md` y `04 - Execution/` |
| 5 | `05 - Auditoría.md` | `05 - Audit.md` |

**Cambiar el idioma de un proyecto no renombra nada.** Si el manifiesto declara un idioma y hay tareas con documentos del otro, `doctor` avisa con `IDIOMA-CON-TAREAS`, y `get_phase_prompt`, `start_task`, `record_batch`, `get_batch_status` y `write_central_doc` con el nombre de un documento de fase se niegan con el mismo mensaje, porque si no esas tareas aparecerían vacías y una tarea nueva mezclaría nombres de los dos idiomas; `list_tasks` lo enseña como aviso. Devuelve el manifiesto a su idioma, o renombra esas carpetas a mano.

**Una tarea en el otro idioma.** En un proyecto en español, `start_task` con `redaccion: "en"` crea la tarea con los nombres y la estructura en español del proyecto, y el prompt le pide a la IA que escriba el contenido en inglés. Al revés es igual.

**Los mensajes del propio servidor.** Los errores y las respuestas, `doctor`, `--help`, `init`, `eject` y las descripciones de las tools y de sus parámetros existen en los dos idiomas. Una llamada que resuelve un proyecto responde en el idioma de ese proyecto; si no, decide `PHASE_GATE_LANG`, después el idioma por defecto de `machine.json`, y por último el sistema. Las descripciones de las tools y de sus parámetros se fijan al arrancar el servidor, porque el cliente las pide una vez, al conectar. Los clientes MCP suelen lanzar el servidor con un entorno reducido, y en Windows Node sigue la configuración regional, así que dilo de forma explícita: pon el idioma por defecto en **Ajustes › Este equipo** (el servidor de cada cliente lo lee de `machine.json`), o, para un solo cliente, `"PHASE_GATE_LANG": "es"` (o `"en"`) en su bloque `env`, que gana.

**Lo que nunca se traduce:** los nombres de las tools (`start_task`, `record_batch`…) y de sus parámetros (`titulo`, `que_se_hizo`, `cerrar_fase`…), los ids de lote `L01…L99`, los ids de ranura, los nombres de los presets, las políticas de commits, las claves del manifiesto, las variables de entorno y los códigos de los hallazgos de `doctor`. Para que eso no estorbe:

- `crear_proyecto` acepta también el alias `create_project`.
- `record_batch` acepta `estado` en inglés: `verified`, `with pending items`, `failed`, `discarded`.
- Cada ranura conserva su id canónico en español y tiene un alias en inglés, que se acepta en los bloques, en los marcadores de ranura y en `eject`: `phase-3/tests` → `fase-3/pruebas`, `global/zero-breakage` → `global/cero-rupturas`… La tabla completa está en [`docs/glosario.md`](../glosario.md).
- Los recibos, los planes y los encabezados se leen en los dos idiomas: un recibo escrito en español se sigue leyendo en un proyecto abierto en inglés.

**Los prompts en inglés no son una traducción automática.** Cada archivo se reescribió con un glosario fijo ([`docs/glosario.md`](../glosario.md)), con las mismas ranuras en el mismo orden y el mismo número de puntos en `FORBIDDEN` y `SELF-CHECK` que su gemelo en español. Un test de contrato comprueba que estén todos los encabezados que busca el código, y una prueba de oro (`test/oro/3.2.0-en/`) fija los prompts ensamblados en inglés; las pruebas de oro en español no cambiaron.

**El Studio tiene su propio idioma**, independiente del de cada proyecto: un selector ES / EN en la barra de arriba (también en **Ajustes › Studio**), que el navegador recuerda; un enlace para compartir con `#?lang=en`; si no, los idiomas del navegador, y por último inglés. `<html lang>` lo sigue, y los documentos se enseñan tal como están escritos ([ver la guía del Studio](studio.md)).

## Trabajar en varios dispositivos sin perder el hilo

- Si la **Documentación** vive en una carpeta sincronizada (OneDrive, Google Drive, Dropbox, iCloud), viaja sola entre tus equipos. Lo único distinto en cada uno es `machine.json` (y, en el camino desde el código, un `.env`): los dos son locales y no se suben al repo ([ver `machine.json`](#machinejson-lo-de-cada-equipo)).
- El servidor recuerda cuál es la **tarea activa de cada proyecto** (ver `get_active_task`). Es un puntero por proyecto, no uno solo: puedes tener una ventana en un proyecto y otra en otro sin que se pisen. Ese registro es **local de cada dispositivo** y se guarda en la carpeta de datos de tu usuario, fuera del repo, así que sobrevive a borrar `build/` o volver a clonar:
  - **Windows:** `%APPDATA%\mcp-phase-gate\active-tasks.json`
  - **macOS:** `~/Library/Application Support/mcp-phase-gate/active-tasks.json`
  - **Linux:** `~/.local/state/mcp-phase-gate/active-tasks.json`

  Si cambias de equipo o de chat y el LLM "olvidó" dónde escribir, dile que llame `get_active_task` o simplemente indícale el `project` + `task_name`.
- **El proyecto sale de la carpeta que tienes abierta.** Si tu cliente anuncia sus carpetas abiertas (MCP Roots), y una de ellas es un repo de un proyecto o está dentro de su carpeta de la Documentación, el servidor deduce el proyecto y te lo dice en una línea. `project` pasa a ser opcional ([ver la guía de Herramientas](herramientas.md#el-proyecto-sale-de-la-carpeta-abierta)).
- Lo que es **de cada equipo** y no viaja con la Documentación —las rutas de la Documentación y de la carpeta de repos, en qué ruta está cada repo en esta máquina, el preset y el idioma por defecto de tus proyectos sin manifiesto, tus presets propios— vive en `machine.json`, en la misma carpeta de datos (en Linux, `~/.config/mcp-phase-gate/`).
- **La fase no se guarda: se deduce.** El servidor mira qué documentos tiene ya la carpeta de la tarea y de ahí saca en qué fase vas, porque cada fase declara cómo se llama el suyo. Por eso el dato nunca se desincroniza: si borras `02 - Decisiones.md` porque quedó mal, la tarea vuelve sola a la Fase 2.
- Y si el archivo de punteros se pierde —equipo nuevo, o lo borraste—, `get_active_task` no se queda mudo: propone la tarea con actividad más reciente y **te avisa de que es una deducción**, para que la confirmes antes de escribir.
- **Regla de oro:** si usas una carpeta sincronizada, deja que termine de sincronizar antes de empezar a trabajar en el otro equipo, para no crear conflictos de archivos.

## ¿Varias carpetas de Documentación? (opcional)

**Esto no es parte del flujo. Si con una carpeta te basta, sáltate la sección entera.**

Puede que quieras documentaciones separadas que no se mezclen: una del trabajo y otra de proyectos personales, por ejemplo, cada una en un sitio distinto —o una en la nube y otra no—. No hace falta nada nuevo: **registra el servidor más de una vez** en tu cliente, con un bloque `env` distinto en cada registro.

```jsonc
{
  "mcpServers": {
    "pg-trabajo": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"],
      "env": {
        "PHASE_GATE_DOCS_PATH": "C:\\Users\\TU_USUARIO\\OneDrive - TU ORGANIZACIÓN\\Documentos\\DOCUMENTACIÓN",
        "PHASE_GATE_REPOS_PATH": "C:\\proyectos",
        "PHASE_GATE_STATE_PATH": "C:\\Users\\TU_USUARIO\\.orquestador\\trabajo"
      }
    },
    "pg-personal": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"],
      "env": {
        "PHASE_GATE_DOCS_PATH": "G:\\Mi unidad\\Documentación",
        "PHASE_GATE_REPOS_PATH": "D:\\dev",
        "PHASE_GATE_TASKS_SUBDIR": "",
        "PHASE_GATE_STATE_PATH": "C:\\Users\\TU_USUARIO\\.orquestador\\personal"
      }
    }
  }
}
```

Es el mismo paquete en los dos: lo único que cambia son las rutas. Aquí las rutas sí van en el bloque `env`: el entorno gana a `machine.json`, así que cada registro conserva su Documentación. `doctor` y Ajustes avisarán de que esos valores pisan a `machine.json`; en esta configuración es lo que quieres. Cada registro puede tener incluso su propia subcarpeta de tareas — arriba, la personal la deja vacía para que las tareas cuelguen directo del proyecto.

> ⚠️ **`PHASE_GATE_STATE_PATH` tiene que ser distinto en cada registro.** Si se comparte, los punteros de tarea activa se pisan **en silencio**: la clave del estado es el nombre del proyecto, así que dos documentaciones con un proyecto que se llame igual acaban compartiendo entrada y una le contesta a la otra. No da error; simplemente te responde la tarea equivocada.

Dos cosas más que muerden y no son evidentes:

- **Modo espejo, no streaming.** Google Drive en modo *streaming* y OneDrive con *Archivos a Petición* dejan los archivos como marcadores hasta que algo los abre. Este servidor vive de listar carpetas y comprobar si existen archivos, así que con marcadores se vuelve lento o falla cuando no hay red. Si puedes, ten la carpeta de Documentación **descargada localmente**.
- **Los repos de código, fuera de la carpeta sincronizada.** La Documentación en la nube no da problema. El código sí: la sincronización compitiendo con git sobre `.git/` corrompe repositorios. Que `PHASE_GATE_REPOS_PATH` apunte a un disco local.

## Lo que vive FUERA del repo (una copia por dispositivo)

`git pull` **no** actualiza estas cinco cosas. Si algo dejó de funcionar después de jalar
cambios, la causa está casi siempre aquí.

| Qué | Dónde | Por qué no está en el repo |
|-----|-------|----------------------------|
| El servidor compilado | `build/` en tu clon | Está gitignoreado. **Después de cada `git pull` que traiga cambios en `src/`, corre `npm run build`** o el cliente seguirá ejecutando la versión anterior. |
| Las rutas de este equipo | `machine.json` (desde el código, opcionalmente un `.env` en la raíz) | Cambian el usuario del sistema y dónde tengas la carpeta de Documentación. |
| El registro del MCP | La configuración de tu cliente ([camino A](instalacion.md#camino-a--con-npx-recomendado), o el paso 3 del [camino B](instalacion.md#camino-b--desde-el-código)) | En Cursor y VS Code contiene la ruta absoluta a `build/index.js`, que depende de dónde clonaste y apunta a una carpeta gitignoreada. Ninguna ruta puede ser correcta en todos los equipos. Ver [`docs/decisiones.md`](../decisiones.md). La excepción es el `.mcp.json` de Claude Code, que va con ruta relativa. |
| Los comandos `/f1`–`/f5` como archivos, **solo si tu cliente no muestra bien los MCP Prompts** | `~/.cursor/commands/f<N>.md` en Cursor | Desde la 2.2.0 el servidor los ofrece como MCP Prompts y llegan solos con cada versión ([ver la guía de Instalación](instalacion.md#los-comandos-de-fase)). La copia en archivos solo hace falta como respaldo (`init --comandos` la hace por ti); en **Claude Code** dentro de este repo ya está versionada en `.claude/commands/`. |
| La configuración de este equipo | `machine.json` y `presets/` en `%APPDATA%\mcp-phase-gate\` (o `PHASE_GATE_CONFIG_PATH`) | Son rutas y preferencias de esta máquina: las carpetas de la Documentación y de los repos, dónde está cada repo aquí y el preset y el idioma por defecto de tus proyectos sin manifiesto ([ver abajo](#machinejson-lo-de-cada-equipo)). |

## Variables de entorno

Se leen del entorno del proceso (el bloque `"env"` de la configuración de tu cliente, o tu terminal) y del archivo `.env` de la raíz del repo. **Ganan** a `machine.json` ([ver Quién gana](#quién-gana)).

Las dos primeras **no tienen valor por defecto**: apuntan a carpetas que solo existen en tu equipo, así que cualquier default sería la ruta de la máquina de otra persona. No hacen falta si `machine.json` tiene la ruta (`rutas.documentacion`, `rutas.carpetaDeRepos`): sirven para un cliente o una ejecución que deba usar otra carpeta. Si falta una en todos los sitios, o apunta a algo que no existe o que no es una carpeta, las tools que la usan devuelven dónde configurarla. Las que no dependen de ella —como `get_phase_prompt`— siguen funcionando.

Cada variable tiene además un **alias** con el nombre de antes, `ORQUESTADOR_*` (por ejemplo, `ORQUESTADOR_DOCS_PATH`), que sigue funcionando para no romper ninguna configuración. Si defines los dos con valores distintos gana `PHASE_GATE_*`, y `doctor` y el log del servidor te avisan.

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `PHASE_GATE_DOCS_PATH` | ninguno: `rutas.documentacion` de `machine.json` | Ruta a la carpeta raíz de la Documentación. Sincronizada o no, da igual. **Distinta en cada dispositivo.** |
| `PHASE_GATE_REPOS_PATH` | ninguno: `rutas.carpetaDeRepos` de `machine.json` | Ruta a la carpeta donde están tus repositorios de código. |
| `PHASE_GATE_TASKS_SUBDIR` | `Proyectos`, o `rutas.subcarpetaTareas` de `machine.json` | Subcarpeta donde viven las tareas dentro de cada proyecto. Vacía = las tareas cuelgan directo del proyecto. Es además la regla que decide qué carpeta cuenta como proyecto (ver abajo). |
| `PHASE_GATE_PROMPTS_PATH` | ninguno | Carpeta de prompts propios, que **se superponen** a los del paquete en vez de reemplazarlos: basta con poner los archivos de las fases que quieras cambiar ([ver la guía de Prompts](prompts.md#usar-tus-propios-prompts-sin-perder-los-de-fábrica)). |
| `PHASE_GATE_STATE_PATH` | Carpeta de datos del usuario (ver arriba) | Carpeta donde se guardan los punteros de tarea activa. Casi nunca hace falta tocarla; sirve para aislar el estado en pruebas y es **obligatoria si registras el servidor más de una vez** (ver [¿Varias carpetas de Documentación?](#varias-carpetas-de-documentación-opcional)). |
| `PHASE_GATE_CONFIG_PATH` | La carpeta de datos del usuario | Carpeta de `machine.json` y de tus presets propios ([ver arriba](#machinejson-lo-de-cada-equipo)); con una subcarpeta `prompts/`, esa es tu capa global si no defines `PHASE_GATE_PROMPTS_PATH`. Casi nunca hace falta. No tiene alias. |
| `PHASE_GATE_ELICITATION` | ninguno (activadas) | `off` (o `false`, `0`, `no`) para que el servidor no pida [confirmaciones directas](herramientas.md#documentos-protegidos) al cliente y decida `force`, como antes. Recomendado en Cursor para Windows (`init` lo pone solo). No tiene alias. |
| `PHASE_GATE_LANG` | ninguno (`idiomaPorDefecto` de `machine.json`, y después el del sistema) | `es` o `en`: el idioma de las descripciones de las tools, de los mensajes que no son de un proyecto y de los proyectos sin otra pista ([ver Idiomas](#idiomas)). No tiene alias. |
