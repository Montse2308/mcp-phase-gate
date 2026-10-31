# Herramientas y recursos

Lo que el servidor le ofrece a tu cliente y cómo se comporta: la compuerta entre fases, `record_batch` y sus recibos, los documentos protegidos, las 13 tools, los recursos `phase-gate://`, cómo se encuentran un proyecto y sus repos, y el contrato de la descripción del PR de la Fase 5. Para instalarlo, mira [Instalación](instalacion.md).

## La compuerta: saltarse una fase deja de ser invisible

Si pides una fase por delante de la que te toca, el prompt llega con un aviso al principio (en el idioma del proyecto):

```
## ATENCIÓN — COMPUERTA DE FASE

Pediste la Fase 4, pero la tarea "login-sso" no tiene los documentos de fases anteriores:

- Fase 3: falta `03 - Plan Técnico.md`

Esta tarea va en la Fase 3 (Plan Técnico). NO hagas el trabajo de la Fase 4 sobre documentos que no
existen ni te los inventes a partir del contexto del chat.

Díselo al usuario antes de nada y pregúntale si prefiere hacer primero la fase que falta o continuar de
todos modos. Lo que sigue es el prompt de la fase que pediste: aplícalo solo después de resolver esto con el usuario.
```

**Avisa, no bloquea.** El prompt se entrega igual, así que el día que quieras saltarte una fase a propósito en un cambio trivial, puedes. Lo que cambia es que ya no pasa desapercibido.

Tres cosas que **no** hace, a propósito:

- **No estorba volver atrás.** Si vas en la Fase 5 y pides la 2 para corregir decisiones, eso no es saltarse nada y no dice nada. Solo mira huecos hacia atrás.
- **No te obliga a escribir nada más.** Sigues escribiendo `/f4` a secas. Quien averigua de qué tarea se habla es el servidor, con el puntero que ya mantiene — no el modelo preguntándotelo.
- **No se calla cuando no puede comprobar.** Si tienes varios proyectos con tarea activa y no se indicó cuál, lo dice en vez de fingir que todo está en orden.

**También señala los pendientes que dejó la fase anterior.** Si el documento de la fase anterior tiene una sección `## Validaciones pendientes` con algo dentro, o si al pedir la Fase 5 algún recibo de lote quedó `con pendientes`, `fallido` o `descartado`, el prompt llega además con un bloque `## PENDIENTES HEREDADOS (detectados por el servidor)` que los nombra, para que la IA te los diga antes de empezar. Una sección que solo dice "Ninguna." no cuenta. Tampoco bloquea nada: solo señala lo que el prompt ya obligaba a escribir. (En un proyecto en inglés: `## Pending validations`, `with pending items`, `failed`, `discarded`, `INHERITED PENDING ITEMS` y "None.".)

## La Fase 4 con el servidor: `record_batch`

Desde la 3.0 la IA ya no redacta los recibos ni el documento de la Fase 4: le pasa al servidor los datos de cada lote, y el servidor escribe el recibo, comprueba el commit contra git y cierra la fase al anclar el último lote.

**Cada lote, antes y después del commit** (con la política por defecto):

1. `get_batch_status` dice qué lote toca y si alguno espera su commit.
2. La IA implementa el lote y lo verifica ejecutando.
3. **Antes del commit**, `record_batch` con el contenido del lote: título, estado, qué se hizo, archivos, verificación, lo que espera por ti, desvíos y decisiones. El recibo queda con el commit pendiente; si el chat se corta aquí, ya dice qué se hizo y qué se comprobó.
4. Te enseña los archivos y el mensaje, y con tu OK hace el commit.
5. **Después del commit**, `record_batch` con `lote` y `commit`. El servidor comprueba que el commit existe, que está en la rama actual y qué archivos toca. Si no son los que declara el recibo, lo deja escrito en el recibo (es un aviso, no un bloqueo).
6. Al anclar el último lote, el servidor genera `04 - Ejecución.md` y la fase queda cerrada.

**Las anclas**, lo que demuestra que un lote se hizo:

