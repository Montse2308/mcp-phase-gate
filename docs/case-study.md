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

**Sealed receipts written by the server instead of trusting the model.** At first the model drafted each receipt and saved it with `write_central_doc`. One risk was open: the model could write the phase 4 index early and the phase would look closed, with only a prompt line against it. "2026-10-16 — `record_batch` registra cada lote en dos tiempos: antes y después del commit" moved the writing to the server, and "2026-10-16 — Los recibos con ancla quedan sellados y la Fase 4 solo la escribe el servidor" made an anchored receipt immutable except through a re-anchor the user confirms. The stage audit found one more hole: through the confirmation hatch, with `force` set by the model, it could write a "server" receipt sealed with an invented commit. Now whatever enters through the hatch is marked `origen: manual`. Discarded in that entry: a block with no hatch at all, which would leave a task with a damaged receipt stuck.

**Preset per project, not per repository.** The rule is "the presets belong to the project, not to each repo; also, a task can declare its own preset", recorded in "2026-10-15 — Las fases, los prompts y la deducción se resuelven por proyecto…". Per repository looked natural, but a task's documents live in one project folder and a multi-repo task touches several repositories: per-repo presets would hand one task several sets of instructions. The real need, an agent-maintenance task inside a general project, is covered by a preset on the task.

## 4. Security: the path flaw

Version 3 began with a diagnosis of the 2.0 code: nine findings, written up in [`plan-maestro-v3.md`](plan-maestro-v3.md). The four high-severity ones were one flaw: containment was checked as text, and only against the root. `task_name: "../../fuera"` created folders outside the documentation, and so did `project: "../fuera"` with `crear_proyecto`; `file_name: "../otra-tarea/x.md"` left the task without leaving the root, so it passed; a symlink inside the documentation let a call read a repository's `.env` and write outside the base. Another finding let `read_cross_repo` reach a neighbouring repository through `../repoB/.env`.

**Demonstrated.** The six confirmed findings were reproduced against the compiled binary before any fix, then turned into cases of `test/e2e.test.ts`: each starts the compiled server over stdio with the MCP SDK client, makes the hostile call and asserts that the tool returns an error, that the error says why, and that a snapshot of the whole temporary tree is identical before and after.

**Closed.** Every project, task and repository name must be one portable path segment (`validarSegmento`), and containment is checked against the real path, resolving symlinks and junctions (`rutaReal`, `estaDentroReal`). `file_name` is confined to its task, `read_cross_repo` to its repository, and reads stop at 1 MB and refuse binaries.

**The tests today.** `test/e2e.test.ts` has seven path attacks (the six confirmed cases plus `file_path: "PROYECTO-A/CON"`, added by the external audit) and five read attacks (the cross-repo escape, plus an oversized file and a NUL byte against each of the two read tools). `test/paths.test.ts` has 29 names that `validarSegmento` must reject, each its own test, and 25 hostile paths refused by `resolveDocPath`, `resolveTaskFolder` and `resolveRepoPath`. The external audit reported 0 escapes in 273 attack cases, recorded in [`plan-maestro-v3.md`](plan-maestro-v3.md). One risk stays open, and written down: a link swapped between the check and the open would redirect it.

## 5. Version 4: what was redesigned, and why

Version 4 changes what people see and touch, not the engine. The 13 tools, the prompts, the presets, the layers, the on-disk formats and the security model of the Studio are those of 3.2: a diff of `prompts/` and `presets/` between `master` and the integration branch comes out empty. What was wrong in 3.2 sat around the engine.

