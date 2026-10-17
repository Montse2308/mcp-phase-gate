// Un árbol mínimo de fixtures para los E2E de las vistas, sobre carpetas temporales y con git real. Se
// arma con las funciones del servidor compilado (registrarLote escribe los recibos de verdad), como lo
// haría una sesión MCP. Los nombres y textos son de ejemplo.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export type Arbol = { raiz: string; docs: string; repos: string; estado: string; config: string; env: Record<string, string> };

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=Ejemplo", "-c", "user.email=ejemplo@example.invalid", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args], {
    cwd: dir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function escribir(ruta: string, texto: string): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, texto, "utf-8");
}

const PLAN = [
  "---",
  "lotes: 2",
  "---",
  "",
  "# Plan técnico",
  "",
  "| Lote | Repo | Objetivo | Archivos | Verificación | Commit propuesto |",
  "|---|---|---|---|---|---|",
  "| L01 | api | Validar el cupón | cupon.txt | test | `feat(api): validar el cupón` |",
  "| L02 | api | Aplicar el descuento | descuento.txt | test | `feat(api): aplicar el descuento` |",
  "",
].join("\n");

export async function crearArbol(raiz: string): Promise<Arbol> {
  const docs = path.join(raiz, "docs");
  const repos = path.join(raiz, "repos");
  const estado = path.join(raiz, "estado");
  const config = path.join(raiz, "config");
  for (const c of [docs, repos, estado, config]) fs.mkdirSync(c, { recursive: true });
  const env = { PHASE_GATE_DOCS_PATH: docs, PHASE_GATE_REPOS_PATH: repos, PHASE_GATE_STATE_PATH: estado, PHASE_GATE_CONFIG_PATH: config };

  // TIENDA: manifiesto, un repo con git (api) y otro sin git (web), y una tarea en la Fase 4.
  escribir(path.join(docs, "TIENDA", "phase-gate.json"), `${JSON.stringify({ version: 1, preset: "multi-repo-feature", repos: [{ id: "api", dir: "api", rol: "backend" }, { id: "web", dir: "web" }] }, null, 2)}\n`);
  const api = path.join(repos, "api");
  fs.mkdirSync(api, { recursive: true });
  fs.mkdirSync(path.join(repos, "web"), { recursive: true });
  git(api, "init", "-q");
  escribir(path.join(api, "inicio.txt"), "inicio\n");
  git(api, "add", "inicio.txt");
  git(api, "commit", "-q", "-m", "inicio");

  const tarea = path.join(docs, "TIENDA", "Proyectos", "cupones");
  escribir(path.join(tarea, "00 - Contexto Inicial.md"), "# Cupones de descuento\n\nQue la tienda acepte cupones.\n");
  escribir(path.join(tarea, "01 - Análisis Técnico.md"), "# Análisis\n\nEl carrito calcula el total en `api`.\n");
  escribir(path.join(tarea, "02 - Decisiones.md"), "# Decisiones\n\n- D1: el cupón se valida en el servidor.\n");
  escribir(path.join(tarea, "03 - Plan Técnico.md"), PLAN);
  escribir(path.join(api, "cupon.txt"), "cupón\n");
  git(api, "add", "cupon.txt");
  git(api, "commit", "-q", "-m", "feat(api): validar el cupón");

  const anterior = { ...process.env };
  Object.assign(process.env, env);
  try {
    const { registrarLote } = await import("../../build/lotes.js");
    const contenido = { estado: "verificado" as const, que_se_hizo: "Hecho.", verificacion: "test" };
    await registrarLote("TIENDA", "cupones", { lote: 1, repo: "api", titulo: "Validar el cupón", archivos: [{ archivo: "cupon.txt", cambio: "nuevo" }], ...contenido, commit: git(api, "rev-parse", "HEAD") });
    await registrarLote("TIENDA", "cupones", { lote: 2, repo: "api", titulo: "Aplicar el descuento", archivos: [{ archivo: "descuento.txt", cambio: "nuevo" }], ...contenido });
  } finally {
    for (const clave of Object.keys(env)) delete process.env[clave];
    Object.assign(process.env, anterior);
  }

  // INVESTIGACION: sin manifiesto, una tarea en la Fase 2 con pendientes en la 1.
  const otra = path.join(docs, "INVESTIGACION", "Proyectos", "costos");
  escribir(path.join(otra, "00 - Contexto Inicial.md"), "# Costos\n");
  escribir(path.join(otra, "01 - Análisis Técnico.md"), "# Análisis\n\n## Validaciones pendientes\n\n- Falta medir el costo real.\n");

  // ROTO: un manifiesto que no es JSON.
  escribir(path.join(docs, "ROTO", "phase-gate.json"), "{ esto no es json");
  fs.mkdirSync(path.join(docs, "ROTO", "Proyectos"), { recursive: true });

  // Una sesión MCP abierta en TIENDA, con el pid de quien corre los E2E (vivo mientras corren).
  const ahora = new Date().toISOString();
  escribir(path.join(estado, "sesiones", `${process.pid}.json`), `${JSON.stringify({ pid: process.pid, cliente: "cliente-e2e 1.0", raices: [], proyecto: "TIENDA", desde: ahora, actualizado: ahora })}\n`);

  return { raiz, docs, repos, estado, config, env };
}
