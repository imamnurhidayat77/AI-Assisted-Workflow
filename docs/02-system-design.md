# System Design — Street Smart Copilot

**Companion to:** `01-requirements-brief.md`
**Status:** Living document — v1.1 (drafts lifecycle, Spaces decisions, LLM extraction opt-in)

---

## 1. Architecture Overview

Monorepo (npm workspaces), TypeScript throughout, **live-DB only — tanpa fallback mock**:
UI → API → Neon Postgres; DB mati = 503 eksplisit + empty state jujur (tanpa data palsu).

```mermaid
flowchart LR
    subgraph WEB["apps/web — Next.js 15"]
        UI[App Router pages] --> Store[Toast + API client]
        Store -->|fetch, gagal = error/empty| API
    end
    subgraph SRV["apps/api — Express 4"]
        API[/api/* routers/] --> SVC[services: llm, tenders, documents, ...]
        SVC -->|Prisma| DB[(Neon Postgres)]
        SVC -.->|DB down| ERR[503 eksplisit]
        SVC -.->|AI_PROVIDER=http| LLM[(LLM API)]
    end
    subgraph SHARED["packages/shared"]
        T[types + fixtures seed/test + mockChatAnswer (test/legacy saja)]
    end
    WEB --> SHARED
    SRV --> SHARED
```

### 1.1 Repository layout

```
apps/web        Next.js 15 (App Router, TS, Tailwind v4) — Copilot UI
apps/api        Express TS — REST API (tsx watch / tsc build)
apps/api/prisma schema.prisma + seed.ts
apps/api/uploads stored user files (gitignored)
packages/shared types + mock data + mock answer branches
docs/           this folder (deliverables)
neon.ts + .neon  Postgres Neon (org Imam, project Smart City Street, branch production)
figma-make/     original Figma Make reference (do not edit)
```

### 1.2 Design decisions (ADRs, condensed)

| # | Decision | Rationale |
|---|---|---|
| D1 | Live-DB only — tanpa fallback mock (dulu: mock-first) | DB Neon mati = 503 + empty state jujur; eval/dev butuh `DATABASE_URL` Neon |
| D2 | Single shared mock dataset (`packages/shared`) | Web + API stay consistent; doubles as evaluation ground truth |
| D3 | Provider abstraction for AI (`AI_PROVIDER=mock\|http`) | Swap to real key (e.g. muse-spark) via env only, no code change |
| D4 | Grounding by construction, not by prompt alone | Tender cards/IDs resolved + validated against live DB rows |
| D5 | Provenance headers (`X-AI-Via`, `X-Data-Via`) | Makes accuracy/time-saved evaluation measurable |
| D6 | Postgres Neon (managed, Sydney) | Tanpa docker lokal; `DATABASE_URL` via `neon env pull`, migrate via direct URL |
| D7 | Design system referencing style.ai.id | Dark-first tokens, Plus Jakarta Sans / Nunito / JetBrains Mono, glassy cards |

## 2. Frontend (`apps/web`)

- **Framework:** Next.js 15 App Router, React 19, Tailwind v4 (`@tailwindcss/postcss`).
- **Routing:** 11 routes — `/` Discover, `/conversation` (detail; `?q=` prefill, `?new=1` blank),
  `/conversations`, `/spaces`, `/jobs`, `/documents`, `/data`,
  `/reports`. Sidebar has no separate "New conversation" entry;
  halaman connections/status/alerts dihapus (mock tanpa API); jobs khusus
  operations+management, reports khusus sales+operations+management;
  `/conversation` highlights **Conversations** (it is a detail view).
- **State:** `lib/store.tsx` (toast), `lib/api.ts` (`get`/`post` — gagal = fallback yang diberikan caller; halaman data kini memakai `null` + empty/error state, bukan data palsu).
- **Styling:** single `globals.css` design system — CSS variables, `[data-theme]` dark/light,
  theme toggle persisted in `localStorage`, no-JS theme init in `layout.tsx`.
- **Build:** all pages prerendered static; `transpilePackages: ['@street-smart/shared']`.

## 3. Backend (`apps/api`)

