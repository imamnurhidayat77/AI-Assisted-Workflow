// Provider embedding pluggable: hash (default) | neural (transformers lokal) | http (OpenAI-compatible).
//
// Mengapa default hash? onnxruntime-node tidak punya binding darwin/x64 (mesin dev Intel Mac),
// dan gateway OpenCode Go tidak punya endpoint /embeddings — dibuktikan via smoke test:
//   import('onnxruntime-node') → Cannot find module .../darwin/x64/onnxruntime_binding.node
// Interface (384 float[] ternormalisasi) identik di semua provider sehingga ganti
// provider tidak mengubah skema pgvector — tapi WAJIB reindex setelah ganti
// (POST /api/documents/reindex), karena vektor antar-provider tidak sebanding.
const DIMS = 384;

export type EmbeddingProvider = 'hash' | 'neural' | 'http';

export function embeddingProvider(): EmbeddingProvider {
  const p = (process.env.EMBEDDING_PROVIDER ?? 'hash').toLowerCase();
  return p === 'neural' || p === 'http' ? p : 'hash';
}

export function embeddingInfo(): { provider: EmbeddingProvider; dims: number; model: string } {
  const provider = embeddingProvider();
  return {
    provider,
    dims: DIMS,
    model:
      provider === 'neural'
        ? (process.env.EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2')
        : provider === 'http'
          ? (process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small')
          : 'signed-hashing-trick',
  };
}

/** FNV-1a 32-bit — deterministik, cepat. */
function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

/** Signed hashing trick (Vowpal-Wabbit style): deterministik lintas run,
 * tanpa download, tanpa API key, cosine-ready. Kualitas di bawah model neural. */
function embedHash(texts: string[]): number[][] {
  return texts.map((raw) => {
    const vec = new Array<number>(DIMS).fill(0);
    const counts = new Map<string, number>();
    for (const t of tokenize(raw)) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const [token, count] of counts) {
      const w = 1 + Math.log(count);
      const idx = fnv1a(token) % DIMS;
      const sign = fnv1a(token, 0x01000193) % 2 === 0 ? 1 : -1;
      vec[idx] += sign * w;
      const idx2 = fnv1a(`2:${token}`) % DIMS;
      const sign2 = fnv1a(`s:${token}`) % 2 === 0 ? 1 : -1;
      vec[idx2] += sign2 * w * 0.5;
    }
    return normalize(vec);
  });
}

type FeaturePipeline = (texts: string[], opts: { pooling: string; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let neuralPipe: FeaturePipeline | null = null;
let neuralWarned = false;

async function embedNeural(texts: string[]): Promise<number[][] | null> {
  try {
    if (!neuralPipe) {
      const { pipeline } = (await import('@huggingface/transformers')) as unknown as {
        pipeline: (task: string, model: string) => Promise<FeaturePipeline>;
      };
      neuralPipe = await pipeline('feature-extraction', process.env.EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2');
    }
    const out = await neuralPipe(texts, { pooling: 'mean', normalize: true });
    const rows = out.tolist();
    // Dimensi harus cocok skema pgvector; bila tidak, tolak (jangan campur vektor).
    if (!rows.length || rows[0].length !== DIMS) throw new Error(`dimensi model ${rows[0]?.length} ≠ ${DIMS}`);
    return rows;
  } catch (e) {
    if (!neuralWarned) {
      neuralWarned = true;
      console.warn('[embed] neural gagal, fallback ke hashing:', (e as Error).message.slice(0, 160));
    }
    neuralPipe = null;
    return null;
  }
}

async function embedHttp(texts: string[]): Promise<number[][] | null> {
  try {
    const base = process.env.EMBEDDING_BASE_URL?.replace(/\/$/, '');
    const key = process.env.EMBEDDING_API_KEY;
    if (!base || !key) throw new Error('EMBEDDING_BASE_URL / EMBEDDING_API_KEY belum dikonfigurasi');
    const res = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small', input: texts }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { data?: { embedding?: number[] }[] };
    const rows = (j.data ?? []).map((d) => d.embedding ?? []);
    if (!rows.length || rows.some((r) => r.length !== DIMS)) throw new Error('dimensi respons tidak sesuai');
    return rows;
  } catch (e) {
    console.warn('[embed] http gagal, fallback ke hashing:', (e as Error).message.slice(0, 160));
    return null;
  }
}

function clean(texts: string[]): string[] {
  return texts.map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 2000));
}

export async function embed(texts: string[]): Promise<number[][]> {
  const provider = embeddingProvider();
  if (provider === 'neural') {
    const rows = await embedNeural(clean(texts));
    if (rows) return rows;
  } else if (provider === 'http') {
    const rows = await embedHttp(clean(texts));
    if (rows) return rows;
  }
  return embedHash(clean(texts));
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

export const EMBEDDING_DIMS = DIMS;
