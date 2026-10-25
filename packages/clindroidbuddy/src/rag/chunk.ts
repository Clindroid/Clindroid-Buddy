import { createHash } from "crypto"

export interface ChunkOptions {
  /** Target maximum size of a chunk, in characters. */
  chunkSize?: number
  /** Number of trailing characters from the previous chunk carried into the next, for context continuity. */
  overlap?: number
}

const DEFAULT_CHUNK_SIZE = 800
const DEFAULT_OVERLAP = 150

/**
 * Splits text into overlapping chunks along paragraph boundaries. A paragraph
 * longer than `chunkSize` on its own is hard-split, since it cannot be packed
 * with anything else without exceeding the target size.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const overlap = Math.min(options.overlap ?? DEFAULT_OVERLAP, chunkSize - 1)

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (paragraphs.length === 0) return []

  const base: string[] = []
  let current = ""
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length <= chunkSize) {
      current = candidate
      continue
    }

    if (current) base.push(current)

    if (paragraph.length <= chunkSize) {
      current = paragraph
      continue
    }

    // A single paragraph exceeds chunkSize on its own — hard-split it.
    for (let i = 0; i < paragraph.length; i += chunkSize) {
      base.push(paragraph.slice(i, i + chunkSize))
    }
    current = ""
  }
  if (current) base.push(current)

  if (overlap <= 0 || base.length <= 1) return base

  return base.map((chunk, i) => {
    if (i === 0) return chunk
    const tail = base[i - 1].slice(-overlap)
    return `${tail}\n\n${chunk}`
  })
}

/** Cosine similarity between two equal-length vectors. Returns 0 for zero-magnitude vectors. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`cosineSimilarity: length mismatch (${a.length} vs ${b.length})`)

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Ranks candidates by cosine similarity to `query`, descending, keeping the top `topK`. */
export function rankBySimilarity<T>(
  query: ArrayLike<number>,
  candidates: readonly { item: T; embedding: ArrayLike<number> }[],
  topK: number,
): { item: T; score: number }[] {
  return candidates
    .map((c) => ({ item: c.item, score: cosineSimilarity(query, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK))
}

/** Serializes a float vector to a Buffer (Float32, little-endian) for blob storage. */
export function embeddingToBuffer(values: readonly number[]): Buffer {
  const floats = Float32Array.from(values)
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength)
}

/** Deserializes a Buffer produced by `embeddingToBuffer` back into a Float32Array. */
export function bufferToEmbedding(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT)
}

/** Stable content hash used to detect whether a source document changed since it was last indexed. */
export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}
