Variant of the no-batches rule. It is enabled by `reglas.lotes: false` in the project's
phase-gate.json, or by `batches: false` in the preset frontmatter. Text outside the blocks never
reaches the model.

<!-- block: phase-3/batches -->
This project does not work in batches. The plan has no batch table, but it does carry the
frontmatter `batches: 1`, so Phase 4 knows it has a single batch:

```markdown
---
batches: 1
---
```

The exit criterion and the proposed commit appear only once, at the end of the plan.
<!-- /block -->

<!-- block: phase-3/forbidden-batches -->
- Writing the plan without the `batches: 1` frontmatter.
<!-- /block -->

<!-- block: phase-3/self-check-batches -->
12. Does the document start with the `batches: 1` frontmatter?
<!-- /block -->

<!-- block: phase-4/batches | after -->
The plan has a single batch (`batches: 1`). Follow the same cycle just once; when you anchor it,
the server turns its receipt into the phase document.
<!-- /block -->
