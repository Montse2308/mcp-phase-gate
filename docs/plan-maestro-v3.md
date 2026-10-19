# PLAN_MAESTRO_V3 — mcp-phase-gate

| Campo | Valor |
|---|---|
| Iteración | **23** — **Plan completado al 100 %** (iteración 7), **validado en Windows** (iteración 9, §9.4.1), ajustado con los desvíos de la ejecución de la Etapa 0 (iteraciones 10 a 12, §9.6), versionado en el repo con revisión de privacidad (iteración 13), puesto al día con la ejecución de la Etapa 1 (iteración 14, §9.7) y con su auditoría externa (iteración 15, §9.7), con la ejecución de la Etapa 2 y su auditoría externa (iteraciones 16 y 17, §9.8), con la ejecución de la Etapa 3 y su auditoría externa (iteraciones 18 y 19, §9.9), con la ejecución de la Etapa 4 y su auditoría externa (iteraciones 20 y 21, §9.10), y con la ejecución de la Etapa 6 y su auditoría externa (iteraciones 22 y 23, §9.11) |
| Base del análisis | commit `d7594ea`, árbol limpio |
| Versión publicada | `3.0.0` (comprobado con `npm view` el 2026-10-19: `latest` = `3.0.0`) |
| Modo | Planificación (nivel Fase 3) **terminada** y validada. **Etapas 0, 1 y 2 ejecutadas** (§9.6 a §9.8), en `master` y publicadas (`2.0.1`, `2.1.0` y `2.2.0`); de la Etapa 2 queda la matriz de clientes de L10. **Etapa 3 ejecutada** (L01 a L13, §9.9) en la rama `etapa-3/configuracion`; auditada y con sus ajustes (A1 a A8); faltan el PR, el tag `v3.0.0-beta.0` y la publicación, que hace la autora. **Etapa 4 ejecutada** (L01 a L11, §9.10) en la rama `etapa-4/motor-de-lotes`, creada desde la punta local de `etapa-3/configuracion` (`16d25fc`) y sin subir; auditada y con sus ajustes (A1 a A8); faltan su PR (después del de la Etapa 3), el tag `v3.0.0` y la publicación, que hace la autora. **Etapa 5**: L01 a L10 en `master` (PR #54); L11 a L13 solo en la rama local `etapa-5/studio`, y su registro de ejecución no está en este plan. **Etapa 6 ejecutada** (L01 a L11, §9.11) en la rama `etapa-6/el-mundo`, creada desde esa punta local (`6c27e00`) y ya subida al remoto; auditada y con sus ajustes (A1 a A8); faltan la revisión de la autora de los textos en inglés (incluidos los ejemplos de calidad), la CI y el workflow de Pages, el PR, el tag `v3.2.0` y la publicación |
| Ejecución | La hace el agente local de la autora, lote por lote, con la política `agente-commitea-con-OK` |
| Fuente | Desde E0 L09, esta copia en `docs/plan-maestro-v3.md` es la fuente del plan (§9.2) |

**Cómo leer las anclas.** Toda línea citada es del commit `d7594ea`. Los prompts no cambian en la Etapa 0, así que sus líneas siguen valiendo al empezar la Etapa 1. El código de `src/` sí cambia en la Etapa 0, por eso en la Etapa 1 el código se ancla por **nombre de función** y la línea va solo como referencia. Dentro de un mismo lote, las ediciones a un archivo se aplican **de abajo hacia arriba**, para que las líneas citadas sigan valiendo mientras se edita.

### Estado de las etapas

| Etapa | Versión | Tema | Estado del diseño |
|---|---|---|---|
| 0 | `2.0.1` | Blindaje e higiene | **Cerrada** |
| 1 | `2.1.0` | Prompts, #39, #40, lotes y recibos, ranuras, protección R4 | **Cerrada** |
| 2 | `2.2.0` | Protocolo MCP moderno, MCP Prompts, Resources, Elicitation, `doctor` | **Cerrada** |
| 3 | `3.0.0-beta` | Configuración: manifiesto, presets, capas, Roots, multi-repo, `init`, `eject` | **Cerrada** |
| 4 | `3.0.0` | Motor de lotes en el servidor: `record_batch`, `get_batch_status`, anclas, índice automático | **Cerrada** |
| 5 | `3.1.0` | Studio visual, `--demo` y export estático a GitHub Pages | **Cerrada** |
| 6 | `3.2.0` | Inglés (prompts, presets, Studio, demo), medios y portafolio | **Cerrada** |

---

## 1. Contratos globales de arquitectura v3

### 1.1 Principios

1. **El disco es la verdad.** La fase de una tarea se deduce de qué documentos existen. El documento de una fase existe si y solo si la fase está cerrada. Nada en v3 rompe esa invariante.
2. **El servidor hace cumplir lo que el prompt promete.** Toda regla de `PROHIBIDO` que se pueda verificar mecánicamente la aplica el código.
3. **El servidor nunca escribe en Git.** Los commits los hace el agente con su terminal; el MCP solo lee Git para verificar.
4. **Compatibilidad hacia atrás.** Sin manifiesto, un proyecto se comporta como hoy hasta la v3, y en la v3 se migra con un comando explícito.
5. **Un solo lugar para cada dato.** Los nombres de documento y de la subcarpeta de recibos viven en el frontmatter del prompt de su fase.

### 1.2 Decisiones cerradas

| ID | Decisión | Aterriza en |
|---|---|---|
| SEG-M | `write_central_doc` solo escribe **dentro de carpetas de tarea**. `phase-gate.json` y `.phase-gate/` se editan solo por CLI o UI. `machine.json` vive fuera de `DOCS`. `read_central_doc` sigue pudiendo leer cualquier archivo dentro de `DOCS` | Etapa 1 |
| R1 | Un preset puede ser **un solo archivo** con bloques `<!-- bloque: fase-3/verificacion -->…<!-- /bloque -->`. Pisar una fase entera con `fase-N-*.md` sigue valiendo. Precedencia: el cuerpo de la fase sale de la capa más alta que tenga `fase-N-*.md`; cada ranura toma el bloque de la capa más alta que lo defina, aunque esté por debajo del cuerpo; una ranura sin bloque usa su contenido por defecto. Un bloque que no encaja en ninguna ranura se avisa (`doctor` y `get_phase_prompt`). Un bloque no puede cambiar nombres de documento. Presets en `presets/<idioma>/<preset>.md` | Ranuras: Etapa 1. Bloques: Etapa 3 |
| R2 | Recibos en `04 - Ejecución/L01 - <slug>.md` (dos dígitos). Con `lotes: 1` el recibo es directamente `04 - Ejecución.md`. Con más lotes, `04 - Ejecución.md` es un índice mínimo que se escribe al cerrar el último. La plantilla del recibo (frontmatter y encabezados exactos) se fija en la Etapa 1, y en la Etapa 4 el servidor ensambla el índice a partir de ella | Etapa 1 (prompts). Etapa 4 (servidor) |
| R3 | `record_batch` resuelve el `cwd` de Git por `repo_id` (`<REPOS_PATH>/<dir>` o el override de `machine.json`) y usa `execFile`. Con Git y política distinta de `"ninguno"`, el SHA es obligatorio: se valida con `/^[0-9a-f]{7,40}$/i` y se verifica con `git rev-parse --verify --quiet --end-of-options <sha>^{commit}` y `git merge-base --is-ancestor <sha> HEAD` (§6.3; `cat-file -e` se descartó porque acepta `HEAD`). Sin Git, el ancla es `artifact_path` más su sha256, o `verification_note`. Registro en dos tiempos para `agente-propone` | Etapa 4 |
| R4 | Sin `force: true`, `write_central_doc` rechaza escribir `00 - Contexto Inicial.md` y cualquier documento de fase **congelado**. Un documento queda congelado en cuanto una fase posterior está **presente**: existe su documento, o su subcarpeta de recibos tiene al menos un `.md`. Los recibos se tratan como de la fase 4 | Etapa 1 |
| R5 | En la Etapa 1, `.claude/commands/` y `docs/comandos-de-fase.md` se mantienen sincronizados (un test lo hace cumplir desde la Etapa 0). En la Etapa 2 llegan los MCP Prompts nativos; se verifican en Claude Code, Cursor y VS Code, e `init` ofrece inyectar comandos donde los prompts no se vean cómodos | Etapas 0, 1 y 2 |
| R6 | `npx mcp-phase-gate ui --export-static <dir>` exporta **solo la demo** por defecto. Exportar datos reales exige una bandera explícita y muestra una advertencia. La demo se genera ejecutando las tools reales contra un fixture que también usan los tests. GitHub Pages se publica con un workflow aparte (`pages: write`) solo en tags | Etapa 5 |
| P1 | Política de commits configurable por proyecto: `"agente-commitea-con-OK"` (por defecto con lotes), `"agente-propone"`, `"auto"`, `"ninguno"`. Siempre `git add` con la lista explícita de archivos del lote, nunca `-A` ni `.`. Si falla un hook o se pide passphrase, el agente se detiene; nunca `--no-verify`. **Nunca `push`**, en ningún modo, y **no es configurable** (decidido en la iteración 8: lo que sale del equipo hacia el remoto, y el PR, lo hace siempre la persona; la Fase 5 audita antes de ese momento y sigue siendo de solo lectura) | Prompt: Etapa 1. Manifiesto: Etapa 3 |
| P2 | Recibos según R2 | Etapa 1 |
| P3 | Orden: Etapa 0 y luego Etapa 1, con los refinamientos asentados antes | — |
| P4 | Manifiesto JSON con `$schema` en `<DOCS>/<PROYECTO>/phase-gate.json`. Overrides locales en `~/.config/mcp-phase-gate/machine.json`. Se autorizan ADRs nuevas que reemplacen las de configuración, interfaz visual, commits en Fase 4 y archivos en subcarpeta | Etapa 3 |
| P5 | Preset `ai-agent-ops`. Evidencia: el bloque exacto de prompt, configuración, tool o flujo, más el transcript o log real con fecha y modelo o entorno. Verificación: batería de casos de oro, borde y adversariales, ejecutada o en dry-run, con la tabla `Entrada \| Salida antes \| Salida después`, comprobando que no se rompen las restricciones globales del agente (formato, tono, tools permitidas). Cierre: auditoría de regresión de comportamiento y registro de versión del prompt o configuración, en lugar del PR o junto a él | Etapa 3 |
| P6 | Preset por defecto en v3: `software` genérico. El flujo actual pasa a `software-replica`. En la Etapa 1, las secciones de réplica quedan envueltas en ranuras con el contenido de hoy. En la v3, `doctor` marca los proyectos sin manifiesto e `init --migrate` les escribe `"preset": "software-replica"` | Etapas 1 y 3 |
| P7 | Prompts bilingües `es`/`en`. Variables `PHASE_GATE_*` con `ORQUESTADOR_*` como alias; si ambas existen con valores distintos gana `PHASE_GATE_*` y `doctor` lo avisa. El idioma se fija por proyecto en el manifiesto al crearlo; cambiarlo con tareas existentes no renombra documentos y `doctor` lo marca. Studio: cabina de señales ferroviaria con sellos estampados estilo *Papers, Please* (arte propio), con modo "Sobrio / Ingeniería" | Etapas 2, 3, 5 y 6 |
| P8 | Cuatro bases: `medido`, `leído en código`, `documentado`, `inferido`. La línea `Base` aplica a toda `D<n>`, nazca en la fase que nazca; en la tabla de decisiones de una línea de la Fase 2 es una columna. `write_central_doc` se protege según R4 | Etapa 1 |

### 1.3 Convenciones del plan

- Lotes con dos dígitos: `L01`, `L02`… en todas las etapas.
- Mensajes de commit en español con el formato que ya usa el repo: `tipo(área): frase en minúscula`.
- Cada lote es un cambio lógico que se revierte solo y deja `npm run build` y `npm test` en verde.
- Cada ADR nueva va arriba en `docs/decisiones.md`, dentro del mismo lote que toma la decisión, y nombra la entrada que reemplaza.
- Verificación base de todo lote con código: `npm ci && npm run build && npm test`.
- **Finales de línea:** el repo fija LF con `.gitattributes` (Etapa 0, L04). Además, **todo lector de texto normaliza `\r\n` a `\n` al leer** (prompts, bloques, presets, recibos, índices, el plan de la Fase 3, manifiestos y `.env`), porque los archivos propios de la usuaria (escritos, por ejemplo, con el Bloc de notas) llegan en CRLF. Todo lo que escribe el servidor va en LF.
- **Rutas en Windows:** nada construye rutas concatenando texto ni dentro de una cadena de shell; siempre `path.join` / `path.resolve`. Los tests crean sus carpetas bajo `fs.realpathSync.native(os.tmpdir())`.

---

## 2. Etapa 0 — `2.0.1` Blindaje e higiene

**Alcance:** 10 lotes. Los 3 primeros cierran los fallos de rutas y argumentos confirmados en el diagnóstico (S1–S6, S9); los demás son higiene, dependencias, tests, CI en Windows, documentación, el plan maestro versionado y la release. Ningún uso legítimo cambia de comportamiento.

### 2.1 Comprobado antes de escribir este plan

| Verificación | Resultado |
|---|---|
| ¿`zod` sería una dependencia nueva? | No. Es *peer dependency* del SDK (`^3.25 \|\| ^4.0`) y está instalada la 4.4.3. Declararla es lo correcto. |
| ¿Hay un SDK más nuevo? | Sí, la `1.32.1`. Se sube en L05 y se comprueba con `npm audit`. |
| ¿Los tests E2E obligan a separar `server.ts` de `index.ts`? | No. Lanzan `build-test/src/index.js` por stdio con el cliente del SDK. Esa superficie sobrevive a la migración de la Etapa 2, así que son su red de seguridad. |
| ¿Los symlinks de los tests funcionan en Windows? | No sin modo desarrollador. En Windows se crean con tipo `'junction'`. |
| ¿`npm run dev` tiene arreglo barato? | Sí: quitar `ts-node` y dejar `tsc --watch`. |
| ¿Los ataques del diagnóstico son reproducibles? | Sí: los 6 hallazgos confirmados (S1–S6) se reprodujeron contra el binario compilado. Pasan a ser casos de `test/e2e.test.ts`, repartidos entre L01, L02 y L03 según la tabla de abajo. |

**Hallazgos de seguridad del diagnóstico** (la referencia de los códigos `S<n>` que usa todo el plan):

| # | Hallazgo | Dónde | Severidad | Lo cierra |
|---|---|---|---|---|
| S1 | `start_task` se sale de `DOCS_PATH` con un `task_name` que contiene `..` | `src/index.ts:200-218` | Alta | E0 L01 |
| S2 | `crear_proyecto` con `project: "../evil"` crea la carpeta fuera de la raíz; `toUpperCase` no valida nada | `src/index.ts:196` | Alta | E0 L01 |
| S3 | `file_name` con `../..` lee o escribe en otro proyecto u otra tarea: `estaDentro` solo protege la raíz | `src/paths.ts:88-98` | Alta | E0 L01 |
| S4 | Escape por symlink: con un symlink dentro de la Documentación se leyó el `.env` de un repo y se escribió un archivo fuera de la base | `src/paths.ts:16-19` | Alta | E0 L01 |
| S5 | `read_cross_repo` lee de otro repo con `repo_name: repoA` y `file_path: ../repoB/.env` | `src/index.ts:390` | Media | E0 L02 |
| S6 | No se validan los argumentos: sin `task_name`, `String(undefined)` creó la tarea `undefined/` y la dejó activa | `src/index.ts` (todas las tools) | Media | E0 L03 |
| S7 | `crear_proyecto` lo decide el modelo, así que un modelo inyectado puede crear proyectos | diseño | Media | E2 L08 (elicitation) |
| S8 | `write_central_doc` puede pisar `00 - Contexto Inicial.md` y documentos de fases anteriores | `src/index.ts:369-384` | Media | E1 L03 (R4) |
| S9 | Lecturas sin límite de tamaño ni detección de binarios | `src/index.ts:363, 396` | Baja | E0 L02 |

### 2.2 Lotes

> **Estado de ejecución:** de L01 a L10 hechos. Commits y desvíos en §9.6.

| Lote | Objetivo | Archivos | Verificación | Commit propuesto |
|---|---|---|---|---|
| **L01** | Contención real en la Documentación (S1–S4) | `src/paths.ts`, `src/index.ts`, `test/paths.test.ts`, `test/e2e.test.ts` (nuevo), `test/helpers.ts`, `docs/decisiones.md` | Base verde. Los 6 casos de ataque de L01 (S1–S4, lista en el detalle de L01) devuelven `isError` y no crean nada en disco. Siguen funcionando: `04 - Ejecución/L01 - x.md` como `file_name`, un symlink interno de la Documentación, una raíz `DOCS` que es symlink, y nombres como `"Exponer endpoints"`, `"Tokens login"`, `"Migración de Pagos (ñ)"`. Los tests también pasan en un equipo donde `os.tmpdir()` devuelve un nombre corto 8.3 (`C:\Users\NOMBRE~1\…`), porque `carpetaTemporal` usa la ruta real | `fix(rutas): impedir que tareas, proyectos y archivos se salgan de su carpeta` |
| **L02** | `read_cross_repo` limitado a su repo (S5); lecturas con tope de 1 MB y rechazo de binarios (S9) | `src/paths.ts`, `src/index.ts`, `test/paths.test.ts`, `test/e2e.test.ts` | Se rechazan `../repoB/.env`, un archivo de más de 1 MB y uno con byte NUL; una lectura normal funciona en las dos tools de lectura | `fix(repos): limitar read_cross_repo al repositorio pedido y acotar las lecturas` |
| **L03** | Validar los argumentos de cada tool (S6) con zod | `package.json`, `package-lock.json`, `src/schemas.ts` (nuevo), `src/index.ts`, `test/e2e.test.ts`, `docs/decisiones.md` | `start_task` sin `task_name` devuelve un error que nombra el campo y no existe ninguna carpeta `undefined/`. `phase: "abc"` se rechaza. Los tests comprueban **subcadenas** del mensaje (el nombre del campo), no el texto completo: en la Etapa 2 el SDK antepone su propio prefijo | `fix(tools): validar los argumentos de cada tool antes de usarlos` |
| **L04** | Ignorar archivos locales y fijar finales de línea LF | `.gitignore`, `.gitattributes` (nuevo) | `git check-ignore -v .claude/settings.local.json auditoria-ejemplo.txt` responde por los dos. Tras refrescar la copia de trabajo (§2.3), `git ls-files --eol` muestra `i/lf` y `w/lf` en todos los archivos de texto; `loadPhasePrompt(1)` no contiene ningún `\r`. `git status` limpio | `chore(repo): ignorar archivos locales y fijar finales de línea LF` |
| **L05** | SDK a `^1.32.1`, fuera `ts-node`, `dev` pasa a `tsc --watch`, Dependabot y `npm audit fix` | `package.json`, `package-lock.json`, `.github/dependabot.yml` (nuevo), `README.md`, `README.es.md` | `npm audit --omit=dev` **en cero**, o la lista justificada de lo que no tiene arreglo (con la 1.32.1 había 5 avisos: `proxy-addr` crítico, `fast-uri` alto, `hono`, `ip-address` y `qs` moderados, todos con arreglo); base verde; `npm pack --dry-run` lista los mismos 22 archivos que antes del lote (los 20 originales más `build/schemas.js` y `build/schemas.d.ts`, que añade L03) | `chore(deps): subir el SDK de MCP, quitar ts-node y vigilar dependencias` |
| **L06** | Tests de `config.ts` | `test/config.test.ts` (nuevo) | Sube el conteo de tests; no cambia nada en `src/` | `test(config): cubrir las rutas obligatorias, la subcarpeta de tareas y el estado` |
| **L07** | CI también en Windows | `.github/workflows/ci.yml` | Solo verificable en GitHub Actions tras el push. Un fallo previo ajeno a los tests se documenta y no se arregla en este lote | `ci: correr build y tests también en Windows` |
| **L08** | Alinear los README y fijar la sincronía de los comandos | `README.md`, `README.es.md`, `docs/decisiones.md`, `test/docs.test.ts` (nuevo) | Test de sincronía verde; `grep` no encuentra "MCP Orquestador" ni "like phase 5" / "como la 5" | `docs(readme): alinear los dos README con la Fase 5 y con el nombre del paquete` |
| **L09** | Versionar este plan maestro y su ADR (decisión de §9.2) | `docs/plan-maestro-v3.md` (nuevo), `docs/decisiones.md` | Revisión de privacidad del texto: sin rutas reales de ningún equipo, sin nombres de proyectos o clientes del trabajo, sin datos de terceros. El estado de los lotes ya ejecutados de esta etapa queda marcado | `docs(plan): versionar el plan maestro v3` |
| **L10** | Versión `2.0.1` | `package.json`, `package-lock.json` | Base verde. El tag `v2.0.1` lo crea la autora y dispara la publicación por OIDC | `chore(release): 2.0.1` |

**Por qué este orden.** Primero lo de severidad alta. L01, L02 y L03 tocan funciones distintas y se revierten por separado; de L04 a L09 no tocan `src/`. El plan se versiona al final de la etapa (L09) para que entre al repo con el estado real de los lotes de la Etapa 0, no como una promesa.

### 2.3 Detalle por lote

#### L01 — Contención real en la Documentación

**Hoy.** `taskFolderPath` (`src/paths.ts:72`) une `task_name` sin validarlo; `start_task` (`src/index.ts:200-218`) hace `mkdirSync` y `writeFileSync` sin comprobar contención; con `crear_proyecto`, `proj.toUpperCase()` (`src/index.ts:196`) se usa como carpeta; `resolveDocPath` (`src/paths.ts:88-101`) une `file_name` sin acotarlo a la tarea; `estaDentro` (`src/paths.ts:16-19`) compara rutas en texto, sin resolver symlinks.

**Cambio.** En `src/paths.ts`:

```ts
// Un nombre de proyecto, tarea o repo es UN segmento de ruta, portable entre sistemas:
// la Documentación viaja entre equipos con Windows, macOS y Linux.
export function validarSegmento(valor: string, campo: string): string
```

Reglas exactas de `validarSegmento`:

| Rechaza | Ejemplo |
|---|---|
| Vacío o solo espacios | `""`, `"   "` |
| Exactamente `.` o `..` | `".."` |
| Separadores `/` o `\` | `"a/b"`, `"..\\x"` |
| Caracteres `< > : " \| ? *` | `"login: sso"` |
| Caracteres de control U+0000–U+001F y U+007F | `"a\u0000b"` |
| Punto o espacio al final | `"tarea."`, `"tarea "` |
| Nombre reservado de Windows, sin importar mayúsculas ni extensión: `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9` | `"con"`, `"NUL.txt"` |

**Permite** espacios intermedios, acentos, `ñ`, mayúsculas y minúsculas, guiones y paréntesis: `"Exponer endpoints"`, `"Tokens login"`, `"Migración de Pagos (ñ)"`. El error nombra el campo y la regla incumplida.

```ts
// Resuelve symlinks y junctions del ancestro existente más cercano y vuelve a unir el resto.
export function rutaReal(ruta: string): string
// estaDentro sobre rutas reales. La base también se resuelve: una DOCS que es symlink sigue valiendo.
export function estaDentroReal(base: string, ruta: string): boolean
```

- `rutaReal` sube hasta el primer ancestro que existe, le aplica `fs.realpathSync.native` y vuelve a unir los segmentos que faltan.
- `taskFolderPath` llama a `validarSegmento(taskName, "task_name")`.
- `resolveDocPath`, en modo `project + task_name + file_name`: rechaza `file_name` absoluto, valida cada segmento de `file_name` con `validarSegmento` (así se permite `04 - Ejecución/L01 - x.md`) y exige `estaDentroReal(carpetaTarea, rutaFinal)`.
- `resolveDocPath`, en modo `file_path`: exige `estaDentroReal(docsBase, rutaFinal)`. La restricción a carpetas de tarea llega en la Etapa 1.
- `start_task`: con `crear_proyecto`, `validarSegmento(proj, "project")` antes de `toUpperCase()`. Antes del `mkdirSync`, `estaDentroReal(docsBase, carpetaTarea)`.
- `read_central_doc` y `write_central_doc` usan `estaDentroReal` en lugar de `estaDentro`.

`test/e2e.test.ts` (nuevo) lanza `build-test/src/index.js` con `StdioClientTransport` del SDK contra carpetas temporales. En L01 cubre estos 6 casos de ataque y los casos legítimos de la tabla de lotes; S5 y S9 se añaden en L02 y S6 en L03:

| Caso | Llamada | Hallazgo |
|---|---|---|
| 1 | `start_task` con `task_name: "../../fuera"` | S1 |
| 2 | `start_task` con `project: "../fuera"` y `crear_proyecto: true` | S2 |
| 3 | `write_central_doc` con `file_name: "../otra-tarea/x.md"` (sale de la tarea sin salir de DOCS; hoy pasa) | S3 |
| 4 | `write_central_doc` con `file_name` absoluto | S3 |
| 5 | `write_central_doc` a través de una junction o symlink dentro de DOCS que apunta fuera | S4 |
| 6 | `read_central_doc` a través de esa misma junction | S4 |

(Lista propuesta por el agente ejecutor en el arranque de L01 y aprobada; sustituye a la cifra ambigua de la iteración 9.) `test/helpers.ts` gana `crearSymlink(destino, ruta)`, que usa `'junction'` en `win32`, y `carpetaTemporal` (`test/helpers.ts:13-14`) pasa a crear las carpetas bajo `fs.realpathSync.native(os.tmpdir())`. Es **preventivo**: hoy los tests que comparan contra `path.join(docs, …)` (`test/paths.test.ts:63, 70, 88, 96`) pasan con un nombre corto 8.3 (`NOMBRE~1`) porque `resolveDocPath` y `taskFolderPath` devuelven rutas sin resolver. Fallarían en cuanto algún test compare contra una ruta real (las de los casos de junction, o las que devuelva `rutaReal`), porque `os.tmpdir()` da el nombre corto 8.3 y `realpath` el largo (validación V2). Por eso no tiene un test en rojo previo.

**Patrón de referencia.** `estaDentro` (`src/paths.ts:16-19`) y el estilo de errores de `requireBasePath` (`src/config.ts:44-71`).

**Por qué es seguro.** Solo se rechazan nombres que hoy ya eran peligrosos o no portables. Un nombre con `/` creaba carpetas anidadas que `listarTareas` no ve como tarea; uno con `:` se rompe al sincronizar con Windows.

**ADR.** "La contención se comprueba contra la ruta real y los nombres son un solo segmento portable". Complementa la entrada del 2026-08-08 sobre `path.relative`: la comparación sigue siendo relativa, pero entre rutas reales.

#### L02 — Repos y límites de lectura

- `src/paths.ts`: `resolveRepoPath(repoName, filePath)` valida `repoName` con `validarSegmento`, calcula `repoReal = rutaReal(<REPOS>/<repoName>)` y exige `estaDentroReal(repoReal, rutaFinal)`.
- `src/index.ts`: `read_cross_repo` usa `resolveRepoPath`.
- Lectura acotada compartida, `leerTextoAcotado(ruta)`: `LIMITE_LECTURA_BYTES = 1_048_576` comprobado con `statSync` antes de leer; si los primeros 8000 bytes contienen `0x00`, error "parece binario". La usan `read_central_doc` y `read_cross_repo`.

#### L03 — Validación de argumentos con zod

- `package.json`: `"zod": "^4.4.3"` en `dependencies`.
- `src/schemas.ts` exporta **shapes** (`ZodRawShape`), no objetos, para que la Etapa 2 los pase tal cual a `registerTool`:

```ts
export const startTaskShape = {
  project: z.string().trim().min(1, "Falta `project`."),
  task_name: z.string().min(1, "Falta `task_name`."),
  initial_context: z.string().min(1, "Falta `initial_context`."),
  crear_proyecto: z.boolean().optional(),
};
// getPhasePromptShape, getActiveTaskShape, listTasksShape, switchTaskShape,
// readCentralDocShape, writeCentralDocShape, readCrossRepoShape
```

- `src/index.ts`: al principio del `CallToolRequestSchema`, `z.object(shapes[name]).parse(args ?? {})`. Un `ZodError` se convierte en un mensaje en español que nombra el campo. Desaparecen los `String(args?.x)`.
- **Tolerancia (decidida al ejecutar L03):** los campos opcionales usan `.nullish()` y `null` cuenta como ausente, porque algunos clientes con modelos en modo estricto envían `null` en todo campo opcional. Un número en texto (`phase: "3"`) **se rechaza** con un mensaje que lo explica ("`phase` debe ser un número, por ejemplo 3"): es raro, el modelo lo corrige al primer intento, y convertirlo complicaría el JSON Schema que la Etapa 2 genera desde estos shapes.
- **Lockfile:** npm 11 añade `"peer": true` a algunas entradas de `package-lock.json`. Es metadato, no cambia versiones, y se acepta.

**ADR.** "Los argumentos se validan con zod declarado como dependencia directa, y los schemas son la fuente de la Etapa 2".

#### L04 — `.gitignore` y `.gitattributes`

**Por qué (validación V1, severidad alta).** En un equipo Windows con `core.autocrlf=true` y sin `.gitattributes`, los 34 archivos están en LF en git pero en CRLF en la copia de trabajo, y `loadPhasePrompt(1)` devuelve 164 finales CRLF mezclados con 6 LF. Todo lo que el plan compara byte a byte (pruebas de oro, recibos e índices deterministas, el export) fallaría solo en Windows.

`.gitattributes` (nuevo):

```gitattributes
* text=auto eol=lf
*.png  binary
*.gif  binary
*.jpg  binary
*.webm binary
*.mp4  binary
*.woff2 binary
```

**Refrescar la copia de trabajo.** En git todo ya está en LF (`i/lf`); lo que hay que convertir es la copia de trabajo. **Orden** (corregido al ejecutar L04: el refresco necesita el árbol limpio, y antes del commit no lo está):

1. Editar `.gitattributes` y `.gitignore`.
2. `git add --renormalize .`: si cambiara algo (algún archivo en CRLF dentro del índice), entra en el mismo commit.
3. **Commit del lote** con el OK de la autora.
4. Comprobar el árbol: si `git status` marca archivos como modificados pero `git diff` sale vacío, son solo finales de línea y se sigue. Cualquier otro cambio: se para y se pregunta.
5. Refresco, que no crea commits y solo reescribe los archivos versionados:

```bash
git rm -r --cached -q .          # quita del índice sin tocar los archivos
git reset --hard -q              # vuelve a sacarlos aplicando eol=lf
git ls-files --eol               # todo texto: i/lf w/lf
```

6. Verificación de la tabla, recompilando antes. Si algo fallara, el arreglo va en un commit nuevo; no se enmienda el anterior.

`.gitignore`: añadir al final:

```gitignore
# Configuración local de Claude Code: rutas y permisos de este equipo
.claude/settings.local.json

# Volcados de auditoría y notas locales
auditoria*.txt
```

#### L05 — Dependencias

- `package.json`: `"@modelcontextprotocol/sdk": "^1.32.1"`; quitar `ts-node` de `devDependencies`; `"dev": "tsc --watch"`.
- `npm audit fix` (sin `--force`) para refrescar el lockfile; si algo exige `--force`, no se aplica y se anota en el commit.
- `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule: { interval: weekly }
  - package-ecosystem: github-actions
    directory: "/"
    schedule: { interval: weekly }
```

- **README (añadido al ejecutar L05):** `README.md` y `README.es.md` decían que `npm run dev` ejecuta con `ts-node`. Se corrige esa línea en los dos dentro de este mismo lote, para que el commit sea coherente y se revierta entero.
- **Resultado (ejecutado):** SDK 1.30.0 → 1.32.1; fuera `ts-node` y sus 16 dependencias; `npm audit fix` sin `--force` parcheó `proxy-addr`, `fast-uri`, `hono`, `ip-address`, `qs`, `hasown` y `side-channel`. `npm audit` en cero (antes 6: los 5 de arriba más uno alto del propio SDK 1.30.0).

#### L06 — `test/config.test.ts`

Cubre: `requireBasePath` con variable ausente, ruta inexistente y ruta que es archivo; `tasksSubdir` sin definir (`"Proyectos"`), vacía (`""`) y con espacios (`""`); `ORQUESTADOR_STATE_PATH` sobrescribe `stateDir`; `stateFile` termina en `active-tasks.json`; `promptsLayers` con y sin carpeta propia. `XDG_STATE_HOME` se prueba solo en Linux (`{ skip: process.platform !== "linux" }`).

#### L07 — CI en Windows

`.github/workflows/ci.yml`: `strategy.matrix` gana `os: [ubuntu-latest, windows-latest]` y `runs-on: ${{ matrix.os }}`; se mantienen Node 22 y 24.

#### L08 — README y sincronía de comandos

En **ambos** README:
- Título `# mcp-phase-gate`.
- El diagrama Mermaid termina en `05 · Auditoría`, que lleva a "PR description, also in the chat" / "descripción del PR, también en el chat".
- Quitar "A phase without `documento` — like phase 5…" (`README.md:385`) y su gemelo (`README.es.md:441`).
- Corregir "The server's interface is in English" (`README.md:7`): descripciones en español y el parámetro `crear_proyecto`.
- Sustituir "Paso 3 / Paso 4" y "Step 3 / Step 4" por enlaces a la sección real.
- En `README.es.md`, quitar la "Guía de Uso Diario" (`:315-358`) y dejar un enlace a `docs/comandos-de-fase.md`.

En `docs/decisiones.md`: el enlace de la cabecera a `MCP_orquestador/issues` pasa a `mcp-phase-gate/issues`.

`test/docs.test.ts` (nuevo): para cada `.claude/commands/fN.md`, su contenido es idéntico al bloque de código de la sección `` `fN.md` `` de `docs/comandos-de-fase.md`.

#### L09 — Plan maestro versionado

- `docs/plan-maestro-v3.md`: copia de este archivo, con la Sección 9 actualizada a lo ejecutado. A partir de aquí, cada etapa lo actualiza en su lote de documentación (estado de sus lotes y desvíos con su `D<n>`), sin reescribir el diseño de las etapas ya cerradas.
- **ADR nueva:** "El plan maestro v3 se versiona en `docs/`". **Reemplaza, para este plan,** 2026-08-07 "El plan del proyecto vive en Issues, no en un archivo". Por qué: el plan es un documento de diseño con decisiones, alternativas descartadas y verificaciones, no una lista de pendientes; como activo de ingeniería tiene valor por sí mismo. Lo que se mantiene de la ADR anterior: los pendientes sueltos y los fallos siguen yendo a Issues, y cada etapa puede tener su issue de seguimiento que enlaza a su sección.

#### L10 — Release

`npm version 2.0.1 --no-git-tag-version` actualiza `package.json` y `package-lock.json`. El tag `v2.0.1` lo pone la autora.

### 2.4 Lo que NO se toca en la Etapa 0

Prompts y comandos; nombres y parámetros de las tools; `src/tasks.ts`; el formato del estado; las mayúsculas de `crear_proyecto`; `dotenv`; la migración a `McpServer`; R4 y la restricción de `file_path` a carpetas de tarea (Etapa 1).

### 2.5 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| E0-R1 | `realpathSync.native` sobre placeholders de OneDrive *Files On-Demand* | **Cerrado** en la validación: `realpath` y `stat` no descargan el archivo (0,3 ms); solo la lectura lo hace (287 ms). Funciona a través de junctions |
| E0-R2 | Nombres con `:` o punto final dejan de aceptarse | Hoy ya se rompían al sincronizar con Windows; el error explica la regla |
| E0-R3 | CI en Windows destapa fallos previos | Se documentan; solo se arregla en L07 lo que sea de los tests |
| E0-R4 | Finales de línea CRLF en Windows rompen las comparaciones byte a byte | **Cerrado** con L04 y la normalización al leer (§1.3) |
| E0-R5 | `os.tmpdir()` con nombre corto 8.3 en Windows | **Cerrado** con `carpetaTemporal` sobre la ruta real (L01) |

---

## 3. Etapa 1 — `2.1.0` Prompts, #39, #40, lotes y recibos, ranuras y protección R4

**Base:** fin de la Etapa 0 (`2.0.1`). **Estado: cerrada** (iteración 2), con los ajustes A1–A5 de §3.12.

**Alcance:** 11 lotes. Tres de código (escritura solo en carpetas de tarea; soporte de ranuras y recibos; congelamiento R4), cinco de prompts (reglas globales y una por cada par o fase), uno de comandos, uno de README y la release. Cierra #39 y #40.

### 3.1 Comprobado antes de escribir este plan

| Verificación | Resultado y qué cambió en el plan |
|---|---|
| ¿Quién recibe `global-rules.md`? | Se antepone a **todas** las fases (`loadPhasePrompt`, `src/phases.ts:134-137`). Es el único lugar donde Base (#40) y Pendientes heredados (#39) se escriben una vez para las cinco fases. |
| ¿Qué pasa si alguien tiene su propio `global-rules.md`? | **Sustituye** al de fábrica, no se suma (`resolveGlobalRules`, `src/phases.ts:151-158`). Esa persona perdería las secciones nuevas. Se acepta, se documenta en el README y en la Etapa 2 `doctor` avisará (riesgo E1-R1). |
| ¿Un archivo en una subcarpeta altera la deducción? | No. `estadoDeTarea` (`src/tasks.ts:102-151`) solo comprueba los nombres exactos declarados, y lo fija el test de `test/tasks.test.ts:125`. La subcarpeta de recibos no mueve la fase. |
| ¿Dónde se le comunican al modelo los nombres de archivo? | Solo en `describePhaseFiles` (`src/phases.ts:164-191`), a partir del frontmatter. El nombre de la subcarpeta de recibos va por el mismo camino: frontmatter `recibos:` en la Fase 4. |
| ¿Hoy `write_central_doc` puede crear carpetas sueltas? | Sí: hace `mkdirSync(..., { recursive: true })` sobre cualquier ruta (`src/index.ts:378`). Con `file_path` se escribe en cualquier lugar de `DOCS`, incluido el futuro `phase-gate.json`. |
| ¿Con `TASKS_SUBDIR` vacío, `.phase-gate/` sería una tarea? | Sí: `listarTareas` (`src/tasks.ts:177-190`) lista todas las carpetas, y `discoverProjects` (`src/paths.ts:30-42`) toma `.obsidian/` o `.git/` como proyectos. Se añade el filtro de carpetas con punto. |
| ¿La política de pruebas de la Fase 3 está en un solo lugar? | No: en la sección de réplica (`fase-3:156-172`), en la tabla condicional (`:135`) y en `PROHIBIDO` (`:199-200`). Para que sea una ranura hay que juntarla en una sola sección. Lo mismo en la Fase 4 (`:103-106` y `:175`). |
| ¿Los comandos ya insinúan lotes? | Sí: `f4.md:7` pide parar "al terminar cada bloque de cambios". `f3.md:10` contradice el reparto de la ADR del 2026-08-07. |
| ¿La Fase 5 puede obtener los commits sin preguntar? | Hoy no: la regla 1 (`fase-5:11`) exige que la usuaria los indique. Con recibos, los commits ya están escritos. |
| ¿La Fase 5 tiene `PROHIBIDO` y `AUTOVERIFICACIÓN` para la auditoría? | No: los dos existen solo dentro del contrato del PR (`fase-5:117-133`). Se añaden para la auditoría. |
| ¿Llegarían los marcadores de ranura al modelo? | Sí: `loadPhasePrompt` solo hace `trim()` del cuerpo (`src/phases.ts:139`). Hay que quitarlos antes de entregar. |

### 3.2 Mapa de ranuras

**Sintaxis en los prompts base:**

```md
<!-- ranura: verificacion -->
contenido por defecto (el de hoy)
<!-- /ranura -->
```

**Reglas** (las hace cumplir `test/prompts.test.ts`, lote L02):
1. Toda ranura abierta se cierra; no se anidan.
2. El nombre es único dentro de su archivo y pertenece al catálogo de abajo.
3. El encabezado `##` de la sección queda **fuera** de la ranura: la estructura no es sustituible, el contenido sí.
4. Los marcadores se quitan antes de entregar el prompt; el contenido se conserva.
5. En la Etapa 3, el identificador de bloque es `<archivo>/<ranura>`: `global/evidencia`, `fase-3/pruebas`.

**Criterio de catálogo.** Solo es ranura lo que un preset necesita cambiar **en comportamiento**. Las rutas de ejemplo de una línea se generalizan en el texto, no se vuelven ranura.

| Archivo | Ranura | Sección | Líneas @d7594ea | Por defecto en 2.1.0 | Qué cambia por preset (Etapa 3) |
|---|---|---|---|---|---|
| `global-rules.md` | `cero-rupturas` | REGLA GLOBAL INQUEBRANTABLE | 2-4 (reescritas, §3.3) | Las tres reglas, con la segunda acotada por fase | `ai-agent-ops` añade "no romper formato, tono ni tools permitidas del agente" |
| `global-rules.md` | `evidencia` | EVIDENCIA (nueva) | nueva | `archivo:línea` o salida real con comando y fecha | `ai-agent-ops`: bloque de prompt o config + transcript con fecha y modelo. `research-ops`: fuente con URL y fecha |
| `fase-1` | `rol` | ROL DE COMPORTAMIENTO | 9 | El texto actual | Rol del dominio |
| `fase-1` | `verificacion` | VERIFICACIÓN: HAZLA EN ESTA FASE | 41-44 | El párrafo actual (réplica, consola, `git show`, medición) | Medios de verificación del dominio |
| `fase-1` | `ejemplos` | MARCAS DE CALIDAD | 129-154 | Los ejemplos actuales | Ejemplos del dominio |
| `fase-2` | `rol` | ROL | 8 | Actual | Rol |
| `fase-2` | `verificacion` | VALIDAR ANTES DE CERRAR | 52-54 | El párrafo actual | Medios del dominio |
| `fase-2` | `ejemplos` | MARCAS DE CALIDAD | 207-230 | Actuales | Del dominio |
| `fase-3` | `rol` | ROL | 8 | Actual | Rol |
| `fase-3` | `comprobaciones` | VERIFICAR ANTES DE PLANEAR | 49-52 | La lista actual (identificador libre, firma, clave de idioma, relación, dump de esquema) | Comprobaciones del dominio |
| `fase-3` | `lotes` | LOTES (nueva, sustituye a 146-152) | nueva | Contrato de §3.5.1 | `lotes: false` lo reduce a "un solo lote" |
| `fase-3` | `pruebas` | PRUEBAS Y PARIDAD (renombra 156-172) | 156-172 + 199-200 | Correr la suite si existe; si no, no inventarla. Comparación contra réplica | `software`: correr la suite. `software-tdd`: rojo y luego verde por lote. `ai-agent-ops`: casos de oro, borde y adversariales |
| `fase-3` | `ejemplos` | MARCAS DE CALIDAD | 211-250 | Actuales | Del dominio |
| `fase-4` | `rol` | ROL | 8 | Actual | Rol |
| `fase-4` | `verificacion` | VERIFICAR, subsección 1 | 85-86 | La lista actual | Medios del dominio |
| `fase-4` | `pruebas` | PRUEBAS (renombra 103-106) | 103-106 + 175 | Correr la suite si existe; si no, no inventarla | Igual que en la Fase 3 |
| `fase-4` | `lotes` | LOTES Y RECIBOS (nueva) | nueva | Contrato de §3.5.2 | Variante sin lotes |
| `fase-4` | `commits` | COMMITS (nueva, sustituye a 132-136) | nueva | `agente-commitea-con-OK` | Las otras tres políticas de P1 |
| `fase-4` | `ejemplos` | MARCAS DE CALIDAD | 186-220 | Actuales | Del dominio |
| `fase-5` | `rol` | ROL | 8 | Actual | Rol |
| `fase-5` | `pr` | SALIDA 2 — DESCRIPCIÓN DEL PR | 33-133 | El contrato actual | `ai-agent-ops`: auditoría de regresión y registro de versión. `multi-repo`: un PR por repo y orden de merge |
| `fase-5` | `ejemplos` | EJEMPLOS DE REFERENCIA | 139-191 | Los tres PR actuales | Del dominio |

Total: **22 ranuras**: 2 globales y 20 de fase.

### 3.3 `prompts/global-rules.md` — texto completo nuevo (lote L04)

Sustituye las 4 líneas actuales:

````md
## REGLA GLOBAL INQUEBRANTABLE (CERO RUPTURAS)
<!-- ranura: cero-rupturas -->
- Nunca modifiques lógica, componentes, o funciones ya existentes a menos que sea 100% necesario. Si modificar algo existente podría romper otra parte del sistema que lo usa, DETENTE.
- Fuera de la Fase 4, si debes hacer un cambio en código existente o tomar una decisión de arquitectura, pregúntale al usuario primero. En la Fase 4, el plan técnico aprobado ES esa autorización para los cambios que lista; pregunta solo por lo que el plan no contempla.
- Cuando propongas un cambio, DEBES explicar detalladamente por qué se necesita y qué implicaciones tiene en el resto del sistema, para que el usuario pueda entenderlo y aprobarlo.
<!-- /ranura -->

## EVIDENCIA
<!-- ranura: evidencia -->
Toda afirmación se ancla en algo que otra persona pueda abrir y comprobar:
- el `archivo:línea` del código, la configuración o el prompt que la sostiene; o
- la salida real de algo que ejecutaste (un comando, una consulta, una prueba), con lo que se ejecutó y cuándo.

Cuando este flujo dice `archivo:línea`, se refiere a esta unidad de evidencia.
<!-- /ranura -->

## BASE DE CADA DECISIÓN

Toda decisión `D<n>`, nazca en la fase que nazca, declara sobre qué base se recomienda o se cierra:

- **Base:** `medido (<qué se ejecutó y contra qué> · vigencia: <ventana de datos | commit | versión | fecha>)` | `leído en código (<archivo:línea>)` | `documentado (<fuente o URL>, <fecha o versión>)` | `inferido (<qué la confirmaría o la refutaría>)`

Reglas de la Base:
- `medido` exige fuente y vigencia. Una medición cuya fuente no confirmaste que esté al día —una réplica sin comprobar su frescura, un modelo o entorno distinto del real— es `inferido`, no `medido`. Medir contra datos viejos y llamarlo medición es peor que no medir.
- `documentado` es documentación con fuente y fecha o versión. No sustituye a leer el código cuando el código existe.
- `inferido` es una base legítima, no un defecto. Pero tiene que decir qué la confirmaría o la refutaría, para que la fase siguiente sepa qué medir.
- Si una decisión se apoya en varias bases, se declara la más débil: es la que manda sobre cuánto confiar en ella.

## PENDIENTES HEREDADOS

Antes de su propio trabajo, cada fase revisa si el documento de la fase anterior dejó lagunas: una sección `## Validaciones pendientes`, cifras marcadas como no revalidadas, decisiones abiertas, código en nivel **Propuesta**, pruebas que esperan al usuario, o una medición cuya fuente el propio documento pone en duda. Si las hay, se las nombras al usuario ANTES de empezar y le preguntas si se cierran primero. Qué hacer con cada una lo dice cada fase en su apartado de pendientes heredados; la Fase 1 no hereda documento de otra fase, solo el contexto inicial.

Toda fase que cierra con algo sin comprobar o sin decidir lo deja bajo el encabezado exacto `## Validaciones pendientes`, y lo dice también en el mensaje de cierre al usuario, no solo dentro del documento.
````

### 3.4 Cambios exactos por fase

Cada bloque dice **dónde** (líneas @d7594ea) y **qué texto** queda. Se aplican de abajo hacia arriba dentro de cada archivo.

#### 3.4.1 `prompts/fase-1-descubrimiento.md` (lote L05)

**(a) AUTOVERIFICACIÓN — añadir tras la línea 167:**

```md
8. ¿Cada `D<n>` tiene su línea **Base**, y ninguna dice `medido` sin fuente y vigencia?
9. ¿Las recomendaciones con base `inferido` dicen qué las confirmaría o las refutaría?
10. Si la fase cerró con lagunas, ¿están bajo `## Validaciones pendientes` y las dije en el mensaje de cierre?
```

**(b) MARCAS DE CALIDAD — envolver las líneas 129-154** en `<!-- ranura: ejemplos -->` … `<!-- /ranura -->`.

**(c) PROHIBIDO — añadir tras la línea 123:**

```md
- Una decisión `D<n>` sin línea **Base**, o marcada `medido` sin fuente y vigencia.
- Cerrar la fase con lagunas sin decirlo en el mensaje de cierre al usuario.
```

**(d) REGLAS DE REDACCIÓN — añadir tras la línea 109:**

```md
- Si la fase cierra con lagunas, dilo en el mensaje de cierre al usuario, no solo dentro de `## Validaciones pendientes`. Quien lea solo el chat tiene que enterarse.
```

**(e) Tabla condicional — sustituir la línea 91:**

```md
| Validaciones pendientes | no hubo acceso para comprobar algo, o una medición sale de una fuente cuya frescura no confirmaste. Es una laguna: va con el encabezado exacto `## Validaciones pendientes` y se dice también en el mensaje de cierre |
```

**(f) Núcleo, punto 7 — sustituir las líneas 74-76:**

```md
7. **Decisiones para la Fase 2.** Formato `D1`, `D2`, … La Fase 2 debe poder resolverse
   escogiendo, no redactando. Cada decisión:

   ### D<n> — <tema>
   - **Opciones:** (a) … (b) … (c) …
   - **Recomendación:** … (marcada como recomendación, no como decisión)
   - **Base:** ver BASE DE CADA DECISIÓN en las reglas globales.
```

**(g) VERIFICACIÓN — envolver las líneas 41-44** en `<!-- ranura: verificacion -->`.

**(h) Ejemplo de la línea 34 — generalizar:** `app/Models/Ejemplo.php:112` pasa a `src/facturacion/calculo.ts:112`.

**(i) Regla 2, líneas 13-14 — sustituir:**

```md
2. Lee el código real y la documentación central antes de opinar. Cada afirmación del
   documento se ancla en la evidencia que definen las reglas globales (EVIDENCIA).
```

**(j) ROL — envolver la línea 9** en `<!-- ranura: rol -->`.

#### 3.4.2 `prompts/fase-2-decisiones.md` (lote L05)

**(a) AUTOVERIFICACIÓN — añadir tras la línea 246:**

```md
10. ¿Abrí nombrando los pendientes heredados de la Fase 1, antes de plantear ninguna decisión?
11. ¿Ataqué primero las decisiones con base `inferido`?
12. ¿Cada decisión, en tabla o en bloque, tiene su **Base**?
```

**(b) MARCAS — envolver las líneas 207-230** en `<!-- ranura: ejemplos -->`.

**(c) PROHIBIDO — añadir tras la línea 201:**

```md
- Plantear decisiones sin haber nombrado antes los pendientes heredados de la Fase 1.
- Una decisión sin **Base**, o marcada `medido` sin fuente y vigencia.
- Dar por cerrada una decisión que descansa en un dato que la Fase 1 marcó como dudoso, aunque el usuario haya respondido.
```

**(d) FORMATO DE CADA DECISIÓN — líneas 125-142:**

- La tabla de la línea 129 pasa a: `| # | Tema | Decisión | Fundamento | Base |`
- En el bloque (líneas 134-139), tras la línea 137 (`- **Por qué:** …`), añadir: `- **Base:** ver BASE DE CADA DECISIÓN en las reglas globales.`
- Añadir al final de la sección:

```md
En esta fase, la **Base** es el fundamento con el que se comprobó que la decisión es segura,
no quién la tomó. Si la decisión es puramente de negocio y no hay nada técnico que comprobar,
la Base es `documentado (respuesta del usuario, <fecha>)`.
```

**(e) Tabla condicional — añadir una fila tras la línea 121:**

```md
| Validaciones pendientes | quedó algo sin comprobar o sin decidir. Encabezado exacto `## Validaciones pendientes`, y se dice también en el mensaje de cierre |
```

**(f) VALIDAR ANTES DE CERRAR — envolver las líneas 52-54** en `<!-- ranura: verificacion -->` y añadir tras la línea 54:

```md
**Empieza por las decisiones que la Fase 1 marcó como `inferido`**: son las que más
probablemente cambien. Las `medido` se revalidan solo si la fuente de esa medición era dudosa,
y en ese caso lo dices. Las `leído en código` y `documentado` se revalidan si el código o la
fuente pudieron cambiar desde entonces. Reverificar todo por igual gasta la fase en lo que ya
estaba resuelto.
```

**(g) EL TRABAJO DE ESTA FASE — insertar antes de la línea 34:**

```md
0. **Revisa los pendientes heredados de la Fase 1** (ver PENDIENTES HEREDADOS en las reglas
   globales). Si su documento trae `## Validaciones pendientes`, cifras marcadas como no
   revalidadas o una medición cuya fuente el propio documento pone en duda, díselo al usuario
   ANTES de plantear ninguna decisión y pregúntale si se cierran primero. Una decisión tomada
   sobre un número que la fase anterior marcó como dudoso no se puede dar por cerrada, aunque
   el usuario responda.
```

**(h) POR QUÉ EL DOCUMENTO ES OBLIGATORIO — sustituir las líneas 23-25:**

```md
El chat no viaja entre sesiones ni entre dispositivos; el documento sí. Si una decisión solo
quedó dicha en la conversación, en la práctica se perdió.
```

**(i) ROL — envolver la línea 8** en `<!-- ranura: rol -->`.

#### 3.4.3 `prompts/fase-3-plan-tecnico.md` (lote L06)

**(a) AUTOVERIFICACIÓN — añadir tras la línea 266:**

```md
12. ¿El documento empieza con el frontmatter `lotes: N`, y N coincide con las filas de la tabla de lotes?
13. ¿Cada paso pertenece a exactamente un lote, cada lote toca un solo repositorio y su criterio de salida es ejecutable cuando se puede ejecutar?
14. ¿Nombré los pendientes heredados antes del primer paso, y los pasos que dependen de ellos van como Propuesta?
15. ¿Los desvíos y las micro-decisiones `D<n>` tienen su **Base**?
```

**(b) MARCAS — envolver las líneas 211-250** en `<!-- ranura: ejemplos -->`.

**(c) PROHIBIDO, líneas 192-205:** quitar las líneas 199-200 (se mudan a PRUEBAS Y PARIDAD) y añadir:

```md
- Escribir el plan sin la tabla de lotes, o sin el frontmatter `lotes: N`.
- Un lote que toca más de un repositorio, o que deja la aplicación sin funcionar hasta un lote posterior.
- Escribir el primer paso sin haber nombrado los pendientes heredados de la Fase 2.
- Un desvío o una micro-decisión `D<n>` sin **Base**.
```

**(d) Sección 156-172 — sustituirla por:**

```md
## PRUEBAS Y PARIDAD
<!-- ranura: pruebas -->
Si el proyecto no tiene suite de pruebas automatizadas configurada, **no inventes una sección
de tests ni propongas escribir la primera del módulo**. Dilo en una línea cuando venga a cuento
y sigue. Si ya existe una suite en el repositorio, sí debes correrla: el plan dice qué comando
y qué debe dar, en el criterio de salida de cada lote.

[…líneas 162-172 actuales, sin cambios…]

Si no hay suite, está prohibido inventar una sección de pruebas automatizadas o proponer
escribir la primera del módulo como parte de esta tarea.
<!-- /ranura -->
```

**(e) Sección 146-152 — sustituirla por LOTES** (texto exacto en §3.5.1).

**(f) Tabla condicional:**
- Quitar la línea 133 (`Etapas con commits separados`): ahora es núcleo.
- La línea 135 pasa a: `| Comparación de paridad | el cambio altera lo que muestra un reporte, un export o una salida existente. Cómo se compara lo dice PRUEBAS Y PARIDAD |`
- La línea 141 termina en: `Con sus opciones descartadas y su **Base**, igual que en la Fase 2 |`

**(g) Núcleo, líneas 100-121:**
- Punto 1: añadir al final ``El documento empieza con el frontmatter `lotes: N` (ver LOTES).``
- Punto 4 pasa a: ``**Desvíos respecto a la Fase 2**, si los hubo, numerados `D<n>` y con su **Base**.``
- Insertar tras el punto 7: `8. **Lotes.** La tabla de LOTES. Cada paso pertenece a exactamente un lote.` Los puntos actuales 8, 9 y 10 pasan a 9, 10 y 11.
- El punto de Estado de cierre añade: ``Si faltan confirmaciones, van bajo `## Validaciones pendientes`.``

**(h) DESVÍOS, línea 74:** la frase termina en `Un desvío es una decisión, lleva su **Base** y se referencia igual desde la Fase 4.`

**(i) VERIFICAR ANTES DE PLANEAR:** envolver las líneas 49-52 en `<!-- ranura: comprobaciones -->` e insertar tras la línea 47:

```md
**Antes de verificar nada, revisa los pendientes heredados** (ver PENDIENTES HEREDADOS en las
reglas globales). Si la Fase 2 dejó decisiones abiertas, `## Validaciones pendientes` o
decisiones con base `inferido` que nadie confirmó, nómbralas al usuario antes de escribir el
primer paso. Un paso que depende de una de ellas va en nivel **Propuesta**, nunca
**Definitivo**, y su lote dice de qué pendiente depende.
```

**(j) REGLAS, línea 18:** ``5. Genera SIEMPRE el documento (ej. `03 - Plan Técnico.md`), con su tabla de lotes.``

**(k) ROL — envolver la línea 8** en `<!-- ranura: rol -->`.

#### 3.4.4 `prompts/fase-4-ejecucion.md` (lote L07)

**(a) Frontmatter, líneas 1-3:**

```md
---
documento: 04 - Ejecución.md
recibos: 04 - Ejecución
---
```

**(b) AUTOVERIFICACIÓN — sustituir la línea 235 y añadir:**

```md
10. ¿Cada commit tuvo el OK del usuario, llevó solo los archivos de su lote y no hubo ningún push?
11. ¿Cada lote cerrado tiene su recibo con `estado` y `commit` en el frontmatter?
12. Con más de un lote, ¿escribí el documento de la fase solo al cerrar el último?
13. ¿Nombré los pendientes heredados antes del primer lote, y no ejecuté ningún lote que dependiera de uno sin resolver?
14. ¿Las decisiones nuevas tienen su **Base**?
```

**(c) MARCAS — envolver las líneas 186-220** en `<!-- ranura: ejemplos -->`.

**(d) PROHIBIDO, líneas 168-180:**
- La línea 173 pasa a: `- Hacer push, crear o cambiar de rama, o abrir un PR.`
- Quitar la línea 175 (se muda a PRUEBAS).
- Añadir:

```md
- Hacer un commit sin el OK del usuario, o con `git add -A` / `git add .`.
- Abrir un lote sin haber cerrado el anterior (recibo escrito y commit hecho o descartado).
- Escribir el documento de la fase antes de cerrar el último lote, cuando hay más de uno.
- Ejecutar un lote que depende de un pendiente heredado sin resolver.
- Una decisión nueva sin **Base**.
```

**(e) Líneas 132-165 (NO SUBES NADA y EL DOCUMENTO) — sustituir** por LOTES Y RECIBOS y COMMITS (texto exacto en §3.5.2). La tabla condicional de las líneas 157-164 se conserva dentro, como "Secciones condicionales del recibo".

**(f) Sobre las pruebas automatizadas, líneas 103-106 — sustituir:**

```md
### Pruebas
<!-- ranura: pruebas -->
Si el proyecto no tiene suite de pruebas automatizadas configurada, no inventes una sección
de tests ni propongas escribir la primera del módulo como parte de esta tarea; si viene a
cuento, una línea y sigue. Si ya existe una suite en el repositorio, sí debes correrla, y su
resultado va con números en la verificación del lote.
<!-- /ranura -->
```

**(g) VERIFICAR, subsección 1 — envolver las líneas 85-86** en `<!-- ranura: verificacion -->`.

**(h) CÓMO SE IMPLEMENTA, líneas 54-55 — sustituir:**

```md
- **Lote por lote, en el orden del plan** (ver LOTES Y RECIBOS). Cada lote deja la aplicación
  funcionando; el arriesgado va al final para poder descartarlo.
```

**(i) Insertar tras la línea 45** (el `---` que precede a CÓMO SE IMPLEMENTA, línea 47):

```md
## ANTES DEL PRIMER LOTE: PENDIENTES HEREDADOS

Lee el plan completo y revisa sus pendientes (ver PENDIENTES HEREDADOS en las reglas
globales): el Estado de cierre si dice que faltan confirmaciones, `## Validaciones pendientes`,
y todo fragmento de nivel **Propuesta** con su pendiente escrito. Nómbraselos al usuario antes
de tocar código. Un lote que depende de un pendiente sin resolver **no se ejecuta** hasta
resolverlo; los que no dependen de él pueden avanzar, en su orden.

---
```

**(j) ALCANCE, líneas 37 y 39 — sustituir:**

```md
| Escribir los pasos por interfaz que el usuario debe hacer | Hacerlos tú sin que el usuario lo haya pedido |
| Dejar el recibo de cada lote y hacer su commit con el OK del usuario | Hacer push, crear o cambiar de rama, abrir un PR |
```

**(k) ESTA FASE HACE, líneas 24-27 — la última frase pasa a:** `El orden es: implementar un lote, verificarlo de verdad, dejar su recibo corto y su commit, y solo entonces el siguiente.`

**(l) REGLAS, línea 15:** `5. Ejecuta **por lotes**: cada lote cierra con su recibo y su commit antes de abrir el siguiente. Ver LOTES Y RECIBOS.`

**(m) ROL — envolver la línea 8** en `<!-- ranura: rol -->`.

#### 3.4.5 `prompts/fase-5-auditoria-pr.md` (lote L08)

**(a) Envolver las líneas 139-191** (ejemplos A, B y C) en `<!-- ranura: ejemplos -->`.

**(b) Envolver las líneas 33-133** (todo el cuerpo de SALIDA 2, con su encabezado `##` fuera) en `<!-- ranura: pr -->`.

**(c) Insertar tras la línea 27** (fin de SALIDA 1):

```md
### PROHIBIDO (auditoría)
- Auditar sin haber revisado antes los pendientes heredados de la Fase 4 y sus recibos.
- Dar "LGTM" con un pendiente que toca lo auditado y del que no hay constancia de que el usuario lo comprobó.
- Auditar commits distintos de los de los recibos sin decirlo.

### AUTOVERIFICACIÓN (auditoría)
1. ¿Revisé el documento de la Fase 4 y sus recibos antes de mirar el diff?
2. ¿Todo pendiente que toca lo auditado está como BLOQUEANTE, o con constancia de que se comprobó?
3. ¿Los commits auditados coinciden con los de los recibos? Si no, ¿lo dije?
```

**(d) Insertar tras la línea 15** (antes de SALIDA 1):

```md
## ANTES DE AUDITAR: PENDIENTES HEREDADOS

Lee el documento de la Fase 4 y, si los hay, sus recibos de lote, antes de mirar el diff. Todo
lo que quedó en "Espera al usuario", en `## Validaciones pendientes`, o en un lote con estado
`con pendientes`, `fallido` o `descartado`, se nombra en la auditoría. Si toca lo que se audita
y no hay constancia de que el usuario lo comprobó, es **BLOQUEANTE**.
```

**(e) Regla 1, línea 11 — sustituir:**

```md
1. ENTRADA: los commits que registran los recibos de la Fase 4 (campo `commit` de cada recibo, o la tabla del índice). Si el usuario indica otro rango, manda el suyo, y dilo si no coincide con los recibos. Si no hay recibos ni rango, pregunta. TÚ NUNCA haces commits, push, ni creas o subes PRs; de eso se encarga siempre el usuario.
```

**(f) ROL — envolver la línea 8** en `<!-- ranura: rol -->`.

### 3.5 Contrato de lotes y recibos

#### 3.5.1 Fase 3 — sección LOTES (sustituye a `fase-3:146-152`)

````md
## LOTES
<!-- ranura: lotes -->
La Fase 4 no ejecuta el plan de golpe: lo ejecuta **un lote a la vez**, y cada lote termina en
un commit atómico y en un recibo. Este documento define esos lotes.

**El documento empieza con este frontmatter**, antes del título, con el número total de lotes:

```markdown
---
lotes: 3
---
```

Un plan chico tiene `lotes: 1`. Es válido y no obliga a partir nada.

Tabla obligatoria, después de los pasos:

| Lote | Repo | Objetivo | Pasos | Criterio de salida | Commit propuesto | Revierte solo |
|---|---|---|---|---|---|---|
| L01 | <repo> | un cambio lógico, en una frase | M1, M2 | qué se ejecuta y qué debe dar | `tipo(área): frase` | sí, o no y por qué |

Reglas de los lotes:
- **Un lote es un cambio lógico que se puede revertir solo.** Si para describir su objetivo
  necesitas un "y", probablemente son dos lotes.
- **Un lote toca un solo repositorio.** Un commit no puede abarcar dos.
- **Cada lote deja la aplicación funcionando.** Ninguno depende de uno posterior para compilar
  o arrancar.
- **Lo que arregla va primero; lo que solo mejora, al final**, para poder descartarlo sin perder
  el arreglo. Si un lote es más arriesgado que los demás, va al final y lo dices.
- **Numeración con dos dígitos:** `L01`, `L02`… Es el nombre del recibo en la Fase 4.
- **El criterio de salida es ejecutable cuando se puede ejecutar:** un comando, una consulta o
  una prueba, con lo que debe dar. Lo que necesita pantalla se dice como "qué debe verse", sin
  pasos.
- **Cada paso pertenece a exactamente un lote.**
- **Un lote que depende de un pendiente heredado lo dice en su objetivo.**
<!-- /ranura -->
````

#### 3.5.2 Fase 4 — LOTES Y RECIBOS y COMMITS (sustituyen a `fase-4:132-165`)

````md
## LOTES Y RECIBOS
<!-- ranura: lotes -->
El plan declara cuántos lotes hay (`lotes: N` en su frontmatter) y los lista en su tabla. Se
ejecutan **uno a la vez, en su orden**, con este ciclo. No abras el siguiente lote sin cerrar
el anterior.

1. **Implementa solo ese lote.** Nada de lotes posteriores, aunque estés en el mismo archivo.
2. **Verifícalo** con su criterio de salida, ejecutando (ver VERIFICAR).
3. **Escribe su recibo ANTES del commit**, con `commit: pendiente`. Si el chat se corta aquí,
   el recibo ya dice qué se hizo y qué se comprobó.
4. **Corte de commit** (ver COMMITS). Este es el único punto de parada del lote: mientras el
   usuario revisa los archivos y el mensaje, también puede hacer las pruebas que le esperan.
5. **Actualiza el recibo** con el hash del commit.
6. **Sigue con el siguiente lote**, anunciándolo en una línea ("L02 de 4 cerrado: <hash>.
   Abro L03.").

Si un lote no pasa su criterio de salida, no hagas su commit: su recibo queda con
`estado: fallido` y lo que pasó, y te detienes a preguntar. Un lote que se descarta a
propósito queda con `estado: descartado` y su porqué.

### Dónde va cada recibo

- **Con `lotes: 1`**, el recibo ES el documento de la fase (ventana aceptada, ver la nota de diseño de abajo): se escribe directo con el nombre
  exacto que se indica al final de este prompt, con la plantilla de abajo, y no se crea
  subcarpeta.
- **Con más de un lote**, cada recibo va en la subcarpeta de recibos que se indica al final de
  este prompt, con el nombre `L0x - <slug>.md`, donde `<slug>` es el objetivo del lote en pocas
  palabras: solo letras, números, espacios y guiones; sin `:` `/` `\` `<` `>` `"` `|` `?` `*`
  ni punto al final. No copies el mensaje de commit: `fix(rutas): …` lleva dos puntos.
  **El documento de la fase no se escribe hasta cerrar el último lote**: su existencia es lo que marca la fase como terminada, así que escribirlo antes la
  daría por cerrada. Al cerrar el último lote, el documento de la fase es el índice de abajo,
  no una redacción nueva.

### Plantilla del recibo (frontmatter y encabezados exactos, en este orden)

```markdown
---
lote: L02
de: 4
repo: <repo>
rama: <rama>
estado: verificado | con pendientes | fallido | descartado
commit: pendiente | <hash corto> | no aplica
fecha: <AAAA-MM-DD>
---

# L02 — <objetivo del lote>

## Qué se hizo
Una o dos frases, con el número que importe.

## Archivos
| Archivo | Qué cambió |
|---|---|

Sin copiar código: para eso está el diff. La excepción es el fragmento que quedó distinto de
lo que decía el plan.

## Verificación ejecutada
Lo que corriste, con su resultado en números. Si no corriste nada, dilo.

## Espera al usuario
| Prueba | Resultado esperado |
|---|---|

"Ninguna." si no hay. Nunca las des por hechas.

## Desvíos del plan
Lo que no salió como decía el plan, en sus tres formas (método que no servía, decisión nueva,
número equivocado). "Ninguno." si no hubo.

## Decisiones
Las `D<n>` nuevas de este lote, con su **Base**. "Ninguna." si no hubo.
```

Secciones condicionales del recibo, solo si se cumple su disparador:

| Sección | Se activa si… |
|---|---|
| Lo que sigue igual | el lote pasa cerca de consumidores que no debían moverse y conviene dejar constancia de que no se movieron |
| Reversión | hay migración, el lote escribe datos, o el despliegue va en más de un paso |
| Aviso a alguien más | el resultado cambia una cifra que otra persona usa para tomar decisiones |
| Deuda anotada | encontraste algo real que se decidió no atender ahora |

### Índice de cierre (solo con más de un lote)

```markdown
---
lotes: 4
---

# Ejecución — <tarea>

- **Plan:** `03 - Plan Técnico.md` · **Rama:** <rama> · **Cierre:** <AAAA-MM-DD>
- **Estado:** Fase cerrada sin pendientes | Fase cerrada con pendientes (ver abajo)

## Lotes
| Lote | Objetivo | Estado | Commit | Recibo |
|---|---|---|---|---|
| L01 | … | verificado | `a1b2c3d` | `04 - Ejecución/L01 - ….md` |

## Espera al usuario
Las filas de "Espera al usuario" de cada recibo, copiadas sin reescribir. "Nada." si no hay.

## Validaciones pendientes
(Esta sección existe solo si quedó algo abierto. Si no quedó nada, ni el encabezado se
escribe: el cierre limpio lo dice la línea Estado de arriba.)
```
<!-- /ranura -->

---

## COMMITS
<!-- ranura: commits -->
Política: **el agente hace el commit con el OK del usuario.**

Al cerrar la verificación y el recibo de un lote:
1. Muéstrale al usuario la lista exacta de archivos del lote y el mensaje de commit (el de la
   columna "Commit propuesto" del plan, ajustado si el lote cambió).
2. Espera su confirmación en el chat. Sin confirmación no hay commit.
3. Con la confirmación: `git add` con **esa lista de archivos, uno por uno** —nunca
   `git add -A` ni `git add .`— y `git commit` con ese mensaje, en el repositorio del lote.
4. Si un hook falla o el commit pide una contraseña o passphrase, detente y díselo. Nunca uses
   `--no-verify` ni te saltes la firma.

Nunca hagas `push`, no crees ni cambies de rama y no abras un PR. Eso es del usuario.
<!-- /ranura -->
````

> **Nota de diseño (ventana aceptada, validación V15).** Entre las versiones `2.1.0` y `3.0.0-beta`, con `lotes: 1`, `04 - Ejecución.md` existe desde que se escribe el recibo con `commit: pendiente`, así que durante esos minutos la fase aparece cerrada antes del commit. Es una excepción consciente a la invariante de §1.1: el modelo no puede mover archivos y la alternativa obligaba a escribir dos documentos para una tarea de un lote, que es lo que R2 pidió evitar. Desaparece en la `3.0.0` con H2, cuando el servidor mantiene el recibo en la subcarpeta hasta el ancla.

> **Nota de diseño.** Los ejemplos de frontmatter, la plantilla del recibo y el índice van dentro de bloques ` ```markdown `, igual que el formato de decisión de `fase-2:134`. Así sus `---` no se confunden con los separadores de sección del prompt. Dentro de esos bloques nunca hay marcadores de ranura, porque `quitarMarcadores` actúa por línea y los quitaría.

#### 3.5.3 Lo que añade el servidor al final del prompt de la Fase 4

`describePhaseFiles` (lote L02) añade, cuando la fase declara `recibos`:

```md
Los recibos de lote van en la subcarpeta `04 - Ejecución/`, uno por lote:
`04 - Ejecución/L01 - <slug>.md`. Con un solo lote no hay subcarpeta: el recibo es el
documento de esta fase.
```

Y en la Fase 5, en la lista de documentos anteriores:

```md
- Fase 4: `04 - Ejecución.md` (recibos de lote en `04 - Ejecución/`)
```

### 3.6 Comandos (lote L09)

**`.claude/commands/f3.md`.** El paso 5 pasa a `5. Con las decisiones ya tomadas, genera el plan con su tabla de lotes, respetando "Cero Rupturas".` y se elimina el paso 7.

**`.claude/commands/f4.md`.** Pasos 3 a 5 y nota final:

```md
3. Lee el plan técnico de la Fase 3 con `read_central_doc` —`get_phase_prompt` te dio su nombre exacto— y nómbrame sus pendientes antes de tocar código.
4. Ejecútalo **lote por lote**, como indica el prompt: implementa un lote, verifícalo ejecutando, escribe su recibo, muéstrame archivos y mensaje de commit, y con mi OK haz el commit antes de abrir el siguiente. Nunca hagas push.
5. Con un solo lote, su recibo es el documento de la fase. Con más de uno, el documento de la fase es el índice y se escribe solo al cerrar el último.

El entregable de esta fase es el código funcionando, lote por lote; cada recibo es corto y se escribe al cerrar su lote.
```

**`.claude/commands/f5.md`, línea 3:**

```md
Commits a auditar: si escribí un rango después del comando, usa ese. Si no, tómalos de los recibos de la Fase 4. Si tampoco hay recibos, pregúntame cuáles antes de seguir.
```

**`docs/comandos-de-fase.md`.** Los bloques de `f3`, `f4` y `f5` se actualizan con el mismo texto (lo exige `test/docs.test.ts` desde la Etapa 0).

### 3.7 Especificación de código

#### 3.7.1 Escritura solo dentro de carpetas de tarea (lote L01)

**`src/paths.ts`, nueva función** (junto a `resolveDocPath`):

```ts
export type UbicacionEnTarea = {
  carpetaProyecto: string;  // nombre real de la carpeta del proyecto
  taskName: string;
  carpetaTarea: string;     // ruta absoluta
  relativo: string;         // ruta dentro de la tarea, con "/" como separador
};

// null si la ruta no cae dentro de la carpeta de una tarea existente.
export function ubicarEnTarea(rutaAbsoluta: string): UbicacionEnTarea | null
```

Algoritmo:
1. `rel = path.relative(rutaReal(docsBase), rutaReal(rutaAbsoluta))`, partido por `/` o `\`.
2. `[proyecto, ...resto]`: `findProjectFolder(proyecto)` debe existir.
3. Los segmentos de `tasksSubdir()` (partido por separadores) deben coincidir en orden con el inicio de `resto`. Con la subcarpeta vacía, no se consume nada.
4. El siguiente segmento es la tarea: no empieza por `.` y la carpeta existe.
5. Queda al menos un segmento de archivo, y **ningún segmento de `relativo` empieza por `.`**: `write_central_doc` no crea archivos ni subcarpetas ocultas (`.git`, `.phase-gate`) dentro de una tarea. Si no se cumple, `null`.

**`src/paths.ts`, `discoverProjects`** (`:36`): ignora entradas cuyo nombre empieza por `.`.

**`src/tasks.ts`, `listarTareas`** (`:187`): el filtro pasa a `entrada.isDirectory() && !entrada.name.startsWith(".")`.

**`src/index.ts`, `write_central_doc`** (`:369-384` @d7594ea): tras `resolveDocPath(args)`:

```ts
const ubicacion = ubicarEnTarea(fullPath);
if (!ubicacion) {
  throw new Error(
    "write_central_doc solo escribe dentro de la carpeta de una tarea que ya existe " +
      "(<DOCS>/<PROYECTO>/<subcarpeta de tareas>/<tarea>/). Los archivos del proyecto, como " +
      "phase-gate.json, no se escriben con esta tool. Para una tarea nueva, usa start_task."
  );
}
```

`read_central_doc` no cambia: sigue leyendo cualquier archivo dentro de `DOCS`.

#### 3.7.2 Ranuras y recibos en `src/phases.ts` (lote L02)

- `PhaseFile` (`:22-27`) gana `recibos?: string | undefined`.
- `discoverPhases` (`:86-91`) lee `meta.recibos`, validado con `validarSegmento`. Un valor inválido se ignora y se registra en el log.
- Nueva función:

```ts
// Quita los marcadores de ranura y conserva su contenido. El modelo nunca los ve.
export const MARCADOR_RANURA = /^[ \t]*<!--\s*\/?ranura(?:\s*:\s*[\w-]+)?\s*-->[ \t]*\r?\n?/gm;
export function quitarMarcadores(texto: string): string
```

- `parsePhaseFile` (`:29-46`) normaliza `\r\n` a `\n` nada más leer (§1.3), antes de separar el frontmatter.
- `loadPhasePrompt` (`:119-145`) aplica la misma normalización a las reglas globales y `quitarMarcadores` a las reglas globales (`:136`) y al cuerpo de la fase (`:139`).
- `describePhaseFiles` (`:164-191`) añade las líneas de §3.5.3.

**`test/prompts.test.ts` (nuevo):**
- Las ranuras de los prompts publicados están bien formadas: balanceadas, sin anidar, con nombres únicos por archivo y del catálogo de §3.2.
- Ningún `loadPhasePrompt(1..5)` sobre los prompts publicados contiene `<!--`.
- La Fase 4 declara `recibos`.

En L04 a L08, el mismo archivo gana un test por lote que asegura que existen los encabezados nuevos (`## BASE DE CADA DECISIÓN`, `## PENDIENTES HEREDADOS`, `## LOTES`, `## LOTES Y RECIBOS`, `## COMMITS`, `## ANTES DE AUDITAR: PENDIENTES HEREDADOS`).

#### 3.7.3 Congelamiento R4 (lote L03)

**`src/tasks.ts`, nueva función** (junto a `estadoDeTarea`):

```ts
// Devuelve el motivo del rechazo, o null si se puede escribir sin force.
export function motivoDeProteccion(
  carpetaTarea: string,
  relativo: string,                 // con "/" como separador
  phases: Map<number, PhaseFile>,
  contextoInicial: string
): string | null
```

Algoritmo:
1. Si `relativo === contextoInicial`: devuelve `"El contexto inicial está siempre protegido: es el único documento que no se puede regenerar leyendo el código."`. Aplica tanto a crearlo como a sobrescribirlo, porque solo `start_task` lo escribe.
2. Busca la fase `n` del archivo: la fase cuyo `documento === relativo`, o cuyo `recibos` cumpla `relativo.startsWith(recibos + "/")`. Si no hay ninguna, devuelve `null` (no es un archivo de fase).
3. Si es un documento de fase y **no existe**, devuelve `null`: crearlo nunca pisa nada, incluido rellenar un hueco.
4. `posterior` = la fase `m > n` de menor número que esté **presente** en `carpetaTarea`. Una fase está presente si existe su `documento`, o si declara `recibos` y esa subcarpeta existe y contiene al menos un archivo `.md`. Como `m > n` es estricto, los recibos de la Fase 4 nunca congelan a la propia Fase 4: a sus recibos y a `04 - Ejecución.md` solo los congela una fase 5 presente.
5. Si existe `posterior`, devuelve el mensaje «`<relativo>` está congelado: la Fase m ya está en curso o cerrada (existe `<documento o subcarpeta de recibos de la fase m>`).». Si no, `null`.

Tabla de verdad que fija `test/tasks.test.ts`:

| Existen | Se escribe | Resultado |
|---|---|---|
| 00, 01 | `00 - Contexto Inicial.md` | rechazo (siempre) |
| 00, 01, 02 | `01` | rechazo: existe 02 |
| 00, 01, 02 | `02` | permitido: es la última y no existe 03 |
| 00, 01, 02 | `03` | permitido: creación |
| 00…05 | `05` | permitido: corrección del PR con la tarea terminada |
| 00…05 | `04` | rechazo: existe 05 |
| 00…03, recibos (L01) | `03 - Plan Técnico.md` | rechazo: Fase 4 en curso (existen recibos en `04 - Ejecución/`) |
| 00…03, recibos (L01) | `04 - Ejecución.md` | permitido: es el cierre de la Fase 4 |
| 00…03, recibos | `04 - Ejecución/L02 - x.md` | permitido: Fase 4 en curso |
| 00…05, recibos | `04 - Ejecución/L02 - x.md` | rechazo: existe 05 |
| 00, 01, 03 | `02` | permitido: rellena el hueco |
| 00, 01, 03 | `01` | rechazo: existe 03 |
| cualquiera | `notas.md` | permitido: no es archivo de fase |

**`src/schemas.ts`:** `writeCentralDocShape` gana `force: z.boolean().optional()`, con la descripción: "Solo con confirmación explícita del usuario en el chat. Permite reescribir un documento congelado o el contexto inicial."

**`src/index.ts`, `write_central_doc`**, tras `ubicarEnTarea`:

```ts
const motivo = motivoDeProteccion(
  ubicacion.carpetaTarea, ubicacion.relativo, discoverPhases(), nombreContextoInicial()
);
if (motivo && args.force !== true) {
  throw new Error(
    `${motivo} Si de verdad hay que reescribirlo, pídele al usuario confirmación explícita ` +
      `y vuelve a llamar con force: true.`
  );
}
```

La respuesta de éxito añade `" (sobrescrito con force)"` cuando se usó `force`.

**`test/e2e.test.ts`:** rechaza `01` cuando existe `02` y lo acepta con `force: true`; rechaza `phase-gate.json` escrito vía `file_path`; escribe un recibo en la subcarpeta; y rechaza una tarea inexistente sin crear la carpeta.

### 3.8 Lotes de la Etapa 1

| Lote | Objetivo | Archivos | Verificación | Commit propuesto |
|---|---|---|---|---|
| **L01** | `write_central_doc` solo escribe en carpetas de tarea existentes; las carpetas con punto no son proyecto ni tarea | `src/paths.ts`, `src/tasks.ts`, `src/index.ts`, `test/paths.test.ts`, `test/tasks.test.ts`, `test/e2e.test.ts`, `docs/decisiones.md` | Base verde. E2E: `phase-gate.json` vía `file_path` rechazado; tarea inexistente rechazada sin crear carpeta; `.phase-gate/` no aparece en `list_tasks` con la subcarpeta vacía | `fix(escritura): write_central_doc solo escribe dentro de la carpeta de una tarea` |
| **L02** | Normalización de finales de línea, soporte de ranuras (`quitarMarcadores`) y de la subcarpeta de recibos (`recibos` en el frontmatter) | `src/phases.ts`, `test/phases.test.ts`, `test/prompts.test.ts` (nuevo), `docs/decisiones.md` | Base verde. Con fixtures: los marcadores no llegan al prompt y `describePhaseFiles` nombra la subcarpeta. Los prompts reales aún no tienen ranuras: el test de buena formación pasa con cero. Un prompt propio escrito en CRLF se entrega en LF | `feat(fases): quitar los marcadores de ranura y anunciar la subcarpeta de recibos` |
| **L03** | Congelamiento R4 con `force` | `src/tasks.ts`, `src/schemas.ts`, `src/index.ts`, `test/tasks.test.ts`, `test/e2e.test.ts`, `docs/decisiones.md` | Base verde. Las 13 filas de la tabla de verdad, más el E2E de `force` | `feat(escritura): congelar los documentos de fases superadas y pedir force para reescribirlos` |
| **L04** | `global-rules.md` nuevo (§3.3) | `prompts/global-rules.md`, `test/prompts.test.ts`, `docs/decisiones.md` | Base verde. `get_phase_prompt(1)` por E2E contiene `## BASE DE CADA DECISIÓN` y `## PENDIENTES HEREDADOS`, y no contiene `<!--` | `feat(prompts): base de cada decisión y pendientes heredados en las reglas globales` |
| **L05** | Fases 1 y 2: #40, #39, ranuras y textos generalizados (§3.4.1 y §3.4.2) | `prompts/fase-1-descubrimiento.md`, `prompts/fase-2-decisiones.md`, `test/prompts.test.ts` | Base verde. Se reporta el tamaño en caracteres de los prompts 1 y 2, antes y después | `feat(prompts): decisiones con base y pendientes heredados en descubrimiento y decisiones` |
| **L06** | Fase 3: lotes estructurales, PRUEBAS Y PARIDAD, pendientes, Base y ranuras (§3.4.3 y §3.5.1) | `prompts/fase-3-plan-tecnico.md`, `test/prompts.test.ts`, `docs/decisiones.md` | Base verde. El prompt no contiene "Etapas con commits separados" y contiene `lotes:` | `feat(fase 3): planear por lotes con commit propuesto y criterio de salida` |
| **L07** | Fase 4: ciclo por lote, recibos, commits con OK, pendientes y ranuras (§3.4.4 y §3.5.2) | `prompts/fase-4-ejecucion.md`, `test/prompts.test.ts`, `test/phases.test.ts`, `docs/decisiones.md` | Base verde. El prompt entregado nombra la subcarpeta `04 - Ejecución/`. El test de los prompts publicados (`test/phases.test.ts:174`) comprueba `recibos` en la Fase 4 | `feat(fase 4): ejecutar lote por lote con recibo y commit con el OK del usuario` |
| **L08** | Fase 5: entrada desde recibos, pendientes como bloqueantes, PROHIBIDO y AUTOVERIFICACIÓN de la auditoría, ranuras (§3.4.5) | `prompts/fase-5-auditoria-pr.md`, `test/prompts.test.ts`, `docs/decisiones.md` | Base verde | `feat(fase 5): auditar desde los recibos y bloquear con pendientes sin comprobar` (cuerpo: `Closes #39` y `Closes #40`) |
| **L09** | Comandos `f3`, `f4` y `f5`, y su copia (§3.6) | `.claude/commands/f3.md`, `.claude/commands/f4.md`, `.claude/commands/f5.md`, `docs/comandos-de-fase.md` | Base verde, incluido el test de sincronía de la Etapa 0 | `feat(comandos): llevar los lotes y los recibos a f3, f4 y f5` |
| **L10** | Los dos README | `README.md`, `README.es.md` | `grep` no encuentra "You always make the commits" ni "Los commits y el PR los haces tú"; ambos README describen lotes, recibos, `force` y la advertencia sobre `global-rules.md` propio | `docs(readme): explicar los lotes, los recibos y la protección de documentos` |
| **L11** | Versión `2.1.0` | `package.json`, `package-lock.json` | Base verde. El tag `v2.1.0` lo crea la autora | `chore(release): 2.1.0` |

> **Estado de ejecución:** de L01 a L11 hechos. Commits y desvíos en §9.7.

**Por qué este orden.** El código primero, porque los prompts de L07 y L08 dependen de que el servidor anuncie la subcarpeta (L02) y proteja los documentos (L03). Las reglas globales (L04) van antes que las fases, porque las fases las citan. Los comandos (L09) y los README (L10) describen lo ya hecho. Si L03 se descarta, el resto sigue en pie.

**README en L10, contenido mínimo:**
- "In phase 5 the AI only reads" / "En la fase 5 la IA solo lee" pasa a: "En la Fase 4 la IA hace el commit de cada lote solo con tu OK; nunca hace push ni abre el PR. En la Fase 5 solo lee."
- El árbol de carpetas muestra `04 - Ejecución/` con `L01 - ….md`.
- La fila `/f4` de la tabla de comandos: "Un recibo por lote; el documento de la fase al cerrar".
- Nueva sección "Documentos protegidos": la regla de congelamiento, `force` y el contexto inicial.
- En "Using your own prompts": advertencia de que un `global-rules.md` propio sustituye al de fábrica y debe incluir `BASE DE CADA DECISIÓN` y `PENDIENTES HEREDADOS`.

### 3.9 Lo que NO se toca en la Etapa 1

La deducción de fase (`estadoDeTarea`) y la compuerta (`avisoDeCompuerta`, `detectarSalto`); el formato de los punteros; `read_central_doc` y `read_cross_repo`; el contrato del PR de la Fase 5 (solo se envuelve en una ranura); la sección "Traducción para quien pidió el ticket" de la Fase 2; la migración a `McpServer` y `dotenv` (Etapa 2); manifiesto, presets y bloques (Etapa 3); `record_batch` (Etapa 4).

### 3.10 Riesgos

| # | Riesgo | Estado | Mitigación |
|---|---|---|---|
| E1-R1 | Quien tenga un `global-rules.md` propio pierde `BASE` y `PENDIENTES` | Aceptado | Advertencia en el README (L10). En la Etapa 2, `doctor` avisa si un override no tiene esos encabezados |
| E1-R2 | Cambio de comportamiento para quien use la 2.x por `npx`: la Fase 4 ahora hace commits | Aceptado | Siempre con OK explícito; ADR y README; versión menor |
| E1-R3 | Con más de un lote, el modelo escribe `04 - Ejecución.md` antes de tiempo y la fase aparece cerrada | Abierto | `PROHIBIDO` y `AUTOVERIFICACIÓN` en la Fase 4. En la Etapa 4 el servidor lo impide |
| E1-R4 | R4 bloquea una corrección legítima no prevista (un typo en `01` con `02` ya escrito) | Aceptado | `force` con confirmación; el mensaje de error lo explica |
| E1-R5 | Prompts más largos: la Fase 4 crece unas 80 líneas | Aceptado | L05 a L08 reportan el tamaño antes y después |
| E1-R6 | Las líneas citadas se desplazan dentro de un lote | Cerrado | Ediciones de abajo hacia arriba (§ "Cómo leer las anclas") |

### 3.11 ADRs de la Etapa 1 (arriba en `docs/decisiones.md`, una por lote)

| Lote | Título de la entrada | Reemplaza o amplía |
|---|---|---|
| L01 | `write_central_doc` solo escribe dentro de carpetas de tarea, y las carpetas con punto no son proyecto ni tarea | Nueva. Prepara el manifiesto de la Etapa 3 (SEG-M) |
| L02 | Ranuras en los prompts base: estructura fija, contenido sustituible | Nueva. Prepara las capas de la Etapa 3 |
| L02 | Los recibos de lote viven en una subcarpeta que declara el prompt | Amplía 2026-08-12 ("el flujo nunca escribe un archivo que no sea el documento de su fase") |
| L03 | Un documento de fase se congela cuando existe el de una fase posterior | Amplía 2026-08-08 ("La Fase 5 deja documento y `start_task` se niega a pisar una tarea") |
| L04 | Base de cada decisión y pendientes heredados viven en las reglas globales; Cero Rupturas se acota por fase | Nueva (#39 y #40). Registra el riesgo E1-R1 |
| L06 | Los lotes son estructurales en la Fase 3 | Reemplaza la sección condicional "Etapas con commits separados" del contrato de la Fase 3 (2026-08-07) |
| L07 | La Fase 4 ejecuta lote por lote y hace el commit de cada uno con el OK del usuario. Incluye la nota de por qué **el commit sí y el push nunca**: el commit es local y reversible y lo verifica el servidor; el push saca el trabajo del equipo, dispara el CI o un despliegue, y debe pasar antes por la auditoría de la Fase 5. Además, el servidor no puede impedir un push desde la terminal del agente, así que la frontera se expresa en el prompt y se refuerza, si se quiere, con permisos del cliente | **Reemplaza** 2026-08-07 "La Fase 4 no sube nada" y matiza 2026-08-07 "La Fase 4 hace; el documento es el recibo" |
| L08 | La Fase 5 audita los commits de los recibos y trata los pendientes sin comprobar como bloqueantes | Amplía 2026-08-08 (Fase 5 con documento) |

La entrada de L04 explica además por qué el `estado` de los recibos no contradice el rechazo de la #39 a un campo `Estado:`: la deducción de fase no lo lee; es informativo en la 2.1.0 y el servidor lo verifica contra Git a partir de la Etapa 4.

### 3.12 Estado de cierre de la Etapa 1

**Cerrada** en la iteración 2. Decisiones de cierre:

| # | Decisión |
|---|---|
| C1 | `BASE DE CADA DECISIÓN` y `PENDIENTES HEREDADOS` viven en `global-rules.md`, con anclajes cortos en cada fase (Paso 0, `PROHIBIDO`, `AUTOVERIFICACIÓN`). En la Etapa 3 se estudia que los overrides de `global-rules.md` operen por ranuras (`global/cero-rupturas`, `global/evidencia`) para que nadie pierda esas secciones por accidente |
| C2 | El contexto inicial pide `force` también para crearlo con `write_central_doc`. Solo `start_task` lo crea sin `force` |
| C3 | Una sola parada por lote, en el corte de commit. El ciclo de 6 pasos de §3.5.2 queda como está |
| C4 | En la `2.1.0`, `commits` es `agente-commitea-con-OK` y la ranura `pruebas` conserva la réplica hasta la Etapa 3 |

Ajustes incorporados en esta iteración:

| # | Ajuste | Dónde |
|---|---|---|
| A1 | La ranura `pruebas` de las Fases 3 y 4 ya no dice "no hay suite": si existe una suite, se corre; si no, no se inventa | §3.2, §3.4.3 (d), §3.4.4 (f) |
| A2 | Una fase posterior congela a las anteriores también cuando solo tiene recibos (`04 - Ejecución/` con algún `.md`); dos filas nuevas en la tabla de verdad | §3.7.3 |
| A3 | El `<slug>` de los recibos se limita a letras, números, espacios y guiones, para no chocar con `validarSegmento` | §3.5.2 |
| A4 | Los ejemplos de frontmatter, la plantilla del recibo y el índice van dentro de bloques ` ```markdown ` | §3.5.1, §3.5.2 |
| A5 | `ubicarEnTarea` rechaza cualquier segmento de `relativo` que empiece por `.` | §3.7.1 |

---

## 4. Etapa 2 — `2.2.0` Protocolo MCP moderno

**Base:** fin de la Etapa 1 (`2.1.0`). **Estado: cerrada** (iteración 3), con los ajustes B1–B3 de §4.13.

**Alcance:** 11 lotes. Variables `PHASE_GATE_*` y retiro de `dotenv`; diagnóstico y `doctor`; migración a `McpServer` con anotaciones y descripciones estáticas; `get_orchestrator_status`; Resources de solo lectura; MCP Prompts `/f1`…`/fN`; Elicitation para `force` y `crear_proyecto`; aviso de pendientes heredados; verificación en los tres clientes; release. No cambia ningún nombre ni parámetro de tool, ni ninguna regla de los prompts.

### 4.1 Comprobado antes de escribir este plan

Contra el SDK instalado (`@modelcontextprotocol/sdk` **1.30.0**) y Node 22.22.0. La Etapa 0 sube el SDK a `1.32.1`: el primer paso de L04 es repetir estas comprobaciones sobre esa versión.

| Verificación | Resultado y qué cambió en el plan |
|---|---|
| Firma de `registerTool` | `registerTool(name, { title?, description?, inputSchema?, outputSchema?, annotations?, _meta? }, cb)` (`dist/esm/server/mcp.d.ts:150`). `inputSchema` acepta un *raw shape* zod v3 o v4 (`ZodRawShapeCompat`, `zod-compat.d.ts:5`): los shapes de la Etapa 0 (L03) entran tal cual. |
| ¿Qué devuelve el SDK cuando la validación falla o el callback lanza? | En los dos casos un resultado con `isError: true`, no un error de protocolo (`mcp.js:135-161`). Cuando falla la validación, el texto lleva el prefijo en inglés `Input validation error: Invalid arguments for tool <x>: …` (`mcp.js:178`). Por eso los tests E2E de las Etapas 0 y 1 comparan **subcadenas** (ajuste asentado en la Etapa 0, L03). |
| Firma de `registerPrompt` | `registerPrompt(name, { title?, description?, argsSchema? }, cb)` (`mcp.d.ts:181`). El callback devuelve `{ description?, messages: [{ role, content }] }` (`GetPromptResultSchema`, `types.js:1148`). Cada `RegisteredPrompt` tiene `remove()` y `update()`, que emiten `prompts/list_changed` solos (`mcp.js:589, 721, 734`). Eso permite registrar `/fN` dinámicamente. |
| Firma de `registerResource` y `ResourceTemplate` | `registerResource(name, uri, metadata, read)` o `registerResource(name, new ResourceTemplate(uriTemplate, { list, complete? }), metadata, read)` (`mcp.d.ts:102-103, 222-246`). `list` es obligatorio aunque sea `undefined`. |
| ¿`UriTemplate.match` decodifica? | **No.** Devuelve los valores con su codificación porcentual (`shared/uriTemplate.js`). El callback tiene que hacer `decodeURIComponent` y **después** `validarSegmento`: un `%2F` decodificado a `/` queda rechazado. |
| Notificaciones `list_changed` | `McpServer` declara `listChanged: true` al registrar tools, prompts o recursos (`mcp.js:62-64, 339-341, 403-405`) y expone `sendToolListChanged()`, `sendPromptListChanged()` y `sendResourceListChanged()`, que solo emiten si hay conexión (`mcp.js:757-776`). |
| Elicitation | `server.elicitInput({ mode?: 'form', message, requestedSchema }, options?)` (`index.d.ts:158`). Lanza `Client does not support form elicitation.` si el cliente no declaró `elicitation.form` (`index.js:351`). Una capacidad `elicitation: {}` vacía se normaliza a `{ form: {} }` (`types.js:335-345`). El resultado es `{ action: 'accept' \| 'decline' \| 'cancel', content? }` (`types.js:1810`). El esquema pedido solo admite propiedades planas: `boolean`, `string`, `number` y `enum` (`types.js:1727-1750`). |
| Tiempo de espera de una petición al cliente | `DEFAULT_REQUEST_TIMEOUT_MSEC = 60000` (`shared/protocol.js:8`). Un minuto es poco para que una persona lea y confirme: las elicitaciones pasan `timeout: 180_000` (tres minutos) y `relatedRequestId`. |
| Capacidades del cliente | `server.getClientCapabilities()` y `server.getClientVersion()` (`index.d.ts:121-125`). `server.listRoots()` existe y se reserva para la Etapa 3. |
| Anotaciones de tools | `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint` y `openWorldHint` (`types.js:1173-1210`). Los valores por defecto del protocolo son pesimistas (`destructiveHint` true y `openWorldHint` true), así que **todas** las tools declaran los cuatro valores explícitamente. |
| `process.loadEnvFile` en Node 22 | Existe; no sobrescribe variables que ya están en el entorno; lanza `ENOENT` si el archivo no existe. **No quita el BOM de UTF-8**: con un `.env` guardado con BOM, la primera clave llega como `\uFEFFORQUESTADOR_DOCS_PATH` y la variable "desaparece". `dotenv` sí lo quita. **Cambio de plan:** no se usa `loadEnvFile`; se lee el archivo, se quita el BOM, se detecta UTF-16 y se parsea con `util.parseEnv` (disponible en Node 22). |
| `util.parseEnv` con rutas de Windows | Conserva las barras invertidas sin comillas, igual que `dotenv`. Acepta comentarios `#` y el prefijo `export`. |

### 4.2 Variables `PHASE_GATE_*` y lectura del `.env` (lote L01)

**`src/config.ts`.** Las variables pasan a tener un nombre lógico y dos nombres de entorno:

| Nombre lógico | Principal | Alias (compatible) |
|---|---|---|
| `DOCS_PATH` | `PHASE_GATE_DOCS_PATH` | `ORQUESTADOR_DOCS_PATH` |
| `REPOS_PATH` | `PHASE_GATE_REPOS_PATH` | `ORQUESTADOR_REPOS_PATH` |
| `TASKS_SUBDIR` | `PHASE_GATE_TASKS_SUBDIR` | `ORQUESTADOR_TASKS_SUBDIR` |
| `PROMPTS_PATH` | `PHASE_GATE_PROMPTS_PATH` | `ORQUESTADOR_PROMPTS_PATH` |
| `STATE_PATH` | `PHASE_GATE_STATE_PATH` | `ORQUESTADOR_STATE_PATH` |
| `ELICITATION` (nueva) | `PHASE_GATE_ELICITATION` | — |

```ts
export type FuenteVariable = "entorno" | ".env" | "sin definir";
export type LecturaVariable = {
  logica: NombreLogico;
  valor: string | undefined;        // ya recortado
  usada: string | null;             // nombre de entorno que ganó
  fuente: FuenteVariable;
  discrepancia: string | null;      // texto del aviso si las dos existen y difieren
};
export function leerVariable(logica: NombreLogico): LecturaVariable
```

Reglas:
- Gana `PHASE_GATE_*`. Si las dos están definidas y difieren (las rutas se comparan tras `path.resolve`), `discrepancia` dice cuál ganó y cuál se ignoró. `doctor` lo muestra y el servidor lo escribe una vez en el log al arrancar.
- `requireBasePath`, `tasksSubdir`, `promptsLayers` y `stateDir` usan `leerVariable`. Los mensajes de error nombran las dos: "Falta `PHASE_GATE_DOCS_PATH` (o su alias `ORQUESTADOR_DOCS_PATH`)…". Los tests de la Etapa 0 siguen pasando porque comprueban subcadenas.
- `stateDir` gana el `trim` y el `path.resolve` que hoy le faltan (`config.ts:122`).
- `RutaRequerida` cambia `variable` por `logica`.

**Lectura del `.env`** (sustituye a `dotenv`, `config.ts:12, 20`):

```ts
// Claves que vinieron del .env; las demás, del entorno. doctor usa esto para decir la fuente.
export function clavesDeEnv(): ReadonlySet<string>
// Error guardado de la última carga (por ejemplo, UTF-16), o null.
export function errorDeEnv(): string | null
// Carga el .env. Sin argumento, el de la raíz del paquete. Se llama una vez al importar config.ts.
export function cargarEnv(archivo?: string): void
// Solo para tests: borra del entorno las claves que vinieron del .env, vacía clavesDeEnv()
// y el error guardado. limpiarEntorno() de test/helpers.ts la llama.
export function reiniciarEnv(): void
```

1. Si `<raíz del paquete>/.env` no existe, no hace nada.
2. Lee el archivo como `Buffer`. Si empieza con `FF FE` o `FE FF`, o si sus primeros 512 bytes contienen `00`, **no lo carga** y deja un error guardado que `requireBasePath` y `doctor` muestran: "El `.env` está en UTF-16. Guárdalo como UTF-8 (sin BOM)". Es el caso que ya mordió una vez y hoy solo se adivina.
3. Lo decodifica como UTF-8 y quita un BOM inicial (`\uFEFF`).
4. Lo parsea con `util.parseEnv(texto)` y asigna solo las claves que **no** estén ya en `process.env`. Así el bloque `env` del cliente sigue ganando, igual que con `dotenv`.
5. Las claves asignadas van a `CLAVES_DE_DOTENV`.

`package.json` pierde `dotenv`. El SDK queda como única dependencia de runtime, junto con `zod`, que es su *peer dependency*. `.env.example` pasa a `PHASE_GATE_*` y menciona el alias.

**`test/config.test.ts`** gana: precedencia, discrepancia, fuente `.env` frente a entorno, BOM UTF-8 aceptado, UTF-16 rechazado con mensaje y `export X=1`. Cada test llama a `cargarEnv(<archivo temporal>)`. **`test/helpers.ts`**: `limpiarEntorno()` borra también las `PHASE_GATE_*` y llama a `reiniciarEnv()`, para que un `.env` cargado en un test (o su error de UTF-16) no contamine al siguiente.

### 4.3 Diagnóstico, `doctor` y `get_orchestrator_status` (lotes L02, L03 y L05)

#### 4.3.1 El módulo de datos (L02)

**`src/diagnostico.ts` (nuevo).** Solo lee: no escribe nada ni lanza por configuración incompleta. Una sola fuente para el CLI, la tool y el recurso `phase-gate://estado`.

```ts
export type Severidad = "error" | "aviso" | "info";
export type Hallazgo = { severidad: Severidad; codigo: string; texto: string };

export type Diagnostico = {
  paquete: { version: string; ruta: string; via: "npx" | "global" | "dependencia" | "clon" };
  node: { version: string; plataforma: NodeJS.Platform };
  variables: LecturaVariable[];
  rutas: { docs: EstadoRuta; repos: EstadoRuta };          // EstadoRuta = { ruta?, existe, error? }
  estado: { archivo: string; existe: boolean; punteros: number };
  capas: { ruta: string; etiqueta: "fábrica" | "propia"; existe: boolean }[];
  reglasGlobales: { archivo: string | null; capa: string | null; faltan: string[] };
  fases: { numero: number; titulo: string; archivo: string; capa: string;
           documento?: string; recibos?: string; comando: string | null }[];
  proyectos: { nombre: string; tareas: number;
               activa: { tarea: string; origen: "puntero" | "deducida"; fase: string } | null }[];
  cliente?: { nombre: string; version: string;
              capacidades: { elicitation: boolean; roots: boolean } };   // solo desde la tool
  hallazgos: Hallazgo[];
};
export function diagnosticar(opciones?: { cliente?: Diagnostico["cliente"] }): Diagnostico
export function formatearDiagnostico(d: Diagnostico, formato: "texto" | "markdown"): string
```

**Cómo se deduce `via`**, solo como información, nunca como decisión:
- La ruta contiene `/_npx/` o `\_npx\`: `npx`.
- Está bajo `npm root -g` (se obtiene de `process.env.npm_config_prefix` si existe; si no, se omite): `global`.
- Junto al paquete hay una carpeta `.git`: `clon`.
- Si no: `dependencia`.

**Hallazgos y sus códigos:**

| Código | Severidad | Se emite si… |
|---|---|---|
| `VAR-FALTA` | error | falta `DOCS_PATH` o `REPOS_PATH`, o apunta a algo que no existe o no es carpeta |
| `VAR-DISCREPA` | aviso | `PHASE_GATE_X` y `ORQUESTADOR_X` difieren |
| `ENV-UTF16` | error | el `.env` está en UTF-16 |
| `GLOBAL-SIN-BASE` | aviso | **(E1-R1)** el `global-rules.md` que gana no es el de fábrica y le falta `## BASE DE CADA DECISIÓN` o `## PENDIENTES HEREDADOS` |
| `FASE-SIN-DOC` | aviso | una fase no declara `documento`: no se puede deducir su avance |
| `FASE-SIN-COMANDO` | info | una fase no tiene `comandos/fN.md` en ninguna capa: su prompt `/fN` usa el texto genérico |
| `CAPA-NO-EXISTE` | aviso | `PROMPTS_PATH` está definida pero la carpeta no existe |
| `PUNTERO-HUERFANO` | info | un puntero apunta a una tarea o proyecto que ya no existe |

#### 4.3.2 El CLI (L03)

**`src/cli.ts` (nuevo)** con `node:util.parseArgs`. `src/index.ts` queda como `bin`: shebang y despacho.

| Invocación | Hace | Código de salida |
|---|---|---|
| `mcp-phase-gate` sin argumentos | Arranca el servidor MCP por stdio, como hoy. Si `process.stdin.isTTY`, escribe una sola línea en stderr: "Esperando un cliente MCP por stdin. Si querías revisar la instalación: `npx mcp-phase-gate doctor`." | — |
| `mcp-phase-gate doctor` | Imprime el diagnóstico en texto | `1` si hay algún `error`; `0` si no |
| `mcp-phase-gate doctor --json` | Imprime el `Diagnostico` como JSON | igual |
| `--help` / `-h` | Ayuda actualizada, con `doctor` y `PHASE_GATE_*` | `0` |
| `--version` / `-v` | La versión | `0` |
| Cualquier otro | Ayuda en stderr | `2` |

`init` y `eject` llegan en la Etapa 3.

**Formato exacto de `doctor` en texto:**

```text
mcp-phase-gate 2.2.0 · vía npx
Paquete      ~/.npm/_npx/3f1a…/node_modules/mcp-phase-gate
Node         v22.22.0 · win32

Variables
  DOCS_PATH     ✓ C:\Users\Ana\…\DOCUMENTACIÓN       PHASE_GATE_DOCS_PATH · entorno
  REPOS_PATH    ✓ D:\repos                            ORQUESTADOR_REPOS_PATH · .env
  TASKS_SUBDIR  · Proyectos                           (por defecto)
  PROMPTS_PATH  · sin definir
  STATE_PATH    · sin definir → %APPDATA%\mcp-phase-gate

Estado         %APPDATA%\mcp-phase-gate\active-tasks.json · 3 punteros

Prompts (de menor a mayor prioridad)
  fábrica      …\mcp-phase-gate\prompts
  propia       C:\Users\Ana\mis-prompts
  reglas globales  ← propia  (le faltan: PENDIENTES HEREDADOS)
  Fase 1 Descubrimiento   ← fábrica  · 01 - Análisis Técnico.md · /f1
  Fase 2 Decisiones       ← propia   · 02 - Decisiones.md      · /f2
  …
  Fase 4 Ejecución        ← fábrica  · 04 - Ejecución.md + 04 - Ejecución/ · /f4

Proyectos
  PROYECTO-A   4 tareas · activa: login-sso (puntero) · va en Fase 4 (Ejecución); hechas: 1, 2, 3
  PROYECTO-B   0 tareas

Hallazgos
  aviso  GLOBAL-SIN-BASE  Tu global-rules.md sustituye al de fábrica y no tiene
                          "## PENDIENTES HEREDADOS". Cópialo desde el de fábrica.
  aviso  VAR-DISCREPA     ORQUESTADOR_DOCS_PATH difiere de PHASE_GATE_DOCS_PATH; se usa PHASE_GATE_DOCS_PATH.
```

En formato `markdown` (para la tool y el recurso), las mismas secciones van como encabezados `###` y tablas.

#### 4.3.3 La tool `get_orchestrator_status` (L05)

- `inputSchema`: `{}`. `outputSchema`: el shape zod de `Diagnostico`, para que el cliente reciba `structuredContent`.
- Devuelve `content` con el Markdown y `structuredContent` con el objeto. Llama a `diagnosticar({ cliente })` con `getClientVersion()` y `getClientCapabilities()`.
- Descripción: "Radiografía de la instalación: versión y ruta del paquete, variables y de dónde salió cada una, qué archivo de prompt gana en cada fase, proyectos y tarea activa, y avisos. Úsala cuando algo no se comporte como esperas."

### 4.4 Migración a `McpServer` (lote L04)

**Estructura nueva:**
- `src/servidor.ts` (nuevo) exporta `crearServidor(): McpServer`. Registra tools, prompts y recursos. No conecta ningún transporte, así que se puede probar con `InMemoryTransport`.
- `src/index.ts`: shebang, `cli.ts` y, si toca, `crearServidor().connect(new StdioServerTransport())`.
- Desaparece el `switch` de `CallToolRequestSchema`; cada tool es un `registerTool` con su shape de `src/schemas.ts` y un callback que lanza `Error` con mensajes en español. El SDK los convierte en `isError`.
- `catch (error: any)` desaparece.
- El log pasa del prefijo `[orquestador]` a `[mcp-phase-gate]`. Se declara la capacidad `logging` y la función `log(nivel, texto)` escribe en stderr y, si hay conexión, envía `notifications/message`.

**Tools y anotaciones** (`openWorldHint: false` en todas, porque ninguna sale de las carpetas configuradas):

| Tool | `title` | `readOnlyHint` | `destructiveHint` | `idempotentHint` |
|---|---|---|---|---|
| `start_task` | Iniciar tarea | false | false | false |
| `get_phase_prompt` | Prompt de fase | true | false | true |
| `get_active_task` | Tarea activa | true | false | true |
| `list_tasks` | Listar tareas | true | false | true |
| `switch_task` | Cambiar de tarea activa | false | false | true |
| `read_central_doc` | Leer documento | true | false | true |
| `write_central_doc` | Escribir documento | false | **true** | true |
| `read_cross_repo` | Leer archivo de repositorio | true | false | true |
| `get_orchestrator_status` (nueva) | Estado de la instalación | true | false | true |

`start_task` no es destructiva (se niega a pisar una tarea) ni idempotente (la segunda llamada falla). `switch_task` escribe el puntero, así que no es de solo lectura, pero repetirla da el mismo estado.

**Fin de la caché estática.** `PHASES_DESCRIPTION` y `PROJECTS_DESCRIPTION` (`src/index.ts:60-61` @d7594ea) desaparecen. Las descripciones pasan a ser **estáticas** y la parte que cambia se mueve a sitios que sí notifican:

| Parámetro | Descripción nueva |
|---|---|
| `project` | "Proyecto: el nombre de una carpeta de proyecto de la Documentación Central. Si no existe, la tool te devuelve los que hay. También los lista el recurso `phase-gate://estado`." |
| `phase` | "Número de fase. Con los prompts de fábrica son 1 a 5; el recurso `phase-gate://fases` lista las disponibles con su título y documento." |

Con descripciones estáticas, la lista de tools no cambia nunca y **no se emite `tools/list_changed`**. Sí se emite:

| Notificación | Cuándo |
|---|---|
| `resources/list_changed` | `start_task` con éxito; `switch_task` (cambia qué documentos se listan); `write_central_doc` que crea un archivo nuevo |
| `prompts/list_changed` | cuando `sincronizarPrompts()` añade o quita un `/fN` (§4.6) |

**Verificación propia del lote:** los tests E2E de las Etapas 0 y 1 pasan sin cambios. Se añade `test/servidor.test.ts` con `InMemoryTransport`: `tools/list` devuelve las 8 tools de siempre con sus anotaciones, y ninguna descripción contiene nombres de proyecto.

### 4.5 MCP Resources de solo lectura (lote L06)

**`src/recursos.ts` (nuevo).**

| Nombre | URI o plantilla | Contenido | `mimeType` |
|---|---|---|---|
| `estado` | `phase-gate://estado` | `formatearDiagnostico(diagnosticar(), "markdown")` | `text/markdown` |
| `fases` | `phase-gate://fases` | Tabla: número, título, documento, recibos, archivo y capa que gana | `text/markdown` |
| `documento` | `phase-gate://tareas/{proyecto}/{tarea}/{documento}` | Un archivo de la carpeta de la tarea | `text/markdown` |
| `recibo` | `phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo}` | Un recibo de lote de la subcarpeta declarada por la Fase 4 | `text/markdown` |

Las variables van codificadas: `phase-gate://tareas/PROYECTO-A/Tokens%20login/02%20-%20Decisiones.md`.

**Lectura** (las dos plantillas):
1. `decodeURIComponent` de cada variable. Si falla, error "URI mal codificada".
2. `validarSegmento` de `proyecto`, `tarea`, `documento` y `recibo`. Un `%2F` decodificado a `/` se rechaza aquí.
3. `requireProjectFolder(proyecto)`, luego `taskFolderPath`; para `recibo`, `<tarea>/<recibos de la Fase 4>/<recibo>`.
4. `estaDentroReal(carpetaTarea, ruta)` y `leerTextoAcotado(ruta)` (Etapa 0, L01 y L02).
5. Ni `documento` ni `recibo` pueden empezar por `.`.

**Listado.** Solo los documentos **existentes** de la **tarea activa de cada proyecto**: el contexto inicial, los documentos de fase y los recibos. El resto se alcanza por plantilla. Listar todas las tareas de todos los proyectos inundaría el selector de `@` del cliente.

**Autocompletado** (`complete`):
- `proyecto`: los nombres de `discoverProjects()`.
- `tarea`: las tareas de `listarTareas(proyecto)`, usando `context.arguments.proyecto`.
- `documento`: los archivos `.md` de esa tarea.

**Anotaciones del recurso:** `audience: ["assistant", "user"]` y `lastModified` con la fecha del archivo.

### 4.6 MCP Prompts `/f1`…`/fN` (lote L07)

**Una sola fuente para los comandos.** El texto de cada comando pasa a `prompts/comandos/fN.md`, que ya viaja en el paquete porque `files` incluye `prompts`. Se resuelve por capas igual que las fases: la capa de mayor prioridad que tenga `comandos/fN.md` gana.

- `.claude/commands/fN.md` sigue existiendo para quien trabaja en este repo y para los clientes que no muestran bien los MCP Prompts. Su contenido es **idéntico** a `prompts/comandos/fN.md`, y `test/docs.test.ts` pasa a comparar contra esa fuente.
- `docs/comandos-de-fase.md` deja de copiar los cinco bloques: explica qué son los comandos, cómo se invocan en cada cliente y enlaza a `prompts/comandos/`. Queda una copia mantenida a mano en lugar de dos.

**Registro dinámico.** `sincronizarPrompts(mcp)` compara `discoverPhases()` con los prompts registrados:
- Fase nueva: `registerPrompt("fN", …)`. Fase que desaparece: `remove()`. Título o comando que cambia: `update()`. Cada una de esas llamadas emite `prompts/list_changed` sola.
- **Cuándo se llama:** al arrancar; al terminar cada llamada a una tool (leer las carpetas de prompts cuesta milisegundos); y con `fs.watch` sobre cada capa, con 300 ms de *debounce*, como mejora oportunista. En OneDrive, `fs.watch` no es fiable, y por eso la sincronización tras cada tool es la que garantiza el resultado.

**Definición de cada prompt:**

| Prompt | `title` | Argumentos (todos `z.string().optional()`) |
|---|---|---|
| `f1` | `Fase 1 · <título>` | `project`, `task_name`, `contexto` |
| `f2`…`f4` | `Fase N · <título>` | `project` |
| `f5` | `Fase 5 · <título>` | `project`, `commits` |
| `fN` (otras) | `Fase N · <título>` | `project` |

Descripción: `Arranca la Fase N (<título>) del flujo de mcp-phase-gate.`

Todos los argumentos son **opcionales**. El texto de cada comando ya pide lo que falte, y así el prompt sirve en clientes que parten los argumentos por espacios: un `contexto` largo puede ir pegado después del comando. Esto se confirma en L10.

**Mensaje que devuelve `prompts/get`.** Un solo mensaje `{ role: "user", content: { type: "text", text } }`, donde `text` es:

```md
<cuerpo de prompts/comandos/fN.md, sin frontmatter>

## Datos de esta invocación
- project: <valor>
- task_name: <valor>
- commits: <valor>
- initial_context:

<contexto>
```

Solo aparecen las líneas de los argumentos que vinieron. Si no vino ninguno, la sección se omite.

**Texto genérico** para una fase sin `comandos/fN.md` (por ejemplo, una `fase-6` propia):

```md
Vas a iniciar la FASE N (<título>) del flujo del mcp-phase-gate.

Pasos:
1. Si no sabes cuál es la tarea activa, llama a `get_active_task` (o pídeme project + task_name).
2. Llama a `get_phase_prompt(N)` indicándole también el `project` en el que estoy trabajando, y asume ese rol.
3. Lee los documentos de las fases anteriores con `read_central_doc`; `get_phase_prompt` te dio sus nombres exactos.
4. Sigue el prompt de la fase y guarda su documento con `write_central_doc`, con el nombre que te indicó `get_phase_prompt`.
```

**Cómo se ve en cada cliente:** no se fija en el texto; lo decide la matriz de L10 (validación V11). Lo que dice hoy la documentación: Claude Code los muestra como `/<clave>:<prompt> (MCP)` y acepta `/mcp__<clave>__<prompt>` como alias; la de VS Code se contradice entre `/<clave>.<prompt>` y `mcp.<clave>.<prompt>`; Cursor, en su menú de prompts MCP. **Clave del servidor:** si ya está registrado (por ejemplo, como `mcp-phase-gate`), se conserva esa clave: cambiarla cambia los nombres de tools y prompts y rompe los permisos ya concedidos. La clave corta `pg` solo se sugiere para registros nuevos.

**Por qué el prompt no incluye el prompt de la fase.** Se descartó que `/f4` devolviera ya el texto de `get_phase_prompt(4)`. Habría ahorrado una llamada, pero crearía dos caminos para recibir el mismo prompt y para comprobar la compuerta, y en uno de ellos la compuerta no recibiría el `project`. El comando sigue siendo orquestación, como decidió la ADR del 2026-08-08.

### 4.7 Elicitation para `force` y `crear_proyecto` (lote L08)

**`src/confirmacion.ts` (nuevo).**

```ts
export type Confirmacion = "confirmada" | "rechazada" | "no-disponible";

export async function pedirConfirmacion(
  mcp: McpServer,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  pregunta: { mensaje: string; etiqueta: string }
): Promise<Confirmacion>
```

1. Si `PHASE_GATE_ELICITATION` vale `off`, devuelve `"no-disponible"`. Es la escotilla para un cliente cuya implementación falle.
2. Si `mcp.server.getClientCapabilities()?.elicitation?.form` no existe, devuelve `"no-disponible"`.
3. Llama a:

```ts
mcp.server.elicitInput(
  {
    mode: "form",
    message: pregunta.mensaje,
    requestedSchema: {
      type: "object",
      properties: {
        confirmar: { type: "boolean", title: pregunta.etiqueta,
                     description: "Marca la casilla y acepta para confirmar.", default: false },
      },
      required: ["confirmar"],
    },
  },
  { timeout: 180_000, relatedRequestId: extra.requestId }
)
```

4. Clasificación del resultado:

| Qué pasó | Devuelve | Por qué |
|---|---|---|
| `accept` con `confirmar: true` | `"confirmada"` | La persona confirmó |
| `accept` con `confirmar: false`, `decline` o `cancel` | `"rechazada"` | La persona dijo que no, o cerró sin elegir |
| Vence el tiempo de espera (`McpError` con código `RequestTimeout`, -32001), **la primera vez** en la sesión | `"rechazada"` | Nadie confirmó. La respuesta añade: "Si tu cliente no te mostró la confirmación, regístralo con `PHASE_GATE_ELICITATION=off`" |
| Vence el tiempo de espera **por segunda vez seguida** en la misma sesión | `"no-disponible"`, recordado para el resto de la sesión | Lo más probable es que el cliente anuncie la capacidad pero no muestre el formulario (validación V4: un bug abierto de Cursor en Windows). Se registra en el log y se avisa de que, a partir de ahí, la confirmación vuelve a ser `force` |
| `McpError` con código `MethodNotFound` (-32601), o un error cuyo mensaje contiene `does not support` | `"no-disponible"` | El cliente anunció elicitation pero no la implementa. Se registra en el log y se recuerda **para el resto de la sesión**, para no volver a intentarlo en cada escritura |
| Cualquier otro error | `"rechazada"` | Ante lo desconocido, se falla cerrado y se registra en el log. La persona puede repetir la operación |

Con `"rechazada"`, la operación se aborta **sin mirar `force`**. Con `"no-disponible"`, se cae al comportamiento de la Etapa 1, donde `force: true` decide.

**`write_central_doc`**, cuando `motivoDeProteccion` devuelve un motivo:

| Cliente | `force` | Resultado |
|---|---|---|
| Soporta elicitation | da igual | Se pregunta **siempre** a la persona. Confirmada: se escribe y la respuesta dice "reescrito con confirmación del usuario". Rechazada: error "El usuario no confirmó la reescritura de `<archivo>`. No se escribió nada." |
| No la soporta | `true` | Comportamiento de la Etapa 1: se escribe "con force" |
| No la soporta | ausente | Comportamiento de la Etapa 1: error que pide confirmación explícita y `force: true` |

Mensaje de la pregunta: `` `<archivo>` de la tarea «<tarea>» está protegido: <motivo>. ¿Reescribirlo? ``. Etiqueta: `Reescribir <archivo>`.

Con elicitation disponible, `force` ya no basta: lo pone el modelo, y justo eso es lo que se quiere evitar. La descripción del parámetro pasa a: "Solo se usa si tu cliente no puede pedirle la confirmación al usuario directamente. Nunca lo pongas sin que el usuario lo haya confirmado en el chat."

**`start_task`**, cuando el proyecto no existe y llega `crear_proyecto: true`:

| Cliente | Resultado |
|---|---|
| Soporta elicitation | Pregunta: `` ¿Estrenar el proyecto «<NOMBRE>»? Se creará la carpeta `<ruta>`. ``. Etiqueta: `Crear el proyecto <NOMBRE>`. Confirmada: crea. Rechazada: error "El usuario no confirmó el proyecto nuevo. No se creó nada." |
| No la soporta | Comportamiento de hoy: basta la bandera |

Sin `crear_proyecto`, no se pregunta nada: se devuelve la lista, como hoy. Ofrecer "¿lo creo?" ante un nombre desconocido invitaría a aceptar un typo con un clic.

**Tests.** En `test/servidor.test.ts`, un cliente `InMemoryTransport` con y sin capacidad `elicitation` cubre: aceptar, aceptar con `confirmar: false`, rechazar, cancelar, tiempo de espera vencido una vez (rechazada) y dos veces seguidas (no disponible para la sesión), con un timeout corto inyectado en el test, un cliente que anuncia la capacidad y responde `MethodNotFound` (cae a `force` y no vuelve a preguntar en la sesión), `force` ignorado con elicitation, `force` respetado sin ella, y `PHASE_GATE_ELICITATION=off`.

### 4.8 Pendientes heredados en `get_phase_prompt` (lote L09)

Refuerzo opcional del servidor para la #39. Lee encabezados y frontmatter; **no** guarda estado ni cambia la deducción de fase.

```ts
export function avisoDePendientes(
  fasePedida: number, estado: EstadoTarea, phases: Map<number, PhaseFile>
): string | null
```

- **Fase anterior:** la de mayor número menor que `fasePedida` con documento existente. Si ese documento (leído con `leerTextoAcotado`) tiene una línea exacta `## Validaciones pendientes` **y la sección no está vacía**, el aviso la nombra. La sección es el texto entre ese encabezado y el siguiente `## ` (o el final del archivo). Cuenta como vacía si, tras recortar espacios, quitar un punto final y pasar a minúsculas, no queda nada o queda solo `ninguna`, `nada`, `sin pendientes` o `fase cerrada sin pendientes`. Así un encabezado escrito por costumbre, en cualquier fase, no dispara un falso positivo.
- **Fase 5:** además, recorre el frontmatter de los recibos de la Fase 4 y lista los que tienen `estado` `con pendientes`, `fallido` o `descartado`.
- El aviso va justo después del de la compuerta, si lo hay:

```md
## PENDIENTES HEREDADOS (detectados por el servidor)

- `03 - Plan Técnico.md` tiene una sección `## Validaciones pendientes`.
- `04 - Ejecución/L03 - filtro por categoría.md`: estado `con pendientes`.

Nómbraselos al usuario antes de empezar (ver PENDIENTES HEREDADOS en las reglas globales).
```

- La tarea se resuelve igual que en la compuerta (`avisoDeCompuerta`): con `project`, con `task_name` o con el único puntero. Si no se puede resolver, no hay aviso.

**Por qué no contradice la #39.** La issue rechazó que la *compuerta* dependiera de un `Estado:` escrito por el modelo. Este aviso no bloquea ni cambia la fase: solo señala un encabezado que el prompt ya obliga a escribir. Si el modelo no lo escribió, el aviso no sale y todo sigue como en la Etapa 1.

### 4.9 Lotes de la Etapa 2

| Lote | Objetivo | Archivos | Verificación | Commit propuesto |
|---|---|---|---|---|
| **L01** | Variables `PHASE_GATE_*` con alias y lector propio del `.env`; fuera `dotenv` | `src/config.ts`, `package.json`, `package-lock.json`, `.env.example`, `test/config.test.ts`, `test/helpers.ts`, `docs/decisiones.md` | Base verde. Tests de precedencia, discrepancia, BOM UTF-8 y UTF-16. `npm ls dotenv` vacío | `feat(config): leer PHASE_GATE_* con ORQUESTADOR_* como alias y retirar dotenv` |
| **L02** | Diagnóstico como módulo de datos | `src/diagnostico.ts` (nuevo), `test/diagnostico.test.ts` (nuevo) | Base verde. Cada código de hallazgo de §4.3.1 tiene su test, incluido `GLOBAL-SIN-BASE` | `feat(diagnostico): reunir el estado de la instalación en un solo módulo` |
| **L03** | CLI `doctor` | `src/cli.ts` (nuevo), `src/index.ts`, `test/cli.test.ts` (nuevo) | `node build/index.js doctor` sale con `0` en una instalación correcta y con `1` sin `DOCS_PATH`; `--json` produce JSON válido; un subcomando desconocido sale con `2` | `feat(cli): npx mcp-phase-gate doctor` |
| **L04** | Migración a `McpServer`: anotaciones, descripciones estáticas, log | `src/servidor.ts` (nuevo), `src/index.ts`, `src/schemas.ts`, `test/servidor.test.ts` (nuevo), `docs/decisiones.md` | Repetir §4.1 sobre el SDK 1.32.1. **Los E2E de las Etapas 0 y 1 pasan sin cambios.** `tools/list` devuelve las 8 tools con anotaciones y sin nombres de proyecto en las descripciones | `refactor(servidor): migrar las tools a McpServer con anotaciones y descripciones estáticas` |
| **L05** | Tool `get_orchestrator_status` | `src/servidor.ts`, `test/servidor.test.ts` | `structuredContent` valida contra `outputSchema`; el Markdown contiene las secciones de §4.3.2 | `feat(tools): get_orchestrator_status con la radiografía de la instalación` |
| **L06** | Resources de solo lectura | `src/recursos.ts` (nuevo), `src/servidor.ts`, `test/recursos.test.ts` (nuevo), `docs/decisiones.md` | Lista solo la tarea activa; lee un documento y un recibo; rechaza `%2E%2E`, `%2F`, archivos con punto inicial y archivos de más de 1 MB; `start_task` emite `resources/list_changed` | `feat(recursos): exponer los documentos de las tareas como recursos de solo lectura` |
| **L07** | MCP Prompts `/f1`…`/fN` y fuente única de comandos | `prompts/comandos/f1.md`…`f5.md` (nuevos), `src/prompts-mcp.ts` (nuevo), `src/servidor.ts`, `.claude/commands/*.md`, `docs/comandos-de-fase.md`, `test/docs.test.ts`, `test/servidor.test.ts`, `docs/decisiones.md` | `prompts/list` devuelve `f1`…`f5`; una `fase-6` en una capa propia aparece y emite `prompts/list_changed`; `prompts/get` de `f1` con argumentos incluye "Datos de esta invocación"; el test de sincronía compara `.claude/commands/` con `prompts/comandos/` | `feat(prompts): servir /f1–/f5 como MCP Prompts desde una sola fuente` |
| **L08** | Elicitation para `force` y `crear_proyecto` | `src/confirmacion.ts` (nuevo), `src/servidor.ts`, `src/schemas.ts`, `test/servidor.test.ts`, `docs/decisiones.md` | Los 10 casos de §4.7 | `feat(confirmacion): pedir directamente al usuario la confirmación de reescrituras y proyectos nuevos` |
| **L09** | Aviso de pendientes heredados | `src/tasks.ts`, `src/servidor.ts`, `test/tasks.test.ts`, `docs/decisiones.md` | Aparece con `## Validaciones pendientes` con contenido y con recibos `con pendientes`. **No** aparece sin ellos, ni con la sección vacía o que solo diga "Ninguna.", "Nada.", "Sin pendientes." o "Fase cerrada sin pendientes." | `feat(compuerta): avisar de los pendientes que dejó la fase anterior` |
| **L10** | Verificación en los tres clientes y README | `README.md`, `README.es.md` | Matriz manual, de abajo, rellenada con lo observado | `docs(clientes): documentar prompts, recursos y confirmaciones en cada cliente` |
| **L11** | Versión `2.2.0` | `package.json`, `package-lock.json` | Base verde. El tag `v2.2.0` lo pone la autora | `chore(release): 2.2.0` |

> **Estado de ejecución:** de L01 a L11 hechos; la matriz de clientes de L10 queda por rellenar con lo observado. Commits y desvíos en §9.8.

**Por qué este orden.** La configuración primero, porque el diagnóstico la necesita; el diagnóstico antes que el CLI y la tool que lo muestran. La migración (L04) va antes que todo lo que solo existe en `McpServer` (`outputSchema`, recursos, prompts, elicitation), y se hace sin cambiar comportamiento, así que la red E2E la valida sola. La elicitation va después de los prompts porque es el cambio de comportamiento más sensible.

**Matriz de L10** (se rellena en un equipo con los tres clientes instalados y se copia al README):

| Cliente | `/f1`…`/f5` visibles | Argumentos con espacios | `@` recursos | Elicitation | Notas |
|---|---|---|---|---|---|
| Claude Code | | | | | |
| Cursor | | | | | |
| VS Code | | | | | |

Si un cliente no muestra cómodamente los prompts, el README le indica usar `.claude/commands/` (o copiarlos a `~/.cursor/commands/`). La inyección automática la hará `init` en la Etapa 3 (R5).

**README en L10:**
- Variables con `PHASE_GATE_*` en todos los ejemplos, con una nota sobre el alias.
- Nueva sección "Revisar la instalación: `doctor`".
- Los comandos como MCP Prompts, con la tabla de cómo se ven en cada cliente.
- Recursos `phase-gate://`.
- Confirmaciones directas al usuario y la variable `PHASE_GATE_ELICITATION`.
- La clave `pg` sugerida solo para registros nuevos; quien ya lo tenga registrado conserva su clave.
- En Cursor para Windows, `PHASE_GATE_ELICITATION=off` mientras siga abierto el bug del formulario.

### 4.10 Lo que NO se toca en la Etapa 2

Los nombres, parámetros y semántica de las 8 tools existentes; los prompts de fase y las reglas globales; la deducción de fase y la compuerta (solo se les suma el aviso de L09); el formato de los punteros; Roots, manifiesto, presets, `init` y `eject` (Etapa 3); `record_batch` (Etapa 4).

### 4.11 Riesgos

| # | Riesgo | Estado | Mitigación |
|---|---|---|---|
| E2-R1 | El SDK cambia el texto de los errores de validación (prefijo en inglés) | Cerrado | Los tests comparan subcadenas desde la Etapa 0 |
| E2-R2 | Los clientes difieren en prompts, recursos y elicitation | Abierto | Matriz de L10; fallback a `.claude/commands/`; elicitation con caída limpia a la Etapa 1 |
| E2-R3 | Una elicitation queda esperando y bloquea la llamada (en Cursor para Windows hay un bug abierto en el que el formulario no aparece) | Aceptado | `timeout: 180_000`; al vencer, no se escribe nada; dos vencimientos seguidos desactivan la elicitation para la sesión; `PHASE_GATE_ELICITATION=off` recomendado en Cursor mientras el bug siga abierto (README e `init`) |
| E2-R4 | El `.env` con BOM o en UTF-16 deja variables "desaparecidas" | Cerrado | Lector propio (§4.2), comprobado en §4.1 |
| E2-R5 | Cambios entre SDK 1.30.0 (donde se verificó) y 1.32.1 | Abierto | Primer paso de L04: repetir §4.1 |
| E2-R6 | `fs.watch` no avisa en OneDrive | Aceptado | La sincronización tras cada tool garantiza el resultado; `fs.watch` es oportunista |
| E2-R7 | La deducción de `via` se equivoca | Aceptado | Es informativa; nunca decide nada |
| E2-R8 | Dos copias de los comandos (`prompts/comandos/` y `.claude/commands/`) | Aceptado | Test de sincronía; `init` las genera en la Etapa 3 |

### 4.12 ADRs de la Etapa 2

| Lote | Título de la entrada | Reemplaza o amplía |
|---|---|---|
| L01 | Las variables se llaman `PHASE_GATE_*` y `ORQUESTADOR_*` queda como alias | **Reemplaza** el punto "Qué NO se renombró" de 2026-08-10 "Un solo nombre" |
| L01 | El `.env` se lee con un lector propio sobre `util.parseEnv`, sin `dotenv` | Nueva. Registra el hallazgo del BOM y el UTF-16 |
| L04 | Las tools se registran en `McpServer`; sus descripciones son estáticas y la parte que cambia vive en Resources y Prompts | Reemplaza el comentario de la caché estática (`src/index.ts:57-59` @d7594ea) |
| L06 | Los documentos de las tareas se exponen como recursos de solo lectura | Nueva |
| L07 | Los comandos de fase se sirven como MCP Prompts desde `prompts/comandos/` | Resuelve "Lo que esta decisión no resuelve" de 2026-08-07 (configuración por dispositivo) y amplía 2026-08-08 (comandos versionados en `.claude/commands/`) |
| L08 | Las confirmaciones de `force` y `crear_proyecto` se piden al usuario por elicitation cuando el cliente puede | Amplía 2026-08-08 (`crear_proyecto`) y la ADR de R4 de la Etapa 1 |
| L09 | El servidor avisa de los pendientes heredados leyendo encabezados, sin guardar estado | Amplía la ADR de la #39 (Etapa 1) |

### 4.13 Estado de cierre de la Etapa 2

**Cerrada** en la iteración 3. Decisiones de cierre:

| # | Decisión |
|---|---|
| D1 | Con elicitation disponible, se pregunta siempre a la persona y `force` se ignora |
| D2 | Todos los argumentos de `/f1`…`/fN` son opcionales (`z.string().optional()`) |
| D3 | `resources/list` incluye `phase-gate://estado`, `phase-gate://fases` y los documentos existentes de la tarea activa de cada proyecto; el resto se alcanza por plantilla y autocompletado |
| D4 | El aviso de pendientes heredados (L09) entra en la Etapa 2 |

Ajustes incorporados en esta iteración:

| # | Ajuste | Dónde |
|---|---|---|
| B1 | El índice de cierre de la Fase 4 lleva la línea `Estado` y solo escribe `## Validaciones pendientes` si quedó algo abierto; `avisoDePendientes` ignora la sección vacía o con "Ninguna.", "Nada.", "Sin pendientes." o "Fase cerrada sin pendientes." | §3.5.2, §4.8, L09 |
| B2 | `pedirConfirmacion` distingue el rechazo de la persona (`"rechazada"`) de un cliente que anuncia elicitation sin implementarla (`"no-disponible"`, recordado para toda la sesión) | §4.7, L08 |
| B3 | `cargarEnv(archivo?)` se exporta junto con `reiniciarEnv()`, `clavesDeEnv()` y `errorDeEnv()`; `limpiarEntorno()` los reinicia entre tests | §4.2, L01 |

## 5. Etapa 3 — `3.0.0-beta` Configuración

**Base:** fin de la Etapa 2 (`2.2.0`). **Estado: cerrada** (iteración 4), con los ajustes G1–G5 de §5.14.

**Alcance:** 13 lotes.
- Prompts de fábrica bajo `prompts/es/`.
- Motor de capas con bloques.
- Manifiesto `phase-gate.json` y `machine.json`.
- Prompts y deducción por proyecto.
- Prompts base genéricos (`software`) y los cinco presets en español.
- Resolución del proyecto por Roots.
- Tools multi-repo.
- `init`, `eject` y un `doctor` ampliado.
- Release como prerelease `beta`.

Es la primera versión **mayor**: cambia el preset por defecto y la ubicación de los prompts de fábrica. La migración es un comando.

### 5.1 Comprobado antes de escribir este plan

| Verificación | Resultado y qué cambió en el plan |
|---|---|
| `server.listRoots()` | Existe (`server/index.js:394`) y devuelve `{ roots: [{ uri, name? }] }`; cada `uri` empieza obligatoriamente por `file://` (`types.js:1920-1924`). |
| ¿El SDK comprueba que el cliente soporte Roots antes de pedirlas? | **No**, salvo con `enforceStrictCapabilities: true` (`shared/protocol.js:623`), que el servidor no usa. Si el cliente no declaró `roots`, la petición sale igual y vuelve con error. **Cambio:** el servidor mira `getClientCapabilities()?.roots` antes de llamar. |
| Notificación de cambio de raíces | `notifications/roots/list_changed` (`RootsListChangedNotificationSchema`, `types.js:1951`). Se escucha con `mcp.server.setNotificationHandler(...)` (`protocol.d.ts:403`). El momento de pedir las raíces por primera vez es `mcp.server.oninitialized` (`index.d.ts:84`). |
| URIs `file://` de Windows | `url.fileURLToPath` resuelve igual `file:///c:/…`, `file:///C:/…` y `file:///c%3A/…` (la forma que manda VS Code) a `c:\…`, decodifica `%20` y `%C3%B1` y convierte `file://servidor/recurso` en `\\servidor\recurso`. En POSIX, `file:///c:/…` da `/c:/…` (inofensivo: no coincide con nada). Comparar con `path.win32.relative` no distingue mayúsculas (`"C:\Users\Ana"` frente a `"c:\users\ana\api"` da `"api"`). **Cambio:** se usa `fileURLToPath(uri)` sin opciones (adopta la plataforma) más `rutaReal`, y se compara con `estaDentroReal`. Nunca se manipula la URI como texto. |
| JSON Schema a partir de zod | `zod` 4.4.3 trae `z.toJSONSchema(schema, { io: "input" })` y produce draft 2020-12 con `default`, `pattern` y `const`. **Cambio:** `schema/*.json` se genera de los schemas zod y un test exige que el archivo publicado coincida con la salida. Una sola fuente. |
| Salida de `git status --porcelain=v2 --branch` (git 2.43) | Cabeceras `# branch.oid <sha>` (o `(initial)` sin commits), `# branch.head <rama>` (o `(detached)`), `# branch.ab +A -B` solo si hay upstream. Cambios en líneas que empiezan por `1 `, `2 `, `u ` y `? `. Se parsea sin depender del idioma de git. |
| Efectos secundarios de `git status` | Puede escribir el índice y tomar `index.lock`. Además, si el repo configura `core.fsmonitor`, **ejecuta ese comando**. **Cambio:** se llama siempre con `GIT_OPTIONAL_LOCKS=0` y `-c core.fsmonitor=false`. |
| ¿Qué publica hoy el paquete? | `files: ["build", "prompts", "!build/**/*.map"]` (`package.json`). **Cambio:** añadir `presets` y `schema`. |
| Flujo de publicación con una prerelease | `publish.yml` hace `npm publish` sin `--tag`. Una `3.0.0-beta.0` quedaría como **`latest`** y `npx mcp-phase-gate` instalaría la beta a todo el mundo. **Cambio:** L13 publica con `--tag beta` cuando la versión contiene `-`. |

### 5.2 Manifiesto y configuración local

#### 5.2.1 `<DOCS>/<PROYECTO>/phase-gate.json`

Es opcional: un proyecto sin manifiesto usa los valores por defecto. Lo valida el shape zod de `src/manifiesto.ts`; `schema/project.json` se genera de él.

```ts
export const POLITICAS_COMMIT = ["agente-commitea-con-OK", "agente-propone", "auto", "ninguno"] as const;

export const RepoManifiesto = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/,
        "El id de un repo va en minúsculas, números y guiones (ej. 'api', 'front-web')."),
  dir: z.string().min(1),      // relativo a PHASE_GATE_REPOS_PATH; ver reglas
  rol: z.string().max(60).optional(),
}).strict();

export const Manifiesto = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  preset: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).default("software"),
  idioma: z.enum(["es"]).default("es"),          // "en" se añade en la Etapa 6
  repos: z.array(RepoManifiesto).default([]),
  reglas: z.object({
    lotes: z.boolean().optional(),               // si falta, decide el preset
    commits: z.enum(POLITICAS_COMMIT).optional(),
    verificacion: z.array(z.string().min(1)).max(20).optional(),
  }).strict().default({}),
  fase5: z.object({ prPorRepo: z.boolean().optional() }).strict().default({}),
}).strict();
```

**Reglas que zod no expresa** (las comprueba `leerManifiesto`):
- `repos[].id` no se repite.
- `repos[].dir` no es absoluto y cada segmento pasa `validarSegmento`, así que no hay `..`. Para salir de `REPOS_PATH` está `machine.json`.
- `preset` existe en alguna capa (§5.3.2). Si no, error `PRESET-NO-EXISTE` con la lista de presets disponibles.

**Ejemplo:**

```json
{
  "$schema": "https://unpkg.com/mcp-phase-gate@3/schema/project.json",
  "version": 1,
  "preset": "multi-repo-feature",
  "repos": [
    { "id": "api", "dir": "backend-api", "rol": "backend" },
    { "id": "web", "dir": "frontend-web", "rol": "frontend" }
  ],
  "reglas": { "commits": "agente-commitea-con-OK", "verificacion": ["npm test"] },
  "fase5": { "prPorRepo": true }
}
```

**Si el manifiesto es inválido**, las tools que dependen del proyecto devuelven un error con la ruta exacta del problema (`repos[1].dir: …`) y `doctor` lo marca como `MANIFIESTO-INVALIDO`. No se cae a los valores por defecto en silencio: un manifiesto mal escrito que se ignora es justo el fallo silencioso que este diseño evita.

**Copias en conflicto.** Si en la carpeta del proyecto hay archivos `phase-gate*.json` que no se llaman exactamente así (por ejemplo, la copia en conflicto que deja OneDrive al editar en dos equipos), `doctor` emite `MANIFIESTO-CONFLICTO`.

**Quién lo escribe.** Solo el CLI (`init`, `eject`) y la autora a mano. `write_central_doc` no puede escribirlo: SEG-M, Etapa 1, L01.

#### 5.2.2 `machine.json`, la configuración local de cada equipo

**Dónde vive.** `configDir()` nueva en `src/config.ts`:

| Sistema | Carpeta |
|---|---|
| `PHASE_GATE_CONFIG_PATH` definida (nombre lógico `CONFIG_PATH` en `leerVariable`, sin alias) | esa carpeta |
| Windows | `%APPDATA%\mcp-phase-gate\` |
| macOS | `~/Library/Application Support/mcp-phase-gate/` |
| Linux | `$XDG_CONFIG_HOME/mcp-phase-gate/` o `~/.config/mcp-phase-gate/` |

En Windows y macOS coincide con la carpeta del estado; en Linux no (estado en `XDG_STATE_HOME`), que es lo correcto en cada sistema. La ruta `~/.config/…` de los contratos globales es la de Linux, y `doctor` muestra la real.

```ts
export const MaquinaConfig = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  // "<PROYECTO>/<repo id>" -> ruta absoluta en ESTE equipo
  repos: z.record(z.string().regex(/^[^/\\]+\/[a-z0-9][a-z0-9-]{0,39}$/), z.string().min(1)).default({}),
  presetPorDefecto: z.string().optional(),   // para proyectos sin manifiesto; si falta, "software"
}).strict();
```

```json
{
  "version": 1,
  "repos": { "ASISTENTE/agente": "C:\\Users\\Ana\\.asistente", "PROYECTO-A/api": "D:\\trabajo\\backend-api" },
  "presetPorDefecto": "software-replica"
}
```

- **Claves sin distinguir mayúsculas en el proyecto:** la parte `<PROYECTO>` se compara en minúsculas, igual que en `discoverProjects()` y `leerPunteros()`, así que `"proyecto-a/api"` y `"PROYECTO-A/api"` son la misma clave. Si dos claves de `machine.json` coinciden tras normalizar, `doctor` emite `MAQUINA-CLAVE-DUPLICADA` y vale la primera.
- `repos` sobrescribe la ruta de un repo concreto en este equipo y puede apuntar fuera de `REPOS_PATH`. Es seguro porque solo lo escribe la persona (o `init`), vive fuera de `DOCS` y ninguna tool puede tocarlo.
- `presetPorDefecto` resuelve tu migración sin escribir manifiestos: en tus equipos, un proyecto sin manifiesto usa `software-replica`.
- `schema/machine.json` se genera igual que `schema/project.json`.

#### 5.2.3 Repos y preset de una tarea concreta

`00 - Contexto Inicial.md` puede llevar frontmatter:

```markdown
---
repos: api, web
preset: ai-agent-ops
---
<requerimiento original>
```

- Se acepta también `repos: [api, web]`: se quitan los corchetes y se parte por comas.
- `start_task` gana el parámetro opcional `repos: z.array(z.string()).optional()`. Si viene, valida cada id contra el manifiesto (un id desconocido da error con la lista de los válidos) y escribe el frontmatter.
- Sin frontmatter, la tarea usa todos los repos del proyecto.
- Cambiar el alcance después exige reescribir el contexto inicial, que está protegido (R4): se confirma por elicitation o con `force`. Es deliberado: cambiar de repos a mitad de tarea es una decisión.
- **`preset` por tarea.** `start_task` gana también `preset: z.string().optional()`, validado contra los presets disponibles (si no existe, error con la lista), y lo escribe en el mismo frontmatter. Sirve para una tarea puntual de mantenimiento de un agente (`ai-agent-ops`) o de investigación (`research-ops`) dentro de un proyecto general, sin crear otro proyecto en `DOCS`.
- **Precedencia del preset:** frontmatter de la tarea > `phase-gate.json` del proyecto > `presetPorDefecto` de `machine.json` > `"software"`.
- Las **reglas** (`lotes`, `commits`) siguen la misma cadena: `reglas` del manifiesto > frontmatter del preset efectivo > valor de fábrica. Si la tarea cambia de preset, también cambian los valores por defecto de sus reglas, salvo los que fije el manifiesto.
- Un preset de tarea **no cambia los nombres de documento** (los bloques no pueden; §5.3.4). Por eso la deducción de fase sigue siendo por proyecto y no depende de la tarea.

### 5.3 Motor de capas y bloques

#### 5.3.1 Capas, de menor a mayor prioridad

| # | Capa | Carpeta o archivo | Puede aportar |
|---|---|---|---|
| 1 | Fábrica | `<paquete>/prompts/<idioma>/` | `fase-N-*.md`, `global-rules.md`, `comandos/fN.md` |
| 2 | Preset | `<paquete>/presets/<idioma>/<preset>.md` o `<configDir>/presets/<preset>.md` (gana el del usuario si hay dos con el mismo nombre) | **solo bloques** (un archivo) |
| 2b | Reglas | `<paquete>/prompts/<idioma>/reglas/<variante>.md`, elegidas por `reglas` del manifiesto (§5.4.3) | solo bloques |
| 3 | Global del usuario | `PHASE_GATE_PROMPTS_PATH`; si no está definida, `<configDir>/prompts/` cuando existe | `fase-N-*.md`, `global-rules.md`, `comandos/fN.md`, `bloques.md` |
| 4 | Proyecto | `<DOCS>/<PROYECTO>/.phase-gate/prompts/` | lo mismo que la capa 3 |

`src/capas.ts` (nuevo):

```ts
export type Capa = { orden: 1 | 2 | 2.5 | 3 | 4; etiqueta: "fábrica" | "preset" | "reglas" | "global" | "proyecto"; ruta: string };
export function capasDe(carpetaProyecto: string | null, carpetaTarea?: string | null): Capa[]
```

La capa 2 es el preset **efectivo**, resuelto con la precedencia de §5.2.3: con `carpetaTarea`, primero el frontmatter de su `00 - Contexto Inicial.md`. Con `carpetaProyecto: null` (cuando no se sabe el proyecto), las capas son la 1 y la 3, con el preset de `machine.json` o `software`.

#### 5.3.2 Presets

- Un preset es **un solo archivo** con frontmatter plano y bloques.
- Presets disponibles: los de `<paquete>/presets/<idioma>/` más los de `<configDir>/presets/`.
- Frontmatter:

```markdown
---
nombre: ai-agent-ops
descripcion: Mantenimiento de agentes de IA, prompts de sistema, skills y servidores MCP.
lotes: true
commits: agente-commitea-con-OK
---
```

`lotes` y `commits` son los valores por defecto del preset; `reglas` del manifiesto los sobrescribe.

#### 5.3.3 Sintaxis y parser de bloques (`src/bloques.ts`, nuevo)

```markdown
<!-- bloque: fase-3/pruebas -->
contenido que sustituye a la ranura
<!-- /bloque -->

<!-- bloque: global/cero-rupturas | despues -->
contenido que se añade al final de la ranura
<!-- /bloque -->
```

- **Identificador:** `<archivo>/<ranura>`, donde `<archivo>` es `global` o `fase-N` y `<ranura>` pertenece al catálogo (§3.2, más `global/extra`, §5.3.5).
- **Modo:** `reemplazar` (por defecto), `antes` o `despues`.
- **Finales de línea:** el archivo se normaliza a `\n` antes de parsear (§1.3).
- **Expresiones** (por línea, como `quitarMarcadores`):
  - Apertura: `/^[ \t]*<!--\s*bloque:\s*(global|fase-\d+)\/([\w-]+)\s*(?:\|\s*(reemplazar|antes|despues)\s*)?-->[ \t]*$/`
  - Cierre: `/^[ \t]*<!--\s*\/bloque\s*-->[ \t]*$/`
- **Errores de forma** (aviso `BLOQUE-MAL-FORMADO`, con archivo y línea): bloque sin cerrar, cierre sin apertura, bloque anidado. El archivo se ignora entero; no se aplica a medias.
- **Mismo identificador dos veces en un archivo:** aviso `BLOQUE-DUPLICADO`; vale el primero.
- El texto fuera de los bloques se ignora: sirve para documentar el preset.
- Los marcadores de bloque nunca llegan al modelo.

```ts
export type Bloque = { id: string; archivo: string; ranura: string; modo: "reemplazar" | "antes" | "despues"; contenido: string; origen: { capa: Capa; archivo: string; linea: number } };
export function leerBloques(archivo: string, capa: Capa): { bloques: Bloque[]; avisos: Hallazgo[] }
```

#### 5.3.4 Ensamblado de un prompt (`ensamblarFase(fase, carpetaProyecto)`)

1. **Cuerpo:** la capa más alta entre 1, 3 y 4 que tenga `fase-N-*.md`. Su frontmatter da `documento` y `recibos`; los bloques nunca los cambian.
2. **Ranuras del cuerpo:** se leen con sus contenidos por defecto.
3. **Aplicar bloques por capas, en orden ascendente** (2, 2b, 3 y 4; dentro de cada capa, en orden de archivo). Para la ranura del bloque:
   - `reemplazar`: el contenido actual pasa a ser el del bloque.
   - `antes` / `despues`: se antepone o añade al contenido actual, separado por una línea en blanco.

   Así, un `despues` del preset seguido de un `reemplazar` del proyecto deja solo el del proyecto. El orden es determinista.
4. **Huérfanos:** un bloque cuyo `<archivo>/<ranura>` no existe en el cuerpo que se usa (o cuya fase no existe) es `BLOQUE-HUERFANO`.
   - `doctor` lo lista con archivo y línea.
   - `get_phase_prompt` antepone una línea: `> Nota del servidor: el bloque «fase-3/verificaion» de <archivo>:<línea> no encaja en ninguna ranura y se ignoró.`
5. **Reglas globales:** la misma operación sobre `global-rules.md` (§5.3.5).
6. Se quitan los marcadores de ranura (`quitarMarcadores`, Etapa 1).
7. Se añaden al final, por este orden, "ARCHIVOS DE ESTA TAREA" (Etapa 1) y, salvo con `incluirConfigProyecto: false`, "CONFIGURACIÓN DEL PROYECTO" (§5.4.4).

```ts
export type Procedencia = { ranura: string; contenidoDe: string /* "fábrica" o archivo:línea */; modos: string[] };
export function ensamblarFase(
  fase: number,
  carpetaProyecto: string | null,
  carpetaTarea?: string | null,
  opciones?: { incluirConfigProyecto?: boolean }   // por defecto true; la prueba de oro pasa false
): { texto: string; procedencia: Procedencia[]; avisos: Hallazgo[] }
```

`procedencia` alimenta `doctor --fase N --proyecto P` y el Estudio de prompts de la Etapa 5.

#### 5.3.5 `global-rules.md` sin perder nunca BASE ni PENDIENTES (cumple la decisión C1)

- Las secciones `## BASE DE CADA DECISIÓN` y `## PENDIENTES HEREDADOS` del archivo de fábrica son **esqueleto**: no son ranuras y ningún bloque las toca.
- Se añade una ranura vacía al final de `prompts/es/global-rules.md`, para sumar reglas globales sin sustituir nada:

```markdown
## REGLAS ADICIONALES
<!-- ranura: extra -->
<!-- /ranura -->
```

  Si queda vacía, el encabezado se omite al ensamblar. El catálogo pasa a **23 ranuras**.
- Sustituir `global-rules.md` entero (capas 3 o 4) **sigue funcionando pero queda desaconsejado**. Si el archivo que gana no contiene esos dos encabezados, el ensamblado **reinyecta** las dos secciones de fábrica al final, y `doctor` cambia el aviso `GLOBAL-SIN-BASE` por `GLOBAL-REINYECTADO`, que dice que se reinyectaron y que la forma recomendada es un `bloques.md` con `global/cero-rupturas`, `global/evidencia` o `global/extra`.

### 5.4 Prompts y deducción por proyecto (lote L04)

#### 5.4.1 Funciones que pasan a recibir el proyecto

| Hoy | En la 3.0 |
|---|---|
| `discoverPhases(capas = promptsLayers())` | `fasesDe(carpetaProyecto: string \| null)` = `discoverPhases` sobre los cuerpos de `capasDe(proyecto)` |
| `loadPhasePrompt(fase)` | `ensamblarFase(fase, proyecto, tarea).texto` (la tarea, cuando se conoce, aporta su preset) |
| `nombreContextoInicial()` | `nombreContextoInicial(proyecto)` |
| `estadoDeTarea`, `listarTareas`, `tareaActiva`, `avisoDeCompuerta`, `motivoDeProteccion`, `avisoDePendientes` | reciben `fasesDe(proyecto)` en lugar de un mapa global |

`promptsLayers()` queda como envoltorio de `capasDe(null)` hasta la Etapa 4 y luego se retira. La deducción de fase de cada tarea usa los nombres de documento de **su** proyecto: si un proyecto sustituye una fase entera con otro `documento`, sus tareas se deducen con ese nombre.

#### 5.4.2 MCP Prompts con proyecto

- `prompts/list` se construye con `capasDe(null)`, porque la lista no depende de un proyecto.
- En `prompts/get`, el texto del comando sale de `capasDe(proyecto)` cuando el proyecto se conoce (por el argumento `project` o por Roots), así que un proyecto puede tener su propio `comandos/f4.md`.

#### 5.4.3 Variantes de regla

Archivos de bloques del paquete que se activan según `reglas` (manifiesto > frontmatter del preset > valor de fábrica):

| Regla | Valor | Archivo | Bloques |
|---|---|---|---|
| `commits` | `agente-commitea-con-OK` | (ninguno: es el contenido por defecto, §3.5.2) | — |
| `commits` | `agente-propone` | `reglas/commits-agente-propone.md` | `fase-4/commits` |
| `commits` | `auto` | `reglas/commits-auto.md` | `fase-4/commits` |
| `commits` | `ninguno` | `reglas/commits-ninguno.md` | `fase-4/commits` |
| `lotes` | `false` | `reglas/sin-lotes.md` | `fase-3/lotes`, `fase-4/lotes` |

Texto exacto de las variantes (todas dentro de `<!-- bloque: … -->`):

`reglas/commits-agente-propone.md` → `fase-4/commits`:

```markdown
Política: **el agente propone el commit; el usuario lo hace.**

Al cerrar la verificación y el recibo de un lote:
1. Muéstrale al usuario la lista exacta de archivos del lote y el mensaje de commit (el de la
   columna "Commit propuesto" del plan, ajustado si el lote cambió), listos para copiar:
   `git add <archivo>` uno por uno y `git commit -m "<mensaje>"`.
2. Espera a que el usuario te diga el hash del commit, y actualiza el recibo con él. Si decide
   no hacerlo, el recibo queda con `commit: no aplica` y su porqué.

No ejecutes `git add`, `git commit`, `push`, ni cambies de rama.
```

`reglas/commits-auto.md` → `fase-4/commits`:

```markdown
Política: **el agente hace el commit en cuanto el lote pasa su verificación**, sin esperar OK.

1. Solo si el lote quedó con `estado: verificado`. Con cualquier otro estado no hay commit y te
   detienes a preguntar.
2. `git add` con la lista exacta de archivos del lote, uno por uno —nunca `git add -A` ni
   `git add .`— y `git commit` con el mensaje de la columna "Commit propuesto".
3. Si un hook falla o se pide una passphrase, detente y díselo. Nunca uses `--no-verify`.
4. Anuncia el commit en una línea al abrir el siguiente lote. La parada del lote desaparece: si
   hay pruebas que esperan al usuario, se acumulan en los recibos y en el índice.

Nunca hagas `push`, no crees ni cambies de rama y no abras un PR.
```

`reglas/commits-ninguno.md` → `fase-4/commits`:

```markdown
Política: **sin commits por lote.** El usuario decide cuándo y cómo se versiona.

Al cerrar un lote, su recibo queda con `commit: no aplica` y una línea en "Qué se hizo" que
diga qué archivos cambió. Detente al cerrar cada lote, igual que si hubiera commit, para que
el usuario revise y pruebe antes del siguiente. No ejecutes ningún comando de git que escriba.
```

`reglas/sin-lotes.md` → `fase-3/lotes`:

```markdown
Este proyecto no trabaja por lotes. El plan no lleva tabla de lotes, pero sí el frontmatter
`lotes: 1`, para que la Fase 4 sepa que su recibo es el documento de la fase.
```

`reglas/sin-lotes.md` → `fase-4/lotes`:

````markdown
El plan tiene un solo lote (`lotes: 1`): ejecútalo entero, en el orden del plan, y deja como
documento de la fase un único recibo con la plantilla de abajo. Haz el corte de commit una sola
vez, al final (ver COMMITS).

```markdown
<la misma plantilla de recibo de §3.5.2, con lote: L01 y de: 1>
```
````

En el archivo real, la plantilla va **copiada entera**, no referida: el modelo no ve §3.5.2.

#### 5.4.4 Bloque "CONFIGURACIÓN DEL PROYECTO" que añade el servidor

Al final de cada prompt de fase, cuando el proyecto se conoce. Es dato, no prosa: sale del manifiesto, de `machine.json` y del frontmatter de la tarea.

```md
## CONFIGURACIÓN DEL PROYECTO (la declara phase-gate.json)

- Preset: `multi-repo-feature` (del proyecto) · Idioma: es
- Lotes: sí · Commits: agente-commitea-con-OK
- Repositorios de esta tarea:
  - `api` (backend): `D:\trabajo\backend-api` · git · rama `feat/x` · árbol limpio
  - `web` (frontend): `D:\repos\frontend-web` · git · rama `feat/x` · 2 cambios sin commit
- Comandos de verificación del proyecto: `npm test`
- Una descripción de PR por repositorio (fase5.prPorRepo).

Usa `read_repo_file` y `repo_status` con estos ids.
```

- Sin manifiesto: `- Preset: software (por defecto; este proyecto no tiene phase-gate.json)`.
- El origen del preset va siempre entre paréntesis: `(de la tarea)`, `(del proyecto)`, `(de machine.json)` o `(por defecto…)`.
- El estado de git sale de `repo_status`; si tarda más de 3 segundos o falla, se omite la columna y el prompt se entrega igual.

### 5.5 Prompts base genéricos (`software`) y presets en español

#### 5.5.1 Qué cambia en `prompts/es/*.md`

Solo el **contenido por defecto** de seis ranuras; la estructura de la Etapa 1 no se toca. El texto actual de esas seis pasa intacto a `presets/es/software-replica.md`.

| Ranura | Contenido por defecto nuevo (`software`) |
|---|---|
| `fase-1/verificacion` | ver abajo |
| `fase-2/verificacion` | ver abajo |
| `fase-3/comprobaciones` | ver abajo |
| `fase-3/pruebas` | ver abajo |
| `fase-4/verificacion` | ver abajo |
| `fase-4/pruebas` | ver abajo |

`fase-1/verificacion`:

```markdown
Si una hipótesis se puede comprobar ejecutando algo, **ejecútalo ahora** y reporta la
salida real: correr la prueba o el comando que la confirma o la descarta, leer los logs del
comportamiento reportado, recuperar una versión anterior de un archivo con `git show` para
comparar comportamientos, una medición cronometrada.
```

`fase-2/verificacion`:

```markdown
Antes de dar por buena una decisión, comprueba lo que se pueda comprobar: barridos por el
proyecto buscando otros consumidores, lectura del código de las dependencias o del framework,
correr las pruebas que tocan la zona, conteos o mediciones reales.
```

`fase-3/comprobaciones`:

```markdown
que el identificador que vas a usar esté libre, que la función o el método exista con esa
firma, que la clave de configuración o de idioma no exista ya, que el módulo que vas a
importar exporte lo que crees, y quién más consume lo que vas a tocar.
```

`fase-3/pruebas`:

```markdown
Si el repositorio tiene suite de pruebas automatizadas, el plan la usa: el criterio de salida
de cada lote dice qué comando corre y qué debe dar, y si el cambio merece una prueba nueva, el
plan dice cuál, en qué archivo y calcada de qué prueba existente.

Si no tiene suite, **no inventes una sección de tests ni propongas escribir la primera del
módulo como parte de esta tarea**. El criterio de salida usa lo que sí se puede ejecutar:
compilar, el linter, un script, una salida observable. Dilo en una línea y sigue.
```

`fase-4/verificacion`:

```markdown
La suite de pruebas si existe, compilación o comprobación de tipos, linter, scripts del
proyecto, la salida real del programa, conteos y mediciones cronometradas.
```

`fase-4/pruebas`:

```markdown
Si el repositorio tiene suite, córrela al cerrar cada lote y reporta el resultado con números
(pruebas que pasan, que fallan y cuáles). Un lote con pruebas en rojo no se da por verificado.
Si no tiene suite, no inventes una sección de tests ni propongas escribir la primera del módulo
como parte de esta tarea; si viene a cuento, una línea y sigue.
```

#### 5.5.2 `presets/es/software-replica.md`, tu flujo actual

```markdown
---
nombre: software-replica
descripcion: Código existente sin suite de pruebas, con acceso de solo lectura a una réplica de datos para medir y comparar paridad.
lotes: true
commits: agente-commitea-con-OK
---
```

Seis bloques en modo `reemplazar`, cada uno con el contenido por defecto de la `2.2.0`, **byte a byte**:
- `fase-1/verificacion`: `fase-1:41-44` @d7594ea
- `fase-2/verificacion`: `fase-2:52-54`
- `fase-3/comprobaciones`: `fase-3:49-52`
- `fase-3/pruebas`: la versión con A1 de §3.4.3 (d)
- `fase-4/verificacion`: `fase-4:85-86`
- `fase-4/pruebas`: la versión con A1 de §3.4.4 (f)

**Prueba de oro (L05):** con `preset: software-replica`, `ensamblarFase(N, proyecto, null, { incluirConfigProyecto: false })` produce **exactamente** el mismo texto que `loadPhasePrompt(N)` de la `2.2.0`, para N = 1…5. Se excluye el bloque "CONFIGURACIÓN DEL PROYECTO" porque en la `2.2.0` no existía. Se compara contra copias guardadas en `test/oro/2.2.0/fase-N.txt`. Es la garantía de que tu flujo no cambia.

#### 5.5.3 `presets/es/software-tdd.md`

```markdown
---
nombre: software-tdd
descripcion: Código con suite de pruebas; cada lote empieza por una prueba que falla.
lotes: true
commits: agente-commitea-con-OK
---

<!-- bloque: fase-3/pruebas -->
Este proyecto trabaja con pruebas primero. **Cada lote que cambia comportamiento empieza por
una prueba que hoy falla** y que pasará cuando el lote esté hecho. El plan dice, por lote:

- la prueba nueva o modificada: archivo, nombre, y de qué prueba existente se calca;
- el comando exacto que la corre;
- qué debe dar ANTES del cambio (rojo, con qué fallo) y qué DESPUÉS (verde);
- qué otras pruebas tienen que seguir en verde.

Un lote que solo reorganiza código sin cambiar comportamiento no lleva prueba nueva: su
criterio de salida es que la suite completa siga en verde, y lo dice.
<!-- /bloque -->

<!-- bloque: fase-4/pruebas -->
Ciclo por lote, en este orden y reportando cada paso con su salida real:

1. **Rojo:** escribe la prueba del lote y córrela. Tiene que fallar, y por la razón que dice
   el plan. Si pasa sin cambios, o falla por otra razón, detente: la prueba no prueba lo que
   crees.
2. **Verde:** implementa lo mínimo para que pase. Córrela.
3. **Suite:** corre la suite completa. Ninguna prueba que estaba en verde puede quedar en rojo.
4. **Limpieza:** si refactorizas, la suite sigue en verde después.

El recibo del lote lleva las cuatro salidas con números. La prueba nueva va en el mismo
commit que el código que la hace pasar.
<!-- /bloque -->
```

#### 5.5.4 `presets/es/multi-repo-feature.md`

```markdown
---
nombre: multi-repo-feature
descripcion: Un requerimiento que cambia varios repositorios a la vez, con contratos entre ellos.
lotes: true
commits: agente-commitea-con-OK
---

<!-- bloque: fase-1/verificacion | despues -->
En una tarea de varios repositorios, el mapa de código dice en qué repositorio está cada
pieza (`repo:archivo:línea`) y nombra los **contratos** entre ellos: endpoints, payloads,
eventos, esquemas compartidos, variables de entorno. Un contrato que cambia es un hallazgo de
severidad alta aunque el código de cada lado sea trivial.
<!-- /bloque -->

<!-- bloque: fase-3/comprobaciones | despues -->
En esta tarea, además, comprueba **cada contrato entre repositorios** contra los dos lados: qué
envía uno y qué espera el otro, campo por campo, y qué versión de cada lado está desplegada.
<!-- /bloque -->

<!-- bloque: fase-3/lotes | despues -->
**Orden entre repositorios.** Un cambio de contrato se hace en lotes que nunca dejan a los dos
lados incompatibles: primero el lado que acepta lo viejo y lo nuevo, después el que empieza a
usar lo nuevo, y al final, si hace falta, el que deja de aceptar lo viejo. El plan incluye
siempre la sección **Nota de despliegue** con el orden en que se despliega cada repositorio y
qué pasa si uno se despliega sin el otro.
<!-- /bloque -->

<!-- bloque: fase-5/pr | despues -->
**Varios repositorios.** Entrega **una descripción de PR por repositorio**, cada una con el
contrato de arriba y dentro de su propio bloque de cuatro backticks, encabezada por el id del
repositorio. Después, fuera de los bloques, una **nota de coordinación**: qué PR se mergea
primero, qué PR depende de cuál, y el orden de despliegue. La auditoría revisa también que
cada contrato quede compatible en todos los órdenes de despliegue posibles.
<!-- /bloque -->
```

#### 5.5.5 `presets/es/ai-agent-ops.md`

```markdown
---
nombre: ai-agent-ops
descripcion: Mantenimiento de agentes de IA, prompts de sistema, skills, flujos de automatización y servidores MCP.
lotes: true
commits: agente-commitea-con-OK
---

<!-- bloque: global/cero-rupturas | despues -->
- En un agente, "romper" también es cambiar su comportamiento fuera del alcance: el formato
  de sus respuestas, su tono, las tools que puede usar, sus límites de seguridad y lo que
  promete a sus usuarios. Esas restricciones globales del agente no se tocan salvo que la
  tarea sea justamente cambiarlas, y entonces se dice.
<!-- /bloque -->

<!-- bloque: global/evidencia -->
Toda afirmación se ancla en algo que otra persona pueda abrir y comprobar:
- el `archivo:línea` o el bloque exacto del prompt, la configuración, la skill, la tool o el
  flujo que la sostiene; y
- para el comportamiento del agente, un **transcript o log real** con su fecha, el modelo y su
  versión, y el entorno en que corrió.

Un comportamiento que no está en un transcript no se afirma: se pone a prueba.
Cuando este flujo dice `archivo:línea`, se refiere a esta unidad de evidencia.
<!-- /bloque -->

<!-- bloque: fase-1/verificacion -->
Si una hipótesis sobre el comportamiento del agente se puede comprobar, **compruébala ahora**:
reprodúcela con una corrida controlada o un dry-run, con la entrada exacta, y guarda el
transcript con fecha, modelo y entorno. Para comparar con cómo se comportaba antes, recupera
la versión anterior del prompt o de la configuración con `git show` o desde su registro de
versiones. Una conducta descrita de memoria no es un diagnóstico.
<!-- /bloque -->

<!-- bloque: fase-2/verificacion -->
Antes de dar por buena una decisión, comprueba: qué otras partes del agente dependen del
bloque que se tocaría (otras instrucciones, skills, tools, flujos que lo llaman), qué casos de
uso reales lo atraviesan, y si la decisión choca con alguna restricción global del agente.
<!-- /bloque -->

<!-- bloque: fase-3/comprobaciones -->
que el bloque de prompt o de configuración que vas a cambiar sea el que de verdad se carga
(y no una copia sin usar), qué otras instrucciones lo contradicen o lo refuerzan, qué tools y
permisos tiene el agente hoy, y qué casos de uso reales pasan por ahí.
<!-- /bloque -->

<!-- bloque: fase-3/pruebas -->
La verificación de un agente es una **batería de casos**, definida aquí antes de tocar nada:

| # | Tipo | Entrada | Salida esperada | Restricción que vigila |
|---|---|---|---|---|

- **De oro:** los casos de uso reales que tienen que seguir funcionando igual.
- **Borde:** entradas raras pero legítimas.
- **Adversariales:** intentos de sacar al agente de sus restricciones (formato, tono, tools
  permitidas, seguridad).

Cada lote dice qué casos de la batería prueba. El criterio de salida es la tabla
`Entrada | Salida antes | Salida después` sin regresiones en los casos de oro y con las
restricciones globales intactas en todos.
<!-- /bloque -->

<!-- bloque: fase-4/verificacion -->
Corre la batería del plan (o el dry-run, si correr de verdad tiene efectos) **antes y después**
del cambio, con la misma entrada, el mismo modelo y la misma configuración salvo lo que el lote
cambia. Guarda los transcripts con fecha, modelo y entorno.
<!-- /bloque -->

<!-- bloque: fase-4/pruebas -->
El recibo de cada lote lleva la tabla `# | Entrada | Salida antes | Salida después | Veredicto`
de los casos que corrió, con el veredicto en una palabra (igual, mejor, regresión), y una
línea por restricción global comprobada. Una regresión en un caso de oro deja el lote
`fallido`. Si un caso no se pudo correr de verdad y se simuló, dilo en esa fila.
<!-- /bloque -->

<!-- bloque: fase-5/pr | antes -->
**Este preset entrega primero una auditoría de regresión de comportamiento**, y después, solo
si los cambios viven en un repositorio con PR, la descripción del PR con el contrato de abajo.

La auditoría de regresión va así:
1. **Veredicto** en la primera línea: sin regresiones, o cuántas y en qué casos.
2. **Tabla de la batería completa**: `# | Tipo | Entrada | Antes | Después | Veredicto`.
3. **Restricciones globales**: una línea por restricción, con su evidencia.
4. **Registro de versión**: qué prompt, configuración, skill o flujo cambió; versión anterior
   y nueva (hash, fecha o etiqueta); y en dos frases qué cambia para quien usa el agente.

Si no hay repositorio ni PR, la entrega termina aquí y el documento de la fase lleva la
auditoría y el registro de versión.
<!-- /bloque -->
```

#### 5.5.6 `presets/es/research-ops.md`

```markdown
---
nombre: research-ops
descripcion: Investigación técnica y operaciones; el entregable es un informe o un runbook, no código.
lotes: true
commits: ninguno
---

<!-- bloque: global/evidencia -->
Toda afirmación se ancla en algo que otra persona pueda abrir y comprobar:
- una fuente con su URL o referencia, su fecha y, si aplica, su versión; o
- la salida real de algo que ejecutaste, con el comando exacto, el entorno y cuándo se corrió.

Una fuente sin fecha vale como `inferido`. Cuando este flujo dice `archivo:línea`, se refiere
a esta unidad de evidencia.
<!-- /bloque -->

<!-- bloque: fase-1/verificacion -->
Si una afirmación se puede comprobar ejecutando algo (un comando, una consulta, un experimento
pequeño), **ejecútalo ahora** y guarda la salida con el comando exacto. Si depende de una
fuente externa, cítala con URL y fecha, y busca una segunda fuente independiente cuando la
conclusión dependa de ella.
<!-- /bloque -->

<!-- bloque: fase-3/pruebas -->
El criterio de salida de cada lote es **reproducibilidad**: los comandos o pasos exactos, el
entorno y los datos de entrada con los que otra persona obtendría el mismo resultado. Un
resultado que no se puede reproducir con lo escrito no se da por bueno.
<!-- /bloque -->

<!-- bloque: fase-4/verificacion -->
Ejecuta los pasos del lote tal como están escritos, guarda cada salida con el comando y la
fecha, y anota cualquier diferencia de entorno respecto a lo planeado.
<!-- /bloque -->

<!-- bloque: fase-5/pr -->
La entrega de esta fase es un **informe** (o un runbook, si la tarea era operativa), no una
descripción de PR:

1. **Conclusión** en la primera línea, con su número si lo hay.
2. **Hallazgos**, cada uno con su evidencia (fuente con URL y fecha, o comando con su salida).
3. **Cómo reproducirlo**: comandos, entorno y datos.
4. **Lo que no se pudo confirmar**, con qué lo confirmaría.
5. **Recomendación**, marcada como tal.

Va dentro de un único bloque de cuatro backticks etiquetado `markdown`, para copiarlo en crudo.
<!-- /bloque -->
```

En `research-ops` no hay commits por lote (`commits: ninguno`), pero los lotes siguen ordenando el trabajo y dejando recibos.

### 5.6 Resolución del proyecto por Roots (lote L07)

**`src/roots.ts` (nuevo).**

```ts
export type ResolucionProyecto =
  | { tipo: "unico"; carpetaProyecto: string; motivo: string }
  | { tipo: "ambiguo"; candidatos: string[] }
  | { tipo: "ninguno" };

export function iniciarRoots(mcp: McpServer): void       // engancha oninitialized y list_changed
export function raicesActuales(): string[]               // rutas reales, desde la caché
export function proyectoPorRaices(): ResolucionProyecto
```

**Obtención de las raíces:**
- En `oninitialized`, si `getClientCapabilities()?.roots` existe, se llama `listRoots()` con `timeout: 5000`.
- Si `roots.listChanged` existe, se escucha `notifications/roots/list_changed` y se vuelven a pedir.
- Cada `uri` pasa por `fileURLToPath` y `rutaReal`. Las que fallan se descartan (y se registran en el log).
- Sin Roots, la caché queda vacía y todo funciona como en la Etapa 2.

**Cruce** (`proyectoPorRaices`). Para cada proyecto y cada raíz:

| Coincidencia | Fuerza |
|---|---|
| La raíz es la carpeta de un repo del proyecto o está dentro de ella (`estaDentroReal(repo, raíz)`) | fuerte |
| La raíz está dentro de `<DOCS>/<PROYECTO>` (alguien abrió la carpeta de documentación) | fuerte |
| Un repo del proyecto está dentro de la raíz (se abrió la carpeta que contiene varios repos) | débil |

Las rutas de los repos salen de `machine.json` o de `<REPOS_PATH>/<dir>`.

Resultado:
- Un solo proyecto con coincidencia fuerte: `"unico"`, con motivo, por ejemplo "la carpeta abierta `D:\trabajo\backend-api` es el repo `api` de PROYECTO-A".
- Varios con coincidencia fuerte: `"ambiguo"`.
- Ninguno fuerte y uno solo débil: `"unico"`.
- En cualquier otro caso: `"ninguno"`.

**Orden de resolución del proyecto en cualquier tool:**
1. Argumento `project` explícito.
2. `proyectoPorRaices()` con `"unico"`.
3. Solo en la compuerta y en el aviso de pendientes, el único puntero (como hoy).
4. Error "No sé en qué proyecto estás: indica `project`." Con `"ambiguo"`, el error lista los candidatos.

**`project` pasa a ser opcional** en `start_task`, `switch_task`, `read_central_doc`, `write_central_doc` y los prompts. De obligatorio a opcional es un cambio compatible para quien ya lo pasa. Cuando se deduce, la respuesta lo dice en una línea: "Proyecto deducido de la carpeta abierta: PROYECTO-A."

### 5.7 Tools multi-repo (lote L08)

**`src/git.ts` (nuevo)**, la única puerta a git, de solo lectura:

```ts
export async function git(dir: string, args: readonly string[]): Promise<string>
```

- `execFile("git", ["-c", "core.fsmonitor=false", ...args], { cwd: dir, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" }, timeout: 10_000, maxBuffer: 1_048_576, windowsHide: true })`.
- `args` solo contiene constantes del código; ningún texto que venga del modelo llega como argumento.
- `ENOENT` → error "git no está instalado o no está en el PATH".
- "dubious ownership" → error que explica `git config --global --add safe.directory <ruta>`.

**Resolución de un repo**, `resolverRepo(carpetaProyecto, id)`:
1. El id existe en el manifiesto.
2. Ruta = `machine.json` (`"<PROYECTO>/<id>"`) o `<REPOS_PATH>/<dir>`.
3. `rutaReal` y comprobar que existe.

**`read_repo_file`:**

```ts
export const readRepoFileShape = {
  project: z.string().optional(),
  repo: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  path: z.string().min(1),
};
```

- Contención: `estaDentroReal(rutaDelRepo, rutaFinal)`; cada segmento de `path` pasa `validarSegmento`; se rechaza todo segmento que sea `.git` o empiece por `.git`. **La misma regla se aplica a la ruta ya resuelta:** ningún segmento de `path.relative(rutaReal(rutaDelRepo), rutaReal(rutaFinal))` puede ser `.git` ni empezar por `.git`, para que un symlink dentro del repo no lleve a `.git/config`. Consecuencia aceptada: `.gitignore`, `.gitattributes` y `.gitmodules` tampoco se leen con esta tool.
- Lectura con `leerTextoAcotado`.
- Anotaciones: solo lectura, idempotente, `openWorldHint: false`.

**`repo_status`:**

```ts
export const repoStatusShape = {
  project: z.string().optional(),
  repo: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/).optional(),   // sin repo: los de la tarea activa
};
```

Ejecuta `git status --porcelain=v2 --branch --untracked-files=normal` y devuelve, por repo:

| Campo | De dónde sale |
|---|---|
| `id`, `ruta`, `existe` | resolución |
| `esGit` | `false` si git responde "not a git repository" |
| `rama` | `# branch.head` (`(detached)` → `null` y `separado: true`) |
| `head` | `# branch.oid`, recortado a 7 caracteres (`(initial)` → `null`) |
| `adelante`, `atras` | `# branch.ab` si hay upstream |
| `limpio`, `cambios`, `sinSeguimiento` | conteo de líneas `1`, `2` y `u` frente a `?` |

- Texto para el chat: `` `api`: rama feat/x · a1b2c3d · 2 adelante · árbol limpio ``.
- Además, `structuredContent` con el `outputSchema`.
- Anotaciones: solo lectura e idempotente.

**`read_cross_repo`** se conserva tal cual (Etapa 0). Su descripción pasa a: "Lee un archivo de cualquier carpeta dentro de `PHASE_GATE_REPOS_PATH`. Si el proyecto declara repos en `phase-gate.json`, usa `read_repo_file`."

### 5.8 CLI `init` y `eject`

#### 5.8.1 `npx mcp-phase-gate init` (lote L09)

```text
mcp-phase-gate init [--cliente claude-code|cursor|vscode|todos] [--clave pg]
                    [--docs <ruta>] [--repos <ruta>]
                    [--comandos] [--migrate [--preset <nombre>]]
                    [--dry-run] [--yes]
```

**1. Rutas.** `--docs` y `--repos`, o las variables actuales. Si faltan y hay TTY, se preguntan con `readline`. Sin TTY y sin ellas: error. Se validan con `requireBasePath`.

**2. Clientes**, sin `--cliente` se detectan:

| Cliente | Cómo se detecta | Qué se hace |
|---|---|---|
| Claude Code | `claude` responde a `--version` | Se ejecuta `claude mcp add <clave> --scope user --env PHASE_GATE_DOCS_PATH=… --env PHASE_GATE_REPOS_PATH=… -- npx -y mcp-phase-gate`. Con `--dry-run`, solo se imprime el comando |
| Cursor | existe `~/.cursor/` | Merge en `~/.cursor/mcp.json`, bajo `mcpServers.<clave>` |
| VS Code | existe la carpeta de usuario de Code (Windows `%APPDATA%\Code\User\`, macOS `~/Library/Application Support/Code/User/`, Linux `~/.config/Code/User/`) | Merge en `mcp.json`, bajo `servers.<clave>` con `"type": "stdio"` |

**Merge de JSON**, igual para Cursor y VS Code:
1. Si el archivo no existe, **o existe vacío o solo con espacios** (en algunas instalaciones, el `mcp.json` de VS Code existe con 0 bytes), se trata como `{}` y se crea el contenido.
2. Si existe: se lee. Se toleran comentarios `//` y `/* */` y comas finales, pero solo para leer. Si aun así no se puede parsear, **no se toca** y se imprime el bloque para pegarlo a mano.
3. **Registro duplicado** (validación V5): si otra clave ya ejecuta `mcp-phase-gate` (un `npx … mcp-phase-gate` o una ruta a `build/index.js`), `init` **no crea otra**: actualiza esa entrada y conserva su clave, porque cambiarla cambia los nombres de tools y prompts y rompe los permisos ya concedidos. Solo con `--clave` explícita propone renombrarla, y lo avisa. Lo mismo con `claude mcp list` antes de `claude mcp add`. Si la clave ya existe con el mismo contenido: "sin cambios". Si existe con otro contenido: se muestra el diff y hace falta `--yes` o confirmación interactiva.
4. Antes de escribir, copia `mcp.json.bak-<AAAAMMDD-HHMMSS>`. Se escribe con indentación de 2 espacios y sin comentarios (si el original los tenía, se avisa de que se perderán y hace falta confirmación).

**3. `--comandos`** copia `comandos/fN.md` (resueltos por capas con `capasDe(null)`) a `~/.claude/commands/` o `~/.cursor/commands/`:
- La primera línea del archivo copiado es `<!-- generado por mcp-phase-gate init vX.Y.Z -->`.
- Un archivo que existe **sin** esa marca es tuyo y no se pisa sin `--yes`.
- Con la marca, se actualiza si cambió.

**4. `--migrate`**, la migración de P6. Para cada proyecto de `DOCS` sin `phase-gate.json`, propone crear:

```json
{ "$schema": "https://unpkg.com/mcp-phase-gate@3/schema/project.json", "version": 1, "preset": "<--preset o software-replica>" }
```

Solo crea archivos, nunca sobrescribe. Alternativa sin tocar la Documentación: `init --migrate --solo-este-equipo` escribe `presetPorDefecto` en `machine.json`.

**5. `--dry-run`** imprime cada acción (comando, archivo, diff) y no escribe nada; sale con `0`.

**6. Candado opcional para `git push` (solo informativo).** `init` no lo instala; imprime cómo ponerlo, para quien quiera que la frontera no dependa solo del prompt:
- en Claude Code, reglas `deny` para `Bash(git push *)` **y** `PowerShell(git push *)`: en Windows, Claude Code puede ejecutar comandos con su herramienta de PowerShell, que la regla de Bash no cubre (validación V6). La documentación oficial aclara que estas reglas **no son una frontera de seguridad**: `git -C . push` las esquiva;
- un hook `pre-push` de git que rechace el push: más firme que las reglas, aunque `git push --no-verify` lo salta (y el prompt prohíbe usarlo);
- **la única frontera real** está en el remoto: protección de ramas en GitHub, o que el entorno del agente no tenga credenciales para hacer push.

`init` lo imprime con esa graduación, para que nadie confunda una regla del cliente con un candado.

**7. Al terminar** ejecuta `doctor` y lo muestra.

**Códigos de salida:** `0` si todo fue bien; `1` si alguna acción falló; `2` si los argumentos son inválidos.

#### 5.8.2 `npx mcp-phase-gate eject` (lote L10)

```text
mcp-phase-gate eject <objetivo> --a global|proyecto:<NOMBRE> [--dry-run] [--fuerza]
```

| Objetivo | Copia | Destino |
|---|---|---|
| `fase-3` | el cuerpo de fábrica de la fase, **con sus marcadores de ranura**, para que los bloques sigan aplicando | `<capa>/fase-3-plan-tecnico.md` |
| `fase-3/pruebas` | el contenido **efectivo** de la ranura para ese proyecto (con el preset y las reglas ya aplicados), como bloque `reemplazar` | se añade a `<capa>/bloques.md` |
| `global/evidencia` | igual que el anterior | `<capa>/bloques.md` |
| `comando-f4` | el texto efectivo de `comandos/f4.md` | `<capa>/comandos/f4.md` |
| `preset:<nombre>` | el archivo completo del preset | `<configDir>/presets/<nombre>.md` (siempre global) |

- `<capa>`: con `global`, la capa 3 (si `PHASE_GATE_PROMPTS_PATH` no está definida, `<configDir>/prompts/`, que pasa a ser la capa global en cuanto existe); con `proyecto:<NOMBRE>`, `<DOCS>/<NOMBRE>/.phase-gate/prompts/`.
- Si el destino ya tiene ese archivo o ese bloque, se rechaza salvo con `--fuerza`, que deja copia `.bak-…`.
- **No se puede** ejecutar `eject` sobre `global-rules` entero: la forma soportada son sus ranuras (§5.3.5).
- Al terminar imprime la ruta, "Edítalo ahí; `doctor --fase 3 --proyecto <NOMBRE>` te mostrará que gana" y la procedencia actualizada.

### 5.9 `doctor`, `get_orchestrator_status` y recursos ampliados (lote L11)

- `Diagnostico.proyectos[]` gana: `manifiesto` (`"válido" | "ausente" | "inválido: <ruta del error>"`), `preset` y su origen (manifiesto, `machine.json` o por defecto), `reglas` efectivas, `repos[]` (id, ruta, origen de la ruta, existe, esGit, rama) y `roots` (si una raíz de la sesión coincide, y con qué fuerza).
- `Diagnostico.configuracion`: `configDir`, `machine.json` (existe, válido, número de overrides) y presets disponibles con su origen.
- `doctor --proyecto P --fase N`: imprime la `procedencia` de cada ranura de esa fase, con la capa y el archivo:línea que ganó y los modos que se aplicaron.
- **Códigos nuevos:** `MANIFIESTO-INVALIDO` (error), `MANIFIESTO-CONFLICTO` (aviso), `PRESET-NO-EXISTE` (error), `PRESET-IMPLICITO` (aviso: proyecto sin manifiesto ni `presetPorDefecto` que tiene tareas creadas antes de la 3.0), `BLOQUE-HUERFANO` (aviso), `BLOQUE-DUPLICADO` (aviso), `BLOQUE-MAL-FORMADO` (aviso), `GLOBAL-REINYECTADO` (aviso, sustituye a `GLOBAL-SIN-BASE`), `REPO-NO-EXISTE` (aviso), `GIT-NO-INSTALADO` (aviso), `ROOTS-AMBIGUO` (info).
- **Recurso nuevo:** `phase-gate://configuracion/{proyecto}` (`text/markdown`) con el manifiesto efectivo, la procedencia de cada valor y el estado de los repos.

### 5.10 Lotes de la Etapa 3

| Lote | Objetivo | Archivos | Verificación | Commit propuesto |
|---|---|---|---|---|
| **L01** | Prompts de fábrica bajo `prompts/es/` y paquete con `presets` y `schema` | `prompts/es/**` (movidos con `git mv`), `src/config.ts` (`defaultPromptsPath`), `package.json` (`files`), `test/phases.test.ts`, `test/prompts.test.ts`, `test/docs.test.ts`, `docs/decisiones.md` | Base verde; `npm pack --dry-run` lista `prompts/es/…`, sin rastro de `prompts/fase-*` en la raíz; un `ORQUESTADOR_PROMPTS_PATH` existente sigue funcionando | `refactor(prompts): mover los prompts de fábrica a prompts/es` |
| **L02** | Parser de bloques y motor de capas con modos, huérfanos y reinyección de BASE y PENDIENTES; ranura `global/extra` | `src/bloques.ts`, `src/capas.ts` (nuevos), `src/phases.ts`, `prompts/es/global-rules.md`, `test/bloques.test.ts`, `test/capas.test.ts` (nuevos), `docs/decisiones.md`, `test/prompts.test.ts` (el catálogo pasa a 23 ranuras) | Base verde. Fixtures: los tres modos, el orden por capas, un huérfano, un duplicado, uno mal formado, la reinyección y `extra` vacía sin encabezado | `feat(capas): ensamblar los prompts con bloques por capas` |
| **L03** | Manifiesto, `machine.json`, `configDir` y JSON Schema generado | `src/manifiesto.ts` (nuevo), `src/config.ts`, `schema/project.json`, `schema/machine.json` (nuevos), `scripts/generar-esquemas.mjs` (nuevo), `test/manifiesto.test.ts` (nuevo), `test/helpers.ts`, `docs/decisiones.md` | Base verde. Válidos e inválidos (id repetido, `dir` absoluto, `..`, clave desconocida); claves de `machine.json` con distintas mayúsculas; el test de sincronía de `schema/*.json`. `test/helpers.ts` gana `configTemporal()` (crea una carpeta temporal y define `PHASE_GATE_CONFIG_PATH`), y `limpiarEntorno()` borra `PHASE_GATE_CONFIG_PATH`. Los tests de `machine.json`, presets de usuario, `init` y `eject` usan `configTemporal()` | `feat(config): manifiesto phase-gate.json por proyecto y machine.json por equipo` |
| **L04** | Prompts y deducción por proyecto; variantes de regla; bloque CONFIGURACIÓN DEL PROYECTO; repos por tarea en `start_task` | `src/phases.ts`, `src/tasks.ts`, `src/servidor.ts`, `src/prompts-mcp.ts`, `src/schemas.ts`, `prompts/es/reglas/*.md` (nuevos), tests, `docs/decisiones.md` | Base verde; los E2E de las Etapas 0 a 2 pasan sin cambios en un proyecto sin manifiesto con `presetPorDefecto: software-replica` | `feat(proyectos): prompts, reglas y deducción de fase por proyecto` |
| **L05** | Ranuras base genéricas y `software-replica` | `prompts/es/fase-1…4-*.md`, `presets/es/software-replica.md` (nuevo), `test/oro/2.2.0/fase-1…5.txt` (nuevos), `test/oro.test.ts` (nuevo), `docs/decisiones.md` | **Prueba de oro**: `software-replica` reproduce la `2.2.0` byte a byte en las 5 fases, con `incluirConfigProyecto: false` | `feat(presets): prompts base genéricos y tu flujo actual como software-replica` |
| **L06** | Presets `software-tdd`, `multi-repo-feature`, `ai-agent-ops` y `research-ops` | `presets/es/*.md`, `test/presets.test.ts` (nuevo) | Ningún preset produce `BLOQUE-HUERFANO` ni `BLOQUE-MAL-FORMADO`; cada uno ensambla las 5 fases sin `<!--` en la salida | `feat(presets): software-tdd, multi-repo, ai-agent-ops y research-ops` |
| **L07** | Proyecto por Roots y `project` opcional | `src/roots.ts` (nuevo), `src/servidor.ts`, `src/schemas.ts`, `src/tasks.ts`, `test/roots.test.ts` (nuevo), `test/servidor.test.ts`, `docs/decisiones.md` | `InMemoryTransport` con cliente con y sin `roots`: único, ambiguo, ninguno, coincidencia débil, raíz dentro de la Documentación, `list_changed`; URIs con `c%3A` y espacios | `feat(roots): deducir el proyecto de la carpeta abierta en el cliente` |
| **L08** | `read_repo_file`, `repo_status` y la puerta única a git | `src/git.ts`, `src/repos.ts` (nuevos), `src/servidor.ts`, `src/schemas.ts`, `test/repos.test.ts` (nuevo), `docs/decisiones.md` | Repos temporales con y sin commits, con upstream, separado, sucio; un repo con `core.fsmonitor` apuntando a un script **no** lo ejecuta; `.git/config` no se puede leer, tampoco a través de un symlink interno que apunte a `.git` | `feat(repos): leer archivos y estado de git por id de repositorio` |
| **L09** | `init` | `src/cli.ts`, `src/init.ts` (nuevo), `test/init.test.ts` (nuevo), `docs/decisiones.md` | HOME y APPDATA temporales: crea, fusiona, "sin cambios", diff con clave distinta, JSON con comentarios, JSON roto sin tocar, copia `.bak`, `--comandos` respeta archivos sin marca, `--migrate` solo crea, `--dry-run` no escribe nada (se comprueba el árbol antes y después) | `feat(cli): init registra el servidor en los clientes y migra los proyectos` |
| **L10** | `eject` | `src/eject.ts` (nuevo), `src/cli.ts`, `test/eject.test.ts` (nuevo) | Cada objetivo de §5.8.2; rechazo sin `--fuerza`; tras `eject fase-3/pruebas --a proyecto:X`, `doctor --fase 3 --proyecto X` muestra que gana `bloques.md` del proyecto | `feat(cli): eject copia un prompt, una ranura o un preset para editarlo` |
| **L11** | `doctor`, `get_orchestrator_status` y recurso de configuración ampliados | `src/diagnostico.ts`, `src/recursos.ts`, tests | Cada código nuevo de §5.9 tiene su test | `feat(diagnostico): mostrar presets, manifiestos, repos, raíces y procedencia de cada ranura` |
| **L12** | README y guía de migración a v3 | `README.md`, `README.es.md` | Ambos explican manifiesto, presets, bloques, capas, Roots, tools multi-repo, `init`, `eject` y la migración en 3 pasos | `docs(readme): configuración por proyecto, presets y migración a la 3.0` |
| **L13** | Prerelease `3.0.0-beta.0` publicada con la etiqueta `beta` | `package.json`, `package-lock.json`, `.github/workflows/publish.yml` | El workflow publica con `--tag beta` si la versión contiene `-`, comprobado con un *dry run* local de la expresión; base verde. El tag `v3.0.0-beta.0` lo pone la autora | `chore(release): 3.0.0-beta.0 publicada con la etiqueta beta` |

> **Estado de ejecución:** de L01 a L13 hechos, en la rama `etapa-3/configuracion`, y auditados (ajustes A1 a A8). Commits, desvíos (E3-D1 a E3-D14), la auditoría y lo que queda por comprobar fuera de este equipo en §9.9.

**Por qué este orden.**
- Mover los prompts (L01) primero, porque todo lo demás los busca en su sitio nuevo.
- El motor (L02) y el manifiesto (L03) son independientes entre sí y se prueban con fixtures.
- L04 los une sin cambiar ningún texto.
- L05 cambia textos con la prueba de oro como red, y L06 añade presets nuevos.
- Roots (L07) y repos (L08) dependen del manifiesto.
- El CLI (L09 y L10) usa todo lo anterior.
- `doctor` (L11) lo muestra, y la documentación y la release van al final.

### 5.11 Lo que NO se toca en la Etapa 3

- La deducción de fase por existencia de documentos (solo pasa a recibir las fases del proyecto).
- La compuerta y su regla.
- El formato de los punteros.
- La protección R4 y SEG-M.
- Los contratos de recibos de §3.5.2.
- Las tools de la Etapa 2 (solo `project` pasa a opcional).
- `record_batch` (Etapa 4).
- El Studio (Etapa 5).
- El idioma inglés (Etapa 6: aquí solo se prepara `prompts/<idioma>/`).

### 5.12 Riesgos

| # | Riesgo | Estado | Mitigación |
|---|---|---|---|
| E3-R1 | El preset por defecto cambia a `software` y tus proyectos sin manifiesto pierden la réplica sin que lo notes | Abierto | `presetPorDefecto` en `machine.json` o `init --migrate`; aviso `PRESET-IMPLICITO`; la línea "Preset: software (por defecto…)" en cada prompt; la guía de migración |
| E3-R2 | El manifiesto se edita en dos equipos y OneDrive deja una copia en conflicto | Aceptado | `MANIFIESTO-CONFLICTO` en `doctor` |
| E3-R3 | Las raíces son ambiguas o el cliente no soporta Roots | Aceptado | Caída a `project` explícito y al puntero; `ROOTS-AMBIGUO` |
| E3-R4 | `git status` toma locks o ejecuta `fsmonitor` | Cerrado | `GIT_OPTIONAL_LOCKS=0`, `-c core.fsmonitor=false`, timeout, prueba con un `fsmonitor` trampa |
| E3-R5 | `init` corrompe la configuración del cliente | Aceptado | Copia `.bak`, no toca un JSON que no se puede leer, diff y confirmación, `--dry-run` |
| E3-R6 | El motor de bloques vuelve opaco qué texto recibe el modelo | Abierto | `doctor --fase --proyecto` con procedencia; `eject`; el Estudio de la Etapa 5 |
| E3-R7 | Una prerelease se publica como `latest` | Cerrado | `--tag beta` en L13 |
| E3-R8 | La prueba de oro se rompe por un cambio legítimo posterior en el texto base | Aceptado | La prueba de oro compara contra la 2.2.0 solo para `software-replica`. Si se cambia a propósito un texto compartido, se regeneran los archivos de oro en el mismo lote y se dice en el commit |
| E3-R9 | Un `machine.json` con rutas de otro equipo (copiado a mano) | Aceptado | `REPO-NO-EXISTE` |

### 5.13 ADRs de la Etapa 3

| Lote | Título de la entrada | Reemplaza o amplía |
|---|---|---|
| L01 | Los prompts de fábrica viven en `prompts/<idioma>/` | Amplía 2026-08-10 (capas) |
| L02 | Los presets y las personalizaciones se escriben como bloques sobre ranuras, en un solo archivo, con modos `reemplazar`, `antes` y `despues` | **Reemplaza** en parte 2026-08-10 "`global-rules.md` sustituye, no concatena": BASE y PENDIENTES se reinyectan y la forma recomendada son las ranuras |
| L03 | Cada proyecto puede declarar un `phase-gate.json`; cada equipo, un `machine.json` | **Reemplaza** el rechazo a un archivo de configuración de 2026-08-08 ("Los proyectos son las carpetas…", issue #3, y "El nombre del documento lo declara el prompt") y el de "espacios declarados en un config.json" de 2026-08-10. Los proyectos siguen siendo carpetas; el manifiesto es opcional |
| L04 | Las fases, los prompts y la deducción se resuelven por proyecto; la política de commits pasa a ser configurable con cuatro variantes, y el push queda fuera de cualquier variante | Amplía 2026-08-08 (fase deducida) y la ADR de commits de la Etapa 1 (L07) |
| L05 | El preset por defecto es `software`; la réplica pasa a `software-replica` | **Reemplaza** 2026-08-07 "Sin suite de pruebas: la comparación contra la réplica ocupa ese lugar", que deja de ser regla general |
| L07 | El servidor deduce el proyecto de las raíces del cliente | Amplía 2026-08-08 "La compuerta… la resuelve el servidor" |
| L08 | Git se consulta por una sola puerta, de solo lectura y sin efectos | Nueva |
| L09 | `init` escribe la configuración del cliente con copia, diff y confirmación | **Reemplaza** el descarte de 2026-08-10 ("una app de escritorio… para un público que ya edita un `mcp.json` a mano") en lo que toca a escribir la configuración |

### 5.14 Estado de cierre de la Etapa 3

**Cerrada** en la iteración 4. Decisiones de cierre:

| # | Decisión |
|---|---|
| F1 | Los presets son del proyecto, no de cada repo; además, una tarea puede declarar su propio `preset` (G1) |
| F2 | Un manifiesto inválido es un error explícito; nunca se cae en silencio a los valores por defecto |
| F3 | Ranura `global/extra` (catálogo de 23) y modos `reemplazar`, `antes` y `despues`; la reinyección de BASE y PENDIENTES cierra E1-R1 |
| F4 | Los prompts de fábrica se mueven a `prompts/es/` en L01 |
| F5 | Claves de `machine.json` como `"<PROYECTO>/<repo id>"`, con el proyecto comparado en minúsculas, y `presetPorDefecto` como vía de migración |

Ajustes incorporados en esta iteración:

| # | Ajuste | Dónde |
|---|---|---|
| G1 | `preset` opcional por tarea, en `start_task` y en el frontmatter de `00 - Contexto Inicial.md`, con precedencia tarea > proyecto > `machine.json` > `software` | §5.2.3, §5.3.1, §5.3.4, §5.4.1, §5.4.4 |
| G2 | La prueba de oro compara con `incluirConfigProyecto: false` | §5.3.4, §5.5.2, L05 |
| G3 | `read_repo_file` aplica la regla `.git` también a la ruta ya resuelta, contra symlinks internos | §5.7, L08 |
| G4 | `PHASE_GATE_CONFIG_PATH` en `leerVariable`, en `limpiarEntorno()` y en el helper `configTemporal()` | §5.2.2, L03 |
| G5 | La parte `<PROYECTO>` de las claves de `machine.json` se compara en minúsculas | §5.2.2, L03 |

## 6. Etapa 4 — `3.0.0` Motor de lotes en el servidor

**Base:** fin de la Etapa 3 (`3.0.0-beta`). **Estado: cerrada** (iteración 5).

**Alcance:** 11 lotes.
- Parser y serializador deterministas de recibos.
- Verificación de anclas (commit en la rama, sha256, nota).
- `record_batch` con registro en dos tiempos.
- Ensamblado automático de `04 - Ejecución.md`.
- Sellado de recibos y servidor como único escritor de la Fase 4.
- Progreso por lote en la deducción.
- `get_batch_status`.
- Commits verificados al final del prompt de la Fase 5.
- Prompts y comandos de la Fase 4 apoyados en las tools.
- `doctor`, documentación y la release estable `3.0.0`.

### 6.1 Comprobado antes de escribir este plan

Comprobado con git 2.43 sobre un repo temporal (dos commits en `main` y uno en la rama `otra`) y con Node 22.22.

| Verificación | Resultado y qué cambió en el plan |
|---|---|
| `git cat-file -e <x>^{commit}` | Código de salida `0` con un SHA de 40 caracteres, con uno de 7 **y con `HEAD`**. Con un árbol o un blob, `128` y "expected commit type". Con un SHA inexistente, `128`. Solo dice si existe. **Cambio:** se usa `rev-parse` (fila siguiente), que además devuelve el SHA completo. |
| `git rev-parse --verify --quiet --end-of-options <x>^{commit}` | `0` y el SHA de 40 caracteres en stdout, desde un prefijo de 7. **Con un prefijo de 4 caracteres también resuelve.** Inexistente: `1` y salida vacía. `--help^{commit}` no se interpreta como opción gracias a `--end-of-options`. Un prefijo ambiguo falla con "short object ID … is ambiguous". **Cambio:** antes de llamar a git, el argumento se valida con `/^[0-9a-f]{7,40}$/i`. Así no entran referencias (`HEAD`, nombres de rama), prefijos cortos ni opciones, y se guarda siempre el SHA completo. |
| `git merge-base --is-ancestor <sha> HEAD` | `0` si el commit está en la rama actual; `1` si existe pero está en otra rama (el commit de `otra` probado desde `main`); `128` si no existe. **Los tres códigos se distinguen** para dar mensajes distintos. |
| ¿En qué rama está un commit que no es ancestro? | `git branch --contains <sha> --format=%(refname:short)` lista las ramas (`otra`). Solo sirve para dar un mensaje útil, no para decidir. |
| Archivos de un commit | `git diff-tree --no-commit-id --name-only -r -z --root <sha>` los lista separados por NUL, incluido el primer commit del repo (por eso `--root`). **Cambio:** el servidor compara esa lista con la tabla `Archivos` del recibo y deja escrita cualquier diferencia. |
| Metadatos para el índice | `git show -s --format=%H%n%h%n%cI%n%s <sha>` da SHA completo, corto, fecha ISO y asunto. Para el SHA corto se fija `--short=7`. |
| sha256 en Node 22 | `crypto.createHash("sha256")` con `stream/promises.pipeline` sobre `fs.createReadStream` da el mismo resultado que `sha256sum` y que el cálculo sobre `Buffer`. Se usa la versión en streaming, para no cargar archivos grandes en memoria. `crypto.hash` (de una pasada) también existe, pero exige el archivo entero en memoria. |
| sha256 y finales de línea | El hash es de los bytes. Un archivo de texto dentro de un repo con `core.autocrlf` tiene **otros bytes en Windows que en Linux o macOS**, así que su sha256 cambia de equipo a equipo. **Cambio:** al reverificar, si el sha256 no coincide, se calcula también con `\r\n` convertido a `\n`, y si ese coincide se informa "idéntico salvo finales de línea" en lugar de "cambió". |

### 6.2 Recibos como datos (lote L01)

**`src/recibos.ts` (nuevo):** el único lugar que lee y escribe recibos.

```ts
export type EstadoLote = "verificado" | "con pendientes" | "fallido" | "descartado";

export type Ancla =
  | { tipo: "commit"; repo: string; sha: string; corto: string; asunto: string; rama: string; verificado: string }
  | { tipo: "sha256"; ruta: string; sha256: string; bytes: number; verificado: string }
  | { tipo: "nota"; texto: string }
  | { tipo: "pendiente" };

export type Recibo = {
  lote: number; de: number; titulo: string;
  repo: string | null; rama: string | null;
  estado: EstadoLote; ancla: Ancla;
  fecha: string;                         // AAAA-MM-DD
  registrado: string;                    // ISO, fecha de la última escritura por el servidor
  origen: "servidor" | "manual";         // manual = recibo escrito a mano con la 2.x
  queSeHizo: string;
  archivos: { archivo: string; cambio: string }[];
  verificacion: string;
  esperaAlUsuario: { prueba: string; esperado: string }[];
  desvios: string;
  decisiones: string;
  condicionales: { titulo: "Lo que sigue igual" | "Reversión" | "Aviso a alguien más" | "Deuda anotada"; texto: string }[];
  verificacionDelCommit: string | null;  // diferencias entre el commit y la tabla Archivos
};

export function leerRecibo(ruta: string): Recibo                  // tolerante con los de la 2.x
export function escribirRecibo(r: Recibo): string                  // texto determinista
export function nombreDeRecibo(lote: number, titulo: string): string   // "L02 - filtro por categoría.md"
```

**Formato que produce `escribirRecibo`.** Es la plantilla de §3.5.2 con claves añadidas al frontmatter. Las claves de la 2.x se conservan, así que un recibo de la 3.0 sigue siendo legible con las reglas de la Etapa 1.

```markdown
---
lote: L02
de: 4
repo: api
rama: feat/filtro
estado: verificado
commit: a1b2c3d
fecha: 2026-11-03
ancla: commit
commit_completo: a1b2c3d4e5f6…(40)
asunto: fix(filtros): incluir los productos sin categoría
registrado: 2026-11-03T18:22:41.000Z
origen: servidor
---

# L02 — filtro por categoría

## Qué se hizo
…
## Archivos
| Archivo | Qué cambió |
|---|---|
…
## Verificación ejecutada
…
## Espera al usuario
…
## Desvíos del plan
…
## Decisiones
…
## Verificación del commit
El commit toca exactamente los 3 archivos declarados.
```

Reglas del formato:
- **Claves del frontmatter en ese orden fijo.** Con `ancla: sha256` van `artefacto` (ruta) y `sha256` en lugar de `commit_completo` y `asunto`; con `ancla: nota` va `nota`. `commit` vale el SHA corto, `pendiente` o `no aplica`, como en la Etapa 1.
- **Las tablas** escapan `|` como `\|` y convierten los saltos de línea de una celda en `<br>`.
- **"Verificación del commit"** solo existe con `ancla: commit`.
- **Secciones vacías:** "Ninguna." o "Ninguno.", nunca un encabezado sin texto. "Espera al usuario" vacía escribe "Ninguna.", y las secciones condicionales solo se escriben si traen texto.
- **Determinismo:** el mismo `Recibo` produce siempre los mismos bytes. Finales de línea `\n` y un salto final.

**Nombre del recibo** (`nombreDeRecibo`):
1. `L` más el número con dos dígitos (`L01`…`L99`), `" - "` y el *slug*.
2. *Slug*: el título en NFC; todo lo que no sea letra, número, espacio o guion pasa a espacio; se colapsan espacios; se corta a **40** caracteres sin partir palabras (validación V7: con una Documentación en una carpeta sincronizada de ruta larga, un slug de 60 puede dejar la ruta del recibo cerca de 255 caracteres); se quitan espacios y puntos finales.
3. Si queda vacío, el slug es `lote`.
4. El resultado pasa `validarSegmento`. Así el ajuste A3 de la Etapa 1 lo hace cumplir el servidor, no el modelo.

**Finales de línea:** `leerRecibo` normaliza `\r\n` a `\n` antes de parsear (§1.3); `escribirRecibo` escribe siempre LF.

**Lectura tolerante** (`leerRecibo`). Un recibo escrito a mano con la 2.x:
- Sin `ancla`: se deduce de `commit` (hash → `commit` sin verificar; `pendiente`; `no aplica` → `nota`).
- Sin `origen`: queda como `manual`.
- Secciones que no aparecen: se leen vacías.
- Nunca lanza por una sección inesperada.

### 6.3 Verificación de anclas (lote L02)

**`src/git.ts` gana** (todas pasan por la puerta única de la Etapa 3):

```ts
export const SHA = /^[0-9a-f]{7,40}$/i;
export async function resolverCommit(dir: string, sha: string):
  Promise<{ ok: true; sha: string } | { ok: false; motivo: "formato" | "no-existe" | "ambiguo" }>
export async function esAncestroDeHead(dir: string, sha: string): Promise<"si" | "no" | "error">
export async function ramasQueContienen(dir: string, sha: string): Promise<string[]>
export async function datosDeCommit(dir: string, sha: string): Promise<{ sha: string; corto: string; fecha: string; asunto: string }>
export async function archivosDeCommit(dir: string, sha: string): Promise<string[]>   // diff-tree -z --root
export async function ramaActual(dir: string): Promise<string | null>
export async function sonConsecutivos(dir: string, shas: string[]): Promise<boolean>   // §6.8
```

Argumentos exactos: `rev-parse --verify --quiet --end-of-options <sha>^{commit}`, `merge-base --is-ancestor <sha> HEAD`, `branch --contains <sha> --format=%(refname:short)`, `show -s --format=%H%n%h%n%cI%n%s --abbrev=7 <sha>` y `diff-tree --no-commit-id --name-only -r -z --root <sha>`. El `<sha>` llega siempre ya validado con `SHA`.

**`src/anclas.ts` (nuevo):**

```ts
export async function anclarCommit(proyecto: string, repoId: string, sha: string, archivosDeclarados: string[]):
  Promise<{ ancla: Extract<Ancla, { tipo: "commit" }>; verificacionDelCommit: string }>
export async function anclarArtefacto(proyecto: string, repoId: string | null, ruta: string):
  Promise<Extract<Ancla, { tipo: "sha256" }>>
export async function reverificar(proyecto: string, recibo: Recibo):
  Promise<{ vigente: boolean; texto: string }>
```

**`anclarCommit`:**
1. `resolverRepo(proyecto, repoId)` (Etapa 3) da el `cwd`.
2. `resolverCommit`. Errores:
   - `formato`: "El commit tiene que ser un hash de 7 a 40 caracteres hexadecimales."
   - `no-existe`: "El commit `<sha>` no existe en el repo `<id>` (`<ruta>`). ¿Se hizo en otro repositorio o todavía no se ha hecho?"
   - `ambiguo`: "El hash `<sha>` es ambiguo en `<id>`; usa más caracteres."
3. `esAncestroDeHead`:
   - `no`: error "El commit `<corto>` existe pero no está en la rama actual (`<rama>`); está en: `<ramas>`. Cambia a la rama del trabajo o registra el commit correcto."
   - `error`: error con la salida de git.
4. `datosDeCommit` y `ramaActual` rellenan el ancla; `verificado` es la hora del servidor.
5. **Comparación de archivos:** `archivosDeCommit` frente a la columna `archivo` de la tabla (normalizada a `/` y relativa al repo).
   - Iguales: "El commit toca exactamente los N archivos declarados."
   - Si no, dos listas: "En el commit y no en el recibo: …" y "En el recibo y no en el commit: …".

   Es un **aviso**, no un bloqueo (decisión 5 de §6.12). Queda escrito en el recibo y en la respuesta.
6. **Un commit, un lote:** si el mismo SHA completo ya está en otro recibo de la tarea, error "El commit `<corto>` ya es el ancla de L0x. Cada lote es un commit."

**`anclarArtefacto`:**
- **Base de la ruta:** con `repoId`, la raíz real del repo; sin él, `<DOCS>/<PROYECTO>/`.
- **Contención:** cada segmento pasa `validarSegmento`, luego `estaDentroReal` y la regla `.git` de la Etapa 3.
- **Tamaño:** archivos regulares de hasta 256 MB. Más grande: error "El artefacto pesa N MB; el máximo para sellarlo es 256 MB."
- **Hash:** sha256 en streaming.
- **Ruta guardada en el ancla:** `repo:<id>/<ruta>` o `proyecto:<ruta>`, siempre con `/`.

**`reverificar`** (para `get_batch_status` y la Fase 5):
- `commit`: repite `resolverCommit` y `esAncestroDeHead`. Si ya no está en la rama: "El commit `<corto>` ya no está en la rama actual (`<rama>`). ¿Rebase o squash? Vuelve a anclar el lote." (§6.5).
- `sha256`: recalcula. Si no coincide, prueba con los finales de línea normalizados (§6.1).
- `nota` y `pendiente`: no hay nada que comprobar.

### 6.4 `record_batch` (lote L03)

**`src/schemas.ts`:**

```ts
const ID_REPO = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const FILA_ARCHIVO = z.object({ archivo: z.string().min(1), cambio: z.string().min(1) }).strict();
const FILA_ESPERA = z.object({ prueba: z.string().min(1), esperado: z.string().min(1) }).strict();
const CONDICIONAL = z.object({
  titulo: z.enum(["Lo que sigue igual", "Reversión", "Aviso a alguien más", "Deuda anotada"]),
  texto: z.string().min(1),
}).strict();

export const recordBatchShape = {
  project: z.string().optional(),
  task_name: z.string().optional(),          // por defecto, la tarea activa
  lote: z.number().int().min(1).max(99),
  // Contenido: obligatorio al crear el recibo; opcional al solo anclar un recibo pendiente.
  titulo: z.string().min(1).max(120).optional(),
  repo: ID_REPO.optional(),
  estado: z.enum(["verificado", "con pendientes", "fallido", "descartado"]).optional(),
  que_se_hizo: z.string().min(1).optional(),
  archivos: z.array(FILA_ARCHIVO).max(200).optional(),
  verificacion: z.string().min(1).optional(),
  espera_al_usuario: z.array(FILA_ESPERA).max(50).optional(),
  desvios: z.string().optional(),
  decisiones: z.string().optional(),
  condicionales: z.array(CONDICIONAL).max(4).optional(),
  // Ancla (como mucho una de las tres):
  commit: z.string().optional(),             // validado con SHA en el servidor, para dar un mensaje propio
  artifact_path: z.string().optional(),
  verification_note: z.string().min(1).max(2000).optional(),
  // Cierre:
  // Cierre: los añade L04 (en L03 el shape aún no los tiene)
  cerrar_fase: z.boolean().optional(),
  motivo_descarte: z.string().min(1).max(500).optional(),   // con cerrar_fase, para los lotes que falten
  // Sellado: lo añade L05
  reanclar: z.boolean().optional(),          // §6.5: cambiar el ancla de un recibo sellado
  force: z.boolean().optional(),
};

export const recordBatchOutput = {
  recibo: z.string(),                        // ruta relativa a la tarea
  lote: z.string(), de: z.number(),
  estado: z.string(),
  ancla: z.object({ tipo: z.string(), resumen: z.string() }),
  avisos: z.array(z.string()),
  siguiente: z.string().nullable(),          // "L03" o null
  faseCerrada: z.boolean(),
  documentoDeFase: z.string().nullable(),    // "04 - Ejecución.md" si se generó
};
```

Anotaciones: `readOnlyHint: false`, `destructiveHint: false` (nunca toca un recibo sellado sin confirmación), `idempotentHint: false`, `openWorldHint: false`.

**Algoritmo:**

1. **Tarea:** proyecto (argumento, Roots o error) y tarea (`task_name` o la activa). La tarea debe tener `03 - Plan Técnico.md` (el nombre de su proyecto).
2. **Número de lotes:** el frontmatter del plan.
   - Falta `lotes`: error "El plan no declara `lotes: N` en su frontmatter. Añádelo a `03 - Plan Técnico.md` antes del primer recibo." (Mientras no haya recibos, el plan aún no está congelado.)
   - `lotes` fuera de 1…99, o no entero: error con el valor encontrado.
   - `lote > N`: error "El plan declara N lotes; L0x no existe. Si el plan cambió, actualiza su frontmatter: el plan ya está congelado, así que hará falta la confirmación del usuario, y el cambio va como decisión en los Desvíos del recibo."
3. **Orden:** todos los lotes `1…lote-1` tienen recibo con ancla distinta de `pendiente` (un `fallido` o `descartado` cuenta como cerrado). Si no, error "Antes de L0x hay que cerrar L0y: le falta el recibo" o "…: su commit sigue pendiente."
4. **¿Crear, actualizar o anclar?** Se busca un recibo existente que empiece por `L0x - ` en la subcarpeta:

| Situación | Modo | Qué exige |
|---|---|---|
| No hay recibo del lote | **crear** | `titulo`, `estado`, `que_se_hizo` y `verificacion` |
| Hay recibo con ancla `pendiente` y llega contenido | **reemplazar** | lo mismo; si cambia el título, se renombra el archivo |
| Hay recibo con ancla `pendiente` y solo llega el ancla | **anclar** | `commit`, `artifact_path` o `verification_note` |
| Hay recibo `fallido` o con ancla `nota` | **reemplazar** | nuevo intento del lote: no está sellado |
| Hay recibo **sellado** (ancla `commit` o `sha256`) | rechazo | salvo `reanclar` con confirmación (§6.5) |

5. **Repo del lote:**
   - Argumento `repo`. Si falta: el único repo de la tarea (frontmatter de `00` o manifiesto).
   - Con varios repos y sin argumento: error con la lista.
   - Con `repos: []`: `null`.
6. **Ancla** según la política efectiva de la tarea (Etapa 3: tarea, manifiesto, preset):

| Estado del lote | Repo con git y política ≠ `ninguno` | Repo sin git, `repos: []` o política `ninguno` |
|---|---|---|
| `verificado` o `con pendientes` | `commit` → `anclarCommit`. Sin `commit` → ancla `pendiente` | `artifact_path` → `anclarArtefacto`, o `verification_note` → `nota`. Sin ninguno → error "Sin git, el lote necesita un ancla: `artifact_path` o `verification_note`." Un `commit` pasado igualmente se verifica si el repo tiene git |
| `fallido` o `descartado` | ancla `nota` con `verification_note` o, si falta, "no aplica (lote <estado>)". Un `commit` aquí es error: un lote fallido no se commitea | igual |

   Más de un tipo de ancla en la misma llamada: error "Pasa solo una ancla: `commit`, `artifact_path` o `verification_note`."
7. **Escritura:** `escribirRecibo` en `<tarea>/<recibos>/<nombreDeRecibo>`, con escritura atómica (temporal y renombrado). Si el recibo existente cambió en disco desde que se leyó (comparando `mtimeMs`), error "Otro proceso modificó este recibo; vuelve a llamar." Con `lotes: 1` también se usa la subcarpeta mientras el lote está abierto (§6.6).
8. **Cierre:** si todos los lotes `1…N` quedaron cerrados (ancla distinta de `pendiente` y estado distinto de `fallido`), se ensambla `04 - Ejecución.md` (§6.6). También con `cerrar_fase` (§6.6).
9. **Respuesta:** texto de una o dos líneas más `structuredContent`, por ejemplo: "L02 de 4 registrado: verificado · commit a1b2c3d en `api` (feat/filtro). Siguiente: L03." Con `ancla: pendiente`: "L02 de 4 registrado con el commit pendiente. Cuando exista, llama de nuevo a `record_batch` con `lote: 2` y `commit`."

**Dos tiempos para todas las políticas con git.** El ciclo de la Etapa 1 escribe el recibo **antes** del commit para que sobreviva a un corte del chat, y eso no cambia:

| Política | Llamadas por lote |
|---|---|
| `agente-commitea-con-OK` | 1) recibo con el commit pendiente → OK del usuario → `git commit` → 2) `record_batch` con `lote` y `commit` |
| `auto` | igual, sin esperar OK |
| `agente-propone` | igual, pero la segunda llamada llega cuando el usuario dice el hash (puede ser mucho después) |
| `ninguno` o sin git | una sola llamada, con `artifact_path` o `verification_note` |

Si el commit ya existe cuando se registra el lote, se puede pasar en la primera llamada y queda en un solo tiempo.

### 6.5 Sellado, `reanclar` y protección actualizada (lote L05)

**Recibo sellado:** el que tiene ancla `commit` o `sha256`, sea `origen: servidor` o un recibo manual de la 2.x con un hash. Para cambiarlo:
- `record_batch` con `reanclar: true`. El caso típico es un rebase o un squash que cambió el SHA.
- Pasa por `pedirConfirmacion` (Etapa 2) con la pregunta "El recibo L0x está sellado con el commit `<corto>`. ¿Reemplazar su ancla por `<nuevo>`?". Sin elicitation, cae a `force: true` (Etapa 1).
- `reanclar` solo cambia el ancla y añade al final de "Verificación del commit" la línea "Reanclado el <fecha>: `<viejo>` → `<nuevo>`". El contenido del lote no se toca.

**`motivoDeProteccion` (Etapa 1, §3.7.3) gana tres reglas**, que se evalúan antes que las de siempre:

| Se escribe con `write_central_doc` | Resultado | Motivo |
|---|---|---|
| Cualquier archivo en la subcarpeta de recibos | **rechazo siempre** | "Los recibos los escribe `record_batch`." |
| El documento de la Fase 4 (`04 - Ejecución.md`) | **rechazo siempre** | "Este documento lo genera `record_batch` al cerrar el último lote." Cierra E1-R3 |
| Otro documento, si la Fase 4 está presente | regla de congelamiento de siempre (A2) | — |

Las dos primeras filas también aceptan la escotilla de confirmación (elicitation o `force`). Es la puerta de emergencia para reparar a mano un archivo dañado, y la respuesta lo dice: "escrito a mano con confirmación; `get_batch_status` lo marcará como manual".

La tabla de verdad de §3.7.3 gana estas filas:

| Existen | Se escribe con `write_central_doc` | Resultado |
|---|---|---|
| 00…03, recibos | `04 - Ejecución/L02 - x.md` | rechazo: lo escribe `record_batch` |
| 00…03, recibos | `04 - Ejecución.md` | rechazo: lo genera `record_batch` |
| 00…03 | `04 - Ejecución.md` | rechazo: lo genera `record_batch` |

`start_task` y `record_batch` no pasan por `write_central_doc`, así que estas reglas no los afectan. `record_batch` aplica las suyas (§6.4).

**Tareas de la 2.x en curso.** Una tarea con recibos manuales a medio camino sigue funcionando: `record_batch` lee esos recibos (tolerante) y continúa desde el siguiente lote.

### 6.6 Ensamblado automático de `04 - Ejecución.md` (lote L04)

**`ensamblarIndice(carpetaTarea, fases): string`**, determinista: los mismos recibos producen los mismos bytes.

**Cuándo se ensambla:**
- **Automático:** al terminar un `record_batch` en el que **todos** los lotes `1…N` tienen recibo con ancla distinta de `pendiente` y estado distinto de `fallido`.
- **Con `cerrar_fase: true`:**
  - Los lotes sin recibo se registran como `descartado`, con `motivo_descarte` como nota (obligatorio si falta alguno).
  - Los `fallido` se quedan como están y pasan a "Validaciones pendientes".
  - Exige confirmación (`pedirConfirmacion`, o `force` sin elicitation) con la pregunta "Cerrar la Fase 4 con L03 y L04 descartados («<motivo>»). ¿Confirmas?".
  - Con un lote abierto con commit `pendiente`: error, hay que anclarlo o descartarlo primero.

**Con más de un lote: índice** (§3.5.2, con el ajuste B1):

```markdown
---
lotes: 4
generado_por: mcp-phase-gate
---

# Ejecución — <tarea>

- **Plan:** `03 - Plan Técnico.md` · **Rama:** <rama común, o "varias (ver lotes)"> · **Cierre:** <AAAA-MM-DD>
- **Estado:** Fase cerrada sin pendientes

## Lotes
| Lote | Repo | Objetivo | Estado | Ancla | Recibo |
|---|---|---|---|---|---|
| L01 | api | corregir cálculo | verificado | commit `a1b2c3d` | `04 - Ejecución/L01 - corregir cálculo.md` |
| L02 | api | filtro por categoría | con pendientes | commit `e4f5a6b` | `04 - Ejecución/L02 - filtro por categoría.md` |
| L03 | — | ajuste de prompt | verificado | sha256 `9c1e…` | `04 - Ejecución/L03 - ajuste de prompt.md` |
| L04 | web | refactor | descartado | — | `04 - Ejecución/L04 - refactor.md` |

## Espera al usuario
| Lote | Prueba | Resultado esperado |
|---|---|---|
| L02 | … | … |

## Validaciones pendientes
- L02 (con pendientes): <primera línea de su "Verificación ejecutada">.
```

Reglas del índice:
- **Columna "Repo":** solo si algún lote tiene repo.
- **Rama:** la común a todos los recibos con ancla `commit`, o "varias (ver lotes)".
- **Fecha de cierre:** la del `registrado` más reciente de los recibos, no la hora del ensamblado. Así es determinista.
- **Línea Estado:**
  - "Fase cerrada sin pendientes" si todos están `verificado` o `descartado` y "Espera al usuario" está vacía.
  - Si no, "Fase cerrada con pendientes (ver abajo)".
  - Con descartados, se añade " · N lote(s) descartado(s)".
- **"Espera al usuario":** todas las filas de los recibos, prefijadas con su lote, sin reescribir. Si no hay ninguna, la sección se omite.
- **"Validaciones pendientes":** solo existe si hay lotes `con pendientes` o `fallido` (B1). Una línea por lote, con la primera línea de su "Verificación ejecutada".
- **Escritura** atómica; la existencia de este archivo es lo que cierra la Fase 4.

**Con un solo lote (`lotes: 1`).** Mientras el lote está abierto, su recibo vive en `04 - Ejecución/L01 - <slug>.md`. Así la fase no aparece cerrada con el commit pendiente, y la invariante "documento existe ⇔ fase cerrada" se cumple también aquí. Al cerrarse, el servidor **mueve** ese recibo a `04 - Ejecución.md` (añadiendo `lotes: 1` y `generado_por` a su frontmatter) y borra la subcarpeta si queda vacía. Al final queda **un solo archivo**, como pediste en R2, y nadie lo redactó dos veces.

### 6.7 Progreso por lote en la deducción (lote L05)

**`EstadoTarea`** (`src/tasks.ts`) gana:

```ts
lotes: null | {
  total: number | null;          // del frontmatter del plan; null si el plan no lo declara
  cerrados: number;              // recibos con ancla distinta de pendiente (fallido no cuenta)
  actual: number | null;         // primer lote sin recibo cerrado
  pendienteDeCommit: number | null;   // lote con recibo y commit pendiente
}
```

- Solo se calcula cuando la siguiente fase es la que declara `recibos` (la 4). Lee **solo frontmatter**: el del plan y el de cada recibo.
- La deducción de **fase** sigue siendo por existencia de documentos; lo nuevo es el progreso **dentro** de la fase.
- `ultimoCambio` toma también el `mtime` más reciente de la subcarpeta de recibos (cierra el punto 2c de R2).

**`describeEstado`:**

| Situación | Texto |
|---|---|
| Fase 4 sin recibos | `va en Fase 4 (Ejecución, lote 1 de 4); hechas: 1, 2, 3` |
| Lote 2 con el commit pendiente | `va en Fase 4 (Ejecución, lote 2 de 4, commit pendiente); hechas: 1, 2, 3` |
| Plan sin `lotes` | `va en Fase 4 (Ejecución; el plan no declara lotes); hechas: 1, 2, 3` |

`get_active_task`, `list_tasks` y `doctor` usan `describeEstado`, así que lo muestran sin cambios propios.

**ADR.** Esto **reemplaza** el límite asumido en 2026-08-08 ("La fase de cada tarea se deduce de sus documentos"): "La granularidad es fases terminadas, no a media fase". Ahora la Fase 4 tiene granularidad de lote, deducida de archivos que escribe el servidor.

### 6.8 `get_batch_status` y la Fase 5 (lotes L06 y L07)

**`get_batch_status`:**

```ts
export const getBatchStatusShape = {
  project: z.string().optional(),
  task_name: z.string().optional(),
  reverificar: z.boolean().optional(),   // repite la verificación de cada ancla (git y sha256)
};
```

Anotaciones: solo lectura, idempotente, `openWorldHint: false`.

Devuelve, en texto y en `structuredContent`:
- **Cabecera:** tarea, plan, `N` declarados, cerrados y siguiente acción.
- **Una fila por lote `1…N`:**
  - Lote; repo, objetivo y commit propuesto, leídos de la tabla de lotes del plan (§3.5.1).
  - Recibo (ruta o `—`), estado y ancla (tipo y resumen).
  - Origen (`servidor` o `manual`).
  - Con `reverificar`: vigente o el texto del problema.
- **Recibos sobrantes:** un recibo de un lote mayor que `N` aparece como `RECIBO-FUERA-DE-PLAN`.
- **Siguiente acción**, la primera que aplique:
  1. "Ancla L0x: falta registrar su commit."
  2. "L0x falló: reintenta o descártalo con `cerrar_fase`."
  3. "Implementa L0x."
  4. "Todos los lotes cerrados: la Fase 4 está cerrada."

**Lectura de la tabla de lotes del plan.**
- Se busca la tabla cuya cabecera empieza por `| Lote | Repo |`, el contrato de §3.5.1, y se toman las filas `L\d\d`.
- Si no se encuentra o no se puede leer, las columnas del plan quedan vacías y se añade el aviso "No pude leer la tabla de lotes del plan." **El número de lotes nunca sale de la tabla**: solo del frontmatter.

**Al final del prompt de la Fase 5** (`get_phase_prompt(5)`, junto a "ARCHIVOS DE ESTA TAREA"), el servidor añade:

````md
## COMMITS DE LA FASE 4 (verificados por el servidor al entregar este prompt)

### Repo `api` (rama feat/filtro)
| Lote | Commit | Asunto | Vigente |
|---|---|---|---|
| L01 | `a1b2c3d` | fix(calculo): … | sí |
| L02 | `e4f5a6b` | fix(filtros): … | sí |

Son consecutivos en la rama. Rango para auditar: `git log --oneline a1b2c3d^..e4f5a6b` y `git diff a1b2c3d^ e4f5a6b`.

### Sin repositorio
| Lote | Ancla | Vigente |
|---|---|---|
| L03 | sha256 `9c1e…` de `proyecto:ASISTENTE/prompt-sistema.md` | sí |

### Lotes que no entran en la auditoría
- L04: descartado («<motivo>»).
````

- `sonConsecutivos(dir, shas)`: `git rev-list --reverse <primero>^..<último>` (o `--root` si el primero no tiene padre) es exactamente la lista de los lotes, en orden.
- Si no son consecutivos: "No son consecutivos: audita cada commit con `git show <sha>`."
- Si un ancla ya no está vigente, su fila dice por qué y la sección acaba con: "Hay anclas que ya no corresponden a la rama: díselo al usuario antes de auditar."
- La regla 1 de la Fase 5 (Etapa 1, §3.4.5 e) pasa a: "ENTRADA: los commits que lista el servidor al final de este prompt, en 'COMMITS DE LA FASE 4'. Si el usuario indica otro rango, manda el suyo, y dilo si no coincide."

### 6.9 Prompts y comandos de la Fase 4 (lote L08)

**Ranura `fase-4/lotes`** (contenido de fábrica nuevo; sustituye al de §3.5.2):

````md
El plan declara cuántos lotes hay (`lotes: N` en su frontmatter) y los lista en su tabla. Se
ejecutan **uno a la vez, en su orden**, con este ciclo. Los recibos los escribe el servidor:
**nunca escribas recibos ni el documento de esta fase con `write_central_doc`** (el servidor
los rechaza).

1. **Mira dónde vas:** `get_batch_status` te dice qué lote toca y si alguno espera su commit.
2. **Implementa solo ese lote.** Nada de lotes posteriores, aunque estés en el mismo archivo.
3. **Verifícalo** con su criterio de salida, ejecutando (ver VERIFICAR).
4. **Regístralo ANTES del commit:** `record_batch` con `lote`, `titulo` (el objetivo del lote),
   `repo`, `estado`, `que_se_hizo`, `archivos`, `verificacion`, `espera_al_usuario`, `desvios`
   y `decisiones` (las `D<n>` nuevas, con su Base). Sin `commit`: queda pendiente. Si el chat
   se corta aquí, el recibo ya dice qué se hizo y qué se comprobó.
5. **Corte de commit** (ver COMMITS).
6. **Ancla el lote:** `record_batch` con `lote` y `commit` (el hash). El servidor comprueba
   que el commit exista, que esté en la rama actual y qué archivos toca; si algo no cuadra, te
   lo dice y lo deja escrito.
7. **Sigue con el siguiente lote**, anunciándolo en una línea. Al anclar el último, el servidor
   genera el documento de la fase y la cierra.

Si un lote no pasa su criterio de salida, regístralo con `estado: fallido` y lo que pasó, no
hagas commit, y detente a preguntar. Para cerrar la fase sin hacer los lotes que faltan, el
usuario tiene que decidirlo: `record_batch` con `cerrar_fase: true` y `motivo_descarte`.

Sin repositorio git, o con la política de commits `ninguno`, el paso 6 desaparece: en el paso 4
pasa `artifact_path` (el archivo que cambió, para que el servidor lo selle con su sha256) o
`verification_note`.
````

**Variantes de regla (Etapa 3, §5.4.3), su texto nuevo:**
- `commits-agente-propone.md`: el paso 2 pasa a "Cuando el usuario te diga el hash, llama a `record_batch` con `lote` y `commit`."
- `commits-auto.md`: añade "Después del commit, ancla el lote con `record_batch` (`lote` y `commit`)."
- `commits-ninguno.md`: "Al registrar el lote, pasa `artifact_path` o `verification_note`; no hay commit que anclar."
- `sin-lotes.md` (`fase-4/lotes`): "El plan tiene un solo lote (`lotes: 1`). Sigue el mismo ciclo una sola vez; al anclarlo, el servidor convierte su recibo en el documento de la fase."

**`prompts/es/comandos/f4.md`**, pasos 3 a 5 nuevos:

```md
3. Lee el plan técnico de la Fase 3 con `read_central_doc` y llama a `get_batch_status` para saber qué lote toca. Nómbrame los pendientes del plan antes de tocar código.
4. Ejecútalo **lote por lote**, como indica el prompt: implementa, verifica, registra con `record_batch`, muéstrame archivos y mensaje de commit, y con mi OK haz el commit y ánclalo con `record_batch`. Nunca hagas push.
5. No escribas recibos ni el documento de la fase a mano: los escribe el servidor y cierra la fase al anclar el último lote.
```

`.claude/commands/f4.md` se mantiene idéntico (test de sincronía de la Etapa 2).

**`prompts/es/comandos/f5.md`, línea de commits:** "Commits a auditar: si escribí un rango después del comando, usa ese. Si no, usa los que lista el servidor al final del prompt de la fase (COMMITS DE LA FASE 4)."

**Prueba de oro.** La de la Etapa 3 compara `software-replica` contra la `2.2.0`. Como esta etapa cambia a propósito el texto de la Fase 4 y de la 5, se **regenera** como `test/oro/3.0.0/` en este mismo lote (E3-R8), y el commit lo dice. Las fases 1, 2 y 3 siguen comparándose contra `test/oro/2.2.0/` sin cambios.

### 6.10 Lotes de la Etapa 4

| Lote | Objetivo | Archivos | Verificación | Commit propuesto |
|---|---|---|---|---|
| **L01** | Recibos como datos: lectura tolerante, escritura determinista, nombre y slug | `src/recibos.ts` (nuevo), `test/recibos.test.ts` (nuevo), `docs/decisiones.md` | Ida y vuelta (escribir, leer, escribir da los mismos bytes); recibos manuales de la 2.x leídos; slugs con `:`, `/`, acentos, `ñ`, 200 caracteres y vacío; `|` y saltos de línea en tablas | `feat(recibos): leer y escribir los recibos de lote como datos` |
| **L02** | Verificación de anclas | `src/git.ts`, `src/anclas.ts` (nuevo), `test/anclas.test.ts` (nuevo), `docs/decisiones.md` | Repos temporales: SHA de 40 y de 7; `HEAD`, `--help` y un prefijo de 4 rechazados antes de git; inexistente; en otra rama (con las ramas en el mensaje); primer commit (`--root`); archivos de más y de menos; mismo SHA en dos lotes; sha256 en streaming igual a `sha256sum`; mismo archivo con CRLF y LF reconocido como "salvo finales de línea"; 256 MB + 1 rechazado | `feat(anclas): verificar commits en la rama y sellar artefactos con sha256` |
| **L03** | `record_batch`: crear, reemplazar, anclar, orden, número de lotes, repo y ancla según política (sin `cerrar_fase`, `motivo_descarte` ni `reanclar`, que entran en L04 y L05) | `src/lotes.ts` (nuevo), `src/schemas.ts`, `src/servidor.ts`, `test/lotes.test.ts` (nuevo), `docs/decisiones.md` | Cada fila de las tablas de §6.4; los dos tiempos; las tres anclas; recibo modificado en disco entre lectura y escritura | `feat(lotes): record_batch registra y ancla cada lote` |
| **L04** | Ensamblado del índice, `lotes: 1` y `cerrar_fase`; añade `cerrar_fase` y `motivo_descarte` al shape | `src/lotes.ts`, `src/schemas.ts`, `test/lotes.test.ts`, `test/oro/indice-*.md` (nuevos), `docs/decisiones.md` | Índices de oro (sin pendientes, con pendientes, multi-repo, con sha256, con descartados) byte a byte; el mismo índice ensamblado dos veces es idéntico; `lotes: 1` deja un solo archivo; `cerrar_fase` pide confirmación y registra los descartes | `feat(lotes): generar el documento de la Fase 4 al cerrar el último lote` |
| **L05** | Sellado, `reanclar`, servidor como único escritor de la Fase 4 y progreso por lote; añade `reanclar` al shape | `src/tasks.ts`, `src/lotes.ts`, `src/schemas.ts`, `src/servidor.ts`, `test/tasks.test.ts`, `test/e2e.test.ts`, `docs/decisiones.md` | Las 3 filas nuevas de la tabla de verdad; `reanclar` con y sin elicitation; `describeEstado` en sus tres variantes; `ultimoCambio` sube con un recibo nuevo | `feat(proteccion): sellar los recibos y reservar la Fase 4 a record_batch` |
| **L06** | `get_batch_status` | `src/lotes.ts`, `src/servidor.ts`, `test/lotes.test.ts` | Cruce plan-recibos; recibo fuera de plan; tabla del plan ilegible; `reverificar` tras un `git commit --amend` marca el ancla como no vigente | `feat(lotes): get_batch_status cruza el plan con los recibos` |
| **L07** | Commits verificados al final del prompt de la Fase 5 | `src/git.ts` (`sonConsecutivos`), `src/phases.ts`, `test/phases.test.ts`, `docs/decisiones.md` | Consecutivos y no consecutivos; dos repos; sha256; un ancla no vigente | `feat(fase 5): entregar al auditor los commits verificados de cada repo` |
| **L08** | Prompts, variantes y comandos de la Fase 4 y la 5; prueba de oro de la 3.0.0 | `prompts/es/fase-4-ejecucion.md`, `prompts/es/fase-5-auditoria-pr.md`, `prompts/es/reglas/*.md`, `prompts/es/comandos/f4.md`, `prompts/es/comandos/f5.md`, `.claude/commands/f4.md`, `.claude/commands/f5.md`, `test/oro/3.0.0/*` (nuevos), `test/oro.test.ts` | Base verde; el test de sincronía; las fases 1-3 siguen idénticas a la 2.2.0; ningún prompt de la Fase 4 pide escribir recibos con `write_central_doc` | `feat(fase 4): ejecutar los lotes con record_batch y get_batch_status` |
| **L09** | `doctor` | `src/diagnostico.ts`, `test/diagnostico.test.ts` | Códigos nuevos: `RECIBO-FUERA-DE-PLAN`, `RECIBO-MANUAL` (info), `ANCLA-NO-VIGENTE` (aviso, solo con `doctor --reverificar`), `INDICE-DESINCRONIZADO` (aviso: `04 - Ejecución.md` no coincide con lo que se ensamblaría hoy). Nuevo aviso `RUTA-LARGA`: alguna ruta de la Documentación pasa de 240 caracteres (validación V7) | `feat(diagnostico): revisar recibos, anclas e índices de la Fase 4` |
| **L10** | README y migración desde la 2.x | `README.md`, `README.es.md` | Ambos explican el ciclo con `record_batch`, las anclas, el sellado, `reanclar` tras un rebase y qué pasa con las tareas a medio camino | `docs(readme): ejecutar por lotes con el servidor` |
| **L11** | Versión estable `3.0.0` | `package.json`, `package-lock.json` | Base verde; la versión no lleva `-`, así que el workflow publica con la etiqueta `latest`. El tag `v3.0.0` lo pone la autora | `chore(release): 3.0.0` |

> **Estado de ejecución:** de L01 a L11 hechos, en la rama `etapa-4/motor-de-lotes` (creada desde la punta local de `etapa-3/configuracion`, `16d25fc`, sin subir). Auditados (ajustes A1 a A8). Commits, desvíos (E4-D1 a E4-D10), la auditoría y lo que queda por comprobar fuera de este equipo en §9.10.

**Por qué este orden.**
- Primero los datos (L01) y la verificación (L02), que no dependen de nada y se prueban aislados.
- `record_batch` (L03) los une, y el ensamblado (L04) se apoya en él.
- La protección (L05) va **después** de que exista la tool que la sustituye: si fuera antes, una tarea a medio camino se quedaría sin forma de escribir recibos.
- Lectura (L06, L07), prompts (L08) y diagnóstico (L09) después; documentación y release al final.

### 6.11 Riesgos

| # | Riesgo | Estado | Mitigación |
|---|---|---|---|
| E4-R1 | Un rebase o un squash cambia los SHA y los recibos apuntan a commits que ya no están en la rama | Abierto | `get_batch_status --reverificar` y el bloque de la Fase 5 lo detectan al momento; `reanclar` con confirmación; el README lo explica |
| E4-R2 | El sha256 de un archivo de texto cambia entre equipos por `core.autocrlf` | Aceptado | Comparación con finales de línea normalizados al reverificar (§6.1) |
| E4-R3 | El modelo intenta escribir recibos o `04 - Ejecución.md` a mano | Cerrado | `write_central_doc` los rechaza (§6.5); cierra E1-R3 |
| E4-R4 | La tabla de lotes del plan no se puede leer | Aceptado | Solo es informativa; el número de lotes sale del frontmatter |
| E4-R5 | Tareas de la 2.x a medio camino | Aceptado | Lectura tolerante; `origen: manual`; se continúa desde el siguiente lote |
| E4-R6 | Dos ventanas registran el mismo lote a la vez | Aceptado | Escritura atómica y comprobación de `mtimeMs` |
| E4-R7 | Sellar un artefacto enorme bloquea la llamada | Cerrado | Tope de 256 MB y hash en streaming |
| E4-R8 | El commit toca archivos que el recibo no declara | Aceptado | Se deja escrito en "Verificación del commit" y en la respuesta; no bloquea (decisión 5) |
| E4-R9 | Cambiar el texto de la Fase 4 rompe la prueba de oro | Cerrado | Se regenera como `test/oro/3.0.0/` en L08; las fases 1-3 se siguen comparando con la 2.2.0 |

### 6.12 ADRs de la Etapa 4

| Lote | Título de la entrada | Reemplaza o amplía |
|---|---|---|
| L01 | Los recibos son datos con un formato determinista que escribe el servidor | Amplía la ADR de recibos de la Etapa 1 (L02) |
| L02 | Un lote se ancla a un commit en la rama actual, a un sha256 o a una nota | Nueva (R3) |
| L03 | `record_batch` registra cada lote en dos tiempos: antes y después del commit | **Reemplaza** "el modelo escribe el recibo con `write_central_doc`" (Etapa 1, L07) |
| L04 | `04 - Ejecución.md` lo genera el servidor; con un solo lote, el recibo se mueve | Amplía R2 |
| L05 | Los recibos con ancla quedan sellados y la Fase 4 solo la escribe el servidor | Amplía la ADR de R4 (Etapa 1, L03) |
| L05 | La Fase 4 tiene granularidad de lote | **Reemplaza** el límite "granularidad de fases terminadas" de 2026-08-08 |
| L07 | El auditor recibe los commits ya verificados | Amplía la ADR de la Fase 5 (Etapa 1, L08) |

### 6.13 Estado de cierre de la Etapa 4

**Cerrada** en la iteración 5, sin ajustes. Decisiones de cierre:

| # | Decisión |
|---|---|
| H1 | Dos tiempos para todas las políticas con git: el recibo con `commit: pendiente` antes del commit, y el ancla después. Un solo tiempo si el commit ya existe |
| H2 | Con `lotes: 1`, el recibo vive en la subcarpeta mientras el lote está abierto y el servidor lo mueve a `04 - Ejecución.md` al cerrarlo |
| H3 | Un plan sin `lotes: N` en su frontmatter es un error para `record_batch` |
| H4 | Solo el servidor escribe los recibos y `04 - Ejecución.md`; `write_central_doc` los rechaza siempre, con la escotilla de confirmación para reparaciones. Cierra E1-R3 |
| H5 | Que el commit toque archivos distintos de los declarados es un aviso, no un bloqueo: queda en el recibo y lo audita la Fase 5 |

## 7. Etapa 5 — `3.1.0` Studio

**Base:** fin de la Etapa 4 (`3.0.0`). **Estado: cerrada** (iteración 6).

**Alcance:** 13 lotes.
- Servidor HTTP local seguro y subcomando `ui`.
- API de lectura sobre los mismos módulos del servidor MCP.
- Eventos en vivo y registro de sesiones MCP abiertas.
- Frontend con cinco vistas: Red, Tablero, Taller, Vigía y Bitácora.
- Escrituras confirmadas con huella.
- Demo determinista, export estático y despliegue en GitHub Pages.

No cambia ninguna tool ni ningún prompt. Solo añade una forma de **ver** y de ejecutar acciones que ya existían en el CLI (`eject`, `init`, escribir el manifiesto).

### 7.1 Comprobado antes de escribir este plan

| Verificación | Resultado y qué cambió en el plan |
|---|---|
| `fs.watch(dir, { recursive: true })` en Linux con Node 22 | Funciona y ve carpetas creadas después de empezar a vigilar (`a/c` y `a/c/y.md`). En Windows y macOS es nativo. **En carpetas de OneDrive no es fiable** (E2-R6). **Cambio:** vigilancia recursiva más un sondeo de respaldo cada 5 s sobre los `mtime` de las carpetas de tarea activas. |
| ¿Se pueden fijar los hashes de commit? | Sí. Con `GIT_AUTHOR_*` y `GIT_COMMITTER_*` (nombre, correo y fecha fijos) y `commit.gpgsign=false`, dos repos creados por separado dan el **mismo** SHA (`f179165c…`). **Cambio:** la demo genera repos de git reales con anclas reales, y su export es idéntico byte a byte en cada build. |
| Versiones del frontend, la más nueva de cada una con al menos dos semanas (corte: 2026-09-30) | `vite` 8.3.1, `preact` 10.29.8 (la 11.0.1 es de hace días y es versión mayor), `@preact/preset-vite` 2.10.6, `marked` 18.0.14, `dompurify` 3.4.16, `diff` 9.0.0, `@playwright/test` 1.63.0, `axe-core` 4.13.0. **Todas son devDependencies:** el paquete publicado sigue con el SDK y `zod` como únicas dependencias de runtime, porque el Studio viaja ya compilado en `studio/dist/`. |
| `EventSource` y autenticación | `EventSource` no permite cabeceras propias. Envía las cookies del mismo origen. **Cambio:** el token de la URL se canjea por una cookie `HttpOnly; SameSite=Strict` en la primera petición, y la API y el SSE se autentican con ella. |
| GitHub Pages sirve el sitio bajo `/<repo>/` y no reescribe rutas | **Cambio:** el frontend usa `base: "./"` en Vite (rutas relativas) y navegación por hash (`#/tablero/...`), así funciona igual en `127.0.0.1:<puerto>/` y en `montse2308.github.io/mcp-phase-gate/`. |
| Roots en el Studio | Las raíces solo existen dentro de una sesión MCP; el Studio es otro proceso y no las ve. **Cambio:** registro de sesiones (§7.4). |
| El catálogo de ranuras | Son **23**, no 22: la Etapa 3 añadió `global/extra`. El Taller muestra las 23. |

### 7.2 Arquitectura

```text
npx mcp-phase-gate              → servidor MCP por stdio (nunca importa nada de studio/)
npx mcp-phase-gate ui [...]     → import("./studio/servidor.js") → node:http en 127.0.0.1
                                     ├─ /            estáticos de studio/dist/ (Vite + Preact)
                                     ├─ /api/...     JSON sobre paths, tasks, lotes, capas, diagnóstico
                                     └─ /api/eventos Server-Sent Events
```

**Carpetas:**
- `studio/`: el frontend. `studio/index.html`, `studio/src/**` (TSX), `studio/vite.config.ts` y `studio/public/` (fuentes y sprites). Se compila a `studio/dist/`, que entra en `files`.
- `src/studio/`: el backend, compilado por `tsc` igual que el resto:
  - `servidor.ts`: HTTP, seguridad, estáticos.
  - `api.ts`: rutas.
  - `eventos.ts`: SSE y vigilancia.
  - `acciones.ts`: escrituras con huella.
  - `demo.ts`: generador de la demo.
  - `exportar.ts`: export estático.
  - `contrato.ts`: tipos y shapes zod de las respuestas, que el frontend importa como tipos.

**Aislamiento.**
- `src/cli.ts` despacha `ui` con `await import("./studio/servidor.js")`. Ningún módulo de `src/` fuera de `src/studio/` importa nada de `src/studio/`.
- Un test (`test/aislamiento.test.ts`) recorre los `import` de `build/` desde `index.js`, sin pasar por el despacho de `ui`, y falla si aparece algún archivo de `studio/`.

**Build.**
- `npm run build` = `tsc && vite build --config studio/vite.config.ts`.
- Vite 8 necesita Node ≥ 22.12 **solo para compilar**: es dependencia de desarrollo y el runtime publicado sigue con `engines >= 22`. CI y la publicación usan la última 22.x.
- Presupuesto: **≤ 200 kB gzip** de JS y CSS más fuentes, comprobado en L05 con un script que suma `studio/dist/**`.

**Fuentes y sprites.**
- Las tres familias (Big Shoulders Display, Atkinson Hyperlegible, IBM Plex Mono, todas con licencia OFL) van **autoalojadas** en `studio/public/fuentes/` como `woff2` con subconjunto latino. El Studio no hace ninguna petición fuera de `127.0.0.1`.
- Semáforos, vías y sellos son **SVG propios**, inspirados en la estética, sin assets de *Papers, Please*.

### 7.3 Seguridad del servidor local (lote L01)

**Arranque:**

```text
mcp-phase-gate ui [--puerto <n>] [--no-abrir] [--demo] [--export-static <dir> [--incluir-datos-reales]]
```

1. `http.createServer` con `listen(puerto ?? 0, "127.0.0.1")`, puerto aleatorio por defecto. **Nunca** se escucha en `0.0.0.0`, y no hay bandera para hacerlo.
2. **Token:** 32 bytes de `crypto.randomBytes`, en base64url, nuevo en cada arranque y solo en memoria.
3. Se imprime `http://127.0.0.1:<puerto>/?token=<token>`. Salvo `--no-abrir`, se abre en el navegador con `execFile` (Windows: `cmd /c start "" <url>`; macOS: `open <url>`; Linux: `xdg-open <url>`). Antes de abrirla se comprueba que la URL solo contiene `[A-Za-z0-9:/?=._-]`: un `&` partiría el comando de `cmd` (validación V10). El token es base64url, así que siempre pasa.
4. Se queda en primer plano; `Ctrl+C` lo cierra.

**Cada petición pasa por este filtro, en orden:**

| # | Comprobación | Si falla |
|---|---|---|
| 1 | `Host` es exactamente `127.0.0.1:<puerto>` o `localhost:<puerto>` (defensa contra DNS rebinding) | `421` |
| 2 | Si trae `Origin`, es `http://127.0.0.1:<puerto>` o `http://localhost:<puerto>` | `403` |
| 3 | `GET /?token=<t>` con el token correcto (comparado con `crypto.timingSafeEqual`): responde `303` a `/`, con `Set-Cookie: pg_sesion=<s>; HttpOnly; SameSite=Strict; Path=/`, donde `<s>` es **otro** valor aleatorio de 32 bytes. El token de la URL es **de un solo uso**: tras el canje queda invalidado, así que la copia que quede en el historial del navegador ya no sirve (validación V10). Para abrir el Studio en otro navegador se vuelve a lanzar `ui` | `401` |
| 4 | Toda ruta `/api/**` exige la cookie `pg_sesion` válida | `401` |
| 5 | Todo método distinto de `GET` exige además la cabecera `X-Phase-Gate: 1`, lo que obliga a un *preflight* CORS que el servidor nunca concede, y un cuerpo JSON de hasta 64 kB | `403` / `413` |
| 6 | Los estáticos se resuelven con `estaDentroReal(studio/dist, ruta)`; nada fuera de `dist` | `404` |

**Cabeceras de toda respuesta:**
- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y `Cache-Control: no-store` en `/api/**`.

**Markdown sin XSS.** Los documentos de las tareas los escribe un modelo que lee texto ajeno; un `<script>` o un `<img onerror>` inyectado en un documento no puede ejecutarse en una página con acciones de escritura. El visor hace `marked.parse` y después `DOMPurify.sanitize` con `USE_PROFILES: { html: true }`, `FORBID_TAGS: ["style", "form", "input", "iframe"]` y `FORBID_ATTR: ["style"]`. La CSP es la segunda barrera.

**Modelo de amenazas cubierto** (cada fila tiene su test en `test/studio-seguridad.test.ts`):

| Amenaza | Defensa |
|---|---|
| Otra web del navegador llama a la API local (CSRF) | Cookie `SameSite=Strict`; `Origin`; `X-Phase-Gate` obliga a un preflight que se rechaza |
| DNS rebinding (`atacante.com` resuelve a 127.0.0.1) | `Host` exacto |
| Otro usuario del mismo equipo | Token por arranque; la cookie solo se obtiene con él |
| Documento con HTML malicioso | DOMPurify y CSP sin `unsafe-inline` |
| Escritura con un plan viejo (el disco cambió entre la vista previa y el "Aplicar") | Huella (§7.6) |
| Lectura fuera de las carpetas | Los mismos guardas de rutas de las Etapas 0 a 4 |

### 7.4 Registro de sesiones MCP (lote L04)

Para que la Red pueda decir "Claude Code tiene abierto PROYECTO-A", el servidor MCP deja constancia de sus sesiones. Es estado efímero y solo informativo:

- Archivo `<stateDir>/sesiones/<pid>.json`:
  `{ "pid": 1234, "cliente": "claude-code 2.x", "raices": ["D:\\trabajo\\backend-api"], "proyecto": "PROYECTO-A", "desde": "<ISO>", "actualizado": "<ISO>" }`.
- Se escribe al recibir las raíces (`oninitialized` y `roots/list_changed`, Etapa 3) y se actualiza como mucho una vez por minuto.
- Se borra al cerrar (`process.on("exit")` y en `SIGINT`/`SIGTERM`).
- El Studio solo muestra las sesiones cuyo `pid` sigue vivo (`process.kill(pid, 0)`) y con `actualizado` de hace menos de 10 minutos. Las demás las borra.
- Escritura atómica, como los punteros. No guarda nada del contenido de la conversación.

### 7.5 API de lectura y eventos (lotes L02 y L03)

Todas las respuestas están tipadas en `src/studio/contrato.ts` (shapes zod que el frontend importa como tipos) y se construyen llamando a las **mismas funciones** que usan las tools. No hay lógica de dominio duplicada.

| Ruta | Devuelve | Sale de |
|---|---|---|
| `GET /api/estado` | `Diagnostico` | `diagnosticar()` |
| `GET /api/proyectos` | Proyectos con manifiesto, preset y origen, repos y estado de git, tarea activa con `describeEstado`, sesiones MCP abiertas | `discoverProjects`, `leerManifiesto`, `repo_status`, sesiones |
| `GET /api/proyectos/:p/tareas` | Tareas con su `EstadoTarea` (incluido `lotes`) | `listarTareas` |
| `GET /api/tareas/:p/:t` | Estado, documentos existentes con señal (§7.7), aviso de compuerta y pendientes | `estadoDeTarea`, `avisoDeCompuerta`, `avisoDePendientes` |
| `GET /api/tareas/:p/:t/documento?archivo=` | Texto Markdown (hasta 1 MB) | `leerTextoAcotado`, con las reglas de ruta de los Resources |
| `GET /api/tareas/:p/:t/lotes?reverificar=1` | Estado de lotes | `get_batch_status` |
| `GET /api/tareas/:p/:t/bitacora` | Eventos ordenados (§7.10) | recibos, `datosDeCommit`, `mtime` |
| `GET /api/prompts/:p/:fase?tarea=` | Texto ensamblado, `procedencia` de cada ranura, avisos y el contenido de fábrica de cada ranura (para el diff) | `ensamblarFase` |
| `GET /api/clientes` | Plan de `init --dry-run` por cliente (comando o diff) | `src/init.ts` |
| `GET /api/eventos` | SSE | §7.5.1 |

Los parámetros `:p`, `:t` y `archivo` pasan por `validarSegmento` y las reglas de ruta de siempre.

#### 7.5.1 Eventos en vivo

- **Qué se vigila:** `fs.watch(DOCS, { recursive: true })`, la capa global de prompts, `<configDir>` y `<stateDir>/sesiones`.
- **Ruido de OneDrive** (validación V8): se ignoran `desktop.ini`, `Thumbs.db`, `~$*` y `*.tmp` (incluidos los temporales de la escritura atómica). Un aviso solo cuenta si el `mtime` o el tamaño del archivo cambiaron de verdad: OneDrive dispara `change` al sincronizar o liberar espacio sin tocar el contenido.
- **Agrupación:** los avisos del sistema de archivos se juntan durante 300 ms y se traducen a eventos de dominio:

| Evento SSE | Cuando cambia | El frontend recarga |
|---|---|---|
| `documento` `{p, t, archivo}` | un archivo de una carpeta de tarea | la tarea y, si está abierto, el visor |
| `recibo` `{p, t, lote}` | un archivo de la subcarpeta de recibos | lotes, tablero y bitácora |
| `config` `{p}` | `phase-gate.json` o `.phase-gate/**` | proyecto y taller |
| `prompts` | capa global, `<configDir>/presets` o `machine.json` | taller y estado |
| `sesiones` | `<stateDir>/sesiones` | red |

- **Respaldo:** sondeo cada 5 s de los `mtime` de las carpetas de las tareas activas. Si detecta un cambio que el watcher no avisó, emite el evento y anota `watcher: degradado` en `/api/estado`.
- **Latido:** `: latido` cada 25 s.
- **Reconexión:** el cliente se reconecta solo (comportamiento nativo de `EventSource`) y, al reconectar, recarga la vista entera.

### 7.6 Escrituras con huella (lote L07)

El Studio solo ejecuta acciones que ya existen en el CLI y siempre con este ciclo de dos pasos:

1. `POST /api/acciones/plan` con `{ accion, argumentos }` devuelve `{ resumen, diff, huella }`. `huella` es el sha256 del plan serializado más el `mtimeMs` de cada archivo que tocaría.
2. La UI muestra el diff. "Aplicar" envía `POST /api/acciones/aplicar` con `{ accion, argumentos, huella }`. El servidor **recalcula** el plan y solo ejecuta si la huella coincide; si no, responde `409` con "El disco cambió desde que viste el cambio. Revísalo otra vez."

| Acción | Equivale a | Archivos que puede tocar |
|---|---|---|
| `preset` | escribir `preset` en `phase-gate.json` | `<DOCS>/<P>/phase-gate.json` |
| `reglas` | escribir `reglas.lotes` o `reglas.commits` | igual |
| `crear-manifiesto` | `init --migrate` para un proyecto | igual (solo crea) |
| `eject` | `mcp-phase-gate eject <objetivo> --a …` | capa global o del proyecto |
| `init-cliente` | `mcp-phase-gate init --cliente <c>` | configuración de ese cliente (con su `.bak`) |

- **Nunca** escribe documentos de tareas, recibos ni nada de los repos: eso sigue siendo cosa del agente y de las tools.
- Al escribir el manifiesto se conservan las claves que no se tocan y su orden, se escribe con 2 espacios y se deja `phase-gate.json.bak-<fecha>`.

### 7.7 Vistas e interacciones (lotes L05 a L09)

**Comunes a todas:**
- Barra superior con las cinco vistas y el interruptor **Cabina / Sobrio**, que se recuerda en `localStorage` y se puede compartir con `#?sobrio=1`.
- El estado se codifica siempre con **forma, texto y color**, nunca solo con color.
- Navegación completa por teclado; `prefers-reduced-motion` quita las animaciones de sello y de semáforo.
- Pensado desde 360 px de ancho: en el teléfono, la vía horizontal pasa a vertical.

#### 7.7.1 Red (lote L05)

- **Proyectos como estaciones de una red ferroviaria**, en rejilla. Cada estación muestra:
  - nombre y placa del preset con su origen (`multi-repo-feature · del proyecto`);
  - estado del manifiesto (válido, ausente o inválido con la ruta del error);
  - **vías**: una por repo, con id, rama, señal de árbol limpio o con cambios, y "adelante/atrás";
  - **tren** en la estación si hay tarea activa, con su fase y lote;
  - **farol encendido** si una sesión MCP tiene abierto ese proyecto, con el cliente.
- **Acciones:** "Abrir tablero" de la tarea activa; selector de preset y "Crear phase-gate.json", las dos con el ciclo de huella.
- **Modo sobrio:** tabla con las mismas columnas.

#### 7.7.2 Tablero de la tarea (lote L06)

La pantalla principal. Una vía con siete estaciones, `00` y de la Fase 1 a la 5. Cada estación lleva su semáforo:

| Señal | Forma y texto | Cuándo |
|---|---|---|
| Verde | círculo lleno, "cerrada" | el documento existe y no trae `## Validaciones pendientes` con contenido |
| Ámbar | círculo con anillo, "con pendientes" o "en curso" | existe con pendientes (con el mismo criterio que `avisoDePendientes`), o es la Fase 4 a medio camino |
| Rojo | rombo, "hueco" | falta, y hay un documento de una fase posterior (el mismo cálculo que `detectarSalto`) |
| Apagado | círculo vacío, "pendiente" | todavía no toca |

**La Fase 4 se despliega en vagones** `L01…LN`, uno por lote del plan:

| Vagón | Sello | Sobrio |
|---|---|---|
| Sin recibo | ninguno, vagón en contorno | `—` |
| Commit pendiente | vagón en la vía, línea discontinua, "EN VÍA" | `pendiente` |
| Anclado a un commit | sello **VERIFICADO** con `a1b2c3d` y la fecha | `verificado · a1b2c3d` |
| Anclado a un sha256 | sello **SELLADO** con los 8 primeros caracteres del hash | `sha256 · 9c1e04ab` |
| `con pendientes` | sello verde con banda ámbar | `con pendientes` |
| `fallido` | sello **RECHAZADO** en rojo | `fallido` |
| `descartado` | sello **ANULADO** en gris | `descartado` |
| `origen: manual` | sello de contorno, **MANUAL** | `manual` |
| Ancla no vigente (con `reverificar`) | sello agrietado y nota "ya no está en la rama" | `no vigente` |

- **Clic** en una estación o un vagón: el visor lateral muestra el Markdown, saneado y en vivo, más su frontmatter como ficha.
- **Botón "Reverificar anclas":** llama a `lotes?reverificar=1`.
- **Animación del sello:** una sola, al aparecer un sello nuevo por un evento SSE. Cae con un leve giro (−6°) y "tinta" el papel en 300 ms. Sin animación con `prefers-reduced-motion`.

#### 7.7.3 Taller de prompts (lote L07)

- **Selectores:** proyecto, tarea (opcional, aporta su preset) y fase.
- **Pila de capas** a la izquierda (fábrica, preset, reglas, global, proyecto), con la ruta de cada una y si existe.
- **Lista de las 23 ranuras** de esa fase (más las globales). Cada una con:
  - una ficha de origen (`fábrica`, `preset: ai-agent-ops`, `reglas: commits-auto`, `global`, `proyecto`) y el `archivo:línea` que ganó;
  - los modos que se aplicaron (`reemplazar`, `+despues`…).
- **Clic en una ranura:** el contenido efectivo frente al de fábrica, con un diff por líneas (`diff`).
- **Reglas:** interruptor "Lotes" y selector "Política de commits", que escriben `reglas` en el manifiesto con el ciclo de huella.
- **"Editar":** sobre una ranura o una fase, lanza `eject` hacia la capa global o la del proyecto (con vista previa) y muestra la ruta del archivo que hay que editar.
- **Avisos** del ensamblado (huérfanos, duplicados, reinyección de reglas globales) arriba, con archivo y línea.
- **"Ver prompt completo":** el texto exacto que recibe el modelo, con botón de copiar.

#### 7.7.4 Vigía (lote L08)

- **Diagnóstico agrupado por severidad**, con el código, el texto y una línea de "cómo se arregla" por código (tabla en `studio/src/vigia/arreglos.ts`).
- **Asistente de clientes:** una tarjeta por cliente detectado (Claude Code, Cursor, VS Code) con lo que haría `init`: el comando, o el diff de `mcp.json`. "Aplicar" con el ciclo de huella.
- **Copiar comandos de fase:** casilla que añade `--comandos`.
- **Variables:** de dónde salió cada una y su discrepancia, como en `doctor`.

#### 7.7.5 Bitácora (lote L09)

Línea de tiempo de la tarea, de lo más reciente a lo más antiguo, con filtros por tipo:

| Tipo | Fecha | Fuente |
|---|---|---|
| Documento de fase creado o modificado | `mtime` | carpeta de la tarea |
| Recibo registrado o actualizado | `registrado` | frontmatter del recibo |
| Commit anclado | fecha del commit (`%cI`) | `datosDeCommit` |
| Reanclaje | fecha de la línea "Reanclado el…" | sección "Verificación del commit" |
| Fase 4 cerrada | `registrado` más reciente (el mismo del índice) | índice |
| Escritura con confirmación (`force` o elicitation) | `mtime` | respuesta de la tool, si quedó anotada; si no, no aparece |

Cada evento enlaza a su documento o recibo y, si hay commit, muestra el asunto y el SHA corto.

### 7.8 Demo determinista y `--demo` (lote L10)

**`src/studio/demo.ts`**, `generarDemo(destino: string): Promise<void>`.

Construye un árbol completo **ejecutando las funciones reales** (las mismas de las tools) sobre carpetas nuevas:
1. `DOCS`, `REPOS`, estado y configuración temporales.
2. Para cada commit: `GIT_AUTHOR_NAME/EMAIL` y `GIT_COMMITTER_NAME/EMAIL` = `Demo` / `demo@example.invalid`, fechas fijas que avanzan una hora por commit desde `2026-03-02T10:00:00Z`, y `commit.gpgsign=false`. Así los SHA son siempre los mismos.

**Contenido** (textos de ejemplo escritos para la demo, sin datos de ningún proyecto real):

| Proyecto | Preset | Repos | Tareas |
|---|---|---|---|
| `TIENDA` | `multi-repo-feature` | `api` y `web` (git real) | `cupones-de-descuento`, terminada: 00…05, 4 lotes (L01-L02 en `api`, L03 en `web`, L04 descartado), Fase 5 con dos PR y la nota de coordinación. `envio-gratis`, en la Fase 4 por el lote 2 de 3, con el commit pendiente |
| `ASISTENTE` | `ai-agent-ops` | `agente` (sin git: prompt y configuración del agente) | `tono-en-reclamos`, en la Fase 5: lotes anclados por sha256, batería de casos de oro, borde y adversariales en los recibos |
| `INVESTIGACION` | `research-ops` | ninguno | `costo-de-embeddings`, en la Fase 2, con `## Validaciones pendientes` en la Fase 1 (para ver el semáforo ámbar) |

- **Fuente única con los tests:** los textos viven en `test/fixtures/demo/` y el mismo generador alimenta las pruebas E2E del Studio. La demo no puede quedarse atrás del producto sin que falle un test.
- **`ui --demo`:** genera el árbol en una carpeta temporal (o reutiliza la de la última vez si la versión coincide) y arranca el Studio **en vivo** sobre ella, con todas las acciones habilitadas. Sirve para probar sin tocar tu Documentación.
- **Banda fija** en la parte superior: "Demo: datos de ejemplo en `<ruta temporal>`".

### 7.9 Export estático y GitHub Pages (lotes L11 y L12)

**`mcp-phase-gate ui --export-static <dir>`** (`src/studio/exportar.ts`):
1. Sin `--incluir-datos-reales`, siempre exporta **la demo**: llama a `generarDemo` y no lee `PHASE_GATE_DOCS_PATH`. Con la bandera, exporta tu Documentación, después de mostrar "Vas a publicar los documentos de N proyectos y sus rutas locales. ¿Seguro?" y pedir que escribas `exportar` (o pasar `--yes`). Cumple R6.
2. Recorre una lista fija de rutas GET (§7.5) para cada proyecto, tarea, fase y documento de la demo, llama a los mismos manejadores y escribe cada respuesta en `<dir>/datos/<ruta normalizada>.json`.
3. Copia `studio/dist/` y escribe `<dir>/config.js` con `window.PG_MODO = "estatico"`.
4. Escribe `.nojekyll`, para que Pages no ignore archivos con `_`.
5. Es determinista: la misma versión produce los mismos bytes (fechas y SHA fijos, JSON con claves ordenadas). Un test lo compara contra un export de oro reducido.

**En modo estático, el frontend:**
- Resuelve `api.get(ruta)` contra `datos/…json`.
- No abre SSE.
- Deshabilita las acciones de escritura, con el texto "En la demo publicada todo es de solo lectura. Pruébalo en tu equipo con `npx mcp-phase-gate ui --demo`."
- Muestra la misma banda de demo.

**Workflow `.github/workflows/pages.yml`:**

```yaml
name: Studio en GitHub Pages
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  desplegar:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.despliegue.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - run: node build/index.js ui --export-static studio-public
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: studio-public }
      - id: despliegue
        uses: actions/deploy-pages@v4
```

- Requiere activar Pages con origen "GitHub Actions" en la configuración del repo; es un paso único y lo hace la autora.
- Las versiones de las actions se revisan al ejecutar L12 (Dependabot las mantiene después).
- El export nunca lee datos reales en CI: no hay `PHASE_GATE_DOCS_PATH` y no se pasa la bandera.
- Resultado: `https://montse2308.github.io/mcp-phase-gate/` abre la demo en el teléfono sin instalar nada.

### 7.10 Pruebas del Studio

- **Backend** (`node:test`): seguridad (cada fila de §7.3), API contra la demo, eventos con un watcher simulado y el sondeo de respaldo, huella (`409` si el disco cambió), registro de sesiones (vivas y huérfanas), aislamiento de imports y export determinista.
- **Frontend** (`@playwright/test` con Chromium, contra `ui --demo` en CI):
  - cada vista carga;
  - el tablero de `cupones-de-descuento` muestra 4 vagones con los sellos esperados;
  - un recibo nuevo escrito en la carpeta temporal aparece por SSE sin recargar;
  - un documento con `<img onerror>` en la demo no ejecuta nada;
  - el modo sobrio no deja ningún estado expresado solo con color.
- **Accesibilidad:** `axe-core` en cada vista, sin violaciones `serious` ni `critical`.
- **Teléfono:** viewport 390×844, sin desbordamiento horizontal.

### 7.11 Lotes de la Etapa 5

| Lote | Objetivo | Archivos | Verificación | Commit propuesto |
|---|---|---|---|---|
| **L01** | Servidor HTTP seguro y subcomando `ui` | `src/studio/servidor.ts` (nuevo), `src/cli.ts`, `test/studio-seguridad.test.ts` (nuevo), `test/aislamiento.test.ts` (nuevo), `docs/decisiones.md` | Cada fila de §7.3; el servidor MCP no importa `studio/` | `feat(studio): servidor local en 127.0.0.1 con token, Host, Origin y CSP` |
| **L02** | API de lectura y contrato | `src/studio/api.ts`, `src/studio/contrato.ts` (nuevos), `test/studio-api.test.ts` (nuevo) | Cada ruta de §7.5 contra un árbol de fixtures; rutas inválidas rechazadas | `feat(studio): API de lectura sobre los módulos del servidor` |
| **L03** | Eventos en vivo | `src/studio/eventos.ts` (nuevo), `test/studio-eventos.test.ts` (nuevo) | Cambios agrupados en 300 ms; los cinco tipos de evento; el sondeo detecta un cambio con el watcher apagado | `feat(studio): eventos en vivo con fs.watch y respaldo por sondeo` |
| **L04** | Registro de sesiones MCP | `src/sesiones.ts` (nuevo), `src/roots.ts`, `src/index.ts`, `test/sesiones.test.ts` (nuevo), `docs/decisiones.md` | Se escribe al recibir raíces y se borra al salir; las huérfanas se ignoran y se limpian | `feat(sesiones): dejar constancia de las sesiones MCP abiertas y su proyecto` |
| **L05** | Frontend base y Red | `studio/**` (nuevo), `package.json` (devDependencies y `files`), `scripts/presupuesto-studio.mjs` (nuevo) | `vite build` sin avisos; ≤ 200 kB gzip; la Red con la demo en los dos modos | `feat(studio): base del frontend y vista de red` |
| **L06** | Tablero, visor Markdown y sellos | `studio/src/tablero/**`, `studio/src/visor/**`, `studio/public/sellos/*.svg` | Playwright: semáforos, vagones, sellos y visor; documento malicioso inerte | `feat(studio): tablero de la tarea con semáforos y sellos` |
| **L07** | Taller de prompts y escrituras con huella | `studio/src/taller/**`, `src/studio/acciones.ts` (nuevo), `test/studio-acciones.test.ts` (nuevo), `docs/decisiones.md` | Procedencia de las 23 ranuras; diff; reglas y `eject` con vista previa; `409` con huella vieja | `feat(studio): taller de prompts con procedencia, diff y eject` |
| **L08** | Vigía | `studio/src/vigia/**` | Hallazgos con su arreglo; tarjetas de clientes con diff; "Aplicar" con huella en un HOME temporal | `feat(studio): vigía con diagnóstico y asistente de clientes` |
| **L09** | Bitácora | `studio/src/bitacora/**`, `src/studio/api.ts` | Orden y filtros; commits con asunto | `feat(studio): bitácora de documentos, recibos y commits` |
| **L10** | Demo determinista y `--demo` | `src/studio/demo.ts` (nuevo), `test/fixtures/demo/**` (nuevos), `test/demo.test.ts` (nuevo), `docs/decisiones.md` | Dos generaciones dan árboles idénticos (mismos SHA); `ui --demo` arranca; los E2E del Studio corren contra la demo | `feat(studio): demo con proyectos multi-repo, de agente y de investigación` |
| **L11** | `--export-static` y modo estático | `src/studio/exportar.ts` (nuevo), `studio/src/datos.ts`, `test/exportar.test.ts` (nuevo), `test/oro/export/**` (nuevos), `docs/decisiones.md` | Export idéntico en dos corridas; sin datos reales salvo con la bandera y la confirmación; el sitio exportado funciona bajo un subdirectorio (servido en `/mcp-phase-gate/`) | `feat(studio): exportar la demo como sitio estático` |
| **L12** | GitHub Pages y README | `.github/workflows/pages.yml` (nuevo), `.github/workflows/ci.yml` (job de Playwright), `README.md`, `README.es.md` | El workflow corre con `workflow_dispatch` en una rama de prueba. El README abre con un GIF del tablero y el enlace a la demo | `ci(pages): publicar la demo del Studio en GitHub Pages` |
| **L13** | Versión `3.1.0` | `package.json`, `package-lock.json` | Base verde; `npm pack --dry-run` incluye `studio/dist/` y no `studio/src/`. El tag `v3.1.0` lo pone la autora y dispara la publicación en npm y en Pages | `chore(release): 3.1.0` |

**Por qué este orden.**
- La seguridad del servidor (L01) va antes que cualquier dato que se pueda servir.
- La API (L02) y los eventos (L03) antes que las vistas que los consumen.
- Las sesiones (L04) antes que la Red, que las muestra.
- Las vistas por orden de valor: Red, Tablero, Taller (con las escrituras), Vigía y Bitácora.
- La demo (L10) después de las vistas, pero los E2E de L05 a L09 ya corren sobre fixtures mínimos; L10 los sustituye por la demo completa.
- Export, Pages y release al final.

### 7.12 Lo que NO se toca en la Etapa 5

Las tools, los prompts, los presets y la deducción. El servidor MCP solo gana el registro de sesiones (L04). El Studio no escribe documentos de tareas, recibos ni nada de los repositorios.

### 7.13 Riesgos

| # | Riesgo | Estado | Mitigación |
|---|---|---|---|
| E5-R1 | Una web maliciosa del mismo navegador ataca el servidor local | Cerrado | §7.3: token, cookie `SameSite=Strict`, `Host`, `Origin`, cabecera obligatoria, CSP |
| E5-R2 | Un documento con HTML inyectado ejecuta código en el Studio | Cerrado | DOMPurify y CSP sin `unsafe-inline`; test con documento malicioso |
| E5-R3 | Se publican datos reales en Pages por error | Cerrado | El export usa la demo por defecto; datos reales solo con bandera y confirmación escrita; en CI no hay `DOCS_PATH` |
| E5-R4 | `fs.watch` no avisa en OneDrive | Aceptado | Sondeo de respaldo cada 5 s; `watcher: degradado` en el estado |
| E5-R5 | El frontend engorda el paquete | Aceptado | Presupuesto de 200 kB gzip comprobado en CI; dependencias solo de desarrollo |
| E5-R6 | Vite 8 necesita Node ≥ 22.12 para compilar | Aceptado | Solo afecta al build (CI y publicación usan la última 22.x); el runtime no cambia |
| E5-R7 | El registro de sesiones deja archivos huérfanos tras un cierre abrupto | Aceptado | Se ignoran y se limpian por `pid` y antigüedad |
| E5-R8 | La estética "cabina" estorba en un entorno formal | Cerrado | Modo Sobrio, compartible por URL |
| E5-R9 | La demo se queda atrás del producto | Cerrado | Se genera con las funciones reales; sus fixtures son los de los tests |

### 7.14 ADRs de la Etapa 5

| Lote | Título de la entrada | Reemplaza o amplía |
|---|---|---|
| L01 | El Studio es un servidor local separado del MCP, en `127.0.0.1`, con token, cookie y CSP | **Reemplaza** el descarte de una interfaz gráfica de 2026-08-10 ("una app de escritorio… sería más código que todo el orquestador") |
| L04 | El servidor MCP deja constancia de sus sesiones abiertas | Nueva |
| L07 | El Studio solo ejecuta acciones del CLI, con vista previa y huella | Nueva |
| L10 | La demo se genera con el código real y commits de git deterministas | Amplía R6 |
| L11 | El export estático publica la demo y nunca datos reales sin confirmación | Amplía R6 |

### 7.15 Estado de cierre de la Etapa 5

**Cerrada** en la iteración 6, sin ajustes. Decisiones de cierre:

| # | Decisión |
|---|---|
| J1 | Registro de sesiones MCP (§7.4), para que la Red sepa qué proyecto tiene abierto cada cliente |
| J2 | Preact 10 estable |
| J3 | El Studio solo escribe configuración (preset, reglas, manifiesto, `eject`, `init`), siempre con vista previa y huella; nunca documentos de tareas ni recibos |
| J4 | `ui --demo` en vivo con acciones sobre una carpeta temporal; el sitio de Pages, de solo lectura |
| J5 | La demo con los proyectos `TIENDA`, `ASISTENTE` e `INVESTIGACION` |

## 8. Etapa 6 — `3.2.0` El mundo: inglés, Studio bilingüe y portafolio

**Base:** fin de la Etapa 5 (`3.1.0`). **Estado: cerrada** (iteración 7).

**Alcance:** 11 lotes.
- Vocabulario de contratos bilingüe.
- Resolución del idioma por proyecto.
- Mensajes del servidor en dos idiomas.
- Prompts, comandos, variantes y presets en inglés, con su prueba de oro.
- Studio bilingüe y demo en los dos idiomas.
- Medios (GIF y video) para el README y LinkedIn.
- README en inglés como principal y caso de estudio.
- Release.

Cierra el plan v3.

### 8.1 Comprobado antes de escribir este plan

| Verificación | Resultado y qué cambió en el plan |
|---|---|
| ¿Qué textos en español lee o escribe el **código** (no solo los prompts)? | Revisando las Etapas 1 a 5 aparecen once familias:<br>• encabezados que el servidor busca: `## Validaciones pendientes`, `## BASE DE CADA DECISIÓN`, `## PENDIENTES HEREDADOS`<br>• bloques que añade: ARCHIVOS DE ESTA TAREA, CONFIGURACIÓN DEL PROYECTO, COMMITS DE LA FASE 4, el aviso de compuerta y el de pendientes<br>• claves y valores del frontmatter de recibos e índice (`lote`, `estado: verificado`…)<br>• secciones del recibo (`## Qué se hizo`…)<br>• la cabecera de la tabla de lotes (`\| Lote \| Repo \|`)<br>• las frases de "sección vacía" (`Ninguna`, `Nada`…)<br>• las claves del frontmatter de los prompts (`documento`, `documento_inicial`, `recibos`)<br>• las palabras de los marcadores (`ranura`, `bloque`)<br>• la carpeta `comandos/`<br>• los mensajes de error y las descripciones de las tools<br>• las etiquetas de los sellos<br>**Cambio:** un módulo de vocabulario (§8.2) con las dos lenguas y un test que obliga a que cada prompt use exactamente sus encabezados. Sin él, traducir un prompt rompería en silencio la detección de pendientes o la lectura de recibos. |
| ¿De dónde saca Node el idioma del sistema? | En Linux, `Intl.DateTimeFormat().resolvedOptions().locale` sigue a `LANG` / `LC_ALL` (`es-MX` con `LANG=es_MX.UTF-8`) y da `en-US` cuando no están, y **los clientes MCP lanzan el servidor con un entorno reducido**. En **Windows** sigue la configuración regional del sistema: devuelve `es-MX` también con el entorno vacío e ignora `LANG` (validación V9). **Cambio:** el idioma del sistema es el **último** recurso, por detrás del manifiesto, de lo que ya hay en disco y de `PHASE_GATE_LANG`. Los tests que fijan `LANG` se saltan en `win32`. |
| Pluralización y fechas sin dependencias | `Intl.PluralRules` (`es`: `one`, `en`: `other`) y `Intl.DateTimeFormat("es-MX", { dateStyle: "long" })` ("2 de marzo de 2026") están en Node 22 y en cualquier navegador moderno. **Cambio:** el Studio no necesita librería de i18n. |
| Pipeline de video | En este entorno: Playwright 1.56 con Chromium grabó un `webm` a 1280×720 (`recordVideo`), y `ffmpeg` lo convirtió en un GIF de 960×540 a 12 fps (dos pasadas: `palettegen=stats_mode=diff` y `paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`) y en un MP4 H.264 con `+faststart`. **Cambio:** los medios se generan con un script, desde la demo determinista, y no con capturas a mano. |
| ¿Dónde se ven las imágenes del README? | npm muestra el README del paquete, pero `docs/medios/` no se publica en el paquete, así que **una ruta relativa sale rota en npmjs.com**. **Cambio:** los medios se publican en GitHub Pages y el README los enlaza con una URL absoluta. |

### 8.2 Vocabulario de contratos (lote L01)

**`src/vocabulario.ts` (nuevo):** el único lugar con los textos de los que depende el código.

```ts
export type Idioma = "es" | "en";
export type Vocabulario = {
  encabezados: { validacionesPendientes: string; base: string; pendientesHeredados: string;
                 reglasAdicionales: string; archivosDeLaTarea: string; configuracionDelProyecto: string;
                 commitsDeLaFase4: string; compuerta: string; pendientesDetectados: string };
  recibo: { claves: Record<"lote"|"de"|"repo"|"rama"|"estado"|"commit"|"fecha"|"ancla"|"commitCompleto"|
                           "asunto"|"artefacto"|"sha256"|"nota"|"registrado"|"origen", string>;
            estados: Record<EstadoLote, string>; commitPendiente: string; noAplica: string;
            origen: Record<"servidor" | "manual", string>;
            secciones: Record<"queSeHizo"|"archivos"|"verificacion"|"esperaAlUsuario"|"desvios"|
                              "decisiones"|"verificacionDelCommit", string>;
            condicionales: Record<"loQueSigueIgual"|"reversion"|"avisoAAlguienMas"|"deudaAnotada", string> };
  indice: { titulo: string; plan: string; rama: string; cierre: string; estado: string;
            cerradaSinPendientes: string; cerradaConPendientes: string; lotes: string; tablaLotes: string[] };
  plan: { claveLotes: string; cabeceraTablaLotes: string[] };
  vacio: string[];                                    // frases que cuentan como sección vacía
  frontmatterPrompt: { documento: string; documentoInicial: string; recibos: string };
  marcadores: { ranura: string; bloque: string };
  carpetaComandos: string;
};
export const VOCABULARIO: Record<Idioma, Vocabulario>;
```

**Valores en inglés:**

| Concepto | `es` | `en` |
|---|---|---|
| Encabezado de pendientes | `## Validaciones pendientes` | `## Pending validations` |
| Base | `## BASE DE CADA DECISIÓN` | `## BASIS OF EACH DECISION` |
| Pendientes heredados | `## PENDIENTES HEREDADOS` | `## INHERITED PENDING ITEMS` |
| Reglas adicionales | `## REGLAS ADICIONALES` | `## ADDITIONAL RULES` |
| Bloques del servidor | `ARCHIVOS DE ESTA TAREA` · `CONFIGURACIÓN DEL PROYECTO` · `COMMITS DE LA FASE 4` · `ATENCIÓN — COMPUERTA DE FASE` | `FILES OF THIS TASK` · `PROJECT CONFIGURATION` · `PHASE 4 COMMITS` · `ATTENTION — PHASE GATE` |
| Claves del recibo | `lote, de, repo, rama, estado, commit, fecha, ancla, commit_completo, asunto, artefacto, sha256, nota, registrado, origen` | `batch, of, repo, branch, status, commit, date, anchor, full_commit, subject, artifact, sha256, note, recorded, origin` |
| Estados | `verificado · con pendientes · fallido · descartado` | `verified · with pending items · failed · discarded` |
| Commit | `pendiente · no aplica` | `pending · not applicable` |
| Secciones del recibo | `Qué se hizo · Archivos · Verificación ejecutada · Espera al usuario · Desvíos del plan · Decisiones · Verificación del commit` | `What was done · Files · Verification run · Awaiting the user · Deviations from the plan · Decisions · Commit check` |
| Plan | `lotes:` · `\| Lote \| Repo \| Objetivo \| …` | `batches:` · `\| Batch \| Repo \| Goal \| …` |
| Sección vacía | `ninguna, ninguno, nada, sin pendientes, fase cerrada sin pendientes` | `none, nothing, no pending items, phase closed with no pending items` |
| Frontmatter de prompts | `documento, documento_inicial, recibos` | `document, initial_document, receipts` |
| Marcadores | `ranura`, `bloque` | `slot`, `block` |
| Carpeta de comandos | `comandos/` | `commands/` |

Reglas:
- **Escritura en el idioma del proyecto.** `escribirRecibo`, `ensamblarIndice` y los bloques del servidor usan el vocabulario del idioma del proyecto (§8.3).
- **Lectura en los dos idiomas.** Los parsers (`leerRecibo`, la tabla de lotes, `avisoDePendientes`, el frontmatter de los prompts, los marcadores) aceptan **ambos**. Un recibo escrito en español sigue leyéndose si alguien abre ese proyecto con la interfaz en inglés.
- **Identificadores fijos en los dos idiomas.** `L01…L99` (la *L* sirve para *lote* y para *lot*), los **ids de ranura** (`global/cero-rupturas`, `fase-3/pruebas`…), los SHA y las rutas no se traducen: son la API que comparten los presets, `eject` y el Studio.
- **Alias de ranuras en inglés.** El parser de bloques acepta, además del id canónico, un alias por ranura (`global/zero-breakage` → `global/cero-rupturas`, `phase-3/tests` → `fase-3/pruebas`…). La tabla de 23 alias va en `VOCABULARIO.en`. El Studio y `doctor` muestran el alias en la interfaz inglesa y el id canónico entre paréntesis.
- **Test de contrato** (`test/vocabulario.test.ts`): para cada idioma de `prompts/<idioma>/`, cada encabezado que el código busca aparece **exactamente** con el texto del vocabulario de ese idioma. Las 23 ranuras existen con los mismos ids. Los nombres de documento del frontmatter son los de §8.4.

### 8.3 Idioma del proyecto y de la redacción (lote L02)

**Dos conceptos distintos:**

| Concepto | Dónde se declara | Qué decide |
|---|---|---|
| **Idioma del proyecto** (`idioma`) | `phase-gate.json` | La capa de fábrica (`prompts/<idioma>/`, `presets/<idioma>/`), los nombres de documento y el vocabulario con que el servidor escribe. Es del **proyecto**, porque la deducción de fase depende de los nombres de documento y es por proyecto (Etapa 3, G1) |
| **Idioma de redacción** (`redaccion`) | frontmatter de `00 - Contexto Inicial.md` (`redaccion: en`), o `start_task` con `redaccion` | Solo en qué idioma escribe el modelo el **contenido** de los documentos. No cambia estructura, encabezados ni nombres |

**Resolución del idioma del proyecto**, en orden:
1. `idioma` del manifiesto. El esquema pasa a `z.enum(["es", "en"])` y se regenera `schema/project.json`.
2. **Lo que ya hay en disco:** si las carpetas de tarea del proyecto contienen documentos con los nombres de un idioma (`01 - Análisis Técnico.md` frente a `01 - Technical Analysis.md`), ese idioma. Es la regla "el disco es la verdad": protege tus proyectos actuales, que no tienen manifiesto y están en español, de verse de golpe sin fases hechas. Si hay de los dos: `doctor` emite `IDIOMA-MIXTO` (error), se usa el que más documentos tenga y se pide fijar `idioma` en el manifiesto.
3. `idiomaPorDefecto` de `machine.json` (nuevo, como `presetPorDefecto`).
4. `PHASE_GATE_LANG` (nuevo; también fija el idioma de los mensajes, §8.5).
5. Idioma del sistema (`Intl…locale` empieza por `es` → `es`).
6. `"en"`.

**Si un proyecto en español recibe una tarea en inglés:** la tarea se crea con la estructura y los nombres en español del proyecto, y con `redaccion: en` el servidor añade al final del prompt una línea, en el idioma del proyecto: "Escribe el contenido de los documentos de esta tarea en inglés. Los encabezados, nombres de archivo y claves se mantienen como están." Al revés es igual. Un proyecto no mezcla nunca nombres de documento de dos idiomas.

**Cambiar el `idioma` de un proyecto con tareas** no renombra nada (P7). `doctor` emite `IDIOMA-CON-TAREAS` (error) mientras haya tareas con documentos en el otro idioma, y `get_phase_prompt` se niega con el mismo mensaje, porque si siguiera la deducción daría todas esas tareas como "sin documentos". La salida es devolver el manifiesto a su idioma o renombrar esas carpetas a mano. Un comando de migración de idioma queda fuera de este plan.

**`init`** pregunta el idioma (por defecto, el resuelto en los pasos 3 a 6). `init --migrate` escribe en el manifiesto el idioma **detectado** (paso 2), no el del sistema.

### 8.4 Prompts, comandos, variantes y presets en inglés (lotes L04 y L05)

**Estructura:**

```text
prompts/en/global-rules.md
prompts/en/phase-1-discovery.md        (document: 01 - Technical Analysis.md · initial_document: 00 - Initial Context.md)
prompts/en/phase-2-decisions.md        (document: 02 - Decisions.md)
prompts/en/phase-3-technical-plan.md   (document: 03 - Technical Plan.md)
prompts/en/phase-4-execution.md        (document: 04 - Execution.md · receipts: 04 - Execution)
prompts/en/phase-5-audit.md            (document: 05 - Audit.md)
prompts/en/commands/f1.md … f5.md
prompts/en/reglas/commits-agente-propone.md … sin-lotes.md   (los nombres de archivo de las variantes no se traducen: los elige el código)
presets/en/software-replica.md, software-tdd.md, multi-repo-feature.md, ai-agent-ops.md, research-ops.md
```

`PHASE_FILE_PATTERN` ya acepta `phase-N-` desde la Etapa 0 (`src/phases.ts:14`).

**Cómo se traduce.** No es una traducción literal: los prompts son el producto y su voz importa. El proceso de cada archivo:
1. El agente local redacta la versión en inglés con el **glosario** de abajo.
2. Se aplican las reglas de contrato (§8.2): mismas ranuras, mismos encabezados de vocabulario, mismas secciones `PROHIBIDO` y `AUTOVERIFICACIÓN` (`FORBIDDEN` y `SELF-CHECK`) con el **mismo número de puntos** que la versión en español.
3. La autora revisa cada archivo antes de su commit; el lote no se cierra sin esa revisión.
4. Los ejemplos de calidad se **reescriben** en inglés con el mismo propósito, no se traducen frase por frase.
5. Los ejemplos del contrato del PR (Fase 5) son nuevos y genéricos: no salen de PR reales de ningún trabajo (ADR del 2026-08-07, "Los documentos de referencia no se versionan").

**Glosario fijo** (en `docs/glosario.md`, también lo usan el Studio y el README):

| Español | English | Español | English |
|---|---|---|---|
| Cero Rupturas | Zero Breakage | Compuerta | Gate |
| Lote | Batch | Recibo | Receipt |
| Ancla / anclar | Anchor / to anchor | Sello / sellado | Seal / sealed |
| Ranura | Slot | Bloque | Block |
| Capa | Layer | Base (de una decisión) | Basis |
| medido · leído en código · documentado · inferido | measured · read in code · documented · inferred | Implicación aceptada | Accepted trade-off |
| Desvíos | Deviations | Pendientes heredados | Inherited pending items |
| Validaciones pendientes | Pending validations | Espera al usuario | Awaiting the user |
| Severidad / Confianza | Severity / Confidence | Traducción para quien pidió el ticket | Plain-language summary for the requester |
| Lo que NO se toca | What must not be touched | Criterio de salida | Exit criterion |
| Preset | Preset | Manifiesto | Manifest |

**Prueba de oro en inglés (L06).** Con `idioma: "en"` y `preset: software-replica`, `ensamblarFase(N, …, { incluirConfigProyecto: false })` produce exactamente `test/oro/3.2.0-en/fase-N.txt`, un archivo que se genera una vez, la autora revisa y se versiona. A partir de ahí, cualquier cambio en los prompts en inglés tiene que regenerarlo a propósito (E3-R8). Las pruebas de oro en español (`2.2.0` para las fases 1 a 3 y `3.0.0` para las fases 4 y 5) **no cambian**: demuestran que esta etapa no tocó el español.

### 8.5 Mensajes del servidor y descripciones de las tools (lote L03)

- **`src/i18n/mensajes.ts`:** `mensaje(codigo, parametros, idioma)`. Cada error y respuesta de las tools tiene un código (`RUTA-FUERA`, `LOTE-FUERA-DE-PLAN`, `COMMIT-OTRA-RAMA`…) y un texto en `es` y en `en`. El test exige que todo código tenga los dos.
- **Idioma de los mensajes:** el del **proyecto** cuando la llamada lo resuelve; si no, `PHASE_GATE_LANG`; si no, el del sistema.
- **Descripciones de las tools, de sus parámetros y títulos de los MCP Prompts:** se fijan al arrancar con `PHASE_GATE_LANG` o, si no está, el idioma del sistema. Son estáticas desde la Etapa 2 y no dependen de ningún proyecto. Recomendación en el README para quien trabaje en español: `PHASE_GATE_LANG=es` en el bloque `env`.
- **Nombres de las tools:** en inglés y sin cambios (`start_task`, `record_batch`…). El parámetro `crear_proyecto` gana el alias `create_project`; los dos funcionan.
- **`doctor` y `--help`:** también bilingües, con el mismo criterio que los mensajes.

### 8.6 Studio bilingüe (lote L07)

- **Diccionarios:** `studio/src/i18n/es.ts` y `studio/src/i18n/en.ts`. El inglés se tipa con `satisfies Record<keyof typeof es, string>`, así que una clave que falta rompe el build, no la pantalla.
- **Función `t(clave, parametros?)`**, más `Intl.PluralRules` y `Intl.DateTimeFormat`. Sin librerías.
- **Idioma de la interfaz:** la elección guardada en `localStorage` (selector ES / EN en la barra superior), luego `navigator.languages` y, por último, `en`. Se puede compartir con `#?lang=en`. Es independiente del idioma de cada proyecto: el **contenido** de los documentos se muestra tal cual está escrito.
- **Sellos:**

| Sello | `es` | `en` |
|---|---|---|
| Anclado a un commit | VERIFICADO | VERIFIED |
| Anclado a un sha256 | SELLADO | SEALED |
| Commit pendiente | EN VÍA | IN TRANSIT |
| `fallido` | RECHAZADO | REJECTED |
| `descartado` | ANULADO | VOID |
| `manual` | MANUAL | MANUAL |
| no vigente | NO VIGENTE | STALE |

  Los SVG de los sellos llevan el texto como `<text>` (no dibujado en trazos), así se traducen sin rehacer el arte.
- **Hallazgos de `doctor` en la Vigía:** se muestran por **código** con el texto del diccionario de la interfaz; el texto del servidor queda solo como respaldo.
- **Accesibilidad:** `<html lang>` cambia con el idioma, para que los lectores de pantalla pronuncien bien.

### 8.7 Demo en los dos idiomas (lote L08)

- **`generarDemo(destino, idioma)`.** Los textos de la demo pasan a `test/fixtures/demo/es/` y `test/fixtures/demo/en/`, con la misma historia:

| `es` | `en` | Preset |
|---|---|---|
| `TIENDA` | `SHOP` | `multi-repo-feature` |
| `ASISTENTE` | `ASSISTANT` | `ai-agent-ops` |
| `INVESTIGACION` | `RESEARCH` | `research-ops` |

  Cada idioma tiene sus propios repos de git con sus propias fechas fijas. Los SHA difieren entre idiomas (otro contenido), pero cada uno es determinista.
- **`ui --demo [--idioma es|en]`:** por defecto, el idioma de la interfaz que resolvería el navegador. Como el servidor no lo conoce al arrancar, se usa `PHASE_GATE_LANG` o el del sistema.
- **`--export-static <dir>`** exporta **las dos**: `<dir>/datos/es/**` y `<dir>/datos/en/**`. El frontend elige el conjunto según el idioma de la interfaz, y al cambiar de idioma cambia también de demo (la de España se ve en español; la de inglés, en inglés). Un solo sitio en Pages.
- **Medios:** `<dir>/medios/` con el GIF, el MP4 y el póster (§8.8), para que el README los enlace con URL absoluta.

### 8.8 GIF, video y póster (lote L09)

**Principio: demo honesta.** Todo lo que aparece sale de código real ejecutándose: comandos de verdad y la demo determinista generada por las funciones reales. **No** se escenifica una conversación con un agente. Si se quiere mostrar una sesión real de Claude Code o Cursor, la graba la autora a mano, como pieza aparte, con una tarea real de la demo.

**Guion** (≈ 45 s; 960 px de ancho en el GIF, 1280 en el video):

| # | Escena | Fuente | Duración |
|---|---|---|---|
| 1 | Terminal: `npx mcp-phase-gate init --dry-run` muestra el diff del `mcp.json` de Cursor y el comando de Claude Code | VHS (`docs/medios/terminal.tape`) | 8 s |
| 2 | Terminal: `npx mcp-phase-gate doctor` con un proyecto `software-replica` y uno `ai-agent-ops` | VHS | 6 s |
| 3 | Studio, Red: tres estaciones, vías con su rama, farol de sesión | Playwright (`scripts/grabar-studio.mjs`) | 6 s |
| 4 | Studio, Tablero de `cupones-de-descuento` / `discount-coupons`: semáforos en verde, Fase 4 desplegada en 4 vagones con sus sellos | Playwright | 8 s |
| 5 | Studio, en vivo: el script escribe un recibo nuevo en la tarea `envio-gratis` (con `record_batch` real contra la carpeta temporal) y aparece un vagón "EN VÍA" que pasa a sello VERIFICADO al anclarlo | Playwright y el script | 9 s |
| 6 | Studio, Taller: procedencia de `fase-3/pruebas` (preset frente a fábrica) con el diff | Playwright | 5 s |
| 7 | Cierre: el sitio de Pages en un viewport de teléfono (390×844), con el enlace | Playwright | 3 s |

**Herramientas y comandos exactos:**
- **Terminal:** [VHS](https://github.com/charmbracelet/vhs) con un `.tape` versionado (tipografía IBM Plex Mono, tema propio con la paleta del Studio, 1280×720). En CI, con la action oficial de VHS; en local, con el binario de VHS.
- **Studio:** Playwright, `recordVideo: { size: { width: 1280, height: 720 } }`, `reducedMotion: "no-preference"`, contra `ui --demo --no-abrir`. Las esperas se basan en eventos del DOM, no en tiempos fijos.
- **Unión y conversión** (`scripts/medios.sh`):

```bash
# 1) Normalizar y unir (las piezas ya están a 1280x720)
ffmpeg -y -f concat -safe 0 -i piezas.txt -c:v libx264 -pix_fmt yuv420p -r 30 -movflags +faststart demo.mp4
# 2) GIF en dos pasadas con paleta propia
ffmpeg -y -i demo.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" paleta.png
ffmpeg -y -i demo.mp4 -i paleta.png -lavfi "fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" demo.gif
# 3) Póster para redes y para quien no carga el GIF
ffmpeg -y -ss 00:00:24 -i demo.mp4 -frames:v 1 poster.png
```

- **Presupuesto:** GIF ≤ 5 MB (límite prudente para que GitHub lo sirva; se mide en L09 y, si se pasa, se baja a 10 fps o 840 px); MP4 ≤ 8 MB.
- **Dos juegos** (`es` y `en`), generados con la demo de cada idioma.
- **Dónde viven:** en el sitio de Pages, `medios/demo-<idioma>.gif`, `.mp4` y `poster-<idioma>.png`, generados por el workflow de Pages en cada tag. No se versionan en git (evita binarios pesados en el historial). El README los enlaza con la URL absoluta de Pages, que funciona en GitHub y en npmjs.com.

### 8.9 README, caso de estudio y LinkedIn (lote L10)

**README:**
- `README.md` pasa a ser **en inglés y el principal**. `README.es.md`, su gemelo completo, sigue el criterio de la ADR del 2026-08-08: los dos completos, cambiar uno obliga a cambiar el otro.
- **Cabecera de ambos:**
  1. Nombre y una frase: *"An MCP server that turns any AI coding agent into a gated, auditable, batch-by-batch engineering workflow."*
  2. El GIF de su idioma, que enlaza al video.
  3. Insignias: CI, npm, provenance, licencia, "Live demo".
  4. Tres líneas: problema, solución, enlace a la demo en Pages.
  5. "Try it in 10 seconds": `npx mcp-phase-gate ui --demo`.
- **Sección de arquitectura:** un diagrama Mermaid con las piezas reales (cliente MCP → servidor stdio → capas de prompts / manifiesto / disco / git de solo lectura; Studio aparte en `127.0.0.1`) y un enlace a `docs/decisiones.md` presentado como **registro de decisiones de arquitectura**, con su número de entradas.

**Caso de estudio** (`docs/case-study.md` y `docs/caso-de-estudio.md`), de 1200 a 1500 palabras:
1. El problema con un ejemplo concreto y anónimo.
2. Las tres ideas de diseño: el disco es la verdad, el servidor hace cumplir lo que el prompt promete, nada se escribe sin verificar.
3. Tres decisiones con su alternativa descartada, tomadas del registro:
   - la deducción de fase frente a un registro de estado;
   - el sellado de recibos frente a confiar en el modelo;
   - el preset por proyecto frente al de cada repo.
4. **Seguridad:** el fallo de rutas encontrado en la auditoría, cómo se demostró y cómo se cerró. Las cifras salen de los tests reales.
5. **Lo que se midió:** número de tests, número de entradas del registro de decisiones, tamaño del paquete, presupuesto del Studio, tiempo de una tarea de la demo. **Solo cifras medidas al publicar la `3.2.0`**, nunca estimadas.
6. Qué haría distinto.

La difusión fuera del repo (publicaciones y material personal) se planifica aparte y no forma parte de este plan.

### 8.10 Lotes de la Etapa 6

| Lote | Objetivo | Archivos | Verificación | Commit propuesto |
|---|---|---|---|---|
| **L01** | Vocabulario de contratos y parsers bilingües | `src/vocabulario.ts` (nuevo), `src/recibos.ts`, `src/lotes.ts`, `src/tasks.ts`, `src/bloques.ts`, `src/phases.ts`, `test/vocabulario.test.ts` (nuevo), `docs/decisiones.md` | Las pruebas de oro en español no cambian; recibos, índices, tablas, encabezados y marcadores en inglés se leen; los alias de ranura resuelven al id canónico | `feat(idioma): vocabulario de contratos y lectura en los dos idiomas` |
| **L02** | Idioma del proyecto y de la redacción | `src/manifiesto.ts`, `src/config.ts`, `src/capas.ts`, `src/schemas.ts`, `schema/*.json`, `src/diagnostico.ts`, `test/idioma.test.ts` (nuevo), `docs/decisiones.md` | Los 6 pasos de resolución; detección por documentos en disco; `IDIOMA-MIXTO` e `IDIOMA-CON-TAREAS`; `redaccion` añade su línea y no cambia nada más | `feat(idioma): resolver el idioma de cada proyecto y la redacción de cada tarea` |
| **L03** | Mensajes del servidor, `doctor` y descripciones bilingües | `src/i18n/mensajes.ts` (nuevo), `src/servidor.ts`, `src/diagnostico.ts`, `src/cli.ts`, `test/mensajes.test.ts` (nuevo), `docs/decisiones.md` | Todo código de mensaje tiene `es` y `en`; `PHASE_GATE_LANG` cambia las descripciones; `create_project` funciona como alias | `feat(idioma): mensajes, diagnóstico y descripciones en español e inglés` |
| **L04** | Prompts, comandos y variantes en inglés | `prompts/en/**` (nuevos), `docs/glosario.md` (nuevo), `docs/decisiones.md` | Test de contrato del vocabulario; mismas 23 ranuras; mismo número de puntos en `FORBIDDEN` y `SELF-CHECK` que en español; **revisión de la autora** registrada en el commit | `feat(prompts): prompts de fase, comandos y reglas en inglés` |
| **L05** | Presets en inglés | `presets/en/*.md` (nuevos) | Ningún preset en inglés genera huérfanos; mismas ranuras que su gemelo en español | `feat(presets): presets en inglés` |
| **L06** | Prueba de oro en inglés | `test/oro/3.2.0-en/*` (nuevos), `test/oro.test.ts` | El ensamblado en inglés coincide byte a byte con los archivos revisados; las de español siguen idénticas | `test(oro): fijar los prompts en inglés` |
| **L07** | Studio bilingüe | `studio/src/i18n/**` (nuevos), `studio/src/**`, `studio/public/sellos/*.svg` | El build falla si falta una clave; Playwright recorre las cinco vistas en los dos idiomas; `axe-core` sin violaciones graves en ninguno; `<html lang>` correcto | `feat(studio): interfaz y sellos en español e inglés` |
| **L08** | Demo en los dos idiomas y export doble | `src/studio/demo.ts`, `src/studio/exportar.ts`, `test/fixtures/demo/{es,en}/**`, `test/demo.test.ts`, `test/exportar.test.ts` | Dos generaciones por idioma idénticas; el export contiene `datos/es` y `datos/en`; cambiar de idioma cambia de demo | `feat(studio): demo y sitio estático en los dos idiomas` |
| **L09** | Medios: GIF, video y póster | `docs/medios/terminal.tape` (nuevo), `scripts/grabar-studio.mjs` (nuevo), `scripts/medios.sh` (nuevo), `.github/workflows/pages.yml`, `docs/decisiones.md` | El workflow genera los dos juegos; GIF ≤ 5 MB y MP4 ≤ 8 MB (medido); cada escena sale de comandos reales y de la demo | `feat(medios): GIF y video de la demo generados en cada publicación` |
| **L10** | README principal en inglés, gemelo en español y caso de estudio | `README.md`, `README.es.md`, `docs/case-study.md`, `docs/caso-de-estudio.md` (nuevos), `docs/decisiones.md` | Los dos README con la misma estructura; GIF por URL absoluta (se comprueba en el preview de npm con `npm pack` y un visor local); toda cifra del caso de estudio tiene su fuente (comando o test) | `docs: README en inglés como principal, gemelo en español y caso de estudio` |
| **L11** | Versión `3.2.0` | `package.json`, `package-lock.json` | Base verde; el tag `v3.2.0` lo pone la autora y publica en npm y en Pages | `chore(release): 3.2.0` |

**Por qué este orden.**
- El vocabulario (L01) va antes que cualquier texto en inglés: sin él, el primer prompt traducido rompería la lectura de recibos.
- La resolución del idioma (L02) va antes que los prompts que se eligen con ella.
- Mensajes (L03), prompts (L04), presets (L05) y la prueba de oro que los fija (L06), en ese orden.
- El Studio (L07) y la demo (L08) antes de los medios (L09), que se graban con ellos.
- La documentación (L10) usa los medios.

### 8.11 Lo que NO se toca en la Etapa 6

La lógica de las fases, la compuerta, la deducción, las anclas, la protección, la seguridad del Studio y los textos en español (las pruebas de oro lo demuestran). Los ids de ranura, los nombres de las tools y los identificadores `L01…L99` no se traducen.

### 8.12 Riesgos

| # | Riesgo | Estado | Mitigación |
|---|---|---|---|
| E6-R1 | Un proyecto sin manifiesto cambia de idioma solo, al cambiar el idioma del sistema, y sus tareas aparecen sin fases hechas | Cerrado | La detección por documentos en disco va antes que el sistema (§8.3, paso 2) |
| E6-R2 | Un prompt traducido pierde un encabezado que el código busca | Cerrado | Vocabulario único y test de contrato por idioma |
| E6-R3 | La traducción pierde rigor o voz | Abierto | Glosario; mismo número de reglas; revisión de la autora obligatoria en L04 y L05; prueba de oro revisada |
| E6-R4 | El GIF pesa demasiado o se ve roto en npmjs.com | Aceptado | Presupuesto de 5 MB medido; URL absoluta de Pages |
| E6-R5 | El contenido de LinkedIn infla cifras | Cerrado | Plantillas con huecos `[N]`; solo valores medidos al publicar |
| E6-R6 | Los medios escenifican algo que el producto no hace | Cerrado | Principio de demo honesta: comandos reales y demo generada por el código; sin conversaciones montadas |
| E6-R7 | Los ids de ranura en español resultan extraños a quien escribe en inglés | Aceptado | Alias en inglés aceptados por el parser y mostrados en el Studio |

### 8.13 ADRs de la Etapa 6

| Lote | Título de la entrada | Reemplaza o amplía |
|---|---|---|
| L01 | Los textos de los que depende el código viven en un vocabulario bilingüe; se escribe en el idioma del proyecto y se lee en los dos | Nueva |
| L02 | El idioma es del proyecto y se deduce primero del disco; la redacción puede ser de la tarea | Amplía P7 y la ADR del manifiesto (Etapa 3) |
| L03 | Mensajes y descripciones en dos idiomas; los nombres de las tools no se traducen | **Reemplaza** la nota de la 2.x "la interfaz del servidor está en inglés", que nunca fue del todo cierta |
| L04 | Los prompts en inglés se reescriben con glosario y revisión, no se traducen a máquina | Amplía 2026-08-08 (README bilingüe) |
| L09 | Los medios se generan de la demo real y se publican en Pages, no en git | Nueva |
| L10 | El README principal pasa a inglés | **Reemplaza** en parte 2026-08-08 "README bilingüe completo" (los dos siguen completos; cambia cuál es el principal) |

### 8.14 Estado de cierre de la Etapa 6

**Cerrada** en la iteración 7, sin ajustes. Decisiones de cierre:

| # | Decisión |
|---|---|
| M1 | El idioma estructural es del proyecto; una tarea solo elige el idioma de redacción (`redaccion`) |
| M2 | El idioma del proyecto se deduce primero de los documentos en disco y solo después del sistema |
| M3 | Los ids de ranura, los nombres de las tools y `L01…L99` no se traducen; las ranuras tienen alias en inglés |
| M4 | `README.md` en inglés pasa a ser el principal; `README.es.md` sigue completo |
| M5 | Los medios se generan en cada tag y se publican en Pages, fuera de git |

---

## 9. Cómo arrancar la ejecución

### 9.1 Antes del primer lote

> **Hecho el 2026-10-14.** Base `d7594ea` sin commits nuevos; `npm ci`, `npm run build` y `npm test` en verde (73/73) con Node 24; árbol limpio. La rama `etapa-0/blindaje` se creó desde `master`, que es la rama principal del repo. Lo ejecutado, lote por lote, está en §9.6.

0. **Validación externa** (§9.4): hecha. Resultado: luz verde con ajustes, ya incorporados en la iteración 9 (§9.4.1).
1. **Comprobar la base.** El plan se escribió sobre `d7594ea`. Si el repo avanzó, el agente compara `git log d7594ea..HEAD` con los archivos de cada lote. Si alguno cambió, vuelve a comprobar las anclas de línea de ese lote antes de tocarlo.
2. **Estado limpio:** `npm ci && npm run build && npm test` en verde (hoy: 73/73) y `git status` limpio.
3. **Rama de trabajo** por etapa, por ejemplo `etapa-0/blindaje`. Un PR por etapa, con un commit por lote.
4. **E0-R1 cerrado en la validación:** `realpath` sobre OneDrive con *Files On-Demand* no descarga el archivo y funciona a través de junctions.
5. **Node del equipo de ejecución:** 24 (el plan se escribió con 22.22; la CI prueba 22 y 24, y desde E0 L07 también en Windows).

### 9.2 Dónde vive este plan (decidido: opción B)

El plan se versiona en **`docs/plan-maestro-v3.md`**, en el lote L09 de la Etapa 0, con una ADR que reemplaza para este plan la de 2026-08-07 ("El plan del proyecto vive en Issues, no en un archivo"). Motivo: es un activo de ingeniería de primer nivel para el portafolio.

- **De L01 a L08**, el agente local leyó el archivo descargado; los desvíos de esos lotes se registraron allí (iteraciones 10 a 12).
- **Desde L09**, esta copia del repo es la fuente. Cada etapa actualiza el estado de sus lotes y sus desvíos en su lote de documentación.
- **Las issues siguen sirviendo** para fallos y pendientes sueltos, y para seguir cada etapa con un enlace a su sección.

### 9.3 Usar `mcp-phase-gate` sobre sí mismo (opcional)

Con tu 2.0.0 instalada se puede llevar cada etapa como una tarea de un proyecto `MCP-PHASE-GATE` de tu Documentación:
- `00 - Contexto Inicial.md`: la sección de la etapa.
- `01` y `02`: una nota corta que remite a este plan (el análisis y las decisiones ya están aquí).
- `03 - Plan Técnico.md`: la tabla de lotes de la etapa.
- La Fase 4, por lotes, como dice el plan.
- La Fase 5, antes de cada PR.

Es dogfooding y también material para el caso de estudio.

### 9.4 Validación externa del plan (antes de L01)

Antes de ejecutar nada, un segundo agente local revisa el plan **en modo de solo lectura** contra tu equipo Windows y el repo real. El plan se escribió y verificó en un contenedor Linux en la nube, y hay supuestos que desde ahí no se pudieron probar. El mensaje para ese agente:

````text
Eres el VALIDADOR EXTERNO de un plan técnico. Tu trabajo es encontrar lo que el plan da por
cierto y no lo es en este equipo. No eres quien lo ejecuta.

CONTEXTO
- Repositorio: mcp-phase-gate (servidor MCP en TypeScript, Node, publicado en npm como 2.0.0).
- El plan es PLAN_MAESTRO_V3.md (te lo paso aparte). Tiene 7 etapas (0 a 6) y 80 lotes.
- Se escribió desde un contenedor Linux en la nube: Node 22.22, git 2.43, el SDK
  @modelcontextprotocol/sdk 1.30.0 instalado, sobre el commit d7594ea. Allí se ejecutaron
  pruebas reales, pero NADA se probó en Windows, ni en OneDrive, ni en los clientes MCP de la
  autora (Cursor, VS Code, Claude Code).
- Este equipo es Windows. La Documentación Central vive en una carpeta de OneDrive.

REGLAS (no negociables)
1. SOLO LECTURA sobre el repositorio de la autora y sobre su Documentación. No edites, no
   crees ni borres archivos ahí. No hagas commit, branch, stash, checkout que cambie archivos,
   ni push.
2. Para todo lo que haya que ejecutar (npm ci, npm test, scripts de prueba), clona el repo
   en una carpeta temporal y trabaja ahí:
     git clone <ruta del repo local> "%TEMP%\mcp-phase-gate-validacion"
3. Las pruebas de rutas y de archivos van en carpetas nuevas dentro de %TEMP%. Para probar
   OneDrive, pide a la autora que cree una carpeta de prueba vacía dentro de su OneDrive
   (por ejemplo "phase-gate-pruebas") y usa solo esa. Nunca toques su Documentación real.
4. No instales nada global sin preguntar.
5. Cada afirmación de tu informe lleva evidencia: el comando exacto y su salida real, o el
   archivo:línea. Si algo no lo pudiste comprobar, dilo como "no comprobado" y por qué. No
   rellenes con suposiciones: es justo lo que vienes a evitar.

QUÉ TIENES QUE COMPROBAR

A. Que el plan sigue apoyado en el código real
   1. git log --oneline -1 del repo local. Si no es d7594ea, lista con
      git log d7594ea..HEAD --stat qué archivos cambiaron, y marca qué lotes del plan citan
      esos archivos (sus anclas de línea podrían estar movidas).
   2. En el clon temporal: npm ci, npm run build, npm test. El plan dice 73/73 en verde.
   3. Recorre las anclas archivo:línea de la Sección 2 (Etapa 0) y de §3.4 (prompts de la
      Etapa 1) y confirma que apuntan al texto que el plan dice. Reporta cada una que no.
   4. Confirma que .claude/settings.local.json y cualquier auditoria*.txt EXISTEN en este
      equipo y NO están rastreados por git (git ls-files, git log --all -- <archivo>). Si
      alguno estuviera en el historial, es un hallazgo de severidad alta.

B. Supuestos de Windows que nadie probó (los más importantes)
   1. Contención de rutas (Etapa 0, L01): reproduce en %TEMP% los ataques del plan, adaptados
      a Windows, contra el build del clon (o con un script de Node que importe build/paths.js):
      "..\..\x", "../../x", nombres con ":" (flujos alternos de NTFS), "C:\algo" y "\\servidor\
      recurso" como file_name, nombres reservados (CON, NUL.txt, com1), nombres con punto o
      espacio al final, y mayúsculas distintas en la ruta base. Di cuáles escapan HOY. El plan
      dice que hoy escapan los equivalentes en Linux.
   2. fs.realpathSync.native sobre la carpeta de prueba de OneDrive: con archivos descargados,
      con archivos solo en la nube (Files On-Demand) y a través de un junction creado con
      mklink /J. ¿Descarga el archivo? ¿Falla? ¿Cuánto tarda? El plan basa toda su
      contención en realpath (riesgo E0-R1).
   3. Longitud de rutas: calcula la ruta más larga que generaría el plan en la Documentación
      real de la autora: <DOCS>\<PROYECTO>\Proyectos\<tarea>\04 - Ejecución\L01 - <slug de 60
      caracteres>.md. ¿Pasa de 260 caracteres? ¿Node la escribe? ¿Git for Windows tiene
      core.longpaths? El plan no lo contempla.
   4. Finales de línea: git config core.autocrlf y si hay .gitattributes. El plan compara
      textos byte a byte (pruebas de oro de los prompts, recibos e índices deterministas,
      sha256 de artefactos). Si el checkout de Windows convierte a CRLF, ¿esas pruebas
      fallarían? Propón la regla .gitattributes (eol=lf) que haría falta, sin aplicarla.
   5. Lectura del .env (Etapa 2, §4.2): con Node de este equipo, prueba util.parseEnv sobre un
      .env en UTF-8 con BOM, en UTF-8 sin BOM, en UTF-16 (como lo deja PowerShell con ">") y
      con rutas de Windows sin comillas. Confirma lo que el plan afirma.
   6. Idioma del sistema (Etapa 6, §8.3): qué devuelve Intl.DateTimeFormat().resolvedOptions()
      .locale en este equipo, lanzado desde una terminal y, si puedes, desde la configuración
      de un cliente MCP. El plan supone que en Windows sigue la configuración del sistema.
   7. git de este equipo: git --version. El plan usa --end-of-options (git ≥ 2.24),
      -c core.fsmonitor=false, GIT_OPTIONAL_LOCKS=0 y status --porcelain=v2. Prueba en un repo
      temporal los comandos de §6.1 y §5.1 y compara las salidas y códigos de salida con los
      del plan. Revisa también qué pasa con "dubious ownership" (safe.directory).
   8. fs.watch con recursive sobre la carpeta de prueba de OneDrive: ¿avisa al crear y
      modificar archivos? El plan prevé un sondeo de respaldo porque supone que no siempre.
   9. Abrir el navegador: cmd /c start "" <url> desde Node con execFile.

C. Supuestos sobre los clientes MCP (no verificados en la nube)
   1. Rutas y formato de configuración que usará init (Etapa 3, §5.8.1): Cursor
      (~/.cursor/mcp.json, clave mcpServers), VS Code (%APPDATA%\Code\User\mcp.json, clave
      servers y "type": "stdio") y Claude Code (sintaxis exacta de "claude mcp add ... --scope
      user"). Confírmalo en este equipo, solo leyendo.
   2. Cómo se escribe en Claude Code una regla de permisos que impida "git push" (el plan la
      cita como sugerencia informativa de init: Bash(git push:*)). Confirma la sintaxis
      vigente en la documentación oficial.
   3. Si cada cliente soporta MCP Prompts, Resources, Roots y Elicitation, y cómo nombra los
      prompts en la barra "/". El plan lo deja para una matriz en la Etapa 2 (L10); adelanta
      lo que puedas comprobar leyendo la documentación de cada cliente, sin instalar nada.

D. Supuestos de versiones (válidos al 2026-10-14)
   1. npm view @modelcontextprotocol/sdk version. El plan verificó las firmas de McpServer,
      registerTool, registerPrompt, registerResource, ResourceTemplate, elicitInput y
      listRoots sobre la 1.30.0 y propone subir a la 1.32.1. En el clon, instala la 1.32.1 y
      comprueba con los .d.ts que esas firmas siguen igual (§4.1 y §5.1 del plan).
   2. Que las versiones de §7.1 (vite, preact, marked, dompurify, diff, @playwright/test,
      axe-core) existen y que Vite 8 compila con el Node de este equipo (node -v).

E. Coherencia interna del plan
   1. Que el número de lotes por etapa en las tablas coincida con el "Alcance" de cada etapa,
      y que no haya dos lotes con el mismo número dentro de una etapa.
   2. Que lo que una etapa dice que "hereda" de otra exista de verdad en esa otra (funciones,
      archivos, nombres de ranura, campos del frontmatter de los recibos). Ejemplos que vigilar:
      loadPhasePrompt → ensamblarFase; prompts/ → prompts/es/ desde la Etapa 3; 22 → 23 ranuras;
      la plantilla de recibo de la Etapa 1 frente al formato de la Etapa 4; las filas de la tabla
      de verdad de R4 entre las Etapas 1 y 4; los textos en español que la Etapa 6 mueve a un
      vocabulario.
   3. Que el orden de los lotes no exija algo que todavía no existe (un lote que usa una función
      creada en un lote posterior).
   4. Que ninguna decisión cerrada de una etapa la contradiga otra etapa.

F. Privacidad, porque el plan se publicará en docs/
   Busca en el plan nombres de empresas, clientes o proyectos reales del trabajo, rutas reales de
   este equipo, correos o cualquier dato que la autora no querría publicar. Lista cada caso con
   su línea.

FORMATO DEL INFORME
1. Veredicto en la primera línea: "LUZ VERDE", "LUZ VERDE CON AJUSTES" o "ROJO".
2. Tabla de hallazgos: # | Severidad (Alta/Media/Baja) | Qué supuesto del plan falla |
   Evidencia (comando y salida, o archivo:línea) | Sección y lote del plan | Ajuste propuesto.
3. Lista de "no comprobado", con el motivo de cada uno.
4. Lista de lo que SÍ quedó confirmado, en una línea por punto.
5. Si el veredicto no es LUZ VERDE: qué lotes del plan habría que modificar antes de L01 y cómo.
   No modifiques tú el plan: propón el texto.

Al terminar, borra lo que creaste en %TEMP% y en la carpeta de prueba de OneDrive, y dilo en
el informe.
````

**Después del informe:** los hallazgos se discuten con la autora. Los que cambien el plan se registran como ajustes de la etapa afectada, y solo entonces se pasa al mensaje de §9.5.

#### 9.4.1 Resultado de la validación (iteración 9)

**Veredicto: LUZ VERDE CON AJUSTES.** Entorno: Windows 11, Node 24, Documentación en una carpeta de OneDrive. Base `d7594ea` sin cambios.

**Confirmado:**
- 73/73 tests en verde con el SDK 1.30.0 y con el 1.32.1; las firmas que usan las Etapas 2 y 3 no cambian en la 1.32.1.
- Las anclas de la Etapa 0 y de §3.4 apuntan al texto que dice el plan.
- `.claude/settings.local.json` y `auditoria*.txt` existen y nunca estuvieron en el historial.
- Los ataques de rutas S1–S6 y S9 escapan hoy también en Windows; además, un flujo alterno de NTFS (`nota.md:secreto`), que `validarSegmento` ya bloquea por los dos puntos.
- `realpath` no descarga archivos de OneDrive (E0-R1 cerrado); `util.parseEnv` se comporta como dice §4.2; la sintaxis de git, las rutas de configuración de los clientes y `claude mcp add` coinciden; los conteos de lotes cuadran.

**Ajustes incorporados:**

| # | Hallazgo | Ajuste | Dónde |
|---|---|---|---|
| V1 | `core.autocrlf=true` sin `.gitattributes`: copia de trabajo en CRLF (alta) | `.gitattributes` con `eol=lf`, refresco de la copia de trabajo y normalización al leer | §1.3; E0 L04; E1 L02; E3 bloques; E4 recibos |
| V2 | `os.tmpdir()` devuelve un nombre corto 8.3 | `carpetaTemporal` sobre `realpathSync.native` | E0 L01 |
| V3 | `npm audit` con 5 avisos tras subir el SDK | `npm audit fix` en L05, con criterio de cero o lista justificada | E0 L05 |
| V4 | Bug de elicitation en Cursor para Windows | Timeout de 3 min; dos vencimientos seguidos = no disponible en la sesión; `PHASE_GATE_ELICITATION=off` recomendado en Cursor | E2 §4.7, L08, L10 |
| V5 | `mcp.json` vacío y servidor ya registrado con otra clave | Vacío = `{}`; no se duplica el registro; se conserva la clave existente | E2 §4.6; E3 §5.8.1 |
| V6 | `Bash(git push:*)` no cubre PowerShell y no es una frontera | `Bash(git push *)` y `PowerShell(git push *)`, con la graduación honesta de candados | E3 §5.8.1 |
| V7 | Rutas de recibos cerca de 260 caracteres | Slug de 40; aviso `RUTA-LARGA` desde 240 | E4 §6.2, L09 |
| V8 | Ruido de `fs.watch` en OneDrive | Ignorar archivos de sistema y temporales; contar solo cambios reales de `mtime` o tamaño | E5 §7.5 |
| V9 | En Windows, `Intl` ignora `LANG` | Texto corregido; tests con `LANG` saltados en `win32` | E6 §8.1 |
| V10 | Un `&` rompería `cmd /c start`; el token queda en el historial | URL con caracteres permitidos; token de un solo uso y cookie con otro valor | E5 §7.3 |
| V11 | Los nombres de los prompts en "/" no son estables entre clientes | No se fijan en el texto; los decide la matriz de L10 | E2 §4.6 |
| V12 | Cifra de ADRs de §10 | 44 (41 en tablas + 3 de la Etapa 0) | §10 |
| V13 | Lotes con ADR que no listaban `docs/decisiones.md`, y E4 L08 al revés | Columnas alineadas (también E4 L01 y L02, que la validación no listó) | E3 L04; E4 L01, L02, L08; E5 L07, L10, L11; E6 L01, L03, L04, L09 |
| V14 | Orden: el test del catálogo y los parámetros de cierre y sellado | `test/prompts.test.ts` en E3 L02; `cerrar_fase` y `motivo_descarte` entran en E4 L04, `reanclar` en L05 | E3 L02; E4 L03–L05 |
| V15 | R3 citaba `cat-file -e`; ventana de `lotes: 1` entre 2.1 y 3.0-beta | R3 actualizado; ventana aceptada y documentada | §1.2; §3.5.2 |
| V16 | Privacidad: una ruta y un nombre de ejemplo demasiado parecidos a casos reales | Ruta sustituida por `D:\repos`; ejemplos genéricos en lugar de nombres reales (`ASISTENTE`), también en la descripción del preset `ai-agent-ops` | §4.3.2; §5.4.4 |
| V17 | Riesgo: un script que pierde las barras invertidas de una ruta de Windows convierte una ruta absoluta en relativa y crea carpetas dentro del repo | Regla de §1.3 sobre rutas y `git status` tras cada script (§9.5) | §1.3; §9.5 |

**No comprobado, queda para la ejecución:** `safe.directory` con un repo de otro dueño; `fs.watch` con cambios que llegan desde otro equipo por OneDrive; el idioma dentro de un cliente MCP real; las capacidades de cada cliente en ejecución (matriz de L10); la CI en `windows-latest` (se verá en E0 L07).

### 9.5 Mensaje para el agente local (Etapa 0, L01)

```text
Vamos a ejecutar la Etapa 0 (2.0.1) de PLAN_MAESTRO_V3.md (lo versionaremos como
docs/plan-maestro-v3.md en el lote L09), empezando por el lote L01.
Lee las secciones 1 (contratos), 2.1, 2.2, 2.3 (detalle de L01), 2.4 y 2.5.

Reglas:
- Trabaja solo el lote L01. No adelantes nada de L02 ni de otros lotes.
- Antes de tocar código, comprueba que las anclas de línea de L01 siguen valiendo
  contra el estado actual del repo y dime si alguna cambió.
- Escribe primero los tests de L01 (test/e2e.test.ts y test/paths.test.ts) y
  demuéstrame que fallan con el código actual; después implementa.
- Verificación: npm run build && npm test, más los casos de la columna Verificación.
  Repórtame números, no adjetivos.
- Al terminar, muéstrame los archivos tocados y el mensaje de commit del plan:
  "fix(rutas): impedir que tareas, proyectos y archivos se salgan de su carpeta".
  Con mi OK haces el commit con git add de esos archivos uno por uno. Nunca push.
- Si algo del plan no cuadra con el código real, detente y dímelo: es un desvío y
  se decide conmigo, no se improvisa.
- Nunca construyas rutas de Windows dentro de una cadena de shell ni concatenando
  texto: usa path.join. Después de cada script que ejecutes, corre git status y
  dime si apareció algo que no esperabas.
```

### 9.6 Ejecución de la Etapa 0

Rama `etapa-0/blindaje`, creada desde `master` en `d7594ea`. Un commit por lote, cada uno con el OK de la autora y con `git add` archivo por archivo; ningún `push`. Todos los lotes con código pasaron `npm ci && npm run build && npm test` antes de su commit, y los que tenían tests nuevos los mostraron en rojo contra el código anterior.

| Lote | Estado | Commit | Tests al cerrar | Desvíos |
|---|---|---|---|---|
| L01 | Hecho | `ac2adca` | 116 (antes 73) | E0-D1 |
| L02 | Hecho | `cd8976d` | 132 | — |
| L03 | Hecho | `3853501` | 139 | E0-D2, E0-D3 |
| L04 | Hecho | `acd6f8e` | 139 | E0-D4 |
| L05 | Hecho | `f3f63d0` | 139 | E0-D5 |
| L06 | Hecho | `873ad0a` | 152 (1 omitido fuera de Linux) | — |
| L07 | Hecho; la CI en Windows se verá tras el push | `b1369f3` | 152 | — |
| L08 | Hecho | `05615a2` | 159 | — |
| L09 | Hecho | `9d4e407` | 159 | — |
| L10 | Hecho en el commit `chore(release): 2.0.1`; el tag `v2.0.1` y la publicación los hace la autora | — | 159 | — |

**Desvíos** (cada uno se decidió con la autora antes de seguir):

- **E0-D1 · L01 (iteración 10).** El plan pedía "los 6 ataques" sin decir cuáles, y la tabla S1–S9 no estaba en el plan. El agente propuso la lista de 6 casos que hoy está en el detalle de L01, la autora la aprobó, y L01 quedó acotado a S1–S4 (S5 y S9 entran en L02; S6 en L03). Base: leído en código.
- **E0-D2 · L03 (iteración 11).** `npm install zod@^4.4.3 --save` escribía `"^4.6.7"` y subía zod a 4.6.7. Se deshizo y se hizo a mano: `"zod": "^4.4.3"` en `package.json` y `npm install --package-lock-only`. npm 11 añade `"peer": true` a cinco entradas del lockfile; es metadato y se aceptó. Base: medido.
- **E0-D3 · L03 (iteración 11).** Tolerancia de los argumentos: `null` en un campo opcional cuenta como ausente (`.nullish()`); un número en texto (`phase: "3"`) se rechaza con un mensaje que dice qué se espera. Base: inferido (clientes con modelos en modo estricto que mandan `null` en todo opcional).
- **E0-D4 · L04 (iteración 12).** El refresco de la copia de trabajo exigía el árbol limpio antes del commit del propio lote, y `git reset --hard` habría borrado el cambio de `.gitignore`. Nuevo orden: renormalizar, commit y después refrescar. Base: documentado (comportamiento de `git reset --hard` con cambios sin commit).
- **E0-D5 · L05.** Los dos README decían que `npm run dev` usa `ts-node`; se corrigió esa línea en el mismo lote para que se revierta entero. Además, `npm pack --dry-run` lista 22 archivos y no 20: L03 añadió `build/schemas.js` y `build/schemas.d.ts`. Base: medido.

**Interpretaciones menores** (sin desvío; quedan anotadas para que no sorprendan):

- L01: `rutaReal` decide qué "existe" con `lstat`, no con `existsSync`, para que un enlace roto haga fallar la operación en vez de saltarse.
- L02: sin ADR propia, porque `docs/decisiones.md` no estaba en su lista de archivos.
- L10: el commit de la release toca también `docs/plan-maestro-v3.md` (8 líneas: la fila "Modo" de la cabecera, la nota de estado de §2.2 y las filas L09 y L10 de esta tabla), para que la versión etiquetada no diga que la release está pendiente. Lo decidió la autora.
- L06: dos casos más de los pedidos (variable solo con espacios; ruta válida devuelta sin espacios). Como no hay código nuevo, se comprobó que los tests muerden metiendo cuatro errores a propósito en la salida compilada: fallaron 5 de 13.
- L08: en el diagrama en inglés, la flecha de la Fase 5 dice `05 · Audit`, como las demás flechas traducidas. Los cuatro enlaces a `MCP_orquestador/issues/N` dentro de ADRs antiguas se dejaron como registro histórico; solo cambió el de la cabecera.

**Auditoría externa (antes del push).** Un segundo agente auditó la etapa a ciegas, sin acceso a las cifras del ejecutor. Veredicto: **apto con observaciones**. Los 10 commits pasan build y tests cada uno por su cuenta, los totales coinciden con esta tabla y hubo 0 escapes en 273 casos de ataque (39 de la verificación y 234 nuevos). Encontró 2 hallazgos medios y 10 bajos. Todos se resolvieron con commits nuevos encima de L10, sin reescribir la historia:

| # | Sev. | Hallazgo | Resolución |
|---|---|---|---|
| 1 | Media | `file_path` no validaba sus segmentos: dentro de DOCS creaba `CON`, `nul.md` o `nota.md:secreto` | Cada segmento de `file_path` pasa por `validarSegmento`, como `file_name`; también se rechaza un `file_path` absoluto |
| 2 | Media | `test/helpers.ts` citaba el nombre corto 8.3 real del equipo | Cambiado por `NOMBRE~1`. El texto sigue en la historia de `ac2adca` (sensibilidad baja: es casi el nombre por defecto) |
| 3 | Baja | L10 tocó `docs/plan-maestro-v3.md` sin anotarlo | Anotado arriba, en las interpretaciones menores |
| 4 | Baja | `validarSegmento` aceptaba `COM¹`, `CONIN$`, `nul .txt`… | Lista de nombres reservados ampliada |
| 5 | Baja | `leerTextoAcotado` leía sin tope si el archivo crecía tras el `stat`, y se bloqueaba con un FIFO | Lectura por descriptor: `fstat`, `isFile()` y como mucho límite + 1 bytes, con `O_NONBLOCK`. **Riesgo aceptado:** la contención mira la ruta real y la apertura usa la ruta tal cual, así que cambiar un enlace entre las dos cosas abriría otro destino; cerrarlo exige abrir sin seguir enlaces componente a componente, que Node no ofrece de forma portable |
| 6 | Baja | Esta sección decía "cinco enlaces" y son cuatro | Corregido |
| 7 | Baja | `.env.example` decía "MCP Orquestador" | Cambiado por `mcp-phase-gate` |
| 8 | Baja | Un ancla de cada README fallaba, porque GitHub conserva U+FE0F en el ancla del encabezado 🗂️ | Quitado U+FE0F de los tres encabezados con emoji de cada README |
| 9 | Baja | Los tests no borraban sus carpetas temporales (unas 145 por ejecución) | `carpetaTemporal` registra lo que crea y un `after()` lo borra; medido: 0 carpetas nuevas por ejecución |
| 10 | Baja | `phase: 1e20` respondía en inglés | `too_big` tiene su mensaje: "`phase` es demasiado grande." |
| 11 | Baja | Usos que dejan de funcionar no estaban documentados | Apartado "Qué deja de funcionar" en la ADR de L01 |
| 12 | Baja | `resolveDocPath(args: any)` seguía con `String(args.x)` | Tipado con `ArgumentosDeDocumento`; 0 `String(args` en `src/` |

Tras los ajustes: 171 tests (169 pasan; 2 omitidos fuera de Linux o macOS: `XDG_STATE_HOME` y el FIFO).

**Pendiente de comprobar fuera de este equipo:** todos los tests nuevos de la Etapa 0 corrieron solo en Windows (Node 24). Su primera ejecución en Linux, y la de Node 22, será la CI del PR (L07).

### 9.7 Ejecución de la Etapa 1

Rama `etapa-1/lotes-y-recibos`, creada desde `master` en `eef0058`, con la Etapa 0 ya integrada. Un commit por lote, cada uno con el OK de la autora y con `git add` archivo por archivo. El agente no hizo ningún `push`: el commit de L11 y la subida de la rama, antes de la auditoría externa, los hizo la autora. Todos los lotes pasaron `npm ci && npm run build && npm test` antes de su commit. Los tests de L01 a L06 se volvieron a medir en una copia aparte del repo, commit por commit, al cerrar la etapa, y la auditoría externa midió los 11 por su cuenta con los mismos resultados.

| Lote | Estado | Commit | Tests al cerrar | Desvíos |
|---|---|---|---|---|
| L01 | Hecho | `4d616f4` | 191 (antes 171) | E1-D1 |
| L02 | Hecho | `7810ce4` | 225 | E1-D2 |
| L03 | Hecho | `3cd9e1a` | 244 | — |
| L04 | Hecho | `e6d1f53` | 249 | — |
| L05 | Hecho | `da84414` | 251 | — |
| L06 | Hecho | `9a57ac0` | 252 | — |
| L07 | Hecho | `91b6b5e` | 253 | E1-D3 |
| L08 | Hecho; cierra #39 y #40 al integrar el PR | `c390f04` | 255 | E1-D4 |
| L09 | Hecho | `155e608` | 255 | — |
| L10 | Hecho | `d0a48b7` | 255 | E1-D5 |
| L11 | Hecho; commit de la autora. El tag `v2.1.0` y la publicación los hace la autora | `2344f63` | 255 | E1-D6 |

En todas las filas, 2 de los tests se omiten fuera de Linux o macOS (`XDG_STATE_HOME` y el FIFO), como al cerrar la Etapa 0. La versión etiquetada `2.1.0` incluye además los ajustes de la auditoría (abajo), que van en commits nuevos encima de L11.

**Desvíos** (cada uno se decidió con la autora antes de su commit):

- **E1-D1 · L01.** `start_task` rechaza un `task_name` que empieza por punto, y un `project` que empieza por punto cuando viene con `crear_proyecto`; y la descripción de `file_path` en `write_central_doc` dice que la ruta debe caer dentro de una tarea existente. El plan no lo pedía en este lote. Detalle en la ADR de L01. Base: leído en código.
- **E1-D2 · L02.** La comprobación de que la Fase 4 declara `recibos` se mudó a L07, que es donde llega ese frontmatter. Base: leído en código.
- **E1-D3 · L07.** En "Dónde va cada recibo", el texto de §3.5.2 decía "(ventana aceptada, ver la nota de diseño de abajo)". Esa nota vive en el plan, no en el prompt, así que el modelo habría leído una referencia a algo que no existe. Se quitó del prompt, y su contenido pasó a la ADR de L07 como consecuencia aceptada. Base: leído en código.
- **E1-D4 · L08.** Al envolver los ejemplos de la Fase 5 en la ranura `ejemplos` (§3.4.5 a), la regla 3 del validador marcó 5 errores: los `## Contexto`, `## Cambios` y `## Problema` de los PR de ejemplo, que van entre `--- INICIO EJEMPLO ---` y `--- FIN EJEMPLO ---` sin bloque de código. Meterlos en un bloque habría cambiado lo que ve el modelo (el prompt dice que se muestran sin bloque a propósito), así que el validador de `test/prompts.test.ts` trata esos delimitadores como una valla, con un caso de prueba propio. Fuera del ejemplo, un `##` dentro de una ranura sigue siendo error. Base: medido (5 errores antes, 0 después).
- **E1-D5 · L10.** Además del contenido mínimo, los README corrigen dos textos que ya no eran ciertos: `/f5` no exige los commits después del comando (los toma de los recibos), y la fila de `write_central_doc` dice que solo escribe dentro de una tarea y que tiene `force`. Base: leído en código.
- **E1-D6 · L11.** El commit de la release toca también este plan (la cabecera, la nota de estado de §3.8, esta sección y el Anexo A), igual que en la Etapa 0, para que la versión etiquetada no diga que la etapa está pendiente. Lo decidió la autora.
- **E1-D7 · L04 (detectado por la auditoría).** §3.8 pedía comprobar `get_phase_prompt(1)` por E2E y se comprobó con un test unitario de `loadPhasePrompt`. El caso E2E, para las cinco fases, llegó con el ajuste A4. Base: leído en código.

**Interpretaciones menores** (sin desvío):

- L03: `force` es `.nullish()` y no `.optional()`, como todo opcional desde la Etapa 0 (E0-D3); lo explica la ADR de L03.

**Tamaño de los prompts** (riesgo E1-R5), en caracteres y en LF, antes y después del lote que los cambió, medido sobre los commits. La primera versión de esta tabla mezclaba conteos en CRLF (los "antes" de las Fases 4 y 5 y el "después" de la 5, medidos sobre la copia de trabajo) y contaba una línea de más; la auditoría lo detectó y estas son las cifras corregidas:

| Prompt | Lote | Antes | Después |
|---|---|---|---|
| Fase 1 | L05 | 8 351 (167 líneas) | 9 380 (183) |
| Fase 2 | L05 | 11 112 (246) | 13 018 (275) |
| Fase 3 | L06 | 13 447 (266) | 16 408 (321) |
| Fase 4 | L07 | 10 454 (235) | 15 608 (357) |
| Fase 5 | L08 | 12 501 (208) | 13 757 (231) |

La Fase 4 crece 122 líneas, más que las "unas 80" que preveía el riesgo: la plantilla del recibo y el índice de cierre van completos dentro del prompt. Con el ajuste A3 de la auditoría queda en 16 681 caracteres (369 líneas).

**Auditoría externa (antes del PR).** Un segundo agente auditó la etapa a ciegas, sin leer esta sección hasta tener sus propias cifras, y con permiso para cuestionar las ADRs de la etapa. Veredicto: **apto con observaciones**. Los 11 commits compilan y pasan los tests cada uno por su cuenta, tocan los archivos de su lote y sus mensajes coinciden con el plan; sus cifras de tests coinciden con las de la tabla. Encontró 3 hallazgos medios, 12 bajos y 3 cuestionamientos de ADRs. Todos se resolvieron con commits nuevos encima de L11, sin reescribir la historia:

| Ajuste | Commit | Resuelve | Tests al cerrar |
|---|---|---|---|
| A1 | `ed74866` | 1, 13, C | 262 |
| A2 | `f32ef7a` | 2, 7, 15 | 265 |
| A3 | `db4c041` | 3, 4, 5, 6, 14, A | 265 |
| A4 | `09b5f0d` | 8, 11 | 269 |
| A6 | `13df598` | B | 272 |
| A5 | El commit de documentación de la auditoría | 9, 10, 12 y esta sección | 272 |

| # | Sev. | Lote | Hallazgo | Resolución |
|---|---|---|---|---|
| 1 | Media | L03 | R4 se esquivaba sin `force` con un nombre nuevo en otras mayúsculas o en Unicode NFD: crear `00 - contexto inicial.md`, un recibo en `04 - ejecución/` con la Fase 5 presente, o `01 - Análisis Técnico.md` en NFD con la Fase 2 presente | `motivoDeProteccion` compara por `claveDeNombre` (NFC y sin mayúsculas, en todos los sistemas); 6 filas nuevas en la tabla de verdad |
| 2 | Media | L02 | `recibos` aceptaba `.recibos` o el nombre de un documento, que rompían el flujo | Se ignora, con aviso en el log, un valor con punto delante o igual a un documento o al contexto inicial |
| 3 | Media | L07 | La Fase 4 no comprobaba la rama antes de commitear: en la rama principal, los commits caían ahí | `git branch --show-current` contra la rama del plan antes del primer commit; si no coincide o es la principal, se detiene |
| 4 | Baja | L07 | No prohibía `git commit -a`, `git add -u`, una carpeta entera ni `--amend` | Prohibidos en COMMITS y PROHIBIDO |
| 5 | Baja | L04 | Las reglas globales remitían al "paso 0 de cada fase", que solo tiene la Fase 2 | "lo dice cada fase en su apartado de pendientes heredados" (§3.3 actualizado) |
| 6 | Baja | L07 | "El único punto de parada del lote" chocaba con las otras paradas | "el único punto de parada previsto" |
| 7 | Baja | L02 | La regex de `quitarMarcadores` no anclaba el fin de línea | Anclada; un marcador que no se reconoce queda avisado en el log |
| 8 | Baja | L02/L08 | El validador de ranuras era más blando de lo que decía | Vallas del mismo tipo, ejemplo sin `FIN` es error, catálogo exacto por archivo y 22 en total |
| 9 | Baja | L03/L10 | "Crear un documento que no existe nunca se rechaza" no era cierto para los recibos | Matizado en los README y en la ADR de L03 |
| 10 | Baja | L10 | La advertencia sobre un `global-rules.md` propio omitía `EVIDENCIA` | Añadida en los dos README |
| 11 | Baja | L04 | El E2E de `get_phase_prompt` se hizo como test unitario sin registrarlo | E2E de las cinco fases; registrado como E1-D7 |
| 12 | Baja | L01 | La ADR decía que daba igual la vía de la ruta; con un enlace entre tareas difieren | Matizado en la ADR de L01: las dos vías son seguras |
| 13 | Baja | L03 | `force` respondía "sobrescrito" también al crear | "(creado con force)" cuando no existía |
| 14 | Baja | L07 | La plantilla del índice fijaba `03 - Plan Técnico.md` y `04 - Ejecución/` | Marcadores de posición |
| 15 | Baja | L02 | Un prompt propio con BOM perdía su frontmatter | `aLF` quita el BOM |

| # | ADR cuestionada | Resolución |
|---|---|---|
| A | L07: con `lotes: 1`, un lote fallido dejaba el recibo como documento de la fase y la tarea aparecía cerrada | Aceptado: un único lote fallido o descartado deja su recibo en la subcarpeta. Queda anotado el resto (el usuario rechaza el commit con el recibo ya escrito), que cierra la 3.0.0 |
| B | L02: ninguna tool listaba los recibos, así que al retomar el modelo no podía descubrirlos | Aceptado: `get_phase_prompt` añade la lista de recibos existentes en la fase que los declara y en las posteriores |
| C | L03: "Las mayúsculas no lo esquivan" solo valía para archivos existentes | Aceptado con el hallazgo 1; el párrafo de la ADR se reescribió |

Los textos de §3.3 y §3.5.2 de este plan describen los prompts tal como se diseñaron. Lo que la auditoría cambió en ellos está en esta tabla y en las ADRs de L04 y L07; §3.3 se actualizó en su única frase cambiada porque es la que el plan cita como texto completo.

**No comprobado por la auditoría:** Linux y macOS (el hallazgo 1 se comporta distinto según el sistema de archivos), Node 22, enlaces simbólicos reales en Windows (solo se probaron uniones) y el comportamiento de un modelo real con estos prompts.

**Pendiente de comprobar fuera de este equipo:** como en la Etapa 0, todos los tests corrieron solo en Windows (Node 24). Su primera ejecución en Linux y en Node 22 será la CI del PR.

### 9.8 Ejecución de la Etapa 2

Rama `etapa-2/protocolo-mcp`, creada desde `master` en `e0f2337` (el merge de la Etapa 1, etiquetado `v2.1.0`). Un commit por lote, con `git add` archivo por archivo y ningún `push`. A diferencia de la Etapa 1, la autora dio un **OK general** para toda la etapa antes de empezar: el agente commiteó cada lote en cuanto quedó en verde, y se reservó parar solo ante una decisión de peso (no hizo falta ninguna). Todos los lotes pasaron `npm run build && npm test` antes de su commit; la etapa empezó con `npm ci` sobre una base de 272 tests (270 pasan, 2 omitidos).

| Lote | Estado | Commit | Tests al cerrar | Desvíos |
|---|---|---|---|---|
| L01 | Hecho | `b37c054` | 291 (antes 272) | E2-D1 |
| L02 | Hecho | `8da0a58` | 314 | E2-D2 |
| L03 | Hecho | `2843ff0` | 324 | — |
| L04 | Hecho | `373f5f6` | 331 | E2-D3 |
| L05 | Hecho | `c387a12` | 335 | E2-D4 |
| L06 | Hecho | `f701bff` | 351 | E2-D5 |
| L07 | Hecho | `4cb5fd3` | 358 | E2-D6 |
| L08 | Hecho | `604a076` | 370 | E2-D7 |
| L09 | Hecho | `90d404c` | 385 | E2-D8 |
| L10 | Hecho, con la matriz de clientes **sin rellenar** | `5bb099c` | 385 | E2-D9 |
| L11 | Hecho; el tag `v2.2.0` y la publicación los hace la autora | `0691caf` | 385 | E2-D10 |

En todas las filas, 2 de los tests se omiten fuera de Linux o macOS (`XDG_STATE_HOME` y el FIFO).

**§4.1 repetido sobre el SDK 1.32.1** (primer paso de L04, riesgo E2-R5): las firmas de `registerTool`, `registerPrompt` y `registerResource` no cambian; un fallo de validación sigue llegando como `isError` con el prefijo `Input validation error: Invalid arguments for tool <x>:`; `elicitInput` sigue lanzando `Client does not support form elicitation.` sin la capacidad; `DEFAULT_REQUEST_TIMEOUT_MSEC` sigue en 60 000; `UriTemplate.match` sigue sin decodificar, y una variable simple casa con `([^/,]+)`. Dos detalles nuevos: el texto del error de validación llega además con el prefijo `MCP error -32602:` y un sufijo ` at <campo>`; y el SDK hace `new URL(uri)` antes de buscar plantilla, lo que colapsa un `%2E%2E` antes de que llegue al callback. La capacidad `prompts` solo se puede declarar antes de conectar (E2-D6). Base: leído en código (`node_modules/@modelcontextprotocol/sdk/dist/esm`).

**Desvíos:**

- **E2-D1 · L01.** Toca también `src/index.ts` (al cambiar `RutaRequerida.variable` por `logica`, `reportarRutas` lo necesitaba; de paso deja en el log las discrepancias y el error del `.env`) y `src/paths.ts` (un mensaje con el nombre viejo). `test/helpers.ts` limpia el entorno también al importarse: una `PHASE_GATE_*` en la terminal de quien corre los tests ganaría a las `ORQUESTADOR_*` que ponen los tests. "Definida" es que exista aunque esté vacía, para que `PHASE_GATE_TASKS_SUBDIR=""` signifique lo mismo que con el alias. `cargarEnv` sustituye la carga anterior al volver a llamarla. Base: leído en código.
- **E2-D2 · L02.** Toca `src/phases.ts`: exporta `resolveGlobalRules`, `leerPromptNormalizado` y `resolveCommandFile` (este último se adelanta de L07, porque el diagnóstico ya informa del comando de cada fase), y el BOM literal de `aLF` pasa a escribirse `\uFEFF` (mismo comportamiento). `GLOBAL-SIN-BASE` comprueba también `## EVIDENCIA`, que los README piden desde el hallazgo 10 de la auditoría de la Etapa 1. Dos códigos de hallazgo que la tabla de §4.3.1 no tenía: `ENV-ILEGIBLE` (un `.env` que no se puede leer por otro motivo que el UTF-16) y `DOCS-ILEGIBLE` (un fallo al recorrer la Documentación). Base: leído en código.
- **E2-D3 · L04.** Los E2E de las Etapas 0 y 1 exigen los mensajes en español ("`phase` debe ser un número, por ejemplo 3"). Para que pasen sin cambios, cada campo de los shapes lleva su mensaje con la opción `error` de zod v4, y `validarLlamada` desaparece. El log vive en un `src/log.ts` nuevo y no en `servidor.ts`, porque `phases.ts` y `tasks.ts` también lo usan y habría un import circular. `describePhases` se elimina (se quedó sin uso). `resources/list_changed` se difiere a L06: sin recursos registrados no hay capacidad que notificar. Base: medido (los 324 tests de antes pasaron sin tocar ninguno).
- **E2-D4 · L05.** El `outputSchema` (`diagnosticoShape`) vive en `src/schemas.ts`, junto a los demás shapes, y `test/servidor.test.ts` comprueba al compilar que el tipo `Diagnostico` cuadra con él. Base: leído en código.
- **E2-D5 · L06.** Toca `src/diagnostico.ts` (extrae `capasDePrompts`, `capaDeArchivo` y `fasesConCapa`, que reutiliza `phase-gate://fases`), crea `test/cliente.ts` (el cliente en memoria compartido) y adapta `test/servidor.test.ts`. Además de documentos y recibos con punto, se rechaza una **tarea** con punto inicial. Sin `DOCS_PATH`, el listado devuelve solo los dos recursos fijos en vez de fallar. Base: medido.
- **E2-D6 · L07.** Toca `src/diagnostico.ts` y su test: `FASE-SIN-COMANDO` y el formato dicen que la fase usa el texto genérico. La capacidad `prompts` solo se puede declarar antes de conectar, así que si al arrancar no hubiera ninguna fase, el servidor registra y quita un prompt provisional para dejarla declarada. `docs/comandos-de-fase.md` describe cómo se invocan los prompts en cada cliente "según su documentación", a la espera de la matriz de L10. Base: medido (un test arranca sin fases y añade una después).
- **E2-D7 · L08.** `pedirConfirmacion` devuelve `{ estado, nota? }` y no solo el estado: la nota lleva al modelo el aviso del primer vencimiento (`PHASE_GATE_ELICITATION=off`) y el de que la sesión pasó a `no-disponible`. Si lo protegido es el contexto inicial que falta, la pregunta dice "¿Crearlo?" en vez de "¿Reescribirlo?". El plazo se inyecta en los tests con `fijarEsperaDeConfirmacion`. El lote toca también `test/cliente.ts` (el helper `textoDe` acepta cualquier resultado de tool), que no estaba en su lista: lo detectó la auditoría. Base: leído en código.
- **E2-D8 · L09.** Toca `src/phases.ts` (`separarFrontmatter`, extraído de `parsePhaseFile`, para leer el frontmatter de los recibos) y suma un test de integración en `test/servidor.test.ts` (el orden compuerta → pendientes → prompt). Interpretaciones: la línea del encabezado admite espacios al final; los recibos se miran en cualquier fase posterior a la que los declara, no solo en la 5; con un solo lote se mira el frontmatter del documento de la Fase 4, que es su recibo. Base: leído en código.
- **E2-D9 · L10.** La matriz de clientes **no se rellenó con lo observado**: el agente no puede manejar Cursor ni VS Code, ni recargar el servidor de su propia sesión de Claude Code. Los README la publican con "Por verificar" y lo que dice la documentación de cada cliente, en vez de inventar resultados. De paso, los ejemplos de varios registros usan las claves `pg-trabajo`/`pg-personal`. Base: inferido (la rellena la autora con los tres clientes; ver abajo).
- **E2-D10 · L11.** El commit de la release toca también este plan (la cabecera, la nota de estado de §4.9, esta sección y el Anexo A), como en las Etapas 0 y 1 (E1-D6). La cabecera corrige además "Versión publicada", que seguía en `2.0.0`. Base: leído en código.
- **E2-D11 · después de L11.** Las ADRs de L01 y L07 reemplazan en parte o matizan dos entradas viejas ("Un solo nombre" y "La configuración por dispositivo no vive en el repo"), y esas entradas no llevaban la nota que pide la cabecera de `docs/decisiones.md`. Se añadió en un commit aparte, encima de la release, sin reescribir la historia. Base: leído en código.

**Auditoría externa (antes del PR).** Un segundo agente auditó la etapa a ciegas: midió sus propias cifras antes de leer esta sección (salvo el texto de E2-D8 a E2-D11, que vio en un diff, sin cifras) y tuvo permiso para cuestionar las ADRs. Veredicto: **apto con observaciones**. Los 12 commits compilan y pasan los tests cada uno por su cuenta, con las mismas cifras de la tabla; los asuntos coinciden con §4.9; los E2E y los prompts de fase no cambian; `npm audit` da 0. Encontró 1 hallazgo alto, 3 medios y 14 bajos, y cuestionó dos decisiones de la ADR de L08. Se resolvieron con commits nuevos encima de la rama, sin reescribir la historia:

| Ajuste | Commit | Resuelve | Tests al cerrar |
|---|---|---|---|
| A1 | `baac26d` | 1, 9, 12 (diagnóstico) | 390 |
| A2 | `a6f4aca` | 2, 8, 12 (config) | 393 |
| A3 | `6a0e0f2` | 3, 16 (segundo vencimiento), ADR de L08 | 399 |
| A4 | `97a435d` | 6, 7 | 401 |
| A5 | `897a719` | 5, 14, 17, 18, y la sugerencia sobre la ADR de L04 | 403 |
| A6 | `f7048f8` | 11 | 414 |
| A7 | `ca0699e` | 10 | 414 |
| A8 | El commit de documentación de la auditoría | 13, 15, 16 y esta sección | 414 |

| # | Sev. | Lote | Hallazgo | Resolución |
|---|---|---|---|---|
| 1 | Alta | L02 | `diagnosticar()` lanzaba ENOTDIR con `PHASE_GATE_PROMPTS_PATH` apuntando a un archivo: `doctor`, `get_orchestrator_status` y `phase-gate://estado` fallaban | `discoverPhases` y `resolveCommandFile` saltan una capa que no es carpeta (`esCarpeta`, que no lanza con ENOTDIR); hallazgo nuevo `CAPA-NO-ES-CARPETA`; el diagnóstico captura cualquier fallo de lectura de prompts como `PROMPTS-ILEGIBLES` |
| 2 | Media | L01 | Un `.env` con `PHASE_GATE_*` ganaba a un bloque `env` del cliente con `ORQUESTADOR_*` | Gana primero la fuente (entorno antes que `.env`) y después el nombre; la discrepancia dice por qué. ADR de L01 ampliada |
| 3 | Media | L08 | Si el cliente cancelaba la tool antes de que la persona contestara, el archivo se escribía igual | La elicitation va con `signal: extra.signal`; una cancelación es `rechazada` sin contar como vencimiento, y antes de escribir se comprueba que la llamada no se canceló |
| 4 | Media | L10 | La matriz de clientes sin rellenar | **Pendiente**: la rellena la autora (abajo) |
| 5 | Baja | L04 | La línea de arranque salía como notificación JSON por stdout antes del `initialize` | `log()` solo notifica después del `initialize` |
| 6 | Baja | L06 | El listado y el autocompletado enseñaban nombres y fechas de archivos de fuera a través de un enlace | Se filtran con la misma contención que la lectura |
| 7 | Baja | L06 | Los errores de lectura de recursos llegaban como -32603 | `-32002` si no existe, `-32602` si no es válido, `-32603` solo para E/S inesperada |
| 8 | Baja | L01 | Una variable de ruta vacía tapaba un alias válido | En las variables de ruta, vacía cuenta como ausente (y se avisa) |
| 9 | Baja | L02 | Un `active-tasks.json` corrupto salía como "0 punteros", sin hallazgo | Hallazgo nuevo `ESTADO-ILEGIBLE` |
| 10 | Baja | L07 | `test/docs.test.ts` solo detectaba una copia de la primera línea | Comprueba toda línea de 30 caracteres o más |
| 11 | Baja | L09 | Falsos positivos ("- Ninguna.", "_Ninguna._", "N/A"…) y un falso negativo (el encabezado en otras mayúsculas) | Se quitan viñetas, énfasis y puntos suspensivos, se amplía la lista y el encabezado se compara sin mayúsculas. ADR de L09 actualizada |
| 12 | Baja | L01/L02 | `catch (error: any)` en código nuevo | Tipados en `config.ts` y `diagnostico.ts` |
| 13 | Baja | L08 | `test/cliente.ts` tocado sin registrar | Añadido a E2-D7 |
| 14 | Baja | L04 | La ADR no recogía todo lo que cambia para el cliente | Ampliada: `Tool <x> not found`, `$schema`, `minLength`, `minimum`/`maximum`, y el riesgo no comprobado de los tipos `["string","null"]` |
| 15 | Baja | docs | Un BOM literal en E2-D2, "E2-D1 a E2-D10" en el Anexo A y la fila de L11 sin SHA | Corregidos |
| 16 | Baja | docs | El README no decía qué pasa en el segundo vencimiento; la fila de VS Code de `docs/comandos-de-fase.md` y una referencia ambigua "la del 2026-08-08" | El comportamiento cambió (A3) y los README lo dicen; la fila y las referencias, precisadas |
| 17 | Baja | L07 | Los argumentos de `/fN` se insertaban con saltos de línea y secciones falsas | `project`, `task_name` y `commits` se aplanan a una línea; el `contexto` va tal cual, como riesgo asumido en la ADR de L07 |
| 18 | Baja | L04 | El log notifica al último servidor creado | Documentado en `src/log.ts` y en la ADR de L04 (aceptado: en producción hay uno) |

| # | Decisión cuestionada | Resolución |
|---|---|---|
| A | L08: en el segundo vencimiento seguido, esa misma llamada escribía si traía `force: true` | Aceptado: esa llamada falla cerrada y `force` decide desde la siguiente |
| B | L08: recordar "no disponible" toda la sesión, sin caducar | Se mantiene, como consecuencia aceptada en la ADR |
| C | L04: las descripciones remiten a recursos que no todos los clientes dejan leer al modelo | Aceptado: remiten también a `list_tasks` y `get_orchestrator_status` |
| D | Decisiones sin ADR: la precedencia entre vías, la cancelación y los valores de `PHASE_GATE_ELICITATION` | Recogidas en las ADRs de L01 y L08; `PHASE_GATE_ELICITATION` acepta ahora `off`, `false`, `0` y `no` |

**Pendiente antes del tag `v2.2.0`:**

1. **Rellenar la matriz de L10** en los dos README con lo observado en Claude Code, Cursor y VS Code: `/f1`…`/f5` visibles y cómo se invocan, argumentos con espacios, recursos con `@`, y si aparece el formulario de confirmación (`write_central_doc` sobre un documento congelado). Si algún cliente contradice lo documentado, corregir también `docs/comandos-de-fase.md`.
2. **La CI del PR**: como en las etapas anteriores, todos los tests corrieron solo en Windows (Node 24). Su primera ejecución en Linux y en Node 22 será la CI.

### 9.9 Ejecución de la Etapa 3

Rama `etapa-3/configuracion`, creada desde `master` en `b626e4d` (el merge de la Etapa 2, publicada como `2.2.0`). Un commit por lote, con `git add` archivo por archivo y ningún `push`. Como en la Etapa 2, la autora dio un **OK general** para toda la etapa antes de empezar, reservando la parada para una decisión de peso (no hizo falta ninguna: los desvíos de abajo son de alcance o de texto, y cada uno queda registrado con su Base). Todos los lotes pasaron `npm run build && npm test` antes de su commit; la etapa empezó con `npm ci` sobre una base de 414 tests (412 pasan, 2 omitidos) y L13 repitió `npm ci`, `npm run build`, `npm test` y `npm audit` (0 avisos).

| Lote | Estado | Commit | Tests al cerrar | Desvíos |
|---|---|---|---|---|
| L01 | Hecho | `0fb8129` | 415 (antes 414) | E3-D1 |
| L02 | Hecho | `d74a97a` | 449 | E3-D2 |
| L03 | Hecho | `3b69058` | 477 | E3-D3 |
| L04 | Hecho | `f61826c` | 509 | E3-D4, E3-D5 |
| L05 | Hecho | `518a7dd` | 516 | E3-D6 |
| L06 | Hecho | `b08bb9b` | 536 | E3-D7 |
| L07 | Hecho | `9dd314d` | 548 | E3-D8 |
| L08 | Hecho | `e5e2db3` | 562 | E3-D9 |
| L09 | Hecho | `93ceba3` | 580 | E3-D10 |
| L10 | Hecho | `f10afe1` | 589 | E3-D11 |
| L11 | Hecho | `d0632ad` | 605 | E3-D12 |
| L12 | Hecho | `fdea07c` | 605 | E3-D13 |
| L13 | Hecho en el commit `chore(release): 3.0.0-beta.0 publicada con la etiqueta beta`; el tag `v3.0.0-beta.0` y la publicación los hace la autora | — | 605 | E3-D14 |

En todas las filas, 2 de los tests se omiten fuera de Linux o macOS (`XDG_STATE_HOME` y el FIFO). En L07 se suma uno que solo corre en Windows (la URI `file:///c%3A/…` de VS Code), que en Linux contará como omitido.

**Lo que se comprobó además de la suite:**

- **El texto que recibe el modelo no cambia sin bloques** (L02): con la ranura `global/extra` vacía, `loadPhasePrompt(1…5)` es idéntico byte a byte al del build de la etiqueta `v2.2.0` (construido en un worktree aparte). Los archivos de oro de L05 salen de ese mismo build, guardados **antes** de cambiar los textos.
- **Los tests nuevos muerden** (L02): invertir el orden de las capas y quitar la reinyección deja 3 tests de capas en rojo.
- **§5.1 repetido sobre el SDK 1.32.1** (L07): `listRoots` (`server/index.js:394`), `oninitialized`, `getClientCapabilities` y `RootsListChangedNotificationSchema` (`types.js:1951`) siguen igual; `enforceStrictCapabilities` está ahora en `shared/protocol.js:651`. Detalle nuevo: el `Client` del SDK no deja registrar el handler de `roots/list` sin declarar la capacidad.
- **La trampa de `core.fsmonitor`** (L08), en este equipo (git 2.51 para Windows): se dispara con un `git status` normal y no con la puerta única. El test repite ese control positivo.
- **`init` contra la configuración real** (L09): `claude mcp list` imprime `clave: comando - estado` (Claude Code 2.1, `claude.exe` nativo); `init --dry-run --cliente todos` reconoce el registro existente de Cursor (con sus `ORQUESTADOR_*`), propone el diff y trata el `mcp.json` vacío de VS Code como `{}`. El sha1 de los dos `mcp.json` es el mismo antes y después.
- **El binario compilado** (L13): `doctor` y `doctor --fase 4 --proyecto P` sobre una instalación temporal con un manifiesto `software-tdd` muestran el preset y su origen, y que `fase-4/pruebas` sale de `presets/es/software-tdd.md`. `npm pack --dry-run` lista `presets/es/`, `prompts/es/reglas/` y `schema/` (68 archivos). La expresión del workflow, probada con `3.0.0-beta.0`, `3.0.0`, `2.2.1` y `3.1.0-rc.1`, pone `--tag beta` solo a las dos con guion.
- **Los README** (L12): 26 enlaces internos en cada uno, ninguno roto; sin BOM ni U+FE0F en los encabezados; sin rutas viejas a `prompts/fase-*` ni `prompts/comandos/`.

**Desvíos:**

- **E3-D1 · L01.** Además de los tests de la lista, cambian la constante `PROMPTS_DEL_REPO` de `test/cli`, `diagnostico`, `e2e`, `recursos` y `servidor`, un mensaje de `src/phases.ts`, un comentario de `src/prompts-mcp.ts` y los enlaces de `docs/comandos-de-fase.md` (que su test comprueba). Base: leído en código.
- **E3-D2 · L02.** Toca `src/config.ts` (`raizPaquete`/`fijarRaizDelPaquete`, solo para tests: `build-test/` no tiene `prompts/` ni `presets/` al lado) y adelanta de L11 `GLOBAL-REINYECTADO` a `src/diagnostico.ts`, porque el comportamiento cambia en este lote; `GLOBAL-SIN-BASE` se queda solo para `EVIDENCIA`, que es una ranura y no se reinyecta. La nota de bloques huérfanos de `get_phase_prompt` se cablea en L04, cuando el servidor pasa a `ensamblarFase`. Interpretaciones: una línea que parece un marcador de bloque y no casa con ninguna de las dos expresiones también es `BLOQUE-MAL-FORMADO` (dentro de un bloque llegaría al modelo); un ensamblado avisa de los huérfanos de las reglas globales y de su fase, y `revisarBloques` (doctor) mira todas. Base: leído en código.
- **E3-D3 · L03.** Toca `src/capas.ts` (la capa global sale de `carpetaPromptsGlobal`, con el respaldo `<configDir>/prompts/`), `src/schemas.ts` (el enum de `logica` del `outputSchema` sale de `NOMBRES_LOGICOS`, porque `CONFIG_PATH` es una variable nueva) y el entorno del servidor que lanzan los E2E (`PHASE_GATE_CONFIG_PATH` temporal: hereda `APPDATA`). `limpiarEntorno()` no solo borra `PHASE_GATE_CONFIG_PATH` (G4): la deja en una carpeta temporal vacía, para que ningún test lea el `machine.json` real. `software` es un preset integrado, sin archivo. Un `machine.json` inválido es un error explícito (`maquinaDe`), como el manifiesto (F2). La entrada de 2026-08-10 sobre varias documentaciones se marcó como **matizada**, no reemplazada: los espacios siguen descartados. Base: leído en código.
- **E3-D4 · L04.** Toca `src/recursos.ts` (listado, autocompletado y recibos con las fases de su proyecto), `src/diagnostico.ts` (fases por proyecto; un manifiesto inválido sale como hallazgo en vez de tumbar el listado) y `src/manifiesto.ts` (`resolverRepos`). Tests en un `test/proyectos.test.ts` nuevo; `test/e2e.test.ts` no cambia en este lote. Interpretaciones: el encabezado del bloque de configuración dice "(la declara phase-gate.json)" solo si hay manifiesto; `nombreContextoInicial(proyecto)` se llama `contextoInicialDe(proyecto)` (la de capas se conserva); un proyecto que no existe no impide entregar un prompt; el único puntero no elige preset ni bloque de configuración (§5.6). Base: leído en código.
- **E3-D5 · L04.** Las variantes de regla. (a) `commits-auto` conserva lo que la auditoría de la Etapa 1 añadió al contenido de fábrica (rama antes del primer commit; nunca `-A`, `.`, `-u`, una carpeta, `commit -a`, `--no-verify` ni `--amend`); `commits-agente-propone` avisa si la rama no coincide; `sin-lotes` conserva la regla del único lote fallido o descartado. (b) PROHIBIDO y AUTOVERIFICACIÓN de la Fase 4 ("commit sin el OK") y de la Fase 3 ("plan sin tabla de lotes") no son ranuras, así que cada variante dice dentro de su bloque qué de esas secciones no aplica. **Deuda para la Etapa 4** (L08, prompts de la Fase 4): convertir esas líneas en ranuras. Base: leído en código.
- **E3-D6 · L05.** La ranura `fase-3/comprobaciones` abarca el párrafo entero ("Antes de escribir el primer paso, comprueba… :"), y el texto genérico del plan era solo el fragmento que empieza en "que el identificador…". Se conservó la entrada del párrafo. Base: leído en código.
- **E3-D7 · L06.** El mismo ajuste en `ai-agent-ops`, `fase-3/comprobaciones` (modo `reemplazar`). Cada preset lleva además un párrafo de documentación fuera de los bloques, que no llega al modelo. Base: leído en código.
- **E3-D8 · L07.** No toca `src/tasks.ts` (todo cupo en `servidor.ts`); sí `src/prompts-mcp.ts` (sin `project`, `/fN` usa el proyecto de las raíces y lo pone en "Datos de esta invocación") y `test/cliente.ts` (parámetro `preparar`). Las funciones de `roots.ts` reciben el `McpServer`: con varios servidores por proceso, una caché global se pisaría. `raicesActuales` espera la petición en curso (como mucho 5 s). Interpretaciones: varias coincidencias solo débiles dan "ninguno"; en `read_central_doc` la línea de la deducción va como una segunda parte de la respuesta; estrenar un proyecto exige `project`. Base: leído en código.
- **E3-D9 · L08.** (a) `.github` es la única excepción a "un segmento que empiece por `.git`": no puede resolver a `.git` y guarda los workflows. (b) `LC_ALL=C` en el entorno de git, para reconocer "not a git repository" sin depender del idioma. (c) Toca `src/capas.ts` (la línea "Usa `read_repo_file` y `repo_status`…", que en L04 se dejó fuera porque las tools no existían), `test/servidor.test.ts` (11 tools) y `test/proyectos.test.ts`. En el bloque de configuración, "N cambios sin commit" suma cambios y archivos sin seguimiento; `repo_status` los da por separado. Base: medido (a, b) y leído en código (c).
- **E3-D10 · L09.** (a) `ejecutarCli` sigue síncrono: para `init` devuelve las opciones validadas y `index.ts` ejecuta `ejecutarInit`, que recibe un `EntornoInit` (carpeta del usuario, `APPDATA`, `claude`, preguntas, reloj) que los tests sustituyen. (b) Toca `src/paths.ts` (`discoverProjects(base?)`, para `--docs`) y `test/cli.test.ts` (`init` ya no es un subcomando desconocido). (c) En Claude Code, un registro que ya existe **no se modifica**: `mcp list` no enseña sus variables, así que no hay diff posible; se imprimen el `remove` y el `add` con su clave. (d) Una clave que ya usa otro servidor no se pisa nunca. (e) Cursor en Windows con `PHASE_GATE_ELICITATION=off` (E2-R3). (f) Al actualizar una entrada se quitan sus `ORQUESTADOR_DOCS_PATH`/`REPOS_PATH`. Interpretaciones: sin rutas ni terminal sale con 2; una confirmación no dada es una acción no hecha (1); `--comandos` copia solo para Claude Code y Cursor. Base: leído en código y medido (formato de `mcp list`).
- **E3-D11 · L10.** La verificación "tras `eject fase-3/pruebas --a proyecto:X`, `doctor --fase 3 --proyecto X` muestra que gana `bloques.md`" depende de `doctor --fase`, que llega en L11. En L10 se comprobó con la procedencia de `ensamblarFase`; el caso con `doctor` está en el test de L11. Toca `src/capas.ts` (`contenidoEfectivoDeRanura`, `ranurasDisponibles`). Interpretaciones: con `--fuerza`, el bloque se sustituye en su sitio (dos bloques iguales harían ganar al primero); solo se deja `.bak` al reemplazar; otro archivo de la misma fase en la capa destino es un error aun con `--fuerza`; `preset:<nombre>` va siempre a `<configDir>/presets/`. Base: leído en código.
- **E3-D12 · L11.** Toca `src/schemas.ts` (`outputSchema`), `src/servidor.ts` (las raíces de la sesión al diagnóstico), `src/cli.ts` (`doctor --fase/--proyecto/--json`), `src/git.ts` (`gitSincrono`, con la misma puerta y las mismas banderas, porque `doctor` es síncrono), `src/repos.ts`, `src/roots.ts` y `test/recursos.test.ts`. Tests en un `test/doctor-config.test.ts` nuevo. Códigos además de los de §5.9: `MAQUINA-INVALIDA`, `MAQUINA-CLAVE-DUPLICADA` y `PRESETS-ILEGIBLES`; `PRESET-NO-EXISTE` también para `presetPorDefecto` y para una tarea. Los hallazgos repetidos entre proyectos se quitan. `PRESET-IMPLICITO`: sin manifiesto, sin `presetPorDefecto` y con alguna tarea que no declara preset (no hay forma de saber qué tareas son de antes de la 3.0). Base: leído en código.
- **E3-D13 · L12.** Toca además `.env.example` (`PHASE_GATE_CONFIG_PATH`) y `docs/comandos-de-fase.md` (`init --comandos`, comandos por proyecto, `eject comando-fN`), para que no queden instrucciones viejas. La matriz de clientes de la Etapa 2 sigue "Por verificar". Base: leído en código.
- **E3-D14 · L13.** El commit de la release toca también este plan (la cabecera, la nota de estado de §5.10, esta sección y el Anexo A), como en las etapas anteriores (E1-D6, E2-D10). La cabecera corrige además "Versión publicada", que seguía en `2.1.0`. Base: medido (`npm view`).

**Los E2E de las Etapas 0 a 2** pasan sin cambiar ninguna aserción. `test/e2e.test.ts` cambió dos veces fuera de las aserciones: la ruta de los prompts (L01) y la carpeta de configuración del servidor lanzado (L03).

**Pendiente de comprobar fuera de este equipo:**

1. **La auditoría externa** de la etapa, a ciegas, antes del PR. *Hecha: ver abajo.*
2. **La CI del PR**: todos los tests corrieron solo en Windows (Node 24). Su primera ejecución en Linux y en Node 22 será la CI. Los que más dependen del sistema: la trampa de `core.fsmonitor` (L08), los filtros de `.gitattributes` (A1), `GIT-NO-INSTALADO` con un `PATH` vacío (L11) y las rutas de `configDir` en Linux y macOS.
3. **Roots en clientes reales**: los tests usan un cliente del SDK en memoria. Falta ver qué raíces anuncia cada cliente (Claude Code, Cursor, VS Code) y si la deducción acierta con ellas; cabe en la matriz de clientes pendiente de la Etapa 2.
4. **`init` de verdad**: solo se ejecutó con `--dry-run` contra la configuración real. Lo que escribe se probó sobre carpetas temporales.
5. **La publicación con `--tag beta`**: el workflow solo se ejercita al poner el tag `v3.0.0-beta.0`. Después, `npm view mcp-phase-gate dist-tags` debe dar `latest: 2.2.0` y `beta: 3.0.0-beta.0`.

**Auditoría externa (antes del PR).** Un segundo agente auditó la etapa a ciegas: midió sus propias cifras antes de leer esta sección y tuvo permiso para cuestionar las ADRs. Veredicto: **apto con observaciones**. Los 13 commits compilan y pasan los tests cada uno por su cuenta, con las mismas cifras de la tabla; el último da lo mismo en tres corridas. Midió además lo que la suite no cubre: el prompt sigue siendo byte a byte el de la `2.2.0`, el oro y los esquemas regenerados salen iguales, 540 ensamblados de presets con reglas no dan ningún aviso, `read_repo_file` rechaza los intentos de leer `.git` (mayúsculas, `GIT~1`, `::$DATA`, junctions; un hardlink sí pasa, pero exige poder escribir en el repo), y **los E2E de las Etapas 0 a 2 pasan 40/40 con `presetPorDefecto: software-replica`**, la verificación de L04 que faltaba (hallazgo 10). Encontró 1 hallazgo alto, 8 medios y 20 bajos. Los de más peso se resolvieron con commits nuevos encima de L13, sin reescribir la historia; el resto queda abajo, con su estado:

| Ajuste | Commit | Resuelve | Tests al cerrar |
|---|---|---|---|
| A1 | `3a51490` | 1 | 608 |
| A2 | `5c0fe6b` | 5, 6, 11, 18 (en parte), 26 | 612 |
| A3 | `465e651` | 2 | 614 |
| A4 | `2c4ac76` | 3, 4 | 617 |
| A5 | `e70dc5b` | 7, 17 | 619 |
| A6 | `89c9a13` | 8, 15 | 621 |
| A7 | `b044714` | 9 | 622 |
| A8 | El commit de documentación de la auditoría | 10, 19, 29 y esta sección | 622 |

| # | Sev. | Lote | Hallazgo | Resolución |
|---|---|---|---|---|
| 1 | Alta | L08 | La puerta de git solo anulaba `core.fsmonitor`: un filtro `clean` o `process` de `.git/config` se ejecutaba en cada `repo_status`, `get_orchestrator_status` y `get_phase_prompt` | Antes de cada consulta, la puerta lee los drivers con `git config --get-regexp '^filter\.'` y anula cada uno con `-c filter.<n>.clean=` (y `smudge`, `process`, `required=false`); un nombre que no se puede anular hace fallar la consulta. Comprobado con control positivo en git 2.51, y con su test (asíncrona y síncrona). ADR de L08 ampliada |
| 2 | Media | L11 | `get_orchestrator_status` y `phase-gate://configuracion/…` llamaban a git de forma síncrona y bloqueaban el servidor | El servidor pide el estado de los repos antes, en paralelo y con plazo de 3 s (`estadosConPlazo`, `diagnosticarSinBloquear`); lo que no responde sale como `GIT-LENTO` (info). La variante síncrona queda solo para `doctor` |
| 3 | Media | L07 | Con la raíz de un disco o el HOME abiertos, un proyecto con repos quedaba deducido y se escribía en él sin `project` | Esas raíces no dan coincidencia débil, y una débil solo vale para leer: `start_task`, `switch_task` y `write_central_doc` piden `project`. ADR de L07 ampliada |
| 4 | Media | L07 | Una respuesta vieja de `roots/list` pisaba a la nueva | Solo cuenta la respuesta de la última petición |
| 5 | Media | L09 | `init` tomaba por suyo cualquier `build/index.js` o cualquier nombre que contuviera `mcp-phase-gate` | Solo el paquete exacto (`mcp-phase-gate`, `mcp-phase-gate@…`), su binario, o un `build/index.js` cuyo `package.json` se llama `mcp-phase-gate`; también en `claude mcp list`. Tests negativos |
| 6 | Media | L09 | Las comas finales se quitaban también dentro de las cadenas | Se quitan en el mismo recorrido que respeta las cadenas (`limpiarJsonc`), que además detecta los comentarios sin falsos positivos |
| 7 | Media | L03/L04 | Un `machine.json` roto tumbaba `get_phase_prompt` en todos los proyectos | Se lee solo cuando hace falta: para resolver repos y para el `presetPorDefecto` de un proyecto sin manifiesto. ADR de L03 ampliada |
| 8 | Media | L07/L04 | La descripción de `project` en `get_phase_prompt` prometía un error que no llega | Texto propio, y una nota al principio del prompt cuando sale sin proyecto, con el preset que se usó. ADR de L04 matizada |
| 9 | Media | anterior | `read_cross_repo` leía `.git/config` | La misma regla de `.git` que `read_repo_file`, también sobre la ruta resuelta |
| 10 | Baja | L04 | La verificación de L04 no estaba hecha | La hizo la auditoría: 40/40. Registrado aquí |
| 11 | Baja | L09 | El respaldo por `cmd.exe` expandía `%` y una comilla rompía la cita | Un argumento con `%` o `"` no se pasa por `cmd.exe`: se pide hacerlo a mano |
| 12 | Baja | L04 | `start_task` no valida el frontmatter que llega dentro de `initial_context` | **Pendiente** (pulido) |
| 13 | Baja | L02 | La reinyección no tiene en cuenta las vallas de código | **Pendiente** (pulido) |
| 14 | Baja | L04/L06 | `sin-lotes` se lleva sin aviso el bloque `despues` de `multi-repo-feature` | **Pendiente**: es el diseño de capas; queda documentarlo o avisar |
| 15 | Baja | L07 | Un `project` vacío ya no se rechazaba | Se rechaza en `start_task` y `switch_task` ("omítelo para deducirlo") |
| 16 | Baja | L03/L09 | El `$schema` `…@3/…` no resuelve durante la beta | **Pendiente**: resuelve solo con la `3.0.0`; queda avisarlo o fijar la versión |
| 17 | Baja | L03 | Una ruta relativa en `machine.json` dependía del cwd del cliente | Tiene que ser absoluta |
| 18 | Baja | L09 | Casos raros de `init` | Hechos: sección o `env` que no son un objeto (no se tocan), el código de salida de `claude mcp list`, un `fN.md` que es una carpeta, el aviso falso de comentarios. **Pendiente**: el diff O(n·m) con entradas enormes |
| 19 | Baja | L09 | `--dry-run` sale con 1 si una acción no se podría hacer, y §5.8.1 decía 0 | Se acepta: el código dice lo que pasaría sin `--dry-run`, que es útil en un script. Registrado aquí |
| 20 | Baja | L10 | `eject` sigue junctions en el destino y no deja `.bak` al añadir un bloque | **Pendiente** (pulido) |
| 21 | Baja | L02 | El parser no salta las vallas de código, y una mención en línea invalida el archivo | **Pendiente** (pulido) |
| 22 | Baja | L02/L11 | Huecos del doctor (capa proyecto, fase inexistente, catch compartidos) | **Pendiente** (pulido) |
| 23 | Baja | L02–L08 | Sin límite de tamaño en presets, bloques y cuerpos | **Pendiente** (pulido) |
| 24 | Baja | L07/L08 | Plazos de roots, una URI no `file://` y `GIT_CEILING_DIRECTORIES` | **Pendiente** (pulido) |
| 25 | Baja | L12/L11 | Textos desactualizados en README, ayuda y descripciones | **Pendiente** (pulido); `repo_status` y `read_cross_repo` ya dicen lo que neutralizan |
| 26 | Baja | L09 | Un test usaba como ejemplo el nombre de un servidor real | Cambiado por `otro-servidor` |
| 27 | Baja | L11 | Códigos sin test (PROMPTS-ILEGIBLES, PRESETS-ILEGIBLES, DOCS-ILEGIBLE…) | **Pendiente** (pulido) |
| 28 | Baja | docs | Varias ADR sin "Qué se descartó" explícito | **Pendiente** (pulido) |
| 29 | Baja | L04/L02 | Alcance sin registrar: L04 listaba `src/phases.ts` y no lo tocó; L02 tocó `test/diagnostico.test.ts`; `sin-lotes.md` dice `<objetivo>`; los 4 archivos de `reglas/` llevan cabecera fuera de los bloques | Registrado aquí, como parte de E3-D2, E3-D4, E3-D5 y E3-D7 |

| ADR cuestionada | Resolución |
|---|---|
| L02: ignorar entero un archivo mal formado es duro con un preset que documenta la sintaxis | Se mantiene; saltar las vallas y las menciones en línea queda en el pulido (21) |
| L03: F2 aplicado a `machine.json` apaga todos los proyectos | Aceptado (7): el error queda donde se usa |
| L04: el preset puede colarse por el frontmatter de `initial_context`; sin proyecto, todo es silencioso | La nota sin proyecto, aceptada (8); la validación del frontmatter, pendiente (12) |
| L07: la coincidencia débil no es segura para escribir | Aceptado (3) |
| L08: la puerta "no ejecuta nada" y solo cubría fsmonitor; falta decir lo del git síncrono | Aceptado (1 y 2) |
| L09: la detección de "ya registrado" modificaba servidores ajenos | Aceptado (5) |

**Pendiente antes del merge y del tag `v3.0.0-beta.0`:** la CI del PR (nunca ha corrido en Linux ni en Node 22) y los hallazgos marcados como pendientes, si la autora quiere cerrarlos antes de la beta.

### 9.10 Ejecución de la Etapa 4

Rama `etapa-4/motor-de-lotes`, creada desde `16d25fc`, la punta **local** de `etapa-3/configuracion`: la Etapa 3 está auditada pero sin subir (sin push, sin PR, sin tag y sin la beta publicada), así que esta rama también se queda local y espera su turno. Un commit por lote, con `git add` archivo por archivo y ningún `push`, PR ni tag; ningún commit de la Etapa 3 cambió. Como en las Etapas 2 y 3, la autora dio un **OK general** para toda la etapa antes de empezar, reservando la parada para algo de verdad importante (no hizo falta ninguna: los desvíos de abajo son de alcance, de firma o de texto, y cada uno queda registrado con su Base). Todos los lotes pasaron `npm run build && npm test` antes de su commit; la etapa empezó con `npm ci` sobre una base de 622 tests (620 pasan, 2 omitidos) y L11 repitió `npm ci`, `npm run build`, `npm test` y `npm audit` (0 avisos).

| Lote | Estado | Commit | Tests al cerrar | Desvíos |
|---|---|---|---|---|
| L01 | Hecho | `d7c02b9` | 641 (antes 622) | E4-D1 |
| L02 | Hecho | `b2eba42` | 664 | E4-D2 |
| L03 | Hecho | `880ff1c` | 696 | E4-D3 |
| L04 | Hecho | `878cc27` | 712 | E4-D4 |
| L05 | Hecho | `f3ce75d` | 731 | E4-D5 |
| L06 | Hecho | `0e5254f` | 738 | E4-D6 |
| L07 | Hecho | `bb615f7` | 746 | E4-D7 |
| L08 | Hecho | `ee4d31b` | 751 | E4-D8 |
| L09 | Hecho | `7784632` | 757 | E4-D9 |
| L10 | Hecho | `c0d3c43` | 757 | E4-D10 |
| L11 | Hecho; el tag `v3.0.0` y la publicación los hace la autora, después de mergear y publicar la Etapa 3 | `820e8ce` | 757 | — |

En todas las filas, 2 de los tests se omiten fuera de Linux o macOS (`XDG_STATE_HOME` y el FIFO), como en la Etapa 3. Desde L02 hay uno que se omite en un volumen sin nombres cortos 8.3 (`GIT~1`); en este equipo corrió. El commit de este registro (`docs(plan): registrar la ejecución de la Etapa 4`) va encima de L11 y no puede aparecer aquí con su propio SHA.

**Lo que se comprobó además de la suite:**

- **§6.1 repetido sobre git 2.51 para Windows** (antes de L02): `rev-parse --verify --quiet --end-of-options` resuelve un SHA de 40, uno de 7, uno de 4 y `HEAD`, y da 1 con `--help^{commit}`, con un hash inexistente y con un blob (este con "expected commit type"); `merge-base --is-ancestor` da 0, 1 y 128; `diff-tree --root` lista el primer commit; y `rev-list <raíz>^..<último>` sale con 128, de ahí el caso del commit raíz en `sonConsecutivos`.
- **Una trampa que §6.3 no preveía** (L02): con `log.showSignature` en `.git/config`, `git show` de un commit firmado ejecuta `gpg.program`, que también puede venir en `.git/config`. Comprobado con un commit de firma falsa y un `gpg.program` trampa: `git show` normal lo ejecuta y con `--no-show-signature` no. `datosDeCommit` lo lleva, y el test repite el control positivo; también el de `core.fsmonitor` sobre cada consulta nueva.
- **Dos trampas de Node 24.11 para Windows** (L03): `fs.rmSync` no borra un archivo con un nombre que no es ASCII (`03 - Plan Técnico.md`) y tampoco lanza; `unlinkSync` sí. Y el `ino` de NTFS, como `number`, pierde el último dígito (…612 frente a …613n en `bigint`).
- **Los tests de protección muerden**: 41 mutaciones deliberadas del código (la validación del SHA y su tope de 7, `--no-show-signature`, la contención de `artifact_path` paso a paso, el tope de 256 MB, "un commit, un lote", la rama, la contención de la subcarpeta de recibos, `mtimeMs` al crear, al reemplazar y al reanclar, el sellado, el orden, `cerrar_fase` sin confirmación o sin `force`, el movimiento de `lotes: 1`, el índice determinista, las reglas nuevas de `motivoDeProteccion`, el progreso, `sonConsecutivos` y su `--root`, el oro, los prompts y los códigos de `doctor`), y las 41 dejan algún test en rojo; el código quedó como estaba. Dos huecos que salieron así se cerraron en su mismo lote: la carrera de `reanclar` no tenía test (se añadió), y quitar solo la comprobación de tamaño previa a la lectura no fallaba porque la del streaming también corta (se comprobó subiendo el tope de las dos). Una mutación no se pudo aplicar porque el tipo exige esa comprobación (el sellado en `reanclar`); la cubre su test directo.
- **El oro** (L08): las Fases 1 a 3 siguen siendo byte a byte las de `test/oro/2.2.0/`. El de la 3.0.0 se revisó con `diff` contra la 2.2.0: la Fase 5 cambia en tres líneas (la regla 1, una de PROHIBIDO y una de AUTOVERIFICACIÓN) y gana una de PROHIBIDO; la 4, en la ranura `lotes`, dos líneas de PROHIBIDO, los puntos 10 a 14 de AUTOVERIFICACIÓN y las dos frases de `describePhaseFiles`. La Fase 4 ensamblada con los 6 presets, las 4 políticas y con y sin lotes (48 combinaciones) no pide en ningún sitio escribir recibos con `write_central_doc`.
- **El binario compilado** (L09), en carpetas temporales: `doctor` y `doctor --reverificar` dan `RECIBO-FUERA-DE-PLAN` y `RECIBO-MANUAL` y salen con 0; `doctor --reverificar --fase 3` sale con 2.
- **Los README** (L10): 32 enlaces internos en cada uno (antes 26), ninguno roto; sin U+FEFF ni U+FE0F en los encabezados.
- **La release** (L11): la expresión del workflow da `latest` para `3.0.0` y `--tag beta` para `3.0.0-beta.0`; `npm pack --dry-run` lista 74 archivos (68 en la beta: los 6 nuevos son `recibos`, `anclas` y `lotes`, en `.js` y `.d.ts`); `node build/index.js --version` dice `3.0.0`.
- **Cada commit por sí solo**, en un clon temporal (`git clone --no-hardlinks`, un `npm ci` y, para cada commit de L01 a L11, `npm run build` y `npm test`): los 11 compilan y pasan, con los mismos totales de la tabla de arriba.

**Desvíos:**

- **E4-D1 · L01.** `src/recibos.ts` exporta además `parsearRecibo(texto, nombre)`, `frontmatterDeRecibo`, `slugDe`, `loteDelNombre`, `etiquetaDeLote`, `dosDigitos`, `GENERADO_POR`, `ESTADOS_LOTE` y `TITULOS_CONDICIONALES`; `escribirRecibo` gana `{ comoDocumento }` (H2, lo usa L04). Formato: con `ancla: sha256` va también `bytes` (el tipo `Ancla` lo tiene y §6.2 no lo listaba en el frontmatter); `verificado` no se escribe: es `registrado` en los recibos del servidor y vacío en los manuales. Saltos y barras van escapados (`\n`, `\\`) en `nota`, `asunto` y `artefacto`. Un repo o una rama nulos se escriben `—`. Textos de sección vacía: "Nada." (Qué se hizo), "Ninguno." (Archivos, Desvíos), "Ninguna." (Verificación, Espera, Decisiones). Una línea de texto que empieza por `# ` o `## ` se sangra un espacio. Las condicionales van en el orden de la plantilla, tras Decisiones y antes de Verificación del commit. Un estado desconocido queda como `con pendientes`. Lector de frontmatter propio (no quita comillas) en vez de `separarFrontmatter`. Base: leído en código.
- **E4-D2 · L02.** Firmas: `esAncestroDeHead` devuelve `{ resultado, salida }` (para dar la salida de git en el error); `anclarCommit` recibe además `otros` (los SHA de los demás recibos, para "un commit, un lote", por prefijo para los manuales de la 2.x) y `ahora`, y devuelve también `coinciden`; `anclarArtefacto` recibe `ahora`. Exporta además `tieneGit` (git.ts), `compararArchivos`, `normalizarArchivo`, `rutaDeArtefacto`, `sha256DeArchivo`, `partirRutaDeArtefacto` y `TOPE_DE_ARTEFACTO` (anclas.ts). `datosDeCommit` añade `--no-show-signature` (ver arriba). La puerta acepta los códigos de salida que son una respuesta (el 1 de `merge-base --is-ancestor` y de `rev-parse --verify`). Un hash de blob o de árbol es `no-existe`; `ambiguo` no se puede reproducir en un test (haría falta una colisión de 7 caracteres): se detecta por "is ambiguous". Textos: "el archivo declarado" en singular y un caso sin archivos; el tope dice también los bytes; "HEAD separado" y "ninguna rama local". La comparación de archivos quita comillas de código y `./`, y acepta rutas absolutas dentro del repo. `reverificar` prueba el sha256 con CRLF→LF y con LF→CRLF, y "idéntico salvo finales de línea" cuenta como vigente. Base: medido (gpg, códigos de salida) y leído en código.
- **E4-D3 · L03.** (a) Shape: los opcionales son `.nullish()` (convención de la Etapa 0) y no `.optional()`; los textos obligatorios se recortan, con mensaje por campo; la salida se llama `recordBatchSalidaShape` (como `repoStatusSalidaShape`), no `recordBatchOutput`. (b) Sin `task_name` vale solo la tarea activa **guardada**; una deducida por fecha es un error que pide `task_name`. (c) Con el documento de la Fase 4 (o el de una fase posterior) escrito, es un error: la fase está cerrada. (d) Comprobaciones añadidas: dos recibos del mismo lote, un recibo ilegible, una subcarpeta de recibos que en la ruta real sale de la tarea (una junction), un `repo` distinto del del recibo al anclar, y un `repo` que no es de la tarea. (e) Con git y una política distinta de `ninguno`, `artifact_path` o `verification_note` son un error (la tabla de §6.4 solo admite commit o pendiente); en un lote fallido o descartado, `artifact_path` también. (f) Textos: el de un lote fallido, "No quedan lotes por registrar." y la línea "Aviso:" con las diferencias de archivos. La rama de un recibo pendiente es la actual del repo; `fecha` y `registrado` se reescriben en cada escritura; un recibo manual con un nombre que no es el slug del servidor se renombra al anclarlo; un recibo nuevo avisa al cliente de que cambió la lista de recursos. (g) Toca `test/servidor.test.ts` (12 tools y las anotaciones de `record_batch`). (h) Las dos trampas de Node 24.11 (ver arriba): se borra con `unlinkSync` (`borrarArchivo`) y el `ino` se compara en `bigint`. Base: leído en código y medido (h).
- **E4-D4 · L04.** (a) `ensamblarIndice(carpetaTarea, fases)` como dice §6.6, y además `textoDelIndice` (el texto a partir de los recibos, que usa el cierre), `faseEnCarpeta` y `ReciboConNombre`; `FaseDeLotes` gana `titulo`: el encabezado es "# <título de la fase> — <tarea>". (b) `leerTablaDeLotes` se adelanta de L06: la usa `cerrar_fase` para el objetivo y el repo de un lote descartado. (c) Toca `src/recibos.ts` (exporta `celda`). (d) Textos del índice: el sha256 con 8 caracteres y "…" (el ejemplo de §6.6 tenía 4); un ancla nota dice "nota"; plural de verdad ("1 lote descartado", "2 lotes descartados") en vez de "N lote(s) descartado(s)"; "sin verificación registrada" si no hay; sin commits, la rama es "—"; la columna Recibo usa el nombre real del archivo. (e) `cerrar_fase`: `lote` sigue siendo obligatorio, como en el shape de §6.4; sin contenido ni ancla, la llamada solo cierra; con contenido, registra el lote y cierra en la misma llamada. La confirmación se pide antes de escribir nada, nombra también los fallidos y solo se pide si hay algo descartado o fallido. `motivo_descarte` sin `cerrar_fase` es un error. (f) `force` entra en el shape en L04 y no en L05: `cerrar_fase` lo necesita sin elicitation (§6.6). (g) Con `lotes: 1`, primero se escribe el documento, después se borra el recibo y por último la subcarpeta si quedó vacía. Toda escritura comprueba también que cae dentro de la Documentación. (h) Los índices de oro se regeneran con `ORO_REGENERAR=1` y se revisan a mano. Base: leído en código.
- **E4-D5 · L05.** (a) Toca además `src/recibos.ts` (`cabeceraDeRecibo`, para el progreso leyendo solo frontmatter) y `test/lotes.test.ts` (los tests de `reanclar`, directos y por MCP con y sin elicitation; §6.10 los ponía en `test/e2e.test.ts`, que lanza el servidor por stdio sin elicitation). (b) `reanclar` admite `commit` o `artifact_path`, no admite contenido ni `cerrar_fase`, rechaza un recibo no sellado, uno que no existe y el ancla que ya tiene, y comprueba `mtimeMs`. Vale también con la fase cerrada: con `lotes: 1` reancla el documento de la fase; con varios, rehace el índice si lo generó el servidor. "Verificación del commit" queda con la comparación del commit nuevo más el historial de líneas "Reanclado el …" (§6.5 decía añadir la línea al texto existente); con un sha256 nuevo esa sección no existe y el historial no se guarda. (c) El rechazo de un recibo sellado y el de la fase cerrada sugieren `reanclar: true`. (d) Las dos reglas de `motivoDeProteccion` valen para la fase que declare `recibos`; en `write_central_doc`, para ellas, la pregunta de elicitation, el error sin `force` y la nota de éxito tienen texto propio. (e) Con todos los lotes cerrados y sin documento, `describeEstado` dice "N de N lotes cerrados". (f) Cambian, a propósito, aserciones de tests anteriores: 5 filas de la tabla de verdad de `test/tasks.test.ts` (marcadas "antes: …") y el E2E "escribe un recibo en la subcarpeta" de la Etapa 1, que ahora prueba el rechazo y la escotilla con `force`. Base: leído en código.
- **E4-D6 · L06.** (a) Toca también `src/schemas.ts` (`getBatchStatusShape` y `getBatchStatusSalidaShape`) y `test/servidor.test.ts` (13 tools). (b) La tarea: la indicada o la activa; para leer vale también una deducida, y la respuesta lo dice. (c) Un plan sin `lotes` es el mismo error que en `record_batch` (H3). `cerrados` no cuenta los fallidos. Dos recibos del mismo lote son un aviso. Con `lotes: 1` y la fase cerrada, el recibo se lee del documento de la fase. (d) Un caso más en la siguiente acción, para una tarea de la 2.x con todos los recibos y sin documento. Base: leído en código.
- **E4-D7 · L07.** (a) El bloque vive en `src/lotes.ts` (`bloqueDeCommits`, `bloqueDeCommitsConPlazo`) y se engancha en `src/servidor.ts` (`get_phase_prompt`), no en `src/phases.ts`: importar las anclas desde `phases.ts` haría un ciclo (`anclas` → `repos` → `manifiesto` → `phases`), y el bloque es asíncrono. `src/phases.ts` no cambia en este lote. Los tests van en `test/lotes.test.ts`, no en `test/phases.test.ts`. (b) `src/git.ts` gana también `tienePadre`. (c) Textos: "### Repo `api` (rama main)" con la rama actual; "### Sin commit" en vez de "### Sin repositorio" (un sha256 puede ser de un repo sin git); el rango con un solo commit (`git show`) y desde el commit raíz; la lista de cortos si no son consecutivos. (d) "Lotes que no entran en la auditoría" lista también fallidos, pendientes y lotes sin recibo. (e) Plazo de 15 s para el bloque. (f) Un recibo manual sin asunto lo toma de `datosDeCommit`. Base: leído en código y medido (`rev-list <raíz>^..`).
- **E4-D8 · L08.** (a) **Deuda E3-D5 (b), resuelta:** cuatro ranuras nuevas (`fase-3/prohibido-lotes`, `fase-3/autoverificacion-lotes`, `fase-4/prohibido-commits`, `fase-4/autoverificacion-commits`; el catálogo pasa de 23 a 27), cada variante pone sus líneas en vez de decir que no aplican, y una ADR nueva que §6.12 no preveía. En la AUTOVERIFICACIÓN de la Fase 4 los dos puntos de commits pasan al final (14 y 15), y los de antes sobre recibos se reescriben para `record_batch`. (b) Toca además `src/phases.ts` (`describePhaseFiles` ya no dice "Guárdalo con `write_central_doc`" ni "Con un solo lote no hay subcarpeta" en la fase de los recibos), `prompts/es/fase-3-plan-tecnico.md` (solo marcadores), `test/prompts.test.ts`, `test/proyectos.test.ts`, `test/phases.test.ts` y `test/eject.test.ts` (los tests que fijaban los textos y las ranuras de antes). (c) La ranura `fase-4/lotes` es la de §6.9 más dos párrafos: `condicionales` y `reanclar`. (d) La regla 1 de la Fase 5 es la de §6.8 más "Si no hay ni lo uno ni lo otro, pregunta."; su PROHIBIDO y su AUTOVERIFICACIÓN hablan de los commits que lista el servidor y suman avisar de las anclas no vigentes. (e) `agente-propone`: si el usuario no hace el commit, el lote se registra como `descartado` (antes, `commit: no aplica`, que `record_batch` no admite con git); `sin-lotes` usa el modo `despues` en `fase-4/lotes`. (f) `docs/comandos-de-fase.md` no cambia: ya no copia los comandos. Base: leído en código y medido (diff del oro).
- **E4-D9 · L09.** (a) Toca además `src/cli.ts` y `src/index.ts`: `diagnosticar` es síncrono y `reverificar` necesita git asíncrono, así que `doctor --reverificar` va por un camino aparte, como `init`; el `doctor` de siempre no cambia, y `get_orchestrator_status` no reverifica. `--reverificar` no va con `--fase` ni `--proyecto`. (b) Un código más, `RECIBO-ILEGIBLE` (aviso). (c) `INDICE-DESINCRONIZADO` solo compara un índice que generó el servidor y de más de un lote. (d) `RECIBO-MANUAL` sale una vez por tarea; `RECIBO-FUERA-DE-PLAN`, solo si el plan declara `lotes`. (e) `RUTA-LARGA` recorre la Documentación sin seguir enlaces ni entrar en `.git`, con un tope de 50 000 entradas. Base: leído en código y medido (binario).
- **E4-D10 · L10.** Además de lo que pide §6.10 (una sección nueva en cada README), los README cambian lo que se quedaba viejo: el árbol de la Documentación, el párrafo de lotes, "13 tools" (decía 11), `doctor`, `/f4` y `/f5`, los documentos protegidos, la tabla de tools, `reglas.lotes`, las políticas de commits, la migración a la 3.0 (fuera el `@beta`) y la tabla de módulos. Base: leído en código y medido (enlaces).

**Las Bajas pendientes de la auditoría de la Etapa 3** (12, 13, 14, 16, 18, 20 a 25, 27 y 28) no se tocaron: ningún lote lo necesitó. La 16 (el `$schema` `…@3/…` no resuelve durante la beta) dejará de aplicar cuando se publique la `3.0.0`, sin cambio de código.

**Pendiente de comprobar fuera de este equipo:**

1. **La auditoría externa** de la etapa, a ciegas, antes del PR. *Hecha: ver abajo.*
2. **La CI** (Linux y Node 22): todos los tests corrieron solo en Windows, con Node 24.11. Los que más dependen del sistema: la trampa de `gpg.program` (en Linux, con un script `.sh`), la de `core.fsmonitor`, el sha256 frente a `sha256sum`, el archivo de 256 MB + 1, el test de `GIT~1` (que en Linux se omite) y la ruta larga de `RUTA-LARGA`.
3. **El orden de subida:** primero el PR de la Etapa 3 (`etapa-3/configuracion`), su merge y la publicación de `3.0.0-beta.0`; después esta rama, que sale de su punta.
4. **El tag `v3.0.0` y la publicación**, que hace la autora después de lo anterior. Después, `npm view mcp-phase-gate dist-tags` debe dar `latest: 3.0.0`.
5. **Clientes reales:** el ciclo de `record_batch` con un modelo de verdad, y las confirmaciones de `reanclar` y `cerrar_fase` en Claude Code, Cursor y VS Code (cabe en la matriz de clientes pendiente de la Etapa 2).

**Auditoría externa (antes del PR).** Un segundo agente auditó la etapa a ciegas, con permiso para cuestionar las ADRs; declaró que un `grep` de encabezados le enseñó sin querer, antes de medir, la nota de estado de §6.10, el texto de E4-D8 y la fila 20 del Anexo A (sin cifras de tests). Veredicto: **apto con observaciones**. Los 12 commits compilan y pasan cada uno por su cuenta, con los totales de la tabla de arriba; el último da lo mismo en tres corridas. Midió además lo que la suite no cubre: las 11 tools anteriores no cambian ni un byte en `tools/list`; las Fases 1 a 3 siguen byte a byte las de la `2.2.0` (regeneradas por él desde el build de `v2.2.0`); ninguna de las formas hostiles de SHA que probó llega a git (con `GIT_TRACE`); 31 rutas hostiles de `artifact_path` no salen del repo; 5 trampas de configuración de git con control positivo (`core.fsmonitor`, un filtro `process`, `gpg.program` con `log.showSignature`, `textconv` y hooks) no se disparan desde el servidor; un asunto de commit hostil no rompe la estructura del bloque de la Fase 5; 270 ensamblados de la Fase 4 no piden `write_central_doc`. **0 escapes.** Encontró 3 hallazgos medios y 11 bajos, y 4 cuestionamientos de ADR. Se resolvieron con commits nuevos encima de `2dee107`, sin reescribir la historia:

| Ajuste | Commit | Resuelve | Tests al cerrar |
|---|---|---|---|
| A1 | `6d53e1b` | 1 | 759 |
| A2 | `a5794d8` | 2 (y el `EPERM` del candado de A1, que salió al repetir su test) | 762 |
| A3 | `b52a8e7` | 3 | 764 |
| A4 | `23a09e4` | 4, 5, 9, 11 y los cuestionamientos de H1 y H3 | 771 |
| A5 | `419cbc9` | 7, 8 | 774 |
| A6 | `356c181` | 10 | 774 |
| A7 | `499cc38` | 12, 13 | 775 |
| A8 | El commit de documentación de la auditoría | 6, 14 y esta sección | 775 |

En todas las filas, 2 tests omitidos, como arriba.

| # | Sev. | Lote | Hallazgo | Resolución |
|---|---|---|---|---|
| 1 | Media | L03 | Dos procesos que registraban el mismo lote a la vez dejaban dos recibos (11 de 12 rondas): la comprobación de `mtimeMs` solo cubría la carrera dentro de un proceso, y la ADR de L03 decía lo contrario | La comprobación y la escritura van bajo un candado de la tarea (`.record_batch.lock`, creado en exclusiva con `wx`; 3 s de espera; uno de más de 30 s se da por abandonado). Test con dos `node` de verdad en 8 rondas. En Windows, abrir un candado que otro proceso está borrando da `EPERM` (medido): cuenta como ocupado. ADR de L03 corregida |
| 2 | Media | L05 | Sin elicitation, el modelo podía forjar con `force` un recibo con `origen: servidor` y ancla `commit` que `get_batch_status` presentaba como sellado y del servidor; el resumen decía "en `` `null` ``" | Lo que entra por la escotilla queda con `origen: manual` y sin `generado_por` (`comoManual`); el resumen sin repo no nombra ninguno. ADR de L05 ampliada |
| 3 | Media | L02 | Con `--quiet`, git calla el aviso de un prefijo ambiguo y la persona recibía "el commit no existe"; E4-D2 decía que se detectaba | Sin `--quiet` (§6.3 lo pedía): medido en git 2.51, ambiguo da 128 con "is ambiguous", inexistente 128 con "Needed a single revision" (`clasificarRevParse`). Test con una colisión real de 7 caracteres (30 000 commits con `fast-import`, 1,3 s). ADR de L02 corregida |
| 4 | Baja | L05 | Un recibo fuera de plan con el commit pendiente hacía decir "lote 5 de 2" | `pendienteDeCommit` solo mira los lotes del plan |
| 5 | Baja | L03 | Al anclar un recibo de la 2.x sin repo no se usaba el único repo de la tarea | Se usa la regla de siempre (el indicado o el único) |
| 6 | Baja | docs | Tres ADR antiguas que la etapa contradice no llevaban la nota al principio | Notas "Matizada" en las tres |
| 7 | Baja | L07 | El bloque de la Fase 5 tardaba 9,5 s con 40 lotes (medido aquí; `get_batch_status` con `reverificar`, 6,9 s) y el respaldo por plazo tenía otro encabezado | Anclas verificadas de seis en seis y cada commit resuelto una sola vez: 2,1 s y 1,8 s (medido). El respaldo usa el mismo encabezado |
| 8 | Baja | L02 | "Idéntico salvo finales de línea" valía también para binarios, y la conversión byte a byte costaba más de 2 s por cada 128 MB | Solo en texto (byte NUL en los primeros 8000, como git); conversión sobre `Buffer`: 128 MB en 482 y 288 ms (medido) |
| 9 | Baja | L03/L02 | Errores de escritura crudos, con el nombre del temporal y rutas absolutas | `traducirEscritura`; el artefacto se nombra por su ruta relativa (`repo:api/…`) |
| 10 | Baja | L08 | Frases del flujo viejo en la Fase 4 y en la última línea de `/f4` | Reescritas para `record_batch`; el oro de la Fase 4 cambia solo en esas dos líneas (revisado con `diff`) |
| 11 | Baja | L07 | Si no se podían leer los recibos, el bloque de la Fase 5 desaparecía sin decirlo | Lo dice, con el error |
| 12 | Baja | L09 | `RECIBO-ILEGIBLE` sin test; el texto de `INDICE-DESINCRONIZADO` sugería que vigila todo el recibo | Test, y el texto dice qué campos compara |
| 13 | Baja | L08 | El test de las variantes de commits descartaba toda línea con `commit`, `git` o `rama` | Compara el texto exacto con las dos ranuras sustituidas por los bloques de la variante; y toda Fase 4 ensamblada (48 combinaciones) conserva la prohibición del push (P1), comprobado con una mutación |
| 14 | Baja | L01 | La ida y vuelta da los mismos bytes, pero no siempre el mismo dato | Documentado en la ADR de L01 |

| ADR cuestionada | Resolución |
|---|---|
| H1: un lote pendiente cuyo commit no llega bloqueaba los siguientes; dos lotes en un commit no tenían salida | Aceptado: un pendiente se cierra con solo `estado: descartado` (o `fallido`) y una nota; la salida de "dos lotes, un commit" queda en la ADR de L03 y en los README |
| H3: un plan sin `lotes` obliga a editar un plan congelado | Se mantiene (el número sale solo del frontmatter), pero el error propone el número de filas de la tabla |
| H5: un commit que no toca ninguno de los archivos declarados se ancla con un aviso | **Se mantiene, a decidir por la autora**: H5 es una decisión de cierre de la etapa. La propuesta del auditor (bloquear cuando no hay ningún archivo en común, salvo con confirmación) queda anotada |
| Faltaban dos ADR: la tarea deducida que vale para leer y no para escribir, y el coste de `RUTA-LARGA` | La primera, añadida a la ADR de L03. La segunda, medida: recorrer 50 000 entradas cuesta 76 ms en este equipo, así que no cambia |

**Pendiente antes del merge y del tag `v3.0.0`:** la CI del PR (nunca ha corrido en Linux ni en Node 22), después del merge y la publicación de la Etapa 3, y la decisión de la autora sobre H5.

### 9.11 Ejecución de la Etapa 6

Rama `etapa-6/el-mundo`, creada desde `6c27e00`, la punta **local** de `etapa-5/studio`: el PR #54 se mergeó en `master` (`553bb64`) sin los tres últimos lotes de la Etapa 5 (L11 export estático, L12 Pages y L13 `3.1.0`), que solo existen en esa rama local; esta rama los lleva debajo. Esta sección no registra la ejecución de la Etapa 5, que sigue sin estar en el plan. Un commit por lote, con `git add` archivo por archivo y ningún `push`, PR ni tag. La autora dio un **OK general** para todos los lotes antes de empezar y pidió hacerlos de una vez. Las traducciones y algunas migraciones se redactaron con agentes en paralelo sobre un contrato escrito (vocabulario, glosario, mismo número de reglas), y cada lote lo integró, lo verificó y lo commiteó el agente principal. La etapa empezó con `npm ci`, `npm run build` y `npm test` en verde sobre la base: 881 tests (879 pasan, 2 omitidos) y 41 E2E del Studio. L11 repitió `npm ci`, `npm run build`, `npm test` y `npm audit` (0 avisos).

| Lote | Estado | Commit | Tests al cerrar | Desvíos |
|---|---|---|---|---|
| L01 | Hecho | `06f49d8` | 901 (antes 881) | E6-D1 |
| L02 | Hecho | `40aaf59` | 917 | E6-D2 |
| L03 | Hecho | `390e630` | 928 | E6-D3 |
| L04 | Hecho; la revisión archivo por archivo de la autora queda pendiente | `7c55ca4` | 955 | E6-D4 |
| L05 | Hecho; ídem | `4d11d82` | 973 | E6-D5 |
| L06 | Hecho | `968dce7` | 979 | E6-D6 |
| L07 | Hecho | `3da6f50` | 988 · E2E 50 (antes 41) | E6-D7 |
| L08 | Hecho | `526c89e` | 989 · E2E 51 | E6-D8 |
| — | Ajuste encontrado al grabar L09 | `2d9ac87` | 992 | E6-D9 |
| L09 | Hecho | `cc9f034` | 992 | E6-D9 |
| L10 | Hecho | `f5b8880` | 992 | E6-D10 |
| L11 | Hecho; el tag `v3.2.0` y la publicación los hace la autora | `50ad3c3` | 992 | — |

En todas las filas, 2 tests se omiten fuera de Linux o macOS, como en las etapas anteriores. El commit de este registro (`docs(plan): registrar la ejecución de la Etapa 6`) va encima de L11.

**Lo que se comprobó además de la suite:**

- **Cada commit por sí solo**, en un clon temporal (`git clone --no-hardlinks`, un `npm ci` y, para cada commit de L01 a L11, `npm run build` y `npm test`): los 12 compilan y pasan, con los totales de la tabla.
- **Un sistema en inglés**, como una CI de Linux sin `LANG`: la suite y los E2E del Studio con un preload (`NODE_OPTIONS=--import`) que hace que `Intl` diga `en-US`. 992 tests (990 pasan) y 51 E2E. Ese preload no llega al servidor de `test/e2e.test.ts`: `StdioClientTransport` solo hereda una lista blanca del SDK más el `env` del test, y ni `NODE_OPTIONS` ni `PHASE_GATE_LANG` están en ella. En este equipo el hijo seguía en español por la región de Windows, así que la simulación no vio el fallo que después dio la CI. `test/helpers.ts` fija `PHASE_GATE_LANG=es` para el proceso de los tests y para los hijos que reciben `process.env`; `ui --demo` la conserva. El de `e2e.test.ts` tiene que repetirla en su propio `env`.
- **El español no cambió:** las pruebas de oro `2.2.0` y `3.0.0` y el export de oro de la demo en español (`test/oro/export/`) siguen idénticos (se regeneraron con `ORO_REGENERAR=1` y git no vio cambios).
- **La paridad del inglés:** las mismas 27 ranuras en el mismo orden, el mismo número de puntos en cada PROHIBIDO / AUTOVERIFICACIÓN, los mismos bloques y modos en las variantes y en los cinco presets (`test/prompts-en.test.ts`, `test/presets-en.test.ts`, `test/vocabulario.test.ts`). Un proyecto en inglés ensambla las cinco fases con las cuatro políticas de commits, con y sin lotes, sin avisos.
- **La demo en inglés** es determinista en dos procesos y dos zonas horarias, con sus HEAD de oro (`shop-api` `46b45c1b…`, `shop-web` `8706b5ac…`).
- **Los medios, generados de verdad en este equipo** (VHS 0.12.1 y ttyd 1.7.7 descargados en una carpeta temporal, ffmpeg 6.0 de `ffmpeg-static`, Chromium de Playwright 1.63): 41,3 s en español y 42,4 s en inglés; MP4 de 1,52 MB; GIF de 4,93 y 4,72 MB a 8 fps y 760 px. Estos son solo para medir: la banda de la demo lleva la ruta del temporal de Windows, con el nombre del usuario, y no se publican.
- **El paquete** (`npm pack --dry-run`): 532,2 kB, 1,7 MB descomprimido, 185 archivos; lleva `prompts/en`, `presets/en` y la demo en inglés, y nada de `studio/src`, `test/`, `docs/` ni `scripts/`. `node build/index.js --version` dice `3.2.0`. El Studio pesa 125,56 kB en gzip, de 200.

**Desvíos:**

- **E6-D1 · L01.** (a) La tabla de alias tiene **27** entradas y no 23: el catálogo creció en la Etapa 4. Se expresa como 12 alias de nombre de ranura más `phase-N` → `fase-N`. (b) Los prompts en inglés usan también el alias en los marcadores de ranura (`<!-- slot: tests -->`), no solo en los bloques; `ranurasDe` los resuelve al id canónico. (c) El vocabulario es un superconjunto del tipo de §8.2: las claves `bytes`, `generado_por` y `lotes`, los títulos de las condicionales, las cabeceras de las tablas de un recibo y del índice, los textos de sección vacía, los nombres de documento de fábrica, el frontmatter de los presets (`description`, `batches`), los modos de bloque, las secciones esqueleto y el prefijo "Re-anchored on". (d) Toca además `src/capas.ts` (las secciones esqueleto en los dos idiomas), `src/eject.ts` (objetivos con alias), `src/manifiesto.ts` (frontmatter de presets) y `src/studio/api.ts` (la Bitácora lee "Re-anchored on"). (e) Las secciones de un recibo cuentan como vacías con menos formas que las de pendientes ("sin pendientes" no vacía un recibo), para que un recibo del servidor siga dando los mismos bytes al leerlo y escribirlo otra vez. Base: leído en código.
- **E6-D2 · L02.** (a) Cinco pasos y no seis: el sexto ("en") es el resultado del quinto cuando el sistema no está en español. (b) El idioma del sistema se prueba con `fijarLocaleDelSistema` en vez de con `LANG` (que en Windows no cuenta), así que esos tests no se saltan en `win32`. (c) `init` solo pregunta el idioma con `--migrate`, y solo si hay proyectos cuyos documentos no lo dicen; `--idioma` lo da sin preguntar; los manifiestos nuevos llevan siempre `idioma`. (d) `get_phase_prompt` se niega con `IDIOMA-CON-TAREAS`, como dice §8.3; las demás tools no. (e) `test/helpers.ts` fija `PHASE_GATE_LANG=es`. (f) Toca además `src/eject.ts` (marcador y carpeta de comandos en el idioma del destino), `src/lotes.ts` (`FaseDeLotes.idioma`), `src/studio/acciones.ts` y los arreglos del Vigía. Base: medido (V9) y leído en código.
- **E6-D3 · L03.** (a) 620 códigos en seis catálogos, con un contexto por llamada (`AsyncLocalStorage`) en vez de pasar el idioma a cada función. (b) `record_batch` acepta además `estado` y los títulos de `condicionales` en inglés, y los normaliza (los prompts en inglés los usan). (c) El Studio asigna el estado HTTP de un error por su código. (d) `--help` documenta `PHASE_GATE_LANG`. (e) Los mensajes del backend del Studio no entraron aquí: los pasó L07 (otro catálogo: 69 códigos más), y los del export, L08 (11 más). Quedan en español las respuestas de texto plano del filtro de seguridad del Studio (421/403/401) y las líneas que `ui` imprime al arrancar. Base: leído en código.
- **E6-D4 · L04.** (a) Los textos en inglés los redactaron agentes sobre un contrato escrito y los verificaron scripts de paridad; la revisión de la autora es un OK general dado por adelantado, y la lectura archivo por archivo queda pendiente (E6-R3 sigue abierto). (b) Los rangos de palabras de la descripción del PR se ajustan al inglés (de 200–260 a 190–240 el normal; de 500 a 450 el tope). (c) Los ejemplos de PR son nuevos y genéricos (una tienda en línea inventada). Base: inferido (la voz la juzga la autora).
- **E6-D5 · L05.** Además, sin proyecto, la capa de fábrica, los presets y los `/fN` siguen el idioma del equipo (`idiomaSinProyecto` en `config.ts`, que lee solo el campo `idiomaPorDefecto` de `machine.json` para no importar el manifiesto) en vez del español fijo; los `/fN` de un servidor salen de las capas de su idioma de arranque. Toca `src/config.ts`, `src/manifiesto.ts` y `src/prompts-mcp.ts`. Base: leído en código.
- **E6-D6 · L06.** Al revisar el oro se unificó un encabezado que dos juegos escribían distinto ("QUALITY MARKS" → "QUALITY MARKERS"). Base: medido (diff de encabezados entre fases).
- **E6-D7 · L07.** (a) El backend del Studio tenía unos 60 textos propios en español: van a un catálogo `studio`. (b) La huella de una acción ya no incluye el texto del resumen, que ahora depende del idioma: una vista previa en un idioma se aplica en el otro; la huella sigue cubriendo archivos, contenidos, `mtime` y comandos (§7.6). (c) "Ver prompt completo" se ensambla en el idioma del proyecto, para que sea lo mismo que recibe el modelo. (d) El idioma de la interfaz viaja en la cabecera `X-Phase-Gate-Lang`; el SSE no lleva texto. (e) Los SVG de los sellos no tienen texto: no hubo nada que redibujar. No hay un sello "STALE": un ancla no vigente es el sello agrietado con su palabra de siempre, y "stale"/"no vigente" es su texto en modo Sobrio. Base: leído en código.
- **E6-D8 · L08.** (a) La demo inglesa usa la subcarpeta `Projects` y el commit inicial "chore: initial state"; su carpeta de `ui --demo` es `mcp-phase-gate-demo-en`. (b) `ui --demo` conserva `PHASE_GATE_LANG` (no es una ruta), y `--idioma` con `--export-static` es un error: el export escribe siempre los dos. (c) Con datos reales también se exportan los dos conjuntos (la misma Documentación, con los textos del servidor en cada idioma). (d) Los planes de la demo inglesa usan la tabla de 7 columnas del contrato; los de la española tienen 6. (e) El oro del export en español no cambia; el inglés añade `test/oro/export/en/` (rutas y proyectos). (f) Los mensajes del export pasan al catálogo `studio`. Base: medido (HEAD de oro) y leído en código.
- **E6-D9 · L09.** (a) `scripts/medios.mjs` en vez de `medios.sh`, para que funcione también en Windows. (b) El GIF tiene un tercer escalón (8 fps y 760 px): a 12 fps y 960 px pasaba de 7 MB, y a 10 fps y 840 px, de 6. (c) La Red sale sin farol encendido: encenderlo exigía inventar un registro de sesión, y eso es escenificar. (d) La escena de `init --dry-run` enseña solo Cursor (en la CI no hay `claude`), y la de `doctor` los tres proyectos de la demo (`multi-repo-feature`, `ai-agent-ops`, `research-ops`) en lugar de uno `software-replica`. (e) En Windows, VHS lanza el `bash` de WSL; `medios.mjs` usa ahí PowerShell. (f) **Ajuste `2d9ac87`:** al grabar `doctor` en inglés salió que daba por ausentes las secciones de las reglas globales en inglés (buscaba los títulos solo en español) y que `doctor --fase` no enseñaba los alias; se corrigió en un commit propio, con sus tests. Base: medido.
- **E6-D10 · L10.** (a) `test/docs.test.ts` no revisa los README: los 65 enlaces internos de cada uno (41 anclas y 24 archivos) se comprobaron con un script aparte, y los dos tienen los mismos 45 encabezados (48 contando tres líneas `#` dentro de bloques de código) y las mismas 161 filas de tabla. (b) Las cifras del caso de estudio son las medidas en esta etapa, con su comando; la del paquete se volvió a medir con los README nuevos. (c) La ADR de README "bilingüe completo" queda marcada como reemplazada en parte, y la de L03 dice que son 700 códigos en siete catálogos desde L07. (d) Las capturas PNG de la Etapa 5 dejan de enlazarse (no tienen el selector de idioma); siguen en `docs/medios/`. Base: medido.

**Un fallo intermitente:** en una corrida de la suite, el archivo `test/studio-acciones.test.ts` falló entero en 1 ms, sin llegar a ejecutar sus tests; solo y en las corridas siguientes pasó siempre. No se reprodujo. *Explicado por la auditoría (hallazgo 8):* su guardián comparaba la fecha de `~/.claude.json`, que Claude Code reescribe por su cuenta; corregido en A4.

**Pendiente de comprobar fuera de este equipo:**

1. **La auditoría externa** de la etapa, a ciegas y con permiso para cuestionar las ADRs, antes del PR. *Hecha: ver abajo.*
2. **La revisión de la autora** de `prompts/en/**` y `presets/en/**` (§8.4, paso 3), y con ella los ejemplos de calidad en inglés (hallazgo 5 de la auditoría).
3. **La CI** (Linux y Windows, Node 22 y 24) corrió en el PR #55: los E2E del Studio pasaron y los cuatro `build-and-test` fallaron por el idioma del servidor de los e2e (el ajuste de abajo). La simulación de un sistema en inglés no cubría a ese hijo. El workflow de Pages sigue sin ejecutarse.
4. **El workflow de Pages con los medios** (VHS por su action, las fuentes IBM Plex, ffmpeg de apt, Chromium): nunca se ha ejecutado, y desde A5 tiene tres jobs y las actions fijadas por SHA (su YAML no se validó con un parser en este equipo); se puede probar con `workflow_dispatch` en una rama antes del tag. Después, comprobar en npmjs.com que el GIF y los enlaces de los README se ven.
5. **El orden de subida:** esta rama lleva debajo L11 a L13 de la Etapa 5, que no están en `master`. Después, el tag `v3.2.0` y la publicación, que hace la autora.
6. **Clientes reales:** `PHASE_GATE_LANG=en` con las descripciones en inglés en Claude Code, Cursor y VS Code, y una tarea entera en un proyecto en inglés con un modelo de verdad.

**Auditoría externa (antes del PR).** Un segundo agente auditó la etapa a ciegas, con permiso para cuestionar las ADRs, y leyó esta sección solo después de tener sus cifras. Veredicto: **apto con observaciones**. Los 13 commits compilan y pasan cada uno por su cuenta (los fallos que vio se explican por su equipo: el espacio de su ruta, `~/.claude.json` y la carga de la máquina); los E2E pasan 51 de 51. Midió además lo que la suite no cubre: con el sistema en español, 123 de 123 salidas en español (prompts de las cinco fases con las cuatro políticas, flujo MCP, errores, recibos e índice) son idénticas byte a byte a las de `6c27e00`; `tools/list` conserva nombres y anotaciones; 390 llamadas simultáneas en los dos idiomas no se cruzan; la seguridad del Studio y la puerta de git no cambian (con control positivo). **0 escapes.** Encontró 1 hallazgo alto, 4 medios y 15 bajos, y cuestionó 9 ADRs. Se resolvieron con commits nuevos encima de `a919c4f`, sin reescribir la historia; el alto y uno de los medios son de la autora:

| Ajuste | Commit | Resuelve | Tests al cerrar |
|---|---|---|---|
| A1 | `aca73ab` | 2, 11 (y un fallo de `init --migrate` que no veía la Documentación de `--docs`) | 995 |
| A2 | `ebf9cba` | 3, 12 | 997 |
| A3 | `3f321d5` | 4 | 998 |
| A4 | `f770bff` | 7, 8 | 999 · E2E 51 |
| A5 | `83586b1` | 14 | 999 |
| A7 | `3efa5db` | 10 | 1000 |
| A7 | `7345262` | 13 | 1000 |
| A7 | `c7c6fab` | 9 | 1001 · E2E 51 |
| A7 | `b83316f` | 20 | 1001 |
| A7 | `010e946` | 19 | 1004 |
| A6 | `3ceeb49` | 6, 16 y dos ADR que faltaban | 1004 |
| A8 | El commit de documentación de la auditoría | 15, esta sección y una nota en la ADR de L03 | 1004 · E2E 51 |
| A9 | `363200f` | la CI del PR: el hijo de `test/e2e.test.ts` no recibía `PHASE_GATE_LANG` | 1004 · E2E 51 |

En todas las filas, 2 tests omitidos, como arriba. Los ajustes se numeraron antes de hacerlos (A7 eran los bajos opcionales) y se commitearon en este orden. En A1, el guardián del hallazgo 8 falló una vez (el falso positivo que corrige A4); el resto de la suite pasó. `b83316f` no se corrió aparte: la suite corrió con el test de `010e946` ya presente (independiente, suma 3), y A5 solo toca los workflows.

| # | Sev. | Lote | Hallazgo | Resolución |
|---|---|---|---|---|
| 1 | Alta | L04, L05 | La revisión archivo por archivo de la autora de `prompts/en/**` y `presets/en/**` no se hizo, y §8.4 la pone como condición para cerrar L04 y L05 | **Pendiente de la autora**, antes del PR. Si cambia algo, en un lote de ajuste con `test/oro/3.2.0-en/` regenerado a propósito |
| 2 | Media | L02 | Un manifiesto de la 3.x sin `idioma` y sin documentos, y todo lo que va sin proyecto, seguían al idioma del sistema (inglés en un Linux sin `LANG`): con el sistema en inglés cambiaban 98 de 123 salidas en español, y la suite no lo veía porque fija `PHASE_GATE_LANG=es` | Un manifiesto sin `idioma` es español antes de caer al sistema (machine.json y `PHASE_GATE_LANG` siguen contando); `doctor` da `MANIFIESTO-SIN-IDIOMA`; `init --migrate` añade `idioma`, con copia, a los manifiestos que no lo tienen. La prueba de oro en español se repite con el sistema en inglés simulado y sin `PHASE_GATE_LANG`, en vez de un job de CI (la suite crea cientos de proyectos sin manifiesto cuyo idioma es, a propósito, el del sistema). Sin proyecto sigue mandando el equipo, ahora con su ADR. Nueva ADR del 2026-10-19 |
| 3 | Media | L02 | `get_phase_prompt` pasaba de 100 a 586 ms con 100 tareas y de 235 a 3489 ms con 600: el idioma se recontaba en el disco varias veces por llamada | Un recuento por proyecto y por llamada (`conCacheDelIdioma`: las tools, las lecturas del Studio y `doctor`), con un `readdir` por tarea. Medido aquí con el mismo script en `a919c4f` y en A2: 100 tareas, 716 → 120 ms; 600 tareas, 3719 → 393 ms (`list_tasks`, 913 → 329 ms) |
| 4 | Media | L02 | `IDIOMA-CON-TAREAS` solo frenaba `get_phase_prompt`: `start_task` mezclaba nombres de los dos idiomas en el mismo proyecto | También se niegan `start_task`, `record_batch`, `get_batch_status` y `write_central_doc` con el nombre de un documento de fase; `list_tasks` lo antepone como aviso |
| 5 | Media | L04 | Los ejemplos de calidad de las fases 1 a 4 en inglés son traducción frase por frase del español, y se presentan como "real excerpts" | **Pendiente de la autora**, dentro de la revisión del hallazgo 1 |
| 6 | Baja | L10 | Tres cifras del caso de estudio no coincidían con lo medido (Node, paquete, demo) | Vueltas a medir tras los ajustes, con un build limpio y el Node de este equipo, y la demo con sus condiciones (mediana de tres corridas, equipo en reposo) |
| 7 | Baja | `2d9ac87` | Un test de `doctor --fase` fallaba con una ruta del repo con espacios | `.*` en vez de `\S*` |
| 8 | Baja | Etapa 5 | El guardián de la configuración real de los clientes comparaba la fecha de `~/.claude.json`, que Claude Code reescribe solo: era el fallo intermitente de arriba | Compara el contenido, y de `~/.claude.json` solo sus `mcpServers`; con test. Los E2E pasan sin el error con una sesión de Claude Code abierta |
| 9 | Baja | L03, L07 | Las líneas de `ui` y las respuestas del filtro del Studio seguían en español | Al catálogo del Studio, con el español de siempre; las del filtro, en el idioma del proceso (el filtro no lee la cabecera de idioma). ADR de L03 matizada |
| 10 | Baja | L02, L03 | `doctor` no avisaba de un `PHASE_GATE_LANG` inválido | `LANG-INVALIDO` (aviso) |
| 11 | Baja | L02 | La ADR del manifiesto (Etapa 3) no llevaba la nota de que la de L02 la amplía | Nota "Ampliada" (A1) |
| 12 | Baja | L02 | La detección por disco dependía del sistema de archivos (mayúsculas, NFD) | Nombres comparados en NFC y sin mayúsculas, igual en todos los sistemas (A2) |
| 13 | Baja | L01, `2d9ac87` | Las secciones de las reglas globales estaban escritas fuera del vocabulario | Al vocabulario, con `EVIDENCIA` / `EVIDENCE`, y el test de contrato las cubre |
| 14 | Baja | L09 | El workflow de Pages instalaba VHS, ffmpeg y Chromium en el job con permiso para Pages; actions por tag; un fallo de los medios impedía publicar la demo | Tres jobs; solo el de desplegar tiene `pages` e `id-token`; actions de los tres workflows por SHA; sin medios nuevos se publican los que ya estaban. ADR de L09 ampliada |
| 15 | Baja | docs | La cabecera decía "sin subir", §10 "23 ranuras", E6-D3 "60 códigos" y E6-D10 "48 encabezados" | Corregido aquí |
| 16 | Baja | L10 | La descripción de `package.json` seguía en español | En inglés, la frase del README |
| 17 | Baja | Etapa 5 | El export estático no es determinista bajo carga (el plazo de 3 s de git) | **Pendiente** (es de la Etapa 5) |
| 18 | Baja | Etapa 5 | Un test de temporizador de 300 ms falla bajo carga | **Pendiente** (es de la Etapa 5) |
| 19 | Baja | L03 | Las plantillas reciben `any`: un parámetro mal escrito compilaba | Test que lee el código con el compilador de TypeScript y compara las claves de cada llamada con las de las plantillas en los dos idiomas (comprobado con una mutación); no encontró ninguna rota |
| 20 | Baja | L03 | `doctor --json` metía el error dentro de un valor canónico (`"inválido: …"`) | `manifiesto` canónico y `errorDelManifiesto` aparte; la salida de texto no cambia (el diseño de §5.9 decía `"inválido: <ruta del error>"`) |

| ADR cuestionada | Resolución |
|---|---|
| L01: el alias de una ranura se acepta sin mayúsculas en los marcadores y con ellas exactas en `eject` | **Pendiente** (pulido) |
| L02 (M2): quitar el `"es"` por defecto cambiaba los manifiestos de la 3.x sin tareas | Resuelto en A1 (hallazgo 2) |
| L03: el contexto de idioma implícito tiene consecuencias que la ADR no decía | Nota en la ADR: lo que corre fuera de una llamada y los errores de validación salen en el idioma de arranque |
| L04: la decisión dependía de la revisión de la autora | **Pendiente de la autora** (hallazgo 1) |
| L09 (M5): medios no reproducibles; si el workflow falla, no se publica ni la demo | Lo segundo, resuelto en A5. Lo primero se acepta: VHS y Chromium van fijados; ffmpeg y las fuentes, de apt |
| L10 (M4): la descripción del paquete seguía en español | Resuelto en A6 |
| `record_batch` acepta estados en inglés en un proyecto en español | El auditor lo da por correcto; sin cambios |
| La huella del Studio sin el resumen (E6-D7 b) | Nota en la ADR de las huellas (A6) |
| E6-D5 y otras decisiones sin ADR (la cabecera de idioma del Studio, los sellos con la palabra fuera del SVG) | ADR nuevas del 2026-10-19 (A1 y A6) |

**Pendiente antes del merge y del tag `v3.2.0`:** la revisión de la autora (hallazgos 1 y 5), el workflow de Pages y el orden de subida (los commits de la Etapa 5 que esta rama lleva debajo). La CI del PR #55 corrió sobre `51b73e2`: los E2E del Studio pasaron en Linux y en Windows, y los cuatro `build-and-test` fallaron los mismos 10 tests de `test/e2e.test.ts`, porque el servidor hijo hablaba inglés. `StdioClientTransport` no hereda `PHASE_GATE_LANG` (la suite la fija en el proceso, y el SDK solo pasa una lista blanca más el `env` del test); en los runners el idioma del sistema es inglés y en este equipo es español, por eso aquí la suite pasaba. Se arregló en `363200f` poniendo `PHASE_GATE_LANG=es` en ese `env`. No cambia el producto. En Linux esos jobs omiten 4 tests (el nombre corto 8.3, que ese volumen no genera; el congelamiento al cambiar mayúsculas; la subcarpeta de tareas y las mayúsculas; y la URI `file:///c%3A/` de VS Code) y en Windows 2 (`XDG_STATE_HOME` y el FIFO): es lo que corresponde a cada sistema. En Node 24 sobre Linux falló además, una sola vez, «los seis tipos» de `test/studio-eventos.test.ts` (no llegó el evento de documento dentro de los 450 ms); los otros tres jobs no lo vieron. Es el temporizador del hallazgo 18, que sigue pendiente.

---

## 10. Cierre del plan

**Plan v3 completado al 100 %** en la iteración 7 y **validado en Windows** en la iteración 9 (§9.4.1). Las siete etapas están cerradas, cada una con sus decisiones de cierre registradas:

| Etapa | Decisiones de cierre | Ajustes |
|---|---|---|
| 0 | aprobada en la iteración 1 | `validarSegmento` con espacios y caracteres en español; lotes con dos dígitos; tests por subcadena (iteración 2); plan versionado en L09 (iteración 7); validación en Windows (iteración 9) |
| 1 | C1–C4 | A1–A5 |
| 2 | D1–D4 | B1–B3 |
| 3 | F1–F5 | G1–G5 |
| 4 | H1–H5 | — |
| 5 | J1–J5 | — |
| 6 | M1–M5 | — |
| Todas | — | Validación externa: V1–V17 (§9.4.1) |

**Cifras del plan:** 7 etapas; 80 lotes; 44 ADRs nuevas previstas (41 en las tablas de las Etapas 1 a 6 y 3 en la Etapa 0: L01, L03 y L09); 23 ranuras en el catálogo al diseñarlo (27 desde la Etapa 4, que convirtió en ranuras las líneas de E3-D5); 7 versiones (`2.0.1`, `2.1.0`, `2.2.0`, `3.0.0-beta.0`, `3.0.0`, `3.1.0`, `3.2.0`).

**Frontera fija:** el agente nunca hace `push` ni abre PRs, en ninguna política ni configuración. Los commits por lote sí son configurables (cuatro políticas).

**Regla para lo que venga:** si al ejecutar algo del plan no cuadra con el código real, es un **desvío**. Se decide con la autora, se registra con su `D<n>` y su Base en el recibo del lote, y se refleja en `docs/plan-maestro-v3.md` en el lote de documentación de esa etapa. El diseño de una etapa cerrada no se reescribe en silencio.

---

## Anexo A — Registro de iteraciones

| Iteración | Fecha | Cambios |
|---|---|---|
| 1 | 2026-10-14 | Contratos globales; Etapa 0 cerrada con el ajuste de `validarSegmento` (espacios intermedios y caracteres en español) y lotes con dos dígitos; Etapa 1 diseñada al nivel de Fase 3 |
| 2 | 2026-10-14 | Etapa 1 cerrada (decisiones C1–C4 y ajustes A1–A5); Etapa 0, L03, con tests por subcadena; Etapa 2 diseñada al nivel de Fase 3 contra el SDK 1.30.0 instalado. Hallazgo: `process.loadEnvFile` no quita el BOM de UTF-8 |
| 3 | 2026-10-14 | Etapa 2 cerrada (decisiones D1–D4 y ajustes B1–B3); Etapa 3 diseñada al nivel de Fase 3, comprobada contra el SDK (Roots), Node (`fileURLToPath` con URIs de Windows), zod (`toJSONSchema`) y git 2.43 (`status --porcelain=v2`). Hallazgos: el SDK no comprueba la capacidad `roots` antes de pedirlas; `git status` puede ejecutar `core.fsmonitor`; una prerelease saldría como `latest` |
| 4 | 2026-10-14 | Etapa 3 cerrada (decisiones F1–F5 y ajustes G1–G5); Etapa 4 diseñada al nivel de Fase 3, comprobada con git 2.43 (`rev-parse --verify --end-of-options`, `merge-base --is-ancestor`, `diff-tree --root`) y Node 22 (sha256 en streaming). Hallazgos: `cat-file -e` y `rev-parse` aceptan `HEAD` y prefijos de 4 caracteres, así que el SHA se valida antes de llamar a git; el sha256 de un archivo de texto cambia entre equipos con `core.autocrlf` |
| 5 | 2026-10-14 | Etapa 4 cerrada sin ajustes (decisiones H1–H5); Etapa 5 diseñada al nivel de Fase 3, comprobada con Node 22 (`fs.watch` recursivo), git (SHA deterministas con autor y fechas fijos) y npm (versiones del frontend con al menos dos semanas). Hallazgos: el Studio no ve las raíces de las sesiones MCP sin un registro aparte; `EventSource` no admite cabeceras, así que el token se canjea por una cookie; el catálogo tiene 23 ranuras, no 22 |
| 6 | 2026-10-14 | Etapa 5 cerrada sin ajustes (decisiones J1–J5); Etapa 6 diseñada al nivel de Fase 3, comprobada con Node 22 (`Intl` sigue a `LANG`, ausente en los entornos que dan los clientes MCP) y con el pipeline real de medios (Playwright `recordVideo` y `ffmpeg` con paleta en dos pasadas). Hallazgos: el código depende de once familias de textos en español, por lo que hace falta un vocabulario bilingüe antes de traducir; las imágenes relativas del README se rompen en npmjs.com. Se añade la Sección 9 (cómo arrancar la ejecución) |
| 7 | 2026-10-14 | Etapa 6 cerrada sin ajustes (decisiones M1–M5). §9.2 decidida (opción B): el plan se versiona en `docs/plan-maestro-v3.md` en el nuevo lote L09 de la Etapa 0, y la release de esa etapa pasa a L10. Plan completado al 100 % |
| 8 | 2026-10-14 | Se descarta hacer configurable el `push`: queda prohibido siempre (nota en las ADRs de commits de las Etapas 1 y 3; `init` solo informa cómo bloquearlo en el cliente). Nueva §9.4: validación externa de solo lectura en el equipo Windows de la autora antes de L01, con la lista honesta de supuestos no probados desde la nube; el mensaje de ejecución pasa a §9.5 |
| 9 | 2026-10-14 | Validación externa en Windows incorporada (luz verde con ajustes): V1–V17 (§9.4.1). Los de más peso: LF fijado con `.gitattributes` y normalización al leer (V1), carpetas temporales con la ruta real (V2), `npm audit fix` (V3), elicitation que no se cuelga con el bug de Cursor (V4), `init` sin registros duplicados (V5), candados de push descritos con honestidad (V6) y slug de 40 caracteres (V7). Cifra corregida: 44 ADRs. Ejemplos genéricos en lugar de nombres reales (V16) |
| 10 | 2026-10-14 | Desvío detectado por el agente ejecutor al arrancar L01: la tabla de hallazgos S1–S9 no estaba en el plan, y "los 6 ataques" de L01 era ambiguo. Se añade la tabla a §2.1 y la lista de los 6 casos de L01 a su detalle; el cambio de `carpetaTemporal` se marca como preventivo |
| 11 | 2026-10-14 | Decisiones al ejecutar E0 L03: `null` en campos opcionales cuenta como ausente (`.nullish()`); un número en texto se rechaza con un mensaje claro; se acepta el metadato `"peer": true` que npm 11 añade al lockfile |
| 12 | 2026-10-14 | Desvío detectado al ejecutar E0 L04: el refresco de la copia de trabajo exigía el árbol limpio antes del commit del propio lote, y `reset --hard` habría borrado el cambio de `.gitignore`. Nuevo orden: renormalizar, commit y después refrescar |
| 13 | 2026-10-14 | E0 L09: el plan entra al repo como `docs/plan-maestro-v3.md` y pasa a ser la fuente. Sección 9 puesta al día con lo ejecutado (§9.6: commits de L01 a L08 y desvíos E0-D1 a E0-D5). Revisión de privacidad del texto entero: fuera la rama de la sesión en la nube y el nombre corto 8.3 real; los ejemplos de recibos de la Etapa 4 pasan a un caso genérico de tienda; los detalles del equipo de la autora se generalizan; la estrategia de difusión personal (§8.9.1) sale del repo |
| 14 | 2026-10-14 | Etapa 1 ejecutada (L01 a L11) en la rama `etapa-1/lotes-y-recibos`. Nueva §9.7 con los commits y los desvíos E1-D1 a E1-D6. El más relevante: el validador de ranuras de `test/prompts.test.ts` trata los ejemplos de PR de la Fase 5 (`--- INICIO EJEMPLO ---` … `--- FIN EJEMPLO ---`) como una valla de código, porque sus `##` son parte del ejemplo |
| 15 | 2026-10-14 | Auditoría externa de la Etapa 1, a ciegas y con permiso para cuestionar las ADRs: apto con observaciones (3 hallazgos medios, 12 bajos y 3 cuestionamientos). Se resolvieron con los ajustes A1 a A6, en commits nuevos encima de L11 (§9.7). Los de más peso: R4 compara los nombres sin mayúsculas y en NFC, la Fase 4 comprueba la rama antes de commitear, un único lote fallido deja su recibo en la subcarpeta, y `get_phase_prompt` lista los recibos que ya existen. Se corrigen los tamaños de los prompts de §9.7, que mezclaban conteos en CRLF, y la frase de §3.3 sobre el "paso 0" |
| 16 | 2026-10-15 | Etapa 2 ejecutada (L01 a L11) en la rama `etapa-2/protocolo-mcp`, con un OK general de la autora para los commits. Nueva §9.8 con los commits, la repetición de §4.1 sobre el SDK 1.32.1 y los desvíos E2-D1 a E2-D11. Los de más peso: los mensajes de validación en español pasan a cada campo de los shapes (zod v4) para que los E2E sobrevivan a la migración sin cambios, el log se muda a `src/log.ts`, y la matriz de clientes de L10 queda por rellenar con lo observado |
| 17 | 2026-10-15 | Auditoría externa de la Etapa 2, a ciegas y con permiso para cuestionar las ADRs: apto con observaciones (1 hallazgo alto, 3 medios y 14 bajos). Se resolvieron con los ajustes A1 a A8 en commits nuevos (§9.8), salvo la matriz de clientes de L10, que rellena la autora. Los de más peso: el diagnóstico ya no lanza con una capa de prompts que no es carpeta; el entorno del cliente gana al `.env` también entre nombres distintos; la confirmación se cancela con la llamada, y el segundo plazo vencido seguido falla cerrado en esa misma llamada |
| 18 | 2026-10-15 | Etapa 3 ejecutada (L01 a L13) en la rama `etapa-3/configuracion`, con un OK general de la autora para los commits. Nueva §9.9 con los commits, lo comprobado fuera de la suite y los desvíos E3-D1 a E3-D14. Los de más peso: sin bloques, el prompt es byte a byte el de la `2.2.0` (comprobado contra su build); las variantes de regla conservan las salvaguardas que añadió la auditoría de la Etapa 1 y dicen qué partes fijas no aplican (deuda para la Etapa 4); `read_repo_file` deja leer `.github`; en Claude Code, `init` no modifica un registro existente |
| 19 | 2026-10-16 | Auditoría externa de la Etapa 3, a ciegas y con permiso para cuestionar las ADRs: apto con observaciones (1 hallazgo alto, 8 medios y 20 bajos). Se resolvieron con los ajustes A1 a A8 en commits nuevos (§9.9) el alto, los medios y algunos bajos; el resto queda como pendiente de pulido. Los de más peso: la puerta de git anula también los filtros de `.gitattributes`; el servidor pide el estado de git sin bloquearse; una coincidencia débil de Roots ya no basta para escribir; `init` solo reconoce el paquete exacto y no toca las cadenas de otros servidores; un `machine.json` roto solo afecta a quien lo usa; `read_cross_repo` tampoco lee `.git` |
| 20 | 2026-10-16 | Etapa 4 ejecutada (L01 a L11) en la rama `etapa-4/motor-de-lotes`, creada desde la punta local de `etapa-3/configuracion` (`16d25fc`) y sin subir, con un OK general de la autora para los commits. Nueva §9.10 con los commits, lo comprobado fuera de la suite y los desvíos E4-D1 a E4-D10. Los de más peso: `git show` ejecuta el `gpg.program` de `.git/config` con `log.showSignature`, así que la puerta lo llama con `--no-show-signature`; en Node 24.11 para Windows, `rmSync` no borra un nombre con acentos ni lanza; la deuda E3-D5 se cierra con cuatro ranuras nuevas (27 en el catálogo); el bloque de commits de la Fase 5 se arma en el servidor y no en `phases.ts`; `doctor --reverificar` va por un camino asíncrono aparte. Las Fases 1 a 3 siguen byte a byte las de la `2.2.0`; las 4 y 5 tienen oro nuevo en `test/oro/3.0.0/` |
| 21 | 2026-10-16 | Auditoría externa de la Etapa 4, a ciegas y con permiso para cuestionar las ADRs: apto con observaciones (0 altos, 3 medios y 11 bajos, y 4 cuestionamientos de ADR). Se resolvieron todos con los ajustes A1 a A8 en commits nuevos (§9.10). Los de más peso: un candado por tarea para que dos procesos no dejen dos recibos del mismo lote (en Windows, abrir con `wx` un candado que otro proceso borra da `EPERM`); lo que entra por la escotilla de `write_central_doc` queda con `origen: manual`; sin `--quiet`, `rev-parse` distingue el hash ambiguo del inexistente; un lote pendiente se puede descartar con solo su estado. H5 (un commit que no toca ningún archivo declarado) se mantiene a la espera de la decisión de la autora. 775 tests (773 pasan, 2 omitidos) |
| 22 | 2026-10-18 | Etapa 6 ejecutada (L01 a L11) en la rama `etapa-6/el-mundo`, creada desde la punta local de `etapa-5/studio` (`6c27e00`), que lleva L11 a L13 de la Etapa 5 que no llegaron a `master`, con un OK general de la autora. Nueva §9.11 con los commits, lo comprobado fuera de la suite y los desvíos E6-D1 a E6-D10. Los de más peso: 27 alias de ranura y no 23; 700 mensajes con código en siete catálogos, con un contexto de idioma por llamada; `record_batch` acepta los estados en inglés; la suite fija `PHASE_GATE_LANG=es` y pasa igual con un sistema simulado en inglés; el GIF entra en 5 MB a 8 fps y 760 px; al grabar los medios salió un fallo de `doctor` con las reglas globales en inglés, corregido en `2d9ac87`. 992 tests (990 pasan, 2 omitidos) y 51 E2E del Studio |
| 23 | 2026-10-19 | Auditoría externa de la Etapa 6, a ciegas y con permiso para cuestionar las ADRs: apto con observaciones (1 hallazgo alto, 4 medios y 15 bajos, y 9 cuestionamientos de ADR). Se resolvieron con ajustes en commits nuevos (§9.11), salvo el alto y el de los ejemplos de calidad, que son la revisión de la autora, y dos bajos de la Etapa 5. Los de más peso: un manifiesto de la 3.x sin `idioma` sigue en español aunque el sistema esté en inglés, y la prueba de oro en español se repite con el sistema en inglés simulado; el idioma de un proyecto se cuenta una vez por llamada (`get_phase_prompt` con 600 tareas, de 3,7 s a 0,4 s); `IDIOMA-CON-TAREAS` frena también a `start_task`, `record_batch` y `get_batch_status`; el guardián de los E2E compara contenido y no la fecha de `~/.claude.json`; el workflow de Pages separa los permisos. 1004 tests (1002 pasan, 2 omitidos) y 51 E2E del Studio |
