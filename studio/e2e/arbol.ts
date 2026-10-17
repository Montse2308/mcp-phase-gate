// Un árbol mínimo de fixtures para los E2E de las vistas, sobre carpetas temporales y con git real. Se
// arma con las funciones del servidor compilado (registrarLote escribe los recibos de verdad), como lo
// haría una sesión MCP. Los nombres y textos son de ejemplo.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export type Arbol = { raiz: string; docs: string; repos: string; estado: string; config: string; env: Record<string, string> };

export function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=Ejemplo", "-c", "user.email=ejemplo@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function escribir(ruta: string, texto: string): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, texto, "utf-8");
}

// Un commit nuevo con ese archivo; devuelve su SHA.
export function commit(repo: string, archivo: string, mensaje: string): string {
  escribir(path.join(repo, archivo), `${archivo} ${mensaje}\n`);
  git(repo, "add", archivo);
  git(repo, "commit", "-q", "-m", mensaje);
  return git(repo, "rev-parse", "HEAD");
}

function plan(filas: [string, string, string][]): string {
  return [
    "---",
    `lotes: ${filas.length}`,
    "---",
    "",
    "# Plan técnico",
    "",
    "| Lote | Repo | Objetivo | Archivos | Verificación | Commit propuesto |",
    "|---|---|---|---|---|---|",
    ...filas.map(([lote, repo, objetivo]) => `| ${lote} | ${repo} | ${objetivo} | x | test | \`feat(${repo}): ${objetivo.toLowerCase()}\` |`),
    "",
  ].join("\n");
}

const PREVIOS: [string, string][] = [
  ["00 - Contexto Inicial.md", "# Contexto\n\nQue la tienda acepte cupones.\n"],
  ["01 - Análisis Técnico.md", "# Análisis\n\nEl carrito calcula el total en `api`.\n"],
  ["02 - Decisiones.md", "# Decisiones\n\n- D1: el cupón se valida en el servidor.\n"],
];

function tarea(docs: string, proyecto: string, nombre: string, documentos: [string, string][]): string {
  const carpeta = path.join(docs, proyecto, "Proyectos", nombre);
  fs.mkdirSync(carpeta, { recursive: true });
  for (const [archivo, texto] of documentos) escribir(path.join(carpeta, archivo), texto);
  return carpeta;
}

// Las cargas de XSS del visor: ninguna puede ejecutar nada ni salir a la red.
export const MALICIOSO = [
  "# Análisis con trampas",
  "",
  '<script>window.__xss = "script"</script>',
  '<img src="x" onerror="window.__xss=\'img-onerror\'">',
  '<svg onload="window.__xss=\'svg-onload\'"><circle r="1"/></svg>',
  '<iframe srcdoc="<script>parent.__xss=\'iframe\'</script>"></iframe>',
  '<meta http-equiv="refresh" content="0;url=https://example.invalid/">',
  "[enlace javascript](javascript:window.__xss='md-javascript')",
  '<a href="javascript:window.__xss=\'a-javascript\'">a con javascript</a>',
  "![svg incrustado](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIG9ubG9hZD0id2luZG93Ll9feHNzPSdkYXRhLXN2ZyciLz4=)",
  "![imagen externa](https://example.invalid/rastreo.png)",
  '<div class="raton" onclick="window.__xss=\'onclick\'" onmouseover="window.__xss=\'onmouseover\'">pásale el ratón</div>',
  '<form action="https://example.invalid/"><input name="x"><button>Enviar</button></form>',
  "<style>body { display: none }</style>",
  '<p style="color: red">un párrafo con estilo en línea</p>',
  "<svg><style><img src=x onerror=\"window.__xss='mxss-svg-style'\"></style></svg>",
  "<math><mtext><table><mglyph><style><img src=x onerror=\"window.__xss='mxss-math'\"></style></mglyph></table></mtext></math>",
  "<noscript><p title=\"</noscript><img src=x onerror=window.__xss='noscript'>\"></noscript>",
  "<object data=\"javascript:window.__xss='object'\"></object>",
  "<embed src=\"javascript:window.__xss='embed'\">",
  '<base href="https://example.invalid/">',
  '<link rel="stylesheet" href="https://example.invalid/x.css">',
  "<details open ontoggle=\"window.__xss='ontoggle'\"><summary>detalles</summary>x</details>",
  "[a una sección](#seccion)",
  "[un sitio externo](https://example.invalid/pagina)",
  "",
  "Texto normal al final: **negrita** y `código`.",
  "",
].join("\n\n");

