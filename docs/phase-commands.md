# The phase commands

The `/f1`…`/f5` commands start the flow: each one tells the model which tools to call, and in
what order, to begin its phase. Their text lives in **a single source per language**:
[`prompts/es/comandos/`](../prompts/es/comandos) and [`prompts/en/commands/`](../prompts/en/commands),
which travel inside the npm package.

*The Spanish original of this page is [`comandos-de-fase.md`](comandos-de-fase.md); change one, change the other.*

## How they reach your client

**As MCP Prompts (since version 2.2.0).** The server offers each command as an MCP prompt called
`f1`, `f2`… Clients that show prompts list them on their own, with nothing to copy into any
folder, and they update with every package version. This is how they look, according to each
client's documentation (what was observed in each one goes in the clients table of the
[installation guide](guide/installation.md#the-phase-commands)):

| Client | How they are invoked |
|--------|----------------------|
| Claude Code | `/<key>:f1 (MCP)` in the `/` menu; it also accepts `/mcp__<key>__f1` |
| Cursor | In the chat's MCP prompts menu |
| VS Code | In the chat's `/` menu, with the server name in front; its documentation contradicts itself between `/<key>.f1` and `mcp.<key>.f1` |

`<key>` is the name you registered the server under in your client (for example
`mcp-phase-gate`). If it is already registered, **keep that key**: changing it renames every tool
and prompt, and makes you grant the permissions again.

All the arguments are optional (`project`; in `/f1` also `task_name` and `contexto`; in
`/f5`, `commits`). Whatever you don't pass as an argument, the command itself asks you for, and a
long context can be pasted after the command as plain chat text.

**As file commands.** For whoever works in this repo, or with a client that doesn't show MCP
prompts well, there is an identical copy in [`.claude/commands/`](../.claude/commands), which
Claude Code reads when it opens the repo. To use them in other projects, or in Cursor without MCP prompts,
`npx mcp-phase-gate init --comandos` copies the ones of your machine's language (the ones in
`prompts/es/comandos/` or the ones in `prompts/en/commands/`) to `~/.claude/commands/` or
`~/.cursor/commands/`, with a mark on the first line; a file of your own, without the mark, is never
overwritten. A test (`test/docs.test.ts`) forces `.claude/commands/` and `prompts/es/comandos/` to be
identical.

**Your own commands.** A `comandos/fN.md` in your own prompts folder
(`PHASE_GATE_PROMPTS_PATH`) wins over the packaged one, like the phase prompts do; one in a
project's layer (`<DOCS>/<PROJECT>/.phase-gate/prompts/comandos/`) wins only in that project, when
the command is asked for with its `project` or the server deduces it from the open folder.
`npx mcp-phase-gate eject comando-f4 --a global` copies the current text for you to start from. A phase
without a command —for example, a `fase-6` that you add— gets its `/f6` with a generic text that
does the same: look up the active task, ask for the phase prompt and save its document.

## What each one carries, and what it doesn't

The commands are **orchestration**: which tool to call and in what order. The role, the rules, the
document's structure **and its file name** live in `prompts/es/*.md` and arrive through
`get_phase_prompt`. That's why a command can stay the same while the prompt of its phase
changes completely. A `/fN` prompt doesn't carry the phase prompt inside either: if it did,
there would be two ways to receive it, and in one of them the gate wouldn't know which project you are in.

No command names a file, on purpose. The name is declared in the header of each phase's prompt
and the server hands it to the model. It used to be written in both places and
they really did drift apart: the prompts changed and the commands kept not writing the new
documents — on the machine where `git pull` doesn't reach, because the commands weren't in
the repo.

They don't name the projects either: the valid ones are detected by the server from the folders that
exist, and `start_task` returns the list if you pass one it doesn't recognise.

The rule when editing them: if what you want to change is **how the model behaves**, **which
sections** the document has or **what it is called**, it goes in the prompt. Only if **which
tool is called, or in what order**, changes do you have to touch the command: in `prompts/es/comandos/`, and the same
edit in `.claude/commands/`.
