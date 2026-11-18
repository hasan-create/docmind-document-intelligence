const API_BASE_URL = "";

// =========================
// AUTH
// =========================

const accessToken = localStorage.getItem("access_token");

if (!accessToken) {
    window.location.assign("index.html");
}

// =========================
// GET DOCUMENT ID
// =========================

const urlParams = new URLSearchParams(window.location.search);
const documentId = urlParams.get("document_id");

if (!documentId) {
    window.location.assign("dashboard.html");
}

// =========================
// ELEMENTS
// =========================

const chatForm = document.getElementById("chatForm");
const questionInput = document.getElementById("question");
const chatMessages = document.getElementById("chatMessages");
const chatError = document.getElementById("chatError");
const backBtn = document.getElementById("backBtn");
const documentInfo = document.getElementById("documentInfo");

// =========================
// LOAD DOCUMENT METADATA
// =========================

async function loadDocumentInfo() {
    if (!documentId || !documentInfo) return;

    try {
        const response = await fetch(
            `${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/`,
            {
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

        if (response.status === 404) {
            documentInfo.textContent =
                "Document not found. Please return to the dashboard and upload again.";
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
            documentInfo.textContent = `${doc.title} (${doc.file} • ${doc.chunk_count} chunk${doc.chunk_count === 1 ? "" : "s"} • ${modeText})`;
        }
    } catch (err) {
        console.error("Failed to fetch document info:", err);
    }
}

loadDocumentInfo();

// =========================
// BACK TO DASHBOARD
// =========================

backBtn.addEventListener("click", function () {
    window.location.assign("dashboard.html");
});

// =========================
// SEND QUESTION
// =========================

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

chatForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const question = questionInput.value.trim();
    if (!question) {
        return;
    }

    chatError.textContent = "";
    addMessage(question, "user");
    questionInput.value = "";

    const loadingMessage = addMessage("Thinking...", "ai");
    questionInput.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/documents/chat/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                document_id: Number(documentId),
                question: question,
            }),
        });

        const rawText = await response.text();
        let data = {};
        try {
            data = rawText ? JSON.parse(rawText) : {};
        } catch {
            data = {
                error: `Unexpected server response (HTTP ${response.status}).`,
            };
        }

        loadingMessage.remove();

        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem("access_token");
                localStorage.removeItem("refresh_token");
                window.location.assign("index.html");
                return;
            }

            addMessage(
                data.error ||
                    data.detail ||
                    "Something went wrong while generating the answer.",
                "ai"
            );
            return;
        }

        const metaText = data.strategy
            ? formatStrategyLabel(data.strategy, data.chunks_used)
            : "";

        addMessage(data.answer || "No answer returned.", "ai", metaText);
    } catch (error) {
        console.error("Chat error:", error);
        loadingMessage.remove();
        chatError.textContent = "Unable to connect to the server.";
    } finally {
        questionInput.disabled = false;
        questionInput.focus();
    }
});

// =========================
// SAFE MARKDOWN RENDERER
// =========================

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatInlineMarkdown(escaped) {
    return escaped
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

function renderMarkdownSafe(rawText) {
    const escaped = escapeHtml(rawText || "");
    const lines = escaped.split(/\r?\n/);
    const htmlParts = [];
    let listType = null; // "ul" | "ol" | null
    let inCodeBlock = false;
    let codeLines = [];

    function closeList() {
        if (listType) {
            htmlParts.push(`</${listType}>`);
            listType = null;
        }
    }

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith("```")) {
            closeList();
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeLines = [];
            } else {
                htmlParts.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
                inCodeBlock = false;
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        if (!trimmed) {
            closeList();
            continue;
        }

        // Headings
        const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
        if (headingMatch) {
            closeList();
            const level = Math.min(headingMatch[1].length + 2, 5); // h3-h5 inside chat bubble
            htmlParts.push(
                `<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`
            );
            continue;
        }

        // Unordered list (- or *)
        const ulMatch = trimmed.match(/^[-*•]\s+(.*)$/);
        if (ulMatch) {
            if (listType !== "ul") {
                closeList();
                listType = "ul";
                htmlParts.push("<ul>");
            }
            htmlParts.push(`<li>${formatInlineMarkdown(ulMatch[1])}</li>`);
            continue;
        }

        // Ordered list (1. )
        const olMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
        if (olMatch) {
            if (listType !== "ol") {
                closeList();
                listType = "ol";
                htmlParts.push("<ol>");
            }
            htmlParts.push(`<li>${formatInlineMarkdown(olMatch[1])}</li>`);
            continue;
        }

        closeList();
        htmlParts.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
    }

    if (inCodeBlock && codeLines.length > 0) {
        htmlParts.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
    }
    closeList();

    return htmlParts.join("");
}

// =========================
// ADD MESSAGE
// =========================

function addMessage(text, sender, metaText = "") {
    const message = document.createElement("div");
    message.classList.add("chat-message", sender);

    if (sender === "ai") {
        const body = document.createElement("div");
        body.className = "ai-formatted-body";
        body.innerHTML = renderMarkdownSafe(text);
        message.appendChild(body);
    } else {
        message.textContent = text;
    }

    if (metaText) {
        const meta = document.createElement("div");
        meta.className = "strategy-meta";
        meta.textContent = metaText;
        message.appendChild(meta);
    }

    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return message;
}