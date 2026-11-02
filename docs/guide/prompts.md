# Prompts and layers

Where the text each phase receives lives, how to layer your own prompts on top of the packaged ones without copying them, how blocks change one section, and how `eject` copies what is in effect today so you can edit it. To install the server, see [Installation](installation.md).

## The phase prompts live in `prompts/<language>/`

Each phase's text is a plain markdown file, not code, in one folder per language. The English set:

```
prompts/en/
├── global-rules.md              ← "Zero Breakage" rules, prepended to EVERY phase
├── phase-1-discovery.md
├── phase-2-decisions.md
├── phase-3-technical-plan.md
├── phase-4-execution.md
├── phase-5-audit.md             ← includes the PR description contract
├── commands/                    ← the /f1…/f5 text, served by the server as MCP Prompts
│   ├── f1.md
│   └── …
└── reglas/                      ← the batch and commit variants the manifest switches on
presets/en/                      ← the packaged presets, one file each
```

`prompts/es/` is its Spanish twin (`fase-1-descubrimiento.md` … `fase-5-auditoria-pr.md`, `comandos/`, `reglas/`), and `presets/es/` the Spanish presets.

**They are read on every call.** Edit a `.md` and the next `get_phase_prompt` already returns the new version — no `npm run build`, no client restart. That's what makes it practical to tune a phase and test it immediately.

Each phase declares, in a header at the top of the file, what its document is called:

```markdown
---
document: 02 - Decisions.md
---

# Decisions
```

`get_phase_prompt` reads that header and appends, at the end of the prompt, the exact filename for this phase and for the previous ones. **That's why the `/f1`–`/f5` commands no longer name any file:** the name lives in one place, so changing a prompt doesn't force you to edit a command on every machine too.

Phase 1 also declares `initial_document`, the file `start_task` writes with the initial context. (In the Spanish prompts the keys are `documento` and `documento_inicial`; both are read.)

Format rules:
- The file must be named `phase-<N>-<anything>.md` or `fase-<N>-<anything>.md`.
- The header is optional and never leaks into the prompt: it's stripped before delivery.
- **The number of phases is not hardcoded:** add `phase-6-deployment.md` and phase 6 exists immediately.
- The first `# Heading` in the file becomes the name shown in the tool description.
- `global-rules.md` is automatically prepended to the phase content.

## Using your own prompts without losing the packaged ones

Prompts are assembled **in layers**, lowest to highest priority:

| Layer | Where | What it can contribute |
|-------|-------|------------------------|
| Packaged | the package's `prompts/<language>/`, in the project's language | The phases, `global-rules.md` and the commands |
| Preset | the effective preset's file, in `presets/<language>/` or yours | Blocks only |
| Rules | `prompts/<language>/reglas/`, per `lotes` and `commits` | Blocks only |
| Global | `PHASE_GATE_PROMPTS_PATH`, or else the `prompts/` folder next to `machine.json` when it exists | Phases, `global-rules.md`, commands and a `bloques.md` |
| Project | `<DOCS>/<PROJECT>/.phase-gate/prompts/` | The same as global, for that project only |

A layer of your own is **layered on top of** the ones below; it doesn't replace them. To change only the whole of phase 2, your folder holds **one file**:

```
my-prompts/
└── phase-2-my-way.md
```

Phase 2 is now yours and phases 1, 3, 4 and 5 stay as the packaged ones — including whatever improvements new versions bring.

- **Layering is by phase number, not by filename.** Your `phase-2-my-way.md` overrides the package's `phase-2-decisions.md`. You don't have to guess the original's name.
- **It also adds.** A `phase-6-deployment.md` in your folder creates phase 6, nothing else needed.

On the `npx` route layers are the **only** way to customise: the packaged prompts live inside `node_modules`, where editing them achieves nothing because the next install wipes them.

## Blocks: changing a section without copying the prompt

Copying a whole phase to change a paragraph leaves you with a frozen copy that no longer gets the rest's improvements. That's what **slots** are for: the sections of each prompt that can be changed (the role, verification, tests, batches, commits, examples, the PR contract…). A **block** changes one slot and leaves everything else alive. It goes in the `bloques.md` of your global layer or of a project's:

```markdown
<!-- block: phase-3/tests -->
This project runs `make test` and the plan states what it must give for each batch.
<!-- /block -->

<!-- block: global/extra | after -->
- Always answer in plain English.
<!-- /block -->
```

- The identifier is `<file>/<slot>`: `global` or `phase-N` (or `fase-N`), plus the slot name. Each slot has a canonical Spanish id and an English alias (`phase-3/tests` is `fase-3/pruebas`); both work, and `doctor` and the Studio speak of the canonical one.
- The mode is `replace` (the default), `before` or `after` (in Spanish, `reemplazar`, `antes`, `despues`; the markers can also be `<!-- bloque: … -->`).
- Blocks are applied layer by layer, bottom up: the highest one wins. A block **can't change a document's name**.
- `global/extra` is an empty slot at the end of the global rules, to **add** rules without replacing any.
- What doesn't fit is flagged and not applied: a block for a slot that doesn't exist (with a note at the top of the prompt and in `doctor`), a repeated one, or a malformed file (ignored whole).

**A whole `global-rules.md`.** Replacing it with your own still works, but it's no longer the recommended way: use a `bloques.md` with `global/zero-breakage`, `global/evidence` or `global/extra`. If your `global-rules.md` lacks the `BASIS OF EACH DECISION` and `INHERITED PENDING ITEMS` sections (`BASE DE CADA DECISIÓN` and `PENDIENTES HEREDADOS` in Spanish), which the phases cite, the server **appends the packaged ones** and `doctor` tells you (`GLOBAL-REINYECTADO`). `EVIDENCE` is a slot and isn't appended: if it's missing, `doctor` warns.

## `eject`: copy what's in effect today so you can edit it

```bash
npx mcp-phase-gate eject phase-3/tests --a proyecto:PROJECT-A
```

| Target | Copies | To |
|--------|--------|----|
| `phase-3` (or `fase-3`) | The packaged phase prompt, with its slots | `<layer>/phase-3-technical-plan.md` (the packaged file name, in the layer's language) |
| `phase-3/tests`, `global/evidence` | The slot's **effective** content for that project (with its preset and rules already applied), as a block in the layer's language | `<layer>/bloques.md` |
| `comando-f4` | The text of `/f4` | `<layer>/commands/f4.md` (`comandos/` in Spanish) |
| `preset:<name>` | The preset file | `presets/<name>.md` next to `machine.json` |

`--a global` copies into your global layer (if you don't have `PHASE_GATE_PROMPTS_PATH`, into the `prompts/` folder next to `machine.json`, which then becomes your global layer); `--a proyecto:<NAME>`, into that project's. If it already exists, it's left alone unless you pass `--fuerza`, which keeps a copy. `--dry-run` shows it without writing. Afterwards, `doctor --fase 3 --proyecto PROJECT-A` shows your copy winning.
