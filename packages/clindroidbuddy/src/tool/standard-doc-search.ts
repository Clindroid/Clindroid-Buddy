import path from "path"
import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { Config } from "../config"
import { Provider } from "@/provider"
import { Instance } from "../project/instance"
import * as Rag from "../rag/doc"
import { Standard } from "../rag/schema"
import DESCRIPTION from "./standard-doc-search.txt"

const Parameters = z.object({
  standard: Standard.describe('Which CDISC standard\'s IG documents to operate on: "adam" or "sdtm".'),
  action: z
    .enum(["index", "search", "status"])
    .describe(
      "index: scan docs/standards/<standard>/ and (re)build the local search index for that standard. search: semantically search that standard's index (requires `query`). status: list indexed documents and chunk counts for that standard.",
    ),
  query: z
    .string()
    .optional()
    .describe(
      "Required for action \"search\". Natural-language query — include the variable/topic name and the IG version for best results.",
    ),
  topK: z
    .number()
    .int()
    .positive()
    .max(20)
    .optional()
    .describe('Number of results to return for action "search". Defaults to 5.'),
})

function guidanceCatch<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.catchIf(
      (e: E) => Rag.NoEmbeddingModelError.isInstance(e) || Rag.NotIndexedError.isInstance(e),
      (e: E) => Effect.succeed({ guidance: (e as unknown as { data: { message: string } }).data.message }),
    ),
  )
}

export const StandardDocSearchTool = Tool.define(
  "standard_doc_search",
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const config = yield* Config.Service
    const provider = yield* Provider.Service
    const rag = Rag.make({ fs, config, provider })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: z.infer<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const toolLabel = `standard_doc_search (${params.standard})`

          if (params.action === "index") {
            const dir = path.join(Instance.directory, Rag.relativeDir(params.standard))
            const pattern = path.join(path.relative(Instance.worktree, dir), "**")
            yield* ctx.ask({ permission: "read", patterns: [pattern], always: ["*"], metadata: {} })

            const result = yield* guidanceCatch(rag.index(params.standard))
            if ("guidance" in result) {
              return { title: `${toolLabel} index`, metadata: { data: result }, output: result.guidance }
            }

            if (result.documents.length === 0) {
              return {
                title: `${toolLabel} index`,
                metadata: { data: result },
                output: `No .pdf/.docx files found under ${Rag.relativeDir(params.standard)}/. Place ${params.standard.toUpperCase()} IG source documents there and retry.`,
              }
            }

            const lines = result.documents.map((d) => `- [${d.status}] ${d.sourcePath} (${d.chunkCount} chunks)`)
            return {
              title: `${toolLabel} index`,
              metadata: { data: result },
              output: [`Indexed ${Rag.relativeDir(params.standard)}/:`, "", ...lines].join("\n"),
            }
          }

          if (params.action === "search") {
            if (!params.query) {
              return {
                title: `${toolLabel} search`,
                metadata: { data: undefined as unknown },
                output: 'action "search" requires a `query` parameter.',
              }
            }

            const topK = params.topK ?? 5
            const result = yield* guidanceCatch(rag.search(params.standard, params.query, topK))
            if ("guidance" in result) {
              return { title: `${toolLabel} search`, metadata: { data: result }, output: result.guidance }
            }

            if (result.length === 0) {
              return {
                title: `${toolLabel} search`,
                metadata: { data: result },
                output: [
                  `No relevant chunks found for "${params.query}".`,
                  "This does not mean the fact is false — fall back to standard IG convention knowledge and note that the IG document itself could not confirm it.",
                ].join("\n"),
              }
            }

            const lines = result.flatMap((hit, i) => [
              `${i + 1}. [${hit.sourcePath}, ${hit.location}] (score ${hit.score.toFixed(3)})`,
              hit.text,
              "",
            ])
            return {
              title: `${toolLabel} search`,
              metadata: { data: result },
              output: lines.join("\n").trimEnd(),
            }
          }

          // status
          const result = yield* rag.status(params.standard)
          if (result.length === 0) {
            return {
              title: `${toolLabel} status`,
              metadata: { data: result },
              output: `No ${params.standard.toUpperCase()} IG documents indexed for this project yet. Place PDF/DOCX files under ${Rag.relativeDir(params.standard)}/ and run action "index".`,
            }
          }

          const lines = result.map(
            (d) =>
              `- ${d.sourcePath}: ${d.chunkCount} chunks (embedding: ${d.embeddingProviderID}/${d.embeddingModelID}, updated ${new Date(d.timeUpdated).toISOString()})`,
          )
          return { title: `${toolLabel} status`, metadata: { data: result }, output: lines.join("\n") }
        }).pipe(Effect.orDie),
    }
  }),
)
