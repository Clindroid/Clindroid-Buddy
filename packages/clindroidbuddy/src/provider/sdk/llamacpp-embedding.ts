import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { EmbeddingModelV3 } from "@ai-sdk/provider"
import { ensureServer } from "./llamacpp-server"

export interface LlamaCppEmbeddingProviderSettings {
  name?: string
  binaryPath?: string
  modelPath?: string
  port?: number
  // Test seams only — never set these in production config. Lets tests substitute a fake server
  // handshake and client without mock.module()'ing ./llamacpp-server or @ai-sdk/openai-compatible,
  // which would replace those modules for the rest of the test process (bun runs test files
  // concurrently by default, so a module-wide mock leaks into unrelated tests running at the same
  // time — @ai-sdk/openai-compatible in particular backs several unrelated provider code paths).
  ensureServer?: typeof ensureServer
  createOpenAICompatible?: typeof createOpenAICompatible
  [key: string]: unknown
}

export interface LlamaCppEmbeddingProvider {
  languageModel(modelId: string): never
  embeddingModel(modelId: string): EmbeddingModelV3
}

/**
 * Bundled provider factory that auto-starts and manages a `llama-server` (llama.cpp, MIT License,
 * https://github.com/ggml-org/llama.cpp) child process — installed separately by the user, never
 * bundled — and delegates embedding calls to it over its OpenAI-compatible /v1/embeddings endpoint.
 */
export function createLlamaCppEmbedding(
  options: LlamaCppEmbeddingProviderSettings = {},
): LlamaCppEmbeddingProvider {
  return {
    languageModel(): never {
      throw new Error("The llama.cpp embedding provider only supports embedding models, not language models.")
    },
    embeddingModel(modelId: string): EmbeddingModelV3 {
      return {
        specificationVersion: "v3",
        provider: options.name ?? "clindroidbuddy-llamacpp",
        modelId,
        maxEmbeddingsPerCall: undefined,
        supportsParallelCalls: true,
        async doEmbed(callOptions) {
          if (!options.modelPath)
            throw new Error(
              "provider.<id>.options.modelPath is required for the llama.cpp embedding provider (path to a GGUF embedding model file).",
            )
          const ensureServerFn = options.ensureServer ?? ensureServer
          const createOpenAICompatibleFn = options.createOpenAICompatible ?? createOpenAICompatible
          const { baseURL } = await ensureServerFn({
            binaryPath: options.binaryPath,
            modelPath: options.modelPath,
            port: options.port,
          })
          const inner = createOpenAICompatibleFn({ name: options.name ?? "llamacpp", baseURL }).embeddingModel(
            modelId,
          )
          return inner.doEmbed(callOptions)
        },
      }
    },
  }
}
