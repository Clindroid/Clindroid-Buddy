import { describe, test, expect } from "bun:test"
import { EventEmitter } from "events"
import { ensureServer } from "@/provider/sdk/llamacpp-server"
import { createLlamaCppEmbedding } from "@/provider/sdk/llamacpp-embedding"

// Deliberately avoids mock.module() for @/util/which, @/util/process, ./llamacpp-server, and
// @ai-sdk/openai-compatible. bun's mock.module() replaces a module for the rest of the test
// *process*, and bun runs test files concurrently by default (see --max-concurrency), so a
// module-wide mock here would corrupt unrelated tests running at the same time — most notably
// every other test that touches @ai-sdk/openai-compatible via src/provider/provider.ts. Instead,
// ensureServer() and createLlamaCppEmbedding() accept injectable which/spawn/ensureServer/
// createOpenAICompatible test seams so fakes stay local to each call.

function fakeFailingChild() {
  const child = new EventEmitter() as EventEmitter & {
    exitCode: number | null
    signalCode: string | null
    stdout: EventEmitter
    stderr: EventEmitter
    kill: () => void
  }
  child.exitCode = 1
  child.signalCode = null
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => undefined
  return child
}

describe("ensureServer", () => {
  test("throws a clear error when llama-server is not found on PATH", async () => {
    await expect(
      ensureServer({ modelPath: "/nonexistent/model.gguf", which: () => null }),
    ).rejects.toThrow(/llama-server binary not found on PATH/)
  })

  test("throws a clear error when the model file does not exist", async () => {
    await expect(
      ensureServer({ binaryPath: import.meta.path, modelPath: "/nonexistent/model.gguf" }),
    ).rejects.toThrow(/Embedding model file not found/)
  })

  test("retries a fresh spawn after a failed start, instead of caching the failure forever", async () => {
    let spawnCallCount = 0
    const spawn = (() => {
      spawnCallCount++
      return fakeFailingChild()
    }) as unknown as typeof import("@/util/process").spawn

    await expect(
      ensureServer({ binaryPath: "/fake/llama-server", modelPath: import.meta.path, port: 54321, spawn }),
    ).rejects.toThrow(/exited before becoming healthy/)
    expect(spawnCallCount).toBe(1)

    await expect(
      ensureServer({ binaryPath: "/fake/llama-server", modelPath: import.meta.path, port: 54321, spawn }),
    ).rejects.toThrow(/exited before becoming healthy/)
    expect(spawnCallCount).toBe(2)
  })
})

describe("createLlamaCppEmbedding", () => {
  test("ensures the server is running and delegates doEmbed to the openai-compatible client", async () => {
    const ensureServerCalls: unknown[] = []
    const doEmbedCalls: unknown[] = []

    const provider = createLlamaCppEmbedding({
      modelPath: "/models/nomic-embed-text-v1.5.gguf",
      binaryPath: "/usr/local/bin/llama-server",
      ensureServer: (async (opts: unknown) => {
        ensureServerCalls.push(opts)
        return { baseURL: "http://127.0.0.1:12345/v1" }
      }) as unknown as typeof ensureServer,
      createOpenAICompatible: ((createOpts: { name?: string; baseURL: string }) => ({
        embeddingModel: (modelId: string) => ({
          specificationVersion: "v3",
          provider: createOpts.name,
          modelId,
          maxEmbeddingsPerCall: undefined,
          supportsParallelCalls: true,
          doEmbed: async (callOpts: unknown) => {
            doEmbedCalls.push({ baseURL: createOpts.baseURL, modelId, callOpts })
            return { embeddings: [[1, 2, 3]], warnings: [] }
          },
        }),
      })) as unknown as typeof import("@ai-sdk/openai-compatible").createOpenAICompatible,
    })
    const model = provider.embeddingModel("nomic-embed-text")

    expect(model.specificationVersion).toBe("v3")
    expect(model.modelId).toBe("nomic-embed-text")

    const result = await model.doEmbed({ values: ["hello"] })

    expect(result).toEqual({ embeddings: [[1, 2, 3]], warnings: [] })
    expect(ensureServerCalls).toEqual([
      { binaryPath: "/usr/local/bin/llama-server", modelPath: "/models/nomic-embed-text-v1.5.gguf", port: undefined },
    ])
    expect(doEmbedCalls).toEqual([
      { baseURL: "http://127.0.0.1:12345/v1", modelId: "nomic-embed-text", callOpts: { values: ["hello"] } },
    ])
  })

  test("throws a clear error when modelPath is not configured", async () => {
    const provider = createLlamaCppEmbedding({})
    const model = provider.embeddingModel("nomic-embed-text")

    await expect(model.doEmbed({ values: ["hello"] })).rejects.toThrow(/modelPath is required/)
  })

  test("languageModel is unsupported", () => {
    const provider = createLlamaCppEmbedding({ modelPath: "/models/nomic-embed-text-v1.5.gguf" })
    expect(() => provider.languageModel("nomic-embed-text")).toThrow(/only supports embedding models/)
  })
})
