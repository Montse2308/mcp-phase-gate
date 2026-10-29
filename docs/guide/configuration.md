# Configuration

Everything you can configure, and where each setting lives. To install and register the server first, see [Installation](installation.md).

## Settings first

The easiest way to change any of it is the Studio. Run `npx mcp-phase-gate ui` and open **Settings**: a menu on the left with a page for each thing below, and on each page the change you make is shown as a diff before anything is written.

| Page | What you edit | What it writes |
|---|---|---|
| This machine | The Documentation folder, the repos folder, the tasks subfolder, the machine's default language and the default preset for projects without a manifest | `machine.json` |
| Each project | Its preset, language, batches, commit policy, verification commands, one PR per repo and its repos (id, folder, role and, if on this computer they live elsewhere, their own path) | the project's `phase-gate.json` and the `<PROJECT>/<repo>` keys of `machine.json` |
| MCP clients | Connect or update Cursor, VS Code and Claude Code | each client's configuration |
| Studio | The theme (System, Light or Dark) and the interface language | nothing: it applies in this browser |
| Advanced | The advanced environment variables: their value, where it comes from and how to change them. They are shown, not edited | nothing |

Every page keeps a draft: you change several fields, see **one diff per file**, and press **Apply** (or **Discard**) once. Nothing is written without that preview, and Apply only writes if the file hasn't changed on disk since you saw it; if it did, you get the conflict instead of an overwrite ([more in the Studio guide](studio.md)).

The files and variables below are what Settings edits: you can still write them by hand.

## Who wins

One rule everywhere: **what belongs to one run beats what is stored.** For the three paths of this machine (the Documentation folder, the repos folder and the tasks subfolder), in this order:

1. The environment of the process: the `"env"` block of the client that launched the server, or your shell for `doctor` and `ui`.
2. A `.env` at the root of the package, which only exists if you run from source.
3. `machine.json`.
4. Nothing: the tools that need it say what is missing and where to set it.