| Endpoint | Behaviour |
|---|---|
| `GET /health` | liveness (`mode: mock`) |
| `POST /api/chat` | `chatWithAI()` → routing assistant per-role (`assistantId`/`role`, auto-infer bila absen) → headers `X-AI-Via`, `X-Data-Via`, `X-Assistant` |
| `GET /api/chat/assistants[?role=]` | daftar assistant + skills (registry ala Joule Studio) |
| `GET /api/tenders[?q=]` / `GET /api/tenders/:id` | DB langsung + keyword filter, header `X-Data-Via`; mati = 503 |
| `GET /api/documents` | list terfilter domain per-role (DB saja; mati = 503) |
| `POST /api/documents/upload` | multer, 50 MB, allowlist `.pdf .xlsx .xls .csv .docx`; field `domain` (general\|finance\|hr, hanya role sepadan+mgmt); status `Processing` → `Processed` after ~8 s |
| `GET /api/documents/:id/extract` | structured extraction w/ per-field confidence+source+missingFields; LLM path when `EXTRACT_PROVIDER=http`; tanpa teks terparse = 422 jujur; 404 bila domain di luar role |
| `DELETE /api/documents/:id` | metadata + file removal (ikut domain scoping) |
| `POST /api/chat/query` | Text-to-SQL read-only: `{question}` (mock rule engine / LLM `proposeSql`) atau `{sql}` langsung; validator allowlist ketat (tabel/kolom/WHERE/ORDER/LIMIT≤50 per-role, tolak `;--/* */UNION/JOIN/DDL`); BigInt→Number; audit `text-to-sql` |
| `GET /api/audit[?take=]` | riwayat chat (preview 200 char), khusus management |
| `GET /api/conversations|reports/summary` | mock stubs (Prisma-ready); `/api/alerts` dihapus |
| `GET /api/jobs` | static automations + live draft-approval queue on top (antrean ikut kepemilikan) |
| `GET /api/drafts[?status=]` | list milik sendiri incl. history, management = semua (Prisma saja, DB mati = 503) |
| `POST /api/drafts` / `PATCH /api/drafts/:id` | requireAuth; create catat `createdBy`, edit ikut kepemilikan (409 bila final) |
| `POST /api/drafts/:id/submit\|approve\|reject\|reopen` | consequential transitions, `requireAuth` + ownership, `decidedBy` from session; emits `draft:changed` ke pemilik + management saja |

### 3.1 AI service (`services/llm.ts`, `realtime.ts`)

```
message → getTenders(message) [live rows + via] ──▶ stage: tenders
        → retrieveChunks (+ recent top-up) ────────▶ stage: docs
        → provider==http ? chatWithHttp ───────────▶ stage: ai
                         : mock + 600ms ──────────▶ stage: done
```

- Realtime: Socket.IO on the same port (`chat:message` in, `chat:stage` progress,
  `chat:answer` / `chat:error` out). The frontend tries socket first (70s cap)
  and falls back to `POST /api/chat`; the thinking card animates per stage.
- Per-client `sessionId` (stored in localStorage) is forwarded as
  `x-opencode-session` for gateway routing + prompt caching.

### 3.2 Document service (`services/documents.ts`, `services/extract.ts`)

`DocumentStore`: Prisma saja — DB mati = 503, tanpa memori palsu.

Extraction (`GET /api/documents/:id/extract`) returns `DocumentExtraction`
(`kind`, avg `confidence`, `fields[]` w/ per-field confidence+source+needsReview,
`missingFields[]`):
- `EXTRACT_PROVIDER=http` (+ `LLM_*` set) and parsed text available → `extractWithLLM()`
  (Responses API, truncated context, strict JSON contract, server-side validate/clamp).
- RAG parsed text tersedia → ringkasan ekstraksi asli (character/chunk count + preview).
- Tanpa teks terparse → 422 jujur (`still processing` / `re-upload`), bukan angka simulasi.
  (`extractDocument()` deterministik kini hanya baseline eval `score-extraction.ts`.)

### 3.3 Drafts service (`services/drafts.ts`, `routes/drafts.ts`, `routes/jobs.ts`)

State machine (pure helpers `canMoveDraftStatus`/`canEditDraftStatus` in shared, unit-tested):

```
draft ─┬─▶ in_review ─┬─▶ approved   (locked: no edits, no transitions)
       │              ├─▶ rejected ─▶ draft (reopen & fix)
       ├─▶ approved
       └─▶ rejected
```

- Storage: Prisma `Draft` table saja (tanpa memori fallback); DB mati = 503.
- `decidedBy/decidedAt` + append-only `history[]`; `sourceDocumentId/Name` links document-reviewed drafts.
- Every mutation emits Socket.IO `draft:changed {id, status}` (no body) HANYA ke room pemilik
  (`user:<id>`) + `role:management` — socket wajib `auth` dulu; anonim/role lain tidak menerima apa pun.
  `/jobs` reloads on event, REST stays source of truth.
- `/jobs` = static automations + `draftToJob()` rows for `draft`/`in_review` (approved never queues → no double action).

### 3.4 RAG pipeline (`services/ingest.ts`, `embeddings.ts`, `retrieval.ts`)

