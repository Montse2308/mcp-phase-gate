// La seguridad del servidor local del Studio: cada fila del filtro y del modelo de
// amenazas. Las peticiones salen por un socket crudo (net) y no por http.request, que normaliza lo
// que aquí se quiere romper: cabeceras repetidas, rutas con barras invertidas o sin codificar, un
// Host ausente o un cuerpo que llega a trozos.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { after, afterEach, describe, it } from "node:test";

import { ejecutarCli } from "../src/cli.js";
import { CSP, CUERPO_MAXIMO, URL_ABRIBLE, abrir, arrancarStudio, igualesEnTiempoConstante, nombreDeCookie, rutaDeEstatico } from "../src/studio/servidor.js";
import type { Studio } from "../src/studio/servidor.js";
import { carpetaTemporal, crearSymlink, limpiarEntorno } from "./helpers.js";

afterEach(limpiarEntorno);

// ─── Utilidades ─────────────────────────────────────────────────────────────
type Respuesta = { estado: number; cabeceras: Map<string, string[]>; cuerpo: string };

function parsear(texto: string): Respuesta {
  const fin = texto.indexOf("\r\n\r\n");
  const [linea = "", ...resto] = texto.slice(0, fin === -1 ? texto.length : fin).split("\r\n");
  const cabeceras = new Map<string, string[]>();
  for (const l of resto) {
    const i = l.indexOf(":");
    const nombre = l.slice(0, i).trim().toLowerCase();
    cabeceras.set(nombre, [...(cabeceras.get(nombre) ?? []), l.slice(i + 1).trim()]);
  }
  return { estado: Number(linea.split(" ")[1]), cabeceras, cuerpo: fin === -1 ? "" : texto.slice(fin + 4) };
}

// Manda la petición tal cual y lee hasta que el servidor cierra (o hasta tener la respuesta entera,
// por Content-Length, si la conexión se queda abierta).
function crudo(puerto: number, peticion: string | Buffer, opciones: { esperarCierre?: boolean } = {}): Promise<Respuesta> {
  return new Promise((resolver, rechazar) => {
    const socket = net.connect(puerto, "127.0.0.1");
    let datos = Buffer.alloc(0);
    let resuelto = false;
    const terminar = (): void => {
      if (resuelto) return;
      resuelto = true;
      socket.destroy();
      resolver(parsear(datos.toString("utf-8")));
    };
    socket.on("data", (trozo: Buffer) => {
      datos = Buffer.concat([datos, trozo]);
      const texto = datos.toString("utf-8");
      const fin = texto.indexOf("\r\n\r\n");
      if (fin !== -1 && !opciones.esperarCierre) {
        const largo = Number(parsear(texto).cabeceras.get("content-length")?.[0] ?? NaN);
        if (Number.isFinite(largo) && Buffer.byteLength(texto.slice(fin + 4)) >= largo) terminar();
      }
    });
    socket.on("end", terminar);
    socket.on("close", terminar);
    socket.on("error", (error) => (resuelto ? undefined : rechazar(error)));
    socket.write(peticion);
  });
}

function get(puerto: number, ruta: string, cabeceras: string[] = [], host = `127.0.0.1:${puerto}`): Promise<Respuesta> {
  const lineas = [`GET ${ruta} HTTP/1.1`, ...(host ? [`Host: ${host}`] : []), ...cabeceras, "Connection: close", "", ""];
  return crudo(puerto, lineas.join("\r\n"));
}

const abiertos: Studio[] = [];
after(async () => {
  for (const studio of abiertos) await studio.cerrar();
});

