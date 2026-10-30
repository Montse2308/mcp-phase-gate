// Prueba de que entre dos commits solo cambiaron comentarios. Compila los dos sin comentarios y compara el
// resultado: si algo del código cambió, el compilado cambia; si solo cambió un comentario, queda idéntico.
//
// Uso: node scripts/comparar-comentarios.mjs <antes> <después> [--conservar]
//   <antes> y <después> son commits (cualquier cosa que entienda `git rev-parse`). Cada uno se extrae a una
//   carpeta temporal, sin tocar el árbol de trabajo. Las herramientas (tsc, vite) son las de este checkout,
//   las mismas para los dos lados. --conservar deja las carpetas temporales para mirar la salida.
//
// Sale con 0 si todo es idéntico, con 1 si algo cambió aparte de los comentarios y con 2 si el script no
// pudo comparar (argumentos, git o un compilador que falla).
//
// Qué se compara, cada cosa con su herramienta:
//   - src/ y test/: tsc con --removeComments, sin mapas de código (los .js y los .d.ts de src, y los de test);
//   - el código de studio/src, los e2e y las configuraciones del Studio: tsc con el tsconfig del Studio;
//   - los .mjs y los .js sueltos (scripts/, sitio/, studio/public/): tsc --allowJs --removeComments;
//   - el Studio: el build de Vite, con los nombres con hash, que ya cubren los CSS (el hash sale del
//     contenido ya sin comentarios). Los .js de studio/public/ se copian tal cual a dist/, así que se
//     comparan en el paso anterior y no aquí;
//   - los YAML y los JSON/JSONC (tsconfig, esquemas, referencias de los e2e), ya interpretados.
// Un archivo que existe en un lado y no en el otro cuenta como cambio. Lo que no pasa por ninguna de estas
// comparaciones (documentos, textos de prueba, CSS fuera del Studio) se avisa al final, sin fallar.

import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import ts from "typescript";
import { parseAllDocuments } from "yaml";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = path.join(raiz, "node_modules", "typescript", "bin", "tsc");
const vite = path.join(raiz, "node_modules", "vite", "bin", "vite.js");
const MAX_BUFFER = 256 * 1024 * 1024;

class ErrorDeHerramienta extends Error {}

function uso(mensaje) {
  if (mensaje) console.error(mensaje);
  console.error("Uso: node scripts/comparar-comentarios.mjs <antes> <después> [--conservar]");
  process.exit(2);
}

function git(args, entrada) {
  const r = spawnSync("git", args, { cwd: raiz, input: entrada, maxBuffer: MAX_BUFFER });
  if (r.status !== 0) throw new ErrorDeHerramienta(`git ${args.join(" ")} falló: ${String(r.stderr ?? r.error).trim()}`);
  return r.stdout;
}

function resolver(ref) {
  return git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).toString().trim();
}

// Cada archivo del commit, con su ruta (siempre con /) y su contenido, tal como lo guarda git: sin pasar por
// ningún filtro de finales de línea, así los dos lados se leen igual en cualquier sistema.
function archivosDe(commit) {
  const entradas = git(["ls-tree", "-r", "-z", "--full-tree", commit]).toString("utf-8").split("\0").filter(Boolean);
  const blobs = entradas
    .map((e) => /^(\d+) (\w+) ([0-9a-f]+)\t(.*)$/s.exec(e))
    .filter((m) => m && m[2] === "blob")
    .map((m) => ({ sha: m[3], ruta: m[4] }));
  const salida = git(["cat-file", "--batch"], blobs.map((b) => b.sha).join("\n") + "\n");
  let pos = 0;
  return blobs.map((b) => {
    const fin = salida.indexOf(0x0a, pos);
    const [, , tamano] = salida.subarray(pos, fin).toString("ascii").split(" ");
    const contenido = salida.subarray(fin + 1, fin + 1 + Number(tamano));
    pos = fin + 1 + Number(tamano) + 1;
    return { ruta: b.ruta, contenido };
  });
}

function escribir(carpeta, ruta, contenido) {
  const destino = path.join(carpeta, ...ruta.split("/"));
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, contenido);
}

