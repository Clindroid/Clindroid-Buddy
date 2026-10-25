import { Schema } from "effect"
import { zod } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"

export const Info = Schema.Struct({
  embeddingModel: Schema.optional(Schema.String).annotate({
    description:
      "providerID/modelID of the text embedding model used by local RAG tools (e.g. the standard_doc_search tool), such as 'ollama/nomic-embed-text' (a manually-run Ollama server over HTTP) or 'llamacpp/nomic-embed-text' (the `clindroidbuddy/llamacpp-embedding` bundled provider, which auto-starts and manages a user-installed `llama-server` (llama.cpp) as a child process — see THIRD_PARTY_NOTICES.md). The provider must be declared under `provider` and expose an embedding model at that id.",
  }),
}).pipe(withStatics((s) => ({ zod: zod(s) })))

export type Info = Schema.Schema.Type<typeof Info>

export * as ConfigRag from "./rag"
