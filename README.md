# 🧠 DocMind AI

### AI-Powered Document Intelligence & Adaptive Hybrid RAG System

DocMind AI is an intelligent document processing platform that lets users upload PDF documents, manage their document library, and ask natural-language questions grounded strictly in their uploaded files.

Instead of sending an entire document to an LLM for every question or relying on naive single-pass top-k retrieval, DocMind AI combines **Hybrid Search (Dense Embeddings + BM25)** with a **4-Stage Adaptive RAG** pipeline that verifies evidence sufficiency, expands neighboring chunks when context is partial, and escalates document-wide queries to Map-Reduce Batch Analysis.

---

## ✨ Key Features

* 📄 **Smart PDF Ingestion & OCR Fallback**
  * Fast text extraction (`pdfjs-dist` in Node.js / `PyMuPDF` in the Python AI service).
  * Automatic Gemini multimodal OCR fallback for scanned or image-only PDFs.
  * Paragraph- and sentence-aware recursive chunking (`1,800` chars, `200` overlap) preserving `chunk_order`.

* 🔎 **Hybrid Search (Semantic Vectors + BM25)**
  * Combines dense vector cosine similarity (`gemini-embedding-2` or local `all-MiniLM-L6-v2`) with local **BM25** lexical ranking (`0.6 * semantic + 0.4 * bm25`).
  * Captures both semantic meaning/synonyms and exact identifiers, formulas, and codes.
  * Gracefully falls back to BM25 if Free Tier embedding quotas are reached.

* 🧠 **4-Stage Adaptive RAG Architecture**
  * **Stage 1 — Initial Retrieval**: Fetches top candidate chunks via Hybrid Search.
  * **Stage 2 — LLM Evidence Verification (`SUFFICIENT` / `PARTIAL` / `NONE`)**: Uses structured JSON output to evaluate whether the retrieved context completely answers the question.
  * **Stage 3 — Nearby Chunks Expansion**: When evidence is `PARTIAL`, expands surrounding chunks (`chunk_order ± 1`) and re-verifies context.
  * **Stage 4 — Batch Analysis → Final LLM**: When evidence is `NONE` or the query is document-wide (*summarize, count, list all*), scans ordered batches and synthesizes a final grounded answer.

* 📚 **Document Library & Formatted Chat UI**
  * Upload, list, re-open, and delete documents from the Dashboard.
  * Displays document metadata, chunk count, search mode, and the Adaptive RAG strategy used per answer.
  * Renders structured Markdown answers (headings, bold labels, bullet/numbered lists, code blocks).

* 🔐 **JWT Authentication**
  * Register, login, and protected document/chat endpoints via Bearer JWT tokens.

---

## 🏗️ System Architecture

```text
                         PDF DOCUMENT
                              │
                              ▼
                ┌───────────────────────────┐
                │ Text Extraction + OCR     │
                └─────────────┬─────────────┘
                              │
                              ▼
              Paragraph-Aware Chunks (1..N)
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
       Dense Embeddings               BM25 Term Index
     (Vector Store / Qdrant)            (Lexical)
                │                           │
                └─────────────┬─────────────┘
                              ▼
                          User Query
                              │
                              ▼
                    Hybrid Retrieval (Top-K)
                              │
                              ▼
                LLM Evidence Verification (JSON)
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
       SUFFICIENT          PARTIAL             NONE /
           │                  │             Document-Wide
           │                  ▼                  │
           │         Nearby Chunks               ▼
           │        (chunk_order ± 1)      Batch Analysis
           │                  │             (Map-Reduce)
           │                  ▼                  │
           │         Context Verification        │
           │                  │                  │
           │         ┌────────┴────────┐         │
           │      SUFFICIENT       STILL PARTIAL │
           │         │                 └────┬────┘
           ▼         ▼                      ▼
        Formatted Answer               Final LLM
                                            │
                                            ▼
                                    Formatted Answer
```

---

## 🛠️ Technology Stack

### **Web App & API Gateway (Plain JavaScript — Node.js + React)**
- **Frontend**: React 19 (`.jsx`), React Router, HTML5, CSS3 (`client/` built with Vite) with XSS-safe Markdown rendering
- **Backend**: Node.js, plain JavaScript ESM (`.js`), Express 5 (`server.js` + `src/*.js`)
- **Auth & Uploads**: `jsonwebtoken`, `bcryptjs`, `multer`
- **PDF & AI**: `pdfjs-dist`, `@google/genai` (`gemini-4-hydrogen`, `gemini-embedding-2`), custom BM25 + Cosine Hybrid Search (or optional proxy to `python_ai_service` via `AI_SERVICE_URL`)

