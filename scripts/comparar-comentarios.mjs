// Prueba de que entre dos commits solo cambiaron comentarios. Compila los dos sin comentarios y compara el
// resultado: si algo del código cambió, el compilado cambia; si solo cambió un comentario, queda idéntico.
//
// Uso: node scripts/comparar-comentarios.mjs <antes> <después> [--conservar] [--permitir-sin-comparar]
//   <antes> y <después> son commits (cualquier cosa que entienda `git rev-parse`). Cada uno se extrae a una
//   carpeta temporal, sin tocar el árbol de trabajo. Las herramientas (tsc, vite) son las de este checkout,
//   las mismas para los dos lados. --conservar deja las carpetas temporales para mirar la salida.
//
// Sale con 0 si todo es idéntico, con 1 si algo cambió aparte de los comentarios, con 2 si el script no
// pudo comparar (argumentos, git o un compilador que falla) y con 3 si lo comparado es idéntico pero cambió
// algún archivo que esta prueba no puede comparar (documentos, textos de prueba, imágenes…): no se puede
// afirmar que solo cambiaron comentarios. --permitir-sin-comparar lo deja en 0, con el aviso, para quien ya
// revisó esos archivos a mano.
//
// Qué se compara, cada cosa con su herramienta:
//   - src/ y test/: tsc con --removeComments, sin mapas de código (los .js y los .d.ts de src, y los de test);
//   - el código de studio/src, los e2e y las configuraciones del Studio: tsc con el tsconfig del Studio;
//   - los .mjs y los .js sueltos (scripts/, sitio/, studio/public/): tsc --allowJs --removeComments;
//   - el árbol de cada .ts y .tsx sin comentarios, con sus tipos (lo que tsc borra al emitir: anotaciones,
//     alias, `import type`…), y aparte, tal cual, los comentarios que tienen efecto: el shebang, las
//     directivas `///`, los pragmas de TypeScript, JSX y Vite, y los de cobertura y de formato;
//   - el Studio: el build de Vite, con los nombres con hash, que ya cubren los CSS (el hash sale del
//     contenido ya sin comentarios). Los .js de studio/public/ se copian tal cual a dist/, así que se
//     comparan en el paso anterior y no aquí;
//   - los CSS y HTML de todo el repo, y los .tape, .gitignore, .gitattributes, CODEOWNERS y .env.example, sin
//     sus comentarios ni los renglones en blanco;
//   - los YAML y los JSON/JSONC (tsconfig, esquemas, referencias de los e2e), ya interpretados;
//   - el modo de cada archivo (el bit de ejecución).
// Un archivo que existe en un lado y no en el otro cuenta como cambio.

import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import ts from "typescript";
import { parseAllDocuments } from "yaml";

import { comentariosDeCodigo, sinComentarios } from "./comentarios-del-codigo.mjs";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = path.join(raiz, "node_modules", "typescript", "bin", "tsc");
const vite = path.join(raiz, "node_modules", "vite", "bin", "vite.js");
const MAX_BUFFER = 256 * 1024 * 1024;

class ErrorDeHerramienta extends Error {}

