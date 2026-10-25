import type { Argv } from "yargs"
import path from "path"
import { cmd } from "./cmd"
import { UI } from "../ui"
import { Config } from "../../config"
import { ConfigSchema } from "../../config/schema"
import { TuiInfo } from "./tui/config/tui-schema"

export const SchemaCommand = cmd({
  command: "schema",
  describe: "print the JSON Schema for the config file",
  builder: (yargs: Argv) => {
    return yargs
      .option("tui", {
        describe: "emit the schema for tui.json instead of clindroidbuddy.json",
        type: "boolean",
      })
      .option("out", {
        describe: "write to this file instead of stdout",
        type: "string",
      })
  },
  handler: async (args) => {
    const json = ConfigSchema.render(args.tui ? TuiInfo : Config.Info)

    if (args.out) {
      const target = path.resolve(args.out)
      await Bun.write(target, json)
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Wrote " + UI.Style.TEXT_NORMAL + target)
      return
    }

    // Wait for stdout to finish writing before process.exit() is called
    await new Promise<void>((resolve, reject) => {
      process.stdout.write(json + "\n", (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  },
})