- **Every view was drawn twice.** The Studio had two modes, Cockpit (a track with traffic lights and SVG seals) and Plain (tables), and a button switched between them. That was two interfaces to maintain and test, and Plain had fewer functions than Cockpit, so keeping it alone would have lost data. Now each view has one structure, and the theme, light or dark, changes only colours. A test compares the DOM tree and the accessibility tree in both themes, in every view, at 1280 and 390 px, so "the theme only changes colours" is proven, not promised.
- **The look is checked, not just chosen.** Inter and JetBrains Mono, one blue accent, a grey background. Colours are named by function (`fondo`, `acento`), not by metaphor, and a test reads the stylesheets: text reaches 4.5:1 over its backgrounds, and the accent and the borders of controls reach 3:1. No state is told by colour alone: each has its own shape and always its text.
- **Configuration was scattered.** The preset lived in the Network, the rules in the Workshop, the clients and the variables in the Lookout, and some settings had no interface at all. Settings, a sixth view, is now the only place where configuration is edited: one page per file, several fields changed together, one diff per file and one Apply. If a file changes on disk under an open draft, the field in conflict is marked and the person chooses, instead of one version silently overwriting the other. The paths of each machine moved out of the client's `env` block into `machine.json` (version 2), and the environment always wins, language included.
- **The public face was a demo and a 1,000-line README.** The root of the site is now a landing page in two languages: the phrase, the two buttons, the five phases, three screenshots and the command. The demo moved to `demo/`, and old links with a hash land on the same view. The media (GIF, video, poster, screenshots and the link-preview image) are generated from the real demo in the Pages workflow and are not stored in git. The READMEs went from 1,002 and 1,046 lines to 105 each, and the detail lives in five twin guides.
- **Results that depended on the machine.** git writes the committer date (`%cI`) differently across versions, which changed the bytes of the exported site. It is now read as Unix seconds (`%ct`) and written in UTC. CI gained macOS, and a job with git 2.43 that checks it.

What I discarded, with the same care as in the earlier versions. Cockpit as a third theme: it would still need its own structure, or be just another palette. Everything in tables: the Network and the phases lose what fits badly in a row, and on a phone cards and expanding rows stack better. Applying settings field by field: three changes to one project were three diffs of the same file, three fingerprints and three writes, and between one and the next the file was no longer the one that had been previewed. Editable advanced variables: changing them from a process that already runs with them doesn't change them for that process.

## 6. How version 4 was audited

Nothing advanced unless another agent audited it against the repository, not against my account of it. The auditor reads the repo and gets a prompt with what the step promised, never my conclusions. It returns a verdict and a table of findings with severity (blocking, important, minor), each with its file and line, its evidence and the change it proposes. A step passes with no blocking finding open and every important one fixed, or accepted with its reason written down. I checked each finding against the repo before applying it, because an auditor also gets things wrong.

It happened at two points:

- **The design, several times before the first line of code.** Among what came back: the integration branch had no protection, and a CI job that claimed to test an old git did not use one, so "git 2.43" could not be checked.
- **Each pull request, before it was merged.** The ones the audit did not approve had one thing in common: my own tests could not see the problem.
  - The date fix was right and tested, but the macOS end-to-end job was red on the last commit, and the pull request proposed making that check optional. The check stayed mandatory.
  - A new test passed alone and failed in the full suite, because it depended on what another spec file had left in the shared server.
  - In the Settings pull request, the mandatory Linux job kept failing because the test of a conflict with the disk never saw the event on Linux. The same audit found that the "verification commands" field trimmed spaces and Enter on every keystroke, which no test noticed because the tests paste the text at once instead of typing it.

A change that only touches comments is proven, not asserted: a script takes two commits and compares the compiled output, the Studio's build and the parsed YAML and JSON, and has to say they are identical. The audits repeated that proof.

For the release itself, the rule is that no `v4.0.0` tag exists while a blocking or important finding is open, and that any visible error on a first-contact surface (the landing page, the README, the About of the repository, the page on npm) counts as important, even if it is a typo.

## 7. What was measured

The 3.2 column was measured by hand on a Windows machine with Node 24.11.0, before 4.0 started. In the 4.0 column, the test and bundle figures come from the CI run of this pull request's last commit, and the landing page and media figures from the manual run of the Pages workflow 41127672319 (it only builds, it doesn't deploy) on commit `5d5ba7c`, this pull request with the same media pipeline. Four figures don't come from CI or a workflow but from a command anyone can run on the same commit, and the table says which: the package, the decision log, the messages and the READMEs.

