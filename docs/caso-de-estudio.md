# Caso de estudio: mcp-phase-gate

*En inglés: [case-study.md](case-study.md).*

## 1. El problema

En el backend de una tienda en línea inventada, un ticket dice que a quien usa un cupón a veces le cobran dos veces el envío. Se lo paso a un agente de IA. Al minuto cambió el checkout, añadió una prueba que pasa y dio el trabajo por hecho. No leyó el otro servicio que calcula el envío, no preguntó si el cupón se combina con el envío gratis (una decisión de negocio) ni anotó qué comprobó. Semanas después alguien pregunta por qué cambió el envío. El razonamiento vivía en un chat que ya no existe.

No es un mal modelo: un chat es mal sitio para guardar decisiones, y un agente solo optimiza para escribir código.

mcp-phase-gate es un servidor MCP que pone entre el ticket y el pull request cinco fases con compuerta (descubrimiento, decisiones, plan técnico, ejecución y auditoría). Cada una deja un documento en una carpeta central; la Fase 2 espera a que una persona responda, y la Fase 4 avanza por lotes que registra el servidor.

## 2. Tres ideas de diseño

**El disco es la verdad.** La fase de una tarea no se guarda: se deduce de qué documentos hay en su carpeta, porque cada prompt de fase declara el nombre del suyo. Borra un `02 - Decisiones.md` que quedó mal y la tarea vuelve a la Fase 2, sin nada que resincronizar.

**El servidor hace cumplir lo que el prompt promete.** Un modelo puede ignorar "no te saltes fases", así que el código lo comprueba: pedir la Fase 4 sin el documento de la 3 pone el aviso de la compuerta al principio del prompt; `write_central_doc` no reescribe el documento de una fase congelada sin que el usuario lo confirme.

**Nada se escribe sin verificar.** En la Fase 4 el modelo le pasa campos a `record_batch`. El servidor valida el formato del hash antes de que lo vea git, comprueba que el commit está en la rama actual, compara los archivos que toca con los declarados, y escribe y sella el recibo. Sin git, sella el sha256 del artefacto.

## 3. Tres decisiones y lo que descarté

Cada entrada de [`decisiones.md`](decisiones.md) dice qué alternativa rechazó.

**Deducir la fase en vez de guardarla.** "2026-08-08 — La fase de cada tarea se deduce de sus documentos, no se guarda". El issue original pedía un registro de tareas con su fase. Lo descarté al ver que `get_phase_prompt` necesitaría el proyecto y la tarea solo para anotar el avance: el dato sería cierto solo mientras el modelo no se distrajera, y una tarea podía decir "fase 2" llevando la 4. Un límite aceptado, que renombrar un documento hace ver menos avanzadas las tareas viejas, volvió con el inglés. Por eso el idioma de un proyecto se resuelve primero por sus documentos: si no, un proyecto en español abierto en un equipo en inglés aparecería vacío.

**Recibos sellados que escribe el servidor en vez de confiar en el modelo.** Al principio el modelo redactaba cada recibo y lo guardaba con `write_central_doc`. Había un riesgo abierto: el modelo podía escribir antes de tiempo el índice de la Fase 4 y dar la fase por cerrada, con solo una línea del prompt en contra. "2026-10-16 — `record_batch` registra cada lote en dos tiempos: antes y después del commit" pasó la escritura al servidor, y "2026-10-16 — Los recibos con ancla quedan sellados y la Fase 4 solo la escribe el servidor" hizo inmutable un recibo anclado, salvo un reanclaje que confirma el usuario. La auditoría encontró otro hueco: por la escotilla de confirmación, con un `force` del modelo, cabía un recibo "del servidor" con un commit inventado. Ahora lo que entra por ahí queda con `origen: manual`. Descartado: bloquear sin escotilla, que atascaría una tarea con un recibo dañado.

**Preset por proyecto, no por repositorio.** La regla es "los presets son del proyecto, no de cada repo; además, una tarea puede declarar su propio `preset`", y está registrada en "2026-10-15 — Las fases, los prompts y la deducción se resuelven por proyecto…". Por repo parecía lo natural, pero los documentos de una tarea viven en un proyecto y una tarea multi-repo toca varios repos: con presets por repo recibiría varios juegos de instrucciones. La necesidad real, mantener un agente dentro de un proyecto general, la cubre el preset de la tarea.

## 4. Seguridad: el fallo de rutas

