# Las dos escenas de terminal del GIF y del video (§8.8 del plan maestro v3), con VHS
# (https://github.com/charmbracelet/vhs). No se graba a mano: lo ejecuta scripts/medios.mjs en una carpeta de
# trabajo con un `preparar.sh` que deja el entorno apuntando a la demo de ese idioma (sus PHASE_GATE_*,
# PHASE_GATE_LANG, una casa con un mcp.json de Cursor que ya tiene otro servidor) y define
# `mcp-phase-gate` como el binario compilado de este repo. Los comandos que se ven son los de verdad.

Output terminal.mp4

Set Shell "bash"
Set FontFamily "IBM Plex Mono, DejaVu Sans Mono, Consolas, monospace"
Set FontSize 17
Set Width 1280
Set Height 720
Set Padding 28
Set TypingSpeed 40ms
Set CursorBlink false
# La paleta de la cabina del Studio (studio/src/estilos/cabina.css).
Set Theme { "name": "mcp-phase-gate", "background": "#0c131b", "foreground": "#e9eef3", "cursor": "#e0ac4b", "selection": "#e0ac4b", "black": "#111c27", "red": "#ff6d63", "green": "#4bd88a", "yellow": "#f6bd46", "blue": "#7fa6ff", "magenta": "#b9a4ff", "cyan": "#8fc8ff", "white": "#e9eef3", "brightBlack": "#8b9aa9", "brightRed": "#ff6d63", "brightGreen": "#4bd88a", "brightYellow": "#f0d9a6", "brightBlue": "#8fc8ff", "brightMagenta": "#b9a4ff", "brightCyan": "#8fc8ff", "brightWhite": "#ffffff" }

Hide
Type ". ./preparar.sh"
Enter
Sleep 1s
Show

# 1. init sin escribir nada: el diff del mcp.json de Cursor.
Type "mcp-phase-gate init --cliente cursor --dry-run"
Sleep 400ms
Enter
Sleep 6s

Hide
Type "clear"
Enter
Sleep 300ms
Show

# 2. doctor: variables, prompts, los tres proyectos de la demo con su preset y los hallazgos.
Type "mcp-phase-gate doctor"
Sleep 400ms
Enter
Sleep 5s
