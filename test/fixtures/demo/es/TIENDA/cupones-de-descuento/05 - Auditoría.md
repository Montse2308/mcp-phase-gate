# Auditoría / Pre-PR

Commits auditados: L01 y L02 en `api`, L03 en `web`. L04 se descartó al cerrar la Fase 4 (el cupón
por correo pasa a otra tarea).

## PR de `api`

--- INICIO EJEMPLO ---
**feat(api): cupones de descuento**

- El cupón se valida en el servidor, sin mayúsculas ni espacios (L01).
- `total()` aplica el 10 % del cupón de bienvenida y redondea a céntimos (L02).

Cómo probarlo: `npm test`, y un carrito de 20 con BIENVENIDA da 18.
--- FIN EJEMPLO ---

## PR de `web`

--- INICIO EJEMPLO ---
**feat(web): campo del cupón en el carrito**

- El carrito tiene un campo para el cupón; el total lo recalcula la API (L03).

Cómo probarlo: escribir BIENVENIDA en el carrito; el total baja un 10 %.
--- FIN EJEMPLO ---

## Coordinación

El PR de `web` depende del de `api`: se mergea después, o el total no cambiaría al escribir el cupón.

## Validaciones pendientes

Ninguna.
