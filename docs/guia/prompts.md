# Prompts y capas

Dónde vive el texto que recibe cada fase, cómo superponer tus propios prompts a los de fábrica sin copiarlos, cómo un bloque cambia una sección, y cómo `eject` copia lo que hoy está en vigor para que lo edites. Para instalar el servidor, mira [Instalación](instalacion.md).

## Los prompts de las fases viven en `prompts/<idioma>/`

El texto de cada fase **ya no está dentro del código**: son archivos markdown sueltos, en una carpeta por idioma. El juego en español:

```
prompts/es/
├── global-rules.md              ← reglas "Cero Rupturas", se anteponen a TODAS las fases
├── fase-1-descubrimiento.md
├── fase-2-decisiones.md
├── fase-3-plan-tecnico.md
├── fase-4-ejecucion.md
├── fase-5-auditoria-pr.md       ← incluye el contrato de la descripción del PR
├── comandos/                    ← el texto de /f1…/f5, que el servidor sirve como MCP Prompts
│   ├── f1.md
│   └── …
└── reglas/                      ← las variantes de lotes y commits que activa el manifiesto
presets/es/                      ← los presets del paquete, un archivo cada uno
```

`prompts/en/` es su gemelo en inglés (`phase-1-discovery.md` … `phase-5-audit.md`, `commands/`, `reglas/`), y `presets/en/`, los presets en inglés.

**Se leen en cada llamada.** Si editas un `.md`, la siguiente vez que la IA invoque
`get_phase_prompt` ya recibe la versión nueva — sin `npm run build` y sin reiniciar el
cliente. Eso permite afinar el comportamiento de una fase probándolo al momento.

Cada fase declara, en una cabecera al inicio del `.md`, cómo se llama el documento que produce:

```markdown
---
documento: 02 - Decisiones.md
---

# Decisiones
```

`get_phase_prompt` lee esa cabecera y le entrega al modelo, al final del prompt, el nombre exacto del documento de la fase y los de las fases anteriores. **Por eso los comandos `/f1`–`/f5` ya no nombran ningún archivo:** el nombre vive en un solo sitio, y cambiar un prompt no obliga a editar además un comando en cada dispositivo.

La fase 1 declara además `documento_inicial`, que es el archivo que escribe `start_task` con el contexto. (En los prompts en inglés las claves son `document` e `initial_document`; se leen las dos.)

Reglas del formato:
- El archivo debe llamarse `fase-<N>-<lo-que-sea>.md` o `phase-<N>-<lo-que-sea>.md`.
- La cabecera es opcional y no se filtra al prompt: se quita antes de entregarlo.
- **El número de fases no está cableado:** si agregas un `fase-6-despliegue.md`, la
  fase 6 existe de inmediato.
- El primer encabezado `# Título` del archivo es el nombre que aparece en la
  descripción de la tool.
- `global-rules.md` se antepone automáticamente al contenido de la fase.

## Usar tus propios prompts sin perder los de fábrica

Los prompts se arman **por capas**, de menor a mayor prioridad:

| Capa | Dónde | Qué puede aportar |
|------|-------|-------------------|
| Fábrica | `prompts/<idioma>/` del paquete, en el idioma del proyecto | Las fases, `global-rules.md` y los comandos |
| Preset | el archivo del preset efectivo, en `presets/<idioma>/` o el tuyo | Solo bloques |
| Reglas | `prompts/<idioma>/reglas/`, según `lotes` y `commits` | Solo bloques |
| Global | `PHASE_GATE_PROMPTS_PATH`, o si no, la carpeta `prompts/` junto a `machine.json` cuando existe | Fases, `global-rules.md`, comandos y un `bloques.md` |
| Proyecto | `<DOCS>/<PROYECTO>/.phase-gate/prompts/` | Lo mismo que la global, solo para ese proyecto |

Una capa propia **se superpone** a las de abajo, no las sustituye. Si quieres cambiar solo la Fase 2 entera, tu carpeta lleva **un archivo**:

```
mis-prompts/
└── fase-2-a-mi-manera.md
```

Con eso, la Fase 2 es la tuya y las fases 1, 3, 4 y 5 siguen siendo las del paquete — incluidas las mejoras que traigan las versiones nuevas.

