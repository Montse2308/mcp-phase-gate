# Análisis técnico

## Lo que hay

- `tienda-api/src/carrito.js`: `total(lineas)` suma precio × cantidad. No sabe nada de descuentos.
- `tienda-web/src/carrito.html`: enseña el total que da la API; no tiene ningún campo de entrada.
- No hay tabla de cupones: habrá que crearla (para la demo, en memoria).

## Riesgos

- Redondeo: un 10 % sobre importes con céntimos puede dar tres decimales. Se redondea en la API.
- Mayúsculas y espacios: la gente escribe «bienvenida » con el espacio que copia del correo.

## Validaciones pendientes

Ninguna.
