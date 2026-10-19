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

**Recibos sellados que escribe el servidor en vez de confiar en el modelo.** Al principio el modelo redactaba cada recibo y lo guardaba con `write_central_doc`. El plan arrastraba un riesgo abierto (E1-R3): el modelo podía escribir antes de tiempo el índice de la Fase 4 y dar la fase por cerrada, con solo una línea del prompt en contra. "2026-10-16 — `record_batch` registra cada lote en dos tiempos: antes y después del commit" pasó la escritura al servidor, y "2026-10-16 — Los recibos con ancla quedan sellados y la Fase 4 solo la escribe el servidor" hizo inmutable un recibo anclado, salvo un reanclaje que confirma el usuario. La auditoría encontró otro hueco: por la escotilla de confirmación, con un `force` del modelo, cabía un recibo "del servidor" con un commit inventado. Ahora lo que entra por ahí queda con `origen: manual`. Descartado: bloquear sin escotilla, que atascaría una tarea con un recibo dañado.

**Preset por proyecto, no por repositorio.** La decisión F1 de la Etapa 3 del plan: "los presets son del proyecto, no de cada repo; además, una tarea puede declarar su propio `preset`", que aplica "2026-10-15 — Las fases, los prompts y la deducción se resuelven por proyecto…". Por repo parecía lo natural, pero los documentos de una tarea viven en un proyecto y una tarea multi-repo toca varios repos: con presets por repo recibiría varios juegos de instrucciones. La necesidad real, mantener un agente dentro de un proyecto general, la cubre el preset de la tarea.

## 4. Seguridad: el fallo de rutas

La versión 3 empezó con un diagnóstico del código de la 2.0: nueve hallazgos, de S1 a S9 (§2.1 de [`plan-maestro-v3.md`](plan-maestro-v3.md)). Los cuatro de severidad alta eran un mismo fallo: la contención se comprobaba como texto y solo contra la raíz. `task_name: "../../fuera"` creaba carpetas fuera de la Documentación (S1), y también `project: "../fuera"` con `crear_proyecto` (S2); `file_name: "../otra-tarea/x.md"` salía de la tarea sin salir de la raíz, y pasaba (S3); un symlink dentro de la Documentación permitió leer el `.env` de un repo y escribir fuera de la base (S4). S5 dejaba a `read_cross_repo` llegar a otro repo con `../repoB/.env`.

**Cómo se demostró.** Los seis hallazgos confirmados se reprodujeron contra el binario compilado antes de arreglar nada, y pasaron a `test/e2e.test.ts`: cada caso lanza el servidor compilado por stdio, hace la llamada hostil y comprueba que la tool falla, que dice por qué y que el árbol temporal entero queda idéntico.

**Cómo se cerró.** Cada nombre de proyecto, tarea o repo tiene que ser un solo segmento de ruta portable (`validarSegmento`), y la contención se comprueba contra la ruta real, resolviendo symlinks y junctions (`rutaReal`, `estaDentroReal`). `file_name` queda dentro de su tarea, `read_cross_repo` dentro de su repo, y las lecturas paran en 1 MB y rechazan binarios.

**Los tests de hoy.** `test/e2e.test.ts` tiene siete ataques de rutas para S1 a S4 (los seis numerados más `file_path: "PROYECTO-A/CON"`, de la auditoría externa) y cinco de lectura para S5 y S9 (el escape a otro repo, más un archivo demasiado grande y uno con un byte NUL contra cada tool de lectura). `test/paths.test.ts` tiene 29 nombres que `validarSegmento` debe rechazar y 25 rutas hostiles que rechazan `resolveDocPath`, `resolveTaskFolder` y `resolveRepoPath`. La auditoría externa reportó 0 escapes en 273 casos de ataque (§9.6 del plan). Queda un riesgo abierto, y escrito: un enlace cambiado entre la comprobación y la apertura la redirigiría.

## 5. Lo que se midió

En mi equipo con Windows y Node 24.13.1.

| Cifra | Valor | Cómo |
|---|---|---|
| Suite de pruebas | 992 tests: 990 pasan, 2 omitidos | `npm test` |
| Studio de extremo a extremo | 51 pasan | `npm run test:e2e` |
| Registro de decisiones | 99 entradas | líneas que empiezan por `## 20` en `docs/decisiones.md` |
| Mensajes del servidor | 700 códigos en español y en inglés, 7 catálogos | claves de cada objeto `TEXTOS_*` de `build/i18n/textos/*.js` |
| Paquete | 532,2 kB comprimido, 1,7 MB descomprimido, 185 archivos | `npm pack --dry-run`, con esta documentación |
| Frontend del Studio | 125,56 kB en gzip de un presupuesto de 200 kB | `npm run build` |
| Demo completa | 6,4 s en español, 5,8 s en inglés | `generarDemo`, medido con `Date.now()` |
| Medios de la demo | videos de 41,3 s y 42,4 s; MP4 de 1,52 MB cada uno; GIF de 4,93 MB y 4,72 MB a 8 fps y 760 px | `scripts/medios.mjs` y su `medios.json` (español, luego inglés) |

La demo, contada generándola en los dos idiomas, listando sus recibos y con `git rev-list --count HEAD` en cada repo: tres proyectos, cuatro tareas, dos repos de git con seis commits reales y ocho recibos. Seis están sellados (cuatro a un commit, dos a un sha256), uno se descartó con una nota y otro espera su commit.

## 6. Qué haría distinto

- **Separar los textos de contrato de la prosa desde el primer día.** Al planear el inglés vi que el código dependía de once familias de textos en español, como los encabezados que busca o las claves de los recibos. Traducir un prompt sin un módulo de vocabulario habría roto en silencio el aviso de pendientes.
- **Darle un código a cada mensaje desde el principio.** El catálogo bilingüe llegó en la última etapa, con 700 códigos, y para no tocar más de cien firmas de funciones el idioma viaja en un contexto por llamada.
- **Que el servidor escribiera la Fase 4 desde la primera versión.** Durante tres etapas los recibos fueron trabajo del modelo, protegidos solo por líneas del prompt.
- **Cortar la demo a la medida del GIF.** A 12 fps y 960 px, el GIF de 42 segundos pasaba de 7 MB; solo cabe en 5 MB a 8 fps y 760 px. La versión nítida es el MP4.
- **Cerrar lo pendiente.** La matriz de clientes del README sigue "por verificar", y mi revisión archivo por archivo de los prompts en inglés sigue pendiente.