| Figure | 3.2 | 4.0 | Where the 4.0 figure comes from |
|---|---|---|---|
| Test suite | 1,004 tests: 1,002 pass, 2 skipped | 1,149 tests: 1,147 pass, 2 skipped on Windows; 1,145 pass, 4 skipped on Linux; 0 fail | `npm test`, jobs `build-and-test` of the CI run |
| Studio end-to-end | 51 pass | 269 pass, on each of Linux, Windows and macOS | `npm run test:e2e`, jobs `e2e-studio` of the CI run |
| Studio front-end | 125.76 kB gzip of a 200 kB budget | 161.24 kB gzip of the same budget | `npm run build`, its log in the CI run |
| Package | 183 files, 536.0 kB packed, 1.8 MB unpacked | 137 files, 510.0 kB packed, 1.5 MB unpacked. Before this pull request it was 188 files: the 51 `.d.ts` (263 kB) are left out because it is a CLI with no `types` | command: `npm pack --dry-run` |
| Decision log | 101 entries | 107 entries | command: `node scripts/indice-decisiones.mjs`, which builds the index from them |
| Server messages | 724 codes in Spanish and English, 7 catalogs | 756 codes, 8 catalogs | command: keys of each `TEXTOS_*` object in `build/i18n/textos/*.js` |
| READMEs | 1,002 and 1,046 lines | 105 lines each | command: `wc -l`; in CI, `test/readme.test.ts` fails above 200 |
| Landing page, first load with its three screenshots | there was none | 245,555 bytes in English, 250,551 in Spanish, of a 300,000 budget | job `ensamblar` of the Pages run, which fails above the budget |
| Link-preview image, 1200 × 630 | there was none | 107,111 bytes (English) and 113,350 (Spanish), PNG | job `capturas` of the Pages run; GitHub accepts up to 1 MB |
| Video | 41.3 s and 42.4 s; MP4 of 1.52 MB each | 41.6 s (English) and 41.7 s (Spanish); MP4 of 1,100,799 and 1,154,349 bytes | `medios.json` of the Pages run |
| GIF of the README | 42 s, 4.93 MB and 4.72 MB, at 8 fps and 760 px | 21.8 s (English) and 21.9 s (Spanish), 2,305,855 and 2,235,759 bytes, at 10 fps and 840 px; budget 2,621,440 (2.5 MiB) | `medios.json` of the Pages run |

The demo, counted by generating it in both languages and listing receipt files and each repository's `git rev-list --count HEAD`: three projects, two git repositories with six real commits, and eight receipts. Six are sealed (four to a commit, two to a sha256), one was discarded with a note, one waits for its commit.

## 8. What I would do differently

- **Separate contract strings from prose on day one.** Planning the English version, I found the code depended on eleven families of Spanish texts: headings it searches for, receipt keys, the phrases that mean "empty". Translating one prompt without a vocabulary module would have silently broken the pending-items warning.
- **Give every message a code from the start.** The bilingual catalog arrived in the last stage and holds 756 codes today. To avoid changing more than a hundred function signatures, the language now travels in a per-call context. It works; I would rather not have needed it.
- **Let the server write phase 4 from the first version.** For three stages receipts were the model's job, guarded only by prompt lines.
- **Cut the demo to the GIF budget.** In 3.2, at 12 fps and 960 px the 42-second GIF passed 7 MB, and it fit 5 MB only at 8 fps and 760 px. In 4.0 the GIF is a 22-second cut of the video, under 2.5 MiB. The MP4 is the sharp version.
- **Measure from the pipeline from the start.** Half of the 3.2 table was measured by hand on my machine. In 4.0 each figure names the CI job, the workflow or the command it comes from, so anyone can derive it again and I don't have to remember it.
