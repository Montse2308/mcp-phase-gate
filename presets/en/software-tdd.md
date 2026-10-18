---
name: software-tdd
description: Code with a test suite; every batch starts with a failing test.
batches: true
commits: agente-commitea-con-OK
---

mcp-phase-gate preset for test-first work. It replaces the testing policy of the plan (Phase 3)
and of the execution (Phase 4). Text outside the blocks never reaches the model.

<!-- block: phase-3/tests -->
This project works test-first. **Every batch that changes behaviour starts with a test that
fails today** and will pass once the batch is done. The plan states, for each batch:

- the new or modified test: file, name, and which existing test it is modelled on;
- the exact command that runs it;
- what it must return BEFORE the change (red, with which failure) and AFTER (green);
- which other tests must stay green.

A batch that only reorganises code without changing behaviour gets no new test: its exit
criterion is that the full suite stays green, and it says so.
<!-- /block -->

<!-- block: phase-4/tests -->
Cycle per batch, in this order, reporting each step with its real output:

1. **Red:** write the batch's test and run it. It must fail, and for the reason the plan
   gives. If it passes with no changes, or fails for another reason, stop: the test does not
   test what you think it does.
2. **Green:** implement the minimum needed for it to pass. Run it.
3. **Suite:** run the full suite. No test that was green may end up red.
4. **Cleanup:** if you refactor, the suite is still green afterwards.

The batch receipt carries the four outputs, with numbers. The new test goes in the same
commit as the code that makes it pass.
<!-- /block -->
