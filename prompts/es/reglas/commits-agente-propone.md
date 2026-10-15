Variante de la regla `commits: agente-propone`. La activa `reglas.commits` del phase-gate.json del
proyecto, o el frontmatter del preset. El texto fuera de los bloques no llega al modelo.

<!-- bloque: fase-4/commits -->
Política: **el agente propone el commit; el usuario lo hace.**

Antes de proponer el primer commit de la fase, comprueba en qué rama estás
(`git branch --show-current`) y avísale al usuario si no coincide con la del plan o si es la rama
principal del repositorio.

Al cerrar la verificación y el recibo de un lote:
1. Muéstrale al usuario la lista exacta de archivos del lote y el mensaje de commit (el de la
   columna "Commit propuesto" del plan, ajustado si el lote cambió), listos para copiar:
   `git add <archivo>` uno por uno y `git commit -m "<mensaje>"`.
2. Espera a que el usuario te diga el hash del commit, y actualiza el recibo con él. Si decide
   no hacerlo, el recibo queda con `commit: no aplica` y su porqué.

No ejecutes `git add`, `git commit`, `push`, ni cambies de rama. Con esta política, lo que este
prompt dice en PROHIBIDO y en AUTOVERIFICACIÓN sobre el commit de cada lote se refiere al que hace
el usuario con tu propuesta: tú no haces ninguno.
<!-- /bloque -->