The language follows the same rule: `PHASE_GATE_LANG` beats `idiomaPorDefecto` in `machine.json` ([see Languages](#languages)).

That's on purpose: it lets one client use another Documentation (Cursor with the work one, Claude Code with a personal one), or lets you try something once without editing the file. The price is that **an old `env` keeps winning even after you change Settings**, so the tools tell you:

- **Settings › This machine** warns when a different value comes from the Studio's own environment or `.env`, from a client's `env` (Cursor and VS Code, read from their global `mcp.json`; Claude Code, from `~/.claude.json`) or from an open server. Each warning offers to remove it, with a preview; in Claude Code it gives you the command to copy.
- **`doctor`** reports the same clash, `VAR-PISA-MAQUINA` for a path and `LANG-PISA-MAQUINA` for the language, and says which one wins and how to remove it.
- **`init`** no longer writes paths into the `env`.

What none of them can see: each project's own `.cursor/mcp.json` and `.vscode/mcp.json`, VS Code profiles, other clients, Claude Code's project scope (`.mcp.json`), and servers with another `PHASE_GATE_STATE_PATH`, whose sessions the Studio doesn't see. An open server keeps what it received in its environment when it started: to use new values from there, restart that client.

## `machine.json`, what belongs to each machine

What's only valid on this machine lives apart, in `%APPDATA%\mcp-phase-gate\machine.json` (macOS: `~/Library/Application Support/mcp-phase-gate/`; Linux: `~/.config/mcp-phase-gate/`; or the folder in `PHASE_GATE_CONFIG_PATH`). **Settings › This machine** writes it; you can also write it by hand:

```json
{
  "$schema": "https://unpkg.com/mcp-phase-gate@4/schema/machine.json",
  "version": 2,
  "rutas": {
    "documentacion": "C:\\Users\\YOUR_USER\\OneDrive - YOUR ORGANISATION\\Documents\\DOCUMENTATION",
    "carpetaDeRepos": "C:\\projects",
    "subcarpetaTareas": "Proyectos"
  },
  "repos": { "PROJECT-A/api": "D:\\work\\backend-api" },
  "presetPorDefecto": "software-replica",
  "idiomaPorDefecto": "en"
}
```

- `rutas.documentacion` and `rutas.carpetaDeRepos` are absolute paths: the Central Documentation, and the folder that holds your code repositories. `rutas.subcarpetaTareas` is the tasks subfolder; it can be empty, and then tasks hang straight from the project.
- `repos` says where a given repo lives **on this machine**, even outside the repos folder. The key is `"<PROJECT>/<id>"`, with the project compared case-insensitively.
- `presetPorDefecto` is the preset for your projects **without a manifest**: the way to keep your usual flow without writing a manifest in every project.
- `idiomaPorDefecto` is the language for projects that neither declare one nor have documents to deduce it from, and for the messages that don't belong to a project (`PHASE_GATE_LANG` wins over it).

The file is strict: an unknown key, also inside `rutas`, is an error that names its path, and `rutas` in a version 1 file is an error that asks for `"version": 2`. Version 2 is what 4.0 writes. It also reads version 1, the one 3.x wrote, and when it rewrites it as version 2 it leaves a `.bak` copy of the old one. **3.x does not read version 2**: [going back](../notas/v4.0.0.md#going-back-to-3x) takes two steps.

It is read on every call, so a change in Settings applies on the next call, with no restart. If it breaks, a running process keeps the last valid one it read and warns once; if there was never a valid one, its paths don't count and the error says where: the line and column of a syntax error, the field of a shape error, or the path that doesn't exist. `doctor` shows it first.

## Per-project configuration

All of this is **optional**: a project with no configuration works with the defaults. But since 3.0 each project can declare which preset it uses, which repositories it touches and which rules apply, and since 3.2 its language. In the Studio, each project has its own page in **Settings**.

### `phase-gate.json`, the project manifest

It lives in the project folder, `<DOCS>/<PROJECT>/phase-gate.json`, so it travels with the documentation to all your machines:

```json
{
  "$schema": "https://unpkg.com/mcp-phase-gate@3/schema/project.json",
  "version": 1,
  "idioma": "en",
  "preset": "multi-repo-feature",
  "repos": [
    { "id": "api", "dir": "backend-api", "rol": "backend" },
    { "id": "web", "dir": "frontend-web", "rol": "frontend" }
  ],
  "reglas": { "commits": "agente-commitea-con-OK", "verificacion": ["npm test"] },
  "fase5": { "prPorRepo": true }
}
```

| Field | What it is |
|-------|------------|
| `idioma` | `es` or `en`: the project's language ([see Languages](#languages)). Without it, it's deduced from the documents already on disk, then from this machine. |
| `preset` | The project's preset ([see the table](#presets)). Defaults to `software`. |
| `repos` | The project's repositories: a short `id`, its `dir` **relative to `PHASE_GATE_REPOS_PATH`** (never absolute nor with `..`: the manifest travels between machines) and an optional `rol`. |
| `reglas.lotes` | `false` if the project doesn't work in batches: a single batch whose receipt becomes the phase 4 document when it's anchored. If missing, the preset decides. |
| `reglas.commits` | The phase 4 commit policy ([see below](#the-commit-policy)). If missing, the preset decides. |
| `reglas.verificacion` | The commands that verify the project; they reach every prompt. |
| `fase5.prPorRepo` | One PR description per repository. |

With the `$schema`, your editor autocompletes and flags mistakes. **A badly written manifest is not ignored**: the tools that depend on the project return the error with the exact path of the problem (`repos[1].dir: cannot be an absolute path…`) and `doctor` flags it. Silently falling back to the defaults would change every instruction without you noticing. You write it, **Settings** does (or `init --migrate`); the AI can't (`write_central_doc` doesn't write outside tasks).

### Presets

A preset changes the content of a few sections of the prompts; the phases, the gate and the documents are always the same. Each one ships in both languages (`presets/es/`, `presets/en/`), with the same slots.

| Preset | What for |
|--------|----------|
| `software` | **Default.** Code with or without a test suite: if there's a suite, the plan uses it as each batch's exit criterion; if not, whatever can actually be run. |
| `software-replica` | The 2.x flow: code without a suite and with a read-only data replica, where comparing before and after takes the place of tests. Reproduces the 2.2.0 prompts byte for byte (a test checks it). |
| `software-tdd` | Code with a suite, tests first: every batch starts with a failing test, and execution goes red, green, full suite. |
| `multi-repo-feature` | A requirement that changes several repositories: contracts between them, deployment order and one PR per repo. |
| `ai-agent-ops` | Maintaining an AI agent, a system prompt, a skill or an MCP server: evidence with transcripts, a battery of golden, edge and adversarial cases, and a behaviour-regression audit with a version record. |
| `research-ops` | Technical research or operations: the deliverable is a report or a runbook, and there are no per-batch commits. |

A preset is **a single file** of blocks ([see the Prompts guide](prompts.md#blocks-changing-a-section-without-copying-the-prompt)). Yours go in the `presets/` folder next to `machine.json`, and win over the packaged ones with the same name.

**A project's preset comes, in this order**, from the task's (if it declares one), from `phase-gate.json`, from `machine.json`'s `presetPorDefecto`, or it's `software`. Every prompt states it at the end, with its origin.

### A task with its own repos or preset

`start_task` accepts `repos` (the ids of the repos that task touches; without it, all the project's) and `preset` (for instance `ai-agent-ops` for an agent-maintenance task inside a general project). They're validated before anything is created and recorded in the initial context's header:

```markdown
---
repos: api, web
preset: ai-agent-ops
---
<the requirement>
```

Changing them later means rewriting the initial context, which is protected: that's on purpose, switching repos halfway through a task is a decision.

### The commit policy

`reglas.commits` (or the preset) chooses how each phase 4 batch is versioned:

| Policy | What the AI does |
|--------|------------------|
| `agente-commitea-con-OK` | **Default.** Shows you the files and the message, and commits only with your OK. |
| `agente-propone` | Leaves the `git add` and `git commit` ready to copy; you commit, give it the hash and it anchors it. |
| `auto` | Commits as soon as the batch passes its verification, without waiting, and anchors it. |
| `ninguno` | No per-batch commits: each batch is anchored to a file (sha256) or a note, and it stops after each one so you can review. |

In every policy: `git add` file by file (never `-A`, `.` or a folder), never `--no-verify` or `--amend`, and it checks the branch before the first commit. With git, each commit is anchored to its batch and checked by the server ([see the Tools guide](tools.md#phase-4-with-the-server-record_batch)). **And it never pushes or opens the PR, under any policy: that is not configurable.**

### The PROJECT CONFIGURATION block

When the server knows the project, every phase prompt ends with what its configuration declares, as data (in the project's language; in Spanish, `CONFIGURACIÓN DEL PROYECTO`):

```
## PROJECT CONFIGURATION (declared by phase-gate.json)

- Preset: `multi-repo-feature` (from the project) · Language: en
- Batches: yes · Commits: agente-commitea-con-OK
- Repositories of this task:
  - `api` (backend): `D:\work\backend-api` · git · branch `feat/x` · clean tree
  - `web` (frontend): `D:\repos\frontend-web` · git · branch `feat/x` · 2 uncommitted changes
- Project verification commands: `npm test`
- One PR description per repository (fase5.prPorRepo).

Use `read_repo_file` and `repo_status` with these ids.
```

Without a manifest, the preset line says `(default; this project has no phase-gate.json)`. The git state is left out if it takes more than 3 seconds.

## Languages

Prompts, commands, rule variants and presets ship in Spanish and English (`prompts/es/`, `prompts/en/`, `presets/es/`, `presets/en/`). Two different things have a language:

| What | Where it's declared | What it decides |
|---|---|---|
| **The project's language** | `"idioma": "es"` or `"en"` in its `phase-gate.json` | Which factory prompts and presets it uses, the document names, and the language the server writes in: receipts, the index, and the blocks it appends to a prompt |
| **A task's writing language** | `redaccion` in `start_task` (`"es"` or `"en"`), stored in the initial context's header | Only the language the AI writes the documents' **content** in. The prompt gains one line at the end; names, headings and keys stay as they are |

**How a project's language is resolved**, in this order:

1. `idioma` in its `phase-gate.json`.
2. **The documents it already has on disk**: tasks with `01 - Análisis Técnico.md` are Spanish, tasks with `01 - Technical Analysis.md` are English. With both, the one with more documents (a tie goes to Spanish), and `doctor` reports `IDIOMA-MIXTO`.
3. `PHASE_GATE_LANG` (`es` or `en`; `es-MX` or `en_US.UTF-8` also work): the environment always wins.
4. `idiomaPorDefecto` in this machine's `machine.json` (**Settings › This machine**).
5. The system locale: `es` if it starts with `es`, otherwise `en`. Except when the project has a `phase-gate.json` without `idioma`, like the ones 3.0 and 3.1 wrote: that project is Spanish.

The disk goes before the machine on purpose: projects from 2.x have no manifest and are in Spanish, and opening one on a machine set to English must not make its tasks look like they have no phases done. `doctor` shows where each project's language comes from. `init --migrate` writes `idioma` into the manifests it creates (the one of the project's documents if it has any, otherwise `--idioma` or your answer to its question) and adds it, with a backup, to existing ones that lack it; while it's missing, `doctor` reports `MANIFIESTO-SIN-IDIOMA`. Without a project, the machine's language rules (`PHASE_GATE_LANG`, then the default language in `machine.json`, then the system's): if you work in Spanish on a machine set to English, set the default language to Spanish in **Settings › This machine**.

| Phase | Spanish project | English project |
|---|---|---|
| — | `00 - Contexto Inicial.md` | `00 - Initial Context.md` |
| 1 | `01 - Análisis Técnico.md` | `01 - Technical Analysis.md` |
| 2 | `02 - Decisiones.md` | `02 - Decisions.md` |
| 3 | `03 - Plan Técnico.md` | `03 - Technical Plan.md` |
| 4 | `04 - Ejecución.md` and `04 - Ejecución/` | `04 - Execution.md` and `04 - Execution/` |
| 5 | `05 - Auditoría.md` | `05 - Audit.md` |

**Changing a project's language renames nothing.** If the manifest declares one language and some tasks have documents in the other, `doctor` reports `IDIOMA-CON-TAREAS`, and `get_phase_prompt`, `start_task`, `record_batch`, `get_batch_status` and `write_central_doc` with a phase document name refuse with the same message, because otherwise those tasks would look empty and a new task would mix names from both languages; `list_tasks` shows it as a warning. Put the manifest back, or rename those folders by hand.

**A task in the other language.** In a Spanish project, `start_task` with `redaccion: "en"` creates the task with the project's Spanish names and structure, and the prompt asks the AI to write the content in English. The reverse works the same way.

**The server's own messages.** Errors and responses, `doctor`, `--help`, `init`, `eject` and the descriptions of the tools and their parameters exist in both languages. A call that resolves a project answers in that project's language; otherwise `PHASE_GATE_LANG` decides, then the default language in `machine.json`, and last the system. Tool and parameter descriptions are fixed when the server starts, because the client asks for them once, when it connects. MCP clients often launch the server with a reduced environment, and on Windows Node follows the region settings, so say it explicitly: set the default language in **Settings › This machine** (the server of every client reads it from `machine.json`), or, for one client only, `"PHASE_GATE_LANG": "en"` (or `"es"`) in its `env` block, which wins.

**What is never translated:** the names of the tools (`start_task`, `record_batch`…) and of their parameters (`titulo`, `que_se_hizo`, `cerrar_fase`…), batch ids `L01…L99`, slot ids, preset names, commit policies, manifest keys, environment variables and `doctor`'s finding codes. To make that easier:

- `crear_proyecto` also accepts the alias `create_project`.
- `record_batch` accepts `estado` in English: `verified`, `with pending items`, `failed`, `discarded`.
- Every slot keeps its canonical Spanish id and has an English alias, accepted in blocks, slot markers and `eject`: `phase-3/tests` → `fase-3/pruebas`, `global/zero-breakage` → `global/cero-rupturas`… The full table is in [`docs/glosario.md`](../glosario.md).
- Receipts, plans and headings are read in both languages: a receipt written in Spanish still reads in a project opened in English.

**The English prompts are not a machine translation.** Each file was rewritten with a fixed glossary ([`docs/glosario.md`](../glosario.md)), with the same slots in the same order and the same number of `FORBIDDEN` and `SELF-CHECK` points as its Spanish twin. A contract test checks that every heading the code looks for is there, and a golden test (`test/oro/3.2.0-en/`) pins the assembled English prompts; the Spanish golden tests did not change.

**The Studio has its own language**, independent of each project's: an ES / EN selector in the top bar (also in **Settings › Studio**), remembered by the browser; a shareable link with `#?lang=en`; otherwise the browser's languages, and last English. `<html lang>` follows it, and documents are shown as they were written ([see the Studio guide](studio.md)).

## Working across several machines

- If your documentation lives in a synced folder, it travels on its own. What differs on each machine is `machine.json` (and, on the from-source route, a `.env`): both are local and never committed ([see `machine.json`](#machinejson-what-belongs-to-each-machine)).
- The server remembers the **active task of each project** (see `get_active_task`). It's one pointer per project, not a single global one: you can have one window on one project and another on a different one without them clobbering each other. That record is **local to each machine** and lives in your user data folder, outside the repo, so it survives deleting `build/` or re-cloning:
  - **Windows:** `%APPDATA%\mcp-phase-gate\active-tasks.json`
  - **macOS:** `~/Library/Application Support/mcp-phase-gate/active-tasks.json`
  - **Linux:** `~/.local/state/mcp-phase-gate/active-tasks.json`

  If you switch machines or chats and the LLM "forgot" where to write, tell it to call `get_active_task`, or just give it `project` + `task_name`.
- **The project comes from the folder you have open.** If your client announces its open folders (MCP Roots), and one of them is a project's repo or sits inside its documentation folder, the server works out the project and says so in one line. `project` becomes optional ([see the Tools guide](tools.md#the-project-comes-from-the-open-folder)).
- What belongs to **each machine** and doesn't travel with the documentation — the paths of the Documentation and the repos folder, where each repo lives on this machine, the default preset and language for projects without a manifest, your own presets — lives in `machine.json`, in the same data folder (on Linux, `~/.config/mcp-phase-gate/`).
- **The phase isn't stored — it's derived.** The server looks at which documents the task folder already has and works out the phase from there, because each phase declares its own document's name. That's why the answer can never drift: delete `02 - Decisions.md` because it came out wrong and the task drops back to Phase 2 on its own.
- And if the pointer file is lost — new machine, or you deleted it — `get_active_task` doesn't go silent: it proposes the most recently touched task and **tells you it's a guess**, so you can confirm before writing.
- **Golden rule:** if you use a synced folder, let the sync finish before starting work on the other machine, to avoid conflicted copies.

## More than one documentation folder? (optional)

**This is not part of the flow. If one folder is enough for you, skip this section.**

You may want separate documentation sets that never mix — one for work and one for personal projects, say, each somewhere different, or one in the cloud and one not. Nothing new is needed: **register the server more than once** in your client, with a different `env` block each time.

```jsonc
{
  "mcpServers": {
    "pg-work": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"],
      "env": {
        "PHASE_GATE_DOCS_PATH": "C:\\Users\\YOUR_USER\\OneDrive - YOUR ORGANISATION\\Documents\\DOCUMENTATION",
        "PHASE_GATE_REPOS_PATH": "C:\\projects",
        "PHASE_GATE_STATE_PATH": "C:\\Users\\YOUR_USER\\.orquestador\\work"
      }
    },
    "pg-personal": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"],
      "env": {
        "PHASE_GATE_DOCS_PATH": "G:\\My Drive\\Documentation",
        "PHASE_GATE_REPOS_PATH": "D:\\dev",
        "PHASE_GATE_TASKS_SUBDIR": "",
        "PHASE_GATE_STATE_PATH": "C:\\Users\\YOUR_USER\\.orquestador\\personal"
      }
    }
  }
}
```

It's the same package in both — only the paths differ. Here the paths do belong in the `env` block: the environment wins over `machine.json`, so each registration keeps its own Documentation. `doctor` and Settings will point out that those values override `machine.json`; for this setup, that is what you want. Each registration can even have its own tasks subfolder; above, the personal one leaves it empty so tasks hang directly off the project.

> ⚠️ **`PHASE_GATE_STATE_PATH` must differ between registrations.** Share it and the active-task pointers clobber each other **silently**: the state is keyed by project name, so two documentation roots holding a project with the same name end up sharing one entry, and one answers for the other. No error is raised — you just get the wrong task back.

Two more things that bite and aren't obvious:

- **Mirror mode, not streaming.** Google Drive in *streaming* mode and OneDrive with *Files On-Demand* leave files as placeholders until something opens them. This server lives on listing folders and checking whether files exist, so placeholders make it slow, or make it fail with no network. Keep the documentation folder **downloaded locally** if you can.
- **Keep code repos out of the synced folder.** Documentation in the cloud is fine. Code isn't: sync competing with git over `.git/` corrupts repositories. Point `PHASE_GATE_REPOS_PATH` at a local disk.

## What lives OUTSIDE the repo (one copy per machine)

`git pull` does **not** update these five things. If something stopped working right after pulling, the cause is almost always here.

| What | Where | Why it isn't in the repo |
|------|-------|--------------------------|
| The compiled server | `build/` in your clone | It's gitignored. **After every `git pull` that touches `src/`, run `npm run build`** or the client keeps executing the previous version. |
| This machine's paths | `machine.json` (on the from-source route, optionally a `.env` at the root) | The system user and the documentation folder differ per machine. |
| The MCP registration | Your client's config ([route A](installation.md#route-a--with-npx-recommended), or step 3 of [route B](installation.md#route-b--from-source)) | In Cursor and VS Code it holds the absolute path to `build/index.js`, which depends on where you cloned and points into a gitignored folder. No single path can be right on every machine. See [`docs/decisiones.md`](../decisiones.md). The exception is Claude Code's `.mcp.json`, which uses a relative path. |
| The `/f1`–`/f5` commands as files, **only if your client doesn't show MCP Prompts well** | `~/.cursor/commands/f<N>.md` in Cursor | Since 2.2.0 the server offers them as MCP Prompts and they arrive with every version ([see the Installation guide](installation.md#the-phase-commands)). The file copy is only a fallback (`init --comandos` makes it for you); in **Claude Code** inside this repo it's already versioned in `.claude/commands/`. |
| This machine's configuration | `machine.json` and `presets/` in `%APPDATA%\mcp-phase-gate\` (or `PHASE_GATE_CONFIG_PATH`) | Paths and preferences of this machine: the Documentation and repos folders, where each repo lives here, and the default preset and language for projects without a manifest ([see below](#machinejson-what-belongs-to-each-machine)). |

## Environment variables

Read from the environment of the process (the `"env"` block in your client config, or your shell) and from the `.env` at the repo root. They **win** over `machine.json` ([see Who wins](#who-wins)).

The first two have **no default value**: they point at folders that only exist on your machine, so any default would be somebody else's path. You don't need them if `machine.json` has the path (`rutas.documentacion`, `rutas.carpetaDeRepos`): they are for one client or one run that must use a different folder. If one is missing everywhere, or points at something that doesn't exist or isn't a folder, the tools that use it return where to configure it. Tools that don't depend on it — like `get_phase_prompt` — keep working.

Each variable also has an **alias** with the old name, `ORQUESTADOR_*` (e.g. `ORQUESTADOR_DOCS_PATH`), which keeps working so no existing setup breaks. If you define both with different values, `PHASE_GATE_*` wins, and `doctor` and the server log tell you.

| Variable | Default | Description |
|----------|---------|-------------|
| `PHASE_GATE_DOCS_PATH` | none: `rutas.documentacion` in `machine.json` | Path to the root of your central documentation. **Different on each machine.** |
| `PHASE_GATE_REPOS_PATH` | none: `rutas.carpetaDeRepos` in `machine.json` | Path to the folder holding your code repositories. |
| `PHASE_GATE_TASKS_SUBDIR` | `Proyectos`, or `rutas.subcarpetaTareas` in `machine.json` | Subfolder where tasks live inside each project. Empty means tasks hang directly off the project. It's also the rule that decides what counts as a project (see above). |
| `PHASE_GATE_PROMPTS_PATH` | none | Folder holding your own prompts. They are **layered on top of** the packaged ones rather than replacing them, so you only drop in the phases you want to change ([see the Prompts guide](prompts.md#using-your-own-prompts-without-losing-the-packaged-ones)). |
| `PHASE_GATE_STATE_PATH` | Your user data folder (see above) | Where the active-task pointers are stored. Rarely needs touching; useful to isolate state in tests, and **required if you register the server more than once** (see [More than one documentation folder?](#more-than-one-documentation-folder-optional)). |
| `PHASE_GATE_CONFIG_PATH` | Your user data folder | Folder for `machine.json` and your own presets ([see above](#machinejson-what-belongs-to-each-machine)); with a `prompts/` subfolder, that becomes your global layer if you don't set `PHASE_GATE_PROMPTS_PATH`. Rarely needed. No alias. |
| `PHASE_GATE_ELICITATION` | none (enabled) | `off` (or `false`, `0`, `no`) so the server doesn't ask the client for [direct confirmations](tools.md#protected-documents) and lets `force` decide, as before. Recommended on Cursor for Windows (`init` sets it for you). No alias. |
| `PHASE_GATE_LANG` | none (`idiomaPorDefecto` in `machine.json`, then the system's) | `es` or `en`: the language of the tool descriptions, of the messages that don't belong to a project, and of projects with nothing else to go by ([see Languages](#languages)). No alias. |
