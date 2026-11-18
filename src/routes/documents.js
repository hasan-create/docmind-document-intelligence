import { Router } from "express";
import multer from "multer";
import { store } from "../store.js";
import { authenticateToken } from "../middleware/auth.js";
import { extractTextFromPdf } from "../services/pdfService.js";
import { splitText } from "../services/chunkService.js";
import {
  formatGeminiError,
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
    fileSize: 50 * 1024 * 1024,
  },
});

const AI_SERVICE_URL = (process.env.AI_SERVICE_URL || "").replace(/\/$/, "");
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "";

function isDocumentWideQuery(question) {
  const q = question.toLowerCase();
  return /\b(summar(y|ize|ise)|overview|how many|count|list all|find all|classify|all topics|all questions|entire document|whole document)\b/.test(
    q
  );
}

router.get("/", authenticateToken, async (req, res) => {
  try {
    const userDocs = await store.listDocumentsByUser(req.user.id);
    const docs = await Promise.all(
      userDocs.map(async (doc) => ({
        id: doc.id,
        title: doc.title,
        file: doc.filename,
        uploaded_at: doc.uploadedAt,
        chunk_count:
          doc.chunkCount || (await store.getChunksForDocument(doc.id)).length,
        embedding_mode: doc.embeddingMode,
      }))
    );

    res.status(200).json({ documents: docs });
  } catch (err) {
    console.error("List documents error:", err);
    res.status(500).json({ error: "Failed to load documents." });
  }
});

router.get("/:id/", authenticateToken, async (req, res) => {
  try {
    const documentId = String(req.params.id || "").trim();
    if (!documentId) {
      res.status(400).json({ error: "Invalid document ID." });
      return;
    }

    const doc = await store.findDocumentById(documentId);
    if (!doc || doc.userId !== req.user.id) {
      res.status(404).json({ error: "Document not found." });
      return;
    }

    const chunkCount =
      doc.chunkCount || (await store.getChunksForDocument(doc.id)).length;

    res.status(200).json({
      id: doc.id,
      title: doc.title,
      file: doc.filename,
      uploaded_at: doc.uploadedAt,
      chunk_count: chunkCount,
      embedding_mode: doc.embeddingMode,
    });
  } catch (err) {
    console.error("Get document error:", err);
    res.status(500).json({ error: "Failed to load document." });
  }
});

router.delete("/:id/", authenticateToken, async (req, res) => {
  try {
    const documentId = String(req.params.id || "").trim();
    if (!documentId) {
      res.status(400).json({ error: "Invalid document ID." });
      return;
    }

    const doc = await store.findDocumentById(documentId);
    if (!doc || doc.userId !== req.user.id) {
      res.status(404).json({ error: "Document not found." });
      return;
    }

    if (AI_SERVICE_URL) {
      try {
        await fetch(
          `${AI_SERVICE_URL}/ai/documents/${encodeURIComponent(documentId)}`,
          {
            method: "DELETE",
            headers: INTERNAL_API_SECRET
              ? { "X-Internal-Secret": INTERNAL_API_SECRET }
              : {},
          }
        );
      } catch (err) {
        console.warn("Python AI delete error:", err);
      }
    }

    await store.deleteDocument(documentId);
    res.status(200).json({ message: "Document deleted." });
  } catch (err) {
    console.error("Delete document error:", err);
    res.status(500).json({ error: "Failed to delete document." });
  }
});

