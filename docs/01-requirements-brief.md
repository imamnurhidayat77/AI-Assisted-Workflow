# Requirements Brief — Street Smart Cockpit

**Project:** Business Optimization — AI-assisted data management & business process platform
**Organisation:** Smart City Street Ltd, NZ
**Period:** 16 November 2026 – 5 February 2027 (10 weeks)
**Author:** Imam Nurhidayat (ICT Internship, Innovation NZ)
**Status:** Living document — v1.1 (human-in-the-loop drafts, approval queue, realtime)

---

## 1. Background

Smart City Streets handles government tenders, distributor sales, product catalogues
(Smartstud, Smartped, tunnel markers), quotations, and supporting documents across
New Zealand, Australia, and other markets. Information is scattered across PDFs,
spreadsheets, and disconnected records, making it hard to search, compare, and report.

This project builds a **working full-stack prototype** of a data management and
business process platform with an SAP Joule-style AI copilot ("Street Smart Cockpit"),
and explores how modern AI tools improve information handling: extracting and
structuring information from documents, easier search, useful reports, and automation
of selected routine tasks.

## 2. Objectives (from internship agreement)

| # | Objective | Mapped feature(s) |
|---|-----------|-------------------|
| O1 | Extract & structure information from documents | Document ingestion → upload, processing queue, structured extraction preview with per-field confidence (`/documents`, `GET /api/documents/:id/extract`) |
| O2 | Make information easier to search | AI chat grounded on live tender data (`/conversation`, `POST /api/chat`), database explorer (`/data`) |
| O3 | Produce useful reports | Tender reports + KPI (`/reports`, `GET /api/reports/summary`) |
| O4 | Automate selected routine tasks | Jobs & automations (`/jobs`): deadline monitoring, sales import, weekly summaries |
| O5 | AI drafts, humans decide | Human-in-the-loop draft lifecycle: AI/suggested content → editable draft → authenticated approval (`/conversation` Draft Card, `/documents` review, `/jobs` approval queue, `POST /api/drafts/:id/approve`) |

## 3. Stakeholders & Users

| Role | Need |
|---|---|
| Operations staff (e.g. Isaac Ngatai, persona) | Prioritise tenders, track deadlines, find quotations awaiting approval |
| Management | Pipeline analytics by country, success rate, monthly performance |
| Approver (any role) | Review AI drafts, correct fields, approve/reject with their name recorded |
| IT / handover recipient | Clean codebase, docs, reproducible local setup |

> Demo login provides switchable personas (`GET /api/auth/users`, profile menu);
> consequential decisions are recorded under the signed-in name. SSO/OAuth before production (see §7).

## 4. Functional Requirements

### 4.1 AI Chat (Joule-style copilot)
- **FR-01** User asks natural-language questions from Discover, global search, or conversation view.
- **FR-02** System returns: answer title + explanation, up to 3 tender cards, AI recommendation, sources with references, follow-up suggestions.
- **FR-03** Tender cards shown must come from **live database rows** — the system must never invent tender IDs (validated server-side).
- **FR-04** Every chat response carries provenance headers (`X-AI-Via: mock|http`, `X-Data-Via: db|mock`) for evaluation.
- **FR-05** "New conversation" opens a blank composer; clicking a history item opens that conversation's detail (no separate menu).

### 4.2 Document Ingestion & Extraction
- **FR-06** Upload PDF/XLSX/XLS/CSV/DOCX (max 50 MB) via picker or drag-drop; unsupported types rejected.
- **FR-07** Each file gets a processing status (`Processing` → `Processed`/`Completed`) visible in the queue with polling.
- **FR-08** Each document exposes a **structured extraction preview** (document kind, overall confidence, key fields). Each field carries `confidence 0..1` + `source` (`extracted` = read directly, `inferred` = AI-completed from context, `missing` = not found) + `needsReview` flag; absent data is listed under `missingFields`.
- **FR-08b** Extraction uses the LLM provider when `EXTRACT_PROVIDER=http` (+ `LLM_*` configured); otherwise deterministic simulation. LLM output is validated/clamped server-side; any failure falls back to simulation — the preview never breaks.
- **FR-09** Documents can be deleted (metadata + stored file).
- **FR-09b** Human corrects extraction values inline; corrected values flow into the draft body when "Buat draft dari hasil ini" is used (with `sourceDocumentId/Name` link).