// Una carpeta dist de mentira, con un secreto al lado (fuera de ella).
function distDePrueba(): { dist: string; fuera: string } {
  const raiz = carpetaTemporal("studio");
  const dist = path.join(raiz, "dist");
  const fuera = path.join(raiz, "fuera");
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  fs.mkdirSync(fuera);
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>Studio</title>", "utf-8");
  fs.writeFileSync(path.join(dist, "assets", "app.js"), "console.log(1)", "utf-8");
  fs.writeFileSync(path.join(dist, ".oculto"), "no", "utf-8");
  fs.writeFileSync(path.join(fuera, "secreto.txt"), "SECRETO", "utf-8");
  fs.writeFileSync(path.join(raiz, "secreto.txt"), "SECRETO", "utf-8");
  return { dist, fuera };
}

async function studio(extra: Parameters<typeof arrancarStudio>[0] = {}): Promise<Studio & { token: string; dist: string; fuera: string }> {
  const { dist, fuera } = distDePrueba();
  const s = await arrancarStudio({ dist, ...extra });
  abiertos.push(s);
  return { ...s, token: new URL(s.url).searchParams.get("token")!, dist, fuera };
}

// Canjea el token y devuelve la cabecera Cookie para las siguientes peticiones.
async function sesion(s: { puerto: number; token: string }): Promise<string> {
  const r = await get(s.puerto, `/?token=${s.token}`);
  assert.equal(r.estado, 303);
  const valor = r.cabeceras.get("set-cookie")![0]!.split(";")[0]!;
  return `Cookie: ${valor}`;
}

// ─── Arranque ───────────────────────────────────────────────────────────────
describe("Studio: arranque", () => {
  it("escucha solo en 127.0.0.1, en un puerto libre, y no hay opción para otra interfaz", async () => {
    const s = await studio();
    const direccion = s.servidor.address() as net.AddressInfo;
    assert.equal(direccion.address, "127.0.0.1");
    assert.ok(direccion.port > 0);
    assert.match(s.url, new RegExp(`^http://127\\.0\\.0\\.1:${s.puerto}/\\?token=[A-Za-z0-9_-]{43}$`));
  });

  it("el token son 32 bytes en base64url, distintos en cada arranque", async () => {
    const a = await studio();
    const b = await studio();
    assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a.token, b.token);
  });

  it("ui y sus banderas en la CLI; una bandera de otro subcomando es un error", () => {
    const salida = { out: () => {}, err: () => {} };
    assert.deepEqual(ejecutarCli(["ui"], salida), { accion: "ui", opciones: { puerto: null, abrir: true, demo: false } });
    assert.deepEqual(ejecutarCli(["ui", "--puerto", "4321", "--no-abrir"], salida), { accion: "ui", opciones: { puerto: 4321, abrir: false, demo: false } });
    assert.deepEqual(ejecutarCli(["ui", "--demo", "--no-abrir"], salida), { accion: "ui", opciones: { puerto: null, abrir: false, demo: true } });
    // La demo en un idioma.
    assert.deepEqual(ejecutarCli(["ui", "--demo", "--idioma", "en"], salida), { accion: "ui", opciones: { puerto: null, abrir: true, demo: true, idioma: "en" } });
    // --export-static no arranca el Studio: nunca abre nada.
    assert.deepEqual(ejecutarCli(["ui", "--export-static", "sitio"], salida), { accion: "ui", opciones: { puerto: null, abrir: false, demo: false, exportar: { destino: "sitio", datosReales: false, yes: false } } });
    assert.deepEqual(ejecutarCli(["ui", "--export-static", "sitio", "--incluir-datos-reales", "--yes"], salida), {
      accion: "ui",
      opciones: { puerto: null, abrir: false, demo: false, exportar: { destino: "sitio", datosReales: true, yes: true } },
    });
    for (const malo of [
      ["ui", "--puerto", "0"],
      ["ui", "--puerto", "70000"],
      ["ui", "--puerto", "12a"],
      ["ui", "--json"],
      ["doctor", "--no-abrir"],
      ["doctor", "--demo"],
      ["ui", "extra"],
      ["ui", "--export-static"],
      ["ui", "--export-static", " "],
      ["ui", "--export-static", "sitio", "--demo"],
      ["ui", "--export-static", "sitio", "--no-abrir"],
      ["ui", "--export-static", "sitio", "--puerto", "4321"],
      ["ui", "--incluir-datos-reales"],
      ["ui", "--yes"],
      ["doctor", "--export-static", "sitio"],
      ["init", "--incluir-datos-reales"],
      ["ui", "--idioma", "en"],
      ["ui", "--demo", "--idioma", "fr"],
      ["ui", "--export-static", "sitio", "--idioma", "en"],
    ]) {
      assert.deepEqual(ejecutarCli(malo, salida), { accion: "salir", codigo: 2 }, malo.join(" "));
    }
  });
});

