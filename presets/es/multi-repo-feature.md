---
nombre: multi-repo-feature
descripcion: Un requerimiento que cambia varios repositorios a la vez, con contratos entre ellos.
lotes: true
commits: agente-commitea-con-OK
---

Preset de mcp-phase-gate para un requerimiento que cruza varios repositorios. Declara los repos en
el phase-gate.json del proyecto (`repos`) y, si quieres un PR por repo, `fase5.prPorRepo`. Todos los
bloques se añaden a la ranura (`despues`): no quitan nada del flujo de fábrica. El texto fuera de los
bloques no llega al modelo.

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
