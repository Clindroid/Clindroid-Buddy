import { Installation } from "@/installation"
import { Server } from "@/server/server"
import { Log } from "@/util"
import { Instance } from "@/project/instance"
import { InstanceBootstrap } from "@/project/bootstrap"
import { Rpc } from "@/util"
import { upgrade } from "@/cli/upgrade"
import { Config } from "@/config"
import { GlobalBus } from "@/bus/global"
import { Flag } from "@/flag/flag"
import { writeHeapSnapshot } from "node:v8"
import { Heap } from "@/cli/heap"
import { AppRuntime } from "@/effect/app-runtime"
import { ensureProcessMetadata } from "@/util/opencode-process"

ensureProcessMetadata("worker")

await Log.init({
  print: process.argv.includes("--print-logs"),
  dev: Installation.isLocal(),
  level: (() => {
    if (Installation.isLocal()) return "DEBUG"
    return "INFO"
  })(),
})

// This worker thread has its own global realm, so the main TUI thread's opentui console
// patch (which keeps stray console output from corrupting the rendered screen) doesn't
// apply here. Redirect raw console calls (e.g. pdf.js warnings during RAG indexing) to the
// log file instead of letting them write directly to the real terminal.
const consoleLog = Log.create({ service: "console" })
console.log = (message?: any, ...extra: any[]) => consoleLog.info(message, { extra })
console.info = (message?: any, ...extra: any[]) => consoleLog.info(message, { extra })
console.debug = (message?: any, ...extra: any[]) => consoleLog.debug(message, { extra })
console.warn = (message?: any, ...extra: any[]) => consoleLog.warn(message, { extra })
console.error = (message?: any, ...extra: any[]) => consoleLog.error(message, { extra })

Heap.start()

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : e,
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : e,
  })
})

// Subscribe to global events and forward them via RPC
GlobalBus.on("event", (event) => {
  Rpc.emit("global.event", event)
})

export const rpc = {
  async fetch(input: { url: string; method: string; headers: Record<string, string>; body?: string }) {
    const headers = { ...input.headers }
    const auth = getAuthorizationHeader()
    if (auth && !headers["authorization"] && !headers["Authorization"]) {
      headers["Authorization"] = auth
    }
    const request = new Request(input.url, {
      method: input.method,
      headers,
      body: input.body,
    })
    const response = await Server.Default().app.fetch(request)
    const body = await response.text()
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
    }
  },
  snapshot() {
    const result = writeHeapSnapshot("server.heapsnapshot")
    return result
  },
  async checkUpgrade(input: { directory: string }) {
    await Instance.provide({
      directory: input.directory,
      init: () => AppRuntime.runPromise(InstanceBootstrap),
      fn: async () => {
        await upgrade().catch(() => {})
      },
    })
  },
  async reload() {
    await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.invalidate(true)))
  },
  async shutdown() {
    Log.Default.info("worker shutting down")

    await Instance.disposeAll()
  },
}

Rpc.listen(rpc)

function getAuthorizationHeader(): string | undefined {
  const password = Flag.CLINBUDDY_SERVER_PASSWORD
  if (!password) return undefined
  const username = Flag.CLINBUDDY_SERVER_USERNAME ?? "clinbuddy"
  return `Basic ${btoa(`${username}:${password}`)}`
}
