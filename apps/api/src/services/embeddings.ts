// Embedding deterministik lokal (hashing trick, 384 dim, L2-normalized).
//
// Mengapa bukan model transformer (all-MiniLM)?
// onnxruntime-node 1.30 tidak menyediakan binding darwin/x64 (mesin ini Intel Mac),
// dan gateway OpenCode Go tidak punya endpoint /embeddings.
// Sebagai gantinya dipakai *signed hashing trick* (Vowpal-Wabbit style):
// deterministik lintas run, tanpa download, tanpa API key, cosine-ready.
// Kualitas di bawah model neural, tapi cukup untuk grounding demo;
// interface (384 float[]) identik sehingga ganti ke model beneran
// tinggal menukar isi embed() — skema pgvector tidak berubah.
const DIMS = 384;

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

function embedSingle(text: string): number[] {
  const vec = new Float64Array(DIMS);
  const tokens = tokenize(text);
  if (!tokens.length) return Array(DIMS).fill(0);
  // Bobot tf sederhana: kemunculan berulang memperkuat sinyal.
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const [token, count] of counts) {
    const w = 1 + Math.log(count);
    const idx = fnv1a(token) % DIMS;
    const sign = fnv1a(token, 0x01000193) % 2 === 0 ? 1 : -1;
    vec[idx] += sign * w;
    // Proyeksi kedua untuk mengurangi tabrakan hash.
    const idx2 = fnv1a(`2:${token}`) % DIMS;
    const sign2 = fnv1a(`s:${token}`) % 2 === 0 ? 1 : -1;
    vec[idx2] += sign2 * w * 0.5;
  }
  let norm = 0;
  for (let i = 0; i < DIMS; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}

export async function embed(texts: string[]): Promise<number[][]> {
  return texts.map((t) => embedSingle(t.replace(/\s+/g, ' ').trim().slice(0, 2000)));
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

export const EMBEDDING_DIMS = DIMS;
