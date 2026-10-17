// El fixture de los E2E: un `ui --no-abrir` de verdad (el binario compilado) sobre el árbol de fixtures,
// con las cuatro PHASE_GATE_* en carpetas temporales; el token se canjea una vez y cada página recibe la
// cookie. Cada página registra sus peticiones y su consola: al terminar, ninguna petición puede salir de
// 127.0.0.1 ni puede haber errores (tampoco violaciones de la CSP).

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test as base } from "@playwright/test";
import type { Page } from "@playwright/test";

import { crearArbol } from "./arbol";
import type { Arbol } from "./arbol";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const BINARIO = path.join(AQUI, "..", "..", "build", "index.js");

export type Servidor = { origen: string; puerto: number; cookie: { name: string; value: string }; arbol: Arbol };

function esperarUrl(hijo: ChildProcess): Promise<string> {
  return new Promise((resolver, rechazar) => {
    let salida = "";
    const plazo = setTimeout(() => rechazar(new Error(`ui no imprimió su enlace: ${salida}`)), 20_000);
    hijo.stdout!.on("data", (d: Buffer) => {
      salida += d.toString("utf-8");
      const m = salida.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);
      if (m) {
        clearTimeout(plazo);
        resolver(m[0]);
      }
    });
    hijo.on("exit", (codigo) => rechazar(new Error(`ui terminó con ${codigo}: ${salida}`)));
  });
}

export async function lanzarUi(arbol: Arbol, extra: string[] = []): Promise<{ hijo: ChildProcess; servidor: Servidor }> {
  const hijo = spawn(process.execPath, [BINARIO, "ui", "--no-abrir", ...extra], { env: { ...process.env, ...arbol.env }, stdio: ["ignore", "pipe", "pipe"] });
  hijo.stderr!.on("data", () => {});
  const url = new URL(await esperarUrl(hijo));
  const canje = await fetch(url, { redirect: "manual" });
  expect(canje.status).toBe(303);
  const [par = ""] = (canje.headers.get("set-cookie") ?? "").split(";");
  const [name = "", value = ""] = par.split("=");
  return { hijo, servidor: { origen: url.origin, puerto: Number(url.port), cookie: { name, value }, arbol } };
}

// `permitidos`: mensajes de consola que una prueba concreta espera (y que no cuentan como error).
export type Registro = { peticiones: string[]; ajenas: string[]; errores: string[]; permitidos: RegExp[]; vistos: string[] };

export const test = base.extend<{ registro: Registro }, { servidor: Servidor }>({
  servidor: [
    async ({}, use) => {
      const raiz = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "pg-e2e-"));
      const arbol = await crearArbol(raiz);
      const { hijo, servidor } = await lanzarUi(arbol);
      await use(servidor);
      hijo.kill();
      await new Promise((r) => (hijo.exitCode !== null ? r(null) : hijo.on("exit", r)));
      fs.rmSync(raiz, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: "worker" },
  ],
  registro: async ({}, use) => {
    await use({ peticiones: [], ajenas: [], errores: [], permitidos: [], vistos: [] });
  },
  page: async ({ page, context, servidor, registro }, use, info) => {
    await context.addCookies([{ ...servidor.cookie, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Strict", secure: false }]);
    page.on("request", (peticion) => {
      const url = peticion.url();
      if (url.startsWith("data:")) return; // no sale a la red
      registro.peticiones.push(url);
      if (!url.startsWith(`${servidor.origen}/`)) registro.ajenas.push(url);
    });
    page.on("console", (mensaje) => {
      const texto = mensaje.text();
      if (mensaje.type() !== "error" && !/Content Security Policy/i.test(texto)) return;
      if (registro.permitidos.some((p) => p.test(texto))) registro.vistos.push(texto);
      else registro.errores.push(texto);
    });
    page.on("pageerror", (error) => registro.errores.push(error.message));
    await use(page);
    console.log(`[peticiones] ${info.title}: ${registro.peticiones.length}, todas a ${servidor.origen.replace(/:\d+$/, "")}: ${registro.ajenas.length === 0 ? "sí" : "NO"}`);
    expect(registro.ajenas, "ninguna petición sale de 127.0.0.1").toEqual([]);
    expect(registro.errores, "sin errores ni violaciones de la CSP en la consola").toEqual([]);
  },
});

export { expect };

const requerir = createRequire(import.meta.url);
const AXE = fs.readFileSync(requerir.resolve("axe-core/axe.min.js"), "utf-8");

// axe-core sin violaciones serious ni critical. Se inyecta por el protocolo de depuración (page.evaluate),
// que no pasa por la CSP de la página: la página sigue sin admitir scripts en línea.
export async function sinViolacionesGraves(page: Page, contexto: string): Promise<void> {
  await page.evaluate(AXE);
  const violaciones = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const r = await axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodos: v.nodes.map((n) => n.target.join(" ")).slice(0, 3) }));
  });
  expect(violaciones.filter((v) => v.impact === "serious" || v.impact === "critical"), `axe en ${contexto}`).toEqual([]);
}

export async function sinDesbordamiento(page: Page, contexto: string): Promise<void> {
  const { ancho, vista } = await page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, vista: window.innerWidth }));
  expect(ancho, `desbordamiento horizontal en ${contexto}`).toBeLessThanOrEqual(vista);
}

// Cada estado lleva texto: ninguna marca de color va sola.
export async function ningunEstadoSoloColor(page: Page): Promise<void> {
  const solas = await page.evaluate(() =>
    [...document.querySelectorAll("svg.marca")]
      .map((marca) => marca.parentElement!)
      .filter((padre) => {
        const copia = padre.cloneNode(true) as HTMLElement;
        copia.querySelectorAll("svg").forEach((s) => s.remove());
        return copia.textContent!.trim() === "";
      })
      .map((padre) => padre.outerHTML.slice(0, 120))
  );
  expect(solas).toEqual([]);
}

export async function ponerModo(page: Page, modo: "cabina" | "sobrio"): Promise<void> {
  const boton = page.getByRole("button", { name: /^Modo:/ });
  if ((await boton.getAttribute("aria-pressed")) !== String(modo === "sobrio")) await boton.click();
  await expect(page.locator("html")).toHaveAttribute("data-modo", modo);
}
