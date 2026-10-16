Variante de la regla `commits: ninguno`. La activa `reglas.commits` del phase-gate.json del
proyecto, o el frontmatter del preset (por ejemplo, `research-ops`). El texto fuera de los bloques
no llega al modelo.

<!-- bloque: fase-4/commits -->
Política: **sin commits por lote.** El usuario decide cuándo y cómo se versiona.

Al registrar el lote, pasa `artifact_path` o `verification_note`; no hay commit que anclar.
Detente al cerrar cada lote, igual que si hubiera commit, para que el usuario revise y pruebe
antes del siguiente. No ejecutes ningún comando de git que escriba.
<!-- /bloque -->

<!-- bloque: fase-4/prohibido-commits -->
- Ejecutar comandos de git que escriben (`git add`, `git commit`, `git push`…): con esta política no hay commits por lote.
<!-- /bloque -->

<!-- bloque: fase-4/autoverificacion-commits -->
14. ¿Me detuve al cerrar cada lote para que el usuario revisara, sin ejecutar ningún comando de git que escriba?
<!-- /bloque -->