export async function crearArbol(raiz: string): Promise<Arbol> {
  const docs = path.join(raiz, "docs");
  const repos = path.join(raiz, "repos");
  const estado = path.join(raiz, "estado");
  const config = path.join(raiz, "config");
  for (const c of [docs, repos, estado, config]) fs.mkdirSync(c, { recursive: true });
  const env = { PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config };

  // TIENDA: manifiesto con dos repos con git (api, pagos) y uno sin git (web).
  escribir(
    path.join(docs, "TIENDA", "phase-gate.json"),
    `${JSON.stringify({ version: 1, preset: "multi-repo-feature", repos: [{ id: "api", dir: "api", rol: "backend" }, { id: "web", dir: "web" }, { id: "pagos", dir: "pagos" }] }, null, 2)}\n`
  );
  const api = path.join(repos, "api");
  const pagos = path.join(repos, "pagos");
  const web = path.join(repos, "web");
  for (const repo of [api, pagos]) {
    fs.mkdirSync(repo, { recursive: true });
    git(repo, "init", "-q");
    commit(repo, "inicio.txt", "inicio");
  }
  fs.mkdirSync(web, { recursive: true });

  const anterior = { ...process.env };
  Object.assign(process.env, env);
  try {
    const { registrarLote } = await import("../../build/lotes.js");
    const { comoManual } = await import("../../build/recibos.js");
    const contenido = { estado: "verificado" as const, que_se_hizo: "Hecho.", verificacion: "test" };

    // cupones: en la Fase 4, L01 anclado y L02 con el commit pendiente.
    tarea(docs, "TIENDA", "cupones", [...PREVIOS, ["03 - Plan Técnico.md", plan([["L01", "api", "Validar el cupón"], ["L02", "api", "Aplicar el descuento"]])]]);
    const c1 = commit(api, "cupon.txt", "feat(api): validar el cupón");
    await registrarLote("TIENDA", "cupones", { lote: 1, repo: "api", titulo: "Validar el cupón", archivos: [{ archivo: "cupon.txt", cambio: "nuevo" }], ...contenido, commit: c1 });
    await registrarLote("TIENDA", "cupones", { lote: 2, repo: "api", titulo: "Aplicar el descuento", archivos: [{ archivo: "descuento.txt", cambio: "nuevo" }], ...contenido });

    // variedad: un sello de cada tipo.
    const variedad = tarea(docs, "TIENDA", "variedad", [
      ...PREVIOS,
      ["03 - Plan Técnico.md", plan([["L01", "web", "Empaquetar la web"], ["L02", "api", "Con pendientes"], ["L03", "api", "Fallido"], ["L04", "api", "Descartado"], ["L05", "api", "A mano"], ["L06", "api", "Sin empezar"]])],
    ]);
    escribir(path.join(web, "dist", "web.txt"), "la web empaquetada\n");
    await registrarLote("TIENDA", "variedad", { lote: 1, repo: "web", titulo: "Empaquetar la web", ...contenido, artifact_path: "dist/web.txt" });
    await registrarLote("TIENDA", "variedad", { lote: 2, repo: "api", titulo: "Con pendientes", ...contenido, estado: "con pendientes", commit: commit(api, "pendientes.txt", "feat(api): con pendientes") });
    await registrarLote("TIENDA", "variedad", { lote: 3, repo: "api", titulo: "Fallido", ...contenido, estado: "fallido", verification_note: "el test de integración no pasó" });
    await registrarLote("TIENDA", "variedad", { lote: 4, repo: "api", titulo: "Descartado", ...contenido, estado: "descartado", verification_note: "ya no hace falta" });
    await registrarLote("TIENDA", "variedad", { lote: 5, repo: "api", titulo: "A mano", ...contenido, commit: commit(api, "mano.txt", "feat(api): a mano") });
    const manual = path.join(variedad, "04 - Ejecución", fs.readdirSync(path.join(variedad, "04 - Ejecución")).find((n) => n.startsWith("L05"))!);
    fs.writeFileSync(manual, comoManual(fs.readFileSync(manual, "utf-8")), "utf-8");

    // reescrita: L01 anclado a un commit que después desaparece de la rama.
    tarea(docs, "TIENDA", "reescrita", [...PREVIOS, ["03 - Plan Técnico.md", plan([["L01", "pagos", "Cobrar con tarjeta"]])]]);
    await registrarLote("TIENDA", "reescrita", { lote: 1, repo: "pagos", titulo: "Cobrar con tarjeta", ...contenido, commit: commit(pagos, "tarjeta.txt", "feat(pagos): cobrar con tarjeta") });
    git(pagos, "reset", "-q", "--hard", "HEAD~1");

    // en-vivo: un lote sin registrar, para que un E2E lo registre y vea llegar el sello.
    tarea(docs, "TIENDA", "en-vivo", [...PREVIOS, ["03 - Plan Técnico.md", plan([["L01", "api", "Llega en vivo"]])]]);

    // con-hueco: falta la Fase 2.
    tarea(docs, "TIENDA", "con-hueco", [PREVIOS[0]!, PREVIOS[1]!, ["03 - Plan Técnico.md", plan([["L01", "api", "Algo"]])]]);

    // malicioso: un análisis con HTML hostil.
    tarea(docs, "TIENDA", "malicioso", [PREVIOS[0]!, ["01 - Análisis Técnico.md", MALICIOSO]]);
  } finally {
    for (const clave of Object.keys(env)) delete process.env[clave];
    Object.assign(process.env, anterior);
  }

  // La tarea activa de TIENDA, elegida (no deducida por fecha).
  escribir(path.join(estado, "active-tasks.json"), `${JSON.stringify({ tienda: "cupones" }, null, 2)}\n`);

  // INVESTIGACION: sin manifiesto, una tarea en la Fase 2 con pendientes en la 1.
  tarea(docs, "INVESTIGACION", "costos", [
    ["00 - Contexto Inicial.md", "# Costos\n"],
    ["01 - Análisis Técnico.md", "# Análisis\n\n## Validaciones pendientes\n\n- Falta medir el costo real.\n"],
  ]);

  // TALLER: el preset ai-agent-ops (cambia ranuras de fábrica), para el Taller y sus acciones. NUEVO: sin
  // manifiesto, para "Crear phase-gate.json". Los dos son de las pruebas que escriben: así no tocan a los demás.
  escribir(path.join(docs, "TALLER", "phase-gate.json"), `${JSON.stringify({ version: 1, preset: "ai-agent-ops", reglas: { verificacion: ["npm test"] } }, null, 2)}\n`);
  tarea(docs, "TALLER", "afinar", [PREVIOS[0]!]);
  tarea(docs, "NUEVO", "primera", [PREVIOS[0]!]);

  // ROTO: un manifiesto que no es JSON.
  escribir(path.join(docs, "ROTO", "phase-gate.json"), "{ esto no es json");
  fs.mkdirSync(path.join(docs, "ROTO", "Proyectos"), { recursive: true });

  // Una sesión MCP abierta en TIENDA, con el pid de quien corre los E2E (vivo mientras corren).
  const ahora = new Date().toISOString();
  escribir(path.join(estado, "sesiones", `${process.pid}.json`), `${JSON.stringify({ pid: process.pid, cliente: "cliente-e2e 1.0", raices: [], proyecto: "TIENDA", desde: ahora, actualizado: ahora })}\n`);

  return { raiz, docs, repos, estado, config, env };
}
