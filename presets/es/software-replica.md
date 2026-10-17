---
nombre: software-replica
descripcion: Código existente sin suite de pruebas, con acceso de solo lectura a una réplica de datos para medir y comparar paridad.
lotes: true
commits: agente-commitea-con-OK
---

Preset de mcp-phase-gate. Es el flujo de la 2.2.0: código existente sin suite de pruebas y con una
réplica de datos de solo lectura, donde medir antes y después ocupa el lugar de las pruebas. Cada
bloque devuelve a su ranura el contenido que tenía en la 2.2.0, byte a byte (lo comprueba la prueba
de oro, test/oro.test.ts). El texto fuera de los bloques no llega al modelo.

<!-- bloque: fase-1/verificacion -->
Si una hipótesis se puede comprobar ejecutando algo, **ejecútalo ahora** y reporta la
salida real: una consulta contra una réplica de solo lectura, una sesión de consola del
framework, recuperar una versión anterior de un archivo con `git show` para comparar
comportamientos, una medición cronometrada.
<!-- /bloque -->

<!-- bloque: fase-2/verificacion -->
Antes de dar por buena una decisión, comprueba lo que se pueda comprobar: consultas contra
una réplica de solo lectura, lectura del código del framework, barridos por el proyecto
buscando otros consumidores, conteos reales de volumen.
<!-- /bloque -->

<!-- bloque: fase-3/comprobaciones -->
Antes de escribir el primer paso, comprueba contra el código real lo que el plan da por
hecho: que el identificador que vas a usar esté libre, que el método exista con esa firma,
que la clave de idioma no exista ya, que la relación cargue lo que crees, que la tabla esté
o no en el dump de esquema.
<!-- /bloque -->

<!-- bloque: fase-3/pruebas -->
Si el proyecto no tiene suite de pruebas automatizadas configurada, **no inventes una sección
de tests ni propongas escribir la primera del módulo**. Dilo en una línea cuando venga a cuento
y sigue. Si ya existe una suite en el repositorio, sí debes correrla: el plan dice qué comando
y qué debe dar, en el criterio de salida de cada lote.

Lo que sí existe es acceso de solo lectura a una réplica. Cuando el cambio altera lo que
muestra un reporte o un export, el plan define la comparación:

- Qué se vuelca antes y qué después, y sobre qué rango de datos.
- La matriz de combinaciones a cubrir: sin filtros, cada filtro por separado, dos
  combinados. Los filtros que el cambio toca son los que más importan.
- **El criterio por comparación**, que no siempre es el mismo:
  - Si el cambio es solo de rendimiento: **cero diferencias**. Una sola diferencia lo tumba.
  - Si el cambio altera datos a propósito: **toda diferencia tiene que caber en una lista
    escrita de antemano**. Lo que quede fuera de esa lista es un defecto, no una mejora.
- Si el volcado sale a un archivo, decir que no se versiona: lleva datos de clientes.

Si no hay suite, está prohibido inventar una sección de pruebas automatizadas o proponer
escribir la primera del módulo como parte de esta tarea.
<!-- /bloque -->

<!-- bloque: fase-4/verificacion -->
Comprobación de sintaxis, linter, consola del framework, consultas contra la réplica de
solo lectura, comparación del SQL generado antes y después, conteos, mediciones cronometradas.
<!-- /bloque -->

<!-- bloque: fase-4/pruebas -->
Si el proyecto no tiene suite de pruebas automatizadas configurada, no inventes una sección
de tests ni propongas escribir la primera del módulo como parte de esta tarea; si viene a
cuento, una línea y sigue. Si ya existe una suite en el repositorio, sí debes correrla, y su
resultado va con números en la verificación del lote.
<!-- /bloque -->
