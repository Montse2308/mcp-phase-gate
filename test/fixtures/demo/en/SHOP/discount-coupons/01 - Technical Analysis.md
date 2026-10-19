# Technical analysis

## What is there

- `shop-api/src/cart.js`: `total(lines)` adds up price × quantity. It knows nothing about discounts.
- `shop-web/src/cart.html`: shows the total the API returns; it has no input field.
- There is no coupon table: it has to be created (for the demo, in memory).

## Risks

- Rounding: 10% off amounts with cents can give three decimals. It is rounded in the API.
- Case and spaces: people type "welcome " with the trailing space they copy from the email.

## Pending validations

None.
