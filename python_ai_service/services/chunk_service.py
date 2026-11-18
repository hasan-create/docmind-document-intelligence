import re
from typing import List


class ChunkService:
    @staticmethod
    def split_text(
        text: str,
        chunk_size: int = 1800,
        overlap: int = 200,
    ) -> List[str]:
        normalized = text.replace("\r\n", "\n")
        normalized = re.sub(r"[ \t]+", " ", normalized)
        normalized = re.sub(r"\n{3,}", "\n\n", normalized).strip()

        if not normalized:
            return []

        if len(normalized) <= chunk_size:
            return [normalized]

        chunks: List[str] = []
        start = 0
        length = len(normalized)

        while start < length:
            end = min(start + chunk_size, length)

            if end < length:
                window = normalized[start:end]
                min_break = int(chunk_size * 0.5)

                para_break = window.rfind("\n\n")
                line_break = window.rfind("\n")
                sentence_break = max(
                    window.rfind(". "),
                    window.rfind("? "),
                    window.rfind("! "),
                )
                word_break = window.rfind(" ")

                if para_break >= min_break:
                    end = start + para_break + 2
                elif line_break >= min_break:
                    end = start + line_break + 1
                elif sentence_break >= min_break:
                    end = start + sentence_break + 2
                elif word_break >= min_break:
                    end = start + word_break + 1

            chunk = normalized[start:end].strip()
            if chunk:
                chunks.append(chunk)

            if end >= length:
                break

            start = max(end - overlap, start + 1)

        return chunks
