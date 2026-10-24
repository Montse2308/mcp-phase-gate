// La fecha canónica de un commit (src/git.ts, datosDeCommit): se lee con `%ct` y se formatea aquí como
// instante UTC sin milisegundos, para no depender del formato con que cada versión de git escribe las
// fechas. Se comprueba con GIT_COMMITTER_DATE en varias zonas horarias —incluidas las que cambian de día
// al pasar a UTC y las posteriores a 2038—, y que una fecha fuera del rango de Date no lanza.

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";

import { datosDeCommit } from "../src/git.js";
import { carpetaTemporal, limpiarEntorno } from "./helpers.js";

afterEach(() => limpiarEntorno());

function git(repo: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "commit.gpgsign=false", ...args], {
    cwd: repo,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...env },
  }).trim();
}

// Un commit con su autor y su fecha fijos; GIT_COMMITTER_DATE lleva la zona horaria del caso.
function commitConFecha(repo: string, nombre: string, fecha: string): string {
  fs.writeFileSync(path.join(repo, nombre), `${nombre}\n`, "utf-8");
  git(repo, ["add", nombre]);
  git(repo, ["-c", "user.name=Prueba", "-c", "user.email=prueba@ejemplo.com", "commit", "-q", "-m", nombre], { GIT_AUTHOR_DATE: fecha, GIT_COMMITTER_DATE: fecha });
  return git(repo, ["rev-parse", "HEAD"]);
}

describe("datosDeCommit: la fecha canónica en UTC", () => {
  it("commits con GIT_COMMITTER_DATE en varias zonas horarias dan su fecha UTC esperada, sin milisegundos", async () => {
    const repo = carpetaTemporal("git");
    git(repo, ["init", "-q", "-b", "main"]);
    const casos: [string, string][] = [
      ["2026-03-02T10:00:00-06:00", "2026-03-02T16:00:00Z"],
      ["2026-01-15T23:30:00+05:30", "2026-01-15T18:00:00Z"],
      ["2026-03-02T10:00:00Z", "2026-03-02T10:00:00Z"],
      // Cambia de día al pasar a UTC.
      ["2026-03-02T20:00:00-06:00", "2026-03-03T02:00:00Z"],
      // Desplazamiento no entero (Nepal) y un año posterior a 2038.
      ["2026-03-02T10:00:00+05:45", "2026-03-02T04:15:00Z"],
      ["2040-06-01T12:00:00+02:00", "2040-06-01T10:00:00Z"],
    ];
    for (let i = 0; i < casos.length; i++) {
      const [entrada, esperado] = casos[i]!;
      const sha = commitConFecha(repo, `commit-${i + 1}.txt`, entrada);
      assert.equal((await datosDeCommit(repo, sha)).fecha, esperado, entrada);
    }
  });

  it("un commit con una fecha fuera del rango de 0000-9999 da la fecha vacía, sin lanzar", async () => {
    const repo = carpetaTemporal("git");
    git(repo, ["init", "-q", "-b", "main"]);
    // @253402300800 es exactamente el año 10000: Date no puede escribirlo como AAAA-MM-DDTHH:MM:SSZ.
    const sha = commitConFecha(repo, "fuera-de-rango.txt", "@253402300800 +0000");
    assert.equal((await datosDeCommit(repo, sha)).fecha, "");
  });
});
