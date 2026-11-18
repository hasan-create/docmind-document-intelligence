import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { ChunkRecord } from "../store.js";

function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please add it in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("quota")
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes("503") || msg.includes("UNAVAILABLE");
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 800 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

export async function extractTextFromPdfWithGemini(
  buffer: Buffer
): Promise<string> {
  const ai = getAIClient();
  const base64Pdf = buffer.toString("base64");

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: base64Pdf,
            },
          },
          {
            text: "Extract and transcribe all readable text from this PDF document verbatim in reading order. Do not summarize or add commentary.",
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })
  );

  return (response.text ?? "").trim();
}

/**
 * Generates a query embedding. Returns null on Free Tier 429 quota limit
 * so Hybrid Search seamlessly continues using BM25.
 */
export async function generateQueryEmbedding(
  text: string
): Promise<number[] | null> {
  const ai = getAIClient();
  try {
    const result = await withRetry(() =>
      ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: text,
      })
    );

    const values = result.embeddings?.[0]?.values;
    return values && values.length > 0 ? values : null;
  } catch (err) {
    if (isQuotaError(err)) {
      console.warn("Query embedding hit Free Tier 429 quota; falling back to BM25.");
      return null;
    }
    throw err;
  }
}

/**
 * Generates embeddings for document chunks in batches.
 * Gracefully falls back to null for remaining chunks if Free Tier 429 quota is reached,
 * ensuring large PDFs still index cleanly with BM25 instead of failing upload.
 */
export async function generateChunkEmbeddings(
  texts: string[]
): Promise<(number[] | null)[]> {
  if (texts.length === 0) {
    return [];
  }

  const ai = getAIClient();
  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const batchSize = 25;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    try {
      const response = await withRetry(() =>
        ai.models.embedContent({
          model: "gemini-embedding-2",
          contents: batch.map((text) => ({
            role: "user",
            parts: [{ text }],
          })),
        })
      );

      const batchEmbeddings = response.embeddings ?? [];
      for (let j = 0; j < batch.length; j++) {
        const values = batchEmbeddings[j]?.values;
        if (values && values.length > 0) {
          results[i + j] = values;
        }
      }
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn(
          `Embedding batch at chunk ${i + 1} hit Free Tier 429 quota; remaining chunks will use BM25 retrieval.`
        );
        break;
      }
      throw err;
    }
  }

  return results;
}

export type EvidenceStatus = "SUFFICIENT" | "PARTIAL" | "NONE";

export interface VerificationResult {
  status: EvidenceStatus;
  answer: string;
}

/**
 * Adaptive RAG Stage 2 & 3:
 * Evaluates whether retrieved context is SUFFICIENT, PARTIAL (needs neighbor chunks),
 * or NONE (not present in these chunks / needs document-wide batch analysis).
 */
export async function verifyAndAnswerFromContext(
  question: string,
  chunks: ChunkRecord[]
): Promise<VerificationResult> {
  const ai = getAIClient();

  const contextText = chunks
    .map((c) => `[Chunk ${c.chunkOrder}]\n${c.content}`)
    .join("\n\n");

  const prompt = `
You are an Adaptive RAG verification and answering assistant.
Evaluate ONLY the provided document chunks to answer the user's question.

Rules for "status":
- "SUFFICIENT": The provided chunks contain enough information to answer the question completely and accurately. Provide the complete answer in "answer".
- "PARTIAL": The chunks mention the relevant topic/question, but the answer, explanation, or list appears cut off or incomplete and likely continues in adjacent chunks. Set "answer" to "".
- "NONE": The answer is not in these chunks, OR the question asks about the entire document (e.g., "summarize the document", "how many questions/sections are there", "list all ... across the PDF"). Set "answer" to "".

Formatting rules for "answer" (when status is "SUFFICIENT"):
- Format the response cleanly in Markdown using newline characters (\\n).
- Use headings (e.g., ### Section Name) when organizing grouped topics or rule sets.
- Use bullet points (- ) or numbered lists (1. ) for multiple rules, items, or steps.
- Use **bold** for key terms, rule names, and labels.
- Never dump everything into one long unformatted paragraph.
- Always ground your answer strictly in the provided chunks. Never invent facts.

Context:
${contextText}

Question:
${question}
`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: {
              type: Type.STRING,
              description: "One of SUFFICIENT, PARTIAL, or NONE",
            },
            answer: {
              type: Type.STRING,
              description:
                "Complete, well-formatted Markdown answer (using headings, bold labels, and bullet/numbered lists with newlines) when status is SUFFICIENT, otherwise empty string.",
            },
          },
          required: ["status", "answer"],
        },
      },
    })
  );

  try {
    const parsed = JSON.parse((response.text ?? "{}").trim()) as {
      status?: string;
      answer?: string;
    };
    const rawStatus = (parsed.status ?? "").toUpperCase();
    const status: EvidenceStatus =
      rawStatus === "SUFFICIENT" ||
      rawStatus === "PARTIAL" ||
      rawStatus === "NONE"
        ? rawStatus
        : "NONE";
    return {
      status,
      answer: (parsed.answer ?? "").trim(),
    };
  } catch {
    return { status: "NONE", answer: "" };
  }
}

