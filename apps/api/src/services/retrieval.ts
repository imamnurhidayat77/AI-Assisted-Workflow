import { PrismaClient } from '@prisma/client';
import { toSql } from 'pgvector';
import { embedOne } from './embeddings.js';

export interface ChunkHit {
  documentId: string;
  fileName: string;
  chunkIndex: number;
  content: string;
  distance: number;
}

const prisma = new PrismaClient();

/**
 * Retrieval RAG: embed pertanyaan → cosine distance pgvector → top-k.
 * Mengembalikan [] bila DB tidak reachable / belum ada chunk (fallback aman).
 */
export async function retrieveChunks(query: string, k = 4, maxDistance = 0.8): Promise<ChunkHit[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const vec = await embedOne(query);
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT c."documentId", d."fileName", c."chunkIndex", c.content, (c.embedding <=> '${toSql(vec)}') AS distance
       FROM "DocumentChunk" c JOIN "Document" d ON d.id = c."documentId"
       WHERE c.embedding IS NOT NULL
       ORDER BY distance ASC LIMIT ${Math.min(Math.max(k, 1), 8)}`,
    )) as ChunkHit[];
    return rows.filter((r) => Number(r.distance) <= maxDistance);
  } catch (e) {
    console.warn('[rag] retrieval gagal:', (e as Error).message);
    return [];
  }
}

/** Chunk dari dokumen terbaru — untuk pertanyaan seperti "dokumen yang baru saya upload". */
export async function recentChunks(limit = 4): Promise<ChunkHit[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT c."documentId", d."fileName", c."chunkIndex", c.content, 0 AS distance
       FROM "DocumentChunk" c JOIN "Document" d ON d.id = c."documentId"
       WHERE c.embedding IS NOT NULL AND d.status <> 'Processing'
       ORDER BY d."createdAt" DESC, c."chunkIndex" ASC LIMIT ${Math.min(Math.max(limit, 1), 8)}`,
    )) as ChunkHit[];
    return rows;
  } catch (e) {
    console.warn('[rag] recent gagal:', (e as Error).message);
    return [];
  }
}

/** Kata kunci niat-dokumen (ID + EN): "baca dokumen", "yang baru upload", "file", ... */
export function isDocIntent(message: string): boolean {
  return /doku[mn]en|upload|file|berkas|terbaru|baru (saya|di ?upload|upload)|yang (baru|terakhir)|read (this|the|my|your)|just uploaded|latest/i.test(message);
}
