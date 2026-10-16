// Los recibos como datos (§6.2 del plan maestro v3): escritura determinista, lectura tolerante con
// los recibos escritos a mano en la 2.x, y el nombre del archivo hecho por el servidor.

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import { validarSegmento } from "../src/paths.js";
import { comoManual, escribirRecibo, leerRecibo, loteDelNombre, nombreDeRecibo, parsearRecibo, slugDe } from "../src/recibos.js";
import type { Recibo } from "../src/recibos.js";
import { carpetaTemporal } from "./helpers.js";

function recibo(cambios: Partial<Recibo> = {}): Recibo {
  return {
    lote: 2,
    de: 4,
    titulo: "filtro por categoría",
    repo: "api",
    rama: "feat/filtro",
    estado: "verificado",
    ancla: {
      tipo: "commit",
      repo: "api",
      sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      corto: "a1b2c3d",
      asunto: "fix(filtros): incluir los productos sin categoría",
      rama: "feat/filtro",
      verificado: "2026-11-03T18:22:41.000Z",
    },
    fecha: "2026-11-03",
    registrado: "2026-11-03T18:22:41.000Z",
    origen: "servidor",
    queSeHizo: "El filtro incluye ahora los 12 productos sin categoría.",
    archivos: [
      { archivo: "src/filtros.ts", cambio: "nueva rama para `categoria IS NULL`" },
      { archivo: "test/filtros.test.ts", cambio: "dos casos | uno con null\ny otro vacío" },
    ],
    verificacion: "npm test: 48 pasan, 0 fallan.\nLa consulta devuelve 12 filas más.",
    esperaAlUsuario: [{ prueba: "Abrir la vista de productos", esperado: "aparecen los 12 | sin categoría" }],
    desvios: "",
    decisiones: "D7. Los nulos se agrupan como «Sin categoría». **Base:** leído en código.",
    condicionales: [
      { titulo: "Lo que sigue igual", texto: "El reporte mensual no cambia." },
      { titulo: "Deuda anotada", texto: "El orden de la vista sigue sin índice." },
    ],
    verificacionDelCommit: "El commit toca exactamente los 2 archivos declarados.",
    ...cambios,
  };
}

function idaYVuelta(r: Recibo): string {
  const primero = escribirRecibo(r);
  const segundo = escribirRecibo(parsearRecibo(primero, nombreDeRecibo(r.lote, r.titulo)));
  assert.equal(segundo, primero);
  return primero;
}