| Ancla | Cuándo | Qué comprueba el servidor |
|-------|--------|---------------------------|
| `commit` | El lote tiene git y la política no es `ninguno` | Que el hash (de 7 a 40 caracteres hexadecimales, validado antes de llamar a git) es un commit de la rama actual, y qué archivos toca |
| sha256 (`artifact_path`) | Sin git, o con la política `ninguno`: el archivo que cambió | Su sha256, dentro del repo o de la carpeta del proyecto, nunca en `.git`, hasta 256 MB |
| nota (`verification_note`) | Sin nada que sellar, o en un lote fallido o descartado | Nada: queda escrita |

**Recibos sellados y `reanclar`.** Un recibo con ancla `commit` o sha256 queda **sellado**: `record_batch` no lo reescribe. Si un rebase o un squash cambió los SHA, `get_batch_status` con `reverificar: true` (o `doctor --reverificar`) marca el ancla como no vigente, y la IA la cambia con `record_batch` (`lote`, `reanclar: true` y el `commit` nuevo). El servidor **te pregunta** "El recibo L02 está sellado con el commit `a1b2c3d`. ¿Reemplazar su ancla por `e4f5a6b`?" (sin confirmaciones directas, la IA necesita tu OK en el chat y `force`). Solo cambia el ancla: el contenido del lote no se toca, y "Verificación del commit" guarda el historial. Con la fase ya cerrada también se puede, y el índice se rehace.

**Con un solo lote**, su recibo vive en `04 - Ejecución/` mientras está abierto, así que la fase no aparece cerrada con el commit pendiente; al anclarlo, el servidor lo mueve a `04 - Ejecución.md` y queda un solo archivo. **Para cerrar sin hacer todos los lotes**, si tú lo decides: `record_batch` con `cerrar_fase: true` y `motivo_descarte`. Los lotes sin recibo quedan descartados, los fallidos se quedan como están, y el servidor te pide confirmación antes de escribir nada. Si decides no hacer el commit de un lote que ya está registrado, la IA lo cierra con `record_batch`, `lote`, `estado: descartado` (o `discarded`) y una nota, sin volver a escribir su contenido.

**La Fase 5 recibe los commits ya verificados.** Al pedir la Fase 5, el prompt termina con "COMMITS DE LA FASE 4": por cada repo, sus commits con su asunto, si siguen en la rama, y el rango exacto para auditarlos si son consecutivos. Si un ancla ya no corresponde a la rama, lo dice, para que la IA te avise antes de auditar.

