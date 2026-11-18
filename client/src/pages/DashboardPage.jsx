import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function formatModeLabel(mode) {
  if (mode === "hybrid") return "Hybrid (Vectors + BM25)";
  if (mode === "partial_hybrid") return "Partial Hybrid + BM25";
  return "BM25 Search";
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const accessToken = localStorage.getItem("access_token");

  const [title, setTitle] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    if (!accessToken) {
      navigate("/");
      return;
    }
    loadDocuments();
  }, [accessToken]);

  async function loadDocuments() {
    try {
      const response = await fetch("/api/documents/", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  }

  function handleLogout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    navigate("/");
  }

  async function handleDelete(docId) {
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(docId)}/`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (response.status === 401) {
        handleLogout();
        return;
      }

      if (response.ok) {
        await loadDocuments();
      }
    } catch (err) {
      console.error("Delete document failed:", err);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!title.trim()) {
      setUploadMessage("Please enter a document title.");
      return;
    }

    if (!pdfFile) {
      setUploadMessage("Please select a PDF.");
      return;
    }

    if (
      pdfFile.type !== "application/pdf" &&
      !pdfFile.name.toLowerCase().endsWith(".pdf")
    ) {
      setUploadMessage("Please select a valid PDF file.");
      return;
    }

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("file", pdfFile);

    setUploading(true);
    setUploadMessage("Uploading and indexing PDF...");

    try {
      const response = await fetch("/api/documents/upload/", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });

      const rawText = await response.text();
      const contentType = response.headers.get("content-type") || "";

      let data = {};
      let isJson = false;
      try {
        data = rawText ? JSON.parse(rawText) : {};
        isJson = true;
      } catch {
        isJson = false;
        data = {
          error:
            contentType.includes("text/html") ||
            rawText.trim().startsWith("<")
              ? "Session or server preview refreshed. Please reload the page and try again."
              : `Unexpected server response (HTTP ${response.status}).`,
        };
      }

      if (!response.ok || !isJson || data.error) {
        if (response.status === 401) {
          handleLogout();
          return;
        }
        setUploadMessage(
          data.error ||
            data.detail ||
            `Upload failed (HTTP ${response.status}).`
        );
        return;
      }

      if (!data.id) {
        setUploadMessage("Upload completed, but no document ID was returned.");
        return;
      }

      setUploadMessage("Document ready! Opening chat...");
      navigate(`/chat/${encodeURIComponent(data.id)}`);
    } catch {
      setUploadMessage("Unable to connect to the server.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">
          <h2>DocMind AI</h2>
          <span>AI Document Intelligence</span>
        </div>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </nav>

      <main className="dashboard">
        <section className="dashboard-header">
          <div>
            <p className="eyebrow">DOCUMENT WORKSPACE</p>
            <h1>Your Documents</h1>
            <p className="dashboard-description">
              Upload a PDF and start asking questions using AI-powered document
              search.
            </p>
          </div>
        </section>

        <section className="upload-card">
          <div className="upload-heading">
            <div>
              <p className="section-label">NEW DOCUMENT</p>
              <h2>Upload a PDF</h2>
              <p>
                Your document will be processed, embedded and indexed
                automatically.
              </p>
            </div>
          </div>

          <form onSubmit={handleUpload}>
            <div className="form-group">
              <label htmlFor="title">Document Title</label>
              <input
                type="text"
                id="title"
                placeholder="e.g. AI Product Intelligence Report"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="pdfFile">PDF Document</label>
              <div className="file-input-wrapper">
                <input
                  type="file"
                  id="pdfFile"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  required
                />
              </div>
              <small>PDF files only</small>
            </div>

            <button
              type="submit"
              className="primary-btn upload-btn"
              disabled={uploading}
            >
              <span>{uploading ? "Processing..." : "Upload & Start Chat"}</span>
            </button>
          </form>

          {(uploading || uploadMessage) && (
            <div className="upload-status">
              {uploading && <div className="upload-loader" />}
              <p>{uploadMessage}</p>
            </div>
          )}
        </section>

        <section className="documents-section">
          <div className="documents-heading">
            <div>
              <p className="section-label">YOUR LIBRARY</p>
              <h2>Documents</h2>
            </div>
          </div>

          <div id="documentsList">
            {documents.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📄</div>
                <h3>No documents loaded</h3>
                <p>
                  Upload a PDF above to start chatting with your document.
                </p>
              </div>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="document-card">
                  <h3>{doc.title}</h3>
                  <p>
                    {doc.file} • {doc.chunk_count} chunk
                    {doc.chunk_count === 1 ? "" : "s"} •{" "}
                    {formatModeLabel(doc.embedding_mode)}
                    {doc.uploaded_at
                      ? ` • ${new Date(doc.uploaded_at).toLocaleString()}`
                      : ""}
                  </p>
                  <div className="document-actions">
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() =>
                        navigate(`/chat/${encodeURIComponent(doc.id)}`)
                      }
                    >
                      Open Chat
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleDelete(doc.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </>
  );
}
