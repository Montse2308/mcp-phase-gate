# MCP Orquestador

Este es un servidor orchestrador básico que implementa el **Model Context Protocol (MCP)**. Por el momento, expone una herramienta de prueba simple (`ping`).

## 📁 Estructura del Proyecto

El proyecto está construido con Node.js y TypeScript. Su estructura principal es:

- `src/` - Código fuente en TypeScript.
  - `src/index.ts` - Punto de entrada del servidor MCP.
- `build/` - Código JavaScript compilado (se genera automáticamente).
- `package.json` - Dependencias y scripts del proyecto.
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

## ⚙️ Funcionalidades Actuales

- **Servidor MCP sobre `stdio`**: El servidor se comunica a través de la entrada y salida estándar.
- **Herramienta `ping`**: Una herramienta básica de prueba que responde con `"pong"` al ser llamada. Útil para verificar que la conexión con los clientes MCP funciona correctamente.

## 📝 Próximos Pasos (Fase 3)

El servidor está preparado con un *placeholder* para agregar orquestación de más herramientas y lógicas complejas en el futuro.
