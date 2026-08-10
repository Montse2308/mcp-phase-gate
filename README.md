# 🧠 MCP Orquestador

*Read this in [Spanish](README.es.md) · This is the English README.*

An MCP (Model Context Protocol) server that splits every incoming requirement into **five gated phases**, and forces each one to leave a written document behind before the next can start. Your client's panel will show it as `mcp-phase-gate`.

> The server's interface is in English (tool names, parameters). The **phase prompts that drive the AI's behaviour are written in Spanish**, so the documents it produces come out in Spanish. If you want them in another language, translate `prompts/*.md` — no code changes needed.

## The problem

You ask an AI assistant to implement a requirement and it does what they all do: it starts writing code. It breaks something it never read. It quietly makes decisions it never asked you about. And when you switch chats, or sit down at your other machine, the entire reasoning is gone — because it lived in the conversation, and **conversations don't travel**.

## How it solves it

The assistant doesn't get to touch code until phase 4. By then it has diagnosed the problem by reading the repository, asked you what it couldn't decide alone, and written a plan checked against the real code. Every phase leaves a document in a central folder, so the thinking outlives both the chat and the device.

```mermaid
flowchart TD
    R([An email, a ticket, a requirement]) --> F1
    F1["<b>1 · Discovery</b><br/>reads the code and diagnoses"]
    F2["<b>2 · Decisions</b><br/>asks, validates, and stops"]
    F3["<b>3 · Technical Plan</b><br/>turns decisions into exact code"]
    F4["<b>4 · Execution</b><br/>implements and verifies by running"]
    F5["<b>5 · Audit</b><br/>reviews as an outside reviewer"]

    F1 -- "01 · Technical Analysis" --> F2
    F2 -- "02 · Decisions" --> F3
    F3 -- "03 · Technical Plan" --> F4
    F4 -- "04 · Execution" --> F5
    F5 --> PR([Audit and PR description, in the chat])
```

**The mandatory stop is phase 2**: it halts there and will not move on until you answer. This isn't a polite suggestion to ask questions — the phase does not close without your answers, and whatever you decide gets written down with its rationale.

