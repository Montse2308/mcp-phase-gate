---
nombre: software-tdd
descripcion: Código con suite de pruebas; cada lote empieza por una prueba que falla.
lotes: true
commits: agente-commitea-con-OK
---

Preset de mcp-phase-gate para trabajar con pruebas primero. Sustituye la política de pruebas del
plan (Fase 3) y de la ejecución (Fase 4). El texto fuera de los bloques no llega al modelo.

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