### **Standalone Python AI Microservice (`python_ai_service/`, No LangChain)**
- **Framework**: FastAPI + Uvicorn
- **PDF Extraction**: `PyMuPDF` (`fitz`) + Gemini PDF OCR fallback
- **Local Embeddings**: `sentence-transformers` (`all-MiniLM-L6-v2`, 384-dim, zero API cost)
- **Vector + Hybrid Search**: `qdrant-client` (Qdrant cosine search) + BM25
- **Adaptive RAG LLM**: `google-genai` (`gemini-4-hydrogen` with Pydantic structured schemas)

### **Recommended Production Database Pairing**
- **MySQL**: Users, documents, and relational metadata (`ON DELETE CASCADE`)
- **Qdrant**: Dense embeddings + `document_id` / `chunk_order` payloads

---

## 📁 Project Structure

```text
.
├── server.js                        # Express server (serves /api/* + built React SPA on port 3000)
├── vite.config.js                   # Vite configuration for React (.jsx) frontend
├── src/
│   ├── store.js                     # In-memory store (Users, Documents, Ordered Chunks)
│   ├── middleware/auth.js           # JWT Bearer authentication
│   ├── routes/
│   │   ├── auth.js                  # /api/auth/register/, login/, profile/
│   │   └── documents.js             # /api/documents/ (CRUD, upload, Adaptive RAG chat / AI proxy)
│   └── services/
│       ├── pdfService.js            # pdfjs-dist + Gemini OCR fallback
│       ├── chunkService.js          # Paragraph/sentence-aware chunking
│       ├── vectorService.js         # Hybrid search (Embeddings + BM25) & neighbor expansion
│       └── geminiService.js         # @google/genai embeddings, verification, batch analysis
├── client/
│   ├── index.html                   # SPA HTML entry point
│   └── src/
│       ├── main.jsx                 # React root mount
│       ├── App.jsx                  # React Router routes & auth guards
│       ├── styles/style.css         # Application & Markdown formatting styles
│       ├── utils/markdown.js        # XSS-safe Markdown-to-HTML renderer
│       └── pages/
│           ├── LoginPage.jsx        # Login page
│           ├── RegisterPage.jsx     # Registration page
│           ├── DashboardPage.jsx    # PDF upload & document library
│           └── ChatPage.jsx         # Formatted Markdown document chat
├── python_ai_service/               # Standalone Python FastAPI AI service (for external import)
│   ├── main.py                      # /ai/ingest, /ai/chat, /ai/documents/{id}
│   ├── config.py
│   ├── requirements.txt
│   ├── README.md                    # MySQL schema + Node-to-Python integration guide
│   └── services/
│       ├── pdf_service.py
│       ├── chunk_service.py
│       ├── embedding_service.py
│       ├── qdrant_service.py
│       └── adaptive_rag_service.py
├── .env.example
└── package.json
```

---

## 🔌 API Endpoints

### **Auth**
- `POST /api/auth/register/` — Register user (`email`, `password`, `password2`)
- `POST /api/auth/login/` — Obtain JWT `access` and `refresh` tokens
- `GET /api/auth/profile/` — Get authenticated user profile

### **Documents & Adaptive RAG Chat**
- `GET /api/documents/` — List authenticated user's uploaded documents
- `GET /api/documents/:id/` — Get document metadata & chunk count
- `POST /api/documents/upload/` — Upload & index a PDF (`multipart/form-data`: `title`, `file`)
- `POST /api/documents/chat/` — Ask a question (`{ document_id, question }`) → `{ answer, strategy, chunks_used }`
- `DELETE /api/documents/:id/` — Delete a document and its chunks

---

## 🚀 Running Locally

### **1. Node.js Full-Stack App**
```bash
npm install
cp .env.example .env
# Add GEMINI_API_KEY and JWT_SECRET to .env
npm run dev
```
Open `http://localhost:3000`.

### **2. Optional Python FastAPI AI Service (External Deployment)**
See [`python_ai_service/README.md`](python_ai_service/README.md) for running the Python AI service on port `8001` with `PyMuPDF`, `all-MiniLM-L6-v2`, and **Qdrant**, and connecting it to a Node.js + MySQL backend.
