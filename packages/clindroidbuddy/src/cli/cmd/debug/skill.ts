import { EOL } from "os"
import { Effect } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { Skill } from "../../../skill"
import { bootstrap } from "../../bootstrap"
import { cmd } from "../cmd"

export const SkillCommand = cmd({
  command: "skill",
  describe: "list all available skills",
  builder: (yargs) => yargs,
  async handler() {
    await bootstrap(process.cwd(), async () => {
      const skills = await AppRuntime.runPromise(
        Effect.gen(function* () {
          const skill = yield* Skill.Service
          return yield* skill.all()
        }),
      )
      // Wait for stdout to finish writing before process.exit() is called; a
      // pipe otherwise only receives the first buffer's worth (64 KiB on Linux)
      await new Promise<void>((resolve, reject) => {
        process.stdout.write(JSON.stringify(skills, null, 2) + EOL, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    })
  },
})