**Tareas de la 2.x a medio camino.** Siguen funcionando: `record_batch` lee los recibos que la IA escribió a mano (los marca como `manual`) y continúa desde el siguiente lote, y un recibo manual con un hash cuenta como sellado. Si el plan no declara `lotes: N` (`batches: N` en inglés) en su frontmatter, `record_batch` te lo pide antes del primer recibo (si ya hay recibos, el plan está congelado y añadirlo pide tu confirmación). Lo que ya no se puede es escribir recibos ni el documento de la Fase 4 con `write_central_doc` ([ver abajo](#documentos-protegidos)).

## Documentos protegidos

Cada fase trabaja sobre los documentos de las anteriores, así que reescribir uno ya superado cambia en silencio la base de lo que vino después. Por eso `write_central_doc` se niega, **sin `force: true`**, a escribir:

- **El contexto inicial** (`00 - Contexto Inicial.md`), siempre, incluso para crearlo. Solo `start_task` lo escribe sin `force`.
- **Los recibos y el documento de la Fase 4**, siempre, incluso para crearlos: los escribe `record_batch`. La confirmación queda para reparar a mano un archivo dañado, y `get_batch_status` lo marcará como manual.
- **El documento de una fase congelada.** Una fase se congela en cuanto existe el documento de una fase posterior, o en cuanto la Fase 4 tiene algún recibo en `04 - Ejecución/`.

Crear un documento de fase que todavía no existe nunca se rechaza, salvo los de la Fase 4. Los nombres se comparan sin distinguir mayúsculas y en la misma forma Unicode, así que escribirlos de otra manera no esquiva la protección.

**Si hace falta una corrección legítima** —una errata en el análisis con las decisiones ya escritas—, depende de tu cliente:

- **Si tu cliente admite confirmaciones directas** (elicitation de MCP), el servidor **te pregunta a ti**, en un formulario de tu cliente con una casilla: "Reescribir `01 - Análisis Técnico.md`". Si la marcas y aceptas, se escribe y la respuesta dice que fue con tu confirmación; si dices que no o cierras el formulario, no se escribe nada. Aquí `force` no basta: lo pone la IA, y justo eso es lo que la pregunta evita.
- **Si no la admite**, sigue como antes: el mensaje de rechazo le explica a la IA que necesita tu confirmación explícita en el chat y `force: true`, y la respuesta avisa de que el documento se sobrescribió (o se creó, si no existía).

Lo mismo para **estrenar un proyecto** con `crear_proyecto: true` (o su alias `create_project`): con confirmaciones directas, el servidor te pregunta antes de crear la carpeta.

Si tu cliente anuncia confirmaciones directas pero el formulario nunca aparece, el servidor espera tres minutos y no escribe nada; a la segunda vez seguida tampoco escribe (aunque la IA haya puesto `force`) y deja de preguntar durante el resto de la sesión: desde ahí vuelve a decidir `force`, con tu confirmación en el chat. Si tu cliente cancela la llamada antes de que respondas, no se escribe nada. Para evitarlo desde el principio, registra el servidor con `PHASE_GATE_ELICITATION=off`. **En Cursor para Windows se recomienda `off`** mientras siga abierto el bug en el que el formulario no aparece.

Además, `write_central_doc` solo escribe **dentro de la carpeta de una tarea que ya existe**: no crea carpetas sueltas en la Documentación.

## Tools Disponibles

| Tool | Qué hace |
|------|----------|
| `start_task` | Crea la carpeta de una tarea **nueva** (`<PROYECTO>/<subcarpeta de tareas>/<tarea>`), guarda el contexto inicial y la deja como **activa de su proyecto**. Si la tarea ya existe se niega y te manda a `switch_task`, para no reescribir el contexto inicial. Estrenar un proyecto pide `crear_proyecto: true` (o `create_project: true`) y, si tu cliente puede, tu confirmación directa. Con `repos` elige qué repos del proyecto toca la tarea, con `preset` usa otro preset solo para ella ([ver la guía de Configuración](configuracion.md#una-tarea-con-sus-repos-o-su-propio-preset)), y con `redaccion` el contenido se escribe en el otro idioma ([ver la guía de Configuración](configuracion.md#idiomas)). |
| `get_active_task` | Devuelve la tarea activa y **en qué fase va**, deducida de los documentos que ya tiene. Sin `project` responde la de cada proyecto. Úsalo al abrir un chat nuevo o si se perdió el contexto. |
| `list_tasks` | Lista las tareas que existen y la fase de cada una, de la más reciente a la más antigua. Para retomar algo viejo o ver qué quedó a medias. |
| `switch_task` | Cambia cuál es la tarea activa de un proyecto. **No toca ningún archivo**: es la forma correcta de retomar una tarea que ya existe. |
| `get_phase_prompt` | Trae las reglas de comportamiento globales según la fase (1–5): 1 Descubrimiento, 2 Decisiones, 3 Plan Técnico, 4 Ejecución, 5 Auditoría / Pre-PR, armadas con el idioma, el preset y las capas del proyecto (ver abajo). Comprueba de paso la **compuerta**: si te saltaste una fase, el prompt llega con el aviso al principio, seguido de los pendientes heredados si los hay. Con proyecto, termina con el bloque **CONFIGURACIÓN DEL PROYECTO**. |
| `read_central_doc` | Lee un archivo de la Documentación. **Recomendado:** pasar `project` + `task_name` + `file_name` (el servidor arma la ruta). También acepta `file_path` relativo. |
| `write_central_doc` | Escribe/sobrescribe un archivo dentro de la carpeta de una tarea. Mismos parámetros que `read_central_doc` + `content`, y `force` para los [documentos protegidos](#documentos-protegidos) cuando tu cliente no admite confirmaciones directas. |
| `read_repo_file` | Lee un archivo de un repo del proyecto **por su id** (`api`, `web`…), esté donde esté en este equipo. Nunca lee nada de `.git` ([ver abajo](#varios-repositorios-read_repo_file-y-repo_status)). |
| `repo_status` | Rama, commit, adelante/atrás de su upstream y si el árbol está limpio, de un repo o de todos los de la tarea. Solo lee: no toma locks ni ejecuta comandos que traiga el repo (`core.fsmonitor`, filtros de `.gitattributes`). |
| `read_cross_repo` | Lee un archivo de cualquier carpeta de tu carpeta de repositorios, por nombre (ej. desde `repo-a` consultar cómo `repo-b` maneja un endpoint) sin cambiar de ventana. Tampoco lee nada de `.git`. Si el proyecto declara sus repos, usa `read_repo_file`. |
| `record_batch` | Registra un lote de la Fase 4 en su recibo, que escribe el servidor: antes del commit, con el contenido (queda con el commit pendiente), y después, con el `commit`, que comprueba contra git. Sin git, con `artifact_path` (sha256) o `verification_note`. Con `reanclar` cambia el ancla de un recibo sellado y con `cerrar_fase` cierra la fase sin los lotes que faltan, las dos con tu confirmación. `estado` acepta los valores en español o en inglés. Al anclar el último lote genera el documento de la Fase 4 ([ver arriba](#la-fase-4-con-el-servidor-record_batch)). |
| `get_batch_status` | Cruza el plan con los recibos: qué lote toca, cuál espera su commit, el ancla y el origen de cada recibo (servidor o a mano). Con `reverificar`, comprueba que cada commit siga en la rama y que cada artefacto sellado no haya cambiado. Solo lee. |
| `get_orchestrator_status` | La radiografía de la instalación, igual que [`doctor`](instalacion.md#revisar-la-instalación-doctor): versión y ruta del paquete, variables y de dónde salió cada una, configuración, qué prompt gana en cada fase, proyectos con su tarea activa, idioma, preset, reglas y repos, y avisos. Además, el cliente conectado, sus capacidades y con qué proyecto coincide la carpeta abierta. Úsala cuando algo no se comporte como esperas. |

En `start_task`, `switch_task`, `read_central_doc`, `write_central_doc`, `read_repo_file`, `repo_status`, `record_batch` y `get_batch_status`, **`project` es opcional** si tu cliente anuncia la carpeta abierta.

Todas declaran sus anotaciones MCP (solo lectura, destructiva, idempotente), así que un cliente cauto puede dejar pasar sin preguntar las de lectura. Solo `write_central_doc` es destructiva.

### Recursos `phase-gate://`

El servidor expone además los documentos como **recursos de solo lectura**, que los clientes compatibles muestran al escribir `@` en el chat para adjuntarlos sin pedírselo a la IA:

| Recurso | Qué es |
|---------|--------|
| `phase-gate://estado` | La radiografía de `doctor`, en Markdown |
| `phase-gate://fases` | Las fases disponibles, con su documento, sus recibos y qué archivo de prompt gana |
| `phase-gate://tareas/{proyecto}/{tarea}/{documento}` | Un documento de una tarea |
| `phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo}` | Un recibo de lote de la Fase 4 |
| `phase-gate://configuracion/{proyecto}` | La configuración efectiva de un proyecto: preset, idioma, lotes y commits con de dónde sale cada valor, y el estado de sus repos en este equipo |

La lista solo incluye los documentos que existen de la **tarea activa de cada proyecto**, para no inundar el selector; el resto se alcanza con la plantilla, que autocompleta proyecto, tarea y documento. Tienen las mismas defensas que `read_central_doc`: no se salen de la carpeta de la tarea, no exponen archivos con punto y no leen más de 1 MB.

### Cómo el servidor arma las rutas

- **Documentación:** la carpeta de Documentación (`PHASE_GATE_DOCS_PATH`, o `rutas.documentacion` de `machine.json`) / `<PROYECTO>` / la subcarpeta de tareas (`PHASE_GATE_TASKS_SUBDIR`, o `rutas.subcarpetaTareas`) / `<tarea>` / `<archivo>`
- **Repos de código, por nombre** (`read_cross_repo`): la carpeta de repos (`PHASE_GATE_REPOS_PATH`, o `rutas.carpetaDeRepos`) / `<repo>` / `<archivo>`
- **Repos de un proyecto, por id** (`read_repo_file`): la ruta de `machine.json` para `"<PROYECTO>/<id>"` si la hay, y si no, la carpeta de repos / `<dir del manifiesto>` / `<archivo>`

### Qué cuenta como proyecto

No hay ninguna lista de proyectos que mantener. **Es proyecto la carpeta que contenga la subcarpeta de tareas**, así que dar de alta uno nuevo es crearle esa subcarpeta y ya. Las carpetas que no la tengan —credenciales, material compartido, archivo muerto— quedan fuera solas.

Un proyecto que no existe se rechaza mostrando la lista de los que sí, en vez de crear una carpeta suelta. Para **estrenar** un proyecto hay que pedirlo a propósito: `start_task` acepta `crear_proyecto: true`, y sin esa bandera un nombre mal escrito no ensucia tu Documentación.

> Si dejas vacía la subcarpeta de tareas (`PHASE_GATE_TASKS_SUBDIR` o `rutas.subcarpetaTareas`), la regla no se puede aplicar y **cualquier** carpeta cuenta como proyecto.

## El proyecto sale de la carpeta abierta

Si tu cliente anuncia sus carpetas abiertas (MCP Roots), el servidor las cruza con tus proyectos: si una carpeta abierta **es un repo del proyecto** (según su manifiesto y `machine.json`) o está **dentro de su carpeta de la Documentación**, ese es el proyecto. Si abriste una carpeta que contiene un solo repo de un proyecto, también, pero solo para leer: para escribir (`start_task`, `switch_task`, `write_central_doc`) hay que nombrar el proyecto, y la raíz de un disco o tu carpeta de usuario no cuentan. Entonces `project` es opcional y la respuesta lo dice: *"Proyecto deducido de la carpeta abierta: PROYECTO-A (…)"*. Si coincide con varios, la tool te pide `project` y te dice cuáles. Sin Roots, todo funciona como antes.

## Varios repositorios: `read_repo_file` y `repo_status`

Con los repos declarados en el manifiesto, la IA los usa por su id: `read_repo_file(repo: "api", path: "src/main.ts")` y `repo_status()` (los de la tarea) o `repo_status(repo: "web")`. `read_repo_file` nunca lee nada de `.git` —tampoco a través de un enlace—, así que `.gitignore` o `.gitmodules` tampoco; `.github` sí.

`repo_status` consulta git por una sola puerta, de solo lectura y sin efectos: no toma `index.lock` (no estorba a un commit en curso) y **no ejecuta el `core.fsmonitor` ni los filtros de `.gitattributes` de un repo**, que `git status` normal sí ejecutaría. Si git no está instalado, o un repo es de otro usuario ("dubious ownership"), te lo dice con lo que hay que hacer.

## El contrato de la descripción del PR (Fase 5)

La Fase 5 no solo audita: redacta la descripción del PR bajo un contrato estricto,
para que el resultado sea consistente sin importar qué modelo de IA se use.

- **Título:** `tipo(área): frase`, y ahí termina — nada de números de ticket.
- **Estructura fija:** por qué (`Problema` si algo estaba roto, `Contexto` si es
  nuevo) → `Cambios` agrupados → secciones de cierre.
- **Las secciones de cierre son condicionales**, cada una con su disparador:
  `Alcance` solo si tocaste código existente, `Verificación` solo si la prueba fue
  sustanciosa, `Notas de despliegue` solo si hay migraciones.
- **El criterio para agrupar los bullets depende de la forma del cambio** (por
  componente, por sub-feature, por dimensión del dato…), con una tabla de decisión
  en el prompt. Así la descripción se adapta al tamaño del ticket sin dejar de ser
  predecible.
- **Límites de longitud en palabras**, no adjetivos: trivial (60–100), chico
  (120–160), normal (200–260), grande (350–450, tope 500). El prompt en inglés usa
  55–90, 110–150, 190–240 y 320–400 (tope 450): el inglés dice lo mismo con menos palabras.
- **Se entrega dentro de un bloque de código de cuatro backticks**, para que al
  copiar y pegar en GitHub llegue el markdown en crudo y no el texto ya renderizado.

Si quieres adaptarlo a tu estilo, cámbialo con un bloque `fase-5/pr` o `fase-5/ejemplos` (`eject fase-5/ejemplos` te copia el texto actual). Lo que más
mueve la aguja es cambiar los ejemplos de la sección "EJEMPLOS DE REFERENCIA" por
descripciones de PR tuyas: el modelo imita esa voz más que cualquier instrucción.

> El porqué de cada regla del contrato está en [`docs/decisiones.md`](../decisiones.md).
> Léelo antes de cambiar algo: varias reglas que parecen arbitrarias resuelven un problema
> concreto.
