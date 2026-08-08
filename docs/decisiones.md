# Decisiones

Registro de las decisiones de diseño del orquestador: qué se decidió, por qué, y qué
se descartó. El objetivo es no tener que reconstruir el razonamiento meses después,
cuando ya nadie se acuerda de por qué algo quedó así.

Lo que **no** va aquí: el historial de cambios (eso son los commits y los PRs) ni el
plan de lo que falta (eso son los [issues](https://github.com/Montse2308/MCP_orquestador/issues)).

Formato: una entrada por decisión, la más reciente arriba. Si una decisión se revierte,
no se borra — se agrega una entrada nueva que la reemplaza y se marca la vieja.

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
rutas de OneDrive viven en `.env` y no en el código.

**Qué se descartó.** Corregir la ruta al valor del otro dispositivo: habría movido el bug de
equipo en lugar de quitarlo. Y dejarlo como `.cursor/mcp.json.example`: el Paso 4 del README
ya trae el JSON completo, y de dos copias del mismo contenido una acaba envejeciendo.

**Lo que esta decisión no resuelve.** Los comandos `/f1`–`/f5` siguen viviendo solo en la
carpeta del usuario, porque Cursor no los lee de otro lado. Editar una fase en un equipo deja
al otro con la versión vieja, y eso sí es un problema de flujo, no de configuración. Queda
como issue abierto; entretanto su contenido está copiado en
[`comandos-cursor.md`](comandos-cursor.md).

---

## 2026-08-07 — La Fase 4 hace; el documento es el recibo

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
