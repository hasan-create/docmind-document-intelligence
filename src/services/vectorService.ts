import { ChunkRecord, store } from "../store.js";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "had", "has", "have", "he", "her", "his", "how", "i", "if", "in", "into",
  "is", "it", "its", "of", "on", "or", "our", "she", "that", "the", "their",
  "them", "there", "these", "they", "this", "to", "was", "we", "were", "what",
  "when", "where", "which", "who", "why", "will", "with", "you", "your",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function computeBm25Scores(
  queryTokens: string[],
  chunks: ChunkRecord[]
): Map<number, number> {
  const scores = new Map<number, number>();
  if (queryTokens.length === 0 || chunks.length === 0) {
    return scores;
  }

  const k1 = 1.5;
  const b = 0.75;

  const docTokensList = chunks.map((c) => tokenize(c.content));
  const avgDocLen =
    docTokensList.reduce((sum, tokens) => sum + tokens.length, 0) /
    chunks.length;

  const uniqueQueryTerms = Array.from(new Set(queryTokens));

  // Document frequency for each query term
  const df = new Map<string, number>();
  for (const term of uniqueQueryTerms) {
    let count = 0;
    for (const docTokens of docTokensList) {
      if (docTokens.includes(term)) {
        count++;
      }
    }
    df.set(term, count);
  }

  const N = chunks.length;

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const docTokens = docTokensList[idx];
    const docLen = docTokens.length || 1;

    const tfMap = new Map<string, number>();
    for (const t of docTokens) {
      tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
    }

    let score = 0;
    for (const term of uniqueQueryTerms) {
      const termDf = df.get(term) ?? 0;
      if (termDf === 0) continue;

      const tf = tfMap.get(term) ?? 0;
      if (tf === 0) continue;

      const idf = Math.log(1 + (N - termDf + 0.5) / (termDf + 0.5));
      const numerator = tf * (k1 + 1);
      const denominator =
        tf + k1 * (1 - b + b * (docLen / (avgDocLen || 1)));
      score += idf * (numerator / denominator);
    }

    scores.set(chunk.id, score);
  }

  return scores;
}

export interface SearchResult {
  chunk: ChunkRecord;
  score: number;
  semanticScore: number;
  bm25Score: number;
}

/**
 * Hybrid search combining dense Gemini cosine similarity + local BM25 ranking.
 * Gracefully falls back to pure BM25 if embeddings are unavailable for a chunk or query.
 */
export function hybridSearch(
  query: string,
  queryEmbedding: number[] | null,
  documentId: number,
  limit = 4
): SearchResult[] {
  const chunks = store.getChunksForDocument(documentId);
  if (chunks.length === 0) {
    return [];
  }

  const queryTokens = tokenize(query);
  const bm25Raw = computeBm25Scores(queryTokens, chunks);

  // Normalize BM25 scores to [0, 1] for fair hybrid fusion
  let maxBm25 = 0;
  for (const val of bm25Raw.values()) {
    if (val > maxBm25) maxBm25 = val;
  }

  const results: SearchResult[] = chunks.map((chunk) => {
    const bm25Norm =
      maxBm25 > 0 ? (bm25Raw.get(chunk.id) ?? 0) / maxBm25 : 0;

    const hasDense =
      Boolean(queryEmbedding) &&
      Boolean(chunk.embedding) &&
      queryEmbedding!.length === chunk.embedding!.length;

    const semanticRaw = hasDense
      ? Math.max(0, cosineSimilarity(queryEmbedding!, chunk.embedding!))
      : 0;

    const combined = hasDense
      ? 0.6 * semanticRaw + 0.4 * bm25Norm
      : bm25Norm;

    return {
      chunk,
      score: combined,
      semanticScore: semanticRaw,
      bm25Score: bm25Norm,
    };
  });

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.chunk.chunkOrder - b.chunk.chunkOrder;
  });

  return results.slice(0, limit);
}

/**
 * Adaptive RAG Step 3: Fetch surrounding chunks (chunkOrder ± radius) in document order.
 */
export function expandNeighborChunks(
  documentId: number,
  seedChunks: ChunkRecord[],
  radius = 1
): ChunkRecord[] {
  const allChunks = store.getChunksForDocument(documentId);
  const byOrder = new Map<number, ChunkRecord>();
  for (const c of allChunks) {
    byOrder.set(c.chunkOrder, c);
  }

  const selectedOrders = new Set<number>();
  for (const seed of seedChunks) {
    for (let offset = -radius; offset <= radius; offset++) {
      const order = seed.chunkOrder + offset;
      if (byOrder.has(order)) {
        selectedOrders.add(order);
      }
    }
  }

  return Array.from(selectedOrders)
    .sort((a, b) => a - b)
    .map((order) => byOrder.get(order)!)
    .filter(Boolean);
}

export function countVectors(): number {
  let count = 0;
  for (const chunk of store.chunksById.values()) {
    if (chunk.embedding) count++;
  }
  return count;
}
