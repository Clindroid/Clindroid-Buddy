import { defineConfig } from "drizzle-kit"
import path from "path"
import { xdgData } from "xdg-basedir"

// Mirrors the resolution in src/storage/db.ts: the database lives under the app data directory,
// and CLINBUDDY_DB overrides either the file name or, when absolute, the whole path. A source
// checkout runs on the `local` channel, so that is the database drizzle-kit should open.
const db = process.env["CLINBUDDY_DB"] ?? "opencode-local.db"

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/**/*.sql.ts",
  out: "./migration",
  dbCredentials: {
    url: path.isAbsolute(db) ? db : path.join(xdgData!, "clindroidbuddy", db),
  },
})
