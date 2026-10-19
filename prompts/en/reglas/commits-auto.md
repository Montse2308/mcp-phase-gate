Variant of the `commits: auto` rule. It is enabled by `reglas.commits` in the project's
phase-gate.json, or by the preset frontmatter. Text outside the blocks never reaches the model.

<!-- block: phase-4/commits -->
Policy: **the agent makes the commit as soon as the batch passes its verification**, without waiting for an OK.

**Before the phase's first commit**, check which branch you are on (`git branch --show-current`)
and compare it with the branch the plan declares. If it does not match, or if it is the
repository's main branch and the plan does not say to work there, stop and ask the user. Do not
switch branches yourself.

1. Only if the batch ended up with `estado: verified`. With any other status there is no commit and
   you stop to ask.
2. `git add` with the exact list of the batch's files, one by one —never `git add -A`,
   `git add .`, `git add -u`, a whole folder or `git commit -a`— and `git commit` with the message
   from the "Proposed commit" column.
3. If a hook fails or a passphrase is requested, stop and tell the user. Never use `--no-verify` or
   `--amend`.
4. After the commit, anchor the batch with `record_batch` (`lote` and `commit`).
5. Announce the commit in one line when opening the next batch. The stop after each batch goes
   away: if there are tests awaiting the user, they pile up in the receipts and in the index.

Never `push`, do not create or switch branches, and do not open a PR.
<!-- /block -->

<!-- block: phase-4/forbidden-commits -->
- Committing a batch that did not end up `verified`; with `git add -A`, `git add .`, `git add -u`, a whole folder or `git commit -a`; or with `--amend`.
- Making the first commit without having checked the branch, or on the main branch without the plan or the user saying so.
<!-- /block -->

<!-- block: phase-4/self-check-commits -->
14. Was every commit from a verified batch, did it carry only its batch's files, and was there no push at all?
15. Did I check the branch before the first commit, and did it match the plan's?
<!-- /block -->
