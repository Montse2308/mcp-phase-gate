# 🧠 MCP Orquestador

Este servidor MCP (Model Context Protocol) es el "cerebro central" de tu entorno de desarrollo. Conecta tu editor con una **Documentación Central** (en OneDrive o donde la tengas) y aplica reglas estrictas de arquitectura ("Cero Rupturas") y las convenciones del repositorio en el que estés trabajando.

Habla MCP estándar, así que funciona en cualquier cliente compatible. Está **probado en Cursor, VS Code y Claude Code** — ver [Paso 4](#paso-4--registrar-el-mcp-en-tu-cliente). En el panel del cliente se identifica como `phase-gate`.

Divide cada requerimiento en **5 fases** para evitar que la IA rompa código existente, obligarla a preguntarte antes de decisiones críticas y, al final, auditar los cambios antes de subir el PR.

---

## 📁 Cómo se organiza la Documentación

Cada tarea vive dentro de una carpeta con esta estructura fija:

```
DOCUMENTACIÓN/
├── BOS/
│   └── Proyectos/
│       └── <nombre_de_la_tarea>/
│           ├── 00 - Contexto Inicial.md
│           ├── 01 - Análisis Técnico.md
│           ├── 03 - Plan Técnico.md
│           └── ...
├── CRM/
│   └── Proyectos/
│       └── <nombre_de_la_tarea>/
└── KANBAN/
    └── Proyectos/
        └── <nombre_de_la_tarea>/
```

> El servidor arma esta ruta **automáticamente**. Tú (o el LLM) solo indican `project`, `task_name` y `file_name`; no hay que escribir la ruta completa a mano.

---

## 💻 Configuración paso a paso (en CUALQUIER dispositivo)

El código es idéntico en todos lados; lo único que cambia entre tu **compu del trabajo** y tu **laptop de casa** es la **ruta a la carpeta de OneDrive** (porque el usuario de Windows es distinto). Por eso las rutas son configurables por variable de entorno.

### Requisitos previos
- **Node.js** instalado (versión 18 o superior). Verifícalo con `node -v`.
- **Git** instalado.
- El **OneDrive de tu organización** sincronizado en el dispositivo, con la carpeta de Documentación disponible localmente.
- **Un cliente MCP**: Cursor, VS Code o Claude Code.

### Paso 1 — Clonar el repositorio
Elige una carpeta (recomendado mantener la misma estructura en ambos equipos, ej. `C:\proyectos\yo`):

```bash
git clone https://github.com/Montse2308/MCP_orquestador.git
cd MCP_orquestador
```

### Paso 2 — Instalar dependencias y compilar
La carpeta `build/` NO se sube al repo (está en `.gitignore`), así que hay que generarla en cada dispositivo:

```bash
npm install
npm run build
```

Esto crea `build/index.js`, que es lo que el cliente va a ejecutar.

### Paso 3 — Crear tu archivo `.env` con las rutas de ESTE equipo
La ruta de la Documentación cambia según el usuario de Windows del equipo, así que se configura por dispositivo en un archivo `.env` (que NO se sube al repo).

1. Copia la plantilla `.env.example` como `.env`:

```bash
copy .env.example .env
```

2. Averigua tu ruta real: abre el Explorador, navega hasta tu carpeta de Documentación dentro del OneDrive de la organización, haz clic en la barra de direcciones y copia la ruta completa.
3. Edita el `.env` y pon tus valores (aquí las barras invertidas van **simples**, sin comillas):

```ini
ORQUESTADOR_DOCS_PATH=C:\Users\TU_USUARIO\OneDrive - TU ORGANIZACIÓN\Documentos\DOCUMENTACIÓN
ORQUESTADOR_REPOS_PATH=C:\proyectos
```

**Las dos son obligatorias y no tienen valor por defecto.** Si falta alguna, o si apunta a una carpeta que no existe, las tools que la necesitan te lo dicen con ese nombre exacto en vez de fallar más tarde por otro motivo.

> Guarda el `.env` en **UTF-8 sin BOM**. Si lo creas desde PowerShell con `>` sale en UTF-16, los acentos de `DOCUMENTACIÓN` llegan rotos y la ruta "no existe" aunque la veas bien.

### Paso 4 — Registrar el MCP en tu cliente

Como las rutas viven en el `.env`, la configuración del cliente queda genérica: solo apunta al `build/index.js`. **La clave que le pongas (`mcp-orquestador` en los ejemplos) es la que identifica al servidor y la que prefija sus tools** — el nombre que el servidor declara de sí mismo, `phase-gate`, es solo lo que verás en el panel.

En los tres casos, ajusta la ruta según dónde clonaste el repo. Recuerda que en JSON cada `\` va doble `\\`.

<details open>
<summary><b>Cursor</b> — <code>C:\Users\&lt;TU_USUARIO&gt;\.cursor\mcp.json</code> (créalo si no existe)</summary>

```json
{
  "mcpServers": {
    "mcp-orquestador": {
      "command": "node",
      "args": ["C:\\<DONDE_CLONASTE>\\MCP_orquestador\\build\\index.js"]
    }
  }
}
```
</details>

<details>
<summary><b>VS Code</b> — <code>C:\Users\&lt;TU_USUARIO&gt;\AppData\Roaming\Code\User\mcp.json</code></summary>

Ojo con dos diferencias: la clave de arriba es `servers`, no `mcpServers`, y hay que declarar `type`.

```json
{
  "servers": {
    "mcp-orquestador": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\<DONDE_CLONASTE>\\MCP_orquestador\\build\\index.js"]
    }
  }
}
```
</details>

<details>
<summary><b>Claude Code</b> — <code>.mcp.json</code> en la raíz del proyecto</summary>

Claude Code lee un `.mcp.json` del proyecto en el que estés. Como lo lanza desde esa carpeta, aquí la ruta puede ser **relativa** — y ese es el único de los tres archivos que no lleva ruta absoluta, así que sirve igual en cualquier máquina:

```json
{
  "mcpServers": {
    "mcp-orquestador": {
      "command": "node",
      "args": ["build/index.js"]
    }
  }
}
```

Eso vale trabajando dentro de este repo. Para usarlo desde otros proyectos, registra el servidor con ruta absoluta en tu configuración de usuario (`claude mcp add`) o pon un `.mcp.json` en cada proyecto.
</details>

> **Alternativa sin `.env`:** puedes omitir el `.env` y poner las rutas en un bloque `"env"` dentro de la configuración del cliente. Si defines la variable en ambos lados, la del cliente tiene prioridad.

### Paso 5 — Reiniciar y verificar
1. Reinicia el cliente, o desactiva y vuelve a activar el servidor en su panel de MCP.
2. Debe aparecer activo con sus 6 tools listadas. En **Cursor** está en Settings → MCP; en **VS Code**, en la vista de extensiones/MCP; en **Claude Code**, con `/mcp`.
3. Pruébalo pidiendo en el chat: *"Usa la tool `get_active_task` del mcp-orquestador"* — debe responder, aunque sea para decir que no hay tarea activa todavía.

---

## 🔄 Trabajar en varios dispositivos sin perder el hilo

- La **Documentación** vive en OneDrive, así que se sincroniza sola entre tu compu del trabajo y tu laptop de casa. Lo único distinto por equipo es el archivo `.env` (Paso 3), que es local y no se sube al repo.
- El servidor recuerda cuál es la **tarea activa** (ver `get_active_task`). Ese registro es **local de cada dispositivo** y se guarda en la carpeta de datos de tu usuario, fuera del repo, así que sobrevive a borrar `build/` o volver a clonar:
  - **Windows:** `%APPDATA%\mcp-orquestador\active_task.json`
  - **macOS:** `~/Library/Application Support/mcp-orquestador/active_task.json`
  - **Linux:** `~/.local/state/mcp-orquestador/active_task.json`

  Si cambias de equipo o de chat y el LLM "olvidó" dónde escribir, dile que llame `get_active_task` o simplemente indícale el `project` + `task_name`.
- **Regla de oro:** deja que OneDrive termine de sincronizar antes de empezar a trabajar en el otro equipo, para no crear conflictos de archivos.

---

## 🧩 Lo que vive FUERA del repo (una copia por dispositivo)

`git pull` **no** actualiza estas cuatro cosas. Si algo dejó de funcionar después de jalar
cambios, la causa está casi siempre aquí.

| Qué | Dónde | Por qué no está en el repo |
|-----|-------|----------------------------|
| El servidor compilado | `build/` en tu clon | Está gitignoreado. **Después de cada `git pull` que traiga cambios en `src/`, corre `npm run build`** o el cliente seguirá ejecutando la versión anterior. |
| Las rutas de este equipo | `.env` en la raíz (Paso 3) | Cambian el usuario de Windows y la carpeta de OneDrive. |
| El registro del MCP | La configuración de tu cliente (Paso 4) | En Cursor y VS Code contiene la ruta absoluta a `build/index.js`, que depende de dónde clonaste y apunta a una carpeta gitignoreada. Ninguna ruta puede ser correcta en todos los equipos. Ver [`docs/decisiones.md`](docs/decisiones.md). La excepción es el `.mcp.json` de Claude Code, que va con ruta relativa. |
| Los comandos `/f1`–`/f5` en **Cursor** | `C:\Users\<TU_USUARIO>\.cursor\commands\f<N>.md` | Cursor solo los lee de la carpeta del usuario, así que se copian a mano en cada equipo. En **Claude Code** no aplica: están versionados en `.claude/commands/` y llegan con el `git pull`. |

### Los comandos de fase

Se invocan en el chat escribiendo `/f1`, `/f2`, etc. **Son solo orquestación**: dicen qué
tools llamar y en qué orden. El comportamiento, la estructura del documento y su nombre de
archivo los dicta el prompt de la fase en `prompts/`, así que afinar una fase no obliga a
tocar su comando.

Lo que hace cada uno:

| Comando | Llama a | Documento que deja |
|---------|---------|--------------------|
| `/f1` | `start_task` + `get_phase_prompt(1)` | El de la Fase 1 |
| `/f2` | `get_phase_prompt(2)`, lee el de la Fase 1 | El de la Fase 2, después de que respondas las preguntas |
| `/f3` | `get_phase_prompt(3)`, lee los anteriores | El de la Fase 3 |
| `/f4` | `get_phase_prompt(4)`, lee el plan | El de la Fase 4, corto y al final |
| `/f5` | `get_phase_prompt(5)` | Ninguno: la auditoría y la descripción del PR van en el chat |

Ningún comando nombra un archivo: el nombre lo declara la cabecera del prompt de cada fase
y `get_phase_prompt` se lo entrega al modelo.

`/f1` y `/f5` esperan datos después del comando: `/f1` necesita project, task_name y el
requerimiento completo; `/f5`, cuáles commits auditar. Los otros tres arrancan de
`get_active_task`.

**Dónde ponerlos según el cliente:**

- **Claude Code:** ya están en [`.claude/commands/`](.claude/commands), versionados. Funcionan al abrir este repo sin configurar nada. Para usarlos desde tus otros proyectos, cópialos a `C:\Users\<TU_USUARIO>\.claude\commands\`.
- **Cursor:** cópialos a `C:\Users\<TU_USUARIO>\.cursor\commands\`. Desde ahí sirven en todos tus proyectos.
- **VS Code:** no tiene comandos de barra propios; pega el contenido del archivo en el chat.

El contenido exacto de los cinco está también en
[`docs/comandos-de-fase.md`](docs/comandos-de-fase.md), para leerlos sin abrir la carpeta.

---

## 🚀 Guía de Uso Diario (Prompts Plantilla)

Cuando empieces un requerimiento nuevo, abre un chat en tu cliente y copia/pega estas plantillas reemplazando lo que está entre `{ }`.

### 🔍 FASE 1: Inicialización y Descubrimiento
El servidor crea la estructura de carpetas y analiza tu código actual.

> Usa el mcp-orquestador para ejecutar la tool `start_task`.
> - project: "{ bos | crm | kanban }"
> - task_name: "{ nombre_corto_de_tu_tarea }"
> - initial_context: "{ Pega aquí el correo, mensaje de Slack o requerimiento completo }"
>
> Luego invoca `get_phase_prompt(1)` para asumir tu rol de Fase 1. Analiza el código actual de este repositorio y usa `write_central_doc` (con project + task_name + file_name = "01 - Análisis Técnico.md") para generar el documento detallando cómo resolveremos el problema.

### 🛑 FASE 2: Preguntas y Decisiones (CRÍTICO)

> Invoca `get_phase_prompt(2)` para asumir tu rol de Fase 2.
> Lee "01 - Análisis Técnico.md" con `read_central_doc` (project + task_name + file_name). Analiza dependencias y posibles fallos con el código existente.
> Detente y hazme las preguntas críticas necesarias antes de planear código. No escribas código aún.

*(Aquí tú respondes hasta que ambos estén 100% de acuerdo.)*

### 📝 FASE 3: Plan Técnico Seguro

> Las decisiones están tomadas. Invoca `get_phase_prompt(3)` para asumir tu rol de Fase 3.
> Crea "03 - Plan Técnico.md" en la carpeta de esta tarea con `write_central_doc`. Haz el paso a paso exacto de los archivos a modificar o crear, respetando "Cero Rupturas".

### 💻 FASE 4: Ejecución del Código

> Invoca `get_phase_prompt(4)` para asumir tu rol de Fase 4 (Ejecución).
> Ejecuta paso a paso "03 - Plan Técnico.md". Aplica las reglas locales del repositorio actual (Laravel/NestJS/React) y avísame cuando termines un bloque para verificar los cambios.

### 🔎 FASE 5: Auditoría / Pre-PR
Antes de subir el PR, la IA revisa tus cambios como un auditor externo estricto para anticipar bloqueos, y te redacta la descripción del PR. **Tú siempre haces los commits y el PR**; la IA solo usa herramientas de **lectura** (nunca commitea, hace push ni sube nada).

> Invoca `get_phase_prompt(5)` para asumir tu rol de Fase 5 (Auditoría / Pre-PR).
> Audita estos commits: "{ rango o lista de commits, ej. los últimos 6 de esta rama }". Dime si hay cambios BLOQUEANTES para subir el PR y luego redáctame la descripción del PR.

---

## 🛠️ Tools Disponibles

| Tool | Qué hace |
|------|----------|
| `start_task` | Crea la carpeta de la tarea (`<PROYECTO>/Proyectos/<tarea>`), guarda el "00 - Contexto Inicial.md" y registra la tarea como **activa**. |
| `get_active_task` | Devuelve la tarea activa actual (proyecto, nombre y ruta). Úsalo al abrir un chat nuevo o si se perdió el contexto de dónde escribir. |
| `get_phase_prompt` | Trae las reglas de comportamiento globales según la fase (1–5): 1 Descubrimiento, 2 Decisiones, 3 Plan Técnico, 4 Ejecución, 5 Auditoría / Pre-PR. El texto vive en `prompts/` (ver abajo). |
| `read_central_doc` | Lee un archivo de la Documentación. **Recomendado:** pasar `project` + `task_name` + `file_name` (el servidor arma la ruta). También acepta `file_path` relativo. |
| `write_central_doc` | Escribe/sobrescribe un archivo. Mismos parámetros que `read_central_doc` + `content`. |
| `read_cross_repo` | Lee archivos de otros repos locales en tu carpeta de proyectos (ej. desde BOS consultar cómo Kanban maneja un endpoint) sin cambiar de ventana. |

### Cómo el servidor arma las rutas
- **Documentación:** `ORQUESTADOR_DOCS_PATH` / `<PROYECTO>` / `ORQUESTADOR_TASKS_SUBDIR` / `<tarea>` / `<archivo>`
- **Repos de código:** `ORQUESTADOR_REPOS_PATH` / `<repo>` / `<archivo>`

### Qué cuenta como proyecto

No hay ninguna lista de proyectos que mantener. **Es proyecto la carpeta que contenga la subcarpeta de tareas**, así que dar de alta uno nuevo es crearle esa subcarpeta y ya. Las carpetas que no la tengan —credenciales, material compartido, archivo muerto— quedan fuera solas.

Un proyecto que no existe se rechaza mostrando la lista de los que sí, en vez de crear una carpeta suelta. Para **estrenar** un proyecto hay que pedirlo a propósito: `start_task` acepta `crear_proyecto: true`, y sin esa bandera un nombre mal escrito no ensucia tu Documentación.

> Si dejas `ORQUESTADOR_TASKS_SUBDIR` vacío, la regla no se puede aplicar y **cualquier** carpeta cuenta como proyecto.

---

## 📝 Los prompts de las fases viven en `prompts/`

El texto de cada fase **ya no está dentro del código**: son archivos markdown sueltos.

```
prompts/
├── global-rules.md              ← reglas "Cero Rupturas", se anteponen a TODAS las fases
├── fase-1-descubrimiento.md
├── fase-2-decisiones.md
├── fase-3-plan-tecnico.md
├── fase-4-ejecucion.md
└── fase-5-auditoria-pr.md       ← incluye el contrato de la descripción del PR
```

**Se leen en cada llamada.** Si editas un `.md`, la siguiente vez que la IA invoque
`get_phase_prompt` ya recibe la versión nueva — sin `npm run build` y sin reiniciar el
cliente. Eso permite afinar el comportamiento de una fase probándolo al momento.

Cada fase declara, en una cabecera al inicio del `.md`, cómo se llama el documento que produce:

```markdown
---
documento: 02 - Decisiones.md
---

