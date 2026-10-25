import path from "path"
import { mkdirSync } from "fs"
import { Effect } from "effect"
import { embed, embedMany } from "ai"
import type { EmbeddingModelV3 } from "@ai-sdk/provider"
import { extractText as extractPdfText } from "unpdf"
import mammoth from "mammoth"
import z from "zod"
import { eq, and } from "drizzle-orm"
import { AppFileSystem } from "@opencode-ai/shared/filesystem"
import { NamedError } from "@opencode-ai/shared/util/error"
import type { Config } from "../config"
import { Provider } from "@/provider"
import { Instance } from "../project/instance"
import { init } from "#db"
import { RagChunkTable, RagDocumentTable } from "./doc.sql"
import { RagChunkID, RagDocumentID, type Standard } from "./schema"
import { chunkText, rankBySimilarity, embeddingToBuffer, bufferToEmbedding, hashText } from "./chunk"

type ProjectDb = ReturnType<typeof init>

// Keyed by project directory (Instance.directory) rather than a single global
// singleton: each project stores its own index file under its own directory,
// so multiple projects opened in the same process never share one connection.
const projectClients = new Map<string, ProjectDb>()

/** Path of the project-local RAG index database, colocated with the project rather than a shared, global data directory. */
export function projectDbPath(directory: string): string {
  return path.join(directory, ".clindroidbuddy", "rag-db", "rag.db")
}

/**
 * Opens (creating on first use) the SQLite database that stores this project's RAG index.
 * Deliberately stored inside the project directory itself — not the shared global app data
 * directory — so the index is scoped to the project by file location, never by a derived
 * project identity (which falls back to a shared bucket for projects with no git repo).
 */
function projectDb(): ProjectDb {
  const directory = Instance.directory
  const existing = projectClients.get(directory)
  if (existing) return existing

  const dbPath = projectDbPath(directory)
  mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = init(dbPath)

  db.run("PRAGMA journal_mode = WAL")
  db.run("PRAGMA synchronous = NORMAL")
  db.run("PRAGMA busy_timeout = 5000")
  db.run("PRAGMA foreign_keys = ON")
  db.run(`CREATE TABLE IF NOT EXISTS standard_doc (
    id TEXT PRIMARY KEY,
    standard TEXT NOT NULL,
    source_path TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    embedding_provider_id TEXT NOT NULL,
    embedding_model_id TEXT NOT NULL,
    embedding_dim INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL
  )`)
  db.run("CREATE INDEX IF NOT EXISTS standard_doc_standard_idx ON standard_doc (standard)")
  db.run("CREATE INDEX IF NOT EXISTS standard_doc_standard_path_idx ON standard_doc (standard, source_path)")
  db.run(`CREATE TABLE IF NOT EXISTS standard_doc_chunk (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES standard_doc(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    location TEXT NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL
  )`)
  db.run("CREATE INDEX IF NOT EXISTS standard_doc_chunk_document_idx ON standard_doc_chunk (document_id, chunk_index)")

  projectClients.set(directory, db)
  return db
}

export function relativeDir(standard: Standard): string {
  return path.join("docs", "standards", standard)
}

export const NoEmbeddingModelError = NamedError.create(
  "RagNoEmbeddingModelError",
  z.object({
    message: z.string(),
  }),
)

export const NotIndexedError = NamedError.create(
  "RagNotIndexedError",
  z.object({
    message: z.string(),
  }),
)

export interface DocumentResult {
  sourcePath: string
  status: "indexed" | "unchanged" | "removed"
  chunkCount: number
}

export interface SearchHit {
  sourcePath: string
  location: string
  text: string
  score: number
}

export interface StatusEntry {
  sourcePath: string
  chunkCount: number
  embeddingProviderID: string
  embeddingModelID: string
  timeUpdated: number
}

async function extractPages(filePath: string, bytes: Uint8Array): Promise<{ location: string; text: string }[]> {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === ".pdf") {
    // fs.readFile can hand back a Node/Bun Buffer (a Uint8Array subclass); unpdf's decryption path
    // rejects that with "Please provide binary data as Uint8Array, rather than Buffer.", so
    // normalize to a plain Uint8Array view here.
    const plain = bytes instanceof Buffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes
    const { text } = await extractPdfText(plain, { mergePages: false })
    return text.map((pageText, i) => ({ location: `p.${i + 1}`, text: pageText }))
  }
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    return [{ location: "document", text: value }]
  }
  throw new Error(`Unsupported document type: ${filePath} (only .pdf and .docx are supported)`)
}

