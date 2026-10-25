import { describe, expect, test } from "bun:test"
import {
  chunkText,
  cosineSimilarity,
  rankBySimilarity,
  embeddingToBuffer,
  bufferToEmbedding,
  hashText,
} from "../../src/rag/chunk"

describe("chunkText", () => {
  test("returns a single chunk for short text", () => {
    const chunks = chunkText("A short paragraph.\n\nAnother short paragraph.")
    expect(chunks).toEqual(["A short paragraph.\n\nAnother short paragraph."])
  })

  test("packs multiple paragraphs up to chunkSize before splitting", () => {
    const paragraphs = Array.from({ length: 5 }, (_, i) => `Paragraph ${i} `.repeat(10))
    const text = paragraphs.join("\n\n")
    const chunks = chunkText(text, { chunkSize: 200, overlap: 0 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(200)
  })

  test("hard-splits a single paragraph longer than chunkSize", () => {
    const longParagraph = "x".repeat(500)
    const chunks = chunkText(longParagraph, { chunkSize: 200, overlap: 0 })
    expect(chunks.length).toBe(3)
    expect(chunks.join("")).toBe(longParagraph)
  })

  test("carries trailing context from the previous chunk when overlap is set", () => {
    const paragraphs = Array.from({ length: 4 }, (_, i) => `Section${i}: ${"word ".repeat(15)}`)
    const text = paragraphs.join("\n\n")
    const chunks = chunkText(text, { chunkSize: 100, overlap: 20 })
    expect(chunks.length).toBeGreaterThan(1)
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].length).toBeGreaterThan(0)
    }
  })

  test("returns an empty array for whitespace-only input", () => {
    expect(chunkText("   \n\n   ")).toEqual([])
  })
})

describe("cosineSimilarity", () => {
  test("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10)
  })

  test("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10)
  })

  test("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 10)
  })

  test("returns 0 for a zero-magnitude vector instead of NaN", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })

  test("throws on length mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow()
  })
})

describe("rankBySimilarity", () => {
  test("ranks candidates by descending similarity and respects topK", () => {
    const query = [1, 0]
    const candidates = [
      { item: "orthogonal", embedding: [0, 1] },
      { item: "identical", embedding: [1, 0] },
      { item: "opposite", embedding: [-1, 0] },
    ]
    const ranked = rankBySimilarity(query, candidates, 2)
    expect(ranked.length).toBe(2)
    expect(ranked[0].item).toBe("identical")
    expect(ranked[0].score).toBeCloseTo(1, 10)
    expect(ranked[1].item).toBe("orthogonal")
  })
})

describe("embeddingToBuffer / bufferToEmbedding", () => {
  test("round-trips a float vector through a Buffer", () => {
    const values = [0.1, -0.5, 3.25, 0, 1e-3]
    const buffer = embeddingToBuffer(values)
    const restored = bufferToEmbedding(buffer)
    expect(restored.length).toBe(values.length)
    for (let i = 0; i < values.length; i++) {
      expect(restored[i]).toBeCloseTo(values[i], 5)
    }
  })
})

describe("hashText", () => {
  test("is deterministic for the same input", () => {
    expect(hashText("hello")).toBe(hashText("hello"))
  })

  test("differs for different input", () => {
    expect(hashText("hello")).not.toBe(hashText("hello!"))
  })
})
