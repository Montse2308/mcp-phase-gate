# Installation

How to install mcp-phase-gate, register it in your MCP client and check that it works. Once it is registered, where your folders go and how to change anything is in [Configuration](configuration.md); what the server sees, in the browser, is in [the Studio](studio.md).

## Two routes, one shortcut: `init`

Two routes, same destination:

- **With `npx`** — nothing to clone or build, and it updates itself. Recommended if you just want to use it.
- **From source** — if you're going to edit the prompts in place, or contribute.

The code is identical everywhere; the only thing that changes between machines is **the paths to your folders**, because the system user and where you keep your documentation differ. Those paths live in `machine.json`, a file in this machine's configuration folder that the server of every client and the Studio read the same way, so they aren't repeated in each client's config ([see Configuration](configuration.md#machinejson-what-belongs-to-each-machine)).

**The shortcut: `init`.** It registers the server in the clients it finds on your machine (Claude Code, Cursor, VS Code) and saves your paths in `machine.json`:

```bash
npx mcp-phase-gate init --docs "C:\Users\YOUR_USER\Documents\DOCUMENTATION" --repos "C:\projects"
```

Without `--docs` and `--repos` it uses the ones `machine.json` or the environment already have, or asks you. The paths go into `machine.json`, not into each client's `env` block. If the server was already registered, **it neither duplicates it nor changes its key**: it updates that entry, shows you the diff and asks for confirmation (`--yes` to skip asking), and takes the paths out of that entry's `env` (with `--docs` and `--repos` given, all of them; without them, only the ones that match `machine.json`, and a different one stays and is reported). A Claude Code entry that already exists is never rewritten: `init` prints the two commands that redo it without the paths, and you run them. Before writing it leaves a `.bak` copy, it won't touch an `mcp.json` it can't parse (it prints the block for you to paste by hand), and with `--dry-run` it only tells you what it would do. `--cliente cursor` (or `claude-code`, `vscode`, `todos`) picks the client; `--comandos` also copies `/f1`…`/f5` as files, and `--migrate` writes a `phase-gate.json` (with the `software-replica` preset, so they keep working as in 2.x) into the projects that lack one ([see the 3.0.0 notes](../notas/v3.0.0.md)). At the end it explains how to put a lock on `git push`, being honest about which option is a real boundary and which isn't, and runs `doctor`.

**Or from the browser.** Register the server as in route A below, with no paths, and run `npx mcp-phase-gate ui`: with no Documentation set up, the Studio opens **Settings › This machine** and asks where yours is ([the Studio](studio.md)).

If you'd rather do it by hand, the two routes below.

## Prerequisites

- **Node.js 22 or newer.** Check with `node -v`. That's what `package.json` declares and what CI tests (Linux and Windows on 22 and 24, macOS on 22); earlier versions are out of support.
- A folder for your central documentation, available locally. If it lives in a synced folder (OneDrive, Google Drive, Dropbox, iCloud) it travels between your machines on its own — that's the recommended setup, but not a requirement: the server only ever receives a local path and doesn't know what's behind it.
- **An MCP client**: Cursor, VS Code or Claude Code.
- **Git**, only for the from-source route.

## Route A — with `npx` (recommended)

Nothing to install: `npx` fetches the package the first time and caches it. Everything is configured in your MCP client's file.

**The key you give it is what identifies the server and prefixes its tools and commands**, so you can name it whatever you like. The examples use `mcp-phase-gate`, the same as the npm package and the name the server reports for itself. If you're registering it for the first time, a short key such as `pg` keeps the commands short (`/pg:f1` in Claude Code). **If it's already registered, keep your key**: changing it renames every tool and command, and you'd have to grant their permissions again.

<details open>
<summary><b>Cursor</b> — <code>~/.cursor/mcp.json</code> (create it if missing)</summary>

```json
{
  "mcpServers": {
    "mcp-phase-gate": {
      "command": "npx",
      "args": ["-y", "mcp-phase-gate"]
    }
  }
}
```

