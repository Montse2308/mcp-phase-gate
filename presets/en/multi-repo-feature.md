---
name: multi-repo-feature
description: A requirement that changes several repositories at once, with contracts between them.
batches: true
commits: agente-commitea-con-OK
---

mcp-phase-gate preset for a requirement that spans several repositories. Declare the repos in the
project's phase-gate.json (`repos`) and, if you want one PR per repo, `fase5.prPorRepo`. Every block
is added to its slot (`after`): none of them removes anything from the factory flow. Text outside
the blocks never reaches the model.

<!-- block: phase-1/verification | after -->
In a multi-repository task, the code map says which repository each piece lives in
(`repo:file:line`) and names the **contracts** between them: endpoints, payloads, events,
shared schemas, environment variables. A contract that changes is a high-severity finding
even when the code on each side is trivial.
<!-- /block -->

<!-- block: phase-3/checks | after -->
In this task, also check **every contract between repositories** against both sides: what one
sends and what the other expects, field by field, and which version of each side is deployed.
<!-- /block -->

<!-- block: phase-3/batches | after -->
**Order across repositories.** A contract change is made in batches that never leave the two
sides incompatible: first the side that accepts both the old and the new, then the one that
starts using the new, and last, if needed, the one that stops accepting the old. The plan
always includes the **Deployment note** section with the order in which each repository is
deployed and what happens if one is deployed without the other.
<!-- /block -->

<!-- block: phase-5/pr | after -->
**Several repositories.** Deliver **one PR description per repository**, each one following the
contract above and inside its own four-backtick block, headed by the repository id. Then,
outside the blocks, a **coordination note**: which PR is merged first, which PR depends on which,
and the deployment order. The audit also checks that every contract stays compatible under
every possible deployment order.
<!-- /block -->
