// Los tokens de color del Studio, leídos de sus hojas: cada variable que usa el código está definida en los
// dos temas (o en base.css, si no depende del tema), los dos bloques del oscuro dicen lo mismo, y los pares
// de colores que se leen o se distinguen cumplen el contraste de WCAG: 4.5:1 para el texto, 3:1 para lo
// que no es texto.

import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FUENTES = path.join(RAIZ, "studio", "src");
const ESTILOS = path.join(FUENTES, "estilos");

const leerCss = (archivo: string): string => fs.readFileSync(path.join(ESTILOS, archivo), "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

// Las declaraciones `--nombre: valor` de un bloque.
function declaraciones(bloque: string): Map<string, string> {
  return new Map([...bloque.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

function bloque(css: string, patron: RegExp, quien: string, minimo = 17): Map<string, string> {
  const m = patron.exec(css);
  assert.ok(m, `no encuentro el bloque ${quien}`);
  const mapa = declaraciones(m[1]!);
  assert.ok(mapa.size >= minimo, `${quien}: solo ${mapa.size} variables`);
  return mapa;
}

const claroCss = leerCss("tema-claro.css");
const oscuroCss = leerCss("tema-oscuro.css");
const claro = bloque(claroCss, /:root:not\(\[data-tema\]\),\s*:root\[data-tema="claro"\]\s*\{([^}]*)\}/, "del tema claro");
const oscuroDelSistema = bloque(oscuroCss, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-tema\]\)\s*\{([^}]*)\}\s*\}/, "del oscuro que sigue al sistema");
const oscuroElegido = bloque(oscuroCss, /:root\[data-tema="oscuro"\]\s*\{([^}]*)\}/, "del oscuro elegido");
// Lo que declara base.css, en :root o en una clase (--tono): no depende del tema.
const independientes = declaraciones(leerCss("base.css"));
assert.ok(["--radio", "--espacio", "--texto-cuerpo", "--texto-codigo", "--tono"].every((n) => independientes.has(n)), "base.css no declara lo que no depende del tema");

describe("Studio: los tokens de color", () => {
  it("cada variable que usa el código está definida en los dos temas, o en base.css si no depende del tema", () => {
    const archivos = fs
      .readdirSync(FUENTES, { recursive: true, encoding: "utf-8" })
      .filter((a) => /\.(?:css|tsx?)$/.test(a))
      .map((a) => path.join(FUENTES, a));
    assert.ok(archivos.length > 20, `solo ${archivos.length} archivos`);
    const usadas = new Set<string>();
    for (const archivo of archivos) {
      const texto = archivo.endsWith(".css") ? fs.readFileSync(archivo, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "") : fs.readFileSync(archivo, "utf-8");
      for (const m of texto.matchAll(/var\((--[a-z0-9-]+)/g)) usadas.add(m[1]!);
    }
    assert.ok(usadas.size > 15, `solo ${usadas.size} variables usadas`);
    for (const nombre of [...usadas].sort()) {
      if (independientes.has(nombre)) continue;
      assert.ok(claro.has(nombre), `${nombre} se usa y el tema claro no la define`);
      assert.ok(oscuroDelSistema.has(nombre), `${nombre} se usa y el oscuro que sigue al sistema no la define`);
      assert.ok(oscuroElegido.has(nombre), `${nombre} se usa y el oscuro elegido no la define`);
    }
  });

  it("los dos temas definen las mismas variables, y ninguna de ellas está también en base.css", () => {
    assert.deepEqual([...claro.keys()].sort(), [...oscuroElegido.keys()].sort());
    for (const nombre of independientes.keys()) assert.ok(!claro.has(nombre), `${nombre} está en base.css y en el tema claro`);
  });

  it("los dos bloques del oscuro tienen los mismos valores", () => {
    assert.deepEqual(Object.fromEntries(oscuroDelSistema), Object.fromEntries(oscuroElegido));
  });
});

// ─── Contraste ───────────────────────────────────────────────────────────────────────────────────────
function luminancia(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `${hex} no es un color #rrggbb`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const canal = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const [claro_, oscuro_] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro_ + 0.05) / (oscuro_ + 0.05);
}

const TEMAS = [
  ["claro", claro],
  ["oscuro", oscuroElegido],
] as const;
const FONDOS = ["fondo", "superficie", "superficie-2"];
const ESTADOS = ["verde", "ambar", "rojo", "violeta", "apagado"];

// Cada par: el primer color sobre el segundo, con el mínimo que se le pide.
function pares(tema: Map<string, string>, lista: [string, string][], minimo: number, nombreDelTema: string): void {
  const malos: string[] = [];
  for (const [delante, detras] of lista) {
    const color = tema.get(`--${delante}`);
    const fondo = tema.get(`--${detras}`);
    assert.ok(color && fondo, `${delante} o ${detras} no están definidos en el tema ${nombreDelTema}`);
    const razon = contraste(color, fondo);
    if (razon < minimo) malos.push(`${delante} (${color}) sobre ${detras} (${fondo}), tema ${nombreDelTema}: ${razon.toFixed(2)}:1, mínimo ${minimo}:1`);
  }
  assert.deepEqual(malos, []);
}

describe("Studio: el contraste de los tokens", () => {
  for (const [nombre, tema] of TEMAS) {
    it(`el texto cumple 4.5:1 sobre su fondo (${nombre})`, () => {
      const lista: [string, string][] = [];
      for (const fondo of FONDOS) for (const texto of ["texto", "texto-2", ...ESTADOS]) lista.push([texto, fondo]);
      lista.push(["sobre-acento", "acento"], ["acento", "acento-suave"], ["texto-banda", "banda"]);
      assert.ok(lista.length >= 18);
      pares(tema, lista, 4.5, nombre);
    });

    it(`lo que no es texto cumple 3:1 sobre los tres fondos (${nombre})`, () => {
      const lista: [string, string][] = [];
      for (const fondo of FONDOS) for (const color of ["acento", "borde-control"]) lista.push([color, fondo]);
      pares(tema, lista, 3, nombre);
    });
  }

  it("la función de contraste da las cifras de WCAG (negro sobre blanco 21:1, un color contra sí mismo 1:1)", () => {
    assert.equal(contraste("#000000", "#ffffff").toFixed(2), "21.00");
    assert.equal(contraste("#777777", "#777777").toFixed(2), "1.00");
    assert.equal(contraste("#767676", "#ffffff").toFixed(2), "4.54");
  });

  it("un par que no llega se señala con su par y su cifra", () => {
    const tema = new Map([
      ["--a", "#777777"],
      ["--b", "#888888"],
    ]);
    assert.throws(() => pares(tema, [["a", "b"]], 4.5, "de prueba"), (error: Error) => /a \(#777777\) sobre b \(#888888\), tema de prueba: 1\.\d\d:1, mínimo 4\.5:1/.test(error.message));
  });
});
