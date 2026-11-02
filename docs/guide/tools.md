# Tools and resources

What the server exposes to your client and how it behaves: the gate between phases, `record_batch` and its receipts, the protected documents, the 13 tools, the `phase-gate://` resources, how a project and its repos are found, and the contract of the phase 5 PR description. To install it, see [Installation](installation.md).

## The gate: skipping a phase stops being invisible

Ask for a phase ahead of the one you're on and the prompt arrives with a warning on top (in the project's language):

```
## ATTENTION — PHASE GATE

You asked for Phase 4, but task "login-sso" does not have the documents of earlier phases:

- Phase 3: `03 - Technical Plan.md` is missing

This task is in Phase 3 (Technical Plan). Do NOT do the work of Phase 4 on documents that do not exist,
and do not make them up from the chat context.

Tell the user before anything else and ask whether they prefer to do the missing phase first or continue
anyway. What follows is the prompt of the phase you asked for: apply it only after resolving this with the user.
```

**It warns, it doesn't block.** The prompt is still delivered, so the day you want to skip a phase deliberately on a trivial change, you can. What changed is that it no longer goes unnoticed.

Three things it deliberately does **not** do:

- **It doesn't get in the way of going back.** On Phase 5 and asking for Phase 2 to fix decisions isn't skipping anything, and it stays quiet. It only looks for gaps behind you.
- **It doesn't make you type anything extra.** You still type `/f4` and nothing else. Working out which task you mean is the server's job, using the pointer it already keeps — not the model asking you.
- **It doesn't go quiet when it can't check.** If several projects have an active task and none was named, it says so instead of pretending everything is in order.

**It also flags what the previous phase left open.** If the previous phase's document has a `## Pending validations` section with something in it, or if, when asking for phase 5, some batch receipt ended up `with pending items`, `failed` or `discarded`, the prompt also arrives with a `## INHERITED PENDING ITEMS (detected by the server)` block naming them, so the AI tells you before starting. A section that only says "None." doesn't count. It doesn't block anything either: it only points at what the prompt already required writing. (In a Spanish project: `## Validaciones pendientes`, `con pendientes`, `fallido`, `descartado`, `PENDIENTES HEREDADOS` and "Ninguna.".)

## Phase 4 with the server: `record_batch`

Since 3.0 the AI no longer drafts the receipts or the phase 4 document: it hands the server the data of each batch, and the server writes the receipt, checks the commit against git and closes the phase when the last batch is anchored.

**Each batch, before and after the commit** (with the default policy):

