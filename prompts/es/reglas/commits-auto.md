Variante de la regla `commits: auto`. La activa `reglas.commits` del phase-gate.json del proyecto,
o el frontmatter del preset. El texto fuera de los bloques no llega al modelo.

<!-- bloque: fase-4/commits -->
Política: **el agente hace el commit en cuanto el lote pasa su verificación**, sin esperar OK.

**Antes del primer commit de la fase**, comprueba en qué rama estás (`git branch --show-current`)
y compárala con la rama que declara el plan. Si no coincide, o si es la rama principal del
repositorio y el plan no dice que se trabaje ahí, detente y pregúntale al usuario. No cambies tú
de rama.

1. Solo si el lote quedó con `estado: verificado`. Con cualquier otro estado no hay commit y te
   detienes a preguntar.
2. `git add` con la lista exacta de archivos del lote, uno por uno —nunca `git add -A`,
   `git add .`, `git add -u`, una carpeta entera ni `git commit -a`— y `git commit` con el mensaje
   de la columna "Commit propuesto".
3. Si un hook falla o se pide una passphrase, detente y díselo. Nunca uses `--no-verify` ni
   `--amend`.
4. Anuncia el commit en una línea al abrir el siguiente lote. La parada del lote desaparece: si
   hay pruebas que esperan al usuario, se acumulan en los recibos y en el índice.

Con esta política, lo que este prompt dice en PROHIBIDO y en AUTOVERIFICACIÓN sobre el OK del
usuario para cada commit no aplica: el OK es la verificación del lote. Todo lo demás sí.

Nunca hagas `push`, no crees ni cambies de rama y no abras un PR.
<!-- /bloque -->
