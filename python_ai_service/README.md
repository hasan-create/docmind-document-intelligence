# DocMind AI — Python AI Service (No LangChain)

This standalone Python FastAPI microservice implements the **AI / RAG** pipeline so your **Node.js + MySQL** backend can handle Auth, Users, Document Metadata, and Frontend serving while Python handles:

- **PDF Extraction**: `PyMuPDF` (`fitz`) + Gemini PDF OCR fallback (`pdf_service.py`)
- **Paragraph-Aware Chunking**: `1,800` chars / `200` overlap (`chunk_service.py`)
- **Local Free Embeddings**: `SentenceTransformer("all-MiniLM-L6-v2")` (`embedding_service.py`) — **zero API cost or 429 limits**
- **Hybrid Vector Search**: **Qdrant** Cosine Similarity + **BM25** (`qdrant_service.py`)
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

## Recommended MySQL Schema (for your Node.js Backend)

```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  chunk_count INT DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

## Connecting Node.js Auth/Gateway → Python AI Service

- **On Upload (`POST /api/documents/upload/`)**:
  1. Node verifies JWT (`req.user.id`), inserts row into MySQL `documents` to get `document.id`.
  2. Node sends `multipart/form-data` (`document_id`, `file`) to `http://localhost:8001/ai/ingest` (with header `X-Internal-Secret`).
  3. Node updates `chunk_count` in MySQL and returns `{ id, title, file, chunk_count, uploaded_at }`.
- **On Chat (`POST /api/documents/chat/`)**:
  1. Node verifies JWT + ownership (`documents.user_id === req.user.id`).
  2. Node calls `POST http://localhost:8001/ai/chat` with `{ document_id, question }` and returns `{ answer, strategy, chunks_used }`.
- **On Delete (`DELETE /api/documents/:id/`)**:
  1. Node deletes row in MySQL and calls `DELETE http://localhost:8001/ai/documents/${id}`.