And between one phase and the next there is a **gate**, which is what gives the server its name: ask for a phase while skipping the previous one and the server notices and warns you ([see below](#-the-gate-skipping-a-phase-stops-being-invisible)).

In phase 5 the AI only reads. **You always make the commits and open the PR.**

## Who it's for

For people working on **code that already exists and must not break**, who need a record of why each thing was done. It fits especially well if you work from more than one machine, or if you have to justify decisions weeks later.

It is not for throwaway prototypes or greenfield projects: five phases to change a colour is absurd ceremony.

It speaks standard MCP, so it works with any compatible client. It is **tested on Cursor, VS Code and Claude Code** — see [Installation](#-installation).

---

## 📁 How the documentation is organised

Every task lives in a folder with this fixed structure:

```
DOCUMENTATION/
├── PROJECT-A/
│   └── Proyectos/
│       └── <task_name>/
│           ├── 00 - Contexto Inicial.md   ← written by start_task
│           ├── 01 - Análisis Técnico.md   ← Phase 1
│           ├── 02 - Decisiones.md         ← Phase 2
│           ├── 03 - Plan Técnico.md       ← Phase 3
│           ├── 04 - Ejecución.md          ← Phase 4
│           └── 05 - Auditoría.md          ← Phase 5
├── PROJECT-B/
│   └── Proyectos/
│       └── <task_name>/
└── PROJECT-C/
    └── Proyectos/
        └── <task_name>/
```

The `Proyectos` level is the tasks subfolder, and its name is configurable — see `ORQUESTADOR_TASKS_SUBDIR` below. The document names come from the phase prompts, which is why they are in Spanish by default.

> The server builds this path **automatically**. You (or the LLM) only supply `project`, `task_name` and `file_name`; nobody has to type a full path.

---

## 💻 Installation

Two routes, same destination:

- **With `npx`** — nothing to clone or build, and it updates itself. Recommended if you just want to use it.
- **From source** — if you're going to edit the prompts in place, or contribute.

The code is identical everywhere; the only thing that changes between machines is **the paths to your folders**, because the system user and where you keep your documentation differ. That's why they are environment variables and not constants in the code.

### Prerequisites
- **Node.js 22 or newer.** Check with `node -v`. That's what `package.json` declares and the only thing CI tests (22 and 24); earlier versions are out of support.
- A folder for your central documentation, available locally. If it lives in a synced folder (OneDrive, Google Drive, Dropbox, iCloud) it travels between your machines on its own — that's the recommended setup, but not a requirement: the server only ever receives a local path and doesn't know what's behind it.
- **An MCP client**: Cursor, VS Code or Claude Code.
- **Git**, only for the from-source route.

---

### 🚀 Route A — with `npx` (recommended)

Nothing to install: `npx` fetches the package the first time and caches it. Everything is configured in your MCP client's file.

**The key you give it is what identifies the server and prefixes its tools**, so you can name it whatever you like. The examples use `mcp-phase-gate`, the same as the npm package and the name the server reports for itself — one name in all three places, so there's nothing to remember.

Remember that in JSON every `\` must be doubled as `\\`.

<details open>
<summary><b>Cursor</b> — <code>~/.cursor/mcp.json</code> (create it if missing)</summary>

```json
{
  "mcpServers": {
    "mcp-phase-gate": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"],
      "env": {
        "ORQUESTADOR_DOCS_PATH": "C:\\Users\\YOUR_USER\\OneDrive - YOUR ORGANISATION\\Documents\\DOCUMENTATION",
        "ORQUESTADOR_REPOS_PATH": "C:\\projects"
      }
    }
  }
}
```
</details>

<details>
<summary><b>VS Code</b> — <code>%APPDATA%\Code\User\mcp.json</code></summary>

Two differences to watch: the top-level key is `servers`, not `mcpServers`, and `type` must be declared.

```json
{
  "servers": {
    "mcp-phase-gate": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"],
      "env": {
        "ORQUESTADOR_DOCS_PATH": "C:\\Users\\YOUR_USER\\OneDrive - YOUR ORGANISATION\\Documents\\DOCUMENTATION",
        "ORQUESTADOR_REPOS_PATH": "C:\\projects"
      }
    }
  }
}
```
</details>

<details>
<summary><b>Claude Code</b> — one line</summary>

```bash
claude mcp add mcp-phase-gate --env ORQUESTADOR_DOCS_PATH="C:\Users\YOUR_USER\Documents\DOCUMENTATION" --env ORQUESTADOR_REPOS_PATH="C:\projects" -- npx -y mcp-phase-gate
```

Or by hand, in a `.mcp.json` at the project root, shaped like the Cursor one.
</details>

That `ORQUESTADOR_DOCS_PATH` is only an **example** using a OneDrive folder. `G:\My Drive\Documentation`, `D:\Dropbox\Docs` or plain `C:\Docs` with no cloud at all work just as well.

> **There is no `.env` on this route.** The package lives inside `node_modules`, which is no place to keep your configuration, so the paths go in the `"env"` block — that's the only option here. The `.env` file only exists on the route below.

**Both variables are required and have no default value.** If one is missing, or points at a folder that doesn't exist, the tools that need it say so by name instead of failing later for some unrelated-looking reason.

> Typing `npx mcp-phase-gate` straight into a terminal **looks like it hangs**, and nothing is broken: it's an MCP server waiting for messages on stdin. If you just want to check it's there, run `npx mcp-phase-gate --help`.

---

### 🔧 Route B — from source

Only needed if you're going to edit the repo's prompts directly, or contribute. You do *not* need it to add prompts of your own: that's done by layering folders, [see below](#-the-phase-prompts-live-in-prompts).

**1. Clone and build.** `build/` is **not** committed, so it has to be generated on every machine:

```bash
git clone https://github.com/Montse2308/mcp-phase-gate.git
cd mcp-phase-gate
npm install
npm run build
```

**2. Create your `.env`** with THIS machine's paths (never committed):

```bash
cp .env.example .env
```

Single backslashes on Windows, no quotes:

```ini
ORQUESTADOR_DOCS_PATH=C:\Users\YOUR_USER\OneDrive - YOUR ORGANISATION\Documents\DOCUMENTATION
ORQUESTADOR_REPOS_PATH=C:\projects
```

> On Windows, save `.env` as **UTF-8 without BOM**. Creating it from PowerShell with `>` produces UTF-16, accented characters arrive mangled, and the path "doesn't exist" even though it looks right.

**3. Register the server** as in route A, but swapping `command` and `args` for your clone's `build/index.js`, and dropping the `"env"` block (the paths come from `.env` now):

```json
"command": "node",
"args": ["C:\\<WHERE_YOU_CLONED>\\mcp-phase-gate\\build\\index.js"]
```

In **Claude Code**, a `.mcp.json` at this repo's root can use a **relative** path (`"args": ["build/index.js"]`), since it launches the server from that folder. It's the only one of the three configs that works unchanged on any machine.

> If a variable is defined both in `.env` and in the client's `"env"` block, the client's wins.

---

### ✅ Verify it works
1. Restart the client, or toggle the server off and on in its MCP panel.
2. It should show up active with its 8 tools. In **Cursor** that's Settings → MCP; in **VS Code**, the extensions/MCP view; in **Claude Code**, `/mcp`.
3. Try it from the chat: *"Use the `get_active_task` tool from mcp-phase-gate"* — it should answer, even if only to say there's no active task yet.

---

## 🔄 Working across several machines

- If your documentation lives in a synced folder, it travels on its own. The only per-machine file is `.env` (Step 3), which is local and never committed.
- The server remembers the **active task of each project** (see `get_active_task`). It's one pointer per project, not a single global one: you can have one window on one project and another on a different one without them clobbering each other. That record is **local to each machine** and lives in your user data folder, outside the repo, so it survives deleting `build/` or re-cloning:
  - **Windows:** `%APPDATA%\mcp-phase-gate\active-tasks.json`
  - **macOS:** `~/Library/Application Support/mcp-phase-gate/active-tasks.json`
  - **Linux:** `~/.local/state/mcp-phase-gate/active-tasks.json`

  If you switch machines or chats and the LLM "forgot" where to write, tell it to call `get_active_task`, or just give it `project` + `task_name`.
- **The phase isn't stored — it's derived.** The server looks at which documents the task folder already has and works out the phase from there, because each phase declares its own document's name. That's why the answer can never drift: delete `02 - Decisiones.md` because it came out wrong and the task drops back to Phase 2 on its own.
- And if the pointer file is lost — new machine, or you deleted it — `get_active_task` doesn't go silent: it proposes the most recently touched task and **tells you it's a guess**, so you can confirm before writing.
- **Golden rule:** if you use a synced folder, let the sync finish before starting work on the other machine, to avoid conflicted copies.

---

## 🗂️ More than one documentation folder? (optional)

**This is not part of the flow. If one folder is enough for you, skip this section.**

You may want separate documentation sets that never mix — one for work and one for personal projects, say, each somewhere different, or one in the cloud and one not. Nothing new is needed: **register the server more than once** in your client, with a different `env` block each time.

```jsonc
{
  "mcpServers": {
    "orquestador-work": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"],
      "env": {
        "ORQUESTADOR_DOCS_PATH": "C:\\Users\\YOUR_USER\\OneDrive - YOUR ORGANISATION\\Documents\\DOCUMENTATION",
        "ORQUESTADOR_REPOS_PATH": "C:\\projects",
        "ORQUESTADOR_STATE_PATH": "C:\\Users\\YOUR_USER\\.orquestador\\work"
      }
    },
    "orquestador-personal": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"],
      "env": {
        "ORQUESTADOR_DOCS_PATH": "G:\\My Drive\\Documentation",
        "ORQUESTADOR_REPOS_PATH": "D:\\dev",
        "ORQUESTADOR_TASKS_SUBDIR": "",
        "ORQUESTADOR_STATE_PATH": "C:\\Users\\YOUR_USER\\.orquestador\\personal"
      }
    }
  }
}
```

It's the same package in both — only the paths differ. Each registration can even have its own tasks subfolder; above, the personal one leaves it empty so tasks hang directly off the project.

> ⚠️ **`ORQUESTADOR_STATE_PATH` must differ between registrations.** Share it and the active-task pointers clobber each other **silently**: the state is keyed by project name, so two documentation roots holding a project with the same name end up sharing one entry, and one answers for the other. No error is raised — you just get the wrong task back.

Two more things that bite and aren't obvious:

- **Mirror mode, not streaming.** Google Drive in *streaming* mode and OneDrive with *Files On-Demand* leave files as placeholders until something opens them. This server lives on listing folders and checking whether files exist, so placeholders make it slow, or make it fail with no network. Keep the documentation folder **downloaded locally** if you can.
- **Keep code repos out of the synced folder.** Documentation in the cloud is fine. Code isn't: sync competing with git over `.git/` corrupts repositories. Point `ORQUESTADOR_REPOS_PATH` at a local disk.

---

## 🧩 What lives OUTSIDE the repo (one copy per machine)

`git pull` does **not** update these four things. If something stopped working right after pulling, the cause is almost always here.

| What | Where | Why it isn't in the repo |
|------|-------|--------------------------|
| The compiled server | `build/` in your clone | It's gitignored. **After every `git pull` that touches `src/`, run `npm run build`** or the client keeps executing the previous version. |
| This machine's paths | `.env` at the root (Step 3) | The system user and the documentation folder differ per machine. |
| The MCP registration | Your client's config (Step 4) | In Cursor and VS Code it holds the absolute path to `build/index.js`, which depends on where you cloned and points into a gitignored folder. No single path can be right on every machine. See [`docs/decisiones.md`](docs/decisiones.md). The exception is Claude Code's `.mcp.json`, which uses a relative path. |
| The `/f1`–`/f5` commands in **Cursor** | `~/.cursor/commands/f<N>.md` | Cursor only reads them from the user folder, so they're copied by hand on each machine. Not an issue in **Claude Code**: they're versioned in `.claude/commands/` and arrive with the pull. |

### The phase commands

You invoke them by typing `/f1`, `/f2`, etc. in the chat. **They are orchestration only**: which tools to call and in what order. The behaviour, the document's structure and its filename all come from the phase prompt in `prompts/`, so tuning a phase doesn't mean editing its command.

| Command | Calls | Document it leaves |
|---------|-------|--------------------|
| `/f1` | `start_task` + `get_phase_prompt(1)` | Phase 1's |
| `/f2` | `get_phase_prompt(2)`, reads phase 1's | Phase 2's, after you answer the questions |
| `/f3` | `get_phase_prompt(3)`, reads the previous ones | Phase 3's |
| `/f4` | `get_phase_prompt(4)`, reads the plan | Phase 4's, short and at the end |
| `/f5` | `get_phase_prompt(5)` | Phase 5's: the audit and the PR description, which also go in the chat |

No command names a file: the name is declared in each phase prompt's header and `get_phase_prompt` hands it to the model.

`/f1` and `/f5` expect data after the command: `/f1` needs project, task_name and the full requirement; `/f5`, which commits to audit. The other four start from `get_active_task`.

**Where to put them, per client:**

- **Claude Code:** already in [`.claude/commands/`](.claude/commands), versioned. They work when you open this repo, no setup. To use them from your other projects, copy them to `~/.claude/commands/`.
- **Cursor:** copy them to `~/.cursor/commands/`. From there they work across all your projects.
- **VS Code:** no slash commands of its own; paste the file contents into the chat.

The exact contents of all five are also in [`docs/comandos-de-fase.md`](docs/comandos-de-fase.md) (Spanish).

---

## 🚦 The gate: skipping a phase stops being invisible

Ask for a phase ahead of the one you're on and the prompt arrives with a warning on top:

```
## ATENCIÓN — COMPUERTA DE FASE