La versión 3 empezó con un diagnóstico del código de la 2.0: nueve hallazgos, escritos en [`plan-maestro-v3.md`](plan-maestro-v3.md). Los cuatro de severidad alta eran un mismo fallo: la contención se comprobaba como texto y solo contra la raíz. `task_name: "../../fuera"` creaba carpetas fuera de la Documentación, y también `project: "../fuera"` con `crear_proyecto`; `file_name: "../otra-tarea/x.md"` salía de la tarea sin salir de la raíz, y pasaba; un symlink dentro de la Documentación permitió leer el `.env` de un repo y escribir fuera de la base. Otro hallazgo dejaba a `read_cross_repo` llegar a otro repo con `../repoB/.env`.

**Cómo se demostró.** Los seis hallazgos confirmados se reprodujeron contra el binario compilado antes de arreglar nada, y pasaron a `test/e2e.test.ts`: cada caso lanza el servidor compilado por stdio, hace la llamada hostil y comprueba que la tool falla, que dice por qué y que el árbol temporal entero queda idéntico.

**Cómo se cerró.** Cada nombre de proyecto, tarea o repo tiene que ser un solo segmento de ruta portable (`validarSegmento`), y la contención se comprueba contra la ruta real, resolviendo symlinks y junctions (`rutaReal`, `estaDentroReal`). `file_name` queda dentro de su tarea, `read_cross_repo` dentro de su repo, y las lecturas paran en 1 MB y rechazan binarios.

**Los tests de hoy.** `test/e2e.test.ts` tiene siete ataques de rutas (los seis casos confirmados más `file_path: "PROYECTO-A/CON"`, de la auditoría externa) y cinco de lectura (el escape a otro repo, más un archivo demasiado grande y uno con un byte NUL contra cada tool de lectura). `test/paths.test.ts` tiene 29 nombres que `validarSegmento` debe rechazar y 25 rutas hostiles que rechazan `resolveDocPath`, `resolveTaskFolder` y `resolveRepoPath`. La auditoría externa reportó 0 escapes en 273 casos de ataque, registrados en [`plan-maestro-v3.md`](plan-maestro-v3.md). Queda un riesgo abierto, y escrito: un enlace cambiado entre la comprobación y la apertura la redirigiría.

## 5. La versión 4: qué se rediseñó, y por qué

La versión 4 cambia lo que la gente ve y toca, no el motor. Las 13 tools, los prompts, los presets, las capas, los formatos en disco y el modelo de seguridad del Studio son los de la 3.2: la diferencia de `prompts/` y `presets/` entre `master` y la rama de integración sale vacía. Lo que fallaba en la 3.2 estaba alrededor del motor.

- **Cada vista se dibujaba dos veces.** El Studio tenía dos modos, Cabina (una vía con semáforos y sellos SVG) y Sobrio (tablas), y un botón pasaba de uno a otro. Eran dos interfaces que mantener y probar, y Sobrio tenía menos funciones que Cabina, así que quedarse solo con él habría perdido datos. Ahora cada vista tiene una sola estructura, y el tema, claro u oscuro, solo cambia los colores. Una prueba compara el árbol del DOM y el de accesibilidad en los dos temas, en cada vista, a 1280 y a 390 px, así que «el tema solo cambia colores» está probado, no prometido.
- **El aspecto se comprueba, no solo se elige.** Inter y JetBrains Mono, un acento azul, un fondo gris. Los colores se nombran por su función (`fondo`, `acento`), no por metáfora, y un test lee las hojas de estilo: el texto llega a 4.5:1 sobre sus fondos, y el acento y los bordes de los controles llegan a 3:1. Ningún estado se dice solo con color: cada uno tiene su forma y siempre su texto.
- **La configuración estaba repartida.** El preset vivía en la Red, las reglas en el Taller, los clientes y las variables en el Vigía, y algunos ajustes no tenían interfaz. Ajustes, una sexta vista, es ahora el único lugar donde se edita la configuración: una página por archivo, varios campos cambiados juntos, un solo diff por archivo y un solo Aplicar. Si un archivo cambia en el disco con un borrador abierto, el campo en conflicto se marca y la persona elige, en vez de que una versión pise a la otra en silencio. Las rutas de cada equipo salieron del bloque `env` del cliente y pasaron a `machine.json` (versión 2), y el entorno siempre gana, también en el idioma.
- **La cara pública era una demo y un README de mil líneas.** La raíz del sitio es ahora una portada en dos idiomas: la frase, los dos botones, las cinco fases, tres capturas y el comando. La demo se mudó a `demo/`, y los enlaces viejos con hash llegan a la misma vista. Los medios (GIF, video, póster, capturas y la imagen de la vista previa del link) se generan de la demo real en el workflow de Pages y no se guardan en git. Los README bajaron de 1,002 y 1,046 líneas a 105 cada uno, y el detalle vive en cinco guías gemelas.
- **Resultados que dependían del equipo.** git escribe la fecha del commit (`%cI`) distinto según su versión, y eso cambiaba los bytes del sitio exportado. Ahora se lee en segundos Unix (`%ct`) y se escribe en UTC. El CI ganó macOS, y un job con git 2.43 que lo comprueba.