```
upload → parse teks asli (pdf-parse / sheetjs / mammoth, max 200rb char)
→ chunk 1500 char + overlap 200 (max 60) → embedding deterministik 384d
→ pgvector (image pgvector/pgvector:pg16, tabel DocumentChunk)
→ chat: embed pertanyaan → cosine distance top-4 (threshold 0.8)
→ chunk disuntik ke prompt + sitasi per chunk di Sources
```

- Embedding = **signed hashing trick** (deterministik, tanpa download/API key):
  onnxruntime tidak ada build darwin/x64 (mesin Intel) dan gateway Go tidak
  punya endpoint `/embeddings`. Interface 384-float identik dengan model neural,
  jadi ganti model tinggal menukar isi `embed()` — skema pgvector tidak berubah.
- Terbukti e2e: PDF tender Auckland (upload) → pertanyaan "berapa unit & kapan
  briefing" dijawab **dari chunk** (4.800 unit SRS-8, briefing 10 Nov 2026)
  dengan sitasi `Auckland_Smart_Road_Tender.pdf bagian #1`.

## 4. Data Model (Prisma / Postgres)

```mermaid
erDiagram
    TENDER ||--o{ CONVERSATION : cited-by
    TENDER {
        string id PK "TND-2026-001"
        string name
        string agency
        string country
        string closeLabel
        string valueDisplay
        string product
        TenderStatus status
        string priority
    }
    CONVERSATION ||--|{ MESSAGE : contains
    CONVERSATION { string id PK, string title, string preview }
    MESSAGE { string id PK, string role, string content }
    DOCUMENT { string id PK, string fileName, string sizeLabel, string status }
    JOB { string id PK, string name, string agent, string state }
    DRAFT {
        string id PK
        string kind
        string status "draft|in_review|approved|rejected"
        string decidedBy
        Json history
        string sourceDocumentId
    }
    APPUSER { string id PK, string name, string role, string apiKeyHash }
    CHATAUDIT { string id PK, string messagePreview }
```

- `TenderStatus`: `IDENTIFIED | PENDING | SUBMITTED | WON | LOST` → display labels mapped in `services/tenders.ts`.
- Finance: `Invoice` (AR/AP, agregat — tanpa bank detail) + `CloseCheckItem` (per periode, owner = tim).
- HR: `HrPolicy` + `LeaveRow` (agregat tim — tanpa nama/gaji individu, by design).
- Seed: 6 tenders, 5 jobs, 3 documents, 5 invoices, 5 checklist items, 3 policies, 3 roster rows (idempoten via `upsert`/cek `fileName`) + demo users (`AppUser`).
- Spaces = contextual workspaces (bukan arsip): ownership (`ownerId/ownerRole`), visibility (`PRIVATE|ROLE`, legacy tanpa owner = terlihat semua), status (`ACTIVE|ARCHIVED`).
  - Akses server-side (`spaceAccess.ts`): view = owner / role sama / management / legacy; edit = owner / management / legacy. Chat dengan `spaceId` yang tak boleh dilihat → 403 eksplisit, bukan diam-diam.
  - Konteks grounding (`spaceContext.ts`, bounded ±3000 char): item conversation (milik sendiri) / dokumen (sesuai domain role) / tender (sales|ops|mgmt) / note + draft tertaut + 10 aktivitas terakhir; tabel/kolom di luar scope tidak pernah masuk prompt.
  - Aksi turunan data (`GET /api/spaces/:id/actions`): review draft (maker-checker aware), follow-up conversation >7 hari, tender closing ≤14 hari. Tanpa aksi karangan.
  - Draft ↔ space: `Draft.spaceId` (SetNull); create/approve/reject mencatat `SpaceActivity` (ITEM_ADDED/REMOVED, DRAFT_CREATED/APPROVED/REJECTED, CONTEXT_USED). `ChatAudit.spaceId` mencatat konteks pemakaian.
  - Saran simpan deterministik (`suggestedSpace`, keyword domain vs nama/deskripsi space, bukan tebakan model) dengan dismiss per pesan.
  - Template pembuatan (`SPACE_TEMPLATES` di shared): tender review, monthly close, distributor performance.
  - Tautan follow-up eksplisit: draft ↔ conversation dihubungkan via `sourceConversationId`/`sourceId` yang divalidasi (bukan kecocokan judul); item lama tanpa tautan tidak pernah diklaim tertaut.
  - Validasi referensi item: tender diverifikasi ke DB (judul/preview diisi server, bukan klaim client); dokumen dicek dalam scope role pembuat; conversation dicek kepemilikannya bila ada sourceId.
  - Banner saran simpan bersifat non-blocking dengan dismiss persisten (localStorage per space+pesan); space arsip bersifat read-only (tanpa aksi follow-up/tender baru, review draft yang ada tetap bisa diputus).
