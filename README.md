# 🧠 DocMind AI

### AI-Powered Document Intelligence & Retrieval System

DocMind AI is an intelligent document processing platform that allows users to upload PDF documents and interact with their content using natural language.

Instead of sending an entire document to an LLM for every question, DocMind processes documents into searchable semantic representations and retrieves the most relevant information before generating an answer.

The project is designed around a **Retrieval-Augmented Generation (RAG)** architecture with an adaptive retrieval strategy for handling both specific questions and complex document-level queries.

---

## ✨ Key Features

* 📄 **PDF Document Processing**

  * Upload and process PDF documents automatically.
  * Extract text and divide documents into meaningful chunks.

* 🔎 **Semantic Document Search**

  * Convert document chunks into vector embeddings.
  * Store and search embeddings using Qdrant.
  * Retrieve context based on semantic similarity rather than simple keyword matching.

* 🤖 **LLM-Powered Question Answering**

  * Ask natural-language questions about uploaded documents.
  * Retrieved document context is provided to the LLM for grounded responses.

* 🧠 **Adaptive RAG Architecture**

  * Starts with efficient semantic retrieval.
  * Evaluates whether the retrieved context is sufficient for the user's query.
  * Expands to neighboring chunks when information is incomplete.
  * Can escalate complex document-wide queries to deeper document analysis.

* 📚 **Context-Aware Retrieval**

  * Documents are stored as ordered chunks.
  * Neighboring chunks can be retrieved to recover information that spans multiple chunks.

* 🔐 **Authenticated API**

  * JWT-based authentication protects document and chat operations.

* 💬 **Interactive Document Chat**

  * Upload a document and directly start a conversation with it.
  * Document-specific conversations are connected using the document ID.

---

## 🏗️ System Architecture

```text
                         PDF DOCUMENT
                              │
                              ▼
                     ┌─────────────────┐
                     │  Text Extraction│
                     └────────┬────────┘
                              │
                              ▼
                         Text Chunks
                              │
                ┌─────────────┴─────────────┐
                │                           │
                ▼                           ▼
        Embedding Model              Document Analysis
                │                           │
                ▼                           ▼
             Qdrant                Structured Knowledge
                │                           │
                └─────────────┬─────────────┘
                              │
                              ▼
                         User Query
                              │
                              ▼
                       Semantic Retrieval
                              │
                              ▼
                      Retrieved Context
                              │
                              ▼
                       LLM Verification
                              │
                 ┌────────────┴────────────┐
                 │                         │
              Sufficient                Partial
                 │                         │
                 ▼                         ▼
             LLM Answer             Nearby Chunks
                                           │
                                           ▼
                                   Context Verification
                                           │
                                           ▼
                                  Batch Analysis
                                  (when required)
                                           │
                                           ▼
                                      Final LLM
                                           │
                                           ▼
                                         Answer
```

---

## 🔄 How It Works

### 1. Document Upload

The user uploads a PDF through the web interface.

```text
PDF
 ↓
Django REST API
 ↓
Document Processing
```

The document is stored and assigned a unique document ID.

---

### 2. Text Extraction & Chunking

The PDF is converted into text and divided into smaller chunks.

Each chunk maintains its position in the document using a `chunk_order`.

```text
Document
 ├── Chunk 1
 ├── Chunk 2
 ├── Chunk 3
 ├── ...
 └── Chunk N
```

Keeping the original order allows DocMind to recover surrounding context when a retrieved chunk contains only part of the required information.

---

### 3. Embedding Generation

Each chunk is converted into a numerical vector representation using:

**Sentence Transformers — `all-MiniLM-L6-v2`**

These embeddings capture semantic relationships between pieces of text.

---

### 4. Vector Storage & Retrieval

Embeddings are stored in **Qdrant**, a vector database.

When a user asks a question:

```text
User Question
      ↓
Question Embedding
      ↓
Qdrant Semantic Search
      ↓
Relevant Chunks
```

