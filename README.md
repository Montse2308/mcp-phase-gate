# mcp-phase-gate

An MCP server that turns any AI coding agent into a gated, auditable, batch-by-batch engineering workflow.

*This is the main README, in English · Read it in [Spanish](https://github.com/Montse2308/mcp-phase-gate/blob/master/README.es.md).*

<p align="center">
  <a href="https://montse2308.github.io/mcp-phase-gate/medios/demo-en.mp4"><img src="https://montse2308.github.io/mcp-phase-gate/medios/demo-en.gif" alt="The demo, about 40 seconds: doctor in a terminal; then the Studio: the project network, a finished task's board with its seals, a pending batch that turns VERIFIED live when its commit is recorded, a project's commit policy changed in Settings with its diff, the Workshop, and the published site on a phone" width="760"></a>
</p>

[![CI](https://github.com/Montse2308/mcp-phase-gate/actions/workflows/ci.yml/badge.svg)](https://github.com/Montse2308/mcp-phase-gate/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-phase-gate)](https://www.npmjs.com/package/mcp-phase-gate)
[![npm provenance](https://img.shields.io/badge/npm-provenance-blue)](https://www.npmjs.com/package/mcp-phase-gate#provenance)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](https://github.com/Montse2308/mcp-phase-gate/blob/master/LICENSE)
[![Live demo](https://img.shields.io/badge/live%20demo-GitHub%20Pages-blue)](https://montse2308.github.io/mcp-phase-gate/demo/)

**Problem:** an AI coding agent jumps straight to code, makes decisions nobody asked it to make, and its reasoning dies with the chat.<br>
**Solution:** five phases with a gate between them, each one leaving a document on disk; in phase 4 the server itself writes each batch's receipt after checking the commit against git.<br>
**See it:** the [live demo](https://montse2308.github.io/mcp-phase-gate/demo/) is the Studio on example data, read-only, in English and Spanish; it hangs off the [project site](https://montse2308.github.io/mcp-phase-gate/).

## Try it in 10 seconds

```bash
npx mcp-phase-gate ui --demo
```

It opens the Studio in your browser on a demo generated in a temporary folder (three projects, real git commits); it doesn't touch your documentation. `--idioma en` or `--idioma es` picks the demo's language; without it, `PHASE_GATE_LANG` or the system's decides.

---

An MCP (Model Context Protocol) server that splits every incoming requirement into **five gated phases**, and forces each one to leave a written document behind before the next can start. Your client's panel will show it as `mcp-phase-gate`.

## How it works

Ask an AI assistant to implement a requirement and it starts writing code. It breaks something it never read, quietly makes decisions it never asked you about, and when you switch chats or sit down at your other machine, the whole reasoning is gone: it lived in the conversation, and **conversations don't travel**.

Here the assistant doesn't touch code until phase 4. By then it has diagnosed the problem by reading the repository, asked you what it couldn't decide alone, and written a plan checked against the real code. Every phase leaves a document in a central folder, so the thinking outlives both the chat and the device.

It starts from a requirement (an email, a ticket) and goes through five phases, in this order, each leaving its document:

1. **Discovery** reads the code and diagnoses. It leaves `01 · Technical Analysis`.
2. **Decisions** asks, validates, and stops. It leaves `02 · Decisions`.
3. **Technical Plan** turns decisions into exact code. It leaves `03 · Technical Plan`.
4. **Execution** implements and verifies by running. It leaves `04 · Execution`.
5. **Audit** reviews as an outside reviewer. It leaves `05 · Audit`, and its output is the PR description, also in the chat.

**The mandatory stop is phase 2**: it halts there and will not move on until you answer, and whatever you decide gets written down with its rationale. Between one phase and the next there is a **gate**, which is what gives the server its name: ask for a phase while skipping the previous one and the server notices and warns you ([more](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/tools.md#the-gate-skipping-a-phase-stops-being-invisible)).

In phase 4 the AI commits each batch only with your OK (the default policy; a project can choose another) and never pushes or opens the PR, under any policy. Each batch's receipt is written by the server, which checks against git that its commit exists and is on the branch ([how](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/tools.md#phase-4-with-the-server-record_batch)). In phase 5 it only reads. The flow adapts to the kind of work through **presets** (code with or without tests, several repositories, maintaining an AI agent, research), and everything works in **English and Spanish**.

## Who it's for

For people working on **code that already exists and must not break**, who need a record of why each thing was done. It fits especially well if you work from more than one machine, or if you have to justify decisions weeks later. It is not for throwaway prototypes or greenfield projects: five phases to change a colour is absurd ceremony. It speaks standard MCP, so it works with any compatible client, and it is **tested on Cursor, VS Code and Claude Code**.

## Architecture

The server talks to the client over stdio and keeps almost no state of its own: the phase of a task is deduced from the documents on disk, the prompt is assembled from its layers on every call, and git is queried through one read-only door. The Central Documentation is a plain folder you own, synced or not; the server only writes inside task folders, and receipts only through `record_batch`. The Studio is a separate process, loaded only by `ui`, with a local HTTP API and live events over the same functions the tools use. Every design choice is recorded with its reason in [`docs/decisiones.md`](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/decisiones.md) (in Spanish), and the [diagram is in CONTRIBUTING](https://github.com/Montse2308/mcp-phase-gate/blob/master/CONTRIBUTING.md#architecture).

## Install

You need **Node.js 22 or newer** (CI tests Linux and Windows on Node 22 and 24, and macOS on Node 22), a folder for your documentation and an MCP client: Cursor, VS Code or Claude Code.

```bash
npx mcp-phase-gate init --docs "C:\Users\YOUR_USER\Documents\DOCUMENTATION" --repos "C:\projects"
```

`init` registers the server in the clients it finds on your machine and saves your paths in `machine.json`; then `npx mcp-phase-gate doctor` checks the installation. Prefer the browser? Register the server without paths and run `npx mcp-phase-gate ui`: its first screen asks where your Documentation is. Both routes, by hand and from source, are in the [installation guide](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/installation.md).

## The Studio

`npx mcp-phase-gate ui` opens a local web app with what the server sees, live: **Network** (projects, repos and active tasks), **Board** (a task's phases and its batches with their receipts), **Workshop** (the prompt each phase receives, slot by slot), **Lookout** (`doctor`'s findings), **Logbook** (a task's timeline) and **Settings**, where you change all the configuration with a preview, a diff and a single Apply. It only writes configuration, never your documents or your repos, and it listens only on `127.0.0.1`. The [live demo](https://montse2308.github.io/mcp-phase-gate/demo/) shows it on example data; more in the [Studio guide](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/studio.md).

## What changes if you upgrade from 3.x

4.0 changes what you see and touch, not the engine: the 13 tools, the prompts, the presets and the formats on disk are the same. What does change:

- **Your machine's paths moved to `machine.json`**, now version 2. `init` and Settings write them there and take them out of your client's `env`. 3.x can't read version 2: [how to go back](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/notas/v4.0.0.md#going-back-to-3x).
- **The environment always wins.** A value in a client's `env` still beats `machine.json`, and now that includes the language: `PHASE_GATE_LANG` beats the default language in `machine.json`, which used to win.
- **Settings is the only place where configuration is edited.** The preset, the rules, the MCP clients and the advanced variables moved there from the Network, the Workshop and the Lookout.
- **The Studio has one structure per view, and the theme follows your system.** The old choice between two display modes is gone, and your saved choice isn't migrated.
- **The site changed:** the demo lives at `/demo/` and the root is a landing page. Old links with a hash still open the demo on their view.

All of it, with the steps, in the [4.0.0 notes](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/notas/v4.0.0.md).

## Guides

- [Installation](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/installation.md): both routes, `init`, checking with `doctor`, how the documentation is organised and the `/f1`–`/f5` commands.
- [Configuration](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/configuration.md): Settings, who wins, `machine.json`, `phase-gate.json`, presets, commit policy, languages and environment variables.
- [The Studio](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/studio.md): the six views, Settings, security and options.
- [Tools and resources](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/tools.md): the gate, `record_batch`, protected documents, the 13 tools, resources and the PR description contract.
- [Prompts and layers](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/guide/prompts.md): your own prompts, blocks and `eject`.

To contribute, see [CONTRIBUTING](https://github.com/Montse2308/mcp-phase-gate/blob/master/CONTRIBUTING.md). The case study is in [`docs/case-study.md`](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/case-study.md), the fixed terms in [`docs/glosario.md`](https://github.com/Montse2308/mcp-phase-gate/blob/master/docs/glosario.md), and the issues are [open on GitHub](https://github.com/Montse2308/mcp-phase-gate/issues).

## License

[MIT](https://github.com/Montse2308/mcp-phase-gate/blob/master/LICENSE).