// ─── Abrir el navegador ─────────────────────────────────────────────────────
describe("Studio: abrir el navegador", () => {
  it("valida la URL antes del execFile, con el comando de cada sistema (sin abrir ninguno de verdad)", () => {
    const llamadas: [string, string[]][] = [];
    const doble = (comando: string, args: string[]) => {
      llamadas.push([comando, args]);
      return null;
    };
    const url = "http://127.0.0.1:4321/?token=abc_DEF-123";
    assert.ok(abrir(url, "win32", doble));
    assert.ok(abrir(url, "darwin", doble));
    assert.ok(abrir(url, "linux", doble));
    assert.deepEqual(llamadas, [
      ["cmd", ["/c", "start", "", url]],
      ["open", [url]],
      ["xdg-open", [url]],
    ]);

    // Un & partiría el comando de cmd; tampoco espacios, comillas ni %.
    for (const mala of ["http://127.0.0.1:1/?token=a&calc", "http://127.0.0.1:1/ x", 'http://127.0.0.1:1/"', "http://127.0.0.1:1/%41", "http://127.0.0.1:1/|x"]) {
      assert.equal(abrir(mala, "win32", doble), false, mala);
    }
    assert.equal(llamadas.length, 3);
    assert.ok(URL_ABRIBLE.test("http://127.0.0.1:65535/?token=" + "A".repeat(43)));
  });
});

// ─── 1. Host ────────────────────────────────────────────────────────────────
describe("Studio: Host (DNS rebinding)", () => {
  it("vale 127.0.0.1:<puerto> y localhost:<puerto>", async () => {
    const s = await studio();
    assert.equal((await get(s.puerto, "/", [], `127.0.0.1:${s.puerto}`)).estado, 200);
    assert.equal((await get(s.puerto, "/", [], `localhost:${s.puerto}`)).estado, 200);
  });

  it("cualquier otro Host es 421: otro nombre, otro puerto, sin puerto, puerto de más, mayúsculas, ausente o repetido", async () => {
    const s = await studio();
    const p = s.puerto;
    for (const host of ["atacante.example", `atacante.example:${p}`, `127.0.0.1:${p + 1}`, "127.0.0.1", `127.0.0.1:${p}:${p}`, `LOCALHOST:${p}`, `Localhost:${p}`, `[::1]:${p}`, `0.0.0.0:${p}`, ` 127.0.0.1:${p}x`]) {
      assert.equal((await get(p, "/", [], host)).estado, 421, host);
    }
    // Ausente (HTTP/1.1 y HTTP/1.0) y repetido.
    assert.equal((await get(p, "/", [], "")).estado, 421);
    assert.equal((await crudo(p, "GET / HTTP/1.0\r\n\r\n")).estado, 421);
    assert.equal((await get(p, "/", [`Host: atacante.example`])).estado, 421);
    assert.equal((await get(p, "/", [`Host: 127.0.0.1:${p}`])).estado, 421);
  });

  // El texto del filtro ya no está fijo en español: sale en el idioma del
  // proceso (la cabecera de idioma de la petición no cuenta aquí: el filtro no la lee), y en español es el de siempre.
  it("el texto del filtro sale en el idioma del proceso; la cabecera de idioma no lo cambia", async () => {
    const s = await studio();
    const p = s.puerto;
    assert.equal((await get(p, "/", [], "atacante.example")).cuerpo, "Host no permitido: el Studio solo atiende en 127.0.0.1 y localhost, con su puerto.");
    assert.equal((await get(p, "/no-existe.js")).cuerpo, "No existe.");
    process.env.PHASE_GATE_LANG = "en";
    assert.equal((await get(p, "/no-existe.js")).cuerpo, "Not found.");
    assert.equal((await get(p, "/no-existe.js", ["X-Phase-Gate-Lang: es"])).cuerpo, "Not found.");
    assert.equal((await get(p, "/", [], "atacante.example")).cuerpo, "Host not allowed: the Studio only answers on 127.0.0.1 and localhost, with its port.");
    assert.equal((await get(p, "/", ["X-Phase-Gate-Lang: es"], "atacante.example")).cuerpo, "Host not allowed: the Studio only answers on 127.0.0.1 and localhost, with its port.");
    assert.equal((await get(p, "/api/estado", [])).cuerpo, "There is no session: open the link that `mcp-phase-gate ui` printed.");
  });

  it("el 421 llega antes que nada: ni el canje del token ni la API", async () => {
    const s = await studio();
    const r = await get(s.puerto, `/?token=${s.token}`, [], "atacante.example");
    assert.equal(r.estado, 421);
    assert.equal(r.cabeceras.get("set-cookie"), undefined);
    // El token sigue valiendo: un intento con otro Host no lo gastó.
    assert.equal((await get(s.puerto, `/?token=${s.token}`)).estado, 303);
  });
});