This allows DocMind to search large documents based on meaning rather than relying only on exact keyword matches.

---

## 🧠 Adaptive RAG

A major design goal of DocMind is to avoid treating every question as a simple top-k retrieval problem.

For a focused query such as:

> "Explain the GCD question."

normal RAG can efficiently retrieve the relevant section.

However, some queries require more context.

For example:

> "Give me the solution to the prime-counting question."

The first retrieved chunk might contain the question but not its solution.

Instead of immediately analyzing the entire document, DocMind can progressively expand the context:

```text
Initial Retrieval
      ↓
Chunk 7
      ↓
LLM checks context
      ↓
Information is partial
      ↓
Retrieve neighboring chunks
      ↓
Chunks 6 + 7 + 8
      ↓
LLM checks again
      ↓
Enough context?
      │
   ┌──┴──┐
  YES    NO
   │      │
   ▼      ▼
 Answer  Deeper
         Document
         Analysis
```

This approach combines the efficiency of RAG with the reasoning capabilities of an LLM.

---

## 🎯 Handling Different Query Types

DocMind is designed to handle different levels of document interaction.

### Specific Questions

Example:

> "Explain the GCD question."

Uses targeted semantic retrieval to locate the relevant content.

### Context-Dependent Questions

Example:

> "Give me the solution to this question."

If the initial chunk contains only the question, surrounding chunks can be retrieved to recover the missing solution.

### Document-Level Questions

Examples:

> "How many questions are in this PDF?"

> "Classify all questions according to topic."

> "Find all array questions."

These require broader document understanding rather than relying on only a few semantically similar chunks.

---

## 🛠️ Technology Stack

### Backend

* **Python**
* **Django**
* **Django REST Framework**
* **JWT Authentication**

### AI / NLP

* **Sentence Transformers**
* **all-MiniLM-L6-v2**
* **LLM-based document reasoning**

### Vector Database

* **Qdrant**

### Database

* **SQLite** for development

### Frontend

* **HTML**
* **CSS**
* **JavaScript**

### Development

* **VS Code**
* **Git & GitHub**

---

## 📁 Project Structure

```text
DOCMINDAI/
│
├── backend/
│   ├── manage.py
│   ├── requirements.txt
│   ├── core/
│   └── ...
│
├── frontend/
│   ├── index.html
│   ├── dashboard.html
│   ├── chat.html
│   ├── css/
│   └── js/
│
├── .gitignore
└── README.md
```

---

## 🔑 Core Engineering Concepts

DocMind AI demonstrates practical implementation of:

* Retrieval-Augmented Generation (RAG)
* Semantic search
* Vector embeddings
* Vector databases
* Context retrieval
* Document chunking
* LLM reasoning
* Adaptive retrieval
* Context expansion
* Document-level analysis
* REST API development
* JWT authentication
* Full-stack application architecture

---

## 🚀 Future Improvements

The architecture is designed to support further improvements such as:

* Advanced document structure detection
* Better question/answer extraction
* Document summarization
* Multi-document search
* Source citations
* Highlighting supporting document sections
* Conversation memory
* Improved document-level reasoning
* Background processing for large documents
* Production vector database deployment

---

## 🎯 Project Goal

The goal of DocMind AI is to move beyond simple **"chat with PDF"** functionality toward a system that can understand how information is organized inside documents and choose an appropriate retrieval strategy based on the user's request.

Rather than treating every query the same way, DocMind is designed to progressively move from:

**semantic retrieval → contextual expansion → deeper document analysis**

when additional understanding is required.

---

## 👨‍💻 Author

Built as a full-stack AI engineering project exploring practical applications of:

**RAG + Vector Search + LLM Reasoning + Document Intelligence**

---

## ⭐ If you find this project interesting

Feel free to explore the repository, review the architecture, and experiment with the document intelligence pipeline.
