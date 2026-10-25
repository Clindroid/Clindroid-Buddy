export const CLINBUDDY_RUN_ID = "CLINBUDDY_RUN_ID"
export const CLINBUDDY_PROCESS_ROLE = "CLINBUDDY_PROCESS_ROLE"

export function ensureRunID() {
  return (process.env[CLINBUDDY_RUN_ID] ??= crypto.randomUUID())
}

export function ensureProcessRole(fallback: "main" | "worker") {
  return (process.env[CLINBUDDY_PROCESS_ROLE] ??= fallback)
}

export function ensureProcessMetadata(fallback: "main" | "worker") {
  return {
    runID: ensureRunID(),
    processRole: ensureProcessRole(fallback),
  }
}

export function sanitizedProcessEnv(overrides?: Record<string, string>) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  return overrides ? Object.assign(env, overrides) : env
}
