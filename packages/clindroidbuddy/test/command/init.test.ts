import { afterEach, describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import fs from "fs/promises"
import path from "path"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { Command } from "../../src/command"
import { Config } from "../../src/config"
import { MCP } from "../../src/mcp"
import { Skill } from "../../src/skill"
import { Instance } from "../../src/project/instance"
import { provideInstance, provideTmpdirInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await Instance.disposeAll()
})

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
    startAuth: () => Effect.die("unexpected MCP auth in init command tests"),
    authenticate: () => Effect.die("unexpected MCP auth in init command tests"),
    finishAuth: () => Effect.die("unexpected MCP auth in init command tests"),
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

const it = testEffect(
  Command.layer.pipe(
    Layer.provide(config),
    Layer.provide(mcp),
    Layer.provide(skill),
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provideMerge(CrossSpawnSpawner.defaultLayer),
  ),
)

const template = Effect.fn("InitCommandTest.template")(function* () {
  const command = yield* Command.Service
  const info = yield* command.get("init")
  if (!info) throw new Error("init command not registered")
  return yield* Effect.promise(() => Promise.resolve(info.template))
})

describe("command.init", () => {
  it.live("runs normally when the working directory has no content beyond git bootstrap files", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const result = yield* template()
          expect(result).toContain("set up")
          expect(result).toContain("AGENTS.md")
          expect(result).toContain(dir)
        }),
      { git: true },
    ),
  )

  it.live("refuses to run and returns a message when the working directory has real content", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.writeFile(path.join(dir, "README.md"), "hello"))
          const result = yield* template()
          expect(result).toContain("is not empty")
          expect(result).toContain(dir)
          expect(result).not.toContain("set up")
        }),
      { git: true },
    ),
  )

  it.live("treats extra hidden entries (not just visible files) as non-empty", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.writeFile(path.join(dir, ".env"), "SECRET=1"))
          const result = yield* template()
          expect(result).toContain("is not empty")
        }),
      { git: true },
    ),
  )

  it.live("treats a hidden directory (not just hidden files) as non-empty", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.mkdir(path.join(dir, ".vscode")))
          const result = yield* template()
          expect(result).toContain("is not empty")
        }),
      { git: true },
    ),
  )

  it.live("ignores additional bootstrap artifacts beyond .git (e.g. .gitignore)", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.writeFile(path.join(dir, ".gitignore"), "node_modules\n"))
          const result = yield* template()
          expect(result).toContain("set up")
        }),
      { git: true },
    ),
  )

  it.live("ignores the files the container setup requires (compose.yaml, .clindroidbuddy/clindroidbuddy.jsonc)", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await fs.writeFile(path.join(dir, "compose.yaml"), "services: {}\n")
          await fs.mkdir(path.join(dir, ".clindroidbuddy"))
          await fs.writeFile(path.join(dir, ".clindroidbuddy", "clindroidbuddy.jsonc"), "{}\n")
        })
        const result = yield* template()
        expect(result).toContain("set up")
      }),
    ),
  )

  it.live("judges and scaffolds the directory it was started in, not the enclosing git repository root", () =>
    Effect.gen(function* () {
      const root = yield* tmpdirScoped({ git: true })
      const study = path.join(root, "study")
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(root, "README.md"), "hello")
        await fs.mkdir(study)
      })
      const result = yield* template().pipe(provideInstance(study))
      expect(result).toContain("set up")
      expect(result).toContain(study)
      const written = yield* Effect.promise(() => fs.readFile(path.join(study, "AGENTS.md"), "utf8"))
      expect(written).toContain("Clinical Statistical Programming Guide")
      const atRoot = yield* Effect.promise(() =>
        fs
          .stat(path.join(root, "AGENTS.md"))
          .then(() => true)
          .catch(() => false),
      )
      expect(atRoot).toBe(false)
    }),
  )

  it.live("scaffolds the standard project directories when it runs", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* template()
          for (const scaffolded of [
            "data/adam",
            "data/sdtm",
            "dict",
            "docs/specs/adam",
            "docs/specs/sdtm",
            "docs/specs/shells",
            "docs/specs/tfls",
            "docs/standards/adam",
            "docs/standards/sdtm",
            "programs/adam",
            "programs/sdtm",
            "programs/tfls",
            "tfls",
          ]) {
            const stat = yield* Effect.promise(() => fs.stat(path.join(dir, scaffolded)))
            expect(stat.isDirectory()).toBe(true)
          }
        }),
      { git: true },
    ),
  )

  it.live("does not scaffold directories when the working directory has real content", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.writeFile(path.join(dir, "README.md"), "hello"))
          yield* template()
          const exists = yield* Effect.promise(() =>
            fs
              .stat(path.join(dir, "data/adam"))
              .then(() => true)
              .catch(() => false),
          )
          expect(exists).toBe(false)
        }),
      { git: true },
    ),
  )

  it.live("falls back to the CLI-supplied directory when there is no git project (worktree resolves to /)", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const result = yield* template()
        // No .git anywhere up the tree ⇒ worktree resolves to the "/" sentinel — /init must still
        // use the actual directory the CLI was pointed at, never the real filesystem root.
        expect(result).toContain("set up")
        expect(result).toContain(dir)
        const written = yield* Effect.promise(() => fs.readFile(path.join(dir, "AGENTS.md"), "utf8"))
        expect(written).toContain("Clinical Statistical Programming Guide")
      }),
    ),
  )

  it.live("still refuses on non-empty content when there is no git project (worktree falls back to /)", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => fs.writeFile(path.join(dir, "some-file.txt"), "content"))
        const result = yield* template()
        expect(result).toContain("is not empty")
        expect(result).toContain(dir)
      }),
    ),
  )

  it.live("copies the AGENTS.md template into the working directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* template()
          const written = yield* Effect.promise(() => fs.readFile(path.join(dir, "AGENTS.md"), "utf8"))
          expect(written).toContain("Clinical Statistical Programming Guide")
        }),
      { git: true },
    ),
  )

  it.live("refuses with a specific message and does not overwrite when AGENTS.md already exists", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.writeFile(path.join(dir, "AGENTS.md"), "existing content"))
          const result = yield* template()
          expect(result).toContain("AGENTS.md")
          expect(result).toContain("already exists")
          expect(result).toContain(dir)
          const written = yield* Effect.promise(() => fs.readFile(path.join(dir, "AGENTS.md"), "utf8"))
          expect(written).toBe("existing content")
          const scaffolded = yield* Effect.promise(() =>
            fs
              .stat(path.join(dir, "data/adam"))
              .then(() => true)
              .catch(() => false),
          )
          expect(scaffolded).toBe(false)
        }),
      { git: true },
    ),
  )

  it.live("command.list does not evaluate /init's template getter (no scaffolding as a side effect of listing)", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          // Regression test: `command.list()` used to return the live command objects, whose
          // `/init` entry has a `get template()` accessor that scaffolds directories and copies
          // AGENTS.md as a side effect of merely being read (e.g. by JSON.stringify when the TUI's
          // startup sync calls `GET /command`). Listing commands must never touch the filesystem.
          const command = yield* Command.Service
          const list = yield* command.list()
          const init = list.find((c) => c.name === "init")
          expect(init).toBeDefined()
          expect(init!.template).toBe("")

          const scaffolded = yield* Effect.promise(() =>
            fs
              .stat(path.join(dir, "data/adam"))
              .then(() => true)
              .catch(() => false),
          )
          expect(scaffolded).toBe(false)
          const agentsExists = yield* Effect.promise(() =>
            fs
              .stat(path.join(dir, "AGENTS.md"))
              .then(() => true)
              .catch(() => false),
          )
          expect(agentsExists).toBe(false)
        }),
      { git: true },
    ),
  )
})
