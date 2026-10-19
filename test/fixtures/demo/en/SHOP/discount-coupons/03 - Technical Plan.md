---
batches: 4
---
# Technical plan

Four batches: two in the API, one in the web and the emailed coupon last, so it can be left out
if needed (D4).

| Batch | Repo | Goal | Steps | Exit criterion | Proposed commit | Reverts alone |
|---|---|---|---|---|---|---|
| L01 | api | Validate the coupon | `src/coupons.js` with `validate()` | `npm test` green | `feat(api): validate the coupon code` | no (L02 imports it) |
| L02 | api | Apply the discount to the total | `total()` in `src/cart.js` takes the coupon | `npm test` green | `feat(api): apply the coupon discount to the total` | yes |
| L03 | web | Coupon field in the cart | field in `src/cart.html` | manual check | `feat(web): field to enter the coupon in the cart` | yes |
| L04 | api | Emailed coupon | `src/email.js` | `npm test` green | `feat(api): send the welcome coupon by email` | yes |

## Pending validations

None.
