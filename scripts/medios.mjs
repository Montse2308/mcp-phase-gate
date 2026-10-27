// El GIF, el video y el póster de la demo (§8.8 del plan maestro v3), en los dos idiomas, a partir de código
// real: las escenas de terminal con VHS (docs/medios/terminal.tape) sobre la demo de cada idioma, y las del
// Studio con Playwright (scripts/grabar-studio.mjs) contra `ui --demo` y el sitio estático. Después, ffmpeg:
// cada pieza a 1280×720 y 30 fps, todas unidas en un MP4 H.264 con +faststart, el GIF en dos pasadas con
// paleta propia (960 px, 12 fps) y el póster.
//
// Presupuesto (medido, no estimado): GIF ≤ 5 MB y MP4 ≤ 8 MB. Si el GIF se pasa, se rehace a 10 fps y 840 px, y
// después a 8 fps y 760 px; si aun así se pasa, o el MP4 no cabe, el script falla.
//
// Se ejecuta en el workflow de Pages en cada tag (los medios se publican en el sitio y no se versionan en git)
// y, para medir, en cualquier equipo con ffmpeg, VHS (con ttyd) y Chromium de Playwright:
//   npm run build
//   node build/index.js ui --export-static <sitio>
//   node scripts/medios.mjs --sitio <sitio> --salida <sitio>/medios [--idiomas es,en]
// FFMPEG y VHS pueden apuntar a los binarios si no están en el PATH.
// Escribe demo-<idioma>.gif, demo-<idioma>.mp4, poster-<idioma>.png y medios.json (tamaños y duraciones).

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
const TOPE_GIF = 5 * MB;
const TOPE_MP4 = 8 * MB;
const FONDO = "0x0c131b"; // el fondo del tema oscuro (--fondo de tema-oscuro.css), para el marco del teléfono

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
const resumen = { generado: new Date().toISOString(), presupuesto: { gifBytes: TOPE_GIF, mp4Bytes: TOPE_MP4 }, idiomas: {} };

try {
  for (const idioma of idiomas) {
    const aqui = path.join(trabajo, idioma);
    fs.mkdirSync(aqui, { recursive: true });

    // ─── 1 y 2. Terminal: VHS sobre la demo de este idioma ─────────────────
    const demo = await generarDemo(path.join(aqui, "demo"), idioma);
    const casa = path.join(aqui, "casa");
    fs.mkdirSync(path.join(casa, ".cursor"), { recursive: true });
    // Un mcp.json que ya tiene otro servidor: init --dry-run enseña el diff, sin escribirlo.
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
      // misma preparación, en PowerShell. Lo que se ve en pantalla son los mismos dos comandos.
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
      cinta = cinta.replace('Set Shell "bash"', 'Set Shell "powershell"').replace('Type ". ./preparar.sh"', 'Type ". ./preparar.ps1"').replace('Type "clear"', 'Type "Clear-Host"');
    }
    fs.writeFileSync(path.join(aqui, "terminal.tape"), cinta, "utf-8");
    ejecutar(VHS, ["terminal.tape"], { cwd: aqui });
    borrarDemo(demo.raiz);

    // ─── 3 a 7. El Studio ──────────────────────────────────────────────────
    const escenas = path.join(aqui, "escenas");
    ejecutar(process.execPath, [path.join(raiz, "scripts", "grabar-studio.mjs"), "--idioma", idioma, "--salida", escenas, "--sitio", sitio], { stdio: ["ignore", "inherit", "inherit"] });

    // ─── Unir: cada pieza a 1280×720, 30 fps, H.264 ────────────────────────
    const piezas = [path.join(aqui, "terminal.mp4"), ...[3, 4, 5, 6, 7].map((n) => path.join(escenas, `escena-${n}.webm`))];
    const normales = piezas.map((pieza, i) => {
      const destino = path.join(aqui, `pieza-${i}.mp4`);
      // La del teléfono (390×844) va centrada, a la altura del video, sobre el fondo del tema oscuro.
      const filtro = `scale=1280:720:force_original_aspect_ratio=decrease:flags=lanczos,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=${FONDO},fps=30,format=yuv420p`;
      ffmpeg(["-i", pieza, "-vf", filtro, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "26", destino]);
      return destino;
    });
    fs.writeFileSync(path.join(aqui, "piezas.txt"), normales.map((p) => `file '${aPosix(p)}'`).join("\n"), "utf-8");
    const mp4 = path.join(salida, `demo-${idioma}.mp4`);
    ffmpeg(["-f", "concat", "-safe", "0", "-i", path.join(aqui, "piezas.txt"), "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", mp4]);
    if (fs.statSync(mp4).size > TOPE_MP4) throw new Error(`demo-${idioma}.mp4 pesa ${fs.statSync(mp4).size} bytes: pasa de ${TOPE_MP4}.`);

    // ─── El GIF, en dos pasadas con paleta propia ──────────────────────────
    const gif = path.join(salida, `demo-${idioma}.gif`);
    const hacerGif = (fps, ancho) => {
      const paleta = path.join(aqui, "paleta.png");
      ffmpeg(["-i", mp4, "-vf", `fps=${fps},scale=${ancho}:-1:flags=lanczos,palettegen=stats_mode=diff`, paleta]);
      ffmpeg(["-i", mp4, "-i", paleta, "-lavfi", `fps=${fps},scale=${ancho}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, gif]);
      return { fps, ancho, bytes: fs.statSync(gif).size };
    };
    let delGif = hacerGif(12, 960);
    for (const [fps, ancho] of [[10, 840], [8, 760]]) if (delGif.bytes > TOPE_GIF) delGif = hacerGif(fps, ancho);
    if (delGif.bytes > TOPE_GIF) throw new Error(`demo-${idioma}.gif pesa ${delGif.bytes} bytes aun a 8 fps y 760 px: pasa de ${TOPE_GIF}.`);

    // ─── El póster: un fotograma del tablero ───────────────────────────────
    const total = duracion(mp4);
    const poster = path.join(salida, `poster-${idioma}.png`);
    ffmpeg(["-ss", String(Math.min(24, Math.max(0, total / 2))), "-i", mp4, "-frames:v", "1", poster]);

    resumen.idiomas[idioma] = {
      segundos: Math.round(total * 10) / 10,
      mp4Bytes: fs.statSync(mp4).size,
      gif: delGif,
      posterBytes: fs.statSync(poster).size,
      piezas: piezas.map((p, i) => ({ pieza: path.basename(p), segundos: Math.round(duracion(normales[i]) * 10) / 10 })),
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
