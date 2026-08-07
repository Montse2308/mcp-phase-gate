# Decisiones

Registro de las decisiones de diseño del orquestador: qué se decidió, por qué, y qué
se descartó. El objetivo es no tener que reconstruir el razonamiento meses después,
cuando ya nadie se acuerda de por qué algo quedó así.

Lo que **no** va aquí: el historial de cambios (eso son los commits y los PRs) ni el
plan de lo que falta (eso son los [issues](https://github.com/Montse2308/MCP_orquestador/issues)).

Formato: una entrada por decisión, la más reciente arriba. Si una decisión se revierte,
no se borra — se agrega una entrada nueva que la reemplaza y se marca la vieja.

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
