// Ayudas para los tests del Studio: arrancarlo sobre carpetas temporales con su API, canjear la sesión
// y pedirle cosas por HTTP. Ningún test abre un navegador: el Studio de los tests nunca llama a abrir().

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { after } from "node:test";

import type { EntornoInit, Ejecucion } from "../src/init.js";
import { crearApi } from "../src/studio/api.js";
import type { ContextoApi } from "../src/studio/api.js";
import { arrancarStudio } from "../src/studio/servidor.js";
import type { OpcionesStudio, Studio } from "../src/studio/servidor.js";
import { carpetaTemporal } from "./helpers.js";

const abiertos: Studio[] = [];
after(async () => {
  for (const studio of abiertos.splice(0)) await studio.cerrar();
});

export type Respuesta = { estado: number; cabeceras: http.IncomingHttpHeaders; json: any; texto: string };

export type StudioDePrueba = Studio & {
  cookie: string;
  get: (ruta: string) => Promise<Respuesta>;
  post: (ruta: string, cuerpo: unknown) => Promise<Respuesta>;
};

export function pedir(puerto: number, metodo: string, ruta: string, cabeceras: Record<string, string> = {}, cuerpo?: string): Promise<Respuesta> {
  return new Promise((resolver, rechazar) => {
    const req = http.request({ host: "127.0.0.1", port: puerto, method: metodo, path: ruta, headers: { ...cabeceras, ...(cuerpo !== undefined ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(cuerpo) } : {}) } }, (res) => {
      let texto = "";
      res.setEncoding("utf-8");
      res.on("data", (d) => (texto += d));
      res.on("end", () => {
        let json: unknown = null;
        try {
          json = JSON.parse(texto);
        } catch {
          json = null;
        }
        resolver({ estado: res.statusCode ?? 0, cabeceras: res.headers, json, texto });
      });
    });
    req.on("error", rechazar);
    if (cuerpo !== undefined) req.write(cuerpo);
    req.end();
  });
}

// Un `claude` de mentira para init: responde --version y mcp list, y apunta lo que se le pide.
export function entornoInitDePrueba(responder?: (args: string[]) => Ejecucion): EntornoInit & { llamadas: string[][] } {
  const llamadas: string[][] = [];
  return {
    home: carpetaTemporal("home"),
    appData: carpetaTemporal("appdata"),
    xdgConfig: null,
    plataforma: process.platform,
    salida: { out: () => {}, err: () => {} },
    esTerminal: false,
    preguntar: async () => "",
    ejecutar: async (comando, args) => {
      llamadas.push([comando, ...args]);
      if (!responder) throw new Error(`${comando} no está instalado o no está en el PATH.`);
      return responder(args);
    },
    ahora: () => new Date(2026, 9, 17, 9, 0, 0),
    llamadas,
  };
}

export async function studioConApi(contexto: Partial<ContextoApi> = {}, opciones: OpcionesStudio = {}): Promise<StudioDePrueba> {
  const dist = carpetaTemporal("dist");
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>Studio</title>", "utf-8");
  const entorno = entornoInitDePrueba();
  const api = crearApi({ modo: "vivo", watcher: () => "apagado", sesiones: () => [], entornoInit: () => entorno, ...contexto });
  const studio = await arrancarStudio({ dist, api, ...opciones });
  abiertos.push(studio);
  const canje = await pedir(studio.puerto, "GET", new URL(studio.url).pathname + new URL(studio.url).search);
  assert.equal(canje.estado, 303);
  const cookie = String(canje.cabeceras["set-cookie"]![0]!).split(";")[0]!;
  return {
    ...studio,
    cookie,
    get: (ruta) => pedir(studio.puerto, "GET", ruta, { Cookie: cookie }),
    post: (ruta, cuerpo) => pedir(studio.puerto, "POST", ruta, { Cookie: cookie, "X-Phase-Gate": "1" }, JSON.stringify(cuerpo)),
  };
}

// git con autor fijo y sin firma, para repos de prueba.
export function git(dir: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Prueba", "-c", "user.email=prueba@ejemplo.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args],
    { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

// Todo lo que hay bajo unas carpetas, con su tamaño y fecha: para comprobar que nada cambió.
export function huellaDelArbol(...raices: string[]): string[] {
  const lineas: string[] = [];
  const recorrer = (carpeta: string): void => {
    for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const ruta = path.join(carpeta, entrada.name);
      const info = fs.lstatSync(ruta);
      lineas.push(`${ruta}|${entrada.isDirectory() ? "d" : info.size}|${info.mtimeMs}`);
      if (entrada.isDirectory() && !info.isSymbolicLink()) recorrer(ruta);
    }
  };
  for (const raiz of raices) if (fs.existsSync(raiz)) recorrer(raiz);
  return lineas;
}
