---
batches: 3
---
# Technical plan

| Batch | Repo | Goal | Steps | Exit criterion | Proposed commit | Reverts alone |
|---|---|---|---|---|---|---|
| L01 | api | Free shipping threshold | `src/shipping.js` with `THRESHOLD` and `shipping()` | `npm test` green | `feat(api): free shipping from 50` | no (L02 and L03 use it) |
| L02 | web | Notice of how much is left for free shipping | notice in `src/cart.html` | manual check | `feat(web): show how much is left for free shipping` | yes |
| L03 | api | Shipping in the order summary | `src/order.js` adds `shipping()` | `npm test` green | `feat(api): include shipping in the order summary` | yes |

## Pending validations

None.
