# Contributing

Thanks for looking at the code. This page says how the repository is laid out, how to build and test it, and what to check before you open a pull request. *En español: [Español](#español).*

## Architecture

```mermaid
flowchart LR
    CL["MCP client<br/>Claude Code · Cursor · VS Code"]
    subgraph SRV["MCP server (stdio)"]
        T["13 tools · 5 resources<br/>/f1 … /f5 as MCP Prompts"]
    end
    CL <-- "stdio" --> T
    T --> P["Prompt layers<br/>factory prompts/es · prompts/en<br/>preset · rules · global · project"]
    T --> MF["Manifests<br/>phase-gate.json per project<br/>machine.json per machine"]
    T <--> DOC[("Central Documentation on disk<br/>tasks · phase documents · receipts")]
    T --> GIT["git, read-only<br/>a single door, no locks"]
    T --> ST["Local state<br/>active-task pointers · open sessions"]

    subgraph STU["Studio: mcp-phase-gate ui (separate process)"]
        H["HTTP API + SSE<br/>on 127.0.0.1, token and cookie"]
    end
    BR["Browser"] <--> H
    H --> DOC
    H --> GIT
    H --> ST
    H -. "preview, then Apply: configuration only" .-> MF
    STU -- "ui --export-static" --> PG["GitHub Pages<br/>static demo, es and en"]
```

- **The server** talks to the client over stdio and keeps almost no state of its own (one active-task pointer per project): the phase of a task is deduced from which documents exist on disk, the prompt is assembled from its layers on every call, and git is queried through one read-only door that takes no locks and runs nothing a repo brings along.
- **The Central Documentation** is a plain folder you own (synced or not). The server only writes inside task folders, and phase 4's receipts only through `record_batch`.
- **The Studio** is a separate process, loaded only by `ui`: a local HTTP API with live events (SSE) over the same functions the tools use. It never writes task documents or receipts. `--export-static` turns it into the read-only site published on GitHub Pages.

Every design choice is recorded with its reason and the alternative it discarded in [`docs/decisiones.md`](docs/decisiones.md), the **architecture decision record**, newest first (in Spanish).

## Development (if you change the code)

> **Note:** this applies to **code** changes only. If all you edited was a prompt under `prompts/<language>/*.md` or a preset, there is **nothing to build and nothing to restart** — they're read on every call.

The source lives in `src/`, split by responsibility:

| File | What it handles |
|------|-----------------|
| `config.ts` | Environment variables and their aliases, reading `.env` and the paths and language of `machine.json`, where state and configuration live, server identity |
| `paths.ts` | How every path is built, and the check that it stays inside its base |
| `phases.ts` | Discovering the phases and reading their files |
| `capas.ts` | The layers, a project's effective configuration (language, preset and rules) and the assembly of each prompt |
| `bloques.ts` | Reading blocks and applying them to slots |
| `vocabulario.ts` | The only place with the texts the code looks for or writes in a fixed form (headings, receipt keys, document names, markers, slot aliases), in Spanish and English |
| `i18n/` | The server's messages in both languages: one catalog per group of modules in `i18n/textos/`, joined by `mensajes.ts` |
| `manifiesto.ts` | `phase-gate.json`, a project's language, the available presets and the published JSON Schemas |
| `maquina.ts` | The shape of `machine.json`, so that the server, `doctor` and Settings agree on what "broken" means |
| `ajustes/` | What Settings writes: the plans for a machine's and a project's configuration, with their preview, before the Studio applies them |
| `roots.ts` | The project worked out from the client's open folders |
| `git.ts` | The single door to git, read-only for the server (its one write is the Studio demo's, in its own temporary repos) |
| `repos.ts` | Reading files and git state from a project's repos |
| `recibos.ts` | Batch receipts as data: reading them, writing them and their file name |
| `anclas.ts` | Batch anchors: the commit on the branch, an artifact's sha256, and re-checking them |
| `lotes.ts` | `record_batch` and `get_batch_status`: recording each batch, the phase 4 document and the commits for phase 5 |
| `tasks.ts` | Which tasks exist, which phase each is on, which one is active, the gate and inherited pending items |
| `schemas.ts` | Each tool's arguments, with their description and error message |
| `servidor.ts` | The server's tools. It computes nothing: it translates between the protocol and the above |
| `recursos.ts` | The `phase-gate://` resources |
| `prompts-mcp.ts` | The `/f1`…`/fN` commands as MCP Prompts |
| `confirmacion.ts` | Direct confirmations to the user (elicitation) |
| `diagnostico.ts` | The X-ray shared by `doctor`, `get_orchestrator_status` and `phase-gate://estado` |
| `cli.ts` | The command line: `doctor`, `init`, `eject`, `ui`, `--help`, `--version` |
| `init.ts` | `init`: registering the server in the clients, copying the commands and migrating |
| `eject.ts` | `eject`: copying a prompt, a slot, a command or a preset into a layer of your own |
| `log.ts` | Logging: stderr and, with a client connected, MCP notifications |
| `sesiones.ts` | The record of open MCP sessions and their project, which the Studio reads |
| `studio/` | The Studio's backend, loaded only by `ui`: the local HTTP server and its security, the read API, live events, writes with preview and fingerprint, the demo and the static export |
| `index.ts` | The entry point: the command line, or the server over stdio |

The client runs the compiled `build/index.js`, so after any change:

```bash
npm run build
```

Then restart the MCP server in your client so it picks up the new version.

Available scripts:
- `npm run build` → compiles TypeScript into `build/`, copies the demo's texts, and builds the Studio's frontend (`studio/`, Vite and Preact) into `studio/dist/`, checking its size budget.
- `npm test` → compiles the tests and runs them with Node's test runner (needs **Node 22+**).
- `npm start` → runs the compiled server.
- `npm run dev` → recompiles into `build/` on every change (`tsc --watch`).
- `npm run test:e2e` → the Studio's end-to-end tests in a headless Chromium (Playwright), after `npm run build`. The browser goes inside `node_modules`: `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`.

Tests live in `test/` and need no extra dependency: they use `node:test`, which ships with
Node. The Studio's end-to-end tests live in `studio/e2e/`. They build a throwaway central-documentation tree in a temp folder, so they never touch
yours. CI runs them on every PR.

The site's media (the GIF, video and poster of the READMEs, and the three screenshots of the landing page) are not in git: `scripts/capturas-studio.mjs` and `scripts/medios.mjs` generate them from the real demo in the GitHub Pages workflow on every version tag, in both languages, and they are published at `https://montse2308.github.io/mcp-phase-gate/medios/`.

### Where everything is

| What you're looking for | Where |
|-------------------------|-------|
| What the project does today | The two READMEs ([`README.md`](README.md) and its Spanish twin, [`README.es.md`](README.es.md)) and the guides in [`docs/guide/`](docs/guide) and [`docs/guia/`](docs/guia) — **change one, change its twin** |
| Why it's designed this way | [`docs/decisiones.md`](docs/decisiones.md), the architecture decision record (Spanish) |
| How it was built, and what was measured | [`docs/case-study.md`](docs/case-study.md) (in Spanish: [`docs/caso-de-estudio.md`](docs/caso-de-estudio.md)) |
| The fixed terms in both languages | [`docs/glosario.md`](docs/glosario.md) |
| The `/f1`–`/f5` commands | Their text in [`prompts/en/commands/`](prompts/en/commands) and [`prompts/es/comandos/`](prompts/es/comandos); how they reach each client in [`docs/phase-commands.md`](docs/phase-commands.md) |
| The presets and the schemas | [`presets/en/`](presets/en), [`presets/es/`](presets/es) and [`schema/`](schema). The schemas are generated from the zod shapes: `npm run build && node scripts/generar-esquemas.mjs` |
| What changed in each version | The [Releases](https://github.com/Montse2308/mcp-phase-gate/releases) on GitHub; their drafts are in [`docs/notas/`](docs/notas) |
| The version 3 plan | [`docs/plan-maestro-v3.md`](docs/plan-maestro-v3.md) (Spanish) |
| That a change broke nothing | [`test/`](test), via `npm test`. CI runs them on every PR |
| What's still missing | [Issues](https://github.com/Montse2308/mcp-phase-gate/issues) — grouped under the `v1-uso-propio` and `v2-publico` labels |
| What's already been done | The commit history and merged PRs |


## Before you open a pull request

- `npm run build` and `npm test` pass. If you touched the Studio, the scripts or the end-to-end tests, `npm run test:e2e` passes too. CI runs the tests on Linux, Windows and macOS, and once more against git 2.43.
- A change that someone sees (what the project does, how to install it, a setting) goes in both READMEs and in both guides, in English and in Spanish.
- A design decision goes in [`docs/decisiones.md`](docs/decisiones.md): what was decided, why, and what was discarded. If it reverses an earlier one, you add a new entry and mark the old one; nothing is deleted.
- Commits are small and follow the repository's style: `type(scope): what changes`, in Spanish (see `git log`).
- New comments in `src/` are written in English; in the Studio, the tests, the scripts and the docs, in Spanish.

---

# Español

Gracias por mirar el código. Esta página dice cómo está organizado el repositorio, cómo compilarlo y probarlo, y qué revisar antes de abrir un pull request. *In English: [Contributing](#contributing).*

## Arquitectura

```mermaid
flowchart LR
    CL["Cliente MCP<br/>Claude Code · Cursor · VS Code"]
    subgraph SRV["Servidor MCP (stdio)"]
        T["13 tools · 5 recursos<br/>/f1 … /f5 como MCP Prompts"]
    end
    CL <-- "stdio" --> T
    T --> P["Capas de prompts<br/>fábrica prompts/es · prompts/en<br/>preset · reglas · global · proyecto"]
    T --> MF["Manifiestos<br/>phase-gate.json por proyecto<br/>machine.json por equipo"]
    T <--> DOC[("Documentación Central en disco<br/>tareas · documentos de fase · recibos")]
    T --> GIT["git, de solo lectura<br/>una sola puerta, sin locks"]
    T --> ST["Estado local<br/>punteros de tarea activa · sesiones abiertas"]

    subgraph STU["Studio: mcp-phase-gate ui (proceso aparte)"]
        H["API HTTP + SSE<br/>en 127.0.0.1, token y cookie"]
    end
    BR["Navegador"] <--> H
    H --> DOC
    H --> GIT
    H --> ST
    H -. "vista previa y Aplicar: solo configuración" .-> MF
    STU -- "ui --export-static" --> PG["GitHub Pages<br/>demo estática, es y en"]
```

- **El servidor** habla con el cliente por stdio y casi no guarda estado propio (un puntero de tarea activa por proyecto): la fase de una tarea se deduce de qué documentos hay en disco, el prompt se arma con sus capas en cada llamada, y a git se le pregunta por una sola puerta de solo lectura que no toma locks ni ejecuta nada que traiga el repo.
- **La Documentación Central** es una carpeta tuya, sincronizada o no. El servidor solo escribe dentro de las carpetas de tarea, y los recibos de la Fase 4 solo con `record_batch`.
- **El Studio** es un proceso aparte, que solo carga `ui`: una API HTTP local con eventos en vivo (SSE) sobre las mismas funciones que usan las tools. Nunca escribe documentos de tareas ni recibos. `--export-static` lo convierte en el sitio de solo lectura que se publica en GitHub Pages.

Cada decisión de diseño está registrada, con su porqué y la alternativa que descartó, en [`docs/decisiones.md`](docs/decisiones.md), el **registro de decisiones de arquitectura**, la más reciente arriba.

## Desarrollo (si modificas el código)

> **Ojo:** esto aplica solo a cambios en el **código**. Si lo único que tocaste fue
> un prompt de `prompts/<idioma>/*.md` o un preset, **no hace falta compilar ni reiniciar nada** — se leen
> en cada llamada.

El código fuente está en `src/`, repartido por responsabilidad:

| Archivo | De qué se encarga |
|---------|-------------------|
| `config.ts` | Variables del entorno y su alias, lectura del `.env` y de las rutas y el idioma de `machine.json`, dónde viven el estado y la configuración, identidad del servidor |
| `paths.ts` | Cómo se arma cada ruta y la comprobación de que no se salga de su base |
| `phases.ts` | Descubrir las fases y leer sus archivos |
| `capas.ts` | Las capas, la configuración efectiva de un proyecto (idioma, preset y reglas) y el ensamblado de cada prompt |
| `bloques.ts` | Leer los bloques y aplicarlos sobre las ranuras |
| `vocabulario.ts` | El único lugar con los textos que el código busca o escribe con una forma fija (encabezados, claves de los recibos, nombres de documento, marcadores, alias de ranura), en español y en inglés |
| `i18n/` | Los mensajes del servidor en los dos idiomas: un catálogo por grupo de módulos en `i18n/textos/`, que junta `mensajes.ts` |
| `manifiesto.ts` | `phase-gate.json`, el idioma de un proyecto, los presets disponibles y los JSON Schema publicados |
| `maquina.ts` | El shape de `machine.json`, para que el servidor, `doctor` y Ajustes entiendan lo mismo por «roto» |
| `ajustes/` | Lo que escribe Ajustes: los planes de la configuración de un equipo y de un proyecto, con su vista previa, antes de que el Studio los aplique |
| `roots.ts` | El proyecto deducido de las carpetas abiertas en el cliente |
| `git.ts` | La única puerta a git, de solo lectura para el servidor (su única escritura es la de la demo del Studio, en sus propios repos temporales) |
| `repos.ts` | Leer archivos y estado de git de los repos de un proyecto |
| `recibos.ts` | Los recibos de lote como datos: leerlos, escribirlos y su nombre de archivo |
| `anclas.ts` | Las anclas de los lotes: el commit en la rama, el sha256 de un artefacto, y reverificarlas |
| `lotes.ts` | `record_batch` y `get_batch_status`: registrar cada lote, el documento de la Fase 4 y los commits para la Fase 5 |
| `tasks.ts` | Qué tareas existen, en qué fase va cada una, cuál está activa, la compuerta y los pendientes heredados |
| `schemas.ts` | Los argumentos de cada tool, con su descripción y su mensaje de error |
| `servidor.ts` | Las tools del servidor. No calcula nada: traduce entre el protocolo y lo anterior |
| `recursos.ts` | Los recursos `phase-gate://` |
| `prompts-mcp.ts` | Los comandos `/f1`…`/fN` como MCP Prompts |
| `confirmacion.ts` | Las confirmaciones directas al usuario (elicitation) |
| `diagnostico.ts` | La radiografía que comparten `doctor`, `get_orchestrator_status` y `phase-gate://estado` |
| `cli.ts` | La línea de comandos: `doctor`, `init`, `eject`, `ui`, `--help`, `--version` |
| `init.ts` | `init`: registrar el servidor en los clientes, copiar los comandos y migrar |
| `eject.ts` | `eject`: copiar un prompt, una ranura, un comando o un preset a una capa propia |
| `log.ts` | El log: stderr y, con un cliente conectado, notificaciones MCP |
| `sesiones.ts` | El registro de las sesiones MCP abiertas y su proyecto, que lee el Studio |
| `studio/` | El backend del Studio, que solo carga `ui`: el servidor HTTP local y su seguridad, la API de lectura, los eventos en vivo, las escrituras con vista previa y huella, la demo y el export estático |
| `index.ts` | El punto de entrada: la línea de comandos, o el servidor por stdio |

El cliente ejecuta la versión compilada `build/index.js`, así que después de cualquier cambio:

```bash
npm run build
```

Y luego reinicia el MCP en tu cliente para que cargue la nueva versión.

Scripts disponibles:
- `npm run build` → compila TypeScript a `build/`, copia los textos de la demo y compila el frontend del Studio (`studio/`, Vite y Preact) a `studio/dist/`, comprobando su presupuesto de tamaño.
- `npm test` → compila los tests y los corre con el runner de Node (necesita **Node 22 o superior**).
- `npm start` → ejecuta el servidor compilado.
- `npm run dev` → recompila a `build/` con cada cambio (`tsc --watch`).
- `npm run test:e2e` → las pruebas de extremo a extremo del Studio en un Chromium sin ventana (Playwright), después de `npm run build`. El navegador va dentro de `node_modules`: `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium`.

Los tests viven en `test/` y no necesitan ninguna dependencia extra: usan `node:test`, que
viene con Node. Las pruebas de extremo a extremo del Studio viven en `studio/e2e/`. Montan una Documentación Central de mentira en una carpeta temporal, así que
no tocan la tuya. El CI los corre en cada PR.

Los medios del sitio (el GIF, el video y el póster de los README, y las tres capturas de la portada) no están en git: `scripts/capturas-studio.mjs` y `scripts/medios.mjs` los generan desde la demo real en el workflow de GitHub Pages con cada tag de versión, en los dos idiomas, y se publican en `https://montse2308.github.io/mcp-phase-gate/medios/`.

### Dónde está cada cosa

| Qué buscas | Dónde |
|------------|-------|
| Lo que el proyecto hace hoy | Los dos README ([`README.md`](README.md), el principal, en inglés, y su gemelo en español, [`README.es.md`](README.es.md)) y las guías de [`docs/guide/`](docs/guide) y [`docs/guia/`](docs/guia) — **si cambias uno, cambia su gemelo** |
| Por qué está diseñado así | [`docs/decisiones.md`](docs/decisiones.md), el registro de decisiones de arquitectura |
| Cómo se construyó, y qué se midió | [`docs/caso-de-estudio.md`](docs/caso-de-estudio.md) (en inglés: [`docs/case-study.md`](docs/case-study.md)) |
| Los términos fijos en los dos idiomas | [`docs/glosario.md`](docs/glosario.md) |
| Los comandos `/f1`–`/f5` | Su texto en [`prompts/es/comandos/`](prompts/es/comandos) y [`prompts/en/commands/`](prompts/en/commands); cómo llegan a cada cliente en [`docs/comandos-de-fase.md`](docs/comandos-de-fase.md) |
| Los presets y los esquemas | [`presets/es/`](presets/es), [`presets/en/`](presets/en) y [`schema/`](schema). Los esquemas se generan de los shapes zod: `npm run build && node scripts/generar-esquemas.mjs` |
| Qué cambió en cada versión | Los [Releases](https://github.com/Montse2308/mcp-phase-gate/releases) de GitHub; sus borradores están en [`docs/notas/`](docs/notas) |
| El plan de la versión 3 | [`docs/plan-maestro-v3.md`](docs/plan-maestro-v3.md) |
| Que un cambio no rompió nada | [`test/`](test), con `npm test`. El CI los corre en cada PR |
| Lo que falta por hacer | [Issues](https://github.com/Montse2308/mcp-phase-gate/issues) — agrupados con las labels `v1-uso-propio` y `v2-publico` |
| Lo que ya se hizo | El historial de commits y los PRs mergeados |


## Antes de abrir un pull request

- `npm run build` y `npm test` pasan. Si tocaste el Studio, los scripts o las pruebas de extremo a extremo, `npm run test:e2e` también. El CI corre las pruebas en Linux, Windows y macOS, y una vez más con git 2.43.
- Un cambio que alguien ve (lo que hace el proyecto, cómo se instala, un ajuste) va en los dos README y en las dos guías, en inglés y en español.
- Una decisión de diseño va en [`docs/decisiones.md`](docs/decisiones.md): qué se decidió, por qué y qué se descartó. Si revierte una anterior, se agrega una entrada nueva y se marca la vieja; nada se borra.
- Los commits son chicos y siguen el estilo del repositorio: `tipo(ámbito): qué cambia`, en español (mira `git log`).
- Los comentarios nuevos de `src/` se escriben en inglés; en el Studio, las pruebas, los scripts y la documentación, en español.
