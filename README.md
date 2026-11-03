# Street Smart Copilot — AI Leverage untuk Smart City Street Ltd NZ

Konsep: SAP Joule-style AI copilot untuk operasi bisnis — tender pemerintah,
distributor sales, katalog produk, quotation, dokumen, dan jobs/otomasi.

Design awal dari Figma Make ada di `figma-make/` (referensi, jangan diedit).
Implementasi production ada di monorepo ini:

```
apps/web        Next.js 15 (App Router, TS, Tailwind v4) — UI Copilot (tanpa data palsu: API mati = error/empty eksplisit)
apps/api        Express TS — REST API, Prisma/Postgres Neon saja (tanpa fallback mock; DB mati = 503)
packages/shared Types + fixture data (seed/test saja, BUKAN fallback runtime)
prisma/         (schema canonical — dipakai apps/api, lihat apps/api/prisma)
neon.ts + .neon   Postgres Neon (org Imam, project Smart City Street, branch production)
docs/           Deliverables: 01-requirements-brief, 02-system-design, 03-test-plan, 04-handover-guide
```

## Cara jalan (butuh DB Neon — tanpa fallback mock)

```bash
npm install
cp .env.example .env   # lalu `neon env pull` untuk DATABASE_URL Neon
npm run db:migrate --workspace=apps/api
npm run db:seed --workspace=apps/api
npm run dev:web   # http://localhost:3000
npm run dev:api   # http://localhost:4000/health
```

Tanpa `DATABASE_URL` Neon yang valid, API mengembalikan 503 dan web menampilkan
empty/error state yang jujur — tidak ada data simulasi yang menyamar sebagai data asli.

Login demo: buka `/login`, pilih akun dummy per role (password `sss12345`).

## Struktur halaman (dipetakan dari Figma Make)

| Route Next.js | Figma `Page` | Keterangan | Role |
|---|---|---|---|
| `/` | discover | Hero + composer + prompt chips | semua |
| `/conversation` | conversation | Jawaban AI + tender cards + sources | semua (assistant per-role) |
| `/conversations` | conversations | Riwayat chat | semua (milik sendiri) |
| `/spaces` | spaces | Workspace kontekstual: konteks grounding, next actions, pending drafts, activity timeline | semua (isi difilter role + ownership; private = pemilik, role = se-role, mgmt = semua) |
| `/inbox` | — | My inbox: awaiting my decision + my drafts needing action | semua (difilter checker/owner) |
| `/executive` | — | Executive overview: KPI + snapshot lintas-domain read-only | management |
| `/metrics` | — | Adoption metrics: usage by role/assistant, draft funnel | management |
| `/quotations` | — | Quotations: CRUD draft + request approval (maker-checker) | sales, operations, management |
| `/deadlines` | — | Tender closing timeline (overdue/14d/30d/later) | sales, operations, management |
| `/jobs` | jobs | Jobs & automations | operations, management |
| `/documents` | documents | Upload + processing queue | semua (domain difilter per-role) |
| `/data` | data | Database explorer | semua (browser tender: sales/ops/mgmt) |
| `/finance` | — | Finance overview: invoice + closing checklist read-only | finance, management |
| `/hr` | — | HR overview: policies + aggregate team capacity (no individual data) | hr, management |
| `/reports` | reports | Tender analytics + distributor sales tab | sales, operations, management |

State navigasi + toast + composer disentralisasi di `apps/web/src/lib/store.tsx`
(mirip pola Joule: shell + agent context).

## API stub (apps/api)

- `GET /health`
- Semua endpoint `/api/*` (kecuali `/health`, `/api/auth/users`, demo-login) wajib `X-API-Key`
- `GET /api/tenders`, `/api/jobs`, `/api/conversations` — baca operasional (semua role aktif); `/api/reports/summary` dan `/api/alerts` dihapus (angka palsu) — reports dihitung live dari `/api/tenders`
- `POST /api/chat` — `{ message, assistantId? }` → routing assistant per-role + RBAC + audit; default = assistant role user. Planning loop 2 langkah: `selectSkills` (intent → maks 3 skill) lalu `executeSkills` (hitung deterministik dari snapshot live + relasi entitas tender↔quotation↔draft) — model hanya merangkai jawaban dari hasil skill, `skillsUsed` = yang benar-benar jalan. Jawaban membawa `actions` kontekstual (disanitasi server, maks 3; sapaan & jawaban kosong = tanpa tombol)
- `GET /api/chat/assistants` — assistant yang boleh dipakai role user
- `POST /api/chat/query` — Text-to-SQL read-only (`{ question }` atau `{ sql }`), allowlist tabel/kolom per-role, maks 50 baris
- `GET /api/documents` — terfilter domain per-role (`general` | `finance` | `hr`); upload bawa `domain`
- `GET /api/drafts` — milik sendiri (management: semua); `GET /api/drafts/inbox` — awaiting (boleh approve, bukan buatan sendiri) + mine; `POST /api/drafts/:id/approve` — maker-checker (payment: management saja; sales-kind: ops/management bukan pembuat; self-approve → 403); reject/withdraw boleh owner/checker
- `GET /api/notifications` — notifikasi live per-role (draft menunggu + flag overdue SLA, deadline ≤14 hari, overdue, closing terbuka, extracting, digest Senin management) — bell di Shell
- `GET /api/finance/overview` — invoice + checklist (finance/management saja)
- `GET /api/hr/overview` — policies + roster agregat (hr/management saja; tanpa nama/gaji individu by design)
- Quotations: `GET/POST /api/quotations`, `PATCH /:id` (sales/ops/mgmt; sales hanya milik sendiri; edit hanya draft/rejected; terkunci saat in_review; approved/rejected final hanya lewat draft `quotation-review` dengan auto-sync status); tabel `Quotation` terbuka di Text-to-SQL untuk sales/ops/mgmt
- Input data real dari UI: `POST /api/tenders` (form di Database explorer) + `POST /api/distributor/import` (upload CSV di tab Distributor reports; upsert natural key, idempoten)
- Scheduler dalam proses: sweep eskalasi tiap jam (`in_review` > `DRAFT_SLA_DAYS`=3 hari → history `escalated` sekali; `updatedAt` asli dipertahankan)
- `GET /api/audit` — riwayat chat (preview), khusus management (+ halaman `/audits`)
- `GET /api/conversations` + `GET /api/conversations/:id` — thread chat milik sendiri (persist per user)
- `POST /api/documents/reindex` — bangun ulang vektor (operations/management; wajib setelah ganti `EMBEDDING_PROVIDER`)
- `npm run db:backup` — dump Postgres ke `./backups`; `npm test` — vitest (shared) + node:test (api)

Kontrak tipe ada di `packages/shared`.

## Langkah berikutnya ke arah SAP Joule beneran

1. Ganti `POST /api/chat` dengan orchestrator LLM (tool-calling ke Prisma + vector search).
2. Tambah `Agent` + `Skill` registry (tender-prioritizer, sales-analyst, quotation-checker).
3. Grounding: RAG untuk PDF tender + Text-to-SQL aman untuk tabel sales/tender.
4. Human-in-the-loop untuk aksi consequential (submit tender, approve quotation).
