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

## REGLAS ADICIONALES
<!-- ranura: extra -->
<!-- /ranura -->
