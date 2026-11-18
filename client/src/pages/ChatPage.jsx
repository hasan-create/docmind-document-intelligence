import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { renderMarkdownSafe } from "../utils/markdown.js";

function formatStrategyLabel(strategy, chunksUsed) {
  const labels = {
    direct: "Direct Retrieval",
    neighbor_expanded: "Adaptive Neighbor Expansion",
    batch_analysis: "Full Document Batch Analysis",
  };
  const label = labels[strategy] || "Adaptive RAG";
  return chunksUsed
    ? `${label} • ${chunksUsed} chunk${chunksUsed === 1 ? "" : "s"} analyzed`
    : label;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const documentId = params.documentId || searchParams.get("document_id");
  const accessToken = localStorage.getItem("access_token");

  const [documentInfo, setDocumentInfo] = useState(
    "Ask questions about your uploaded document."
  );
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "ai",
      text: "Hi! Ask me anything about this document.",
      meta: "",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!accessToken) {
      navigate("/");
      return;
    }
    if (!documentId) {
      navigate("/dashboard");
      return;
    }
    loadDocumentInfo();
  }, [accessToken, documentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadDocumentInfo() {
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}/`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        navigate("/");
        return;
      }

      if (response.status === 404) {
        setDocumentInfo(
          "Document not found. Please return to the dashboard and upload again."
        );
        return;
      }

      if (response.ok) {
        const doc = await response.json();
        const modeText =
          doc.embedding_mode === "hybrid"
            ? "Hybrid Search"
            : doc.embedding_mode === "partial_hybrid"
              ? "Partial Hybrid + BM25"
              : "BM25 Search";
        setDocumentInfo(
          `${doc.title} (${doc.file} • ${doc.chunk_count} chunk${doc.chunk_count === 1 ? "" : "s"} • ${modeText})`
        );
      }
    } catch (err) {
      console.error("Failed to fetch document info:", err);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setChatError("");
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: "user", text: trimmed, meta: "" },
    ]);
    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch("/api/documents/chat/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          document_id: Number(documentId),
          question: trimmed,
        }),
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { error: `Unexpected server response (HTTP ${response.status}).` };
      }

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          navigate("/");
          return;
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            sender: "ai",
            text:
              data.error ||
              data.detail ||
              "Something went wrong while generating the answer.",
            meta: "",
          },
        ]);
        return;
      }

      const meta = data.strategy
        ? formatStrategyLabel(data.strategy, data.chunks_used)
        : "";

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          sender: "ai",
          text: data.answer || "No answer returned.",
          meta,
        },
      ]);
    } catch {
      setChatError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <nav className="navbar">
        <h2>DocMind AI</h2>
        <button type="button" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </button>
      </nav>

      <main className="chat-container">
        <div className="chat-header">
          <h1>Document Chat</h1>
          <p>{documentInfo}</p>
        </div>

        <div className="chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-message ${msg.sender}`}>
              {msg.sender === "ai" ? (
                <div
                  className="ai-formatted-body"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdownSafe(msg.text),
                  }}
                />
              ) : (
                msg.text
              )}
              {msg.meta && <div className="strategy-meta">{msg.meta}</div>}
            </div>
          ))}
          {loading && (
            <div className="chat-message ai">
              <div className="ai-formatted-body">
                <p>Thinking...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Ask something about your document..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
            autoComplete="off"
            required
          />
          <button type="submit" className="primary-btn" disabled={loading}>
            Ask
          </button>
        </form>

        {chatError && <p className="error-message">{chatError}</p>}
      </main>
    </>
  );
}
