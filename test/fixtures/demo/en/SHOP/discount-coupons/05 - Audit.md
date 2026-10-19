# Audit / Pre-PR

Commits audited: L01 and L02 in `api`, L03 in `web`. L04 was discarded when Phase 4 was closed (the
emailed coupon moves to another task).

## PR for `api`

--- BEGIN EXAMPLE ---
**feat(api): discount coupons**

- The coupon is validated on the server, ignoring case and spaces (L01).
- `total()` applies the 10% of the welcome coupon and rounds to cents (L02).

How to test it: `npm test`, and a cart of 20 with WELCOME gives 18.
--- END EXAMPLE ---

## PR for `web`

--- BEGIN EXAMPLE ---
**feat(web): coupon field in the cart**

- The cart has a field for the coupon; the API recalculates the total (L03).

How to test it: type WELCOME in the cart; the total drops by 10%.
--- END EXAMPLE ---

## Coordination

The `web` PR depends on the `api` one: it is merged after it, or the total would not change when the
coupon is typed.

## Pending validations

None.
