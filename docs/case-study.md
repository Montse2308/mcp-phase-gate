# Case study: mcp-phase-gate

*In Spanish: [caso-de-estudio.md](caso-de-estudio.md).*

## 1. The problem

An invented but typical example. A team maintains an online shop's backend. A ticket says customers with a coupon are sometimes charged shipping twice. I hand it to an AI coding agent. A minute later it has edited the checkout function, added a passing test and reported the job done. It never read the second service that also computes shipping, never asked whether a coupon should combine with free shipping (a business decision), and recorded nothing it checked. Two weeks later someone asks why shipping changed. The reasoning lived in a chat that is gone.

That is not a bad model. A chat is a poor place to keep decisions, and an agent left alone optimises for code.

mcp-phase-gate is an MCP server that puts five phases between the ticket and the pull request: discovery, decisions, technical plan, execution, audit. Each phase leaves a document in a central folder, a gate sits between phases, phase 2 stops until a person answers, and phase 4 runs in batches that the server records.

## 2. Three design ideas

**The disk is the truth.** The phase of a task is stored nowhere: it is deduced from which documents exist in its folder, because each phase prompt declares its document's name. Delete a bad `02 - Decisions.md` and the task is back in phase 2, with nothing to resynchronise. The same rule resolves a project's language when no manifest declares one: the documents on disk count before the machine's settings.

**The server enforces what the prompt promises.** A model can ignore "don't skip phases". So the code checks: asking for phase 4 without phase 3's document puts a gate warning on top of the prompt; `write_central_doc` refuses to rewrite a frozen phase's document unless the user confirms; pending items left in the previous document are found by reading its headings.

**Nothing is written without verification.** In phase 4 the model passes fields to `record_batch`. The server validates the hash format before git sees it, checks that the commit is on the current branch, compares the files it touches with the ones declared, then writes and seals the receipt. Without git, it seals the artifact's sha256.

## 3. Three decisions and what I discarded

Every entry in [`decisiones.md`](decisiones.md) records the alternative it rejected.

**Deducing the phase instead of storing it.** "2026-08-08 — La fase de cada tarea se deduce de sus documentos, no se guarda". The original issue asked for a task registry holding the phase. I dropped it when I saw that `get_phase_prompt` would need the project and task just to record progress: the data would be true only while the model didn't get distracted, and a task could say phase 2 while being in phase 4. One accepted limit, that renaming a document makes old tasks look less advanced, came back with English, whose document names differ. That is why a project's language is resolved from its existing documents first: otherwise a Spanish project opened on an English machine would look empty.

**Sealed receipts written by the server instead of trusting the model.** At first the model drafted each receipt and saved it with `write_central_doc`. The plan carried an open risk (E1-R3): the model could write the phase 4 index early and the phase would look closed, with only a prompt line against it. "2026-10-16 — `record_batch` registra cada lote en dos tiempos: antes y después del commit" moved the writing to the server, and "2026-10-16 — Los recibos con ancla quedan sellados y la Fase 4 solo la escribe el servidor" made an anchored receipt immutable except through a re-anchor the user confirms. The stage audit found one more hole: through the confirmation hatch, with `force` set by the model, it could write a "server" receipt sealed with an invented commit. Now whatever enters through the hatch is marked `origen: manual`. Discarded in that entry: a block with no hatch at all, which would leave a task with a damaged receipt stuck.

**Preset per project, not per repository.** Decision F1 of Stage 3 in the plan: "the presets belong to the project, not to each repo; also, a task can declare its own preset", implemented by "2026-10-15 — Las fases, los prompts y la deducción se resuelven por proyecto…". Per repository looked natural, but a task's documents live in one project folder and a multi-repo task touches several repositories: per-repo presets would hand one task several sets of instructions. The real need, an agent-maintenance task inside a general project, is covered by a preset on the task.

## 4. Security: the path flaw