function uso(mensaje) {
  if (mensaje) console.error(mensaje);
  console.error("Uso: node scripts/comparar-comentarios.mjs <antes> <después> [--conservar] [--permitir-sin-comparar]");
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
    .map((m) => ({ modo: m[1], sha: m[3], ruta: m[4] }));
  const salida = git(["cat-file", "--batch"], blobs.map((b) => b.sha).join("\n") + "\n");
  let pos = 0;
  return blobs.map((b) => {
    const fin = salida.indexOf(0x0a, pos);
    const [, , tamano] = salida.subarray(pos, fin).toString("ascii").split(" ");
    const contenido = salida.subarray(fin + 1, fin + 1 + Number(tamano));
    pos = fin + 1 + Number(tamano) + 1;
    return { ruta: b.ruta, modo: b.modo, contenido };
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
const esTs = (r) => /\.(ts|tsx|mts|cts)$/.test(r);
const NOMBRES_CON_ALMOHADILLA = new Set([".gitignore", ".gitattributes", "CODEOWNERS", ".env.example"]);
// Los formatos que se comparan como texto, sin sus comentarios. Los YAML no: se comparan ya interpretados.
const esDeTexto = (r) => /\.(css|html|tape)$/.test(r) || NOMBRES_CON_ALMOHADILLA.has(path.posix.basename(r));

// Los comentarios que tienen efecto aunque tsc los borre al emitir: directivas `///`, pragmas de TypeScript
// (@ts-nocheck, @ts-ignore…), de JSX (@jsx…) y de Vite o del empaquetador (@vite-ignore, PURE), de lint y de
// formato (eslint-, prettier-ignore) y de cobertura (c8, istanbul, node:coverage).
const CON_EFECTO = /^\/\/\/\s*<|@ts-(?:nocheck|check|ignore|expect-error)|@jsx|@vite-ignore|__PURE__|__NO_SIDE_EFFECTS__|\beslint-|prettier-ignore|\bc8 |istanbul|node:coverage/;

// El shebang y los comentarios con efecto de un archivo de TypeScript, tal cual y en su orden.
function conEfecto(ruta, texto) {
  const lineas = [];
  if (texto.startsWith("#!")) lineas.push(texto.split(/\r?\n/, 1)[0]);
  for (const c of comentariosDeCodigo(texto, ruta)) if (CON_EFECTO.test(c.texto)) lineas.push(c.texto.trim());
  return lineas.join("\n");
}

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
    // tsc borra al emitir todo lo que es solo de tipos: sin este paso, un cambio de una anotación, de un
    // `import type` o de una directiva pasaría por «solo comentarios».
    titulo: "El árbol de cada .ts y .tsx sin comentarios, con sus tipos, y los comentarios con efecto",
    prefijos: ["arbol/"],
    ejecutar(lado) {
      const imprimir = ts.createPrinter({ removeComments: true });
      for (const { ruta, contenido } of lado.archivos.filter((a) => esTs(a.ruta))) {
        const texto = contenido.toString("utf-8");
        const fuente = ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true);
        escribir(path.join(lado.salida, "arbol"), `${ruta}.txt`, `${imprimir.printFile(fuente)}\n--- con efecto ---\n${conEfecto(ruta, texto)}\n`);
      }
    },
  },
  {
    titulo: "CSS, HTML y archivos con # sin sus comentarios",
    prefijos: ["texto/"],
    ejecutar(lado) {
      for (const { ruta, contenido } of lado.archivos.filter((a) => esDeTexto(a.ruta))) {
        escribir(path.join(lado.salida, "texto"), ruta, `${sinComentarios(ruta, contenido.toString("utf-8")) ?? ""}\n`);
      }
    },
  },
  {
    titulo: "El modo de cada archivo",
    prefijos: ["modos/"],
    ejecutar(lado) {
      escribir(lado.salida, "modos/modos.txt", `${lado.archivos.map((a) => `${a.modo} ${a.ruta}`).sort().join("\n")}\n`);
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

// Lo que cambió entre los dos commits y ninguna comparación mira: no se puede afirmar nada de esos archivos.
function sinComparar(antes, despues) {
  const cambiados = git(["diff", "--name-only", "-z", antes, despues]).toString("utf-8").split("\0").filter(Boolean);
  const cubierto = (r) => esTs(r) || esJsSuelto(r) || esYaml(r) || esJson(r) || esDeTexto(r);
  return cambiados.filter((r) => !cubierto(r));
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { conservar: { type: "boolean", default: false }, "permitir-sin-comparar": { type: "boolean", default: false } },
});
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
  // Dos precauciones para el build de Vite, que escribe su configuración compilada en node_modules/.vite-temp
  // a través del enlace: la carpeta tiene que existir (si no, mkdir falla a través del enlace cuando el temporal
  // viene en forma 8.3), y el temporal va con su ruta larga (C:\Users\USUARI~1 → C:\Users\Usuario Largo).
  fs.mkdirSync(path.join(raiz, "node_modules", ".vite-temp"), { recursive: true });
  temporal = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "comparar-comentarios-"));

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
      const pista = /\.(m?js|json|css|html|ts|tsx|txt|tape)$/.test(k)
        ? primeraDiferencia(path.join(lados[0].salida, ...k.split("/")), path.join(lados[1].salida, ...k.split("/")))
        : "";
      console.log(`    distinto:     ${k}${pista ? `, ${pista}` : ""}`);
    }
    const resto = total - Math.min(soloAntes.length, 15) - Math.min(soloDespues.length, 15) - Math.min(cambiados.length, 15);
    if (resto > 0) console.log(`    … y ${resto} más`);
  }

  const fuera = sinComparar(antes, despues);
  if (fuera.length > 0) {
    console.log(`\n${fuera.length} archivos cambiaron y esta prueba no puede compararlos:`);
    fuera.slice(0, 15).forEach((r) => console.log(`    ${r}`));
    if (fuera.length > 15) console.log(`    … y ${fuera.length - 15} más`);
  }

  if (distintos > 0) {
    console.log(`\nDISTINTO: ${distintos} diferencias que no son comentarios.`);
    process.exitCode = 1;
  } else if (fuera.length === 0) {
    console.log("\nIDÉNTICO: entre los dos commits solo cambiaron comentarios.");
  } else if (values["permitir-sin-comparar"]) {
    console.log(`\nIDÉNTICO en lo que se compara; ${fuera.length} archivos sin comparar (--permitir-sin-comparar): revísalos a mano.`);
  } else {
    console.log(`\nNO SE PUEDE AFIRMAR: lo comparado es idéntico, pero ${fuera.length} archivos cambiaron y esta prueba no los compara. Revísalos a mano y repite con --permitir-sin-comparar.`);
    process.exitCode = 3;
  }
} catch (error) {
  console.error(`\nNo se pudo comparar: ${error instanceof ErrorDeHerramienta ? error.message : error.stack}`);
  process.exitCode = 2;
} finally {
  if (temporal && !values.conservar) {
    // Primero se quitan los enlaces a node_modules, para que el borrado recursivo nunca pueda seguirlos.
    // unlink quita el enlace sin tocar lo que hay detrás, tanto un symlink de Linux y macOS como un junction de
    // Windows; rmdir es el respaldo, y sin enlace (no se llegó a crear) no hace nada.
    for (const lado of ["antes", "despues"]) {
      const enlace = path.join(temporal, lado, "fuente", "node_modules");
      try {
        fs.unlinkSync(enlace);
      } catch {
        try {
          fs.rmdirSync(enlace);
        } catch {
          /* no se llegó a crear */
        }
      }
    }
    fs.rmSync(temporal, { recursive: true, force: true });
  } else if (temporal) {
    console.log(`\nCarpetas temporales conservadas en ${temporal}`);
  }
}
