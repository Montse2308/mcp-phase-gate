Variant of the `commits: agente-propone` rule. It is enabled by `reglas.commits` in the project's
phase-gate.json, or by the preset frontmatter. Text outside the blocks never reaches the model.

<!-- block: phase-4/commits -->
Policy: **the agent proposes the commit; the user makes it.**

Before proposing the phase's first commit, check which branch you are on
(`git branch --show-current`) and warn the user if it does not match the plan's or if it is the
repository's main branch.

When a batch's verification and recording are closed (with the commit pending):
1. Show the user the exact list of the batch's files and the commit message (the one in the
   plan's "Proposed commit" column, adjusted if the batch changed), ready to copy:
   `git add <file>` one by one and `git commit -m "<message>"`.
2. When the user gives you the hash, call `record_batch` with `lote` and `commit`. If they decide
   not to make the commit, ask them whether the batch is discarded; if so, record it again with
   `estado: discarded` and the reason why.

Do not run `git add`, `git commit`, `push`, or switch branches.
<!-- /block -->

<!-- block: phase-4/forbidden-commits -->
- Running `git add`, `git commit` or `git push`: under this policy the user makes the commit from your proposal.
- Proposing the first commit without having checked the branch.
<!-- /block -->

<!-- block: phase-4/self-check-commits -->
14. Did I propose each commit with the exact list of its batch's files, without running `git add` or `git commit`, and did I anchor the batch when the user gave me the hash?
15. Did I warn the user if the branch did not match the plan's or was the main one?
<!-- /block -->