Version 3 began with a diagnosis of the 2.0 code: nine findings, S1 to S9 (§2.1 of [`plan-maestro-v3.md`](plan-maestro-v3.md)). The four high-severity ones were one flaw: containment was checked as text, and only against the root. `task_name: "../../fuera"` created folders outside the documentation (S1), and so did `project: "../fuera"` with `crear_proyecto` (S2); `file_name: "../otra-tarea/x.md"` left the task without leaving the root, so it passed (S3); a symlink inside the documentation let a call read a repository's `.env` and write outside the base (S4). S5 let `read_cross_repo` reach a neighbouring repository through `../repoB/.env`.

**Demonstrated.** The six confirmed findings were reproduced against the compiled binary before any fix, then turned into cases of `test/e2e.test.ts`: each starts the compiled server over stdio with the MCP SDK client, makes the hostile call and asserts that the tool returns an error, that the error says why, and that a snapshot of the whole temporary tree is identical before and after.

**Closed.** Every project, task and repository name must be one portable path segment (`validarSegmento`), and containment is checked against the real path, resolving symlinks and junctions (`rutaReal`, `estaDentroReal`). `file_name` is confined to its task, `read_cross_repo` to its repository, and reads stop at 1 MB and refuse binaries.

**The tests today.** `test/e2e.test.ts` has seven path attacks for S1 to S4 (the six numbered cases plus `file_path: "PROYECTO-A/CON"`, added by the external audit) and five read attacks for S5 and S9 (the cross-repo escape, plus an oversized file and a NUL byte against each of the two read tools). `test/paths.test.ts` has 29 names that `validarSegmento` must reject, each its own test, and 25 hostile paths refused by `resolveDocPath`, `resolveTaskFolder` and `resolveRepoPath`. The external audit reported 0 escapes in 273 attack cases (§9.6 of the plan). One risk stays open, and written down: a link swapped between the check and the open would redirect it.

## 5. What was measured

On my Windows machine, Node 24.13.1.

| Figure | Value | How |
|---|---|---|
| Test suite | 992 tests: 990 pass, 2 skipped | `npm test` |
| Studio end-to-end | 51 pass | `npm run test:e2e` |
| Decision log | 99 entries | lines starting with `## 20` in `docs/decisiones.md` |
| Server messages | 700 codes in Spanish and English, 7 catalogs | keys of each `TEXTOS_*` object in `build/i18n/textos/*.js`; `grep -E '^  "[^"]+": \{' src/i18n/textos/*.ts` agrees |
| Package | 532.2 kB packed, 1.7 MB unpacked, 185 files | `npm pack --dry-run`, with this documentation |
| Studio front-end | 125.56 kB gzip of a 200 kB budget | `npm run build` |
| Whole demo | 6.4 s Spanish, 5.8 s English | `generarDemo`, timed with `Date.now()` |
| Demo media | videos of 41.3 s and 42.4 s; MP4 1.52 MB each; GIF 4.93 MB and 4.72 MB at 8 fps, 760 px | `scripts/medios.mjs` and its `medios.json` (Spanish, then English) |

The demo, counted by generating it in both languages and listing receipt files and each repository's `git rev-list --count HEAD`: three projects, four tasks, two git repositories with six real commits, and eight receipts. Six are sealed (four to a commit, two to a sha256), one was discarded with a note, one waits for its commit.

## 6. What I would do differently

- **Separate contract strings from prose on day one.** Planning the English version, I found the code depended on eleven families of Spanish texts: headings it searches for, receipt keys, the phrases that mean "empty". Translating one prompt without a vocabulary module would have silently broken the pending-items warning.
- **Give every message a code from the start.** The bilingual catalog arrived in the last stage and holds 700 codes. To avoid changing more than a hundred function signatures, the language now travels in a per-call context. It works; I would rather not have needed it.
- **Let the server write phase 4 from the first version.** For three stages receipts were the model's job, guarded only by prompt lines.
- **Cut the demo to the GIF budget.** At 12 fps and 960 px the 42-second GIF passed 7 MB; it fits 5 MB only at 8 fps and 760 px. The MP4 is the sharp version.
- **Close what is still open.** The README's client matrix still says "to be verified", and my file-by-file review of the English prompts is recorded as pending.