Pediste la Fase 4, pero la tarea "login-sso" no tiene los documentos de fases anteriores:

- Fase 3: falta `03 - Plan Técnico.md`

Esta tarea va en la Fase 3 (Plan Técnico). NO hagas el trabajo de la Fase 4 sobre
documentos que no existen ni te los inventes a partir del contexto del chat.
```

**It warns, it doesn't block.** The prompt is still delivered, so the day you want to skip a phase deliberately on a trivial change, you can. What changed is that it no longer goes unnoticed.

Three things it deliberately does **not** do:

- **It doesn't get in the way of going back.** On Phase 5 and asking for Phase 2 to fix decisions isn't skipping anything, and it stays quiet. It only looks for gaps behind you.
- **It doesn't make you type anything extra.** You still type `/f4` and nothing else. Working out which task you mean is the server's job, using the pointer it already keeps — not the model asking you.
- **It doesn't go quiet when it can't check.** If several projects have an active task and none was named, it says so instead of pretending everything is in order.

---

## 🛠️ Available tools

| Tool | What it does |
|------|--------------|
| `start_task` | Creates the folder for a **new** task (`<PROJECT>/<tasks subfolder>/<task>`), saves the initial context and makes it the **active task of its project**. If the task already exists it refuses and points you at `switch_task`, so the initial context is never overwritten. |
| `get_active_task` | Returns the active task and **which phase it's on**, derived from the documents it already has. Without `project` it answers for every project. Use it when opening a new chat or after losing track. |
| `list_tasks` | Lists the tasks that exist and each one's phase, most recently touched first. For picking up something old or seeing what was left half-done. |
| `switch_task` | Changes which task is active for a project. **Touches no files**: it's the correct way to resume an existing task. |
| `get_phase_prompt` | Returns the behaviour rules for a phase (1–5), with the global rules prepended and the exact document filenames appended. The text lives in `prompts/`. It also checks the **gate**: pass `project` and, if you skipped a phase, the prompt arrives with the warning on top. |
| `read_central_doc` | Reads a file from the central documentation. **Recommended:** pass `project` + `task_name` + `file_name` and let the server build the path. It also accepts a relative `file_path`. |
| `write_central_doc` | Writes/overwrites a file. Same parameters as `read_central_doc` plus `content`. |
| `read_cross_repo` | Reads files from your other local repos, so you can check how another codebase solved something without switching windows. |

### How the server builds paths
- **Documentation:** `ORQUESTADOR_DOCS_PATH` / `<PROJECT>` / `ORQUESTADOR_TASKS_SUBDIR` / `<task>` / `<file>`
- **Code repos:** `ORQUESTADOR_REPOS_PATH` / `<repo>` / `<file>`

### What counts as a project

There is no list of projects to maintain. **A project is any folder that contains the tasks subfolder**, so registering a new one just means creating that subfolder. Folders without it — credentials, shared material, dead archives — stay out on their own.

A project that doesn't exist is rejected, showing the list of the ones that do, instead of silently creating a stray folder. To **start** a brand new project you have to ask on purpose: `start_task` accepts `crear_proyecto: true`, and without that flag a typo can't pollute your documentation.

> If you leave `ORQUESTADOR_TASKS_SUBDIR` empty, the rule can't be applied and **any** folder counts as a project.

---

## 📝 The phase prompts live in `prompts/`

Each phase's text is a plain markdown file, not code:

```
prompts/
├── global-rules.md              ← "Zero Breakage" rules, prepended to EVERY phase
├── fase-1-descubrimiento.md
├── fase-2-decisiones.md
├── fase-3-plan-tecnico.md
├── fase-4-ejecucion.md
└── fase-5-auditoria-pr.md       ← includes the PR description contract
```

**They are read on every call.** Edit a `.md` and the next `get_phase_prompt` already returns the new version — no `npm run build`, no client restart. That's what makes it practical to tune a phase and test it immediately.

Each phase declares, in a header at the top of the file, what its document is called:

```markdown
---
documento: 02 - Decisiones.md
---

