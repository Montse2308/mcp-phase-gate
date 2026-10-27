# Decisiones

Registro de las decisiones de diseño del orquestador: qué se decidió, por qué, y qué
se descartó. El objetivo es no tener que reconstruir el razonamiento meses después,
cuando ya nadie se acuerda de por qué algo quedó así.

Lo que **no** va aquí: el historial de cambios (eso son los commits y los PRs) ni el
plan de lo que falta (eso son los [issues](https://github.com/Montse2308/mcp-phase-gate/issues)).

Formato: una entrada por decisión, la más reciente arriba. Si una decisión se revierte,
no se borra — se agrega una entrada nueva que la reemplaza y se marca la vieja.

---

## 2026-10-27 — El Studio adopta la dirección visual sobria: Inter y JetBrains Mono, un acento azul, un fondo gris, pizarra azulada en oscuro y un indicador para cada estado

> **Reemplaza en parte** la §7.2 de `docs/plan-maestro-v3.md`, solo en la tipografía: las tres familias (Big
> Shoulders Display, Atkinson Hyperlegible e IBM Plex Mono) quedan superadas por Inter y JetBrains Mono. Lo demás
> de esa sección sigue vigente: las fuentes van autoalojadas en `studio/public/fuentes/`, con licencia OFL, y el
> Studio no pide nada fuera de `127.0.0.1`. La entrada anterior (el modo Cabina que se elimina y los sellos SVG,
> ya marcados allí) solo se cita: esta no decide nada sobre la estructura.

**Decisión.** Es solo capa visual: CSS, fuentes y un componente de estado. Ningún dato, texto ni comportamiento
cambia, y la estructura de cada vista es la misma que antes (una prueba compara el árbol de accesibilidad de
cada vista con el de antes).

- **Dirección sobria.** Fondo claro gris `#f3f5f7`, superficies blancas, bordes de 1 px, sin sombras, radios de
  6 px en los controles, 8 en las tarjetas y 10 en los contenedores. El acento es azul: `#1d4ed8` en claro y
  `#93c5fd` en oscuro.
- **Tema oscuro pizarra azulada**, con fondo `#0b0d10`, de la misma temperatura que el gris claro.
- **Los colores tienen nombre de función, no de metáfora** (`fondo`, `superficie`, `superficie-2`, `borde`,
  `borde-control`, `texto`, `texto-2`, `acento`, `acento-suave`, `sobre-acento`, `banda`, `texto-banda`, `verde`,
  `ámbar`, `rojo`, `violeta` y `apagado`), una vez en cada tema. `test/studio-tokens.test.ts` lee las hojas y
  comprueba que toda variable usada está definida, que los dos bloques del oscuro dicen lo mismo, que el texto
  llega a 4.5:1 sobre sus fondos y que el acento y el borde de los controles llegan a 3:1. El verde, el ámbar y
  el apagado del tema claro son algo más oscuros que en los bocetos: con los de los bocetos, el ámbar daba 4.15:1
  sobre `superficie-2`.
- **Inter variable para el texto y JetBrains Mono variable para el código, los SHA y los lotes**, un solo archivo
  `woff2` cada una (48,256 y 40,404 bytes) dentro del paquete, porque la CSP solo admite `font-src 'self'`. Pesan
  menos que Inter 400 y 600 juntas y traen los pesos intermedios.
- **Densidad cómoda.** El cuerpo mide 15 px (`0.9375rem`; la raíz sigue al 100 %), las celdas de las tablas
  11 por 14 px, y ningún texto baja de 12 px: tampoco las cabeceras, las etiquetas ni la insignia. Un test lo mide
  con `getComputedStyle` en cada vista y en los dos temas.
- **Cada estado tiene una forma propia dentro de su vista y siempre va con su texto**: nunca se dice nada solo con
  color. Lo pinta `IndicadorDeEstado`, que es la única tabla de qué forma, qué color y qué insignia lleva cada
  estado. Solo lo que pide atención lleva insignia (el texto en mayúsculas con `text-transform`, con borde del
  color del estado, en JetBrains Mono 600 de 12 px): fase con pendientes y con hueco; lote con pendientes, no
  vigente y rechazado; manifiesto inválido, repo que no existe o con error de git, error de configuración; y
  errores y avisos del Vigía. Dos excepciones: cuando la insignia lleva datos (el mensaje de git de un repo, el
  nombre `phase-gate.json`) no los pasa a mayúsculas, porque una ruta o un nombre en mayúsculas ya no es el que
  es; y en un título (los grupos del Vigía) toma el tamaño y la familia del título, para que los títulos del mismo
  nivel midan lo mismo lleven insignia o no.
- **Los colores de los lotes que cambian:** «commit pendiente» pasa de ámbar a violeta, para no confundirse con el
  acento ni con «con pendientes»; «sellado» pasa de azul a verde, porque el azul es ahora el acento; y «manual» y
  «nota» pasan de morado a apagado: el morado era su único color y ahora los distingue su forma. «Descartado» y
  «sin recibo» siguen en gris, ahora `apagado`.
- **La pestaña activa** lleva fondo `acento-suave`, una raya inferior de 2 px y peso 600: el fondo solo da 1.22:1
  contra la barra, así que no es lo que la distingue.
- **La fase abierta del Tablero** lleva fondo `acento-suave` y borde en el acento, como la pestaña activa, y el
  contorno queda para el foco: antes los dos eran el mismo contorno, y la fase abierta parecía enfocada. Su texto
  (el título, el archivo y el estado en su color) llega a 4.5:1 sobre `acento-suave`, y lo comprueba el test de
  los tokens.
- **`studio/e2e/tema.spec.ts` cambia en tres cosas, ninguna de estructura:** el fondo de cada tema se lee de las
  hojas en vez de ir escrito (cualquier paleta nueva lo cambiaba); los nombres de variables admiten dígitos
  (`--texto-2`, `--superficie-2`); y el Taller espera a que se llene el selector de proyectos antes de fotografiar
  (una carrera que se vio en la CI de Windows y macOS). Las pruebas de estructura y la función que compara no
  cambian.

**Por qué.**

- Una paleta con funciones y no con metáforas se puede comprobar con un test, y una sola estructura de estados
  hace que el mismo estado se vea igual en todas las vistas.
- Inter es legible a 15 px en pantalla, y JetBrains Mono distingue el 0 de la O y el 1 de la l y la I justo donde
  la ambigüedad importa: los SHA y los lotes.
- El oscuro de la misma temperatura que el claro evita que cambiar de tema se sienta como cambiar de producto.

**Qué se descartó.**

- **Atkinson Hyperlegible.** Se diseñó para baja visión y se pierde. Baja el cuerpo de 16 a 15 px, así que no se
  compensa: es una reducción que se eligió viendo las capturas. Lo que sí ayuda es JetBrains Mono en SHA y lotes,
  el mínimo de 12 px y el contraste, comprobados por tests.
- **El cuerpo de 14 px.** Era una reducción más fuerte desde los 16 de antes, no una mitigación, y se quedó en 15.
- **IBM Plex Sans y un acento índigo.** Se compararon en las láminas de la dirección y no se eligieron.
- **Un oscuro de gris neutro puro.** Con el gris claro azulado, el oscuro tenía que ser de la misma temperatura.
- **La insignia en todos los estados.** Con varios repos activos, «con cambios» (lo normal mientras se trabaja)
  llenaría la Red de alertas, y una alerta que está en todas partes deja de avisar.
- **La alternativa `ss02` de Inter.** En las capturas no cambiaba nada visible, y donde la ambigüedad importa ya
  va JetBrains Mono.

**Riesgo aceptado.** Atkinson se pierde, y Taller, Vigía y Bitácora no tenían lámina: su aspecto sale de los
mismos tokens y se revisó con capturas. El GIF de la demo, que se graba con el Studio, tiene otro aspecto.

---

## 2026-10-27 — El Studio tiene una sola estructura por vista, y el tema, claro u oscuro, solo cambia colores; el modo Cabina se elimina

> **Reemplaza en parte** dos entradas, cada una solo en lo que dice de los modos del Studio. De "El Studio
> elige su idioma en el navegador y lo manda en cada petición; los sellos llevan la palabra fuera del dibujo"
> (2026-10-19): los sellos SVG y "En modo Sobrio, solo el texto"; lo del idioma sigue vigente. De "El README
> principal pasa a inglés" (2026-10-18): solo la mención de las capturas `tablero-cabina.png` y
> `tablero-sobrio.png`.

**Decisión.**

- **El modo Cabina se elimina.** El Studio pintaba cada vista de dos maneras, Cabina (una vía con semáforos,
  vagones con su sello SVG) y Sobrio (tablas), y un botón «Modo» pasaba de una a otra. Ahora cada vista tiene
  una sola estructura, y el botón «Tema oscuro», con `aria-pressed`, solo cambia los colores.
- **La estructura de cada vista.** La Red es una lista de filas que se despliegan: plegada, el nombre, el preset,
  los repos con su rol, la tarea activa y la sesión; desplegada, además, el manifiesto, las reglas y las
  acciones. Las fases del Tablero son seis tarjetas, y los lotes, una tabla con lote, objetivo, repo, estado,
  detalle, ancla y recibo. Ningún dato ni acción de los dos modos se pierde: lo que solo tenía uno de ellos
  pasó a la estructura única.
- **El tema.** Sin elección guardada, el tema es el del sistema (`prefers-color-scheme`), y lo resuelve solo el
  CSS: no hay script en línea, porque la CSP del servidor local no lo admite, y no hay destello aunque el
  JavaScript se cargue tarde. El botón lo cambia y la elección se recuerda en `localStorage` (`pg-tema`, `claro`
  u `oscuro`); `<html data-tema>` solo existe cuando hay una elección, y con ella un cambio del sistema no la
  pisa. `tema-claro.css` y `tema-oscuro.css` solo declaran custom properties y `color-scheme`.
- **Lo viejo no se migra.** `pg-modo` y `#?sobrio=` dejan de leerse: quien tenía Cabina o Sobrio guardados
  vuelve al tema del sistema.
- **El vocabulario.** Ningún texto visible ni `aria-label` usa la metáfora de la vía («Estación», «Señal»,
  «EN VÍA»): las fases son «Fases de la tarea». «Sello» se queda, porque es el término del motor: «recibo
  sellado». El estado de un lote se dice en minúscula, con un solo conjunto de palabras (verificado, sellado,
  con pendientes, commit pendiente, no vigente, rechazado, descartado, manual, nota, sin recibo), en las claves
  `estado.*` y en las clases `estado-*`; las fases, en `fase.*` y `fase-*`.
- **Lo que deja de usarse se borra**: la vía, los vagones, los semáforos y los sellos SVG (`studio/public/sellos/`;
  el sitio exportado ya no los lleva), con su CSS y sus variables.
- **Una prueba comprueba que el tema no toca la estructura**: compara el árbol del DOM y el de accesibilidad
  en claro y en oscuro, en cada vista a 1280 y a 390 px, con el visor abierto, con la vista previa de una
  acción abierta, con un error de la API y en el sitio estático. Su función de comparación tiene su propia
  prueba con árboles sintéticos.

**Por qué.**

- Dos estructuras por vista eran dos interfaces que mantener y probar, y Sobrio tenía menos funciones que
  Cabina, no solo otro aspecto: quedarse con él sin más habría perdido datos.
- El tema del sistema es lo que la persona ya eligió en su equipo, y que lo resuelva el CSS lo hace valer
  también sin JavaScript.
- Con una sola estructura, que el tema solo cambia colores se puede probar y se queda probado.

**Qué se descartó.**

- Cabina como tercer tema: seguiría pidiendo su propia estructura, o sería solo otra paleta sin razón para
  distinguirse de las dos que quedan.
- Todo en tablas: la Red y las fases perdían lo que cabe mal en una fila, y en un teléfono las tarjetas y la
  lista que se despliega se apilan mejor.
- Un script en `index.html` que fije el tema antes del primer pintado: la CSP lo prohíbe, y no se toca.
- Migrar la elección de modo guardada: Cabina ya no existe, y Sobrio y el tema claro no son lo mismo.

**Riesgo aceptado.** La paleta y la tipografía son todavía las de antes: el tema oscuro usa los colores de
Cabina sobre la estructura nueva y puede verse raro, y los títulos aún cambian de fuente con el tema
(`--texto-titulo`). Con una elección guardada distinta del tema del sistema, el primer pintado puede enseñar el
otro tema un instante, hasta que corre el JavaScript.

---

## 2026-10-19 — El Studio elige su idioma en el navegador y lo manda en cada petición; los sellos llevan la palabra fuera del dibujo

> Registra decisiones de la Etapa 6 (L07) que se tomaron en el código sin ADR (auditoría externa de la Etapa 6,
> §8). **Matiza** §8.6 del plan, que pedía el texto de los sellos dentro del SVG.

> **Reemplazada en parte** el 2026-10-27 por "El Studio tiene una sola estructura por vista, y el tema, claro
> u oscuro, solo cambia colores; el modo Cabina se elimina": los sellos SVG y "En modo Sobrio, solo el texto"
> ya no valen. Lo del idioma sigue vigente.

**Decisión.**

- **El idioma de la interfaz** sale, por orden, de `#?lang=es|en` en el enlace (se puede compartir, y la elección
  se recuerda), de la elección guardada en `localStorage` (el selector ES / EN), del primero de
  `navigator.languages` que sea español o inglés, y si no, inglés (`studio/src/i18n/idioma.ts`). `<html lang>`
  lo sigue siempre. Es independiente del idioma de cada proyecto: los documentos se enseñan como están escritos.
- **El navegador lo manda en cada petición** a la API en la cabecera `X-Phase-Gate-Lang` (`es` o `en`; otro
  valor, o la cabecera repetida, no cuenta), y el servidor atiende esa petición dentro de `enIdioma`. El SSE no
  lleva texto. El filtro de seguridad no la lee: sus respuestas salen en el idioma del proceso.
- **Los sellos** son un marco SVG sin texto (`studio/public/sellos/`) con la palabra encima, en HTML y del
  diccionario de la interfaz (VERIFICADO / VERIFIED, SELLADO / SEALED…). En modo Sobrio, solo el texto.
  *Reemplazado el 2026-10-27: los sellos SVG y los modos ya no existen; el estado de un lote es solo texto.*

**Por qué.**

- El servidor no sabe en qué idioma está el navegador, y la interfaz puede cambiar de idioma sin recargar: la
  petición es lo único que lo sabe en cada momento. Una cookie o un parámetro en la URL de la API habrían
  servido igual, pero la cabecera no se queda en el historial ni en los registros, y una cabecera propia en un
  `fetch` del mismo origen no abre nada nuevo (el Studio nunca concede un preflight).
- `#?lang=` va primero para que un enlace compartido abra en el idioma de quien lo comparte.
- Con la palabra fuera del dibujo, un idioma nuevo no obliga a redibujar ni a duplicar los SVG, y la palabra la
  lee un lector de pantalla.

**Qué se descartó.**

- El texto como `<text>` dentro del SVG, como pedía §8.6: un SVG por idioma, o un SVG en línea que el
  diccionario rellene, para lo mismo que hace un `<span>`.
- Guardar el idioma en el servidor por sesión: dos pestañas en idiomas distintos se pisarían.

---

## 2026-10-19 — Un manifiesto sin `idioma` es español; sin proyecto, manda el idioma del equipo

> **Matiza** la del 2026-10-18 "El idioma es del proyecto y se deduce primero del disco…", en su paso 5.

**Decisión.**

- **Un manifiesto válido sin `idioma`** es de la 3.0 o la 3.1, cuyo esquema daba `"es"` por defecto. Si sus
  documentos no dicen el idioma, el proyecto es español en vez de seguir al sistema. `idiomaPorDefecto` de
  `machine.json` y `PHASE_GATE_LANG` siguen contando antes, porque alguien los fijó a propósito; lo único que
  se reemplaza es el último paso, el locale del sistema. El origen se ve en `doctor` como
  `del manifiesto sin idioma`.
- **`doctor` avisa con `MANIFIESTO-SIN-IDIOMA`** cuando el manifiesto no dice su idioma y sus documentos
  tampoco: el idioma sale entonces de este equipo (o es el español de la 3.x), y el manifiesto viaja entre
  equipos.
- **`init --migrate` completa** los manifiestos válidos que no llevan `idioma`: les añade el que el proyecto
  ya usa, detrás de `preset`, deja copia `.bak-…` del original y no toca ninguna otra clave. Uno inválido no
  se toca. Hasta ahora `--migrate` solo creaba los que faltaban.
- **Sin proyecto** (`get_phase_prompt` sin proyecto, la capa de fábrica sin proyecto, los `/fN`), manda el
  idioma del equipo: `idiomaPorDefecto`, `PHASE_GATE_LANG` o el sistema (desvío E6-D5, que no tenía ADR).
  Quien trabaje en español en un equipo en inglés fija `PHASE_GATE_LANG=es` en el bloque `env` de su
  cliente, como recomienda el README.

**Por qué.** La auditoría externa de la Etapa 6 (hallazgo 2) midió que, con el sistema en inglés y sin
`PHASE_GATE_LANG`, 98 de 123 salidas en español cambiaban: un proyecto creado con `init` de la 3.0 o la 3.1,
todavía sin tareas, pasaba al inglés y su primera tarea se creaba con nombres en inglés. Fuera de Windows es
el caso normal: los clientes MCP lanzan el servidor sin `LANG`, y entonces el sistema dice `en`. La suite no
lo veía porque fija `PHASE_GATE_LANG=es`; ahora `test/oro.test.ts` ensambla las cinco fases en español con el
sistema en inglés y sin esa variable, y `test/idioma.test.ts` prueba el orden con un manifiesto sin idioma.

**Qué se descartó.**

- Devolverle al esquema `idioma: "es"` por defecto: un manifiesto sin idioma con tareas en inglés dejaría de
  deducirse de sus documentos, y el paso 2 ("el disco es la verdad") perdería el caso que más importa.
- Solo el aviso de `doctor`, sin cambiar la resolución: el proyecto seguiría cambiando de idioma en silencio
  en cada equipo que no corra `doctor`.
- Un job de CI que corra la suite sin `PHASE_GATE_LANG`: la suite crea cientos de proyectos sin manifiesto ni
  documentos, cuyo idioma es, a propósito, el del sistema, y fallaría por diseño. La prueba de oro con el
  sistema en inglés simulado (`fijarLocaleDelSistema`) cubre el riesgo en cualquier sistema, también en
  Windows, donde `LANG` no cuenta.
- Que `--migrate` reescriba el manifiesto entero con sus valores por defecto: cambiaría claves que la
  persona no pidió cambiar.

**Riesgo aceptado.** `--migrate` vuelve a escribir el JSON con dos espacios de sangría: un manifiesto escrito
en una línea o con otro formato cambia de forma (no de contenido). Queda la copia.

---

## 2026-10-18 — El README principal pasa a inglés

> **Reemplaza en parte** la del 2026-08-08 "README bilingüe completo, asumiendo el costo de la
> duplicación": los dos README siguen completos y cambiar uno obliga a cambiar el otro; lo que cambia es
> cuál es el principal.

> **Reemplazada en parte** el 2026-10-27 por "El Studio tiene una sola estructura por vista, y el tema, claro
> u oscuro, solo cambia colores; el modo Cabina se elimina": las capturas `tablero-cabina.png` y
> `tablero-sobrio.png` enseñaban dos modos que ya no existen. El resto sigue vigente.

**Decisión.** `README.md`, en inglés, es el principal: el que fija la estructura y el primero que se
actualiza. `README.es.md` es su gemelo completo, con las mismas secciones en el mismo orden, las mismas
tablas, el mismo esquema de enlaces y anclas, y los diagramas Mermaid traducidos. Los dos abren igual:

1. el nombre y una frase ("An MCP server that turns any AI coding agent into a gated, auditable,
   batch-by-batch engineering workflow." y su versión en español);
2. el GIF de su idioma por su URL absoluta de Pages, enlazado al MP4 del mismo idioma;
3. las insignias: CI, npm, provenance, licencia y la demo en vivo;
4. tres líneas: el problema, la solución y el enlace a la demo;
5. "Try it in 10 seconds" / "Pruébalo en 10 segundos": `npx mcp-phase-gate ui --demo`, con `--idioma`.

Los dos ganan una sección de arquitectura (un diagrama de las piezas reales y el enlace a este registro,
con su número de entradas) y una de idiomas, y dejan de decir que el producto está en español. El caso de
estudio sigue la misma regla: `docs/case-study.md` y su gemelo `docs/caso-de-estudio.md`.

**Por qué.**

- npm enseña `README.md` en la página del paquete y GitHub lo abre por defecto: es lo primero que lee
  quien llega de fuera, y la mayoría de esa gente lee inglés.
- El producto ya es bilingüe (Etapa 6): prompts, comandos, variantes, presets, mensajes y Studio existen en
  inglés. La razón de la ADR del 2026-08-08 para tratar el español como el idioma del producto ("los
  prompts, que son el producto real, están en español y se quedan así") dejó de ser cierta. El README en
  inglés ya existía, pero describía un producto en español y lo decía en su segunda línea.

**Qué se descartó.**

- Reducir el español a un resumen que remita al inglés, la salida que la ADR del 2026-08-08 dejaba
  prevista si uno de los dos envejecía: el español sigue siendo un idioma de primera en el producto, y
  quien lo usa en español tiene que poder instalarlo y configurarlo sin cambiar de documento.
- Un solo README con los dos idiomas intercalados: el doble de largo para cualquiera de los dos lectores.
- Imágenes con ruta relativa al repo: npmjs.com las rompe, porque `docs/medios/` no viaja en el paquete
  (§8.1 del plan). La captura de `tablero-cabina.png` sale de la cabecera y la de `tablero-sobrio.png` de
  la sección del Studio: las dos enseñan la interfaz de antes del selector de idioma. *Reemplazado el
  2026-10-27: los dos modos que enseñan esas capturas ya no existen.*

**Riesgo aceptado.** El de siempre: dos documentos largos que cambian juntos. Ningún test compara su
estructura (`test/docs.test.ts` solo vigila los comandos de fase); la mitigación sigue siendo la línea de
"Where everything is" / "Dónde está cada cosa" que recuerda cambiar el otro.

---

## 2026-10-18 — Los medios se generan de la demo real y se publican en Pages, no en git

**Decisión.** El GIF, el video y el póster de los README salen de **código real ejecutándose**, nunca de
capturas a mano ni de una conversación escenificada, con dos scripts y una cinta:

- `docs/medios/terminal.tape` (VHS): `mcp-phase-gate init --cliente cursor --dry-run` (el diff de un
  `mcp.json` de Cursor que ya tiene otro servidor) y `mcp-phase-gate doctor`, con el binario compilado y el
  entorno apuntando a la demo de ese idioma.
- `scripts/grabar-studio.mjs` (Playwright, `recordVideo` a 1280×720 contra `ui --demo --idioma`): la Red, el
  tablero de la tarea terminada con sus sellos, **en vivo** el commit del lote pendiente y `record_batch` con su
  SHA (el sello VERIFICADO llega por SSE sin recargar), el Taller con la ranura de pruebas de la Fase 3 que
  sustituye el preset `ai-agent-ops`, y el sitio publicado en un teléfono (390×844). Las esperas son de
  eventos del DOM; lo único medido en milisegundos es el tiempo para leer cada imagen.
- `scripts/medios.mjs` (ffmpeg): cada pieza a 1280×720 y 30 fps, el MP4 H.264 con `+faststart`, el GIF en dos
  pasadas con paleta propia y el póster, en los dos idiomas, con `medios.json` (duraciones y bytes).

Se generan en el workflow de Pages en cada tag y se publican en `<sitio>/medios/demo-<idioma>.gif`, `.mp4` y
`poster-<idioma>.png`; los README los enlazan con su URL absoluta, que también se ve en npmjs.com.

*Ampliado el 2026-10-19* (hallazgo 14 de la auditoría de la Etapa 6): el workflow tiene tres jobs. `sitio`
exporta la demo y `medios` genera los medios, los dos solo con permiso de leer el repo, aunque `medios` instala
VHS, ffmpeg y Chromium; `desplegar` es el único con `pages: write` e `id-token: write`, y no compila ni instala
nada. Si los medios fallan, la demo se publica igual, con los medios que ya estaban publicados (desplegar
reemplaza el sitio entero, y sin ellos los README enseñarían imágenes rotas); la primera vez, sin medios y con
un aviso. Las actions de los tres workflows van fijadas por SHA, con su versión en un comentario que Dependabot
mantiene.

**Medido en este equipo** (Windows, VHS 0.12.1, ffmpeg 6.0, Chromium de Playwright 1.63): 41,3 s en español y
42,4 s en inglés; MP4 de 1,52 MB en los dos; GIF de 4,93 MB y 4,72 MB a 8 fps y 760 px (a 12 fps y 960 px
pasaban de 7 MB). El presupuesto es el de §8.8 (GIF ≤ 5 MB, MP4 ≤ 8 MB) y el script falla si se pasa.

**Qué se descartó.**

- Versionar los medios en git: binarios pesados en el historial para algo que se regenera solo.
- Escenificar una sesión de Claude Code o Cursor: la demo honesta solo enseña lo que ejecuta el producto. Una
  sesión real la grabaría la autora a mano, como pieza aparte.
- Encender el farol de sesión de la Red escribiendo un registro de sesión inventado: sería escenificar una
  sesión MCP que no existe. La Red sale tal como es en la demo, sin sesiones abiertas.

**Riesgos aceptados.**

- El GIF entra en el presupuesto con el tercer escalón (8 fps y 760 px), por debajo de los 960 px del plan: un
  GIF de ~42 s con texto de terminal a 960 px pesa ~7 MB. El MP4, a 1280 px, es la versión nítida.
- La banda de la demo dice su ruta, y la ruta sale en el video: en la CI de Pages es `/tmp/…`; en un equipo
  puede llevar el nombre de quien graba, y `grabar-studio.mjs` lo avisa.
- En Windows, VHS lanza el `bash` de WSL (CreateProcess mira System32 antes que el PATH): ahí `medios.mjs` usa
  la misma preparación en PowerShell. En la CI, `bash`.

---

## 2026-10-18 — Los prompts en inglés se reescriben con glosario y revisión, no se traducen a máquina

**Decisión.** `prompts/en/` es un juego de fábrica completo, gemelo de `prompts/es/`: reglas globales, las
cinco fases (`phase-1-discovery.md` … `phase-5-audit.md`), los comandos (`commands/f1.md` … `f5.md`) y las
cuatro variantes de regla (`reglas/`, con los mismos nombres de archivo: los elige el código). Cada archivo
se **reescribió** en inglés, no se tradujo frase por frase, con un contrato fijo:

- el **glosario** de `docs/glosario.md` (Batch, Receipt, Anchor, Seal, Slot, Block, Basis, Gate…);
- los encabezados, claves y nombres de documento del vocabulario (§8.2), que comprueba su test de contrato;
- las **mismas ranuras, en el mismo orden**, con la palabra y el alias ingleses (`<!-- slot: tests -->`); los
  bloques de las variantes, con los mismos ids y modos (`<!-- block: phase-4/commits -->`);
- el **mismo número de puntos** en cada `FORBIDDEN` y `SELF-CHECK` que en su `PROHIBIDO` y `AUTOVERIFICACIÓN`, con
  la misma numeración (el 14 y el 15 de la Fase 4 siguen siendo de las variantes);
- los nombres de las tools y de sus parámetros sin traducir (`titulo`, `que_se_hizo`…), glosados una vez cuando
  el nombre no se entiende; los valores de `estado` en inglés (`verified`…), que `record_batch` acepta desde L03;
- los ejemplos de calidad, reescritos con el mismo propósito; los de la descripción del PR (Fase 5), **nuevos y
  genéricos** (una tienda en línea inventada), nunca de PR reales (ADR del 2026-08-07);
- la auditoría de la Fase 5 se escribe en inglés, y sus rangos de palabras se ajustan al inglés, que usa menos
  palabras para lo mismo (el normal pasa de 200–260 a 190–240; el tope, de 500 a 450).

`test/prompts-en.test.ts` comprueba la paridad (ranuras en orden, puntos por sección, ejemplos delimitados,
bloques de las variantes) y que un proyecto con `"idioma": "en"` ensambla las cinco fases con las cuatro
políticas de commits, con y sin lotes, sin avisos, sin marcadores y con todos los bloques del servidor en
inglés.

**Revisión de la autora.** El plan pide que la autora revise cada archivo antes del commit (E6-R3). Para esta
etapa dio un OK general por adelantado; la lectura archivo por archivo queda registrada como pendiente en la
sección de ejecución del plan, y cualquier cambio de voz que pida entra como un lote de ajuste, con la prueba
de oro regenerada a propósito (L06).

**Amplía** la ADR del 2026-08-08 (README bilingüe): ahora también son bilingües los prompts.

**Qué se descartó.**

- Traducción automática sin contrato: un prompt es el producto, y una traducción literal pierde el tono
  ("hazlo en esta fase" no es "do it in this phase" en un prompt que funcione) y, sin paridad comprobada,
  alguna regla.
- Ids de ranura en inglés como canónicos: los usan los presets, `eject` y el Studio desde la Etapa 3; el alias
  da lo mismo sin romper nada.

---

## 2026-10-18 — Mensajes y descripciones en dos idiomas; los nombres de las tools no se traducen

> **Reemplaza** la nota de la 2.x "la interfaz del servidor está en inglés": solo lo estaban los nombres de
> las tools y de casi todos sus parámetros; las descripciones y los mensajes estaban en español.

**Decisión.** Todo texto que el servidor dirige a una persona o al modelo tiene un **código** y un texto en
español y en inglés: los errores y las respuestas de las tools, las preguntas de confirmación, las líneas de
`doctor` (y el texto de cada hallazgo, con el código del propio hallazgo), `--help` y la salida de `init` y
`eject`, los bloques que el servidor añade a un prompt y las descripciones de las tools, de sus parámetros, de
los recursos y de los MCP Prompts `/fN`. Son 620 códigos en seis catálogos (700 en siete desde que el Studio ganó el suyo, L07) (`src/i18n/textos/`), que junta
`src/i18n/mensajes.ts` con `mensaje(codigo, parametros, idioma?)` y `fallo(...)`, un `Error` que guarda su
`codigo`. *Matizado el 2026-10-19* (hallazgo 9 de la auditoría de la Etapa 6): las líneas que `ui` imprime en la
terminal y las respuestas de texto del filtro de seguridad del Studio (421, 403, 401, 405, 413, 500) seguían
fijas en español. Ahora tienen código: las de `ui`, en el idioma de `--idioma` o en el del proceso; las del
filtro, en el del proceso (`PHASE_GATE_LANG` o el sistema), porque el filtro no lee la cabecera de idioma de una
petición que todavía no ha validado. *Y una consecuencia del contexto por llamada que esta entrada no decía* (cuestionamiento de la
misma auditoría): lo que corre fuera de una llamada (la vigilancia de las capas, la sincronización de los `/fN`,
los avisos de un ensamblado sin contexto) y los errores de validación de los argumentos, que zod redacta con los
esquemas fijados al arrancar, salen en el idioma de arranque del servidor, no en el del proyecto.

**En qué idioma sale cada cosa:**

| Qué | Idioma |
|---|---|
| Lo que se escribe en la carpeta del proyecto (recibos, índice, la comparación de "Verificación del commit") y los bloques que se añaden a un prompt (ARCHIVOS DE ESTA TAREA, la compuerta, los pendientes, los recibos que existen, CONFIGURACIÓN DEL PROYECTO, COMMITS DE LA FASE 4, la nota de un bloque huérfano) | El del **proyecto**, siempre explícito |
| Errores y respuestas de una tool | El del proyecto si la llamada lo resuelve; si no, `PHASE_GATE_LANG`; si no, el del sistema |
| Descripciones y títulos de tools, parámetros, recursos y `/fN`; los mensajes de validación de zod | Los de **arranque**: `PHASE_GATE_LANG` o, si no, el del sistema. Son estáticos desde la Etapa 2 |
| `doctor`, `--help`, `init`, `eject` | Como los mensajes, sin proyecto |

El servidor abre un contexto por llamada (`AsyncLocalStorage`) y lo fija en cuanto resuelve el proyecto, así
que el error que lanza un módulo de abajo sale en su idioma sin pasar el idioma a cada función.

- **Los nombres de las tools no cambian** (`start_task`, `record_batch`…), ni los de sus parámetros, salvo
  `crear_proyecto`, que gana el alias `create_project` (los dos valen; con valores distintos, error).
- **Los valores que el código interpreta tampoco**, pero `record_batch` acepta además `estado` en inglés
  (`verified`, `with pending items`, `failed`, `discarded`) y los títulos de `condicionales` en inglés, y los
  normaliza al canónico: los prompts en inglés los nombran así.
- El Studio asigna el estado HTTP de un error por su **código** y ya no por su texto en español.
- `--help` documenta `PHASE_GATE_LANG`. Recomendación en los README para quien trabaje en español:
  `PHASE_GATE_LANG=es` en el bloque `env` del cliente (el sistema es el último recurso).

**Test** (`test/mensajes.test.ts`): todo código tiene los dos idiomas, del mismo tipo y con los mismos
parámetros, y no se repite; ningún texto fijo en inglés es el español; todo código que pide el código fuente
existe; el idioma de una llamada sale de donde dice la tabla; `PHASE_GATE_LANG` cambia los títulos y las
descripciones de las tools y de cada parámetro (los nombres no); un error de un proyecto en inglés sale en
inglés aunque `PHASE_GATE_LANG` diga `es`; `create_project` funciona. Todos los textos en español siguen
siendo los mismos byte a byte: la suite entera, que los afirma, no cambió salvo donde el comportamiento
cambia a propósito (el error de `IDIOMA-CON-TAREAS` sale en el idioma del proyecto).

**Qué se descartó.**

- Traducir los nombres de las tools o de sus parámetros: son la API que usan los prompts, los comandos de
  quien ya los copió y los clientes; un cambio de nombre rompe todo eso por un beneficio de lectura.
- Pasar el idioma como parámetro a cada función que puede lanzar un error: más de cien firmas tocadas para
  lo que hace un contexto por llamada.
- Descripciones de tools según el proyecto de cada llamada: el cliente pide la lista de tools una vez, al
  conectar, y no sabe de proyectos.

**Riesgo aceptado.** Un error que se produce antes de resolver el proyecto (un argumento mal formado, un
proyecto que no existe) sale en el idioma del equipo, no en el del proyecto: todavía no se sabe cuál es.

---

## 2026-10-18 — El idioma es del proyecto y se deduce primero del disco; la redacción puede ser de la tarea

> **Matizada** el 2026-10-19 por "Un manifiesto sin `idioma` es español; sin proyecto, manda el idioma del
> equipo": un manifiesto sin `idioma` y sin documentos que lo digan es español, no el idioma del sistema.

**Decisión.** Dos conceptos distintos:

| Concepto | Dónde se declara | Qué decide |
|---|---|---|
| **Idioma del proyecto** | `idioma` en `phase-gate.json` (`"es"` o `"en"`) | La capa de fábrica (`prompts/<idioma>/`, `presets/<idioma>/`), los nombres de los documentos y el vocabulario con que escribe el servidor |
| **Idioma de redacción** | `redaccion: en` en el frontmatter de `00 - …`, que escribe `start_task` con `redaccion` | Solo en qué idioma escribe el modelo el contenido. El prompt gana una línea al final, en el idioma del proyecto; nada más cambia |

**El idioma de un proyecto** (`idiomaDelProyecto`, `src/manifiesto.ts`) sale, en este orden, de: (1) el
manifiesto; (2) **los documentos que ya tiene en disco** (`01 - Análisis Técnico.md` frente a `01 - Technical
Analysis.md`), con mayoría si hay de los dos y el español a la par; (3) `idiomaPorDefecto` de `machine.json`;
(4) `PHASE_GATE_LANG` (`es`, `en`, también `es-MX` o `en_US.UTF-8`); (5) el del sistema: `es` si su locale
empieza por `es`, si no `en`. El manifiesto deja de tener `"es"` por defecto (`schema/project.json` se
regenera): sin `idioma`, se deduce.

- **`doctor`** da `IDIOMA-MIXTO` (error) si, sin idioma declarado, hay documentos de los dos idiomas, e
  `IDIOMA-CON-TAREAS` (error) si el manifiesto declara uno y hay tareas con documentos del otro.
  `get_phase_prompt` se niega con ese mismo texto: la deducción daría esas tareas por "sin documentos".
  Cambiar el idioma no renombra nada (P7). *Ampliado el 2026-10-19:* también se niegan `start_task` (creaba
  la tarea nueva con los nombres del idioma declarado, y el proyecto mezclaba los dos), `record_batch`,
  `get_batch_status` y `write_central_doc` con el nombre de un documento de fase; `list_tasks` lo antepone
  como aviso (hallazgo 4 de la auditoría de la Etapa 6).
- **`init --migrate`** escribe siempre `idioma` en los manifiestos que crea: el de los documentos del
  proyecto si los tiene (nunca el del sistema), y si no, `--idioma` o lo que se conteste a la pregunta (por
  defecto, el del equipo; sin terminal o con `--yes`, el del equipo sin preguntar). Con `--solo-este-equipo`,
  `--idioma` escribe `idiomaPorDefecto` en `machine.json`. "Crear phase-gate.json" del Studio hace lo mismo.
- **`eject`** escribe el marcador del bloque y la carpeta de comandos en el idioma del destino
  (`<!-- block: phase-3/tests -->`, `commands/`).
- **`doctor`** enseña de dónde sale el idioma de cada proyecto (`del proyecto`, `de sus documentos`…).

**Por qué el disco antes que el sistema.** Los proyectos de la 2.x no tienen manifiesto y están en español.
Si el idioma del sistema decidiera antes que sus documentos, abrir el mismo proyecto en un equipo en inglés
(o en una CI de Linux sin `LANG`) lo dejaría de golpe sin fases hechas (E6-R1). Y el sistema va el último
porque los clientes MCP lanzan el servidor con un entorno reducido, sin `LANG`, y en Windows `Intl` sigue a
la región e ignora `LANG` (validación V9).

**Amplía** P7 y la ADR del manifiesto (Etapa 3): `idioma` acepta `"en"` y deja de tener valor por defecto.

**Riesgos aceptados.**

- Contar documentos recorre las carpetas de tarea del proyecto cada vez que se resuelve su idioma (unas
  doce comprobaciones de existencia por tarea). *Matizado el 2026-10-19:* la auditoría midió que una sola
  llamada lo repetía varias veces (con 600 tareas, `get_phase_prompt` pasaba de 235 a 3489 ms); ahora se
  cuenta una vez por proyecto y por llamada (`conCacheDelIdioma`), con un `readdir` por tarea y los nombres
  comparados en NFC y sin mayúsculas, igual en todos los sistemas. Se hace solo con nombres de fábrica: una capa propia que
  renombra los documentos no cuenta para la deducción, y conviene fijar `idioma` en el manifiesto.
- La suite se escribió en español: `test/helpers.ts` fija `PHASE_GATE_LANG=es`, y el test que prueba otro
  idioma lo cambia. El idioma del sistema se prueba con `fijarLocaleDelSistema` y no con `LANG`, que en
  Windows no cuenta.

**Qué se descartó.**

- Un idioma por tarea para la estructura: la deducción de fase depende de los nombres de documento, y es
  por proyecto (Etapa 3, G1). Un proyecto no mezcla nombres de dos idiomas.
- Un comando de migración de idioma que renombre documentos: fuera de este plan.

---

## 2026-10-18 — Los textos de los que depende el código viven en un vocabulario bilingüe; se escribe en el idioma del proyecto y se lee en los dos

**Decisión.** `src/vocabulario.ts` es el único lugar con los textos que el código busca o escribe con una
forma fija, en español y en inglés: los encabezados (`## Validaciones pendientes` / `## Pending validations`,
`BASE DE CADA DECISIÓN` / `BASIS OF EACH DECISION`…), las claves y los valores del frontmatter de recibos,
índices y planes (`lote`/`batch`, `estado: verificado`/`status: verified`, `lotes: N`/`batches: N`), las
secciones de un recibo, la cabecera de la tabla de lotes (`| Lote | Repo |` / `| Batch | Repo |`), las
frases que cuentan como sección vacía, las claves del frontmatter de los prompts (`documento`/`document`,
`documento_inicial`/`initial_document`, `recibos`/`receipts`) y de los presets (`descripcion`/`description`,
`lotes`/`batches`), las palabras de los marcadores (`ranura`/`slot`, `bloque`/`block`) y sus modos
(`despues`/`after`), y la carpeta de los comandos (`comandos/`/`commands/`).

- **Se escribe en el idioma del proyecto:** `escribirRecibo` y `textoDelIndice` reciben el idioma (en este
  lote, siempre `es`; la resolución por proyecto llega en el lote siguiente).
- **Se lee en los dos:** `parsearRecibo`, `cabeceraDeRecibo` y `frontmatterDeRecibo` devuelven las claves y
  los valores **canónicos** (los de siempre, en español), así que el resto del código no cambia: un recibo en
  inglés y su gemelo en español dan el mismo objeto, y de uno se escribe el otro sin perder nada (probado con
  los cuatro tipos de ancla por los cuatro estados). Igual el plan (`batches: N` y su tabla), los pendientes
  (`## Pending validations`, "None."), los bloques, las ranuras, el frontmatter de prompts y presets, los
  comandos y la línea "Re-anchored on" del historial de reanclajes (también en la Bitácora del Studio).
- **Los identificadores no se traducen:** `L01…L99`, los ids de ranura, los SHA, las rutas, las tools y los
  presets. Cada ranura tiene un **alias inglés** (`phase-3/tests` → `fase-3/pruebas`): el parser de bloques,
  el de ranuras y `eject` lo aceptan y lo resuelven al id canónico, así que la procedencia y los avisos
  hablan siempre del mismo id.
- **Test de contrato** (`test/vocabulario.test.ts`): cada juego de `prompts/<idioma>/` tiene las secciones
  esqueleto, los nombres de documento, las claves del frontmatter, la cabecera de la tabla de lotes y los
  comandos de su idioma, y las mismas 27 ranuras que el español.

**Por qué.** Traducir un prompt sin esto habría roto en silencio la detección de pendientes (el servidor
buscaba `## Validaciones pendientes`) o la lectura de recibos (`estado:`), y nada lo habría avisado.

**Qué se descartó.**

- Traducir las claves al leer con un diccionario por archivo: con un vocabulario único, el test de contrato
  sabe qué buscar en cada prompt.
- Guardar los recibos siempre en español aunque el proyecto sea en inglés: el recibo lo lee una persona.
- Que el alias de una ranura fuera solo de los bloques: en un prompt en inglés, `<!-- slot: tests -->` es
  lo que espera leer quien lo abre.

**Riesgo aceptado.** Las secciones de un recibo cuentan como vacías con "nada/ninguna/ninguno/n/a/no
aplica" y "none/nothing/not applicable", no con "sin pendientes": así un recibo que escribió el servidor
sigue dando los mismos bytes al leerlo y escribirlo otra vez.

---

## 2026-10-17 — El export estático publica la demo y nunca datos reales sin confirmación

**Decisión.** `mcp-phase-gate ui --export-static <dir>` (`src/studio/exportar.ts`) no arranca ningún
servidor: escribe en `<dir>` un sitio que funciona servido tal cual (GitHub Pages, o cualquier carpeta), en
solo lectura.

- **Sin `--incluir-datos-reales`, siempre la demo.** La genera en una carpeta temporal y la lee con el mismo
  entorno prestado con que se genera (`conEntornoDeDemo`: sus `PHASE_GATE_*`, `TZ=UTC`, ninguna
  `PHASE_GATE_*`, `ORQUESTADOR_*` ni `GIT_*` de quien exporta): la Documentación de quien lo lanza no se
  lee. Probado con una Documentación configurada con un proyecto marcador, que no aparece en ningún archivo y
  queda intacta.
- **Con `--incluir-datos-reales`**, exporta la Documentación configurada, después de decir cuántos proyectos
  y que va todo su contenido, y de pedir que se escriba exactamente `exportar`. Sin terminal y sin `--yes`
  no exporta nada; cualquier otra respuesta, tampoco.
- **Las mismas rutas que pide el frontend**, con los mismos manejadores de la API (§7.5): el estado, los
  clientes, los proyectos y, por proyecto, sus tareas y el prompt de cada fase (sin tarea y con cada una);
  por tarea, su estado, los lotes (también reverificados), la bitácora y cada documento y recibo. Cada
  respuesta va a `datos/<sha256>.json`, con el nombre sacado del contenido (así no hay que meter la ruta,
  con sus espacios y acentos, en un nombre de archivo, y una respuesta repetida se guarda una vez), y
  `datos/indice.json` dice qué archivo y qué código corresponden a cada ruta exacta. Además, el frontend
  compilado, `config.js` con `window.PG_MODO = "estatico"` y la banda, y `.nojekyll`.
- **Sin rutas del equipo.** Las raíces de la demo (o las configuradas), el paquete, la carpeta del usuario
  y el temporal se sustituyen por `<Documentación>`, `<repos>`, `<configuración>`, `<estado>`, `<paquete>`,
  `~` y `<temporal>`, en sus tres formas (tal cual, con `/` y con las barras escapadas dentro de un JSON que
  va como texto, como el diff de un `mcp.json`), y lo que va detrás pasa a `/`. Si después quedara alguna
  de esas raíces en lo que se va a publicar, **no se escribe nada** (probado por separado, sin la
  sustitución). `/api/clientes` se calcula sobre una casa vacía y sin ejecutar `claude`: nunca la
  configuración real de los clientes.
- **Determinista.** JSON con las claves ordenadas: dos exports dan los mismos bytes, y la lista de rutas y
  seis respuestas que no dependen del sistema (proyectos, y la tarea, los lotes, la bitácora, un recibo y el
  prompt de la Fase 4 de `cupones-de-descuento`) se comparan con `test/oro/export/`. `/api/estado` (la
  versión del paquete y la de Node) y `/api/clientes` (la ruta del `mcp.json` de VS Code de cada sistema)
  quedan fuera del oro: la misma versión da los mismos bytes en el mismo sistema.
- **Sin pisar nada.** `<dir>` tiene que no existir o estar vacía; el sitio se escribe al lado y se renombra
  al terminar.

**En el sitio, el frontend** (`studio/src/datos.ts`) resuelve cada `get` en el índice, no abre SSE,
deshabilita las acciones con "En la demo publicada todo es de solo lectura…" y enseña la banda. Una ruta
que no está en el índice dice "Esto no está en la demo publicada". Todas las rutas son relativas a la
página: probado en Chromium con el sitio servido bajo `/mcp-phase-gate/` por un servidor de archivos sin
API ni CSP, como Pages, y sin ninguna petición fuera de ese subdirectorio.

**Amplía** R6: exportar datos reales exige la bandera y una confirmación escrita, y ni así se publican las
rutas del equipo.

**Riesgos aceptados.**

- Con datos reales, la sustitución solo conoce las raíces configuradas y las del equipo: una ruta que un
  documento escriba a mano con otra raíz (otro disco, la carpeta de otro usuario) se publica tal cual. Por
  eso se pide escribir `exportar`.
- Exportar la demo tarda unos 16 s en este equipo: unos 3 s generarla y el resto ensamblar los 40 prompts
  (con el estado de git de los repos). Es un paso del build de Pages, no de uso diario.

**Qué se descartó.**

- Guardar cada respuesta en un archivo con el nombre de su ruta (`datos/tareas/TIENDA/…`): habría que
  codificar espacios, acentos y la consulta en nombres de archivo, y Pages los sirve decodificados.
- Publicar las rutas locales con los datos reales, como decía el aviso de §7.9 ("y sus rutas locales"): no
  aportan nada a quien lee el sitio y dicen cómo está organizado el equipo de quien lo publica.
- Un Service Worker que hiciera de API: más código en el navegador para lo mismo que un índice.

---

## 2026-10-17 — La demo se genera con el código real y commits de git deterministas

**Decisión.** La demo del Studio no es un árbol de archivos escrito a mano: `generarDemo(destino)`
(`src/studio/demo.ts`) la construye **ejecutando las funciones de las tools** sobre carpetas nuevas
(`docs/`, `repos/`, `estado/`, `config/` y `casa/`): `registrarLote` (record_batch) escribe cada recibo y
cierra la Fase 4, y `guardarPuntero` (switch_task) deja la tarea activa de cada proyecto. Los repos son de
git de verdad, con commits de verdad, y los recibos se anclan a sus SHA. Si el formato de un recibo
cambia, la demo cambia con él (E5-R9).

| Proyecto | Preset | Repos | Tareas |
|---|---|---|---|
| `TIENDA` | `multi-repo-feature` | `api` y `web`, con git | `cupones-de-descuento`, terminada: L01 a L03 verificados, L04 descartado al cerrar la fase, Fase 5 con dos PR y la coordinación. `envio-gratis`, en la Fase 4: L01 verificado, L02 con el commit pendiente (el cambio de `web` sin commitear), L03 sin recibo |
| `ASISTENTE` | `ai-agent-ops` | `agente`, sin git | `tono-en-reclamos`: los dos lotes anclados por sha256, con la batería de casos en los recibos, y la Fase 4 cerrada |
| `INVESTIGACION` | `research-ops` | ninguno | `costo-de-embeddings`: `00` y `01`, con `## Validaciones pendientes` (el semáforo ámbar) |

Los textos son ejemplos inventados y viven en `test/fixtures/demo/` (`demo.json`, el guion, más un
archivo por documento). El paquete publicado no lleva `test/`, así que `npm run build` los copia a
`build/studio/demo/` (`scripts/copiar-demo.mjs`), junto al módulo que los lee.

**Determinista.** Dos generaciones, en dos procesos, en dos carpetas (una con espacios y acentos en la
ruta) y con otra zona horaria, dan los mismos bytes y las mismas fechas en los 39 archivos y las 24
carpetas de fuera de `.git`, y los mismos HEAD: `tienda-api` `debffa2c…` (4 commits) y `tienda-web`
`cacff761…` (2 commits). El test los compara con esas constantes, no solo entre sí: cualquier cosa del
equipo que se colara en un commit los cambiaría. Para eso:

- **Los commits** los hace `gitEnLaDemo` (`src/git.ts`), la única escritura en git del paquete. Solo vale
  dentro de una carpeta con la marca `.demo-mcp-phase-gate` en su raíz y con un `dir` que esté dentro de
  ella (`..` incluido). Quita del entorno toda `GIT_*` heredada (`GIT_DIR`, `GIT_CONFIG_PARAMETERS`…), pone
  `GIT_CONFIG_NOSYSTEM=1` y `GIT_CONFIG_GLOBAL=<la marca>` (que solo lleva un comentario: ninguna
  configuración de quien la genera), autor y committer `Demo <demo@example.invalid>` con la fecha del paso, y
  `-c commit.gpgsign=false -c init.defaultBranch=main -c core.autocrlf=false -c core.hooksPath=<raíz>/.sin-hooks`
  (una carpeta que no existe: ningún hook se ejecuta). Los repos se crean con `git init --template=`: nada
  de la plantilla de la instalación de git.
- **El reloj** avanza una hora por paso desde `2026-03-02T10:00:00Z` (`registrarLote` recibe `ahora`), y
  cada archivo lleva la fecha de su paso; las carpetas, la del último.
- **Mientras se genera**, el proceso trabaja con un entorno prestado: `TZ=UTC` (los recibos guardan la
  fecha local), ninguna `PHASE_GATE_*`, `ORQUESTADOR_*` ni `GIT_*` de quien la lanza, y la marca como
  configuración global de git también para las **lecturas** (el asunto y la fecha del commit que guarda el
  recibo: un `i18n.commitEncoding` de quien la genera cambiaba sus bytes). Al terminar se devuelve el
  entorno exacto que había.
- **Sin datos del equipo:** en ningún archivo (salvo `.git/objects` y `.git/index`) aparece el temporal, la
  raíz de la demo, la carpeta personal, el usuario, el nombre del equipo ni la versión de git.

**`ui --demo`.** Genera la demo en una carpeta fija del temporal del sistema (`mcp-phase-gate-demo`, con el
uid en Linux y macOS) y la reutiliza mientras su marca diga esta misma versión: arrancar no tarda lo que
tarda generarla. Si no vale, la genera al lado (`<carpeta>.<pid>-<aleatorio>`) y la renombra al terminar:
dos `ui --demo` a la vez no se pisan, y una generación cortada no deja una demo a medias con la marca
puesta. En Linux y macOS, donde el temporal es compartido, solo reutiliza una carpeta del mismo usuario,
que no sea un enlace y en la que nadie más pueda escribir. Antes de leer nada, el proceso entero pasa a la
demo (`activarDemo`: fuera las `PHASE_GATE_*`, `ORQUESTADOR_*` y `GIT_*` de quien lo lanza), así que no
toca la Documentación de nadie; arranca con todas las acciones (§7.8), `init-cliente` escribe en la casa
de la demo y nunca ejecuta `claude`, y el frontend enseña la banda "Demo: datos de ejemplo en
`<carpeta>`". `borrarDemo` solo borra una carpeta con la marca, sin seguir enlaces.

Los E2E de las vistas (L05 a L09) siguen sobre su árbol mínimo de `studio/e2e/arbol.ts`: un documento con
HTML malicioso, un manifiesto roto o una tarea con hueco no caben en una demo que se publica. La demo gana
su propio E2E contra `ui --demo` (`studio/e2e/demo.spec.ts`).

Probado en `test/demo.test.ts` con procesos `node` de verdad: dos generaciones a la vez en dos zonas
horarias; otras dos con un entorno hostil (`TZ=Pacific/Kiritimati` o `Asia/Kathmandu`, una capa de prompts
propia por `PHASE_GATE_PROMPTS_PATH` o por su alias, otra Documentación, `GIT_DIR` y `GIT_WORK_TREE` a un
repo señuelo, `GIT_CONFIG_COUNT`, y una casa con un `.gitconfig` con otra codificación y unos hooks que
fallan): el mismo árbol, los HEAD de oro, el señuelo sin commits y ningún hook ejecutado; y `ui --demo
--no-abrir` como proceso, con el temporal y las cuatro variables en carpetas propias. Comprobado rompiéndolo
a propósito: de 22 mutaciones, 21 dejan algún test en rojo. La otra quita `GIT_CONFIG_NOSYSTEM` y no se
puede alcanzar por separado: la configuración del sistema solo se cambia con permisos de administrador (y
`GIT_CONFIG_SYSTEM` es una `GIT_*`, que el filtro ya quita), y la de Git for Windows no trae nada que los
`-c` explícitos no fijen.

**Amplía** R6 ("la demo se genera ejecutando las tools reales contra un fixture que también usan los
tests"): los textos son ese fixture y el mismo generador alimenta los tests de la demo y su E2E.

**Riesgos aceptados.**

- Los HEAD de oro dependen del formato de los objetos de git (SHA-1). Un git que creara los repos en
  SHA-256 por defecto los cambiaría: el test lo diría, y habría que fijar el formato.
- La demo vive en el temporal del sistema: otro programa del mismo usuario puede cambiarla entre dos
  arranques, y `ui --demo` la reutiliza mientras la marca coincida. Es una demo; borrar la carpeta la
  regenera.

**Qué se descartó.**

- Recibos y documentos escritos a mano como fixture: se quedarían atrás del formato real sin que nada
  fallara.
- Guardar los repos de la demo ya hechos (un `.git` o un archivo comprimido en el repo): binarios en el
  control de versiones, y no ejercitaría el código.
- Generar la demo en cada arranque: medido en dos equipos, 3,2 s frente a 0,3–0,4 s reutilizándola.
- Sustituir los E2E de las vistas por la demo, como decía §7.11: los casos hostiles no caben en ella.

---

## 2026-10-17 — El Studio solo ejecuta acciones del CLI, con vista previa y huella

> **Matizada** el 2026-10-18 (Etapa 6, desvío E6-D7 b): la huella ya no incluye el texto del resumen, que
> depende del idioma de la interfaz, para que una vista previa hecha en un idioma se pueda aplicar en el otro.
> No pierde protección: el resumen se deriva de la acción, las rutas y los contenidos, que siguen en la huella.

**Decisión.** El Studio escribe solo con cinco acciones que ya existían en el CLI, y siempre en dos pasos
(`src/studio/acciones.ts`):

| Acción | Equivale a | Lo único que puede tocar |
|---|---|---|
| `preset` | escribir `preset` en el manifiesto | `<DOCS>/<P>/phase-gate.json` |
| `reglas` | escribir `reglas.lotes` o `reglas.commits` | el mismo archivo |
| `crear-manifiesto` | `init --migrate` para un proyecto | crea ese archivo, nunca lo sobrescribe |
| `eject` | `eject <objetivo> --a …` | la capa global, la del proyecto o la carpeta de presets |
| `init-cliente` | `init --cliente <c>` | el `mcp.json` de Cursor o VS Code (con copia), o `claude mcp add` |

1. `POST /api/acciones/plan` con `{ accion, argumentos }` devuelve `{ resumen, diff, huella, cambios }`, o
   `{ posible: false, motivo }` si no hay nada que hacer o no se puede. La huella es el sha256 de lo que se
   haría —por cada archivo, su ruta, lo que tiene, lo que tendría, si deja copia y su `mtimeMs`; o el
   comando— así que cambia si el archivo cambia de contenido o solo de fecha.
2. `POST /api/acciones/aplicar` con `{ accion, argumentos, huella }` **recalcula** el plan y solo escribe si
   la huella coincide; si no, `409` con "El disco cambió desde que viste el cambio. Revísalo otra vez." Una
   huella aplicada no vuelve a valer en ese Studio: un plan que solo ejecuta `claude mcp add` no cambia
   ningún archivo, y la misma vista previa lo ejecutaría dos veces. Aplicar va bajo un candado en la
   carpeta de estado (`.studio-acciones.lock`, el mismo mecanismo que el de `record_batch`): con dos
   procesos `node` aplicando la misma huella a la vez, en 5 rondas, uno escribe y el otro recibe `409`.

Cada plan sale de la misma función que usa el CLI: `planDeEject` (eject se partió en plan y escritura),
`planDeArchivo` y `planDeClaude` (init), `manifiestoNuevo` (lo que escribe `--migrate`). Los argumentos
se validan con shapes zod estrictos: una clave de más, también `__proto__`, es `400`.

**El manifiesto** se cambia sobre el objeto que da `JSON.parse`, que conserva el orden: la clave que se
cambia se queda en su sitio y una nueva va al final (`reglas.lotes` y `reglas.commits`, al final de
`reglas`); se escribe con 2 espacios y LF (el BOM y los CRLF de un archivo escrito a mano no se conservan),
con un temporal y un `rename`, después de copiar el de antes, byte a byte, a
`phase-gate.json.bak-<AAAAMMDD-HHMMSS>`. El resultado se valida con el mismo shape que lo lee antes de
ofrecerlo. Un manifiesto roto o ausente no se cambia desde el Studio: se dice por qué.

**Nunca** escribe documentos de tareas, recibos ni nada de los repos. Cada destino se comprueba sobre su
ruta real, al planificar y al aplicar: no puede caer dentro de una tarea ni de `PHASE_GATE_REPOS_PATH`, y
dentro de la Documentación solo puede ser el `phase-gate.json` de un proyecto o su `.phase-gate/prompts/`.
Probado con la capa global apuntando dentro de una tarea y dentro de un repo: el plan lo rechaza y no se
crea nada.

`init-cliente` usa el entorno de init que le da el Studio (la carpeta del usuario, `APPDATA` y cómo se
ejecuta `claude`); en los tests es uno falso, y un test comprueba que la configuración real de los clientes
no cambió. Las respuestas no llevan rutas del equipo (`<Documentación>`, `~`).

Comprobado rompiéndolo a propósito: de 15 mutaciones, 13 dejan algún test en rojo. Las otras dos son capas
que no se pueden alcanzar por separado: crear con `wx` (bajo el candado, el recálculo ya ve el archivo que
apareció) y la lista de destinos de `eject` (`planDeEject` solo produce esas rutas).

**Amplía** SEG-M del plan ("`phase-gate.json` y `.phase-gate/` se editan solo por CLI o UI"): esta es la UI.

**Riesgo aceptado.** Entre el recálculo y la escritura (dentro del candado) pasan milisegundos; un programa
que no usa el candado, como un editor o OneDrive, podría escribir el mismo archivo justo ahí sin que se
note.

**Qué se descartó.**

- Un editor libre del manifiesto en el Studio: sin el shape a mano, una coma de más rompería el proyecto.
- Lanzar el CLI como proceso hijo: habría que analizar su salida, y no daría el diff antes de escribir.
- Una huella solo con el `mtimeMs`: no ve un cambio que conserve la fecha; por eso cubre también el
  contenido.

---

## 2026-10-17 — El servidor MCP deja constancia de sus sesiones abiertas

**Decisión.** Cada servidor MCP lanzado por stdio escribe `<stateDir>/sesiones/<pid>.json` con seis
campos: `pid`, `cliente` (nombre y versión que anunció en el initialize), `raices` (las de la sesión,
como mucho 20), `proyecto` (el que deducen esas raíces con `resolverPorRaices`, o `null`), `desde` y
`actualizado`. Nada de la conversación. Lo escribe al conocer las raíces —al terminar el initialize,
también si el cliente no declara `roots` (con raíces vacías), y tras cada `roots/list_changed`— y lo
refresca cada minuto; como mucho escribe una vez por minuto, y un cambio dentro de ese minuto se escribe
al acabarlo. Lo borra al salir: en `exit`, en `SIGINT` (y sale con 130), en `SIGTERM` (143) y cuando el
cliente cierra stdin.

Escribirlo nunca tumba el servidor ni retrasa una respuesta: la escritura es asíncrona (un temporal y un
`rename`), nadie la espera, y un fallo se anota una vez en el log. Comprobado con una escritura que no
termina nunca, con otra que falla y con la carpeta de estado convertida en un archivo: las tools
responden igual. Solo lo hace el servidor por stdio (`index.ts`); el que montan los tests en memoria, no.

El Studio lo lee como entrada no confiable, porque lo escriben otros procesos. Una sesión cuenta solo si
su nombre es un entero positivo (`^[1-9]\d{0,9}\.json$`), es un archivo normal de 16 kB o menos, su
contenido cuadra con un shape zod estricto (sin claves de más), el `pid` de dentro es el del nombre, ese
`pid` sigue vivo (`process.kill(pid, 0)`; `EPERM` es vivo, de otro usuario) y `actualizado` es de hace
menos de 10 minutos y no del futuro. Lo demás se ignora. El Studio borra lo que no cuenta al arrancar y
cada minuto —nunca dentro de un GET de la API—, sin seguir enlaces: `unlink` quita un enlace o un archivo,
una junction se quita con `rmdir` sin recursión, y una carpeta de verdad no se toca. El temporal de una
escritura en curso se respeta durante un minuto. A la API solo llegan `pid`, `cliente`, `proyecto`,
`desde` y `actualizado`: las raíces, que son rutas del equipo, no.

Probado entre procesos de verdad: dos servidores a la vez dejan cada uno su archivo; uno que muere de
golpe (`SIGKILL`) deja un huérfano que el Studio descarta y borra; el otro, al cerrar stdin, sale y se
lleva el suyo. Cada regla del lector y del escritor se comprobó rompiéndola a propósito: de 21
mutaciones, 19 dejan algún test en rojo; las otras dos quitaban solo una de las dos comprobaciones del
tope de tamaño (al listar y al leer), y quitar las dos a la vez sí lo deja en rojo.

**Riesgos aceptados.**

- Un `pid` que el sistema reutiliza para otro programa parece vivo: esa sesión se sigue enseñando hasta
  que caduca, como mucho 10 minutos después de su último refresco.
- En Windows, `kill` termina el proceso sin que pueda limpiar, y un cierre del equipo tampoco limpia: el
  archivo queda huérfano hasta que el Studio lo descarta por `pid` o por antigüedad.

**Qué se descartó.**

- Que el Studio preguntara a cada servidor por un canal propio (un socket o un pipe con nombre): abriría
  en el servidor MCP una superficie que hoy no tiene, para un dato solo informativo.
- Un solo archivo compartido con todas las sesiones: dos servidores escribiéndolo a la vez necesitarían
  un candado; con un archivo por `pid` cada uno escribe solo el suyo.
- Guardarlo en `active-tasks.json`: los punteros son la elección de la persona y duran; esto es efímero.

---

## 2026-10-17 — El Studio es un servidor local separado del MCP, en `127.0.0.1`, con token, cookie y CSP

**Decisión.** La interfaz visual es un proceso aparte: `mcp-phase-gate ui` arranca un servidor HTTP
(`src/studio/servidor.ts`) que escucha **solo** en `127.0.0.1`, en un puerto libre (o el de
`--puerto`), sin ninguna opción para otra interfaz. El servidor MCP por stdio no lo carga: `cli.ts` lo
despacha con un `import()` dinámico, y un test (`test/aislamiento.test.ts`) sigue con el analizador de
TypeScript los imports estáticos del código compilado desde `index.js` y falla si llega a algún archivo
de `studio/` o a un paquete que no sea el SDK o `zod`.

Cada petición pasa por este filtro, en este orden:

1. `Host` tiene que llegar **una vez** y ser exactamente `127.0.0.1:<puerto>` o `localhost:<puerto>`
   (sin otras mayúsculas): si no, `421`. Es la defensa contra el DNS rebinding. Node se queda con el
   primer `Host` repetido, así que las repeticiones se cuentan en `rawHeaders`; y el servidor se crea con
   `requireHostHeader: false` para que una petición sin `Host` reciba ese mismo `421`.
2. `Origin`, si viene, una vez y exactamente `http://127.0.0.1:<puerto>` o `http://localhost:<puerto>`
   (`null` no vale): si no, `403`.
3. `GET /?token=<t>`: el token son 32 bytes de `crypto.randomBytes` en base64url, nuevo en cada arranque y
   solo en memoria. Con el correcto, `303` a `/` y `Set-Cookie: pg_sesion_<puerto>=<s>; HttpOnly;
   SameSite=Strict; Path=/`, con `<s>` otro valor aleatorio de 32 bytes. El token es **de un solo uso**: el
   canje lo invalida. Todo lo demás (otro token, dos `token`, uno ya usado, el canje por `POST`), `401`.
4. `/api/**` exige esa cookie, una sola vez y con su valor: sin ella, con otro valor, sin `=` o repetida,
   `401`.
5. Un método distinto de `GET` (también `HEAD` y `OPTIONS`) exige `X-Phase-Gate: 1`, una vez: si no,
   `403`. Ninguna respuesta lleva cabeceras `Access-Control-*`, así que el preflight que esa cabecera
   provoca en un navegador nunca se concede. El cuerpo es JSON de hasta 64 kB: un `Content-Length` mayor
   es `413` sin leer nada, y un cuerpo por trozos se corta con `413` en cuanto pasa del límite, mientras
   llega.
6. Los estáticos salen solo de `studio/dist`: cada segmento se decodifica **una** vez y pasa por
   `validarSegmento` (fuera `%2F` y `%5C` decodificados, NUL, `..`, `:` y por tanto `::$DATA`, nombres
   reservados de Windows), nada que empiece por punto, y la ruta real tiene que quedar dentro de `dist`
   (`estaDentroReal`: un enlace, una junction o un nombre corto 8.3 que lleve fuera da `404`).

Toda respuesta lleva `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none';
form-action 'none'`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`; la API y el canje,
además, `Cache-Control: no-store`. Las cabeceras tienen 10 s para llegar y la petición entera, 15 s.

Al arrancar se imprime `http://127.0.0.1:<puerto>/?token=<token>` y, salvo `--no-abrir`, se abre con
`execFile` (Windows: `cmd /c start "" <url>`; macOS: `open`; Linux: `xdg-open`), después de comprobar que
la URL solo lleva `[A-Za-z0-9:/?=._-]`: un `&` partiría el comando de `cmd`. Se queda en primer plano hasta
`Ctrl+C`.

Cada fila del filtro tiene su test (`test/studio-seguridad.test.ts`, por sockets crudos para poder mandar
cabeceras repetidas, rutas sin normalizar o un cuerpo a trozos), y cada test se comprobó rompiendo a
propósito el código que protege: 29 mutaciones, y las 29 dejan algún test en rojo.

**Reemplaza** el descarte de una interfaz gráfica de "Varias documentaciones se resuelven registrando el
servidor dos veces, no con código" (2026-08-10): aquello era una app de escritorio con firma, tres builds
y autoactualización para elegir rutas. Esto es una página servida por el mismo paquete, sin nada que
instalar, que enseña lo que el servidor ya sabe.

**Riesgos aceptados.**

- Un navegador no separa las cookies por puerto (RFC 6265, §8.5): si la persona visita otro servidor en
  `127.0.0.1` con el mismo navegador, ese servidor recibe la cookie. Por eso su nombre lleva el puerto
  (dos Studios abiertos no se pisan la sesión), pero no es una frontera frente a otro programa local que
  ya escuche en `127.0.0.1`.
- El enlace con el token viaja en la línea de comandos de `cmd`, `open` o `xdg-open` mientras se abre. Un
  proceso del equipo que la lea a tiempo podría canjearlo antes; como es de un solo uso, la persona
  recibiría el `401`. Con `--no-abrir` no pasa por ninguna línea de comandos.

**Qué se descartó.**

- Servir la interfaz desde el propio servidor MCP: abriría un puerto en cada sesión que lanza el cliente,
  y el servidor por stdio dejaría de ser un proceso sin red.
- Que la página leyera los recursos MCP: un navegador no puede lanzar un servidor por stdio, así que haría
  falta un puente igualmente, y los recursos no tienen el estado de git, el diagnóstico ni las acciones.
- Una bandera para escuchar en otra interfaz: el Studio enseña rutas y documentos del equipo y ejecuta
  acciones; en la red no tiene sentido.

---

## 2026-10-16 — Las líneas de PROHIBIDO y AUTOVERIFICACIÓN que dependen de una regla son ranuras

**Decisión.** Cuatro ranuras nuevas (el catálogo pasa de 23 a 27): `fase-3/prohibido-lotes` y
`fase-3/autoverificacion-lotes` (las líneas del plan sin tabla de lotes o sin `lotes: N`), y
`fase-4/prohibido-commits` y `fase-4/autoverificacion-commits` (las del commit sin el OK del usuario y
la rama sin comprobar; en la AUTOVERIFICACIÓN de la Fase 4 pasan a ser los puntos 14 y 15, juntos). Cada
variante de regla pone las suyas: `sin-lotes` pide solo el frontmatter `lotes: 1`; `agente-propone`
prohíbe ejecutar `git add` o `git commit`; `auto`, commitear un lote que no quedó verificado; `ninguno`,
cualquier comando de git que escriba. Las variantes ya no dicen "lo que este prompt dice en PROHIBIDO y
en AUTOVERIFICACIÓN… no aplica".

Con el texto de fábrica no cambia nada de lo que llega al modelo: el oro de las Fases 1 a 3 sigue siendo
byte a byte el de la `2.2.0`.

A la vez, la ranura `fase-4/lotes` pasa a ser el ciclo con `get_batch_status` y `record_batch` (§6.9 del
plan), sin plantilla de recibo ni de índice, y `sin-lotes` le añade una línea **después** (modo
`despues`) en vez de sustituirla.

**Reemplaza en parte** "Las fases, los prompts y la deducción se resuelven por proyecto…" (2026-10-15),
que dejó esto como deuda para la Etapa 4 (E3-D5), y **amplía** la lista de ranuras de "La Fase 4
ejecuta lote por lote…" (2026-10-14).

**Qué se descartó.** Hacer ranura toda la sección PROHIBIDO: un preset la sustituiría entera y perdería
las prohibiciones que no dependen de ninguna regla (el push, reescribir fases anteriores).

---

## 2026-10-16 — El auditor recibe los commits ya verificados

**Decisión.** Al entregar el prompt de la Fase 5 (la siguiente a la que declara recibos), el servidor
añade al final un bloque **"COMMITS DE LA FASE 4 (verificados por el servidor al entregar este
prompt)"**: por cada repo, una tabla `Lote | Commit | Asunto | Vigente`, con la vigencia comprobada en ese
momento (`reverificar`: el commit sigue en la rama actual); si son consecutivos en la rama
(`sonConsecutivos`: `git rev-list --reverse <primero>^..<último>`, o todos los ancestros si el primero es
el commit raíz), el rango exacto para auditarlos (`git log --oneline a1b2c3d^..e4f5a6b` y `git diff
a1b2c3d^ e4f5a6b`); si no, que se audite cada uno con `git show`. Aparte, los lotes sin commit (sha256,
con su vigencia, o nota) y los que no entran en la auditoría (descartados, fallidos, pendientes, sin
recibo). Si un ancla ya no corresponde a la rama, su fila dice por qué y el bloque termina con "Hay anclas
que ya no corresponden a la rama: díselo al usuario antes de auditar."

El bloque tiene un plazo de 15 s: si git no responde, el prompt se entrega igual, con el mismo encabezado y
una línea que manda a `get_batch_status` con `reverificar`. Las anclas se verifican de seis en seis y cada
commit se resuelve una sola vez (con 40 lotes, uno detrás de otro, el bloque tardaba 9,5 s; así, 2,1 s,
medido). Si no se pueden leer los recibos, el bloque lo dice en vez de desaparecer.

**Amplía** "La Fase 5 audita los commits de los recibos y trata los pendientes sin comprobar como
bloqueantes" (2026-10-14): la entrada de la auditoría ya no se reconstruye leyendo recibos, la da el
servidor verificada. Si el usuario indica otro rango, sigue mandando el suyo (el texto de la regla 1
cambia en los prompts de la Fase 5).

**Qué se descartó.** Dar solo el rango: si un rebase cambió los SHA, el auditor revisaría commits que ya no
son los del lote sin saberlo. Bloquear el prompt si algo no es vigente: el auditor tiene que poder
decírselo al usuario, y el resto de la auditoría sigue valiendo.

---

## 2026-10-16 — La Fase 4 tiene granularidad de lote

**Decisión.** `EstadoTarea` gana `lotes` (`total`, `cerrados`, `actual` y `pendienteDeCommit`), que
se calcula solo cuando la fase siguiente es la que declara recibos, leyendo **solo frontmatter**: el
`lotes` del plan y la cabecera de cada recibo. `describeEstado` lo dice, y con él `get_active_task`,
`list_tasks` y `doctor`:

- `va en Fase 4 (Ejecución, lote 1 de 4); hechas: 1, 2, 3`
- `va en Fase 4 (Ejecución, lote 2 de 4, commit pendiente); hechas: 1, 2, 3`
- `va en Fase 4 (Ejecución; el plan no declara lotes); hechas: 1, 2, 3`

Un lote fallido no cuenta como cerrado. `ultimoCambio` toma también el recibo más reciente: durante la
Fase 4 es lo único que cambia en días, y una tarea en plena ejecución se ordenaba como si estuviera
parada.

**La fase sigue saliendo de los documentos.** Lo nuevo es el progreso **dentro** de la Fase 4, y se
deduce de archivos que escribe el servidor (`record_batch`), así que no depende de que el modelo se
acuerde de reportar nada. Con todos los recibos cerrados, la tarea sigue en la Fase 4 hasta que existe
su documento.

**Reemplaza** el límite de "La fase de cada tarea se deduce de sus documentos, no se guarda"
(2026-08-08): "la granularidad es fases terminadas, no a media fase".

**Qué se descartó.** Guardar el lote actual en el archivo de estado: sería otra copia de la verdad, y el
argumento de aquella entrada sigue valiendo.

---

## 2026-10-16 — Los recibos con ancla quedan sellados y la Fase 4 solo la escribe el servidor

**Decisión.** Dos reglas:

- **Sellado.** Un recibo con ancla `commit` o `sha256` (también uno manual de la 2.x con un hash) no se
  reescribe con `record_batch`. Para cambiar su ancla, el caso típico de un rebase o un squash que cambió
  el SHA, `record_batch` con `reanclar: true` y el ancla nueva: pasa por `pedirConfirmacion` ("El recibo
  L02 está sellado con el commit `a1b2c3d`. ¿Reemplazar su ancla por `e4f5a6b`?"), o por `force` sin
  elicitation. Solo cambia el ancla; "Verificación del commit" dice la comparación del commit nuevo y
  guarda, línea a línea, el historial ("Reanclado el AAAA-MM-DD: `viejo` → `nuevo`"). Con la fase ya
  cerrada también vale: con un solo lote, el recibo es el documento de la fase; con varios, se rehace el
  índice si lo generó el servidor.
- **Solo el servidor escribe la Fase 4** (H4). `motivoDeProteccion` gana dos reglas que se evalúan antes
  que las de siempre: un archivo de la subcarpeta de recibos ("Los recibos los escribe `record_batch`.") y
  el documento de la fase que declara los recibos ("Este documento lo genera `record_batch` al cerrar el
  último lote.") se rechazan **siempre** con `write_central_doc`, también para crearlos. Las dos aceptan la
  escotilla de confirmación de siempre (elicitation, o `force` sin ella) para reparar a mano un archivo
  dañado, y la respuesta lo dice: "Escrito a mano con confirmación; get_batch_status lo marcará como
  manual". Para que eso sea verdad, lo que entra por la escotilla queda siempre con `origen: manual` y sin
  `generado_por` en su frontmatter, diga lo que diga el texto: sin elicitation, `force` lo pone el modelo,
  y podía escribir un recibo "del servidor" sellado con un commit inventado (hallazgo 2 de la auditoría
  de la Etapa 4). Cierra E1-R3 (el modelo escribía el índice antes de tiempo, o un recibo con otro nombre).

`start_task` y `record_batch` no pasan por `write_central_doc`. Una tarea de la 2.x a medio camino sigue:
`record_batch` lee sus recibos manuales (tolerante) y continúa desde el siguiente lote.

**Amplía** "Un documento de fase se congela cuando existe el de una fase posterior" (2026-10-14): la tabla
de verdad de §3.7.3 gana tres filas, y cambian las que permitían escribir un recibo o el índice.

**Qué se descartó.** Bloquear sin escotilla: un recibo dañado a mano (o por un cliente que corta la
escritura) dejaría la tarea sin salida. Reescribir un índice que alguien escribió a mano: se avisa con
`doctor`, no se pisa.

---

## 2026-10-16 — `04 - Ejecución.md` lo genera el servidor; con un solo lote, el recibo se mueve

**Decisión.** El documento de la Fase 4 ya no lo redacta el modelo: lo escribe `record_batch` cuando
la fase se cierra, y su existencia es lo que la cierra.

- **Cuándo:** al terminar una llamada en la que **todos** los lotes `1…N` tienen recibo con ancla y
  ninguno está fallido; o con `cerrar_fase: true`, que lo decide el usuario. Con `cerrar_fase`, los
  lotes sin recibo se registran como `descartado` con `motivo_descarte` (obligatorio si falta alguno;
  el título sale de la tabla de lotes del plan si se puede leer), los fallidos se quedan como están, y
  hace falta la confirmación de la persona (elicitation, o `force` sin ella) **antes de escribir nada**:
  "Cerrar la Fase 4 con L03 y L04 descartados («motivo»). ¿Confirmas?". Un lote abierto con el commit
  pendiente lo impide.
- **Con más de un lote: un índice** (`ensamblarIndice`), determinista. Frontmatter `lotes` y
  `generado_por: mcp-phase-gate`; la rama común a los commits (o "varias (ver lotes)"); la fecha de
  cierre del recibo escrito más tarde, no la hora del ensamblado; la línea Estado ("sin pendientes"
  solo si todo está verificado o descartado y nada espera al usuario, más los descartados); la tabla
  de lotes (con columna Repo solo si algún lote tiene repo); "Espera al usuario" con las filas de los
  recibos, sin reescribir; y "Validaciones pendientes" solo si hay lotes con pendientes o fallidos (B1).
  Los cinco formatos tienen su índice de oro en `test/oro/indice-*.md`, comparado byte a byte.
- **Con un solo lote (H2):** mientras el lote está abierto, su recibo vive en la subcarpeta, como los
  demás; al cerrarse, el servidor lo **mueve** a `04 - Ejecución.md` (con `lotes: 1` y `generado_por`
  en su frontmatter) y borra la subcarpeta si queda vacía. Queda un solo archivo, como pedía R2, y la
  fase no aparece cerrada con el commit pendiente.

**Amplía** R2 (§1.2 del plan) y "Los recibos de lote viven en una subcarpeta que declara el prompt"
(2026-10-14). **Cierra** la ventana aceptada de "La Fase 4 ejecuta lote por lote…" (2026-10-14): con
`lotes: 1`, el documento ya no existe antes del commit, y un lote que el usuario rechaza se queda en la
subcarpeta.

**Qué se descartó.** Contar las filas de la tabla del plan para saber cuántos lotes hay (H3): solo la usa
este lote para el objetivo de un lote descartado. Regenerar el índice en cada llamada: el documento de
la fase existe si y solo si la fase está cerrada (§1.1), así que se escribe una vez, al cerrar.

---

## 2026-10-16 — `record_batch` registra cada lote en dos tiempos: antes y después del commit

**Decisión.** Una tool nueva, `record_batch`, escribe el recibo de cada lote de la Fase 4 en
`<tarea>/04 - Ejecución/L0x - <slug>.md`. El modelo le pasa campos (título, estado, qué se hizo,
archivos, verificación, lo que espera al usuario, desvíos, decisiones y las secciones condicionales) y
el ancla; el servidor arma el recibo (`escribirRecibo`) y verifica el ancla (`anclarCommit` o
`anclarArtefacto`).

- **Dos tiempos para toda política con git** (H1). Primero, ANTES del commit, el contenido: el recibo
  queda con el commit pendiente, y si el chat se corta ahí ya dice qué se hizo y qué se comprobó.
  Después del commit, una segunda llamada con `lote` y `commit` lo ancla sin tocar el contenido. Si el
  commit ya existe al registrar, va todo en una llamada. Sin git, o con la política `ninguno`, una sola
  llamada con `artifact_path` o `verification_note`.
- **Número de lotes:** solo del frontmatter del plan (`lotes: N`, de 1 a 99). Sin él, es un error
  (H3): la tabla del plan es para personas, y contar sus filas daría un número que nadie declaró.
- **Orden:** un lote exige que los anteriores tengan recibo con ancla; un fallido o un descartado
  cuenta como cerrado.
- **Modos:** sin recibo, se crea (con título, estado, qué se hizo y verificación); con el commit
  pendiente, se reemplaza el contenido (y se renombra si cambia el título) o se ancla; un recibo
  fallido o anclado a una nota se reemplaza entero (es otro intento); uno **sellado** (ancla `commit` o
  `sha256`) no se reescribe.
- **Repo del lote:** el indicado, o el único de la tarea; con varios, hay que indicarlo; sin repos,
  ninguno.
- **Ancla según la política efectiva** (tarea, manifiesto, preset): con git y política distinta de
  `ninguno`, el ancla es el commit (o pendiente); sin git, `artifact_path` o `verification_note`, y uno de
  los dos es obligatorio; un lote fallido o descartado se ancla a una nota. Una sola ancla por llamada.
- **Escritura:** solo dentro de la subcarpeta de recibos de la tarea (comprobado sobre la ruta real),
  con un temporal y un renombrado, y comparando el `mtimeMs` del recibo leído justo antes de escribir:
  si otra ventana lo cambió, o creó el de ese lote mientras tanto, la llamada falla sin escribir (E4-R6).
  Esa comprobación y la escritura van bajo un **candado de la tarea** (`.record_batch.lock`, creado en
  exclusiva en su carpeta), para que dos procesos no las recorran a la vez: sin él, dos ventanas que
  registraban el mismo lote en el mismo instante pasaban las dos la comprobación y dejaban dos recibos
  (hallazgo 1 de la auditoría de la Etapa 4). Quien no consigue el candado en 3 s falla y pide volver a
  llamar; un candado de más de 30 s se da por abandonado.
- **Proyecto y tarea:** el proyecto como en las demás tools que escriben (una coincidencia débil de
  Roots no basta); la tarea, la indicada o la activa **guardada**: una deducida por fecha no vale para
  escribir. Para leer (`get_batch_status`) sí vale una deducida, y la respuesta lo dice: equivocarse de
  tarea al leer no pisa nada.
- **Un commit que no llega.** Si el usuario decide no hacer el commit de un lote pendiente, ese lote
  bloquearía a los siguientes: se cierra con `record_batch` y solo `lote`, `estado: descartado` (o
  `fallido`) y, si se quiere, `verification_note`; el contenido que ya tenía se conserva. Si dos lotes
  acabaron en un mismo commit, uno se ancla a él y el otro se descarta con una nota que lo diga ("un
  commit, un lote" no deja anclar el mismo commit dos veces). Las dos salidas las pidió la auditoría de
  la Etapa 4.

**Reemplaza en parte** "La Fase 4 ejecuta lote por lote y hace el commit de cada uno con el OK del
usuario" (2026-10-14): el recibo ya no lo redacta el modelo con `write_central_doc`.

**Qué se descartó.** Escribir el recibo solo después del commit: un chat cortado entre el commit y el
recibo perdía lo que se comprobó, que es justo lo que el ciclo de la Etapa 1 quería guardar. Bloquear la
tarea activa deducida con una confirmación: es más simple pedir `task_name`, que el modelo ya conoce por
`get_active_task`.

---

## 2026-10-16 — Un lote se ancla a un commit en la rama actual, a un sha256 o a una nota

**Decisión.** Lo que demuestra que un lote se hizo es su **ancla** (`src/anclas.ts`), y el servidor la
comprueba al registrarla:

- **Commit** (`anclarCommit`), cuando el lote tiene git. El hash se valida con `/^[0-9a-f]{7,40}$/i`
  **antes de llamar a git**: así no entran `HEAD`, un nombre de rama, una opción como `--help` ni un
  prefijo corto (git resuelve desde 4 caracteres). Después, `git rev-parse --verify --end-of-options
  <sha>^{commit}` da el SHA completo, que es el único que usan las consultas siguientes. Va **sin
  `--quiet`** (como pedía §6.3): con él, git calla el aviso de un prefijo ambiguo y el error decía que
  el commit no existía (hallazgo 3 de la auditoría de la Etapa 4; probado con una colisión real de 7
  caracteres); `git merge-base --is-ancestor <sha> HEAD` exige que esté en la rama actual (si está en
  otra, el error dice en cuáles, con `git branch --contains`); y `git diff-tree --root` da los archivos
  que toca, para compararlos con la tabla Archivos del recibo. Si no coinciden, es un **aviso** que
  queda escrito en "Verificación del commit" (H5), no un bloqueo. Un mismo commit no puede anclar dos
  lotes.
- **sha256** (`anclarArtefacto`), sin git: el de un archivo del repo o de la carpeta del proyecto en la
  Documentación, con la misma contención que `read_repo_file` (relativa, cada segmento portable, nada de
  `.git` ni en lo pedido ni en la ruta real, dentro de la base real), solo archivos normales de hasta
  256 MB, y en streaming desde el mismo descriptor que se comprobó. La ruta se guarda como
  `repo:<id>/<ruta>` o `proyecto:<ruta>`.
- **Nota** (`verification_note`), cuando no hay nada que sellar.

`reverificar` repite la comprobación más tarde (para `get_batch_status` y la Fase 5): un commit que ya
no está en la rama (un `--amend`, un rebase, un squash) deja de estar vigente; un sha256 que no coincide
se recalcula con los finales de línea cambiados, en las dos direcciones, y si así coincide se informa
"idéntico salvo finales de línea" (E4-R2: con `core.autocrlf`, un archivo de texto tiene otros bytes en
Windows que en Linux). Solo en texto: un archivo con un byte NUL en sus primeros 8000 (la heurística de
git) es binario, y en un binario quitar un `0x0D` es un cambio de verdad (hallazgo 8 de la auditoría de
la Etapa 4).

**Amplía** "Git se consulta por una sola puerta, de solo lectura y sin efectos" (2026-10-15): todas
estas consultas pasan por ella, y el texto del modelo que llega a git es solo un hash ya validado.
Además, `git show` lleva `--no-show-signature`: con `log.showSignature` activo, `show` verifica la
firma de un commit firmado ejecutando `gpg.program`, que también puede venir en `.git/config`. Se
comprobó en este equipo (git 2.51) con un commit de firma falsa y un `gpg.program` trampa: `git show`
normal lo ejecuta, la puerta no. El test repite ese control positivo, y el de `core.fsmonitor` sobre
cada consulta nueva.

**Qué se descartó.** `git cat-file -e`, que acepta `HEAD` y solo dice si el objeto existe (§6.1).
Bloquear cuando los archivos del commit no son los declarados: un archivo generado o un cambio de
última hora harían imposible anclar el lote, y la Fase 5 ya audita el commit entero.

---

## 2026-10-16 — Los recibos son datos con un formato determinista que escribe el servidor

**Decisión.** Un recibo de lote es un dato (`Recibo`, en `src/recibos.ts`) y `src/recibos.ts` es el
único lugar que lo lee y lo escribe. `escribirRecibo` produce la plantilla de la Etapa 1 con claves
nuevas en el frontmatter, siempre en este orden: `lote`, `de`, `repo`, `rama`, `estado`, `commit`,
`fecha` (las de la 2.x, en su sitio), `ancla` (`commit`, `sha256`, `nota` o `pendiente`), los datos de
esa ancla (`commit_completo` y `asunto`; `artefacto`, `sha256` y `bytes`; o `nota`), `registrado` (la
hora ISO de la escritura) y `origen` (`servidor` o `manual`). Debajo, los encabezados de siempre, en su
orden, las secciones condicionales que traigan texto (en el orden de la plantilla) y, solo con ancla
`commit`, "Verificación del commit".

- **Determinista:** el mismo recibo da los mismos bytes, en LF y con un salto final, y escribir lo que
  se leyó de un recibo escrito aquí vuelve a dar los mismos bytes (lo fija una prueba de ida y vuelta
  con las cuatro anclas). Son los mismos **bytes**, no siempre el mismo dato: una línea del texto que
  empieza por `## ` vuelve sangrada un espacio, un `<br>` escrito tal cual en una celda vuelve como salto
  de línea, y una sección que solo decía "Nada." vuelve vacía (lo señaló la auditoría de la Etapa 4).
- **Sin encabezados vacíos:** una sección sin texto dice "Nada.", "Ninguno." o "Ninguna."; al leer,
  esas formas cuentan como vacías.
- **Tablas:** `|` va como `\|` y un salto de línea dentro de una celda, como `<br>`.
- **Una línea:** los valores del frontmatter son de una línea; los saltos de una nota o de una ruta van
  escapados (`\n`, `\\`). Un repo o una rama que no hay se escriben `—`. Una línea del texto que empieza
  como un encabezado (`# `, `## `) se sangra un espacio, para que al leer no parta la sección.
- **Lectura tolerante:** un recibo escrito a mano con la 2.x se lee sin lanzar. Sin `ancla`, se deduce
  de `commit` (un hash es un commit sin verificar; `pendiente`; `no aplica` es una nota); sin `origen`,
  es `manual`; una sección que falta se lee vacía, y un `## ` que no es de la plantilla se queda dentro
  de la sección donde aparece. Un estado que no se reconoce queda como `con pendientes`: nunca se da por
  bueno. Se normalizan el BOM y `\r\n` antes de leer (§1.3), con un lector de frontmatter propio que no
  quita comillas (un asunto de commit puede empezar por una).

**El nombre del archivo lo hace el servidor** (`nombreDeRecibo`): `L` y el número con dos dígitos,
`" - "` y un slug del título en NFC, en el que todo lo que no es letra, número, espacio o guion pasa a
espacio, cortado a 40 caracteres sin partir palabras (validación V7) y sin punto ni espacio al final;
vacío, es `lote`. El resultado pasa `validarSegmento`. El ajuste A3 de la Etapa 1 pedía al modelo que
no usara `:` `/` `\`…; ahora lo hace cumplir el código.

**Amplía** "Los recibos de lote viven en una subcarpeta que declara el prompt" (2026-10-14): la
subcarpeta y el nombre siguen siendo los mismos, pero el contenido ya no lo redacta el modelo con una
plantilla sino el servidor con campos.

**Qué se descartó.** YAML de verdad en el frontmatter: el resto del proyecto lee `clave: valor` con
`separarFrontmatter`, y un recibo de la 3.0 tiene que seguir siendo legible por las reglas de la 2.x
(por ejemplo, el aviso de pendientes heredados, que mira `estado`). Guardar la hora de verificación del
ancla aparte: el servidor verifica el ancla en la misma escritura, así que es `registrado`.

---

## 2026-10-15 — `init` escribe la configuración del cliente con copia, diff y confirmación

**Decisión.** `npx mcp-phase-gate init` registra el servidor en los clientes de este equipo:

- **Claude Code** (si `claude --version` responde): `claude mcp add <clave> --scope user --env
  PHASE_GATE_DOCS_PATH=… --env PHASE_GATE_REPOS_PATH=… -- npx -y mcp-phase-gate`.
- **Cursor** (si existe `~/.cursor/`): una entrada en `~/.cursor/mcp.json`, bajo `mcpServers`. En
  Windows, con `PHASE_GATE_ELICITATION=off`, por el bug abierto en el que el formulario de
  confirmación no aparece (validación V4).
- **VS Code** (si existe su carpeta de usuario): una entrada en su `mcp.json`, bajo `servers`, con
  `"type": "stdio"`.

Las rutas salen de `--docs`/`--repos`, de las variables, o se preguntan en una terminal; sin
terminal y sin ellas, es un error. Además: `--comandos` copia los `/fN` (con la marca `<!-- generado
por mcp-phase-gate init vX.Y.Z -->`) a `~/.claude/commands/` o `~/.cursor/commands/`;
`--migrate` crea `phase-gate.json` con `"preset": "software-replica"` (u otro con `--preset`) en
los proyectos que no lo tienen, o con `--solo-este-equipo` escribe `presetPorDefecto` en
`machine.json`; `--dry-run` dice todo lo que haría sin escribir nada. Al final imprime cómo poner
un candado a `git push` y ejecuta `doctor`. Sale con 0, con 1 si alguna acción no se hizo, y con 2
si los argumentos no valen.

**Cómo escribe en archivos que no son suyos.**

1. Un archivo que no existe, o que existe vacío (el `mcp.json` de VS Code puede tener 0 bytes), es
   `{}`.
2. Se toleran comentarios y comas finales, solo para leer. Un JSON que aun así no se entiende **no
   se toca**: se imprime el bloque para pegarlo a mano.
3. **Un registro que ya existe no se duplica**: si otra clave ya ejecuta `mcp-phase-gate` (un `npx`
   o un `build/index.js` de un clon), se actualiza esa entrada y **conserva su clave**, porque
   cambiarla cambia el nombre de todas las tools y los prompts y rompe los permisos ya concedidos.
   Solo con `--clave` explícita se renombra, y se avisa. Se cambian las dos rutas (con los nombres
   `PHASE_GATE_*`, quitando sus alias `ORQUESTADOR_*`, que quedarían en discrepancia); el comando y
   el resto de variables se conservan.
4. Si la entrada queda igual: "sin cambios". Si cambia, o si al reescribir se perderían comentarios,
   se muestra el diff y hace falta `--yes` o confirmarlo en la terminal. Una clave que ya usa otro
   servidor no se pisa nunca.
5. Antes de escribir, copia `<archivo>.bak-AAAAMMDD-HHMMSS`. Se escribe JSON estricto con dos
   espacios.

Un comando `/fN` sin la marca es de la persona y no se pisa sin `--yes` (entonces, con copia).
`--migrate` solo crea manifiestos, nunca sobrescribe.

**En Claude Code, un registro que ya existe no se toca.** `claude mcp list` enseña la clave y el
comando, no las variables, así que no hay diff posible; init dice el `claude mcp remove` y el
`claude mcp add` con la misma clave para hacerlo a mano. Se probó el formato de `mcp list` en este
equipo (Claude Code 2.1, `clave: comando - estado`), y un `init --dry-run --cliente todos` contra la
configuración real: reconoce el registro existente de Cursor y propone el diff sin escribir nada.

**El candado de `git push`**, solo informativo y graduado con honestidad: las reglas `deny` de
Claude Code (`Bash(git push *)` **y** `PowerShell(git push *)`, validación V6) no son una frontera
de seguridad (`git -C . push` las esquiva); un hook `pre-push` es más firme pero `--no-verify` lo
salta; la única frontera real está en el remoto (protección de ramas) o en que el agente no tenga
credenciales.

**Reemplaza en parte** el descarte del 2026-08-10, en "Varias documentaciones se resuelven
registrando el servidor dos veces, no con código", de una app que escribiera la configuración "para
un público que ya edita un `mcp.json` a mano". La app sigue descartada; lo que cambia es que
escribir la configuración ya no es un paso manual, porque con la 3.0 hay más que escribir (rutas,
presets, comandos) y equivocarse en un JSON a mano deja el cliente sin el servidor.

**Qué se descartó.** Que init escriba también el candado de `git push` en la configuración de Claude
Code: es una decisión de seguridad de la persona, y presentarlo como algo que init "instala" haría
creer que es una frontera.

---

## 2026-10-15 — Git se consulta por una sola puerta, de solo lectura y sin efectos

**Decisión.** Toda llamada a git pasa por `git(dir, args)` de `src/git.ts`: `execFile` (sin
shell), con `-c core.fsmonitor=false` delante de todo, `GIT_OPTIONAL_LOCKS=0`,
`GIT_TERMINAL_PROMPT=0` y `LC_ALL=C`, un plazo de 10 s, salida acotada a 1 MB y `windowsHide`.
Los argumentos son constantes del código: ningún texto que venga del modelo llega a la línea de
comandos. Los errores se dicen para una persona: git no instalado, "no es un repositorio",
"dubious ownership" (con el `git config --global --add safe.directory …` exacto) o el plazo
vencido.

Sobre ella, dos tools nuevas, de solo lectura e idempotentes:

- **`read_repo_file(project?, repo, path)`** lee un archivo de un repo del proyecto por su id,
  esté donde esté en este equipo (`machine.json` o `<PHASE_GATE_REPOS_PATH>/<dir>`). Contención
  con la ruta real, cada segmento portable, y **nada de `.git`**: se rechaza todo segmento que sea
  `.git` o empiece por `.git`, sin distinguir mayúsculas, y la misma regla se aplica a la ruta ya
  resuelta, para que un enlace interno (o un nombre corto 8.3 como `GIT~1`) no lleve a
  `.git/config`. Lectura acotada a 1 MB de texto.
- **`repo_status(project?, repo?)`** devuelve, de un repo o de los de la tarea activa, la rama (o
  si está separado), el commit, cuántos van adelante y atrás de su upstream, y si el árbol está
  limpio, con cuántos cambios y cuántos sin seguimiento. Sale de `git status --porcelain=v2
  --branch`, un formato estable para máquinas, y va también como `structuredContent` con su
  `outputSchema`.

El bloque CONFIGURACIÓN DEL PROYECTO añade a cada repo su estado (`· git · rama \`feat/x\` · árbol
limpio`). Si tarda más de 3 s o falla, esa columna se omite y el prompt se entrega igual.
`read_cross_repo` se conserva tal cual; su descripción remite a `read_repo_file` cuando el proyecto
declara repos.

**Por qué una puerta y esas banderas.** Leer también tiene efectos. `git status` puede reescribir el
índice y tomar `index.lock`, y estorbar al commit que el agente esté haciendo en ese momento. Y si el
repo configura `core.fsmonitor`, git **ejecuta** ese comando: un repo clonado de cualquier sitio
podría traerlo. Se comprobó en este equipo (git 2.51 para Windows): una trampa en `core.fsmonitor`
se dispara con un `git status` normal y no con la puerta; el test lo repite con su control positivo.
`LC_ALL=C` hace que "not a git repository" se reconozca sin depender del idioma del equipo.

**Los filtros de `.gitattributes` también se anulan** (añadido tras la auditoría de la etapa, que lo
encontró). Un `filter.<nombre>.clean` o `.process` definido en `.git/config` es otro comando que
`git status` ejecuta, con cualquier archivo que cambió de fecha, y con `GIT_OPTIONAL_LOCKS=0` en cada
llamada. Antes de cada consulta, la puerta lee los drivers definidos con `git config --get-regexp
'^filter\.'` (leer la configuración no ejecuta nada) y anula cada uno con `-c filter.<n>.clean=`,
`smudge=`, `process=` y `required=false`; un nombre que no se puede escribir en un `-c` hace fallar
la consulta. Comprobado con control positivo en git 2.51: con el valor vacío, ni `clean` ni `process`
se ejecutan. Ni los hooks, ni `core.hooksPath`, ni `include.path` se ejecutan con `status`.

**Sigue sin escribir en git** (principio 3 del plan): los commits los hace el agente con su terminal.
Esta puerta es la única forma en que el servidor toca git, y solo lee.

**Una excepción a la regla de `.git`: `.github`.** No puede resolver a `.git` (es otro nombre, y la
ruta resuelta se comprueba igual) y guarda los workflows de CI, que una revisión de varios repos
necesita leer. Consecuencia aceptada: `.gitignore`, `.gitattributes` y `.gitmodules` no se leen con
esta tool (`.gitmodules` puede llevar una URL con credenciales).

**Qué se descartó.** Exponer `git log` o `git diff` como tools: la Fase 5 los usa desde la terminal
del agente, que ya los tiene; repetirlos aquí sería una superficie más que defender sin un caso que
la pida.

---

## 2026-10-15 — El servidor deduce el proyecto de las raíces del cliente

**Decisión.** El servidor pide al cliente sus raíces (MCP Roots: las carpetas que tiene abiertas)
al terminar el initialize, y otra vez cuando el cliente avisa con `notifications/roots/list_changed`.
Solo si el cliente declaró la capacidad `roots`: el SDK no lo comprueba, y la petición volvería con
error. Cada URI pasa por `fileURLToPath` (que resuelve igual `file:///C:/…`, `file:///c:/…` y el
`file:///c%3A/…` de VS Code, y decodifica espacios y acentos) y por `rutaReal`; nunca se manipula
como texto. Las que fallan se descartan y quedan en el log.

Las raíces se cruzan con los proyectos:

| Coincidencia | Fuerza |
|---|---|
| La raíz es un repo del proyecto (según su `phase-gate.json` y `machine.json`) o está dentro de él | fuerte |
| La raíz está dentro de `<DOCS>/<PROYECTO>` | fuerte |
| Un repo del proyecto está dentro de la raíz | débil |

Un solo proyecto con coincidencia fuerte, o ninguno fuerte y uno solo débil, es el proyecto; varios
fuertes son ambiguos; cualquier otro caso (también varios débiles) no apunta a ninguno.

**`project` pasa a ser opcional** en `start_task`, `switch_task`, `read_central_doc` y
`write_central_doc` (con `task_name` + `file_name`), además de `get_phase_prompt` y los `/fN`, que ya
lo eran. El orden de resolución: el `project` explícito; si no, el de las raíces; y solo para la
compuerta y el aviso de pendientes, el único puntero, como antes. Si no se puede resolver, la tool
falla con "No sé en qué proyecto estás: indica `project`.", con los candidatos si son varios. Cuando
se deduce, la respuesta lo dice en una línea ("Proyecto deducido de la carpeta abierta: PROYECTO-A
(la carpeta abierta `…` es el repo `api` de PROYECTO-A).") —en `read_central_doc`, como una parte
aparte de la respuesta, para no mezclarla con el documento—. Estrenar un proyecto exige siempre
`project`: un nombre nuevo no se deduce.

**Amplía** la entrada del 2026-08-08 "La compuerta avisa, no bloquea, y la resuelve el servidor": el
servidor resuelve ahora también el proyecto, con un dato que el cliente ya tiene y que el modelo no
tiene que adivinar. De obligatorio a opcional es un cambio compatible para quien ya pasa `project`.

**Por qué el puntero no se usa para todo.** El puntero dice cuál fue la última tarea de cada
proyecto, no en qué proyecto está esta ventana. Para la compuerta, equivocarse cuesta un aviso de
más; para elegir el preset, las reglas o el proyecto donde escribir, cuesta instrucciones o
archivos equivocados. Las raíces sí dicen dónde está la ventana.

**Una coincidencia débil no basta para escribir** (añadido tras la auditoría de la etapa). Con la raíz
de un disco o la carpeta del usuario abiertas, cualquier proyecto con repos "estaba dentro", y si solo
uno los declaraba, `write_central_doc` escribía en él sin que la IA lo nombrara. Ahora esas dos raíces
no dan coincidencia débil, y una débil sirve para leer (`get_phase_prompt`, `read_central_doc`,
`read_repo_file`, `repo_status`, `/fN`) pero no para escribir: `start_task`, `switch_task` y
`write_central_doc` piden `project` si la carpeta abierta solo contiene un repo del proyecto. Además,
solo cuenta la respuesta de la última petición de raíces: una anterior que llegaba tarde, tras un
`roots/list_changed`, volvía a poner las raíces viejas.

**Las raíces se esperan.** Una tool llamada justo después del initialize espera a que llegue la
respuesta de `roots/list` (como mucho 5 s): sin eso, la primera llamada de cada sesión no vería el
proyecto. Si el cliente no responde, todo sigue como sin raíces.

**Qué se descartó.** Deducir el proyecto de un repo que no está en ningún manifiesto, por el nombre
de su carpeta: dos proyectos pueden tener un repo `api`, y un nombre parecido no es una prueba.

---

## 2026-10-15 — El preset por defecto es `software`; la réplica pasa a `software-replica`

**Decisión.** Los prompts de fábrica dejan de suponer un proyecto sin suite y con réplica de datos.
Cambia el contenido por defecto de seis ranuras, y nada de la estructura:

| Ranura | Antes (2.2.0) | Ahora (`software`) |
|---|---|---|
| `fase-1/verificacion` | una consulta contra una réplica, una consola del framework | correr la prueba o el comando que confirma o descarta, leer los logs |
| `fase-2/verificacion` | consultas contra una réplica, conteos de volumen | barridos de consumidores, código de las dependencias, las pruebas de la zona |
| `fase-3/comprobaciones` | la clave de idioma, la relación, el dump de esquema | la función y su firma, la configuración, lo que exporta un módulo, quién más lo consume |
| `fase-3/pruebas` | sin suite; comparación de volcados contra la réplica | con suite, el plan la usa (y dice qué prueba nueva); sin suite, lo que sí se ejecuta |
| `fase-4/verificacion` | consola del framework, consultas contra la réplica, SQL antes y después | la suite si existe, tipos, linter, scripts, la salida real |
| `fase-4/pruebas` | sin suite, una línea y sigue | con suite, córrela por lote y un lote en rojo no se da por verificado |

El texto de la 2.2.0 de esas seis ranuras pasa, byte a byte, al preset
**`presets/es/software-replica.md`** (`lotes: true`, `commits: agente-commitea-con-OK`). Se generó
extrayendo las ranuras con un script, no a mano.

**La prueba de oro** (`test/oro.test.ts`): con `software-replica`, por manifiesto o por
`presetPorDefecto` de `machine.json`, y también sin proyecto, `ensamblarFase(N, …,
{ incluirConfigProyecto: false })` produce exactamente el texto que entregaba `loadPhasePrompt(N)`
en la `2.2.0`, en las cinco fases. Las copias de `test/oro/2.2.0/fase-N.txt` salen del build de la
etiqueta `v2.2.0`. Y la red puede fallar: con `software`, las fases 1 a 4 ya no coinciden.

**Reemplaza** la entrada del 2026-08-07 "Sin suite de pruebas: la comparación contra la réplica ocupa
ese lugar", que deja de ser la regla general: era la regla de un proyecto concreto, escrita como si
fuera la de todos. Sigue entera dentro de su preset.

**Por qué el genérico es "con suite si la hay".** Prohibir inventar pruebas sigue valiendo: es lo que
evita que el modelo proponga escribir la primera prueba del módulo en mitad de una tarea. Lo que ya
no se supone es que no existan; un proyecto con suite la usa como criterio de salida de cada lote.

**Para quien ya usaba la réplica** (riesgo E3-R1): `presetPorDefecto: "software-replica"` en su
`machine.json`, o `init --migrate`, que escribe `"preset": "software-replica"` en cada proyecto sin
manifiesto. El bloque CONFIGURACIÓN DEL PROYECTO dice en cada prompt qué preset se usa y por qué
(`por defecto; este proyecto no tiene phase-gate.json`), y `doctor` avisará con `PRESET-IMPLICITO`.

**Un ajuste al texto del plan.** La ranura `fase-3/comprobaciones` abarca el párrafo entero, desde
"Antes de escribir el primer paso, comprueba…"; el texto genérico del plan era solo el fragmento que
empieza en "que el identificador…". Se conservó la entrada del párrafo para que la frase siga
completa.

---

## 2026-10-15 — Las fases, los prompts y la deducción se resuelven por proyecto; la política de commits es configurable y el push queda fuera de cualquier variante

> **Reemplazada en parte** el 2026-10-16 por "Las líneas de PROHIBIDO y AUTOVERIFICACIÓN que dependen
> de una regla son ranuras": el punto "Las partes fijas que contradirían una variante" ya no vale (cada
> variante pone sus propias líneas). Y desde "`04 - Ejecución.md` lo genera el servidor…" (2026-10-16),
> `ninguno` ancla el lote a un artefacto o a una nota, y `sin-lotes` ya no copia la plantilla del recibo.

**Decisión.** Lo que hasta ahora era global pasa a resolverse con el proyecto:

- **Las fases de un proyecto** (`fasesDe(proyecto)`) salen de sus capas de cuerpos: fábrica,
  global y la del proyecto (`<DOCS>/<PROYECTO>/.phase-gate/prompts/`). Si un proyecto sustituye una
  fase con otro `documento`, sus tareas se deducen, se protegen (R4) y se listan con ese nombre.
  `list_tasks`, `get_active_task`, `switch_task`, `write_central_doc`, la compuerta, el aviso de
  pendientes, los recursos y el diagnóstico usan las fases de SU proyecto.
- **El prompt de una fase** (`ensamblarFase(fase, proyecto, tarea)`) sale de todas las capas del
  proyecto: el preset efectivo, las variantes de regla y la capa del proyecto. El **preset** sigue
  la precedencia frontmatter de la tarea > `phase-gate.json` > `presetPorDefecto` de `machine.json`
  > `software`; las **reglas** (`lotes`, `commits`), `reglas` del manifiesto > frontmatter del
  preset > fábrica. Sin proyecto, entran la fábrica, el preset de `machine.json` (o `software`), sus
  reglas y la capa global.
- **El bloque `## CONFIGURACIÓN DEL PROYECTO`** se añade al final del prompt cuando se sabe el
  proyecto: preset y su origen (`de la tarea`, `del proyecto`, `de machine.json` o `por defecto;
  este proyecto no tiene phase-gate.json`), idioma, lotes y commits, los repos de la tarea con su
  ruta en este equipo, los comandos de verificación y si hay un PR por repo. Es dato, no prosa.
- **`get_phase_prompt` antepone una nota** por cada bloque huérfano de la fase que entrega:
  `> Nota del servidor: el bloque «fase-3/verificaion» de <archivo>:<línea> no encaja en ninguna
  ranura y se ignoró.`
- **`start_task` gana `repos` y `preset`**, opcionales. Se validan contra el manifiesto y los
  presets disponibles antes de crear nada (un id o un preset desconocido devuelven la lista de los
  válidos) y se escriben como frontmatter del contexto inicial. Cambiarlos después exige reescribir
  el contexto inicial, que está protegido: es deliberado, cambiar de repos a mitad de tarea es una
  decisión.
- **Los MCP Prompts** se listan sin proyecto, pero `/fN` con `project` toma el texto del
  `comandos/fN.md` de ese proyecto si lo tiene.

**Variantes de la política de commits** (`prompts/es/reglas/`), cada una un archivo de bloques que
sustituye la ranura `fase-4/commits`: `agente-propone` (el agente propone, el usuario commitea y le
da el hash), `auto` (el agente commitea en cuanto el lote queda `verificado`, sin esperar OK) y
`ninguno` (sin commits; el recibo queda con `commit: no aplica`). `agente-commitea-con-OK` es el
contenido de fábrica y no tiene archivo. Con `lotes: false`, `reglas/sin-lotes.md` sustituye
`fase-3/lotes` y `fase-4/lotes`: un solo lote, cuyo recibo es el documento de la fase, con la
plantilla copiada entera (el modelo no ve el plan).

**El push no es una variante.** Ninguna política lo permite y ninguna lo hace configurable: lo que
sale del equipo hacia el remoto, y el PR, los hace siempre la persona (decisión de la iteración 8
del plan). Las variantes que commitean (`auto`) conservan lo que añadió la auditoría de la Etapa 1
al contenido de fábrica: comprobar la rama antes del primer commit, `git add` archivo por archivo
(nunca `-A`, `.`, `-u`, una carpeta ni `commit -a`), y nunca `--no-verify` ni `--amend`.

**Las partes fijas que contradirían una variante.** PROHIBIDO y AUTOVERIFICACIÓN de la Fase 4 dicen
"un commit sin el OK del usuario", y los de la Fase 3, "un plan sin la tabla de lotes". No son
ranuras, así que una variante no puede cambiarlos. Cada variante lo dice dentro de su bloque: qué
de esas secciones no aplica con esa política. Es un parche de texto, no de estructura; la revisión
de la Fase 4 de la Etapa 4 es el sitio para convertir esas líneas en ranuras.

**Amplía** la entrada del 2026-08-08 "La fase de cada tarea se deduce de sus documentos, no se
guarda" (sigue deduciéndose; ahora con los nombres de documento de su proyecto) y la del 2026-10-14
"La Fase 4 ejecuta lote por lote y hace el commit de cada uno con el OK del usuario" (esa política
sigue siendo la de fábrica; ahora es una de cuatro).

**Errores explícitos.** Un manifiesto inválido o un preset que no existe hacen fallar
`get_phase_prompt` con la ruta del problema: entregar el prompt de fábrica en su lugar sería el
fallo silencioso que el manifiesto evita. En los listados de todos los proyectos, el proyecto roto
sale con su error y los demás se listan igual. Un proyecto que no existe no impide entregar un
prompt: se entrega sin configuración de proyecto, como antes, y (desde la auditoría de la etapa) con
una nota al principio que dice qué preset se usó y que falta `project`; sin ella, el modelo podía creer
que tenía las reglas de su proyecto.

**Qué se conservó a propósito.** El único puntero sigue sirviendo solo para la compuerta y los
pendientes, no para elegir el preset ni el bloque de configuración: deducir el proyecto de un
puntero puede equivocarse, y equivocarse de preset cambia todas las instrucciones.

---

## 2026-10-15 — Cada proyecto puede declarar un `phase-gate.json`; cada equipo, un `machine.json`

> **Ampliada** el 2026-10-18 por "El idioma es del proyecto y se deduce primero del disco…": `idioma` acepta
> `"en"` y deja de tener valor por defecto. Y el 2026-10-19 por "Un manifiesto sin `idioma` es español…": un
> manifiesto sin `idioma`, como los de la 3.0 y la 3.1, se sigue leyendo como español.

**Decisión.** Dos archivos de configuración, los dos opcionales:

- **`<DOCS>/<PROYECTO>/phase-gate.json`**, el manifiesto del proyecto: `version: 1`, `preset`
  (`software` por defecto), `idioma` (`es`), `repos` (cada uno con `id`, `dir` relativo a
  `PHASE_GATE_REPOS_PATH` y `rol`), `reglas` (`lotes`, `commits`, `verificacion`) y
  `fase5.prPorRepo`. Viaja con la Documentación, así que vale en todos los equipos.
- **`<configDir>/machine.json`**, lo de este equipo: `repos` con la ruta absoluta de un repo
  concreto (`"<PROYECTO>/<id>"`, con el proyecto comparado en minúsculas) y `presetPorDefecto`
  para los proyectos sin manifiesto. `configDir()` es `PHASE_GATE_CONFIG_PATH` si está definida;
  si no, `%APPDATA%\mcp-phase-gate\` en Windows, `~/Library/Application Support/mcp-phase-gate/`
  en macOS y `$XDG_CONFIG_HOME/mcp-phase-gate/` (o `~/.config/…`) en Linux.

Los valida un shape zod de `src/manifiesto.ts`, más lo que zod no expresa: ids de repo únicos, un
`dir` que no es absoluto (en ningún sistema, porque el manifiesto viaja entre equipos) ni tiene
`..`, y un `preset` que existe (si no, `PRESET-NO-EXISTE` con la lista de los disponibles).
`schema/project.json` y `schema/machine.json` se **generan** de esos shapes
(`scripts/generar-esquemas.mjs`) y un test exige que lo publicado coincida: una sola fuente. Los
presets disponibles son los del paquete (`presets/<idioma>/`) más los del usuario
(`<configDir>/presets/`), que ganan con el mismo nombre; `software` existe siempre, porque son los
prompts de fábrica sin bloques.

`<configDir>/prompts/` pasa a ser la capa global cuando `PHASE_GATE_PROMPTS_PATH` no está
definida y la carpeta existe: se puede tener una capa propia sin tocar ninguna variable.

**Un archivo inválido es un error, no un "no hay".** Un manifiesto o un `machine.json` que existe
y está mal escrito se rechaza con la ruta exacta del problema (`repos[1].dir: no puede ser una
ruta absoluta…`). Caer a los valores por defecto en silencio es el fallo silencioso que este
diseño evita: un preset mal escrito que se ignora cambiaría el comportamiento de todas las fases
sin que nadie lo note.

**Reemplaza en parte** el rechazo a un archivo de configuración de las entradas del 2026-08-08
"Los proyectos son las carpetas que existen, no una lista" (la issue #3) y "El nombre del
documento lo declara el prompt de su fase". Lo que aquellas protegían sigue en pie: **los
proyectos siguen siendo las carpetas que existen** (el manifiesto no declara proyectos, vive
dentro de uno) y **el nombre de cada documento sigue en la cabecera de su prompt** (el manifiesto
no tiene nombres de documento). Lo que cambia es que ya hay datos que no caben en una variable de
entorno ni en el disco: qué preset usa un proyecto, qué repos toca y dónde está cada uno en cada
equipo. **Matiza** la del 2026-08-10 "Varias documentaciones se resuelven registrando el servidor
dos veces, no con código": su "introducir un formato de configuración nuevo" ya no es un costo por
pagar, pero los "espacios" con `use_space` siguen descartados; varias documentaciones siguen siendo
varios registros.

**Un `machine.json` roto solo afecta a quien lo usa** (añadido tras la auditoría de la etapa). Se lee
solo cuando hace falta: para resolver repos, y para el `presetPorDefecto` de un proyecto sin
manifiesto (o sin proyecto). Antes se leía siempre al armar el bloque de configuración, y un error en
él dejaba sin prompts a todos los proyectos. Sus rutas de repo tienen que ser absolutas: una relativa
se resolvería contra el directorio de trabajo de cada cliente.

**Por qué dos archivos y no uno.** El manifiesto viaja con la Documentación por OneDrive y lo leen
todos los equipos; una ruta como `D:\trabajo\backend-api` solo vale en uno. Mezclarlas obligaría a
elegir entre rutas que no existen en el otro equipo o repos que hay que declarar dos veces.
`machine.json` vive fuera de `DOCS` y ninguna tool puede escribirlo (SEG-M), así que puede apuntar
fuera de `PHASE_GATE_REPOS_PATH` sin abrir una puerta.

**Quién los escribe.** Solo la persona y el CLI (`init`, `eject`). `write_central_doc` no puede
escribir `phase-gate.json` desde la Etapa 1.

**Para los tests.** `limpiarEntorno()` deja `PHASE_GATE_CONFIG_PATH` en una carpeta temporal vacía
(`configTemporal()`), y los E2E se la pasan al servidor que lanzan: sin eso, la suite leería el
`machine.json` y los presets reales de quien la corre.

---

## 2026-10-15 — Los presets y las personalizaciones se escriben como bloques sobre ranuras, en un solo archivo, con modos `reemplazar`, `antes` y `despues`

**Decisión.** Un archivo de bloques cambia el contenido de las ranuras sin copiar el prompt:

```markdown
<!-- bloque: fase-3/pruebas -->
contenido que sustituye a la ranura
<!-- /bloque -->

<!-- bloque: global/cero-rupturas | despues -->
contenido que se añade al final de la ranura
<!-- /bloque -->
```

El identificador es `<archivo>/<ranura>` (`global` o `fase-N`), y el modo, `reemplazar` (por
defecto), `antes` o `despues`. Un preset es un archivo así; una capa propia (la global o la de un
proyecto, `<DOCS>/<PROYECTO>/.phase-gate/prompts/`) los escribe en su `bloques.md`.

Las capas, de menor a mayor: fábrica (1), preset (2), variantes de regla (2.5), global (3) y
proyecto (4). El **cuerpo** de una fase sale de la capa más alta entre 1, 3 y 4 que tenga su
`fase-N-*.md`, y su cabecera da el nombre del documento: un bloque no lo puede cambiar. Después,
los bloques se aplican por capa ascendente (y, dentro de una capa, en el orden del archivo), así
que el de más arriba manda aunque su capa esté por debajo de la del cuerpo. Un `despues` del
preset seguido de un `reemplazar` del proyecto deja solo el del proyecto.

Lo que no encaja se avisa y no se aplica: un bloque de una ranura que no existe es
`BLOQUE-HUERFANO`; el mismo identificador dos veces en un archivo es `BLOQUE-DUPLICADO` (vale el
primero); un bloque sin cerrar, un cierre suelto, uno anidado o un marcador mal escrito es
`BLOQUE-MAL-FORMADO`, y el archivo entero se ignora. Los marcadores nunca llegan al modelo, y una
ranura que ningún bloque toca se entrega byte a byte como antes: sin bloques, el prompt es
idéntico al de la `2.2.0` (comprobado contra el build de `v2.2.0` en las cinco fases).

**`global/extra`.** `global-rules.md` gana al final una ranura vacía bajo `## REGLAS
ADICIONALES`, para sumar reglas globales sin sustituir ninguna. Si queda vacía, el encabezado no
se entrega. El catálogo pasa a 23 ranuras.

**Reemplaza en parte** la entrada del 2026-08-10 "Publicable en npm: los prompts se superponen en
capas", en su punto "`global-rules.md` sustituye, no concatena". Un `global-rules.md` propio sigue
sustituyendo al de fábrica, pero las secciones `## BASE DE CADA DECISIÓN` y `## PENDIENTES
HEREDADOS` son **esqueleto**: no son ranuras, ningún bloque las toca, y si el archivo que gana no
las tiene se añaden al final las de fábrica. `doctor` lo dice con `GLOBAL-REINYECTADO`, que
sustituye a `GLOBAL-SIN-BASE` para esas dos. `## EVIDENCIA` es una ranura y no se reinyecta: si
falta, `GLOBAL-SIN-BASE` sigue avisando. La forma recomendada de cambiar las reglas globales deja
de ser copiar el archivo y pasa a ser un `bloques.md` con `global/cero-rupturas`,
`global/evidencia` o `global/extra`. **Amplía** la del 2026-10-14 "Ranuras en los prompts base:
estructura fija, contenido sustituible", que reservó las ranuras para esto.

**Por qué el motivo de la entrada vieja ya no pesa.** Concatenar dos juegos de reglas hacía
imposible saber de qué archivo salió una instrucción. Un bloque nombra su ranura y su modo, y la
procedencia de cada ranura (qué capa y qué `archivo:línea` ganó, y qué modos se sumaron) la da el
ensamblado; `doctor` la mostrará. Lo que se suma es visible y tiene dirección.

**Por qué un archivo de bloques mal formado se ignora entero.** Aplicar la mitad de un preset daría
un prompt que nadie escribió. Mejor el prompt de fábrica y un aviso con archivo y línea.

**Qué se descartó.** Bloques que cambien el frontmatter (el nombre del documento o de los recibos):
la deducción de fase depende de esos nombres, y que un preset de tarea pudiera cambiarlos haría que
la fase de una tarea dependiera de qué preset tiene. Y un parser de Markdown completo: los
marcadores se reconocen por línea entera, como los de ranura, sin entender bloques de código.

---

## 2026-10-15 — Los prompts de fábrica viven en `prompts/<idioma>/`

**Decisión.** Los prompts que trae el paquete pasan de `prompts/` a `prompts/es/`: las cinco
fases, `global-rules.md` y `comandos/`. `defaultPromptsPath()` apunta ahí y acepta el idioma
(`"es"` por defecto). El paquete publica además `presets/` y `schema/`, que llegan en los lotes
siguientes de la Etapa 3.

**Amplía** la entrada del 2026-08-10 "Publicable en npm: los prompts se superponen en capas": las
capas siguen igual, solo cambia dónde está la de fábrica.

**Por qué una subcarpeta por idioma.** La versión en inglés (Etapa 6) llega al lado, en
`prompts/en/`, sin mover nada ni partir los nombres de archivo con sufijos. Hacerlo ahora, con un
solo idioma, cuesta un `git mv`; hacerlo con dos idiomas y presets apuntando a la ruta vieja
costaría una migración.

**Qué no cambia.** Las capas propias (`PHASE_GATE_PROMPTS_PATH`, o su alias
`ORQUESTADOR_PROMPTS_PATH`) siguen teniendo sus `fase-N-*.md` en la raíz: nadie tiene que mover
su carpeta. `.claude/commands/` sigue siendo la copia idéntica de los comandos, ahora de
`prompts/es/comandos/`.

---

## 2026-10-15 — El servidor avisa de los pendientes heredados leyendo encabezados, sin guardar estado

**Decisión.** `get_phase_prompt` añade un bloque `## PENDIENTES HEREDADOS (detectados por el
servidor)` justo después del aviso de la compuerta, si lo hay, cuando:

- el documento de la **fase anterior** (la de mayor número, por debajo de la pedida, cuyo
  documento existe) tiene una línea `## Validaciones pendientes` y la sección **no está vacía**.
  La sección es el texto hasta el siguiente `## ` o el final, y el encabezado se reconoce sin
  distinguir mayúsculas. Cuenta como vacía si, sin viñetas ni numeración, sin énfasis de Markdown,
  sin puntos suspensivos ni punto final y en minúsculas, no queda nada o queda `ninguna`,
  `ninguno`, `ninguna pendiente`, `nada`, `sin pendientes`, `no hay pendientes`,
  `fase cerrada sin pendientes`, `n/a` o `no aplica` (la lista y la normalización se ampliaron
  tras la auditoría de la etapa, que encontró falsos positivos con "- Ninguna." o "_Ninguna._");
- o, en las fases posteriores a la que declara recibos (con los prompts de fábrica, la Fase 5),
  algún recibo tiene en su frontmatter `estado` `con pendientes`, `fallido` o `descartado`. Con
  un solo lote, el recibo es el documento de la Fase 4 y se mira también.

La tarea se resuelve igual que en la compuerta: con `project`, con `task_name` o con el único
puntero. Si no se puede resolver, no hay aviso. Un documento ilegible no produce aviso.

**Amplía** la entrada del 2026-10-14 "Base de cada decisión y pendientes heredados viven en las
reglas globales": la regla obliga al modelo a nombrar los pendientes, y ahora el servidor le
señala dónde están.

**Por qué no contradice la #39.** La issue rechazó que la **compuerta** dependiera de un
`Estado:` escrito por el modelo. Este aviso no bloquea ni cambia la fase deducida: solo señala un
encabezado que el prompt ya obliga a escribir. Si el modelo no lo escribió, el aviso no sale y
todo sigue como en la Etapa 1.

**Por qué la lista de "vacía".** El índice de cierre de la Fase 4 solo escribe
`## Validaciones pendientes` si quedó algo abierto, pero en cualquier fase se puede escribir el
encabezado por costumbre con "Ninguna.". Un aviso que salta sin motivo enseña a ignorarlos todos.

**Por qué solo la fase anterior.** Lo que dejó abierto una fase más vieja ya lo tuvo que nombrar
la siguiente a ella. Mirar todas las anteriores repetiría el mismo aviso en cada fase.

---

## 2026-10-15 — Las confirmaciones de `force` y `crear_proyecto` se piden al usuario por elicitation cuando el cliente puede

**Decisión.** Cuando `write_central_doc` va a escribir un documento protegido (congelado, o el
contexto inicial) y cuando `start_task` va a estrenar un proyecto con `crear_proyecto: true`, el
servidor le pregunta a la persona con una elicitation de MCP: un formulario de su cliente con
una casilla ("Reescribir `<archivo>`", "Crear el proyecto `<NOMBRE>`"). Con el cliente que la
soporta, se pregunta **siempre** y `force` se ignora: confirmada, se escribe y la respuesta lo
dice ("reescrito con confirmación del usuario"); rechazada, no se escribe nada. Sin elicitation,
todo sigue como en la Etapa 1: deciden `force` y `crear_proyecto`.

`pedirConfirmacion` (en `src/confirmacion.ts`) distingue tres resultados:

| Qué pasó | Resultado |
|---|---|
| Aceptar con la casilla marcada | `confirmada` |
| Aceptar sin marcarla, rechazar o cerrar el formulario | `rechazada` |
| Vence el plazo (tres minutos), la primera vez en la sesión | `rechazada`, y la respuesta sugiere `PHASE_GATE_ELICITATION=off` |
| Vence el plazo por segunda vez seguida | `rechazada` en esa llamada, y `no-disponible` desde la siguiente y para el resto de la sesión |
| El cliente cancela la llamada a la tool antes de que la persona responda | `rechazada`, sin contar como vencimiento; y no se escribe nada aunque la persona acepte después |
| El cliente la anuncia pero responde `MethodNotFound`, o un error "does not support" | `no-disponible` para el resto de la sesión |
| Cualquier otro error | `rechazada` (se falla cerrado) |

Con `no-disponible` se cae al comportamiento de la Etapa 1. `PHASE_GATE_ELICITATION=off` lo
fuerza desde el principio (también acepta `false`, `0` y `no`, sin distinguir mayúsculas): es la
escotilla para un cliente cuya implementación falle (validación V4: hay un bug abierto en Cursor
para Windows en el que el formulario no aparece).

**Dos casos añadidos tras la auditoría de la etapa.** *El segundo vencimiento seguido falla
cerrado en esa misma llamada.* Antes, esa llamada ya pasaba a `no-disponible` y, si traía
`force: true`, escribía: una persona ausente dos veces más un `force` puesto por el modelo acababan
en escritura sin que nadie confirmara. Ahora `force` decide solo a partir de la llamada siguiente.
*La cancelación del cliente cancela la pregunta.* La elicitation va con la señal de la llamada, y
antes de escribir se comprueba que no se haya cancelado: si el cliente se rindió por su propio
plazo (casi todos esperan menos que los tres minutos de la pregunta), escribir después dejaría un
archivo que el modelo cree que no existe.

**Consecuencia aceptada.** "No disponible" se recuerda durante toda la sesión, sin caducar. En una
sesión de días, un cliente que se arregle a mitad no vuelve a preguntar hasta reiniciar el servidor.

**Amplía** la entrada del 2026-08-08 "Los proyectos son las carpetas que existen, no una lista"
(la puerta de `crear_proyecto`) y la del 2026-10-14 "Un documento de fase se congela cuando
existe el de una fase posterior" (`force`).

**Por qué.** `force` y `crear_proyecto` los pone el modelo cuando "el usuario lo confirmó en el
chat". Es exactamente lo que se quería evitar: quien escribe la bandera no es quien debe decidir.
Con elicitation la respuesta va de la persona al servidor sin pasar por el modelo. Por eso, con
ella disponible, `force` ya no basta: la descripción del parámetro pasa a decir que solo se usa
si el cliente no puede preguntar.

**Por qué el rechazo no se convierte en "no disponible".** Una persona que dice que no, o que
cierra el formulario, nunca puede acabar en un sí por la vía de `force`. Solo un cliente que no
implementa la pregunta (o que la deja vencer dos veces seguidas, lo más probable cuando el
formulario no aparece) se trata como uno sin elicitation, y se recuerda para la sesión para no
hacer esperar tres minutos cada escritura.

**Qué se descartó.** Ofrecer "¿lo creo?" ante un proyecto desconocido sin `crear_proyecto`:
invitaría a aceptar un nombre mal escrito con un clic. Sin la bandera se devuelve la lista, como
siempre. Y esperar el minuto por defecto del SDK: es poco para que una persona lea y decida.

---

## 2026-10-15 — Los comandos de fase se sirven como MCP Prompts desde `prompts/comandos/`

**Decisión.** El texto de cada comando pasa a `prompts/comandos/fN.md`, que viaja en el paquete,
y el servidor lo ofrece como un MCP Prompt llamado `fN`, con título `Fase N · <título>`. Se
resuelve por capas como las fases: un `comandos/fN.md` en la carpeta propia gana al de fábrica,
y una fase sin comando (una `fase-6` propia, por ejemplo) recibe un texto genérico que hace lo
mismo que los demás. Todos los argumentos son opcionales: `project`; en `/f1` también
`task_name` y `contexto`; en `/f5`, `commits`. Lo que llega como argumento se añade al final,
en una sección `## Datos de esta invocación`; sin argumentos, el prompt es el comando tal cual.

Los prompts se registran según las fases que existan: una fase nueva gana su `/fN`, una que
desaparece lo pierde, y un cambio de título lo actualiza; cada cambio emite
`prompts/list_changed`. Se sincroniza al arrancar, tras cada llamada a una tool y, como mejora
oportunista, cuando `fs.watch` avisa de un cambio en una capa (con 300 ms de espera). En
OneDrive `fs.watch` no es fiable: lo que garantiza el resultado es la sincronización tras cada
tool.

`.claude/commands/` se conserva, idéntico a `prompts/comandos/`, para quien trabaja en este repo
y para los clientes que no muestran bien los MCP Prompts; `test/docs.test.ts` compara ahora esas
dos carpetas. `docs/comandos-de-fase.md` deja de copiar los cinco comandos: explica cómo llegan a
cada cliente y remite a la fuente.

**Resuelve** "Lo que esta decisión no resuelve" de la entrada del 2026-08-07 "La configuración
por dispositivo no vive en el repo": los comandos vivían solo en la carpeta del usuario y
editarlos en un equipo dejaba al otro con la versión vieja. Ahora llegan con el paquete, a
cualquier cliente que muestre prompts. **Amplía** la del 2026-08-08 "El servidor se llama `phase-gate` y deja de presuponer Cursor", que los versionó en
`.claude/commands/`: esa copia sigue, pero ya no es la que manda.

**Por qué el prompt no incluye el prompt de la fase.** `/f4` podría devolver ya el texto de
`get_phase_prompt(4)` y ahorrar una llamada. Se descartó: serían dos caminos para recibir el
mismo prompt, y en uno de ellos la compuerta no sabría el `project`. El comando sigue siendo
orquestación, como decidió la entrada del 2026-08-08 "El nombre del documento lo declara el prompt
de su fase".

**Por qué todos los argumentos son opcionales.** Algunos clientes parten los argumentos de un
prompt por espacios. Con argumentos obligatorios, un contexto largo no cabría; con opcionales,
el comando pide lo que falte y el contexto puede ir pegado después, como texto del chat.

**Los argumentos van dentro del texto que lee el modelo** (añadido tras la auditoría). `project`,
`task_name` y `commits` se aplanan a una línea, para que un valor no pueda abrir secciones nuevas
(un `## REGLA…` falso). El `contexto` va tal cual, porque es multilínea por naturaleza; es un
riesgo asumido: lo escribe la persona que invoca el comando, igual que si lo pegara en el chat.

**Un detalle del SDK.** La capacidad `prompts` solo se puede declarar antes de conectar. Si al
arrancar no hubiera ninguna fase, el primer `/fN` que apareciera después fallaría al registrarse;
para evitarlo, el servidor registra y quita un prompt provisional antes de conectar.

---

## 2026-10-15 — Los documentos de las tareas se exponen como recursos de solo lectura

**Decisión.** El servidor expone cuatro MCP Resources, todos de solo lectura y en
`text/markdown`:

| Recurso | URI | Contenido |
|---|---|---|
| `estado` | `phase-gate://estado` | El diagnóstico de `doctor`, en Markdown |
| `fases` | `phase-gate://fases` | Número, título, documento, recibos, capa y archivo de cada fase |
| `documento` | `phase-gate://tareas/{proyecto}/{tarea}/{documento}` | Un archivo de la carpeta de una tarea |
| `recibo` | `phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo}` | Un recibo de la subcarpeta que declara la Fase 4 |

`resources/list` devuelve los dos fijos y solo los documentos **existentes** de la **tarea
activa de cada proyecto**: el contexto inicial, los documentos de fase y los recibos. El resto se
alcanza por plantilla, con autocompletado de proyecto, tarea, documento y recibo. Cada documento
listado lleva `audience: ["assistant", "user"]` y `lastModified`. `start_task`, `switch_task` y
un `write_central_doc` que crea un archivo emiten `resources/list_changed`; reescribir un archivo
que ya existía no cambia la lista y no lo emite.

**Por qué.** Con "@", los clientes que muestran recursos dejan a la persona adjuntar al chat el
plan técnico o un recibo sin pedírselo al modelo, y al modelo leerlos sin gastar una llamada a
`read_central_doc`. Y los dos fijos son el sitio donde vive lo que antes estaba congelado en las
descripciones de las tools: la lista de proyectos y la de fases.

**Por qué solo la tarea activa en el listado.** Listar todas las tareas de todos los proyectos
inundaría el selector de "@": con una Documentación real son cientos de archivos. La activa es
casi siempre la que interesa, y las demás siguen a un autocompletado de distancia.

**Las defensas son las de `read_central_doc`.** El SDK entrega las variables con su codificación
porcentual, así que cada una se decodifica y **después** se valida como un segmento portable: un
`%2F` decodificado a `/` se rechaza ahí. Un `%2E%2E` ni siquiera llega: la normalización del URI
lo colapsa y no queda plantilla que encaje. La ruta final tiene que quedar dentro de la carpeta de
la tarea (sobre rutas reales), los archivos y carpetas con punto no se exponen, y la lectura está
acotada a 1 MB de texto. Una URI mal codificada se rechaza con un mensaje que lo dice.

**Añadido tras la auditoría de la etapa.** El listado y el autocompletado pasan por la misma
contención que la lectura: un enlace dentro de la tarea (una subcarpeta de recibos que es una
junction, un documento que es un symlink) que lleva fuera de ella no se lista, porque enseñaría el
nombre y la fecha de un archivo de fuera aunque luego no se pudiera leer. Y los errores de lectura
llegan con un código que dice qué pasó: `-32002` si el recurso no existe (el que propone la
especificación de MCP), `-32602` si el URI o lo que apunta no es válido, y `-32603` solo para un
fallo de E/S inesperado.

**Qué se descartó.** Exponer los documentos con escritura (recursos suscribibles o una tool de
escritura por recurso): escribir sigue siendo `write_central_doc`, que es donde viven la
contención, la protección de los documentos congelados y la confirmación.

---

## 2026-10-15 — Las tools se registran en `McpServer`; sus descripciones son estáticas y la parte que cambia vive en Resources y Prompts

**Decisión.** El servidor pasa de la clase `Server` con un `switch` sobre `CallToolRequestSchema`
a `McpServer`, con un `registerTool` por tool. Queda repartido así:

- `src/servidor.ts` exporta `crearServidor()`, que registra las tools y no conecta ningún
  transporte. `src/index.ts` solo despacha: la línea de comandos o el servidor por stdio.
  Los tests conectan el servidor a un cliente con un transporte en memoria.
- Cada tool recibe su shape de `src/schemas.ts`. El SDK genera el JSON Schema que ve el cliente
  y valida cada llamada antes del callback. `validarLlamada` desaparece: los mensajes en español
  que nombran el campo ("Falta `task_name`.", "`phase` debe ser un número, por ejemplo 3") van
  ahora en cada campo del shape, y el SDK los entrega detrás de su prefijo en inglés
  (`Input validation error: Invalid arguments for tool …`). Los callbacks lanzan `Error`, y el
  SDK los convierte en `isError`.
- Todas las tools declaran sus cuatro anotaciones (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`) y un `title`. Los valores por defecto del protocolo son
  pesimistas (destructiva y de mundo abierto): sin declararlos, un cliente cauto pediría permiso
  hasta para listar tareas. Solo `write_central_doc` es destructiva, y ninguna es de mundo
  abierto.
- El log pasa del prefijo `[orquestador]` a `[mcp-phase-gate]`, en `src/log.ts`. Se declara la
  capacidad `logging`: cada línea va a stderr y, con un cliente conectado, también como
  `notifications/message`.

**Reemplaza** el comentario de la caché estática de descripciones de `src/index.ts`. Las
descripciones de `project` y de `phase` se armaban al arrancar con la lista de proyectos y de
fases, y se quedaban viejas en cuanto alguien creaba una carpeta con el cliente abierto, porque
el cliente no vuelve a pedir la lista de tools. Ahora son estáticas y remiten a los recursos
`phase-gate://estado` y `phase-gate://fases` (llegan en esta misma etapa), que sí pueden
notificar cuando cambian. Con descripciones estáticas, la lista de tools no cambia nunca y no
se emite `tools/list_changed`.

**Lo que cambia para el cliente, sin cambiar lo que se acepta.** El JSON Schema declara ahora
`phase` como `integer` (antes `number`, aunque el servidor ya rechazaba los decimales) y los
opcionales como `["string", "null"]` o `["boolean", "null"]` (el servidor ya aceptaba `null`
desde la Etapa 0). Además gana `$schema`, `minLength: 1` en los textos obligatorios y
`minimum`/`maximum` (el entero seguro) en `phase`; las descripciones ya no listan proyectos ni
fases. Los mensajes de error pierden el prefijo `Error ejecutando tool <x>:` y, si falla la
validación, ganan el del SDK (`MCP error -32602: Input validation error: … at <campo>`). Una tool
que no existe responde `Tool <x> not found` en lugar de `Unknown tool: <x>`. Los argumentos
desconocidos se siguen aceptando e ignorando, como antes.

**Riesgo no comprobado.** Algunos proveedores de modelos no admiten tipos múltiples
(`["string", "null"]`) en el esquema de una función. Si un cliente lo rechaza, la salida es dejar
los opcionales como `string` y seguir tolerando `null` al validar; se decidirá con un caso real.

**El log y varios servidores.** `src/log.ts` recuerda el último servidor creado para enviarle las
notificaciones. En producción hay uno por proceso; con varios (los tests), las notificaciones van
al último y stderr recibe todo. Desde la auditoría de la etapa, las notificaciones solo salen
después del `initialize`: antes, la línea de arranque aparecía como JSON crudo en stdout.

**Las descripciones remiten también a tools** (añadido tras la auditoría): `list_tasks` y
`get_orchestrator_status`, además de los recursos, porque no todos los clientes dejan al modelo
leer recursos por su cuenta.

**Qué no cambia.** Los nombres, los parámetros y la semántica de las 8 tools. Los E2E de las
Etapas 0 y 1 pasan sin tocarlos: comparan subcadenas del mensaje desde la Etapa 0 precisamente
para sobrevivir a este prefijo (riesgo E2-R1).

**Qué se descartó.** Seguir validando con `validarLlamada` y pasarle al SDK un esquema
permisivo. Habría conservado el formato exacto de los mensajes, pero el JSON Schema que ve el
cliente ya no saldría de los shapes, y serían dos fuentes para lo mismo.

---

## 2026-10-15 — El `.env` se lee con un lector propio sobre `util.parseEnv`, sin `dotenv`

**Decisión.** `src/config.ts` lee el `.env` de la raíz del paquete con un lector propio:
lee los bytes, rechaza el UTF-16 (BOM `FF FE` o `FE FF`, o un byte NUL en los primeros 512),
decodifica como UTF-8, quita un BOM inicial, parsea con `util.parseEnv` de Node y asigna solo
las claves que no estén ya en el entorno. Un `.env` en UTF-16 **no se carga** y deja un error
guardado que aparece en el mensaje de la variable que falta y en el log al arrancar. `dotenv`
sale de las dependencias: quedan el SDK y `zod`, que es su *peer dependency*.

Se exportan `cargarEnv(archivo?)`, `reiniciarEnv()`, `clavesDeEnv()` y `errorDeEnv()`: los
tests cargan archivos temporales, y el diagnóstico de la Etapa 2 dice de dónde salió cada
variable. `cargarEnv` se llama una vez al importar el módulo; volver a llamarla sustituye lo
que cargó la vez anterior.

**Por qué no `process.loadEnvFile`.** Era el candidato natural en Node 22, y se comprobó antes de
elegirlo: no quita el BOM de UTF-8. Con un `.env` guardado con BOM la primera clave llega como
`\uFEFFORQUESTADOR_DOCS_PATH` y la variable "desaparece" sin ningún error. `dotenv` sí lo quita,
pero tampoco detecta el UTF-16, que es lo que sale de PowerShell con `>` y el caso que ya mordió
una vez: los acentos llegaban rotos y el mensaje hablaba de una carpeta que no existe.

**Lo que se conserva.** El bloque `env` del cliente sigue ganando al `.env`. `util.parseEnv`
conserva las barras invertidas de una ruta de Windows sin comillas y acepta comentarios `#` y
el prefijo `export`, igual que `dotenv`.

**Lo que no se resuelve.** Un `.env` guardado en ANSI (Windows-1252) con acentos se decodifica
mal sin ninguna señal fiable para detectarlo. El mensaje de una ruta inexistente sigue
sugiriendo revisar que el archivo esté en UTF-8.

---

## 2026-10-15 — Las variables se llaman `PHASE_GATE_*` y `ORQUESTADOR_*` queda como alias

**Decisión.** Cada variable tiene un nombre lógico (`DOCS_PATH`, `REPOS_PATH`, `TASKS_SUBDIR`,
`PROMPTS_PATH`, `STATE_PATH`) y dos nombres de entorno: `PHASE_GATE_*`, el principal, y
`ORQUESTADOR_*`, que sigue funcionando como alias. Si las dos existen y difieren (las rutas se
comparan resueltas), gana `PHASE_GATE_*`, y `leerVariable` devuelve el texto de la discrepancia
que el servidor deja en el log al arrancar. Llega además `PHASE_GATE_ELICITATION`, sin alias.
Los mensajes de error nombran las dos: "Falta `PHASE_GATE_DOCS_PATH` (o su alias
`ORQUESTADOR_DOCS_PATH`)"; y cuando la ruta está mal, nombran la que se usó.

"Definida" es que exista en el entorno, aunque esté vacía: `TASKS_SUBDIR` vacía significa que
las tareas cuelgan del proyecto, y eso se tiene que poder decir con el nombre nuevo. En las
variables de **ruta**, vacía cuenta como ausente: una ruta vacía no significa nada y no debe tapar
un alias que apunta a una carpeta (se avisa como discrepancia).

**Qué gana cuando cada nombre llega por una vía distinta** (añadido tras la auditoría de la
etapa): primero la **fuente** —el entorno, es decir el bloque `env` del cliente, gana al `.env`—
y, dentro de la misma fuente, el **nombre** —`PHASE_GATE_*` gana a `ORQUESTADOR_*`—. Así un `.env`
con `PHASE_GATE_DOCS_PATH` no le gana a un bloque `env` con `ORQUESTADOR_DOCS_PATH`, y "el cliente
gana al `.env`" sigue siendo cierto sin excepciones. La discrepancia dice cuál se usó y por qué.

De paso, `stateDir` recorta y resuelve su variable como las demás rutas; antes se usaba tal
cual, y un espacio al final del valor creaba otra carpeta de estado.

**Reemplaza** el punto "Qué NO se renombró" de la entrada del 2026-08-10 "Un solo nombre". Aquel
punto decía que alinear el prefijo rompía configuraciones a cambio de nada visible. Con el alias
no se rompe ninguna, y lo visible llega ahora: el diagnóstico de la Etapa 2 enseña las
variables por su nombre, y `ORQUESTADOR_*` era el último resto del nombre viejo.

**Qué se descartó.** Retirar el alias en una versión mayor. Mantenerlo cuesta una línea por
variable, y quitarlo rompería configuraciones que nadie tiene por qué tocar.

---

## 2026-10-14 — La Fase 5 audita los commits de los recibos y trata los pendientes sin comprobar como bloqueantes

> **Matizada** el 2026-10-16 por "El auditor recibe los commits ya verificados": la entrada de la
> auditoría ya no son los commits que el modelo lea en los recibos, sino los que lista el servidor al final
> del prompt (COMMITS DE LA FASE 4), ya verificados. Lo de los pendientes sin comprobar sigue.

**Decisión.** La entrada de la Fase 5 son los commits que registran los recibos de la Fase 4
(el campo `commit` de cada recibo, o la tabla del índice). Si el usuario indica otro rango,
manda el suyo, y la auditoría dice si no coincide con los recibos; si no hay ni recibos ni
rango, se pregunta. Antes de mirar el diff, la auditoría lee el documento de la Fase 4 y sus
recibos: todo lo que quedó en "Espera al usuario", en `## Validaciones pendientes` o en un lote
`con pendientes`, `fallido` o `descartado` se nombra, y si toca lo auditado y no hay constancia
de que el usuario lo comprobó, es **BLOQUEANTE**.

La auditoría gana su propio `PROHIBIDO` y su `AUTOVERIFICACIÓN`, antes de SALIDA 2. Hasta ahora
los dos existían solo dentro del contrato del PR, y nada de la auditoría se revisaba antes de
entregar.

**Amplía** la entrada del 2026-08-08 "La Fase 5 deja documento y `start_task` se niega a pisar
una tarea": la fase sigue siendo de solo lectura y sigue dejando su documento.

**Por qué.** Con los recibos, los commits de la tarea ya están escritos; pedírselos al usuario
era trabajo repetido y una fuente de auditar un rango equivocado. Y un "LGTM" sobre un cambio
cuya prueba manual nadie hizo se lee como aprobación de algo que no se comprobó: es justo el
pendiente heredado (#39) que la regla global obliga a nombrar, llevado a la última compuerta
antes del PR.

**Ranuras de la Fase 5:** `rol`, `pr` (todo el cuerpo de SALIDA 2) y `ejemplos`. El contrato
del PR no cambia; solo queda envuelto para que un preset de la Etapa 3 pueda sustituirlo.

---

## 2026-10-14 — La Fase 4 ejecuta lote por lote y hace el commit de cada uno con el OK del usuario

> **Reemplazada en parte** el 2026-10-16 por "`record_batch` registra cada lote en dos tiempos: antes
> y después del commit": el recibo ya no lo escribe el modelo con `write_central_doc`, sino el servidor
> a partir de campos, y el hash no se anota a mano: se ancla y se verifica. El ciclo, el OK del usuario,
> la lista de archivos uno por uno y la frontera del push siguen.

**Decisión.** La Fase 4 ejecuta el plan **un lote a la vez**, en el orden de la tabla de lotes
de la Fase 3, con un ciclo fijo: implementar solo ese lote, verificarlo con su criterio de
salida, escribir su recibo con `commit: pendiente`, mostrarle al usuario la lista exacta de
archivos y el mensaje de commit, y con su OK hacer el commit y anotar el hash en el recibo. El
corte de commit es la única parada prevista del lote. Las secciones NO SUBES NADA y EL DOCUMENTO del
prompt se sustituyen por **LOTES Y RECIBOS** y **COMMITS**.

- El recibo tiene frontmatter (`lote`, `de`, `repo`, `rama`, `estado`, `commit`, `fecha`) y
  encabezados exactos. Con `lotes: 1` el recibo es el documento de la fase; con más lotes, cada
  recibo va en `04 - Ejecución/L0x - <slug>.md` y el documento de la fase es un índice que se
  escribe solo al cerrar el último.
- El `git add` lleva la lista de archivos del lote, uno por uno; nunca `-A`, `.`, `-u`, una
  carpeta entera ni `git commit -a`, y nunca `--amend`. Si falla un hook o se pide una
  passphrase, el agente se detiene; nunca `--no-verify`.
- Antes del primer commit, el agente comprueba la rama con `git branch --show-current`. Si no es
  la del plan, o es la principal sin que el plan lo diga, se detiene y pregunta. Como no puede
  cambiar de rama, sin esta comprobación una sesión abierta en la rama principal dejaba ahí los
  commits (hallazgo de la auditoría de la Etapa 1).
- Antes del primer lote se nombran los pendientes heredados del plan, y un lote que depende de
  uno sin resolver no se ejecuta.

**Reemplaza** la entrada del 2026-08-07 "La Fase 4 no sube nada". **Matiza** la del 2026-08-07
"La Fase 4 hace; el documento es el recibo": el recibo sigue siendo corto y secundario, pero
ahora hay uno por lote y se escribe al cerrar cada lote, no al final de la fase.

**Por qué el commit sí y el push nunca.** El commit es local y reversible, y a partir de la
Etapa 4 lo verifica el servidor contra Git. El push saca el trabajo del equipo, dispara el CI o
un despliegue, y debe pasar antes por la auditoría de la Fase 5, que sigue siendo de solo
lectura. Además, el servidor no puede impedir un push desde la terminal del agente: la frontera
se expresa en el prompt y, si se quiere, se refuerza con los permisos del cliente. Por eso el
push, crear o cambiar de rama y abrir el PR siguen siendo del usuario, y no es configurable.

**Por qué con OK y no automático.** Es la política `agente-commitea-con-OK`, la de fábrica en
la 2.1.0. El usuario ve qué entra en cada commit antes de que exista, y mientras revisa puede
hacer las pruebas que el lote dejó esperando. Las otras políticas (`agente-propone`, `auto`,
`ninguno`) llegan con el manifiesto de la Etapa 3, como variantes de la ranura `commits`.

**Consecuencia aceptada.** Para quien usa la 2.x por `npx`, la Fase 4 pasa a hacer commits
(riesgo E1-R2); siempre con OK explícito, y por eso la versión es menor y no de parche. Con
`lotes: 1`, el documento de la fase existe desde que se escribe el recibo con
`commit: pendiente`, así que durante esos minutos la fase aparece cerrada antes del commit; es
una ventana aceptada que desaparece en la 3.0.0, cuando el servidor guarda el recibo en la
subcarpeta hasta anclarlo.

**La ventana no se extiende a un lote que falla.** Con `lotes: 1`, si el lote queda `fallido` o
`descartado` en su verificación, su recibo va en la subcarpeta (`L01 - <slug>.md`) y el
documento de la fase no se escribe. Si no, el recibo fallido se quedaba para siempre como
documento de la fase y la tarea aparecía cerrada (cuestionamiento de la auditoría de la Etapa 1).
Queda un resto: si el usuario rechaza el commit después de escrito el recibo, el documento ya
existe y el modelo no puede moverlo; el recibo lo dice con su `estado`, y lo cierra la 3.0.0.

**Ranuras de la Fase 4:** `rol`, `verificacion`, `pruebas`, `lotes`, `commits` y `ejemplos`.

---

## 2026-10-14 — Los lotes son estructurales en la Fase 3

**Decisión.** Todo plan técnico se parte en **lotes**. El documento empieza con el frontmatter
`lotes: N` y lleva, después de los pasos, una tabla con una fila por lote: repositorio,
objetivo, pasos que incluye, criterio de salida, commit propuesto y si se revierte solo. Cada
paso pertenece a exactamente un lote, cada lote toca un solo repositorio y deja la aplicación
funcionando, y lo que arregla va antes que lo que solo mejora. Un plan chico tiene `lotes: 1`,
y es válido.

**Reemplaza** la sección condicional "Etapas con commits separados" del contrato de la Fase 3,
que llegó con las decisiones del 2026-08-07 sin entrada propia. Su criterio sigue intacto
dentro de las reglas de los lotes: lo que arregla va primero, y lo arriesgado al final, para
poder descartarlo sin perder el arreglo.

**Por qué.** Como sección condicional, partir el trabajo dependía de que el modelo decidiera
que hacía falta, y la Fase 4 no tenía dónde apoyarse para ejecutar por partes. Con los lotes en
el núcleo, la Fase 4 ejecuta un lote a la vez, con un commit y un recibo por lote, y cada lote
llega con su criterio de salida ya escrito. El número `N` del frontmatter es lo que la Fase 4
lee para saber cuántos recibos esperar.

**Matiza** la entrada del 2026-08-07 "Sin suite de pruebas: la comparación contra la réplica
ocupa ese lugar". La política de pruebas, que estaba repartida en tres sitios, se junta en
**PRUEBAS Y PARIDAD**: si el proyecto no tiene suite, sigue prohibido inventarla; si ya tiene
una, se corre, y el criterio de salida de cada lote dice qué comando y qué debe dar. La
comparación contra la réplica se queda igual dentro de esa sección.

**Ranuras de la Fase 3:** `rol`, `comprobaciones`, `lotes`, `pruebas` y `ejemplos`. Con
`lotes: false` en un preset de la Etapa 3, la ranura `lotes` se reduce a "un solo lote".

---

## 2026-10-14 — Base de cada decisión y pendientes heredados viven en las reglas globales; Cero Rupturas se acota por fase

**Decisión.** `prompts/global-rules.md` gana tres secciones y reescribe una:

- **EVIDENCIA** (nueva): toda afirmación se ancla en un `archivo:línea` o en la salida real de
  algo ejecutado, con qué se ejecutó y cuándo.
- **BASE DE CADA DECISIÓN** (nueva, #40): toda `D<n>`, nazca en la fase que nazca, declara su
  base: `medido` (con fuente y vigencia), `leído en código`, `documentado` o `inferido` (con qué
  la confirmaría). Una medición contra una fuente no confirmada cuenta como `inferido`, y con
  varias bases se declara la más débil.
- **PENDIENTES HEREDADOS** (nueva, #39): cada fase revisa antes de empezar si la anterior dejó
  lagunas y se las nombra al usuario; y toda fase que cierra con algo sin comprobar lo deja bajo
  el encabezado exacto `## Validaciones pendientes` y lo dice en el mensaje de cierre.
- **CERO RUPTURAS**, acotada por fase: fuera de la Fase 4 hay que preguntar antes de cambiar
  código existente; en la Fase 4, el plan aprobado ya es esa autorización para lo que lista.

Las dos reglas globales que un preset podrá cambiar, `cero-rupturas` y `evidencia`, quedan
marcadas como ranuras. Base y Pendientes no son ranura: no dependen del dominio. Cada fase las
ancla con referencias cortas (paso 0, PROHIBIDO, AUTOVERIFICACIÓN) en los lotes de prompts L05
a L08.

**Nueva** (#39 y #40). Esta es la parte común; las dos issues se cierran con el último lote de
prompts, el de la Fase 5.

**Por qué en las reglas globales.** Se anteponen a las cinco fases, así que es el único lugar
donde Base y Pendientes se escriben una vez para todas. #40 nació en la Fase 1, pero una
decisión puede nacer en cualquier fase y arrastra el mismo problema: sin base declarada, la fase
siguiente no sabe qué reverificar. #39 tampoco es de una fase: cualquiera puede cerrar con
lagunas, y la deducción de fase solo mira que el documento exista.

**Por qué `medido` no basta solo.** En la tarea que originó #40, lo "medido" estaba medido
contra una réplica vieja que nadie había comprobado. Una marca `medido` sin fuente ni vigencia
habría sido activamente engañosa.

**Por qué Cero Rupturas se acota.** Decía "SIEMPRE pregúntale al usuario primero" sin
distinguir fases, y en la Fase 4 eso obligaba a pedir permiso por cada cambio que el plan ya
aprobó. La regla sigue igual de estricta para lo que el plan no contempla.

**Por qué no contradice el rechazo de #39 a un campo `Estado:`.** #39 descartó que la compuerta
dependiera de un `Estado: cerrada | con pendientes` escrito por el modelo: sería una segunda copia
de la verdad que el disco ya guarda. `## Validaciones pendientes` es un encabezado del
documento, no un estado: la deducción de fase no lo lee. Lo mismo vale para el `estado` de los
recibos de lote: en la 2.1.0 es informativo, y a partir de la Etapa 4 el servidor lo verifica
contra Git en vez de creérselo.

**Riesgo aceptado (E1-R1).** Un `global-rules.md` propio **sustituye** al de fábrica, no se
suma, así que quien tenga el suyo pierde estas secciones. Se avisa en el README (L10), en la
Etapa 2 `doctor` avisará si un override no tiene esos encabezados, y en la Etapa 3 se estudia
que los overrides operen por ranuras para que nadie las pierda por accidente.

---

## 2026-10-14 — Un documento de fase se congela cuando existe el de una fase posterior

> **Matizada** el 2026-10-16 por "Los recibos con ancla quedan sellados y la Fase 4 solo la escribe el
> servidor": los recibos y `04 - Ejecución.md` ya no se escriben con `write_central_doc` aunque no haya Fase
> 5 (se rechazan siempre, con la escotilla de confirmación); lo de "solo los congela una Fase 5 presente" y
> que crear un recibo nuevo se permita ya no vale. El congelamiento de los demás documentos sigue igual.

**Decisión.** Sin `force: true`, `write_central_doc` rechaza escribir:

- **El contexto inicial**, siempre: también para crearlo. Solo `start_task` lo escribe sin
  `force`.
- **Un documento de fase congelado**: el de una fase `n` cuando alguna fase posterior está
  **presente**. Una fase está presente si existe su documento, o si declara `recibos` y su
  subcarpeta tiene al menos un `.md`. Los recibos cuentan como de la Fase 4, así que la propia
  Fase 4 no se congela con sus recibos: a ellos y a `04 - Ejecución.md` solo los congela una
  Fase 5 presente.

Crear un documento de fase que no existe nunca se rechaza, ni siquiera cuando rellena un hueco,
porque no pisa nada. Un recibo nuevo sí: con la Fase 5 presente, la ejecución ya se auditó. Un
archivo que no es de ninguna fase (`notas.md`) tampoco se rechaza. `force` se describe al
modelo como "solo con confirmación explícita del usuario en el chat", el mensaje de rechazo dice
cómo pedirla, y la respuesta avisa cuando un documento se sobrescribió, o se creó, con `force`. Lo decide
`motivoDeProteccion`, con la tabla de verdad del plan maestro v3 en `test/tasks.test.ts`.

**Amplía** la entrada del 2026-08-08 "La Fase 5 deja documento y `start_task` se niega a pisar
una tarea": aquella protegía el contexto inicial de `start_task`; esta lo protege también de
`write_central_doc`, y extiende la idea a los documentos de las fases ya superadas.

**Por qué.** Cada fase trabaja sobre los documentos de las anteriores. Reescribir el análisis
cuando ya existen las decisiones cambia la base de esas decisiones sin que nada lo avise, y el
disco, que es el único registro, deja de contar lo que pasó. El prompt ya lo prohibía; ahora lo
hace cumplir el servidor.

**Por qué con `force` y no un rechazo sin salida.** Hay correcciones legítimas que nadie previó:
una errata en `01` con `02` ya escrito. Cerrarlas del todo obligaría a editar a mano fuera del
flujo, que es peor. Con `force`, la corrección pasa por el usuario.

**Ni las mayúsculas ni Unicode lo esquivan.** En Windows y macOS, `01 - análisis técnico.md`
abre el mismo archivo que `01 - Análisis Técnico.md`, y un nombre en Unicode NFD se ve igual que
el documento. `rutaReal` devuelve el nombre que hay en disco, pero solo para lo que ya existe:
crear `00 - contexto inicial.md`, o un recibo en `04 - ejecución/`, llegaba a la comprobación con
el nombre tal cual y pasaba (hallazgo de la auditoría de la Etapa 1). Por eso
`motivoDeProteccion` compara los nombres normalizados a NFC y sin distinguir mayúsculas, en todos
los sistemas: en Linux, un nombre que solo difiere en mayúsculas de un documento protegido
también pide `force`, y no hay un uso legítimo que lo necesite.

**`force` admite `null`,** como todo opcional desde la Etapa 0: cuenta como ausente.

---

## 2026-10-14 — Ranuras en los prompts base: estructura fija, contenido sustituible

**Decisión.** Un prompt base puede marcar el contenido de una sección como **ranura**:

```md
## VERIFICACIÓN
<!-- ranura: verificacion -->
contenido por defecto
<!-- /ranura -->
```

El encabezado `##` queda fuera: la estructura del prompt no se sustituye; el contenido, sí. El
servidor quita los marcadores antes de entregar el prompt (`quitarMarcadores`), así que el
modelo nunca los ve y recibe el mismo texto que sin ellos. `test/prompts.test.ts` hace cumplir
las reglas en los prompts publicados: toda ranura se cierra, no se anidan, el nombre es único en
su archivo y pertenece al catálogo del plan maestro v3 (§3.2, 22 ranuras), y ningún marcador va
dentro de un bloque de código.

**Nueva.** Prepara las capas de la Etapa 3, donde un preset sustituye una ranura con un bloque
cuyo identificador es `<archivo>/<ranura>` (`fase-3/pruebas`).

**Por qué.** Hoy, para cambiar cómo verifica una fase hay que pisar la fase entera con un
archivo propio, y esa copia deja de recibir las mejoras del resto del prompt. Lo que un preset
necesita cambiar es poco y está localizado: el rol, los medios de verificación, la política de
pruebas, los ejemplos. Solo es ranura lo que cambia el **comportamiento**; una ruta de ejemplo
de una línea se generaliza en el texto y no se vuelve ranura.

**Por qué un comentario HTML, en su propia línea.** No se ve al leer el `.md` renderizado, y
quitarlo por línea entera no deja huecos en el texto. El precio es que `quitarMarcadores` no
distingue un bloque de código: por eso un marcador dentro de uno es un error del test, y los
ejemplos de frontmatter de los prompts nunca llevan marcadores.

**En la 2.1.0 todavía no hay ranuras.** Las meten los lotes de prompts (L04 a L08 de la
Etapa 1). Hasta entonces el test de buena formación pasa con cero.

**Finales de línea, en el mismo cambio.** Las reglas globales y el archivo de cada fase se
normalizan de `\r\n` a `\n` al leerlos. Un prompt propio escrito con el Bloc de notas llega en
CRLF, y el prompt entregado mezclaba finales de línea: lo que se compara byte a byte fallaría
solo en Windows.

---

## 2026-10-14 — Los recibos de lote viven en una subcarpeta que declara el prompt

> **Matizada** el 2026-10-16 por "Los recibos son datos con un formato determinista que escribe el
> servidor" y por "`04 - Ejecución.md` lo genera el servidor; con un solo lote, el recibo se mueve" (H2):
> con un solo lote, el recibo también vive en la subcarpeta mientras está abierto, y los recibos los
> escribe el servidor. La subcarpeta y el nombre siguen.

**Decisión.** La fase que ejecuta por lotes declara en su frontmatter la subcarpeta de sus
recibos (`recibos: 04 - Ejecución`), igual que declara su documento. El servidor la lee y la
anuncia al final del prompt: en esa fase, dónde va cada recibo
(`04 - Ejecución/L01 - <slug>.md`); en las fases posteriores, junto al documento de esa fase.
El valor tiene que ser un solo segmento de ruta portable (`validarSegmento`), porque acaba
dentro de un `file_name`. Además no puede empezar por punto, porque `write_central_doc` no
escribe en esos segmentos, ni llamarse como un documento de fase o como el contexto inicial
(sin distinguir mayúsculas), porque la carpeta haría que ese documento "existiera" al primer
recibo. Estas dos condiciones las añadió la auditoría de la Etapa 1. Un valor inválido no tumba
la fase: se ignora y queda en el log.

**Amplía** la entrada del 2026-08-12 sobre la traducción para quien pidió el ticket, que dejó
escrito que el flujo **nunca** escribe un archivo que no sea el documento de su fase. Con lotes,
sí escribe otros: los recibos, y solo ellos, en una subcarpeta con nombre declarado y con un
nombre de archivo fijado. El argumento técnico que esa entrada dejó registrado sigue valiendo:
la deducción de fase compara contra los nombres exactos, así que la subcarpeta no mueve la fase
(lo fija un test de `test/tasks.test.ts`).

**Por qué en el frontmatter.** Un solo lugar para cada dato: el nombre vive en el prompt que lo
usa, se lee en vivo y llega al modelo por el servidor, como el del documento. Copiarlo en el
texto de cada prompt que lo menciona es la forma de que un día dos prompts digan dos nombres.

**Todavía no se ve.** Ningún prompt publicado declara `recibos` hasta que la Fase 4 pase a
ejecutar por lotes (L07 de la Etapa 1). Hasta entonces el servidor no anuncia nada nuevo.

**El servidor lista los recibos que ya existen.** Ninguna tool lista una carpeta, y los slugs son
libres, así que al retomar la Fase 4 en otro chat, o al auditar en una Fase 5 sin índice, el
modelo no tenía cómo descubrirlos. Cuando `get_phase_prompt` puede resolver la tarea (la indicada
o la activa del proyecto), añade al final la lista de los `.md` de la subcarpeta, en la fase que
declara los recibos y en las posteriores. Si no hay recibos, no añade nada. Lo pidió la auditoría
de la Etapa 1; en la Etapa 4, `get_batch_status` da además el estado de cada uno.

**Desvío E1-D2 (aprobado por la autora).** El plan pedía comprobar en este lote que la Fase 4
declara `recibos`. Ese frontmatter llega con el prompt de la Fase 4, en L07, así que la
comprobación se hace allí, en el test de los prompts publicados de `test/phases.test.ts`.

---

## 2026-10-14 — `write_central_doc` solo escribe dentro de carpetas de tarea, y las carpetas con punto no son proyecto ni tarea

**Decisión.** `write_central_doc` solo escribe dentro de la carpeta de una tarea **que ya
existe**: `<DOCS>/<PROYECTO>/<subcarpeta de tareas>/<tarea>/…`. Llegue la ruta por
`project + task_name + file_name` o por `file_path`, lo comprueba `ubicarEnTarea`, sobre la ruta
real y antes de crear ninguna carpeta. Las dos vías difieren en un caso, y las dos son seguras:
con un enlace dentro de una tarea que lleva a otra tarea, la primera lo rechaza, porque la ruta
debe quedar dentro de la tarea nombrada, y `file_path` escribe en la tarea de destino, que es una
tarea válida. Dentro de la tarea ningún segmento puede empezar por `.`.
Además, una carpeta cuyo nombre empieza por `.` no es proyecto (`discoverProjects`) ni tarea
(`listarTareas`). `read_central_doc` no cambia: sigue leyendo cualquier archivo dentro de
`DOCS`.

**Nueva.** Prepara el manifiesto de la Etapa 3: `phase-gate.json` y `.phase-gate/` se editan solo
por CLI o UI, nunca con esta tool (decisión SEG-M del plan maestro v3).

**Por qué.** Con `file_path` se escribía en cualquier lugar de la Documentación, también en la
raíz de un proyecto, donde vivirá su manifiesto: un modelo podía cambiar la configuración del
flujo que lo gobierna. Y con una tarea mal escrita, el `mkdir` recursivo le creaba la carpeta, y
la tarea aparecía en `list_tasks` sin contexto inicial. Por el otro lado, con la subcarpeta de
tareas vacía, `.obsidian/` o `.git/` de la raíz contaban como proyectos, y el futuro
`.phase-gate/` de un proyecto, como una tarea.

**Por qué sobre la ruta real.** Igual que la contención: un enlace interno que lleva a una tarea
sigue valiendo, porque lo que se escribe acaba dentro de ella. La subcarpeta de tareas se compara
con la que hay en disco y no con el texto de la variable: en Windows y macOS pueden diferir en
mayúsculas, y `discoverProjects` ya daba ese proyecto por bueno.

**Desvío E1-D1 (aprobado por la autora).** Dos cambios que el plan no pedía en este lote:

- `start_task` rechaza un `task_name` que empieza por punto, y un `project` que empieza por
  punto cuando viene con `crear_proyecto`, con un error que nombra el campo. Si no, crearía una
  carpeta que `list_tasks` no ve y en la que `write_central_doc` no escribe. La comprobación
  (`validarNombreVisible`) va en `start_task` y no en `validarSegmento` ni en `taskFolderPath`,
  porque los dos llegan también a `read_central_doc`, que no cambia en esta etapa.
- La descripción de `file_path` en `write_central_doc` dice que la ruta tiene que caer dentro de
  la carpeta de una tarea que ya existe.

**Qué deja de funcionar, a propósito:**

- Escribir con `file_path` fuera de una tarea: en la raíz de `DOCS`, en la raíz de un proyecto
  o en una carpeta que no es proyecto (`Plantillas/`). Esos archivos se editan a mano.
- Escribir en una tarea que no existe. Se crea antes con `start_task`, que guarda su contexto
  inicial.
- Escribir un archivo o una subcarpeta con punto dentro de una tarea (`.borrador.md`,
  `.git/…`).
- Ver como proyecto o como tarea una carpeta con punto que alguien ya usara así: se renombra la
  carpeta.
- Crear con `start_task` una tarea, o estrenar un proyecto, cuyo nombre empiece por punto.

---

## 2026-10-14 — Dependabot agrupa lo menor e ignora las versiones mayores de TypeScript y de los tipos de Node

**Decisión.** En npm, las versiones menores y los parches llegan en un solo PR semanal
(`menores-y-parches`), y las mayores, sueltas. Las mayores de `typescript` y `@types/node` se
ignoran. Las acciones de GitHub se actualizan juntas, en el grupo `acciones`.

**Por qué.** Su primera ejecución, al mergear la Etapa 0, abrió seis PR a la vez, uno por
dependencia. Así, revisar dependencias deja de ser mantenimiento y se vuelve ruido.

- **TypeScript:** un cambio de compilador mayor se decide aparte, no como mantenimiento.
- **`@types/node`:** los tipos tienen que seguir a la versión mínima que soporta el paquete
  (`engines.node >=22`). Con los de Node 26 se podría usar sin aviso una API que no existe
  en Node 22.

**Qué se descartó.** Ignorar todas las versiones mayores. Las de dependencias de runtime, como
el SDK de MCP, tienen que seguir llegando: suelen traer arreglos de seguridad que no se
quieren perder.

---

## 2026-10-14 — El plan maestro v3 se versiona en `docs/`

**Decisión.** El plan de la versión 3 vive en [`docs/plan-maestro-v3.md`](plan-maestro-v3.md),
versionado con el código. Desde que entra al repo, esa copia es la fuente: cada etapa la
actualiza en su lote de documentación con el estado de sus lotes y sus desvíos, sin reescribir
el diseño de las etapas ya cerradas.

**Reemplaza, para este plan,** la entrada del 2026-08-07 "El plan del proyecto vive en Issues,
no en un archivo".

**Por qué.** Aquella decisión era contra una lista de pendientes —un `TODO.md` que envejece
mal— y sigue siendo cierta para eso. Este plan es otra cosa: un documento de diseño con
decisiones, alternativas descartadas, anclas contra el código y verificaciones ejecutadas. Un
issue no tiene dónde guardar eso, y fuera del repo se separa del código que describe. Como
activo de ingeniería tiene valor por sí mismo.

**Lo que se mantiene de la anterior.** Los fallos y los pendientes sueltos siguen yendo a
Issues, y cada etapa puede tener su issue de seguimiento que enlace a su sección del plan.

**Privacidad.** Antes de entrar se revisó el texto entero: sin rutas reales de ningún equipo,
sin nombres de proyectos o clientes del trabajo y sin datos de terceros.

---

## 2026-10-14 — Los argumentos se validan con zod declarado como dependencia directa, y los schemas son la fuente de la Etapa 2

**Decisión.** Cada tool declara sus argumentos en `src/schemas.ts` con zod, y el servidor los
valida al entrar, antes de que ninguna tool los use. Un argumento ausente o de otro tipo
devuelve un error en español que **nombra el campo**. `zod` pasa a ser dependencia directa en
`package.json`.

**Por qué.** Las tools leían sus argumentos con `String(args?.x)`, que convierte cualquier cosa
en texto sin quejarse. Sin `task_name`, `start_task` creó la tarea `undefined/` y la dejó
activa. Sin `content`, `write_central_doc` escribió el documento de la fase y lo dio por
bueno. Un `repo_name: 7` acabó buscando en la carpeta `7`. Ninguno de esos casos fallaba: el
error aparecía después, en otra parte y con otra cara.

**Por qué dependencia directa, si ya estaba instalada.** Llegaba como dependencia del SDK de
MCP. Usarla sin declararla deja la versión en manos de otro paquete: si el SDK la cambia o la
quita, el servidor se rompe sin que nada en este repo lo diga.

**Por qué shapes y no objetos.** `src/schemas.ts` exporta los campos sueltos (`ZodRawShape`)
porque es lo que recibe `registerTool` en la migración a `McpServer` de la Etapa 2. Así esa
migración reutiliza estos schemas tal cual, en vez de reescribirlos.

**Cuánta tolerancia.** `null` en un campo opcional cuenta como ausente (los opcionales son
`.nullish()`): algunos clientes con modelos en modo estricto mandan `null` en todo campo
opcional, y rechazarlo los rompería. Un número en texto (`phase: "3"`) **no** se convierte: se
rechaza con un mensaje que dice qué se espera ("`phase` debe ser un número, por ejemplo 3").
Es raro, el modelo lo corrige al primer intento, y convertirlo complicaría el JSON Schema que
la Etapa 2 genera desde estos shapes.

**Qué no cambia.** Los nombres y los parámetros de las tools, y el `inputSchema` que ve el
cliente. Qué combinación de `project`, `task_name`, `file_name` y `file_path` vale lo sigue
decidiendo `resolveDocPath`: el schema solo comprueba que cada uno, si viene, sea texto.

---

## 2026-10-14 — La contención se comprueba contra la ruta real y los nombres son un solo segmento portable

**Decisión.** Toda ruta que una tool lee o escribe en la Documentación se compara contra la
base **después de resolver symlinks y junctions**, de la base y de la ruta (`estaDentroReal`).
Los nombres de proyecto y de tarea, y cada segmento de `file_name`, tienen que ser **un solo
segmento de ruta portable** (`validarSegmento`): sin `/` ni `\`, sin `.` ni `..`, sin
`< > : " | ? *` ni caracteres de control, sin punto ni espacio al final y sin nombres
reservados de Windows. Con `project + task_name + file_name`, el archivo además tiene que
quedar dentro de **su tarea**, no solo dentro de la base.

**Complementa** la entrada del 2026-08-08 sobre `path.relative`: la comparación sigue siendo
relativa, pero entre rutas reales.

**Por qué.** El diagnóstico reprodujo cuatro escapes contra el binario compilado. Un
`task_name` con `..` sacaba `start_task` de su carpeta. `crear_proyecto` con `"../evil"`
creaba el proyecto fuera de la raíz, porque `toUpperCase` no valida nada. Un `file_name` como
`"../otra-tarea/x.md"` escribía en otra tarea, porque la comprobación solo miraba la base. Y
un symlink dentro de la Documentación que apuntaba fuera dejaba leer y escribir al otro lado:
su ruta "estaba dentro" como texto, pero su destino no. Los cuatro quedan como casos de
`test/e2e.test.ts`.

**Por qué es seguro.** Solo se rechazan nombres que ya eran peligrosos o no portables. Un
nombre con `/` creaba carpetas anidadas que `listarTareas` no ve como tarea, y uno con `:` o
con punto final se rompe al sincronizar con Windows. Siguen valiendo los espacios, los
acentos, la `ñ`, los paréntesis y una subcarpeta en `file_name` (`04 - Ejecución/L01 - x.md`).
También un symlink que no sale de la Documentación y una raíz `DOCS` que es un symlink.

**Un detalle de `rutaReal`.** La ruta que se va a escribir casi nunca existe todavía, así que
se resuelve el ancestro existente más cercano y se vuelve a unir el resto. "Existe" se mira
con `lstat`: un enlace roto cuenta como existente, `realpath` falla y la operación se rechaza.
Con `existsSync` el enlace roto se saltaría, y escribir a través de él crearía su destino, esté
donde esté.

**Qué se descartó.** Normalizar los nombres (quitar los caracteres prohibidos, recortar el punto
final) en lugar de rechazarlos. Así dos nombres distintos acaban en la misma carpeta sin que
nadie se entere, y el error que explica la regla es más barato que esa confusión.

**Ampliado tras la auditoría externa de la Etapa 0.** Dos cambios:

- Los segmentos de `file_path` pasan por la misma validación que los de `file_name`.
  `file_path` no salía de la base, pero dentro de ella creaba `CON`, `nul.md` o el flujo
  alterno `nota.md:secreto`, que el Explorador y OneDrive no saben manejar.
- La lista de nombres reservados suma los que Windows también reserva: `CONIN$`, `CONOUT$`,
  `COM` y `LPT` con los superíndices `¹²³`, y los espacios antes de la extensión
  (`nul .txt` sigue siendo NUL).

**Qué deja de funcionar, a propósito:**

- Un `file_name` o un `file_path` con segmentos vacíos o de punto, como `./x.md`, `a//x.md`
  o `a/../b.md`, aunque no salgan de su carpeta. Basta con escribir la ruta sin ellos.
- Una tarea creada en Linux o macOS con `:` o con punto final en el nombre: se sigue
  listando, pero ya no se lee ni se escribe por `file_name`. Ese nombre ya se rompía al
  sincronizar con Windows; hay que renombrar la carpeta.
- Un proyecto o una tarea que es un enlace hacia fuera de la Documentación: se rechaza,
  porque es exactamente el escape de S4. Un enlace que apunta dentro de la Documentación
  sigue valiendo.

---

## 2026-08-12 — La Fase 2 traduce el cambio para quien pidió el ticket, dentro de su documento

**Decisión.** La Fase 2 gana una sección condicional, "Traducción para quien pidió el ticket",
que se dispara cuando el cambio mueve una cifra, una fila o una pantalla que una persona no
técnica usa para decidir. Va al final del documento y se escribe sin jerga y sin `archivo:línea`
—la única inversión de esa regla en todo el flujo—. Es solo prompt: cero código.

**Por qué existía el hueco.** El flujo producía documentos para dos audiencias: quien implementa
(fases 1 a 3) y el repositorio (fases 4 y 5). Para la persona que pidió el ticket, nada. En un
cambio real sobre un reporte de productividad, una columna pasó de 1,031 a 1,899 en la misma
ventana de fechas, tres personas quedaban en cero y otra se desplomaba de 85 a 7. Sin
traducción, quien pidió el cambio se entera de eso el día que abre el reporte.

**Por qué en la Fase 2 y no en otra.** Porque ahí es donde se toman las decisiones, y la que
quedó abierta al cerrar esa fase era justamente de negocio: no se podía cerrar porque no había
forma de explicarle a esa persona qué implicaba. El dato que la desbloqueó —que una dimensión
que nadie había mirado concentraba el 93.5% de la calificación, de modo que arreglar las dos
columnas del ticket movía el resultado un 3.5%— salió de un anexo improvisado, porque a la
usuaria del flujo se le ocurrió pedirlo. Nada lo contemplaba.

**Por qué no una sexta fase.** Se planteó y se descartó: agregar una fase por esto desbalancea
el flujo, y el contenido pertenece al momento en que se decide, no a un momento posterior.

**Por qué no sale a un anexo, aunque el issue lo proponía.** La propuesta original permitía
mandarla a un `Anexo 02 - <tema>.md` si crecía. Se descartó por dos motivos. El primero es que
"si crece más allá de una sección" no es verificable: el modelo lo interpreta distinto cada vez.
El segundo pesa más: hoy el flujo **nunca** ha escrito un archivo que no sea el documento de su
fase, y abrir esa puerta convierte la carpeta de la tarea en un sitio donde aparecen archivos
que nadie pidió. La explicación vive junto a las decisiones que explica, así que no se
desactualiza por su cuenta. Si algún día una traducción se vuelve inmanejable dentro del
documento, se reabre la decisión con ese caso concreto encima de la mesa.

Para el registro, porque era el argumento técnico a favor del anexo y sigue siendo cierto: un
archivo extra en la carpeta **no** habría roto nada. La deducción de fase compara contra el
nombre exacto que declara cada prompt (`src/tasks.ts`), así que un archivo con otro nombre ni
cuenta como fase ni mueve el orden por actividad. Queda cubierto con un test para que siga
siendo cierto.

**El disparador se escribió más ancho que el caso que lo originó.** El caso era un reporte, pero
amarrarlo a cifras y filas dejaba fuera lo que cambia de significado sin cambiar de número: un
estado que pasa a querer decir otra cosa, algo que se renombra y la gente usa a diario, un flujo
de pantalla con otros pasos. Se cubren con "o cambia lo que esa persona ve o cómo lo interpreta".

**Lo que la hace dispararse sin que se la pidan.** Una pregunta en la autoverificación y una
línea en PROHIBIDO. Sin eso, la sección existiría en la tabla y seguiría dependiendo de que
alguien se acordara de pedirla, que es exactamente el problema que se está resolviendo. La línea
de PROHIBIDO cubre el otro lado: una sección condicional que se rellena por completitud cuando
no se disparó es peor que no tenerla.

**Lo que no entra.** No sustituye al "Aviso a alguien más" de la Fase 4: ese avisa que una cifra
va a cambiar, esta explica por qué y qué implica. Conviven, y de momento sin ninguna remisión
entre ellas. Tampoco cubre la comunicación posterior —el comentario en el gestor de tareas, el
correo—, que es otro tema.

---

## 2026-08-10 — Se publica por OIDC, sin token, y la primera versión sale a mano

**Decisión.** El workflow se autentica con npm por OIDC contra un editor de confianza. No hay
`NPM_TOKEN` ni ningún otro secreto. La `2.0.0` se publica a mano desde una máquina, con 2FA
interactivo, porque es la única forma de que exista la página del paquete.

**Por qué a mano la primera.** npm no deja declarar un editor de confianza para un paquete que
todavía no existe: la configuración vive en la página de ajustes del paquete, y esa página nace
con la primera publicación. Es una limitación conocida y hay un issue abierto pidiéndola
([npm/cli#8544](https://github.com/npm/cli/issues/8544)); otros registros como PyPI sí lo
permiten. Así que la primera versión tiene que salir por otro camino, sí o sí.

**Por qué no un token para esa primera.** Era la alternativa: token → publicar desde CI →
configurar el editor de confianza → revocar el token. Acaba en el mismo sitio y de propina le
da sello de procedencia a la `2.0.0`. Se descartó por lo que pasa **si esa secuencia se
interrumpe**: te quedas con un token que salta el 2FA, con permiso sobre la cuenta entera
—porque un paquete que no existe no se puede seleccionar en un token granular, hay que dar
"todos los paquetes"—, vivo en npm y guardado en GitHub, sin ninguna razón. El paso de revocar
es justo el que se olvida. Publicando a mano no hay estado intermedio que se pueda quedar a
medias: en el peor caso te quedas publicando a mano, que es incómodo pero no es un riesgo.

npm además está restringiendo esos tokens: cambios de cuenta en agosto de 2026 y publicación
directa en enero de 2027. Montar ahora lo que hay que desmontar en unos meses no se paga.

**El costo aceptado.** La `2.0.0` no lleva sello de procedencia, porque ese sello solo lo puede
generar CI —esa es exactamente su gracia—. Es una insignia de confianza en una página web: no
cambia que el paquete funcione ni quién lo puede instalar, y de la `2.0.1` en adelante sí lo
llevan. Barato a cambio de no crear la llave.

**El detalle que rompe esto en silencio.** Node 22 trae npm 10, que no sabe autenticarse por
OIDC. Sin actualizar el CLI en el workflow, el publish falla con un 401 que no menciona la
versión de npm por ningún lado.

**Ojo con el tag `v2.0.0`.** No se crea. La versión ya está publicada, así que el workflow solo
intentaría republicarla y npm la rechazaría por duplicada. Los tags empiezan en `v2.0.1`.

---

## 2026-08-10 — Publicable en npm: los prompts se superponen en capas

> **Reemplazada en parte** el 2026-10-15 por "Los presets y las personalizaciones se escriben
> como bloques sobre ranuras…": el punto "`global-rules.md` sustituye, no concatena" ya no vale
> para las secciones esqueleto (BASE y PENDIENTES), que se reinyectan. El resto sigue.

**Decisión.** El paquete gana `bin`, el `index.ts` gana shebang, y `ORQUESTADOR_PROMPTS_PATH`
deja de **reemplazar** la carpeta de prompts para **superponerse** a ella. Se publica como
`2.0.0`, sin scope, con un workflow que dispara en tag.

**Por qué las capas.** Con un clon del repo alrededor, reemplazar no molestaba: editabas
`prompts/` y ya. Instalado desde npm los de fábrica caen dentro de `node_modules`, donde
editarlos no sirve porque la siguiente instalación se los lleva. Reemplazar obligaba entonces a
copiar las seis para cambiar una: te quedas con copias congeladas que ya no reciben mejoras y,
si olvidas copiar una, **esa fase deja de existir sin que nada avise**. Ese modo de fallo
silencioso es lo que decidió el diseño.

**Por número de fase, no por nombre de archivo.** Superponer por nombre obligaría a adivinar
cómo se llama el archivo del paquete para poder pisarlo, y a mantenerlo sincronizado si el
paquete lo renombra. Por número, tu `fase-2-como-yo-quiera.md` pisa al `fase-2-decisiones.md`
sin que tengas que saber que existe. Sale gratis además que un `fase-6-*.md` propio **añada** la
fase 6, no solo la reemplace.

**El desempate no cruza capas.** Dentro de una carpeta gana el primer archivo por orden
alfabético. Aplicar esa regla sobre el conjunto haría que un nombre "temprano" en la capa de
abajo bloqueara al de arriba, que es exactamente al revés. Por eso cada capa se resuelve entera
antes de fundirse con la anterior, y hay un test que fija ese caso.

**`global-rules.md` sustituye, no concatena.** Concatenar dos juegos de reglas globales hace
imposible saber de qué archivo salió la instrucción que estorbó, y ese es justo el momento en
que hay que saberlo. Quien quiera las de fábrica y algo más, las copia.

**Las capas son un parámetro, no una lectura del entorno.** `discoverPhases(capas)` recibe la
lista en vez de leerla dentro. Sin eso, cada test dependería de cuántas fases traiga el repo
hoy: agregar una fase 6 de verdad rompería tests que no hablan de fases.

**`--help` y `--version`.** Un servidor MCP no imprime nada y espera JSON-RPC por stdin.
Ejecutado a mano en una terminal —que es lo primero que hace quien acaba de leer `npx
mcp-phase-gate` en el README— parece colgado. Las banderas convierten ese momento en una
explicación.

**Versión 2.0.0 y no 1.0.0.** Es la primera vez que existe en npm, así que 1.0.0 habría sido lo
ortodoxo. Pesó más que el número coincida con cómo se piensa el producto: respecto a la versión
anterior es otra cosa. El costo es que alguien busque una 1.x en npm y no la encuentre.

**Sin scope.** `mcp-phase-gate` estaba libre y da `npx mcp-phase-gate`, corto y decible.
`@usuaria/mcp-phase-gate` no puede chocar con nadie, pero es largo y hay que acordarse de
`--access public` o se publica privado.

**El tag manda sobre la versión.** El workflow comprueba que `v2.0.1` y el `package.json` digan
lo mismo antes de publicar. Sin esa comprobación, etiquetar sin subir la versión intenta
publicar una versión ya publicada, y el error de npm no menciona el tag, que es la causa real.

**Qué se descartó.** Buscar el `.env` también en el directorio de trabajo, para que el camino
`npx` pudiera usar archivo. El directorio de trabajo de un servidor MCP lo decide el cliente y
es impredecible: la configuración funcionaría o no según desde dónde se lanzara. El bloque
`"env"` del cliente ya resuelve ese caso y es el mecanismo estándar en MCP.

También un `CHANGELOG.md`: un archivo más que mantener a mano y que se desincroniza. Las
releases de GitHub salen de los tags, y el *por qué* ya vive en este archivo.

---

## 2026-08-10 — Un solo nombre: `mcp-phase-gate` en el repo, el paquete y el servidor

> **Reemplazada en parte** el 2026-10-15 por "Las variables se llaman `PHASE_GATE_*` y
> `ORQUESTADOR_*` queda como alias": el punto "Qué NO se renombró" ya no vale. El resto sigue.

**Decisión.** El paquete de npm pasa a llamarse `mcp-phase-gate`, `SERVER_NAME` deja de ser
`phase-gate` para ser también `mcp-phase-gate`, y el repo se renombra igual. De paso, el
`package.json` se prepara para publicarse: `files`, `engines`, `keywords` y `prepublishOnly`.

**Por qué ahora.** Nada está publicado todavía. El nombre de un paquete de npm es lo más caro de
cambiar una vez que alguien lo instaló, y hoy ese costo es exactamente cero. Esperar a la #11
para decidirlo habría significado decidirlo mal por prisa o no decidirlo nunca.

**Por qué `mcp-phase-gate` y no `mcp-orquestador`.** Se mantiene el razonamiento de la entrada de
`phase-gate` más abajo: "orquestador" no dice qué orquesta. Lo que cambia es el prefijo `mcp-`,
que dentro de un servidor MCP es redundante pero el paquete lo necesita para encontrarse
buscando "mcp" — y tener **un** nombre en los tres sitios valía más que tener el nombre
teóricamente perfecto en uno y parecido en los otros.

**Qué se descartó.** `mcp-compuerta`, que es el mismo término en español y ya es el vocabulario
del repo (`avisoDeCompuerta`, la sección de la compuerta en ambos READMEs). Habría mantenido la
identidad en español, que es real: los prompts y los documentos de fase lo son. Pesó más que el
nombre del paquete se entienda fuera del español. También `cinco-fases`, memorable pero con el
número congelado: el día que las fases cambien, el nombre miente.

**Qué NO se renombró.** El prefijo `ORQUESTADOR_*` de las variables de entorno. El usuario nunca
lo ve en su cliente —solo en su `.env`—, así que alinearlo rompe configuraciones a cambio de
nada visible. Si algún día molesta, es una entrada aparte.

**Lo que sí se movió y tiene precio.** `APP_DIR_NAME` sí pasa a `mcp-phase-gate`, porque esa ruta
está escrita en ambos READMEs y dejarla con el nombre viejo obligaba a explicar por qué la
carpeta se llama distinto que todo lo demás. El precio es que los punteros guardados bajo el
nombre anterior dejan de verse. No se migran: se recuperan con un `switch_task`, y arrastrar
código de migración para un dato que cuesta un comando es más caro que el problema.

**De paso, una contradicción que llevaba tiempo.** Los READMEs pedían Node 18 en los requisitos y
Node 22 unas secciones más abajo, y CI solo prueba 22 y 24 — nadie ha ejecutado nunca esto en 18.
Ahora `engines` declara `>=22` y ambos READMEs dicen lo mismo. 18 y 20 ya están fuera de soporte,
así que no se pierde nada real.

**Sobre `files`.** Sin él, `npm pack` metía 50 archivos y 357 kB: los tests, todo `src/`, los
`tsconfig`, el workflow de CI, `.claude/commands/` y los 53 kB de este mismo archivo. Y `build/`
entraba por el comportamiento por defecto de npm pese a estar en el `.gitignore` — funcionaba,
pero por accidente, que es la peor forma de funcionar. Ahora se declara qué se publica.

---

## 2026-08-10 — Varias documentaciones se resuelven registrando el servidor dos veces, no con código

> **Matizada** el 2026-10-15 por "Cada proyecto puede declarar un `phase-gate.json`; cada equipo,
> un `machine.json`": ya existe un formato de configuración, pero los espacios con `use_space`
> siguen descartados. Y **reemplazada en parte** el mismo día por "`init` escribe la configuración
> del cliente con copia, diff y confirmación": el descarte de la app de escritorio sigue, pero
> escribir la configuración del cliente ya no se deja a mano. Y **reemplazada en parte** el
> 2026-10-17 por "El Studio es un servidor local separado del MCP, en `127.0.0.1`, con token, cookie y
> CSP": ya hay una interfaz visual, aunque no una app de escritorio.

**Decisión.** Tener documentaciones separadas —una de trabajo y otra personal, por ejemplo— se
documenta como un patrón de configuración: **registrar el servidor más de una vez** en el
cliente, con un bloque `env` distinto en cada registro. No se añade nada al código.

De paso se dejan de dar por hecho dos cosas que solo eran ciertas para quien lo escribió: los
nombres de proyecto reales pasan a `PROYECTO-A/B/C` en README, comentarios, descripciones de
tools y fixtures, y OneDrive pasa de requisito a recomendación.

**Por qué no hay código.** El servidor nunca ha hablado con OneDrive: recibe una ruta local y no
sabe si detrás hay una nube, cuál, o ninguna. Así que "soportar Google Drive" no era una
integración que faltara — era una frase mal escrita en el README. Y las rutas ya son por
instancia, así que dos registros ya dan dos documentaciones, cada una con su propia subcarpeta
de tareas. Lo único que faltaba era decirlo.

**El filo que sí había que documentar.** Cada registro necesita su propio
`ORQUESTADOR_STATE_PATH`. Si se comparte, los punteros se pisan **en silencio**: la clave del
estado es el nombre del proyecto, así que dos documentaciones con un proyecto homónimo comparten
entrada y una le contesta a la otra. No da error, devuelve la tarea equivocada.

**Qué se descartó.** Soporte real de múltiples raíces en el código: una lista de rutas en la
misma variable, o "espacios" declarados en un `config.json` con una tool `use_space`. Esa
maquinaria existe para cambiar de espacio **dentro de una misma ventana**, y el uso real es
abrir ventanas distintas — donde dos registros ya alcanzan. Introducir un formato de
configuración nuevo, migrar el formato del estado y tocar las ocho tools para algo que resuelve
una sección de README es trabajo que no se paga. Se retoma el día que haga falta cambiar sin
abrir otra ventana, o que mantener cuatro o cinco bloques de `env` duplicados moleste.

Descartada también una **app de escritorio** para elegir las rutas con interfaz. No sustituiría
nada: solo escribiría el archivo que el servidor lee, así que el soporte tendría que existir
igual en el código. Y sería más código que todo el orquestador junto, con firma, tres builds y
autoactualización encima, para un público que ya edita un `mcp.json` a mano.

**Nota sobre el registro.** Los párrafos históricos que nombraban los proyectos reales se
reescribieron describiendo su forma, no sustituyendo por nombres inventados: meter placeholders
en la narración de una decisión pasada volvería ficticio este archivo, que es justo lo que no
puede ser.

---

## 2026-08-08 — La compuerta avisa, no bloquea, y la resuelve el servidor

**Decisión.** `get_phase_prompt` comprueba que no se esté saltando una fase y, si la hay,
entrega el prompt **con un aviso pegado al principio**. No bloquea. La comprobación es una sola
comparación: `fase pedida > siguienteFase`.

**Por qué avisar y no bloquear.** Hoy no hay compuerta ninguna, así que avisar es estrictamente
mejor que el presente y no rompe ningún flujo. Bloquear estorbaría el día que haga falta
saltarse una fase a propósito en un cambio trivial, y **todavía no hay dato de cuántas veces
pasa eso**. Avisar lo genera: si con el uso se ve que los avisos se ignoran, subir a bloquear es
un cambio pequeño y para entonces se sabrá si hace falta una escotilla de escape.

**Por qué la comparación es contra `siguienteFase`.** Porque ya es "la primera fase cuyo
documento falta", así que de ella sale gratis el caso que más fácil se implementa mal: volver a
una fase anterior para corregirla no es saltarse nada, y no se estorba. La compuerta mira
**huecos hacia atrás**, no el número que se pide. Implementarla como "no puedes pedir un número
mayor al que te toca" habría vuelto el flujo insoportable en dos días.

**Quién averigua de qué tarea se habla: el servidor.** `get_phase_prompt` recibía solo un
número y no podía consultar nada. La restricción que mandó sobre el diseño es que **el flujo
normal no se toca: se sigue escribiendo `/f4` y nada más**. Si el modelo tuviera que mandar la
tarea y no lograra deducirla, acabaría preguntándosela al usuario en cada fase, y escribir
`/f4` para que contesten "¿en qué tarea estamos?" es peor que no tener compuerta. El puntero por
proyecto ya está guardado en el servidor, así que lo resuelve él.

`project` y `task_name` existen como parámetros, pero **solo como anulación manual**. La
diferencia con "parámetros opcionales" a secas es la que importa: si no vienen, el servidor no
se rinde en silencio — usa su puntero. Solo se queda sin comprobar cuando de verdad no puede
saberlo (varios proyectos con tarea activa y ninguno indicado), y en ese caso lo dice en voz
alta en vez de fingir que todo está en orden.

**Descartado.** Bloquear de entrada; una variable de entorno con los tres modos, que sería una
perilla que documentar en dos README antes de saber si se necesita; y que fuera el modelo quien
resolviera la tarea, por la fricción de arriba.

**Consecuencia.** Los cinco comandos pasan ahora el `project` en el que se trabaja — dato que
el modelo tiene sin preguntar, porque la ventana está abierta en ese repositorio.

---

## 2026-08-08 — La fase de cada tarea se deduce de sus documentos, no se guarda

> **Reemplazada en parte** el 2026-10-16 por "La Fase 4 tiene granularidad de lote": el límite "la
> granularidad es fases terminadas, no a media fase" ya no vale para la Fase 4. La fase se sigue
> deduciendo de qué documentos existen.

**Decisión.** No hay ningún registro que diga en qué fase va cada tarea. El servidor mira qué
documentos existen en la carpeta y lo deduce: la fase siguiente es la primera cuyo documento
falta. Las tareas tampoco se listan de un archivo — son las carpetas que hay bajo la
subcarpeta de tareas del proyecto.

**Por qué.** Guardarlo sería tener dos copias de la misma verdad, y la copia guardada
dependería de que el modelo se acordara de reportar cada avance. Deducirlo del disco lo
convierte en un hecho comprobable: si borras `02 - Decisiones.md` porque quedó mal, la tarea
vuelve sola a la Fase 2 sin que nadie tenga que corregir un registro. También aparecen las
tareas creadas a mano, sin pasar por `start_task`.

Fue posible porque el nombre del documento ya estaba declarado en la cabecera de cada prompt
—decisión anterior, tomada para que el nombre viviera en un solo sitio—, así que la
información necesaria para deducir la fase ya existía.

**Qué se descartó.** Un registro de tareas con su fase dentro del archivo de estado, que es lo
que pedía el issue original. Se descartó al ver que obligaba a que `get_phase_prompt` recibiera
`project` y `task_name` para poder anotar el avance: el dato quedaba *best-effort*, cierto solo
mientras el modelo no se distrajera, y una tarea podía decir "fase 2" llevando la 4.

**Límites, asumidos.** La granularidad es "fases terminadas", no "a media fase". Y si algún día
se renombra un documento en la cabecera de un prompt, las tareas viejas se ven menos avanzadas
de lo que están, porque el archivo con el nombre nuevo no existe.

---

## 2026-08-08 — El estado se reduce a un puntero de tarea activa por proyecto

**Decisión.** El archivo de estado deja de ser un objeto con la tarea activa global y pasa a
ser un mapa `{ proyecto: tarea }`, en `active-tasks.json`. Se escribe a un temporal y se
renombra, para que un corte a media escritura no lo deje partido.

**Por qué.** Con un solo puntero, dos ventanas abiertas a la vez se lo pisaban: la segunda en
llamar a `start_task` le cambiaba la tarea activa a la primera, y cuando la primera perdía el
contexto y preguntaba dónde estaba, se le contestaba con total seguridad la tarea de la otra.
Un puntero por proyecto los vuelve independientes, que es como se trabaja en la práctica: las
tareas paralelas son de cosas distintas.

Se quedó en puntero —y no en registro— porque, con la fase ya deducida del disco, es lo único
que el disco no puede saber: cuál de las tareas te importa ahora.

**Consecuencia.** El formato anterior no se migra: se borra al arrancar. Perder los punteros
cuesta un `switch_task`, y no valía la pena escribir —ni mantener— una conversión para eso.
Eso dejó sin sentido la migración desde `build/` de la entrada del 2026-08-07, que rescataba con
cuidado un archivo cuyo contenido de todos modos se iba a descartar; se eliminó.

**Descartado.** Bloquear el archivo mientras se escribe. Queda una ventana mínima en la que dos
procesos simultáneos podrían perder el puntero del otro, pero el costo de eso es un
`switch_task`, mientras que un lock mal soltado deja el servidor inservible.

---

## 2026-08-08 — La Fase 5 deja documento y `start_task` se niega a pisar una tarea

**Decisión.** La Fase 5 pasa a guardar `05 - Auditoría.md` con la auditoría y la descripción del
PR, además de entregarlas en el chat como hasta ahora. Y `start_task` falla si la tarea ya
tiene contexto inicial, remitiendo a `switch_task`.

**Por qué.** Son dos consecuencias de deducir la fase del disco. La primera: si la Fase 5 no
dejaba rastro, una tarea acabada se quedaba para siempre en "lista para la fase 5" y no había
forma de verla terminada. La segunda: retomar una tarea con `start_task` reescribía su
`00 - Contexto Inicial.md` sin preguntar —el único documento que no se puede regenerar leyendo
el código—, así que hacía falta una forma no destructiva de cambiar de tarea, y esa es
`switch_task`.

**De regalo.** El texto del PR queda archivado en la carpeta de la tarea en vez de vivir solo en
el chat, que es de donde se perdía al cambiar de dispositivo.

---

## 2026-08-08 — El código se parte en módulos para poder probarlo

**Decisión.** `src/index.ts` se divide en `config.ts` (entorno y estado), `paths.ts` (rutas),
`phases.ts` (fases y prompts) y `tasks.ts` (tareas y tarea activa). `index.ts` se queda con las
tools y no calcula nada. Lo que se leía del entorno al importar el módulo pasa a leerse en cada
llamada.

**Por qué.** Un solo archivo que llama a `main()` al cargarse no se puede importar sin arrancar
un servidor, así que no había forma de probar una función sin rodearla de andamios. Las
funciones de rutas son justo las que más se prestan a romperse en silencio: un error ahí no
truena, escribe el archivo correctamente en el lugar equivocado.

Leer el entorno de forma perezosa era condición para lo mismo: con los valores capturados al
importar, un test no puede probar dos configuraciones sin recargar el módulo entero.

**Consecuencia.** Hay tests (`test/`, con `node:test`, sin dependencias nuevas) y un workflow de
CI que corre build y tests en cada PR. Los tests montan una Documentación Central de mentira en
una carpeta temporal en vez de simular el sistema de archivos, porque lo que se prueba es
precisamente el comportamiento contra el disco.

---

## 2026-08-08 — README bilingüe completo, asumiendo el costo de la duplicación

> **Reemplazada en parte** el 2026-10-18 por "El README principal pasa a inglés": los dos siguen completos
> y gemelos; lo que cambia es cuál es el principal.

**Decisión.** `README.md` en inglés y `README.es.md` en español, los dos completos. Ambos
abren explicando qué problema resuelve, por qué las fases y para quién es, antes de la
instalación, con un diagrama de las cinco fases.

**Por qué.** Los prompts —que son el producto real— están en español y se quedan así, pero la
documentación en un solo idioma decide por adelantado quién puede usar el proyecto. Con el
repo aún sin publicar, la decisión se toma ahora para no reescribirlo después.

**El costo, asumido a sabiendas.** Son dos documentos de cuatrocientas líneas que hay que
cambiar juntos, y ese es exactamente el problema que este repo ya resolvió dos veces: la ruta
duplicada entre el `mcp.json` y el `.env`, y el nombre del documento duplicado entre el prompt
y el comando. Aquí no hay forma de tener una sola fuente sin generar traducciones automáticas,
así que se acepta el riesgo y se mitiga con una línea en la tabla "Dónde está cada cosa" de
cada README que recuerda cambiar el otro. Si con el tiempo uno envejece, la salida es reducir
el español a un resumen que apunte al inglés, no seguir manteniendo dos completos.

**Qué se descartó.** Un README en español con solo una introducción en inglés, que evitaba la
duplicación pero dejaba a quien llega de fuera sin poder instalarlo sin traducir.

**De paso.** La sección "Guía de Uso Diario" seguía nombrando `01 - Análisis Técnico.md` y los
proyectos a mano, uno por uno — restos de antes de que el servidor entregara los nombres y
detectara los proyectos. Documentación que contradecía al código.

---

## 2026-08-08 — Licencia MIT

**Decisión.** MIT, a nombre de la autora. El `package.json` pasa de `"ISC"` a `"MIT"`.

**Por qué.** El `ISC` que había no lo eligió nadie: es el valor por defecto de `npm init`. O
sea que el manifiesto declaraba una licencia que no existía como archivo y que nunca se
decidió. MIT es la más corta, la más común en herramientas de desarrollo, y no le pone
condiciones a quien quiera usar esto en su trabajo.

**Qué se descartó.** Apache-2.0, cuya concesión de patentes no aporta gran cosa en un proyecto
de este tamaño y cuyo texto largo intimida en un repo pequeño. Y GPL-3.0, que habría impedido
que alguien cerrara un derivado, a cambio de que muchas empresas lo descarten por política.

**Lo que esta decisión no resuelve.** Si los derechos son de la autora o de la organización
para la que se construyó el flujo. Se planteó antes de escribir el archivo y la decisión de
firmar a título personal fue suya; queda anotado aquí porque es lo que habría que revisar
antes de hacer público el repositorio, no después.

---

## 2026-08-08 — El servidor se llama `phase-gate` y deja de presuponer Cursor

**Decisión.** El servidor pasa de anunciarse como `cursor-mcp-orchestrator` a `phase-gate`. El
README documenta el registro en Cursor, VS Code y Claude Code, y los comandos de fase se
versionan en `.claude/commands/`.

**Por qué el nombre.** Era equivocado por partida doble. Por un lado, el servidor habla MCP
estándar y funciona igual en VS Code o Claude Code, donde leer `cursor-` en el panel
desorienta; se comprobó registrándolo en VS Code, que muestra literalmente ese texto. Por otro,
"orchestrator" no dice qué orquesta: cualquier MCP que llame a varias cosas en orden es un
orquestador. `phase-gate` es el término de ingeniería de procesos para avanzar por fases sin
poder saltarse la anterior, que es exactamente lo que hace este flujo, incluida la Fase 2 que
se detiene a esperar respuestas.

**Por qué renombrar no rompe nada.** El nombre del servidor es metadato del `initialize`. Quien
lo identifica, y quien prefija sus tools, es la clave del archivo de configuración del cliente
—`mcp-orquestador`, que no cambia—. Los registros existentes siguen funcionando.

**Los tres clientes documentados son los tres que se probaron.** Windsurf queda fuera a
propósito: no está instalado en ninguno de los dos equipos y la propia
[issue #10](https://github.com/Montse2308/MCP_orquestador/issues/10) pide no listar un cliente
sin verificarlo.

**El hallazgo de Claude Code.** Es el único de los tres cuyo archivo de registro admite ruta
**relativa**, porque lanza el servidor desde la carpeta del proyecto. Eso lo vuelve el primer
archivo de configuración que se puede versionar y sirve igual en cualquier máquina, en vez de
llevar la ruta absoluta de un equipo concreto. Sus comandos de fase también viven en el repo,
así que en ese cliente el problema de mantener las copias sincronizadas a mano no existe.

**Qué se descartó.** Conservar "cursor" en el nombre, que era la primera intuición: hace que el
panel de los otros dos clientes muestre el nombre de un editor que no es el que estás usando.

---

## 2026-08-08 — Los proyectos son las carpetas que existen, no una lista

> **Reemplazada en parte** el 2026-10-15 por "Cada proyecto puede declarar un `phase-gate.json`;
> cada equipo, un `machine.json`": el descarte de un archivo de configuración ya no vale. Los
> proyectos siguen siendo las carpetas que existen.

**Decisión.** Se borra `PROJECT_DOC_DIRS`. Es proyecto la carpeta que contenga la subcarpeta
de tareas. Un proyecto inexistente se rechaza mostrando los válidos; para estrenar uno hay que
pasar `crear_proyecto: true` a `start_task`.

**Por qué.** La tabla no restringía nada: era una tabla de alias, y como cada entrada
coincidía con su propio nombre en mayúsculas, no hacía absolutamente nada. Se
comprobó pidiendo `project: "inventado"`, que resolvía `INVENTADO/Proyectos/...` sin quejarse.
El problema real no era que los proyectos estuvieran cableados sino que **no había validación
ninguna**: un typo en `/f1` creaba una carpeta suelta en la Documentación en silencio.

El disco ya es la fuente de verdad. Una lista declarada se desincroniza de él, y el día que
creas una carpeta y olvidas declararla falla sin que se entienda por qué.

**La puerta de `crear_proyecto`.** Sin ella, validar sería imposible de estrenar: el primer
proyecto nunca existiría. Va como bandera explícita y no como comportamiento por defecto
porque el caso que hay que evitar —el typo— es mucho más frecuente que el caso legítimo.

**Qué se descartó.** Declarar los proyectos en un `orquestador.config.json`, que es lo que
proponía la [issue #3](https://github.com/Montse2308/MCP_orquestador/issues/3): agrega un
archivo que mantener para reproducir peor lo que el disco ya sabe.

---

## 2026-08-08 — El nombre del documento lo declara el prompt de su fase

> **Reemplazada en parte** el 2026-10-15 por "Cada proyecto puede declarar un `phase-gate.json`;
> cada equipo, un `machine.json`": el descarte de `orquestador.config.json` ya no vale. El
> nombre de cada documento sigue en la cabecera de su prompt.

**Decisión.** Cada `prompts/fase-N-*.md` declara en una cabecera cómo se llama el documento
que produce. `get_phase_prompt` la lee y le entrega al modelo el nombre exacto del documento
de la fase y los de las anteriores. Los comandos `/f1`–`/f5` dejan de nombrar archivos.

**Por qué.** El nombre vivía duplicado en el prompt y en el comando, y se desincronizó de
verdad: al agregar el contrato de salida a las fases 2 y 4, los comandos siguieron sin escribir
esos documentos. Como los comandos viven en la carpeta del usuario de cada dispositivo y los
prompts en el repo, la copia que se desincroniza es además la que no se puede arreglar con un
`git pull`. Quitando el nombre del comando, el comando deja de cambiar.

**Por qué en el prompt y no en un archivo de configuración.** El prompt ya es donde se describe
ese documento, se lee en vivo sin recompilar, y así el dato no se separa de lo que lo explica.
Un archivo de configuración habría sido un tercer lugar para el mismo nombre.

**Qué se descartó.** `orquestador.config.json` con proyectos, subcarpeta y nombres de
documentos, que era la propuesta de la #3. Con los proyectos autodetectados y los nombres en el
prompt, el archivo se quedaba con una sola cadena dentro —la subcarpeta de tareas— y esa cabe
en una variable de entorno. La contra asumida: la subcarpeta es una convención de organización,
no una ruta de dispositivo, así que el `.env` deja de ser estrictamente "lo que cambia por
equipo". Se aceptó para no introducir un archivo de configuración por un solo valor.

---

## 2026-08-08 — Sin rutas por defecto, y el error se entrega en la tool

**Decisión.** `ORQUESTADOR_DOCS_PATH` y `ORQUESTADOR_REPOS_PATH` dejan de tener valor por
defecto. Si falta una, o apunta a algo que no existe o que no es una carpeta, **el servidor
arranca igual** y son las tools que dependen de esa ruta las que devuelven el error, con el
nombre de la variable y dónde configurarla. `get_phase_prompt`, que no necesita rutas, sigue
funcionando.

**Por qué.** El default era la ruta del equipo de quien escribió el código. En cualquier otro
dispositivo el servidor arrancaba "bien" y el error salía mucho después, dentro de una tool,
disfrazado de "no encontré el archivo" y sin mencionar que faltaba configurar algo.

Lo de entregar el error en la tool y no al arrancar es contra lo que decía la
[issue #6](https://github.com/Montse2308/MCP_orquestador/issues/6), y se decidió a
propósito: si el proceso muere, el cliente solo lo pinta en rojo y el motivo se queda en un
log que hay que ir a buscar. Devolviéndolo en la tool, el mensaje llega al chat, que es donde
está la usuaria. El log también lo escribe al arrancar, para cuando alguien sí abra el log.

**Por qué se valida que la carpeta exista, no solo que la variable esté definida.** Una
variable con un typo falla igual de tarde que una ausente. Y hay un caso que ya mordió una
vez y no es adivinable: un `.env` guardado en UTF-16 hace que la `Ó` de `DOCUMENTACIÓN`
llegue rota, así que la ruta "no existe" aunque en el Explorador se vea idéntica. El mensaje
de error lo nombra.

**Qué se descartó.** Salir del proceso al arrancar, por lo de arriba. Y arrancar dejando solo
una advertencia en el log: es lo mismo que hay hoy, un aviso que nadie ve.

---

## 2026-08-08 — La contención de rutas se comprueba con path.relative, no con startsWith

**Decisión.** Las tres comprobaciones de "esta ruta está dentro de la carpeta permitida" pasan
de `startsWith` a comparar la ruta relativa entre ambas.

**Por qué.** `startsWith` es comparación de texto sobre algo que no es texto, y fallaba en las
dos direcciones. Dejaba pasar la carpeta hermana con prefijo común —con base
`C:\PROYECTOS\TRABAJO`, la ruta `C:\PROYECTOS\TRABAJO_VIEJO` empieza igual sin estar dentro,
que es la [issue #7](https://github.com/Montse2308/MCP_orquestador/issues/7)— y además
rechazaba rutas legítimas cuando la base venía escrita con otras mayúsculas, cosa que no
estaba reportada y se encontró al probar el arreglo.

**Qué se descartó.** Normalizar a minúsculas y seguir con `startsWith`: arregla el caso de las
mayúsculas y deja intacto el de la carpeta hermana, que es el que importa.

---

## 2026-08-07 — La configuración por dispositivo no vive en el repo

> **Matizada** el 2026-10-15 por "Los comandos de fase se sirven como MCP Prompts desde
> `prompts/comandos/`": lo que esta entrada dejaba sin resolver —los comandos vivían solo en la
> carpeta del usuario— queda resuelto; llegan con el paquete. El resto sigue.

**Decisión.** El `.cursor/mcp.json` sale del repositorio y queda gitignoreado. La
configuración que cambia de un equipo a otro vive en la carpeta del usuario
(`~/.cursor/mcp.json`); el repo solo la documenta, en el Paso 4 del README y en la tabla de
lo que vive fuera del repo.

**Por qué.** El archivo commiteado apuntaba a `C:\proyectos\yo\MCP_orquestador\build\index.js`:
la ruta correcta en un dispositivo y una carpeta inexistente en el otro. No era una ruta
desactualizada, era una ruta que **no puede ser cierta en las dos máquinas a la vez** —
depende de dónde se clonó y, encima, señala dentro de `build/`, que está gitignoreado. Y al
declarar un servidor con el mismo nombre que el de la config de usuario, el archivo del
proyecto ganaba y dejaba el MCP muerto al abrir este repo. Es la misma razón por la que las
rutas de la documentación viven en `.env` y no en el código.

**Qué se descartó.** Corregir la ruta al valor del otro dispositivo: habría movido el bug de
equipo en lugar de quitarlo. Y dejarlo como `.cursor/mcp.json.example`: el Paso 4 del README
ya trae el JSON completo, y de dos copias del mismo contenido una acaba envejeciendo.

**Lo que esta decisión no resuelve.** Los comandos `/f1`–`/f5` siguen viviendo solo en la
carpeta del usuario, porque Cursor no los lee de otro lado. Editar una fase en un equipo deja
al otro con la versión vieja, y eso sí es un problema de flujo, no de configuración. Queda
como issue abierto; entretanto su contenido está copiado en
[`comandos-de-fase.md`](comandos-de-fase.md).

---

## 2026-08-07 — La Fase 4 hace; el documento es el recibo

> **Matizada** el 2026-10-14 por "La Fase 4 ejecuta lote por lote y hace el commit de cada uno
> con el OK del usuario": hay un recibo corto por lote, escrito al cerrarlo.

**Decisión.** El prompt de la Fase 4 pone casi todo su peso en cómo ejecutar y cómo
verificar. El documento va al final, corto, y el prompt lo dice con esas palabras: si el
modelo está redactando en vez de implementar o verificar, está gastando el turno en lo que
menos importa de esta fase.

**Por qué.** Las tres fases anteriores producen documentos; esta produce código funcionando.
La usuaria lo señaló al revisar el borrador: el enfoque de la Fase 4 tiene que seguir siendo
hacer las cosas, como estaba desde el principio, y el archivo no puede desplazar a eso.

**Qué se descartó.** Darle al documento de la Fase 4 el mismo tratamiento que a los de las
fases 1 a 3. Habría convertido la única fase que ejecuta en una cuarta fase de escritura.

---

## 2026-08-07 — Por qué el documento de la Fase 4 existe, aun siendo secundario

**Decisión.** El documento es obligatorio, pero su núcleo es chico y su propósito no es
registrar lo que se hizo: es registrar **lo que se supo al ejecutar y el plan no sabía**.

Sección obligatoria: *lo que no salió como decía el plan*, con sus tres formas — el método de
verificación que no funcionaba, la decisión nueva tomada al ejecutar (numerada `D<n>`
continua), y el número del plan que estaba mal. Si no hubo nada, una línea diciéndolo.

**Por qué.** La usuaria preguntó si el documento hacía falta, porque en la práctica casi nunca
aparecía. Aparecía poco por una razón simple: las fases 1 a 3 piden el documento
explícitamente y la 4 no lo mencionaba.

Sobre si hace falta: si solo repitiera lo hecho, no — para eso está el diff, y lo cuenta
mejor. Lo que justifica el documento es lo que el diff no puede contener. En una ejecución
real, el plan pedía congelar un baseline y volver a medirlo, y ese método no servía porque los
datos se movían solos entre corridas; se sustituyó por comparar el SQL generado en 17
escenarios. En esa misma ejecución, un número del plan resultó ser una medición en frío y lo
que se creía una mejora era un empeoramiento de 0.24 s. Nada de eso sobrevive en un diff.

**Qué se descartó.** Hacer el documento condicional a "pasó algo imprevisto". El modelo
concluiría que no pasó nada la mayoría de las veces, y se perdería justo el caso en que sí
pasó pero no era evidente.

---

## 2026-08-07 — La Fase 4 ejecuta lo que puede y deja escrito lo que necesita mouse

**Decisión.** La verificación de la Fase 4 va en dos listas separadas y visiblemente
distintas: lo que el modelo **ya ejecutó**, con su resultado en números, y lo que **espera al
usuario** porque necesita una pantalla, en tabla de `Prueba | Resultado esperado`. Está
prohibido mezclarlas o dar por hecha una prueba que quedó esperando.

**Por qué.** Las ejecuciones reales hacen las dos cosas sin distinguirlas: en unas el modelo
corrió scripts contra la réplica y reportó cifras; en otra dejó una tabla de siete pruebas
manuales bajo un título que casi se pierde. Sin la separación explícita, una prueba pendiente
se lee como una prueba superada.

Esto cierra el reparto que empieza en la Fase 3: la Fase 3 dice qué debe verse, la Fase 4 lo
comprueba y escribe cómo llegar a verlo solo para lo que no puede comprobar sola.

**Consecuencia aceptada.** Los resultados deben ir con números y no con adjetivos. "Se
verificó correctamente" queda prohibido de hecho: no distingue una verificación real de una
supuesta.

---

## 2026-08-07 — La Fase 4 no sube nada

> **Reemplazada** el 2026-10-14 por "La Fase 4 ejecuta lote por lote y hace el commit de cada
> uno con el OK del usuario": el commit de cada lote lo hace el agente con el OK del usuario.
> El push, las ramas y el PR siguen siendo del usuario.

**Decisión.** Prohibido hacer commit, crear ramas, hacer push o abrir un PR. La fase termina
con el código escrito, verificado y el documento cerrado.

**Por qué.** Es como ya trabaja la usuaria: las cuatro ejecuciones reales cierran diciendo que
los commits los sube ella. Estaba implícito en la costumbre y ahora es regla del prompt, para
que no dependa de qué modelo se use.

---

## 2026-08-07 — La Fase 3 dice qué debe verse; la Fase 4 dice cómo llegar a verlo

**Decisión.** La verificación se reparte por tipo, no por documento:

| Tipo | Ejemplo | Dueño |
|---|---|---|
| Evidencia técnica | tinker, SQL, `EXPLAIN`, un valor que debe seguir resolviendo igual | Fase 3 |
| Resultado esperado | "el título debe decir `5 ago. - 4 sep.`", "debe aparecer exactamente 1 comentario" | Fase 3 |
| Navegación por interfaz | "entra a la pantalla, clic en el botón, llena el campo, confirma" | Fase 4 |

**Por qué.** Este es el problema que originó todo el refinamiento de las fases. La usuaria
reportó que el "cómo probarlo desde la interfaz" a veces salía en la Fase 3, a veces en la
Fase 4 y a veces en ninguna. El diagnóstico: el prompt de la Fase 3 pedía "una sección para
saber cómo verificar" y el de la Fase 4 pedía "indícame cómo verificarlos". Dos fases lo
pedían y ninguna lo poseía.

El corte no es arbitrario. La evidencia técnica es parte de la prueba de que el diseño es
correcto: sacarla de la Fase 3 deja al plan sin poder defenderse. La navegación depende de
dónde está el botón hoy, y eso lo sabe mejor la Fase 4, que trabaja con la rama actualizada
enfrente.

**Qué se descartó.** Bajar toda la verificación a la Fase 4. Habría vaciado de contenido la
comparación de paridad, que es donde un refactor de rendimiento demuestra que no cambió nada.

---

## 2026-08-07 — El plan declara en qué nivel está cada fragmento de código

**Decisión.** Tres niveles, con disparador objetivo: **definitivo** (cabe en ~15 líneas, se
calca de un archivo ya citado, no depende de nada sin leer), **firma y contrato** (el cuerpo
es mecánico), y **propuesta** (algo no se pudo confirmar; el pendiente se escribe). Y una
regla dura: **archivo que ya existe, nunca completo** — solo el fragmento con su ancla
`archivo:línea`.

**Por qué.** Los nueve planes reales usan los tres niveles y ninguno avisa cuál está usando,
así que quien implementa no sabe si puede pegar o tiene que confirmar. La preocupación de la
usuaria fue la correcta: si la Fase 3 escribe el archivo entero, la Fase 4 se reduce a pegar,
y entonces lo que la Fase 3 no alcanzó a ver se pega también. La Fase 3 decide qué se va a
escribir; la Fase 4 lo escribe.

---

## 2026-08-07 — La Fase 3 comprueba el plan contra el código antes de escribirlo

**Decisión.** Antes del primer paso va una tabla `Verificación | Resultado` con lo que se
comprobó contra el código real. **Solo entra lo que cambió algo del plan**: si nueve de diez
comprobaciones salieron como se esperaba sin alterar nada, van cero de esas nueve.

**Por qué.** En un plan real esta tabla son ocho renglones de una línea, y lo que compraron
fue descubrir que el identificador que el plan iba a usar ya estaba ocupado por otro registro:
reutilizarlo habría hecho que dos factories existentes etiquetaran mal sus datos en
producción. Sin la tabla, ese defecto aparece en la Fase 4 o no aparece.

Es el equivalente en la Fase 3 de "la investigación se hace aquí" (Fase 1) y "validar antes
de cerrar" (Fase 2). Las tres fases comparten el mismo principio: comprobar en su propia
fase, no diferir.

**Qué se descartó.** Dejarla al final como nota de alineación. Arriba es la licencia para
confiar en el resto del documento; al final es una nota al pie.

---

## 2026-08-07 — Las numeraciones son continuas por tarea, no por fase

**Decisión.** Ya estaba establecido para las decisiones (`D1..Dn`); se extiende a los riesgos
(`R1..Rn`). La Fase 3 hereda la lista de riesgos de las fases anteriores y actualiza el estado
de cada uno (Aceptado / Cerrado / Nuevo) en vez de empezar una tabla desde cero.

**Por qué.** Con tabla nueva por fase, cada documento reinventa la lista y se pierde el hilo:
no se ve que `R12` se cerró gracias a un desvío de la Fase 3, ni que `R10` nació ahí. Ese hilo
es justo lo que hace falta al retomar la tarea desde otro equipo. Un plan real ya numeraba su
micro-decisión de Fase 3 como `D7`, continuando desde la Fase 2, sin que nadie se lo pidiera.

---

## 2026-08-07 — Sin suite de pruebas: la comparación contra la réplica ocupa ese lugar

> **Reemplazada** el 2026-10-15 por "El preset por defecto es `software`; la réplica pasa a
> `software-replica`": deja de ser la regla general. El texto vive, intacto, en ese preset.

**Decisión.** El proyecto de la usuaria no tiene pruebas automatizadas, así que la Fase 3
tiene **prohibido** inventar una sección de tests o proponer escribir la primera del módulo.
En su lugar hay una sección condicional de **comparación de datos contra la réplica de solo
lectura**, con disparador: *el cambio altera lo que muestra un reporte o un export existente*.

El criterio de comparación cambia según el caso, y el plan lo declara: si el cambio es solo de
rendimiento, **cero diferencias**; si altera datos a propósito, **toda diferencia tiene que
caber en una lista escrita de antemano**, y lo que quede fuera es un defecto, no una mejora.

**Por qué.** Tres de los nueve planes reales declaran explícitamente que no hay suite que
correr, precisamente para cerrar una pregunta que el modelo se hace solo. Pero sí hay acceso
de lectura a una réplica, y un plan real lo usó para verificar un refactor comparando volcados
antes y después. La sustitución conserva la garantía sin pedir infraestructura que no existe.

---

## 2026-08-07 — El plan declara desde qué rama y commit se planeó

**Decisión.** El encabezado de la Fase 3 incluye la rama, el commit y si el árbol estaba
limpio.

**Por qué.** La usuaria alterna entre el equipo de la oficina y su laptop personal. Al abrir el
plan desde el otro dispositivo, o dos semanas después, esa línea es lo que dice si el plan
sigue siendo válido o si la rama ya se movió por debajo. Cuesta una línea y uno de los planes
reales ya lo hacía.

---

## 2026-08-07 — Cada fase entrega documento, siempre

**Decisión.** Toda fase que produce un entregable lo escribe en un documento de la
carpeta de la tarea, aunque el trabajo se haya resuelto conversando. En particular la
Fase 2: aunque las decisiones se tomen en un intercambio de dos mensajes, se escriben.

**Por qué.** No es por formalidad. La usuaria trabaja parte del tiempo en el equipo de la
oficina y parte en su laptop personal fuera de horario. **El chat no viaja entre
dispositivos; el documento sí.** Una decisión que solo quedó dicha en la conversación, en
la práctica se perdió.

Esto convierte el documento en el estado compartido entre sesiones, no en un subproducto.

---

## 2026-08-07 — La Fase 2 valida, no solo pregunta

**Decisión.** Antes de dar una decisión por cerrada, la Fase 2 comprueba que sea segura:
consultas contra datos reales, lectura del código del framework, barridos buscando otros
consumidores, conteos de volumen. Los riesgos evaluados se documentan en una tabla de
`Riesgo evaluado | Resultado | Cómo se verificó`, incluidos los que resultaron no aplicar.

**Por qué.** El prompt anterior de la Fase 2 decía, completo: lee el análisis, identifica
lagunas, hazme preguntas, detente. Ni siquiera pedía generar un documento. Pero los
documentos reales hacían mucho más: uno descartó cuatro riesgos con datos y **encontró dos
consumidores que la Fase 1 no había visto**; otro planteó un riesgo propio, lo midió,
resultó ser cero y lo dejó escrito igual.

Eso salía por iniciativa del modelo, no porque se le pidiera. Codificarlo es la diferencia
entre que pase siempre y que pase cuando el modelo tiene un buen día.

**Consecuencia.** Se asume explícitamente que **la Fase 1 se equivoca**: buscó con un
criterio y algo se le escapó. Lo que la verificación destape pertenece al documento de la
Fase 2, no a una corrección del de la Fase 1.

---

## 2026-08-07 — Toda decisión dice a qué renuncia

**Decisión.** Cada decisión que sacrifica algo declara su **implicación aceptada**, como
elección consciente. Si no renuncia a nada, no se inventa una para llenar el hueco.

**Por qué.** Es la firma que aparecía en cuatro de los cinco documentos de decisiones
reales, y es lo que evita que dentro de seis meses alguien lea la decisión y crea que fue
un descuido. "La regla queda duplicada, es consciente, prioriza cero impacto en código
compartido" se lee muy distinto a encontrarse la regla duplicada sin explicación.

---

## 2026-08-07 — Reparto de los criterios de validación entre fases

**Decisión.**
- **Fase 2** define **qué hay que validar y qué se espera**, en términos de negocio y de
  superficies afectadas, derivado del alcance que acaba de cerrar.
- **Fase 3** convierte esa lista en criterios verificables con el detalle técnico.
- **Fase 4** los ejecuta.
- La Fase 1 no los escribe.

**Por qué.** Los documentos reales los pusieron en tres lugares distintos: uno en Fase 1
marcados como "propuestos", otro en Fase 2 como "lista de validación acordada", y la
instrucción inicial de la usuaria decía Fase 3.

Gana la Fase 2 para la lista porque **esos criterios se derivan del alcance**: no se pueden
escribir antes de decidir qué entra. En el documento real la lista salió con nueve puntos
precisamente porque la Fase 2 había descubierto dos consumidores más de los que conocía
la Fase 1.

---

## 2026-08-07 — Las decisiones se numeran de corrido por tarea

**Decisión.** La numeración `D1..Dn` es continua a lo largo de toda la tarea, no por fase.
Si la Fase 1 dejó abiertas `D1` a `D6`, la Fase 2 sigue en `D7`.

**Por qué.** Una decisión es una decisión sin importar en qué fase se tomó, y la
numeración continua permite referirse a ella sin ambigüedad desde cualquier documento
posterior. Cuatro de los cinco documentos reiniciaban en `D1` y uno continuaba; se eligió
el que continuaba.

---

## 2026-08-07 — No se clasifican las decisiones por quién las autoriza

**Decisión.** El documento registra la decisión y su fundamento. No se abren categorías
del tipo "cerrado con el usuario" contra "pendiente de validar con el negocio".

**Por qué.** Uno de los documentos reales lo hacía, y la distinción tenía lógica: son dos
tipos de bloqueo distintos. Se descartó por preferencia explícita de la usuaria. Si una
decisión sigue abierta, se dice que está abierta; el resto es taxonomía que no ayuda a
decidir.

---

## 2026-08-07 — Todas las tareas pasan por todas las fases; lo que se ajusta es la profundidad

**Decisión.** No hay triage que salte fases según el tamaño de la tarea. Todas pasan por
todas. Lo que se ajusta es cuánto entrega cada una, mediante el mismo mecanismo del
contrato del PR: un núcleo mínimo obligatorio más secciones que se activan por disparador.

**Por qué.** La idea original era una fase 0 que clasificara la tarea y saltara fases en
las chicas. Se descartó porque **el riesgo de un cambio no se correlaciona con su tamaño**:
una línea tocando permisos es minúscula y peligrosa; un módulo nuevo aislado es grande e
inofensivo. Una regla por tamaño acelera justo lo que había que analizar.

Con secciones condicionales, un ajuste chico no dispara casi ninguna y el documento sale
corto solo. La proporcionalidad se obtiene sin clasificar nada y sin arriesgar nada.

**Sin límites numéricos de longitud**, a diferencia del PR. Un análisis de un refactor que
toca tres reportes legítimamente necesita más espacio que uno de un botón. Lo que infla
estos documentos no es la prosa, son las secciones de relleno.

**Descartado.** Tallas chica/normal/grande con un paquete fijo de fases por talla.

---

## 2026-08-07 — Cada fase declara qué NO le toca

**Decisión.** El prompt de cada fase incluye explícitamente el terreno que pertenece a
otra fase. Reparto acordado:

- **Fase 1** — diagnóstico y recomendación de dirección, marcada como recomendación.
- **Fase 3** — el plan, y los **criterios de aceptación**: qué se tiene que poder verificar
  y desde dónde, escrito antes de tocar código.
- **Fase 4** — los **pasos concretos** para comprobar lo que se acaba de hacer, incluida la
  navegación por la interfaz, y qué **no** debe haberse roto.

**Por qué.** Dos fases pedían verificación sin decir de qué tipo: la 3 pedía "una sección
para saber cómo verificar" y la 4 pedía "indícame cómo verificarlos". Ninguna la poseía,
así que el "cómo probar" aparecía en una, en otra o en ninguna, según el modelo. Lo mismo
pasaba con el alcance de la Fase 1: su prompt pedía desglosar *el problema* mientras la
plantilla de uso pedía detallar *cómo lo resolveremos*, que es trabajo de la Fase 3.

Una instrucción vaga compartida por dos fases no se reparte sola: cada modelo la reparte
distinto. Declarar el dueño y declarar el no-dueño es lo que elimina la deriva.

---

## 2026-08-07 — En la Fase 1, la línea es describir contra comprometerse

**Decisión.** La Fase 1 nombra archivos y líneas todo lo que haga falta, pero no encabeza
una sección con "archivos a modificar". Inventariar lo que existe y quién lo consume es
Fase 1; comprometerse con qué se va a cambiar es Fase 3.

**Por qué.** La primera versión de la regla decía que la Fase 1 hablara de *áreas* y la
Fase 3 bajara a *archivos*. Los documentos reales la desmintieron: citan `archivo:línea`
constantemente y es de lo mejor que tienen — sin esa precisión, el análisis no se puede
verificar. El problema nunca fue el detalle, sino el compromiso.

Se ve en un mismo documento real, que tenía dos tablas seguidas: "Referencia (NO tocar)"
con archivos y su rol, que es Fase 1 legítima, y "A corregir (candidatos)", que ya era plan.

---

## 2026-08-07 — La verificación se hace en la Fase 1, no se difiere

**Decisión.** Si una hipótesis se puede comprobar ejecutando algo, se ejecuta en la Fase 1
y se reporta la salida real. Dejar consultas escritas "listas para correr" es el último
recurso, solo cuando el acceso no existe, y debe declararse como una laguna del análisis,
no como un entregable.

**Por qué.** Preferencia explícita del usuario, y coincide con lo que separa a los mejores
documentos de los demás: los que midieron descartan hipótesis con números, los que no
las descartan con argumentos. Un análisis medido cierra la discusión; uno argumentado la
abre.

**Consecuencia.** El prompt pide además confesar los errores de método propios y descartar
esos números explícitamente, porque un análisis que reconoce dónde se equivocó midiendo es
en el que se puede confiar.

---

## 2026-08-07 — El documento de una fase no se reescribe en fases posteriores

**Decisión.** Lo que se decide en la Fase 2 vive en el documento de la Fase 2. El
documento de la Fase 1 no se vuelve a tocar.

**Por qué.** Un documento real había ganado por su cuenta una sección "Decisión y alcance
confirmado (usuario, fecha)" escrita después de la Fase 2. Deja el expediente completo en
un archivo, que es cómodo, pero rompe la trazabilidad: ya no se puede saber qué se sabía
en cada momento, y el análisis original queda contaminado por lo que se decidió después.

---

## 2026-08-07 — Formato de los documentos de fase

**Decisión.**
- El **resumen ejecutivo va arriba**, nunca al final, con el veredicto y su número.
- Cada hallazgo se etiqueta con **Severidad** y **Confianza**.
- Las decisiones para la fase siguiente van como `D1..Dn`, con opciones `(a) (b) (c)` y una
  recomendación técnica marcada como tal.
- **Sin emojis**, en ninguna sección.

**Por qué.** Los nueve documentos de referencia discrepaban en estos cuatro puntos, y la
discrepancia no respondía a nada del contenido — era el modelo eligiendo. Se resolvieron
por preferencia del usuario. Las etiquetas de Severidad y Confianza aparecían en uno solo
de los nueve, y son lo que permite decidir qué atacar primero y en qué confiar.

El formato de decisiones con opciones tiene un efecto concreto: convierte la Fase 2 en
escoger en vez de redactar.

---

## 2026-08-07 — Los documentos de referencia no se versionan en el repo

**Decisión.** Los contratos de fase se calibraron contra documentos reales de trabajo
(descripciones de PR y análisis técnicos). Esos documentos **no se suben al repositorio**.
Lo que se versiona es el contrato derivado y el porqué de cada regla.

**Por qué.** Contienen nombres de clientes reales, direcciones IP internas, el esquema de
la base de datos y el nombre de la persona que introdujo una regresión. El repositorio está
destinado a ser público.

**Consecuencia.** Los ejemplos incrustados en los prompts están recortados a la frase que
demuestra el comportamiento, sin datos de negocio. Quien adapte el orquestador a su estilo
debe reemplazarlos por ejemplos propios.

---

## 2026-08-07 — El estado local vive en la carpeta de datos del usuario

**Decisión.** La tarea activa se guarda en la carpeta de datos del sistema operativo
(`%APPDATA%` en Windows, `Application Support` en macOS, `XDG_STATE_HOME` en Linux),
bajo `mcp-orquestador/`. Se puede forzar otra ubicación con `ORQUESTADOR_STATE_PATH`.

**Por qué.** Antes se guardaba junto al build, y `build/` es una carpeta generada:
borrarla para recompilar desde cero — algo perfectamente razonable — se llevaba la tarea
activa sin aviso.

Se eligió la carpeta del sistema operativo por encima de la raíz del repo porque es la
única que sigue funcionando cuando el servidor se ejecuta desde un paquete instalado, sin
repo alrededor. Resolver esto ahora evita rehacerlo al publicar en npm.

**Descartado.** La raíz del repo: más simple, pero ata el estado a que exista un clon y
ensucia el directorio de trabajo con un archivo que cambia solo.

**Consecuencia.** Hay una migración única al arrancar: si existe el archivo viejo en
`build/` y no el nuevo, se mueve. Es código que se puede borrar cuando ya nadie venga de
una versión anterior.

---

## 2026-08-07 — El plan del proyecto vive en Issues, no en un archivo

> **Reemplazada en parte** el 2026-10-14 por "El plan maestro v3 se versiona en `docs/`": el
> plan de diseño vive en `docs/plan-maestro-v3.md`. Los pendientes sueltos siguen en Issues.

**Decisión.** Lo que falta por hacer se registra como GitHub Issues, agrupado con las
labels `v1-uso-propio` y `v2-publico`. No hay `TODO.md` ni sección de roadmap en el README.

**Por qué.** Un archivo de pendientes hay que mantenerlo a mano y envejece mal: un
`TODO.md` con casillas a medio tachar y meses sin tocar se lee como proyecto abandonado.
Los issues traen el estado incorporado, se cierran solos desde el PR con `Closes #N`, y
en un repo público se leen como señal de que el proyecto está vivo.

Hay una razón práctica adicional: un asistente que retome el trabajo en otra sesión
puede leer los issues abiertos y saber dónde quedó todo, sin que nadie se lo reexplique.

**Descartado.** Un `TODO.md` en la raíz, y una sección de "próximos pasos" en el README.
El README describe lo que el proyecto es hoy, no lo que será.

---

## 2026-08-07 — La descripción del PR se entrega dentro de un bloque de código

**Decisión.** La Fase 5 entrega la descripción del PR dentro de un bloque de código de
cuatro backticks etiquetado como `markdown`, nunca suelta en el chat.

**Por qué.** Cuando el modelo escribe el markdown suelto, el cliente lo renderiza y al
copiar se pierde el formato: llega el texto plano sin los `##` ni los `**`, y hay que
rehacerlo a mano en GitHub. Dentro de un bloque de código se copia en crudo.

Son cuatro backticks y no tres porque la descripción puede incluir bloques de código
propios, y con tres el contenedor se rompe a la mitad.

---

## 2026-08-07 — El contrato del PR usa números, no adjetivos

**Decisión.** Las restricciones de la descripción del PR se expresan como cantidades
verificables: "máximo 3 líneas por bullet", "200-260 palabras", "máximo 4 grupos". No
se usan adjetivos como "conciso" o "breve".

**Por qué.** El problema original era que la sección del PR estaba escrita con adjetivos
mientras la de auditoría estaba escrita con reglas — y la de auditoría salía consistente
mientras la del PR variaba según el modelo. "Conciso" no significa nada: cada modelo
tiene su propia idea, y casi todos los modelos grandes tienden a inflar por defecto. Un
número se aplica igual en cualquier modelo.

---

## 2026-08-07 — La estructura del PR es fija; lo que se adapta es la agrupación

**Decisión.** La secuencia siempre es la misma (por qué → cambios → cierre). Lo que varía
según el ticket es el criterio para agrupar los bullets, elegido con una tabla de decisión
según la forma del cambio: por superficie afectada, por componente, por sub-feature, por
dimensión del dato, numerado, o lista plana.

Las secciones de cierre son condicionales, cada una con su disparador: `Alcance` solo si
se tocó código existente, `Verificación` solo si la prueba fue sustanciosa, `Notas de
despliegue` solo si hay migraciones.

**Por qué.** Una plantilla rígida se ve ridícula en un fix de tres líneas y se queda corta
en un módulo nuevo. Pero dejarle la estructura al criterio del modelo devuelve el problema
de origen: cada modelo decide distinto. La salida es hacer la discrecionalidad **basada en
reglas** — "incluye Riesgos solo si modificaste código que otras partes consumen" es
verificable; "ajústate al tamaño del cambio" no lo es.

**Descartado.** Una plantilla única con todas las secciones siempre presentes, y el
extremo opuesto de dejar el formato libre.

---

## 2026-08-07 — Los ejemplos de referencia del PR son PRs reales, no inventados

**Decisión.** El prompt de la Fase 5 incluye tres descripciones de PR reales como
ejemplos de referencia.

**Por qué.** Es lo que más estabiliza el resultado entre modelos distintos, más que
cualquier instrucción. El contrato define el esqueleto; los ejemplos definen la voz, que
es lo que ninguna regla logra describir.

**Consecuencia.** Quien adapte el orquestador a su estilo debería empezar por reemplazar
esos ejemplos por PRs suyos, antes que por editar las reglas.

---

## 2026-08-07 — Sin "cómo probar" en el PR; en su lugar, "Verificación" en pasado

**Decisión.** La descripción del PR no lleva pasos numerados de "cómo probar" dirigidos
al revisor. Lleva una sección `Verificación`, redactada en pasado y con números, y solo
cuando la verificación fue sustanciosa: comparar contra datos reales, medir, correr sobre
un volumen. Si solo se probó a mano en local, la sección se omite.

**Por qué.** Al revisar PRs reales aprobados, ninguno tenía pasos de "cómo probar" y
varios sí decían qué se había verificado y con qué resultados. Es mejor: le da confianza
al revisor en vez de darle tarea. Y condicionarla a que sea sustanciosa evita el relleno
de "probado en local" que no aporta información.

---

## 2026-08-07 — El título del PR no lleva número de ticket

**Decisión.** El título es `tipo(área): frase` y termina ahí. Sin `- #NNNN` ni `(#NNNN)`.

**Por qué.** Preferencia explícita. Se dejó además como prohibición escrita en el prompt
porque el modelo tiende a arrastrar el número si lo ve en el contexto del ticket, aunque
no se lo pidan.

---

## 2026-08-07 — El PR trivial lleva bullets, pero no encabezados

**Decisión.** Un cambio trivial (hasta tres dimensiones tocadas) se describe con un
párrafo de apertura suelto, 2 o 3 bullets colgando directo, y el cierre en una sola línea
con la etiqueta en negrita. Sin `## Problema`, sin `## Cambios`, sin secciones. Rango:
60-100 palabras.

**Por qué.** Lo que distingue al trivial no es que no tenga bullets — los bullets siguen
comunicando bien — sino que los encabezados de sección sobre tres líneas de contenido se
ven desproporcionados.

---

## 2026-08-07 — Los prompts de fase viven fuera del código

**Decisión.** El texto de cada fase está en `prompts/*.md`, no en strings de
`src/index.ts`. `global-rules.md` se antepone automáticamente a cada fase.

**Por qué.** Afinar el comportamiento de una fase obligaba a editar TypeScript,
recompilar y reiniciar el MCP en el cliente. Ese ciclo es lo bastante lento como para
desincentivar iterar — y el trabajo de afinar prompts es, por naturaleza, iterativo.

Como efecto secundario, deja de ser necesario forkear el repo para usar otros prompts.

---

## 2026-08-07 — Los prompts se leen en cada llamada, sin caché

**Decisión.** `loadPhasePrompt()` lee el archivo del disco cada vez que se invoca
`get_phase_prompt`. No se cachea en memoria al arrancar.

**Por qué.** Es lo que permite editar un prompt y probarlo de inmediato, sin reiniciar el
servidor MCP. El costo es leer un archivo de unos pocos KB por invocación, que frente a
una llamada a un modelo de lenguaje es irrelevante.

**Descartado.** Cachear al arrancar con una tool para recargar a mano: más código y más
cosas que recordar, para ahorrar algo que no cuesta.

---

## 2026-08-07 — Las fases se descubren por nombre de archivo

**Decisión.** Las fases disponibles salen de los archivos que cumplan
`fase-<N>-*.md` o `phase-<N>-*.md` en la carpeta de prompts. No hay una lista de fases
en el código. El título de cada fase se lee del primer encabezado `#` del archivo.

**Por qué.** El número de fases dejó de ser una constante del programa: agregar un
`fase-6-*.md` basta para que exista la fase 6. Esto era necesario para poder agregar una
fase 0 de triage (#2) sin tocar TypeScript.

Se aceptan los dos prefijos, español e inglés, para que un juego de prompts traducido
funcione sin cambiar el código.
