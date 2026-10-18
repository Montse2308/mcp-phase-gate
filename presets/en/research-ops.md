---
name: research-ops
description: Technical research and operations; the deliverable is a report or a runbook, not code.
batches: true
commits: ninguno
---

mcp-phase-gate preset for technical research and operations. There are no commits per batch
(`commits: ninguno`), but batches still order the work and leave receipts. Text outside the
blocks never reaches the model.

<!-- block: global/evidence -->
Every claim is anchored in something another person can open and check:
- a source with its URL or reference, its date and, where it applies, its version; or
- the real output of something you ran, with the exact command, the environment and when it ran.

An undated source counts as `inferred`. When this flow says `file:line`, it means this unit of
evidence.
<!-- /block -->

<!-- block: phase-1/verification -->
If a claim can be checked by running something (a command, a query, a small experiment),
**run it now** and save the output with the exact command. If it depends on an external
source, cite it with URL and date, and look for a second, independent source when the
conclusion depends on it.
<!-- /block -->

<!-- block: phase-3/tests -->
Each batch's exit criterion is **reproducibility**: the exact commands or steps, the
environment and the input data with which another person would get the same result. A
result that cannot be reproduced from what is written is not accepted.
<!-- /block -->

<!-- block: phase-4/verification -->
Run the batch's steps exactly as written, save each output with the command and the date,
and note any difference in environment from what was planned.
<!-- /block -->

<!-- block: phase-5/pr -->
This phase's deliverable is a **report** (or a runbook, if the task was operational), not a
PR description:

1. **Conclusion** on the first line, with its number if there is one.
2. **Findings**, each with its evidence (source with URL and date, or command with its output).
3. **How to reproduce it**: commands, environment and data.
4. **What could not be confirmed**, and what would confirm it.
5. **Recommendation**, marked as such.

It goes inside a single four-backtick block tagged `markdown`, so it can be copied raw.
<!-- /block -->