# Decisiones
```

`get_phase_prompt` reads that header and appends, at the end of the prompt, the exact filename for this phase and for the previous ones. **That's why the `/f1`–`/f5` commands no longer name any file:** the name lives in one place, so changing a prompt doesn't force you to edit a command on every machine too. A phase without `documento` — like phase 5, which delivers in the chat — announces itself as such.

Phase 1 also declares `documento_inicial`, the file `start_task` writes with the initial context.

Format rules:
- The file must be named `fase-<N>-<anything>.md` (`phase-<N>-...` also works).
- The header is optional and never leaks into the prompt: it's stripped before delivery.
- **The number of phases is not hardcoded:** add `fase-6-deployment.md` and phase 6 exists immediately.
- The first `# Heading` in the file becomes the name shown in the tool description.
- `global-rules.md` is automatically prepended to the phase content.

### Using your own prompts without losing the packaged ones

`ORQUESTADOR_PROMPTS_PATH` points at a folder of yours that is **layered on top of** the packaged one. It does not replace it.

To change only phase 2, your folder holds **one file**:

```
my-prompts/
└── fase-2-my-way.md
```

Phase 2 is now yours and phases 1, 3, 4 and 5 stay as the packaged ones — including whatever improvements new versions bring. This used to be a full replacement: changing one phase meant copying all six, ending up with frozen copies, and any phase you forgot to copy **disappeared with no warning**.