### 4.3 Data Management
- **FR-10** Tender records stored in Postgres (Prisma) with full CRUD-ready model; list + search API (`GET /api/tenders?q=`).
- **FR-11** Database explorer shows indexed records with search, dataset catalog, and row selection.
- **FR-12** DB connection management view (PostgreSQL ops DB, SQL Server sales warehouse, MySQL catalogue — connection status + sync info).

### 4.4 Reports & Operations
- **FR-13** Tender analytics: KPIs (total, pipeline value, success rate, closing soon), monthly performance chart, pipeline-by-country split.
- **FR-14** Jobs view lists automations with trigger, last run, progress; drafts awaiting human decision appear on top with inline Approve/Reject; decided drafts move to a permanent Decision History section. Jobs page khusus operations + management. (System status + alerts views dihapus — mock tanpa API.)

### 4.5 Human-in-the-Loop Drafts (AI drafter, human decider)
- **FR-15** AI output that matters is materialised as an editable **Draft** (`draft → in_review → approved / rejected`; `rejected → draft` to reopen). Approved drafts are locked against silent edits.
- **FR-16** Consequential transitions (`submit/approve/reject/reopen`) require an authenticated user; `decidedBy` comes from the session (never from the request body) with `decidedAt` timestamp + append-only `history`.
- **FR-17** Approved drafts surface in Spaces as saved workspace decisions (with source document link where applicable).
- **FR-18** Draft changes broadcast over Socket.IO (`draft:changed {id, status}` — no body); REST stays the source of truth, realtime is best-effort with manual Refresh fallback.

## 5. Non-Functional Requirements

| # | Requirement | Target |
|---|---|---|
| NFR-01 | Usability | Core tasks (upload→extract, ask→answer, find tender) completable without training; measured by task-completion test |
| NFR-02 | Extraction accuracy | ≥ 90% field accuracy on a 20-document ground-truth set |
| NFR-03 | No hallucinated records | 0 invented tender IDs in chat responses (automated check) |
| NFR-04 | Responsiveness | Chat mock latency ~600 ms; pages build as static where possible |
| NFR-05 | Graceful degradation | API works with DB down (mock fallback); UI works with API down (local fallback) |
| NFR-06 | Local reproducibility | Fresh clone → running (mock mode) with `npm install` + 2 commands, no external keys |

## 6. Acceptance Criteria (demo script)

1. Upload a tender PDF → status flips to `Processed` → extraction preview shows tender fields with confidence/source badges + missing fields.
2. Ask "Brisbane crossing" → card `TND-2026-004` appears with `X-Data-Via: db`.
3. Insert a tender directly in DB → chat surfaces it without code changes.
4. Kill Postgres → chat + documents still respond (fallback).
5. `npm run build` passes for `apps/web` and `apps/api`.
6. Create draft from a document → appears in `/jobs` queue (realtime) → approve as signed-in user → locked, recorded in Decision History + Spaces, survives API restart.
7. Approve without API key → `401`; approve with spoofed `decidedBy` in body → session name recorded instead.

## 7. Out of Scope (v1)

- Paid inference by default (mock-first; set `AI_PROVIDER=http` / `EXTRACT_PROVIDER=http` + `LLM_*` for real models).
- SSO/OAuth (demo-login only), per-row data permissions, production deployment, backups, monitoring.
- True OCR for scanned PDFs (text parse only; barely-legible values stay `inferred`/`missing` for humans).

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| No real company data available | Deterministic simulation data mirroring real shapes; documented as ground truth for evaluation |
| AI hallucinations undermine trust | ID validation against DB; provenance headers; disclaimer in UI |
| Port/environment conflicts on demo machine | Postgres Neon (managed, tanpa docker lokal); mock fallbacks at every layer |

## 9. Traceability to Agreement Deliverables

- Requirements brief + DB/system design → **this doc + `02-system-design.md`**
- Working prototype (DB + backend + web) → monorepo `apps/*`
- AI-assisted processing/reporting workflow → chat grounding + extraction + reports
- Testing & evaluation → `03-test-evaluation-plan.md` (planned)
- Technical docs + handover → `README.md` + this folder
