// El GIF, el video y el póster de la demo, en los dos idiomas, a partir de código real: la escena de terminal
// con VHS (docs/medios/terminal.tape) sobre la demo de cada idioma, y las del Studio con Playwright
// (scripts/grabar-studio.mjs) contra `ui --demo` y el sitio publicado. Después, ffmpeg: cada pieza a 1280×720 y
// 30 fps, con el tiempo que le toca, y de ahí salen las dos piezas:
//   - el MP4 completo, de unos 42 s, con las siete escenas (H.264, +faststart);
//   - el GIF corto, de unos 20 s: la terminal breve, la Red, el lote en vivo y Ajustes. Es lo que el README
//     muestra sin clic, y lleva al MP4. Se hace en dos pasadas con paleta propia.
// Y el póster, un fotograma del tablero.
//
// Presupuesto (medido, no estimado): GIF ≤ 2.5 MB y MP4 ≤ 8 MB. Si el GIF se pasa, se rehace a 10 fps y 840 px, y
// después a 8 fps y 760 px; si aun así se pasa, o el MP4 no cabe, el script falla. La salida a un GIF que no cabe
// es recortar segundos de sus escenas (GIF_ESCENAS), nunca del MP4.
//
// Se ejecuta en el workflow de Pages (los medios se publican en el sitio y no se versionan en git) y, para medir,
// en cualquier equipo con ffmpeg, VHS (con ttyd) y Chromium de Playwright:
//   npm run build
//   node build/index.js ui --export-static <sitio>/demo
//   node scripts/portada.mjs --salida <sitio>
//   node scripts/capturas-studio.mjs --portada --salida <sitio>/medios
//   node scripts/medios.mjs --sitio <sitio> --salida <carpeta> [--idiomas es,en]
// FFMPEG y VHS pueden apuntar a los binarios si no están en el PATH.
// Escribe demo-<idioma>.gif, demo-<idioma>.mp4, poster-<idioma>.png y medios.json (versión, tamaños y duraciones
// de cada pieza).

import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { values: argumentos } = parseArgs({ options: { sitio: { type: "string" }, salida: { type: "string" }, idiomas: { type: "string" } } });
if (!argumentos.sitio || !argumentos.salida) throw new Error("Uso: node scripts/medios.mjs --sitio <export estático> --salida <carpeta> [--idiomas es,en]");
const sitio = path.resolve(argumentos.sitio);
const salida = path.resolve(argumentos.salida);
const idiomas = (argumentos.idiomas ?? "es,en").split(",").map((i) => i.trim()).filter((i) => i === "es" || i === "en");
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const VHS = process.env.VHS ?? "vhs";

const MB = 1024 * 1024;
const TOPE_GIF = 2.5 * MB;
const TOPE_MP4 = 8 * MB;
const FONDO = "0xf3f5f7"; // el fondo del tema claro (--fondo de tema-claro.css), para el marco del teléfono

// Las siete escenas del MP4, con sus segundos: cada una se recorta a lo que le toca. La 1 es la terminal (VHS) y
// las demás, el Studio (escena-N.webm de grabar-studio.mjs).
const ESCENAS = [
  { n: 1, nombre: "terminal", segundos: 6 },
  { n: 2, nombre: "red", segundos: 4 },
  { n: 3, nombre: "tablero", segundos: 7 },
  { n: 4, nombre: "lote-en-vivo", segundos: 7 },
  { n: 5, nombre: "ajustes", segundos: 8 },
  { n: 6, nombre: "taller", segundos: 5 },
  { n: 7, nombre: "telefono", segundos: 5 },
];
// El GIF corto: la terminal breve (3 s en vez de 6), la Red, el lote en vivo y Ajustes. La terminal no empieza
// por el principio: en 3 s lo que vale es la salida de `doctor`, no ver teclear el comando, así que se salta casi
// todo el tecleo (`desde`) en vez de cortar el final.
const GIF_ESCENAS = [
  { n: 1, desde: 0.8, segundos: 3 },
  { n: 2, segundos: 4 },
  { n: 4, segundos: 7 },
  { n: 5, segundos: 8 },
];