On Windows, Cursor has an open bug where the confirmation form never shows up: add `"env": { "PHASE_GATE_ELICITATION": "off" }` to that entry (`init` does it for you; [why](tools.md#protected-documents)).
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
      "args": ["-y", "mcp-phase-gate"]
    }
  }
}
```
</details>

<details>
<summary><b>Claude Code</b> — one line</summary>

```bash
claude mcp add mcp-phase-gate -- npx -y mcp-phase-gate
```

Or by hand, in a `.mcp.json` at the project root, shaped like the Cursor one.
</details>

**Where do the paths go?** Not in this file: they go in `machine.json`, which every client's server and the Studio read the same way. Write it with `init --docs … --repos …` (above) or in the Studio, in **Settings › This machine**. Any folder works: a OneDrive one such as `C:\Users\YOUR_USER\OneDrive - YOUR ORGANISATION\Documents\DOCUMENTATION`, `G:\My Drive\Documentation`, `D:\Dropbox\Docs` or plain `C:\Docs` with no cloud at all.

The language of the tool descriptions and of the messages that don't belong to a project is set there too, as the machine's default language, or with `PHASE_GATE_LANG`, which wins ([see Languages](configuration.md#languages)).

> **There is no `.env` on this route.** The package lives inside `node_modules`, which is no place to keep your configuration, so the paths live in `machine.json`. If one client needs different paths, put the variables in that client's `"env"` block: the environment wins over `machine.json` ([who wins](configuration.md#who-wins)).

**The Documentation folder and the repos folder have no default value.** If one is missing everywhere (the environment, a `.env` and `machine.json`), or points at a folder that doesn't exist, the tools that need it say so, and where to set it, instead of failing later for some unrelated-looking reason.

> **Already using it with `ORQUESTADOR_*`?** Those names keep working as aliases of `PHASE_GATE_*`; there's nothing to change. If you define both with different values, `PHASE_GATE_*` wins, and `doctor` and the server log tell you.

> Typing `npx mcp-phase-gate` straight into a terminal **looks like it hangs**, and nothing is broken: it's an MCP server waiting for messages on stdin. If you want to check your setup, run `npx mcp-phase-gate doctor` ([see below](#check-your-setup-doctor)).

## Route B — from source

Only needed if you're going to edit the repo's prompts directly, or contribute. You do *not* need it to add prompts of your own: that's done by layering folders, [see the Prompts guide](prompts.md#the-phase-prompts-live-in-promptslanguage).

**1. Clone and build.** `build/` is **not** committed, so it has to be generated on every machine:

```bash
git clone https://github.com/Montse2308/mcp-phase-gate.git
cd mcp-phase-gate
npm install
npm run build
```

**2. Tell the server where your folders are**, with THIS machine's paths (never committed). Don't use `init` here: it registers the npm package with `npx`, not your clone. Open the Studio from the clone, `node build/index.js ui`, and fill in **Settings › This machine**, or write `machine.json` yourself ([its format](configuration.md#machinejson-what-belongs-to-each-machine)). If you prefer a file next to the code, a `.env` also works, and it **wins** over `machine.json`:

```bash
cp .env.example .env
```

Single backslashes on Windows, no quotes:

```ini
PHASE_GATE_DOCS_PATH=C:\Users\YOUR_USER\OneDrive - YOUR ORGANISATION\Documents\DOCUMENTATION
PHASE_GATE_REPOS_PATH=C:\projects
```

> Save `.env` as **UTF-8** (with or without BOM, either works). Creating it from PowerShell with `>` produces UTF-16: the server detects it, doesn't load it, and tells you so — both in the missing-variable error and in `doctor`.

**3. Register the server** as in route A, but swapping `command` and `args` for your clone's `build/index.js`, with no paths in the `"env"` block (they come from `machine.json` or the `.env`):

```json
"command": "node",
"args": ["C:\\<WHERE_YOU_CLONED>\\mcp-phase-gate\\build\\index.js"]
```

In **Claude Code**, a `.mcp.json` at this repo's root can use a **relative** path (`"args": ["build/index.js"]`), since it launches the server from that folder. It's the only one of the three configs that works unchanged on any machine.

> If a variable is defined both in `.env` and in the client's `"env"` block, the client's wins.

## Verify it works

1. Restart the client, or toggle the server off and on in its MCP panel.
2. It should show up active with its 13 tools. In **Cursor** that's Settings → MCP; in **VS Code**, the extensions/MCP view; in **Claude Code**, `/mcp`.
3. Try it from the chat: *"Use the `get_orchestrator_status` tool from mcp-phase-gate"* — it returns an X-ray of the installation: which variables it sees, which prompts it uses and which projects it finds.
4. Or open `npx mcp-phase-gate ui`: **Settings › This machine** shows the paths each client is using, and warns if one client's `env` overrides `machine.json`.

## Check your setup: `doctor`

From a terminal, with the same environment you give the client (if you give it any):

```bash
npx mcp-phase-gate doctor
```

It tells you which version is running and from where (`npx`, global, a dependency or a clone), the value of each variable and where it came from (the environment, `.env` or `machine.json`, and whether you used the new name or the alias), your local configuration (`machine.json` and the available presets), which prompt file wins for each phase, and which projects exist with their active task, manifest, language and preset (and where each comes from), rules and repos with their branch. It ends with a list of findings: a missing Documentation or repos folder, a UTF-16 `.env`, a `PHASE_GATE_LANG` that is neither `es` nor `en`, a path or the language that the environment overrides in `machine.json` (`VAR-PISA-MAQUINA` and `LANG-PISA-MAQUINA`: it says which one wins and how to remove it), a badly written manifest, a conflicted copy left by OneDrive, a preset that doesn't exist, a project without a manifest silently on the default preset, a project with documents in both languages (`IDIOMA-MIXTO`), a block that fits no slot, a repo that isn't on this machine… It exits with code `1` if there's any error, so it also works in a script. `doctor --json` gives the same thing as JSON.

In phase 4 it also checks the receipts: one for a batch the plan doesn't declare (`RECIBO-FUERA-DE-PLAN`), the ones written by hand (`RECIBO-MANUAL`), a `04 - Execution.md` that is no longer what the server would assemble from its receipts (`INDICE-DESINCRONIZADO`), and paths in the documentation longer than 240 characters (`RUTA-LARGA`). **`doctor --reverificar`** also checks against git that each receipt's commit is still on its branch, and that each sealed artifact hasn't changed (`ANCLA-NO-VIGENTE`): use it after a rebase.

**Where does this text come from?** `doctor --fase 3 --proyecto PROJECT-A` shows, slot by slot, which layer and which `file:line` wins in that phase's prompt, and what got added on top. It's the answer to "I changed a preset and can't tell whether it took".

It's the same information returned by the `get_orchestrator_status` tool and the `phase-gate://estado` resource; from the chat, it also includes which client is connected, which capabilities it announced, and which project the folder you have open matches.

