const API_BASE_URL = "";

// =========================
// AUTH
// =========================

const accessToken = localStorage.getItem("access_token");

if (!accessToken) {
    window.location.assign("index.html");
}

// =========================
// ELEMENTS
// =========================

const uploadForm = document.getElementById("uploadForm");
const uploadMessage = document.getElementById("uploadMessage");
const uploadLoader = document.getElementById("uploadLoader");
const logoutBtn = document.getElementById("logoutBtn");
const uploadButton = document.getElementById("uploadBtn");
const uploadButtonText = document.getElementById("uploadBtnText");
const documentsList = document.getElementById("documentsList");

// =========================
// LOGOUT
// =========================

logoutBtn.addEventListener("click", function () {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.assign("index.html");
});

// =========================
// LOAD DOCUMENTS LIBRARY
// =========================

function renderEmptyState() {
    documentsList.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">📄</div>
            <h3>No documents loaded</h3>
            <p>Upload a PDF above to start chatting with your document.</p>
        </div>
    `;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

function formatModeLabel(mode) {
    if (mode === "hybrid") return "Hybrid (Vectors + BM25)";
    if (mode === "partial_hybrid") return "Partial Hybrid + BM25";
    return "BM25 Search";
}

function renderDocuments(documents) {
    if (!documents || documents.length === 0) {
        renderEmptyState();
        return;
    }

    documentsList.innerHTML = "";

    documents.forEach((doc) => {
        const card = document.createElement("div");
        card.className = "document-card";

        const uploadedDate = doc.uploaded_at
            ? new Date(doc.uploaded_at).toLocaleString()
            : "";

        card.innerHTML = `
            <h3>${escapeHtml(doc.title)}</h3>
            <p>${escapeHtml(doc.file)} • ${doc.chunk_count} chunk${doc.chunk_count === 1 ? "" : "s"} • ${formatModeLabel(doc.embedding_mode)}${uploadedDate ? ` • ${escapeHtml(uploadedDate)}` : ""}</p>
            <div class="document-actions">
                <button type="button" class="primary-btn open-chat-btn">Open Chat</button>
                <button type="button" class="secondary-btn delete-doc-btn">Delete</button>
            </div>
        `;

        card.querySelector(".open-chat-btn").addEventListener("click", () => {
            window.location.assign(
                `chat.html?document_id=${encodeURIComponent(doc.id)}`
            );
        });

        card.querySelector(".delete-doc-btn").addEventListener("click", async () => {
            await deleteDocument(doc.id);
        });

        documentsList.appendChild(card);
    });
}

async function loadDocuments() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/documents/`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.status === 401) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            window.location.assign("index.html");
            return;
        }

        if (!response.ok) {
            renderEmptyState();
            return;
        }

        const data = await response.json();
        renderDocuments(data.documents || []);
    } catch (err) {
        console.error("Failed to load documents:", err);
        renderEmptyState();
    }
}

async function deleteDocument(docId) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/documents/${encodeURIComponent(docId)}/`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        if (response.status === 401) {
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");
            window.location.assign("index.html");
            return;
        }

        if (response.ok) {
            await loadDocuments();
        }
    } catch (err) {
        console.error("Delete document failed:", err);
    }
}

loadDocuments();

// =========================
// UPLOAD PDF
// =========================

uploadForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const title = document.getElementById("title").value.trim();
    const pdfFile = document.getElementById("pdfFile").files[0];

    if (!title) {
        uploadMessage.textContent = "Please enter a document title.";
        return;
    }

    if (!pdfFile) {
        uploadMessage.textContent = "Please select a PDF.";
        return;
    }

    if (
        pdfFile.type !== "application/pdf" &&
        !pdfFile.name.toLowerCase().endsWith(".pdf")
    ) {
        uploadMessage.textContent = "Please select a valid PDF file.";
        return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("file", pdfFile);

    uploadMessage.textContent = "Uploading and indexing PDF...";
    if (uploadLoader) uploadLoader.classList.remove("hidden");
    uploadButton.disabled = true;
    uploadButtonText.textContent = "Processing...";

    try {
        const response = await fetch(`${API_BASE_URL}/api/documents/upload/`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
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
                localStorage.removeItem("access_token");
                localStorage.removeItem("refresh_token");
                window.location.assign("index.html");
                return;
            }

            uploadMessage.textContent =
                data.error ||
                data.detail ||
                `Upload failed (HTTP ${response.status}).`;
            return;
        }

        if (!data.id) {
            uploadMessage.textContent =
                "Upload completed, but no document ID was returned.";
            return;
        }

        uploadMessage.textContent = "Document ready! Opening chat...";
        window.location.assign(
            `chat.html?document_id=${encodeURIComponent(data.id)}`
        );
    } catch (error) {
        console.error("Upload error:", error);
        uploadMessage.textContent = "Unable to connect to the server.";
    } finally {
        if (uploadLoader) uploadLoader.classList.add("hidden");
        uploadButton.disabled = false;
        uploadButtonText.textContent = "Upload & Start Chat";
    }
});