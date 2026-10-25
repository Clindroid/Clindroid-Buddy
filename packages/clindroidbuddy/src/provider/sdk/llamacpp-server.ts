import { existsSync } from "fs"
import net from "net"
import { spawn, type Child } from "@/util/process"
import { which } from "@/util/which"
import { Log } from "@/util"

const log = Log.create({ service: "llamacpp-server" })

export interface EnsureServerOptions {
  binaryPath?: string
  modelPath: string
  port?: number
  // Test seams only — never set these in production config. Lets tests exercise the "binary
  // missing" and "spawn fails" paths without mock.module()'ing @/util/which or @/util/process,
  // which replace those modules for the rest of the test process (bun runs test files
  // concurrently by default, so a module-wide mock leaks into unrelated tests running at the
  // same time).
  which?: typeof which
  spawn?: typeof spawn
}

interface ManagedServer {
  child: Child
  baseURL: string
}

// Keyed by binaryPath+modelPath (not port — the port is resolved once per key below, inside the
// cached promise, so that a caller who doesn't pin a port still reuses the same server on
// subsequent calls instead of picking a fresh free port — and thus spawning a fresh process —
// every time).
const servers = new Map<string, Promise<ManagedServer>>()

// Tracked separately (not just derived from `servers`) so the "exit" handler can kill children
// synchronously — Node/Bun does not wait for async work (like resolving `servers`' promises)
// started from an "exit" listener before the process actually terminates.
const runningChildren = new Set<Child>()

function cacheKey(binaryPath: string, modelPath: string): string {
  return `${binaryPath}::${modelPath}`
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port)
        else reject(new Error("Failed to determine a free port"))
      })
    })
  })
}

async function waitForHealthy(baseURL: string, child: Child, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let stderrTail = ""
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4_000)
  })

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`llama-server exited before becoming healthy.${stderrTail ? `\n${stderrTail}` : ""}`)
    }
    try {
      const res = await fetch(`${baseURL}/health`)
      if (res.ok) {
        const body = (await res.json()) as { status?: string }
        if (body.status === "ok") return
      }
    } catch {
      // not listening yet, keep polling
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Timed out waiting for llama-server to become healthy at ${baseURL}.${stderrTail ? `\n${stderrTail}` : ""}`)
}

async function startServer(
  binaryPath: string,
  modelPath: string,
  port: number,
  spawnFn: typeof spawn,
): Promise<ManagedServer> {
  log.info("Starting llama-server (MIT License, https://github.com/ggml-org/llama.cpp)", {
    binaryPath,
    modelPath,
    port,
  })

  const child = spawnFn([binaryPath, "-m", modelPath, "--embeddings", "--host", "127.0.0.1", "--port", String(port)], {
    stdout: "pipe",
    stderr: "pipe",
  })

  runningChildren.add(child)
  child.once("exit", () => runningChildren.delete(child))

  const baseURL = `http://127.0.0.1:${port}`
  await waitForHealthy(baseURL, child)
  return { child, baseURL: `${baseURL}/v1` }
}

function killRunningChildrenSync() {
  for (const child of runningChildren) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    try {
      child.kill("SIGTERM")
    } catch {
      // best-effort
    }
  }
}

const cleanupRegistered = { done: false }
function registerCleanup() {
  if (cleanupRegistered.done) return
  cleanupRegistered.done = true
  // "exit" alone is not enough: a SIGINT/SIGTERM delivered while nothing else in the process has
  // a listener for it terminates the process at the OS level without ever running Node's "exit"
  // event (confirmed by testing) — so an explicit handler is needed to guarantee this cleanup
  // runs on Ctrl+C / `kill` too, not just on a normal `process.exit()`/natural completion.
  process.once("exit", killRunningChildrenSync)
  process.once("SIGINT", () => {
    killRunningChildrenSync()
    process.exit(130)
  })
  process.once("SIGTERM", () => {
    killRunningChildrenSync()
    process.exit(143)
  })
}

export async function ensureServer(opts: EnsureServerOptions): Promise<{ baseURL: string }> {
  const findBinary = opts.which ?? which
  const spawnFn = opts.spawn ?? spawn
  const binaryPath = opts.binaryPath ?? findBinary("llama-server")
  if (!binaryPath)
    throw new Error(
      "llama-server binary not found on PATH. Install llama.cpp (e.g. `brew install llama.cpp`) or set " +
        "provider.<id>.options.binaryPath to the llama-server executable.",
    )

  if (!existsSync(opts.modelPath))
    throw new Error(
      `Embedding model file not found at "${opts.modelPath}". Set provider.<id>.options.modelPath to a GGUF ` +
        `embedding model file (e.g. nomic-embed-text-v1.5.f16.gguf, Apache License 2.0, ` +
        `https://huggingface.co/nomic-ai/nomic-embed-text-v1.5).`,
    )

  const key = cacheKey(binaryPath, opts.modelPath)

  const existing = servers.get(key)
  if (existing) {
    try {
      const server = await existing
      if (server.child.exitCode === null && server.child.signalCode === null) return { baseURL: server.baseURL }
    } catch {
      // The previous attempt failed to start (e.g. health-check timeout) — fall through and retry
      // instead of permanently caching the failure.
    }
    servers.delete(key)
  }

  registerCleanup()
  const created = (async () => {
    const port = opts.port ?? (await findFreePort())
    return startServer(binaryPath, opts.modelPath, port, spawnFn)
  })()
  servers.set(key, created)
  const server = await created
  return { baseURL: server.baseURL }
}
