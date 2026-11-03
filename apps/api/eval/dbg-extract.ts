import { readFileSync } from 'node:fs';
process.env.EXTRACT_PROVIDER = 'http';
const { extractWithLLM } = await import('../src/services/extract.js');
console.log('base set:', !!process.env.LLM_BASE_URL, 'key set:', !!process.env.LLM_API_KEY, 'model:', process.env.LLM_MODEL);
const text = readFileSync('eval/fixtures/tender_auckland_2026.txt', 'utf-8');
const out = await extractWithLLM('tender_auckland_2026.txt', text);
console.log('RESULT:', JSON.stringify(out)?.slice(0, 500));
