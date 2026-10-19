# Decisions

| ID | Decision | Basis |
|---|---|---|
| D1 | The coupon is validated on the server, never only in the browser | read in code |
| D2 | The code is compared ignoring case and surrounding spaces | inferred |
| D3 | The discount is rounded to cents in `total()` | read in code |
| D4 | The emailed coupon is left out of this task if it needs the email service | documented |

## Pending validations

None.
