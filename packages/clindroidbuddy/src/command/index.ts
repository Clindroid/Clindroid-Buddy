import { BusEvent } from "@/bus/bus-event"
import { InstanceState } from "@/effect"
import { EffectBridge } from "@/effect"
import type { InstanceContext } from "@/project/instance"
import { SessionID, MessageID } from "@/session/schema"
import { Effect, Layer, Context } from "effect"
import z from "zod"
import path from "path"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { Config } from "../config"
import { MCP } from "../mcp"
import { Skill } from "../skill"
// `with { type: "file" }` embeds this as an opaque file (resolving to a path, incl. inside the
// compiled binary's virtual bunfs root) rather than a parsed module — /init writes its bytes verbatim
// below instead of importing-then-writing its content, so no loader (e.g. the browser-conditions
// build's Markdown-to-HTML transform, see package.json's `dev` script) ever touches its content.
import AGENTS_MD_PATH from "../../AGENTS.md" with { type: "file" }
import PROMPT_DOWNLOAD_ADAM_TERMINOLOGY from "./template/download-adam-terminology.txt"
import PROMPT_INDEX_STANDARD_DOCS from "./template/index-standard-docs.txt"

type State = {
  commands: Record<string, Info>
}

// Entries that git or the container setup put in place before `/init` runs — not user project
// content, so their presence alone should not count as "the working directory is not empty".
// `compose.yaml` and `.clindroidbuddy/clindroidbuddy.jsonc` are required to launch clindroidbuddy
// in its container at all, so they are always there by the time `/init` can be run.
const BOOTSTRAP_ENTRIES = new Set([
  ".git",
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".clindroidbuddy",
  "compose.yaml",
])

// Standard clindroidbuddy project directories `/init` scaffolds. Deterministic and cheap, so it
// runs directly here rather than as an LLM-driven step — that used to cost a round trip of tool
// calls for something that never needs judgment.
const SCAFFOLD_DIRS = [
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
] as const

export const Event = {
  Executed: BusEvent.define(
    "command.executed",
    z.object({
      name: z.string(),
      sessionID: SessionID.zod,
      arguments: z.string(),
      messageID: MessageID.zod,
    }),
  ),
}

export const Info = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    agent: z.string().optional(),
    model: z.string().optional(),
    source: z.enum(["command", "mcp", "skill"]).optional(),
    // workaround for zod not supporting async functions natively so we use getters
    // https://zod.dev/v4/changelog?id=zfunction
    template: z.promise(z.string()).or(z.string()),
    subtask: z.boolean().optional(),
    hints: z.array(z.string()),
  })
  .meta({
    ref: "Command",
  })

// for some reason zod is inferring `string` for z.promise(z.string()).or(z.string()) so we have to manually override it
export type Info = Omit<z.infer<typeof Info>, "template"> & { template: Promise<string> | string }

export function hints(template: string) {
  const result: string[] = []
  const numbered = template.match(/\$\d+/g)
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match)
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
  return result
}