router.post(
  "/upload/",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
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

      // If Python FastAPI AI service is configured externally, proxy ingestion to Python
      if (AI_SERVICE_URL) {
        const doc = await store.createDocument(
          req.user.id,
          title,
          file.originalname,
          "hybrid",
          0
        );
        try {
          const formData = new FormData();
          formData.append("document_id", String(doc.id));
          formData.append(
            "file",
            new Blob([file.buffer], { type: file.mimetype || "application/pdf" }),
            file.originalname
          );

          const pyRes = await fetch(`${AI_SERVICE_URL}/ai/ingest`, {
            method: "POST",
            headers: INTERNAL_API_SECRET
              ? { "X-Internal-Secret": INTERNAL_API_SECRET }
              : {},
            body: formData,
          });

          const pyData = await pyRes.json();
          if (!pyRes.ok) {
            await store.deleteDocument(doc.id);
            res.status(pyRes.status).json({ error: pyData.detail || "Python AI ingest failed." });
            return;
          }

          await store.updateDocumentMeta(doc.id, {
            chunkCount: pyData.chunk_count ?? 0,
            embeddingMode: pyData.embedding_mode || "hybrid",
          });

          res.status(201).json({
            id: doc.id,
            title: doc.title,
            file: doc.filename,
            uploaded_at: doc.uploadedAt,
            chunk_count: pyData.chunk_count ?? 0,
            embedding_mode: pyData.embedding_mode || "hybrid",
          });
          return;
        } catch (err) {
          await store.deleteDocument(doc.id);
          throw err;
        }
      }

      // Built-in Node.js Hybrid + Adaptive RAG pipeline
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

      let embeddingMode = "bm25";
      if (embeddedCount === chunks.length) {
        embeddingMode = "hybrid";
      } else if (embeddedCount > 0) {
        embeddingMode = "partial_hybrid";
      }

      const doc = await store.createDocument(
        req.user.id,
        title,
        file.originalname,
        embeddingMode,
        chunks.length
      );

      await store.createChunks(doc.id, chunks, embeddings);

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
      const totalVectors = await countVectors();
      console.log(
        `UPLOAD COMPLETE — doc=${doc.id}, chunks=${chunks.length}, embedded=${embeddedCount}, mode=${embeddingMode}, total_vectors=${totalVectors}, took=${elapsedSec}s`
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
      const message = formatGeminiError(err);
      const status = message.includes("quota") ? 429 : 500;
      res.status(status).json({ error: message });
    }
  }
);

router.post("/chat/", authenticateToken, async (req, res) => {
  try {
    const rawDocId = req.body?.document_id;
    const question =
      typeof req.body?.question === "string"
        ? req.body.question.trim()
        : "";

    const documentId =
      rawDocId !== undefined && rawDocId !== null
        ? String(rawDocId).trim()
        : "";
    if (!documentId) {
      res.status(400).json({ document_id: ["A valid document ID is required."] });
      return;
    }

    if (!question) {
      res.status(400).json({ question: ["This field may not be blank."] });
      return;
    }

    const doc = await store.findDocumentById(documentId);
    if (!doc || doc.userId !== req.user.id) {
      res.status(404).json({ error: "Document not found." });
      return;
    }

    // Proxy chat to Python FastAPI AI service when configured locally
    if (AI_SERVICE_URL) {
      const pyRes = await fetch(`${AI_SERVICE_URL}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(INTERNAL_API_SECRET
            ? { "X-Internal-Secret": INTERNAL_API_SECRET }
            : {}),
        },
        body: JSON.stringify({ document_id: documentId, question }),
      });

      const pyData = await pyRes.json();
      if (!pyRes.ok) {
        res.status(pyRes.status).json({ error: pyData.detail || "Python AI chat failed." });
        return;
      }

      res.status(200).json(pyData);
      return;
    }

    const allChunks = await store.getChunksForDocument(documentId);

    if (isDocumentWideQuery(question) && allChunks.length > 4) {
      const batchResult = await runBatchAnalysis(question, allChunks);
      res.status(200).json({
        answer: batchResult.answer,
        strategy: "batch_analysis",
        chunks_used: allChunks.length,
      });
      return;
    }

    const hasAnyEmbeddings = doc.embeddingMode !== "bm25";
    const queryEmbedding = hasAnyEmbeddings
      ? await generateQueryEmbedding(question)
      : null;

    const initialHits = await hybridSearch(
      question,
      queryEmbedding,
      documentId,
      4
    );
    const initialChunks = initialHits
      .map((h) => h.chunk)
      .sort((a, b) => a.chunkOrder - b.chunkOrder);

    const stage2 = await verifyAndAnswerFromContext(question, initialChunks);
    if (stage2.status === "SUFFICIENT" && stage2.answer) {
      res.status(200).json({
        answer: stage2.answer,
        strategy: "direct",
        chunks_used: initialChunks.length,
      });
      return;
    }

    if (stage2.status === "PARTIAL") {
      const expandedChunks = await expandNeighborChunks(
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

    if (initialChunks.length >= allChunks.length) {
      res.status(200).json({
        answer: "I could not find the answer in the uploaded document.",
        strategy: "direct",
        chunks_used: allChunks.length,
      });
      return;
    }

    const batchResult = await runBatchAnalysis(question, allChunks);
    res.status(200).json({
      answer: batchResult.answer,
      strategy: "batch_analysis",
      chunks_used: allChunks.length,
    });
  } catch (err) {
    console.error("Document chat error:", err);
    const message = formatGeminiError(err);
    const status = message.includes("quota") ? 429 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
