# MCP Orquestador

Este es un servidor orquestador avanzado que implementa el **Model Context Protocol (MCP)**. Actúa como el cerebro central para la gestión de documentación y la ejecución estructurada de tareas a través de 4 fases metodológicas (Descubrimiento, Decisiones, Plan Técnico y Ejecución). Además, facilita la interacción con distintos repositorios del entorno local.

## 📁 Estructura del Proyecto

El proyecto está construido con Node.js y TypeScript. Su estructura principal es:

- `src/` - Código fuente en TypeScript.
  - `src/index.ts` - Punto de entrada del servidor MCP, donde se definen las herramientas de orquestación.
- `build/` - Código JavaScript compilado (se genera automáticamente).
- `package.json` - Dependencias y scripts.
- `tsconfig.json` - Configuración del compilador de TypeScript.

## 🚀 Requisitos

- [Node.js](https://nodejs.org/) (se recomienda v18 o superior)
- npm (viene incluido con Node.js)

## 🛠️ Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/Montse2308/MCP_orquestador.git
   cd MCP_orquestador
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

## 💻 Uso y Ejecución

### Entorno de Desarrollo

Para ejecutar el servidor directamente desde TypeScript (útil durante el desarrollo):

```bash
npm run dev
```

### Compilar para Producción

Para compilar el código TypeScript a JavaScript:

```bash
npm run build
```

Esto generará los archivos compilados en la carpeta `build/`.

### Ejecutar en Producción

Una vez compilado, puedes iniciar el servidor con:

```bash
npm start
```

## ⚙️ Funcionalidades y Herramientas (Tools)

El servidor MCP expone diversas herramientas diseñadas para coordinar flujos de trabajo con agentes IA:

- **`start_task`**: Inicia una nueva tarea. Crea automáticamente una carpeta en la Documentación Central para el proyecto correspondiente (ej. BOS, CRM, KANBAN) y guarda el requerimiento en el archivo `00 - Contexto Inicial.md`.
- **`get_phase_prompt`**: Devuelve los *prompts* maestros de comportamiento que dictan cómo debe actuar la IA según la etapa del ciclo de vida del desarrollo:
  - Fase 1: Descubrimiento y Análisis.
  - Fase 2: Toma de Decisiones y Preguntas Críticas.
  - Fase 3: Creación de Plan Técnico.
  - Fase 4: Ejecución Segura.
- **`read_central_doc`**: Permite leer archivos directamente desde la Documentación Central.
- **`write_central_doc`**: Permite escribir o sobrescribir archivos (como análisis técnicos o planes de ejecución) en la Documentación Central.
- **`read_cross_repo`**: Permite el acceso de solo lectura al código fuente de otros repositorios locales (ubicados en `C:/proyectos`), útil para contexto en proyectos cruzados.

> **Nota de Seguridad:** Las herramientas que interactúan con el sistema de archivos de Windows contienen validaciones para evitar la salida indeseada de los directorios permitidos (`DOCS_BASE_PATH` y `REPOS_BASE_PATH`).
