export function splitText(text, chunkSize = 1800, overlap = 200) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) {
    return [];
  }

  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);

    if (end < normalized.length) {
      const window = normalized.slice(start, end);
      const minBreak = Math.floor(chunkSize * 0.5);

      const paraBreak = window.lastIndexOf("\n\n");
      const lineBreak = window.lastIndexOf("\n");
      const sentenceBreak = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("? "),
        window.lastIndexOf("! ")
      );
      const wordBreak = window.lastIndexOf(" ");

      if (paraBreak >= minBreak) {
        end = start + paraBreak + 2;
      } else if (lineBreak >= minBreak) {
        end = start + lineBreak + 1;
      } else if (sentenceBreak >= minBreak) {
        end = start + sentenceBreak + 2;
      } else if (wordBreak >= minBreak) {
        end = start + wordBreak + 1;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