Three details that matter:

- **Layering is by phase number, not by filename.** Your `fase-2-my-way.md` overrides the package's `fase-2-decisiones.md`. You don't have to guess the original's name.
- **It also adds.** A `fase-6-deployment.md` in your folder creates phase 6, nothing else needed.
- **Your `global-rules.md` replaces the packaged one, it doesn't stack.** Concatenating two rule sets makes it impossible to tell which file an unwanted instruction came from, exactly when you need to know. If you want the packaged rules plus extras, copy them and add.

On the `npx` route this is the **only** way to customise: the packaged prompts live inside `node_modules`, where editing them achieves nothing because the next install wipes them.

### The PR description contract (phase 5)

Phase 5 doesn't only audit: it drafts the PR description under a strict contract, so the result is consistent regardless of which AI model is used.

- **Title:** `type(area): sentence`, and nothing else — no ticket numbers.
- **Fixed structure:** the why (`Problem` if something was broken, `Context` if it's new) → grouped `Changes` → closing sections.
- **Closing sections are conditional**, each with its own trigger: `Scope` only if you touched existing code, `Verification` only if the testing was substantial, `Deployment notes` only if there are migrations.
- **How bullets are grouped depends on the shape of the change** (by component, by sub-feature, by data dimension…), with a decision table in the prompt. The description adapts to the size of the ticket without becoming unpredictable.
- **Length limits in words**, not adjectives: trivial (60–100), small (120–160), normal (200–260), large (350–450, hard cap 500).
- **Delivered inside a four-backtick code block**, so copy-pasting into GitHub gives you raw markdown instead of already-rendered text.

To adapt it to your own style, edit `prompts/fase-5-auditoria-pr.md`. The highest-leverage change is replacing the examples under "EJEMPLOS DE REFERENCIA" with PR descriptions of your own: models imitate that voice far more than they follow instructions.

> The reasoning behind each rule is in [`docs/decisiones.md`](docs/decisiones.md) (Spanish). Read it before changing things: several rules that look arbitrary are solving a concrete problem.

---

## ⚙️ Environment variables

Loaded from the `.env` at the repo root, or from the `"env"` block in your client config.

The first two are **required and have no default**: they point at folders that only exist on your machine, so any default would be somebody else's path. If one is missing, or points at something that doesn't exist or isn't a folder, the tools that use it return the variable name and where to configure it. Tools that don't depend on it — like `get_phase_prompt` — keep working.

| Variable | Default | Description |
|----------|---------|-------------|
| `ORQUESTADOR_DOCS_PATH` | **none, required** | Path to the root of your central documentation. **Different on each machine.** |
| `ORQUESTADOR_REPOS_PATH` | **none, required** | Path to the folder holding your code repositories. |
| `ORQUESTADOR_TASKS_SUBDIR` | `Proyectos` | Subfolder where tasks live inside each project. Empty means tasks hang directly off the project. It's also the rule that decides what counts as a project (see above). |
| `ORQUESTADOR_PROMPTS_PATH` | none | Folder holding your own prompts. They are **layered on top of** the packaged ones rather than replacing them, so you only drop in the phases you want to change ([see above](#using-your-own-prompts-without-losing-the-packaged-ones)). |
| `ORQUESTADOR_STATE_PATH` | Your user data folder (see above) | Where the active-task pointers are stored. Rarely needs touching; useful to isolate state in tests, and **required if you register the server more than once** (see [More than one documentation folder?](#-more-than-one-documentation-folder-optional)). |

---

## 🧑‍💻 Development (if you change the code)

> **Note:** this applies to **code** changes only. If all you edited was a prompt under `prompts/*.md`, there is **nothing to build and nothing to restart** — they're read on every call.

The source lives in `src/`, split by responsibility:

| File | What it handles |
|------|-----------------|
| `config.ts` | Environment paths, where state lives, server identity |
| `paths.ts` | How every path is built, and the check that it stays inside its base |
| `phases.ts` | Discovering the phases and assembling each one's prompt |
| `tasks.ts` | Which tasks exist, which phase each is on, and which one is active |
| `index.ts` | The server's tools. It computes nothing: it translates between the protocol and the above |

The client runs the compiled `build/index.js`, so after any change:

```bash
npm run build
```

Then restart the MCP server in your client so it picks up the new version.

Available scripts:
- `npm run build` → compiles TypeScript into `build/`.
- `npm test` → compiles the tests and runs them with Node's test runner (needs **Node 22+**).
- `npm start` → runs the compiled server.
- `npm run dev` → runs straight from TypeScript with `ts-node`.

Tests live in `test/` and need no extra dependency: they use `node:test`, which ships with
Node. They build a throwaway central-documentation tree in a temp folder, so they never touch
yours. CI runs them on every PR.

### Where everything is

| What you're looking for | Where |
|-------------------------|-------|
| What the project does today | This README (and its Spanish twin, [`README.es.md`](README.es.md) — **change one, change the other**) |
| Why it's designed this way | [`docs/decisiones.md`](docs/decisiones.md) (Spanish) |
| The `/f1`–`/f5` commands, to recreate them elsewhere | [`docs/comandos-de-fase.md`](docs/comandos-de-fase.md) (Spanish) |
| That a change broke nothing | [`test/`](test), via `npm test`. CI runs them on every PR |
| What's still missing | [Issues](https://github.com/Montse2308/mcp-phase-gate/issues) — grouped under the `v1-uso-propio` and `v2-publico` labels |
| What's already been done | The commit history and merged PRs |

---

## 📄 License

[MIT](LICENSE).
