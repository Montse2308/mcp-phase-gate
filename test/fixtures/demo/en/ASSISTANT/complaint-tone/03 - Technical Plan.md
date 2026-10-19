---
batches: 2
---
# Technical plan

No git: the agent's prompt and configuration are sealed with their sha256.

| Batch | Repo | Goal | Steps | Exit criterion | Proposed commit | Reverts alone |
|---|---|---|---|---|---|---|
| L01 | agent | Tone for complaints | complaints section in `prompt.md` | 9-case suite | — | yes |
| L02 | agent | Lower temperature for complaints | `temperature` in `config.json` | suite, 5 times | — | yes |

## Pending validations

None.
