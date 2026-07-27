// Pure chunker for the chat-import path. The T10 brief (Sprint 1 / FR-10.5)
// requires imports to land in chunks of at most 50 rows with row-count
// verification between chunks. Each chunk returns to the model as its own
// log_transactions confirmation card, so the "verification" is the
// structural invariant: every input row appears in exactly one chunk, and
// the chunks cover the input in order.
//
// Keeping this in src/lib/ rather than inside the AI tool layer means
// the chat loop and the importer test fixture can both consume the same
// chunks — there's exactly one definition of "≤50 rows" in the codebase.

export const MAX_IMPORT_CHUNK_SIZE = 50

export function chunkImport<T>(rows: T[], size: number = MAX_IMPORT_CHUNK_SIZE): T[][] {
  if (size <= 0) {
    throw new Error(`chunkImport: size must be positive, got ${size}`)
  }
  if (rows.length === 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size))
  }
  return chunks
}

// Count the totals a log_transactions call would report across a sequence
// of chunked results. The model (and the chat loop) verify
// `saved + errors + possible_duplicates === sent` for each chunk; this
// helper aggregates the per-chunk numbers across the whole import.
//
// The expected use is the chat loop reading the result of one
// log_transactions call, asserting the per-chunk invariant, and only
// then firing the next chunk. This is the load-bearing "verify row
// count between chunks" line in the brief.
export interface ChunkTotals {
  saved: number
  errors: number
  possibleDuplicates: number
}

export interface ChunkResult {
  saved_count: number
  errors: unknown[]
  possible_duplicates: unknown[]
}

export function sumChunkTotals(results: ChunkResult[]): ChunkTotals {
  return results.reduce<ChunkTotals>(
    (acc, r) => ({
      saved: acc.saved + r.saved_count,
      errors: acc.errors + r.errors.length,
      possibleDuplicates:
        acc.possibleDuplicates + r.possible_duplicates.length,
    }),
    { saved: 0, errors: 0, possibleDuplicates: 0 },
  )
}
