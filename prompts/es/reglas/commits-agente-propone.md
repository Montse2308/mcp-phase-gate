Variante de la regla `commits: agente-propone`. La activa `reglas.commits` del phase-gate.json del
proyecto, o el frontmatter del preset. El texto fuera de los bloques no llega al modelo.

<!-- bloque: fase-4/commits -->
Política: **el agente propone el commit; el usuario lo hace.**

Antes de proponer el primer commit de la fase, comprueba en qué rama estás
(`git branch --show-current`) y avísale al usuario si no coincide con la del plan o si es la rama
principal del repositorio.

Al cerrar la verificación y el registro de un lote (con el commit pendiente):
1. Muéstrale al usuario la lista exacta de archivos del lote y el mensaje de commit (el de la
   columna "Commit propuesto" del plan, ajustado si el lote cambió), listos para copiar:
   `git add <archivo>` uno por uno y `git commit -m "<mensaje>"`.
2. Cuando el usuario te diga el hash, llama a `record_batch` con `lote` y `commit`. Si decide no
   hacer el commit, pregúntale si se descarta el lote; si es así, regístralo otra vez con
   `estado: descartado` y su porqué.

No ejecutes `git add`, `git commit`, `push`, ni cambies de rama.
<!-- /bloque -->

<!-- bloque: fase-4/prohibido-commits -->
- Ejecutar `git add`, `git commit` o `git push`: con esta política el commit lo hace el usuario con tu propuesta.
- Proponer el primer commit sin haber comprobado la rama.
<!-- /bloque -->

<!-- bloque: fase-4/autoverificacion-commits -->
14. ¿Propuse cada commit con la lista exacta de archivos de su lote, sin ejecutar `git add` ni `git commit`, y anclé el lote cuando el usuario me dio el hash?
15. ¿Avisé al usuario si la rama no coincidía con la del plan o era la principal?
<!-- /bloque -->
