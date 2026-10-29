# The Studio

```bash
npx mcp-phase-gate ui
```

It opens a local web app with what the server sees, built from the same functions the tools use, and live: a new document or receipt shows up without reloading. If no Documentation is set up yet, it opens **Settings › This machine** and asks where yours is. To look around first, `npx mcp-phase-gate ui --demo` runs it on example data ([options](#options)).

## The six views

| View | What it shows |
|---|---|
| **Network** | One row per project that expands: its preset (with a warning if the manifest is invalid), its repos with branch and pending changes, the active task with its phase, and which MCP client has it open right now; expanded, the manifest and the rules. The preset and the manifest are changed in Settings: the row links to it |
| **Board** | A task's phases as six cards (closed, in progress, with pending items, gap, pending), and the phase 4 batches as a table: verified (its commit is on the branch), sealed (sha256), with pending items, pending commit, stale (the anchor no longer matches), rejected, discarded, manual, note and no receipt, each with its detail, its anchor and its receipt. Click to read the document or the receipt |
| **Workshop** | The prompt each phase receives, slot by slot: which layer and `file:line` won, a diff against the packaged text, and `eject` to edit it. The project's rules are shown there, and changed in Settings |
| **Lookout** | `doctor`'s findings with how to fix each one |
| **Logbook** | The task's timeline: documents, receipts, commits with their subject, re-anchors and the phase 4 close |
| **Settings** | Everything you can configure, in one place ([below](#settings)) |

![The Network view: one row per project, with its preset, repos, active task and MCP session](https://montse2308.github.io/mcp-phase-gate/medios/captura-red-en.webp)

![The Board of a finished task: its six phases and its batches with their state, anchor and receipt](https://montse2308.github.io/mcp-phase-gate/medios/captura-tablero-en.webp)

![Settings, on a project's page: its preset, commit policy and repos](https://montse2308.github.io/mcp-phase-gate/medios/captura-ajustes-en.webp)

## Settings

A menu on the left (a selector at the top on a phone) and one page for each thing: **This machine**, one for **each project**, **MCP clients**, **Studio** and **Advanced**. What each page edits is in [Configuration](configuration.md#settings-first). It is the only place where the Studio edits configuration: the preset, the rules and the clients that used to live in the Network, the Workshop and the Lookout moved here, and those views link to it. `eject` stays in the Workshop, because it is about prompts.

- **Several fields, one diff per file.** You change what you need, each changed field says "Changed, not applied", the menu counts the unapplied changes of each page, and at the bottom there is one diff per file and a single **Apply** or **Discard**. Leaving a page with a draft, or closing the tab, asks you to confirm.
- **If the disk changes under you.** If the file changes on disk while you have a draft, the page says so and asks for the plan again. If what changed is a field that is also in your draft, that field is marked in conflict and you choose between yours and the disk's, instead of one overwriting the other silently.
- **A project's page writes two files.** When you add or change a repo, its own path on this computer goes to `machine.json` from the same page, with two diffs ("Travels with the Documentation" and "Only this computer") and a single Apply. `machine.json` is written first. A repo's id isn't renamed: you remove it and add it again, and the page warns if a receipt cites the id.
- **The Studio page writes nothing to disk.** The theme and the interface language apply at once and the browser remembers them.
- **Advanced shows, it doesn't edit.** The variables for the prompts folder, the state, the configuration and the confirmations, with their value, where it comes from and how to change them.

## It only writes configuration

The Studio writes `machine.json`, a project's `phase-gate.json` (also creating one), the files `eject` copies and the registration of the server in a client, and always in two steps: a preview with the diff, and **Apply**, which only writes if the disk hasn't changed since you saw it. If it did, you get a conflict and your draft stays. It never writes task documents, receipts or anything in your repos.

## Look, theme and language

The theme follows your system, light or dark, until you choose: the button in the top bar and **Settings › Studio** (System, Light or Dark) change it, and the browser remembers your choice. It works with the keyboard and on a phone, and never expresses a state with colour alone: each state has its own shape and its text. The interface is in English or Spanish, with the ES / EN selector in the top bar or `#?lang=en` in the link ([see Languages](configuration.md#languages)).

## Security

It listens only on `127.0.0.1`, on a random port. The link it prints carries a one-time token, exchanged for an `HttpOnly`, `SameSite=Strict` cookie; every request checks `Host` and `Origin`, writes need an extra header, and the page has a strict CSP. The documents' Markdown is sanitized before being shown. The MCP server never loads any of it.

## Options

| Option | What it does |
|---|---|
| `--puerto <n>` | A fixed port instead of a random one |
| `--no-abrir` | Doesn't open the browser: it only prints the link |
| `--demo` | On a demo with example data, in a temporary folder: three projects (multi-repo, an AI agent and a research one) with real git commits. It doesn't touch your Documentation or your configuration: Settings works on the demo's own temporary folder |
| `--idioma es\|en` | With `--demo`: the demo's language (`SHOP`, `ASSISTANT`, `RESEARCH` in English; `TIENDA`, `ASISTENTE`, `INVESTIGACION` in Spanish). Without it, `PHASE_GATE_LANG` or the system's decides |
| `--export-static <dir>` | Starts nothing: writes a read-only static site with the demo into `<dir>` (new or empty), always in both languages (`datos/es/` and `datos/en/`); the site switches demo when you switch the interface language. Settings shows as read-only there. That's what's published on GitHub Pages, under `demo/` |
| `--incluir-datos-reales` | With `--export-static`: your documentation instead of the demo. It asks you to type `exportar` (or `--yes`), and replaces this machine's paths with `<Documentación>`, `<repos>`, `~`… The Settings pages that show paths say "Not available in an export" |