Lo que descarté, con el mismo cuidado de las versiones anteriores. Cabina como tercer tema: seguiría pidiendo su propia estructura, o sería solo otra paleta. Todo en tablas: la Red y las fases pierden lo que cabe mal en una fila, y en un teléfono las tarjetas y las filas que se despliegan se apilan mejor. Aplicar los ajustes campo por campo: tres cambios de un proyecto eran tres diffs del mismo archivo, tres huellas y tres escrituras, y entre una y otra el archivo ya no era el que se vio en la vista previa. Variables avanzadas editables: cambiarlas desde un proceso que ya corre con ellas no las cambia para ese proceso.

## 6. Cómo se auditó la versión 4

Nada avanzó sin que otro agente lo auditara contra el repositorio, no contra mi relato. El auditor lee el repo y recibe un prompt con lo que el paso prometía, nunca mis conclusiones. Devuelve un veredicto y una tabla de hallazgos con severidad (bloqueante, importante, menor), cada uno con su archivo y línea, su evidencia y el cambio que propone. Un paso pasa con cero bloqueantes abiertos y cada importante corregido, o aceptado con su razón escrita. Comprobé cada hallazgo contra el repo antes de aplicarlo, porque un auditor también se equivoca.

Pasó en dos momentos:

- **El diseño, en siete rondas antes de la primera línea de código.** Solo la primera ronda devolvió cero bloqueantes, siete importantes y siete menores. Entre ellos: la rama de integración no tenía protección, y un job de CI que decía probar un git viejo no usaba ninguno, así que «git 2.43» no se podía comprobar.
- **Cada pull request, antes de mergearlo.** Hasta hoy se han auditado trece. En la primera auditoría, uno quedó aprobado, nueve aprobados con cambios y tres no aprobados. Lo que tenían en común los tres es que mis propias pruebas no lo veían:
  - El arreglo de la fecha estaba bien y probado, pero el job de extremo a extremo de macOS estaba en rojo en el último commit, y había fallado en 4 de las 5 corridas del pull request, que proponía dejar ese check como opcional. El check se quedó obligatorio.
  - Una prueba nueva pasaba sola y fallaba en toda la suite (1 falló, 115 pasaron), porque dependía de lo que otro archivo de pruebas dejaba en el servidor compartido.
  - En el pull request de Ajustes, el job obligatorio de Linux falló en tres commits seguidos porque la prueba de un conflicto con el disco nunca veía el evento en Linux. La misma auditoría encontró que el campo «Comandos de verificación» recortaba los espacios y el Enter en cada tecla, y ninguna prueba lo notaba porque las pruebas pegan el texto de golpe en vez de teclearlo.

Un cambio que solo toca comentarios se prueba, no se afirma: un script toma dos commits y compara el compilado, el build del Studio y los YAML y JSON ya interpretados, y tiene que decir que son idénticos. Las auditorías repitieron esa prueba.

Para el lanzamiento, la regla es que no existe el tag `v4.0.0` mientras haya un hallazgo bloqueante o importante abierto, y que cualquier error visible en una superficie de primer contacto (la portada, el README, el About del repositorio, la página de npm) cuenta como importante, aunque sea una falta.

## 7. Lo que se midió

Toda cifra de la 4.0 sale del CI o de una corrida de un workflow, no de un equipo mío. La columna de la 3.2 se midió a mano en un Windows con Node 24.11.0, antes de empezar la 4.0. Las cifras de pruebas y del frontend son de la corrida de CI 41108788241 sobre el commit `39a7156`, la punta de la rama de integración. Las de la portada y los medios son de la corrida manual del workflow de Pages 41110638939 (solo construye, no despliega) sobre el commit `dfc96c6`, que es esa punta más los cambios de este pull request: la cadena de medios es la misma, y la corrida añade la imagen de la vista previa del link y sus etiquetas.