# Decisiones
```

`get_phase_prompt` lee esa cabecera y le entrega al modelo, al final del prompt, el nombre exacto del documento de la fase y los de las fases anteriores. **Por eso los comandos `/f1`–`/f5` ya no nombran ningún archivo:** el nombre vive en un solo sitio, y cambiar un prompt no obliga a editar además un comando en cada dispositivo. Una fase sin `documento` —como la 5, que entrega en el chat— se anuncia como tal.

La fase 1 declara además `documento_inicial`, que es el archivo que escribe `start_task` con el contexto.

Reglas del formato:
- El archivo debe llamarse `fase-<N>-<lo-que-sea>.md` (también acepta `phase-<N>-...`).
- La cabecera es opcional y no se filtra al prompt: se quita antes de entregarlo.
- **El número de fases no está cableado:** si agregas un `fase-6-despliegue.md`, la
  fase 6 existe de inmediato.
- El primer encabezado `# Título` del archivo es el nombre que aparece en la
  descripción de la tool.
- `global-rules.md` se antepone automáticamente al contenido de la fase.

### El contrato de la descripción del PR (Fase 5)

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
  (120–160), normal (200–260), grande (350–450, tope 500).
- **Se entrega dentro de un bloque de código de cuatro backticks**, para que al
  copiar y pegar en GitHub llegue el markdown en crudo y no el texto ya renderizado.

