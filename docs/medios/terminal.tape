# La escena de terminal del GIF y del video, con VHS (https://github.com/charmbracelet/vhs). No se graba a
# mano: lo ejecuta scripts/medios.mjs en una carpeta de trabajo con un `preparar.sh` que deja el entorno
# apuntando a la demo de ese idioma (sus PHASE_GATE_*, PHASE_GATE_LANG, una casa con un mcp.json de otro
# servidor) y define `mcp-phase-gate` como el binario compilado de este repo. El comando que se ve es el de
# verdad. Dura unos 6 s: el video entero los usa, y el GIF corto, los 3 primeros.

Output terminal.mp4

Set Shell "bash"
Set FontFamily "JetBrains Mono, DejaVu Sans Mono, Consolas, monospace"
Set FontSize 17
Set Width 1280
Set Height 720
Set Padding 28
Set TypingSpeed 40ms
Set CursorBlink false
# La paleta del tema oscuro del Studio (studio/src/estilos/tema-oscuro.css).
Set Theme { "name": "mcp-phase-gate", "background": "#0b0d10", "foreground": "#e9ecf1", "cursor": "#93c5fd", "selection": "#172a46", "black": "#121620", "red": "#fca5a5", "green": "#4ade80", "yellow": "#fbbf24", "blue": "#93c5fd", "magenta": "#c4b5fd", "cyan": "#93c5fd", "white": "#e9ecf1", "brightBlack": "#8b93a1", "brightRed": "#fca5a5", "brightGreen": "#4ade80", "brightYellow": "#fbbf24", "brightBlue": "#93c5fd", "brightMagenta": "#c4b5fd", "brightCyan": "#93c5fd", "brightWhite": "#ffffff" }

Hide
Type ". ./preparar.sh"
Enter
Sleep 1s
Show

# doctor: variables, prompts, los tres proyectos de la demo con su preset y los hallazgos.
Type "mcp-phase-gate doctor"
Sleep 400ms
Enter
Sleep 4.7s