function correr(titulo, cwd, args) {
  const r = spawnSync(process.execPath, args, { cwd, encoding: "utf-8", maxBuffer: MAX_BUFFER });
  if (r.status !== 0) {
    const cola = `${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-25).join("\n");
    throw new ErrorDeHerramienta(`${titulo} falló (código ${r.status}):\n${cola}`);
  }
}

// ruta relativa (con /) → huella del contenido de cada archivo de la carpeta.
function huellas(carpeta) {
  const mapa = new Map();
  if (!fs.existsSync(carpeta)) return mapa;
  for (const rel of fs.readdirSync(carpeta, { recursive: true, encoding: "utf-8" })) {
    const archivo = path.join(carpeta, rel);
    if (!fs.statSync(archivo).isFile()) continue;
    mapa.set(rel.split(path.sep).join("/"), crypto.createHash("sha256").update(fs.readFileSync(archivo)).digest("hex"));
  }
  return mapa;
}

const esYaml = (r) => /\.ya?ml$/.test(r);
const esJson = (r) => /\.jsonc?$/.test(r);
const esJsSuelto = (r) => /\.(mjs|js)$/.test(r);

// Los pasos: cada uno recibe el lado (su carpeta con el commit extraído, su carpeta de salida y los archivos)
// y deja en la salida lo que se va a comparar, dentro de las subcarpetas que nombra en `prefijos`. Todos dejan
// archivos, así la comparación es una sola.
const PASOS = [
  {
    titulo: "src/ y test/ sin comentarios (tsc)",
    prefijos: ["src/", "test/"],
    ejecutar(lado) {
      const base = ["--removeComments", "--sourceMap", "false", "--declarationMap", "false"];
      // src se emite a build/, donde lo esperan los e2e del paso siguiente (importan de ../../build/…).
      correr("tsc de src", lado.fuente, [tsc, "-p", "tsconfig.json", ...base]);
      fs.cpSync(path.join(lado.fuente, "build"), path.join(lado.salida, "src"), { recursive: true });
      correr("tsc de test", lado.fuente, [tsc, "-p", "tsconfig.test.json", ...base, "--outDir", path.join(lado.salida, "test")]);
    },
  },
  {
    titulo: "studio/src, e2e y configuraciones del Studio sin comentarios (tsc)",
    prefijos: ["studio-tsc/"],
    ejecutar(lado) {
      correr("tsc del Studio", lado.fuente, [
        tsc, "-p", "studio/tsconfig.json", "--noEmit", "false", "--removeComments", "--rootDir", ".",
        "--outDir", path.join(lado.salida, "studio-tsc"),
      ]);
    },
  },
  {
    titulo: ".mjs y .js sueltos sin comentarios (tsc --allowJs)",
    prefijos: ["sueltos/"],
    ejecutar(lado) {
      const sueltos = lado.archivos.map((a) => a.ruta).filter(esJsSuelto).sort();
      if (sueltos.length === 0) return;
      correr("tsc de los .mjs", lado.fuente, [
        tsc, "--ignoreConfig", "--allowJs", "--removeComments", "--target", "esnext", "--module", "nodenext",
        "--skipLibCheck", "--rootDir", ".", "--outDir", path.join(lado.salida, "sueltos"), ...sueltos,
      ]);
    },
  },
  {
    titulo: "El build del Studio (vite)",
    prefijos: ["studio-dist/"],
    ejecutar(lado) {
      correr("vite build", lado.fuente, [vite, "build", "--config", "studio/vite.config.ts", "--logLevel", "warn"]);
      const dist = path.join(lado.fuente, "studio", "dist");
      // Los .js de studio/public/ salen de dist/ copiados tal cual: sus comentarios se comparan arriba.
      const publicos = new Set(lado.archivos.map((a) => a.ruta).filter((r) => r.startsWith("studio/public/") && esJsSuelto(r)).map((r) => r.slice("studio/public/".length)));
      for (const rel of fs.readdirSync(dist, { recursive: true, encoding: "utf-8" })) {
        const origen = path.join(dist, rel);
        const clave = rel.split(path.sep).join("/");
        if (!fs.statSync(origen).isFile() || publicos.has(clave)) continue;
        const destino = path.join(lado.salida, "studio-dist", rel);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(origen, destino);
      }
    },
  },
  {
    titulo: "Los YAML, ya interpretados",
    prefijos: ["yaml/"],
    ejecutar(lado) {
      for (const { ruta, contenido } of lado.archivos.filter((a) => esYaml(a.ruta))) {
        const documentos = parseAllDocuments(contenido.toString("utf-8"));
        const errores = documentos.flatMap((d) => d.errors);
        if (errores.length > 0) throw new ErrorDeHerramienta(`${ruta} no es un YAML válido: ${errores[0].message}`);
        escribir(path.join(lado.salida, "yaml"), `${ruta}.json`, JSON.stringify(documentos.map((d) => d.toJS()), null, 1));
      }
    },
  },
  {
    titulo: "Los JSON y JSONC, ya interpretados",
    prefijos: ["json/"],
    ejecutar(lado) {
      for (const { ruta, contenido } of lado.archivos.filter((a) => esJson(a.ruta))) {
        // El lector de tsconfig de TypeScript acepta comentarios y comas finales, como los tsconfig.
        const { config, error } = ts.parseConfigFileTextToJson(ruta, contenido.toString("utf-8"));
        if (error) throw new ErrorDeHerramienta(`${ruta} no se pudo interpretar: ${ts.flattenDiagnosticMessageText(error.messageText, "\n")}`);
        escribir(path.join(lado.salida, "json"), `${ruta}.json`, JSON.stringify(config, null, 1));
      }
    },
  },
];

function primeraDiferencia(a, b) {
  const la = fs.readFileSync(a, "utf-8").split("\n");
  const lb = fs.readFileSync(b, "utf-8").split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      const corto = (s) => (s === undefined ? "(no hay línea)" : s.length > 140 ? `${s.slice(0, 140)}…` : s);
      return `línea ${i + 1}:\n      antes:   ${corto(la[i])}\n      después: ${corto(lb[i])}`;
    }
  }
  return "";
}

// Lo que cambió entre los dos commits y ninguna comparación mira: se avisa, no se falla.
function sinComparar(antes, despues) {
  const cambiados = git(["diff", "--name-only", "-z", antes, despues]).toString("utf-8").split("\0").filter(Boolean);
  const cubierto = (r) => /\.(ts|tsx|mjs|js|ya?ml|jsonc?)$/.test(r) || (r.startsWith("studio/src/") && r.endsWith(".css"));
  return cambiados.filter((r) => !cubierto(r));
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { conservar: { type: "boolean", default: false } } });
if (positionals.length !== 2) uso("Hacen falta dos commits.");

let temporal;
try {
  const [antes, despues] = positionals.map((ref) => {
    try {
      return resolver(ref);
    } catch {
      return uso(`No encuentro el commit «${ref}».`);
    }
  });
  temporal = fs.mkdtempSync(path.join(os.tmpdir(), "comparar-comentarios-"));

  const lados = [
    ["antes", antes],
    ["después", despues],
  ].map(([nombre, commit], i) => {
    const carpeta = path.join(temporal, i === 0 ? "antes" : "despues");
    const fuente = path.join(carpeta, "fuente");
    const archivos = archivosDe(commit);
    for (const a of archivos) escribir(fuente, a.ruta, a.contenido);
    // Las herramientas son las de este checkout: se enlazan sus node_modules, sin copiarlos.
    fs.symlinkSync(path.join(raiz, "node_modules"), path.join(fuente, "node_modules"), "junction");
    console.log(`${nombre}: ${commit.slice(0, 12)} (${archivos.length} archivos)`);
    return { nombre, commit, fuente, salida: path.join(carpeta, "salida"), archivos };
  });

  let distintos = 0;
  for (const paso of PASOS) {
    for (const lado of lados) paso.ejecutar(lado);
  }
  const [salidaAntes, salidaDespues] = lados.map((lado) => huellas(lado.salida));
  for (const paso of PASOS) {
    const mio = (clave) => paso.prefijos.some((p) => clave.startsWith(p));
    const a = new Map([...salidaAntes].filter(([k]) => mio(k)));
    const d = new Map([...salidaDespues].filter(([k]) => mio(k)));
    const soloAntes = [...a.keys()].filter((k) => !d.has(k));
    const soloDespues = [...d.keys()].filter((k) => !a.has(k));
    const cambiados = [...a.keys()].filter((k) => d.has(k) && d.get(k) !== a.get(k));
    const total = soloAntes.length + soloDespues.length + cambiados.length;
    console.log(`\n${total === 0 ? "✔" : "✘"} ${paso.titulo}: ${a.size} archivos${total === 0 ? ", idénticos" : `, ${total} distintos`}`);
    if (total === 0) continue;
    distintos += total;
    const mostrar = (lista, rotulo) => lista.slice(0, 15).forEach((k) => console.log(`    ${rotulo} ${k}`));
    mostrar(soloAntes, "solo antes:  ");
    mostrar(soloDespues, "solo después:");
    for (const k of cambiados.slice(0, 15)) {
      const pista = /\.(m?js|json|css|html|ts)$/.test(k)
        ? primeraDiferencia(path.join(lados[0].salida, ...k.split("/")), path.join(lados[1].salida, ...k.split("/")))
        : "";
      console.log(`    distinto:     ${k}${pista ? `, ${pista}` : ""}`);
    }
    const resto = total - Math.min(soloAntes.length, 15) - Math.min(soloDespues.length, 15) - Math.min(cambiados.length, 15);
    if (resto > 0) console.log(`    … y ${resto} más`);
  }

  const fuera = sinComparar(antes, despues);
  if (fuera.length > 0) {
    console.log(`\nAviso: ${fuera.length} archivos cambiaron y esta prueba no los compara (no es un fallo):`);
    fuera.slice(0, 15).forEach((r) => console.log(`    ${r}`));
    if (fuera.length > 15) console.log(`    … y ${fuera.length - 15} más`);
  }

  console.log(distintos === 0 ? "\nIDÉNTICO: entre los dos commits solo cambiaron comentarios." : `\nDISTINTO: ${distintos} diferencias que no son comentarios.`);
  process.exitCode = distintos === 0 ? 0 : 1;
} catch (error) {
  console.error(`\nNo se pudo comparar: ${error instanceof ErrorDeHerramienta ? error.message : error.stack}`);
  process.exitCode = 2;
} finally {
  if (temporal && !values.conservar) {
    // Primero se quitan los enlaces a node_modules, para que el borrado recursivo nunca pueda seguirlos.
    for (const lado of ["antes", "despues"]) {
      const enlace = path.join(temporal, lado, "fuente", "node_modules");
      try {
        fs.rmdirSync(enlace);
      } catch {
        /* no se llegó a crear */
      }
    }
    fs.rmSync(temporal, { recursive: true, force: true });
  } else if (temporal) {
    console.log(`\nCarpetas temporales conservadas en ${temporal}`);
  }
}
