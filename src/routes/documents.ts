import { Router, Response } from "express";
import multer from "multer";
import { EmbeddingMode, store } from "../store.js";
import { AuthenticatedRequest, authenticateToken } from "../middleware/auth.js";
import { extractTextFromPdf } from "../services/pdfService.js";
import { splitText } from "../services/chunkService.js";
import {
  generateChunkEmbeddings,
  generateQueryEmbedding,
  runBatchAnalysis,
  verifyAndAnswerFromContext,
} from "../services/geminiService.js";
import {
  countVectors,
  expandNeighborChunks,
  hybridSearch,
} from "../services/vectorService.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

function isDocumentWideQuery(question: string): boolean {
  const q = question.toLowerCase();
  return /\b(summar(y|ize|ise)|overview|how many|count|list all|find all|classify|all topics|all questions|entire document|whole document)\b/.test(
    q
  );
}

router.get("/", authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const docs = store.listDocumentsByUser(req.user!.id).map((doc) => ({
    id: doc.id,
    title: doc.title,
    file: doc.filename,
    uploaded_at: doc.uploadedAt,
    chunk_count: store.getChunksForDocument(doc.id).length,
    embedding_mode: doc.embeddingMode,
  }));

  res.status(200).json({ documents: docs });
});

router.get(
  "/:id/",
  authenticateToken,
  (req: AuthenticatedRequest, res: Response) => {
    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ error: "Invalid document ID." });
      return;
    }

    const doc = store.findDocumentById(documentId);
    if (!doc || doc.userId !== req.user!.id) {
      res.status(404).json({ error: "Document not found." });
      return;
    }

    res.status(200).json({
      id: doc.id,
      title: doc.title,
      file: doc.filename,
      uploaded_at: doc.uploadedAt,
      chunk_count: store.getChunksForDocument(doc.id).length,
      embedding_mode: doc.embeddingMode,
    });
  }
);

router.delete(
  "/:id/",
  authenticateToken,
  (req: AuthenticatedRequest, res: Response) => {
    const documentId = Number(req.params.id);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      res.status(400).json({ error: "Invalid document ID." });
      return;
    }

    const doc = store.findDocumentById(documentId);
    if (!doc || doc.userId !== req.user!.id) {
      res.status(404).json({ error: "Document not found." });
      return;
    }

    store.deleteDocument(documentId);
    res.status(200).json({ message: "Document deleted." });
  }
);

router.post(
  "/upload/",
  authenticateToken,
  upload.single("file"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const title =
        typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const file = req.file;

      if (!title) {
        res.status(400).json({ title: ["This field is required."] });
        return;
      }

      if (!file) {
        res.status(400).json({ file: ["No file was submitted."] });
        return;
      }

      if (!file.buffer || file.buffer.length === 0) {
        res.status(400).json({ error: "Uploaded PDF file is empty." });
        return;
      }

      const startTime = Date.now();
      const text = await extractTextFromPdf(file.buffer);
      const chunks = splitText(text);

      if (chunks.length === 0) {
        res.status(400).json({
          error: "Could not extract any readable text from this PDF.",
        });
        return;
      }

      const embeddings = await generateChunkEmbeddings(chunks);
      const embeddedCount = embeddings.filter((e) => e !== null).length;

      let embeddingMode: EmbeddingMode = "bm25";
      if (embeddedCount === chunks.length) {
        embeddingMode = "hybrid";
      } else if (embeddedCount > 0) {
        embeddingMode = "partial_hybrid";
      }

      const doc = store.createDocument(
        req.user!.id,
        title,
        file.originalname,
        embeddingMode
      );

      for (let i = 0; i < chunks.length; i++) {
        store.createChunk(doc.id, chunks[i], i + 1, embeddings[i]);
      }

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `UPLOAD COMPLETE — doc=${doc.id}, chunks=${chunks.length}, embedded=${embeddedCount}, mode=${embeddingMode}, total_vectors=${countVectors()}, took=${elapsedSec}s`
      );

      res.status(201).json({
        id: doc.id,
        title: doc.title,
        file: doc.filename,
        uploaded_at: doc.uploadedAt,
        chunk_count: chunks.length,
        embedding_mode: embeddingMode,
      });
    } catch (err) {
      console.error("Document upload error:", err);
      const message =
        err instanceof Error ? err.message : "Document upload failed.";
      res.status(500).json({ error: message });
    }
  }
);

