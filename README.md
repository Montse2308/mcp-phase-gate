# 🧠 MCP Orquestador para Cursor

Este servidor MCP (Model Context Protocol) es el "cerebro central" de tu entorno de desarrollo. Conecta a Cursor con tu **Documentación Central** y aplica reglas estrictas de arquitectura ("Cero Rupturas") y convenciones de código dependiendo del repositorio en el que estés trabajando (BOS, CRM o Kanban).

---

## 🔌 1. Cómo Conectar este MCP a Cursor

El servidor ya está compilado en la carpeta `build/`. Para asegurarte de que Cursor lo está usando:

1. Abre Cursor y ve a la configuración (`Ctrl` + `,`).
2. Busca la sección **Features > MCP**.
3. Asegúrate de tener un servidor llamado `mcp-orquestador` tipo `command`.
4. El comando debe ser: `node C:\proyectos\yo\MCP_orquestador\build\index.js`
*(Nota: En los proyectos donde añadimos el archivo `.cursor/mcp.json` esto ocurre de manera automática).*

---

## 🚀 2. Guía de Uso Diario (Prompts Plantilla)

El orquestador divide el trabajo en **4 Fases estandarizadas** para evitar que la IA rompa código existente y para obligarla a preguntarte siempre que haya decisiones críticas.

Cuando empieces un requerimiento nuevo, abre un Chat normal en Cursor y copia/pega estas plantillas reemplazando los corchetes `{ }`.

### 🔍 FASE 1: Inicialización y Descubrimiento
Usa este prompt cuando te asignan una nueva tarea. Cursor creará la estructura de carpetas y analizará tu código actual.

> **Prompt a copiar en Cursor:**
> Usa el mcp-orquestador para ejecutar la tool \`start_task\`. 
> - project: "{ bos | crm | kanban }"
> - task_name: "{ nombre_corto_de_tu_tarea }"
> - initial_context: "{ Pega aquí todo el correo, mensaje de slack o requerimiento completo }"
> 
> Una vez creada la tarea, invoca la tool \`get_phase_prompt(1)\` para asumir tu rol de Fase 1. Analiza el código actual de este repositorio y usa \`write_central_doc\` para generar el documento "01 - Análisis Técnico.md" detallando cómo resolveremos este problema.

---

### 🛑 FASE 2: Preguntas y Decisiones (CRÍTICO)
Una vez que Cursor termine el análisis de la Fase 1, es momento de obligarlo a pensar en qué puede fallar.

> **Prompt a copiar en Cursor:**
> Invoca la tool \`get_phase_prompt(2)\` para asumir tu rol de Fase 2. 
> Lee el documento "01 - Análisis Técnico.md" que acabas de crear usando \`read_central_doc\`. Analiza dependencias y posibles fallos con el código existente. 
> Detente y hazme las preguntas críticas necesarias para poder tomar las decisiones de arquitectura antes de planear el código. No escribas código aún.

*(Aquí tú respondes a sus preguntas en el chat hasta que ambos estén 100% de acuerdo).*

---

### 📝 FASE 3: Plan Técnico Seguro
Una vez que le respondiste sus preguntas, pasamos a crear el plan detallado.

> **Prompt a copiar en Cursor:**
> Las decisiones están tomadas. Invoca la tool \`get_phase_prompt(3)\` para asumir tu rol de Fase 3.
> Crea el documento "03 - Plan Técnico.md" en la carpeta de esta tarea. Haz el paso a paso exacto de los archivos que vamos a modificar o crear, respetando siempre el principio de "Cero Rupturas".

---

### 💻 FASE 4: Ejecución del Código
Con el plan aprobado en la documentación, ahora sí autorizas a Cursor a modificar tus archivos del repositorio.

> **Prompt a copiar en Cursor:**
> Invoca la tool \`get_phase_prompt(4)\` para asumir tu rol de Fase 4 (Ejecución).
> Ejecuta paso a paso el "03 - Plan Técnico.md". Recuerda aplicar las reglas locales del repositorio actual (Laravel/NestJS/React) y avísame cuando termines un bloque para que yo pueda verificar visualmente los cambios en el navegador.

---

## 🛠️ Tools Disponibles para ti o para el LLM

Cursor tiene acceso a estas herramientas por detrás:
* \`start_task\`: Crea la carpeta en \`DOCUMENTACIÓN\` y el archivo base.
* \`get_phase_prompt\`: Trae las reglas de comportamiento globales.
* \`read_central_doc\` / \`write_central_doc\`: Lee o escribe en la ruta de Documentación de OneDrive.
* \`read_cross_repo\`: Si estás programando en BOS y necesitas saber cómo el Kanban maneja un endpoint, el LLM usa esta tool para leer archivos en \`C:\proyectos\kanban\` sin que tú tengas que moverte de ventana.