| Cifra | 3.2 | 4.0 | De dónde sale la cifra de la 4.0 |
|---|---|---|---|
| Suite de pruebas | 1,004 tests: 1,002 pasan, 2 omitidos | 1,143 tests: 1,141 pasan y 2 omitidos en Windows; 1,139 pasan y 4 omitidos en Linux; 0 fallan | `npm test`, jobs `build-and-test` de la corrida de CI |
| Studio de extremo a extremo | 51 pasan | 268 pasan, en cada uno de Linux, Windows y macOS | `npm run test:e2e`, jobs `e2e-studio` de la corrida de CI |
| Frontend del Studio | 125,76 kB en gzip de un presupuesto de 200 kB | 161,24 kB en gzip del mismo presupuesto | `npm run build`, su log en la corrida de CI |
| Paquete | 183 archivos, 536,0 kB comprimido, 1,8 MB descomprimido | 137 archivos, 510,0 kB comprimido, 1,5 MB descomprimido: los 51 `.d.ts` (263 kB) quedan fuera porque es un CLI sin `types` | `npm pack --dry-run` en la rama de este pull request; el CI no lo mide |
| Registro de decisiones | 101 entradas | 107 entradas | `node scripts/indice-decisiones.mjs`, que arma el índice con ellas |
| Mensajes del servidor | 724 códigos en español y en inglés, 7 catálogos | 756 códigos, 8 catálogos | claves de cada objeto `TEXTOS_*` de `build/i18n/textos/*.js` |
| README | 1,002 y 1,046 líneas | 105 líneas cada uno | `wc -l`; `test/readme.test.ts` falla por encima de 200 |
| Portada, primera carga con sus tres capturas | no había | 245,555 bytes en inglés y 251,105 en español, de un presupuesto de 300,000 | job `ensamblar` de la corrida de Pages, que falla si pasa del presupuesto |
| Imagen de la vista previa del link, 1200 × 630 | no había | 107,111 bytes (inglés) y 113,449 (español), PNG | job `capturas` de la corrida de Pages; GitHub admite hasta 1 MB |
| Video | 41,3 s y 42,4 s; MP4 de 1,52 MB cada uno | 41,6 s (inglés) y 41,7 s (español); MP4 de 1,102,541 y 1,224,881 bytes | `medios.json` de la corrida de Pages |
| GIF del README | 42 s, 4,93 MB y 4,72 MB, a 8 fps y 760 px | 21,8 s (inglés) y 21,9 s (español), 2,345,102 y 2,554,825 bytes, a 10 fps y 840 px; presupuesto de 2,621,440 (2,5 MiB) | `medios.json` de la corrida de Pages |

La demo, contada generándola en los dos idiomas, listando sus recibos y con `git rev-list --count HEAD` en cada repo: tres proyectos, dos repos de git con seis commits reales y ocho recibos. Seis están sellados (cuatro a un commit, dos a un sha256), uno se descartó con una nota y otro espera su commit.

## 8. Qué haría distinto

- **Separar los textos de contrato de la prosa desde el primer día.** Al planear el inglés vi que el código dependía de once familias de textos en español, como los encabezados que busca o las claves de los recibos. Traducir un prompt sin un módulo de vocabulario habría roto en silencio el aviso de pendientes.
- **Darle un código a cada mensaje desde el principio.** El catálogo bilingüe llegó en la última etapa y hoy tiene 756 códigos; para no tocar más de cien firmas de funciones, el idioma viaja en un contexto por llamada.
- **Que el servidor escribiera la Fase 4 desde la primera versión.** Durante tres etapas los recibos fueron trabajo del modelo, protegidos solo por líneas del prompt.
- **Cortar la demo a la medida del GIF.** En la 3.2, a 12 fps y 960 px, el GIF de 42 segundos pasaba de 7 MB, y solo cabía en 5 MB a 8 fps y 760 px. En la 4.0 el GIF es un corte de 22 segundos del video, por debajo de 2,5 MiB. La versión nítida es el MP4.
- **Medir desde la cadena desde el principio.** La mitad de la tabla de la 3.2 se midió a mano en mi equipo. En la 4.0 cada cifra dice de qué job del CI o de qué workflow sale, para que cualquiera la pueda volver a sacar y yo no tenga que acordarme de ella.
