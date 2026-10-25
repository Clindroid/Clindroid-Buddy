import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

const appPkgPath = path.resolve(import.meta.dir, "../../clindroidbuddy/package.json")
const appPkg = await Bun.file(appPkgPath).json()

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  CLINBUDDY_CHANNEL: process.env["CLINBUDDY_CHANNEL"],
  CLINBUDDY_BUMP: process.env["CLINBUDDY_BUMP"],
  CLINBUDDY_VERSION: process.env["CLINBUDDY_VERSION"],
  CLINBUDDY_RELEASE: process.env["CLINBUDDY_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.CLINBUDDY_CHANNEL) return env.CLINBUDDY_CHANNEL
  if (env.CLINBUDDY_BUMP) return "latest"
  if (env.CLINBUDDY_VERSION && !env.CLINBUDDY_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim())
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.CLINBUDDY_VERSION) return env.CLINBUDDY_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  // Version comes from this repo, not from upstream opencode's npm registry
  // entry. Releases must be reproducible from a checkout alone and must not
  // drift with an unrelated project's publishing schedule.
  const version = appPkg.version
  if (!semver.valid(version)) {
    throw new Error(`version field in ${appPkgPath} is not valid semver: ${version}`)
  }
  const t = env.CLINBUDDY_BUMP?.toLowerCase()
  if (t === "major" || t === "minor" || t === "patch") return semver.inc(version, t)!
  // No bump requested: ship exactly what package.json declares, so a tag and a
  // build of the same checkout always agree.
  return version
})()

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.CLINBUDDY_RELEASE
  },
}
console.log(`clindroidbuddy script`, JSON.stringify(Script, null, 2))