Si quieres adaptarlo a tu estilo, edita `prompts/fase-5-auditoria-pr.md`. Lo que más
mueve la aguja es cambiar los ejemplos de la sección "EJEMPLOS DE REFERENCIA" por
descripciones de PR tuyas: el modelo imita esa voz más que cualquier instrucción.

> El porqué de cada regla del contrato está en [`docs/decisiones.md`](docs/decisiones.md).
> Léelo antes de cambiar algo: varias reglas que parecen arbitrarias resuelven un problema
> concreto.

---

## ⚙️ Variables de entorno

Se cargan desde el archivo `.env` de la raíz del repo (o desde el bloque `"env"` del `mcp.json`).

Las dos primeras **son obligatorias y no tienen valor por defecto**: apuntan a carpetas que solo existen en tu equipo, así que cualquier default sería la ruta de la máquina de otra persona. Si falta una, o apunta a algo que no existe o que no es una carpeta, las tools que la usan devuelven el nombre de la variable y dónde configurarla. Las que no dependen de ella —como `get_phase_prompt`— siguen funcionando.

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `ORQUESTADOR_DOCS_PATH` | **ninguno, es obligatoria** | Ruta a la carpeta raíz de la Documentación en OneDrive. **Distinta en cada dispositivo.** |
| `ORQUESTADOR_REPOS_PATH` | **ninguno, es obligatoria** | Ruta a la carpeta donde están tus repositorios de código. |
| `ORQUESTADOR_TASKS_SUBDIR` | `Proyectos` | Subcarpeta donde viven las tareas dentro de cada proyecto. Vacía = las tareas cuelgan directo del proyecto. Es además la regla que decide qué carpeta cuenta como proyecto (ver abajo). |
| `ORQUESTADOR_PROMPTS_PATH` | `prompts/` en la raíz del repo | Carpeta de los prompts de fase. Solo hace falta si quieres usar un juego de prompts propio guardado en otro lado. |
| `ORQUESTADOR_STATE_PATH` | Carpeta de datos del usuario (ver arriba) | Carpeta donde se guarda la tarea activa. Casi nunca hace falta tocarla; sirve para aislar el estado en pruebas o para forzar una ubicación concreta. |

