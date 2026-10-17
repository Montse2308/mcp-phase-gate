---
lotes: 4
---
# Plan técnico

Cuatro lotes: dos en la API, uno en la web y el cupón por correo al final, para poder dejarlo
fuera si hace falta (D4).

| Lote | Repo | Objetivo | Archivos | Verificación | Commit propuesto |
|---|---|---|---|---|---|
| L01 | api | Validar el cupón | `src/cupones.js` | `npm test` | `feat(api): validar el código del cupón` |
| L02 | api | Aplicar el descuento al total | `src/carrito.js` | `npm test` | `feat(api): aplicar el descuento del cupón al total` |
| L03 | web | Campo del cupón en el carrito | `src/carrito.html` | revisión manual | `feat(web): campo para escribir el cupón en el carrito` |
| L04 | api | Cupón por correo | `src/correo.js` | `npm test` | `feat(api): mandar el cupón de bienvenida por correo` |

## Validaciones pendientes

Ninguna.