router.post(
  "/chat/",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rawDocId = req.body?.document_id;
      const question =
        typeof req.body?.question === "string"
          ? req.body.question.trim()
          : "";

      const documentId = Number(rawDocId);
      if (!Number.isInteger(documentId) || documentId <= 0) {
        res.status(400).json({ document_id: ["A valid integer is required."] });
        return;
      }

      if (!question) {
        res.status(400).json({ question: ["This field may not be blank."] });
        return;
      }

      const doc = store.findDocumentById(documentId);
      if (!doc || doc.userId !== req.user!.id) {
        res.status(404).json({ error: "Document not found." });
        return;
      }

      const allChunks = store.getChunksForDocument(documentId);

      // Escalate directly to Batch Analysis for broad document-wide queries if doc > 4 chunks
      if (isDocumentWideQuery(question) && allChunks.length > 4) {
        const batchResult = await runBatchAnalysis(question, allChunks);
        res.status(200).json({
          answer: batchResult.answer,
          strategy: "batch_analysis",
          chunks_used: allChunks.length,
        });
        return;
      }

      // Stage 1: Initial Hybrid Retrieval (Embeddings + BM25)
      const hasAnyEmbeddings = doc.embeddingMode !== "bm25";
      const queryEmbedding = hasAnyEmbeddings
        ? await generateQueryEmbedding(question)
        : null;

      const initialHits = hybridSearch(question, queryEmbedding, documentId, 4);
      const initialChunks = initialHits
        .map((h) => h.chunk)
        .sort((a, b) => a.chunkOrder - b.chunkOrder);

      // Stage 2: LLM Evidence Verification (SUFFICIENT / PARTIAL / NONE)
      const stage2 = await verifyAndAnswerFromContext(question, initialChunks);
      if (stage2.status === "SUFFICIENT" && stage2.answer) {
        res.status(200).json({
          answer: stage2.answer,
          strategy: "direct",
          chunks_used: initialChunks.length,
        });
        return;
      }

      // Stage 3: Nearby Chunks Expansion when PARTIAL (or small doc)
      if (stage2.status === "PARTIAL") {
        const expandedChunks = expandNeighborChunks(
          documentId,
          initialChunks,
          1
        );

        if (expandedChunks.length > initialChunks.length) {
          const stage3 = await verifyAndAnswerFromContext(
            question,
            expandedChunks
          );
          if (stage3.status === "SUFFICIENT" && stage3.answer) {
            res.status(200).json({
              answer: stage3.answer,
              strategy: "neighbor_expanded",
              chunks_used: expandedChunks.length,
            });
            return;
          }
        }
      }

      // If all chunks were already covered in Stage 2/3, no need for batch analysis
      if (initialChunks.length >= allChunks.length) {
        res.status(200).json({
          answer: "I could not find the answer in the uploaded document.",
          strategy: "direct",
          chunks_used: allChunks.length,
        });
        return;
      }

      // Stage 4: Batch Analysis -> Final LLM Synthesis
      const batchResult = await runBatchAnalysis(question, allChunks);
      res.status(200).json({
        answer: batchResult.answer,
        strategy: "batch_analysis",
        chunks_used: allChunks.length,
      });
    } catch (err) {
      console.error("Document chat error:", err);
      const message =
        err instanceof Error ? err.message : "Failed to generate answer.";
      res.status(500).json({ error: message });
    }
  }
);

export default router;