- **Se superpone por número de fase, no por nombre de archivo.** Tu `fase-2-a-mi-manera.md` pisa al `fase-2-decisiones.md` del paquete. No tienes que adivinar cómo se llama el original.
- **También sirve para añadir.** Un `fase-6-despliegue.md` en tu carpeta crea la fase 6, sin tocar nada más.

Por el camino `npx` las capas son la **única** forma de personalizar: los prompts de fábrica viven dentro de `node_modules` y editarlos ahí no sirve, porque la siguiente instalación se los lleva.

## Bloques: cambiar una sección sin copiar el prompt

Copiar una fase entera para cambiar un párrafo te deja una copia congelada que ya no recibe las mejoras del resto. Para eso están las **ranuras**: las secciones de cada prompt que se pueden cambiar (el rol, la verificación, las pruebas, los lotes, los commits, los ejemplos, el contrato del PR…). Un **bloque** cambia una ranura y deja vivo todo lo demás. Va en el `bloques.md` de tu capa global o de la de un proyecto:

```markdown
<!-- bloque: fase-3/pruebas -->
Este proyecto corre `make test` y el plan dice qué debe dar en cada lote.
<!-- /bloque -->

<!-- bloque: global/extra | despues -->
- Responde siempre en español neutro.
<!-- /bloque -->
```

- El identificador es `<archivo>/<ranura>`: `global` o `fase-N` (o `phase-N`), y el nombre de la ranura. Cada ranura tiene un id canónico en español y un alias en inglés (`fase-3/pruebas` es `phase-3/tests`); valen los dos, y `doctor` y el Studio hablan del canónico.
- El modo es `reemplazar` (por defecto), `antes` o `despues` (en inglés, `replace`, `before`, `after`; los marcadores también pueden ser `<!-- block: … -->`).
- Los bloques se aplican por capa, de abajo arriba: el de más arriba manda. Un bloque **no puede cambiar el nombre de un documento**.
- `global/extra` es una ranura vacía al final de las reglas globales, para **sumar** reglas sin sustituir ninguna.
- Lo que no encaja se avisa y no se aplica: un bloque de una ranura que no existe (con una nota al principio del prompt y en `doctor`), uno repetido, o un archivo mal formado (que se ignora entero).

**`global-rules.md` entero.** Sustituirlo con uno propio sigue funcionando, pero ya no es la forma recomendada: usa un `bloques.md` con `global/cero-rupturas`, `global/evidencia` o `global/extra`. Si tu `global-rules.md` no trae las secciones `BASE DE CADA DECISIÓN` y `PENDIENTES HEREDADOS` (`BASIS OF EACH DECISION` e `INHERITED PENDING ITEMS` en inglés), que las fases citan, el servidor **añade las de fábrica al final** y `doctor` te lo dice (`GLOBAL-REINYECTADO`). `EVIDENCIA` es una ranura y no se añade: si falta, `doctor` avisa.

## `eject`: copiar lo que hoy está en vigor para editarlo

```bash
npx mcp-phase-gate eject fase-3/pruebas --a proyecto:PROYECTO-A
```

| Objetivo | Copia | A |
|----------|-------|---|
| `fase-3` (o `phase-3`) | El prompt de fábrica de la fase, con sus ranuras | `<capa>/fase-3-plan-tecnico.md` (el nombre del archivo de fábrica, en el idioma de la capa) |
| `fase-3/pruebas`, `global/evidencia` | El contenido **efectivo** de la ranura para ese proyecto (con su preset y sus reglas ya aplicados), como bloque en el idioma de la capa | `<capa>/bloques.md` |
| `comando-f4` | El texto de `/f4` | `<capa>/comandos/f4.md` (`commands/` en inglés) |
| `preset:<nombre>` | El archivo del preset | `presets/<nombre>.md` junto a `machine.json` |

`--a global` copia a tu capa global (si no tienes `PHASE_GATE_PROMPTS_PATH`, a la carpeta `prompts/` junto a `machine.json`, que pasa a ser tu capa global); `--a proyecto:<NOMBRE>`, a la de ese proyecto. Si ya existe, no lo toca salvo con `--fuerza`, que deja copia. `--dry-run` lo enseña sin escribir. Después, `doctor --fase 3 --proyecto PROYECTO-A` te muestra que gana tu copia.
