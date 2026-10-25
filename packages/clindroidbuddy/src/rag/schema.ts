import { Schema } from "effect"
import z from "zod"

import { Identifier } from "@/id/id"
import { ZodOverride } from "@/util/effect-zod"
import { withStatics } from "@/util/schema"

/** A CDISC standard whose Implementation Guide documents can be indexed and searched. */
export const Standard = z.enum(["adam", "sdtm"])
export type Standard = z.infer<typeof Standard>

const ragDocumentIdSchema = Schema.String.annotate({ [ZodOverride]: Identifier.schema("ragdoc") }).pipe(
  Schema.brand("RagDocumentID"),
)

export type RagDocumentID = typeof ragDocumentIdSchema.Type

export const RagDocumentID = ragDocumentIdSchema.pipe(
  withStatics((schema: typeof ragDocumentIdSchema) => ({
    ascending: (id?: string) => schema.make(Identifier.ascending("ragdoc", id)),
    zod: Identifier.schema("ragdoc").pipe(z.custom<RagDocumentID>()),
  })),
)

const ragChunkIdSchema = Schema.String.annotate({ [ZodOverride]: Identifier.schema("ragchunk") }).pipe(
  Schema.brand("RagChunkID"),
)

export type RagChunkID = typeof ragChunkIdSchema.Type

export const RagChunkID = ragChunkIdSchema.pipe(
  withStatics((schema: typeof ragChunkIdSchema) => ({
    ascending: (id?: string) => schema.make(Identifier.ascending("ragchunk", id)),
    zod: Identifier.schema("ragchunk").pipe(z.custom<RagChunkID>()),
  })),
)
