let nextUserId = 1;
let nextDocumentId = 1;
let nextChunkId = 1;

export const store = {
  usersById: new Map(),
  usersByEmail: new Map(),
  documentsById: new Map(),
  chunksById: new Map(),
  chunksByDocumentId: new Map(),

  createUser(email, passwordHash) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = {
      id: nextUserId++,
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.usersById.set(user.id, user);
    this.usersByEmail.set(normalizedEmail, user);
    return user;
  },

  findUserByEmail(email) {
    return this.usersByEmail.get(email.trim().toLowerCase());
  },

  findUserById(id) {
    return this.usersById.get(id);
  },

  createDocument(userId, title, filename, embeddingMode = "hybrid", chunkCount = 0) {
    const doc = {
      id: nextDocumentId++,
      userId,
      title,
      filename,
      uploadedAt: new Date().toISOString(),
      embeddingMode,
      chunkCount,
    };
    this.documentsById.set(doc.id, doc);
    this.chunksByDocumentId.set(doc.id, []);
    return doc;
  },

  updateDocumentMeta(documentId, updates) {
    const doc = this.documentsById.get(documentId);
    if (!doc) return undefined;
    Object.assign(doc, updates);
    return doc;
  },

  findDocumentById(id) {
    return this.documentsById.get(id);
  },

  listDocumentsByUser(userId) {
    const docs = [];
    for (const doc of this.documentsById.values()) {
      if (doc.userId === userId) {
        docs.push(doc);
      }
    }
    return docs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  },

  deleteDocument(documentId) {
    const existed = this.documentsById.delete(documentId);
    const chunks = this.chunksByDocumentId.get(documentId) ?? [];
    for (const chunk of chunks) {
      this.chunksById.delete(chunk.id);
    }
    this.chunksByDocumentId.delete(documentId);
    return existed;
  },

  createChunk(documentId, content, chunkOrder, embedding) {
    const chunk = {
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

  getChunksForDocument(documentId) {
    return this.chunksByDocumentId.get(documentId) ?? [];
  },
};