1. `get_batch_status` says which batch is next and whether one is waiting for its commit.
2. The AI implements the batch and verifies it by running things.
3. **Before the commit**, `record_batch` with the batch's content: title, status, what was done, files, verification, what's waiting for you, deviations and decisions. The receipt is left with the commit pending; if the chat drops here, it already says what was done and what was checked.
4. It shows you the files and the message, and commits with your OK.
5. **After the commit**, `record_batch` with `lote` and `commit`. The server checks that the commit exists, that it's on the current branch and which files it touches. If they aren't the ones the receipt declares, it writes that down in the receipt (it's a warning, not a block).
6. When the last batch is anchored, the server generates `04 - Execution.md` and the phase is closed.

**Anchors**, what proves a batch was done:

| Anchor | When | What the server checks |
|--------|------|------------------------|
| `commit` | The batch has git and the policy isn't `ninguno` | That the hash (7 to 40 hex characters, validated before calling git) is a commit on the current branch, and which files it touches |
| sha256 (`artifact_path`) | No git, or the `ninguno` policy: the file that changed | Its sha256, inside the repo or the project's folder, never under `.git`, up to 256 MB |
| note (`verification_note`) | Nothing to seal, or a failed or discarded batch | Nothing: it's written down |

**Sealed receipts and `reanclar`.** A receipt anchored to a `commit` or a sha256 is **sealed**: `record_batch` won't rewrite it. If a rebase or a squash changed the SHAs, `get_batch_status` with `reverificar: true` (or `doctor --reverificar`) marks the anchor as no longer valid, and the AI changes it with `record_batch` (`lote`, `reanclar: true` and the new `commit`). The server **asks you** "Receipt L02 is sealed with commit `a1b2c3d`. Replace its anchor with `e4f5a6b`?" (without direct confirmations, the AI needs your OK in the chat and `force`). Only the anchor changes: the batch's content isn't touched, and "Commit check" keeps the history. It also works with the phase already closed, and the index is rebuilt.

**With a single batch**, its receipt lives in `04 - Execution/` while it's open, so the phase doesn't show as closed with the commit pending; when it's anchored, the server moves it to `04 - Execution.md` and a single file is left. **To close without doing every batch**, if you decide so: `record_batch` with `cerrar_fase: true` and `motivo_descarte`. Batches without a receipt are discarded, failed ones stay as they are, and the server asks for your confirmation before writing anything. If you decide not to commit a batch that's already recorded, the AI closes it with `record_batch`, `lote`, `estado: discarded` (or `descartado`) and a note, without writing its content again.

**Phase 5 gets the commits already verified.** When you ask for phase 5, the prompt ends with "PHASE 4 COMMITS": for each repo, its commits with their subject, whether they're still on the branch, and the exact range to audit them if they're consecutive. If an anchor no longer matches the branch, it says so, so the AI warns you before auditing.

**2.x tasks halfway through.** They keep working: `record_batch` reads the receipts the AI wrote by hand (it marks them as `manual`) and carries on from the next batch, and a manual receipt with a hash counts as sealed. If the plan doesn't declare `lotes: N` (`batches: N` in English) in its frontmatter, `record_batch` asks for it before the first receipt (if there are receipts already, the plan is frozen and adding it needs your confirmation). What you can no longer do is write receipts or the phase 4 document with `write_central_doc` ([see below](#protected-documents)).

## Protected documents

Each phase works on top of the previous phases' documents, so rewriting one that's already been passed silently changes the basis of everything that came after. That's why `write_central_doc` refuses, **without `force: true`**, to write:

- **The initial context** (`00 - Initial Context.md`), always, even to create it. Only `start_task` writes it without `force`.
- **The receipts and the phase 4 document**, always, even to create them: `record_batch` writes them. The confirmation is there to repair a damaged file by hand, and `get_batch_status` will mark it as manual.
- **The document of a frozen phase.** A phase freezes as soon as a later phase's document exists, or as soon as phase 4 has any receipt in `04 - Execution/`.

Creating a phase document that doesn't exist yet is never refused, except phase 4's. Names are compared ignoring case and in the same Unicode form, so spelling them differently doesn't get around the protection.

**If a legitimate fix is needed** — a typo in the analysis when the decisions are already written — it depends on your client:

- **If your client supports direct confirmations** (MCP elicitation), the server **asks you**, in a form in your client with one checkbox: "Rewrite `01 - Technical Analysis.md`". Tick it and accept, and it's written, with the response saying it was with your confirmation; say no or close the form, and nothing is written. Here `force` isn't enough: the AI sets it, and that's exactly what the question avoids.
- **If it doesn't**, it works as before: the refusal tells the AI it needs your explicit confirmation in the chat and `force: true`, and the response warns that the document was overwritten (or created, if it didn't exist).

The same goes for **starting a new project** with `crear_proyecto: true` (or its alias `create_project`): with direct confirmations, the server asks you before creating the folder.

If your client announces direct confirmations but the form never shows up, the server waits three minutes and writes nothing; the second time in a row it doesn't write either (even if the AI set `force`) and stops asking for the rest of the session: from then on `force` decides again, with your confirmation in the chat. If your client cancels the call before you answer, nothing is written. To avoid this from the start, register the server with `PHASE_GATE_ELICITATION=off`. **On Cursor for Windows, `off` is recommended** while the bug where the form doesn't appear stays open.

On top of that, `write_central_doc` only writes **inside the folder of a task that already exists**: it doesn't create stray folders in the documentation.

## Available tools

