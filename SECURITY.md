# Security policy

If you think you found a vulnerability in mcp-phase-gate, please report it **privately**, not in a public issue. *En español: [Español](#español).*

## How to report

Use GitHub's private vulnerability reporting: open the repository's **Security** tab, choose **Report a vulnerability**, or go straight to [the report form](https://github.com/Montse2308/mcp-phase-gate/security/advisories/new). Only you and the maintainer see it, and the fix can be prepared there before anything is public.

Please include what you did, what you expected and what happened, the version (`npx mcp-phase-gate --version`), and your operating system. A short reproduction is the most useful thing you can send.

This is a one-person project. I read every report and answer as soon as I can, but I can't promise a deadline. When a report is confirmed, the fix ships in a new version and the advisory credits you, unless you prefer not to be named.

## Which versions get fixes

The latest released version. If you are on an older one, update first: `npx -y mcp-phase-gate@latest doctor` tells you what you are running.

## What the project protects

The server runs on your machine, reads and writes a folder you own, and reads your repositories' git state. These are the promises worth testing:

- **Nothing escapes its folder.** Every project, task and repository name must be one portable path segment, and every path is checked against its real location, resolving symlinks and junctions. A tool call can't read or write outside the Documentation or outside the repository it names, and reads stop at 1 MB and refuse binary files. The tests attack this with hostile names, paths and links.
- **The server doesn't run what a repository brings.** git is queried through a single read-only door that takes no locks and switches off what a repository's own configuration could make git run, such as `core.fsmonitor` and the `.gitattributes` filters.
- **Receipts are written by the server, after checking.** `record_batch` validates the commit against git before sealing a receipt; the model can't write one by hand.
- **The Studio is local and narrow.** `mcp-phase-gate ui` is a separate process. It listens only on `127.0.0.1`, on a random port, with no option for another interface. The link it prints carries a one-time token, exchanged for an `HttpOnly`, `SameSite=Strict` cookie. Every request checks `Host` and `Origin` (the defense against DNS rebinding), writes need an extra header and a JSON body of at most 64 kB, no response is cross-origin readable, and the page has a strict Content Security Policy. Static files are served only from the Studio's own build folder. The MCP server never loads any of this code.
- **The Studio writes configuration only, in two steps.** What it can write is `machine.json`, a project's `phase-gate.json`, the files `eject` copies and the registration of the server in a client. Every change is a preview with its diff, then **Apply**, which only writes if the files are as the preview saw them. It never writes task documents, receipts or your repositories.
- **Documents are sanitized before they are shown.** The Markdown of your documents goes through DOMPurify before it is shown, with no styles, forms, inputs or iframes, and the page's policy blocks inline scripts.
- **The exported demo carries no data of yours.** `ui --export-static` builds the demo from generated example data. With `--incluir-datos-reales` it asks for confirmation and replaces the paths of your machine with placeholders.

Each of these is recorded with its reason in [`docs/decisiones.md`](docs/decisiones.md) (in Spanish) and covered by tests in [`test/`](test).

## What is out of scope

- Anything that needs the attacker to already run code as you on your machine. In particular, a browser doesn't separate cookies by port (RFC 6265, section 8.5), so another program that listens on `127.0.0.1` and that you visit with the same browser can see the Studio's cookie. It is a known, accepted limit, written down in the decision log.
- What an AI agent does with the permissions you gave its client. mcp-phase-gate adds gates and a record to that work; it doesn't sandbox the agent.
- Vulnerabilities in a dependency that don't affect mcp-phase-gate's use of it. Dependabot and the secret scanning of this repository watch the dependencies.

## Publishing

Versions are published to npm from GitHub Actions with provenance and no stored token: npm checks the workflow's identity against the trusted publisher declared for the package. If you ever see a version that doesn't carry that provenance, report it.

---

# Español

Si crees que encontraste una vulnerabilidad en mcp-phase-gate, repórtala **en privado**, no en un issue público. *In English: [Security policy](#security-policy).*

## Cómo reportar

Usa el reporte privado de vulnerabilidades de GitHub: abre la pestaña **Security** del repositorio y elige **Report a vulnerability**, o ve directo al [formulario](https://github.com/Montse2308/mcp-phase-gate/security/advisories/new). Solo tú y la persona que mantiene el proyecto lo ven, y el arreglo se puede preparar ahí antes de que algo sea público.

Incluye qué hiciste, qué esperabas y qué pasó, la versión (`npx mcp-phase-gate --version`) y tu sistema operativo. Lo más útil que puedes mandar es una reproducción corta.

Este es un proyecto de una sola persona. Leo cada reporte y respondo en cuanto puedo, pero no puedo prometer un plazo. Cuando se confirma un reporte, el arreglo sale en una versión nueva y el aviso te da el crédito, salvo que prefieras no aparecer.

## Qué versiones reciben arreglos

La última versión publicada. Si usas una anterior, actualiza primero: `npx -y mcp-phase-gate@latest doctor` te dice cuál estás corriendo.

## Qué protege el proyecto

El servidor corre en tu equipo, lee y escribe una carpeta tuya, y lee el estado de git de tus repositorios. Estas son las promesas que vale la pena probar:

- **Nada se sale de su carpeta.** Cada nombre de proyecto, tarea y repositorio tiene que ser un solo segmento de ruta portable, y cada ruta se comprueba contra su ubicación real, resolviendo enlaces simbólicos y junctions. Una llamada a una tool no puede leer ni escribir fuera de la Documentación ni del repositorio que nombra, y las lecturas se detienen en 1 MB y rechazan binarios. Los tests la atacan con nombres, rutas y enlaces hostiles.
- **El servidor no ejecuta lo que trae un repositorio.** A git se le pregunta por una sola puerta de solo lectura que no toma locks y apaga lo que la configuración propia de un repositorio podría hacer que git ejecute, como `core.fsmonitor` y los filtros de `.gitattributes`.
- **Los recibos los escribe el servidor, después de comprobar.** `record_batch` valida el commit contra git antes de sellar un recibo; el modelo no puede escribir uno a mano.
- **El Studio es local y estrecho.** `mcp-phase-gate ui` es un proceso aparte. Solo escucha en `127.0.0.1`, en un puerto al azar, sin ninguna opción para otra interfaz. El enlace que imprime lleva un token de un solo uso, que se canjea por una cookie `HttpOnly` y `SameSite=Strict`. Cada petición comprueba `Host` y `Origin` (la defensa contra el DNS rebinding), las escrituras exigen una cabecera más y un cuerpo JSON de hasta 64 kB, ninguna respuesta se puede leer desde otro origen, y la página tiene una política de seguridad de contenido (CSP) estricta. Los archivos estáticos salen solo de la carpeta de compilado del propio Studio. El servidor MCP nunca carga nada de este código.
- **El Studio escribe solo configuración, en dos pasos.** Lo que puede escribir es `machine.json`, el `phase-gate.json` de un proyecto, los archivos que copia `eject` y el registro del servidor en un cliente. Todo cambio es una vista previa con su diff y luego **Aplicar**, que solo escribe si los archivos están como los vio la vista previa. Nunca escribe documentos de tareas, recibos ni tus repositorios.
- **Los documentos se sanean antes de enseñarse.** El Markdown de tus documentos pasa por DOMPurify antes de enseñarse, sin estilos, formularios, campos ni iframes, y la política de la página bloquea los scripts en línea.
- **La demo exportada no lleva datos tuyos.** `ui --export-static` arma la demo con datos de ejemplo generados. Con `--incluir-datos-reales` pide confirmación y cambia las rutas de tu equipo por marcadores.

Cada una está registrada con su porqué en [`docs/decisiones.md`](docs/decisiones.md) y cubierta por tests en [`test/`](test).

## Qué queda fuera

- Todo lo que requiere que quien ataca ya ejecute código como tú en tu equipo. En particular, un navegador no separa las cookies por puerto (RFC 6265, sección 8.5), así que otro programa que escuche en `127.0.0.1` y que visites con el mismo navegador puede ver la cookie del Studio. Es un límite conocido y aceptado, escrito en el registro de decisiones.
- Lo que un agente de IA hace con los permisos que le diste a su cliente. mcp-phase-gate le pone compuertas y un registro a ese trabajo; no aísla al agente.
- Vulnerabilidades en una dependencia que no afectan cómo mcp-phase-gate la usa. Dependabot y el escaneo de secretos de este repositorio vigilan las dependencias.

## Publicación

Las versiones se publican en npm desde GitHub Actions, con provenance y sin ningún token guardado: npm comprueba la identidad del workflow contra el editor de confianza declarado para el paquete. Si alguna vez ves una versión que no lleva esa provenance, repórtala.
