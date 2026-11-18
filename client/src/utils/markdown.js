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

export function renderMarkdownSafe(rawText) {
  const escaped = escapeHtml(rawText || "");
  const lines = escaped.split(/\r?\n/);
  const htmlParts = [];
  let listType = null;
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

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = Math.min(headingMatch[1].length + 2, 5);
      htmlParts.push(
        `<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`
      );
      continue;
    }

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