function locationFor(page: { location: string }, chunkIndexInPage: number, chunksInPage: number): string {
  return chunksInPage > 1 ? `${page.location} (${chunkIndexInPage + 1}/${chunksInPage})` : page.location
}

export interface Dependencies {
  fs: AppFileSystem.Interface
  config: Config.Interface
  provider: Provider.Interface
}

export function make(deps: Dependencies) {
  const { fs, config, provider } = deps

  const resolveModel = Effect.fn("Rag.resolveModel")(function* () {
    const cfg = yield* config.get()
    const raw = cfg.rag?.embeddingModel
    if (!raw)
      return yield* Effect.fail(
        new NoEmbeddingModelError({
          message:
            "rag.embeddingModel is not configured. Add an embedding model id to an existing provider in clindroidbuddy.json (e.g. Ollama's `nomic-embed-text`) and set `rag.embeddingModel` to \"<providerID>/<modelID>\".",
        }),
      )
    const { providerID, modelID } = Provider.parseModel(raw)
    const model = yield* provider.getModel(providerID, modelID)
    const embeddingModel = yield* provider.getEmbedding(model)
    return { providerID: providerID as string, modelID: modelID as string, embeddingModel }
  })

  const listSourceFiles = Effect.fn("Rag.listSourceFiles")(function* (standard: Standard) {
    const dir = path.join(Instance.directory, relativeDir(standard))
    const exists = yield* fs.existsSafe(dir)
    if (!exists) return [] as string[]
    const pdfs = yield* fs.glob("*.pdf", { cwd: dir, absolute: true, include: "file" })
    const docxs = yield* fs.glob("*.docx", { cwd: dir, absolute: true, include: "file" })
    return [...pdfs, ...docxs].sort()
  })

  const index = Effect.fn("Rag.index")(function* (standard: Standard) {
    const { providerID, modelID, embeddingModel } = yield* resolveModel()
    const files = yield* listSourceFiles(standard)
    const db = projectDb()
    const results: DocumentResult[] = []

    for (const filePath of files) {
      const sourcePath = path.relative(Instance.directory, filePath)
      const bytes = yield* fs.readFile(filePath)
      const hash = hashText(Buffer.from(bytes).toString("base64"))

      const existing = db
        .select()
        .from(RagDocumentTable)
        .where(and(eq(RagDocumentTable.standard, standard), eq(RagDocumentTable.source_path, sourcePath)))
        .get()

      if (
        existing &&
        existing.content_hash === hash &&
        existing.embedding_provider_id === providerID &&
        existing.embedding_model_id === modelID
      ) {
        results.push({ sourcePath, status: "unchanged", chunkCount: existing.chunk_count })
        continue
      }

      const pages = yield* Effect.tryPromise({
        try: () => extractPages(filePath, bytes),
        catch: (cause) =>
          new Error(
            `Failed to extract text from ${sourcePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
            { cause },
          ),
      })

      const chunks: { location: string; text: string }[] = []
      for (const page of pages) {
        const pieces = chunkText(page.text)
        pieces.forEach((text, i) => chunks.push({ location: locationFor(page, i, pieces.length), text }))
      }

      const documentID = existing ? (existing.id as RagDocumentID) : RagDocumentID.ascending()

      if (chunks.length === 0) {
        db.transaction((tx) => {
          if (existing) tx.delete(RagChunkTable).where(eq(RagChunkTable.document_id, documentID)).run()
          tx
            .insert(RagDocumentTable)
            .values({
              id: documentID,
              standard,
              source_path: sourcePath,
              content_hash: hash,
              embedding_provider_id: providerID,
              embedding_model_id: modelID,
              embedding_dim: 0,
              chunk_count: 0,
            })
            .onConflictDoUpdate({
              target: RagDocumentTable.id,
              set: {
                content_hash: hash,
                embedding_provider_id: providerID,
                embedding_model_id: modelID,
                embedding_dim: 0,
                chunk_count: 0,
              },
            })
            .run()
        })
        results.push({ sourcePath, status: "indexed", chunkCount: 0 })
        continue
      }

      const { embeddings } = yield* Effect.tryPromise({
        try: () => embedMany({ model: embeddingModel as EmbeddingModelV3, values: chunks.map((c) => c.text) }),
        catch: (cause) => new Error(`Failed to embed chunks for ${sourcePath}`, { cause }),
      })

      db.transaction((tx) => {
        if (existing) tx.delete(RagChunkTable).where(eq(RagChunkTable.document_id, documentID)).run()
        tx
          .insert(RagDocumentTable)
          .values({
            id: documentID,
            standard,
            source_path: sourcePath,
            content_hash: hash,
            embedding_provider_id: providerID,
            embedding_model_id: modelID,
            embedding_dim: embeddings[0].length,
            chunk_count: chunks.length,
          })
          .onConflictDoUpdate({
            target: RagDocumentTable.id,
            set: {
              content_hash: hash,
              embedding_provider_id: providerID,
              embedding_model_id: modelID,
              embedding_dim: embeddings[0].length,
              chunk_count: chunks.length,
            },
          })
          .run()
        for (let i = 0; i < chunks.length; i++) {
          tx.insert(RagChunkTable)
            .values({
              id: RagChunkID.ascending(),
              document_id: documentID,
              chunk_index: i,
              location: chunks[i].location,
              text: chunks[i].text,
              embedding: embeddingToBuffer(embeddings[i]),
            })
            .run()
        }
      })

      results.push({ sourcePath, status: "indexed", chunkCount: chunks.length })
    }

    const currentPaths = new Set(files.map((f) => path.relative(Instance.directory, f)))
    const existingDocs = db.select().from(RagDocumentTable).where(eq(RagDocumentTable.standard, standard)).all()
    for (const doc of existingDocs) {
      if (currentPaths.has(doc.source_path)) continue
      db.delete(RagDocumentTable).where(eq(RagDocumentTable.id, doc.id)).run()
      results.push({ sourcePath: doc.source_path, status: "removed", chunkCount: 0 })
    }

    return { documents: results }
  })

  const search = Effect.fn("Rag.search")(function* (standard: Standard, query: string, topK: number) {
    const { embeddingModel } = yield* resolveModel()
    const db = projectDb()

    const rows = db
      .select({
        sourcePath: RagDocumentTable.source_path,
        location: RagChunkTable.location,
        text: RagChunkTable.text,
        embedding: RagChunkTable.embedding,
      })
      .from(RagChunkTable)
      .innerJoin(RagDocumentTable, eq(RagChunkTable.document_id, RagDocumentTable.id))
      .where(eq(RagDocumentTable.standard, standard))
      .all()

    if (rows.length === 0)
      return yield* Effect.fail(
        new NotIndexedError({
          message: `No ${standard.toUpperCase()} IG documents are indexed for this project yet. Place PDF/DOCX files under ${relativeDir(standard)}/ and call this tool with action "index" (standard: "${standard}") first.`,
        }),
      )

    const { embedding: queryVector } = yield* Effect.tryPromise({
      try: () => embed({ model: embeddingModel as EmbeddingModelV3, value: query }),
      catch: (cause) => new Error("Failed to embed search query", { cause }),
    })

    const ranked = rankBySimilarity(
      queryVector,
      rows.map((r) => ({ item: r, embedding: bufferToEmbedding(r.embedding) })),
      topK,
    )

    return ranked.map(({ item, score }): SearchHit => ({
      sourcePath: item.sourcePath,
      location: item.location,
      text: item.text,
      score,
    }))
  })

  const status = Effect.fn("Rag.status")(function* (standard: Standard) {
    const db = projectDb()
    const rows = db.select().from(RagDocumentTable).where(eq(RagDocumentTable.standard, standard)).all()
    return rows.map(
      (r): StatusEntry => ({
        sourcePath: r.source_path,
        chunkCount: r.chunk_count,
        embeddingProviderID: r.embedding_provider_id,
        embeddingModelID: r.embedding_model_id,
        timeUpdated: r.time_updated,
      }),
    )
  })

  return { index, search, status }
}
