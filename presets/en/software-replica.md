---
name: software-replica
description: Existing code with no test suite, with read-only access to a data replica to measure and compare parity.
batches: true
commits: agente-commitea-con-OK
---

mcp-phase-gate preset. This is the 2.2.0 flow: existing code with no test suite and a read-only data
replica, where measuring before and after takes the place of tests. Each block puts back into its
slot the content that slot had in 2.2.0; on the Spanish twin (presets/es/) this is checked byte for
byte by the golden test, test/oro.test.ts. Text outside the blocks never reaches the model.

<!-- block: phase-1/verification -->
If a hypothesis can be checked by running something, **run it now** and report the real
output: a query against a read-only replica, a framework console session, pulling an
earlier version of a file with `git show` to compare behaviours, a timed measurement.
<!-- /block -->

<!-- block: phase-2/verification -->
Before accepting a decision, check whatever can be checked: queries against a read-only
replica, reading the framework's code, sweeps across the project looking for other
consumers, real volume counts.
<!-- /block -->

<!-- block: phase-3/checks -->
Before writing the first step, check against the real code what the plan takes for granted:
that the identifier you are going to use is free, that the method exists with that
signature, that the language key does not already exist, that the relation loads what you
think it loads, whether or not the table is in the schema dump.
<!-- /block -->

<!-- block: phase-3/tests -->
If the project has no automated test suite set up, **do not invent a tests section or propose
writing the module's first test**. Say so in one line when it is relevant and move on. If a
suite already exists in the repository, you must run it: the plan says which command and what
it must return, in each batch's exit criterion.

What does exist is read-only access to a replica. When the change alters what a report or an
export shows, the plan defines the comparison:

- What is dumped before and what after, and over which data range.
- The matrix of combinations to cover: no filters, each filter on its own, two
  combined. The filters the change touches are the ones that matter most.
- **The criterion for each comparison**, which is not always the same:
  - If the change is performance only: **zero differences**. A single difference sinks it.
  - If the change alters data on purpose: **every difference has to fit in a list written
    in advance**. Anything outside that list is a defect, not an improvement.
- If the dump goes to a file, say it is not committed: it carries customer data.

If there is no suite, it is forbidden to invent an automated tests section or to propose
writing the module's first test as part of this task.
<!-- /block -->

<!-- block: phase-4/verification -->
Syntax check, linter, framework console, queries against the read-only replica,
comparison of the generated SQL before and after, counts, timed measurements.
<!-- /block -->

<!-- block: phase-4/tests -->
If the project has no automated test suite set up, do not invent a tests section or propose
writing the module's first test as part of this task; if it is relevant, one line and move
on. If a suite already exists in the repository, you must run it, and its result goes, with
numbers, in the batch's verification.
<!-- /block -->
