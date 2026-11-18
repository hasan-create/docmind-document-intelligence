import mongoose from "mongoose";
import { UserModel } from "./models/User.js";
import { DocumentModel } from "./models/Document.js";
import { ChunkModel } from "./models/Chunk.js";

let useMongo = false;
let nextUserId = 1;
let nextDocumentId = 1;
let nextChunkId = 1;

const memUsersById = new Map();
const memUsersByEmail = new Map();
const memDocumentsById = new Map();
const memChunksById = new Map();
const memChunksByDocumentId = new Map();

function formatUser(doc) {
  if (!doc) return undefined;
  return {
    id: String(doc._id),
    email: doc.email,
    passwordHash: doc.passwordHash,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
  };
}

function formatDocument(doc) {
  if (!doc) return undefined;
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    title: doc.title,
    filename: doc.filename,
    uploadedAt: doc.uploadedAt ? new Date(doc.uploadedAt).toISOString() : new Date().toISOString(),
    embeddingMode: doc.embeddingMode || "hybrid",
    chunkCount: doc.chunkCount ?? 0,
  };
}

function formatChunk(doc) {
  if (!doc) return undefined;
  return {
    id: String(doc._id),
    documentId: String(doc.documentId),
    content: doc.content,
    chunkOrder: doc.chunkOrder,
    embedding: Array.isArray(doc.embedding) && doc.embedding.length > 0 ? doc.embedding : null,
  };
}

export async function initStore() {
  const mongoUri = (process.env.MONGODB_URI || "").trim();
  if (!mongoUri) {
    useMongo = false;
    console.log("Store mode: in-memory (set MONGODB_URI in .env to enable MongoDB persistence)");
    return;
  }

  await mongoose.connect(mongoUri);
  useMongo = true;
  console.log("Store mode: MongoDB connected via Mongoose");
}

export function isMongoEnabled() {
  return useMongo;
}

export const store = {
  async createUser(email, passwordHash) {
    const normalizedEmail = email.trim().toLowerCase();
    if (useMongo) {
      const created = await UserModel.create({
        email: normalizedEmail,
        passwordHash,
      });
      return formatUser(created);
    }

    const user = {
      id: String(nextUserId++),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    memUsersById.set(user.id, user);
    memUsersByEmail.set(normalizedEmail, user);
    return user;
  },

  async findUserByEmail(email) {
    const normalizedEmail = email.trim().toLowerCase();
    if (useMongo) {
      const user = await UserModel.findOne({ email: normalizedEmail }).lean();
      return formatUser(user);
    }
    return memUsersByEmail.get(normalizedEmail);
  },

  async findUserById(id) {
    const userId = String(id || "").trim();
    if (!userId) return undefined;
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(userId)) return undefined;
      const user = await UserModel.findById(userId).lean();
      return formatUser(user);
    }
    return memUsersById.get(userId);
  },

  async createDocument(userId, title, filename, embeddingMode = "hybrid", chunkCount = 0) {
    if (useMongo) {
      const created = await DocumentModel.create({
        userId,
        title,
        filename,
        embeddingMode,
        chunkCount,
      });
      return formatDocument(created);
    }

    const doc = {
      id: String(nextDocumentId++),
      userId: String(userId),
      title,
      filename,
      uploadedAt: new Date().toISOString(),
      embeddingMode,
      chunkCount,
    };
    memDocumentsById.set(doc.id, doc);
    memChunksByDocumentId.set(doc.id, []);
    return doc;
  },

  async updateDocumentMeta(documentId, updates) {
    const docId = String(documentId || "").trim();
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(docId)) return undefined;
      const updated = await DocumentModel.findByIdAndUpdate(
        docId,
        { $set: updates },
        { new: true }
      ).lean();
      return formatDocument(updated);
    }

    const doc = memDocumentsById.get(docId);
    if (!doc) return undefined;
    Object.assign(doc, updates);
    return doc;
  },

  async findDocumentById(id) {
    const docId = String(id || "").trim();
    if (!docId) return undefined;
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(docId)) return undefined;
      const doc = await DocumentModel.findById(docId).lean();
      return formatDocument(doc);
    }
    return memDocumentsById.get(docId);
  },

  async listDocumentsByUser(userId) {
    const uid = String(userId || "").trim();
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(uid)) return [];
      const docs = await DocumentModel.find({ userId: uid })
        .sort({ uploadedAt: -1 })
        .lean();
      return docs.map(formatDocument);
    }

    const docs = [];
    for (const doc of memDocumentsById.values()) {
      if (doc.userId === uid) {
        docs.push(doc);
      }
    }
    return docs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  },

  async deleteDocument(documentId) {
    const docId = String(documentId || "").trim();
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(docId)) return false;
      const deleted = await DocumentModel.findByIdAndDelete(docId);
      await ChunkModel.deleteMany({ documentId: docId });
      return Boolean(deleted);
    }

    const existed = memDocumentsById.delete(docId);
    const chunks = memChunksByDocumentId.get(docId) ?? [];
    for (const chunk of chunks) {
      memChunksById.delete(chunk.id);
    }
    memChunksByDocumentId.delete(docId);
    return existed;
  },

  async createChunk(documentId, content, chunkOrder, embedding) {
    const docId = String(documentId || "").trim();
    if (useMongo) {
      const created = await ChunkModel.create({
        documentId: docId,
        content,
        chunkOrder,
        embedding,
      });
      return formatChunk(created);
    }

    const chunk = {
      id: String(nextChunkId++),
      documentId: docId,
      content,
      chunkOrder,
      embedding,
    };
    memChunksById.set(chunk.id, chunk);
    const list = memChunksByDocumentId.get(docId) ?? [];
    list.push(chunk);
    memChunksByDocumentId.set(docId, list);
    return chunk;
  },

  async createChunks(documentId, chunks, embeddings) {
    const docId = String(documentId || "").trim();
    if (useMongo) {
      const docsToInsert = chunks.map((content, idx) => ({
        documentId: docId,
        content,
        chunkOrder: idx + 1,
        embedding: embeddings[idx] ?? null,
      }));
      if (docsToInsert.length > 0) {
        await ChunkModel.insertMany(docsToInsert);
      }
      return;
    }

    for (let i = 0; i < chunks.length; i++) {
      await this.createChunk(docId, chunks[i], i + 1, embeddings[i] ?? null);
    }
  },

  async getChunksForDocument(documentId) {
    const docId = String(documentId || "").trim();
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(docId)) return [];
      const chunks = await ChunkModel.find({ documentId: docId })
        .sort({ chunkOrder: 1 })
        .lean();
      return chunks.map(formatChunk);
    }
    return memChunksByDocumentId.get(docId) ?? [];
  },

  async countVectors() {
    if (useMongo) {
      return ChunkModel.countDocuments({
        embedding: { $exists: true, $ne: null, $not: { $size: 0 } },
      });
    }
    let count = 0;
    for (const chunk of memChunksById.values()) {
      if (chunk.embedding) count++;
    }
    return count;
  },
};
