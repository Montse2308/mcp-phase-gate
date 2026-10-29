# El Studio

```bash
npx mcp-phase-gate ui
```

Abre una aplicación web local con lo que ve el servidor, armada con las mismas funciones que usan las tools, y en vivo: un documento o un recibo nuevo aparece sin recargar. Si todavía no hay una Documentación configurada, abre **Ajustes › Este equipo** y te pregunta dónde está la tuya. Para mirar antes, `npx mcp-phase-gate ui --demo` lo abre sobre datos de ejemplo ([opciones](#opciones)).

## Las seis vistas

| Vista | Qué enseña |
|---|---|
| **Red** | Una fila por proyecto, que se despliega: su preset (y un aviso si el manifiesto es inválido), sus repos con rama y cambios pendientes, la tarea activa con su fase y qué cliente MCP lo tiene abierto ahora mismo; al desplegarla, el manifiesto y las reglas. El preset y el manifiesto se cambian en Ajustes: la fila enlaza a él |
| **Tablero** | Las fases de una tarea como seis tarjetas (cerrada, en curso, con pendientes, hueco, pendiente), y los lotes de la Fase 4 como una tabla: verificado (su commit está en la rama), sellado (sha256), con pendientes, commit pendiente, no vigente (el ancla ya no coincide), rechazado, descartado, manual, nota y sin recibo, cada uno con su detalle, su ancla y su recibo. Un clic abre el documento o el recibo |
| **Taller** | El prompt que recibe cada fase, ranura por ranura: qué capa y qué `archivo:línea` ganó, el diff frente al texto de fábrica y `eject` para editarlo. Las reglas del proyecto se leen ahí, y se cambian en Ajustes |
| **Vigía** | Los hallazgos de `doctor` con cómo se arregla cada uno |
| **Bitácora** | La línea de tiempo de la tarea: documentos, recibos, commits con su asunto, reanclajes y el cierre de la Fase 4 |
| **Ajustes** | Todo lo que se puede configurar, en un solo sitio ([abajo](#ajustes)) |

![La vista Red: una fila por proyecto, con su preset, sus repos, su tarea activa y su sesión MCP](https://montse2308.github.io/mcp-phase-gate/medios/captura-red-es.webp)

![El Tablero de una tarea terminada: sus seis fases y sus lotes con su estado, su ancla y su recibo](https://montse2308.github.io/mcp-phase-gate/medios/captura-tablero-es.webp)

![Ajustes, en la página de un proyecto: su preset, su política de commits y sus repos](https://montse2308.github.io/mcp-phase-gate/medios/captura-ajustes-es.webp)

## Ajustes

Un menú a la izquierda (un selector arriba en un teléfono) y una página para cada cosa: **Este equipo**, una para **cada proyecto**, **Clientes MCP**, **Studio** y **Avanzado**. Lo que edita cada página está en [Configuración](configuracion.md#primero-ajustes). Es el único lugar donde el Studio edita configuración: el preset, las reglas y los clientes que vivían en la Red, el Taller y el Vigía se mudaron aquí, y esas vistas enlazan a él. `eject` se queda en el Taller, porque es de prompts.

- **Varios campos, un diff por archivo.** Cambias lo que necesitas, cada campo cambiado dice «Cambiado, sin aplicar», el menú cuenta los cambios sin aplicar de cada página, y al pie hay un diff por archivo y un solo **Aplicar** o **Descartar**. Salir de una página con borrador, o cerrar la pestaña, pide confirmación.
- **Si el disco cambia mientras editas.** Si el archivo cambia en el disco mientras hay un borrador, la página lo dice y vuelve a pedir el plan. Si lo que cambió es un campo que también está en tu borrador, ese campo queda en conflicto y eliges entre el tuyo y el del disco, en vez de que uno pise al otro en silencio.
- **La página de un proyecto escribe dos archivos.** Al agregar o cambiar un repo, su ruta propia en esta computadora se escribe en `machine.json` desde la misma página, con dos diffs («Viaja con la Documentación» y «Solo esta computadora») y un solo Aplicar. `machine.json` se escribe primero. El id de un repo no se renombra: se quita y se agrega, y la página avisa si algún recibo lo cita.
- **La página Studio no escribe en el disco.** El tema y el idioma de la interfaz se aplican al momento y los recuerda el navegador.
- **Avanzado muestra, no edita.** Las variables de las carpetas de prompts, del estado y de la configuración, y de las confirmaciones, con su valor, de dónde sale y cómo cambiarlas.

## Solo escribe configuración

El Studio escribe `machine.json`, el `phase-gate.json` de un proyecto (también crea uno), los archivos que copia `eject` y el registro del servidor en un cliente, y siempre en dos pasos: una vista previa con el diff, y **Aplicar**, que solo escribe si el disco no cambió desde que lo viste. Si cambió, te enseña un conflicto y tu borrador se queda. Nunca escribe documentos de tareas, recibos ni nada de tus repos.

## Aspecto, tema e idioma

El tema sigue al de tu sistema, claro u oscuro, hasta que elijas: el botón de la barra de arriba y **Ajustes › Studio** (Sistema, Claro u Oscuro) lo cambian, y el navegador recuerda tu elección. Funciona con el teclado y en el teléfono, y nunca expresa un estado solo con color: cada estado tiene su propia forma y su texto. La interfaz está en español o en inglés, con el selector ES / EN de la barra de arriba o `#?lang=es` en el enlace ([ver Idiomas](configuracion.md#idiomas)).

## Seguridad

Solo escucha en `127.0.0.1`, en un puerto al azar. El enlace que imprime lleva un token de un solo uso, que se canjea por una cookie `HttpOnly` y `SameSite=Strict`; cada petición comprueba `Host` y `Origin`, las escrituras exigen una cabecera más, y la página tiene una CSP estricta. El Markdown de los documentos se sanea antes de enseñarlo. El servidor MCP no carga nada de esto.

## Opciones

| Opción | Qué hace |
|---|---|
| `--puerto <n>` | Un puerto fijo en vez de uno al azar |
| `--no-abrir` | No abre el navegador: solo imprime el enlace |
| `--demo` | Sobre una demo con datos de ejemplo, en una carpeta temporal: tres proyectos (multi-repo, un agente de IA y uno de investigación) con commits de git de verdad. No toca tu Documentación ni tu configuración: Ajustes funciona sobre la carpeta temporal de la demo |
| `--idioma es\|en` | Con `--demo`: el idioma de la demo (`TIENDA`, `ASISTENTE`, `INVESTIGACION` en español; `SHOP`, `ASSISTANT`, `RESEARCH` en inglés). Sin él, decide `PHASE_GATE_LANG` o el del sistema |
| `--export-static <dir>` | No arranca nada: escribe en `<dir>` (nueva o vacía) un sitio estático de solo lectura con la demo, siempre en los dos idiomas (`datos/es/` y `datos/en/`); el sitio cambia de demo al cambiar el idioma de la interfaz. Ajustes se ve ahí de solo lectura. Es lo que se publica en GitHub Pages, bajo `demo/` |
| `--incluir-datos-reales` | Con `--export-static`: tu Documentación en vez de la demo. Pide que escribas `exportar` (o `--yes`), y sustituye las rutas de este equipo por `<Documentación>`, `<repos>`, `~`… Las páginas de Ajustes que enseñan rutas dicen «No disponible en una exportación» |