---

## 🧑‍💻 Desarrollo (si modificas el código)

> **Ojo:** esto aplica solo a cambios en el **código**. Si lo único que tocaste fue
> un prompt de `prompts/*.md`, **no hace falta compilar ni reiniciar nada** — se leen
> en cada llamada.

El código fuente está en `src/index.ts`. El cliente ejecuta la versión compilada `build/index.js`, así que después de cualquier cambio:

```bash
npm run build
```

Y luego reinicia el MCP en tu cliente para que cargue la nueva versión.

Scripts disponibles:
- `npm run build` → compila TypeScript a `build/`.
- `npm start` → ejecuta el servidor compilado.
- `npm run dev` → ejecuta directo desde TypeScript con `ts-node`.

### Dónde está cada cosa

| Qué buscas | Dónde |
|------------|-------|
| Lo que el proyecto hace hoy | Este README |
| Por qué está diseñado así | [`docs/decisiones.md`](docs/decisiones.md) |
| Los comandos `/f1`–`/f5`, para recrearlos en otro equipo | [`docs/comandos-de-fase.md`](docs/comandos-de-fase.md) |
| Lo que falta por hacer | [Issues](https://github.com/Montse2308/MCP_orquestador/issues) — agrupados con las labels `v1-uso-propio` y `v2-publico` |
| Lo que ya se hizo | El historial de commits y los PRs mergeados |
