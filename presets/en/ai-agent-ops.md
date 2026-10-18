---
name: ai-agent-ops
description: Maintenance of AI agents, system prompts, skills, automation flows and MCP servers.
batches: true
commits: agente-commitea-con-OK
---

mcp-phase-gate preset for maintaining an AI agent: its evidence is the exact block of prompt,
configuration, tool or flow, plus the real transcript; its verification, a battery of golden, edge
and adversarial cases; and its close, a behaviour-regression audit with the version record. Text
outside the blocks never reaches the model.

<!-- block: global/zero-breakage | after -->
- In an agent, "breaking" also means changing its behaviour outside the scope: the format
  of its answers, its tone, the tools it may use, its safety limits and what it promises
  its users. Those global constraints of the agent are not touched unless the task is
  precisely to change them, and then you say so.
<!-- /block -->

<!-- block: global/evidence -->
Every claim is anchored in something another person can open and check:
- the `file:line` or the exact block of the prompt, configuration, skill, tool or flow
  that backs it; and
- for the agent's behaviour, a **real transcript or log** with its date, the model and its
  version, and the environment it ran in.

A behaviour that is not in a transcript is not claimed: it is put to the test.
When this flow says `file:line`, it means this unit of evidence.
<!-- /block -->

<!-- block: phase-1/verification -->
If a hypothesis about the agent's behaviour can be checked, **check it now**: reproduce it
with a controlled run or a dry run, with the exact input, and save the transcript with date,
model and environment. To compare with how it behaved before, pull the earlier version of
the prompt or configuration with `git show` or from its version history. Behaviour described
from memory is not a diagnosis.
<!-- /block -->

<!-- block: phase-2/verification -->
Before accepting a decision, check: which other parts of the agent depend on the block that
would be touched (other instructions, skills, tools, flows that call it), which real use cases
go through it, and whether the decision clashes with any global constraint of the agent.
<!-- /block -->

<!-- block: phase-3/checks -->
Before writing the first step, check what the plan takes for granted: that the prompt or
configuration block you are going to change is the one actually loaded (and not an unused
copy), which other instructions contradict or reinforce it, which tools and permissions the
agent has today, and which real use cases pass through there.
<!-- /block -->

<!-- block: phase-3/tests -->
An agent's verification is a **battery of cases**, defined here before touching anything:

| # | Type | Input | Expected output | Constraint it guards |
|---|---|---|---|---|

- **Golden:** the real use cases that must keep working exactly the same.
- **Edge:** unusual but legitimate inputs.
- **Adversarial:** attempts to push the agent outside its constraints (format, tone, allowed
  tools, safety).

Each batch says which cases of the battery it tests. The exit criterion is the table
`Input | Output before | Output after` with no regressions in the golden cases and with the
global constraints intact in all of them.
<!-- /block -->

<!-- block: phase-4/verification -->
Run the plan's battery (or the dry run, if running for real has side effects) **before and
after** the change, with the same input, the same model and the same configuration except for
what the batch changes. Save the transcripts with date, model and environment.
<!-- /block -->

<!-- block: phase-4/tests -->
Each batch's receipt carries the table `# | Input | Output before | Output after | Verdict`
for the cases it ran, with the verdict in one word (same, better, regression), and one line
per global constraint checked. A regression in a golden case leaves the batch `failed`. If a
case could not really be run and was simulated, say so in that row.
<!-- /block -->

<!-- block: phase-5/pr | before -->
**This preset first delivers a behaviour-regression audit**, and then, only if the changes
live in a repository with a PR, the PR description following the contract below.

The regression audit goes like this:
1. **Verdict** on the first line: no regressions, or how many and in which cases.
2. **Full battery table**: `# | Type | Input | Before | After | Verdict`.
3. **Global constraints**: one line per constraint, with its evidence.
4. **Version record**: which prompt, configuration, skill or flow changed; previous and new
   version (hash, date or tag); and, in two sentences, what changes for whoever uses the agent.

If there is no repository and no PR, the delivery ends here and the phase document carries the
audit and the version record.
<!-- /block -->