| Tool | What it does |
|------|--------------|
| `start_task` | Creates the folder for a **new** task (`<PROJECT>/<tasks subfolder>/<task>`), saves the initial context and makes it the **active task of its project**. If the task already exists it refuses and points you at `switch_task`, so the initial context is never overwritten. Starting a new project takes `crear_proyecto: true` (or `create_project: true`) and, if your client can, your direct confirmation. With `repos` it picks which of the project's repos the task touches, with `preset` it uses a different preset just for it ([see the Configuration guide](configuration.md#a-task-with-its-own-repos-or-preset)), and with `redaccion` the content is written in the other language ([see the Configuration guide](configuration.md#languages)). |
| `get_active_task` | Returns the active task and **which phase it's on**, derived from the documents it already has. Without `project` it answers for every project. Use it when opening a new chat or after losing track. |
| `list_tasks` | Lists the tasks that exist and each one's phase, most recently touched first. For picking up something old or seeing what was left half-done. |
| `switch_task` | Changes which task is active for a project. **Touches no files**: it's the correct way to resume an existing task. |
| `get_phase_prompt` | Returns the behaviour rules for a phase (1–5), with the global rules prepended and the exact document filenames appended, assembled with the project's language, preset and layers (see below). It also checks the **gate**: if you skipped a phase, the prompt arrives with the warning on top, followed by the inherited pending items if there are any. With a project, it ends with the **PROJECT CONFIGURATION** block. |
| `read_central_doc` | Reads a file from the central documentation. **Recommended:** pass `project` + `task_name` + `file_name` and let the server build the path. It also accepts a relative `file_path`. |
| `write_central_doc` | Writes/overwrites a file inside a task folder. Same parameters as `read_central_doc` plus `content`, and `force` for [protected documents](#protected-documents) when your client doesn't support direct confirmations. |
| `read_repo_file` | Reads a file from one of the project's repos **by its id** (`api`, `web`…), wherever it lives on this machine. Never reads anything under `.git` ([see below](#several-repositories-read_repo_file-and-repo_status)). |
| `repo_status` | Branch, commit, ahead/behind its upstream and whether the tree is clean, for one repo or all the task's repos. Read-only: takes no locks and runs no commands the repo brings along (`core.fsmonitor`, `.gitattributes` filters). |
| `read_cross_repo` | Reads a file from any folder in your repositories folder, by name (e.g. from `repo-a`, check how `repo-b` handles an endpoint), so you can check how another codebase solved something without switching windows. It doesn't read anything under `.git` either. If the project declares its repos, use `read_repo_file`. |
| `record_batch` | Records a phase 4 batch in its receipt, written by the server: before the commit, with the content (left with the commit pending), and after, with the `commit`, which it checks against git. Without git, with `artifact_path` (sha256) or `verification_note`. With `reanclar` it changes the anchor of a sealed receipt, and with `cerrar_fase` it closes the phase without the missing batches, both with your confirmation. `estado` takes the Spanish or the English values. When the last batch is anchored it generates the phase 4 document ([see above](#phase-4-with-the-server-record_batch)). |
| `get_batch_status` | Crosses the plan with the receipts: which batch is next, which one is waiting for its commit, the anchor and origin of each receipt (server or by hand). With `reverificar`, it checks that each commit is still on the branch and each sealed artifact hasn't changed. Read-only. |
| `get_orchestrator_status` | The installation X-ray, same as [`doctor`](installation.md#check-your-setup-doctor): package version and path, variables and where each came from, configuration, which prompt wins per phase, projects with their active task, language, preset, rules and repos, and findings. Plus the connected client, its capabilities and which project the open folder matches. Use it when something doesn't behave as you expect. |

In `start_task`, `switch_task`, `read_central_doc`, `write_central_doc`, `read_repo_file`, `repo_status`, `record_batch` and `get_batch_status`, **`project` is optional** if your client announces the open folder.

They all declare their MCP annotations (read-only, destructive, idempotent), so a cautious client can let the read-only ones through without asking. Only `write_central_doc` is destructive.

### `phase-gate://` resources

The server also exposes the documents as **read-only resources**, which compatible clients show when you type `@` in the chat, to attach them without asking the AI:

| Resource | What it is |
|----------|------------|
| `phase-gate://estado` | The `doctor` X-ray, in Markdown |
| `phase-gate://fases` | The available phases, with their document, receipts, and which prompt file wins |
| `phase-gate://tareas/{proyecto}/{tarea}/{documento}` | A task document |
| `phase-gate://tareas/{proyecto}/{tarea}/recibos/{recibo}` | A phase 4 batch receipt |
| `phase-gate://configuracion/{proyecto}` | A project's effective configuration: preset, language, batches and commits with where each value comes from, and the state of its repos on this machine |

The list only includes the existing documents of **each project's active task**, so the picker doesn't drown; the rest is reachable through the template, which autocompletes project, task and document. They have the same defences as `read_central_doc`: they can't leave the task folder, don't expose dot-files, and don't read more than 1 MB.

### How the server builds paths

- **Documentation:** the Documentation folder (`PHASE_GATE_DOCS_PATH`, or `rutas.documentacion` in `machine.json`) / `<PROJECT>` / the tasks subfolder (`PHASE_GATE_TASKS_SUBDIR`, or `rutas.subcarpetaTareas`) / `<task>` / `<file>`
- **Code repos, by name** (`read_cross_repo`): the repos folder (`PHASE_GATE_REPOS_PATH`, or `rutas.carpetaDeRepos`) / `<repo>` / `<file>`
- **A project's repos, by id** (`read_repo_file`): the `machine.json` path for `"<PROJECT>/<id>"` if there is one, otherwise the repos folder / `<manifest dir>` / `<file>`

### What counts as a project

There is no list of projects to maintain. **A project is any folder that contains the tasks subfolder**, so registering a new one just means creating that subfolder. Folders without it — credentials, shared material, dead archives — stay out on their own.

A project that doesn't exist is rejected, showing the list of the ones that do, instead of silently creating a stray folder. To **start** a brand new project you have to ask on purpose: `start_task` accepts `crear_proyecto: true`, and without that flag a typo can't pollute your documentation.

> If you leave the tasks subfolder empty (`PHASE_GATE_TASKS_SUBDIR` or `rutas.subcarpetaTareas`), the rule can't be applied and **any** folder counts as a project.

## The project comes from the open folder

If your client announces its open folders (MCP Roots), the server matches them against your projects: if an open folder **is one of the project's repos** (per its manifest and `machine.json`) or sits **inside its documentation folder**, that's the project. If you opened a folder that contains a single repo of one project, that works too, but only for reading: to write (`start_task`, `switch_task`, `write_central_doc`) you have to name the project, and a drive root or your user folder don't count. `project` then becomes optional, and the response says so: *"Project deduced from the open folder: PROJECT-A (…)"*. If it matches several, the tool asks for `project` and tells you which ones. Without Roots, everything works as before.

## Several repositories: `read_repo_file` and `repo_status`

With the repos declared in the manifest, the AI uses them by id: `read_repo_file(repo: "api", path: "src/main.ts")` and `repo_status()` (the task's repos) or `repo_status(repo: "web")`. `read_repo_file` never reads anything under `.git` — not through a link either — so not `.gitignore` or `.gitmodules`; `.github` is fine.

`repo_status` queries git through a single, read-only door with no side effects: it takes no `index.lock` (so it can't get in the way of a commit in progress) and **doesn't run a repo's `core.fsmonitor` or `.gitattributes` filters**, which a plain `git status` would. If git isn't installed, or a repo belongs to another user ("dubious ownership"), it tells you what to do.

## The PR description contract (phase 5)

Phase 5 doesn't only audit: it drafts the PR description under a strict contract, so the result is consistent regardless of which AI model is used.

- **Title:** `type(area): phrase`, and nothing else — no ticket numbers.
- **Fixed structure:** the why (`Problem` if something was broken, `Context` if it's new) → grouped `Changes` → closing sections.
- **Closing sections are conditional**, each with its own trigger: `Scope` only if you touched existing code, `Verification` only if the testing was substantial, `Deployment notes` only if there are migrations.
- **How bullets are grouped depends on the shape of the change** (by component, by sub-feature, by data dimension…), with a decision table in the prompt. The description adapts to the size of the ticket without becoming unpredictable.
- **Length limits in words**, not adjectives: trivial (55–90), small (110–150), normal (190–240), large (320–400, hard cap 450). The Spanish prompt uses 60–100, 120–160, 200–260 and 350–450 (cap 500): English says the same in fewer words.
- **Delivered inside a four-backtick code block**, so copy-pasting into GitHub gives you raw markdown instead of already-rendered text.

To adapt it to your own style, change it with a `phase-5/pr` or `phase-5/examples` block (`eject phase-5/examples` copies the current text for you). The highest-leverage change is replacing the examples under "REFERENCE EXAMPLES" with PR descriptions of your own: models imitate that voice far more than they follow instructions.

> The reasoning behind each rule is in [`docs/decisiones.md`](../decisiones.md) (Spanish). Read it before changing things: several rules that look arbitrary are solving a concrete problem.
