Variante de la regla `commits: ninguno`. La activa `reglas.commits` del phase-gate.json del
proyecto, o el frontmatter del preset (por ejemplo, `research-ops`). El texto fuera de los bloques
no llega al modelo.

<!-- bloque: fase-4/commits -->
Política: **sin commits por lote.** El usuario decide cuándo y cómo se versiona.

Al cerrar un lote, su recibo queda con `commit: no aplica` y una línea en "Qué se hizo" que
diga qué archivos cambió. Detente al cerrar cada lote, igual que si hubiera commit, para que
el usuario revise y pruebe antes del siguiente. No ejecutes ningún comando de git que escriba.

Con esta política, lo que este prompt dice en PROHIBIDO y en AUTOVERIFICACIÓN sobre el commit de
cada lote no aplica: no hay commits. El corte de cada lote es esa parada.
<!-- /bloque -->
