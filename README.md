# 🧠 MCP Orquestador para Cursor

Este servidor MCP (Model Context Protocol) es el "cerebro central" de tu entorno de desarrollo. Conecta a Cursor con tu **Documentación Central** (en OneDrive) y aplica reglas estrictas de arquitectura ("Cero Rupturas") y convenciones de código según el repositorio en el que trabajes (BOS, CRM o Kanban).

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
- El **OneDrive de la oficina** ("Abogados Manuel Solis") sincronizado en el dispositivo, con la carpeta `DOCUMENTACIÓN` disponible localmente.
- **Cursor** instalado.

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

Esto crea `build/index.js`, que es lo que Cursor va a ejecutar.

### Paso 3 — Crear tu archivo `.env` con las rutas de ESTE equipo
La ruta de la Documentación cambia según el usuario de Windows del equipo, así que se configura por dispositivo en un archivo `.env` (que NO se sube al repo).

1. Copia la plantilla `.env.example` como `.env`:

```bash
copy .env.example .env
```

2. Averigua tu ruta real: abre el Explorador, navega hasta la carpeta `DOCUMENTACIÓN` dentro del OneDrive de la oficina, haz clic en la barra de direcciones y copia la ruta completa.
3. Edita el `.env` y pon tus valores (aquí las barras invertidas van **simples**, sin comillas):

```ini
ORQUESTADOR_DOCS_PATH=C:\Users\TU_USUARIO\OneDrive - Abogados Manuel Solis\Documentos\DOCUMENTACIÓN
ORQUESTADOR_REPOS_PATH=C:\proyectos
```

### Paso 4 — Registrar el MCP en Cursor
Como las rutas viven en el `.env`, el `mcp.json` queda genérico (solo apunta al `build/index.js`). Edita `C:\Users\<TU_USUARIO>\.cursor\mcp.json` (créalo si no existe):

```json
{
  "mcpServers": {
    "mcp-orquestador": {
      "command": "node",
      "args": ["C:\\proyectos\\yo\\MCP_orquestador\\build\\index.js"]
    }
  }
}
```

Ajusta la ruta dentro de `args` según dónde clonaste el repo en este equipo. (Recuerda: en JSON cada `\` va doble `\\`.)

> **Alternativa sin `.env`:** si prefieres, puedes omitir el `.env` y poner las rutas directamente en un bloque `"env"` dentro del `mcp.json`. Si defines la variable en ambos lados, la del `mcp.json` tiene prioridad.

### Paso 5 — Reiniciar y verificar
1. Reinicia Cursor (o ve a **Settings → MCP** y desactiva/activa `mcp-orquestador`).
2. En Settings → MCP debe aparecer `mcp-orquestador` en verde/activo con sus tools listadas.
3. Prueba pidiéndole al chat: *"Usa la tool `get_active_task` del mcp-orquestador"* — debe responder (aunque diga que no hay tarea activa aún).

---

## 🔄 Trabajar en varios dispositivos sin perder el hilo

- La **Documentación** vive en OneDrive, así que se sincroniza sola entre tu compu del trabajo y tu laptop de casa. Lo único distinto por equipo es el archivo `.env` (Paso 3), que es local y no se sube al repo.
- El servidor recuerda cuál es la **tarea activa** (ver `get_active_task`). Ese registro es **local de cada dispositivo** (se guarda junto al build). Si cambias de equipo o de chat y el LLM "olvidó" dónde escribir, dile que llame `get_active_task` o simplemente indícale el `project` + `task_name`.
- **Regla de oro:** deja que OneDrive termine de sincronizar antes de empezar a trabajar en el otro equipo, para no crear conflictos de archivos.

---

## 🚀 Guía de Uso Diario (Prompts Plantilla)

Cuando empieces un requerimiento nuevo, abre un chat en Cursor y copia/pega estas plantillas reemplazando lo que está entre `{ }`.

### 🔍 FASE 1: Inicialización y Descubrimiento
Cursor crea la estructura de carpetas y analiza tu código actual.

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
- **Documentación:** `ORQUESTADOR_DOCS_PATH` / `<PROYECTO>` / `Proyectos` / `<tarea>` / `<archivo>`
- **Repos de código:** `ORQUESTADOR_REPOS_PATH` / `<repo>` / `<archivo>`

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
`get_phase_prompt` ya recibe la versión nueva — sin `npm run build` y sin reiniciar
Cursor. Eso permite afinar el comportamiento de una fase probándolo al momento.

Reglas del formato:
- El archivo debe llamarse `fase-<N>-<lo-que-sea>.md` (también acepta `phase-<N>-...`).
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

Se cargan desde el archivo `.env` de la raíz del repo (o desde el bloque `"env"` del `mcp.json`). Si ninguna está definida, se usan los valores por defecto de la compu original.

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `ORQUESTADOR_DOCS_PATH` | `C:\Users\Usuario general\OneDrive - Abogados Manuel Solis\Documentos\DOCUMENTACIÓN` | Ruta a la carpeta raíz de la Documentación en OneDrive. **Cámbiala en cada dispositivo.** |
| `ORQUESTADOR_REPOS_PATH` | `C:\proyectos` | Ruta a la carpeta donde están tus repositorios de código. |
| `ORQUESTADOR_PROMPTS_PATH` | `prompts/` en la raíz del repo | Carpeta de los prompts de fase. Solo hace falta si quieres usar un juego de prompts propio guardado en otro lado. |

---

## 🧑‍💻 Desarrollo (si modificas el código)

> **Ojo:** esto aplica solo a cambios en el **código**. Si lo único que tocaste fue
> un prompt de `prompts/*.md`, **no hace falta compilar ni reiniciar nada** — se leen
> en cada llamada.

El código fuente está en `src/index.ts`. Cursor ejecuta la versión compilada `build/index.js`, así que después de cualquier cambio:

```bash
npm run build
```

Y luego reinicia el MCP en Cursor para que cargue la nueva versión.

Scripts disponibles:
- `npm run build` → compila TypeScript a `build/`.
- `npm start` → ejecuta el servidor compilado.
- `npm run dev` → ejecuta directo desde TypeScript con `ts-node`.

### Dónde está cada cosa

| Qué buscas | Dónde |
|------------|-------|
| Lo que el proyecto hace hoy | Este README |
| Por qué está diseñado así | [`docs/decisiones.md`](docs/decisiones.md) |
| Lo que falta por hacer | [Issues](https://github.com/Montse2308/MCP_orquestador/issues) — agrupados con las labels `v1-uso-propio` y `v2-publico` |
| Lo que ya se hizo | El historial de commits y los PRs mergeados |