export const Default = {
  INIT: "init",
  DOWNLOAD_ADAM_TERMINOLOGY: "download-adam-terminology",
  INDEX_STANDARD_DOCS: "index-standard-docs",
} as const

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Command") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const mcp = yield* MCP.Service
    const skill = yield* Skill.Service
    const fs = yield* AppFileSystem.Service

    const init = Effect.fn("Command.state")(function* (ctx: InstanceContext) {
      const cfg = yield* config.get()
      const bridge = yield* EffectBridge.make()
      const commands: Record<string, Info> = {}

      commands[Default.INIT] = {
        name: Default.INIT,
        description: "scaffold project directories and add the standard AGENTS.md guide",
        source: "command",
        get template() {
          return bridge.promise(
            Effect.gen(function* () {
              // Use the directory clindroidbuddy was started in, not `worktree`: `worktree` walks up to
              // the nearest `.git`, so an empty study folder inside some git repository would be
              // judged (and scaffolded) by the repository root instead of the folder itself.
              const target = ctx.directory
              if (target === "/") {
                return `No project directory was found for \`${target}\`, so \`/init\` did not run. Run \`/init\` from inside a project directory instead.`
              }
              const entries = yield* fs
                .readDirectoryEntries(target)
                .pipe(Effect.catch(() => Effect.succeed([] as AppFileSystem.DirEntry[])))

              // Checked ahead of the general emptiness gate so a pre-existing AGENTS.md gets its own
              // specific explanation instead of being lumped into the generic "not empty" message.
              const agentsPath = path.join(target, "AGENTS.md")
              if (entries.some((entry) => entry.name === "AGENTS.md")) {
                return `\`AGENTS.md\` already exists in \`${target}\`, so \`/init\` did not copy over it.`
              }

              const meaningful = entries.filter((entry) => !BOOTSTRAP_ENTRIES.has(entry.name))
              if (meaningful.length > 0) {
                return `The working directory \`${target}\` is not empty, so \`/init\` did not run. \`/init\` only sets up a project in an empty directory — clear the directory first, or run \`/init\` in a new empty directory instead. Note: this check also counts hidden entries (e.g. \`.env\`), which may not be visible in a plain directory listing — common bootstrap artifacts (${Array.from(BOOTSTRAP_ENTRIES).join(", ")}) are ignored.`
              }

              return yield* Effect.gen(function* () {
                yield* Effect.forEach(SCAFFOLD_DIRS, (dir) => fs.ensureDir(path.join(target, dir)), {
                  discard: true,
                })
                // Read-then-write rather than `copyFile`: in the compiled binary AGENTS_MD_PATH lives in
                // the virtual `/$bunfs` root, which `readFile` can open but the copyfile syscall cannot
                // (fails with ENOENT, after the directories above were already created).
                yield* fs.writeFile(agentsPath, yield* fs.readFile(AGENTS_MD_PATH))
                return `\`/init\` completed: set up \`${target}\` for a clindroidbuddy project — created the standard project directories and added \`AGENTS.md\` with the project's clinical programming conventions.`
              }).pipe(
                // Report a failure as the reply too: letting it reject the template promise leaves only
                // the `/init` user message in the chat, with the error surfacing nowhere the user sees.
                Effect.catch((error) =>
                  Effect.succeed(
                    `\`/init\` failed while setting up \`${target}\`: ${error.message}\n\nSome project directories may already have been created. Remove them so the directory is empty again, then run \`/init\` again.`,
                  ),
                ),
              )
            }),
          )
        },
        hints: [],
      }
      commands[Default.DOWNLOAD_ADAM_TERMINOLOGY] = {
        name: Default.DOWNLOAD_ADAM_TERMINOLOGY,
        description: "download an ADaM Controlled Terminology package [version yyyy-mm-dd]",
        source: "command",
        get template() {
          return PROMPT_DOWNLOAD_ADAM_TERMINOLOGY
        },
        hints: hints(PROMPT_DOWNLOAD_ADAM_TERMINOLOGY),
      }
      commands[Default.INDEX_STANDARD_DOCS] = {
        name: Default.INDEX_STANDARD_DOCS,
        description: "build/refresh the ADaM/SDTM IG document search index [adam|sdtm]",
        source: "command",
        get template() {
          return PROMPT_INDEX_STANDARD_DOCS
        },
        hints: hints(PROMPT_INDEX_STANDARD_DOCS),
      }

      for (const [name, command] of Object.entries(cfg.command ?? {})) {
        commands[name] = {
          name,
          agent: command.agent,
          model: command.model,
          description: command.description,
          source: "command",
          get template() {
            return command.template
          },
          subtask: command.subtask,
          hints: hints(command.template),
        }
      }

      for (const [name, prompt] of Object.entries(yield* mcp.prompts())) {
        commands[name] = {
          name,
          source: "mcp",
          description: prompt.description,
          get template() {
            return bridge.promise(
              mcp
                .getPrompt(
                  prompt.client,
                  prompt.name,
                  prompt.arguments
                    ? Object.fromEntries(prompt.arguments.map((argument, i) => [argument.name, `$${i + 1}`]))
                    : {},
                )
                .pipe(
                  Effect.map(
                    (template) =>
                      template?.messages
                        .map((message) => (message.content.type === "text" ? message.content.text : ""))
                        .join("\n") || "",
                  ),
                ),
            )
          },
          hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
        }
      }

      for (const item of yield* skill.all()) {
        if (commands[item.name]) continue
        commands[item.name] = {
          name: item.name,
          description: item.description,
          source: "skill",
          get template() {
            return item.content
          },
          hints: [],
        }
      }

      return {
        commands,
      }
    })

    const state = yield* InstanceState.make<State>((ctx) => init(ctx))

    const get = Effect.fn("Command.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.commands[name]
    })

    const list = Effect.fn("Command.list")(function* () {
      const s = yield* InstanceState.get(state)
      // Return plain data copies with `template` left unevaluated: `template` is a `get` accessor
      // on some commands (e.g. `/init`) that runs side effects (scaffolding directories, copying
      // AGENTS.md) the instant it's read — even just to serialize the value, not to use it. Nothing
      // that consumes this list needs the resolved template text (only `command.get` does, at actual
      // invocation time), but naively returning the live command objects here means `c.json()`'s
      // JSON.stringify enumerates every property including `template`, triggering those side effects
      // on every client that merely lists available commands (e.g. TUI startup sync).
      return Object.values(s.commands).map(
        (cmd): Info => ({
          name: cmd.name,
          description: cmd.description,
          agent: cmd.agent,
          model: cmd.model,
          source: cmd.source,
          subtask: cmd.subtask,
          hints: cmd.hints,
          template: "",
        }),
      )
    })

    return Service.of({ get, list })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Config.defaultLayer),
  Layer.provide(MCP.defaultLayer),
  Layer.provide(Skill.defaultLayer),
  Layer.provide(AppFileSystem.defaultLayer),
)

export * as Command from "."