## How the documentation is organised

Every task lives in a folder with this fixed structure (here, a project in English):

```
DOCUMENTATION/
├── PROJECT-A/
│   ├── phase-gate.json                  ← optional: the project's manifest
│   └── Proyectos/
│       └── <task_name>/
│           ├── 00 - Initial Context.md      ← written by start_task
│           ├── 01 - Technical Analysis.md   ← Phase 1
│           ├── 02 - Decisions.md            ← Phase 2
│           ├── 03 - Technical Plan.md       ← Phase 3
│           ├── 04 - Execution/              ← Phase 4: one receipt per batch (written by the server)
│           │   ├── L01 - <slug>.md
│           │   └── L02 - <slug>.md
│           ├── 04 - Execution.md            ← Phase 4: generated by the server when the last batch closes
│           └── 05 - Audit.md                ← Phase 5
├── PROJECT-B/
│   └── Proyectos/
│       └── <task_name>/
└── PROJECT-C/
    └── Proyectos/
        └── <task_name>/
```

The `Proyectos` level is the tasks subfolder, and its name is configurable (`Projects`, or empty): `rutas.subcarpetaTareas` in `machine.json`, or `PHASE_GATE_TASKS_SUBDIR` ([see Configuration](configuration.md#environment-variables)). The document names come from the phase prompts of the project's language: a project in Spanish has `00 - Contexto Inicial.md`, `01 - Análisis Técnico.md`… `04 - Ejecución/` and `05 - Auditoría.md` ([see the table](configuration.md#languages)). A project never mixes the two.

**Batches and receipts.** The phase 3 plan splits the work into batches (`L01`, `L02`…): each one is a change that can be reverted on its own and leaves the application working. Phase 4 runs them one at a time, and each batch leaves a short **receipt** (what was done, what was verified, what is waiting for you) in `04 - Execution/`, written by the server with `record_batch`, and a commit. When the last batch closes, the server generates `04 - Execution.md`: with several batches it's the index of the receipts; with a single one, the receipt itself, moved there. Until then the phase doesn't show as finished ([how it works](tools.md#phase-4-with-the-server-record_batch)). When you ask for phase 4 or 5, the server appends the list of existing receipts to the prompt, so a new chat can pick up without guessing their names.

> The server builds this path **automatically**. You (or the LLM) only supply `project`, `task_name` and `file_name`; nobody has to type a full path.

## The phase commands

You invoke them by typing `/f1`, `/f2`, etc. in the chat. **They are orchestration only**: which tools to call and in what order. The behaviour, the document's structure and its filename all come from the phase prompt in `prompts/<language>/`, so tuning a phase doesn't mean editing its command.

| Command | Calls | Document it leaves |
|---------|-------|--------------------|
| `/f1` | `start_task` + `get_phase_prompt(1)` | Phase 1's |
| `/f2` | `get_phase_prompt(2)`, reads phase 1's | Phase 2's, after you answer the questions |
| `/f3` | `get_phase_prompt(3)`, reads the previous ones | Phase 3's |
| `/f4` | `get_phase_prompt(4)`, reads the plan and `get_batch_status` | Each batch with `record_batch`; the server generates the phase document when the last one is anchored |
| `/f5` | `get_phase_prompt(5)` | Phase 5's: the audit and the PR description, which also go in the chat |

No command names a file: the name is declared in each phase prompt's header and `get_phase_prompt` hands it to the model.

`/f1` needs project, task_name and the full requirement. `/f5` accepts a commit range; without one it audits the commits the server lists at the end of the phase prompt (PHASE 4 COMMITS). The rest start from `get_active_task`.

**They arrive on their own, as MCP Prompts.** Since 2.2.0 the server offers each command as an MCP prompt (`f1`…`f5`), with its text in [`prompts/en/commands/`](../../prompts/en/commands) (and [`prompts/es/comandos/`](../../prompts/es/comandos) in Spanish). Nothing to copy into any folder, and they update with every package version. All their arguments are optional — `project`; in `/f1` also `task_name` and `contexto`; in `/f5`, `commits` —: whatever you don't pass, the command asks for, and a long context can be pasted after the command as plain chat text. Without `project`, if the server works it out from the open folder, the command already arrives with it. With a project, the text comes from that project's language and layers. A phase you add yourself (a `fase-6`) gets its own `/f6` with a generic text, and a `commands/fN.md` (`comandos/fN.md` in Spanish) in your own prompts folder (or a project's) wins over the packaged one.

How they look in each client:

| Client | `/f1`…`/f5` visible | Arguments with spaces | `@` resources | Direct confirmations | Notes |
|--------|---------------------|-----------------------|---------------|----------------------|-------|
| Claude Code | To be verified (per its docs: `/<key>:f1 (MCP)`, with `/mcp__<key>__f1` as an alias) | To be verified | To be verified | To be verified | |
| Cursor | To be verified (per its docs: in the MCP prompts menu) | To be verified | To be verified | To be verified | On Windows, `PHASE_GATE_ELICITATION=off` while the form bug stays open ([see the Tools guide](tools.md#protected-documents)) |
| VS Code | To be verified (its docs contradict themselves between `/<key>.f1` and `mcp.<key>.f1`) | To be verified | To be verified | To be verified | |

**If your client doesn't show them comfortably**, use the files: in this repo, Claude Code already reads them from [`.claude/commands/`](../../.claude/commands) (identical to `prompts/es/comandos/`); to use them in your other projects, `npx mcp-phase-gate init --comandos` copies them, in your machine's language, to `~/.claude/commands/` or `~/.cursor/commands/`, without overwriting any you wrote yourself. More detail in [`docs/phase-commands.md`](../phase-commands.md).
