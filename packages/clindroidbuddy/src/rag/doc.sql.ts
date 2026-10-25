import { sqliteTable, text, integer, blob, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"
import type { RagDocumentID, RagChunkID, Standard } from "./schema"

export const RagDocumentTable = sqliteTable(
  "standard_doc",
  {
    id: text().$type<RagDocumentID>().primaryKey(),
    standard: text().$type<Standard>().notNull(),
    source_path: text().notNull(),
    content_hash: text().notNull(),
    embedding_provider_id: text().notNull(),
    embedding_model_id: text().notNull(),
    embedding_dim: integer().notNull(),
    chunk_count: integer().notNull(),
    ...Timestamps,
  },
  (table) => [
    index("standard_doc_standard_idx").on(table.standard),
    index("standard_doc_standard_path_idx").on(table.standard, table.source_path),
  ],
)

export const RagChunkTable = sqliteTable(
  "standard_doc_chunk",
  {
    id: text().$type<RagChunkID>().primaryKey(),
    document_id: text()
      .$type<RagDocumentID>()
      .notNull()
      .references(() => RagDocumentTable.id, { onDelete: "cascade" }),
    chunk_index: integer().notNull(),
    location: text().notNull(),
    text: text().notNull(),
    embedding: blob({ mode: "buffer" }).notNull(),
    ...Timestamps,
  },
  (table) => [index("standard_doc_chunk_document_idx").on(table.document_id, table.chunk_index)],
)
