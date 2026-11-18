# DocMind AI — Python AI Service (No LangChain)

This standalone Python FastAPI microservice implements the **AI / RAG** pipeline so your **Node.js + MongoDB (Mongoose)** backend can handle Auth, Users, Document Metadata, and Frontend serving while Python handles:

- **PDF Extraction**: `PyMuPDF` (`fitz`) + Gemini PDF OCR fallback (`pdf_service.py`)
- **Paragraph-Aware Chunking**: `1,800` chars / `200` overlap (`chunk_service.py`)
- **Local Free Embeddings**: `SentenceTransformer("all-MiniLM-L6-v2")` (`embedding_service.py`) — **zero API cost or 429 limits**
- **Hybrid Vector Search**: **Qdrant** Cosine Similarity + **BM25** (`qdrant_service.py`) using MongoDB `ObjectId` strings (`document_id`) as Qdrant keyword payloads
- **4-Stage Adaptive RAG**: `SUFFICIENT` → Direct Answer, `PARTIAL` → Nearby Chunks (`chunk_order ± 1`), `NONE` / Whole-Doc → Map-Reduce Batch Analysis → Final LLM using `google-genai` (`adaptive_rag_service.py`)

## Run Locally

```bash
cd python_ai_service
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
export GEMINI_API_KEY="your-key"
uvicorn main:app --host 0.0.0.0 --port 8001
```

## MongoDB Collections (Built-in Mongoose Models in `src/models/`)

The Node.js backend includes ready-to-use Mongoose schemas (`User`, `Document`, `Chunk`) that activate automatically when `MONGODB_URI` is set in `.env`:

- `users`: `{ _id, email (unique), passwordHash, createdAt }`
- `documents`: `{ _id, userId (ObjectId ref User), title, filename, embeddingMode, chunkCount, uploadedAt }`
- `chunks`: `{ _id, documentId (ObjectId ref Document), content, chunkOrder, embedding }` *(used when running Node.js built-in Hybrid Search; when `AI_SERVICE_URL` is set, Qdrant stores vectors instead)*

## Connecting Node.js + MongoDB → Python AI Service

1. Set `MONGODB_URI` and `AI_SERVICE_URL=http://localhost:8001` in `.env`.
2. **On Upload (`POST /api/documents/upload/`)**:
   - Node verifies JWT (`req.user.id`), creates a MongoDB `Document` to obtain its string `_id` (`doc.id`).
   - Node sends `multipart/form-data` (`document_id`, `file`) to `http://localhost:8001/ai/ingest` (with header `X-Internal-Secret`).
   - Node updates `chunkCount` in MongoDB and returns `{ id, title, file, chunk_count, uploaded_at }`.
3. **On Chat (`POST /api/documents/chat/`)**:
   - Node verifies JWT + ownership (`doc.userId === req.user.id`).
   - Node calls `POST http://localhost:8001/ai/chat` with `{ document_id, question }` and returns `{ answer, strategy, chunks_used }`.
4. **On Delete (`DELETE /api/documents/:id/`)**:
   - Node deletes the document in MongoDB and calls `DELETE http://localhost:8001/ai/documents/${id}` to purge vectors from Qdrant.