describe("escribirRecibo", () => {
  it("escribe el frontmatter en su orden fijo, con las claves de la 2.x en su sitio", () => {
    const texto = escribirRecibo(recibo());
    const frontmatter = texto.split("\n---\n")[0]!.split("\n").slice(1);
    assert.deepEqual(
      frontmatter.map((linea) => linea.slice(0, linea.indexOf(":"))),
      ["lote", "de", "repo", "rama", "estado", "commit", "fecha", "ancla", "commit_completo", "asunto", "registrado", "origen"]
    );
    assert.ok(texto.startsWith("---\nlote: L02\nde: 4\nrepo: api\nrama: feat/filtro\nestado: verificado\ncommit: a1b2c3d\nfecha: 2026-11-03\nancla: commit\n"));
    assert.match(texto, /\n# L02 — filtro por categoría\n/);
  });

  it("es determinista: LF, un salto final, y el mismo recibo da los mismos bytes", () => {
    const texto = escribirRecibo(recibo());
    assert.equal(texto, escribirRecibo(recibo()));
    assert.ok(!texto.includes("\r"));
    assert.ok(texto.endsWith(".\n") && !texto.endsWith("\n\n"));
  });

  it("ida y vuelta con las cuatro anclas: escribir, leer y escribir da los mismos bytes", () => {
    idaYVuelta(recibo());
    idaYVuelta(recibo({ ancla: { tipo: "pendiente" }, verificacionDelCommit: null }));
    idaYVuelta(recibo({ repo: null, rama: null, ancla: { tipo: "sha256", ruta: "proyecto:ASISTENTE/prompt-sistema.md", sha256: "9c1e".padEnd(64, "0"), bytes: 2048, verificado: "2026-11-03T18:22:41.000Z" }, verificacionDelCommit: null }));
    idaYVuelta(recibo({ estado: "fallido", ancla: { tipo: "nota", texto: "La suite no pasa:\n3 fallan en C:\\repos\\api.\nSe reintenta." }, verificacionDelCommit: null }));
  });

  it("lo leído conserva los datos del recibo", () => {
    const leido = parsearRecibo(escribirRecibo(recibo()), "L02 - filtro por categoría.md");
    assert.deepEqual(leido, recibo());
  });

  it("escapa | en las tablas y convierte los saltos de línea de una celda en <br>", () => {
    const texto = escribirRecibo(recibo());
    assert.match(texto, /\| test\/filtros\.test\.ts \| dos casos \\\| uno con null<br>y otro vacío \|/);
    assert.match(texto, /\| Abrir la vista de productos \| aparecen los 12 \\\| sin categoría \|/);
  });

  it("una sección vacía dice Ninguna/Ninguno, y las condicionales vacías no se escriben", () => {
    const texto = escribirRecibo(
      recibo({ queSeHizo: "", archivos: [], verificacion: "  ", esperaAlUsuario: [], desvios: "", decisiones: "", condicionales: [{ titulo: "Reversión", texto: " " }] })
    );
    assert.match(texto, /## Qué se hizo\nNada\.\n/);
    assert.match(texto, /## Archivos\nNinguno\.\n/);
    assert.match(texto, /## Verificación ejecutada\nNinguna\.\n/);
    assert.match(texto, /## Espera al usuario\nNinguna\.\n/);
    assert.match(texto, /## Desvíos del plan\nNinguno\.\n/);
    assert.match(texto, /## Decisiones\nNinguna\.\n/);
    assert.ok(!texto.includes("## Reversión"));
    assert.doesNotMatch(texto, /## [^\n]+\n\n/, "ningún encabezado sin texto");
  });

  it("las condicionales van en el orden de la plantilla, y 'Verificación del commit' solo con ancla commit", () => {
    const texto = escribirRecibo(recibo({ condicionales: [...recibo().condicionales].reverse() }));
    assert.ok(texto.indexOf("## Lo que sigue igual") < texto.indexOf("## Deuda anotada"));
    assert.ok(texto.indexOf("## Deuda anotada") < texto.indexOf("## Verificación del commit"));
    const conNota = escribirRecibo(recibo({ ancla: { tipo: "nota", texto: "revisado a mano" } }));
    assert.ok(!conNota.includes("## Verificación del commit"));
    assert.match(conNota, /\ncommit: no aplica\n/);
  });

  it("una línea del texto que parece un encabezado no parte la sección al leerla", () => {
    const r = recibo({ verificacion: "Salida del test:\n## Decisiones\n# fin" });
    const texto = idaYVuelta(r);
    assert.equal(parsearRecibo(texto).decisiones, r.decisiones);
  });

  it("como documento de la fase (un solo lote) añade lotes y generado_por al frontmatter", () => {
    const texto = escribirRecibo(recibo({ lote: 1, de: 1 }), { comoDocumento: true });
    assert.ok(texto.startsWith("---\nlotes: 1\ngenerado_por: mcp-phase-gate\nlote: L01\nde: 1\n"));
    assert.equal(parsearRecibo(texto).lote, 1);
  });
});

describe("leerRecibo con recibos escritos a mano en la 2.x", () => {
  const RECIBO_2X = [
    "---",
    "lote: L03",
    "de: 4",
    "repo: web",
    "rama: feat/x",
    "estado: con pendientes",
    "commit: e4f5a6b",
    "fecha: 2026-09-01",
    "---",
    "",
    "# L03 — refactor del menú",
    "",
    "## Qué se hizo",
    "Se movió el menú.",
    "",
    "## Archivos",
    "| Archivo | Qué cambió |",
    "|---|---|",
    "| `web/menu.tsx` | extraído |",
    "",
    "Sin copiar código: para eso está el diff.",
    "",
    "## Verificación ejecutada",
    "Build verde.",
    "",
    "## Una sección inventada",
    "con texto",
    "",
    "## Espera al usuario",
    "Ninguna.",
    "",
  ].join("\r\n");

  it("deduce el ancla de `commit`, queda como manual y no lanza por lo inesperado", () => {
    const r = parsearRecibo(RECIBO_2X, "L03 - refactor del menú.md");
    assert.equal(r.lote, 3);
    assert.equal(r.de, 4);
    assert.equal(r.titulo, "refactor del menú");
    assert.equal(r.estado, "con pendientes");
    assert.equal(r.origen, "manual");
    assert.deepEqual(r.ancla, { tipo: "commit", repo: "web", sha: "e4f5a6b", corto: "e4f5a6b", asunto: "", rama: "feat/x", verificado: "" });
    assert.deepEqual(r.archivos, [{ archivo: "`web/menu.tsx`", cambio: "extraído" }]);
    assert.equal(r.verificacion.split("\n")[0], "Build verde.");
    assert.deepEqual(r.esperaAlUsuario, []);
    assert.equal(r.desvios, "");
    assert.equal(r.decisiones, "");
    assert.equal(r.verificacionDelCommit, null);
  });

  it("`commit: pendiente` da ancla pendiente; `no aplica`, una nota; sin commit, pendiente", () => {
    assert.deepEqual(parsearRecibo("---\nlote: L01\ncommit: pendiente\n---\n# L01 — x\n").ancla, { tipo: "pendiente" });
    assert.deepEqual(parsearRecibo("---\nlote: L01\ncommit: no aplica\n---\n# L01 — x\n").ancla, { tipo: "nota", texto: "no aplica" });
    assert.deepEqual(parsearRecibo("# sin frontmatter\n").ancla, { tipo: "pendiente" });
  });

  it("un estado desconocido no se da por bueno, y lote y título salen del nombre si faltan", () => {
    const r = parsearRecibo("---\nestado: listo\n---\n\nTexto suelto\n", "L07 - algo raro.md");
    assert.equal(r.estado, "con pendientes");
    assert.equal(r.lote, 7);
    assert.equal(r.titulo, "algo raro");
  });

  it("lee del disco, con BOM y CRLF", () => {
    const carpeta = carpetaTemporal("recibos");
    const ruta = path.join(carpeta, "L03 - refactor del menú.md");
    fs.writeFileSync(ruta, `\uFEFF${RECIBO_2X}`, "utf-8");
    assert.equal(leerRecibo(ruta).titulo, "refactor del menú");
  });
});

describe("comoManual", () => {
  it("deja origen: manual y quita generado_por; sin frontmatter, el texto queda igual (en LF)", () => {
    assert.equal(comoManual("---\nlote: L01\norigen: servidor\ngenerado_por: mcp-phase-gate\n---\n# x\n"), "---\nlote: L01\norigen: manual\n---\n# x\n");
    assert.equal(comoManual("---\r\nlote: L01\r\n---\r\n# x\r\n"), "---\nlote: L01\norigen: manual\n---\n# x\n");
    assert.equal(comoManual("# sin frontmatter\r\n"), "# sin frontmatter\n");
    assert.equal(parsearRecibo(comoManual(escribirRecibo(recibo()))).origen, "manual");
  });
});

describe("nombreDeRecibo", () => {
  it("L más dos dígitos, guion y el slug", () => {
    assert.equal(nombreDeRecibo(2, "filtro por categoría"), "L02 - filtro por categoría.md");
    assert.equal(nombreDeRecibo(12, "x"), "L12 - x.md");
  });

  it("los caracteres que Windows no guarda pasan a espacio, y se conservan acentos y ñ", () => {
    assert.equal(nombreDeRecibo(1, "fix(rutas): C:/datos\\año <nuevo> | ¿ya?"), "L01 - fix rutas C datos año nuevo ya.md");
    assert.equal(slugDe("Configuración de la compañía"), "Configuración de la compañía");
    assert.equal(slugDe("cafe\u0301"), "café", "en NFC");
  });

  it("corta a 40 caracteres sin partir palabras, y sin punto ni espacio al final", () => {
    const largo = "palabra ".repeat(25).trim(); // 200 caracteres
    const slug = slugDe(largo);
    assert.ok(slug.length <= 40, slug);
    assert.equal(slug, "palabra palabra palabra palabra palabra");
    assert.equal(slugDe("a".repeat(200)), "a".repeat(40), "una sola palabra se corta a lo bruto");
    assert.equal(slugDe("termina en punto."), "termina en punto");
    assert.equal(slugDe(`${"b".repeat(39)} c`), "b".repeat(39), "la palabra 41 no entra");
    assert.equal(slugDe(`${"b".repeat(40)} c`), "b".repeat(40), "la palabra 40 entra entera");
  });

  it("un título vacío o solo de símbolos da `lote`", () => {
    assert.equal(nombreDeRecibo(3, ""), "L03 - lote.md");
    assert.equal(nombreDeRecibo(3, ":/\\<>|?*..."), "L03 - lote.md");
  });

  it("todos los nombres pasan validarSegmento, también con nombres reservados de Windows", () => {
    for (const titulo of ["CON", "nul", "a.", "x ", "COM1", "..", "a/../b", "\u0000raro"]) {
      const nombre = nombreDeRecibo(5, titulo);
      assert.equal(validarSegmento(nombre, "recibo"), nombre);
      assert.equal(loteDelNombre(nombre), 5);
    }
  });

  it("rechaza un lote fuera de 1…99", () => {
    for (const lote of [0, 100, 1.5, -1]) assert.throws(() => nombreDeRecibo(lote, "x"), /1 a 99/);
  });
});
