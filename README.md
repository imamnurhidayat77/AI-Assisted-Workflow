# Street Smart Cockpit — AI Leverage untuk Smart City Street Ltd NZ

Konsep: SAP Joule-style AI copilot untuk operasi bisnis — tender pemerintah,
distributor sales, katalog produk, quotation, dokumen, dan jobs/otomasi.

Design awal dari Figma Make ada di `figma-make/` (referensi, jangan diedit).
Implementasi production ada di monorepo ini:

```
apps/web        Next.js 15 (App Router, TS, Tailwind v4) — UI Cockpit
apps/api        Express TS — REST API (mock → Prisma/Postgres nanti)
packages/shared Types + mock data yang dipakai web & api
prisma/         (schema canonical — dipakai apps/api, lihat apps/api/prisma)
docker-compose  Postgres 16 lokal
docs/           Deliverables: 01-requirements-brief, 02-system-design
```

## Cara jalan (mock, tanpa DB dulu)

```bash
npm install
npm run dev:web   # http://localhost:3000
npm run dev:api   # http://localhost:4000/health
```

Web jalan penuh dengan **mock data** — tidak butuh DB untuk klik-klik semua halaman.

## Dengan Postgres

```bash
cp .env.example .env
docker compose up -d db
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api
```

## Struktur halaman (dipetakan dari Figma Make)

| Route Next.js | Figma `Page` | Keterangan |
|---|---|---|
| `/` | discover | Hero + composer + prompt chips |
| `/conversation` | conversation | Jawaban AI + tender cards + sources |
| `/conversations` | conversations | Riwayat chat |
| `/spaces` | spaces | Workspace persistent |
| `/jobs` | jobs | Jobs & automations |
| `/documents` | documents | Upload + processing queue |
| `/data` | data | Database explorer |
| `/connections` | connections | DB connections |
| `/reports` | reports | Tender analytics |
| `/status` | status | System health |
| `/alerts` | alerts | Alerts operasional |

State navigasi + toast + composer disentralisasi di `apps/web/src/lib/store.tsx`
(mirip pola Joule: shell + agent context).

## API stub (apps/api)

- `GET /health`
- `GET /api/tenders` — daftar tender (mock, nanti ganti Prisma)
- `GET /api/conversations` — riwayat percakapan
- `POST /api/chat` — `{ message, assistantId?, role? }` → routing ke assistant per-role (sales/finance/hr/ops/management); tanpa `assistantId` di-infer dari pesan
- `GET /api/chat/assistants[?role=]` — daftar assistant + skills (ala Joule Studio registry)
- `GET /api/jobs`, `GET /api/alerts`, `GET /api/reports/summary`

Kontrak tipe ada di `packages/shared`.

## Langkah berikutnya ke arah SAP Joule beneran

1. Ganti `POST /api/chat` dengan orchestrator LLM (tool-calling ke Prisma + vector search).
2. Tambah `Agent` + `Skill` registry (tender-prioritizer, sales-analyst, quotation-checker).
3. Grounding: RAG untuk PDF tender + Text-to-SQL aman untuk tabel sales/tender.
4. Human-in-the-loop untuk aksi consequential (submit tender, approve quotation).
