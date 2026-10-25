// Standalone worker (not a bun:test file) — spawned by agents-md-browser.test.ts under
// `--conditions=browser` to reproduce the exact module-resolution conditions `bun run dev` and
// script/build.ts use. Runs the real /init template resolution and prints the AGENTS.md file it
// wrote, so the parent test can assert it's still plain Markdown, not Bun's browser-conditions
// Markdown-to-HTML transform of the `.md` import in src/command/index.ts.
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Command } from "../../src/command"
import { Config } from "../../src/config"
import { MCP } from "../../src/mcp"
import { Skill } from "../../src/skill"
import { Instance } from "../../src/project/instance"

const config = Layer.succeed(
  Config.Service,
  Config.Service.of({
    get: () => Effect.succeed({} as Config.Info),
    getGlobal: () => Effect.succeed({} as Config.Info),
    update: () => Effect.void,
    updateGlobal: () => Effect.succeed({} as Config.Info),
    invalidate: () => Effect.void,
    directories: () => Effect.succeed([]),
    waitForDependencies: () => Effect.void,
  }),
)

const mcp = Layer.succeed(
  MCP.Service,
  MCP.Service.of({
    status: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
    tools: () => Effect.succeed({}),
    prompts: () => Effect.succeed({}),
    resources: () => Effect.succeed({}),
    add: () => Effect.succeed({ status: { status: "disabled" as const } }),
    connect: () => Effect.void,
    disconnect: () => Effect.void,
    getPrompt: () => Effect.succeed(undefined),
    readResource: () => Effect.succeed(undefined),
    startAuth: () => Effect.die("unexpected MCP auth in agents-md-browser worker"),
    authenticate: () => Effect.die("unexpected MCP auth in agents-md-browser worker"),
    finishAuth: () => Effect.die("unexpected MCP auth in agents-md-browser worker"),
    removeAuth: () => Effect.void,
    supportsOAuth: () => Effect.succeed(false),
    hasStoredTokens: () => Effect.succeed(false),
    getAuthStatus: () => Effect.succeed("not_authenticated" as const),
  }),
)

const skill = Layer.succeed(
  Skill.Service,
  Skill.Service.of({
    get: () => Effect.succeed(undefined),
    all: () => Effect.succeed([]),
    dirs: () => Effect.succeed([]),
    available: () => Effect.succeed([]),
  }),
)

const layer = Command.layer.pipe(
  Layer.provide(config),
  Layer.provide(mcp),
  Layer.provide(skill),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provideMerge(CrossSpawnSpawner.defaultLayer),
)

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agents-md-browser-"))
  try {
    await Instance.provide({
      directory: dir,
      fn: () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const command = yield* Command.Service
            const info = yield* command.get("init")
            if (!info) throw new Error("init command not registered")
            yield* Effect.promise(() => Promise.resolve(info.template))
          }).pipe(Effect.provide(layer)),
        ),
    })
    const written = await fs.readFile(path.join(dir, "AGENTS.md"), "utf8")
    process.stdout.write(written)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