/**
 * Adaptive RAG Stage 4 (Map-Reduce Batch Analysis):
 * Scans ordered batches of the full document when local chunks + neighbors aren't enough.
 */
export async function runBatchAnalysis(
  question: string,
  allChunks: ChunkRecord[]
): Promise<{ answer: string; batchesScanned: number }> {
  const ai = getAIClient();
  const maxBatchChars = 18000;
  const maxBatches = 5; // Caps Free Tier RPM usage on huge PDFs

  const batches: string[] = [];
  let current = "";

  for (const chunk of allChunks) {
    const entry = `[Chunk ${chunk.chunkOrder}]\n${chunk.content}\n\n`;
    if (current.length + entry.length > maxBatchChars && current.length > 0) {
      batches.push(current);
      current = entry;
      if (batches.length >= maxBatches) break;
    } else {
      current += entry;
    }
  }
  if (current.length > 0 && batches.length < maxBatches) {
    batches.push(current);
  }

  const extractedFindings: string[] = [];

  for (let idx = 0; idx < batches.length; idx++) {
    const batchPrompt = `
You are analyzing section ${idx + 1} of ${batches.length} of a document.
Extract ONLY facts, quotes, counts, or answers directly relevant to the user's question.
If nothing in this section is relevant, set found to false and evidence to "".

Document Section:
${batches[idx]}

Question:
${question}
`;

    const res = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: batchPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              found: { type: Type.BOOLEAN },
              evidence: { type: Type.STRING },
            },
            required: ["found", "evidence"],
          },
        },
      })
    );

    try {
      const parsed = JSON.parse((res.text ?? "{}").trim()) as {
        found?: boolean;
        evidence?: string;
      };
      if (parsed.found && parsed.evidence?.trim()) {
        extractedFindings.push(
          `Section ${idx + 1}:\n${parsed.evidence.trim()}`
        );
      }
    } catch {
      // Skip malformed batch JSON
    }
  }

  if (extractedFindings.length === 0) {
    return {
      answer: "I could not find the answer in the uploaded document.",
      batchesScanned: batches.length,
    };
  }

  // Final LLM Reduce step
  const finalPrompt = `
You are a helpful AI assistant.
Synthesize a clear, well-structured final answer to the user's question using ONLY the verified document evidence below.
Format your response cleanly in Markdown:
- Use headings (### ...) for grouped sections or categories.
- Use bullet points (- ) or numbered lists (1. ) for multiple rules, items, or steps.
- Use **bold** for key terms and labels.
- Never output everything as one dense paragraph.

If the evidence does not actually answer the question, reply exactly:
I could not find the answer in the uploaded document.

Evidence:
${extractedFindings.join("\n\n")}

Question:
${question}
`;

  const finalRes = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: finalPrompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })
  );

  return {
    answer:
      (finalRes.text ?? "").trim() ||
      "I could not find the answer in the uploaded document.",
    batchesScanned: batches.length,
  };
}