- Assistant registry (`packages/shared`): assistants × skills; semua grounding service DB-only (tanpa fallback mock — kosong = jawaban "belum ada data" yang eksplisit).
- Migrations: `prisma migrate dev` (atau `deploy`); client generated via `prisma:generate`. DB = Neon `production` (lihat AGENTS.md).

## 5. AI Grounding & Anti-Hallucination

1. Chat never invents records: cards are slices of **queried live rows**.
2. HTTP path constrains the model to an injected live list and re-validates returned IDs.
3. Provenance headers + UI disclaimer ("simulated data … verify consequential decisions").

## 6. Security & Operations (prototype scope)

- Secrets only via env (`.env`, gitignored); `.env.example` documents every variable.
- Upload allowlist + size cap; filenames sanitised; uploads dir gitignored.
- Auth minimal aktif: API key per user (`AppUser`, hash SHA-256 saja yang disimpan),
  RBAC `ASSISTANT_ROLES` di `packages/shared` (server enforcement di REST + Socket.IO,
  web hanya UI gating), keputusan consequential drafts (`submit/approve/reject/reopen`)
  wajib auth + ownership + `decidedBy` dari sesi, audit chat (`ChatAudit`, preview 200 char — bukan isi penuh,
  baca via `GET /api/audit` khusus management + halaman `/audits`).
  Demo-login (`ALLOW_DEMO_LOGIN=true`) hanya untuk lokal; matikan + SSO/OAuth sebelum production.
- Semua `/api/*` (kecuali `/health`, `/api/auth/users`, demo-login) wajib auth. Dokumen ter-scope
  domain (`general|finance|hr`); draft list milik sendiri. Tender/jobs/reports: semua role aktif boleh baca
  (halaman jobs/reports dibatasi nav + guard: jobs = operations/management,
  reports = sales/operations/management; data explorer menyembunyikan browser
  tender untuk finance/hr).
- Tes: `packages/shared` (vitest: RBAC, scoping, builder agregat), `apps/api` (node:test: draft machine,
  ekstraksi, validator SQL, parse thread, embedding fallback, rate limit); `eval/run.ts` 6 cek integrasi (grounding, RAG, cleanup).
- Riwayat chat tersimpan per user (`Conversation.createdBy/assistantId` + `Message`; `POST /api/chat`
  menerima `conversationId`, mengembalikan id baru bila perlu; thread dibaca owner/management;
  halaman `/conversation?c=` merender thread + lanjutkan, `/conversations` daftar milik sendiri).
- Embedding pluggable: `EMBEDDING_PROVIDER=hash|neural|http` (default hash, 384d ternormalisasi).
  Neural/http gagal → warn sekali + fallback hash; ganti provider WAJIB `POST /api/documents/reindex`
  (operations/management). darwin/x64 tidak punya binding onnx — neural aktif di Linux/prod.
- Hardening: rate limit per-user (chat/query/login, 429 + Retry-After; in-memory → Redis bila multi-instance),
  key TTL (`AppUser.apiKeyExpiresAt`, demo-login/rotate beri TTL; seed NULL), rotate via
  `POST /api/auth/rotate`, CORS allowlist (`CORS_ORIGINS`), backup via `npm run db:backup` (`scripts/db-backup.sh`).
- Migrasi sehat kembali: histori drift `rag_chunks` diperbaiki via backup → `migrate reset` → restore data
  (backup di `/tmp/full-backup.sql`); `migrate dev` normal lagi ("Already in sync").
- Local run: `neon env pull` → migrate → seed → `npm run dev:web`, `npm run dev:api` (tanpa docker).

## 7. Known Limitations → Roadmap

1. Extraction = parse teks + chunking; LLM field extraction opt-in via `EXTRACT_PROVIDER=http`
   (biaya/kuota model). True OCR for scanned PDFs still missing → skor E2 terhadap ground-truth set.
2. Embedding = hashing deterministik → ganti model neural saat mesin/kuota memungkinkan; retrieval keyword tender tetap ada, Text-to-SQL distributor sales sudah live (`DistributorSale`, rule engine + `proposeSql`, GROUP BY belum didukung validator).
3. Auth = demo-login + API key + RBAC assistant scope + draft/chat audit; SSO/OAuth + per-row permissions before production.
4. Draft transitions covered by unit tests (`npm run test --workspace=apps/api`); E4/E5 usability sessions per `03-test-evaluation-plan.md`.
