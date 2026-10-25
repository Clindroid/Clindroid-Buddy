import { describe, expect, test } from "bun:test"
import path from "path"

// Regression test for a real incident: Bun's `.md` module loader silently swaps from plain text
// to a Markdown->HTML transform when `--conditions=browser` is set — the exact condition
// `bun run dev` and script/build.ts use (see package.json's `dev` script and script/build.ts's
// `conditions: ["browser"]`). `bun test` itself never sets this condition, so a bug here is
// invisible to every other test in this suite; only a subprocess reproducing the real conditions
// can catch it. src/command/index.ts guards its AGENTS.md import with `with { type: "text" }` to
// force the raw-text loader regardless of conditions — this test proves that guard holds end to
// end, from the real /init code path down to the file actually written to disk.
describe("command.init AGENTS.md loader", () => {
  test("AGENTS.md is written as plain Markdown, not HTML, under --conditions=browser", async () => {
    const worker = path.join(import.meta.dir, "agents-md-browser-worker.ts")
    const projectRoot = path.join(import.meta.dir, "../..")

    const proc = Bun.spawn({
      cmd: [process.execPath, "run", "--conditions=browser", worker],
      cwd: projectRoot,
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    })

    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    if (code !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `worker exited with code ${code}`)
    }

    expect(stdout.trimStart().startsWith("<")).toBe(false)
    expect(stdout).toContain("# Clinical Statistical Programming Guide")
    expect(stdout).toContain("| Directory | Purpose | Contents |")
  }, 30000)
})
