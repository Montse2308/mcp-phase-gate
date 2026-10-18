Variant of the `commits: ninguno` rule. It is enabled by `reglas.commits` in the project's
phase-gate.json, or by the preset frontmatter (for example, `research-ops`). Text outside the
blocks never reaches the model.

<!-- block: phase-4/commits -->
Policy: **no per-batch commits.** The user decides when and how things get versioned.

When recording the batch, pass `artifact_path` or `verification_note`; there is no commit to anchor.
Stop when closing each batch, just as if there were a commit, so the user can review and test
before the next one. Do not run any git command that writes.
<!-- /block -->

<!-- block: phase-4/forbidden-commits -->
- Running git commands that write (`git add`, `git commit`, `git push`…): under this policy there are no per-batch commits.
<!-- /block -->

<!-- block: phase-4/self-check-commits -->
14. Did I stop when closing each batch so the user could review, without running any git command that writes?
<!-- /block -->