// ─── 2. Origin ──────────────────────────────────────────────────────────────
describe("Studio: Origin (otra web del navegador)", () => {
  it("sin Origin, o con el del Studio, pasa", async () => {
    const s = await studio();
    assert.equal((await get(s.puerto, "/")).estado, 200);
    assert.equal((await get(s.puerto, "/", [`Origin: http://127.0.0.1:${s.puerto}`])).estado, 200);
    assert.equal((await get(s.puerto, "/", [`Origin: http://localhost:${s.puerto}`])).estado, 200);
  });

  it("null, otro origen, otro puerto, https o dos Origin son 403", async () => {
    const s = await studio();
    const p = s.puerto;
    for (const origen of ["null", "http://atacante.example", `http://127.0.0.1:${p + 1}`, `https://127.0.0.1:${p}`, `http://127.0.0.1:${p}/`, "", `HTTP://127.0.0.1:${p}`]) {
      assert.equal((await get(p, "/", [`Origin: ${origen}`])).estado, 403, origen);
    }
    assert.equal((await get(p, "/", [`Origin: http://127.0.0.1:${p}`, "Origin: http://atacante.example"])).estado, 403);
  });
});

// ─── 3. Token ───────────────────────────────────────────────────────────────
describe("Studio: canje del token", () => {
  it("el token correcto da 303 a / con una cookie HttpOnly, SameSite=Strict y Path=/, de otro valor", async () => {
    const s = await studio();
    const r = await get(s.puerto, `/?token=${s.token}`);
    assert.equal(r.estado, 303);
    assert.equal(r.cabeceras.get("location")?.[0], "/");
    const cookie = r.cabeceras.get("set-cookie")![0]!;
    const [par = "", ...atributos] = cookie.split(";").map((p) => p.trim());
    const [nombre, valor] = par.split("=");
    assert.equal(nombre, nombreDeCookie(s.puerto));
    assert.match(valor!, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(valor, s.token);
    assert.deepEqual(atributos.sort(), ["HttpOnly", "Path=/", "SameSite=Strict"]);
    assert.equal(r.cabeceras.get("cache-control")?.[0], "no-store");
  });

  it("es de un solo uso: la copia del historial da 401", async () => {
    const s = await studio();
    assert.equal((await get(s.puerto, `/?token=${s.token}`)).estado, 303);
    const otra = await get(s.puerto, `/?token=${s.token}`);
    assert.equal(otra.estado, 401);
    assert.equal(otra.cabeceras.get("set-cookie"), undefined);
  });

  it("un token incorrecto, vacío, más corto o más largo, o repetido, es 401 (sin tumbar el servidor ni gastar el bueno)", async () => {
    const s = await studio();
    for (const malo of ["", "x", s.token.slice(0, -1), `${s.token}A`, `${s.token.slice(0, -1)}${s.token.endsWith("A") ? "B" : "A"}`, "%00", "ñ".repeat(43)]) {
      assert.equal((await get(s.puerto, `/?token=${encodeURIComponent(malo)}`)).estado, 401, malo);
    }
    assert.equal((await get(s.puerto, `/?token=${s.token}&token=${s.token}`)).estado, 401);
    assert.equal((await get(s.puerto, `/?token=${s.token}`)).estado, 303);
  });

  it("igualesEnTiempoConstante no lanza con longitudes distintas", () => {
    assert.equal(igualesEnTiempoConstante("abc", "abcd"), false);
    assert.equal(igualesEnTiempoConstante("", "a"), false);
    assert.equal(igualesEnTiempoConstante("ñ", "nn"), false); // misma longitud en caracteres, no en bytes
    assert.equal(igualesEnTiempoConstante("abc", "abc"), true);
  });

  it("el canje solo vale con GET: un POST con el token no da cookie", async () => {
    const s = await studio();
    const r = await crudo(s.puerto, `POST /?token=${s.token} HTTP/1.1\r\nHost: 127.0.0.1:${s.puerto}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
    assert.equal(r.estado, 403);
    assert.equal(r.cabeceras.get("set-cookie"), undefined);
    assert.equal((await get(s.puerto, `/?token=${s.token}`)).estado, 303);
  });
});

// ─── 4. Cookie en la API ────────────────────────────────────────────────────
describe("Studio: la API exige la sesión", () => {
  it("sin cookie, con otra, malformada, repetida o del puerto de otro Studio: 401", async () => {
    const s = await studio();
    const buena = await sesion(s);
    const valor = buena.split("=")[1]!;
    const nombre = nombreDeCookie(s.puerto);
    for (const cabeceras of [
      [],
      [`Cookie: ${nombre}=otra`],
      [`Cookie: ${nombre}`],
      [`Cookie: ${nombre}; ${nombre}=${valor}`],
      [`Cookie: ${nombre}=`],
      [`Cookie: ${nombre}=${valor}; ${nombre}=${valor}`],
      [`Cookie: ${nombre}=${valor}`, `Cookie: ${nombre}=x`],
      [`Cookie: ${nombreDeCookie(s.puerto + 1)}=${valor}`],
      [`Cookie: ${nombre}=${valor.slice(0, -1)}`],
    ]) {
      const r = await get(s.puerto, "/api/estado", cabeceras);
      assert.equal(r.estado, 401, cabeceras.join(" | "));
      assert.equal(r.cabeceras.get("cache-control")?.[0], "no-store");
    }
    // Con la buena, la petición llega a la API (que en este arranque no tiene rutas).
    const r = await get(s.puerto, "/api/estado", [buena]);
    assert.equal(r.estado, 404);
    assert.equal(r.cabeceras.get("content-type")?.[0], "application/json; charset=utf-8");
  });

  it("la cookie de un Studio no vale en otro", async () => {
    const a = await studio();
    const b = await studio();
    const deA = await sesion(a);
    assert.equal((await get(b.puerto, "/api/estado", [deA.replace(nombreDeCookie(a.puerto), nombreDeCookie(b.puerto))])).estado, 401);
  });
});

// ─── 5. Métodos y cuerpo ────────────────────────────────────────────────────
function post(puerto: number, ruta: string, cabeceras: string[], cuerpo = ""): Promise<Respuesta> {
  const lineas = [`POST ${ruta} HTTP/1.1`, `Host: 127.0.0.1:${puerto}`, ...cabeceras, `Content-Length: ${Buffer.byteLength(cuerpo)}`, "Connection: close", "", cuerpo];
  return crudo(puerto, lineas.join("\r\n"));
}

describe("Studio: métodos distintos de GET", () => {
  it("sin X-Phase-Gate: 1 son 403, con la sesión válida; HEAD y OPTIONS también, sin cabeceras CORS", async () => {
    const s = await studio();
    const cookie = await sesion(s);
    assert.equal((await post(s.puerto, "/api/acciones/plan", [cookie], "{}")).estado, 403);
    assert.equal((await post(s.puerto, "/api/acciones/plan", [cookie, "X-Phase-Gate: 0"], "{}")).estado, 403);
    assert.equal((await post(s.puerto, "/api/acciones/plan", [cookie, "X-Phase-Gate: 1", "X-Phase-Gate: 1"], "{}")).estado, 403);
    for (const metodo of ["HEAD", "PUT", "DELETE", "PATCH"]) {
      const r = await crudo(s.puerto, `${metodo} /api/estado HTTP/1.1\r\nHost: 127.0.0.1:${s.puerto}\r\n${cookie}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`, { esperarCierre: true });
      assert.equal(r.estado, 403, metodo);
    }
    // El preflight de un navegador: OPTIONS con Origin ajeno y Access-Control-Request-*.
    const preflight = await crudo(
      s.puerto,
      `OPTIONS /api/acciones/plan HTTP/1.1\r\nHost: 127.0.0.1:${s.puerto}\r\nOrigin: http://atacante.example\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: x-phase-gate\r\nConnection: close\r\n\r\n`
    );
    assert.equal(preflight.estado, 403);
    const delMismo = await crudo(
      s.puerto,
      `OPTIONS /api/acciones/plan HTTP/1.1\r\nHost: 127.0.0.1:${s.puerto}\r\nOrigin: http://127.0.0.1:${s.puerto}\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: x-phase-gate\r\nConnection: close\r\n\r\n`
    );
    // Del mismo origen, un preflight no lleva cookies: lo para el paso 4 (401) antes que el 5.
    assert.equal(delMismo.estado, 401);
    const conCookie = await crudo(
      s.puerto,
      `OPTIONS /api/acciones/plan HTTP/1.1\r\nHost: 127.0.0.1:${s.puerto}\r\n${cookie}\r\nAccess-Control-Request-Method: POST\r\nConnection: close\r\n\r\n`
    );
    assert.equal(conCookie.estado, 403);
    for (const r of [preflight, delMismo, conCookie]) {
      assert.ok(![...r.cabeceras.keys()].some((nombre) => nombre.startsWith("access-control-")), "nunca se conceden cabeceras CORS");
    }
  });

  it("sin la sesión, un POST a la API es 401 antes de mirar la cabecera", async () => {
    const s = await studio();
    assert.equal((await post(s.puerto, "/api/acciones/plan", ["X-Phase-Gate: 1"], "{}")).estado, 401);
  });

  it("un cuerpo que declara más de 64 kB es 413 sin leerlo", async () => {
    const s = await studio();
    const cookie = await sesion(s);
    const r = await crudo(s.puerto, `POST /api/x HTTP/1.1\r\nHost: 127.0.0.1:${s.puerto}\r\n${cookie}\r\nX-Phase-Gate: 1\r\nContent-Length: ${CUERPO_MAXIMO + 1}\r\n\r\n`);
    assert.equal(r.estado, 413);
  });

  it("un cuerpo por trozos se corta en cuanto pasa de 64 kB, mientras llega, sin esperar al final", async () => {
    const s = await studio();
    const cookie = await sesion(s);
    const respuesta = await new Promise<Respuesta>((resolver, rechazar) => {
      const socket = net.connect(s.puerto, "127.0.0.1");
      let datos = "";
      socket.on("data", (trozo) => (datos += trozo.toString("utf-8")));
      socket.on("close", () => resolver(parsear(datos)));
      socket.on("error", (e) => (datos ? resolver(parsear(datos)) : rechazar(e)));
      socket.write(`POST /api/x HTTP/1.1\r\nHost: 127.0.0.1:${s.puerto}\r\n${cookie}\r\nX-Phase-Gate: 1\r\nTransfer-Encoding: chunked\r\n\r\n`);
      // 70 kB en trozos de 7 kB, y NUNCA el trozo final: si el servidor esperara al final, no respondería.
      const trozo = "a".repeat(7 * 1024);
      for (let i = 0; i < 10; i++) socket.write(`${trozo.length.toString(16)}\r\n${trozo}\r\n`);
    });
    assert.equal(respuesta.estado, 413);
  });

  it("un cuerpo que no es JSON es 400; uno válido llega a la API", async () => {
    const s = await studio();
    const cookie = await sesion(s);
    assert.equal((await post(s.puerto, "/api/x", [cookie, "X-Phase-Gate: 1"], "{no")).estado, 400);
    assert.equal((await post(s.puerto, "/api/x", [cookie, "X-Phase-Gate: 1"], '{"a":1}')).estado, 404);
  });

  it("un POST a un estático, con todo en regla, es 405", async () => {
    const s = await studio();
    const cookie = await sesion(s);
    assert.equal((await post(s.puerto, "/index.html", [cookie, "X-Phase-Gate: 1"], "{}")).estado, 405);
  });
});

// ─── 6. Estáticos ───────────────────────────────────────────────────────────
describe("Studio: estáticos, solo dentro de dist", () => {
  it("sirve / e index.html, y los assets con su tipo", async () => {
    const s = await studio();
    const raiz = await get(s.puerto, "/");
    assert.equal(raiz.estado, 200);
    assert.match(raiz.cuerpo, /<title>Studio<\/title>/);
    assert.equal(raiz.cabeceras.get("content-type")?.[0], "text/html; charset=utf-8");
    const js = await get(s.puerto, "/assets/app.js");
    assert.equal(js.estado, 200);
    assert.equal(js.cabeceras.get("content-type")?.[0], "text/javascript; charset=utf-8");
  });

  it("nada fuera de dist: .., %2e%2e, %2f, %5c, doble codificación, NUL, \\, ::$DATA, nombres con punto o reservados", async () => {
    const s = await studio();
    const rutas = [
      "/../secreto.txt",
      "/../fuera/secreto.txt",
      "/%2e%2e/secreto.txt",
      "/%2E%2E/fuera/secreto.txt",
      "/assets/%2e%2e/%2e%2e/secreto.txt",
      // Con la normalización de WHATWG sería /index.html: aquí %2e%2e se decodifica a ".." y se rechaza.
      "/assets/%2e%2e/index.html",
      "/assets/../index.html",
      "/..%2fsecreto.txt",
      "/..%2Ffuera%2Fsecreto.txt",
      "/..%5csecreto.txt",
      "/..%5Cfuera%5Csecreto.txt",
      "/%252e%252e/secreto.txt",
      "/%252e%252e%252fsecreto.txt",
      "/index.html%00.js",
      "/index.html%00",
      "/..\\secreto.txt",
      "/assets\\..\\..\\secreto.txt",
      "/index.html::$DATA",
      "/index.html:$DATA",
      "/.oculto",
      "/assets/.",
      "/con",
      "/aux.js",
      "/%",
      "/%zz",
      "/index.html%20",
      "/index.html.",
    ];
    for (const ruta of rutas) {
      const r = await get(s.puerto, ruta);
      assert.ok(r.estado === 404 || r.estado === 400, `${ruta} → ${r.estado}`);
      assert.doesNotMatch(r.cuerpo, /SECRETO/, ruta);
    }
  });

  it("una junction o un enlace dentro de dist que lleva fuera da 404", async (t) => {
    const s = await studio();
    crearSymlink(s.fuera, path.join(s.dist, "enlace-largo-afuera"));
    const r = await get(s.puerto, "/enlace-largo-afuera/secreto.txt");
    assert.equal(r.estado, 404);
    assert.doesNotMatch(r.cuerpo, /SECRETO/);
    // Por su nombre corto 8.3, si el volumen lo genera.
    const corto = path.join(s.dist, "ENLACE~1");
    if (fs.existsSync(corto)) {
      const r83 = await get(s.puerto, "/ENLACE~1/secreto.txt");
      assert.equal(r83.estado, 404);
    } else {
      t.diagnostic("este volumen no genera nombres cortos 8.3: solo se probó el nombre largo");
    }
    // Un enlace de archivo (en Windows exige permisos; si no se puede crear, se dice).
    try {
      fs.symlinkSync(path.join(s.fuera, "secreto.txt"), path.join(s.dist, "secreto.txt"), "file");
      const enlace = await get(s.puerto, "/secreto.txt");
      assert.equal(enlace.estado, 404);
      assert.doesNotMatch(enlace.cuerpo, /SECRETO/);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      t.diagnostic("sin permiso para crear un enlace simbólico de archivo: solo se probó la junction");
    }
  });

  it("con otras mayúsculas nunca sale de dist (en Windows abre el mismo archivo, en Linux no existe)", async () => {
    const s = await studio();
    for (const ruta of ["/INDEX.HTML", "/Assets/App.js", "/ASSETS/../secreto.txt"]) {
      const r = await get(s.puerto, ruta);
      assert.ok(r.estado === 200 || r.estado === 404, `${ruta} → ${r.estado}`);
      assert.doesNotMatch(r.cuerpo, /SECRETO/);
    }
  });

  it("rutaDeEstatico decodifica una sola vez", () => {
    const { dist } = distDePrueba();
    fs.writeFileSync(path.join(dist, "%2e%2e"), "literal", "utf-8");
    // %252e%252e decodifica a "%2e%2e", el nombre literal de un archivo que SÍ está en dist.
    assert.equal(rutaDeEstatico(dist, "/%252e%252e"), path.join(dist, "%2e%2e"));
    assert.equal(rutaDeEstatico(dist, "/%2e%2e"), null);
  });

  it("una petición que no empieza por / es 400 (forma absoluta)", async () => {
    const s = await studio();
    const r = await crudo(s.puerto, `GET http://atacante.example/ HTTP/1.1\r\nHost: 127.0.0.1:${s.puerto}\r\nConnection: close\r\n\r\n`);
    assert.equal(r.estado, 400);
  });
});

// ─── Cabeceras de toda respuesta ────────────────────────────────────────────
describe("Studio: cabeceras de toda respuesta", () => {
  it("CSP sin unsafe-inline, nosniff y no-referrer en 200, 303, 401, 403, 404 y 421; no-store en la API", async () => {
    const s = await studio();
    const cookie = await sesion(s);
    const respuestas = [
      await get(s.puerto, "/"),
      await get(s.puerto, "/no-existe"),
      await get(s.puerto, "/api/estado"),
      await get(s.puerto, "/api/estado", [cookie]),
      await get(s.puerto, "/", ["Origin: null"]),
      await get(s.puerto, "/", [], "atacante.example"),
      await get(s.puerto, `/?token=malo`),
    ];
    for (const r of respuestas) {
      assert.equal(r.cabeceras.get("content-security-policy")?.[0], CSP, String(r.estado));
      assert.equal(r.cabeceras.get("x-content-type-options")?.[0], "nosniff");
      assert.equal(r.cabeceras.get("referrer-policy")?.[0], "no-referrer");
    }
    assert.doesNotMatch(CSP, /unsafe-inline|unsafe-eval/);
    assert.match(CSP, /frame-ancestors 'none'/);
    assert.equal(respuestas[3]!.cabeceras.get("cache-control")?.[0], "no-store");
  });
});