const ejecutar = (comando, args, opciones = {}) => {
  const r = spawnSync(comando, args, { encoding: "utf-8", maxBuffer: 64 * MB, ...opciones });
  if (r.status !== 0) throw new Error(`${comando} ${args.join(" ")} falló (${r.status}):\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  return r.stdout;
};
const ffmpeg = (args) => ejecutar(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args]);
const duracion = (archivo) => {
  // ffmpeg sin salida imprime la duración en stderr: no hace falta ffprobe.
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", archivo], { encoding: "utf-8" });
  const m = (r.stderr ?? "").match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};
const aPosix = (ruta) => ruta.replace(/\\/g, "/");

const importar = (relativa) => import(pathToFileURL(path.join(raiz, "build", relativa)).href);
const { borrarDemo, entornoDeDemo, generarDemo } = await importar("studio/demo.js");

const trabajo = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.MEDIOS_TEMPORAL ?? os.tmpdir()), "mcp-phase-gate-piezas-"));
fs.mkdirSync(salida, { recursive: true });
const { version } = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf-8"));
const resumen = { version, generado: new Date().toISOString(), presupuesto: { gifBytes: TOPE_GIF, mp4Bytes: TOPE_MP4 }, idiomas: {} };

try {
  for (const idioma of idiomas) {
    const aqui = path.join(trabajo, idioma);
    fs.mkdirSync(aqui, { recursive: true });

    // ─── 1. Terminal: VHS sobre la demo de este idioma ─────────────────────
    const demo = await generarDemo(path.join(aqui, "demo"), idioma);
    const casa = path.join(aqui, "casa");
    fs.mkdirSync(path.join(casa, ".cursor"), { recursive: true });
    // Una casa propia con un mcp.json de otro servidor: doctor no lee la configuración de quien graba.
    fs.writeFileSync(path.join(casa, ".cursor", "mcp.json"), `${JSON.stringify({ mcpServers: { "otro-servidor": { command: "npx", args: ["-y", "otro-servidor-mcp"] } } }, null, 2)}\n`);
    const env = { ...entornoDeDemo(demo), PHASE_GATE_LANG: idioma };
    const preparar = [
      ...Object.entries(env).map(([k, v]) => `export ${k}='${aPosix(v)}'`),
      `export HOME='${aPosix(casa)}'`,
      `export USERPROFILE='${aPosix(casa)}'`,
      "unset ORQUESTADOR_DOCS_PATH ORQUESTADOR_REPOS_PATH ORQUESTADOR_STATE_PATH ORQUESTADOR_PROMPTS_PATH ORQUESTADOR_TASKS_SUBDIR",
      `mcp-phase-gate() { node '${aPosix(path.join(raiz, "build", "index.js"))}' "$@"; }`,
      "export PS1='$ '",
      "clear",
      "",
    ].join("\n");
    fs.writeFileSync(path.join(aqui, "preparar.sh"), preparar, "utf-8");
    let cinta = fs.readFileSync(path.join(raiz, "docs", "medios", "terminal.tape"), "utf-8");
    if (process.platform === "win32") {
      // En Windows, el "bash" que lanza ttyd es el de WSL (CreateProcess mira System32 antes que el PATH): la
      // misma preparación, en PowerShell. Lo que se ve en pantalla es el mismo comando.
      const ps = [
        ...Object.entries(env).map(([k, v]) => `$env:${k}='${v}'`),
        `$env:HOME='${casa}'`,
        `$env:USERPROFILE='${casa}'`,
        ...["DOCS_PATH", "REPOS_PATH", "STATE_PATH", "PROMPTS_PATH", "TASKS_SUBDIR"].map((n) => `Remove-Item Env:ORQUESTADOR_${n} -ErrorAction SilentlyContinue`),
        `function mcp-phase-gate { node '${path.join(raiz, "build", "index.js")}' @args }`,
        "function prompt { '$ ' }",
        "Clear-Host",
        "",
      ].join("\r\n");
      fs.writeFileSync(path.join(aqui, "preparar.ps1"), ps, "utf-8");
      cinta = cinta.replace('Set Shell "bash"', 'Set Shell "powershell"').replace('Type ". ./preparar.sh"', 'Type ". ./preparar.ps1"');
    }
    fs.writeFileSync(path.join(aqui, "terminal.tape"), cinta, "utf-8");
    ejecutar(VHS, ["terminal.tape"], { cwd: aqui });
    borrarDemo(demo.raiz);

    // ─── 2 a 7. El Studio ──────────────────────────────────────────────────
    const escenas = path.join(aqui, "escenas");
    const segundosDelStudio = ESCENAS.filter((e) => e.n > 1).map((e) => `${e.n}=${e.segundos}`).join(",");
    ejecutar(process.execPath, [path.join(raiz, "scripts", "grabar-studio.mjs"), "--idioma", idioma, "--salida", escenas, "--sitio", sitio, "--segundos", segundosDelStudio], { stdio: ["ignore", "inherit", "inherit"] });
    const fuenteDe = (n) => (n === 1 ? path.join(aqui, "terminal.mp4") : path.join(escenas, `escena-${n}.webm`));
    // Lo que pidieron los pasos de cada escena: si pasa de lo que le toca, al recortarla se pierde su final.
    const crudos = { ...JSON.parse(fs.readFileSync(path.join(escenas, "duraciones.json"), "utf-8")), 1: Math.round(duracion(fuenteDe(1)) * 10) / 10 };
    for (const e of ESCENAS) {
      if (crudos[e.n] > e.segundos + 0.3) console.log(`::warning::La escena ${e.n} (${e.nombre}, ${idioma}) dura ${crudos[e.n]} s y se recorta a ${e.segundos} s: pierde su final.`);
    }

    // ─── Unir: cada escena a 1280×720, 30 fps, H.264, con los segundos que le tocan ───
    // La del teléfono (390×844) va centrada, a la altura del video, sobre el fondo del tema claro.
    const filtro = `scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=${FONDO},fps=30,format=yuv420p`;
    const normalizar = (n, segundos, etiqueta, desde = 0) => {
      const destino = path.join(aqui, `${etiqueta}-${n}.mp4`);
      const salto = desde ? ["-ss", String(desde)] : [];
      ffmpeg([...salto, "-i", fuenteDe(n), "-t", String(segundos), "-vf", filtro, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "26", destino]);
      return destino;
    };
    const unir = (piezas, destino, lista) => {
      fs.writeFileSync(path.join(aqui, lista), piezas.map((p) => `file '${aPosix(p)}'`).join("\n"), "utf-8");
      ffmpeg(["-f", "concat", "-safe", "0", "-i", path.join(aqui, lista), "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", destino]);
    };
    const redondear = (s) => Math.round(s * 10) / 10;

    // El MP4 completo: las siete escenas.
    const delMp4 = ESCENAS.map((e) => normalizar(e.n, e.segundos, "completa"));
    const mp4 = path.join(salida, `demo-${idioma}.mp4`);
    unir(delMp4, mp4, "completa.txt");
    if (fs.statSync(mp4).size > TOPE_MP4) throw new Error(`demo-${idioma}.mp4 pesa ${fs.statSync(mp4).size} bytes: pasa de ${TOPE_MP4}.`);

    // El GIF corto: sale de sus propias escenas, no del MP4, para poder recortarlas sin tocarlo.
    const corto = path.join(aqui, "corto.mp4");
    unir(GIF_ESCENAS.map((e) => normalizar(e.n, e.segundos, "corta", e.desde)), corto, "corta.txt");
    const gif = path.join(salida, `demo-${idioma}.gif`);
    const hacerGif = (fps, ancho) => {
      const paleta = path.join(aqui, "paleta.png");
      ffmpeg(["-i", corto, "-vf", `fps=${fps},scale=${ancho}:-1:flags=lanczos,palettegen=stats_mode=diff`, paleta]);
      ffmpeg(["-i", corto, "-i", paleta, "-lavfi", `fps=${fps},scale=${ancho}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, gif]);
      return { fps, ancho, bytes: fs.statSync(gif).size };
    };
    let delGif = hacerGif(12, 960);
    for (const [fps, ancho] of [[10, 840], [8, 760]]) if (delGif.bytes > TOPE_GIF) delGif = hacerGif(fps, ancho);
    if (delGif.bytes > TOPE_GIF) throw new Error(`demo-${idioma}.gif pesa ${delGif.bytes} bytes aun a 8 fps y 760 px: pasa de ${TOPE_GIF}.`);

    // ─── El póster: un fotograma del tablero, a mitad de su escena ─────────
    const total = duracion(mp4);
    const segundosDe = delMp4.map((p) => duracion(p));
    const poster = path.join(salida, `poster-${idioma}.png`);
    ffmpeg(["-ss", String(redondear(segundosDe[0] + segundosDe[1] + segundosDe[2] / 2)), "-i", mp4, "-frames:v", "1", poster]);

    resumen.idiomas[idioma] = {
      mp4: { segundos: redondear(total), bytes: fs.statSync(mp4).size, escenas: ESCENAS.map((e, i) => ({ n: e.n, nombre: e.nombre, segundos: redondear(segundosDe[i]), pedidos: crudos[e.n] })) },
      gif: { segundos: redondear(duracion(corto)), ...delGif, escenas: GIF_ESCENAS.map((e) => ({ n: e.n, desde: e.desde ?? 0, segundos: e.segundos })) },
      posterBytes: fs.statSync(poster).size,
    };
    console.log(`${idioma}: ${JSON.stringify(resumen.idiomas[idioma])}`);
  }
  fs.writeFileSync(path.join(salida, "medios.json"), `${JSON.stringify(resumen, null, 2)}\n`, "utf-8");
} finally {
  fs.rmSync(trabajo, { recursive: true, force: true, maxRetries: 3 });
}

// Comprobación de que ffmpeg es el esperado, por si alguien depura el resultado.
try {
  console.log(execFileSync(FFMPEG, ["-version"], { encoding: "utf-8" }).split("\n")[0]);
} catch {
  // sin importancia
}
