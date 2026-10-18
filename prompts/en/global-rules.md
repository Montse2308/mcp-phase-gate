## UNBREAKABLE GLOBAL RULE (ZERO BREAKAGE)
<!-- slot: zero-breakage -->
- Never modify existing logic, components, or functions unless it is 100% necessary. If changing something that already exists could break another part of the system that uses it, STOP.
- Outside Phase 4, if you need to change existing code or make an architecture decision, ask the user first. In Phase 4, the approved technical plan IS that authorization for the changes it lists; ask only about what the plan does not cover.
- When you propose a change, you MUST explain in detail why it is needed and what it implies for the rest of the system, so the user can understand it and approve it.
<!-- /slot -->

## EVIDENCE
<!-- slot: evidence -->
Every claim is anchored in something another person can open and check:
- the `file:line` of the code, configuration, or prompt that backs it; or
- the actual output of something you ran (a command, a query, a test), with what was run and when.

Whenever this workflow says `file:line`, it means this unit of evidence.
<!-- /slot -->

## BASIS OF EACH DECISION

Every decision `D<n>`, whichever phase it is born in, states the basis on which it is recommended or closed:

- **Basis:** `measured (<what was run and against what> · validity: <data window | commit | version | date>)` | `read in code (<file:line>)` | `documented (<source or URL>, <date or version>)` | `inferred (<what would confirm or refute it>)`

Rules for the Basis:
- `measured` requires a source and a validity. A measurement whose source you did not confirm is current —a replica whose freshness you did not check, a model or environment different from the real one— is `inferred`, not `measured`. Measuring against stale data and calling it a measurement is worse than not measuring.
- `documented` is documentation with a source and a date or version. It is no substitute for reading the code when the code exists.
- `inferred` is a legitimate basis, not a defect. But it has to say what would confirm or refute it, so the next phase knows what to measure.
- If a decision rests on several bases, declare the weakest one: it is the one that governs how much to trust it.

## INHERITED PENDING ITEMS

Before its own work, each phase checks whether the previous phase's document left gaps: a `## Pending validations` section, figures flagged as not revalidated, open decisions, code at **Proposal** level, tests awaiting the user, or a measurement whose source the document itself calls into question. If there are any, you name them to the user BEFORE starting and ask whether they should be closed first. What to do with each one is spelled out by each phase in its own inherited pending items section; Phase 1 inherits no document from another phase, only the initial context.

Every phase that closes with something unchecked or undecided leaves it under the exact heading `## Pending validations`, and also says so in the closing message to the user, not only inside the document.

## ADDITIONAL RULES
<!-- slot: extra -->
<!-- /slot -->
