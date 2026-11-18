export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export type EmbeddingMode = "hybrid" | "partial_hybrid" | "bm25";

export interface DocumentRecord {
  id: number;
  userId: number;
  title: string;
  filename: string;
  uploadedAt: string;
  embeddingMode: EmbeddingMode;
}

export interface ChunkRecord {
  id: number;
  documentId: number;
  content: string;
  chunkOrder: number;
  embedding: number[] | null;
}

let nextUserId = 1;
let nextDocumentId = 1;
let nextChunkId = 1;

export const store = {
  usersById: new Map<number, UserRecord>(),
  usersByEmail: new Map<string, UserRecord>(),
  documentsById: new Map<number, DocumentRecord>(),
  chunksById: new Map<number, ChunkRecord>(),
  chunksByDocumentId: new Map<number, ChunkRecord[]>(),

  createUser(email: string, passwordHash: string): UserRecord {
    const normalizedEmail = email.trim().toLowerCase();
    const user: UserRecord = {
      id: nextUserId++,
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.usersById.set(user.id, user);
    this.usersByEmail.set(normalizedEmail, user);
    return user;
  },

  findUserByEmail(email: string): UserRecord | undefined {
    return this.usersByEmail.get(email.trim().toLowerCase());
  },

  findUserById(id: number): UserRecord | undefined {
    return this.usersById.get(id);
  },

  createDocument(
    userId: number,
    title: string,
    filename: string,
    embeddingMode: EmbeddingMode = "hybrid"
  ): DocumentRecord {
    const doc: DocumentRecord = {
      id: nextDocumentId++,
      userId,
      title,
      filename,
      uploadedAt: new Date().toISOString(),
      embeddingMode,
    };
    this.documentsById.set(doc.id, doc);
    this.chunksByDocumentId.set(doc.id, []);
    return doc;
  },

  findDocumentById(id: number): DocumentRecord | undefined {
    return this.documentsById.get(id);
  },

  listDocumentsByUser(userId: number): DocumentRecord[] {
    const docs: DocumentRecord[] = [];
    for (const doc of this.documentsById.values()) {
      if (doc.userId === userId) {
        docs.push(doc);
      }
    }
    return docs.sort(
      (a, b) =>
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  },

  deleteDocument(documentId: number): boolean {
    const existed = this.documentsById.delete(documentId);
    const chunks = this.chunksByDocumentId.get(documentId) ?? [];
    for (const chunk of chunks) {
      this.chunksById.delete(chunk.id);
    }
    this.chunksByDocumentId.delete(documentId);
    return existed;
  },

  createChunk(
    documentId: number,
    content: string,
    chunkOrder: number,
    embedding: number[] | null
  ): ChunkRecord {
    const chunk: ChunkRecord = {
      id: nextChunkId++,
      documentId,
      content,
      chunkOrder,
      embedding,
    };
    this.chunksById.set(chunk.id, chunk);
    const list = this.chunksByDocumentId.get(documentId) ?? [];
    list.push(chunk);
    this.chunksByDocumentId.set(documentId, list);
    return chunk;
  },

  getChunksForDocument(documentId: number): ChunkRecord[] {
    return this.chunksByDocumentId.get(documentId) ?? [];
  },
};
