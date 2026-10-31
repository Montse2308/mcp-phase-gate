# mcp-phase-gate

Un servidor MCP que convierte a cualquier agente de IA que programa en un flujo de ingeniería con compuertas, auditable y lote por lote.

*Este es el README en español · El principal, en inglés: [README.md](https://github.com/Montse2308/mcp-phase-gate/blob/master/README.md).*

<p align="center">
  <a href="https://montse2308.github.io/mcp-phase-gate/medios/demo-es.mp4"><img src="https://montse2308.github.io/mcp-phase-gate/medios/demo-es.gif" alt="La demo, de unos 40 segundos: doctor en una terminal; después el Studio: la red de proyectos, el tablero de una tarea terminada con sus sellos, un lote pendiente que pasa a VERIFICADO en vivo al registrar su commit, la política de commits de un proyecto que cambia en Ajustes con su diff, el Taller y el sitio publicado en un teléfono" width="760"></a>
</p>

[![CI](https://github.com/Montse2308/mcp-phase-gate/actions/workflows/ci.yml/badge.svg)](https://github.com/Montse2308/mcp-phase-gate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-phase-gate)](https://www.npmjs.com/package/mcp-phase-gate)
[![npm provenance](https://img.shields.io/badge/npm-provenance-blue)](https://www.npmjs.com/package/mcp-phase-gate#provenance)
[![Licencia: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/Montse2308/mcp-phase-gate/blob/master/LICENSE)
[![Demo en vivo](https://img.shields.io/badge/live%20demo-GitHub%20Pages-blue)](https://montse2308.github.io/mcp-phase-gate/demo/)

**El problema:** un agente de IA que programa se lanza directo al código, toma decisiones que nadie le pidió y su razonamiento muere con el chat.<br>
**La solución:** cinco fases con una compuerta entre ellas, y cada una deja un documento en disco; en la Fase 4 es el propio servidor quien escribe el recibo de cada lote, después de comprobar el commit contra git.<br>
**Velo:** la [demo en vivo](https://montse2308.github.io/mcp-phase-gate/demo/) es el Studio con datos de ejemplo, de solo lectura, en español y en inglés; cuelga del [sitio del proyecto](https://montse2308.github.io/mcp-phase-gate/es/).

## Pruébalo en 10 segundos

```bash
npx mcp-phase-gate ui --demo
```

Abre el Studio en tu navegador sobre una demo que se genera en una carpeta temporal (tres proyectos, commits de git de verdad); no toca tu Documentación. `--idioma es` o `--idioma en` elige el idioma de la demo; sin él, decide `PHASE_GATE_LANG` o el del sistema.

---

Un servidor MCP (Model Context Protocol) que parte cada requerimiento en **cinco fases con compuerta** y obliga a que cada una deje su documento antes de pasar a la siguiente. En el panel de tu cliente se identifica como `mcp-phase-gate`.

## Cómo funciona

Le pides a un asistente de IA que implemente un requerimiento y se lanza a escribir código. Rompe algo que no había leído, toma en silencio decisiones que nunca te consultó, y cuando cambias de chat, o te sientas en la otra computadora, el razonamiento entero se perdió: vivía en la conversación, y **la conversación no viaja**.

Aquí el asistente no toca código hasta la Fase 4. Para entonces ya diagnosticó leyendo el repositorio, te preguntó lo que no podía decidir solo, y escribió un plan contrastado contra el código real. Cada fase deja un documento en una carpeta central, así que lo que se pensó sobrevive al chat y al dispositivo.

Se parte de un requerimiento (un correo, un ticket) y se pasa por cinco fases, en este orden, y cada una deja su documento:

1. **Descubrimiento** lee el código y diagnostica. Deja `01 · Análisis Técnico`.
2. **Decisiones** pregunta, valida, y se detiene. Deja `02 · Decisiones`.
3. **Plan Técnico** baja lo decidido a código exacto. Deja `03 · Plan Técnico`.
4. **Ejecución** implementa y verifica ejecutando. Deja `04 · Ejecución`.
5. **Auditoría** revisa como un revisor externo. Deja `05 · Auditoría`, y su salida es la descripción del PR, también en el chat.

**La parada obligatoria está en la Fase 2**: ahí se detiene y no avanza hasta que respondas, y lo que decidas queda escrito con su fundamento. Entre una fase y otra hay una **compuerta**, que es lo que le da el nombre al servidor: si pides una fase saltándote la anterior, el servidor lo detecta y avisa ([más](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/herramientas.md#la-compuerta-saltarse-una-fase-deja-de-ser-invisible)).

En la Fase 4 la IA hace el commit de cada lote solo con tu OK (la política por defecto; un proyecto puede elegir otra) y nunca hace push ni abre el PR, en ninguna política. El recibo de cada lote lo escribe el servidor, que comprueba contra git que su commit existe y está en la rama ([cómo](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/herramientas.md#la-fase-4-con-el-servidor-record_batch)). En la Fase 5 solo lee. El flujo se adapta al tipo de trabajo con **presets** (código con o sin pruebas, varios repositorios, el mantenimiento de un agente de IA, una investigación), y todo funciona en **español y en inglés**.

## Para quién es

Para quien trabaja sobre **código que ya existe y no se puede romper**, y necesita que quede constancia de por qué se hizo cada cosa. Encaja especialmente si trabajas desde más de un equipo, o si te toca justificar decisiones semanas después. No es para prototipos desechables ni para arrancar un proyecto de cero: cinco fases para cambiar un color es una ceremonia absurda. Habla MCP estándar, así que funciona en cualquier cliente compatible, y está **probado en Cursor, VS Code y Claude Code**.

## Arquitectura

El servidor habla con el cliente por stdio y casi no guarda estado propio: la fase de una tarea se deduce de los documentos que hay en disco, el prompt se arma con sus capas en cada llamada, y a git se le pregunta por una sola puerta de solo lectura. La Documentación Central es una carpeta tuya, sincronizada o no; el servidor solo escribe dentro de las carpetas de tarea, y los recibos solo con `record_batch`. El Studio es un proceso aparte, que solo carga `ui`, con una API HTTP local y eventos en vivo sobre las mismas funciones que usan las tools. Cada decisión de diseño está registrada con su porqué en [`docs/decisiones.md`](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/decisiones.md), y el [diagrama está en CONTRIBUTING](https://github.com/Montse2308/mcp-phase-gate/blob/master/CONTRIBUTING.md#arquitectura).

## Instalación

Necesitas **Node.js 22 o superior** (el CI prueba Linux y Windows con Node 22 y 24, y macOS con Node 22), una carpeta para tu documentación y un cliente MCP: Cursor, VS Code o Claude Code.

```bash
npx mcp-phase-gate init --docs "C:\Users\TU_USUARIO\Documentos\DOCUMENTACIÓN" --repos "C:\proyectos"
```

`init` registra el servidor en los clientes que encuentre en tu equipo y guarda tus rutas en `machine.json`; después, `npx mcp-phase-gate doctor` revisa la instalación. ¿Prefieres el navegador? Registra el servidor sin rutas y ejecuta `npx mcp-phase-gate ui`: su primera pantalla te pregunta dónde está tu Documentación. Los dos caminos, a mano y desde el código, están en la [guía de instalación](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/instalacion.md).

## El Studio

`npx mcp-phase-gate ui` abre una aplicación web local con lo que ve el servidor, en vivo: **Red** (proyectos, repos y tareas activas), **Tablero** (las fases de una tarea y sus lotes con sus recibos), **Taller** (el prompt que recibe cada fase, ranura por ranura), **Vigía** (los hallazgos de `doctor`), **Bitácora** (la línea de tiempo de una tarea) y **Ajustes**, donde cambias toda la configuración con una vista previa, un diff y un solo Aplicar. Solo escribe configuración, nunca tus documentos ni tus repos, y solo escucha en `127.0.0.1`. La [demo en vivo](https://montse2308.github.io/mcp-phase-gate/demo/) lo enseña con datos de ejemplo; más en la [guía del Studio](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/studio.md).

## Qué cambia si actualizas de la 3.x

La 4.0 cambia lo que ves y lo que tocas, no el motor: las 13 tools, los prompts, los presets y los formatos en disco son los mismos. Lo que sí cambia:

- **Las rutas de tu equipo pasaron a `machine.json`**, ya versión 2. `init` y Ajustes las escriben ahí y las quitan del `env` de tu cliente. La 3.x no lee la versión 2: [cómo volver atrás](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/notas/v4.0.0.md#volver-a-la-3x).
- **El entorno siempre gana.** Un valor en el `env` de un cliente sigue ganando a `machine.json`, y ahora eso incluye el idioma: `PHASE_GATE_LANG` gana al idioma por defecto de `machine.json`, que antes le ganaba.
- **Ajustes es el único lugar donde se edita la configuración.** El preset, las reglas, los clientes MCP y las variables avanzadas se mudaron ahí desde la Red, el Taller y el Vigía.
- **El Studio tiene una sola estructura por vista, y el tema sigue al de tu sistema.** La vieja elección entre dos modos de pantalla se fue, y tu elección guardada no se migra.
- **El sitio cambió:** la demo vive en `/demo/` y la raíz es una portada. Los enlaces viejos con hash siguen abriendo la demo en su vista.

Todo, con los pasos, en las [notas de la 4.0.0](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/notas/v4.0.0.md).

## Guías

- [Instalación](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/instalacion.md): los dos caminos, `init`, revisar con `doctor`, cómo se organiza la Documentación y los comandos `/f1`–`/f5`.
- [Configuración](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/configuracion.md): Ajustes, quién gana, `machine.json`, `phase-gate.json`, presets, política de commits, idiomas y variables de entorno.
- [El Studio](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/studio.md): las seis vistas, Ajustes, seguridad y opciones.
- [Herramientas y recursos](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/herramientas.md): la compuerta, `record_batch`, los documentos protegidos, las 13 tools, los recursos y el contrato de la descripción del PR.
- [Prompts y capas](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guia/prompts.md): tus propios prompts, bloques y `eject`.

Para contribuir, mira [CONTRIBUTING](https://github.com/Montse2308/mcp-phase-gate/blob/master/CONTRIBUTING.md). El caso de estudio está en [`docs/caso-de-estudio.md`](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/caso-de-estudio.md), los términos fijos en [`docs/glosario.md`](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/glosario.md), y los issues están [abiertos en GitHub](https://github.com/Montse2308/mcp-phase-gate/issues).

## Licencia

[MIT](https://github.com/Montse2308/mcp-phase-gate/blob/master/LICENSE).
